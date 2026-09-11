import copy
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("release", pathlib.Path(__file__).with_name("validate-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.run = {"repository": {"full_name": release.REPOSITORY},
                    "head_repository": {"full_name": release.REPOSITORY},
                    "path": ".github/workflows/ci.yml", "event": "push",
                    "head_branch": "experimental", "status": "completed",
                    "conclusion": "success", "head_sha": "a" * 40, "id": 100,
                    "run_attempt": 1}
        self.metadata = {"repository": release.REPOSITORY, "sha": "a" * 40,
                         "run_id": "100", "run_attempt": "1",
                         "digest": "sha256:" + "b" * 64,
                         "image": release.IMAGE + "@sha256:" + "b" * 64}

    def test_valid_release(self):
        self.assertEqual(release.validate(self.run, self.metadata)["image"], self.metadata["image"])

    def test_reject_untrusted_or_failed_run(self):
        for key, value in [("event", "pull_request"), ("head_branch", "main"),
                           ("conclusion", "failure"), ("conclusion", "cancelled"),
                           ("status", "in_progress"), ("path", ".github/workflows/other.yml"),
                           ("head_repository", {"full_name": "attacker/fork"})]:
            with self.subTest(key=key, value=value):
                run = copy.deepcopy(self.run)
                run[key] = value
                with self.assertRaises(ValueError):
                    release.validate(run, self.metadata)

    def test_reject_missing_or_changed_release(self):
        for key in self.metadata:
            with self.subTest(key=key):
                metadata = self.metadata.copy()
                metadata.pop(key)
                with self.assertRaises(ValueError):
                    release.validate(self.run, metadata)
        for key, value in [("digest", "latest"), ("sha", "c" * 40),
                           ("image", release.IMAGE + "@sha256:" + "c" * 64),
                           ("run_attempt", "2"), ("run_id", "99")]:
            with self.subTest(key=key):
                metadata = dict(self.metadata, **{key: value})
                with self.assertRaises(ValueError):
                    release.validate(self.run, metadata)

if __name__ == "__main__":
    unittest.main()
