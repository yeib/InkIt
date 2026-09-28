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
            PdfOperation::DarkModeInvert { page } => {
                let page_id = pages.get(&page)
                    .copied()
                    .ok_or_else(|| format!("Página {page} no existe en el PDF"))?;
                let page_conf = recipe.pages_config.iter().find(|c| c.page_num == page);
                let page_width = page_conf.map(|c| c.width).unwrap_or(612.0);
                let page_height = page_conf.map(|c| c.height).unwrap_or(792.0);

                let mut dict = lopdf::Dictionary::new();
                dict.set("Type", lopdf::Object::Name(b"ExtGState".to_vec()));
                dict.set("BM", lopdf::Object::Name(b"Difference".to_vec()));
                let ext_id = doc.add_object(lopdf::Object::Dictionary(dict));
                
                let gs_name = format!("YeibGS_DarkMode");
                insert_resource_in_page(&mut doc, page_id, "ExtGState", &gs_name, ext_id)
                    .map_err(|e| format!("Error registrando dark mode en página {page}: {e}"))?;

                let ops = vec![
                    Operation::new("q", vec![]),
                    Operation::new("gs", vec![lopdf::Object::Name(gs_name.as_bytes().to_vec())]),
                    Operation::new("rg", vec![1.0.into(), 1.0.into(), 1.0.into()]),
                    Operation::new("re", vec![0.0.into(), 0.0.into(), page_width.into(), page_height.into()]),
                    Operation::new("f", vec![]),
                    Operation::new("Q", vec![]),
                ];
                append_content_stream(&mut doc, page_id, ops)
                    .map_err(|e| format!("Error agregando dark mode a página {page}: {e}"))?;
            },
            PdfOperation::Image { page, x, y, width, height, base64_data, opacity } => {
                let page_id = pages.get(&page)
                    .copied()
                    .ok_or_else(|| format!("Página {page} no existe en el PDF"))?;
                let page_conf = recipe.pages_config.iter().find(|c| c.page_num == page);
                let page_height = page_conf.map(|c| c.height).unwrap_or(792.0);
                let pdf_y = map_y(y, page_height, height);

                let img = decode_base64_png(&base64_data).map_err(|e| format!("Error decodificando imagen: {}", e))?;
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
                        .map_err(|e| format!("Error registrando opacidad en página {page}: {e}"))?;
                    ops.push(Operation::new("gs", vec![Object::Name(gs_name.as_bytes().to_vec())]));
                }

                ops.extend(vec![
                    Operation::new("cm", vec![
                        width.into(), 0.0.into(), 0.0.into(),
                        height.into(), x.into(), pdf_y.into(),
                    ]),
                    Operation::new("Do", vec![Object::Name(xobj_name.as_bytes().to_vec())]),
                    Operation::new("Q", vec![]),
                ]);
                append_content_stream(&mut doc, page_id, ops)
                    .map_err(|e| format!("Error agregando imagen a página {page}: {e}"))?;
            },
            PdfOperation::Text { page, x, y, text, font_size, color, bg_color } => {
                let page_id = pages.get(&page)
                    .copied()
                    .ok_or_else(|| format!("Página {page} no existe en el PDF"))?;
                let page_conf = recipe.pages_config.iter().find(|c| c.page_num == page);
                let page_height = page_conf.map(|c| c.height).unwrap_or(792.0);
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

                append_content_stream(&mut doc, page_id, ops)
                    .map_err(|e| format!("Error agregando texto a página {page}: {e}"))?;
            },
            PdfOperation::Highlight { page, points, color, opacity } => {
                let page_id = pages.get(&page)
                    .copied()
                    .ok_or_else(|| format!("Página {page} no existe en el PDF"))?;
                let page_conf = recipe.pages_config.iter().find(|c| c.page_num == page);
                let page_height = page_conf.map(|c| c.height).unwrap_or(792.0);

                // Create ExtGState specific for this opacity
                let gs_id = build_extgstate_dictionary(&mut doc, opacity);
                let gs_name = format!("YeibGS_{}", (opacity * 100.0) as i32);
                insert_resource_in_page(&mut doc, page_id, "ExtGState", &gs_name, gs_id)
                    .map_err(|e| format!("Error registrando resaltado en página {page}: {e}"))?;

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
                append_content_stream(&mut doc, page_id, ops)
                    .map_err(|e| format!("Error agregando resaltado a página {page}: {e}"))?;
            }
        }
    }

    doc.compress();
    doc.save(&recipe.output_path).map_err(|e| format!("Error guardando PDF: {}", e))?;
    Ok(())
}
// Firma criptográfica de archivos PDF (estilo Adobe/PAdES-B-B) usando un
// certificado PKCS#12 (.pfx / .p12).
//
// Implementa el flujo estándar descrito en ISO 32000-1 §12.8:
//   1. Se agrega una *actualización incremental* (incremental update) al
//      PDF original: sus bytes no se tocan ni se re-serializan.
//   2. La actualización agrega un campo de firma invisible (`/FT /Sig`)
//      con un diccionario de firma (`/Type /Sig`) cuyo `/Contents` es un
//      placeholder de ceros y cuyo `/ByteRange` es un placeholder numérico.
//   3. Se ubican esos placeholders en el buffer final, se calcula el
//      `/ByteRange` real y se hashea exactamente ese rango de bytes
//      (todo el archivo, excluyendo el propio `/Contents`).
//   4. Se firma ese hash con CMS/PKCS#7 *detached* (`adbe.pkcs7.detached`)
//      usando la identidad del .pfx, y el DER resultante se vuelca en
//      hexadecimal exactamente dentro del placeholder de `/Contents`
//      (que nunca cambia de tamaño, así que ningún otro offset se mueve).

