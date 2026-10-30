"""Validate reported incidents and combine their modeled constraints.

Reports are supplied by the local demo. This module does not infer operational
facts from prose or connect to equipment telemetry.
"""
from __future__ import annotations

import re


def normalize_incidents(value, fields, rigs):
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 50:
        raise ValueError("incidents must be a list of at most 50 reports.")
    known_fields = {field["id"] for field in fields}
    known_rigs = {rig["id"] for rig in rigs}
    shapes = {"breakdown": ("rig_id", "available_from"), "wet": ("field_id",),
              "storm": ("rain_time",), "wind": ("wind_mph",)}
    result, seen = [], set()
    for index, report in enumerate(value):
        label = f"incidents[{index}]"
        if not isinstance(report, dict):
            raise ValueError(f"{label} must be an object.")
        kind, identifier = report.get("type"), report.get("id")
        if not isinstance(kind, str) or kind not in shapes:
            raise ValueError(f"{label}.type must be breakdown, wet, storm or wind.")
        if set(report) != {"id", "type"} | set(shapes[kind]):
            raise ValueError(f"{label} must contain only id, type and the required {kind} fields.")
        if (not isinstance(identifier, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", identifier)
                or identifier in seen):
            raise ValueError(f"{label}.id must be a unique safe identifier of 1–120 characters.")
        seen.add(identifier)
        clean = {"id": identifier, "type": kind}
        for key in shapes[kind]:
            item = report[key]
            if key in ("field_id", "rig_id"):
                known = known_fields if key == "field_id" else known_rigs
                if not isinstance(item, str) or item not in known:
                    raise ValueError(f"{label}.{key} must identify an entity in this farm.")
            else:
                lower, upper = (1, 60) if key == "wind_mph" else (480, 1200)
                if type(item) is not int or not lower <= item <= upper:
                    raise ValueError(f"{label}.{key} must be an integer from {lower} to {upper}.")
            clean[key] = item
        result.append(clean)
    return result


def apply_incidents(conditions, reports):
    """Apply all unresolved reports without weakening an existing constraint."""
    for report in reports:
        kind = report["type"]
        if kind == "breakdown":
            rig = report["rig_id"]
            conditions["rig_available_from"][rig] = max(conditions["rig_available_from"][rig], report["available_from"])
        elif kind == "wet":
            conditions["wet_fields"] = sorted(set(conditions["wet_fields"]) | {report["field_id"]})
        elif kind == "storm":
            conditions["rain_time"] = min(conditions["rain_time"], report["rain_time"])
        elif kind == "wind":
            conditions["wind_mph"] = max(conditions["wind_mph"], report["wind_mph"])
            conditions["wind_intervals"] = [{**interval, "mph": max(interval["mph"], report["wind_mph"])}
                                             for interval in conditions["wind_intervals"]]
    return conditions
