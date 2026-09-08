---
name: decision-first-dashboard
description: Use when redesigning KPI-heavy dashboards where users must scan multiple independent metrics before understanding overall status, the main risk, whether performance is good enough, or what requires action.
---

# Decision-First Dashboard

## Core principle

Separate agent judgment from compiler judgment and deterministic rendering.

**Source → grounded evidence bundle → compiler gate → deterministic renderer → SVG / HTML**

The agent may extract and classify evidence. It may not invent source support, bypass grounding, or choose a free-form dashboard layout.

## Three layers

### Layer 1 — Agent intelligence

The agent may:

- extract literal source facts;
- classify decision roles with the Metric Router;
- choose a proposed mode;
- create evidence anchors and claim references.

The agent must not render UI or fabricate score-model evidence.

### Layer 2 — Compiler contract

Code decides whether the grounded bundle can proceed.

The compiler validates:

- the closed grounded-bundle contract;
- the closed `decision-state` contract;
- source file SHA-256;
- evidence reference integrity;
- exact JSON Pointer or text-span grounding;
- required claim coverage;
- composite score mathematics and score-band semantics.

It returns one of four machine-readable transitions:

- `PASS`;
- `RETURN_TO_EVIDENCE_EXTRACTION`;
- `FALLBACK_TO_NO_SCORE`;
- `FIX_DECISION_STATE`.

### Layer 3 — Deterministic renderer

`render.js` consumes only validated decision state and fills fixed SVG/HTML templates. It does not inspect source data or invent business meaning.

## Workflow

### 1. Extract verified facts only

Identify the primary user and decision, then capture only source-supported metrics, deltas, account states, events, targets, thresholds, and score rules.

Never invent scores, targets, thresholds, customer states, events, workflows, actions, or causal claims. Direction is not the same as health.

### 2. Route metrics before choosing a mode

Use the **Metric Router** whenever the source exposes more metrics than a user can reasonably scan at first view. The canonical stress case is **70-KPI overload**: a dashboard may contain roughly 70 valid KPIs, but validity does not make every KPI a first-view peer.

> **Preserve everything without showing everything.**

Preserve the complete source/extraction inventory for traceability. Route each metric to exactly one decision role before constructing the visible decision state:

- `primary_signal` — directly changes the main decision or next action; eligible for first-view emphasis.
- `diagnostic` — explains why a primary signal moved or why the current state exists; supporting context, not a peer headline by default.
- `exception` — a source-supported breach, outlier, critical account/event, or hard-stop condition that requires attention even when the summary looks acceptable.
- `drilldown` — useful investigation detail that should be available on demand rather than occupying the default composition.
- `scorecard_only` — retained for completeness, audit, or secondary scorecard use, but not promoted to the decision-first view unless the user explicitly requests it.

Apply the **Action Trigger Test** to every candidate metric:

1. If this metric changes materially, does the user's decision or action change?
2. If yes in the normal decision loop, route it to `primary_signal`.
3. If it requires attention because a threshold, safety, compliance, contractual, outage, or other critical condition is breached, route it to `exception`; exceptions override ordinary synthesis rather than being averaged away.
4. If it mainly explains a primary signal, route it to `diagnostic`.
5. If it matters only after the user chooses to investigate, route it to `drilldown`.
6. If no decision, action, diagnosis, or exception handling changes, route it to `scorecard_only`.

Routing rules:

- Do not promote a metric because it is easy to visualize, numerically large, or already placed in a KPI card.
- Prefer the minimum sufficient set of `primary_signal` metrics. The current deterministic no-score renderer supports 3–6 visible signals; when the source contains more, route the remainder to `diagnostic`, `exception`, `drilldown`, or `scorecard_only` instead of deleting source evidence.
- Active `exception` facts may be visible even when they are not part of the central synthesis.
- The role taxonomy belongs to Layer 1 routing. Do not leak `primary_signal`, `diagnostic`, `exception`, `drilldown`, or `scorecard_only` labels into product UI, and do not add unclaimed hidden metrics to the grounded bundle merely to prove they were preserved. The closed grounded bundle should contain only facts used by the rendered decision state and its required claims.

### 3. Choose the evidence mode

The compiler supports two mutually exclusive decision-state modes.

Use `composite` only when the source already provides **all** of the following:

- an overall score and score scale;
- normalized component scores;
- component weights;
- a weighted-average aggregation rule;
- complete score bands / thresholds that determine the displayed status.

Composite accepts only:

- `normalization: "source_provided"`;
- `aggregation: "weighted_average"`;
- source-grounded score, component, weight, band, exception, event, and trend facts.

If any required composite scoring fact cannot be mechanically grounded, the transition is `FALLBACK_TO_NO_SCORE`. Do not fill the gap with an inferred formula, guessed weight, or benchmark.

For `no_score`, do not create `Healthy`, `Marginal`, `At risk`, or a 0–100 overall score. Overall direction remains a deterministic renderer derivation from validated signal directions.

**Radar eligibility is independent of overall-score eligibility.** A `no_score` dashboard may render a closed radar profile only when the source explicitly provides all of the following:

