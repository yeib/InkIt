//! Helpers puros (sin acceso al documento): color, codificación y nombres PDF.

use lopdf::Object;

/// Convierte `#RRGGBB` (o `RRGGBB`) a componentes RGB normalizados `0.0..=1.0`.
///
/// Si el formato no es válido devuelve negro `(0, 0, 0)`.
pub(crate) fn parse_hex_color(hex: &str) -> (f32, f32, f32) {
    let hex = hex.trim_start_matches('#');
    // `get(..)` evita un pánico si el string contiene caracteres multibyte.
    let channel = |range: std::ops::Range<usize>| -> f32 {
        hex.get(range)
            .and_then(|s| u8::from_str_radix(s, 16).ok())
            .unwrap_or(0) as f32
            / 255.0
    };
    if hex.len() == 6 {
        (channel(0..2), channel(2..4), channel(4..6))
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
            _ => u8::try_from(c as u32).unwrap_or(b'?'),
        })
        .collect()
}

/// Atajo para construir un `Object::Name` a partir de un `&str`.
pub(super) fn name_object(name: &str) -> Object {
    Object::Name(name.as_bytes().to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_and_invalid_hex() {
        assert_eq!(parse_hex_color("#FF0000"), (1.0, 0.0, 0.0));
        assert_eq!(parse_hex_color("00ff00"), (0.0, 1.0, 0.0));
        assert_eq!(parse_hex_color("xyz"), (0.0, 0.0, 0.0));
        assert_eq!(parse_hex_color("ñññ"), (0.0, 0.0, 0.0)); // 6 bytes, no ASCII
    }

    #[test]
    fn encodes_winansi() {
        assert_eq!(utf8_to_winansi("Añ¿"), vec![b'A', 0xF1, 0xBF]);
        assert_eq!(utf8_to_winansi("€"), vec![b'?']);
    }
}
