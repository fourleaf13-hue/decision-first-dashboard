# Decision-First Dashboard

Turn KPI-heavy dashboards into decision-first dashboards without letting the agent invent the visual hierarchy.

Most dashboard prompts ask an LLM to **design**. This project treats dashboard redesign more like a small compiler:

```text
source dashboard / verified source file + user context
      ↓
adaptive Decision Brief (1–5 questions unless Decision + Action are already explicit)
      ↓
agent extraction + Metric Router + mode proposal
      ↓
grounded evidence bundle
      ↓
grounding + decision-state validation
      ↓
deterministic renderer
      ↓
SVG / HTML dashboard
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

Decision-First Dashboard changes the information hierarchy first. The agent clarifies the decision context, extracts evidence, and routes metrics; the compiler verifies that the evidence can be mechanically grounded back to source bytes before the deterministic renderer owns the layout.

## Adaptive Decision Brief

Users often know they need a dashboard without knowing which metrics, thresholds, drilldowns, or charts they actually need. Before metric routing, the skill builds an **adaptive Decision Brief** with the minimum context necessary to make a defensible design decision.

The interaction is deliberately lightweight:

- ask **one question at a time**;
- ask **no more than five questions**;
- stop early as soon as the confirmed information is sufficient;
- do not ask the user to repeat source facts already visible or extractable from the request/data;
- treat Decision, Action, Exception, Diagnosis, and Audience/cadence as a question pool rather than a fixed questionnaire.

A critical distinction is enforced: **source facts are not business intent**. A screenshot, uploaded dataset, dashboard title, visible KPI mix, or domain pattern can suggest what the dashboard might be for, but cannot silently establish what the user actually wants to decide. Unless the user has already explicitly supplied both the **Decision** and the **Action**, the skill must ask **at least one question** and get confirmation before routing metrics or rendering.

An inferred intent is only a candidate. The skill can turn that candidate into a short multiple-choice question, but it cannot count the inference itself as a completed Decision Brief.

If the user cannot answer an open question, the skill first reduces it to 2–4 concrete choices. If the user is still unsure, it can infer the most defensible direction from the uploaded data and ask for confirmation. It never invents a business threshold merely to complete the brief.

Both intake orders are supported:

- **data-first** — profile uploaded fields, metrics, dimensions, time range, targets, and benchmarks first, then ask only for missing decision context; profiling does not waive intent confirmation;
- **question-first** — clarify the decision context first, then request only the data needed to support that decision and its diagnosis path.

The zero-question path is intentionally narrow: it applies only when the user's request or already-established conversation context explicitly states both what the dashboard should help decide and what action/prioritization changes based on that decision.

The Decision Brief guides the Metric Router and information hierarchy, but it does not weaken source grounding. User intent or inferred needs do not become source evidence unless they are independently supported by the source and allowed by the decision-state contract.

## Metric Router

A source can contain many valid metrics without needing to display them all as peers. The canonical **70-KPI overload** case is routed before rendering using the **Action Trigger Test**: if a metric changes materially, what decision or action changes?

Each metric is classified as `primary_signal`, `diagnostic`, `exception`, `drilldown`, or `scorecard_only`. The first view keeps only the minimum sufficient decision signals plus active exceptions; explanatory, investigative, and completeness metrics stay available in the source/extraction inventory rather than competing for equal visual weight.

> **Preserve everything without showing everything.**

The router is a Layer 1 classification step. It does not weaken the closed grounded-bundle contract or add hidden, unused evidence to the compiler input.

## Two strict evidence modes

The compiler supports two mutually exclusive modes after routing.

### No-score mode — no unsupported score invented

Use compiler mode `no_score` when the source does not provide a defensible composite model.

For executive no-score cases, the rendered structure is deliberately constrained:

```text
WHY / CONTEXT  →  DOMINANT SYNTHESIS  ←  WHO / EVENTS
```

The output does **not** invent a Health Score. Overall direction is derived deterministically from source-supported signal directions.

The image below is retained as a guardrail example: it demonstrates that the renderer can preserve decision hierarchy without fabricating a score. It is **not the ceiling or final expression of no-score capability**. With the current radar grounding rules, a no-score dashboard may also render a true closed 3–6 dimension radar profile when every peer dimension has a source-grounded normalized score on one source-grounded shared scale. Heterogeneous raw KPIs remain non-radar.

<table>
  <tr>
    <th width="50%">Before</th>
    <th width="50%">No-score mode — no unsupported score invented</th>
  </tr>
  <tr>
    <td width="50%"><img src="examples/saas/before.png" width="100%"></td>
    <td width="50%"><img src="examples/saas/output.no-score.svg" width="100%"></td>
  </tr>
</table>

### Composite mode — when the evidence supports it

Use compiler mode `composite` only when the source already provides a complete, defensible score model.

Composite v1 requires all of the following:

- an overall score and score scale;
- source-provided normalized component scores;
- source-provided component weights;
- a weighted-average aggregation rule;
- complete source-provided score bands / thresholds.

The validator checks that weights sum to 1, the displayed score matches the weighted average, component scores stay inside the declared scale, score bands are contiguous and cover the full scale, and the displayed band matches the score.

If any required model fact is missing, the correct fallback is `no_score` — not an inferred formula, guessed weight, or fabricated threshold.

The composite image below is the uploaded visual reference for the intended dominant-score composition. It illustrates the visual capability only; it is **not** evidence that the canonical SaaS source fixture contains a real composite model. A production composite output is allowed only when its score, scale, normalized components, weights, aggregation rule, and score bands are mechanically grounded.

<img src="examples/saas/composite-mode.png" width="760">

The original `examples/saas/after.png` is retained. `examples/saas/composite-mode.png` is the explicit README reference for this evidence-supported composite capability.

The repository's composite JSON fixture lives under `tests/compiler/fixtures/` and is synthetic contract data used only for automated validation and rendering tests.

## V3 evidence grounding

V3 adds a hard grounding layer in front of the existing `no_score` / `composite` compiler. A source claim is no longer accepted merely because an agent writes `provenance: "source"`.

The production input is a **grounded bundle** containing:

- a source file path, source kind, and SHA-256;
- the closed `decisionState`;
- an evidence ledger;
- claim references from exact decision-state JSON Pointer paths to evidence IDs.

The compiler supports mechanically verifiable JSON Pointer grounding and exact text-span grounding. Composite scoring facts must all be grounded. Any missing or mismatched composite scoring evidence returns `FALLBACK_TO_NO_SCORE` and produces no composite dashboard.

Machine-readable transitions are:

```text
PASS
RETURN_TO_EVIDENCE_EXTRACTION
FALLBACK_TO_NO_SCORE
FIX_DECISION_STATE
```

Image-only/bounding-box claims are not treated as strong composite evidence in V3 because the repository does not currently ship a deterministic OCR/token extractor. Screenshot workflows should first create a verifiable text/JSON sidecar.

## Install

```bash
npx skills add fourleaf13-hue/decision-first-dashboard
```

The skill directory contains its own schema, validator, templates, and renderer. Runtime validation has no third-party dependency.

## Use

Give the agent a dashboard screenshot, Figma frame, existing dashboard code, or verified metrics and ask:

> Redesign this dashboard using the `decision-first-dashboard` skill. Preserve source evidence and produce the deterministic decision-first output.

The intended production execution path is:

1. Build the adaptive Decision Brief. If data already exists, profile it first. If Decision + Action are not already explicit, ask at least one short confirmation question; ask no more than five and stop as soon as the confirmed decision context is sufficient.
2. Extract verified facts only.
3. Route metrics with the Metric Router and Action Trigger Test.
4. Decide whether the evidence supports `no_score` or strict `composite` mode.
5. Build a closed `decisionState` from the minimum sufficient visible signals and source-supported exceptions.
6. Build the source hash, evidence ledger, and claim references in a grounded bundle.
7. Run the grounding compiler gate.
8. Render SVG and HTML only after `PASS`.
9. Inspect the output for evidence and visual integrity.

From the skill directory:

```bash
node scripts/compile.js path/to/grounded-bundle.json path/to/output-directory
```

`validate.js` and `render.js` remain lower-level Layer 2 / Layer 3 tools for tests and internal compiler use; V3 agent workflows should not bypass `compile.js`.

The renderer writes mode-specific filenames:

```text
no_score   → output.no-score.svg / output.no-score.html
composite  → output.composite.svg / output.composite.html
```

## Anti-hallucination contract

Both contracts are closed: `grounded-bundle.schema.json` constrains source/evidence/claim structure, and `decision-state.schema.json` constrains mutually exclusive `no_score` and `composite` states.

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

The composite branch accepts only source-supported score-model facts. It rejects, among other cases:

- missing component weights;
- weights that do not sum to 1;
- a score that does not equal the weighted average;
- component scores outside the declared score scale;
- score-band gaps or overlaps;
- a displayed status that does not match the source thresholds;
- unsupported normalization or aggregation methods.

Composite validation failure is never repaired by inventing the missing model.

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
- when all 3–6 peer dimensions have source-grounded normalized scores on one source-grounded shared scale, a true closed radar profile is permitted;
- compact left business context;
- compact right account exceptions and events.

### Composite composition

- one dominant center source-supported score and band;
- 3–6 normalized weighted score components form a true closed radar profile;
- compact left score trend and score composition;
- compact right account exceptions and events.

### Shared constraints

- no four-equal-KPI top row;
- no dominant full-width customer table;
- no invented action buttons;
- no compiler/framework labels in visible UI;
- restrained SaaS visual styling.

SVG is the compatibility baseline. HTML/CSS is the higher-fidelity output. Both consume the same validated JSON.

## Repository structure

```text
decision-first-dashboard/
├── README.md
├── LICENSE
├── package.json
├── examples/
│   └── saas/
│       ├── before.png
│       ├── after.png
│       ├── composite-mode.png
│       ├── input.no-score.json
│       ├── output.no-score.svg
│       ├── output.no-score.html
│       └── reasoning.md
├── skills/
│   └── decision-first-dashboard/
│       ├── SKILL.md
│       ├── schemas/
│       │   ├── grounded-bundle.schema.json
│       │   └── decision-state.schema.json
│       ├── scripts/
│       │   ├── grounding.js
│       │   ├── compile.js
│       │   ├── validate.js
│       │   └── render.js
│       ├── templates/
│       │   ├── no-score.svg
│       │   ├── no-score.html
│       │   ├── composite.svg
│       │   ├── composite.html
│       │   └── dashboard.css
│       └── references/
│           ├── visual-pattern.md
│           └── after-reference.png
└── tests/
    ├── compiler/
    │   ├── fixtures/
    │   │   ├── composite.valid.json
    │   │   └── grounding/
    │   ├── golden/
    │   ├── grounding.test.js
    │   ├── compile-cli.test.js
    │   ├── decision-brief-intake-contract.test.js
    │   ├── golden-snapshot.test.js
    │   ├── metric-router-contract.test.js
    │   ├── schema.test.js
    │   ├── composite-schema.test.js
    │   ├── render-svg.test.js
    │   ├── render-html.test.js
    │   ├── render-composite-svg.test.js
    │   ├── render-composite-html.test.js
    │   └── render-cli.test.js
    ├── saas.md
    ├── saas-no-score.md
    ├── visual-output.md
    ├── evidence-scope.md
    ├── ecommerce.md
    └── operations.md
```

## Development

```bash
npm test
npm run validate:saas
npm run render:saas
```

GitHub Actions runs the complete compiler test suite, including the Decision Brief intake contract, grounded composite/no-score compilation, and byte-level golden snapshots, then renders the canonical SaaS and SaaSGrid fixtures and uploads generated artifacts for visual QA.

## What this is not

This is not a generic chart library and not a prompt that asks the model to freestyle a prettier admin dashboard.

The project separates three responsibilities:

- **Layer 1 / Agent:** adaptive Decision Brief, evidence extraction, Metric Router classification, and mode proposal.
- **Layer 2 / Compiler contract:** source grounding, claim coverage, schema/semantic validation, and machine-readable retry/fallback decisions.
- **Layer 3 / Renderer:** deterministic SVG/HTML composition only.

That separation is what makes the output repeatable across agents while making source support auditable.

## License

MIT
