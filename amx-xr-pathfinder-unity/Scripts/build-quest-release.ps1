param(
    [string]$Unity = 'C:\Program Files\Unity\Hub\Editor\6000.2.14f1\Editor\Unity.exe'
)

$ErrorActionPreference = 'Stop'
$required = @(
    'AMX_QUEST_KEYSTORE_PATH',
    'AMX_QUEST_KEYSTORE_PASSWORD',
    'AMX_QUEST_KEY_ALIAS',
    'AMX_QUEST_KEY_PASSWORD',
    'AMX_QUEST_VERSION_NAME',
    'AMX_QUEST_VERSION_CODE'
)

foreach ($name in $required) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
        throw "$name is required. Release signing values must be supplied through the environment."
    }
}

if (-not (Test-Path -LiteralPath $Unity -PathType Leaf)) {
    throw "Unity 6 executable was not found at $Unity."
}

$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$env:BEE_BUILD_THREADS = '1'
& $Unity -batchmode -nographics -quit -projectPath $project `
    -executeMethod AMX.XR.Editor.AmxQuestProjectConfigurator.BuildQuestReleaseApk -logFile -

if ($LASTEXITCODE -ne 0) {
    throw "Unity Quest release build failed with exit code $LASTEXITCODE."
}

$manifest = Join-Path $project 'Builds\Quest\AMX-XR-Path-Finder-release.json'
if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
    throw 'Unity completed without producing the Quest release manifest.'
}

Get-Content -LiteralPath $manifest
