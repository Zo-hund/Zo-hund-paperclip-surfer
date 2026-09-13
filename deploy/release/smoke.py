#!/usr/bin/env python3
"""Read-only health and authentication gate; redirects cannot masquerade as success."""
import json
import sys
import urllib.error
import urllib.request

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def check(base):
    opener = urllib.request.build_opener(NoRedirect)
    opener.addheaders = [("User-Agent", "AMX-Release-Health/1.0")]
    with opener.open(base.rstrip("/") + "/api/health", timeout=15) as response:
        if response.status != 200 or json.load(response).get("status") != "ok":
            raise ValueError("Health endpoint is not healthy")
    try:
        with opener.open(base.rstrip("/") + "/api/companies", timeout=15):
            raise ValueError("Unauthenticated company access was allowed")
    except urllib.error.HTTPError as error:
        if error.code not in (401, 403):
            raise ValueError(f"Unexpected authentication response: {error.code}")
    print("Health and unauthenticated-access rejection passed")

if __name__ == "__main__":
    check(sys.argv[1])
