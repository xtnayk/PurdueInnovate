# Fieldwork implementation plan

> For agentic workers: use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement one accepted milestone at a time. Unchecked tasks below are future work, not claims about the prototype.

**Goal:** Help an Indiana co-op manager recover a disrupted spray day by comparing up to three feasible schedules, with traceable estimates and explicit approval.

**Architecture:** Normalize operational events and source data into a versioned snapshot. A deterministic rules layer and OR-Tools produce and validate schedules; Gemini proposes structured interpretations and explains computed results. Approval binds to one immutable plan and snapshot before a separate dispatch adapter can release work.

**Tech stack:** The local prototype uses Python 3.12, OR-Tools CP-SAT, a standard-library HTTP server, HTML/CSS/JavaScript, Leaflet for the fleet map and Three.js for 3D playback. The pilot can retain the solver and add PostgreSQL, authenticated APIs, Gemini, weather adapters, and a dispatch outbox.

**Spec:** The user's October 30, 2026 brief: 4 simulated sprayers, 6 applicators, 40 fields in a Tippecanoe County scenario; field windows, rainfast periods, wind, crew qualifications/hours and travel constraints; a manager selects a plan. The example farm's operational data is synthetic. Its fleet map places demo jobs on sourced rural farmland polygons; solver coordinates and the 3D view remain schematic. Reviewed custom profiles can supply the field/fleet/crew roster and shared assumptions; their geometry, weather and cost inputs remain illustrative. Online street tiles provide visual context only. No live operational source, actual co-op schedule, environmental benefit or equipment compatibility is implied.

## Global constraints

- Return zero to three distinct feasible schedules. Do not relax a hard rule to fill three cards.
- Every displayed quantity must be computed from the selected schedule and identified assumptions.
- Describe costs as estimates. Distinguish operating costs from custom-service prices and avoid double counting labor or fuel.
- Keep rain wash-off exposure, drift conditions and runoff risk separate. A rain buffer is not a runoff probability.
- Gemini cannot create a plan, override a constraint, calculate authoritative metrics or approve dispatch.
- Retain source timestamps, units, geography, product-rule versions and uncertainty.
- Changed inputs invalidate approval. A repair estimate is not confirmation that a machine is available.
- Treat `FEASIBLE` as a usable candidate without proof of optimality. A time-limited `UNKNOWN` is not proof of infeasibility.

## Review focus

1. A weather or equipment event arrives after options are displayed: reject approval against the old snapshot.
2. A message is ambiguous, tentative or adversarial: preserve its text and request clarification; do not silently change constraints.
3. No safe work is available: return a hold state and field-specific reasons, including data gaps.
4. A rig, crew member or product cannot serve a field: never hide the mismatch inside a low-cost solution.
5. A retry follows a timeout: do not duplicate input events, approvals, text messages or equipment tasks.

## Prototype boundary

The prototype includes software-only fleet-map and 3D playback plus a standalone browser replay edition. No new on-farm sensors, gateways, telematics boxes or sprayer modifications are required. The replay edition embeds recorded solver results, runs without installation or a network connection, and uses a schematic map background with no street-tile requests; fresh optimization remains in the local solver service. In production, use existing public weather/soil networks, spreadsheet imports and manager/crew updates as the baseline. Optional equipment integrations must not become a prerequisite for planning. Do not present a station observation as a field-specific measurement or a reported rig status as live telemetry.

The local app demonstrates the decision loop with synthetic scenarios. It is the first milestone, not an operational dispatch system. Read the repository README for the executable demo's current capabilities and commands.

The current interface also has individual tabs for the active sprayers (four in the example farm), prioritized queues, a browser-persisted manual job log scoped to the workday and profile configuration, daily completion counts, and a Disruptions incident feed. Opening a report automatically prepares a response for human approval; general planning stays on Plan. Completed fields are excluded by fresh local solves; the offline replay retains its recorded routes. Phone job cards, tablet layouts, touch targets and a scrollable approval dialog support mobile use. The agent workflow compares verified solver output deterministically; authenticated multi-user job records, live equipment positions, current-time replanning and Gemini explanations remain production work.

