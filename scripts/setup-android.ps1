#Requires -Version 5.1
<#
.SYNOPSIS
  Guides Android SDK / NDK / JDK setup for SuperGantt Tauri offline APK builds.
#>
$ErrorActionPreference = 'Stop'

Write-Host @"

SuperGantt — Android offline setup
==================================
This script checks the toolchain and prints missing pieces.
It does not silently download multi-GB SDKs unless you pass -InstallSdk.

"@

$ok = $true

function Test-Cmd($name) {
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { Write-Host "  OK  $name → $($c.Source)"; return $true }
  Write-Host "  MISSING  $name"; return $false
}

Write-Host "Tools:"
if (-not (Test-Cmd rustc)) { $ok = $false }
if (-not (Test-Cmd rustup)) { $ok = $false }
if (-not (Test-Cmd java)) { $ok = $false }
if (-not (Test-Cmd npm)) { $ok = $false }

Write-Host "`nEnv:"
foreach ($v in @('JAVA_HOME', 'ANDROID_HOME', 'NDK_HOME', 'ANDROID_NDK_HOME')) {
  $val = [Environment]::GetEnvironmentVariable($v, 'Process')
  if (-not $val) { $val = [Environment]::GetEnvironmentVariable($v, 'User') }
  if ($val) { Write-Host "  OK  $v=$val" }
  else { Write-Host "  MISSING  $v"; $ok = $false }
}

Write-Host "`nRust Android targets:"
$installed = rustup target list --installed 2>$null
foreach ($t in @(
  'aarch64-linux-android',
  'armv7-linux-androideabi',
  'i686-linux-android',
  'x86_64-linux-android'
)) {
  if ($installed -contains $t) { Write-Host "  OK  $t" }
  else {
    Write-Host "  MISSING  $t — run: rustup target add $t"
    $ok = $false
  }
}

Write-Host "`nNext:"
Write-Host "  1) Install Android Studio → SDK Platform 34 + NDK 27 + build-tools"
Write-Host "  2) Set ANDROID_HOME / NDK_HOME (see docs/android-offline.md)"
Write-Host "  3) npm run android:init"
Write-Host "  4) npm run android:build"
Write-Host ""

if ($ok) {
  Write-Host "Toolchain looks ready."
  exit 0
}
Write-Host "Toolchain incomplete — fix MISSING items above."
exit 1
