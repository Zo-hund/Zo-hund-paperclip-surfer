#!/usr/bin/env python3
"""Run only from the protected deployment job on the trusted Hostinger runner."""
import datetime
import ipaddress
import json
import os
import pathlib
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.parse import parse_qs, urlsplit

ROOT = pathlib.Path(__file__).resolve().parents[2]
DB_CLIENT_IMAGE = "postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873"
DB_CONTEXT_KEYS = ("DATABASE_URL", "PAPERCLIP_HOME", "PAPERCLIP_CONFIG", "PAPERCLIP_INSTANCE_ID", "PAPERCLIP_IN_WORKTREE", "HOME")


def private_capture(args, *, input=None, env=None, reject_stderr=False):
    """Never put inspected secrets, connection strings or command stderr in CI logs."""
    try:
        result = subprocess.run(args, input=input, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
    except (subprocess.TimeoutExpired, OSError):
        raise ValueError("Private database preflight could not finish safely") from None
    if result.returncode or (reject_stderr and result.stderr.strip()):
        raise ValueError("Private database preflight failed; production was not replaced") from None
    return result.stdout.strip()


def inspect_private(reference, image=False):
    args = ["docker", "image", "inspect", reference] if image else ["docker", "inspect", reference]
    return json.loads(private_capture(args))[0]


def container_env(values):
    return dict(value.split("=", 1) for value in values or [] if "=" in value)


def database_probe(args, started_at=None):
    script = (ROOT / "deploy/release/database-backup-probe.mjs").read_text(encoding="utf-8")
    invocation = json.dumps({"startedAt": started_at}) if started_at else "{}"
    script += "\ntry { console.log(JSON.stringify(await probeDatabase(" + invocation + "))); } catch { console.error('Database configuration could not be identified safely'); process.exit(1); }\n"
    return json.loads(private_capture(args + ["node", "--import", "/app/server/node_modules/tsx/dist/loader.mjs", "--input-type=module"], input=script))


def storage_mount(old, app):
    mounts = old.get("Mounts", [])
    storage = [mount for mount in mounts if mount.get("Destination") == "/paperclip"]
    if len(storage) != 1 or any(mount.get("Destination", "").startswith("/paperclip/") for mount in mounts):
        raise ValueError("Production storage mount cannot be identified safely")
    current = storage[0]
    proposed = app.get("volumes", [])
    if len(proposed) != 1 or proposed[0].get("target") != "/paperclip" or proposed[0].get("read_only"):
        raise ValueError("Candidate must preserve writable application storage")
    candidate = proposed[0]
    if current.get("Type") != candidate.get("type") or current.get("Type") not in ("bind", "volume"):
        raise ValueError("Candidate changes the application storage type")
    old_source = current.get("Source") if current["Type"] == "bind" else current.get("Name")
    new_source = candidate.get("source")
    if not old_source or old_source != new_source:
        raise ValueError("Candidate changes the application storage source")
    return current


def database_identity(state):
    if state.get("mode") == "external-postgres" and isinstance(state.get("database_url"), str):
        return (state["mode"], state["database_url"])
    if state.get("mode") == "embedded-postgres":
        location = state.get("real_data_dir")
        if not isinstance(location, str) or not location.startswith("/paperclip/") or ".." in pathlib.PurePosixPath(location).parts:
            raise ValueError("Embedded database is not inside application storage")
        if not re.fullmatch(r"[0-9]{1,2}", str(state.get("postgres_major", ""))):
            raise ValueError("Embedded database version is unidentified")
        return (state["mode"], location, state["postgres_major"])
    raise ValueError("Unsupported effective database configuration")


def backup_plan(old_id, app, image):
    old = inspect_private(old_id)
    if not old.get("State", {}).get("Running"):
        raise ValueError("Existing production must be running for database preflight")
    if not old["State"].get("StartedAt"):
        raise ValueError("Existing production start time is unidentified")
    mount = storage_mount(old, app)
    if app.get("command") or app.get("entrypoint"):
        raise ValueError("Custom application startup needs separate database review")
    old_db = database_probe(["docker", "exec", "-i", old_id], old["State"].get("StartedAt"))
    old_identity = database_identity(old_db)
    # Compose omits image defaults from its environment map. Probe the real image,
    # read-only and off-network, with the actual old storage and proposed overrides.
    image_config = inspect_private(image, image=True).get("Config", {})
    environment = container_env(image_config.get("Env"))
    for key, value in app.get("environment", {}).items():
        if key in DB_CONTEXT_KEYS:
            if value is None:
                raise ValueError("Unresolved candidate database environment")
            environment[key] = str(value)
    source = mount["Source"] if mount["Type"] == "bind" else mount["Name"]
    mount_spec = f"type={mount['Type']},src={source},dst=/paperclip,readonly"
    if "," in source or "\n" in source:
        raise ValueError("Unsupported application storage source")
    with tempfile.TemporaryDirectory(prefix="amx-db-preflight-") as temporary:
        env_path = pathlib.Path(temporary) / "database-context.private"
        values = {key: environment[key] for key in DB_CONTEXT_KEYS if key in environment}
        if any("\n" in value or "\r" in value for value in values.values()):
            raise ValueError("Unsupported candidate database environment")
        env_path.write_text("".join(f"{key}={value}\n" for key, value in values.items()), encoding="utf-8")
        env_path.chmod(0o600)
        args = ["docker", "run", "--rm", "-i", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true",
                "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=16m", "--mount", mount_spec, "--env-file", str(env_path)]
        for key, flag in (("working_dir", "--workdir"), ("user", "--user")):
            if app.get(key):
                args += [flag, str(app[key])]
        args += ["--entrypoint", "node", image]
        script = (ROOT / "deploy/release/database-backup-probe.mjs").read_text(encoding="utf-8")
        script += "\ntry { console.log(JSON.stringify(await probeDatabase())); } catch { console.error('Candidate database could not be identified safely'); process.exit(1); }\n"
        candidate_db = json.loads(private_capture(args + ["--import", "/app/server/node_modules/tsx/dist/loader.mjs", "--input-type=module"], input=script))
    if database_identity(candidate_db) != old_identity:
        raise ValueError("Candidate changes the effective database mode or target")
    plan = {"database": old_db, "started_at": old["State"]["StartedAt"]}
    if old_db["mode"] == "embedded-postgres":
        # The source cluster is PG18. A different major requires a separately
        # reviewed matching physical-backup client and exact-image recovery.
        if old_db["postgres_major"] != "18":
            raise ValueError("Embedded database major is unsupported by the pinned control client")
        client_version = private_capture(["docker", "run", "--rm", "--network=none", "--read-only", "--cap-drop=ALL",
                                          "--security-opt=no-new-privileges:true", "--entrypoint", "pg_controldata", DB_CLIENT_IMAGE, "--version"])
        if not re.search(r"PostgreSQL\) 18(?:\.|\s|$)", client_version):
            raise ValueError("Pinned control client is not PostgreSQL18")
    else:
        try:
            url = urlsplit(old_db["database_url"])
            host = url.hostname
            try:
                address = ipaddress.ip_address(host or "")
                loopback = address.is_loopback or address.is_unspecified or bool(getattr(address, "ipv4_mapped", None) and address.ipv4_mapped.is_loopback)
            except ValueError:
                loopback = False
            if (url.scheme not in ("postgres", "postgresql") or not host or host.lower().rstrip(".") == "localhost" or loopback
                    or "," in host or not url.path.strip("/") or any(key in parse_qs(url.query) for key in ("host", "hostaddr", "service"))):
                raise ValueError()
        except Exception:
            raise ValueError("Unsupported external database target") from None
        networks = list(old.get("NetworkSettings", {}).get("Networks", {}))
        if len(networks) != 1 or networks[0] in ("host", "none"):
            raise ValueError("External database backup network cannot be identified safely")
        plan["network"] = networks[0]
        env = dict(os.environ, AMX_BACKUP_DATABASE_URL=old_db["database_url"], PGCONNECT_TIMEOUT="10")
        version = private_capture(["docker", "run", "--rm", "--network", networks[0], "-e", "AMX_BACKUP_DATABASE_URL", "-e", "PGCONNECT_TIMEOUT", DB_CLIENT_IMAGE,
                                   "sh", "-c", 'exec psql --dbname="$AMX_BACKUP_DATABASE_URL" -X -A -t -c "SHOW server_version_num"'], env=env)
        if not version.isdigit() or not 10 <= int(version) // 10000 <= 18:
            raise ValueError("External PostgreSQL version is unsupported by the backup client")
    return plan


def backup_metadata(plan):
    state = plan["database"]
    result = {"mode": state["mode"], "kind": "cold-storage" if state["mode"] == "embedded-postgres" else "logical-and-storage"}
    if state["mode"] == "embedded-postgres":
        result.update(embedded_data_relative=str(pathlib.PurePosixPath(state["real_data_dir"]).relative_to("/paperclip")), postgres_major=state["postgres_major"])
    return result


def quiesced_backup(compose, old_id, backup, plan):
    # Plan validation is performed before this function can stop production.
    database_identity(plan["database"])
    current = inspect_private(old_id).get("State", {})
    if not current.get("Running") or current.get("StartedAt") != plan.get("started_at"):
        raise ValueError("Production changed after database preflight")
    current_db = database_probe(["docker", "exec", "-i", old_id], plan["started_at"])
    if database_identity(current_db) != database_identity(plan["database"]):
        raise ValueError("Effective database changed before backup")
    try:
        command(compose + ["stop", "--timeout", "60", "amx"])
        state = inspect_private(old_id).get("State", {})
        if state.get("Running") is not False or state.get("ExitCode") != 0:
            raise ValueError("Application did not stop cleanly; refusing the backup")
        database = plan["database"]
        if database["mode"] == "external-postgres":
            env = dict(os.environ, AMX_BACKUP_DATABASE_URL=database["database_url"], PGCONNECT_TIMEOUT="10")
            with (backup / "database.dump").open("wb") as output:
                result = subprocess.run(["docker", "run", "--rm", "--network", plan["network"], "-e", "AMX_BACKUP_DATABASE_URL", "-e", "PGCONNECT_TIMEOUT", DB_CLIENT_IMAGE,
                                         "sh", "-c", 'exec pg_dump --dbname="$AMX_BACKUP_DATABASE_URL" --format=custom'], env=env, stdout=output, stderr=subprocess.PIPE, timeout=900)
            if result.returncode or not (backup / "database.dump").stat().st_size:
                raise ValueError("External database backup failed") from None
        command(["docker", "cp", "-a", old_id + ":/paperclip", str(backup / "paperclip")])
        if not (backup / "paperclip").is_dir():
            raise ValueError("Application storage backup is missing")
        if database["mode"] == "embedded-postgres":
            cluster = backup / "paperclip" / pathlib.PurePosixPath(database["real_data_dir"]).relative_to("/paperclip")
            if not (cluster / "PG_VERSION").is_file() or (cluster / "PG_VERSION").read_text().strip() != database["postgres_major"]:
                raise ValueError("Cold backup does not contain the identified embedded database")
            pid = cluster / "postmaster.pid"
            if pid.exists() or pid.is_symlink():
                raise ValueError("Copied embedded database still has postmaster.pid; clean shutdown is unverified")
            owner = cluster.stat()
            control = private_capture(["docker", "run", "--rm", "--network=none", "--read-only", "--cap-drop=ALL",
                                       "--security-opt=no-new-privileges:true", "--user", f"{owner.st_uid}:{owner.st_gid}",
                                       "--env", "LC_ALL=C", "--mount", f"type=bind,src={cluster.resolve()},dst=/backup,readonly",
                                       "--entrypoint", "pg_controldata", DB_CLIENT_IMAGE, "/backup"], reject_stderr=True)
            if not re.search(r"^Database cluster state:\s+shut down\s*$", control, re.MULTILINE):
                raise ValueError("Copied embedded database is not cleanly shut down")
    except Exception:
        command(compose + ["start", "amx"])
        raise

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
    plan = backup_plan(old_id, app, image) if not staging else None
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = directory / "release-state" / stamp
    backup.mkdir(parents=True)
    (backup / "before.json").write_text(json.dumps({"image": old_image, "image_id": old_image_id, "next": image, "sha": sha,
                                                   "database": backup_metadata(plan) if plan else None}))
    shutil.copyfile(env_file, backup / "environment.private")
    if not staging:
        quiesced_backup(compose, old_id, backup, plan)
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
