# Metric-level Worthiness Implementation Plan

## Goal

Implement the approved Metric-level Worthiness contract on
`codex/metric-level-worthiness`, preserving the single compiler/renderer
pipeline and the existing Dashboard Worthiness, intake, routing, grounding,
radar, no-score, and composite behavior.

## Architecture

Use the existing `worthiness-assessment.schema.json` as the canonical home for
metric assessments. Extend `worthiness.js` with schema/semantic validation and
the metric clarification transition. Extend `routing.js` with candidate route
evaluation, mechanical ambiguity detection, override application, and a
state rebuild helper. Pass the resulting state through the existing
`compile-dashboard.js` and `render.js` entrypoints only. Add optional
`scorecardSignals` to no-score decision state so demoted inventory remains
available in canonical output through a collapsed, machine-marked surface.

## Tasks

1. Add contract documentation and frozen regression fixtures for inferred,
   monitoring, candidate-divergence, and 70-KPI cases.
2. Add failing tests for schema/state validation, same-route and non-hero
   ambiguity, primary-vs-non-primary ambiguity, shared five-question budget,
   screenshot assumptions, monitoring preservation, and both canonical
   override directions. Run the new tests against the clean baseline and
   capture the expected RED result before implementation.
3. Extend schemas and pure helpers. Validate metric ids, typed dimensions,
   statuses, candidate route outcomes, and override consistency. Compute
   `unique(route outcomes) >= 2 && heroEligibility diverges` mechanically.
4. Integrate the helpers into the production compiler. Apply overrides and
   derived routes before the existing routing gate, rebuild no-score primary,
   supporting, and scorecard collections, and keep the manifest/state binding
   exact.
5. Add stable metric/presentation markers to the existing HTML/SVG render
   functions and render collapsed additional metrics without creating a new
   renderer or use-case template.
6. Run targeted tests, full `npm test`, CLI/fixture validation, and canonical
   before/after HTML/SVG assertions. Verify the 70-KPI final question count is
   at most five and no demoted metric keeps the old primary marker.
7. Commit, push the new branch, open a separate PR to `main` without touching
   PR #41, and wait for the actual GitHub Actions run to complete before
   reporting CI status.

## Tech stack and verification commands

- Node.js ESM and `node:test`; no new runtime dependency.
- `npm test`
- `node --test tests/compiler/metric-worthiness.test.js`
- `node scripts/preflight.js`

## Frozen constraints

Do not create a parallel Action Trigger subsystem, compiler, renderer,
template registry, or fixture-specific branch. Do not weaken assertions to
make tests green. Schema green is not routing green, and routing green is not
canonical output green; the final contract is `contract → behavior →
canonical HTML/SVG`.
