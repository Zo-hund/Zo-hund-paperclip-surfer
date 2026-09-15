[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$NodeExecutable = "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe",
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)][string[]]$TestArguments
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path -LiteralPath $NodeExecutable)) {
  throw 'Pass -NodeExecutable with the path to an installed Node 24 runtime.'
}
$version = & $NodeExecutable --version
if ($LASTEXITCODE -ne 0 -or [version]$version.TrimStart('v') -lt [version]'24.0.0') {
  throw 'This Windows test launcher requires Node 24 or newer.'
}
Push-Location $repo
try {
  & $NodeExecutable node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000 @TestArguments
  $testExitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
exit $testExitCode
