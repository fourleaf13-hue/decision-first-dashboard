# Decision-First Dashboard

Turn KPI-heavy dashboards into decision-first dashboards without letting the agent invent the visual hierarchy.

Most dashboard prompts ask an LLM to **design**. This project treats dashboard redesign more like a small compiler:

```text
source dashboard
      ↓
verified facts
      ↓
decision-state JSON
      ↓
schema validation
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

Decision-First Dashboard changes the information hierarchy first. For executive no-score cases, the rendered structure is deliberately constrained:

```text
WHY / CONTEXT  →  DOMINANT SYNTHESIS  ←  WHO / EVENTS
```

The LLM extracts evidence. The renderer controls the layout.

## Before → deterministic no-score output

<table>
  <tr>
    <th width="50%">Before</th>
    <th width="50%">Compiler output</th>
  </tr>
  <tr>
    <td width="50%"><img src="examples/saas/before.png" width="100%"></td>
    <td width="50%"><img src="examples/saas/output.no-score.svg" width="100%"></td>
  </tr>
</table>

The no-score output does **not** invent a Health Score. Its overall direction is derived deterministically from the source-supported signal directions.

## Composite reference

When a real score model exists, a dominant composite can be appropriate. The repository also includes a composite visual reference:

<img src="examples/saas/after.png" width="760">

A composite is valid only when normalization, weights, thresholds, and status rules are defensible. The current compiler MVP implements the deterministic **no-score executive** branch; it will not fabricate a score just to imitate the composite reference.

## Install

```bash
npx skills add fourleaf13-hue/decision-first-dashboard
```

The skill directory contains its own schema, validator, templates, and renderer. Runtime validation has no third-party dependency.

## Use

Give the agent a dashboard screenshot, Figma frame, existing dashboard code, or verified metrics and ask:

> Redesign this dashboard using the `decision-first-dashboard` skill. Preserve source evidence and produce the deterministic decision-first output.

The intended execution path is:

1. Extract verified facts only.
2. Build `decision-state.json` matching the bundled schema.
3. Validate it.
4. Render SVG and HTML from the same JSON.
5. Inspect the output for evidence and visual integrity.

From the skill directory:

```bash
node scripts/validate.js path/to/decision-state.json
node scripts/render.js path/to/decision-state.json path/to/output-directory
```

## Anti-hallucination contract

The no-score schema intentionally makes common dashboard hallucinations structurally invalid.

It rejects unsupported fields such as:

- invented `score` / health score;
- caller-supplied overall direction;
- invented target or goal fields;
- renewal/workflow/action/assignee fields;
- derived account exceptions or events presented as source facts.

Numeric trend series are optional. If exact source-supported points are unavailable, the renderer says `Trend data unavailable` instead of drawing a plausible-looking line.

## Overall direction is derived

The agent does not provide `IMPROVING`, `MIXED`, or `DETERIORATING` as a top-level verdict.

The renderer derives it from the validated signal directions:

```text
all improving          → IMPROVING
improving + deteriorating → MIXED
all deteriorating      → DETERIORATING
flat only              → FLAT
no known direction     → UNKNOWN
```

This keeps directional synthesis separate from health status.

> `Improving` does not mean `Healthy`.

If targets or healthy ranges are unknown, the UI says `Target unknown` rather than inventing adequacy.

## Deterministic visual contract

The bundled no-score renderers enforce:

- one dominant center synthesis area;
- 3–6 signals converging on the center;
- compact left business context;
- compact right account exceptions and events;
- no four-equal-KPI top row;
- no full-width customer table;
- no invented action buttons;
- no framework labels in the UI;
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
│       ├── input.no-score.json
│       ├── output.no-score.svg
│       ├── output.no-score.html
│       └── reasoning.md
├── skills/
│   └── decision-first-dashboard/
│       ├── SKILL.md
│       ├── schemas/
│       │   └── decision-state.schema.json
│       ├── scripts/
│       │   ├── validate.js
│       │   └── render.js
│       ├── templates/
│       │   ├── no-score.svg
│       │   ├── no-score.html
│       │   └── dashboard.css
│       └── references/
│           ├── visual-pattern.md
│           └── after-reference.png
└── tests/
    ├── compiler/
    │   ├── schema.test.js
    │   ├── render-svg.test.js
    │   └── render-html.test.js
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

GitHub Actions runs the compiler tests, validates the canonical SaaS fixture, renders both outputs, and uploads the generated artifacts for visual QA.

## What this is not

This is not a generic chart library and not a prompt that asks the model to freestyle a prettier admin dashboard.

The project separates two responsibilities:

- **Agent:** evidence extraction and decision classification.
- **Compiler:** validation, synthesis, and visual composition.

That separation is what makes the output repeatable across agents.

## License

MIT
