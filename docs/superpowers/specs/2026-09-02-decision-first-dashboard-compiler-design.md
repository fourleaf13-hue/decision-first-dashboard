# Decision-First Dashboard Compiler Design

## Purpose

Evolve `decision-first-dashboard` from a prose-led dashboard redesign skill into a repeatable visual generation system that separates reasoning from rendering.

The system must convert an existing KPI-heavy dashboard into a decision-first dashboard while preserving source fidelity, preventing invented business facts, and producing a visual hierarchy that is structurally close to the repository's After reference.

## Core architecture

The canonical pipeline is:

```text
Source dashboard
    ↓
Extract verified facts
    ↓
Compile decision state JSON
    ↓
Validate against JSON Schema
    ↓
Render with deterministic template
    ↓
Visual QA / data-integrity check
    ↓
Final SVG or HTML/CSS output
```

The LLM is responsible for extraction and classification. It is not responsible for free-form page layout.

## Goals

1. Preserve the decision-first logic already developed in `SKILL.md`.
2. Eliminate recurring visual regressions such as four equal KPI cards, dominant operational tables, methodology labels, and report-like three-column layouts.
3. Prevent hallucinated scores, thresholds, targets, customer states, workflow actions, and causal claims.
4. Support both code-execution environments and chat-only environments.
5. Keep the resulting dashboard visually close to the current `after-reference.png` family without copying unsupported numbers or score logic.

## Non-goals

- Building a general-purpose dashboard design system.
- Letting the LLM generate arbitrary HTML, CSS, React, or SVG layout.
- Adding application workflows or action buttons not present in the source product.
- Creating a universal charting library in this first version.

## Rendering strategy

### Baseline renderer: deterministic SVG

SVG is the compatibility floor because it can be produced in environments without a browser or React runtime.

The SVG template owns:

- viewport and geometry;
- center/left/right proportions;
- typography scale;
- spacing;
- semantic color tokens;
- card shapes;
- line positions;
- signal-cluster positions;
- truncation behavior.

The LLM provides data only.

### Enhanced renderer: vanilla HTML/CSS

When filesystem and browser rendering are available, the same validated JSON can be rendered with HTML/CSS for improved text wrapping and higher visual fidelity.

React is intentionally excluded from the MVP to avoid build/runtime dependencies. It may be added later without changing the JSON contract.

## Decision modes

### Composite mode

Use only when the source provides a defensible composite model: normalization, weights, and threshold/status rules are supported.

Composite payload may include:

- score value;
- score band;
- score-input dimensions;
- score provenance;
- compact diagnostics;
- account exceptions;
- trend and business impact.

### No-score mode

Use when score rules are absent or incomplete.

No-score payload must physically lack score fields.

The central synthesis is generated deterministically from bounded fields such as:

- direction: `improving | deteriorating | mixed | unknown`;
- targetState: `known | unknown`;
- exceptionState: `present | none_visible | unknown`.

The renderer owns user-facing synthesis copy. For example, `direction=improving` and `targetState=unknown` renders `Improving` with `Target unknown` below it.

## Schema design principles

### Closed structure

Use `additionalProperties: false` throughout.

No free-form fields may be used for health verdicts, methodology labels, actions, or workflow descriptions.

### Provenance

Every source-visible value that may be transformed must carry provenance:

- `source` — directly supported by the source dashboard;
- `derived` — mathematically derived from supported source data using an explicit rule.

Derived values without a defined derivation rule must not render.

### Direction vs health

Directional movement and absolute health are separate concepts.

A metric may be `improving` while its target state remains `unknown`.

No-score payloads must not contain `healthy`, `good`, `marginal`, `at_risk`, `on_track`, `watch`, or `breach` as overall verdicts unless the source explicitly provides valid rules for them.

### Risk accounts

Account exceptions are available in both composite and no-score modes.

An account may contain only source-supported fields such as:

- name;
- plan;
- MRR;
- visible status;
- last-active value;
- source-supported event.

Do not provide an open-ended `riskFactor` field in the MVP. This prevents the model from inventing payment failures, renewal risks, engagement drops, or support escalations.

### Business vocabularies

Do not hardcode product-specific plan enums such as `starter | pro | business | enterprise` in a reusable skill. Plan names are bounded source strings.

Metric identifiers may use a controlled vocabulary for known common metrics, with a generic source-label fallback only when necessary.

## MVP no-score payload

Conceptual example:

