#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;

use std::sync::Mutex;

use tauri::{Manager, Url};

struct ApiState {
  child: Mutex<Option<std::process::Child>>,
}

fn show_boot_error(message: &str) {
  let log = std::env::temp_dir().join("supergannt-tauri-boot-error.txt");
  let _ = std::fs::write(&log, message);

  // Skip blocking UI dialogs in automated / headless probes.
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
        0x10, // MB_ICONERROR
      );
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(ApiState {
      child: Mutex::new(None),
    })
    .setup(|app| {
      // Boot (and first-launch Node download) off the UI thread so the splash
      // stays responsive and we never deadlock waiting on child processes.
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
    })
    .run(tauri::generate_context!())
    .expect("error while running SuperGantt (Tauri)");
}