use lopdf::{dictionary, IncrementalDocument};
use openssl::pkcs12::Pkcs12;
use openssl::pkcs7::{Pkcs7, Pkcs7Flags};
use openssl::provider::Provider;
use openssl::stack::Stack;
use openssl::x509::X509;
use std::error::Error;

/// Bytes reservados para el DER de la firma CMS/PKCS#7. 8 KiB alcanza sin
/// problema para RSA-2048/3072 con atributos firmados y una cadena de
/// certificados de 2-3 eslabones. Si `Pkcs7::sign` devuelve algo más grande
/// (cadenas muy largas o certificados con muchas extensiones), la función
/// retorna un error explícito indicando que hay que subir esta constante.
const SIGNATURE_PLACEHOLDER_BYTES: usize = 8192;

/// Genera una identidad digital autofirmada (RSA-2048 + SHA-256) y la
/// empaqueta como PKCS#12 (.pfx).
///
/// IMPORTANTE — alcance y límites de este certificado:
/// Es un certificado **autofirmado** (issuer == subject): no hay ninguna
/// Entidad Certificadora de por medio, así que no existe cadena de
/// confianza verificable por terceros. Sirve como:
///   - Sello de **integridad** (permite detectar si el PDF fue alterado
///     después de firmarlo).
///   - Identidad **local** reconocible por quien ya confía en esta llave
///     (por ejemplo, el propio usuario firmando sus propios documentos).
/// NO constituye una Firma Electrónica Avanzada con validez legal (en
/// Chile, Ley 19.799 exige un certificado emitido por un prestador
/// acreditado). La UI y el README deben dejar esto explícito para que
/// nadie asuma un valor legal que el certificado no tiene.
pub fn generate_pfx(name: &str, detail: &str, password: &str) -> Result<Vec<u8>, Box<dyn Error>> {
    use openssl::rsa::Rsa;
    use openssl::pkey::PKey;
    use openssl::x509::{
        extension::{BasicConstraints, ExtendedKeyUsage, KeyUsage, SubjectKeyIdentifier},
        X509NameBuilder, X509,
    };
    use openssl::hash::MessageDigest;
    use openssl::asn1::Asn1Time;
    use openssl::bn::{BigNum, MsbOption};

    if name.trim().is_empty() {
        return Err("El nombre del firmante no puede estar vacío".into());
    }

    // Generate RSA key
    let rsa = Rsa::generate(2048)?;
    let pkey = PKey::from_rsa(rsa)?;

    // Build X509 Name
    let mut x509_name = X509NameBuilder::new()?;
    x509_name.append_entry_by_text("CN", name)?;
    if !detail.is_empty() {
        x509_name.append_entry_by_text("O", detail)?;
    }
    let x509_name = x509_name.build();

    // Create Certificate
    let mut cert_builder = X509::builder()?;
    cert_builder.set_version(2)?; // X509v3 — requerido para poder llevar extensiones

    // Serial number (64 bits aleatorios, no predecible — RFC 5280 §4.1.2.2)
    let mut serial_bn = BigNum::new()?;
    serial_bn.rand(64, MsbOption::MAYBE_ZERO, false)?;
    let serial = serial_bn.to_asn1_integer()?;
    cert_builder.set_serial_number(&serial)?;

    cert_builder.set_subject_name(&x509_name)?;
    cert_builder.set_issuer_name(&x509_name)?;

    // Valid from now to 10 years
    let not_before = Asn1Time::days_from_now(0)?;
    let not_after = Asn1Time::days_from_now(3650)?;
    cert_builder.set_not_before(&not_before)?;
    cert_builder.set_not_after(&not_after)?;

    cert_builder.set_pubkey(&pkey)?;

    // --- Extensiones X509v3 -------------------------------------------------
    // Sin estas extensiones el certificado es criptográficamente válido pero
    // no declara para qué está autorizado a usarse. Adobe Reader y otros
    // validadores PAdES suelen marcar como "no confiable" o "propósito no
    // verificado" un certificado de firma que no las lleva.

    // CA:FALSE — este certificado no debe poder emitir otros certificados.
    // Al ser autofirmado (issuer == subject) es técnicamente "su propia
    // raíz", así que declarar explícitamente que no actúa como CA es
    // importante para no dar pie a ambigüedad.
    let basic_constraints = BasicConstraints::new().critical().build()?;
    cert_builder.append_extension(basic_constraints)?;

    // digitalSignature + nonRepudiation: exactamente lo que se necesita para
    // firmar documentos con intención de no repudio. Marcado como "critical"
    // porque cualquier validador que lo entienda debe respetar esta
    // restricción.
    let key_usage = KeyUsage::new()
        .critical()
        .digital_signature()
        .non_repudiation()
        .build()?;
    cert_builder.append_extension(key_usage)?;

    // OID 1.2.840.113583.1.1.5 = "Adobe PDF Signing" — ayuda a que Acrobat/
    // Reader reconozcan el propósito del certificado sin ambigüedad.
    let ext_key_usage = ExtendedKeyUsage::new()
        .other("1.2.840.113583.1.1.5")
        .build()?;
    cert_builder.append_extension(ext_key_usage)?;

    // Buena práctica RFC 5280: permite a un verificador identificar la
    // clave pública sin depender solo del Subject Name.
    let subject_key_id =
        SubjectKeyIdentifier::new().build(&cert_builder.x509v3_context(None, None))?;
    cert_builder.append_extension(subject_key_id)?;

    cert_builder.sign(&pkey, MessageDigest::sha256())?;

    let cert = cert_builder.build();

    // Package as PKCS#12
    let mut pkcs12_builder = openssl::pkcs12::Pkcs12::builder();
    let pkcs12 = pkcs12_builder
        .name(name)
        .pkey(&pkey)
        .cert(&cert)
        .build2(password)?;

    Ok(pkcs12.to_der()?)
}/// Ancho decimal fijo reservado para los 3 números variables de
/// `/ByteRange` (el primero siempre es literalmente "0" y no necesita
/// relleno). 10 dígitos cubren archivos de hasta ~9.3 GB.
const BYTE_RANGE_DIGIT_WIDTH: usize = 10;

