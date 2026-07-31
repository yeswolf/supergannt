#Requires -Version 5.1
<#
.SYNOPSIS
  Build SuperGantt Android arm64 APK (signed), staging Kotlin/Java plugins + MPXJ.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$env:JAVA_HOME = if (Test-Path (Join-Path $env:LOCALAPPDATA 'SuperGantt\tools\jdk-21\bin\java.exe')) {
  Join-Path $env:LOCALAPPDATA 'SuperGantt\tools\jdk-21'
} elseif ($env:JAVA_HOME) { $env:JAVA_HOME } else { throw 'JAVA_HOME missing' }

$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:NDK_HOME = if ($env:NDK_HOME) { $env:NDK_HOME } else { Join-Path $env:ANDROID_HOME 'ndk\27.0.12077973' }
$prebuilt = Join-Path $env:NDK_HOME 'toolchains\llvm\prebuilt\windows-x86_64'
$clang = Join-Path $prebuilt 'bin\aarch64-linux-android24-clang.cmd'
if (-not (Test-Path $clang)) {
  $clang = Get-ChildItem (Join-Path $prebuilt 'bin') -Filter 'aarch64-linux-android*-clang.cmd' |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $clang) { throw "NDK clang not found under $prebuilt" }

$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = $clang
$env:CC_aarch64_linux_android = $clang
$env:AR_aarch64_linux_android = Join-Path $prebuilt 'bin\llvm-ar.exe'
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (-not (Test-Path (Join-Path $cargoBin 'cargo.exe'))) {
  throw "cargo.exe not found in $cargoBin - install Rust (rustup)"
}
$env:Path = "$cargoBin;$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
$env:CI = 'true'

$buildTools = Get-ChildItem (Join-Path $env:ANDROID_HOME 'build-tools') -Directory |
  Sort-Object Name -Descending | Select-Object -First 1
if (-not $buildTools) { throw "Android build-tools missing under $env:ANDROID_HOME" }
$zipalign = Join-Path $buildTools.FullName 'zipalign.exe'
$apksigner = Join-Path $buildTools.FullName 'apksigner.bat'
if (-not (Test-Path $zipalign)) { throw "zipalign not found: $zipalign" }
if (-not (Test-Path $apksigner)) { throw "apksigner not found: $apksigner" }

$toolsDir = Join-Path $env:LOCALAPPDATA 'SuperGantt\tools'
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
$ksPath = if ($env:SUPERGANNT_ANDROID_KS) { $env:SUPERGANNT_ANDROID_KS } else { Join-Path $toolsDir 'supergannt-android.keystore' }
$ksAlias = if ($env:SUPERGANNT_ANDROID_ALIAS) { $env:SUPERGANNT_ANDROID_ALIAS } else { 'supergannt' }
$ksPass = if ($env:SUPERGANNT_ANDROID_KS_PASS) { $env:SUPERGANNT_ANDROID_KS_PASS } else { 'supergannt' }

