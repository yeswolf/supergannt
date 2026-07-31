#Requires -Version 5.1
<#
.SYNOPSIS
  Build SuperGantt Android arm64 APK (signed), staging Kotlin/Java plugins + MPXJ.

.PARAMETER SkipWeb
  Skip Vite/tsc when dist/ is already fresh.

.PARAMETER SkipRust
  Skip cargo when jniLibs .so already exists (Kotlin/Java-only iteration).

.PARAMETER Clean
  Clean Gradle app build outputs before assemble.
#>
param(
  [switch]$SkipWeb,
  [switch]$SkipRust,
  [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sw = [System.Diagnostics.Stopwatch]::StartNew()

function Write-Step([string]$msg) {
  Write-Host ("== {0}  [{1:n1}s] ==" -f $msg, $sw.Elapsed.TotalSeconds)
}

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
# Keep CI unset so Gradle daemon stays warm between runs.
Remove-Item Env:CI -ErrorAction SilentlyContinue

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
  Write-Step "creating keystore $ksPath"
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
  $mpxjCommon = Join-Path $app 'src\main\java\org\mpxj\common'
  New-Item -ItemType Directory -Force -Path $mpxjCommon | Out-Null
  Copy-Item -Force (Join-Path $androidSrc 'mpxj\UnmarshalHelper.java') (Join-Path $mpxjCommon 'UnmarshalHelper.java')

  # MPXJ jar without UnmarshalHelper — app ships an Android/Xerces-compatible copy.
  $libsDir = Join-Path $app 'libs'
  New-Item -ItemType Directory -Force -Path $libsDir | Out-Null
  $mpxjSrc = Get-ChildItem -Recurse (Join-Path $env:USERPROFILE '.gradle\caches\modules-2\files-2.1\net.sf.mpxj\mpxj\16.5.0') `
    -Filter 'mpxj-16.5.0.jar' -ErrorAction SilentlyContinue |
    Sort-Object Length -Descending | Select-Object -First 1 -ExpandProperty FullName
  if (-not $mpxjSrc) {
    throw 'mpxj-16.5.0.jar not in Gradle cache — run one Gradle sync/build that resolves net.sf.mpxj:mpxj:16.5.0 first'
  }
  $mpxjDst = Join-Path $libsDir 'mpxj-16.5.0-android.jar'
  Copy-Item -Force $mpxjSrc $mpxjDst
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::Open($mpxjDst, 'Update')
  $entry = $zip.GetEntry('org/mpxj/common/UnmarshalHelper.class')
  if ($null -ne $entry) { $entry.Delete() }
  $zip.Dispose()

  $awtPkg = Join-Path $app 'src\main\java\java\awt'
  $awtImgPkg = Join-Path $awtPkg 'image'
  New-Item -ItemType Directory -Force -Path $awtPkg, $awtImgPkg | Out-Null
  Copy-Item -Force (Join-Path $androidSrc 'awt\Color.java') (Join-Path $awtPkg 'Color.java')
  Copy-Item -Force (Join-Path $androidSrc 'awt\Image.java') (Join-Path $awtPkg 'Image.java')
  Copy-Item -Force (Join-Path $androidSrc 'awt\Graphics.java') (Join-Path $awtPkg 'Graphics.java')
  Copy-Item -Force (Join-Path $androidSrc 'awt\image\ImageObserver.java') (Join-Path $awtImgPkg 'ImageObserver.java')
  Copy-Item -Force (Join-Path $androidSrc 'awt\image\ImageProducer.java') (Join-Path $awtImgPkg 'ImageProducer.java')
  Copy-Item -Force (Join-Path $androidSrc 'AndroidManifest.xml') (Join-Path $app 'src\main\AndroidManifest.xml')
  Copy-Item -Force (Join-Path $androidSrc 'proguard-rules.pro') (Join-Path $app 'proguard-rules.pro')
  Copy-Item -Force (Join-Path $androidSrc 'gradle.properties') (Join-Path $root 'src-tauri\gen\android\gradle.properties')

  $blank = Join-Path $root 'src-tauri\resources\mpp\blank.mpp'
  if (-not (Test-Path $blank)) { $blank = Join-Path $root 'server\java\templates\blank.mpp' }
  if (-not (Test-Path $blank)) { throw 'blank.mpp template missing' }
  Copy-Item -Force $blank (Join-Path $assets 'blank.mpp')

  $gradleApp = Join-Path $app 'build.gradle.kts'
  $gradleText = Get-Content $gradleApp -Raw

  # Prefer stripped local MPXJ jar + explicit transitive deps (avoids duplicate UnmarshalHelper).
  if ($gradleText -match 'implementation\("net\.sf\.mpxj:mpxj:') {
    $gradleText = $gradleText -replace '(?m)^\s*implementation\("net\.sf\.mpxj:mpxj:[^"]+"\)\r?\n', ''
  }
  if ($gradleText -notmatch 'mpxj-16\.5\.0-android\.jar') {
    $deps = @'
    implementation(files("libs/mpxj-16.5.0-android.jar"))
    implementation("org.apache.poi:poi:5.5.1")
    implementation("jakarta.xml.bind:jakarta.xml.bind-api:3.0.1")
    implementation("org.glassfish.jaxb:jaxb-runtime:3.0.2")
    implementation("com.github.joniles:rtfparserkit:1.16.0")
    implementation("javax.xml.stream:stax-api:1.0-2")
    implementation("com.fasterxml:aalto-xml:1.3.3")
    implementation("xerces:xercesImpl:2.12.2")
'@
    $gradleText = $gradleText -replace '(dependencies\s*\{)', "`$1`r`n$deps"
  }
  if ($gradleText -notmatch 'javax\.xml\.stream:stax-api') {
    $gradleText = $gradleText -replace '(implementation\(files\("libs/mpxj-16\.5\.0-android\.jar"\)\))', "`$1`r`n    implementation(`"javax.xml.stream:stax-api:1.0-2`")"
  }

  if ($gradleText -notmatch 'exclude\(group = "xml-apis"') {
    $gradleText = $gradleText -replace '(dependencies\s*\{[^}]*\}\r?\n)', "`$1`r`nconfigurations.all {`r`n    exclude(group = `"xml-apis`", module = `"xml-apis`")`r`n}`r`n"
  }

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
  Write-Host 'staged Android plugins, manifest, MPXJ deps, blank.mpp, gradle.properties'
}

Set-Location $root

$distIndex = Join-Path $root 'dist\index.html'
$needWeb = -not $SkipWeb
if ($SkipWeb -and -not (Test-Path $distIndex)) {
  Write-Host 'dist/ missing — forcing web build'
  $needWeb = $true
}
if ($needWeb) {
  Write-Step 'web build'
  cmd /c "npm run build"
  if ($LASTEXITCODE -ne 0) { throw 'web build failed' }
} else {
  Write-Step 'web build SKIPPED'
}

$so = Join-Path $root 'src-tauri\target\aarch64-linux-android\release\libsupergannt_lib.so'
$jni = Join-Path $root 'src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a'
$needRust = -not $SkipRust
if ($SkipRust -and -not (Test-Path $so)) {
  Write-Host 'native .so missing — forcing rust build'
  $needRust = $true
}
if ($needRust) {
  Write-Step 'rust aarch64-linux-android'
  Set-Location (Join-Path $root 'src-tauri')
  # Incremental release builds still help when only a few crates change.
  $env:CARGO_INCREMENTAL = '1'
  cmd /c "cargo build --package supergannt --target aarch64-linux-android --features tauri/custom-protocol --lib --release"
  if ($LASTEXITCODE -ne 0) { throw 'cargo failed' }
} else {
  Write-Step 'rust build SKIPPED'
}

New-Item -ItemType Directory -Force -Path $jni | Out-Null
Copy-Item -Force $so (Join-Path $jni 'libsupergannt_lib.so')
Write-Host ("copied native lib ({0} bytes)" -f (Get-Item $so).Length)

Write-Step 'stage Android sources'
Stage-AndroidSources

Write-Step 'gradle assembleArm64Release'
Set-Location (Join-Path $root 'src-tauri\gen\android')
$gradleArgs = @(
  ':app:assembleArm64Release',
  '--parallel',
  '--build-cache',
  '-PabiList=arm64-v8a',
  '-ParchList=arm64',
  '-PtargetList=aarch64'
)
if ($Clean) { $gradleArgs = @(':app:clean') + $gradleArgs }
# Daemon kept warm — much faster than --no-daemon on iterative builds.
cmd /c ("gradlew.bat " + ($gradleArgs -join ' '))
if ($LASTEXITCODE -ne 0) { throw 'gradle failed' }

$outDir = Join-Path $root 'release-android'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$apkDir = Join-Path $root 'src-tauri\gen\android\app\build\outputs\apk\arm64\release'
$best = Get-ChildItem -Filter '*.apk' $apkDir -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notmatch 'unsigned' -or $true } |
  Sort-Object Length -Descending |
  Select-Object -First 1
if (-not $best) {
  $best = Get-ChildItem -Recurse -Filter '*arm64*.apk' (Join-Path $root 'src-tauri\gen\android\app\build\outputs\apk') |
    Sort-Object Length -Descending | Select-Object -First 1
}
if (-not $best) { throw 'no arm64 APK produced' }
Write-Host ("APK: {0} ({1} MB)" -f $best.FullName, [math]::Round($best.Length / 1MB, 1))

$dest = Join-Path $outDir 'SuperGantt_1.0.2_arm64-v8a.apk'
Write-Step 'sign APK'
Sign-Apk -InputApk $best.FullName -OutputApk $dest
Write-Host ("DONE → {0} ({1} MB, signed) total {2:n1}s" -f $dest, [math]::Round((Get-Item $dest).Length / 1MB, 1), $sw.Elapsed.TotalSeconds)
