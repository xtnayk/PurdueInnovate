# Fieldwork

A local decision-support prototype for an Indiana farm co-op manager. Change the day's conditions, compare up to three solver-generated schedules, inspect assignments and trade-offs, and explicitly approve one plan.

## Fleet map, 3D simulation and browser replay

The planning board opens on **Fleet map**, a key-free Leaflet map with OpenStreetMap street tiles and visible attribution while online. The 40 demo fields use sourced farmland polygons in rural Tippecanoe County, rather than projecting the schematic grid over Lafayette. See all four example sprayers following the selected plan, inspect a rig's popup, view its route, pan and zoom, or follow a sprayer. Simulated spraying stays inside the mapped field boundary. The field outlines are approximate public map data, not a survey or evidence of ownership. See [field geography and source details](docs/FIELD_GEOGRAPHY.md).

Job acreages, equipment positions and route connections remain simulated. There is no GPS, address geocoding or road-routing integration, and the solver still uses schematic travel distances. Custom farm profiles without field coordinates use only a schematic background; they are never positioned on the street map as if their locations were known.

Switch to **3D simulation** for the farm diorama, crop rows, treated-field progress, rain, wind and wet-field states, or **Field layout** for the schematic view. Fleet map and 3D simulation share the playback time, speed and play/pause controls. Scrub the day or follow a rig; the 3D view also supports orbit and overhead cameras. Playback only previews the selected schedule: it never dispatches equipment or changes the manually recorded job log and completion counts.

Open [output/Fieldwork.html](output/Fieldwork.html) directly in a browser for the self-contained, no-install replay edition. It embeds all assets and five sets of recorded, validated OR-Tools results. Its Fleet map uses a schematic background and makes no street-tile requests. It runs without a server, network access, Python, added sensors, gateways or sprayer modifications. It does **not** run new optimization or interpret arbitrary crew messages. The local solver edition below retains those server-backed capabilities.

The [28-second silent commercial](output/Fieldwork-commercial.mp4) uses rapid cuts, large on-screen text, close-up 3D action and recorded solver results. It contains no audio track. The earlier [55-second narrated walkthrough](output/Fieldwork-launch.mp4) is also retained. [Hardware-free workflow](docs/HARDWARE_FREE.md) explains the production approach and what existing data can and cannot tell you.

**Demo data:** 4 sprayers, 6 applicators and 40 synthetic field jobs in a Tippecanoe County scenario. The fleet map uses real mapped farmland outlines for geographic context; job identities, planning acreage, rig positions and route connections are simulated. The 3D and field-layout views remain schematic. Weather, soil state, products, costs and operating rules are simulated assumptions. This is not an operational spraying recommendation.

## Farm onboarding and reviewed profiles

Open **Farm chat** to describe the operation in a nine-step guided chat: farm name, location, fields and zones, sprayers, applicators, working hours, dry-time/wind assumptions, local knowledge and comparison preferences. After every accepted answer, the assistant replies with a specific summary—such as total fields and acres, sprayer capacities or operator assignments—before asking the next question. Invalid answers receive an in-thread clarification without advancing the step or discarding the draft. The chat uses deterministic parsing and replies based on the formats shown beside each question; it is not Gemini or unrestricted language understanding. Review and edit the summary, including fixed operator assignments, then choose **Confirm & use this farm** to create a custom planning session.

The planner uses the confirmed field roster, acreage, rig capacities, shared working hours and rules, priority flags and explicit field holds. Location text is saved as context; north/south/east/west/central zones produce a schematic layout, not geocoded boundaries, road routes or local weather. All custom fields currently require the `standard` demo eligibility label. Qualifications are reported by the user, not verified licenses; the first listed operator is assigned to the first sprayer, and additional operators are reserves. Notes about ditches, neighbors, gates or refills are saved as context and do **not** become solver constraints. These profiles do not establish operational spray advice.

Drafts and confirmed profiles are saved in this browser; completed profiles can be exported as JSON. A profile configuration has its own job log and feedback history; changing the setup retains the previous setup's records separately. Complete or hold underway jobs before switching farms. The offline replay can collect, review, save and export a profile, but continues to display the recorded example farm. Planning a custom farm requires the local solver edition.

## Fleet queues and job tracking

