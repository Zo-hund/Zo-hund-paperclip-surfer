[CmdletBinding()]
param(
    [string]$Adb = 'C:\Program Files\Unity\Hub\Editor\6000.2.14f1\Editor\Data\PlaybackEngines\AndroidPlayer\SDK\platform-tools\adb.exe',
    [int]$AuthorizationTimeoutSeconds = 180,
    [switch]$Capture
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$apk = Join-Path $projectRoot 'Builds\Quest\AMX-XR-Path-Finder-development.apk'
$package = 'cc.amxairhubs.pathfinder'
$activity = 'com.unity3d.player.UnityPlayerActivity'
$diagnostics = Join-Path $projectRoot 'Builds\Quest\diagnostics'

if (-not (Test-Path -LiteralPath $Adb -PathType Leaf)) {
    throw "ADB was not found at $Adb"
}
if (-not (Test-Path -LiteralPath $apk -PathType Leaf)) {
    throw "Build the Quest APK first: $apk"
}

& $Adb start-server | Out-Null
$deadline = (Get-Date).AddSeconds($AuthorizationTimeoutSeconds)
$announced = $false
do {
    $deviceLine = (& $Adb devices) | Select-Object -Skip 1 | Where-Object { $_ -match '\S' } | Select-Object -First 1
    if ($deviceLine -match '\sdevice$') { break }
    if (-not $announced) {
        Write-Host 'Waiting for Quest. Put on the headset and approve Always allow USB debugging.' -ForegroundColor Yellow
        $announced = $true
    }
    Start-Sleep -Seconds 3
} while ((Get-Date) -lt $deadline)

if ($deviceLine -notmatch '\sdevice$') {
    throw "Quest was not authorized within $AuthorizationTimeoutSeconds seconds. Current ADB state: $deviceLine"
}

Write-Host "Installing $apk" -ForegroundColor Cyan
& $Adb install -r -d $apk
if ($LASTEXITCODE -ne 0) { throw "ADB install failed with exit code $LASTEXITCODE" }

& $Adb logcat -c
& $Adb shell am force-stop $package
& $Adb shell am start -n "$package/$activity"
if ($LASTEXITCODE -ne 0) { throw "Quest launch failed with exit code $LASTEXITCODE" }

Write-Host 'AMX XR launched. Waiting for runtime diagnostics...' -ForegroundColor Green
Start-Sleep -Seconds 12
& $Adb logcat -d Unity:I '*:S' |
    Select-String -Pattern 'AMX |Exception|MissingReference|NullReference' |
    ForEach-Object { $_.Line }

if ($Capture) {
    New-Item -ItemType Directory -Force -Path $diagnostics | Out-Null
    $capturePath = Join-Path $diagnostics 'quest-current.png'
    & $Adb shell screencap -p /sdcard/amx-quest-current.png
    & $Adb pull /sdcard/amx-quest-current.png $capturePath
    Write-Host "Quest capture saved to $capturePath" -ForegroundColor Green
}
