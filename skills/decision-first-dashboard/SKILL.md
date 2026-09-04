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
- classify decision roles;
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

### 2. Choose the evidence mode

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

For `no_score`, do not create `Healthy`, `Marginal`, `At risk`, or a 0–100 score. Overall direction remains a deterministic renderer derivation from validated signal directions.

### 3. Build a grounded bundle

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

### 4. Required grounding coverage

For `composite`, ground all source-dependent scoring facts:

- score label/value/min/max/band;
- normalization and aggregation;
- each component label/value/normalized score/weight;
- each score-band label/min/max;
- score-series values when present;
- visible exception/event fields when present.

For `no_score`, ground each visible signal label/value, optional source delta/direction, source series values, and visible exception/event fields.

Do not ground deterministic renderer synthesis as if it were a source fact.

### 5. Compile through the grounding gate

Production execution is:

```bash
node scripts/compile.js <grounded-bundle.json> <output-dir>
```

On `PASS`, the CLI writes:

- `no_score` → `output.no-score.svg` and `output.no-score.html`;
- `composite` → `output.composite.svg` and `output.composite.html`.

On any non-`PASS` transition, it exits non-zero and does not render dashboard output.

Treat `validate.js` and `render.js` as lower-level compiler/renderer tools. Do not use direct rendering as a substitute for the V3 grounded production path.

### 6. Follow failure transitions literally

- `FIX_DECISION_STATE` → repair contract/schema errors only; do not weaken validation.
- `RETURN_TO_EVIDENCE_EXTRACTION` → re-read the source and repair evidence/claims.
- `FALLBACK_TO_NO_SCORE` → abandon composite and rebuild a grounded no-score state from available evidence.
- `PASS` → render deterministically.

Do not turn a failed grounding check into an invitation to guess.

## Visual contract

The renderer owns the layout.

For `no_score`:

- dominant center directional synthesis;
- 3–6 signals converging on the center;
- compact left business context;
- compact right exceptions/events.

For `composite`:

- dominant center source-supported score and band;
- 3–6 weighted score components converging on the center;
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

- the grounded-bundle schema passes;
- the source SHA-256 matches the actual source bytes;
- every required visible/source scoring fact has a resolvable claim and evidence anchor;
- every grounded value matches the referenced decision-state value under allowed deterministic normalization only;
- `no_score` overall direction matches the signal directions;
- `composite` weights, weighted score, score scale, and score band pass semantic validation;
- no unsupported score/status/target/action appears;
- no framework or compiler labels leak into visible UI;
- the center is the first focal point;
- outputs contain no unresolved template tokens.
