$ErrorActionPreference = 'Stop'
$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$runId = "manual_run_$ts"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'powershell.exe'
$psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -Command `"& opencode run --format json --model opencode/big-pickle -- 'You are agent e115eeab-2657-468e-8160-6a9f741f8136 (V3 Audit Lead). Continue your Paperclip work.' 2>&1 | Out-File -FilePath 'C:\Users\Techa\.paperclip\tmp_surfers\v3_hb_$ts.txt' -Encoding UTF8; exit 0`""

# Set env vars directly on the ProcessStartInfo
$psi.Environment["PAPERCLIP_API_KEY"] = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
$psi.Environment["PAPERCLIP_API_URL"] = 'http://127.0.0.1:3100'
$psi.Environment["PAPERCLIP_AGENT_ID"] = 'e115eeab-2657-468e-8160-6a9f741f8136'
$psi.Environment["PAPERCLIP_COMPANY_ID"] = 'dece557d-8849-4040-b8ad-e0e235a54b52'
$psi.Environment["PAPERCLIP_RUN_ID"] = $runId
$psi.Environment["PAPERCLIP_WAKE_REASON"] = 'manual'
$psi.Environment["OPENCODE_DISABLE_PROJECT_CONFIG"] = 'true'

$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.WorkingDirectory = 'C:\Users\Techa\.paperclip\instances\default\workspaces\e115eeab-2657-468e-8160-6a9f741f8136'

$proc = [System.Diagnostics.Process]::Start($psi)
$proc.WaitForExit()

Write-Host "Exit: $($proc.ExitCode)"
$outFile = "C:\Users\Techa\.paperclip\tmp_surfers\v3_hb_$ts.txt"
$sz = (Get-Item $outFile -ErrorAction SilentlyContinue).Length
Write-Host "Output: $sz bytes"
Get-Content $outFile -ErrorAction SilentlyContinue | Select-Object -First 5