```json
{
  "mode": "no_score",
  "synthesis": {
    "direction": "improving",
    "targetState": "unknown",
    "exceptionState": "present"
  },
  "signals": [
    {
      "metric": "mrr",
      "label": "MRR",
      "value": "$184,320",
      "delta": "+12.4%",
      "direction": "improving",
      "provenance": "source"
    },
    {
      "metric": "active_customers",
      "label": "Customers",
      "value": "8,942",
      "delta": "+8.1%",
      "direction": "improving",
      "provenance": "source"
    },
    {
      "metric": "churn_rate",
      "label": "Churn",
      "value": "2.84%",
      "delta": "-0.6pp",
      "direction": "improving",
      "provenance": "source"
    },
    {
      "metric": "trial_conversion",
      "label": "Trial conversion",
      "value": "31.7%",
      "delta": "+3.2%",
      "direction": "improving",
      "provenance": "source"
    }
  ],
  "exceptions": [
    {
      "name": "Dovetail",
      "plan": "Basic",
      "mrr": "$120",
      "status": "At risk",
      "provenance": "source"
    }
  ]
}
```

## MVP visual contract

For executive no-score mode, after navigation the main content follows a fixed composition:

```text
┌────────────────┬──────────────────────────────────┬───────────────────┐
│ compact context│         DOMINANT CENTER          │ compact exceptions│
│                │                                  │                   │
│ Revenue growth │ MRR growth    Customer growth   │ Accounts to watch │
│ 7-month trend  │       \          /               │ Dovetail          │
│                │        IMPROVING                 │ At risk · $120    │
│ optional diag  │      Target unknown              │                   │
│                │       /          \               │ Recent events     │
│                │ Churn dir.   Trial conversion    │                   │
└────────────────┴──────────────────────────────────┴───────────────────┘
```

Approximate geometry:

- left: 22%;
- center: 48%;
- right: 30%.

The center must be the first visual focal point.

The renderer must not expose layout controls that permit a four-card KPI strip or a full-width account table in executive mode.

## Product-native copy rules

Renderer-owned labels may include:

- Subscription health
- Revenue growth
- Accounts to watch
- Recent events
- Score trend
- Business impact

Forbidden visible methodology/report labels include:

- Executive Decision Dashboard
- Primary Decision
- Diagnostic / Diagnostic Context
- Outcome
- Actionable
- Required Interventions
- Overall State
- Key Health Metrics Context
- Driver
- Success Signal

## Validation

When code execution is available:

1. validate JSON with a shipped validator;
2. fail closed on unexpected keys or invalid enums;
3. do not render invalid JSON.

When code execution is unavailable:

1. require the agent to emit the canonical JSON first;
2. re-parse and self-check the branch, required fields, enums, and unexpected keys;
3. clearly document that self-check is weaker than executable validation.

## Visual QA

Before delivery, the renderer output must be checked for these automatic failures:

1. four equal KPI cards are the main top hierarchy;
2. an unsupported health verdict appears;
3. a large operational table dominates executive mode;
4. the center is not the strongest visual region;
5. the center is mostly prose rather than a compact synthesis;
6. framework labels appear;
7. invented action buttons appear;
8. displayed values differ from validated JSON;
9. rendered values are placed in the wrong context.

## Repository target structure

```text
skills/decision-first-dashboard/
├── SKILL.md
├── schemas/
│   └── decision-state.schema.json
├── templates/
│   ├── no-score.svg
│   ├── no-score.html
│   └── dashboard.css
├── scripts/
│   ├── validate.js
│   └── render.js
└── references/
    ├── after-reference.png
    └── visual-pattern.md

examples/saas/
├── before.png
├── after.png
├── input.no-score.json
├── output.no-score.svg
└── output.no-score.html
```

## MVP implementation sequence

1. Define and test the no-score schema using the existing SaaS Before data.
2. Build the SVG renderer and make its output structurally match the desired After family.
3. Build the HTML/CSS renderer consuming the same JSON.
4. Add validation and anti-hallucination tests.
5. Update `SKILL.md` so agents produce/validate JSON and choose the available renderer instead of directly designing the page.
6. Only after the no-score path passes, add the composite branch.

## Acceptance criteria

The MVP is accepted only when the existing SaaS Before example can be converted through the deterministic pipeline and the output satisfies all of the following:

- no invented score, target, health verdict, customer event, workflow, or action;
- no four-card KPI strip as the primary hierarchy;
- no full-width customer table dominating the page;
- dominant central synthesis with 3–6 attached signals;
- compact supporting context on the left;
- compact confirmed exceptions/events on the right;
- output uses only validated JSON values;
- SVG and HTML outputs consume the same canonical JSON;
- visual result is structurally closer to the existing After reference than to the original admin dashboard.
