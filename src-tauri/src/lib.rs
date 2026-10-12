pub mod pdf_engine;
pub mod utils;

#[tauri::command]
fn read_pdf(path: String) -> Result<Vec<u8>, String> {
    if path.contains('\0') { return Err("Invalid path".to_string()); }
    std::fs::read(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    if path.contains('\0') { return Err("Invalid path".to_string()); }
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
    let target = std::path::Path::new(&path);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut command = std::process::Command::new("explorer");
        if target.is_dir() {
            command.arg(target);
        } else {
            command.raw_arg(format!("/select,\"{}\"", path.replace("/", "\\")));
        }
        command.spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        let mut command = std::process::Command::new("open");
        if !target.is_dir() {
            command.arg("-R");
        }
        command.arg(target).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        // On Linux, reveal files by opening their parent directory.
        let directory = if target.is_dir() {
            target
        } else {
            target.parent().unwrap_or(std::path::Path::new(""))
        };
        std::process::Command::new("xdg-open")
            .arg(directory)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn inspect_pfx(pfx_path: String, password: String) -> Result<pdf_engine::PfxIdentityInfo, String> {
    if pfx_path.contains('\0') { return Err("Ruta inválida".to_string()); }
    let pfx_bytes = std::fs::read(&pfx_path).map_err(|e| format!("Error leyendo PFX: {}", e))?;
    pdf_engine::inspect_pfx_bytes(&pfx_bytes, &password).map_err(|e| e.to_string())
}

#[tauri::command]
fn inspect_pdf_signatures(
    pdf_path: Option<String>,
    pdf_bytes: Option<Vec<u8>>,
) -> Result<inkit_core::sig_inspector::PdfSignatureReport, String> {
    let bytes = if let Some(b) = pdf_bytes {
        b
    } else if let Some(p) = pdf_path {
        std::fs::read(&p).map_err(|e| format!("Error leyendo PDF para inspección de firmas: {e}"))?
    } else {
        return Err("Se requiere pdf_path o pdf_bytes".to_string());
    };

    inkit_core::sig_inspector::inspect_pdf_signatures(&bytes)
        .map_err(|e| format!("Error inspeccionando firmas digitales: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![
        read_pdf,
        save_file,
        get_initial_pdf,
        flatten_pdf,
        sign_pdf,
        create_pfx,
        open_file,
        inspect_pfx,
        inspect_pdf_signatures
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Asegurar que la carpeta Documents/InkIt exista y tenga el ícono oficial de InkIt
      #[cfg(target_os = "windows")]
      {
          let mut doc_dir = std::path::PathBuf::from(std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".to_string()));
          doc_dir.push("Documents");
          let inkit_dir = if doc_dir.join("InkIt").is_file() {
              doc_dir.join("InkItYeib")
          } else {
              doc_dir.join("InkIt")
          };
          // Solo si no existe icon_pro.ico (el ícono de InkIt Pro tiene prioridad y no debe ser sobreescrito)
          if !inkit_dir.join("icon_pro.ico").exists() {
              let icon_bytes = include_bytes!("../icons/icon.ico");
              let _ = yeib_sys::fs_ops::set_folder_custom_icon(&inkit_dir, icon_bytes);
          }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}