The prototype's CP-SAT model selects among generated feasible route candidates, with fixed operator/rig pairings: four pairings and two reserves in the example farm, or the first N operators for N custom rigs with remaining operators held in reserve. Its optimality status applies only to that bounded candidate set. A separate constraint validator checks plans before return and before approval. Production work must evaluate whether candidate generation is sufficiently broad or replace it with a fuller routing/scheduling formulation, and extend validation to production rules and data. Pattern-based text parsing stands in for Gemini; the narrow parser rejects multiple-time and ambiguous compound messages.

### Implemented fleet map and playback

The Plan dashboard defaults to **Fleet map**, implemented with Leaflet and an online OpenStreetMap street basemap with visible attribution. It needs no Google Maps API key. Four example rigs have animated positions, route lines, popups and follow controls. **3D simulation** and **Field layout** remain available. Fleet map and 3D simulation share playback time, speed, play/pause and scrubbing; changing views preserves the preview time. None of these previews writes job progress or completion counts to the manual job log.

The demo's 40 field boundaries come from public OpenStreetMap farmland polygons in rural Tippecanoe County. `web/demo-geography.js` stores the source geometry separately from solver inputs, with attribution and per-field source identifiers documented in [FIELD_GEOGRAPHY.md](FIELD_GEOGRAPHY.md). Spraying passes are computed inside each polygon; travel and return animations connect these geographic positions at the existing simulated schedule times. These are approximate mapped agricultural areas, not surveyed farm ownership or verified operational field boundaries. Job acreage remains a planning assumption.

Custom farm location text is not geocoded. Without actual field coordinates, custom profiles show a schematic background and cannot request street tiles. The map supplies neither GPS positions nor road travel times to the solver, which retains schematic travel distances. The standalone file embeds the map library and the demo field geometry, with a generated background and no tile requests. If online tiles are unavailable, field and fleet previews remain usable. Manager-confirmed field geometry, entrance coordinates and a reviewed road-routing source still need to be integrated before the display can represent an actual operation.

### Implemented profile and feedback workflow

**Farm chat** is a nine-step, deterministic guided chat that collects farm/location context, fields and schematic zones, rig capacities, user-reported applicator qualifications, one shared workday, shared wind/dry-time assumptions, local notes and comparison preference. Each accepted answer produces an assistant reply grounded in the parsed values, such as field count and total acreage, capacity or fixed operator assignments, followed by the next question. Invalid answers produce an in-thread clarification while retaining the current step, draft and previous answers. The final preference and review edits also receive a reply. This is local guided conversation, not a connected Gemini model or unrestricted language understanding.

The manager reviews and edits the complete summary, including fixed crew assignments, before choosing **Confirm & use this farm**. Replies do not confirm the profile or apply changes automatically. Profile drafts, confirmed profiles and JSON export are available in the standalone edition; a custom solve requires the local backend. The standalone edition keeps showing the recorded example farm.

The local planner uses confirmed acreage, capacity, working hours, priority flags and explicit field holds. It does not geocode addresses, recover real boundaries, fetch location-specific weather, verify licenses or translate local-knowledge notes into operational restrictions. All custom fields currently use the `standard` demo eligibility requirement and share the entered window and spray rules. A mention of a sensitive neighbor or access problem in notes does not protect that location in the solver. The profile is planning-demo input, not operational spraying advice.

