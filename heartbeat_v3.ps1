$ErrorActionPreference = 'Stop'
$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()

$env:PAPERCLIP_API_KEY = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
$env:PAPERCLIP_API_URL = 'http://127.0.0.1:3100'
$env:PAPERCLIP_AGENT_ID = 'e115eeab-2657-468e-8160-6a9f741f8136'
$env:PAPERCLIP_COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52'
$env:PAPERCLIP_RUN_ID = "manual_$ts"
$env:PAPERCLIP_WAKE_REASON = 'manual'

$msg = "You are agent e115eeab-2657-468e-8160-6a9f741f8136 (V3 Audit Lead). Continue your Paperclip work."
$workdir = 'C:\Users\Techa\.paperclip\instances\default\workspaces\e115eeab-2657-468e-8160-6a9f741f8136'

# Write message to temp file to avoid quoting issues
$msgFile = "C:\Users\Techa\.paperclip\tmp_surfers\msg_$ts.txt"
$msg | Out-File -FilePath $msgFile -Encoding UTF8

Write-Host "RunID: manual_$ts"
Write-Host "Workdir: $workdir"

# Run opencode with stdin from file, redirect output
$outFile = "C:\Users\Techa\.paperclip\tmp_surfers\out_$ts.txt"
$errFile = "C:\Users\Techa\.paperclip\tmp_surfers\err_$ts.txt"

$proc = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"& opencode run --format json --model opencode/big-pickle 2> '$errFile' | Set-Content '$outFile'; exit 0`"" -PassThru -NoNewWindow -Wait -WorkingDirectory $workdir

Write-Host "Exit: $($proc.ExitCode)"
Write-Host "--- Output ---"
Get-Content $outFile -ErrorAction SilentlyContinue | Select-Object -First 50
Write-Host "--- Stderr ---"  
Get-Content $errFile -ErrorAction SilentlyContinue | Select-Object -First 30
