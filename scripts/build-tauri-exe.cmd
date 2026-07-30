@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 exit /b 1
set "PATH=%PATH%;%USERPROFILE%\.cargo\bin"
cd /d C:\Projects\supergannt\src-tauri
cargo build --release
