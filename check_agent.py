import json, urllib.request

# Check heartbeat endpoint
url = 'http://127.0.0.1:3100/api/agents/e115eeab-2657-468e-8160-6a9f741f8136'
req = urllib.request.Request(url, headers={'Authorization': 'Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        print(f"Agent: {data['name']} | Status: {data['status']} | Last heartbeat: {data.get('lastHeartbeatAt','?')}")
        print(f"Runtime config: {json.dumps(data.get('runtimeConfig',{}), indent=2)}")
except Exception as e:
    print('Error:', type(e).__name__, str(e)[:300])
