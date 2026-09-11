import copy
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("host", pathlib.Path(__file__).with_name("host-deploy.py"))
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)

class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.image = "ghcr.io/zo-hund/amx-air-hubs@sha256:" + "a" * 64
        self.config = {"services": {"amx": {
            "image": self.image, "cap_drop": ["ALL"],
            "security_opt": ["no-new-privileges:true"],
            "environment": {"PAPERCLIP_DEPLOYMENT_MODE": "authenticated"},
            "volumes": [{"target": "/paperclip", "source": "app", "type": "volume"}],
            "ports": [{"host_ip": "127.0.0.1", "published": "3100"}]}}}

    def test_hardened_runtime(self):
        host.validate_config(self.config, self.image)

    def test_reject_unsafe_runtime(self):
        changes = [
            ("image", "amx:latest"), ("privileged", True), ("network_mode", "host"),
            ("pid", "host"), ("group_add", ["988"]), ("cap_drop", []),
            ("security_opt", []), ("ports", [{"host_ip": "0.0.0.0"}]),
            ("volumes", [{"target": "/var/run/docker.sock"}]),
            ("volumes", [{"target": "/deploy"}]),
            ("environment", {"PAPERCLIP_DEPLOYMENT_MODE": "local_trusted"}),
            ("environment", {"PAPERCLIP_DEPLOYMENT_MODE": "authenticated", "GHCR_PULL_TOKEN": "test"})]
        for key, value in changes:
            with self.subTest(key=key, value=value):
                config = copy.deepcopy(self.config)
                config["services"]["amx"][key] = value
                with self.assertRaises(ValueError):
                    host.validate_config(config, self.image)

if __name__ == "__main__":
    unittest.main()
