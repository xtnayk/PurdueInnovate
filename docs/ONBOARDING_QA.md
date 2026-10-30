# Farm onboarding and proposal feedback verification

Verified 2026-10-30 against the local solver at `http://127.0.0.1:8765/` and the standalone `output/Fieldwork.html` using gstack's isolated Chromium browser.

- Backend: 33 checks passed, including custom profiles, reviewed restrictions, input isolation and approval snapshots.
- JavaScript: 27 onboarding, 29 feedback, 22 fleet, 18 plan-action, 11 simulation and 25 replay checks passed.
- Browser: 24 onboarding/feedback, 11 persistence/job-log and 9 standalone checks passed. Scripts are alongside this file.
- Phone at 390×844 and tablet at 768×1024: no horizontal overflow; visible onboarding, feedback and navigation buttons are at least 44px high. Screenshots are in `output/farm-chat-mobile.png`, `output/proposal-feedback-mobile.png` and `output/farm-profile-ipad.png`.
- Final local and standalone console checks: no console errors. The standalone workflow made zero HTTP(S) resource requests.

The browser flow entered six fields, four sprayers, six applicators, a 9am–7pm day, a field hold and local notes. It confirmed the profile, approved a plan, interpreted named-field and named-rig feedback, and verified that every revised option respected those restrictions while the approved queues stayed unchanged. It also checked conflicting/unsupported feedback, edited interpretations, no-feasible-work recovery, manual completion, reloads and separation of farm job histories.

Fixed during browser verification: the onboarding delegated click handler rerendered native submit buttons before the form could submit. It now ignores unhandled buttons, with a regression check. Also covered: clearing restrictions after a no-plan result and custom simulation workday bounds.

This remains a guided deterministic prototype. Browser profiles and job logs are local, map and weather inputs are illustrative, and arbitrary prose does not become an enforced rule. Standalone profiles can be saved/exported; custom optimization requires the local solver. No messages or equipment commands were sent.

## Plan dashboard agent

The Plan dashboard now includes proposed actions for every sprayer, comparison, feedback, replanning and human approval. Its expandable conversation shares one DOM instance and one state with Disruptions. `docs/plan-agent-browser-check.js` passed 22 checks against the live app and another 22 against the standalone file, covering draft preservation, reviewed revisions, cancellation, approval and stale-plan blocking. All 12 new component checks and the existing 29 feedback and 18 plan-action checks passed.

The Plan agent was visually checked at desktop, 390px phone and 768px tablet widths. Phone/tablet had no horizontal overflow and all agent controls measured at least 44px high. The standalone reload reported no console errors and zero HTTP(S) resource requests. Screenshots: `output/plan-agent-desktop.png` and `output/plan-agent-mobile.png`.

## Fleet map, chat replies and incident inbox

Verified the updated live app and rebuilt standalone file on 2026-10-30. `docs/map-chat-browser-check.js` passed 23 checks in each edition: all four sprayer markers and 40 illustrative fields, scheduled marker movement, popups, zoom/follow/fit controls, shared 3D playback time, pause on leaving the Plan tab, no changes to the manual job log, specific chat replies, and clarification without losing the farmer's answer. Automated map checks used `?mapTiles=off`; they did not download or exercise external street tiles.

`docs/incident-browser-check.js` passed 23 live and 21 standalone checks. The inbox contains only reports; opening one prepares a bound response. Approval changes the queues only after confirmation and leaves the incident active until explicitly resolved. Live replanning combines unresolved reports and reviewed feedback. Unsupported report combinations are blocked in the prerecorded standalone edition. A direct visit to Disruptions leaves the solver idle until a report is opened. A separate two-tab check verified that reported incidents appear in the other tab without reloading.

The current JavaScript suites passed 189 checks: 13 map, 12 simulation, 32 onboarding, 29 feedback, 22 fleet store, 14 incident store, 15 incident UI, 15 plan actions, 12 plan agent and 25 replay. The backend's 39 checks passed after adding combined incident constraints. The unavailable-WebGL regression now keeps the shared preview time instead of resetting it to 8am.

Phone (390×844) and tablet (768×1024) layouts have no horizontal overflow. Screenshots include `output/fleet-map-mobile.png`, `output/fleet-map-tablet.png`, `output/fleet-map-desktop.png` and `output/onboarding-reply-mobile.png`. Final live and standalone console checks reported no errors; the standalone flow made zero HTTP(S) resource requests. The 1,237,908-byte standalone build is copied to `web/downloads/Fieldwork.html`.

Street tiles are an online backdrop. Field boundaries, routes and moving equipment are simulated, not live GPS or surveyed geometry. Onboarding uses deterministic guided replies, not a connected language model. Nothing was sent to crews or equipment.

## Geographic field correction

Later on 2026-10-30, the demo fleet map was changed to use 40 sourced OpenStreetMap farmland polygons in rural northwestern Tippecanoe County. This supersedes the earlier statement that its map boundaries are simulated. Planning acreage, jobs, sprayer activity, route connections and the 3D layout remain simulated. Source details and limitations are in [FIELD_GEOGRAPHY.md](FIELD_GEOGRAPHY.md).

All 19 map tests passed, including 24,040 spray-position samples inside the 40 source polygons. The geographic browser check passed 156 checks in both the live app and rebuilt standalone file: all source boundaries render without schematic projection, all four sprayers remain represented, 110 sampled scheduled positions stay inside their field, and previewing does not mutate the planner inputs or job log. Custom profiles without coordinates disable street tiles and use a clearly labeled schematic view.

The phone view (390×844) has no horizontal overflow, and both editions report no console errors. The standalone flow made zero HTTP(S) resource requests. Screenshots: `output/farmland-map-desktop.png` and `output/farmland-map-mobile.png`. The updated standalone file is 1,300,235 bytes. Automated checks disabled external street tiles; source-coordinate validation used the retained OSM extract.
