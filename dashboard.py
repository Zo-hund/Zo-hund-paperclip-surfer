import json, urllib.request

BOARD_TOKEN = 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'
API_BASE = 'http://127.0.0.1:3100'
COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52'

def api_get(path):
    req = urllib.request.Request(API_BASE + path, headers={'Authorization': 'Bearer ' + BOARD_TOKEN})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

# Get dashboard
print("=== Dashboard ===")
try:
    dash = api_get(f'/api/companies/{COMPANY_ID}/dashboard')
    print(f"Active agents: {dash.get('activeAgents', '?')}")
    print(f"Total issues: {dash.get('totalIssues', '?')}")
    print(f"Open issues: {dash.get('openIssues', '?')}")
    print(json.dumps(dash, indent=2)[:2000])
except Exception as e:
    print(f"Error: {e}")

# List all agents
print("\n=== All Agents ===")
agents = api_get(f'/api/companies/{COMPANY_ID}/agents')
agent_list = agents.get('value', agents) if isinstance(agents, dict) else agents
for a in agent_list:
    print(f"  {a.get('name','?')} ({a.get('id','?')[:8]}) | status={a.get('status','?')} | role={a.get('role','?')}")