The Plan dashboard and opened-incident feedback conversation share one draft and history and accept a bounded set of requests: ranking preferences, field holds, field priorities and whole-day sprayer exclusions. The user first reviews the structured interpretation, then explicitly applies it to request a fresh solver draft. Final plan approval remains separate. Unsupported, ambiguous or conflicting text stays in the conversation as a note with no planning change. Field priority is an objective preference, not a guaranteed first assignment; reviewed restrictions cannot relax hard rules or remove profile holds. Partial-day restrictions are outside this feedback helper. Offline feedback can rerank recorded options but cannot apply new field or rig restrictions.

Farm configuration hashes scope the browser's job records and recent feedback so switching configurations retains earlier records separately. This is local persistence, not authenticated multi-user storage or an authoritative server event log. Underway jobs must be completed or held before switching farms, and changed inputs invalidate pending plan approval. Neither chat uses Gemini; language-model integration, shared records and operational qualification checks remain future work.

### Implemented incident workflow

Disruptions opens a feed of reports, not a scenario menu or general planner. **Report an issue** from Fleet preselects the current sprayer and lets the manager manually record structured demo breakdown/wet-field/rain/wind details. The report appears immediately, but there is no connected live fleet feed. Opening a report starts agent analysis; its detail view presents a suggested response, alternatives, feedback and explicit approval. The feed contains no response or feedback workspace until an issue is selected.

Approving changes the local fleet queues and records `response_approved`; it does not repair equipment or resolve the issue. Resolution is a separate recorded transition. Every unresolved report, including those with approved responses, remains in the next local planning snapshot. Those restrictions combine with the Plan dashboard's conditions, confirmed crew update, profile holds and feedback: latest availability, wet-field union, earliest rain and highest wind take precedence. Changed reports invalidate stale proposals.

The incident store is scoped to farm configuration and day in browser storage. Storage notifications update other tabs in that same browser context. Manual/demo reports are not authenticated fleet telemetry, a shared multi-user log or cross-device synchronization. A production event intake, identity model and server-side resolution audit remain future work.

The standalone edition can record reports, but only a single example-farm Rig 3 breakdown until 2pm or rain-at-2pm report has a matching recorded response, with baseline or the matching scenario selected on Plan. Other incident types, times, combinations and custom constraints need the local solver; unsupported offline response approval is blocked. Neither recorded replay nor an approved response establishes live equipment availability.

### Current local profile/API contract

`POST /api/profile/preview` validates `{profile}` and returns normalized fields, rigs, crew, schematic coordinates, assumptions, `profile_id` and `profile_revision`. `POST /api/parse` accepts `{text, profile?}` and rejects recognized field/rig references outside the supplied roster. `POST /api/replan` accepts an optional profile, `feedback_constraints` and `incidents` alongside its scenario, ranking, update and completed-field inputs. Its response echoes applied constraints, normalized incidents and profile identity. Approval validates against the server's copy of that run's exact input roster and rules; custom calls do not mutate the default example data.

The profile is version 1 with required keys `id`, `version`, `farm_name`, `location`, `fields`, `rigs`, `crew`, `workday`, `rules`, `preferences`, and `notes`. Field entries contain `id/name/acres/crop/zone/priority/excluded`; rig entries contain `id/name/acres_per_hour`; crew entries contain `id/name/certifications`. Working hours use `start/end` minute integers; rules use `rainfast_minutes/wind_limit_mph`; preferences contain `priority`. The README contains a complete JSON example.

Current bounds are 1–40 fields, 1–4 rigs, at least one operator per rig and at most 12 operators; 1–500 integer acres per field and acres/hour per rig; shared hours within 480–1200 with end after start; 1–360 dry minutes; and 1–20 mph wind. IDs are unique F01–F40, R1–R4 and C1–C12. The profile ID is a safe 1–80-character string. API text limits are 120 for farm name, 200 for location, 80 for each entity name/crop and 4,000 for notes (the guided chat limits notes to 3,000). The backend accepts only the stated keys and known qualification labels, and never invents a credential. Request bodies are capped at 128 KiB.

