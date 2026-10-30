"""Behavioral checks: dropping a hard constraint must break these tests."""
import math
import copy
import time
import unittest

try:
    from backend.planner import Planner, parse_update, travel_minutes
except ImportError:
    Planner = None


class PlannerSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if Planner is not None:
            cls.engine = Planner()
            cls.demo = cls.engine.metadata()
            cls.runs = {name: cls.engine.replan(name, "balanced") for name in
                        ("baseline", "storm", "breakdown", "wet", "wind")}

    def setUp(self):
        self.assertIsNotNone(Planner, "The real planning engine is not implemented")

    def test_schedules_respect_all_hard_constraints(self):
        fields = {f["id"]: f for f in self.demo["fields"]}
        rigs = {r["id"]: r for r in self.demo["rigs"]}
        crew = {c["id"]: c for c in self.demo["crew"]}
        for scenario, run in self.runs.items():
            self.assertTrue(run["plans"], scenario)
            for plan in run["plans"]:
                seen = set()
                for rig_id, rig in rigs.items():
                    member = crew[rig["crew_id"]]
                    jobs = sorted((j for j in plan["schedule"] if j["rig_id"] == rig_id), key=lambda j: j["start"])
                    previous = {"x": 50, "y": 50}
                    previous_end = max(self.demo["now"], member["shift_start"], run["conditions"]["rig_available_from"][rig_id])
                    for job in jobs:
                        f = fields[job["field_id"]]
                        self.assertNotIn(f["id"], seen)
                        seen.add(f["id"])
                        self.assertGreaterEqual(job["start"], max(f["window_start"], previous_end + travel_minutes(previous, f)))
                        self.assertLessEqual(job["end"], f["window_end"])
                        self.assertGreater(job["end"], job["start"])
                        self.assertEqual(job["end"] - job["start"], math.ceil(f["acres"] * 60 / rig["acres_per_hour"]) + 5)
                        self.assertLessEqual(job["end"] + f["rainfast_minutes"], run["conditions"]["rain_time"])
                        self.assertIn(f["required_certification"], member["certifications"])
                        self.assertNotIn(f["id"], run["conditions"]["wet_fields"])
                        for interval in run["conditions"]["wind_intervals"]:
                            if job["start"] < interval["end"] and job["end"] > interval["start"]:
                                self.assertLessEqual(interval["mph"], f["wind_limit_mph"])
                        previous, previous_end = f, job["end"]
                    if jobs:
                        self.assertLessEqual(previous_end + travel_minutes(previous, {"x": 50, "y": 50}), member["shift_end"])

    def test_metrics_are_calculated_from_selected_jobs(self):
        fields = {f["id"]: f for f in self.demo["fields"]}
        for run in self.runs.values():
            for p in run["plans"]:
                self.assertEqual(p["acres"], sum(j["acres"] for j in p["schedule"]))
                self.assertEqual(p["priority_acres"], sum(j["acres"] for j in p["schedule"] if fields[j["field_id"]]["priority"]))
                self.assertEqual(p["fields_completed"], len(p["schedule"]))
                self.assertEqual(p["deferred_count"], 40 - p["fields_completed"])
                self.assertAlmostEqual(p["estimated_cost"], sum(p["cost_breakdown"].values()), places=2)
                self.assertEqual(p["cost_breakdown"]["application"], round(p["acres"] * 3.0, 2))
                self.assertEqual(p["cost_breakdown"]["travel"], round(p["travel_minutes"] * 1.2, 2))
                counted_travel = sum(j["travel_minutes"] for j in p["schedule"]) + sum(r["minutes"] for r in p["return_trips"])
                self.assertEqual(p["travel_minutes"], counted_travel)
                active_minutes = sum(r["arrival"] - max(self.demo["now"], run["conditions"]["rig_available_from"][r["rig_id"]]) for r in p["return_trips"])
                self.assertEqual(p["labor_hours"], round(active_minutes / 60, 2))
                self.assertEqual(p["cost_breakdown"]["labor"], round(active_minutes * 28 / 60, 2))
                self.assertEqual(p["min_rain_buffer_minutes"], min(run["conditions"]["rain_time"] - j["end"] - fields[j["field_id"]]["rainfast_minutes"] for j in p["schedule"]))
                self.assertNotIn("runoff_risk", p)

    def test_alternatives_are_distinct_in_completed_fields(self):
        for run in self.runs.values():
            signatures = [frozenset(j["field_id"] for j in p["schedule"]) for p in run["plans"]]
            self.assertEqual(len(signatures), len(set(signatures)))
            self.assertLessEqual(len(signatures), 3)

    def test_no_feasible_work_returns_no_fabricated_plan(self):
        run = self.engine.replan("baseline", "balanced", "wind 30 mph")
        self.assertEqual(run["plans"], [])
        self.assertTrue(any("feasible" in w.lower() for w in run["warnings"]))

    def test_completed_fields_are_excluded_without_mutating_metadata(self):
        engine = Planner()
        before = engine.metadata()
        completed = [job["field_id"] for job in self.runs["baseline"]["plans"][0]["schedule"][:3]]
        original_argument = list(completed)
        run = engine.replan("baseline", completed_fields=completed)
        self.assertEqual(completed, original_argument)
        self.assertEqual(run["completed_fields"], sorted(completed))
        self.assertEqual(run["remaining_field_count"], 37)
        self.assertTrue(run["plans"])
        remaining = {f["id"] for f in before["fields"]} - set(completed)
        for plan in run["plans"]:
            scheduled = {job["field_id"] for job in plan["schedule"]}
            deferred = {job["field_id"] for job in plan["deferred"]}
            self.assertEqual(scheduled | deferred, remaining)
            self.assertTrue(scheduled.isdisjoint(completed))
            self.assertTrue(deferred.isdisjoint(completed))
            self.assertEqual(plan["fields_scheduled"], len(scheduled))
            self.assertEqual(plan["fields_completed"] + plan["deferred_count"], 37)
            self.assertEqual(plan["acres"], sum(job["acres"] for job in plan["schedule"]))
        self.assertEqual(engine.metadata(), before)
        approved = engine.approve(run["run_id"], run["plans"][0]["id"])
        self.assertEqual(approved["completed_fields"], sorted(completed))
        self.assertEqual(approved["plan"], run["plans"][0])

    def test_all_fields_reported_done_returns_empty_remaining_work(self):
        engine = Planner()
        completed = [field["id"] for field in self.demo["fields"]]
        run = engine.replan(completed_fields=completed)
        self.assertEqual(run["plans"], [])
        self.assertEqual(run["remaining_field_count"], 0)
        self.assertEqual(run["candidate_count"], 0)
        self.assertTrue(any("all 40 fields" in warning.lower() for warning in run["warnings"]))
        self.assertFalse(any("no feasible" in warning.lower() for warning in run["warnings"]))

    def test_invalid_completed_field_lists_are_rejected(self):
        engine = Planner()
        for completed in ("F01", {"F01": True}, ("F01",), True, 0,
                          ["F99"], [1], [None], [[]], ["F01", "F01"], ["F01"] * 41):
            with self.subTest(completed=completed):
                with self.assertRaisesRegex(ValueError, "completed_fields"):
                    engine.replan(completed_fields=completed)
        self.assertIsNone(engine.latest_run)

    def test_approval_rejects_a_completed_field_reintroduced_into_schedule(self):
        engine = Planner()
        run = engine.replan("storm", completed_fields=["F01"])
        stored = engine.latest_run["plans"][0]
        stored["schedule"][0]["field_id"] = "F01"
        with self.assertRaisesRegex(ValueError, "validation"):
            engine.approve(run["run_id"], stored["id"])
        self.assertIsNone(engine.approval)

    def test_new_run_invalidates_older_approval(self):
        engine = Planner()
        first = engine.replan("storm", "balanced")
        second = engine.replan("wet", "balanced")
        with self.assertRaisesRegex(ValueError, "stale"):
            engine.approve(first["run_id"], first["plans"][0]["id"])
        approved = engine.approve(second["run_id"], second["plans"][0]["id"])
        self.assertTrue(approved["local_only"])
        self.assertFalse(approved["dispatched"])

    def test_expired_approval_is_rejected(self):
        engine = Planner()
        run = engine.replan("storm", "balanced")
        engine.run_created_at = time.monotonic() - 301
        with self.assertRaisesRegex(ValueError, "expired"):
            engine.approve(run["run_id"], run["plans"][0]["id"])

    def test_known_update_is_proposed_and_unknown_update_is_flagged(self):
        parsed = parse_update("rig 3 hydraulic leak, down till 2pm")
        self.assertEqual(parsed["updates"][0]["rig_id"], "R3")
        self.assertEqual(parsed["updates"][0]["available_from"], 840)
        self.assertEqual(parsed["parser"], "deterministic-demo")
        self.assertEqual(parse_update("please work faster")["updates"], [])
        self.assertTrue(parse_update("please work faster")["warnings"])

    def test_known_schematic_driving_distance(self):
        self.assertEqual(travel_minutes({"x": 0, "y": 0}, {"x": 3, "y": 4}), 3)
        self.assertEqual(travel_minutes({"x": 0, "y": 0}, {"x": 0, "y": 0}), 2)

    def test_ambiguous_text_is_not_applied(self):
        for text in ("rain moved from 2pm to 10am", "field 14 is not wet",
                     "rig 3 down till 2pm and field 14 wet", "field 14 isn't wet"):
            parsed = parse_update(text)
            self.assertEqual(parsed["updates"], [], text)
            self.assertTrue(parsed["warnings"], text)

    def test_metric_priority_ranks_actual_values(self):
        engine = Planner()
        for priority, key, reverse in (("acres", "acres", True), ("cost", "estimated_cost", False),
                                       ("buffer", "min_rain_buffer_minutes", True)):
            plans = engine.replan("breakdown", priority)["plans"]
            values = [p[key] for p in plans]
            self.assertEqual(values, sorted(values, reverse=reverse), priority)

    def test_corrupt_plan_cannot_be_approved(self):
        engine = Planner()
        run = engine.replan("storm", "balanced")
        stored_plan = engine.latest_run["plans"][0]
        stored_plan["schedule"][0]["start"] = 0
        with self.assertRaisesRegex(ValueError, "validation"):
            engine.approve(run["run_id"], stored_plan["id"])
        self.assertIsNone(engine.approval)

    def test_validator_rejects_corrupt_metrics_and_hard_constraints(self):
        import backend.planner as module
        self.assertTrue(hasattr(module, "validate_plan"), "Independent validator is not implemented")
        run = self.runs["storm"]
        plan = run["plans"][0]
        module.validate_plan(plan, self.demo["fields"], self.demo["rigs"], self.demo["crew"], run["conditions"])
        for change in ("cost", "crew", "travel", "wet", "rain", "scheduled_count"):
            bad = copy.deepcopy(plan)
            conditions = copy.deepcopy(run["conditions"])
            if change == "cost":
                bad["estimated_cost"] += 100
            elif change == "crew":
                bad["schedule"][0]["crew_name"] = "Unassigned person"
            elif change == "travel":
                bad["schedule"][0]["travel_minutes"] = 0
            elif change == "wet":
                conditions["wet_fields"].append(bad["schedule"][0]["field_id"])
            elif change == "scheduled_count":
                bad["fields_scheduled"] += 1
            else:
                conditions["rain_time"] = 500
            with self.assertRaisesRegex(ValueError, "validation", msg=change):
                module.validate_plan(bad, self.demo["fields"], self.demo["rigs"], self.demo["crew"], conditions)


if __name__ == "__main__":
    unittest.main()