/// Firma digitalmente `pdf_bytes` usando la identidad (certificado + clave
/// privada) contenida en `pfx_bytes`, protegida por `pfx_password`.
///
/// Devuelve los bytes del PDF ya firmado (el original + la actualización
/// incremental con la firma). El PDF de entrada **no** se modifica; el
/// resultado es siempre estrictamente más largo.
///
/// Limitaciones conocidas (razonables para la inmensa mayoría de PDFs, pero
/// vale la pena tenerlas presentes):
/// - El PDF de entrada no debe estar cifrado (`/Encrypt`).
/// - Si el documento ya tiene un `/AcroForm`, se reutiliza y se le agrega el
///   nuevo campo (no se pisa), pero solo se soporta el caso en que `/Fields`
///   sea un arreglo directo o una referencia a un arreglo (el caso normal).
/// - El campo de firma se ancla siempre a la primera página.
pub fn sign_pdf_pkcs12(
    pdf_bytes: &[u8],
    pfx_bytes: &[u8],
    pfx_password: &str,
) -> Result<Vec<u8>, Box<dyn Error>> {
    // --- 1. Cargar la identidad de firma desde el .pfx/.p12 -----------------
    //
    // Muchos .pfx "clásicos" (los que exportan Windows/certutil o CAs viejas)
    // cifran su contenido con RC2-40-CBC o 3DES. OpenSSL 3.x movió esos
    // algoritmos al proveedor "legacy" y ya no los activa por defecto: sin
    // esto, `parse2` fallaría con un error de "unsupported" en un porcentaje
    // importante de .pfx reales aunque la contraseña sea correcta. Se
    // ignoran los errores de carga (con `.ok()`) porque en builds
    // "vendored"/estáticas de OpenSSL puede no existir el proveedor legacy
    // como módulo cargable, y en ese caso solo fallarán los .pfx que
    // realmente lo necesiten (con un error claro de OpenSSL en `parse2`).
    //
    // IMPORTANTE: hay que conservar estos `Provider` con nombre (no `let _ =
    // ...`) porque `Provider` hace `OSSL_PROVIDER_unload` en su `Drop`. Un
    // `let _ = Provider::try_load(...)` descarta el valor en el acto y
    // desactiva el proveedor en la misma línea, antes de llegar a `parse2`
    // — falla en silencio justo para los .pfx "legacy" que esto debía
    // arreglar. Deben vivir al menos hasta después de `parse2`.
    let _legacy_provider = Provider::try_load(None, "legacy", true).ok();
    let _default_provider = Provider::try_load(None, "default", true).ok();

    let pkcs12 = Pkcs12::from_der(pfx_bytes)?;
    let identity = pkcs12.parse2(pfx_password)?;
    let signer_cert = identity
        .cert
        .ok_or("El .pfx no contiene un certificado de firma")?;
    let signer_key = identity
        .pkey
        .ok_or("El .pfx no contiene una clave privada")?;

    let mut chain = Stack::<X509>::new()?;
    if let Some(ca_certs) = identity.ca {
        for cert in ca_certs {
            chain.push(cert)?;
        }
    }

    // --- 2. Preparar la actualización incremental ---------------------------
    let prev_document = Document::load_mem(pdf_bytes)?;
    if prev_document.is_encrypted() {
        return Err("El PDF está cifrado; descífralo antes de firmarlo".into());
    }
    let mut incremental = IncrementalDocument::create_from(pdf_bytes.to_vec(), prev_document);

    let root_id = incremental
        .get_prev_documents()
        .trailer
        .get(b"Root")?
        .as_reference()?;
    incremental.opt_clone_object_to_new_document(root_id)?;

    let page_id = *incremental
        .get_prev_documents()
        .get_pages()
        .values()
        .next()
        .ok_or("El PDF no contiene ninguna página")?;
    incremental.opt_clone_object_to_new_document(page_id)?;

    // --- 3. Crear el diccionario de firma y el Widget invisible -------------
    let sig_id = incremental.new_document.new_object_id();
    let widget_id = incremental.new_document.new_object_id();

    let signing_time: Object = time::OffsetDateTime::now_utc().into();
    let byte_range_placeholder: i64 = 10i64.pow(BYTE_RANGE_DIGIT_WIDTH as u32) - 1; // 9999999999

    let sig_dict = dictionary! {
        "Type" => "Sig",
        "Filter" => "Adobe.PPKLite",
        "SubFilter" => "adbe.pkcs7.detached",
        "ByteRange" => Object::Array(vec![
            Object::Integer(0),
            Object::Integer(byte_range_placeholder),
            Object::Integer(byte_range_placeholder),
            Object::Integer(byte_range_placeholder),
        ]),
        "Contents" => Object::String(
            vec![0u8; SIGNATURE_PLACEHOLDER_BYTES],
            StringFormat::Hexadecimal,
        ),
        "M" => signing_time,
        "Reason" => Object::string_literal("Documento firmado digitalmente"),
    };
    incremental
        .new_document
        .set_object(sig_id, Object::Dictionary(sig_dict));

    let widget_dict = dictionary! {
        "Type" => "Annot",
        "Subtype" => "Widget",
        "FT" => "Sig",
        "Rect" => Object::Array(vec![
            Object::Integer(0),
            Object::Integer(0),
            Object::Integer(0),
            Object::Integer(0),
        ]),
        // Flag "Print" (4). El Rect es 0x0, así que el campo no se ve en
        // pantalla ni al imprimir; solo existe para portar la firma.
        "F" => Object::Integer(4),
        "V" => Object::Reference(sig_id),
        "P" => Object::Reference(page_id),
        "T" => Object::string_literal("Signature1"),
    };
    incremental
        .new_document
        .set_object(widget_id, Object::Dictionary(widget_dict));

    // --- 4. Enlazar el Widget a la página y al AcroForm ---------------------
    append_reference_to_array_field(&mut incremental, page_id, b"Annots", widget_id)?;

    let acroform_id = get_or_create_acroform(&mut incremental, root_id)?;
    append_reference_to_array_field(&mut incremental, acroform_id, b"Fields", widget_id)?;
    {
        let acroform_dict = incremental
            .new_document
            .get_object_mut(acroform_id)?
            .as_dict_mut()?;
        // Bit 1 (Signatures Exist) | Bit 2 (Append Only).
        acroform_dict.set("SigFlags", Object::Integer(3));
    }

    // --- 5. Serializar con los placeholders todavía en blanco ---------------
    let mut buffer = Vec::new();
    incremental.save_to(&mut buffer)?;

    // Nota: `IncrementalDocument::save_to` (lopdf 0.34) inserta una línea
    // extra "%PDF-x.y" entre la revisión anterior y los nuevos objetos.
    // Fuera de la posición 0 del archivo, cualquier línea que empiece con
    // '%' es un *comentario* según ISO 32000-1 §7.2.3, así que los lectores
    // conformes la ignoran; se deja tal cual a propósito porque los offsets
    // del xref que lopdf ya escribió en `buffer` la dan por existente —
    // quitarla correría todos los offsets posteriores y rompería el archivo.

    let search_from = incremental.get_prev_documents_bytes().len();

    // --- 6. Ubicar los placeholders de /Contents y /ByteRange ---------------
    let mut contents_marker = Vec::with_capacity(SIGNATURE_PLACEHOLDER_BYTES * 2 + 2);
    contents_marker.push(b'<');
    contents_marker.extend(std::iter::repeat(b'0').take(SIGNATURE_PLACEHOLDER_BYTES * 2));
    contents_marker.push(b'>');
    let contents_pos = find_subslice(&buffer[search_from..], &contents_marker)
        .ok_or("No se pudo ubicar el placeholder de /Contents en el PDF generado")?
        + search_from;
    let contents_hex_start = contents_pos + 1; // justo después de '<'
    let contents_hex_end = contents_pos + contents_marker.len() - 1; // posición de '>'

    let byte_range_marker = format!("{p} {p} {p}", p = byte_range_placeholder).into_bytes();
    let byte_range_pos = find_subslice(&buffer[search_from..], &byte_range_marker)
        .ok_or("No se pudo ubicar el placeholder de /ByteRange en el PDF generado")?
        + search_from;

    // --- 7. Calcular el /ByteRange real y sobrescribirlo (mismo ancho) ------
    let total_len = buffer.len();
    let range_values = [
        contents_pos as i64,
        (contents_hex_end + 1) as i64,
        (total_len - (contents_hex_end + 1)) as i64,
    ];
    for (i, value) in range_values.into_iter().enumerate() {
        let text = format!("{:0width$}", value, width = BYTE_RANGE_DIGIT_WIDTH);
        if text.len() != BYTE_RANGE_DIGIT_WIDTH {
            return Err(format!(
                "El PDF (>{BYTE_RANGE_DIGIT_WIDTH} dígitos) excede el ancho reservado para /ByteRange"
            )
            .into());
        }
        let start = byte_range_pos + i * (BYTE_RANGE_DIGIT_WIDTH + 1);
        buffer[start..start + BYTE_RANGE_DIGIT_WIDTH].copy_from_slice(text.as_bytes());
    }

    // --- 8. Hashear/firmar exactamente los bytes cubiertos por /ByteRange ---
    let mut signed_content = Vec::with_capacity(total_len - SIGNATURE_PLACEHOLDER_BYTES * 2);
    signed_content.extend_from_slice(&buffer[0..contents_pos]);
    signed_content.extend_from_slice(&buffer[contents_hex_end + 1..]);

    // DETACHED: el contenido no se re-incluye dentro del PKCS#7 (ya está en
    // el propio PDF). BINARY: evita que OpenSSL intente "normalizar" saltos
    // de línea como si fuera texto S/MIME. Al no pasar NOATTR, se agregan
    // los atributos firmados (contentType + messageDigest), tal como espera
    // adbe.pkcs7.detached.
    let pkcs7 = Pkcs7::sign(
        &signer_cert,
        &signer_key,
        &chain,
        &signed_content,
        Pkcs7Flags::DETACHED | Pkcs7Flags::BINARY,
    )?;
    let der = pkcs7.to_der()?;
    if der.len() > SIGNATURE_PLACEHOLDER_BYTES {
        return Err(format!(
            "La firma PKCS#7 ({} bytes) no cabe en el espacio reservado ({} bytes); \
             sube SIGNATURE_PLACEHOLDER_BYTES y vuelve a firmar",
            der.len(),
            SIGNATURE_PLACEHOLDER_BYTES
        )
        .into());
    }

    // --- 9. Volcar la firma en hex (mayúsculas) dentro del placeholder ------
    let mut hex = String::with_capacity(SIGNATURE_PLACEHOLDER_BYTES * 2);
    for byte in &der {
        hex.push_str(&format!("{byte:02X}"));
    }
    // Relleno con ceros: un lector de PDF ubica el fin real de la firma
    // parseando el propio DER (que declara su longitud), así que los bytes
    // 00 sobrantes al final del hex se ignoran sin problema.
    while hex.len() < SIGNATURE_PLACEHOLDER_BYTES * 2 {
        hex.push('0');
    }
    buffer[contents_hex_start..contents_hex_end].copy_from_slice(hex.as_bytes());

    Ok(buffer)
}

