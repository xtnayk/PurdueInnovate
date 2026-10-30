import copy
import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from backend.incidents import normalize_incidents
from backend.planner import Planner, _conditions, validate_plan
from backend.server import create_server
from backend.tests.test_profiles import example_profile


class IncidentTests(unittest.TestCase):
    def test_all_reports_combine_and_approval_keeps_exact_snapshot(self):
        engine, profile = Planner(), example_profile()
        reports = [{"id": "broken", "type": "breakdown", "rig_id": "R1", "available_from": 780},
                   {"id": "wet", "type": "wet", "field_id": "F03"},
                   {"id": "rain", "type": "storm", "rain_time": 1030},
                   {"id": "wind", "type": "wind", "wind_mph": 10}]
        expected = copy.deepcopy(reports)
        run = engine.replan(profile=profile, incidents=reports, completed_fields=["F01"],
                            feedback_constraints={"excluded_fields": ["F02"]})
        conditions = run["conditions"]
        self.assertEqual(run["incidents"], expected)
        self.assertEqual(conditions["rig_available_from"]["R1"], 780)
        self.assertEqual(conditions["wet_fields"], ["F03"])
        self.assertEqual(conditions["excluded_fields"], ["F02"])
        self.assertEqual(conditions["rain_time"], 1030)
        self.assertEqual(conditions["wind_mph"], 10)
        self.assertTrue(run["plans"])
        for plan in run["plans"]:
            validate_plan(plan, engine.latest_inputs["fields"], engine.latest_inputs["rigs"],
                          engine.latest_inputs["crew"], conditions)
            self.assertFalse({j["field_id"] for j in plan["schedule"]} & {"F01", "F02", "F03"})
        # UI/request objects and returned snapshots cannot rewrite server approval.
        reports.clear()
        run["incidents"][0]["available_from"] = 480
        run["conditions"]["rain_time"] = 1440
        receipt = engine.approve(run["run_id"], run["plans"][0]["id"])
        self.assertEqual(receipt["incidents"], expected)
        receipt["incidents"].clear()
        self.assertEqual(engine.approve(run["run_id"], run["plans"][0]["id"])["incidents"], expected)

    def test_multiple_reports_never_relax_stricter_conditions(self):
        engine, profile = Planner(), example_profile()
        reports = [{"id": "later", "type": "storm", "rain_time": 1100},
                   {"id": "early", "type": "storm", "rain_time": 800},
                   {"id": "repair1", "type": "breakdown", "rig_id": "R1", "available_from": 700},
                   {"id": "repair2", "type": "breakdown", "rig_id": "R1", "available_from": 900},
                   {"id": "wind1", "type": "wind", "wind_mph": 5},
                   {"id": "wind2", "type": "wind", "wind_mph": 11},
                   {"id": "wet1", "type": "wet", "field_id": "F02"},
                   {"id": "wet2", "type": "wet", "field_id": "F02"}]
        run = engine.replan("wind", update="wind 3 mph", profile=profile, incidents=reports)
        conditions = run["conditions"]
        self.assertEqual(conditions["rain_time"], 800)
        self.assertEqual(conditions["rig_available_from"]["R1"], 900)
        self.assertEqual(conditions["wind_mph"], 18)
        self.assertEqual([i["mph"] for i in conditions["wind_intervals"]], [11, 18, 11])
        self.assertEqual(conditions["wet_fields"], ["F02"])
        # Conservative text merge is active only for incident-driven runs.
        self.assertEqual(_conditions("storm", [{"type": "rain_time", "rain_time": 1100}], conservative=True)["rain_time"], 840)
        self.assertEqual(_conditions("breakdown", [{"type": "rig_unavailable", "rig_id": "R3", "available_from": 700}], conservative=True)["rig_available_from"]["R3"], 840)
        self.assertEqual(_conditions("storm", [{"type": "rain_time", "rain_time": 1100}])["rain_time"], 1100)

    def test_reports_do_not_leak_into_later_runs_or_base_metadata(self):
        engine, profile = Planner(), example_profile()
        original = engine.metadata()
        run = engine.replan(profile=profile, incidents=[{"id": "wind", "type": "wind", "wind_mph": 60}])
        self.assertEqual(run["plans"], [])
        reset = engine.replan(profile=profile)
        self.assertEqual(reset["incidents"], [])
        self.assertEqual(reset["conditions"]["wind_mph"], 8)
        self.assertTrue(reset["plans"])
        self.assertEqual(engine.metadata(), original)

    def test_invalid_report_does_not_replace_latest_run(self):
        engine, profile = Planner(), example_profile()
        run = engine.replan(profile=profile)
        valid = {"id": "wet", "type": "wet", "field_id": "F01"}
        invalid = ["report", {}, [None], [valid, valid],
                   [{**valid, "field_id": "F40"}], [{**valid, "status": "new"}],
                   [{"id": "bad", "type": "breakdown", "rig_id": "R3", "available_from": 840}],
                   [{"id": "bad", "type": "breakdown", "rig_id": "R1", "available_from": True}],
                   [{"id": "bad", "type": "breakdown", "rig_id": "R1", "available_from": 1201}],
                   [{"id": "bad", "type": "storm", "rain_time": 479}],
                   [{"id": "bad", "type": "storm", "rain_time": "840"}],
                   [{"id": "bad", "type": "wind", "wind_mph": 0}],
                   [{"id": "bad", "type": "wind", "wind_mph": 61}],
                   [{"id": "bad", "type": "other", "wind_mph": 10}],
                   [{**valid, "id": "../bad"}], [{**valid, "id": "x" * 121}],
                   [{"id": f"w{i}", "type": "wet", "field_id": "F01"} for i in range(51)]]
        for reports in invalid:
            with self.subTest(reports=reports), self.assertRaises(ValueError):
                engine.replan(profile=profile, incidents=reports)
            self.assertEqual(engine.latest_run["run_id"], run["run_id"])

    def test_boundaries_and_entity_validation_use_custom_roster(self):
        profile = example_profile()
        for minute in (480, 1200):
            report = {"id": "time", "type": "storm", "rain_time": minute}
            self.assertEqual(normalize_incidents([report], profile["fields"], profile["rigs"]), [report])
        reports = [{"id": f"w{i}", "type": "wet", "field_id": "F01"} for i in range(50)]
        self.assertEqual(len(normalize_incidents(reports, profile["fields"], profile["rigs"])), 50)
        self.assertEqual(normalize_incidents(None, profile["fields"], profile["rigs"]), [])


class IncidentApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = create_server(port=0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def post(self, path, body):
        request = Request(self.base + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=30) as response:
            return json.load(response)

    def test_incidents_flow_through_api_and_approval(self):
        reports = [{"id": "wet", "type": "wet", "field_id": "F01"},
                   {"id": "broken", "type": "breakdown", "rig_id": "R2", "available_from": 1000}]
        run = self.post("/api/replan", {"profile": example_profile(), "incidents": reports})
        self.assertEqual(run["incidents"], reports)
        self.assertTrue(run["plans"])
        self.assertTrue(all(j["field_id"] != "F01" and j["rig_id"] != "R2" for p in run["plans"] for j in p["schedule"]))
        approved = self.post("/api/approve", {"run_id": run["run_id"], "plan_id": run["plans"][0]["id"]})
        self.assertEqual(approved["incidents"], reports)
        self.assertFalse(approved["dispatched"])
        with self.assertRaises(HTTPError) as error:
            self.post("/api/replan", {"profile": example_profile(), "incidents": [{"id": "bad", "type": "wet", "field_id": "F40"}]})
        self.assertEqual(error.exception.code, 400)


if __name__ == "__main__":
    unittest.main()
