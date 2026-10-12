//! Motor de aplanado visual (*visual flattening*).
//!
//! Recibe una [`FlattenRecipe`] (PDF de entrada, PDF de salida y una lista de
//! operaciones) y "hornea" cada operación directamente en el contenido de las
//! páginas con `lopdf`:
//!
//! - [`PdfOperation::DarkModeInvert`]: inversión de colores con blend mode
//!   `Difference`.
//! - [`PdfOperation::Image`]: PNG en base64 como `XObject` (con `SMask` si
//!   tiene canal alfa).
//! - [`PdfOperation::Text`]: texto Helvetica codificado en WinAnsi.
//! - [`PdfOperation::Highlight`]: trazo grueso semitransparente.

use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose, Engine as _};
use flate2::write::ZlibEncoder;
use flate2::Compression;
use image::{DynamicImage, GenericImageView};
use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream, StringFormat};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::io::Write;

use crate::utils::map_y;

/// Nombre del recurso `ExtGState` usado por el modo oscuro.
const DARK_MODE_GS_NAME: &str = "YeibGS_DarkMode";

// ==========================================
// TIPOS PÚBLICOS (deserializados desde el frontend)
// ==========================================

/// Punto en coordenadas de pantalla (origen arriba-izquierda).
#[derive(Debug, Deserialize)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

/// Operación de dibujo a aplanar sobre una página concreta.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PdfOperation {
    DarkModeInvert {
        page: u32,
    },
    Image {
        page: u32,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        base64_data: String,
        opacity: Option<f32>,
    },
    Text {
        page: u32,
        x: f32,
        y: f32,
        text: String,
        font_size: f32,
        color: String,
        bg_color: Option<String>,
    },
    Highlight {
        page: u32,
        points: Vec<Point>,
        color: String,
        opacity: f32,
    },
}

/// Dimensiones de una página tal como las vio el frontend.
#[derive(Debug, Deserialize)]
pub struct PageConfig {
    pub page_num: u32,
    pub width: f32,
    pub height: f32,
}

/// Receta completa de aplanado.
#[derive(Debug, Deserialize)]
pub struct FlattenRecipe {
    pub file_path: String,
    pub output_path: String,
    pub pages_config: Vec<PageConfig>,
    pub operations: Vec<PdfOperation>,
}

// ==========================================
// UTILS & PARSERS
// ==========================================

/// Convierte `#RRGGBB` (o `RRGGBB`) a componentes RGB normalizados `0.0..=1.0`.
///
/// Si el formato no es válido devuelve negro `(0, 0, 0)`.
pub(crate) fn parse_hex_color(hex: &str) -> (f32, f32, f32) {
    let hex = hex.trim_start_matches('#');
    if hex.len() == 6 {
        let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0) as f32 / 255.0;
        let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0) as f32 / 255.0;
        let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0) as f32 / 255.0;
        (r, g, b)
    } else {
        (0.0, 0.0, 0.0)
    }
}

/// Convierte texto UTF-8 a bytes WinAnsi (suficiente para español/latín-1).
///
/// Los caracteres fuera de rango se reemplazan por `?`.
pub(crate) fn utf8_to_winansi(text: &str) -> Vec<u8> {
    text.chars()
        .map(|c| match c {
            'á' => 0xE1,
            'é' => 0xE9,
            'í' => 0xED,
            'ó' => 0xF3,
            'ú' => 0xFA,
            'Á' => 0xC1,
            'É' => 0xC9,
            'Í' => 0xCD,
            'Ó' => 0xD3,
            'Ú' => 0xDA,
            'ñ' => 0xF1,
            'Ñ' => 0xD1,
            'ü' => 0xFC,
            'Ü' => 0xDC,
            '¿' => 0xBF,
            '¡' => 0xA1,
            _ => {
                let b = c as u32;
                if b <= 255 {
                    b as u8
                } else {
                    b'?'
                }
            }
        })
        .collect()
}

/// Atajo para construir un `Object::Name` a partir de un `&str`.
fn name_object(name: &str) -> Object {
    Object::Name(name.as_bytes().to_vec())
}

// ==========================================
// RESOURCE BUILDERS
// ==========================================

/// Decodifica una imagen PNG en base64 (con o sin prefijo `data:image/png;base64,`).
pub(crate) fn decode_base64_png(b64_data: &str) -> Result<DynamicImage> {
    let clean_b64 = b64_data
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(b64_data);
    let bytes = general_purpose::STANDARD
        .decode(clean_b64)
        .context("base64 inválido")?;
    let img = image::load_from_memory(&bytes).context("PNG inválido")?;
    Ok(img)
}

