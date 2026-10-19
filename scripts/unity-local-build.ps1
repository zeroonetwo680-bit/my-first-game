#Requires -Version 5.1
<#
.SYNOPSIS
  Local Unity pipeline: EditMode/PlayMode tests -> build APK/WebGL -> optional adb install to your phone.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\unity-local-build.ps1
  powershell -ExecutionPolicy Bypass -File scripts\unity-local-build.ps1 -SkipTests -InstallDevice
  powershell -ExecutionPolicy Bypass -File scripts\unity-local-build.ps1 -BuildTarget webgl -Il2cpp
#>
param(
    [string]$UnityExe = "",
    [string]$ProjectPath = "",
    [string]$BuildTarget = "android",   # android | webgl
    [string]$AdbExe = "",
    [switch]$SkipTests,
    [switch]$InstallDevice,
    [switch]$Il2cpp
)
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ProjectPath) { $ProjectPath = Join-Path $repoRoot "unity" }
$ProjectPath = (Resolve-Path $ProjectPath).Path
if (-not (Test-Path (Join-Path $ProjectPath "Assets"))) {
    throw "No Assets/ folder under $ProjectPath — not a Unity project yet? See unity/README.md"
}

# ---- find Unity.exe (Hub installs) -----------------------------------------
if ($UnityExe -and (Test-Path $UnityExe)) {
    $script:UnityExe = $UnityExe
} else {
    $hub = "C:\Program Files\Unity\Hub\Editor"
    $found = ""
    if (Test-Path $hub) {
        foreach ($ver in (Get-ChildItem $hub -Directory | Sort-Object Name -Descending)) {
            $exe = Join-Path $ver.FullName "Editor\Unity.exe"
            if (Test-Path $exe) { $found = $exe; break }
        }
    }
    if (-not $found) { throw "Unity.exe not found. Install Unity via Hub (with Android Build Support) or pass -UnityExe 'C:\...\Unity.exe'" }
    $script:UnityExe = $found
}
Write-Host "Unity : $script:UnityExe" -ForegroundColor DarkCyan
Write-Host "Proj  : $ProjectPath"

function Invoke-Unity([string[]]$UnityArgs, [string]$What) {
    Write-Host "`n==> $What" -ForegroundColor Cyan
    & $script:UnityExe -batchmode -nographics -projectPath $ProjectPath @UnityArgs
    $code = $LASTEXITCODE
    if ($code -ne 0) { throw "$What FAILED (exit code $code)" }
    Write-Host "==> $What OK" -ForegroundColor Green
}

# ---- 1) tests --------------------------------------------------------------
if (-not $SkipTests) {
    $results = Join-Path $ProjectPath "TestResults"
    New-Item -ItemType Directory -Force -Path $results | Out-Null
    Invoke-Unity @("-runTests", "-testPlatform", "EditMode",
        "-testResults", (Join-Path $results "EditMode.xml"), "-logFile", "-") "EditMode tests"
    Invoke-Unity @("-runTests", "-testPlatform", "PlayMode",
        "-testResults", (Join-Path $results "PlayMode.xml"), "-logFile", "-") "PlayMode tests"
}

# ---- 2) build --------------------------------------------------------------
$env:UNITY_IL2CPP = if ($Il2cpp) { "1" } else { "0" }
if ($BuildTarget -eq "webgl") {
    Invoke-Unity @("-executeMethod", "BuildScript.BuildWebGL", "-logFile", "-") "Build WebGL"
} else {
    Invoke-Unity @("-executeMethod", "BuildScript.BuildAndroid", "-logFile", "-") "Build Android"
}

# ---- 3) install to device --------------------------------------------------
if ($InstallDevice) {
    if ($BuildTarget -ne "android") { throw "-InstallDevice only works with -BuildTarget android" }
    $apk = Join-Path $ProjectPath "Builds\Android\NEON-UNITY.apk"
    if (-not (Test-Path $apk)) { throw "APK not found: $apk" }
    if (-not $AdbExe) {
        $cands = @(
            "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
            "C:\Android\platform-tools\adb.exe"
        )
        $cmd = Get-Command adb -ErrorAction SilentlyContinue
        if ($cmd) { $cands += $cmd.Source }
        $AdbExe = $cands | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    }
    if (-not $AdbExe) { throw "adb not found. Install Android SDK Platform-Tools or pass -AdbExe" }
    Write-Host "`n==> adb install -r (phone must be connected + USB debugging on)" -ForegroundColor Cyan
    & $AdbExe install -r $apk
    if ($LASTEXITCODE -ne 0) { throw "adb install FAILED" }
    Write-Host "==> Installed on device" -ForegroundColor Green
}

Write-Host "`nALL DONE" -ForegroundColor Green
