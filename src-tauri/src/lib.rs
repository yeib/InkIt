pub mod pdf_engine;
pub mod utils;

#[tauri::command]
fn read_pdf(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Error guardando archivo: {}", e))
}

#[tauri::command]
fn get_initial_pdf() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 && args[1].to_lowercase().ends_with(".pdf") {
        Some(args[1].clone())
    } else {
        None
    }
}

#[tauri::command]
fn flatten_pdf(recipe: pdf_engine::FlattenRecipe) -> Result<(), String> {
    pdf_engine::process_flatten(recipe)
}

#[tauri::command]
fn sign_pdf(pdf_path: String, pfx_path: String, pfx_password: String) -> Result<Vec<u8>, String> {
    let pdf_bytes = std::fs::read(&pdf_path).map_err(|e| format!("Error leyendo PDF: {}", e))?;
    let pfx_bytes = std::fs::read(&pfx_path).map_err(|e| format!("Error leyendo PFX: {}", e))?;
    
    pdf_engine::sign_pdf_pkcs12(&pdf_bytes, &pfx_bytes, &pfx_password)
        .map_err(|e| format!("Error firmando PDF: {}", e))
}

#[tauri::command]
fn create_pfx(name: String, detail: String, password: String, out_path: String) -> Result<(), String> {
    let pfx_bytes = pdf_engine::generate_pfx(&name, &detail, &password)
        .map_err(|e| format!("Error generando PFX: {}", e))?;
    std::fs::write(&out_path, pfx_bytes)
        .map_err(|e| format!("Error guardando PFX: {}", e))
}


#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer")
            .raw_arg(format!("/select,\"{}\"", path.replace("/", "\\")))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        // On linux it is harder to select a file, so we just open its parent directory
        let parent = std::path::Path::new(&path).parent().unwrap_or(std::path::Path::new(""));
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![read_pdf, save_file, get_initial_pdf, flatten_pdf, sign_pdf, create_pfx, open_file])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}