/// Comprime `data` con zlib (`FlateDecode`) al máximo nivel.
pub(crate) fn flate_compress(data: &[u8]) -> Result<Vec<u8>> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
    encoder.write_all(data)?;
    Ok(encoder.finish()?)
}

/// Inserta una imagen como `XObject` en el documento y devuelve su id.
///
/// Si la imagen tiene canal alfa, el alfa se guarda como `SMask` aparte.
pub(crate) fn build_image_xobject(doc: &mut Document, img: DynamicImage) -> Result<ObjectId> {
    let (width, height) = img.dimensions();
    let has_alpha = img.color().has_alpha();

    let smask_id = if has_alpha {
        let rgba = img.to_rgba8();
        let alpha: Vec<u8> = rgba.pixels().map(|p| p[3]).collect();
        let compressed_alpha = flate_compress(&alpha)?;

        let mut smask_dict = Dictionary::new();
        smask_dict.set("Type", Object::Name(b"XObject".to_vec()));
        smask_dict.set("Subtype", Object::Name(b"Image".to_vec()));
        smask_dict.set("Width", Object::Integer(width as i64));
        smask_dict.set("Height", Object::Integer(height as i64));
        smask_dict.set("ColorSpace", Object::Name(b"DeviceGray".to_vec()));
        smask_dict.set("BitsPerComponent", Object::Integer(8));
        smask_dict.set("Filter", Object::Name(b"FlateDecode".to_vec()));

        let smask_stream = Stream::new(smask_dict, compressed_alpha);
        Some(doc.add_object(smask_stream))
    } else {
        None
    };

    let rgb = img.to_rgb8().into_raw();
    let compressed_rgb = flate_compress(&rgb)?;

    let mut image_dict = Dictionary::new();
    image_dict.set("Type", Object::Name(b"XObject".to_vec()));
    image_dict.set("Subtype", Object::Name(b"Image".to_vec()));
    image_dict.set("Width", Object::Integer(width as i64));
    image_dict.set("Height", Object::Integer(height as i64));
    image_dict.set("ColorSpace", Object::Name(b"DeviceRGB".to_vec()));
    image_dict.set("BitsPerComponent", Object::Integer(8));
    image_dict.set("Filter", Object::Name(b"FlateDecode".to_vec()));

    if let Some(id) = smask_id {
        image_dict.set("SMask", Object::Reference(id));
    }

    let image_stream = Stream::new(image_dict, compressed_rgb);
    Ok(doc.add_object(image_stream))
}

/// Registra la fuente Helvetica (WinAnsi) en el documento y devuelve su id.
pub(crate) fn build_font_dictionary(doc: &mut Document) -> ObjectId {
    let font_dict = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Font".to_vec())),
        ("Subtype", Object::Name(b"Type1".to_vec())),
        ("BaseFont", Object::Name(b"Helvetica".to_vec())),
        ("Encoding", Object::Name(b"WinAnsiEncoding".to_vec())),
    ]);
    doc.add_object(font_dict)
}

/// Crea un `ExtGState` con la opacidad indicada.
///
/// Con opacidad `< 0.99` se usa blend mode `Multiply` (ideal para resaltados).
pub(crate) fn build_extgstate_dictionary(doc: &mut Document, opacity: f32) -> ObjectId {
    let blend_mode = if opacity >= 0.99 {
        b"Normal".to_vec()
    } else {
        b"Multiply".to_vec()
    };

    let gs_dict = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"ExtGState".to_vec())),
        ("ca", Object::Real(opacity)),
        ("BM", Object::Name(blend_mode)),
    ]);
    doc.add_object(gs_dict)
}

// ==========================================
// INJECTION & DOC MUTATION
// ==========================================

/// Resuelve un objeto que puede ser un diccionario directo o una referencia a
/// uno. Devuelve una copia del diccionario y, si venía por referencia, su id.
pub(crate) fn resolve_dict(
    doc: &Document,
    obj: &Object,
) -> Result<(Dictionary, Option<ObjectId>)> {
    match obj {
        Object::Dictionary(d) => Ok((d.clone(), None)),
        Object::Reference(id) => {
            let d = doc
                .get_object(*id)?
                .as_dict()
                .context("Ref is not a dict")?
                .clone();
            Ok((d, Some(*id)))
        }
        _ => Err(anyhow!("Expected Dict or Ref")),
    }
}

