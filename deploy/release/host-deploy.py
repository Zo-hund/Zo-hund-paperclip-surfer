#!/usr/bin/env python3
"""Run only from the protected deployment job on the trusted Hostinger runner."""
import datetime
import json
import os
import pathlib
import re
import secrets
import shutil
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]

def command(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def capture(args):
    return subprocess.check_output(args, text=True).strip()

def validate_config(config, image):
    app = config["services"]["amx"]
    if app.get("image") != image or app.get("privileged"):
        raise ValueError("Invalid image or privileged application")
    if app.get("network_mode") == "host" or app.get("pid") == "host":
        raise ValueError("Host namespaces are prohibited")
    if app.get("group_add") or app.get("devices"):
        raise ValueError("Host groups and devices are prohibited")
    if "ALL" not in app.get("cap_drop", []) or not any(
            value in ("no-new-privileges:true", "no-new-privileges") for value in app.get("security_opt", [])):
        raise ValueError("Application capabilities must be dropped")
    for mount in app.get("volumes", []):
        if mount.get("target") != "/paperclip":
            raise ValueError("Only the application data mount is permitted")
    for port in app.get("ports", []):
        if port.get("host_ip") not in ("127.0.0.1", "::1"):
            raise ValueError("Application ports must bind loopback")
    for key in app.get("environment", {}):
        if key.startswith(("GHCR_", "VPS_SSH_", "REGISTRY_", "CLOUDFLARE_")):
            raise ValueError("Remove deployment credentials from the application env file")
    if app.get("environment", {}).get("PAPERCLIP_DEPLOYMENT_MODE") != "authenticated":
        raise ValueError("Authentication is required")

def main():
    target, image, sha = sys.argv[1:]
    if target not in ("staging", "hostinger-prod"):
        raise ValueError("Unknown deployment target")
    if not re.fullmatch(r"ghcr.io/zo-hund/amx-air-hubs@sha256:[0-9a-f]{64}", image):
        raise ValueError("A signed immutable image reference is required")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Invalid commit")
    os.umask(0o077)
    staging = target == "staging"
    directory = pathlib.Path("/opt/amx/staging" if staging else "/root/paperclip/deploy/vps")
    project = "amx-staging" if staging else "paperclip"
    env_file = directory / (".env.staging" if staging else ".env.vps")
    directory.mkdir(parents=True, exist_ok=True)
    if staging:
        # The existing generic production Compose network is named paperclip.
        command(["docker", "network", "inspect", "paperclip"], stdout=subprocess.DEVNULL)
        if not env_file.exists():
            env_file.write_text("\n".join(f"{key}={secrets.token_hex(32)}" for key in
                ("POSTGRES_PASSWORD", "BETTER_AUTH_SECRET", "PAPERCLIP_AGENT_JWT_SECRET"))
                + "\nAMX_PROXY_NETWORK=paperclip\n", encoding="utf-8")
    elif not env_file.is_file():
        raise ValueError("Existing production configuration is missing")
    if env_file.stat().st_mode & 0o077:
        raise ValueError("Private environment file must have mode 600")
    if not staging:
        staged_image = capture(["docker", "inspect", "--format", "{{.Config.Image}}", "amx-staging-amx-1"])
        if staged_image != image:
            raise ValueError("Staging no longer runs the approved production digest")
        command([sys.executable, str(ROOT / "deploy/release/smoke.py"), "https://staging.amx-air-hubs.cc"])
        # This record is operator supplied after an actual restore exercise;
        # the pipeline never creates or simulates this evidence.
        recovery = json.loads((directory / "release-recovery.json").read_text())
        tested = datetime.datetime.fromisoformat(recovery["restore_tested_at"].replace("Z", "+00:00"))
        age = (datetime.datetime.now(datetime.timezone.utc) - tested).total_seconds()
        if (recovery.get("image") != image or recovery.get("sha") != sha
                or recovery.get("schema_backward_compatible") is not True
                or not recovery.get("restore_report") or not 0 <= age <= 7 * 86400):
            raise ValueError("Production needs matching, current restore and schema-compatibility evidence")
    template = ROOT / ("deploy/release/compose.staging.yml" if staging else "deploy/vps/docker-compose.vps.yml")
    candidate = directory / "compose.governed.yml"
    shutil.copyfile(template, candidate)
    os.environ["AMX_IMAGE"] = image
    compose = ["docker", "compose", "--project-name", project, "--env-file", str(env_file), "-f", str(candidate)]
    config = json.loads(capture(compose + ["config", "--format", "json"]))
    validate_config(config, image)
    app = config["services"]["amx"]
    # No rebuilding and no auxiliary services are included in production promotion.
    command(compose + ["pull", "amx"])
    old_id = capture(compose + ["ps", "-q", "amx"])
    old_image = capture(["docker", "inspect", "--format", "{{.Config.Image}}", old_id]) if old_id else None
    old_image_id = capture(["docker", "inspect", "--format", "{{.Image}}", old_id]) if old_id else None
    if not staging and not old_id:
        raise ValueError("Existing production service not found; refusing to create a replacement stack")
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = directory / "release-state" / stamp
    backup.mkdir(parents=True)
    (backup / "before.json").write_text(json.dumps({"image": old_image, "next": image, "sha": sha}))
    shutil.copyfile(env_file, backup / "environment.private")
    if not staging:
        # Quiesce application writes before a consistent DB + encrypted storage backup.
        command(compose + ["stop", "amx"])
        try:
            database_url = app["environment"]["DATABASE_URL"]
            db_env = dict(os.environ, AMX_BACKUP_DATABASE_URL=database_url)
            with (backup / "database.dump").open("wb") as output:
                command(["docker", "run", "--rm", "--network", project,
                         "-e", "AMX_BACKUP_DATABASE_URL", "postgres:17-alpine",
                         "sh", "-c", 'exec pg_dump --dbname="$AMX_BACKUP_DATABASE_URL" --format=custom'],
                        env=db_env, stdout=output)
            if not (backup / "database.dump").stat().st_size:
                raise ValueError("Empty database backup")
            command(["docker", "cp", old_id + ":/paperclip", str(backup / "paperclip")])
        except Exception:
            command(compose + ["start", "amx"])
            raise
    try:
        if staging:
            command(compose + ["up", "-d", "--no-build", "--wait", "--wait-timeout", "180", "db", "amx"])
        else:
            command(compose + ["up", "-d", "--no-deps", "--no-build", "--wait", "--wait-timeout", "180", "amx"])
        port = "3102" if staging else "3100"
        command([sys.executable, str(ROOT / "deploy/release/smoke.py"), "http://127.0.0.1:" + port])
        url = "https://staging.amx-air-hubs.cc" if staging else "https://amx-air-hubs.cc"
        for attempt in range(12):
            result = subprocess.run([sys.executable, str(ROOT / "deploy/release/smoke.py"), url],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if result.returncode == 0:
                break
            time.sleep(10)
        else:
            raise ValueError("Public HTTPS health/authentication gate failed")
        current_id = capture(compose + ["ps", "-q", "amx"])
        if capture(["docker", "inspect", "--format", "{{.Config.Image}}", current_id]) != image:
            raise ValueError("Running image differs from tested release")
    except Exception:
        if old_image and not staging:
            os.environ["AMX_IMAGE"] = old_image_id
            # Recovery record explicitly asserts schema backward compatibility.
            command(compose + ["up", "-d", "--no-deps", "--no-build", "--wait", "--wait-timeout", "180", "amx"])
        raise
    env_text = env_file.read_text()
    env_text = re.sub(r"^AMX_IMAGE=.*(?:\n|$)", "", env_text, flags=re.MULTILINE)
    pending = env_file.with_suffix(".pending")
    pending.write_text(env_text.rstrip() + "\nAMX_IMAGE=" + image + "\n")
    pending.replace(env_file)
    (backup / "success.json").write_text(json.dumps({"image": image, "sha": sha, "target": target}))
    print(f"Verified {target}: {image}")

if __name__ == "__main__":
    main()
