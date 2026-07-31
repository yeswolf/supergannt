//! Offline MPP ↔ MSPDI conversion via the bundled Java converter (desktop)
//! and a native Android bridge (mobile — Kotlin/MPXJ, wired after `android init`).

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use tauri::AppHandle

fn b64_decode(s: &str) -> Result<Vec<u8>, String> {
  base64::engine::general_purpose::STANDARD
    .decode(s.as_bytes())
    .map_err(|e| format!("invalid payload: {e}"))
}

fn b64_encode(bytes: &[u8]) -> String {
  base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn work_dir() -> Result<PathBuf, String> {
  let stamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0);
  let dir = std::env::temp_dir().join(format!("supergannt-mpp-{stamp}"));
  fs::create_dir_all(&dir).map_err(|e| format!("temp dir: {e}"))?;
  Ok(dir)
}

fn cleanup(dir: &Path) {
  let _ = fs::remove_dir_all(dir);
}

#[cfg(desktop)]
fn resolve_jar(app: &AppHandle) -> Result<PathBuf, String> {
  let resources = crate::api::resources_root(app)?;
  let jar = resources.join("mpp").join("mpp-convert.jar");
  if jar.is_file() {
    return Ok(jar);
  }
  // Dev checkout fallback
  let crate_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let dev = crate_dir
    .join("..")
    .join("server")
    .join("java")
    .join("target")
    .join("mpp-convert.jar");
  if dev.is_file() {
    return Ok(dev);
  }
  Err(
    "mpp-convert.jar missing. Run `npm run mpp:setup` or `npm run tauri:stage`.".into(),
  )
}

#[cfg(desktop)]
fn resolve_java() -> Result<PathBuf, String> {
  if let Ok(home) = std::env::var("JAVA_HOME") {
    let candidate = PathBuf::from(home).join("bin").join(if cfg!(windows) {
      "java.exe"
    } else {
      "java"
    });
    if candidate.is_file() {
      return Ok(candidate);
    }
  }
  // Packaged runtime JRE (same folder layout as the Node sidecar).
  if let Some(base) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
    let runtime = base.join("SuperGantt").join("runtime").join("jre").join("bin").join(
      if cfg!(windows) {
        "java.exe"
      } else {
        "java"
      },
    );
    if runtime.is_file() {
      return Ok(runtime);
    }
  }
  Ok(PathBuf::from(if cfg!(windows) { "java.exe" } else { "java" }))
}

#[cfg(desktop)]
fn run_jar(java: &Path, jar: &Path, args: &[&str]) -> Result<(), String> {
  let mut cmd = Command::new(java);
  cmd.arg("-jar").arg(jar).args(args);
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
  }
  let out = cmd
    .output()
    .map_err(|e| format!("spawn java: {e}"))?;
  if out.status.success() {
    return Ok(());
  }
  let stderr = String::from_utf8_lossy(&out.stderr);
  let stdout = String::from_utf8_lossy(&out.stdout);
  Err(format!(
    "mpp-convert failed ({}): {}",
    out.status,
    if !stderr.trim().is_empty() {
      stderr.trim().to_string()
    } else {
      stdout.trim().to_string()
    }
  ))
}

/// .mpp bytes (base64) → MSPDI XML string.
#[tauri::command]
pub fn mpp_to_xml(
  app: AppHandle,
  contents_base64: String,
  file_name: String,
) -> Result<String, String> {
  #[cfg(mobile)]
  {
    let _ = (app, contents_base64, file_name);
    return Err(
      "Android MPXJ bridge not linked yet. After SDK setup run `npm run android:init` and rebuild."
        .into(),
    );
  }

  #[cfg(desktop)]
  {
    let bytes = b64_decode(&contents_base64)?;
    let jar = resolve_jar(&app)?;
    let java = resolve_java()?;
    let dir = work_dir()?;
    let safe = Path::new(&file_name)
      .file_name()
      .and_then(|s| s.to_str())
      .unwrap_or("project.mpp");
    let input = dir.join(if safe.to_ascii_lowercase().ends_with(".mpp")
      || safe.to_ascii_lowercase().ends_with(".mpt")
    {
      safe.to_string()
    } else {
      format!("{safe}.mpp")
    });
    let output = dir.join("out.xml");
    fs::write(&input, &bytes).map_err(|e| format!("write input: {e}"))?;
    let result = run_jar(
      &java,
      &jar,
      &[
        "to-xml",
        input.to_str().ok_or("bad input path")?,
        output.to_str().ok_or("bad output path")?,
      ],
    );
    let xml = match result {
      Ok(()) => fs::read_to_string(&output).map_err(|e| format!("read xml: {e}")),
      Err(e) => Err(e),
    };
    cleanup(&dir);
    xml
  }
}

/// MSPDI XML → .mpp bytes (base64).
#[tauri::command]
pub fn xml_to_mpp(
  app: AppHandle,
  xml: String,
  file_name: String,
) -> Result<String, String> {
  #[cfg(mobile)]
  {
    let _ = (app, xml, file_name);
    return Err(
      "Binary .mpp write on Android lands after the MPXJ read bridge. Save as MSPDI XML for now."
        .into(),
    );
  }

  #[cfg(desktop)]
  {
    let jar = resolve_jar(&app)?;
    let java = resolve_java()?;
    let dir = work_dir()?;
    let input = dir.join("in.xml");
    let output = dir.join("out.mpp");
    {
      let mut f = fs::File::create(&input).map_err(|e| format!("create xml: {e}"))?;
      f.write_all(xml.as_bytes())
        .map_err(|e| format!("write xml: {e}"))?;
    }
    // Prefer packaged blank.mpp template when present.
    if let Ok(resources) = crate::api::resources_root(&app) {
      let template = resources.join("mpp").join("blank.mpp");
      if template.is_file() {
        std::env::set_var("SUPERGANNT_MPP_TEMPLATE", &template);
      }
    }
    let _ = file_name;
    let result = run_jar(
      &java,
      &jar,
      &[
        "to-mpp",
        input.to_str().ok_or("bad input path")?,
        output.to_str().ok_or("bad output path")?,
      ],
    );
    let encoded = match result {
      Ok(()) => {
        let bytes = fs::read(&output).map_err(|e| format!("read mpp: {e}"))?;
        Ok(b64_encode(&bytes))
      }
      Err(e) => Err(e),
    };
    cleanup(&dir);
    encoded
  }
}
