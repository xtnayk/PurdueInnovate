import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

try:
    from backend.server import create_server
except ImportError:
    create_server = None


class LocalApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if create_server:
            cls.server = create_server(port=0)
            cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
            cls.thread.start()
            cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        if create_server:
            cls.server.shutdown()
            cls.server.server_close()
            cls.thread.join()

    def setUp(self):
        self.assertIsNotNone(create_server, "HTTP API is not implemented")

    def post(self, path, body, origin=None):
        headers = {"Content-Type": "application/json"}
        if origin:
            headers["Origin"] = origin
        return urlopen(Request(self.base + path, data=json.dumps(body).encode(), headers=headers), timeout=30)

    def test_metadata_and_parse_contract(self):
        with urlopen(self.base + "/api/demo") as response:
            self.assertEqual(len(json.load(response)["fields"]), 40)
        with self.post("/api/parse", {"text": "field 14 too wet"}) as response:
            self.assertEqual(json.load(response)["updates"][0]["field_id"], "F14")

    def test_invalid_requests_and_cross_origin_mutations_rejected(self):
        for body in ([], {"scenario": "impossible"}, {"scenario": []}):
            with self.assertRaises(HTTPError) as error:
                self.post("/api/replan", body)
            self.assertEqual(error.exception.code, 400)
        with self.assertRaises(HTTPError) as error:
            self.post("/api/parse", {"text": "rain at 1pm"}, "https://outside.example")
        self.assertEqual(error.exception.code, 403)

    def test_stale_approval_returns_conflict(self):
        with self.assertRaises(HTTPError) as error:
            self.post("/api/approve", {"run_id": "old", "plan_id": "unknown"})
        self.assertEqual(error.exception.code, 409)

    def test_completed_fields_replan_contract_and_validation(self):
        with self.post("/api/replan", {"scenario": "storm", "completed_fields": ["F01", "F02"]}) as response:
            result = json.load(response)
        self.assertEqual(result["completed_fields"], ["F01", "F02"])
        self.assertEqual(result["remaining_field_count"], 38)
        self.assertTrue(result["plans"])
        for plan in result["plans"]:
            self.assertFalse({"F01", "F02"} & {job["field_id"] for job in plan["schedule"]})
        for completed in ("F01", ["F99"], ["F01", "F01"], [1]):
            with self.subTest(completed=completed), self.assertRaises(HTTPError) as error:
                self.post("/api/replan", {"completed_fields": completed})
            self.assertEqual(error.exception.code, 400)


if __name__ == "__main__":
    unittest.main()
