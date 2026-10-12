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
//!
//! Estructura interna:
//! - `types`: DTOs públicos.
//! - `helpers`: color, codificación WinAnsi y nombres PDF.
//! - `resources`: PNG, zlib, `XObject`, fuente y `ExtGState`.
//! - `page_ops`: recursos/contenido de página y dimensiones.
//! - `ops`: una función por cada operación.

mod helpers;
mod ops;
mod page_ops;
mod resources;
mod types;

use lopdf::Document;

use ops::{apply_dark_mode, apply_highlight, apply_image, apply_text, FlattenState};
use page_ops::locate_page;

// API pública (firma intacta para `pdf_engine/mod.rs`).
pub use types::{FlattenRecipe, PageConfig, PdfOperation, Point};

// Helpers `pub(crate)` que antes vivían en `flatten.rs`: se re-exportan para
// no romper rutas internas del crate (`flatten::parse_hex_color`, etc.).
#[allow(unused_imports)]
pub(crate) use helpers::{parse_hex_color, utf8_to_winansi};
#[allow(unused_imports)]
pub(crate) use page_ops::{
    append_content_stream, get_field, get_page_dimensions, insert_resource_in_page, resolve_dict,
};
#[allow(unused_imports)]
pub(crate) use resources::{
    build_extgstate_dictionary, build_font_dictionary, build_image_xobject, decode_base64_png,
    flate_compress,
};

/// Aplica todas las operaciones de la receta sobre el PDF de entrada y guarda
/// el resultado en `output_path`.
pub fn process_flatten(recipe: FlattenRecipe) -> Result<(), String> {
    let FlattenRecipe {
        file_path,
        output_path,
        pages_config,
        operations,
    } = recipe;

    let mut doc = Document::load(&file_path).map_err(|e| format!("Error cargando PDF: {}", e))?;
    let pages = doc.get_pages();
    let mut state = FlattenState::default();

    for op in operations {
        match op {
            PdfOperation::DarkModeInvert { page } => {
                let target = locate_page(&doc, &pages, &pages_config, page)?;
                apply_dark_mode(&mut doc, &target)?;
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
                let target = locate_page(&doc, &pages, &pages_config, page)?;
                apply_image(
                    &mut doc,
                    &mut state,
                    &target,
                    x,
                    y,
                    width,
                    height,
                    &base64_data,
                    opacity,
                )?;
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
                let target = locate_page(&doc, &pages, &pages_config, page)?;
                apply_text(
                    &mut doc,
                    &mut state,
                    &target,
                    x,
                    y,
                    &text,
                    font_size,
                    &color,
                    bg_color.as_deref(),
                )?;
            }
            PdfOperation::Highlight {
                page,
                points,
                color,
                opacity,
            } => {
                let target = locate_page(&doc, &pages, &pages_config, page)?;
                apply_highlight(&mut doc, &target, &points, &color, opacity)?;
            }
        }
    }

    doc.compress();
    doc.save(&output_path)
        .map_err(|e| format!("Error guardando PDF: {}", e))?;
    Ok(())
}
