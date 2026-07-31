# Android offline (Tauri 2)

SuperGantt on Android is a **fully offline** WebView app: the Vite UI is bundled in the APK (no Node sidecar). Scheduling, MSPDI XML, MPX, and PDF export run in the WebView. Binary `.mpp` open/save uses a native bridge (Java/Kotlin MPXJ) — scaffolded, linked after SDK setup.

Branch: `wip/android-offline`.

## Status

| Capability | Offline on Android |
|------------|--------------------|
| UI / Gantt / sheets / themes | Yes (bundled `dist`) |
| Open / save **MSPDI `.xml`** | Yes |
| Save **`.mpx`**, export **PDF** | Yes |
| Open **`.mpp`** | Bridge stub → MPXJ (next after SDK) |
| Write dirty **`.mpp`** | Later (OLE template writer is desktop JAR today) |

## Prerequisites (Windows)

1. **JDK 17 or 21** (not only 11) — set `JAVA_HOME`
2. **Android SDK + NDK r27** — set `ANDROID_HOME` and `NDK_HOME`
3. **Rust Android targets**:
   ```powershell
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```
4. Optional: Android Studio (emulator / device)

Quick env (user profile):

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\27.3.13750724"   # match installed NDK
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.*"  # adjust
```

Or run:

```powershell
.\scripts\setup-android.ps1
```

## Build

```powershell
npm install
npm run build
npm run android:init          # once — generates src-tauri/gen/android
npm run android:build         # APK under src-tauri/gen/android/.../apk
```

Dev on a device/emulator:

```powershell
npm run android:dev
```

## Architecture

- **Desktop (Windows):** splash → Node API sidecar (existing) + optional Tauri `mpp_to_xml` / `xml_to_mpp` via `mpp-convert.jar`
- **Android:** `tauri.android.conf.json` serves `../dist` directly; no Node; converters prefer Tauri invoke, then HTTP (unused offline)
- **Kotlin stub:** `src-tauri/android-mpp/MppBridge.kt` — wire MPXJ after `android init` (AWT `Color` stubs may be required; see [poi-on-android](https://github.com/centic9/poi-on-android) patterns)

## Identifier

Android package id: `com.supergannt.planner` (avoids the `.app` suffix warning on the desktop id).
