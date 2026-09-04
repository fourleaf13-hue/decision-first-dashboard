---
name: decision-first-dashboard
description: Use when redesigning KPI-heavy dashboards where users must scan multiple independent metrics before understanding overall status, the main risk, whether performance is good enough, or what requires action.
---

# Decision-First Dashboard

## Core principle

Separate agent judgment from compiler judgment and deterministic rendering.

**Source → grounded evidence bundle → compiler gate → optional V3.1 semantic planner → deterministic renderer → SVG / HTML**

The agent may extract and classify evidence. It may not invent source support, bypass grounding, silently substitute requested quantities, or choose a free-form dashboard layout.

## Three layers

### Layer 1 — Agent intelligence

The agent may:

- extract literal source facts;
- identify exactly one primary audience, one purpose, and one primary decision;
- classify decision roles;
- choose a proposed mode;
- list requested outputs and decide whether each is computable or must be deferred;
- create evidence anchors and claim references.

The agent must not render UI, fabricate score-model evidence, or author layout coordinates.

### Layer 2 — Compiler contract

Code decides whether the grounded bundle can proceed.

The compiler validates:

- the closed grounded-bundle contract;
- the closed `decision-state` contract;
- source file SHA-256;
- evidence reference integrity;
- exact JSON Pointer or text-span grounding;
- required claim coverage;
- composite score mathematics and score-band semantics;
- V3.1 semantic intent when enabled;
- Compute-or-Defer requirement resolution;
- deterministic render-plan layout invariants.

Grounding returns these machine-readable transitions:

- `PASS`;
- `RETURN_TO_EVIDENCE_EXTRACTION`;
- `FALLBACK_TO_NO_SCORE`;
- `FIX_DECISION_STATE`.

V3.1 semantic planning adds:

- `FIX_COMPILER_INTENT`.

### Layer 3 — Deterministic renderer

`render.js` consumes only validated decision state and fills fixed SVG/HTML templates. It does not inspect source data or invent business meaning.

The V3.1 planner owns the render-plan IR and fixed layout coordinates. The renderer remains visually deterministic and does not reinterpret the plan.

## Workflow

### 1. Establish one audience, one purpose, one decision

Before choosing metrics or charts, identify the person who must act and the decision the dashboard must make easier.

A single dashboard must have:

- one primary audience;
- one purpose;
- one primary decision.

If a request mixes executives, operators, analysts, engineers, or other groups with materially different questions and time horizons, split it into separate dashboards before compilation. Do not solve a multi-audience problem by packing more panels into one screen.

### 2. Extract verified facts only

Capture only source-supported metrics, deltas, account states, events, targets, thresholds, and score rules.

Never invent scores, targets, thresholds, customer states, events, workflows, actions, or causal claims. Direction is not the same as health.

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

For `no_score`, do not create `Healthy`, `Marginal`, `At risk`, or a 0–100 score. Overall direction remains a deterministic renderer derivation from validated signal directions.

### 4. Build a grounded bundle

The legacy V3 production contract has four top-level fields:

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

### 5. Opt into V3.1 semantic intent when requested outputs matter

Legacy V3 bundles remain valid unchanged.

Use V3.1 when the compiler must enforce the dashboard's audience/decision and make requested-output omissions visible. Add:

```json
{
  "contractVersion": "3.1",
  "intent": {
    "audience": "Head of Growth",
    "audienceType": "executive",
    "purpose": "Monitor subscription health",
    "primaryDecision": "Is growth healthy enough to stay on plan?",
    "refreshCadence": "daily",
    "requirements": []
  },
  "source": {},
  "decisionState": {},
  "evidence": [],
  "claims": []
}
```

`audienceType` is one of:

- `executive`;
- `operational`;
- `diagnostic`.

`refreshCadence` is one of:

- `realtime`;
- `hourly`;
- `daily`;
- `weekly`;
- `monthly`.

`intent` is compiler metadata, not a source claim. Do not add evidence anchors for the user's stated audience, purpose, decision, or requested-output list.

### 6. Compute or Defer — never substitute

Every requested output in V3.1 must appear in `intent.requirements` and resolve in exactly one of two ways.

#### Compute from an exact decision-state path

