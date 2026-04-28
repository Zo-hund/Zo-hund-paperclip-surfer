import json, urllib.request

# Get CEO agent info
url = 'http://127.0.0.1:3100/api/agents/482b3bd0-f6c3-44b6-82b4-83c2c97187d7'
req = urllib.request.Request(url, headers={'Authorization': 'Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        print(f"CEO: {data['name']} | Status: {data['status']} | Role: {data['role']}")
        print(f"URL Key: {data['urlKey']}")
except Exception as e:
    print('Error:', type(e).__name__, str(e)[:300])

# Get AMXA-386 issue details
print("\n--- AMXA-386 ---")
url2 = 'http://127.0.0.1:3100/api/companies/dece557d-8849-4040-b8ad-e0e235a54b52/issues?q=AMXA-386'
req2 = urllib.request.Request(url2, headers={'Authorization': 'Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc'})
try:
    with urllib.request.urlopen(req2) as resp:
        data2 = json.loads(resp.read())
        issues = data2.get('value', data2) if isinstance(data2, dict) else data2
        for i in issues:
            if i.get('identifier') == 'AMXA-386':
                print(f"ID: {i['id']}")
                print(f"Title: {i['title']}")
                print(f"Status: {i['status']}")
                print(f"Assignee: {i['assigneeAgentId']}")
                print(f"Description: {i['description'][:500]}")
except Exception as e:
    print('Error:', type(e).__name__, str(e)[:300])
