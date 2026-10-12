//! Implementación individual de cada operación de aplanado.

use lopdf::content::Operation;
use lopdf::{Document, Object, ObjectId, StringFormat};

use super::helpers::{name_object, parse_hex_color, utf8_to_winansi};
use super::page_ops::{append_content_stream, insert_resource_in_page, PageTarget};
use super::resources::{
    build_difference_extgstate, build_extgstate_dictionary, build_font_dictionary,
    build_image_xobject, decode_base64_png,
};
use super::types::Point;
use crate::utils::map_y;

/// Nombre del recurso `ExtGState` usado por el modo oscuro.
const DARK_MODE_GS_NAME: &str = "YeibGS_DarkMode";
/// Nombre del recurso de fuente Helvetica registrado en las páginas.
const FONT_NAME: &str = "YeibF1";

/// Estado compartido entre operaciones durante un mismo aplanado.
#[derive(Default)]
pub(super) struct FlattenState {
    /// Contador para nombres únicos de imágenes (`YeibImg{n}`).
    img_counter: u32,
    /// Fuente Helvetica, creada una sola vez por documento.
    font_f1_id: Option<ObjectId>,
}

/// Inversión de colores: rectángulo blanco a página completa con blend `Difference`.
pub(super) fn apply_dark_mode(doc: &mut Document, target: &PageTarget) -> Result<(), String> {
    let page = target.number;
    let ext_id = build_difference_extgstate(doc);

    insert_resource_in_page(doc, target.id, "ExtGState", DARK_MODE_GS_NAME, ext_id)
        .map_err(|e| format!("Error registrando dark mode en página {page}: {e}"))?;

    let ops = vec![
        Operation::new("q", vec![]),
        Operation::new("gs", vec![name_object(DARK_MODE_GS_NAME)]),
        Operation::new("rg", vec![1.0.into(), 1.0.into(), 1.0.into()]),
        Operation::new(
            "re",
            vec![
                0.0.into(),
                0.0.into(),
                target.width.into(),
                target.height.into(),
            ],
        ),
        Operation::new("f", vec![]),
        Operation::new("Q", vec![]),
    ];
    append_content_stream(doc, target.id, ops)
        .map_err(|e| format!("Error agregando dark mode a página {page}: {e}"))
}

/// Dibuja un PNG (base64) como `XObject`, con opacidad opcional.
#[allow(clippy::too_many_arguments)]
pub(super) fn apply_image(
    doc: &mut Document,
    state: &mut FlattenState,
    target: &PageTarget,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    base64_data: &str,
    opacity: Option<f32>,
) -> Result<(), String> {
    let page = target.number;
    let pdf_y = map_y(y, target.height, height);

    let img =
        decode_base64_png(base64_data).map_err(|e| format!("Error decodificando imagen: {}", e))?;
    let image_id = build_image_xobject(doc, img)
        .map_err(|e| format!("Error construyendo imagen PDF: {}", e))?;

    state.img_counter += 1;
    let xobj_name = format!("YeibImg{}", state.img_counter);
    insert_resource_in_page(doc, target.id, "XObject", &xobj_name, image_id)
        .map_err(|e| format!("Error registrando imagen en página {page}: {e}"))?;

    let opac = opacity.unwrap_or(1.0);
    let mut ops = vec![Operation::new("q", vec![])];

    if opac < 1.0 {
        let gs_id = build_extgstate_dictionary(doc, opac);
        let gs_name = format!("YeibGS_Img{}", state.img_counter);
        insert_resource_in_page(doc, target.id, "ExtGState", &gs_name, gs_id)
            .map_err(|e| format!("Error registrando opacidad en página {page}: {e}"))?;
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
    append_content_stream(doc, target.id, ops)
        .map_err(|e| format!("Error agregando imagen a página {page}: {e}"))
}

/// Dibuja texto Helvetica (WinAnsi) con fondo opcional.
#[allow(clippy::too_many_arguments)]
pub(super) fn apply_text(
    doc: &mut Document,
    state: &mut FlattenState,
    target: &PageTarget,
    x: f32,
    y: f32,
    text: &str,
    font_size: f32,
    color: &str,
    bg_color: Option<&str>,
) -> Result<(), String> {
    let page = target.number;
    let pdf_y = map_y(y, target.height, font_size); // Approx bounding box

    // Registra la fuente una sola vez por documento.
    let f1_id = *state
        .font_f1_id
        .get_or_insert_with(|| build_font_dictionary(doc));
    insert_resource_in_page(doc, target.id, "Font", FONT_NAME, f1_id)
        .map_err(|e| format!("Error registrando fuente en página {page}: {e}"))?;

    let (r, g, b) = parse_hex_color(color);
    let text_bytes = utf8_to_winansi(text);

    let mut ops = vec![Operation::new("q", vec![])];

    if let Some(bg_hex) = bg_color {
        let (b_r, b_g, b_b) = parse_hex_color(bg_hex);
        // Ancho estimado (aproximación gruesa para Helvetica estándar).
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

    ops.extend(vec![
        Operation::new("rg", vec![r.into(), g.into(), b.into()]),
        Operation::new("BT", vec![]),
        Operation::new("Tf", vec![name_object(FONT_NAME), font_size.into()]),
        Operation::new("Td", vec![x.into(), pdf_y.into()]),
        Operation::new(
            "Tj",
            vec![Object::String(text_bytes, StringFormat::Literal)],
        ),
        Operation::new("ET", vec![]),
        Operation::new("Q", vec![]),
    ]);

    append_content_stream(doc, target.id, ops)
        .map_err(|e| format!("Error agregando texto a página {page}: {e}"))
}

/// Dibuja un trazo grueso semitransparente (resaltador a mano alzada).
pub(super) fn apply_highlight(
    doc: &mut Document,
    target: &PageTarget,
    points: &[Point],
    color: &str,
    opacity: f32,
) -> Result<(), String> {
    let page = target.number;

    let gs_id = build_extgstate_dictionary(doc, opacity);
    let gs_name = format!("YeibGS_{}", (opacity * 100.0) as i32);
    insert_resource_in_page(doc, target.id, "ExtGState", &gs_name, gs_id)
        .map_err(|e| format!("Error registrando resaltado en página {page}: {e}"))?;

    let (r, g, b) = parse_hex_color(color);

    let mut ops = vec![
        Operation::new("q", vec![]),
        Operation::new("gs", vec![name_object(&gs_name)]),
        Operation::new("RG", vec![r.into(), g.into(), b.into()]), // Stroke color
        Operation::new("J", vec![1.into()]),                      // Round cap
        Operation::new("j", vec![1.into()]),                      // Round join
        Operation::new("w", vec![15.0.into()]),                   // Line width
    ];

    if let Some((first, rest)) = points.split_first() {
        let first_y = map_y(first.y, target.height, 0.0);
        ops.push(Operation::new("m", vec![first.x.into(), first_y.into()]));
        for p in rest {
            let py = map_y(p.y, target.height, 0.0);
            ops.push(Operation::new("l", vec![p.x.into(), py.into()]));
        }
        ops.push(Operation::new("S", vec![])); // Stroke path
    }

    ops.push(Operation::new("Q", vec![]));
    append_content_stream(doc, target.id, ops)
        .map_err(|e| format!("Error agregando resaltado a página {page}: {e}"))
}
