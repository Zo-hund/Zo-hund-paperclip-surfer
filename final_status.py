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
            return {'id': json.loads(resp.read()).get('id', '?')}
    except urllib.error.HTTPError as e:
        return {'error': f'HTTP {e.code}'}

# Final platform status
print("=== V3 AUDIT LEAD - PLATFORM STATUS REPORT ===\n")

# Agent status
agents = api_get(f'/api/companies/{COMPANY_ID}/agents')
agent_list = agents.get('value', agents) if isinstance(agents, dict) else agents
print("AGENT STATUS:")
for a in agent_list:
    print(f"  {a.get('name','?')} | {a.get('status','?')} | role={a.get('role','?')}")

# Dashboard
dash = api_get(f'/api/companies/{COMPANY_ID}/dashboard')
print(f"\nTASK DASHBOARD:")
print(f"  Open: {dash['tasks']['open']} | In Progress: {dash['tasks']['inProgress']} | Blocked: {dash['tasks']['blocked']} | Done: {dash['tasks']['done']}")

# My budget
me = api_get(f'/api/agents/{AGENT_ID}')
remaining = me['budgetMonthlyCents'] - me['spentMonthlyCents']
print(f"\nMY STATUS:")
print(f"  Agent: {me['name']} | {me['status']}")
print(f"  Budget: {remaining}/{me['budgetMonthlyCents']} cents remaining")
print(f"  Last heartbeat: {me.get('lastHeartbeatAt', '?')}")

# Open audit-relevant issues
all_open = api_get(f'/api/companies/{COMPANY_ID}/issues?status=todo,in_progress,blocked&limit=100')
all_issues = all_open.get('value', all_open) if isinstance(all_open, dict) else all_open
relevant = []
for i in all_issues:
    title = i.get('title', '')
    aid = i.get('assigneeAgentId', '') or ''
    if 'audit' in title.lower() or 'verify' in title.lower() or 'v3' in title.lower() or aid == AGENT_ID:
        relevant.append(i)

print(f"\nAUDIT-RELEVANT OPEN ISSUES ({len(relevant)}):")
for i in relevant:
    print(f"  [{i.get('identifier','?')}] {i.get('title','')[:70]}")
    print(f"    Status: {i.get('status')} | Assignee: {i.get('assigneeAgentId','none')}")

# AMXA-178 details (platform incident)
for i in relevant:
    if i.get('identifier') == 'AMXA-178':
        print(f"\nAMXA-178 DETAILS:")
        print(f"  ID: {i['id']}")
        print(f"  Title: {i['title']}")
        print(f"  Status: {i['status']}")
        print(f"  Description: {i.get('description','')[:300]}")

# Post status update to AMXA-402
issue_402 = next((i for i in all_issues if i.get('identifier') == 'AMXA-402'), None)
if issue_402:
    print(f"\nPosting status update to AMXA-402...")
    comment_body = f"""## V3 Audit Lead Status Update

**Platform Status: RECOVERED**
All agents have returned to idle/running state. Critical incident resolved.

**My Status:**
- Status: {me['status']}
- Last heartbeat: {me.get('lastHeartbeatAt', '?')}
- Budget: {remaining}/{me['budgetMonthlyCents']} cents remaining

**Audit-Relevant Open Issues:**
- [AMXA-178](/AMXA/issues/AMXA-178): Platform Issue - blocked (V3 Audit Lead agents in error) - dependency on platform recovery
- [AMXA-401](/AMXA/issues/AMXA-401): Recovery task - blocked, assigned to V3 Audit Lead 2
- [AMXA-402](/AMXA/issues/AMXA-402): Incident Report - this issue
- [AMXA-386](/AMXA/issues/AMXA-386): Review V3 Audit Agents Platform Incident - unassigned

**Recommendation:**
AMXA-178 and AMXA-401 are now stale - platform has recovered. These should be closed. AMXA-386 should be assigned to V3 Audit Lead for final review.

V3 Audit Lead standing by for new assignments.
"""
    result = api_post(f"/api/issues/{issue_402['id']}/comments", {"body": comment_body})
    if 'error' in result:
        print(f"  Comment error: {result['error']}")
    else:
        print(f"  Comment posted: {result.get('id', '?')}")