Reviewed feedback uses `{excluded_fields: [], priority_fields: [], unavailable_rigs: []}` with unique known IDs. The browser helper accepts up to eight instructions and 1,000 characters; the backend accepts only these structured restriction keys. A profile's explicit holds are always retained. R3 is the custom breakdown target when present, otherwise the first rig; the wet-field scenario targets the first up-to-six custom fields. These remain scenario simulations, not detected incidents.

The optional `incidents` list contains up to 50 reports with unique safe IDs of 1–120 characters. Exact per-type shapes are `{id,type:"breakdown",rig_id,available_from}`, `{id,type:"wet",field_id}`, `{id,type:"storm",rain_time}` and `{id,type:"wind",wind_mph}`. Entity IDs must exist in the active roster; time integers are 480–1200 and wind integers 1–60 mph. Extra keys, invalid types and duplicate report IDs are rejected. UI status/source/prose are not solver fields. The backend retains the full incident and condition snapshot for approval; the browser sends unresolved reports only. Omitting incidents retains the original scenario-only API behavior.

Candidate generation and display ranking are separate. “Total acreage,” cost and rain-buffer rankings sort actual returned metrics; they do not put an objective's named plan first by assumption. Balanced ranking uses disclosed demo weights, which need co-op validation before a pilot.

The production work is separable into four milestones. Start with historical replay; add external dispatch only after the data and validation work is accepted.

| Milestone | Demonstrable result | Exit evidence |
| --- | --- | --- |
| Historical replay | Rebuild past decisions from data available at that time | Reproducible comparison against the co-op's recorded plan |
| Shadow planning | Produce options beside a manager's normal process | Documented agreement, overrides and constraint violations |
| Approved messaging | Send a selected, revalidated plan with acknowledgements | No duplicate releases; obsolete plans visibly superseded |
| Equipment integration | Export tasks for one identified terminal family | Bench and field validation on that terminal |

## Proposed production structure

These files are proposed additions, not existing modules.

```text
backend/
  contracts.py               # validated input, snapshot, plan and approval types
  events.py                  # idempotent event log and snapshot versioning
  rules.py                   # product and operational eligibility checks
  validator.py               # independent schedule feasibility and metric audit
  sources/weather.py         # observations and forecast vintages
  sources/operations.py      # field, crew, fleet and job imports
  sources/soils.py            # soil attributes with spatial provenance
  language.py                # Gemini extraction/explanation, never dispatch
  replay.py                  # historical evaluation at decision timestamps
  dispatch.py                # transactional outbox, acknowledgement, supersession
  exports/isoxml.py           # one tested equipment profile
tests/
  test_contracts.py
  test_rules.py
  test_language.py
  test_replay.py
  test_dispatch.py
  test_isoxml.py
```

Retain the prototype solver behind the same public plan contract while strengthening its scheduling and validation internals. Add a source only when its units, coverage, licensing and freshness behavior are known.

## Data contracts and authority

Use UTC ISO timestamps internally and `America/Indiana/Indianapolis` for display. Use stable IDs, explicit units and versioned schemas. The demo's minute-of-day values are a local simplification and must not become the production timestamp format.

| Contract | Required content | Who may set it |
| --- | --- | --- |
| `OperationalEvent` | `event_id`, `schema_version`, `source`, `received_at`, `effective_at`, `entity_id`, `event_type`, `payload`, `raw_text`, `confidence`, `confirmed_by` | Adapter or manager; tentative extraction remains a proposal |
| `FieldJob` | Field boundary/entry point, acres, product/rate, earliest start/latest finish, priority, rainfast rule reference, sensitive-neighbor geometry, field access status | Authorized operational import and reviewed product rules |
| `FleetCrew` | Rig capacity/compatibility, location, maintenance status, crew qualifications and expiries, shifts, breaks, existing commitments | Fleet/crew source; manager-confirmed availability |
| `WeatherSnapshot` | Source, station/grid coverage, `issued_at`, `retrieved_at`, `valid_from/to`, units, rain and wind series, uncertainty/freshness state | Weather adapter |
| `PlanningSnapshot` | Monotonic version, included event IDs, rule versions, source vintages, immutable inputs, content hash | Server |
| `Plan` | `plan_id`, snapshot hash, objective/weights, jobs/routes/times, deferred reasons, metric breakdown, solver version/status/time, validation result | Solver plus deterministic validator |
| `Approval` | Idempotency key, plan ID/hash, snapshot hash, manager identity, approval time, preflight result | Authenticated manager action |
| `Dispatch` | Approval ID, recipient/terminal, payload hash, superseded task ID, delivery/acknowledgement state | Dispatch adapter after preflight |

