use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose, Engine as _};
use flate2::write::ZlibEncoder;
use flate2::Compression;
use image::{DynamicImage, GenericImageView};
use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream, StringFormat};
use serde::Deserialize;
use std::io::Write;

use crate::utils::map_y;

#[derive(Debug, Deserialize)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PdfOperation {
    Image {
        page: u32,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        base64_data: String,
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

#[derive(Debug, Deserialize)]
pub struct PageConfig {
    pub page_num: u32,
    pub width: f32,
    pub height: f32,
}

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

fn parse_hex_color(hex: &str) -> (f32, f32, f32) {
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

fn utf8_to_winansi(text: &str) -> Vec<u8> {
    text.chars().map(|c| match c {
        'á' => 0xE1, 'é' => 0xE9, 'í' => 0xED, 'ó' => 0xF3, 'ú' => 0xFA,
        'Á' => 0xC1, 'É' => 0xC9, 'Í' => 0xCD, 'Ó' => 0xD3, 'Ú' => 0xDA,
        'ñ' => 0xF1, 'Ñ' => 0xD1, 'ü' => 0xFC, 'Ü' => 0xDC, '¿' => 0xBF, '¡' => 0xA1,
        _ => {
            let b = c as u32;
            if b <= 255 { b as u8 } else { b'?' }
        }
    }).collect()
}

// ==========================================
// RESOURCE BUILDERS
// ==========================================

fn decode_base64_png(b64_data: &str) -> Result<DynamicImage> {
    let clean_b64 = b64_data.strip_prefix("data:image/png;base64,").unwrap_or(b64_data);
    let bytes = general_purpose::STANDARD
        .decode(clean_b64)
        .context("base64 inválido")?;
    let img = image::load_from_memory(&bytes).context("PNG inválido")?;
    Ok(img)
}

fn flate_compress(data: &[u8]) -> Result<Vec<u8>> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
    encoder.write_all(data)?;
    Ok(encoder.finish()?)
}

fn build_image_xobject(doc: &mut Document, img: DynamicImage) -> Result<ObjectId> {
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

fn build_font_dictionary(doc: &mut Document) -> ObjectId {
    let font_dict = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Font".to_vec())),
        ("Subtype", Object::Name(b"Type1".to_vec())),
        ("BaseFont", Object::Name(b"Helvetica".to_vec())),
        ("Encoding", Object::Name(b"WinAnsiEncoding".to_vec())),
    ]);
    doc.add_object(font_dict)
}

fn build_extgstate_dictionary(doc: &mut Document, opacity: f32) -> ObjectId {
    let blend_mode = if opacity >= 0.99 { b"Normal".to_vec() } else { b"Multiply".to_vec() };
    
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

fn resolve_dict(doc: &Document, obj: &Object) -> Result<(Dictionary, Option<ObjectId>)> {
    match obj {
        Object::Dictionary(d) => Ok((d.clone(), None)),
        Object::Reference(id) => {
            let d = doc.get_object(*id)?.as_dict().context("Ref is not a dict")?.clone();
            Ok((d, Some(*id)))
        }
        _ => Err(anyhow!("Expected Dict or Ref")),
    }
}

fn get_field(dict: &Dictionary, key: &[u8]) -> Option<Object> {
    dict.get(key).ok().cloned()
}

fn insert_resource_in_page(
    doc: &mut Document,
    page_id: ObjectId,
    res_type: &str, // "Font", "ExtGState", "XObject"
    res_name: &str, // "F1", "GS1", "YeibImg1"
    res_id: ObjectId,
) -> Result<()> {
    let page_dict = doc.get_object(page_id)?.as_dict().context("Page not a dict")?.clone();

    let resources_obj = get_field(&page_dict, b"Resources")
        .unwrap_or_else(|| Object::Dictionary(Dictionary::new()));
    let (mut resources_dict, resources_ref) = resolve_dict(doc, &resources_obj)?;

    let target_obj = get_field(&resources_dict, res_type.as_bytes())
        .unwrap_or_else(|| Object::Dictionary(Dictionary::new()));
    let (mut target_dict, target_ref) = resolve_dict(doc, &target_obj)?;

    target_dict.set(res_name, Object::Reference(res_id));

    match target_ref {
        Some(id) => { doc.objects.insert(id, Object::Dictionary(target_dict)); }
        None => { resources_dict.set(res_type, Object::Dictionary(target_dict)); }
    }

    match resources_ref {
        Some(id) => { doc.objects.insert(id, Object::Dictionary(resources_dict)); }
        None => {
            let page_mut = doc.get_object_mut(page_id)?.as_dict_mut()?;
            page_mut.set("Resources", Object::Dictionary(resources_dict));
        }
    }
    Ok(())
}

fn append_content_stream(doc: &mut Document, page_id: ObjectId, operations: Vec<Operation>) -> Result<()> {
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
        Object::Reference(id) => Object::Array(vec![Object::Reference(id), Object::Reference(new_content_id)]),
        _ => Object::Array(vec![Object::Reference(new_content_id)]),
    };
    page_mut.set("Contents", new_contents);
    Ok(())
}