/// Lee un campo de un diccionario devolviendo una copia (o `None` si no existe).
pub(crate) fn get_field(dict: &Dictionary, key: &[u8]) -> Option<Object> {
    dict.get(key).ok().cloned()
}

/// Registra un recurso (`Font`, `ExtGState`, `XObject`...) en el diccionario
/// `/Resources` de una página, respetando si este y su sub-diccionario son
/// directos o indirectos.
pub(crate) fn insert_resource_in_page(
    doc: &mut Document,
    page_id: ObjectId,
    res_type: &str, // "Font", "ExtGState", "XObject"
    res_name: &str, // "F1", "GS1", "YeibImg1"
    res_id: ObjectId,
) -> Result<()> {
    let page_dict = doc
        .get_object(page_id)?
        .as_dict()
        .context("Page not a dict")?
        .clone();

    let resources_obj = get_field(&page_dict, b"Resources")
        .unwrap_or_else(|| Object::Dictionary(Dictionary::new()));
    let (mut resources_dict, resources_ref) = resolve_dict(doc, &resources_obj)?;

    let target_obj = get_field(&resources_dict, res_type.as_bytes())
        .unwrap_or_else(|| Object::Dictionary(Dictionary::new()));
    let (mut target_dict, target_ref) = resolve_dict(doc, &target_obj)?;

    target_dict.set(res_name, Object::Reference(res_id));

    match target_ref {
        Some(id) => {
            doc.objects.insert(id, Object::Dictionary(target_dict));
        }
        None => {
            resources_dict.set(res_type, Object::Dictionary(target_dict));
        }
    }

    match resources_ref {
        Some(id) => {
            doc.objects.insert(id, Object::Dictionary(resources_dict));
        }
        None => {
            let page_mut = doc.get_object_mut(page_id)?.as_dict_mut()?;
            page_mut.set("Resources", Object::Dictionary(resources_dict));
        }
    }
    Ok(())
}

/// Agrega un nuevo content stream (con `operations`) al final de `/Contents`
/// de la página, normalizando `/Contents` a un arreglo.
pub(crate) fn append_content_stream(
    doc: &mut Document,
    page_id: ObjectId,
    operations: Vec<Operation>,
) -> Result<()> {
    let content = Content { operations };
    let encoded = content.encode()?;
    let new_content_id = doc.add_object(Stream::new(Dictionary::new(), encoded));

    let page_mut = doc.get_object_mut(page_id)?.as_dict_mut()?;
    let contents = get_field(page_mut, b"Contents").unwrap_or(Object::Array(vec![]));

    let new_contents = match contents {
        Object::Array(mut arr) => {
            arr.push(Object::Reference(new_content_id));
            Object::Array(arr)
        }
        Object::Reference(id) => Object::Array(vec![
            Object::Reference(id),
            Object::Reference(new_content_id),
        ]),
        _ => Object::Array(vec![Object::Reference(new_content_id)]),
    };
    page_mut.set("Contents", new_contents);
    Ok(())
}

