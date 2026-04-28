import json, urllib.request, urllib.error

BOARD_TOKEN = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
AGENT_TOKEN = None  # We don't have this
API_BASE = 'http://127.0.0.1:3100'
COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52'
AGENT_ID = 'e115eeab-2657-468e-8160-6a9f741f8136'

def api_get(path, token=BOARD_TOKEN):
    req = urllib.request.Request(API_BASE + path, headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def api_post(path, data, token=BOARD_TOKEN):
    body = json.dumps(data).encode()
    req = urllib.request.Request(API_BASE + path, data=body, method='POST', headers={
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'X-Paperclip-Run-Id': 'manual-' + AGENT_ID
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return {'status': resp.status, 'data': json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {'error': str(e), 'code': e.code, 'body': body[:500]}

# AMXA-386 issue ID
issue_id = 'da5c3efc-f47f-4821-9913-e6c2a1551bd5'

# Try to checkout
print("=== Checkout AMXA-386 ===")
result = api_post(f'/api/issues/{issue_id}/checkout', {
    'agentId': AGENT_ID,
    'expectedStatuses': ['todo', 'backlog', 'blocked']
})
print(json.dumps(result, indent=2))

# Try to update status
print("\n=== Update AMXA-386 status ===")
body = json.dumps({'status': 'in_progress'}).encode()
req = urllib.request.Request(API_BASE + f'/api/issues/{issue_id}', data=body, method='PATCH', headers={
    'Authorization': 'Bearer ' + BOARD_TOKEN,
    'Content-Type': 'application/json',
    'X-Paperclip-Run-Id': 'manual-' + AGENT_ID
})
try:
    with urllib.request.urlopen(req) as resp:
        print('Status:', resp.status, json.loads(resp.read()))
except urllib.error.HTTPError as e:
    print('Error:', e.code, e.read().decode()[:500])
