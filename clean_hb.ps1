$ErrorActionPreference = 'Stop'
$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$sess = "v3clean_$ts"
$runId = "manual_run_$ts"

$env:PAPERCLIP_API_KEY = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
$env:PAPERCLIP_API_URL = 'http://127.0.0.1:3100'
$env:PAPERCLIP_AGENT_ID = 'e115eeab-2657-468e-8160-6a9f741f8136'
$env:PAPERCLIP_COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52'
$env:PAPERCLIP_RUN_ID = $runId
$env:PAPERCLIP_WAKE_REASON = 'manual'
$env:OPENCODE_DISABLE_PROJECT_CONFIG = 'true'

Write-Host "Session: $sess RunID: $runId"

$prompt = "You are agent e115eeab-2657-468e-8160-6a9f741f8136 (V3 Audit Lead). Continue your Paperclip work."

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'powershell.exe'
$psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -Command `"& opencode run --format json --session '$sess' --model opencode/big-pickle -- '$prompt' 2>&1 | Tee-Object -FilePath 'C:\Users\Techa\.paperclip\tmp_surfers\v3_clean_out.txt'; exit 0`""
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.WorkingDirectory = 'C:\Users\Techa\.paperclip\instances\default\workspaces\e115eeab-2657-468e-8160-6a9f741f8136'

$proc = [System.Diagnostics.Process]::Start($psi)
$proc.WaitForExit()
$exit = $proc.ExitCode

Write-Host "Exit code: $exit"
Write-Host "--- Output ---"
Get-Content 'C:\Users\Techa\.paperclip\tmp_surfers\v3_clean_out.txt' -ErrorAction SilentlyContinue | Select-Object -First 50
