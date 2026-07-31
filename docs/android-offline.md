# Android offline (Tauri 2)

SuperGantt on Android is a **fully offline** WebView app: the Vite UI is bundled in the APK (no Node sidecar). Scheduling, MSPDI XML, MPX, PDF, and binary `.mpp` open/save run on-device (MPXJ + OLE template writer).

Shipped from **v1.0.2** — download `SuperGantt_*_arm64-v8a.apk` from [GitHub Releases](https://github.com/yeswolf/supergannt/releases/latest).

## Status

| Capability | Offline on Android |
|------------|--------------------|
| UI / Gantt / sheets / themes | Yes (bundled `dist`) |
| Open / save **MSPDI `.xml`** | Yes → public **Downloads** |
| Save **`.mpx`**, export **PDF** | Yes → public **Downloads** |
| Open **`.mpp` / `.mpt`** | Yes (MPXJ) |
| Save **`.mpp`** (identity + dirty OLE) | Yes (carrier / `blank.mpp` writer) |

Saved files appear in the phone’s shared **Downloads** folder
(`/storage/emulated/0/Download/…`), visible in Files → Downloads.

## Permissions

`src-tauri/android/AndroidManifest.xml` (copied on each APK build):

- `INTERNET`
- `WRITE_EXTERNAL_STORAGE` (maxSdk 28)
- `READ_EXTERNAL_STORAGE` (maxSdk 32)
- `requestLegacyExternalStorage` for API 29

Public Downloads on API 29+ use MediaStore (no extra runtime grant).

## Prerequisites (Windows)

1. **JDK 17 or 21** — set `JAVA_HOME`
2. **Android SDK + NDK r27** — set `ANDROID_HOME` and `NDK_HOME`
3. **Rust Android targets**:
   ```powershell
   rustup target add aarch64-linux-android
   ```
4. Optional: Android Studio (emulator / device)

Or run:

```powershell
.\scripts\setup-android.ps1
```

## Build APK

```powershell
npm run android:build          # web + rust + arm64 APK
npm run android:build:fast     # Kotlin/Java-only iteration (skip web/rust)
# → release-android\SuperGantt_1.0.2_arm64-v8a.apk (signed)
```

The build script stages:

- `DownloadsPlugin.kt` — MediaStore public Downloads
- `MppPlugin.kt` + `MppOleWriter.java` — MPXJ open/save
- AWT stubs + patched `UnmarshalHelper` + Xerces (Android JAXP gaps)
- `assets/blank.mpp` — dirty MPP writer template
- Gradle: arm64-only assemble, daemon, parallel/cache

## Architecture

- **Desktop:** splash → Node API sidecar + Java `mpp-convert.jar`
- **Android:** `tauri.android.conf.json` serves `../dist`; converters prefer Tauri invoke → Kotlin plugins

Android package id: `com.supergannt.planner`.