Separate `estimated_ready_at` from `available_confirmed_at`. For example, “rig 3 hydraulic leak, down till 2pm” can establish that Rig 3 is down and propose a repair estimate; it cannot authorize automatically sending Rig 3 at 2pm.

## Milestone 1: Historical replay

### Task 1: Normalize and version input data

**Files:** `backend/contracts.py`, `backend/events.py`, `backend/sources/operations.py`, `tests/test_contracts.py`.

**Interfaces:** `ingest_event(event: OperationalEvent) -> EventReceipt`; `snapshot(as_of: datetime) -> PlanningSnapshot`. Repeating an event ID with the same payload is idempotent; conflicting payloads are rejected. Production imports must not accept browser-calculated costs or feasibility flags as authority.

- [ ] Write failing tests for duplicate events, missing units, invalid time ranges, stale source data, daylight-saving transitions, unknown field/rig IDs and contradictory maintenance events.
- [ ] Import one co-op's field/job/fleet/crew files into the contracts, retaining original rows and validation errors.
- [ ] Restrict real pilot data to authorized co-op users before importing it; keep the public demonstration on synthetic fixtures.
- [ ] Implement immutable snapshots selected by the data actually available at `as_of`, not by the newest data currently stored.
- [ ] Pass the contract tests and reproduce an identical snapshot hash from identical source events.

**Acceptance:** Every job and exclusion can be traced to a source row or confirmed event. Bad data produces actionable import errors, not a guessed schedule.

### Task 2: Establish rules, feasible routes and auditable estimates

**Files:** `backend/rules.py`, `backend/validator.py`, the existing solver module, `tests/test_rules.py`.

**Interfaces:** `eligible(job, rig, crew, interval, snapshot) -> Eligibility`; `validate_plan(plan, snapshot) -> ValidationReport`; `calculate_metrics(plan, assumptions) -> PlanMetrics`.

- [ ] Write failing cases for rain beginning before rainfast completion; wind/gust limits; sensitive-neighbor restrictions; saturated/inaccessible fields; expired qualifications; overlapping crew work; shift ends; nonzero travel; refills and product changeover.
- [ ] Have a qualified operational/agronomic reviewer approve the product-rule schema and source references. Use product-specific rules, not one universal wind or rainfast threshold.
- [ ] Use a travel-time matrix between actual field entrances and refill locations. Model relevant tank capacity, refill duration, compatibility, cleanout and breaks before comparing schedules as operationally feasible.
- [ ] Produce candidates for completed priority acres, estimated operating cost and weather buffer. Record weights/coverage constraints; deduplicate identical schedules and remove dominated candidates.
- [ ] Validate each candidate with code independent of the solver's constraint construction. Return hold/defer reasons when work cannot proceed.
- [ ] Pass the rule cases and recalculate every displayed metric from the returned jobs and legs.

**Acceptance:** No emitted plan violates the approved rule set. Cost comparison includes completed acreage and deferred work; an almost-empty plan cannot appear superior merely because it costs less. “Optimal” always names the objective and search scope.

### Task 3: Connect weather and soil evidence, then replay

**Files:** `backend/sources/weather.py`, `backend/sources/soils.py`, `backend/replay.py`, `tests/test_replay.py`.

