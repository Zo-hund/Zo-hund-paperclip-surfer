#!/usr/bin/env python3
"""Validate downloaded release metadata against a GitHub API workflow-run response."""
import json
import re
import sys

REPOSITORY = "Zo-hund/Zo-hund-paperclip-surfer"
IMAGE = "ghcr.io/zo-hund/amx-air-hubs"

def validate(run, release):
    if (run.get("repository", {}).get("full_name") != REPOSITORY
            or run.get("head_repository", {}).get("full_name") != REPOSITORY
            or run.get("path") != ".github/workflows/ci.yml"
            or run.get("event") != "push"
            or run.get("head_branch") != "experimental"
            or run.get("status") != "completed"
            or run.get("conclusion") != "success"):
        raise ValueError("Release requires successful experimental push CI in the source repository")
    sha = run.get("head_sha", "")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Invalid source commit")
    digest = release.get("digest", "")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise ValueError("An immutable image digest is required")
    expected = {"repository": REPOSITORY, "sha": sha, "run_id": str(run["id"]),
                "run_attempt": str(run["run_attempt"]), "image": IMAGE + "@" + digest}
    if any(str(release.get(key, "")) != value for key, value in expected.items()):
        raise ValueError("Release metadata does not match the successful CI run")
    return {"sha": sha, "digest": digest, "image": expected["image"]}

if __name__ == "__main__":
    try:
        result = validate(json.load(open(sys.argv[1])), json.load(open(sys.argv[2])))
        for key, value in result.items():
            print(f"{key}={value}")
    except (ValueError, KeyError, OSError) as error:
        sys.exit(str(error))
