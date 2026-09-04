# Decision-First Dashboard

Turn KPI-heavy dashboards into decision-first dashboards without letting the agent invent the visual hierarchy or silently replace missing metrics.

Most dashboard prompts ask an LLM to **design**. This project treats dashboard redesign more like a small compiler:

```text
source dashboard / verified source file
      ↓
agent extraction + decision intent
      ↓
grounded evidence bundle
      ↓
grounding + decision-state validation
      ↓
V3.1 semantic planner (opt-in)
      ↓
deterministic renderer
      ↓
SVG / HTML dashboard + canonical plan JSON
```

> **Many metrics → minimum sufficient decision signals → diagnosis → action**

## Why this exists

A conventional dashboard often looks like:

```text
KPI   KPI   KPI   KPI

Chart             Activity

Table
```

The user still has to scan everything and construct the conclusion mentally.

Decision-First Dashboard changes the information hierarchy first. The agent extracts evidence and states the decision intent; the compiler verifies source support and semantic requirements; deterministic code owns the layout and rendering.

## Three-layer architecture

### Layer 1 — Agent judgment

The agent is allowed to:

- extract literal source facts;
- identify one primary audience, one purpose, and one primary decision;
- propose `no_score` or `composite` mode;
- list requested outputs;
- create evidence anchors and claim references.

The agent is **not** allowed to invent score-model evidence, bypass grounding, author free-form layout coordinates, or substitute a nearby metric for a requested one.

### Layer 2 — Compiler contract

The compiler owns:

- the closed grounded-bundle contract;
- the closed decision-state contract;
- SHA-256 source verification;
- evidence and claim integrity;
- exact JSON Pointer / text-span grounding;
- composite score mathematics;
- V3.1 semantic intent;
- Compute-or-Defer requirement resolution;
- deterministic render-plan validation.

### Layer 3 — Deterministic renderer

The renderer consumes validated decision state and fills fixed SVG/HTML templates. It does not inspect source data or invent business meaning.

## Two strict evidence modes

### 1. `no_score`

Use this when the source does not provide a defensible composite model.

For executive no-score cases, the rendered structure is deliberately constrained:

```text
WHY / CONTEXT  →  DOMINANT SYNTHESIS  ←  WHO / EVENTS
```

The output does **not** invent a Health Score. Overall direction is derived deterministically from source-supported signal directions.

<table>
  <tr>
    <th width="50%">Before</th>
    <th width="50%">Deterministic no-score output</th>
  </tr>
  <tr>
    <td width="50%"><img src="examples/saas/before.png" width="100%"></td>
    <td width="50%"><img src="examples/saas/output.no-score.svg" width="100%"></td>
  </tr>
</table>

### 2. `composite`

Use this only when the source already provides a complete, defensible score model.

Composite requires all of the following:

- an overall score and score scale;
- source-provided normalized component scores;
- source-provided component weights;
- a weighted-average aggregation rule;
- complete source-provided score bands / thresholds.

The validator checks that weights sum to 1, the displayed score matches the weighted average, component scores stay inside the declared scale, score bands are contiguous and cover the full scale, and the displayed band matches the score.

If any required model fact is missing, the correct fallback is `no_score` — not an inferred formula, guessed weight, or fabricated threshold.

<img src="examples/saas/after.png" width="760">

The repository's composite JSON fixture is synthetic contract data used for automated validation and rendering tests.

## V3 evidence grounding

V3 adds a hard grounding layer in front of the existing `no_score` / `composite` compiler. A source claim is not accepted merely because an agent writes `provenance: "source"`.

The production input is a **grounded bundle** containing:

- source file path, source kind, and SHA-256;
- the closed `decisionState`;
- an evidence ledger;
- claim references from exact decision-state JSON Pointer paths to evidence IDs.

The compiler supports mechanically verifiable JSON Pointer grounding and exact text-span grounding. Composite scoring facts must all be grounded. Any missing or mismatched composite scoring evidence returns `FALLBACK_TO_NO_SCORE` and produces no composite dashboard.

