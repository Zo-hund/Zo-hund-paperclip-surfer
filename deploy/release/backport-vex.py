#!/usr/bin/env python3
"""Generate short-lived VEX only after verifying reviewed fork source in the image.

Never use this document by itself: verify-filter must compare the enforcing scan
to the original report, rejecting any exclusion outside the exact reviewed paths.
"""
import argparse
import collections
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess


def findings(report):
    if report.get("SchemaVersion") != 2 or not isinstance(report.get("Results"), list):
        raise ValueError("Missing or unsupported Trivy report")
    return [v for result in report["Results"] for v in result.get("Vulnerabilities", []) or []
            if v["Severity"] in ("HIGH", "CRITICAL")]


def identity(v):
    return (v["VulnerabilityID"], v["PkgName"], v.get("PkgPath", ""),
            v["InstalledVersion"], v["Severity"], v.get("PkgIdentifier", {}).get("PURL", ""))


def allowed_identities(manifest, today=None):
    today = today or dt.date.today()
    if not dt.date.fromisoformat(manifest["reviewed_on"]) <= today < dt.date.fromisoformat(manifest["expires_on"]):
        raise ValueError("Backport review is expired or future-dated")
    if not manifest.get("source_sha256") or not manifest.get("reviewer"):
        raise ValueError("Backport source review is missing")
    entries = manifest["findings"]
    if not entries or any(not e.get("evidence") for e in entries):
        raise ValueError("Every disposition requires review evidence")
    return {identity(v) for v in entries}


def check_source(manifest, root):
    for relative, expected in manifest["source_sha256"].items():
        path = Path(relative)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("Invalid reviewed source path")
        data = (root / path).read_bytes().replace(b"\r\n", b"\n")
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError("Reviewed source changed: " + relative)


def check_filter(raw, filtered, manifest):
    allowed = allowed_identities(manifest)
    before = collections.Counter(identity(v) for v in findings(raw))
    after = collections.Counter(identity(v) for v in findings(filtered))
    if raw.get("ArtifactName") != filtered.get("ArtifactName") or raw.get("Metadata", {}).get("ImageID") != filtered.get("Metadata", {}).get("ImageID"):
        raise ValueError("Scans do not refer to the same image")
    if after - before:
        raise ValueError("Scan results changed; rescan the same database and image")
    removed = before - after
    if any(key not in allowed for key in removed):
        raise ValueError("VEX removed an unreviewed finding or package location")
    if after:
        raise ValueError("Unresolved HIGH/CRITICAL findings remain")
    return sum(removed.values())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["generate", "verify-filter"])
    parser.add_argument("--manifest", default="deploy/release/backports.json")
    parser.add_argument("--raw", required=True)
    parser.add_argument("--filtered")
    parser.add_argument("--image")
    parser.add_argument("--output", default="backports.vex.json")
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_text())
    allowed = allowed_identities(manifest)
    raw = json.loads(Path(args.raw).read_text())
    if args.mode == "verify-filter":
        count = check_filter(raw, json.loads(Path(args.filtered).read_text()), manifest)
        print(f"Security gate passed: {count} exact reviewed backport findings; zero unresolved HIGH/CRITICAL")
        return
    if not args.image:
        raise ValueError("Exact built image is required")
    check_source(manifest, Path.cwd())
    image_id = subprocess.check_output(["docker", "image", "inspect", "--format", "{{.Id}}", args.image], text=True).strip()
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", image_id) or raw.get("Metadata", {}).get("ImageID") != image_id:
        raise ValueError("Raw report is not for the inspected image")
    # Read the reviewed paths inside the image without starting the application,
    # mounting the host, enabling network, or accessing environment credentials.
    script = "import sys,json,hashlib,pathlib; m=json.load(sys.stdin); print(json.dumps({p:hashlib.sha256((pathlib.Path('/app')/p).read_bytes().replace(b'\\r\\n',b'\\n')).hexdigest() for p in m}))"
    actual = json.loads(subprocess.check_output([
        "docker", "run", "--rm", "-i", "--network=none", "--read-only", "--cap-drop=ALL",
        "--security-opt=no-new-privileges:true", "--entrypoint=python3", args.image, "-c", script,
    ], input=json.dumps(manifest["source_sha256"]), text=True))
    if actual != manifest["source_sha256"]:
        raise ValueError("Image source differs from reviewed backport source")
    statements = []
    for v in findings(raw):
        if identity(v) not in allowed:
            continue
        evidence = next(e["evidence"] for e in manifest["findings"] if identity(e) == identity(v))
        statements.append({"vulnerability": {"name": v["VulnerabilityID"]},
            "products": [{"@id": v["PkgIdentifier"]["PURL"]}],
            "status": "fixed", "action_statement": evidence})
    document = {"@context": "https://openvex.dev/ns/v0.2.0",
        "@id": "urn:amx:backport-review:" + image_id,
        "author": manifest["reviewer"], "timestamp": manifest["reviewed_on"] + "T00:00:00Z",
        "version": 1, "statements": statements,
        "x-amx-image-id": image_id, "x-amx-expires-on": manifest["expires_on"]}
    Path(args.output).write_text(json.dumps(document, indent=2) + "\n")
    print(f"Verified reviewed source in {image_id}; generated {len(statements)} scoped dispositions")


if __name__ == "__main__":
    main()
