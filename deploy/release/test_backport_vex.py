import copy
import datetime as dt
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("backport_vex", Path(__file__).with_name("backport-vex.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class BackportGateTests(unittest.TestCase):
    def setUp(self):
        self.finding = {"VulnerabilityID": "CVE-2026-41679", "PkgName": "@paperclipai/server",
            "PkgPath": "app/server/package.json", "InstalledVersion": "0.3.1", "Severity": "CRITICAL",
            "PkgIdentifier": {"PURL": "pkg:npm/%40paperclipai/server@0.3.1"}, "evidence": "Regression tested"}
        today = dt.date.today()
        self.manifest = {"reviewer": "test", "reviewed_on": today.isoformat(),
            "expires_on": (today + dt.timedelta(days=1)).isoformat(),
            "source_sha256": {"source.ts": hashlib.sha256(b"reviewed\n").hexdigest()},
            "findings": [self.finding]}
        self.raw = {"SchemaVersion": 2, "ArtifactName": "test-image", "Metadata": {"ImageID": "sha256:test"},
            "Results": [{"Vulnerabilities": [self.finding]}]}
        self.filtered = copy.deepcopy(self.raw)
        self.filtered["Results"][0]["Vulnerabilities"] = []

    def test_exact_reviewed_finding_can_be_filtered(self):
        self.assertEqual(gate.check_filter(self.raw, self.filtered, self.manifest), 1)

    def test_new_advisory_cannot_be_silently_removed(self):
        self.raw["Results"][0]["Vulnerabilities"].append({**self.finding, "VulnerabilityID": "CVE-2099-1234"})
        with self.assertRaisesRegex(ValueError, "unreviewed"):
            gate.check_filter(self.raw, self.filtered, self.manifest)

    def test_unresolved_high_or_critical_blocks(self):
        with self.assertRaisesRegex(ValueError, "Unresolved"):
            gate.check_filter(self.raw, self.raw, self.manifest)

    def test_other_package_path_version_or_severity_cannot_be_filtered(self):
        for field, value in [("PkgPath", "app/other/package.json"), ("InstalledVersion", "0.3.2"),
                             ("PkgName", "another-package"), ("Severity", "HIGH")]:
            with self.subTest(field=field):
                raw = copy.deepcopy(self.raw)
                raw["Results"][0]["Vulnerabilities"][0][field] = value
                with self.assertRaises(ValueError):
                    gate.check_filter(raw, self.filtered, self.manifest)

    def test_mismatched_image_is_rejected(self):
        self.filtered["Metadata"]["ImageID"] = "sha256:other"
        with self.assertRaisesRegex(ValueError, "same image"):
            gate.check_filter(self.raw, self.filtered, self.manifest)

    def test_expired_review_is_rejected(self):
        self.manifest["expires_on"] = dt.date.today().isoformat()
        with self.assertRaisesRegex(ValueError, "expired"):
            gate.allowed_identities(self.manifest)

    def test_missing_scan_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Missing"):
            gate.check_filter({}, self.filtered, self.manifest)

    def test_source_change_invalidates_review(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "source.ts").write_bytes(b"reviewed\r\n")
            gate.check_source(self.manifest, root)
            (root / "source.ts").write_bytes(b"changed\n")
            with self.assertRaisesRegex(ValueError, "source changed"):
                gate.check_source(self.manifest, root)


if __name__ == "__main__":
    unittest.main()
