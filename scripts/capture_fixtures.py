#!/usr/bin/env python3
"""Capture validated OR-Tools outputs for the offline replay edition.

Run with the project's Python environment. The resulting HTML needs no Python,
solver, server, internet connection or new farm hardware to view.
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.planner import Planner, validate_plan  # noqa: E402


def main():
    engine = Planner()
    metadata = engine.metadata()
    scenarios = {}
    for scenario in ("baseline", "storm", "breakdown", "wet", "wind"):
        result = engine.replan(scenario, "balanced")
        for plan in result["plans"]:
            validate_plan(plan, metadata["fields"], metadata["rigs"], metadata["crew"], result["conditions"])
        scenarios[scenario] = result
        print(f"Captured {scenario}: {len(result['plans'])} validated alternatives", flush=True)
    payload = {
        "format_version": 1,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "description": "Prerecorded, validated OR-Tools plans for five synthetic scenarios. Replay only; not live optimization.",
        "solver_source_sha256": hashlib.sha256((ROOT / "backend/planner.py").read_bytes()).hexdigest(),
        "metadata": metadata,
        "scenarios": scenarios,
    }
    output = ROOT / "web/demo-fixtures.json"
    output.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Saved {output} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
