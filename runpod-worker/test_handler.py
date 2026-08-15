import importlib.util
import pathlib
import sys
import types
import unittest


runpod = types.SimpleNamespace(serverless=types.SimpleNamespace(start=lambda _: None))
sys.modules.setdefault("runpod", runpod)
spec = importlib.util.spec_from_file_location("amx_runpod_handler", pathlib.Path(__file__).with_name("handler.py"))
handler_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handler_module)


class HandlerTests(unittest.TestCase):
    def test_rejects_missing_input(self):
        with self.assertRaisesRegex(ValueError, "input must be an object"):
            handler_module.handler({})

    def test_rejects_unassigned_workload(self):
        with self.assertRaisesRegex(ValueError, "not enabled"):
            handler_module.handler({"input": {"prompt": "test", "amx": {"workload": "render"}}})

    def test_returns_scoped_result(self):
        handler_module._pipeline = lambda *args, **kwargs: [
            {"generated_text": "Operator-ready result"}
        ]
        result = handler_module.handler({
            "input": {
                "prompt": "Inspect the twin",
                "amx": {
                    "jobId": "gpu-1",
                    "tenantId": "tech-at-nite",
                    "workload": "digital-twin",
                    "stageRoom": "NEXUS1",
                    "deliveryTarget": "archive",
                },
            }
        })
        self.assertEqual(result["kind"], "simulation")
        self.assertEqual(result["text"], "Operator-ready result")
        self.assertEqual(result["amx"]["tenantId"], "tech-at-nite")


if __name__ == "__main__":
    unittest.main()