/// Encuentra el `id` del `/AcroForm` del catálogo, clonándolo al documento
/// nuevo si ya existía (por referencia o inline), o creando uno vacío si no
/// existía.
fn get_or_create_acroform(
    incremental: &mut IncrementalDocument,
    root_id: ObjectId,
) -> Result<ObjectId, Box<dyn Error>> {
    let existing = incremental
        .new_document
        .get_object(root_id)?
        .as_dict()?
        .get(b"AcroForm")
        .ok()
        .cloned();

    let acroform_id = match existing {
        Some(Object::Reference(af_id)) => {
            incremental.opt_clone_object_to_new_document(af_id)?;
            af_id
        }
        Some(Object::Dictionary(inline_dict)) => {
            // Caso raro: /AcroForm embebido directamente en el catálogo en
            // vez de como referencia indirecta. Se promueve a objeto propio
            // para poder actualizarlo de forma incremental.
            let af_id = incremental
                .new_document
                .add_object(Object::Dictionary(inline_dict));
            incremental
                .new_document
                .get_object_mut(root_id)?
                .as_dict_mut()?
                .set("AcroForm", Object::Reference(af_id));
            af_id
        }
        _ => {
            let af_id = incremental.new_document.new_object_id();
            incremental
                .new_document
                .set_object(af_id, Object::Dictionary(lopdf::Dictionary::new()));
            incremental
                .new_document
                .get_object_mut(root_id)?
                .as_dict_mut()?
                .set("AcroForm", Object::Reference(af_id));
            af_id
        }
    };
    Ok(acroform_id)
}

