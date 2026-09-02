# Decision-First Dashboard Composite Mode Design

## Purpose

Add the deferred composite branch to the existing deterministic dashboard compiler without weakening the no-score anti-hallucination guarantees.

## Scope

Composite v1 is intentionally narrow. It is valid only when the source explicitly provides:

- an overall composite score and scale;
- source-provided normalized component scores;
- source-provided component weights;
- a weighted-average aggregation rule;
- complete source-provided score bands / thresholds.

If any of these are unavailable, the agent must use `no_score` instead.

Composite v1 does not derive normalization rules from raw metrics, does not infer weights, and does not invent score bands.

## Contract

A composite decision state has this shape:

```json
{
  "mode": "composite",
  "score": {
    "label": "Subscription health",
    "value": 68,
    "min": 0,
    "max": 100,
    "band": "At risk",
    "provenance": "source"
  },
  "model": {
    "normalization": "source_provided",
    "aggregation": "weighted_average",
    "provenance": "source",
    "components": [
      {
        "metric": "retention",
        "label": "Retention",
        "value": "96.8%",
        "normalizedScore": 60,
        "weight": 0.4,
        "provenance": "source"
      },
      {
        "metric": "growth",
        "label": "Growth",
        "value": "+12.4%",
        "normalizedScore": 80,
        "weight": 0.3,
        "provenance": "source"
      },
      {
        "metric": "conversion",
        "label": "Conversion",
        "value": "31.7%",
        "normalizedScore": 66.6667,
        "weight": 0.3,
        "provenance": "source"
      }
    ],
    "bands": [
      { "label": "At risk", "min": 0, "max": 70, "provenance": "source" },
      { "label": "Watch", "min": 70, "max": 85, "provenance": "source" },
      { "label": "Healthy", "min": 85, "max": 100, "provenance": "source" }
    ]
  },
  "context": {
    "scoreSeries": [61, 63, 64, 66, 67, 68],
    "provenance": "source"
  },
  "exceptions": [],
  "events": []
}
```

The existing source-only exception/event structures remain reusable.

## Schema rules

The root schema becomes a closed `oneOf` contract with two mutually exclusive states:

- `noScoreState` — existing behavior, physically rejects `score` and `model`;
- `compositeState` — requires `score` and `model` and does not accept no-score-only synthesis fields.

Composite v1 requires 3–6 model components and 2–8 score bands.

All source-visible or model-defining facts carry `provenance: "source"` in composite v1. Derived normalization is deferred.

## Semantic validation

Schema validation remains closed with `additionalProperties: false`. Composite mode adds semantic checks that JSON Schema alone does not express cleanly in the current lightweight validator:

1. `score.min < score.max` and `score.value` lies within the scale.
2. Every component `normalizedScore` lies within the same scale.
3. Every weight is greater than 0 and no greater than 1.
4. Component weights sum to 1 within `1e-6`.
5. `score.value` equals the weighted average of component normalized scores within `0.01`.
6. Bands are ordered by `min`, contiguous, gap-free, non-overlapping, cover the full score scale, and each has `min < max`.
7. Score-band selection is half-open `[min,max)` except the final band, which includes `max`.
8. `score.band` must equal the band selected by the score value.
9. Composite v1 rejects non-weighted aggregation and non-source-provided normalization.

Validation failure never triggers automatic score-model repair. The caller must provide source-supported model facts or use `no_score`.

## Rendering

The renderer continues to own page layout. Composite mode uses fixed `composite.svg` and `composite.html` templates plus the shared visual tokens in `dashboard.css`.

Executive composition:

```text
compact score context | dominant composite score | compact exceptions/events
```

### Center

- source score label;
- dominant score value and scale;
- source band;
- 3–6 weighted component nodes converging on the score;
- each component shows normalized score and weight;
- no compiler/framework labels.

### Left

- `Score trend` when a source-supported `scoreSeries` is present;
- compact `Score composition` list showing component label, normalized score, and weight.

### Right

- source-supported `Accounts to watch`;
- source-supported `Recent events`.

The center remains the first focal point. The composite renderer must not expose controls that permit KPI-card strips, dominant tables, arbitrary charts, or arbitrary layout changes.

## Product-native copy

Allowed renderer-owned labels include:

- Score trend
- Score composition
- Accounts to watch
- Recent events

Forbidden rendered labels include:

- Composite mode
- Weighted average
- Aggregation
- Normalization
- Decision
- Driver
- Diagnostic
- Framework
- Compiler

## Rendering API

The existing public functions remain unchanged:

```js
export function renderSvg(data) { return string; }
export function renderHtml(data) { return string; }
```

They dispatch by validated `data.mode`.

## Compatibility

Existing no-score fixtures and outputs must remain byte-for-byte stable unless a change is explicitly required by a regression fix.

Existing CLI behavior remains:

```bash
node scripts/validate.js <decision-state.json>
node scripts/render.js <decision-state.json> <output-dir>
```

The renderer writes filenames by mode:

- `output.no-score.svg` / `output.no-score.html`;
- `output.composite.svg` / `output.composite.html`.

## Testing

Add regression tests for:

- valid composite payload;
- missing weights or thresholds;
- weights not summing to 1;
- weighted score mismatch;
- band mismatch, gaps, and overlaps;
- component scores outside the scale;
- no-score payload still rejecting score/model fields;
- deterministic SVG composite rendering;
- deterministic HTML composite rendering;
- absence of methodology/compiler labels in both renderers;
- unchanged no-score tests.

GitHub Actions must run the full compiler suite on `main`, `feature/dashboard-compiler-mvp`, and `feature/composite-mode-compiler`.
