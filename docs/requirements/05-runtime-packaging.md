# 05 — Runtime, Docker, and desktop packaging

## 1. Run modes (MUST)

| Mode | Command / entry | Expectation |
|------|-----------------|-------------|
| Web dev | `npm run dev` | Vite UI + API; open `http://localhost:5173` |
| Desktop dev | `npm run desktop:dev` | Electron loads Vite URL + API |
| Production server | `npm start` / preview scripts | Serves built UI + API |
| Docker | `npm run docker:up` / compose | App reachable (historically port **8080**) |
| Packaged desktop | `npm run desktop:pack` | NSIS installer under `release/` |

## 2. Desktop / Electron (MUST)

### 2.1 Packaging

- `desktop:pack` builds UI, bundles API server, stages resources (UI, jar, blank.mpp, node deps), runs electron-builder.
- Artifact: `release/SuperGantt-Setup-{version}.exe` (plus unpacked dir when requested).
- Windows target: NSIS, x64, non-one-click, allow choose install directory, desktop shortcut named SuperGantt.
- Build may stage to a temp output directory first to avoid Windows AV/OneDrive `EPERM` on `release/` renames, then copy into `release/`.

### 2.2 Icons in the package

- `build/icon.ico` (alpha PNG-in-ICO), `build/icon.png`, installer/uninstaller header icons configured in `package.json` `build.nsis`.
- Invalid ICO sizes that break `makensis` (“invalid icon file size”) MUST be fixed before claiming pack success — use standard multi-size set (16…256) with valid alpha ICO writer (`scripts/make-ico.mjs`).

### 2.3 Window

- BrowserWindow title SuperGantt, sensible min size, branded background color, `icon` pointing at packaged `electron/icon.png`.

## 3. Port / “404 after install” (MUST)

Historical defect: installed exe showed **404** because it attached to a port that had API health but **no UI**, or conflicted with a leftover dev server on **8787**.

### 3.1 Required boot logic

1. Prefer port `8787` (or `SUPERGANNT_PORT`).
2. `probePort` MUST treat a port as **ready** only if:
   - `/api/health` succeeds, **and**
   - `/` returns HTML UI (`content-type` includes `text/html`).
3. If preferred port is free → spawn packaged API with `SUPERGANNT_STATIC_ROOT` pointing at staged UI.
4. If preferred port is “wrong” (API without UI) or busy → scan subsequent ports (e.g. 8788–8816) for a free bind.
5. `waitForApi` until ready; probe fetches MUST time out (e.g. 2s) so a hung listener cannot block forever.
6. On failure → **error dialog** with clear message, quit — never leave a blank 404 BrowserWindow as the happy path.
7. Packaged server MUST serve static UI from `SUPERGANNT_STATIC_ROOT`; refuse silently “succeeding” without UI.

## 4. Java runtime for MPP (MUST)

- Packaged and server paths MUST locate JDK/JRE 17+ or install Temurin into the app runtime directory automatically.
- First MPP open may download JRE; UX should tolerate this (loader already covers open).

## 5. Docker (MUST)

- `docker compose` build/up works for users who want an all-in-one containerized deployment.
- Document port and Java/jar presence in README / compose files.

## 6. Process requirements for agents/developers

When asked to “собери exe / инсталлер”:

1. Run tests.
2. Ensure production build succeeds.
3. Run `desktop:pack`.
4. Report path + approximate size of the installer.
5. If pack fails (ICO, signing, EPERM), fix root cause and re-run — do not hand the user a broken artifact.
