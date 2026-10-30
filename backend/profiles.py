"""Validate farmer-confirmed profiles and derive schematic planning metadata."""
from __future__ import annotations

import copy
import hashlib
import json
import re

PRIORITIES = {"balanced", "acres", "cost", "buffer"}
ZONES = {"north": (50, 20), "south": (50, 80), "east": (80, 50), "west": (20, 50), "central": (50, 50)}
COLORS = ["#1d6f55", "#b86c30", "#3e669c", "#8b5790"]


def _object(value, keys, label):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError(f"{label} must contain exactly: {', '.join(keys)}.")
    return value


def _text(value, limit, label, allow_empty=False):
    if not isinstance(value, str) or len(value) > limit or (not allow_empty and not value.strip()):
        raise ValueError(f"{label} must be {'optional ' if allow_empty else 'non-empty '}text of at most {limit} characters.")
    if any(ord(char) < 32 and char not in "\n\r\t" for char in value):
        raise ValueError(f"{label} contains unsupported control characters.")
    return value.strip()


def _integer(value, low, high, label):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"{label} must be an integer from {low} to {high}.")
    return value


def _choice(value, choices, label):
    if not isinstance(value, str) or value not in choices:
        raise ValueError(f"{label} must be one of: {', '.join(sorted(choices))}.")
    return value


def _records(value, low, high, label):
    if not isinstance(value, list) or not low <= len(value) <= high:
        raise ValueError(f"{label} must contain {low}–{high} entries.")
    return value


def _identifier(value, pattern, used, label):
    if not isinstance(value, str) or not re.fullmatch(pattern, value) or value in used:
        raise ValueError(f"{label} must be a valid, unique identifier.")
    used.add(value)
    return value


def normalize_profile(value):
    """Return only validated, bounded, canonical values; never infer a credential."""
    _object(value, ("id", "version", "farm_name", "location", "fields", "rigs", "crew", "workday", "rules", "preferences", "notes"), "profile")
    result = {"id": _identifier(value["id"], r"[A-Za-z0-9_-]{1,80}", set(), "profile.id"),
              "version": _integer(value["version"], 1, 1, "profile.version"),
              "farm_name": _text(value["farm_name"], 120, "profile.farm_name"),
              "location": _text(value["location"], 200, "profile.location"),
              "fields": [], "rigs": [], "crew": [],
              "notes": _text(value["notes"], 4000, "profile.notes", allow_empty=True)}
    used = set()
    for index, field in enumerate(_records(value["fields"], 1, 40, "profile.fields")):
        label = f"profile.fields[{index}]"
        _object(field, ("id", "name", "acres", "crop", "zone", "priority", "excluded"), label)
        if type(field["priority"]) is not bool or type(field["excluded"]) is not bool:
            raise ValueError(f"{label}.priority and excluded must be booleans.")
        result["fields"].append({"id": _identifier(field["id"], r"F(?:0[1-9]|[12][0-9]|3[0-9]|40)", used, label + ".id"),
                                 "name": _text(field["name"], 80, label + ".name"),
                                 "acres": _integer(field["acres"], 1, 500, label + ".acres"),
                                 "crop": _text(field["crop"], 80, label + ".crop"),
                                 "zone": _choice(field["zone"], ZONES, label + ".zone"),
                                 "priority": field["priority"], "excluded": field["excluded"]})
    used = set()
    for index, rig in enumerate(_records(value["rigs"], 1, 4, "profile.rigs")):
        label = f"profile.rigs[{index}]"
        _object(rig, ("id", "name", "acres_per_hour"), label)
        result["rigs"].append({"id": _identifier(rig["id"], r"R[1-4]", used, label + ".id"),
                               "name": _text(rig["name"], 80, label + ".name"),
                               "acres_per_hour": _integer(rig["acres_per_hour"], 1, 500, label + ".acres_per_hour")})
    used = set()
    for index, person in enumerate(_records(value["crew"], len(result["rigs"]), 12, "profile.crew")):
        label = f"profile.crew[{index}]"
        _object(person, ("id", "name", "certifications"), label)
        certifications = _records(person["certifications"], 0, 2, label + ".certifications")
        certifications = [_choice(item, {"standard", "special"}, label + ".certifications") for item in certifications]
        if len(set(certifications)) != len(certifications):
            raise ValueError(f"{label}.certifications must not contain duplicates.")
        result["crew"].append({"id": _identifier(person["id"], r"C(?:[1-9]|1[0-2])", used, label + ".id"),
                               "name": _text(person["name"], 80, label + ".name"),
                               "certifications": sorted(certifications)})
    _object(value["workday"], ("start", "end"), "profile.workday")
    result["workday"] = {key: _integer(value["workday"][key], 480, 1200, "profile.workday." + key) for key in ("start", "end")}
    if result["workday"]["start"] >= result["workday"]["end"]:
        raise ValueError("profile.workday.end must be after start.")
    _object(value["rules"], ("rainfast_minutes", "wind_limit_mph"), "profile.rules")
    result["rules"] = {"rainfast_minutes": _integer(value["rules"]["rainfast_minutes"], 1, 360, "profile.rules.rainfast_minutes"),
                       "wind_limit_mph": _integer(value["rules"]["wind_limit_mph"], 1, 20, "profile.rules.wind_limit_mph")}
    _object(value["preferences"], ("priority",), "profile.preferences")
    result["preferences"] = {"priority": _choice(value["preferences"]["priority"], PRIORITIES, "profile.preferences.priority")}
    return result


