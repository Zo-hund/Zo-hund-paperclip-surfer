$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$sess = "ses_v3fresh_$ts"
$env:PAPERCLIP_API_KEY = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
$env:PAPERCLIP_API_URL = 'http://127.0.0.1:3100'
$env:PAPERCLIP_AGENT_ID = 'e115eeab-2657-468e-8160-6a9f741f8136'
$env:PAPERCLIP_COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52'
$env:PAPERCLIP_RUN_ID = "run_$ts"
$env:PAPERCLIP_WAKE_REASON = 'manual'

Write-Host "Session: $sess, RunID: run_$ts"

$msg = "You are agent e115eeab-2657-468e-8160-6a9f741f8136 (V3 Audit Lead). Continue your Paperclip work."

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'opencode'
$psi.Arguments = "run --format json --session $sess --model opencode/big-pickle -- $msg"
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.WorkingDirectory = 'C:\Users\Techa\.paperclip\instances\default\workspaces\e115eeab-2657-468e-8160-6a9f741f8136'

$proc = [System.Diagnostics.Process]::Start($psi)
$stdout = $proc.StandardOutput.ReadToEnd()
$stderr = $proc.StandardError.ReadToEnd()
$proc.WaitForExit()

Write-Host "Exit code: $($proc.ExitCode)"
Write-Host "--- STDOUT ---"
Write-Host $stdout
Write-Host "--- STDERR ---"
Write-Host $stderr
