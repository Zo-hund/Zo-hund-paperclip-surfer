import contextlib
import importlib.util
import io
import json
import pathlib
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("host_deploy", HERE / "host-deploy.py")
deploy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy)
STARTED = "2026-10-20T00:00:00Z"
EMBEDDED = {"mode": "embedded-postgres", "data_dir": "/paperclip/.paperclip/instances/default/db", "real_data_dir": "/paperclip/.paperclip/instances/default/db", "postgres_major": "18"}
EXTERNAL = {"mode": "external-postgres", "database_url": "postgres://fixture:DO-NOT-LOG@db/live"}


def old_container():
    return {"State": {"Running": True, "StartedAt": STARTED}, "Mounts": [{"Type": "bind", "Source": "/private/app", "Destination": "/paperclip"}],
            "NetworkSettings": {"Networks": {"actual-live-network": {}}}}


def app_config(environment=None):
    return {"environment": environment or {}, "volumes": [{"type": "bind", "source": "/private/app", "target": "/paperclip"}]}


class DatabasePreflightTests(unittest.TestCase):
    def run_plan(self, old_db=EMBEDDED, candidate_db=EMBEDDED, app=None, old=None, version="180001"):
        with patch.object(deploy, "inspect_private", side_effect=[old or old_container(), {"Config": {"Env": ["HOME=/paperclip"]}}]), \
             patch.object(deploy, "database_probe", return_value=old_db), \
             patch.object(deploy, "private_capture", side_effect=[json.dumps(candidate_db), version if old_db.get("mode") == "external-postgres" else "pg_controldata (PostgreSQL) 18.1"]) as capture, \
             patch.object(deploy, "command") as mutation:
            result = deploy.backup_plan("old-container", app or app_config(), "signed-image")
            mutation.assert_not_called()
            return result, capture.call_args_list

    def test_embedded_mode_never_selects_external_dump(self):
        for environment in ({}, {"DATABASE_URL": ""}):
            plan, calls = self.run_plan(app=app_config(environment))
            self.assertEqual(plan["database"]["mode"], "embedded-postgres")
            self.assertNotIn("network", plan)
            self.assertEqual(len(calls), 2)
            args = calls[0].args[0]
            self.assertIn("--network=none", args)
            self.assertIn("--read-only", args)
            self.assertIn("type=bind,src=/private/app,dst=/paperclip,readonly", args)
            self.assertNotIn("pg_dump", " ".join(args))
            self.assertIn(deploy.DB_CLIENT_IMAGE, calls[1].args[0])

    def test_config_only_external_uses_actual_private_url_and_old_network(self):
        plan, calls = self.run_plan(EXTERNAL, EXTERNAL)
        self.assertEqual(plan["network"], "actual-live-network")
        self.assertEqual(calls[1].kwargs["env"]["AMX_BACKUP_DATABASE_URL"], EXTERNAL["database_url"])
        self.assertNotIn("DO-NOT-LOG", " ".join(calls[1].args[0]))
        self.assertNotIn("DO-NOT-LOG", json.dumps(deploy.backup_metadata(plan)))

    def test_candidate_mode_path_and_url_changes_rejected_before_stop(self):
        for candidate in (EXTERNAL, {**EMBEDDED, "real_data_dir": "/paperclip/other-db"}):
            with self.subTest(candidate=candidate["mode"]), self.assertRaisesRegex(ValueError, "changes the effective"):
                self.run_plan(candidate_db=candidate)
        with self.assertRaisesRegex(ValueError, "changes the effective"):
            self.run_plan(EXTERNAL, {**EXTERNAL, "database_url": "postgres://fixture:other@db/other"})

    def test_unidentified_or_outside_cluster_rejected_before_stop(self):
        for state in ({"mode": "unknown"}, {**EMBEDDED, "real_data_dir": "/outside/db"}, {**EMBEDDED, "postgres_major": ""}):
            with self.subTest(state=state), patch.object(deploy, "command") as mutation:
                with self.assertRaises(ValueError):
                    self.run_plan(old_db=state)
                mutation.assert_not_called()

    def test_storage_change_or_nested_mount_rejected_before_probe(self):
        altered = old_container()
        altered["Mounts"].append({"Destination": "/paperclip/db", "Source": "/other"})
        with patch.object(deploy, "database_probe") as probe, patch.object(deploy, "command") as mutation:
            for old, app in ((altered, app_config()), (old_container(), app_config() | {"volumes": [{"type": "bind", "source": "/new", "target": "/paperclip"}]})):
                with patch.object(deploy, "inspect_private", return_value=old), self.assertRaises(ValueError):
                    deploy.backup_plan("old", app, "image")
            probe.assert_not_called()
            mutation.assert_not_called()

    def test_external_unsupported_target_or_server_rejected_before_stop(self):
        for url in ("", "postgres://user:secret@localhost/db", "postgres://user:secret@[::1]/db", "postgres://user:secret@[::ffff:127.0.0.1]/db", "postgres://user:secret@db/db?host=/tmp", "file:///database"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                state = {**EXTERNAL, "database_url": url}
                self.run_plan(state, state)
        with self.assertRaisesRegex(ValueError, "version"):
            self.run_plan(EXTERNAL, EXTERNAL, version="190001")

    def test_ambiguous_external_network_rejected(self):
        old = old_container()
        old["NetworkSettings"]["Networks"]["another"] = {}
        with self.assertRaisesRegex(ValueError, "network"):
            self.run_plan(EXTERNAL, EXTERNAL, old=old)

    def test_secret_stderr_not_reported(self):
        failed = subprocess.CompletedProcess(["docker"], 1, "", "postgres://user:DO-NOT-LOG@db/live")
        with patch.object(deploy.subprocess, "run", return_value=failed), contextlib.redirect_stderr(io.StringIO()) as error:
            with self.assertRaises(ValueError) as caught:
                deploy.private_capture(["docker", "exec", "old"])
        self.assertNotIn("DO-NOT-LOG", str(caught.exception) + error.getvalue())

    def test_candidate_custom_startup_rejected_before_stop(self):
        with self.assertRaisesRegex(ValueError, "Custom application startup"):
            self.run_plan(app=app_config() | {"command": ["different-server"]})

    def test_unsupported_embedded_major_rejected_before_stop(self):
        state = {**EMBEDDED, "postgres_major": "17"}
        with self.assertRaisesRegex(ValueError, "major is unsupported"):
            self.run_plan(state, state)

    def test_candidate_user_and_workdir_are_used_for_effective_config_probe(self):
        _, calls = self.run_plan(app=app_config() | {"user": "1000:1000", "working_dir": "/app"})
        self.assertIn("--user", calls[0].args[0])
        self.assertIn("1000:1000", calls[0].args[0])
        self.assertIn("--workdir", calls[0].args[0])


class QuiescedBackupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.backup = pathlib.Path(self.tmp.name)
        self.compose = ["docker", "compose", "-f", "candidate.yml"]

    def execute_backup(self, database, *, dump_error=False, missing_cluster=False, pid_present=False, control_state="shut down"):
        calls = []
        def command(args, **kwargs):
            calls.append(args)
            if args[:2] == ["docker", "cp"]:
                target = self.backup / "paperclip"
                target.mkdir()
                if database["mode"] == "embedded-postgres" and not missing_cluster:
                    cluster = target / ".paperclip/instances/default/db"
                    cluster.mkdir(parents=True)
                    (cluster / "PG_VERSION").write_text("18\n")
                    if pid_present:
                        (cluster / "postmaster.pid").write_text("fixture pid\n")
        def dump(args, **kwargs):
            self.assertNotIn("DO-NOT-LOG", " ".join(args))
            self.assertEqual(kwargs["env"]["AMX_BACKUP_DATABASE_URL"], EXTERNAL["database_url"])
            kwargs["stdout"].write(b"fixture logical dump" if not dump_error else b"")
            return subprocess.CompletedProcess(args, int(dump_error), stderr=b"private-error")
        plan = {"database": database, "started_at": STARTED, "network": "actual-live-network"}
        with patch.object(deploy, "command", side_effect=command), \
             patch.object(deploy, "database_probe", return_value=database), \
             patch.object(deploy, "inspect_private", side_effect=[old_container(), {"State": {"Running": False, "ExitCode": 0}}]), \
             patch.object(deploy, "private_capture", return_value="Database cluster state: " + control_state + "\n") as control, \
             patch.object(deploy.subprocess, "run", side_effect=dump) as run:
            if dump_error or missing_cluster or pid_present or control_state != "shut down":
                with self.assertRaises(ValueError):
                    deploy.quiesced_backup(self.compose, "actual-old", self.backup, plan)
            else:
                deploy.quiesced_backup(self.compose, "actual-old", self.backup, plan)
            if database["mode"] == "embedded-postgres" and not (missing_cluster or pid_present):
                self.assertIn(deploy.DB_CLIENT_IMAGE, control.call_args.args[0])
                self.assertIn("--network=none", control.call_args.args[0])
                self.assertTrue(control.call_args.kwargs["reject_stderr"])
                cluster_owner = (self.backup / "paperclip/.paperclip/instances/default/db").stat()
                self.assertIn(f"{cluster_owner.st_uid}:{cluster_owner.st_gid}", control.call_args.args[0])
            return calls, run.call_count

    def test_embedded_cold_copy_contains_cluster_and_no_pg_dump(self):
        calls, dumps = self.execute_backup(EMBEDDED)
        self.assertEqual(dumps, 0)
        self.assertEqual(calls[0], self.compose + ["stop", "--timeout", "60", "amx"])
        self.assertEqual(calls[1][:4], ["docker", "cp", "-a", "actual-old:/paperclip"])
        self.assertFalse((self.backup / "database.dump").exists())

    def test_external_dump_and_full_storage_preserved(self):
        calls, dumps = self.execute_backup(EXTERNAL)
        self.assertEqual(dumps, 1)
        self.assertGreater((self.backup / "database.dump").stat().st_size, 0)
        self.assertEqual(calls[1][:2], ["docker", "cp"])

    def test_dump_or_missing_cold_cluster_failure_restarts_old_app(self):
        calls, _ = self.execute_backup(EXTERNAL, dump_error=True)
        self.assertEqual(calls[-1], self.compose + ["start", "amx"])
        calls, _ = self.execute_backup(EMBEDDED, missing_cluster=True)
        self.assertEqual(calls[-1], self.compose + ["start", "amx"])

    def test_changed_effective_config_rejected_before_stop(self):
        with patch.object(deploy, "inspect_private", return_value=old_container()), \
             patch.object(deploy, "database_probe", return_value=EXTERNAL), patch.object(deploy, "command") as command:
            with self.assertRaisesRegex(ValueError, "changed before"):
                deploy.quiesced_backup(self.compose, "old", self.backup, {"database": EMBEDDED, "started_at": STARTED})
            command.assert_not_called()

    def test_symlink_or_probe_failure_rejected_before_stop(self):
        with patch.object(deploy, "inspect_private", return_value=old_container()), \
             patch.object(deploy, "database_probe", side_effect=ValueError("unsupported symlink")), patch.object(deploy, "command") as command:
            with self.assertRaisesRegex(ValueError, "symlink"):
                deploy.quiesced_backup(self.compose, "old", self.backup, {"database": EMBEDDED, "started_at": STARTED})
            command.assert_not_called()

    def test_forced_stop_or_still_running_restarts_old_app_without_copy(self):
        for stopped in ({"Running": True, "ExitCode": 0}, {"Running": False, "ExitCode": 137}):
            with self.subTest(stopped=stopped), patch.object(deploy, "inspect_private", side_effect=[old_container(), {"State": stopped}]), \
                 patch.object(deploy, "database_probe", return_value=EMBEDDED), patch.object(deploy, "command") as command:
                with self.assertRaisesRegex(ValueError, "stop cleanly"):
                    deploy.quiesced_backup(self.compose, "old", self.backup, {"database": EMBEDDED, "started_at": STARTED})
                self.assertEqual(command.call_args.args[0], self.compose + ["start", "amx"])
                self.assertFalse(any(call.args[0][:2] == ["docker", "cp"] for call in command.call_args_list))

    def test_embedded_pid_file_or_dirty_control_state_restarts_old_app(self):
        for case in ({"pid_present": True}, {"control_state": "in production"}, {"control_state": "shut down in recovery"}):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                self.backup = pathlib.Path(directory)
                calls, _ = self.execute_backup(EMBEDDED, **case)
                self.assertEqual(calls[-1], self.compose + ["start", "amx"])

    def test_control_warning_is_rejected_without_printing_secret_stderr(self):
        response = subprocess.CompletedProcess(["docker"], 0, "Database cluster state: shut down\n", "warning DO-NOT-LOG")
        with patch.object(deploy.subprocess, "run", return_value=response), self.assertRaises(ValueError) as caught:
            deploy.private_capture(["docker"], reject_stderr=True)
        self.assertNotIn("DO-NOT-LOG", str(caught.exception))


class NodeProbeRegressionTests(unittest.TestCase):
    def test_real_node_probe_regressions_run_in_normal_python_ci(self):
        # Normal CI already installs Node20 and discovers every test_*.py here.
        # A missing Node binary fails rather than silently skipping this suite.
        node = shutil.which("node")
        self.assertIsNotNone(node, "Node is required for database probe regressions")
        result = subprocess.run([node, "--test", str(HERE / "test_database_backup_probe.mjs")], stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout)


if __name__ == "__main__":
    unittest.main()
