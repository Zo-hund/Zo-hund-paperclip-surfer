import json, urllib.request

BOARD_TOKEN = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
API_BASE = 'http://127.0.0.1:3100'
COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52'

def api_get(path):
    req = urllib.request.Request(API_BASE + path, headers={'Authorization': 'Bearer ' + BOARD_TOKEN})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

# Get AMXA-386 - it should be done now
issues = api_get('/api/companies/%s/issues?q=AMXA-386' % COMPANY_ID)
issue_list = issues.get('value', issues) if isinstance(issues, dict) else issues
issue = next((i for i in issue_list if i.get('identifier') == 'AMXA-386'), None)
if issue:
    print("AMXA-386:")
    print("  Status: %s" % issue['status'])
    print("  Completed: %s" % issue.get('completedAt', '?'))
    print("  Started: %s" % issue.get('startedAt', '?'))
    print("  Execution: %s" % issue.get('executionRunId', '?'))
    
    # Check comments
    comments = api_get("/api/issues/%s/comments" % issue['id'])
    comment_list = comments.get('value', comments) if isinstance(comments, dict) else comments
    print("\n  Comments (%d):" % len(comment_list))
    for c in comment_list:
        ts = c.get('createdAt', '')[:16]
        author = c.get('authorAgentId') or c.get('authorUserId', '?')
        body = c.get('body', '')[:100]
        print("    [%s] %s: %s" % (ts, author, body))

# Dashboard
dash = api_get('/api/companies/%s/dashboard' % COMPANY_ID)
print("\nDASHBOARD:")
print("  Open: %d | In Progress: %d | Blocked: %d | Done: %d" % (
    dash['tasks']['open'], dash['tasks']['inProgress'],
    dash['tasks']['blocked'], dash['tasks']['done']))

# Check for other audit issues
all_open = api_get('/api/companies/%s/issues?status=todo,in_progress,blocked&limit=100' % COMPANY_ID)
all_issues = all_open.get('value', all_open) if isinstance(all_open, dict) else all_open
audit = []
for i in all_issues:
    t = i.get('title', '')
    aid = i.get('assigneeAgentId', '') or ''
    if 'audit' in t.lower() or 'v3' in t.lower() or aid == 'e115eeab':
        audit.append(i)
print("\nRemaining audit issues: %d" % len(audit))
for i in audit:
    print("  [%s] %s | %s" % (i.get('identifier','?'), i.get('status'), i.get('title','')[:60]))
