use std::fs;
use std::io::Read;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const NODE_VERSION: &str = "22.17.0";

pub fn resources_root(app: &AppHandle) -> Result<PathBuf, String> {
  if cfg!(debug_assertions) {
    let crate_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let staged = crate_dir.join("resources");
    if staged.join("server").join("index.mjs").is_file() {
      return Ok(staged);
    }
    let desktop = crate_dir.join("..").join("build-desktop");
    if desktop.join("server").join("index.mjs").is_file() {
      return Ok(desktop);
    }
    return Err(
      "Dev resources missing. Run `node scripts/pack-tauri.mjs --stage` first.".into(),
    );
  }

  // Prefer the directory next to the exe (where tauri copies mapped resources).
  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      if dir.join("server").join("index.mjs").is_file() {
        return Ok(dir.to_path_buf());
      }
    }
  }

  app
    .path()
    .resource_dir()
    .map_err(|e| format!("resource dir: {e}"))
}

fn port_has_http(port: u16) -> bool {
  ureq::get(&format!("http://127.0.0.1:{port}/api/health"))
    .timeout(Duration::from_millis(400))
    .call()
    .is_ok()
    || ureq::get(&format!("http://127.0.0.1:{port}/"))
      .timeout(Duration::from_millis(400))
      .call()
      .is_ok()
}

fn pick_port(preferred: u16) -> Result<u16, String> {
  for port in preferred..preferred.saturating_add(30) {
    // Skip ports that already answer HTTP (e.g. `npm run server` API-without-UI).
    if port_has_http(port) {
      continue;
    }
    if TcpListener::bind(("127.0.0.1", port)).is_ok() {
      return Ok(port);
    }
  }
  Err(format!(
    "no free port found in {preferred}–{}",
    preferred + 29
  ))
}

fn probe_ready(port: u16) -> bool {
  let base = format!("http://127.0.0.1:{port}");
  let health_ok = ureq::get(&format!("{base}/api/health"))
    .timeout(Duration::from_secs(2))
    .call()
    .map(|r| r.status() == 200)
    .unwrap_or(false);
  if !health_ok {
    return false;
  }
  ureq::get(&format!("{base}/"))
    .timeout(Duration::from_secs(2))
    .call()
    .map(|r| {
      r.status() == 200
        && r
          .header("content-type")
          .map(|ct| ct.contains("text/html"))
          .unwrap_or(false)
    })
    .unwrap_or(false)
}

fn read_child_stderr(child: &mut Child) -> String {
  let mut buf = String::new();
  if let Some(mut err) = child.stderr.take() {
    let _ = err.read_to_string(&mut buf);
  }
  buf.trim().to_string()
}

fn dirs_runtime() -> Result<PathBuf, String> {
  let base = std::env::var_os("LOCALAPPDATA")
    .map(PathBuf::from)
    .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
    .unwrap_or_else(|| PathBuf::from("."));
  let dir = base.join("SuperGantt").join("runtime");
  fs::create_dir_all(&dir).map_err(|e| format!("runtime dir: {e}"))?;
  Ok(dir)
}

fn download_file(url: &str, dest: &Path) -> Result<(), String> {
  let response = ureq::get(url)
    .timeout(Duration::from_secs(300))
    .call()
    .map_err(|e| format!("download {url}: {e}"))?;
  let mut reader = response.into_reader();
  let mut file = fs::File::create(dest).map_err(|e| format!("create {}: {e}", dest.display()))?;
  std::io::copy(&mut reader, &mut file).map_err(|e| format!("write {}: {e}", dest.display()))?;
  Ok(())
}

/// Resolve Node for the API sidecar. Order:
/// 1) bundled next to resources (dev / fat pack)
/// 2) previously downloaded portable runtime
/// 3) download official Node win-x64 binary into LOCALAPPDATA
fn ensure_node(resources: &Path) -> Result<PathBuf, String> {
  let bundled = if cfg!(windows) {
    resources.join("node").join("node.exe")
  } else {
    resources.join("node").join("node")
  };
  if bundled.is_file() {
    return Ok(bundled);
  }

  let runtime = dirs_runtime()?;
  let node_dir = runtime.join("node");
  let node_exe = node_dir.join(if cfg!(windows) { "node.exe" } else { "node" });
  if node_exe.is_file() {
    return Ok(node_exe);
  }

  #[cfg(not(windows))]
  {
    return Err(
      "Portable Node is not bundled; install Node 20+ or use a Windows slim build.".into(),
    );
  }

  #[cfg(windows)]
  {
    fs::create_dir_all(&node_dir).map_err(|e| format!("node runtime dir: {e}"))?;
    let zip_name = format!("node-v{NODE_VERSION}-win-x64.zip");
    let url = format!("https://nodejs.org/dist/v{NODE_VERSION}/{zip_name}");
    let tmp_zip = std::env::temp_dir().join(format!("supergannt-{zip_name}"));

    // Reuse a complete zip from a previous interrupted launch when possible.
    let zip_ok = tmp_zip
      .metadata()
      .map(|m| m.len() > 10_000_000)
      .unwrap_or(false);
    if !zip_ok {
      let _ = fs::remove_file(&tmp_zip);
      download_file(&url, &tmp_zip)?;
    }

    // Extract only node.exe in-process. Do NOT shell out to PowerShell
    // Expand-Archive — that deadlocks when called from Tauri's UI/setup thread.
    extract_node_exe_from_zip(&tmp_zip, &node_exe)?;
    let _ = fs::remove_file(&tmp_zip);
    Ok(node_exe)
  }
}

