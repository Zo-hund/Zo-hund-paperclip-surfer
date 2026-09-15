#!/usr/bin/env python3
"""Device-login regression for a disposable CI instance ONLY; creates one challenge."""
import json
import sys
import urllib.error
import urllib.request


def check(base):
    def call(path, body=None, token=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(base.rstrip("/") + "/api" + path,
                                     data=None if body is None else json.dumps(body).encode(),
                                     headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, {}

    status, challenge = call("/cli-auth/challenges", {
        "command": "paperclipai company list", "clientName": "isolated-security-smoke",
        "requestedAccess": "board",
    })
    if status != 201:
        raise ValueError("Device-login challenge creation failed")
    # Possession of the issued pending token must not grant board access.
    status, _ = call("/companies", token=challenge["boardApiToken"])
    if status not in (401, 403):
        raise ValueError("An unapproved device-login token granted access")
    status, _ = call("/cli-auth/challenges/" + challenge["id"] + "/approve",
                     {"token": challenge["token"]}, token=challenge["boardApiToken"])
    if status not in (401, 403):
        raise ValueError("A pending device-login token approved itself")
    status, _ = call("/skills/available")
    if status not in (401, 403):
        raise ValueError("Anonymous host skill enumeration was allowed")
    status, health = call("/health")
    if status != 200 or set(health) - {
        "status", "deploymentMode", "bootstrapStatus", "bootstrapInviteActive"
    }:
        raise ValueError("Public health disclosed operational metadata")
    print("Pending CLI token, self-approval, host skills, and public health regressions passed")


if __name__ == "__main__":
    check(sys.argv[1])
