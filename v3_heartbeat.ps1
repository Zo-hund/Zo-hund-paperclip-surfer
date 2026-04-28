$ErrorActionPreference = 'Stop'
$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$sess = "ses_v3audit_$ts"
Write-Host "Starting fresh V3 Audit Lead heartbeat session: $sess"

$env:PAPERCLIP_API_KEY = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
$env:PAPERCLIP_API_URL = 'http://127.0.0.1:3100'
$env:PAPERCLIP_AGENT_ID = 'e115eeab-2657-468e-8160-6a9f741f8136'
$env:PAPERCLIP_COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52'
$env:PAPERCLIP_RUN_ID = "run_$ts"
$env:PAPERCLIP_WAKE_REASON = 'manual'

$proc = Start-Process -FilePath "opencode" -ArgumentList "run","--format","json","--session",$sess,"--model","opencode/big-pickle" -PassThru -NoNewWindow -Wait -RedirectStandardOutput "C:\Users\Techa\.paperclip\tmp_surfers\v3_output.txt" -RedirectStandardError "C:\Users\Techa\.paperclip\tmp_surfers\v3_error.txt"

Write-Host "Exit code: $($proc.ExitCode)"
Write-Host "--- Output (first 100 lines) ---"
Get-Content "C:\Users\Techa\.paperclip\tmp_surfers\v3_output.txt" -TotalCount 100
