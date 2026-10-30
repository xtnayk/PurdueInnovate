import copy
import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from backend.planner import Planner, validate_plan
from backend.server import create_server


def example_profile(field_count=8):
    return {"id": "farm-test", "version": 1, "farm_name": "Reed Family Farm", "location": "Tippecanoe County, Indiana",
            "fields": [{"id": f"F{i + 1:02}", "name": f"Home {i + 1}", "acres": 12 + i, "crop": "Corn",
                        "zone": ["north", "south", "east", "west", "central"][i % 5], "priority": i == 0, "excluded": False}
                       for i in range(field_count)],
            "rigs": [{"id": "R1", "name": "Green Sprayer", "acres_per_hour": 80},
                     {"id": "R2", "name": "Blue Sprayer", "acres_per_hour": 60}],
            "crew": [{"id": "C1", "name": "Reed", "certifications": ["standard"]},
                     {"id": "C2", "name": "Patel", "certifications": ["standard", "special"]},
                     {"id": "C3", "name": "Lee", "certifications": []}],
            "workday": {"start": 600, "end": 960}, "rules": {"rainfast_minutes": 45, "wind_limit_mph": 12},
            "preferences": {"priority": "cost"}, "notes": "Drive around the old barn."}


class ProfilePlannerTests(unittest.TestCase):
    def test_preview_is_schematic_scoped_and_uses_confirmed_metadata(self):
        engine, profile = Planner(), example_profile()
        demo = engine.metadata()
        preview = engine.preview_profile(profile)
        self.assertEqual(preview["farm_name"], profile["farm_name"])
        self.assertEqual(preview["now"], 600)
        self.assertEqual(len(preview["fields"]), 8)
        self.assertEqual(preview["rigs"][1]["crew_id"], "C2")
        self.assertEqual(preview["crew"][2]["certifications"], [])
        self.assertEqual(preview["geometry"], "schematic")
        self.assertTrue(any("not real field boundaries" in a for a in preview["assumptions"]))
        self.assertEqual(preview["fields"][0]["rainfast_minutes"], 45)
        self.assertEqual(preview["profile_id"], engine.preview_profile(copy.deepcopy(profile))["profile_id"])
        profile["fields"][0]["acres"] += 1
        self.assertNotEqual(preview["profile_id"], engine.preview_profile(profile)["profile_id"])
        self.assertEqual(demo, engine.metadata())
        self.assertNotIn("profile_id", demo)

    def test_custom_schedule_uses_exact_roster_timing_rules_and_approval_snapshot(self):
        engine, profile = Planner(), example_profile()
        profile["fields"][0]["excluded"] = True
        preview = engine.preview_profile(profile)
        run = engine.replan(profile=profile, completed_fields=["F02"])
        self.assertEqual(run["priority"], "cost")
        self.assertTrue(run["plans"])
        self.assertEqual(run["profile_id"], preview["profile_id"])
        fields = [f for f in preview["fields"] if f["id"] != "F02"]
        for plan in run["plans"]:
            validate_plan(plan, fields, preview["rigs"], preview["crew"], run["conditions"])
            for job in plan["schedule"]:
                self.assertNotIn(job["field_id"], {"F01", "F02"})
                self.assertIn(job["rig_id"], {"R1", "R2"})
                self.assertIn(job["crew_name"], {"Reed", "Patel"})
                self.assertGreaterEqual(job["start"], 600)
                self.assertLessEqual(job["end"], 960)
                self.assertEqual(job["rainfast_minutes"], 45)
            self.assertIn("profile", next(d["reason"] for d in plan["deferred"] if d["field_id"] == "F01"))
        # Mutating request and preview objects must never change approval inputs.
        profile["crew"][0]["certifications"] = []
        profile["fields"][1]["acres"] = 500
        preview["rigs"].clear()
        approved = engine.approve(run["run_id"], run["plans"][0]["id"])
        self.assertEqual(approved["profile_id"], run["profile_id"])
        self.assertEqual(approved["completed_fields"], ["F02"])
        self.assertFalse(approved["dispatched"])
        self.assertEqual(len(engine.metadata()["fields"]), 40)

    def test_missing_credentials_are_not_invented(self):
        profile, engine = example_profile(), Planner()
        profile["crew"][0]["certifications"] = []
        run = engine.replan(profile=profile)
        self.assertTrue(run["plans"])
        for plan in run["plans"]:
            self.assertEqual({j["rig_id"] for j in plan["schedule"]}, {"R2"})
        profile["crew"][1]["certifications"] = ["special"]
        self.assertEqual(engine.replan(profile=profile)["plans"], [])

    def test_custom_disruptions_target_existing_entities(self):
        engine, profile = Planner(), example_profile()
        run = engine.replan("breakdown", profile=profile)
        self.assertEqual(run["conditions"]["rig_available_from"], {"R1": 840, "R2": 600})
        self.assertTrue(run["plans"])
        for plan in run["plans"]:
            self.assertTrue(all(j["start"] >= 840 for j in plan["schedule"] if j["rig_id"] == "R1"))
        wet = engine.replan("wet", profile=profile)
        self.assertEqual(wet["conditions"]["wet_fields"], [f"F{i:02}" for i in range(1, 7)])
        self.assertTrue(all(j["field_id"] in {"F07", "F08"} for p in wet["plans"] for j in p["schedule"]))
        for text in ("rig 3 down till 2pm", "field 14 too wet"):
            with self.assertRaisesRegex(ValueError, "outside this farm profile"):
                engine.replan(profile=profile, update=text)

    def test_feedback_exclusions_priority_and_rig_holds_are_audited(self):
        engine, profile = Planner(), example_profile()
        profile["fields"][0]["excluded"] = True
        feedback = {"excluded_fields": ["F02"], "priority_fields": ["F01", "F03"], "unavailable_rigs": ["R2"]}
        run = engine.replan(profile=profile, feedback_constraints=feedback)
        self.assertEqual(run["feedback_constraints"], feedback)
        self.assertEqual(run["conditions"]["excluded_fields"], ["F01", "F02"])
        self.assertEqual(run["conditions"]["rig_available_from"]["R2"], 1440)
        self.assertTrue(any("hold takes precedence" in w for w in run["warnings"]))
        self.assertTrue(run["plans"])
        self.assertTrue(next(f["priority"] for f in engine.latest_inputs["fields"] if f["id"] == "F03"))
        for plan in run["plans"]:
            self.assertEqual({j["rig_id"] for j in plan["schedule"]}, {"R1"})
            self.assertFalse({j["field_id"] for j in plan["schedule"]} & {"F01", "F02"})
        receipt = engine.approve(run["run_id"], run["plans"][0]["id"])
        self.assertEqual(receipt["feedback_constraints"], feedback)
        # New feedback never leaks into a later run or the base profile.
        reset = engine.replan(profile=profile)
        self.assertEqual(reset["conditions"]["excluded_fields"], ["F01"])
        self.assertEqual(reset["conditions"]["rig_available_from"]["R2"], 600)
        self.assertFalse(next(f["priority"] for f in engine.latest_inputs["fields"] if f["id"] == "F03"))

    def test_feedback_cannot_relax_wind_rain_or_profile_exclusions(self):
        profile, engine = example_profile(), Planner()
        profile["rules"]["wind_limit_mph"] = 7
        self.assertEqual(engine.replan(profile=profile, feedback_constraints={"priority_fields": ["F01"]})["plans"], [])
        profile["rules"]["wind_limit_mph"] = 12
        profile["workday"] = {"start": 900, "end": 1000}
        profile["rules"]["rainfast_minutes"] = 360
        self.assertEqual(engine.replan(profile=profile, feedback_constraints={"priority_fields": ["F01"]})["plans"], [])
        profile = example_profile()
        profile["fields"][0]["excluded"] = True
        run = engine.replan(profile=profile)
        stored = engine.latest_run["plans"][0]
        stored["schedule"][0]["field_id"] = "F01"
        engine.latest_run["conditions"]["excluded_fields"] = []
        with self.assertRaisesRegex(ValueError, "excluded field"):
            engine.approve(run["run_id"], stored["id"])

    def test_minimum_and_maximum_rosters_normalize(self):
        profile, engine = example_profile(1), Planner()
        profile["rigs"] = profile["rigs"][:1]
        profile["crew"] = profile["crew"][:1]
        self.assertEqual(len(engine.preview_profile(profile)["rigs"]), 1)
        self.assertTrue(engine.replan(profile=profile)["plans"])
        profile = example_profile(40)
        profile["rigs"] = [{"id": f"R{i}", "name": f"Rig {i}", "acres_per_hour": 80} for i in range(1, 5)]
        profile["crew"] = [{"id": f"C{i}", "name": f"Operator {i}", "certifications": ["standard"]} for i in range(1, 13)]
        preview = engine.preview_profile(profile)
        self.assertEqual(len(preview["crew"]), 12)
        self.assertEqual(preview["rigs"][3]["crew_id"], "C4")

    def test_all_unavailable_or_completed_returns_no_work(self):
        engine, profile = Planner(), example_profile()
        run = engine.replan(profile=profile, feedback_constraints={"unavailable_rigs": ["R1", "R2"]})
        self.assertEqual(run["plans"], [])
        done = engine.replan(profile=profile, completed_fields=[f["id"] for f in profile["fields"]])
        self.assertEqual(done["remaining_field_count"], 0)
        self.assertTrue(any("All 8 fields" in w for w in done["warnings"]))

    def test_invalid_profile_values_reject_without_replacing_current_run(self):
        engine = Planner()
        original = engine.replan(profile=example_profile())
        changes = [
            lambda p: p.update(id="../other"), lambda p: p.update(version=True),
            lambda p: p.update(farm_name="x" * 121), lambda p: p.update(location=""),
            lambda p: p.update(fields=[]), lambda p: p["fields"][0].update(acres=True),
            lambda p: p["fields"][0].update(acres=0), lambda p: p["fields"][0].update(acres=501),
            lambda p: p["fields"][0].update(acres=1.5), lambda p: p["fields"][0].update(zone="elsewhere"),
            lambda p: p["fields"][0].update(priority="yes"), lambda p: p["fields"][0].update(excluded=1),
            lambda p: p["fields"][1].update(id="F01"), lambda p: p["fields"][0].update(id="F41"),
            lambda p: p["fields"][0].update(crop=[]), lambda p: p.update(rigs=[]),
            lambda p: p["rigs"][0].update(id="R5"), lambda p: p["rigs"][0].update(acres_per_hour=0),
            lambda p: p.update(crew=p["crew"][:1]), lambda p: p["crew"][0].update(certifications=["licensed"]),
            lambda p: p["crew"][0].update(certifications=["standard", "standard"]),
            lambda p: p["workday"].update(start=479), lambda p: p["workday"].update(end=1201),
            lambda p: p["workday"].update(end=600), lambda p: p["rules"].update(rainfast_minutes=0),
            lambda p: p["rules"].update(wind_limit_mph=21), lambda p: p["preferences"].update(priority="unsafe"),
            lambda p: p.update(notes="x" * 4001), lambda p: p.update(extra=True),
        ]
        for change in changes:
            profile = example_profile()
            change(profile)
            with self.subTest(profile=profile), self.assertRaises(ValueError):
                engine.replan(profile=profile)
            self.assertEqual(engine.latest_run["run_id"], original["run_id"])
        for bad in (None, [], "profile", {"id": "only"}):
            with self.subTest(value=bad), self.assertRaises(ValueError):
                engine.preview_profile(bad)

    def test_invalid_feedback_does_not_change_latest_run(self):
        engine, profile = Planner(), example_profile()
        run = engine.replan(profile=profile)
        for feedback in ({"excluded_fields": "F01"}, {"priority_fields": ["F09"]},
                         {"unavailable_rigs": ["R3"]}, {"excluded_fields": ["F01", "F01"]},
                         {"excluded_fields": [[]]}, {"ignore_wind": True}, []):
            with self.subTest(feedback=feedback), self.assertRaises(ValueError):
                engine.replan(profile=profile, feedback_constraints=feedback)
            self.assertEqual(engine.latest_run["run_id"], run["run_id"])