**Interfaces:** `weather_at(location, decision_time) -> WeatherSnapshot`; `replay(events, decision_times, policy) -> ReplayReport`.

- [ ] Test missing stations, out-of-coverage fields, stale forecasts, unit changes and an archive with observations but no as-issued forecast.
- [ ] Start with a reproducible downloadable dataset. Verify timestamps, license and spatial coverage; keep station observations separate from forecasts.
- [ ] Add NWS forecast acquisition and archive every retrieved forecast with its issuance and retrieval times. Confirm WHIN access and Mesonet export terms before building unattended integrations.
- [ ] Map SSURGO attributes to field polygons as static context. Do not interpret soil class alone as a measured trafficability or runoff forecast.
- [ ] Replay selected disruptions with no future information leakage. Compare to the recorded spreadsheet plan and a simple documented baseline using the same available information.
- [ ] Publish per-day results and failure cases, not just an aggregate improvement.

**Acceptance:** Each replay identifies whether historical forecasts were available. Observation-only runs are labeled demonstrations or hindsight upper bounds, never prospective forecasting performance.

**Metrics:** Priority acres completed within window; total feasible acres; deferred/missed-window jobs; travel time; labor and overtime; estimated operating cost with assumptions; rainfast/wind rule violations; replanning latency distribution; timeout/no-solution rate; and number of substantially different candidates. Runtime claims come from measured runs on documented hardware and problem sizes.

## Milestone 2: Shadow planning with Gemini

### Task 4: Propose structured updates and explain verified plans

**Files:** `backend/language.py`, `tests/test_language.py`, update-entry and comparison UI components.

**Interfaces:** `propose_update(text, entity_catalog, received_at) -> ProposedEvent`; `explain_plan(validated_plan, snapshot) -> Explanation`.

- [ ] Test “probably ready by two,” missing AM/PM, unknown rig names, multiple conflicting messages and text that asks the model to ignore constraints.
- [ ] Require schema-valid output with explicit unresolved fields. Show proposed changes for confirmation before they enter the authoritative event log.
- [ ] Pass only validated plan facts to explanation generation. Verify referenced field/rig IDs and numeric values; fall back to a deterministic summary if generation fails validation.
- [ ] Cache eligible repeated reference context only when it is actually reused and supported by the selected model/API. Measure cache behavior, cost and latency rather than promise savings. Keep live weather, maintenance status, current schedule and approvals versioned and refreshed; caching is not spreadsheet ingestion.
- [ ] Run beside a manager without dispatch. Record selected options, overrides, missing context and reasons for rejection.

**Acceptance:** The model never supplies authoritative costs or overrides safety constraints. A language-model outage still permits deterministic planning and explanation.

## Milestone 3: Explicit approval and acknowledged messaging

### Task 5: Bind approval to a current snapshot

**Files:** `backend/dispatch.py`, `tests/test_dispatch.py`, approval and crew acknowledgement UI.

**Interfaces:** `approve(plan_id, snapshot_hash, manager_id, idempotency_key) -> ApprovalResult`; `release(approval_id) -> DispatchBatch`.

- [ ] Test an event between display and approval; an event between approval and release; duplicate requests; a network timeout after provider acceptance; and an obsolete plan awaiting acknowledgement.
- [ ] Add authentication and roles, persistent approvals, server-side revalidation and a transactional dispatch outbox.
- [ ] Invalidate affected releases when conditions change. Require explicit acknowledgement of superseding instructions and show undelivered/unacknowledged jobs to the manager.
- [ ] Pilot with agreed recipients and a defined fallback contact process. Preserve the original and superseding instructions in the audit log.

**Acceptance:** One approved plan produces at most one logical release per recipient/task. The manager sees the difference between approved, sent, delivered, acknowledged and started. No background replan automatically dispatches equipment.

## Milestone 4: One equipment profile

