import json, urllib.request, sys

BOARD_TOKEN = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
API_BASE = 'http://127.0.0.1:3100'
COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52'
AGENT_ID = 'e115eeab-2657-468e-8160-6a9f741f8136'

def api_get(path):
    req = urllib.request.Request(API_BASE + path, headers={'Authorization': 'Bearer ' + BOARD_TOKEN})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def safe(s):
    return s.encode('ascii', 'replace').decode('ascii')

# Dashboard
dash = api_get('/api/companies/%s/dashboard' % COMPANY_ID)
print("DASHBOARD:")
print("  Tasks: open=%d in_progress=%d blocked=%d done=%d" % (
    dash['tasks']['open'], dash['tasks']['inProgress'],
    dash['tasks']['blocked'], dash['tasks']['done']))

# My status
me = api_get('/api/agents/%s' % AGENT_ID)
budget = me['budgetMonthlyCents'] - me['spentMonthlyCents']
print("\nMY STATUS:")
print("  Agent: %s | Status: %s" % (me['name'], me['status']))
print("  Budget: $%.2f / $%.2f remaining" % (budget/100, me['budgetMonthlyCents']/100))
print("  Last heartbeat: %s" % me.get('lastHeartbeatAt', '?'))

# Remaining audit issues
all_open = api_get('/api/companies/%s/issues?status=todo,in_progress,blocked&limit=100' % COMPANY_ID)
all_issues = all_open.get('value', all_open) if isinstance(all_open, dict) else all_open
audit = []
for i in all_issues:
    t = i.get('title', '')
    aid = i.get('assigneeAgentId', '') or ''
    if 'audit' in t.lower() or 'v3' in t.lower() or aid == AGENT_ID:
        audit.append(i)

print("\nREMAINING AUDIT-RELEVANT ISSUES: %d" % len(audit))
for i in audit:
    print("  [%s] status=%s assignee=%s" % (
        safe(i.get('identifier','?')), i.get('status'), 
        i.get('assigneeAgentId','none') or 'none'))
    print("    %s" % safe(i.get('title','')[:70]))

# All done issues assigned to me
done_issues = api_get('/api/companies/%s/issues?assigneeAgentId=%s&status=done&limit=5' % (COMPANY_ID, AGENT_ID))
done_list = done_issues.get('value', done_issues) if isinstance(done_issues, dict) else done_issues
print("\nMY RECENTLY COMPLETED: %d" % len(done_list))
for i in done_list:
    print("  [%s] completed=%s" % (i.get('identifier','?'), i.get('completedAt','?')[:10]))
    print("    %s" % safe(i.get('title','')[:70]))