/// Agrega `Object::Reference(new_ref)` al arreglo guardado bajo `field` en el
/// diccionario `container_id`, sin importar si ese arreglo está inline o es
/// una referencia indirecta, y creándolo si todavía no existe.
fn append_reference_to_array_field(
    incremental: &mut IncrementalDocument,
    container_id: ObjectId,
    field: &[u8],
    new_ref: ObjectId,
) -> Result<(), Box<dyn Error>> {
    let existing = incremental
        .new_document
        .get_object(container_id)?
        .as_dict()?
        .get(field)
        .ok()
        .cloned();

    match existing {
        Some(Object::Reference(array_ref)) => {
            incremental.opt_clone_object_to_new_document(array_ref)?;
            let arr = incremental
                .new_document
                .get_object_mut(array_ref)?
                .as_array_mut()?;
            arr.push(Object::Reference(new_ref));
        }
        Some(Object::Array(mut arr)) => {
            arr.push(Object::Reference(new_ref));
            incremental
                .new_document
                .get_object_mut(container_id)?
                .as_dict_mut()?
                .set(field.to_vec(), Object::Array(arr));
        }
        _ => {
            incremental
                .new_document
                .get_object_mut(container_id)?
                .as_dict_mut()?
                .set(field.to_vec(), Object::Array(vec![Object::Reference(new_ref)]));
        }
    }
    Ok(())
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}