#[cfg(windows)]
fn extract_node_exe_from_zip(zip_path: &Path, dest_exe: &Path) -> Result<(), String> {
  let file = fs::File::open(zip_path).map_err(|e| format!("open {}: {e}", zip_path.display()))?;
  let mut archive =
    zip::ZipArchive::new(file).map_err(|e| format!("read zip {}: {e}", zip_path.display()))?;

  let inner = format!("node-v{NODE_VERSION}-win-x64/node.exe");
  let mut entry = archive
    .by_name(&inner)
    .map_err(|e| format!("zip missing {inner}: {e}"))?;

  if let Some(parent) = dest_exe.parent() {
    fs::create_dir_all(parent).map_err(|e| format!("node dir: {e}"))?;
  }
  let staging = dest_exe.with_extension("exe.partial");
  let _ = fs::remove_file(&staging);
  {
    let mut out =
      fs::File::create(&staging).map_err(|e| format!("create {}: {e}", staging.display()))?;
    std::io::copy(&mut entry, &mut out).map_err(|e| format!("extract node.exe: {e}"))?;
  }
  let _ = fs::remove_file(dest_exe);
  fs::rename(&staging, dest_exe).map_err(|e| format!("finalize node.exe: {e}"))?;
  Ok(())
}

pub fn boot_api(resources: &Path) -> Result<(u16, Child), String> {
  let server = resources.join("server").join("index.mjs");
  let ui = resources.join("ui");
  let jar = resources.join("mpp").join("mpp-convert.jar");
  let template = resources.join("mpp").join("blank.mpp");

  if !server.is_file() {
    return Err(format!("missing API bundle: {}", server.display()));
  }
  if !ui.join("index.html").is_file() {
    return Err(format!("missing UI at {}", ui.display()));
  }

  let port = pick_port(8787)?;
  let node = ensure_node(resources)?;
  let runtime_dir = dirs_runtime()?;

  // Avoid inheriting odd desktop env vars that can confuse Node.
  let mut cmd = Command::new(&node);
  cmd.arg(&server)
    .current_dir(resources)
    .env_clear()
    .env("PATH", std::env::var_os("PATH").unwrap_or_default())
    .env("SYSTEMROOT", std::env::var_os("SYSTEMROOT").unwrap_or_default())
    .env("WINDIR", std::env::var_os("WINDIR").unwrap_or_default())
    .env("TEMP", std::env::var_os("TEMP").unwrap_or_default())
    .env("TMP", std::env::var_os("TMP").unwrap_or_default())
    .env(
      "LOCALAPPDATA",
      std::env::var_os("LOCALAPPDATA").unwrap_or_default(),
    )
    .env(
      "USERPROFILE",
      std::env::var_os("USERPROFILE").unwrap_or_default(),
    )
    .env("NODE_ENV", "production")
    .env("PORT", port.to_string())
    .env("SUPERGANNT_STATIC_ROOT", ui.as_os_str())
    .env("SUPERGANNT_RUNTIME_DIR", runtime_dir.as_os_str())
    // Packaged desktop: use only runtime JRE (download on first .mpp), ignore system JDKs.
    .env("SUPERGANNT_IGNORE_SYSTEM_JAVA", "1")
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::piped());

  if jar.is_file() {
    cmd.env("SUPERGANNT_JAR", jar.as_os_str());
  }
  if template.is_file() {
    cmd.env("SUPERGANNT_MPP_TEMPLATE", template.as_os_str());
  }

  #[cfg(windows)]
  {
    cmd.creation_flags(CREATE_NO_WINDOW);
  }

  let mut child = cmd
    .spawn()
    .map_err(|e| format!("failed to spawn API with {}: {e}", node.display()))?;

  let started = Instant::now();
  let timeout = Duration::from_secs(45);
  loop {
    if let Ok(Some(status)) = child.try_wait() {
      let err = read_child_stderr(&mut child);
      return Err(format!(
        "SuperGantt API exited before ready ({status}). resources={} node={} server={}{}",
        resources.display(),
        node.display(),
        server.display(),
        if err.is_empty() {
          String::new()
        } else {
          format!("\n{err}")
        }
      ));
    }
    if probe_ready(port) {
      break;
    }
    if started.elapsed() > timeout {
      let _ = child.kill();
      let err = read_child_stderr(&mut child);
      let _ = child.wait();
      return Err(format!(
        "SuperGantt API did not become ready in time (port {port}).{}",
        if err.is_empty() {
          String::new()
        } else {
          format!("\n{err}")
        }
      ));
    }
    std::thread::sleep(Duration::from_millis(250));
  }

  Ok((port, child))
}
