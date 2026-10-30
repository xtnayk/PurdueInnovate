# Fieldwork prototype

This local, exploratory prototype demonstrates the manager's decision loop: choose a disruption, inspect up to three feasible alternatives, examine the field and rig schedule, and approve a plan locally. The original brief supplies the problem and desired solver/LLM separation. The implementation choices below are defaults selected for this prototype.

## Scope and implementation choices

- Python 3.12, OR-Tools CP-SAT and a standard-library HTTP server; buildless HTML, CSS and JavaScript.
- Forty synthetic fields, four rigs and six synthetic applicators. Weather, field positions, product rules and operating rates are illustrative. No real chemical application decisions.
- CP-SAT selects compatible candidate routes under a bounded search. Any optimal status applies only to that candidate set. The prototype does not prove global routing optimality.
- A narrow deterministic message parser demonstrates a proposed structured update; Gemini and live data adapters belong to the next build stage.
- Approval records stay local. There is no SMS delivery or equipment connection. Downloads are review artifacts, not machinery task files.
- Numbers come from the schedule. Rain buffer is a duration, not a probability of damage or a runoff model. Empty or fewer-than-three results are allowed.
- A new replan invalidates older approvals. Input edits make the current result stale in the UI until replanned.

## Visual system

The working surface is a dispatch board. A schematic field map conveys planned and deferred work; a time strip makes the impending rain visible. Quiet comparison cards lead into a rig timeline and the explicit approval action.

- Paper: `#f5f7f5`; surface: `#ffffff`; ink: `#203a35`; field green: `#287b57`; pale field: `#d9e7cc`; rain blue: `#bfdbe2`; amber: `#a26c1c`.
- Type: system sans-serif for dependable local rendering, with tabular numerals for schedule and costs. No remote font dependency.
- Left aligned text, wide map beside a narrow update panel, three comparison columns on desktop, one column on small screens.
- Color encodes field/rig status. Labels and patterns provide redundant meaning. Navigation and fields work with a keyboard; reduced motion is respected.

## Acceptance

Changing weather or fleet state changes feasible schedules. Every assignment passes the same deterministic validator before approval. Costs and labor reconcile to component calculations. Late arrivals cannot overwrite a newer UI result. Unsupported text must be shown as unsupported, not silently treated as an applied update. Desktop and mobile layouts remain usable, with visible loading, empty, error and locally approved states.
