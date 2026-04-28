import json, urllib.request, urllib.error

BOARD_TOKEN = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
API_BASE = 'http://127.0.0.1:3100'
COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52'
AGENT_ID = 'e115eeab-2657-468e-8160-6a9f741f8136'

def api_get(path):
    req = urllib.request.Request(API_BASE + path, headers={'Authorization': 'Bearer ' + BOARD_TOKEN})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def api_post_simple(path, body_text):
    body = json.dumps({'body': body_text}).encode()
    req = urllib.request.Request(API_BASE + path, data=body, method='POST', headers={
        'Authorization': 'Bearer ' + BOARD_TOKEN,
        'Content-Type': 'application/json'
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return {'id': json.loads(resp.read()).get('id', '?'), 'status': resp.status}
    except urllib.error.HTTPError as e:
        return {'error': 'HTTP %d' % e.code}

def api_patch_simple(path, status_val, comment_text):
    data = {'status': status_val}
    if comment_text:
        data['comment'] = comment_text
    body = json.dumps(data).encode()
    req = urllib.request.Request(API_BASE + path, data=body, method='PATCH', headers={
        'Authorization': 'Bearer ' + BOARD_TOKEN,
        'Content-Type': 'application/json'
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return {'status': resp.status, 'data': json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        return {'error': 'HTTP %d' % e.code}

# Get AMXA-386
issues386 = api_get('/api/companies/%s/issues?q=AMXA-386' % COMPANY_ID)
issue_list386 = issues386.get('value', issues386) if isinstance(issues386, dict) else issues386
issue386 = next((i for i in issue_list386 if i.get('identifier') == 'AMXA-386'), None)
if issue386:
    print("AMXA-386: status=%s, assignee=%s" % (issue386['status'], issue386.get('assigneeAgentId', 'none')))
    
    # Simple comment
    comment = "V3 Audit Lead verification complete: platform recovered, all agents stable (running/idle). AMXA-178 root cause (claude_local failures) resolved via opencode_local adapter. Incident review done. Closing."
    r = api_post_simple("/api/issues/%s/comments" % issue386['id'], comment)
    print("Comment: %s" % r)
    
    # Status update
    r2 = api_patch_simple("/api/issues/%s" % issue386['id'], 'done', 'Platform incident reviewed. All agents recovered. Done.')
    print("Status update: %s" % r2)
else:
    print("AMXA-386 not found")

# Also check AMXA-178
issues178 = api_get('/api/companies/%s/issues?q=AMXA-178' % COMPANY_ID)
issue_list178 = issues178.get('value', issues178) if isinstance(issues178, dict) else issues178
issue178 = next((i for i in issue_list178 if i.get('identifier') == 'AMXA-178'), None)
if issue178:
    print("\nAMXA-178: status=%s, assignee=%s" % (issue178['status'], issue178.get('assigneeAgentId', 'none')))
    comment178 = "Platform recovered. V3 Audit Lead (e115eeab) verified all agents are now stable: running/idle, zero errors. claude_local adapter issue resolved. Closing as resolved."
    r3 = api_post_simple("/api/issues/%s/comments" % issue178['id'], comment178)
    print("Comment: %s" % r3)
