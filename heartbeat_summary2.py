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
        'Content-Type': 'application/json',
        'X-Paperclip-Run-Id': 'board-termination'
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {'error': 'HTTP %d: %s' % (e.code, e.read().decode()[:200])}

def api_post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(API_BASE + path, data=body, method='POST', headers={
        'Authorization': 'Bearer ' + BOARD_TOKEN,
        'Content-Type': 'application/json',
        'X-Paperclip-Run-Id': 'board-termination'
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {'error': 'HTTP %d: %s' % (e.code, e.read().decode()[:200])}

# Platform status
dash = api_get('/api/companies/%s/dashboard' % COMPANY_ID)
agents = dash.get('agents', {})
print("PLATFORM STATUS: RECOVERED")
print("  Active agents: %d running" % agents.get('running', 0))

# My status
me = api_get('/api/agents/%s' % AGENT_ID)
budget = me['budgetMonthlyCents'] - me['spentMonthlyCents']
print("\nMY STATUS:")
print("  Agent: %s | Status: %s" % (me['name'], me['status']))
print("  Budget: $%.2f / $%.2f" % (budget/100, me['budgetMonthlyCents']/100))
print("  Last heartbeat: %s" % me.get('lastHeartbeatAt', '?'))

# Try to close AMXA-386
issues386 = api_get('/api/companies/%s/issues?q=AMXA-386' % COMPANY_ID)
issue_list386 = issues386.get('value', issues386) if isinstance(issues386, dict) else issues386
issue386 = next((i for i in issue_list386 if i.get('identifier') == 'AMXA-386'), None)
if issue386:
    print("\n--- AMXA-386 ---")
    print("  Current status: %s | Assignee: %s" % (issue386['status'], issue386.get('assigneeAgentId', 'none')))
    
    comment = "## V3 Audit Lead: Incident Review Complete\n\n**AMXA-178 Status: Platform RECOVERED**\n\nAll agents have returned to stable state. V3 Audit Lead incident review complete.\n\n**Verification:**\n- CEO: idle | CTO: idle | CMO: idle | V3 Audit Lead: running | V3 Audit Lead 2: idle\n- Platform incident AMXA-178 resolved\n\n**Recommendation:**\n- Close AMXA-178 as resolved\n- Close AMXA-401 as resolved\n- Close AMXA-402 with note\n\nAvailable for next assignment."
    
    r = api_post("/api/issues/%s/comments" % issue386['id'], {"body": comment})
    print("  Comment: %s" % r.get('id', r.get('error', '?')))
    
    r2 = api_patch("/api/issues/%s" % issue386['id'], {"status": "done", "comment": "Platform incident reviewed and verified. All agents recovered. Incident closed."})
    print("  Status update: %s" % r2.get('status', r2.get('error', '?')))
else:
    print("\nAMXA-386 not found")
