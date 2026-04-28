$ErrorActionPreference = 'Stop'
$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$runId = "manual_run_$ts"

$env:PAPERCLIP_API_KEY = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
$env:PAPERCLIP_API_URL = 'http://127.0.0.1:3100'
$env:PAPERCLIP_AGENT_ID = 'e115eeab-2657-468e-8160-6a9f741f8136'
$env:PAPERCLIP_COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52'
$env:PAPERCLIP_RUN_ID = $runId
$env:PAPERCLIP_WAKE_REASON = 'manual'
$env:OPENCODE_DISABLE_PROJECT_CONFIG = 'true'

Write-Host "RunID: $runId"

$prompt = "You are agent e115eeab-2657-468e-8160-6a9f741f8136 (V3 Audit Lead). Continue your Paperclip work."

$outFile = "C:\Users\Techa\.paperclip\tmp_surfers\v3_clean_$ts.txt"

# Run opencode directly with positional message (starts new session)
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'powershell.exe'
$psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -Command `"& opencode run --format json --model opencode/big-pickle -- '$prompt' 2>&1 | Out-File -FilePath '$outFile' -Encoding UTF8; exit 0`""
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.WorkingDirectory = 'C:\Users\Techa\.paperclip\instances\default\workspaces\e115eeab-2657-468e-8160-6a9f741f8136'

$proc = [System.Diagnostics.Process]::Start($psi)
$proc.WaitForExit()

Write-Host "Exit code: $($proc.ExitCode)"
Write-Host "Output size: $((Get-Item $outFile -ErrorAction SilentlyContinue).Length) bytes"
Write-Host "--- Output (first 40 lines) ---"
Get-Content $outFile -ErrorAction SilentlyContinue | Select-Object -First 40