if (-not (Test-Path $ksPath)) {
  Write-Host "== creating keystore $ksPath =="
  & keytool -genkeypair -keystore $ksPath -alias $ksAlias -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $ksPass -keypass $ksPass `
    -dname 'CN=SuperGantt, OU=Mobile, O=SuperGantt, L=Local, ST=NA, C=US'
  if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }
}

function Sign-Apk {
  param(
    [Parameter(Mandatory = $true)][string]$InputApk,
    [Parameter(Mandatory = $true)][string]$OutputApk
  )
  $aligned = [System.IO.Path]::ChangeExtension($OutputApk, '.aligned.apk')
  Remove-Item $aligned, $OutputApk -ErrorAction SilentlyContinue
  & $zipalign -f -p 4 $InputApk $aligned
  if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }
  & $apksigner sign --ks $ksPath --ks-key-alias $ksAlias `
    --ks-pass "pass:$ksPass" --key-pass "pass:$ksPass" `
    --out $OutputApk $aligned
  if ($LASTEXITCODE -ne 0) { throw 'apksigner sign failed' }
  & $apksigner verify --verbose $OutputApk
  if ($LASTEXITCODE -ne 0) { throw 'apksigner verify failed' }
  Remove-Item $aligned -ErrorAction SilentlyContinue
}

function Stage-AndroidSources {
  $androidSrc = Join-Path $root 'src-tauri\android'
  $app = Join-Path $root 'src-tauri\gen\android\app'
  $javaPkg = Join-Path $app 'src\main\java\com\supergannt\planner'
  $mppPkg = Join-Path $javaPkg 'mpp'
  $assets = Join-Path $app 'src\main\assets'
  New-Item -ItemType Directory -Force -Path $javaPkg, $mppPkg, $assets | Out-Null

  Copy-Item -Force (Join-Path $androidSrc 'DownloadsPlugin.kt') (Join-Path $javaPkg 'DownloadsPlugin.kt')
  Copy-Item -Force (Join-Path $androidSrc 'MppPlugin.kt') (Join-Path $javaPkg 'MppPlugin.kt')
  Copy-Item -Force (Join-Path $androidSrc 'mpp\MppOleWriter.java') (Join-Path $mppPkg 'MppOleWriter.java')
  $awtPkg = Join-Path $app 'src\main\java\java\awt'
  New-Item -ItemType Directory -Force -Path $awtPkg | Out-Null
  Copy-Item -Force (Join-Path $androidSrc 'awt\Color.java') (Join-Path $awtPkg 'Color.java')
  Copy-Item -Force (Join-Path $androidSrc 'AndroidManifest.xml') (Join-Path $app 'src\main\AndroidManifest.xml')
  Copy-Item -Force (Join-Path $androidSrc 'proguard-rules.pro') (Join-Path $app 'proguard-rules.pro')

  $blank = Join-Path $root 'src-tauri\resources\mpp\blank.mpp'
  if (-not (Test-Path $blank)) { $blank = Join-Path $root 'server\java\templates\blank.mpp' }
  if (-not (Test-Path $blank)) { throw 'blank.mpp template missing' }
  Copy-Item -Force $blank (Join-Path $assets 'blank.mpp')

  $gradleApp = Join-Path $app 'build.gradle.kts'
  $gradleText = Get-Content $gradleApp -Raw

  if ($gradleText -notmatch 'net\.sf\.mpxj:mpxj') {
    $deps = @'
    implementation("net.sf.mpxj:mpxj:16.5.0")
    implementation("com.fasterxml:aalto-xml:1.3.3")
'@
    $gradleText = $gradleText -replace '(dependencies\s*\{)', "`$1`r`n$deps"
  }

  # Drop failed androidawt coordinate if a previous build injected it
  $gradleText = $gradleText -replace '(?m)^\s*implementation\("ro\.andob\.androidawt:androidawt:[^"]+"\)\r?\n', ''

  if ($gradleText -match 'minSdk = 24') {
    $gradleText = $gradleText -replace 'minSdk = 24', 'minSdk = 26'
  }
  if ($gradleText -notmatch 'JavaVersion\.VERSION_17') {
    $gradleText = $gradleText -replace 'jvmTarget = "1\.8"', 'jvmTarget = "17"'
    if ($gradleText -notmatch 'compileOptions') {
      $gradleText = $gradleText -replace '(kotlinOptions\s*\{[^}]*\})', @"
`$1
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
"@
    }
  }
  if ($gradleText -notmatch 'multiDexEnabled') {
    $gradleText = $gradleText -replace '(versionName = [^\n]+)', "`$1`r`n        multiDexEnabled = true"
  }
  if ($gradleText -notmatch 'multidex:multidex') {
    $gradleText = $gradleText -replace '(dependencies\s*\{)', "`$1`r`n    implementation(`"androidx.multidex:multidex:2.0.1`")"
  }

  if ($gradleText -notmatch 'META-INF/LICENSE\.md') {
    $packaging = @'

    packaging {
        resources {
            excludes += setOf(
                "META-INF/LICENSE.md",
                "META-INF/LICENSE.txt",
                "META-INF/LICENSE",
                "META-INF/NOTICE.md",
                "META-INF/NOTICE.txt",
                "META-INF/NOTICE",
                "META-INF/DEPENDENCIES",
                "META-INF/*.kotlin_module",
            )
        }
    }
'@
    $gradleText = $gradleText -replace '(buildFeatures\s*\{[^}]*\}\r?\n)', "`$1$packaging`r`n"
  }

  if ($gradleText -notmatch 'startsWith\("rustBuild"\)') {
    $gradleText = $gradleText.TrimEnd() + @"

// Prebuilt lib already copied into jniLibs (see scripts/build-android-apk.ps1).
tasks.configureEach {
    if (name.startsWith("rustBuild")) {
        enabled = false
    }
}
"@
  }

  Set-Content -Path $gradleApp -Value $gradleText -NoNewline
  Write-Host '== staged Android plugins, manifest, MPXJ deps, blank.mpp =='
}

Set-Location $root
Write-Host '== web build =='
cmd /c "npm run build"
if ($LASTEXITCODE -ne 0) { throw 'web build failed' }

Write-Host '== rust aarch64-linux-android =='
Set-Location (Join-Path $root 'src-tauri')
cmd /c "cargo build --package supergannt --target aarch64-linux-android --features tauri/custom-protocol --lib --release"
if ($LASTEXITCODE -ne 0) { throw 'cargo failed' }

$so = Join-Path $root 'src-tauri\target\aarch64-linux-android\release\libsupergannt_lib.so'
$jni = Join-Path $root 'src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a'
New-Item -ItemType Directory -Force -Path $jni | Out-Null
Copy-Item -Force $so (Join-Path $jni 'libsupergannt_lib.so')
Write-Host "== copied native lib ($((Get-Item $so).Length) bytes) =="

Stage-AndroidSources

Write-Host '== gradle assembleRelease =='
Set-Location (Join-Path $root 'src-tauri\gen\android')
cmd /c "gradlew.bat :app:assembleRelease --no-daemon"
if ($LASTEXITCODE -ne 0) { throw 'gradle failed' }

$outDir = Join-Path $root 'release-android'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$apks = Get-ChildItem -Recurse -Filter '*.apk' (Join-Path $root 'src-tauri\gen\android\app\build\outputs\apk')
$apks | ForEach-Object { Write-Host "APK: $($_.FullName) ($([math]::Round($_.Length / 1MB, 1)) MB)" }
$best = $apks | Where-Object { $_.FullName -match 'arm64' } | Sort-Object Length -Descending | Select-Object -First 1
if (-not $best) { $best = $apks | Where-Object { $_.FullName -match 'universal' } | Select-Object -First 1 }
if (-not $best) { $best = $apks | Select-Object -First 1 }
if (-not $best) { throw 'no APK produced' }

$dest = Join-Path $outDir 'SuperGantt_1.0.2_arm64-v8a.apk'
Write-Host '== sign APK =='
Sign-Apk -InputApk $best.FullName -OutputApk $dest
Write-Host "DONE → $dest ($([math]::Round((Get-Item $dest).Length / 1MB, 1)) MB, signed)"
