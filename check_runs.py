import json, urllib.request

url = 'http://127.0.0.1:3100/api/agents/e115eeab-2657-468e-8160-6a9f741f8136/runs'
req = urllib.request.Request(url, headers={'Authorization': 'Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        runs = data.get('value', data) if isinstance(data, dict) else data
        for r in runs[:5]:
            ts = r.get('createdAt', '')[:16]
            print(f"Run: {r.get('id', '?')} | status={r.get('status', '?')} | source={r.get('source', '?')} | created={ts}")
except Exception as e:
    print('Error:', type(e).__name__, str(e)[:300])

# Also check agent status
url2 = 'http://127.0.0.1:3100/api/agents/e115eeab-2657-468e-8160-6a9f741f8136'
req2 = urllib.request.Request(url2, headers={'Authorization': 'Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'})
try:
    with urllib.request.urlopen(req2) as resp:
        data = json.loads(resp.read())
        print(f"\nAgent: {data['name']} | Status: {data['status']} | Last heartbeat: {data.get('lastHeartbeatAt', '?')}")
except Exception as e:
    print('Error:', type(e).__name__, str(e)[:300])
