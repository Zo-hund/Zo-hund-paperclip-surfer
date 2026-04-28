import json, sys, urllib.request

url = 'http://127.0.0.1:3100/api/companies/dece557d-8849-4040-b8ad-e0e235a54b52/issues?status=todo,in_progress&limit=100'
req = urllib.request.Request(url, headers={'Authorization': 'Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())

issues = data.get('value', data) if isinstance(data, dict) else data
print(f"Total: {len(issues)}")
for i in issues:
    title = i.get('title', '')[:80]
    print(f"[{i.get('identifier','?')}] {title} | {i.get('status','?')} | {i.get('assigneeAgentId','unassigned')}")
