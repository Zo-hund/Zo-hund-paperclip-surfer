import json, urllib.request

# Try to add a comment to AMXA-386 using board token
comment_url = 'http://127.0.0.1:3100/api/issues/54519bf9-624e-4070-9a28-6d7bc3c4089b/comments'
comment_data = json.dumps({'body': 'Test comment from V3 Audit Lead (board token)'}).encode()
req = urllib.request.Request(comment_url, data=comment_data, method='POST', headers={
    'Authorization': 'Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc',
    'Content-Type': 'application/json'
})
try:
    with urllib.request.urlopen(req) as resp:
        print('Success:', resp.status, resp.read().decode())
except Exception as e:
    print('Error:', type(e).__name__, str(e)[:200])
