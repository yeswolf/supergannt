#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(desktop)]
mod api;
mod downloads;
#[cfg(target_os = "android")]
mod mpp_android;
mod mpp;

#[cfg(desktop)]
use tauri::Manager;

#[cfg(desktop)]
use std::sync::Mutex;

#[cfg(desktop)]
struct ApiState {
  child: Mutex<Option<std::process::Child>>,
}

fn extension_filters(default_name: &str) -> Vec<(&'static str, Vec<&'static str>)> {
  let ext = std::path::Path::new(default_name)
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_ascii_lowercase();
  match ext.as_str() {
    "xml" | "mspdi" => vec![("MSPDI XML", vec!["xml", "mspdi"]), ("All files", vec!["*"])],
    "mpp" | "mpt" => vec![("Microsoft Project", vec!["mpp", "mpt"]), ("All files", vec!["*"])],
    "mpx" => vec![("MPX", vec!["mpx"]), ("All files", vec!["*"])],
    "pdf" => vec![("PDF", vec!["pdf"]), ("All files", vec!["*"])],
    _ => vec![("All files", vec!["*"])],
  }
}

/// Native Save dialog (desktop) or public Downloads folder (Android).
/// Returns absolute/display path, or null if cancelled (desktop only).
#[tauri::command]
fn save_file(
  app: tauri::AppHandle,
  default_name: String,
  contents_base64: String,
) -> Result<Option<String>, String> {
  let safe_name = std::path::Path::new(&default_name)
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or("project.bin")
    .to_string();

  #[cfg(target_os = "android")]
  {
    let path =
      downloads::save_to_public_downloads(&app, &safe_name, &contents_base64)?;
    return Ok(Some(path));
  }

  #[cfg(desktop)]
  {
    use base64::Engine;
    let _ = app;
    let bytes = base64::engine::general_purpose::STANDARD
      .decode(contents_base64.as_bytes())
      .map_err(|e| format!("invalid file payload: {e}"))?;

    let mut dialog = rfd::FileDialog::new().set_file_name(&safe_name);
    for (name, exts) in extension_filters(&safe_name) {
      dialog = dialog.add_filter(name, &exts);
    }

    let Some(path) = dialog.save_file() else {
      return Ok(None);
    };
    std::fs::write(&path, &bytes).map_err(|e| format!("write {}: {e}", path.display()))?;
    Ok(Some(path.display().to_string()))
  }

  #[cfg(all(mobile, not(target_os = "android")))]
  {
    let _ = (app, contents_base64);
    Err("Save is only implemented on Android and desktop.".into())
  }
}

#[cfg(desktop)]
fn show_boot_error(message: &str) {
  let log = std::env::temp_dir().join("supergannt-tauri-boot-error.txt");
  let _ = std::fs::write(&log, message);

  if std::env::var_os("SUPERGANNT_HEADLESS").is_some() {
    eprintln!("{message}");
    return;
  }

  #[cfg(windows)]
  {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "user32")]
    extern "system" {
      fn MessageBoxW(
        h_wnd: *mut core::ffi::c_void,
        lp_text: *const u16,
        lp_caption: *const u16,
        u_type: u32,
      ) -> i32;
    }
    fn wide(s: &str) -> Vec<u16> {
      OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }
    let text = wide(message);
    let caption = wide("SuperGantt failed to start");
    unsafe {
      MessageBoxW(
        core::ptr::null_mut(),
        text.as_ptr(),
        caption.as_ptr(),
        0x10,
      );
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default().plugin(downloads::init());

  #[cfg(target_os = "android")]
  let builder = builder.plugin(mpp_android::init());

  #[cfg(desktop)]
  let builder = builder.manage(ApiState {
    child: Mutex::new(None),
  });

  let builder = builder.invoke_handler(tauri::generate_handler![
    save_file,
    mpp::mpp_to_xml,
    mpp::xml_to_mpp
  ]);

  #[cfg(desktop)]
  let builder = builder
    .setup(|app| {
      use tauri::Url;
      // Boot Node API off the UI thread (Windows desktop pack).
      let handle = app.handle().clone();
      std::thread::Builder::new()
        .name("supergannt-boot".into())
        .spawn(move || {
          let result = (|| -> Result<(), String> {
            let resources = api::resources_root(&handle)?;
            let (port, child) = api::boot_api(&resources)?;
            {
              let state = handle.state::<ApiState>();
              *state.child.lock().expect("api child lock") = Some(child);
            }

            let url = Url::parse(&format!("http://127.0.0.1:{port}/"))
              .map_err(|e| format!("invalid app url: {e}"))?;
            if let Some(window) = handle.get_webview_window("main") {
              window
                .navigate(url)
                .map_err(|e| format!("navigate failed: {e}"))?;
            }
            Ok(())
          })();

          if let Err(message) = result {
            show_boot_error(&message);
            if let Some(window) = handle.get_webview_window("main") {
              let _ = window.close();
            }
          }
        })
        .expect("spawn boot thread");
      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::Destroyed = event {
        let handle = window.app_handle().clone();
        let state = handle.state::<ApiState>();
        let mut child = {
          let mut guard = state.child.lock().expect("api child lock");
          guard.take()
        };
        if let Some(child) = child.as_mut() {
          let _ = child.kill();
          let _ = child.wait();
        }
      }
    });

  #[cfg(mobile)]
  let builder = builder.setup(|_app| {
    // Offline Android: UI is bundled Vite `dist`; MPP via Kotlin/MPXJ plugin.
    Ok(())
  });

  builder
    .run(tauri::generate_context!())
    .expect("error while running SuperGantt (Tauri)");
}
