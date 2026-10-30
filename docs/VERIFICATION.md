# Prototype verification

## 3D and launch-video update

The October 30 follow-up adds a real Three.js scene, deterministic schedule playback, camera controls, a portable browser replay and a narrated launch film. Existing backend solver code was unchanged in this update.

- `node scripts/test_simulation.cjs`: **6 tests passed** for travel, waiting, spraying, return trips, breakdown availability, plan immutability and empty schedules.
- `node scripts/test_replay.cjs`: **25 adapter checks passed** for the five recorded scenarios, ranking, clone isolation, input validation and approval state.
- Existing browser flow: **22 checks passed** after integration.
- `docs/browser-3d-check.js`: **14 checks passed** in the solver edition; **19 passed** when opened directly as `file:///.../output/Fieldwork.html`, including zero HTTP(S) resource/API dependencies.
- The portable file and served download are byte-identical and bundle all scripts, styles, data and the Three.js license. Recorded-solver timing is labeled as historical rather than measured on the user's replay click.
- The final MP4 is **55.00 seconds**, **1920×1080**, **30 fps**, H.264 video with AAC narration/music and English selectable captions. FFmpeg decoded the entire file successfully; representative frames from the opening, comparisons, timeline, crew update, approval and ending were visually inspected.
- The GPU-enabled QA browser emitted readback performance warnings during screenshots/video capture. No functional application failure occurred. An isolated browser instance was used; the ordinary browser configuration was not changed.
- The 390-pixel mobile layout has no page-wide horizontal overflow. A separate browser with WebGL disabled displayed the explicit fallback; the 2D map and three plan cards remained usable.

The launch film's narration uses the macOS Samantha system voice. Background music is synthesized locally from original tones; no downloaded music or stock video is included.

Verified on October 30, 2026 using Python 3.12, OR-Tools 9.15.6755 and the gstack headless browser.

## Automated backend checks

Command: `.venv/bin/python -m unittest discover -s backend/tests -v`

Result: **15 tests passed** in 17.081 seconds on the final run. Covers all five scenarios, field uniqueness, field windows, rainfast periods, wind intervals, wet exclusions, fixed crew eligibility, shift limits, travel, derived metrics, distinct alternatives, unsupported/ambiguous messages, actual-metric ranking, empty results, stale/expired approval, independent validation and local API request handling.

## Browser checks

The reproducible local interaction script is `docs/browser-check.js`, run with gstack `browse eval` against the served application. **22 checks passed** after the final backend restart. It covers the main interaction flow, approval, navigation, unsupported and ambiguous updates, delayed-response races, no feasible spray work, restoring the initial scenario, and field inspection.

Desktop (1440 pixels) and mobile (390 pixels) were visually inspected. The mobile layout has no page-wide horizontal overflow. A field picker provides a larger target for inspecting small schematic fields. The rig timeline intentionally scrolls inside its own container on small screens. The final application console contained no errors. `node --check web/app.js` also passed.

## Limits

These checks validate this synthetic prototype, not operational spraying advice, environmental outcomes or equipment compatibility. The route search is bounded, rates and rules are illustrative, crews are fixed to rigs, and refills/mixing/breaks are not modeled. Real data, Gemini, message delivery and ISOXML integration remain future work. Local approval does not send anything and is stored only in process memory.
