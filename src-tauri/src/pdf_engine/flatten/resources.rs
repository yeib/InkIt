//! Constructores de recursos PDF: decodificación PNG, compresión zlib,
//! `XObject` de imagen (con `SMask` de alfa), fuente Helvetica y `ExtGState`.

use anyhow::{Context, Result};
use base64::{engine::general_purpose, Engine as _};
use flate2::write::ZlibEncoder;
use flate2::Compression;
use image::{DynamicImage, GenericImageView};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream};
use std::io::Write;

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

/// Diccionario base de un `XObject` de imagen de 8 bits/componente con `FlateDecode`.
fn image_dictionary(width: u32, height: u32, color_space: &str) -> Dictionary {
    let mut dict = Dictionary::new();
    dict.set("Type", Object::Name(b"XObject".to_vec()));
    dict.set("Subtype", Object::Name(b"Image".to_vec()));
    dict.set("Width", Object::Integer(i64::from(width)));
    dict.set("Height", Object::Integer(i64::from(height)));
    dict.set("ColorSpace", Object::Name(color_space.as_bytes().to_vec()));
    dict.set("BitsPerComponent", Object::Integer(8));
    dict.set("Filter", Object::Name(b"FlateDecode".to_vec()));
    dict
}

/// Inserta el canal alfa de `img` como `SMask` (escala de grises) y devuelve su id.
fn build_alpha_smask(doc: &mut Document, img: &DynamicImage) -> Result<ObjectId> {
    let (width, height) = img.dimensions();
    let alpha: Vec<u8> = img.to_rgba8().pixels().map(|p| p[3]).collect();
    let compressed_alpha = flate_compress(&alpha)?;

    let dict = image_dictionary(width, height, "DeviceGray");
    Ok(doc.add_object(Stream::new(dict, compressed_alpha)))
}

/// Inserta una imagen como `XObject` en el documento y devuelve su id.
///
/// Si la imagen tiene canal alfa, el alfa se guarda como `SMask` aparte.
pub(crate) fn build_image_xobject(doc: &mut Document, img: DynamicImage) -> Result<ObjectId> {
    let (width, height) = img.dimensions();

    let smask_id = if img.color().has_alpha() {
        Some(build_alpha_smask(doc, &img)?)
    } else {
        None
    };

    let rgb = img.to_rgb8().into_raw();
    let compressed_rgb = flate_compress(&rgb)?;

    let mut image_dict = image_dictionary(width, height, "DeviceRGB");
    if let Some(id) = smask_id {
        image_dict.set("SMask", Object::Reference(id));
    }

    Ok(doc.add_object(Stream::new(image_dict, compressed_rgb)))
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

/// Crea el `ExtGState` con blend mode `Difference` usado por el modo oscuro.
pub(crate) fn build_difference_extgstate(doc: &mut Document) -> ObjectId {
    let mut dict = Dictionary::new();
    dict.set("Type", Object::Name(b"ExtGState".to_vec()));
    dict.set("BM", Object::Name(b"Difference".to_vec()));
    doc.add_object(Object::Dictionary(dict))
}