Open [the fleet dashboard](http://127.0.0.1:8765/#fleet) or choose the fleet icon. The **All sprayers** tab compares the active fleet; each sprayer has its own tab and field queue, assigned operator, first field to work, planned times, priority flags and completion counts. Order comes from the solver's feasible route sequence, which accounts for timing and travel as well as priority acres.

Approve a plan to activate its queues. Use **Start job**, **Mark done**, **Hold**, and **Resume queue** to record work manually. Only the next queued field can start, and each rig can have one job in progress. Separate rigs can work concurrently. Completed fields and timestamps remain in the day's history when a replacement plan is approved. A draft never silently replaces active queues; finish or hold underway jobs before approving a replacement. Export the full fleet or an individual rig's queue and recorded progress as CSV.

The job log and approved workboard snapshot are saved in this browser for the workday and active profile configuration and survive reloads. They are not shared across devices, server authorization records, or equipment telemetry. A visible warning appears when browser storage is unavailable. Neither the map nor the 3D preview changes manual job status.

The local solver excludes fields reported done from new routes and deferrals. It uses the configured start of day (8:00 am in the example farm) and depot origins, rather than current time or equipment positions. The portable replay includes the same tracking UI but retains its original recorded routes and metrics; completed fields are skipped by its job queue, and it does not calculate a fresh remaining-work schedule.

## Disruptions and human-approved actions

**Plan** is the general planning dashboard: compare schedules, inspect each sprayer's proposed actions, request changes, replan and approve. **Disruptions** opens an incident feed with source, report time and status. It does not show a scenario picker or a planning workspace until an issue is opened.

Choose **Report an issue** on Fleet to record a breakdown, wet field, rain change or wind report. A sprayer's tab preselects that rig. The report appears in Disruptions immediately; opening it automatically asks the agent for a response. The detail view shows the report, proposed actions and estimates, alternative responses, feedback and **Review & approve**. These are manually entered or simulated reports. No live fleet, weather or messaging feed is connected.

Approval replaces the fleet queues together and marks the issue **Response approved**. It does not mean the machine is repaired or the field is accessible. **Resolved** is a separate recorded status. Every unresolved report, including one with an approved response, remains in later local solves until resolved. The planner combines those reports with the Plan dashboard's conditions, confirmed crew update, profile holds and reviewed feedback; the stricter restrictions take precedence. Underway jobs must be completed or held before replacing the queues, and changed inputs invalidate pending approval.

Incident records are saved for the active farm configuration and day in this browser. Other tabs on the same browser storage receive updates; this is not cross-device synchronization or live equipment reporting. Plan and an opened incident share one feedback draft, interpretation and history. The incident feed itself contains no feedback composer.

The feedback conversation accepts requests such as `lower cost`, `more rain buffer`, `hold F14`, `prioritize F14`, or `keep R3 out`, using IDs or exact, unambiguous field/sprayer names. Choose **Review feedback**, inspect the interpretation, then **Apply feedback & replan**. Final approval is separate. Unsupported or conflicting wording is retained as a note; it does not change the plan. The helper supports up to eight instructions, one per line, within 1,000 characters. Field holds and sprayer exclusions are hard restrictions; priority fields influence the objective and are not guaranteed first. Clearing feedback does not clear profile holds or unresolved incidents.

The offline edition can record reports, but can replay a response only for one matching example-farm incident: Rig 3 unavailable until 2pm, or rain at 2pm, with Plan set to baseline or that matching recorded scenario. Other reports, combinations and custom restrictions require the local solver and block approval in the offline file. Ranking feedback can still reorder supported recorded alternatives. Gemini remains a planned integration; current explanations are deterministic summaries of solver results.

The interface supports iPad and phone use, with labeled navigation, touch controls at least 44px high, stacked job cards on smaller screens and a scrollable approval dialog. No new farm hardware is required.

## Run locally

From this directory, with Python 3.12 installed:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m backend.server
```

Open [the local prototype](http://127.0.0.1:8765). Keep the server running while using the app. No Gemini key or external service account is required.

Run the backend checks:

```sh
.venv/bin/python -m unittest discover -s backend/tests -v
```

## What the demo proves

- A disruption can drive a fresh planning run rather than a static comparison card.
- OR-Tools computes schedules; the interface displays metrics derived from those schedules.
- A separate validator checks each schedule's modeled constraints and displayed accounting before it is returned and again before approval.
- A manager can compare different priorities and inspect what gets deferred.
- Approval is an explicit action tied to the current planning run.

The planner uses real OR-Tools CP-SAT to select disjoint feasible route candidates from a bounded candidate set. It does not prove a global routing optimum across every possible route. Each rig has a fixed operator; in the example farm, two of the six applicators are unassigned reserves. Custom profiles use the first listed operators as fixed assignments and leave additional operators as reserves. Dynamic crew reassignment remains future work.

Cost and rain-buffer alternatives retain at least 85% of the acreage-focused plan's total acres and priority acres. Each alternative changes at least two completed/deferred field decisions. Balanced ranking gives 50% weight to relative acreage, 25% to relative cost and 25% to relative rain buffer among the displayed plans; these are demo preferences, not calibrated business priorities. The other ranking choices sort the returned plans by actual total acres descending, estimated cost ascending, or minimum rain buffer descending. Ranking does not assume that the plan generated for an objective has the best displayed value for that metric.

The demo does not connect to live weather or sensor feeds, send crew messages, control equipment, or generate a validated ISOXML task. Approval and export are local demonstrations. Only the latest run can be approved, within five minutes. The server's approval receipt is held in memory and is lost on restart; the separately saved browser workboard and manual job log remain visible. A future production system must persist authoritative approvals and revalidate all input sources before release.

## Architecture

```text
Browser profile, conditions, unresolved incidents and feedback
                  |
                  v
Python API -> validated input snapshot -> OR-Tools planner
                  |                             |
                  |                     computed metrics
                  |                             |
                  +------ comparison UI <-------+
                                  |
                         explicit local approval
```

The text parser is a deterministic pattern-based demonstration, not Gemini. It accepts one supported update at a time. Messages with multiple times or entities, mixed event types, or explicit negation are rejected; other unsupported wording produces a warning. Gemini's future roles are proposing structured interpretations of messy updates and explaining verified results. Neither the language model nor the browser should calculate authoritative costs or relax a scheduling constraint.

## Rebuilding the replay and video

Run `.venv/bin/python scripts/capture_fixtures.py` only when solver inputs or logic change, then `.venv/bin/python scripts/build_portable.py` to inline the current interface, map renderer, Leaflet, 3D renderer, Three.js and recorded plans. The offline map stays schematic; street tiles are not bundled or downloaded by the replay. The served copy is `web/downloads/Fieldwork.html`.

The silent commercial source is served at `/commercial.html`. `window.commercialFilm.render(seconds)` renders a deterministic frame. Run `scripts/record_commercial.js` with the gstack browser's `eval` command in a browser supporting WebGL and WebCodecs. It encodes all 840 frames with exact timestamps, so capture speed cannot drop animation frames. Save `window.__commercialExport.dataUrl` as `output/commercial-capture.ivf`, then run `.venv/bin/python scripts/finish_commercial.py`. The export script explicitly strips audio, verifies the duration, resolution and absence of audio streams, fully decodes the result, and saves review frames.

The earlier launch-film source remains at `/launch.html`. `scripts/record_launch.js` captures its canvas for 55 seconds; `scripts/build_launch_audio.py` generates its narration, synthesized music and captions. The development dependencies include `numpy` and `imageio-ffmpeg`. These tools are for rebuilding the deliverables, not for viewing them.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/demo` | Synthetic fields, rigs, crew and assumptions |
| POST | `/api/profile/preview` | Validate `{profile}` and return normalized schematic metadata |
| POST | `/api/replan` | Generate options from conditions, profile, unresolved incidents and feedback |
| POST | `/api/parse` | Interpret `{text, profile?}`; reject references outside a supplied farm |
| POST | `/api/approve` | Approve a plan from the current run locally |

All five scenarios and the listed local JSON endpoints are implemented. Requests are JSON objects limited to 128 KiB. `/api/replan` accepts `scenario` (`baseline`, `storm`, `breakdown`, `wet` or `wind`), optional `priority` (`balanced`, `acres`, `cost` or `buffer`), `update`, `completed_fields`, `profile`, `feedback_constraints` and `incidents`. Omitting a profile uses the example farm. Omitting priority uses the profile preference, or balanced for the example farm.

`feedback_constraints` contains optional `excluded_fields`, `priority_fields` and `unavailable_rigs` arrays of unique known IDs. Unknown IDs, malformed profiles and unsupported constraint keys are rejected. Responses echo the applied constraints, `profile_id`, excluded completed IDs and `remaining_field_count`. Profile holds remain excluded regardless of feedback. Custom breakdown scenarios affect R3 when present, otherwise the first rig; custom wet-field scenarios affect the first six fields, or all fields if fewer than six exist.

`incidents` is an optional list of at most 50 unresolved reports. Each report has a unique `id` of 1–120 letters, digits, underscores or hyphens and exactly the fields below. Strip UI titles, prose, sources and status before sending the solver snapshot. IDs must belong to the active farm; extra keys and invalid values are rejected.

| `type` | Additional required fields |
| --- | --- |
| `breakdown` | `rig_id`, integer `available_from` from 480–1200 |
| `wet` | `field_id` |
| `storm` | Integer `rain_time` from 480–1200 |
| `wind` | Integer `wind_mph` from 1–60; applies throughout the modeled day |

For example: `[{"id":"report-1","type":"breakdown","rig_id":"R3","available_from":840}]`. Active reports combine by latest rig availability, union of wet fields, earliest rain and highest wind. Responses and approval receipts echo the normalized report list. Approval validates the exact stored input/condition snapshot; it does not resolve reports. Omitting `incidents` retains the original scenario API behavior.

The version-1 profile shape is:

```json
{
  "id": "my-farm", "version": 1,
  "farm_name": "My farm", "location": "Tippecanoe County, Indiana",
  "fields": [{"id": "F01", "name": "North field", "acres": 40, "crop": "corn", "zone": "north", "priority": true, "excluded": false}],
  "rigs": [{"id": "R1", "name": "Sprayer 1", "acres_per_hour": 80}],
  "crew": [{"id": "C1", "name": "Alex", "certifications": ["standard"]}],
  "workday": {"start": 480, "end": 1080},
  "rules": {"rainfast_minutes": 90, "wind_limit_mph": 15},
  "preferences": {"priority": "balanced"}, "notes": ""
}
```

All listed profile keys are required; extra keys are rejected. Preview returns a `profile_id` combining the supplied ID and a hash of the normalized configuration, plus `profile_revision`, fields, rigs, crew, assumptions and cost rates. This identifier scopes browser work records; it is not authentication or a shared server account. The server keeps a separate copy of the exact custom inputs for approval validation and does not overwrite example-farm metadata.

| Profile input | Current limit |
| --- | --- |
| Fields | 1–40; unique IDs F01–F40; integer acres 1–500 |
| Sprayers | 1–4; unique IDs R1–R4; integer capacity 1–500 acres/hour |
| Applicators | At least one per sprayer, at most 12; unique IDs C1–C12 |
| Qualifications | User-reported `standard` and/or `special`; API permits no confirmed qualifications, which makes that operator ineligible for custom spraying |
| Workday | Integer minutes, 480–1200 (8am–8pm), end after start; one shared shift and field window |
| Shared rules | Integer dry time 1–360 minutes and wind limit 1–20 mph |
| Zones | `north`, `south`, `east`, `west`, `central`; schematic only |
| Text | Farm name 120 characters; location 200; field, crop, sprayer and applicator names 80 each |
| Profile ID | 1–80 letters, digits, underscores or hyphens |
| Notes | API 4,000 characters; guided chat 3,000; stored context only |

`fields_scheduled` names the planned job count; legacy `fields_completed` is retained for compatibility and is not the manual completion count. Schedule times are minute-of-day integers in the simulated local day. Production timestamps, authoritative records and versioning are specified in the build plan.

## Interpretation

“Estimated cost” means a calculation under the displayed synthetic cost assumptions. Lower spending is not automatically better if a plan completes fewer acres. A rain buffer measures time remaining after the modeled rainfast period; it is not a runoff, wash-off or drift probability. Feasible results are not necessarily globally optimal.

The synthetic cost model uses $3.00 per sprayed acre for machine operation, $1.20 per travel minute, and $28 per operator-hour. Labor runs from depot departure to return, including travel and waiting during a route. It excludes idle reserve crews and breakdown time before departure. Costs exclude chemicals, overhead, tax and profit. These are demo assumptions, not Purdue custom rates or measured co-op costs; the custom-rate survey is a separate service-price benchmark.

Travel uses schematic distances and every route returns to the depot. Spraying time is acres divided by rig capacity plus five minutes per field. Refills, mixing, product changeovers and meal breaks are not modeled. Repair times are scenario assumptions, not confirmed equipment releases. Each solver objective has a 0.8-second time limit; total run time also includes route generation and model construction.

If constraints eliminate safe work, the correct result is fewer options or a hold state. Do not add unsafe alternatives just to display three cards.

## Data-source status

The [Purdue Mesonet Data Hub instructions](https://ag.purdue.edu/indiana-state-climate/purdue-mesonet/data-hub-instructions/) and [NWS API documentation](https://www.weather.gov/documentation/services-web-api) were checked as candidate sources. No live weather, soil or equipment data is imported by this prototype. Online OpenStreetMap tiles supply visual context only. The supplied WHIN dataset download host failed DNS resolution during the check, so dataset access remains unresolved.

## Build plan

Read [the implementation and pilot plan](docs/BUILD_PLAN.md) for versioned data contracts, historical replay, Gemini boundaries, live data adapters, approval/acknowledgement and tested equipment integration. It separates future work from the current local demonstration.
