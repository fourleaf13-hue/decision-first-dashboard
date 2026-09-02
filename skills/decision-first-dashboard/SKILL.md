---
name: decision-first-dashboard
description: Use when redesigning KPI-heavy dashboards where users must scan multiple independent metrics before understanding overall status, the main risk, whether performance is good enough, or what requires action.
---

# Decision-First Dashboard

## Core principle

Separate reasoning from rendering. The agent identifies verified decision evidence; deterministic templates own the visual hierarchy.

**Source dashboard → verified facts → decision-state JSON → validate → render**

Never let the rendering step invent business meaning or choose a generic dashboard layout.

## Workflow

### 1. Extract verified facts only

Identify the primary user and decision, then capture only source-supported metrics, deltas, account states, events, targets, thresholds, and score rules.

Never invent scores, targets, thresholds, customer states, events, workflows, actions, or causal claims. Direction is not the same as health.

### 2. Choose the evidence mode

The compiler supports two mutually exclusive modes.

Use `composite` only when the source already provides **all** of the following:

- an overall score and score scale;
- normalized component scores;
- component weights;
- a weighted-average aggregation rule;
- complete score bands / thresholds that determine the displayed status.

Composite v1 accepts only:

- `normalization: "source_provided"`;
- `aggregation: "weighted_average"`;
- source-provided score, component, weight, band, exception, event, and trend facts.

Do not infer normalization formulas, weights, thresholds, or bands. If any required composite-model fact is missing or cannot be defended from the source, use `no_score` instead.

For `no_score` executive dashboards, do not create `Healthy`, `Marginal`, `At risk`, or a 0–100 score. The compiler derives overall direction from the individual signal directions.

### 3. Build the contract, not the layout

Create JSON that matches:

`schemas/decision-state.schema.json`

The root contract is closed and accepts exactly one of `no_score` or `composite`.

For `no_score`:

- do not supply an overall `direction` field;
- 3–6 signals carry value, delta, direction, and provenance;
- numeric context series are optional and require `provenance: "source"`;
- visible account exceptions and events require source provenance;
- score/model fields are structurally invalid;
- unsupported keys fail validation.

For `composite`:

- `score` must include source label, value, min, max, band, and provenance;
- `model.components` contains 3–6 source-provided normalized scores and weights;
- component weights must sum to 1;
- the score must equal the weighted average of normalized component scores within compiler tolerance;
- source-provided bands must be contiguous, non-overlapping, and cover the full score scale;
- the displayed band must match the band selected by the score value;
- optional score trend data requires source provenance;
- unsupported normalization or aggregation methods fail validation.

Validation failure is never repaired by inventing missing score-model facts. Fall back to `no_score` or request the missing source evidence.

### 4. Validate before rendering

When code execution is available, validation is mandatory:

```bash
node scripts/validate.js <decision-state.json>
```

Do not render invalid JSON. Fix the evidence payload instead of weakening the schema.

### 5. Render deterministically

For either supported mode:

```bash
node scripts/render.js <decision-state.json> <output-dir>
```

The CLI writes mode-specific outputs:

- `no_score` → `output.no-score.svg` and `output.no-score.html`;
- `composite` → `output.composite.svg` and `output.composite.html`.

Both SVG and HTML/CSS consume the same validated JSON. Do not rewrite the templates, add KPI grids, tables, banners, buttons, or extra business copy unless the user explicitly asks to change the design system itself.

If execution is unavailable, preserve the same contract: populate the schema and use the supplied template structure literally. Do not fall back to free-form image generation. If the template cannot be rendered, return the validated/self-checked JSON rather than inventing a different dashboard.

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

- every displayed fact traces to source data or a deterministic derivation allowed by the contract;
- `no_score` overall direction matches the signal directions;
- `composite` weights, weighted score, score scale, and score band pass semantic validation;
- no unsupported score/status/target/action appears;
- no framework or compiler labels leak into visible UI;
- the center is the first focal point;
- outputs contain no unresolved template tokens.