```json
{
  "id": "req_mrr",
  "label": "Current MRR",
  "kind": "single_value",
  "resolution": {
    "type": "decision_path",
    "path": "/signals/0/value"
  }
}
```

The compiler resolves the JSON Pointer mechanically. If it does not exist, planning fails with `FIX_COMPILER_INTENT`. Do not point to a nearby metric because it seems equivalent.

#### Defer explicitly

```json
{
  "id": "req_target",
  "label": "MRR versus target",
  "kind": "comparison",
  "resolution": {
    "type": "deferred",
    "blockedBy": "missing_source_fact",
    "originalSpec": "Compare current MRR with the approved target",
    "toUnblock": "Provide a source-backed MRR target"
  }
}
```

Allowed blockers:

- `missing_source_fact`;
- `ambiguous_source`;
- `unsupported_computation`;
- `unsupported_renderer`.

A deferred requirement is a valid, auditable result. Silent omission or substitution is not.

### 7. Required grounding coverage

For `composite`, ground all source-dependent scoring facts:

- score label/value/min/max/band;
- normalization and aggregation;
- each component label/value/normalized score/weight;
- each score-band label/min/max;
- score-series values when present;
- visible exception/event fields when present.

For `no_score`, ground each visible signal label/value, optional source delta/direction, source series values, and visible exception/event fields.

Do not ground deterministic renderer synthesis as if it were a source fact.

### 8. Compile through the gates

Production execution is:

```bash
node scripts/compile.js <grounded-bundle.json> <output-dir>
```

Execution order is:

```text
grounding gate
  → decision-state validation
  → V3.1 semantic planner when enabled
  → deterministic renderer
```

On legacy V3 `PASS`, the CLI writes:

- `no_score` → `output.no-score.svg` and `output.no-score.html`;
- `composite` → `output.composite.svg` and `output.composite.html`.

On V3.1 `PASS`, it writes the same SVG/HTML plus the canonical IR:

- `no_score` → `output.no-score.plan.json`;
- `composite` → `output.composite.plan.json`.

The agent never authors `plan.json` coordinates. `planner.js` owns the fixed 12-column layout and validates bounds/overlap before rendering.

On any non-`PASS` transition, the compiler exits non-zero and does not render dashboard output.

Treat `validate.js`, `planner.js`, and `render.js` as lower-level compiler/renderer tools. Do not use direct rendering as a substitute for the grounded production path.

### 9. Follow failure transitions literally

- `FIX_DECISION_STATE` → repair contract/schema errors only; do not weaken validation.
- `RETURN_TO_EVIDENCE_EXTRACTION` → re-read the source and repair evidence/claims.
- `FALLBACK_TO_NO_SCORE` → abandon composite and rebuild a grounded no-score state from available evidence.
- `FIX_COMPILER_INTENT` → repair audience/decision/requirement resolution; do not alter source evidence to make a requested quantity appear computable.
- `PASS` → render deterministically.

Do not turn a failed compiler check into an invitation to guess.

## Deterministic render-plan contract

For V3.1, `planner.js` emits a fixed three-zone 12-column plan matching the existing visual grammar:

```text
| context 3 cols | decision 6 cols | evidence 3 cols |
```

It validates:

- exact schema and contract versions;
- renderer/mode agreement;
- unique requirement ids;
- resolvable computed decision paths;
- complete deferred metadata;
- positive integer layout dimensions;
- 12-column bounds;
- no overlapping layout slots;
- center decision focal point.

Canonical serialization recursively sorts object keys while preserving requirement array order. Identical semantic input therefore produces byte-identical plan JSON.

## Visual contract

The renderer owns the visual implementation.

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
- V3.1 has exactly one primary audience, purpose, and decision;
- every V3.1 requested output is either an exact computed decision path or an explicit deferral;
- V3.1 plan validation passes with no overlap/out-of-bounds slots;
- `no_score` overall direction matches the signal directions;
- `composite` weights, weighted score, score scale, and score band pass semantic validation;
- no unsupported score/status/target/action appears;
- no framework or compiler labels leak into visible UI;
- the center is the first focal point;
- outputs contain no unresolved template tokens;
- repeated compilation of identical V3.1 input produces byte-identical plan/SVG/HTML output.
