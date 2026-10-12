//! Manipulación del DOM de `lopdf` a nivel de página: resolución de
//! diccionarios, inyección de `/Resources` y `/Contents`, y dimensiones.

use anyhow::{anyhow, Context, Result};
use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream};
use std::collections::BTreeMap;

use super::types::PageConfig;

/// Máximo de niveles a subir por `/Parent` buscando `CropBox`/`MediaBox`.
const MAX_PARENT_DEPTH: usize = 10;
/// Tamaño Carta (puntos), usado como último recurso.
const LETTER_SIZE: (f32, f32) = (612.0, 792.0);

/// Página ya localizada: id del objeto, dimensiones y número (1-based).
pub(super) struct PageTarget {
    pub id: ObjectId,
    pub width: f32,
    pub height: f32,
    pub number: u32,
}

/// Resuelve un objeto que puede ser un diccionario directo o una referencia a
/// uno. Devuelve una copia del diccionario y, si venía por referencia, su id.
pub(crate) fn resolve_dict(doc: &Document, obj: &Object) -> Result<(Dictionary, Option<ObjectId>)> {
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
    res_name: &str, // "YeibF1", "YeibGS_Img1", "YeibImg1"
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

/// Convierte un número PDF (`Real` o `Integer`) a `f32`.
fn to_f32(obj: &Object) -> Option<f32> {
    match obj {
        Object::Real(f) => Some(*f),
        Object::Integer(i) => Some(*i as f32),
        _ => None,
    }
}

/// Lee `CropBox` (o `MediaBox`) de un diccionario de página y devuelve
/// `(ancho, alto)` aplicando `/Rotate` (90°/270° intercambian los ejes).
fn box_size(dict: &Dictionary) -> Option<(f32, f32)> {
    let box_obj = dict.get(b"CropBox").or_else(|_| dict.get(b"MediaBox"));
    let arr = box_obj.and_then(|o| o.as_array()).ok()?;

    let [x0, y0, x1, y1] = match arr.as_slice() {
        [a, b, c, d, ..] => [to_f32(a)?, to_f32(b)?, to_f32(c)?, to_f32(d)?],
        _ => return None,
    };
    let (w, h) = ((x1 - x0).abs(), (y1 - y0).abs());

    let rotation = match dict.get(b"Rotate") {
        Ok(Object::Integer(r)) => *r,
        _ => 0,
    };
    if rotation == 90 || rotation == 270 {
        Some((h, w))
    } else {
        Some((w, h))
    }
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
    for _ in 0..MAX_PARENT_DEPTH {
        let Ok(dict) = doc.get_object(current_id).and_then(|o| o.as_dict()) else {
            break;
        };
        if let Some(size) = box_size(dict) {
            return size;
        }
        match dict.get(b"Parent").and_then(|o| o.as_reference()) {
            Ok(parent_id) => current_id = parent_id,
            Err(_) => break,
        }
    }

    LETTER_SIZE
}

/// Localiza la página `page` (1-based) y devuelve su [`PageTarget`].
pub(super) fn locate_page(
    doc: &Document,
    pages: &BTreeMap<u32, ObjectId>,
    pages_config: &[PageConfig],
    page: u32,
) -> Result<PageTarget, String> {
    let id = pages
        .get(&page)
        .copied()
        .ok_or_else(|| format!("Página {page} no existe en el PDF"))?;
    let page_conf = pages_config.iter().find(|c| c.page_num == page);
    let (width, height) = get_page_dimensions(doc, id, page_conf);
    Ok(PageTarget {
        id,
        width,
        height,
        number: page,
    })
}
