param([ValidateSet('Validate','Build','Start','Stop')][string]$Mode = 'Start')
$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path "$PSScriptRoot/../..").Path
$privateDir = 'F:/AMX-AIR-HUBS-LOCAL/OPPRRC/04_resources/BOARD-INTERNAL/development/config'
New-Item -ItemType Directory -Force -Path $privateDir | Out-Null
$envPath = Join-Path $privateDir '.env.release-local'
if (-not (Test-Path -LiteralPath $envPath)) {
  $lines = foreach ($key in @('POSTGRES_PASSWORD','BETTER_AUTH_SECRET','PAPERCLIP_AGENT_JWT_SECRET')) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    "$key=$([Convert]::ToHexString($bytes).ToLowerInvariant())"
  }
  [IO.File]::WriteAllLines($envPath, $lines)
  $account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $envPath /inheritance:r /grant:r "${account}:(F)" 'SYSTEM:(F)' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to protect local secrets file' }
}
$argsBase = @('compose','--env-file',$envPath,'-f',"$PSScriptRoot/compose.local.yml")
switch ($Mode) {
  Validate { & docker @argsBase config --quiet }
  Build { & docker @argsBase build amx }
  Start { & docker @argsBase up -d --build --wait --wait-timeout 180 }
  Stop { & docker @argsBase stop }
}
if ($LASTEXITCODE -ne 0) { throw "Local $Mode failed" }
if ($Mode -eq 'Start') {
  & python "$PSScriptRoot/smoke.py" http://localhost:3100
  if ($LASTEXITCODE -ne 0) { throw 'Local smoke gate failed' }
}
