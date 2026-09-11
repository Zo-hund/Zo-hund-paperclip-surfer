import http.server
import importlib.util
import pathlib
import threading
import unittest
import urllib.error

spec = importlib.util.spec_from_file_location("smoke", pathlib.Path(__file__).with_name("smoke.py"))
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)

class SmokeTests(unittest.TestCase):
    def run_server(self, health_status=200, health_body=b'{"status":"ok"}', auth_status=401):
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                is_health = self.path == "/api/health"
                self.send_response(health_status if is_health else auth_status)
                self.end_headers()
                self.wfile.write(health_body if is_health else b"[]")
            def log_message(self, *args):
                pass
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return f"http://127.0.0.1:{server.server_port}"

    def test_healthy_and_protected(self):
        smoke.check(self.run_server())

    def test_reject_open_companies(self):
        with self.assertRaises(ValueError):
            smoke.check(self.run_server(auth_status=200))

    def test_reject_unhealthy_payload(self):
        with self.assertRaises(ValueError):
            smoke.check(self.run_server(health_body=b'{"status":"error"}'))

    def test_reject_redirect_and_server_error(self):
        for status in (302, 500):
            with self.subTest(status=status), self.assertRaises(urllib.error.HTTPError):
                smoke.check(self.run_server(health_status=status))

if __name__ == "__main__":
    unittest.main()