Grounding transitions are:

```text
PASS
RETURN_TO_EVIDENCE_EXTRACTION
FALLBACK_TO_NO_SCORE
FIX_DECISION_STATE
```

Image-only/bounding-box claims are not treated as strong composite evidence because the repository does not ship a deterministic OCR/token extractor. Screenshot workflows should first create a verifiable text/JSON sidecar.

## V3.1 semantic planner

V3.1 is an **opt-in extension**. Existing V3 grounded bundles compile unchanged.

Enable it with:

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

### One Dashboard, One Audience, One Purpose

V3.1 makes decision intent part of the compiler input. A dashboard has one primary audience, one purpose, and one primary decision.

If executives, operators, analysts, engineers, or other groups need materially different answers or time horizons, split them before compilation instead of adding more panels to one screen.

Supported audience types:

```text
executive
operational
diagnostic
```

Supported refresh cadences:

```text
realtime
hourly
daily
weekly
monthly
```

### Compute or Defer

Every requested output must be explicit in `intent.requirements`.

If it can be computed from the validated `decisionState`, point to the exact value:

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

If it cannot be computed, defer it explicitly:

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

The compiler never substitutes another metric for the requested quantity. A nonexistent `decision_path` stops compilation with:

```text
stage: planning
transition: FIX_COMPILER_INTENT
```

Allowed deferral reasons are:

- `missing_source_fact`;
- `ambiguous_source`;
- `unsupported_computation`;
- `unsupported_renderer`.

### Deterministic render-plan IR

After grounding and semantic validation pass, V3.1 emits a canonical intermediate representation before rendering.

The layout is compiler-owned:

```text
12-column grid

| context 3 cols | decision 6 cols | evidence 3 cols |
```

The agent supplies semantic priority, not coordinates.

The planner validates:

- exact contract versions;
- unique requirement IDs;
- exact computed JSON Pointers;
- complete deferral metadata;
- renderer/mode agreement;
- positive integer dimensions;
- 12-column bounds;
- no overlapping slots;
- center decision focal point.

Object keys are canonically sorted while array order is preserved, so identical semantic input produces byte-identical plan JSON.

## Install

```bash
npx skills add fourleaf13-hue/decision-first-dashboard
```

The skill directory contains its schema, grounding gate, semantic planner, validator, templates, and renderer. Runtime validation has no third-party dependency.

## Use

Give the agent a dashboard screenshot, Figma frame, existing dashboard code, or verified metrics and ask:

> Redesign this dashboard using the `decision-first-dashboard` skill. Preserve source evidence and produce the deterministic decision-first output.

The production execution path is:

1. Identify one audience, one purpose, and one primary decision.
2. Extract verified facts only.
3. Decide whether evidence supports `no_score` or strict `composite` mode.
4. Build a closed `decisionState`.
5. Build source hash, evidence ledger, and claims in a grounded bundle.
6. For V3.1, enumerate every requested output as exact Compute-or-Defer requirements.
7. Run `compile.js`.
8. Render only after grounding and planning gates pass.
9. Inspect output for evidence, semantic, and visual integrity.

From the skill directory:

```bash
node scripts/compile.js path/to/grounded-bundle.json path/to/output-directory
```

Legacy V3 output:

```text
no_score   → output.no-score.svg / output.no-score.html
composite  → output.composite.svg / output.composite.html
```

V3.1 additionally emits:

```text
no_score   → output.no-score.plan.json
composite  → output.composite.plan.json
```

`validate.js`, `planner.js`, and `render.js` remain lower-level compiler/renderer tools. Production agent workflows should not bypass `compile.js`.

## Anti-hallucination contract

Both data contracts are closed: `grounded-bundle.schema.json` constrains source/evidence/claim structure and optional V3.1 semantic intent; `decision-state.schema.json` constrains mutually exclusive `no_score` and `composite` states.

### No-score safeguards

