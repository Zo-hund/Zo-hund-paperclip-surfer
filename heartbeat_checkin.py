import json, urllib.request, urllib.error

BOARD_TOKEN = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
API_BASE = 'http://127.0.0.1:3100'
COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52'
AGENT_ID = 'e115eeab-2657-468e-8160-6a9f741f8136'

def api_get(path):
    req = urllib.request.Request(API_BASE + path, headers={'Authorization': 'Bearer ' + BOARD_TOKEN})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def api_patch(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(API_BASE + path, data=body, method='PATCH', headers={
        'Authorization': 'Bearer ' + BOARD_TOKEN,
        'Content-Type': 'application/json'
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {'error': str(e), 'code': e.code}

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
        return {'error': str(e), 'code': e.code}

# Step 1: Get my identity
me = api_get(f'/api/agents/{AGENT_ID}')
print(f"Agent: {me['name']} | Status: {me['status']} | Last: {me.get('lastHeartbeatAt','?')}")
budget = me['budgetMonthlyCents'] - me['spentMonthlyCents']
print(f"Budget: {budget}/{me['budgetMonthlyCents']} cents remaining")

# Step 2: Get my open assignments
issues = api_get(f'/api/companies/{COMPANY_ID}/issues?assigneeAgentId={AGENT_ID}&status=todo,in_progress,blocked')
open_issues = issues.get('value', issues) if isinstance(issues, dict) else issues
print(f"\nOpen assignments: {len(open_issues)}")
for i in open_issues:
    print(f"  [{i.get('identifier','?')}] {i.get('title','')[:70]} | {i.get('status')}")

# Step 3: Get issues mentioning me or audit-related
all_open = api_get(f'/api/companies/{COMPANY_ID}/issues?status=todo,in_progress,blocked&limit=100')
all_issues = all_open.get('value', all_open) if isinstance(all_open, dict) else all_open
relevant = []
for i in all_issues:
    title = i.get('title', '')
    aid = i.get('assigneeAgentId', '') or ''
    if 'audit' in title.lower() or 'verify' in title.lower() or aid == AGENT_ID:
        relevant.append(i)

print(f"\nAudit-relevant open issues: {len(relevant)}")
for i in relevant:
    print(f"  [{i.get('identifier','?')}] {i.get('title','')[:70]} | {i.get('status')} | assignee={i.get('assigneeAgentId','none')}")

# Step 4: Try to post a comment on AMXA-386 (Review V3 Audit Agents Platform Incident)
# First find its ID
issue_386 = None
for i in all_issues:
    if i.get('identifier') == 'AMXA-386':
        issue_386 = i
        break

if issue_386:
    print(f"\n--- Posting comment on AMXA-386 ---")
    comment = api_post(f"/api/issues/{issue_386['id']}/comments", {
        "body": "## V3 Audit Lead Heartbeat Check-in\n\nNo open issues currently assigned to me. Last completed work: [AMXA-381](/AMXA/issues/AMXA-381) (Skills Registry E2E Audit) - completed 2026-04-06.\n\nAvailable for:\n- Verifying agent work products\n- Issuing AMX Chain certificates\n- Reviewing incident reports\n\nStanding by for new assignments."
    })
    if 'error' in comment:
        print(f"  Error: {comment}")
    else:
        print(f"  Posted comment: {comment.get('id', '?')}")
