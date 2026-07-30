# Downloads portable Node (+ Temurin JRE) into %LOCALAPPDATA%\SuperGantt\runtime
# during NSIS install so first app launch does not stall on downloads.
# Failures are non-fatal - the app can still fetch runtimes on first use.
# Keep installer messages ASCII-only: NSIS DetailPrint mangles Unicode.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$NODE_VERSION = if ($env:SUPERGANNT_NODE_VERSION) { $env:SUPERGANNT_NODE_VERSION } else { '22.17.0' }

function Write-Step([string]$msg) {
  Write-Host "[SuperGantt] $msg"
}

function Ensure-Dir([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
  }
}

function Download-File([string]$url, [string]$dest) {
  Ensure-Dir (Split-Path -Parent $dest)
  if (Test-Path -LiteralPath $dest) {
    Remove-Item -Force -LiteralPath $dest -ErrorAction SilentlyContinue
  }
  # Prefer curl.exe (Win10+) - faster and follows redirects reliably.
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    & curl.exe -fsSL --retry 3 --retry-delay 2 -o $dest $url
    if ($LASTEXITCODE -ne 0) { throw "curl failed ($LASTEXITCODE) for $url" }
    return
  }
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
}

try {
  $localApp = $env:LOCALAPPDATA
  if (-not $localApp) { throw 'LOCALAPPDATA is not set' }
  $runtime = Join-Path $localApp 'SuperGantt\runtime'
  Ensure-Dir $runtime

  # --- Node ---
  $nodeDir = Join-Path $runtime 'node'
  $nodeExe = Join-Path $nodeDir 'node.exe'
  if (Test-Path -LiteralPath $nodeExe) {
    Write-Step "Node already present: $nodeExe"
  } else {
    Write-Step "Downloading Node $NODE_VERSION..."
    Ensure-Dir $nodeDir
    $zipName = "node-v$NODE_VERSION-win-x64.zip"
    $url = "https://nodejs.org/dist/v$NODE_VERSION/$zipName"
    $tmpZip = Join-Path $env:TEMP "supergannt-$zipName"
    $extract = Join-Path $env:TEMP "supergannt-node-extract-$PID"
    Download-File $url $tmpZip
    if (Test-Path -LiteralPath $extract) {
      Remove-Item -Recurse -Force -LiteralPath $extract
    }
    Ensure-Dir $extract
    Expand-Archive -LiteralPath $tmpZip -DestinationPath $extract -Force
    $src = Join-Path $extract "node-v$NODE_VERSION-win-x64\node.exe"
    if (-not (Test-Path -LiteralPath $src)) {
      throw "node.exe missing after extract: $src"
    }
    Copy-Item -Force -LiteralPath $src -Destination $nodeExe
    Remove-Item -Force -LiteralPath $tmpZip -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force -LiteralPath $extract -ErrorAction SilentlyContinue
    Write-Step "Node ready: $nodeExe"
  }

  # --- Temurin JRE 21 (for .mpp) ---
  $javaExe = Join-Path $runtime 'jdk\bin\java.exe'
  if (Test-Path -LiteralPath $javaExe) {
    Write-Step "JRE already present: $javaExe"
  } else {
    Write-Step 'Downloading Eclipse Temurin 21 JRE...'
    $jreUrl = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk'
    $tmpZip = Join-Path $env:TEMP "supergannt-jre-$PID.zip"
    $extract = Join-Path $env:TEMP "supergannt-jre-extract-$PID"
    Download-File $jreUrl $tmpZip
    if (Test-Path -LiteralPath $extract) {
      Remove-Item -Recurse -Force -LiteralPath $extract
    }
    Ensure-Dir $extract
    Expand-Archive -LiteralPath $tmpZip -DestinationPath $extract -Force
    $nested = Get-ChildItem -LiteralPath $extract -Directory | Select-Object -First 1
    if (-not $nested) { throw 'JRE archive had no top-level folder' }
    $jdkDir = Join-Path $runtime 'jdk'
    if (Test-Path -LiteralPath $jdkDir) {
      Remove-Item -Recurse -Force -LiteralPath $jdkDir
    }
    Move-Item -LiteralPath $nested.FullName -Destination $jdkDir
    Remove-Item -Force -LiteralPath $tmpZip -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force -LiteralPath $extract -ErrorAction SilentlyContinue
    if (-not (Test-Path -LiteralPath $javaExe)) {
      throw "java.exe missing after extract: $javaExe"
    }
    Write-Step "JRE ready: $javaExe"
  }

  Write-Step 'Runtime setup complete.'
  exit 0
} catch {
  Write-Host "[SuperGantt] WARNING: runtime download failed: $_"
  Write-Host '[SuperGantt] App will retry downloads on first launch / first .mpp open.'
  exit 0
}