- **3–6 peer dimensions** that describe the same object or condition as one profile;
- one shared, source-backed numeric scale in `radarScale.min` / `radarScale.max`;
- a source-backed `normalizedScore` for every displayed dimension.

Three dimensions are sufficient and must render as a triangle. Fewer than three dimensions are not radar-eligible. Four to six dimensions render with the corresponding number of vertices.

Radar is a **profile chart**, not a generic multi-metric chart. Do not connect heterogeneous raw KPIs such as revenue dollars, customer counts, percentages, latency, ratios, or unrelated business outcomes merely because several numbers are available. Do not derive or guess normalization for visual convenience. If a shared source-backed scale is absent, keep the metrics in the non-radar `no_score` expression.

### 4. Build a grounded bundle

The production contract has four top-level fields:

```json
{
  "source": {
    "kind": "json",
    "path": "source.json",
    "sha256": "..."
  },
  "decisionState": {},
  "evidence": [],
  "claims": []
}
```

The envelope must match:

`schemas/grounded-bundle.schema.json`

`decisionState` must independently match:

`schemas/decision-state.schema.json`

`evidence` is a ledger of source anchors. `claims` maps exact decision-state JSON Pointer paths to evidence IDs.

Supported source grounding in V3:

- JSON source → `json_pointer` anchor;
- text source → exact `text_span` anchor with `literal` and `valueText`.

The compiler verifies the source file hash before checking any claim.

Image-only coordinates are not strong composite grounding in V3 because this repository has no deterministic OCR/token extractor. For screenshot inputs, first produce a verifiable text/JSON sidecar. Do not represent an unverified screenshot interpretation as strong composite evidence.

### 5. Required grounding coverage

For `composite`, ground all source-dependent scoring facts:

- score label/value/min/max/band;
- normalization and aggregation;
- each component label/value/normalized score/weight;
- each score-band label/min/max;
- score-series values when present;
- visible exception/event fields when present.

For ordinary `no_score`, ground each visible signal label/value, optional source delta/direction, source series values, and visible exception/event fields.

For a `no_score` radar, additionally ground:

- `radarScale.min` and `radarScale.max`;
- every signal `normalizedScore` used as a radar vertex.

A missing radar-scale or normalized-score claim returns to evidence extraction. Do not silently fall back to an ungrounded radar.

Do not ground deterministic renderer synthesis as if it were a source fact.

### 6. Compile through the grounding gate

Production execution is:

```bash
node scripts/compile.js <grounded-bundle.json> <output-dir>
```

On `PASS`, the CLI writes:

- `no_score` → `output.no-score.svg` and `output.no-score.html`;
- `composite` → `output.composite.svg` and `output.composite.html`.

On any non-`PASS` transition, it exits non-zero and does not render dashboard output.

Treat `validate.js` and `render.js` as lower-level compiler/renderer tools. Do not use direct rendering as a substitute for the V3 grounded production path.

### 7. Follow failure transitions literally

- `FIX_DECISION_STATE` → repair contract/schema errors only; do not weaken validation.
- `RETURN_TO_EVIDENCE_EXTRACTION` → re-read the source and repair evidence/claims.
- `FALLBACK_TO_NO_SCORE` → abandon composite and rebuild a grounded no-score state from available evidence.
- `PASS` → render deterministically.

Do not turn a failed grounding check into an invitation to guess.

## Visual contract

The renderer owns the layout.

For `no_score`:

- when all 3–6 peer dimensions have source-grounded `normalizedScore` values on one source-grounded `radarScale`, render a true closed radar profile;
- otherwise use the non-radar signal layout and never connect heterogeneous raw KPI values into a fake radar;
- compact left business context;
- compact right exceptions/events.

For `composite`:

- dominant center source-supported score and band;
- 3–6 normalized weighted components form a true closed radar profile;
- compact left score trend and score composition;
- compact right exceptions/events.

For both modes:

- no four-card KPI strip;
- no dominant full-width customer table;
- no invented action controls;
- product-native labels only;
- no compiler/framework methodology labels in visible UI;
- restrained color and generous whitespace.

See `references/visual-pattern.md`.

## Hard stops

Safety, compliance, security, regulatory, contractual, or outage conditions override ordinary synthesis. Never average them into a reassuring status. Do not force a hard-stop case through the current SaaS renderers.

## Final gate

Before delivery, verify:

- the Metric Router has classified overloaded source metrics before the evidence mode is chosen;
- the first view contains the minimum sufficient `primary_signal` set plus active source-supported exceptions, rather than a flat KPI inventory;
- the grounded-bundle schema passes;
- the source SHA-256 matches the actual source bytes;
- every required visible/source scoring fact has a resolvable claim and evidence anchor;
- every grounded value matches the referenced decision-state value under allowed deterministic normalization only;
- `no_score` overall direction matches the signal directions;
- a `no_score` radar appears only for 3–6 peer dimensions with a source-grounded shared scale and a grounded normalized score for every vertex;
- raw mixed-unit KPIs never masquerade as radar dimensions;
- `composite` weights, weighted score, score scale, and score band pass semantic validation;
- no unsupported score/status/target/action appears;
- no framework or compiler labels leak into visible UI;
- the center is the first focal point;
- outputs contain no unresolved template tokens.
