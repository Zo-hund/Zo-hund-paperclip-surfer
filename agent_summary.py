import json, urllib.request

url = 'http://127.0.0.1:3100/api/agents/e115eeab-2657-468e-8160-6a9f741f8136'
req = urllib.request.Request(url, headers={'Authorization': 'Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())

remaining = data['budgetMonthlyCents'] - data['spentMonthlyCents']
print(f"Name: {data['name']}")
print(f"Status: {data['status']}")
print(f"Last heartbeat: {data['lastHeartbeatAt']}")
print(f"Budget: {remaining}/{data['budgetMonthlyCents']} cents remaining")
print(f"Role: {data['role']}")
print(f"Reports to: {data['reportsTo']}")
