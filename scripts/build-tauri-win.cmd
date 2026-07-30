@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 exit /b 1
set "PATH=%PATH%;%USERPROFILE%\.cargo\bin"
cd /d C:\Projects\supergannt

REM Prefer local CLI so builds work after system Node was uninstalled for smoke tests.
if exist "node_modules\@tauri-apps\cli\tauri.js" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo node.exe not on PATH — cannot run tauri CLI
    exit /b 1
  )
  node "node_modules\@tauri-apps\cli\tauri.js" build --bundles nsis
) else (
  npx tauri build --bundles nsis
)