/// Obtiene `(ancho, alto)` de una página.
///
/// Prioridad: configuración enviada por el frontend → `CropBox`/`MediaBox`
/// (subiendo por `/Parent` hasta 10 niveles, considerando `/Rotate`) → Carta
/// (612 × 792) como último recurso.
pub(crate) fn get_page_dimensions(
    doc: &Document,
    page_id: ObjectId,
    fallback_config: Option<&PageConfig>,
) -> (f32, f32) {
    if let Some(conf) = fallback_config {
        if conf.width > 0.0 && conf.height > 0.0 {
            return (conf.width, conf.height);
        }
    }

    let mut current_id = page_id;
    for _ in 0..10 {
        if let Ok(dict) = doc.get_object(current_id).and_then(|o| o.as_dict()) {
            let box_obj = dict.get(b"CropBox").or_else(|_| dict.get(b"MediaBox"));
            if let Ok(box_arr) = box_obj.and_then(|o| o.as_array()) {
                if box_arr.len() >= 4 {
                    let to_f32 = |obj: &Object| -> Option<f32> {
                        match obj {
                            Object::Real(f) => Some(*f),
                            Object::Integer(i) => Some(*i as f32),
                            _ => None,
                        }
                    };
                    if let (Some(x0), Some(y0), Some(x1), Some(y1)) = (
                        to_f32(&box_arr[0]),
                        to_f32(&box_arr[1]),
                        to_f32(&box_arr[2]),
                        to_f32(&box_arr[3]),
                    ) {
                        let w = (x1 - x0).abs();
                        let h = (y1 - y0).abs();
                        let rotation = dict
                            .get(b"Rotate")
                            .ok()
                            .and_then(|o| match o {
                                Object::Integer(r) => Some(*r),
                                _ => None,
                            })
                            .unwrap_or(0);
                        if rotation == 90 || rotation == 270 {
                            return (h, w);
                        } else {
                            return (w, h);
                        }
                    }
                }
            }
            if let Ok(parent_ref) = dict.get(b"Parent").and_then(|o| o.as_reference()) {
                current_id = parent_ref;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    (612.0, 792.0)
}

/// Localiza la página `page` (1-based) y devuelve `(id, ancho, alto)`.
fn locate_page(
    doc: &Document,
    pages: &BTreeMap<u32, ObjectId>,
    pages_config: &[PageConfig],
    page: u32,
) -> Result<(ObjectId, f32, f32), String> {
    let page_id = pages
        .get(&page)
        .copied()
        .ok_or_else(|| format!("Página {page} no existe en el PDF"))?;
    let page_conf = pages_config.iter().find(|c| c.page_num == page);
    let (width, height) = get_page_dimensions(doc, page_id, page_conf);
    Ok((page_id, width, height))
}

// ==========================================
// MAIN FLATTEN PROCESS
// ==========================================

/// Aplica todas las operaciones de la receta sobre el PDF de entrada y guarda
/// el resultado en `output_path`.
pub fn process_flatten(recipe: FlattenRecipe) -> Result<(), String> {
    let FlattenRecipe {
        file_path,
        output_path,
        pages_config,
        operations,
    } = recipe;

    let mut doc =
        Document::load(&file_path).map_err(|e| format!("Error cargando PDF: {}", e))?;
    let pages = doc.get_pages();

    let mut img_counter = 0;
    let mut font_f1_id: Option<ObjectId> = None;

    for op in operations {
        match op {
            PdfOperation::DarkModeInvert { page } => {
                let (page_id, page_width, page_height) =
                    locate_page(&doc, &pages, &pages_config, page)?;

                let mut dict = Dictionary::new();
                dict.set("Type", Object::Name(b"ExtGState".to_vec()));
                dict.set("BM", Object::Name(b"Difference".to_vec()));
                let ext_id = doc.add_object(Object::Dictionary(dict));

                insert_resource_in_page(&mut doc, page_id, "ExtGState", DARK_MODE_GS_NAME, ext_id)
                    .map_err(|e| format!("Error registrando dark mode en página {page}: {e}"))?;

                let ops = vec![
                    Operation::new("q", vec![]),
                    Operation::new("gs", vec![name_object(DARK_MODE_GS_NAME)]),
                    Operation::new("rg", vec![1.0.into(), 1.0.into(), 1.0.into()]),
                    Operation::new(
                        "re",
                        vec![0.0.into(), 0.0.into(), page_width.into(), page_height.into()],
                    ),
                    Operation::new("f", vec![]),
                    Operation::new("Q", vec![]),
                ];
                append_content_stream(&mut doc, page_id, ops)
                    .map_err(|e| format!("Error agregando dark mode a página {page}: {e}"))?;
            }
            PdfOperation::Image {
                page,
                x,
                y,
                width,
                height,
                base64_data,
                opacity,
            } => {
                let (page_id, _page_width, page_height) =
                    locate_page(&doc, &pages, &pages_config, page)?;
                let pdf_y = map_y(y, page_height, height);

                let img = decode_base64_png(&base64_data)
                    .map_err(|e| format!("Error decodificando imagen: {}", e))?;
                let image_id = build_image_xobject(&mut doc, img)
                    .map_err(|e| format!("Error construyendo imagen PDF: {}", e))?;
                img_counter += 1;
                let xobj_name = format!("YeibImg{}", img_counter);
                insert_resource_in_page(&mut doc, page_id, "XObject", &xobj_name, image_id)
                    .map_err(|e| format!("Error registrando imagen en página {page}: {e}"))?;

                let opac = opacity.unwrap_or(1.0);
                let mut ops = vec![Operation::new("q", vec![])];

                if opac < 1.0 {
                    let gs_id = build_extgstate_dictionary(&mut doc, opac);
                    let gs_name = format!("YeibGS_Img{}", img_counter);
                    insert_resource_in_page(&mut doc, page_id, "ExtGState", &gs_name, gs_id)
                        .map_err(|e| {
                            format!("Error registrando opacidad en página {page}: {e}")
                        })?;
                    ops.push(Operation::new("gs", vec![name_object(&gs_name)]));
                }

                ops.extend(vec![
                    Operation::new(
                        "cm",
                        vec![
                            width.into(),
                            0.0.into(),
                            0.0.into(),
                            height.into(),
                            x.into(),
                            pdf_y.into(),
                        ],
                    ),
                    Operation::new("Do", vec![name_object(&xobj_name)]),
                    Operation::new("Q", vec![]),
                ]);
                append_content_stream(&mut doc, page_id, ops)
                    .map_err(|e| format!("Error agregando imagen a página {page}: {e}"))?;
            }
            PdfOperation::Text {
                page,
                x,
                y,
                text,
                font_size,
                color,
                bg_color,
            } => {
                let (page_id, _page_width, page_height) =
                    locate_page(&doc, &pages, &pages_config, page)?;
                let pdf_y = map_y(y, page_height, font_size); // Approx bounding box

                // Register Font if not already registered in this document
                let f1_id = *font_f1_id.get_or_insert_with(|| build_font_dictionary(&mut doc));
                insert_resource_in_page(&mut doc, page_id, "Font", "YeibF1", f1_id)
                    .map_err(|e| format!("Error registrando fuente en página {page}: {e}"))?;

                let (r, g, b) = parse_hex_color(&color);
                let text_bytes = utf8_to_winansi(&text);

                let mut ops = vec![Operation::new("q", vec![])];

                // Optional Background
                if let Some(bg_hex) = bg_color {
                    let (b_r, b_g, b_b) = parse_hex_color(&bg_hex);
                    // Estimate width (very rough approximation for standard Helvetica)
                    let est_width = (text.len() as f32) * font_size * 0.55;
                    ops.extend(vec![
                        Operation::new("rg", vec![b_r.into(), b_g.into(), b_b.into()]),
                        Operation::new(
                            "re",
                            vec![
                                x.into(),
                                (pdf_y - font_size * 0.2).into(),
                                est_width.into(),
                                (font_size * 1.2).into(),
                            ],
                        ),
                        Operation::new("f", vec![]),
                    ]);
                }

                // Draw Text
                ops.extend(vec![
                    Operation::new("rg", vec![r.into(), g.into(), b.into()]),
                    Operation::new("BT", vec![]),
                    Operation::new("Tf", vec![name_object("YeibF1"), font_size.into()]),
                    Operation::new("Td", vec![x.into(), pdf_y.into()]),
                    Operation::new(
                        "Tj",
                        vec![Object::String(text_bytes, StringFormat::Literal)],
                    ),
                    Operation::new("ET", vec![]),
                    Operation::new("Q", vec![]),
                ]);

                append_content_stream(&mut doc, page_id, ops)
                    .map_err(|e| format!("Error agregando texto a página {page}: {e}"))?;
            }
            PdfOperation::Highlight {
                page,
                points,
                color,
                opacity,
            } => {
                let (page_id, _page_width, page_height) =
                    locate_page(&doc, &pages, &pages_config, page)?;

                // Create ExtGState specific for this opacity
                let gs_id = build_extgstate_dictionary(&mut doc, opacity);
                let gs_name = format!("YeibGS_{}", (opacity * 100.0) as i32);
                insert_resource_in_page(&mut doc, page_id, "ExtGState", &gs_name, gs_id)
                    .map_err(|e| format!("Error registrando resaltado en página {page}: {e}"))?;

                let (r, g, b) = parse_hex_color(&color);

                let mut ops = vec![
                    Operation::new("q", vec![]),
                    Operation::new("gs", vec![name_object(&gs_name)]),
                    Operation::new("RG", vec![r.into(), g.into(), b.into()]), // Stroke color
                    Operation::new("J", vec![1.into()]),                      // Round cap
                    Operation::new("j", vec![1.into()]),                      // Round join
                    Operation::new("w", vec![15.0.into()]),                   // Line width
                ];

                if let Some((first, rest)) = points.split_first() {
                    let first_y = map_y(first.y, page_height, 0.0);
                    ops.push(Operation::new("m", vec![first.x.into(), first_y.into()]));
                    for p in rest {
                        let py = map_y(p.y, page_height, 0.0);
                        ops.push(Operation::new("l", vec![p.x.into(), py.into()]));
                    }
                    ops.push(Operation::new("S", vec![])); // Stroke path
                }

                ops.push(Operation::new("Q", vec![]));
                append_content_stream(&mut doc, page_id, ops)
                    .map_err(|e| format!("Error agregando resaltado a página {page}: {e}"))?;
            }
        }
    }

    doc.compress();
    doc.save(&output_path)
        .map_err(|e| format!("Error guardando PDF: {}", e))?;
    Ok(())
}
