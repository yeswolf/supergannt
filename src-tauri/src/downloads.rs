//! Android: write exports into the public Downloads folder via MediaStore.

use tauri::{
  plugin::{Builder, TauriPlugin},
  AppHandle, Manager, Runtime,
};

#[cfg(target_os = "android")]
struct DownloadsApi<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveToDownloadsRequest<'a> {
  file_name: &'a str,
  contents_base64: &'a str,
  mime_type: Option<&'a str>,
}

#[derive(serde::Deserialize)]
struct SaveToDownloadsResponse {
  path: String,
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("downloads")
    .setup(|app, api| {
      #[cfg(target_os = "android")]
      {
        let handle = api.register_android_plugin("com.supergannt.planner", "DownloadsPlugin")?;
        app.manage(DownloadsApi(handle));
      }
      #[cfg(not(target_os = "android"))]
      {
        let _ = (app, api);
      }
      Ok(())
    })
    .build()
}

#[cfg(target_os = "android")]
pub fn save_to_public_downloads<R: Runtime>(
  app: &AppHandle<R>,
  file_name: &str,
  contents_base64: &str,
) -> Result<String, String> {
  let api = app
    .try_state::<DownloadsApi<R>>()
    .ok_or_else(|| "Downloads plugin not initialized".to_string())?;
  let mime = mime_for_name(file_name);
  api.0
    .run_mobile_plugin::<SaveToDownloadsResponse>(
      "saveToDownloads",
      SaveToDownloadsRequest {
        file_name,
        contents_base64,
        mime_type: Some(mime),
      },
    )
    .map(|r| r.path)
    .map_err(|e| format!("save to Downloads: {e}"))
}

#[cfg(target_os = "android")]
fn mime_for_name(file_name: &str) -> &'static str {
  let ext = std::path::Path::new(file_name)
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_ascii_lowercase();
  match ext.as_str() {
    "pdf" => "application/pdf",
    "xml" | "mspdi" => "application/xml",
    "mpp" | "mpt" => "application/vnd.ms-project",
    "mpx" => "application/octet-stream",
    _ => "application/octet-stream",
  }
}
