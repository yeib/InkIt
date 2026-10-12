//! Tipos públicos del motor de aplanado (deserializados desde el frontend).

use serde::Deserialize;

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
