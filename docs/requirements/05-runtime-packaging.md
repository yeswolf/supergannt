# 05 — Runtime, Docker, and desktop packaging

## 1. Run modes (MUST)

| Mode | Command / entry | Expectation |
|------|-----------------|-------------|
| Web dev | `npm run dev` | Vite UI + API; open `http://localhost:5173` |
| Production server | `npm start` / preview scripts | Serves built UI + API |
| Docker | `npm run docker:up` / compose | App reachable (historically port **8080**) |
| Packaged desktop | `npm run tauri:pack` | Tauri NSIS installer under `release-tauri/` |
| Android offline | `npm run android:build` | Signed arm64 APK under `release-android/`; see [android-offline.md](../android-offline.md) |

## 2. Desktop / Tauri (MUST)

### 2.1 Packaging

- `tauri:pack` (alias `desktop:pack`) stages UI + API + jar, builds Tauri NSIS (WebView2).
- Artifact: `release-tauri/SuperGantt_*_x64-setup.exe`.
- Slim pack downloads portable Node (and JRE for `.mpp`) during install / first use into `%LOCALAPPDATA%\SuperGantt\runtime`.
- Windows target: NSIS, current-user install when configured in `src-tauri/tauri.conf.json`.

### 2.1a Android offline

- No Node sidecar: APK embeds Vite `dist` via `tauri.android.conf.json`.
- MSPDI/MPX/PDF and binary `.mpp` open/save run on-device (Kotlin plugins + MPXJ + OLE writer).
- Artifact: `release-android/SuperGantt_*_arm64-v8a.apk` (signed).
- Commands: `npm run android:setup`, `android:init`, `android:build` / `android:build:fast`. Details: [android-offline.md](../android-offline.md).

### 2.2 Icons in the package

- `src-tauri/icons/*` and `build/icon.ico` / `build/icon.png` as needed by the pack scripts.
- Invalid ICO sizes that break packaging MUST be fixed before claiming pack success.

### 2.3 Window / save

- Main window title SuperGantt, sensible min size, branded background.
- Save/export MUST use a native dialog (`showSaveFilePicker` and/or Tauri `save_file`) — not a silent `<a download>` no-op in WebView2.

## 3. Port / “404 after install” (MUST)

Historical defect (pre-Tauri desktop): installed exe showed **404** because it attached to a port that had API health but **no UI**, or conflicted with a leftover dev server on **8787**.

### 3.1 Required boot logic (Tauri sidecar)

1. Prefer port `8787` (or configured preferred port).
2. Treat a port as **ready** only if `/api/health` succeeds **and** `/` returns HTML UI.
3. If preferred port is free → spawn packaged Node API with `SUPERGANNT_STATIC_ROOT` pointing at staged UI.
4. If preferred port is “wrong” (API without UI) or busy → scan subsequent ports for a free bind.
5. Wait until ready with short probe timeouts; on failure → error dialog / quit — never leave a blank 404 window as the happy path.

## 4. Java runtime for MPP (MUST)

- Packaged and server paths MUST locate JDK/JRE 17+ or install Temurin into the app runtime directory automatically.
- Packaged desktop may set `SUPERGANNT_IGNORE_SYSTEM_JAVA=1` so only the runtime JRE is used.
- First MPP open may download JRE; UX should tolerate this (loader already covers open).

## 5. Docker (MUST)

- `docker compose` build/up works for users who want an all-in-one containerized deployment.
- Document port and Java/jar presence in README / compose files.

## 6. Process requirements for agents/developers

When asked to “собери exe / инсталлер”:

1. Run tests.
2. Ensure production build succeeds.
3. Run `npm run tauri:pack`.
4. Report path + approximate size of the installer.
5. If pack fails (ICO, signing, EPERM), fix root cause and re-run — do not hand the user a broken artifact.
