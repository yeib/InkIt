pub fn map_y(js_y: f32, page_height: f32, element_height: f32) -> f32 {
    page_height - js_y - element_height
}
