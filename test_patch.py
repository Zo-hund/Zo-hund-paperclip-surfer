import json, urllib.request

# Try to PATCH an issue using board token
issue_url = 'http://127.0.0.1:3100/api/issues/35d767df-c4b8-4417-bcc3-6d37692abd3b'
patch_data = json.dumps({'status': 'in_progress'}).encode()
req = urllib.request.Request(issue_url, data=patch_data, method='PATCH', headers={
    'Authorization': 'Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc',
    'Content-Type': 'application/json'
})
try:
    with urllib.request.urlopen(req) as resp:
        print('PATCH Success:', resp.status)
except Exception as e:
    print('PATCH Error:', type(e).__name__, str(e)[:300])
