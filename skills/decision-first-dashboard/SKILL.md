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

Use a composite only when normalization, weights, thresholds, and status rules are already defensible from the source.

Otherwise use `no_score`. For no-score executive dashboards, do not create `Healthy`, `Marginal`, `At risk`, or a 0–100 score. The compiler derives overall direction from the individual signal directions.

### 3. Build the contract, not the layout

For `no_score`, create JSON that matches:

`schemas/decision-state.schema.json`

Important constraints:

- do not supply an overall `direction` field;
- 3–6 signals carry value, delta, direction, and provenance;
- numeric context series are optional and require `provenance: "source"`;
- visible account exceptions and events require source provenance;
- unsupported keys fail validation.

### 4. Validate before rendering

When code execution is available, validation is mandatory:

```bash
node scripts/validate.js <decision-state.json>
```

Do not render invalid JSON. Fix the evidence payload instead of weakening the schema.

### 5. Render deterministically

For the supported no-score executive mode:

```bash
node scripts/render.js <decision-state.json> <output-dir>
```

This produces deterministic SVG and HTML/CSS from the same JSON. Do not rewrite the templates, add KPI grids, tables, banners, buttons, or extra business copy unless the user explicitly asks to change the design system itself.

If execution is unavailable, preserve the same contract: populate the schema and use the supplied template structure literally. Do not fall back to free-form image generation. If the template cannot be rendered, return the validated/self-checked JSON rather than inventing a different dashboard.

## Visual contract

The no-score renderer owns the layout:

- dominant center synthesis;
- 3–6 signals converging on the center;
- compact left business context;
- compact right exceptions/events;
- no four-card KPI strip;
- no dominant full-width customer table;
- product-native labels only;
- restrained color and generous whitespace.

See `references/visual-pattern.md`.

## Hard stops

Safety, compliance, security, regulatory, contractual, or outage conditions override ordinary synthesis. Never average them into a reassuring status. Do not force a hard-stop case through the current SaaS no-score renderer.

## Final gate

Before delivery, verify:

- every displayed fact traces to source data or a deterministic derivation allowed by the contract;
- overall direction matches the signal directions;
- no unsupported score/status/target/action appears;
- no framework labels leak into the UI;
- the center is the first focal point;
- outputs contain no unresolved template tokens.
