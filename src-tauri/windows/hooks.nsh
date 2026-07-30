; Tauri NSIS installer hooks - prefetch portable Node + JRE into
; %LOCALAPPDATA%\SuperGantt\runtime so first launch is fast.
; Script lives next to the app as ensure-runtime.ps1 (staged resource).
; Keep DetailPrint strings ASCII-only (NSIS mangles Unicode ellipsis etc).

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Preparing SuperGantt runtimes (Node + Java)..."
  IfFileExists "$INSTDIR\ensure-runtime.ps1" 0 skip_runtime
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\ensure-runtime.ps1"'
    Pop $0
    DetailPrint "Runtime setup exit code: $0"
    Goto runtime_done
  skip_runtime:
    DetailPrint "ensure-runtime.ps1 missing - runtimes will download on first use"
  runtime_done:
!macroend
