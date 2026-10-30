# Fieldwork without new farm hardware

The intended workflow does not require installing sensors, GPS trackers, gateways, radios or control boxes on a farm or sprayer. A manager uses an ordinary phone, tablet or laptop browser. Fleet availability and field conditions can begin as spreadsheet imports and manager/crew updates. Future weather and soil adapters can use existing public networks rather than equipment that the co-op has to install.

The 3D view is a software preview of a proposed schedule. Its rig positions, spray coverage and weather are simulated; they are not live telemetry and do not imply that sensors or machine control systems are connected.

## Two ways to try it

| Edition | How to open | What runs |
| --- | --- | --- |
| Portable 3D replay | Open `output/Fieldwork.html` directly in a modern browser | Everything is embedded. Five recorded scenarios and their validated plans can be ranked, inspected, played and approved locally. No server, Python installation or internet connection is needed to view it. |
| Local solver prototype | Follow the repository README and open the local server URL | Python/OR-Tools computes fresh schedules from the supported simulated scenarios and text updates. This developer setup is software infrastructure, not new on-farm hardware. |

The portable edition replays plans generated in advance by the real OR-Tools backend. It does not run a fresh optimizer, retrieve current weather or interpret arbitrary crew messages. This distinction is visible in its header and runtime note. A browser that cannot initialize WebGL can still use the planning information; the 3D view provides a fallback message.

Local approval only marks a plan for review. It sends no text message, changes no equipment task and starts no sprayer. The exported JSON and crew sheet are review artifacts, not validated machine files. Closing the portable file discards its approval state.

## Production path

Start with public forecast/observation data and existing co-op records. Missing, stale or uncertain inputs should be visible and prevent unsupported recommendations. Existing field sensors and telematics can be optional data sources if a customer already has them; they are not prerequisites. Smartphone browser access still requires a suitable device, and a deployed live service would require connectivity and hosted software.

ISOXML export is a later optional integration for compatible terminals. It should not be a prerequisite for schedule comparison or manager approval. Until a specific terminal profile is validated, the system should provide human-readable crew instructions only.

## Rebuild the portable edition

These commands are for a developer, not for someone opening the delivered HTML:

```sh
.venv/bin/python scripts/capture_fixtures.py
.venv/bin/python scripts/build_portable.py
```

Capture records the solver source hash and timestamp, validates each plan again, and saves `web/demo-fixtures.json`. Build embeds the current UI, 3D renderer, styles, replay adapter and recorded results in one file. Regenerate the capture when solver behavior or source assumptions change.