### Task 6: Validate ISOXML on the target hardware

**Files:** `backend/exports/isoxml.py`, `tests/test_isoxml.py`, fixtures captured from the chosen terminal's documented format/profile.

**Interfaces:** `export_task(approved_job, terminal_profile) -> ExportArtifact`, including a manifest and payload hash.

- [ ] Identify the terminal model, supported task-data/profile version, required identifiers, geometry handling, products/rates and import workflow with the co-op.
- [ ] Test malformed/missing geometry, unknown products, wrong units, duplicate task IDs, superseded exports and imports rejected by the terminal.
- [ ] Validate the archive/schema where supported, then import on bench hardware before a supervised field trial.
- [ ] Verify field, boundary, product, rate and task identity on the terminal; record the observed import result.

**Acceptance:** Claim compatibility only for tested terminal profiles. A downloadable XML or JSON file alone is not evidence of machine compatibility or successful dispatch.

## Pilot request

Ask one Indiana co-op for one season of **timestamped spray logs and dispatch changes**, not only final acreage totals: field boundaries and entrances; products/rates and rule references; requested windows and priorities; rig/crew assignments; start/finish times; travel/refill/cleanout; breakdown and repair-confirmation events; weather-related holds; and actual completion/defer decisions. Record missing data explicitly.

Choose evaluation days before tuning. Include ordinary days, storms, breakdowns and days with no feasible work. Agree with the manager which delays matter and what would justify a shadow pilot. Review individual failures with an operator and relevant subject-matter reviewer before enabling external dispatch.

The first credible claim is “we can reproduce the decision inputs and generate validated alternatives.” Savings and environmental outcomes are hypotheses to measure.

## Sources and verification status

Source access is distinct from integration: links below do not imply that the prototype imports these datasets.

- [Google OR-Tools CP-SAT documentation](https://developers.google.com/optimization/cp/cp_solver): primary reference for solver statuses and feasibility/optimality distinctions; checked during development.
- [Gemini context caching documentation](https://ai.google.dev/gemini-api/docs/caching): checked; implicit caching reuses eligible input tokens, while explicit-cache support depends on the selected model/API. Neither mechanism replaces input parsing or guarantees a particular latency or savings.
- [WHIN data portal announcement](https://ag.purdue.edu/news/2020/08/whin-data-portal.html): historical description. Confirm present API access, license, stations and coverage with WHIN.
- [Open WHIN dataset paper](https://www.emergentmind.com/papers/2302.09072): discovery reference supplied in the brief. The supplied download host `purduewhin.ecn.purdue.edu` failed DNS resolution during the development check on October 30, 2026. Resolve access and verify the primary paper/license before relying on this dataset.
- [Purdue Mesonet Data Hub instructions](https://ag.purdue.edu/indiana-state-climate/purdue-mesonet/data-hub-instructions/): checked; describes downloadable 30-minute, hourly and daily tables, including soil moisture/temperature at 2, 4, 8 and 20 inches and wind speed/direction. A downloaded, dated snapshot is a practical first real-data integration. Confirm unattended export terms separately.
- [NWS API documentation](https://www.weather.gov/documentation/services-web-api): checked; documents free open data, a required identifying User-Agent and rate limits. Archive forecast vintages for later replay and recheck authentication requirements at integration time.
- [Purdue 2025 Indiana Farm Custom Rates](https://ag.purdue.edu/commercialag/home/wp-content/uploads/2025/04/20250417_Langemeier_2025IndianaFarmCustomRates.pdf): service-price benchmark, not a measured co-op marginal-cost model.
- [USDA Web Soil Survey](https://websoilsurvey.nrcs.usda.gov/): candidate SSURGO access point; static soil mapping does not replace current field-condition observations.

Review status: this plan covers the user's decision loop and separates prototype mechanics from evidence and integrations required for a pilot. No future milestone is marked complete.
