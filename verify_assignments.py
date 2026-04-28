import json, urllib.request, urllib.error

BOARD_TOKEN = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
API_BASE = 'http://127.0.0.1:3100'
COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52'
AGENT_ID = 'e115eeab-2657-468e-8160-6a9f741f8136'

def api_get(path):
    req = urllib.request.Request(API_BASE + path, headers={'Authorization': 'Bearer ' + BOARD_TOKEN})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def api_post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(API_BASE + path, data=body, method='POST', headers={
        'Authorization': 'Bearer ' + BOARD_TOKEN,
        'Content-Type': 'application/json'
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {'error': f'HTTP {e.code}: {e.read().decode()[:200]}'}

# Check AMXA-386 in detail
issues = api_get(f'/api/companies/{COMPANY_ID}/issues?q=AMXA-386')
issue_list = issues.get('value', issues) if isinstance(issues, dict) else issues
issue_386 = next((i for i in issue_list if i.get('identifier') == 'AMXA-386'), None)

if issue_386:
    print(f"AMXA-386:")
    print(f"  ID: {issue_386['id']}")
    print(f"  Status: {issue_386['status']}")
    print(f"  Assignee: {issue_386['assigneeAgentId']}")
    print(f"  Priority: {issue_386['priority']}")
    desc = issue_386.get('description', '')
    print(f"  Description: {desc[:300]}")
    
    # Check comments
    comments = api_get(f"/api/issues/{issue_386['id']}/comments")
    comment_list = comments.get('value', comments) if isinstance(comments, dict) else comments
    print(f"\n  Comments ({len(comment_list)}):")
    for c in comment_list:
        print(f"    [{c.get('createdAt','')[:16]}] author={c.get('authorAgentId', c.get('authorUserId','?'))}")
        print(f"      {c.get('body','')[:150]}")

# Also check AMXA-178
print("\n--- AMXA-178 ---")
issues2 = api_get(f'/api/companies/{COMPANY_ID}/issues?q=AMXA-178')
issue_list2 = issues2.get('value', issues2) if isinstance(issues2, dict) else issues2
issue_178 = next((i for i in issue_list2 if i.get('identifier') == 'AMXA-178'), None)
if issue_178:
    print(f"  Status: {issue_178['status']}")
    print(f"  Assignee: {issue_178['assigneeAgentId']}")
    comments2 = api_get(f"/api/issues/{issue_178['id']}/comments")
    comment_list2 = comments2.get('value', comments2) if isinstance(comments2, dict) else comments2
    print(f"  Comments ({len(comment_list2)}):")
    for c in comment_list2[-3:]:
        print(f"    [{c.get('createdAt','')[:16]}] {c.get('body','')[:150]}")
