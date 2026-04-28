import json, sys, urllib.request

# Search for comments mentioning my agent
url = 'http://127.0.0.1:3100/api/companies/dece557d-8849-4040-b8ad-e0e235a54b52/issues?status=todo,in_progress,blocked&limit=200'
req = urllib.request.Request(url, headers={'Authorization': 'Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())

issues = data.get('value', data) if isinstance(data, dict) else data
print(f"Total: {len(issues)}")

# Check for audit-related or my agent
for i in issues:
    title = i.get('title', '')
    aid = i.get('assigneeAgentId', '')
    if 'audit' in title.lower() or 'verify' in title.lower() or 'v3' in title.lower() or aid == 'e115eeab-2657-468e-8160-6a9f741f8136':
        print(f"[{i.get('identifier','?')}] {title} | {i.get('status')} | {aid}")

# Also check my done issues recently
print("\n--- Recently Done Issues Assigned to Me ---")
url2 = 'http://127.0.0.1:3100/api/companies/dece557d-8849-4040-b8ad-e0e235a54b52/issues?assigneeAgentId=e115eeab-2657-468e-8160-6a9f741f8136&status=done&limit=10'
req2 = urllib.request.Request(url2, headers={'Authorization': 'Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'})
with urllib.request.urlopen(req2) as resp2:
    data2 = json.loads(resp2.read())

done = data2.get('value', data2) if isinstance(data2, dict) else data2
print(f"Done issues: {len(done)}")
for i in done:
    print(f"[{i.get('identifier','?')}] {i.get('title','')[:80]} | completed={i.get('completedAt','')[:10]}")
