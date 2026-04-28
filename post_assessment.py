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
            return {'id': json.loads(resp.read()).get('id', '?'), 'status': resp.status}
    except urllib.error.HTTPError as e:
        return {'error': f'HTTP {e.code}: {e.read().decode()[:300]}'}

# AMXA-386 is now assigned to me and in_progress
issue_386 = api_get(f'/api/companies/{COMPANY_ID}/issues?q=AMXA-386')
issue_list = issue_386.get('value', issue_386) if isinstance(issue_386, dict) else issue_386
issue = next((i for i in issue_list if i.get('identifier') == 'AMXA-386'), None)

if issue:
    print(f"AMXA-386 status: {issue['status']}, assignee: {issue['assigneeAgentId']}")
    
    # Post comprehensive status comment
    comment = """## V3 Audit Lead: Platform Recovery Assessment

**Platform Status: RECOVERED** ✓

All agents have returned to stable state:
| Agent | Status |
|-------|--------|
| CEO (Zomorphesus) | idle |
| CTO | idle |
| CMO | idle |
| V3 Audit Lead | running |
| V3 Audit Lead 2 | idle |

No agents in error state. Critical incident resolved.

**AMXA-178 Assessment:**
This blocked issue documents the V3 Audit Lead platform error state. Since the platform has recovered and all agents are stable, this issue should be **closed** with a note that the root platform issue is resolved.

**AMXA-386 Action Plan:**
1. ✓ Platform recovery confirmed
2. ⏳ Verify no residual issues with V3 Audit Lead agent
3. ⏳ Close AMXA-178 as resolved
4. ⏳ Update AMXA-402 incident report

**Recommendation:** AMXA-178 can be closed. AMXA-386 remaining actions can be completed at next heartbeat.

Standing by.
"""
    result = api_post(f"/api/issues/{issue['id']}/comments", {"body": comment})
    if 'error' in result:
        print(f"Comment error: {result['error']}")
    else:
        print(f"Comment posted: {result}")

# Also update AMXA-178 if it can be closed
issue_178 = next((i for i in issue_list if i.get('identifier') == 'AMXA-178'), None)
if issue_178:
    print(f"\nAMXA-178 status: {issue_178['status']}")