// ==========================================
// MAIN FLATTEN PROCESS
// ==========================================

pub fn process_flatten(recipe: FlattenRecipe) -> Result<(), String> {
    let mut doc = Document::load(&recipe.file_path).map_err(|e| format!("Error cargando PDF: {}", e))?;
    let pages = doc.get_pages();
    
    let mut img_counter = 0;
    let mut font_f1_id: Option<ObjectId> = None;

    for op in recipe.operations {
        match op {
            PdfOperation::Image { page, x, y, width, height, base64_data } => {
                let page_id = match pages.get(&page) { Some(id) => *id, None => continue };
                let page_conf = recipe.pages_config.iter().find(|c| c.page_num == page);
                let page_height = page_conf.map(|c| c.height).unwrap_or(792.0);
                let pdf_y = map_y(y, page_height, height);

                if let Ok(img) = decode_base64_png(&base64_data) {
                    if let Ok(image_id) = build_image_xobject(&mut doc, img) {
                        img_counter += 1;
                        let xobj_name = format!("YeibImg{}", img_counter);
                        let _ = insert_resource_in_page(&mut doc, page_id, "XObject", &xobj_name, image_id);

                        let ops = vec![
                            Operation::new("q", vec![]),
                            Operation::new("cm", vec![
                                width.into(), 0.0.into(), 0.0.into(),
                                height.into(), x.into(), pdf_y.into(),
                            ]),
                            Operation::new("Do", vec![Object::Name(xobj_name.as_bytes().to_vec())]),
                            Operation::new("Q", vec![]),
                        ];
                        let _ = append_content_stream(&mut doc, page_id, ops);
                    }
                }
            },
            PdfOperation::Text { page, x, y, text, font_size, color, bg_color } => {
                let page_id = match pages.get(&page) { Some(id) => *id, None => continue };
                let page_conf = recipe.pages_config.iter().find(|c| c.page_num == page);
                let page_height = page_conf.map(|c| c.height).unwrap_or(792.0);
                let pdf_y = map_y(y, page_height, font_size); // Approx bounding box

                // Register Font if not already registered in this document
                if font_f1_id.is_none() {
                    font_f1_id = Some(build_font_dictionary(&mut doc));
                }
                let f1_id = font_f1_id.unwrap();
                let _ = insert_resource_in_page(&mut doc, page_id, "Font", "YeibF1", f1_id);

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
                        Operation::new("re", vec![x.into(), (pdf_y - font_size * 0.2).into(), est_width.into(), (font_size * 1.2).into()]),
                        Operation::new("f", vec![]),
                    ]);
                }

                // Draw Text
                ops.extend(vec![
                    Operation::new("rg", vec![r.into(), g.into(), b.into()]),
                    Operation::new("BT", vec![]),
                    Operation::new("Tf", vec![Object::Name(b"YeibF1".to_vec()), font_size.into()]),
                    Operation::new("Td", vec![x.into(), pdf_y.into()]),
                    Operation::new("Tj", vec![Object::String(text_bytes, StringFormat::Literal)]),
                    Operation::new("ET", vec![]),
                    Operation::new("Q", vec![]),
                ]);

                let _ = append_content_stream(&mut doc, page_id, ops);
            },
            PdfOperation::Highlight { page, points, color, opacity } => {
                let page_id = match pages.get(&page) { Some(id) => *id, None => continue };
                let page_conf = recipe.pages_config.iter().find(|c| c.page_num == page);
                let page_height = page_conf.map(|c| c.height).unwrap_or(792.0);

                // Create ExtGState specific for this opacity
                let gs_id = build_extgstate_dictionary(&mut doc, opacity);
                let gs_name = format!("YeibGS_{}", (opacity * 100.0) as i32);
                let _ = insert_resource_in_page(&mut doc, page_id, "ExtGState", &gs_name, gs_id);

                let (r, g, b) = parse_hex_color(&color);

                let mut ops = vec![
                    Operation::new("q", vec![]),
                    Operation::new("gs", vec![Object::Name(gs_name.as_bytes().to_vec())]),
                    Operation::new("RG", vec![r.into(), g.into(), b.into()]), // Stroke color
                    Operation::new("J", vec![1.into()]), // Round cap
                    Operation::new("j", vec![1.into()]), // Round join
                    Operation::new("w", vec![15.0.into()]), // Line width
                ];

                if !points.is_empty() {
                    let first_y = map_y(points[0].y, page_height, 0.0);
                    ops.push(Operation::new("m", vec![points[0].x.into(), first_y.into()]));
                    for p in points.iter().skip(1) {
                        let py = map_y(p.y, page_height, 0.0);
                        ops.push(Operation::new("l", vec![p.x.into(), py.into()]));
                    }
                    ops.push(Operation::new("S", vec![])); // Stroke path
                }

                ops.push(Operation::new("Q", vec![]));
                let _ = append_content_stream(&mut doc, page_id, ops);
            }
        }
    }

    doc.compress();
    doc.save(&recipe.output_path).map_err(|e| format!("Error guardando PDF: {}", e))?;
    Ok(())
}
