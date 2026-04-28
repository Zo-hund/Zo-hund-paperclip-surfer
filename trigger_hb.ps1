$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$env:PAPERCLIP_API_KEY = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
$env:PAPERCLIP_API_URL = 'http://127.0.0.1:3100'
$env:PAPERCLIP_AGENT_ID = 'e115eeab-2657-468e-8160-6a9f741f8136'
$env:PAPERCLIP_COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52'
$env:PAPERCLIP_RUN_ID = "run_$ts"

Write-Host "Triggering heartbeat at $ts"

# Try triggering via npx paperclipai
npx paperclipai heartbeat run `
    --agent-id e115eeab-2657-468e-8160-6a9f741f8136 `
    --api-base http://127.0.0.1:3100 `
    --api-key "pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc" `
    --source manual `
    --trigger manual `
    --timeout-ms 120000 2>&1