def profile_metadata(value, demo_metadata):
    profile = normalize_profile(value)
    revision = hashlib.sha256(json.dumps(profile, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()[:16]
    result = copy.deepcopy(demo_metadata)
    result.update(name=profile["farm_name"], farm_name=profile["farm_name"], location=profile["location"],
                  profile_id=f"{profile['id']}-{revision}", profile_revision=revision, input_source="farmer_profile",
                  geometry="schematic", synthetic=True, now=profile["workday"]["start"],
                  preferences=profile["preferences"], workday=profile["workday"], rules=profile["rules"], notes=profile["notes"])
    result["fields"] = []
    for index, field in enumerate(profile["fields"]):
        x, y = ZONES[field["zone"]]
        # A compact grid within each zone, intentionally not geocoded boundaries.
        offset_x, offset_y = ((index % 5) - 2) * 3, (((index // 5) % 5) - 2) * 3
        result["fields"].append({**field, "x": x + offset_x, "y": y + offset_y,
                                 "window_start": profile["workday"]["start"], "window_end": profile["workday"]["end"],
                                 "rainfast_minutes": profile["rules"]["rainfast_minutes"],
                                 "wind_limit_mph": profile["rules"]["wind_limit_mph"],
                                 "required_certification": "standard", "wet": False, "sensitive": False})
    result["crew"] = [{**person, "shift_start": profile["workday"]["start"], "shift_end": profile["workday"]["end"],
                       "certification": " / ".join(person["certifications"]) or "None confirmed"} for person in profile["crew"]]
    result["rigs"] = [{**rig, "crew_id": result["crew"][index]["id"], "crew_name": result["crew"][index]["name"],
                       "color": COLORS[index]} for index, rig in enumerate(profile["rigs"])]
    result["assumptions"][:2] = [
        "Farm names, acres, equipment, operator certifications and rules are farmer-entered, not independently verified. Weather, costs and travel remain simulated; this is not field-ready advice.",
        f"The first {len(result['rigs'])} listed operators are assigned to the rigs in order. Remaining operators are reserves. A rig cannot spray without its assigned operator's confirmed standard certification.",
        "Coordinates are SCHEMATIC zone positions, not real field boundaries or locations. All fields share the entered workday and spray rules; product-specific labels and crop restrictions are not modeled.",
        "Priority flags influence the solver's objective; they do not guarantee a field is first or allow a hard constraint to be relaxed.",
    ]
    return result


def feedback_constraints(value, fields, rigs):
    if value is None:
        value = {}
    keys = {"excluded_fields", "priority_fields", "unavailable_rigs"}
    if not isinstance(value, dict) or set(value) - keys:
        raise ValueError("feedback_constraints may contain only excluded_fields, priority_fields and unavailable_rigs.")
    result = {}
    for key in sorted(keys):
        known = {row["id"] for row in (rigs if key == "unavailable_rigs" else fields)}
        values = value.get(key, [])
        if not isinstance(values, list) or len(values) > len(known) or any(not isinstance(item, str) for item in values):
            raise ValueError(f"feedback_constraints.{key} must be a list of known IDs.")
        if len(set(values)) != len(values) or not set(values).issubset(known):
            raise ValueError(f"feedback_constraints.{key} must contain unique known IDs.")
        result[key] = sorted(values)
    return result
