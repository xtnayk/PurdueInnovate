"""Synthetic, bounded route-candidate scheduling with OR-Tools CP-SAT.

This is a planning demonstration, not a pesticide application recommendation.
No network services, real fields, product labels, or machinery are connected.
"""
from __future__ import annotations

import copy
import math
import random
import re
import threading
import time
import uuid

from ortools.sat.python import cp_model

from .profiles import feedback_constraints as validate_feedback, profile_metadata
from .incidents import normalize_incidents, apply_incidents

NOW = 480
DEPOT = {"x": 50, "y": 50}
APPLICATION_PER_ACRE = 3.00
TRAVEL_PER_MINUTE = 1.20
LABOR_PER_HOUR = 28.00
APPROVAL_TTL_SECONDS = 300
SCENARIOS = {"baseline", "storm", "breakdown", "wet", "wind"}
PRIORITIES = {"balanced", "acres", "cost", "buffer"}


def travel_minutes(origin, destination):
    """Synthetic schematic distance, including a minimum two-minute transfer."""
    return max(2, math.ceil(math.hypot(origin["x"] - destination["x"], origin["y"] - destination["y"]) * 0.42))


def _data():
    rng = random.Random(21)
    crew = [
        {"id": "C1", "name": "Avery Reed", "certifications": ["standard", "special"], "shift_end": 1080},
        {"id": "C2", "name": "Morgan Patel", "certifications": ["standard"], "shift_end": 1020},
        {"id": "C3", "name": "Jordan Ellis", "certifications": ["standard", "special"], "shift_end": 1080},
        {"id": "C4", "name": "Casey Brooks", "certifications": ["standard"], "shift_end": 1020},
        {"id": "C5", "name": "Taylor Chen", "certifications": ["standard", "special"], "shift_end": 1080},
        {"id": "C6", "name": "Riley Davis", "certifications": ["standard"], "shift_end": 1020},
    ]
    for c in crew:
        c.update(shift_start=NOW, certification=" / ".join(c["certifications"]))
    rigs = [{"id": f"R{i+1}", "name": f"Rig {i+1}", "crew_id": crew[i]["id"],
             "crew_name": crew[i]["name"], "color": color, "acres_per_hour": rate}
            for i, (color, rate) in enumerate(zip(["#1d6f55", "#b86c30", "#3e669c", "#8b5790"], [72, 78, 84, 72]))]
    fields = []
    for i in range(1, 41):
        fields.append({"id": f"F{i:02}", "name": f"Field {i:02}", "acres": rng.randrange(32, 87),
                       "x": 9 + ((i - 1) % 8) * 11 + rng.randrange(-3, 4),
                       "y": 13 + ((i - 1) // 8) * 17 + rng.randrange(-4, 5),
                       "priority": i % 4 == 0 or i in (3, 14, 23),
                       "window_start": NOW + (90 if i % 9 == 0 else 0),
                       "window_end": 840 if i % 7 == 0 else (960 if i % 3 == 0 else 1080),
                       "rainfast_minutes": [60, 90, 120][i % 3],
                       "required_certification": "special" if i % 5 == 0 else "standard",
                       "wind_limit_mph": 10 if i % 6 == 0 else 15,
                       "wet": False, "sensitive": i % 6 == 0})
    return fields, rigs, crew


def _clock(text):
    match = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", text)
    if not match:
        return None
    hour, minute = int(match[1]), int(match[2] or 0)
    if not 1 <= hour <= 12 or not 0 <= minute <= 59:
        return None
    return (hour % 12 + (12 if match[3] == "pm" else 0)) * 60 + minute


def parse_update(text):
    if not isinstance(text, str) or len(text) > 1000:
        raise ValueError("Update must be text of at most 1,000 characters.")
    cleaned = text.strip().lower().replace("’", "'")
    updates, warnings = [], []
    # This parser intentionally supports one known update per message. It never
    # pretends an LLM extracted or understood unsupported free-form language.
    if not cleaned:
        return {"parser": "deterministic-demo", "updates": [], "warnings": [], "requires_confirmation": False}
    times = re.findall(r"\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b", cleaned)
    entities = re.findall(r"\b(?:rig|field)\s*\d+\b", cleaned)
    categories = sum(bool(re.search(pattern, cleaned)) for pattern in
                     (r"\brig\s*\d+", r"\bfield\s*\d+", r"\brain\b", r"\bwind\b"))
    negated = re.search(r"\b(?:not|never|no|cannot|can't|isn't|wasn't|aren't|won't|don't|doesn't)\b", cleaned)
    if len(times) > 1 or len(entities) > 1 or categories > 1 or negated:
        return {"parser": "deterministic-demo", "updates": [], "requires_confirmation": False,
                "warnings": ["Ambiguous or compound update was not applied. Enter one affirmative fact with one time, such as 'rain at 10am' or 'field 14 too wet'."]}
    rig = re.search(r"\brig\s*([1-4])\b", cleaned)
    field = re.search(r"\bfield\s*0?(\d{1,2})\b", cleaned)
    wind = re.search(r"\bwind\D{0,12}(\d{1,2})\s*(?:mph|miles)", cleaned)
    minute = _clock(cleaned)
    if rig and re.search(r"leak|down|broke|repair|unavailable", cleaned):
        if minute is None:
            warnings.append("Include an explicit repair time such as '2pm'; no equipment status was changed.")
        elif minute < NOW:
            warnings.append("The repair time is before the demo's 8am planning time; no status was changed.")
        else:
            updates.append({"type": "rig_unavailable", "rig_id": f"R{rig[1]}", "available_from": minute})
            warnings.append("Repair time is an assumption, not a confirmed equipment release.")
    elif field and re.search(r"wet|mud|flood|saturated", cleaned):
        if 1 <= int(field[1]) <= 40:
            updates.append({"type": "field_wet", "field_id": f"F{int(field[1]):02}"})
        else:
            warnings.append("That field is outside the 40-field demonstration.")
    elif "rain" in cleaned and minute is not None:
        updates.append({"type": "rain_time", "rain_time": minute})
    elif wind:
        updates.append({"type": "wind", "wind_mph": int(wind[1])})
        warnings.append("This demo applies a text wind update to the entire remaining day.")
    else:
        warnings.append("Update not recognized. Try 'rig 3 down till 2pm', 'field 14 too wet', 'rain at 1pm', or 'wind 18 mph'.")
    if updates:
        warnings.append("Only one update per message is supported; review the structured interpretation.")
    return {"parser": "deterministic-demo", "updates": updates, "warnings": warnings,
            "requires_confirmation": bool(updates)}


def _parse_update_for_farm(text, fields, rigs):
    parsed = parse_update(text)
    known_fields = {field["id"] for field in fields}
    known_rigs = {rig["id"] for rig in rigs}
    for item in parsed["updates"]:
        unknown = (item.get("field_id") and item["field_id"] not in known_fields) or (item.get("rig_id") and item["rig_id"] not in known_rigs)
        if unknown:
            raise ValueError("Text update references a field or rig outside this farm profile; no update was applied.")
    return parsed


def _conditions(scenario, updates, custom_fields=None, custom_rigs=None, conservative=False):
    result = {"rain_time": 1110, "wind_mph": 8, "wet_fields": [],
              "rig_available_from": {f"R{i}": NOW for i in range(1, 5)},
              "wind_intervals": [{"start": NOW, "end": 1440, "mph": 8}],
              "note": "Synthetic forecast: rain at 6:30pm, wind 8 mph."}
    if scenario == "storm":
        result.update(rain_time=840, note="Synthetic storm moved forward: rain now begins at 2pm.")
    elif scenario == "breakdown":
        rig_id = "R3" if custom_rigs is None or "R3" in custom_rigs else custom_rigs[0]
        result["rig_available_from"][rig_id] = 840
        result["note"] = f"{rig_id} is unavailable until 2pm; its assigned operator stays with it."
    elif scenario == "wet":
        result["wet_fields"] = ["F06", "F13", "F14", "F22", "F30", "F31"] if custom_fields is None else custom_fields[:6]
        result["note"] = "Six synthetic fields are excluded as too wet to enter."
    elif scenario == "wind":
        result.update(wind_mph=18, wind_intervals=[{"start": NOW, "end": 600, "mph": 8},
                                                  {"start": 600, "end": 840, "mph": 18},
                                                  {"start": 840, "end": 1440, "mph": 8}],
                      note="Synthetic wind rises to 18 mph from 10am to 2pm; spraying pauses in that interval.")
    for update in updates:
        if update["type"] == "rig_unavailable":
            result["rig_available_from"][update["rig_id"]] = max(result["rig_available_from"][update["rig_id"]], update["available_from"]) if conservative else update["available_from"]
        elif update["type"] == "field_wet":
            result["wet_fields"] = sorted(set(result["wet_fields"] + [update["field_id"]]))
        elif update["type"] == "rain_time":
            result["rain_time"] = min(result["rain_time"], update["rain_time"]) if conservative else update["rain_time"]
        elif update["type"] == "wind":
            result["wind_mph"] = max(result["wind_mph"], update["wind_mph"]) if conservative else update["wind_mph"]
            result["wind_intervals"] = ([{**interval, "mph": max(interval["mph"], update["wind_mph"])} for interval in result["wind_intervals"]]
                                        if conservative else [{"start": NOW, "end": 1440, "mph": update["wind_mph"]}])
    return result


def _append_job(route, field, rig, crew, conditions):
    if (field["id"] in route["field_ids"] or field["id"] in conditions["wet_fields"]
            or field["id"] in conditions.get("excluded_fields", [])):
        return None
    if field["required_certification"] not in crew["certifications"]:
        return None
    travel = travel_minutes(route["last"], field)
    start = max(route["end"] + travel, field["window_start"])
    duration = math.ceil(field["acres"] * 60 / rig["acres_per_hour"]) + 5
    for interval in conditions["wind_intervals"]:
        if interval["mph"] > field["wind_limit_mph"] and start < interval["end"] and start + duration > interval["start"]:
            start = interval["end"]
    end = start + duration
    if end > field["window_end"] or end + field["rainfast_minutes"] > conditions["rain_time"]:
        return None
    if end + travel_minutes(field, DEPOT) > crew["shift_end"]:
        return None
    job = {"field_id": field["id"], "rig_id": rig["id"], "crew_name": crew["name"],
           "start": start, "end": end, "acres": field["acres"], "travel_minutes": travel,
           "rainfast_minutes": field["rainfast_minutes"]}
    return {"jobs": route["jobs"] + [job], "field_ids": route["field_ids"] | {field["id"]},
            "last": field, "end": end, "depart": route["depart"], "rig_id": rig["id"],
            "acres": route["acres"] + field["acres"],
            "priority_acres": route["priority_acres"] + (field["acres"] if field["priority"] else 0),
            "travel": route["travel"] + travel,
            "buffer": min(route["buffer"], conditions["rain_time"] - end - field["rainfast_minutes"])}


def _route_candidates(fields, rig, crew, conditions):
    departure = max(NOW, crew["shift_start"], conditions["rig_available_from"][rig["id"]])
    empty = {"jobs": [], "field_ids": frozenset(), "last": DEPOT, "end": departure,
             "depart": departure, "rig_id": rig["id"], "acres": 0, "priority_acres": 0,
             "travel": 0, "buffer": 1440}
    candidates = {}
    for strategy in ("acres", "cost", "buffer"):
        by_length = {}
        for first in fields:
            route = _append_job(empty, first, rig, crew, conditions)
            while route is not None:
                by_length.setdefault(len(route["jobs"]), []).append(route)
                if len(route["jobs"]) >= 10:
                    break
                next_routes = []
                for field in fields:
                    next_route = _append_job(route, field, rig, crew, conditions)
                    if next_route:
                        elapsed = next_route["end"] - route["end"]
                        score = field["acres"] * (1.6 if field["priority"] else 1) / max(1, elapsed)
                        if strategy == "cost":
                            score = field["acres"] / (elapsed * LABOR_PER_HOUR / 60 + next_route["jobs"][-1]["travel_minutes"] * TRAVEL_PER_MINUTE)
                        elif strategy == "buffer":
                            score = (field["acres"] + (35 if field["priority"] else 0)) / max(1, elapsed + field["rainfast_minutes"] * 0.35)
                        next_routes.append((score, next_route))
                route = max(next_routes, key=lambda x: x[0])[1] if next_routes else None
        for length, routes in by_length.items():
            # Preserve all one-stop jobs; longer routes are a bounded candidate
            # sample. CP-SAT optimizes over these candidates, not all permutations.
            limit = 40 if length == 1 else 14
            ranked = sorted(routes, key=lambda r: (r["priority_acres"] * 2 + r["acres"]) / max(1, r["end"] - r["depart"]), reverse=True)
            for route in ranked[:limit]:
                signature = tuple(j["field_id"] for j in route["jobs"])
                candidates[signature] = route
    for route in candidates.values():
        route["return_travel"] = travel_minutes(route["last"], DEPOT)
        route["travel_total"] = route["travel"] + route["return_travel"]
        route["labor_minutes"] = route["end"] + route["return_travel"] - route["depart"]
        route["cost_cents"] = round((route["acres"] * APPLICATION_PER_ACRE + route["travel_total"] * TRAVEL_PER_MINUTE + route["labor_minutes"] * LABOR_PER_HOUR / 60) * 100)
    return list(candidates.values())


def _solve(routes, fields, objective, previous, floor_acres=0, floor_priority=0):
    model = cp_model.CpModel()
    selected = [model.new_bool_var(f"route_{i}") for i in range(len(routes))]
    for rig in ("R1", "R2", "R3", "R4"):
        model.add(sum(selected[i] for i, route in enumerate(routes) if route["rig_id"] == rig) <= 1)
    served = {}
    for field in fields:
        variable = model.new_bool_var(field["id"])
        model.add(variable == sum(selected[i] for i, route in enumerate(routes) if field["id"] in route["field_ids"]))
        served[field["id"]] = variable
    for field_set in previous:
        # An alternative must change at least two completed/deferred decisions.
        model.add(sum(1 - served[f["id"]] if f["id"] in field_set else served[f["id"]] for f in fields) >= 2)
    acres = sum(route["acres"] * selected[i] for i, route in enumerate(routes))
    priority_acres = sum(route["priority_acres"] * selected[i] for i, route in enumerate(routes))
    cost = sum(route["cost_cents"] * selected[i] for i, route in enumerate(routes))
    model.add(acres >= max(1, floor_acres))
    model.add(priority_acres >= floor_priority)
    if objective == "cost":
        model.minimize(cost)
    elif objective == "buffer":
        buffer = model.new_int_var(0, 1440, "minimum_rain_buffer")
        for i, route in enumerate(routes):
            model.add(buffer <= route["buffer"]).only_enforce_if(selected[i])
        model.maximize(buffer * 100000 + acres * 100 + priority_acres)
    else:
        model.maximize(acres * 100000 + priority_acres * 1000 - cost)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 0.8
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 21
    start = time.monotonic()
    status = solver.solve(model)
    elapsed = time.monotonic() - start
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None, solver.status_name(status), elapsed
    return [route for i, route in enumerate(routes) if solver.value(selected[i])], solver.status_name(status), elapsed


def _plan(selected, objective, fields, rigs, crew, conditions, status, elapsed):
    jobs = sorted([j for route in selected for j in route["jobs"]], key=lambda j: (j["rig_id"], j["start"]))
    completed = {j["field_id"] for j in jobs}
    acres = sum(j["acres"] for j in jobs)
    labor = sum(r["labor_minutes"] for r in selected)
    travel = sum(r["travel_total"] for r in selected)
    breakdown = {"application": round(acres * APPLICATION_PER_ACRE, 2),
                 "travel": round(travel * TRAVEL_PER_MINUTE, 2),
                 "labor": round(labor * LABOR_PER_HOUR / 60, 2)}
    deferred = []
    for field in fields:
        if field["id"] in completed:
            continue
        if field["id"] in conditions.get("excluded_fields", []):
            reason = "Excluded by the farm profile or reviewed manager feedback."
        elif field["id"] in conditions["wet_fields"]:
            reason = "Excluded: marked too wet to enter."
        elif all(w["mph"] > field["wind_limit_mph"] for w in conditions["wind_intervals"]):
            reason = "Excluded: forecast wind exceeds this field's demo limit."
        elif field["window_start"] + 5 + field["rainfast_minutes"] >= conditions["rain_time"]:
            reason = "No available rainfast window."
        else:
            reason = "Deferred by this plan's capacity, timing and objective; no constraint was relaxed."
        deferred.append({"field_id": field["id"], "reason": reason})
    names = {"acres": "Protect acreage", "cost": "Control cost", "buffer": "Build rain buffer"}
    descriptions = {"acres": "Strongly favors completed acreage, with secondary weights for priority acres and cost, within generated routes.",
                    "cost": "Minimizes modeled cost while retaining at least 85% of the acreage plan's acres and priority acres.",
                    "buffer": "Strongly favors the smallest rainfast buffer, with secondary acreage weights, while retaining at least 85% of the acreage plan's acres and priority acres."}
    return {"id": str(uuid.uuid4())[:8], "name": names[objective], "objective": objective,
            "summary": descriptions[objective], "acres": acres,
            "priority_acres": sum(r["priority_acres"] for r in selected),
            "fields_completed": len(jobs), "fields_scheduled": len(jobs), "deferred_count": len(deferred),
            "estimated_cost": round(sum(breakdown.values()), 2), "labor_hours": round(labor / 60, 2),
            "travel_minutes": travel, "min_rain_buffer_minutes": min(r["buffer"] for r in selected),
            "cost_breakdown": breakdown, "solver_status": status, "solve_seconds": round(elapsed, 3),
            "schedule": jobs, "deferred": deferred,
            "return_trips": [{"rig_id": r["rig_id"], "minutes": r["return_travel"], "arrival": r["end"] + r["return_travel"]} for r in selected],
            "search_scope": "Bounded, generated route candidates; no global routing optimality claim."}


def validate_plan(plan, fields, rigs, crew, conditions):
    """Independently audit a result; never trust route-generation state.

    This pass rebuilds chronology and accounting from public schedule rows and
    source metadata, both before presentation and before local approval.
    """
    def require(condition, detail):
        if not condition:
            raise ValueError(f"Plan validation failed: {detail}")

    field_map = {field["id"]: field for field in fields}
    rig_map = {rig["id"]: rig for rig in rigs}
    crew_map = {person["id"]: person for person in crew}
    jobs = plan.get("schedule", [])
    require(bool(jobs), "the schedule has no work")
    seen = set()
    total_acres = total_priority = total_travel = total_labor = 0
    rain_buffers, expected_returns = [], {}
    for job in jobs:
        require(job.get("field_id") in field_map, "unknown field")
        require(job.get("rig_id") in rig_map, "unknown rig")
        require(job["field_id"] not in seen, "a field is assigned twice")
        seen.add(job["field_id"])
    for rig_id, rig in rig_map.items():
        person = crew_map[rig["crew_id"]]
        route_jobs = sorted((j for j in jobs if j["rig_id"] == rig_id), key=lambda j: j["start"])
        if not route_jobs:
            continue
        departure = max(NOW, person["shift_start"], conditions["rig_available_from"][rig_id])
        previous_end, previous_location = departure, DEPOT
        for job in route_jobs:
            field = field_map[job["field_id"]]
            require(type(job.get("start")) is int and type(job.get("end")) is int, "times must be integer minutes")
            require(job["crew_name"] == person["name"], "fixed operator assignment changed")
            require(field["required_certification"] in person["certifications"], "operator lacks required certification")
            require(field["id"] not in conditions["wet_fields"], "a wet field was assigned")
            require(not field.get("excluded", False) and field["id"] not in conditions.get("excluded_fields", []), "an excluded field was assigned")
            require(job["acres"] == field["acres"], "field acreage changed")
            drive = travel_minutes(previous_location, field)
            require(job["travel_minutes"] == drive, "travel time is incorrect")
            require(job["start"] >= previous_end + drive, "route overlaps or omits travel/availability time")
            require(job["start"] >= field["window_start"], "job starts before its field window")
            require(job["end"] <= field["window_end"], "job ends after its field window")
            require(job["end"] - job["start"] == math.ceil(field["acres"] * 60 / rig["acres_per_hour"]) + 5,
                    "application duration does not match rig capacity")
            rain_buffer = conditions["rain_time"] - job["end"] - field["rainfast_minutes"]
            require(rain_buffer >= 0, "required drying time extends into forecast rain")
            require(job.get("rainfast_minutes") == field["rainfast_minutes"], "displayed rainfast requirement changed")
            for interval in conditions["wind_intervals"]:
                if job["start"] < interval["end"] and job["end"] > interval["start"]:
                    require(interval["mph"] <= field["wind_limit_mph"], "spraying overlaps excessive forecast wind")
            rain_buffers.append(rain_buffer)
            total_acres += field["acres"]
            total_priority += field["acres"] if field["priority"] else 0
            total_travel += drive
            previous_location, previous_end = field, job["end"]
        return_drive = travel_minutes(previous_location, DEPOT)
        arrival = previous_end + return_drive
        require(arrival <= person["shift_end"], "return to depot exceeds operator shift")
        expected_returns[rig_id] = {"rig_id": rig_id, "minutes": return_drive, "arrival": arrival}
        total_travel += return_drive
        total_labor += arrival - departure
    require(len(plan.get("return_trips", [])) == len(expected_returns), "return trip count is incorrect")
    require({trip["rig_id"]: trip for trip in plan.get("return_trips", [])} == expected_returns, "return trips are incorrect")
    expected_cost = {"application": round(total_acres * APPLICATION_PER_ACRE, 2),
                     "travel": round(total_travel * TRAVEL_PER_MINUTE, 2),
                     "labor": round(total_labor * LABOR_PER_HOUR / 60, 2)}
    require(plan.get("cost_breakdown") == expected_cost, "cost components do not match the schedule")
    require(plan.get("estimated_cost") == round(sum(expected_cost.values()), 2), "total cost does not match components")
    require(plan.get("acres") == total_acres, "total acreage is incorrect")
    require(plan.get("priority_acres") == total_priority, "priority acreage is incorrect")
    require(plan.get("travel_minutes") == total_travel, "total travel is incorrect")
    require(plan.get("labor_hours") == round(total_labor / 60, 2), "labor hours are incorrect")
    require(plan.get("min_rain_buffer_minutes") == min(rain_buffers), "rain buffer is incorrect")
    require(plan.get("fields_completed") == len(seen), "completed field count is incorrect")
    require(plan.get("fields_scheduled", len(seen)) == len(seen), "scheduled field count is incorrect")
    deferred = plan.get("deferred", [])
    require(plan.get("deferred_count") == len(fields) - len(seen) == len(deferred), "deferred field count is incorrect")
    require({f["field_id"] for f in deferred} == set(field_map) - seen, "deferred field list is incorrect")


class Planner:
    def __init__(self):
        self.fields, self.rigs, self.crew = _data()
        self.lock = threading.RLock()
        self.latest_run = None
        self.latest_inputs = None
        self.run_created_at = 0
        self.approval = None

    def metadata(self):
        return {"name": "Fieldwork", "date": "2026-05-21", "now": NOW,
                "fields": copy.deepcopy(self.fields), "rigs": copy.deepcopy(self.rigs), "crew": copy.deepcopy(self.crew),
                "assumptions": [
                    "All 40 fields, coordinates, weather, crew, product rules and costs are synthetic. This is not field-ready advice.",
                    "Four rigs have fixed operators. Two reserve applicators are shown but not reassigned by this demo.",
                    "Travel is schematic distance, not road routing; each route starts and ends at the central depot.",
                    "Spraying takes acreage / rig capacity plus five minutes setup per field. No refill, chemical mixing or meal breaks are modeled.",
                    "$3.00/acre machine operation + $1.20/travel-minute + $28/operator-hour. Chemical, overhead, tax and profit are excluded; rates are illustrative.",
                    "Labor counts departure through return, including waiting during a route. It excludes idle crew and breakdown repair time before departure.",
                    "CP-SAT selects disjoint route candidates with a 0.8-second limit per objective; OPTIMAL only means optimal within that candidate pool.",
                    "Cost and buffer alternatives retain at least 85% of the acreage plan's acres and priority acres; each alternative changes at least two field decisions.",
                    "Weighted objectives: acreage = 100000×acres + 1000×priority acres − cost cents; buffer = 100000×minimum buffer minutes + 100×acres + priority acres.",
                    "Rain buffer is minutes after required drying time and before forecast rain. It is not a runoff, drift or probability score.",
                    "Text interpretation uses a restricted deterministic parser. Gemini, live sensors, messaging and ISOXML are not connected.",
                    "Only the latest run may be approved, within five minutes. Approval is local memory only and never dispatches equipment."
                ], "cost_rates": {"machine_per_acre": APPLICATION_PER_ACRE, "travel_per_minute": TRAVEL_PER_MINUTE, "labor_per_hour": LABOR_PER_HOUR}}

    def preview_profile(self, profile):
        return profile_metadata(profile, self.metadata())

    def parse(self, text, profile=None):
        metadata = self.preview_profile(profile) if profile is not None else self.metadata()
        return _parse_update_for_farm(text, metadata["fields"], metadata["rigs"])

    def _remaining_fields(self, completed_fields, source_fields=None):
        """Validate a reported completion snapshot without mutating field metadata."""
        source_fields = self.fields if source_fields is None else source_fields
        if completed_fields is None:
            completed_fields = []
        if not isinstance(completed_fields, list) or len(completed_fields) > len(source_fields):
            raise ValueError("completed_fields must be a list of at most 40 unique field IDs.")
        if any(not isinstance(field_id, str) for field_id in completed_fields):
            raise ValueError("completed_fields must contain only known field ID strings.")
        completed = set(completed_fields)
        if len(completed) != len(completed_fields):
            raise ValueError("completed_fields must not contain duplicate field IDs.")
        if not completed.issubset({field["id"] for field in source_fields}):
            raise ValueError("completed_fields contains an unknown field ID.")
        return sorted(completed), [field for field in source_fields if field["id"] not in completed]

    def replan(self, scenario="baseline", priority=None, update="", completed_fields=None,
               profile=None, feedback_constraints=None, incidents=None):
        metadata = self.preview_profile(profile) if profile is not None else self.metadata()
        if priority is None:
            priority = metadata.get("preferences", {}).get("priority", "balanced")
        if not isinstance(scenario, str) or scenario not in SCENARIOS or not isinstance(priority, str) or priority not in PRIORITIES:
            raise ValueError("Unknown scenario or priority.")
        all_fields, rigs, people = metadata["fields"], metadata["rigs"], metadata["crew"]
        feedback = validate_feedback(feedback_constraints, all_fields, rigs)
        reports = normalize_incidents(incidents, all_fields, rigs)
        for field in all_fields:
            if field["id"] in feedback["priority_fields"]:
                field["priority"] = True
        completed, fields = self._remaining_fields(completed_fields, all_fields)
        parsed = _parse_update_for_farm(update, all_fields, rigs)
        known_fields, known_rigs = {field["id"] for field in all_fields}, {rig["id"] for rig in rigs}
        with self.lock:
            start = time.monotonic()
            conditions = _conditions(scenario, parsed["updates"],
                                     [f["id"] for f in all_fields] if profile is not None else None,
                                     [r["id"] for r in rigs] if profile is not None else None,
                                     conservative=bool(reports))
            apply_incidents(conditions, reports)
            conditions["wet_fields"] = sorted(set(conditions["wet_fields"]) & known_fields)
            conditions["rig_available_from"] = {rig_id: max(metadata["now"], conditions["rig_available_from"][rig_id]) for rig_id in sorted(known_rigs)}
            conditions["excluded_fields"] = sorted({field["id"] for field in all_fields if field.get("excluded")} | set(feedback["excluded_fields"]))
            for rig_id in feedback["unavailable_rigs"]:
                conditions["rig_available_from"][rig_id] = 1440
            warnings = list(parsed["warnings"])
            if scenario == "wet":
                conditions["note"] = f"{len(conditions['wet_fields'])} matching fields are excluded by the synthetic wet-field scenario."
            if reports:
                conditions["note"] += f" {len(reports)} unresolved reports are included; stricter reported restrictions take precedence."
                warnings.append("All supplied unresolved incidents are included in this run. Reports are local demo inputs, not verified live telemetry; approving a response does not resolve an incident.")
            if any(feedback.values()):
                warnings.append("Reviewed manager feedback is applied to this run. Excluded fields and unavailable rigs are hard holds; priority fields influence the objective but are not guaranteed first.")
            if set(feedback["priority_fields"]) & (set(conditions["excluded_fields"]) | set(conditions["wet_fields"]) | set(completed)):
                warnings.append("A priority field is also excluded, wet or already done. Its hold takes precedence over priority.")
            crew = {c["id"]: c for c in people}
            routes = []
            for rig in rigs:
                routes.extend(_route_candidates(fields, rig, crew[rig["crew_id"]], conditions))
            plans, previous = [], []
            if completed:
                warnings.append(f"{len(completed)} fields reported done are excluded. This demo plans from the configured start of day, not live equipment positions.")
            floor_acres = floor_priority = 0
            for objective in ("acres", "cost", "buffer"):
                if not routes:
                    break
                selected, status, elapsed = _solve(routes, fields, objective, previous, floor_acres, floor_priority)
                if not selected:
                    warnings.append(f"{objective.title()} search returned {status}; no unsupported alternative is shown.")
                    if objective == "acres":
                        break
                    continue
                plan = _plan(selected, objective, fields, rigs, people, conditions, status, elapsed)
                validate_plan(plan, fields, rigs, people, conditions)
                plans.append(plan)
                previous.append({j["field_id"] for j in plan["schedule"]})
                if objective == "acres":
                    floor_acres = math.ceil(plan["acres"] * 0.85)
                    floor_priority = math.ceil(plan["priority_acres"] * 0.85)
            if not plans:
                if not fields:
                    warnings.append(f"All {len(all_fields)} fields are reported done. There is no remaining field work to schedule.")
                else:
                    warnings.append("No feasible work plan was found. Hold dispatch and review conditions; hard constraints were not relaxed.")
            if priority == "balanced":
                # Disclosed weighted normalization, never an invented safety score.
                if plans:
                    max_acres = max(p["acres"] for p in plans)
                    max_buffer = max(1, max(p["min_rain_buffer_minutes"] for p in plans))
                    min_cost = min(p["estimated_cost"] for p in plans)
                    plans.sort(key=lambda p: 0.5 * p["acres"] / max_acres + 0.25 * min_cost / p["estimated_cost"] + 0.25 * p["min_rain_buffer_minutes"] / max_buffer, reverse=True)
            else:
                metric = {"acres": "acres", "cost": "estimated_cost", "buffer": "min_rain_buffer_minutes"}[priority]
                plans.sort(key=lambda p: p[metric], reverse=priority != "cost")
            for rank, plan in enumerate(plans, 1):
                plan["rank"] = rank
            run = {"run_id": str(uuid.uuid4()), "scenario": scenario, "priority": priority,
                   "completed_fields": completed, "remaining_field_count": len(fields),
                   "profile_id": metadata.get("profile_id", "demo"), "feedback_constraints": feedback,
                   "incidents": reports,
                   "conditions": conditions, "plans": plans, "warnings": warnings,
                   "solve_seconds": round(time.monotonic() - start, 3), "parsed_update": parsed,
                   "candidate_count": len(routes), "approval_ttl_seconds": APPROVAL_TTL_SECONDS,
                   "ranking_explanation": "Balanced: 50% relative acreage, 25% relative cost, 25% relative rain buffer among shown plans." if priority == "balanced" else
                       {"acres": "Ranked by modeled scheduled acreage, highest first.",
                        "cost": "Ranked by actual modeled total cost, lowest first.",
                        "buffer": "Ranked by actual minimum rainfast buffer, largest first."}[priority],
                   "synthetic": True}
            self.latest_run = copy.deepcopy(run)
            self.latest_inputs = copy.deepcopy({"fields": fields, "rigs": rigs, "crew": people,
                                                "incidents": reports, "conditions": conditions})
            self.run_created_at = time.monotonic()
            self.approval = None
            return run

    def approve(self, run_id, plan_id):
        with self.lock:
            if not self.latest_run or run_id != self.latest_run["run_id"]:
                raise ValueError("This run is stale. Replan and review the latest conditions before approval.")
            if time.monotonic() - self.run_created_at > APPROVAL_TTL_SECONDS:
                raise ValueError("This run has expired. Replan before approval.")
            plan = next((p for p in self.latest_run["plans"] if p["id"] == plan_id), None)
            if plan is None:
                raise ValueError("Plan does not belong to the current run.")
            completed = self.latest_run["completed_fields"]
            inputs = self.latest_inputs
            validate_plan(plan, inputs["fields"], inputs["rigs"], inputs["crew"], inputs["conditions"])
            if self.approval:
                if self.approval["plan_id"] == plan_id:
                    return copy.deepcopy(self.approval)
                raise ValueError("A different plan is already approved for this run. Replan to change it.")
            self.approval = {"run_id": run_id, "plan_id": plan_id, "local_only": True,
                             "completed_fields": completed, "profile_id": self.latest_run["profile_id"],
                             "feedback_constraints": copy.deepcopy(self.latest_run["feedback_constraints"]),
                             "incidents": copy.deepcopy(self.latest_inputs["incidents"]),
                             "dispatched": False, "status": "approved_locally", "plan": copy.deepcopy(plan),
                             "message": "Approved in this local demo only. No SMS or equipment task was sent.",
                             "synthetic": True}
            return copy.deepcopy(self.approval)
