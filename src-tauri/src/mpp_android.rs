//! Android MPXJ bridge (Kotlin plugin) for offline .mpp ↔ MSPDI.

use tauri::{
  plugin::{Builder, TauriPlugin},
  AppHandle, Manager, Runtime,
};

#[cfg(target_os = "android")]
struct MppApi<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MppToXmlRequest<'a> {
  contents_base64: &'a str,
  file_name: &'a str,
}

#[derive(serde::Deserialize)]
struct MppToXmlResponse {
  xml: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct XmlToMppRequest<'a> {
  xml: &'a str,
  file_name: &'a str,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct XmlToMppResponse {
  contents_base64: String,
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("mpp")
    .setup(|app, api| {
      #[cfg(target_os = "android")]
      {
        let handle = api.register_android_plugin("com.supergannt.planner", "MppPlugin")?;
        app.manage(MppApi(handle));
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
pub fn mpp_to_xml<R: Runtime>(
  app: &AppHandle<R>,
  contents_base64: &str,
  file_name: &str,
) -> Result<String, String> {
  let api = app
    .try_state::<MppApi<R>>()
    .ok_or_else(|| "MPP plugin not initialized".to_string())?;
  api.0
    .run_mobile_plugin::<MppToXmlResponse>(
      "mppToXml",
      MppToXmlRequest {
        contents_base64,
        file_name,
      },
    )
    .map(|r| r.xml)
    .map_err(|e| format!("mpp_to_xml: {e}"))
}

#[cfg(target_os = "android")]
pub fn xml_to_mpp<R: Runtime>(
  app: &AppHandle<R>,
  xml: &str,
  file_name: &str,
) -> Result<String, String> {
  let api = app
    .try_state::<MppApi<R>>()
    .ok_or_else(|| "MPP plugin not initialized".to_string())?;
  api.0
    .run_mobile_plugin::<XmlToMppResponse>(
      "xmlToMpp",
      XmlToMppRequest { xml, file_name },
    )
    .map(|r| r.contents_base64)
    .map_err(|e| format!("xml_to_mpp: {e}"))
}