The no-score branch rejects unsupported fields such as:

- invented `score` / health score;
- caller-supplied overall direction;
- invented target or goal fields;
- renewal/workflow/action/assignee fields;
- derived account exceptions or events presented as source facts;
- composite model fields.

Numeric trend series are optional. If exact source-supported points are unavailable, the renderer says `Trend data unavailable` instead of drawing a plausible-looking line.

### Composite safeguards

The composite branch rejects, among other cases:

- missing component weights;
- weights that do not sum to 1;
- a score that does not equal the weighted average;
- component scores outside the declared score scale;
- score-band gaps or overlaps;
- a displayed status that does not match source thresholds;
- unsupported normalization or aggregation methods.

Composite validation failure is never repaired by inventing the missing model.

### Semantic safeguards

The V3.1 planner rejects or explicitly defers:

- missing requested quantities;
- duplicate requirement identities;
- unresolved decision-state paths;
- unsupported computations;
- ambiguous source interpretations;
- unsupported renderer requests.

It never silently swaps in an easier quantity.

## Direction is not health

In `no_score`, the agent does not provide `IMPROVING`, `MIXED`, or `DETERIORATING` as a top-level verdict. The renderer derives it from validated signal directions:

```text
all improving             → IMPROVING
improving + deteriorating → MIXED
all deteriorating         → DETERIORATING
flat only                 → FLAT
no known direction        → UNKNOWN
```

> `Improving` does not mean `Healthy`.

If targets or healthy ranges are unknown, the no-score UI says `Target unknown` rather than inventing adequacy.

## Deterministic visual contract

Both rendering branches use fixed templates and the same shared visual system.

### No-score composition

- one dominant center directional synthesis area;
- 3–6 signals converging on the center;
- compact left business context;
- compact right account exceptions and events.

### Composite composition

- one dominant center source-supported score and band;
- 3–6 weighted score components converging on the center;
- compact left score trend and score composition;
- compact right account exceptions and events.

### Shared constraints

- no four-equal-KPI top row;
- no dominant full-width customer table;
- no invented action buttons;
- no compiler/framework labels in visible UI;
- restrained visual styling.

SVG is the compatibility baseline. HTML/CSS is the higher-fidelity output. Both consume the same validated JSON.

## Repository structure

```text
decision-first-dashboard/
├── README.md
├── LICENSE
├── package.json
├── examples/
│   └── saas/
├── skills/
│   └── decision-first-dashboard/
│       ├── SKILL.md
│       ├── schemas/
│       │   ├── grounded-bundle.schema.json
│       │   └── decision-state.schema.json
│       ├── scripts/
│       │   ├── grounding.js
│       │   ├── compile.js
│       │   ├── planner.js
│       │   ├── validate.js
│       │   └── render.js
│       ├── templates/
│       └── references/
└── tests/
    └── compiler/
        ├── fixtures/
        ├── golden/
        ├── semantic-planner.test.js
        ├── grounding.test.js
        ├── compile-cli.test.js
        ├── golden-snapshot.test.js
        └── render-*.test.js
```

## Development

```bash
npm test
npm run validate:saas
npm run render:saas
```

GitHub Actions runs the compiler suite, grounded composite/no-score compilation, byte-level golden snapshots, and a V3.1 determinism check. The same V3.1 input is compiled twice and `plan.json`, SVG, and HTML must be byte-identical before the workflow succeeds. Generated artifacts are uploaded for visual QA.

## What this is not

This is not a generic chart library and not a prompt that asks the model to freestyle a prettier admin dashboard.

It is a constrained dashboard compiler where:

- **Layer 1 / Agent** owns evidence extraction and decision intent;
- **Layer 2 / Compiler** owns grounding, semantic contracts, Compute-or-Defer, deterministic plan assembly, and validation;
- **Layer 3 / Renderer** owns deterministic SVG/HTML composition only.

That separation makes source support auditable and output reproducible across agents.

## License

MIT