class ProfileApiTests(unittest.TestCase):
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

    def test_preview_replan_and_approval_endpoint_contract(self):
        profile = example_profile()
        metadata = self.post("/api/profile/preview", {"profile": profile})
        run = self.post("/api/replan", {"profile": profile, "feedback_constraints": {"excluded_fields": ["F03"]}})
        self.assertEqual(run["profile_id"], metadata["profile_id"])
        self.assertEqual(run["priority"], "cost")
        approved = self.post("/api/approve", {"run_id": run["run_id"], "plan_id": run["plans"][0]["id"]})
        self.assertEqual(approved["profile_id"], metadata["profile_id"])
        with urlopen(self.base + "/api/demo") as response:
            demo = json.load(response)
        self.assertEqual(len(demo["fields"]), 40)
        self.assertNotIn("profile_id", demo)
        with self.assertRaises(HTTPError) as error:
            self.post("/api/replan", {"profile": profile, "feedback_constraints": {"unavailable_rigs": ["R4"]}})
        self.assertEqual(error.exception.code, 400)

    def test_parse_preview_rejects_unknown_profile_entities(self):
        profile = example_profile()
        parsed = self.post("/api/parse", {"profile": profile, "text": "field 2 too wet"})
        self.assertEqual(parsed["updates"][0]["field_id"], "F02")
        for text in ("field 14 too wet", "rig 3 down till 2pm"):
            with self.subTest(text=text), self.assertRaises(HTTPError) as error:
                self.post("/api/parse", {"profile": profile, "text": text})
            self.assertEqual(error.exception.code, 400)
        parsed = self.post("/api/parse", {"text": "field 14 too wet"})
        self.assertEqual(parsed["updates"][0]["field_id"], "F14")

    def test_large_valid_profile_and_request_limit(self):
        profile = example_profile(40)
        profile["notes"] = "n" * 4000
        self.assertGreater(len(json.dumps({"profile": profile})), 8192)
        self.assertEqual(len(self.post("/api/profile/preview", {"profile": profile})["fields"]), 40)
        for body in ({"profile": {}}, {"profile": profile, "extra": "x" * 131072}):
            with self.subTest(size=len(json.dumps(body))), self.assertRaises(HTTPError) as error:
                self.post("/api/profile/preview", body)
            self.assertEqual(error.exception.code, 400)


if __name__ == "__main__":
    unittest.main()
