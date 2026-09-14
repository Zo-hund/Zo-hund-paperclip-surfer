"""Render Compose with synthetic inputs only; never start services or read real env files."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
GRANTS = ("PAPERCLIP_OPENROUTER_COMPANY_IDS", "PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS")


class OpenRouterDeploymentGrants(unittest.TestCase):
    def test_every_provider_container_receives_explicit_or_empty_grants(self):
        manifests = sorted([*ROOT.glob("docker-compose*.yml"), *ROOT.glob("deploy/vps/docker-compose*.yml")])
        manifests = [p for p in manifests if "OPENROUTER_API_KEY:" in p.read_text(encoding="utf-8")]
        self.assertTrue(manifests)
        # Preserve only OS CLI lookup inputs, never provider credentials or Compose settings.
        env = {k: v for k, v in os.environ.items() if k.upper() in {
            "PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE", "HOME", "DOCKER_CONFIG",
            "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "HOMEDRIVE", "HOMEPATH",
        }}
        env.update({"BETTER_AUTH_SECRET": "synthetic-test-only", "POSTGRES_PASSWORD": "synthetic-test-only",
                    "AMX_IMAGE": "example.invalid/test:local", "OPENROUTER_API_KEY": "synthetic-test-only",
                    "PAPERCLIP_PUBLIC_URL": "http://localhost:3100"})
        with tempfile.TemporaryDirectory(prefix="openrouter-compose-test-") as directory:
            empty_env = Path(directory) / "empty.env"
            empty_env.write_text("", encoding="utf-8")
            # Older Compose versions stat service env_file entries even with
            # --no-env-resolution. Render unchanged manifests in a private fixture
            # directory containing only empty env files, never beside real secrets.
            for name in (".env", ".env.vps", ".env.cluster"):
                (Path(directory) / name).write_text("", encoding="utf-8")
            for values in ({}, {GRANTS[0]: "company-a,company-b", GRANTS[1]: "company-b"}):
                for manifest in manifests:
                    with self.subTest(manifest=manifest.name, grants=bool(values)):
                        fixture_manifest = Path(directory) / manifest.name
                        fixture_manifest.write_bytes(manifest.read_bytes())
                        rendered = subprocess.run([
                            "docker", "compose", "--env-file", str(empty_env), "-f", str(fixture_manifest),
                            "config", "--format", "json",
                        ], env={**env, **values}, cwd=directory, capture_output=True, text=True, timeout=30)
                        self.assertEqual(rendered.returncode, 0, rendered.stderr)
                        consumers = [service["environment"] for service in json.loads(rendered.stdout)["services"].values()
                                     if "OPENROUTER_API_KEY" in service.get("environment", {})]
                        self.assertTrue(consumers)
                        for consumer in consumers:
                            for grant in GRANTS:
                                self.assertEqual(consumer.get(grant), values.get(grant, ""))


if __name__ == "__main__":
    unittest.main()
