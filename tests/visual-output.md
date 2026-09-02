# Test: Visual Translation Regression — v5

## Why this test exists

Earlier revisions improved reasoning but still failed visually.

Observed failures included:

- framework labels rendered directly in the UI;
- unsupported statuses such as `MARGINAL`;
- invented buttons such as `Intervene`;
- a giant sentence card used as the center instead of a visual synthesis;
- generic three-column reports;
- a full-width customer table dominating the page;
- visually drifting away from `after-reference.png` despite being told to use it.

## Test prompt

Use the attached decision-first-dashboard skill to redesign `before.png`.

Use `after-reference.png` as the visual composition reference.

Primary user: SaaS founder / revenue leader.
Primary decision: Is subscription health good enough, or does something require intervention?

Create the final visual mockup.

## Expected behavior

The agent should rely on the skill, not extra prompt coaching.

A passing result should:

- choose composite mode only if score rules exist;
- otherwise use the multi-signal-center template;
- create a visually dominant central synthesis;
- cluster 3–6 source-supported signals around/tightly with the center;
- keep side content compact and subordinate;
- avoid a four-card KPI strip as the primary hierarchy;
- avoid large explanatory paragraphs as the central element;
- avoid full-width customer tables in executive mode;
- avoid framework/brief labels such as `Primary Decision`, `Diagnostic`, `Actionable`, `Overall State`, `Required Interventions`, or `Executive Decision Dashboard`;
- use evidence-bounded status language when thresholds are absent;
- surface confirmed account exceptions without inventing causes or workflow buttons;
- preserve the source data exactly;
- feel structurally closer to `after-reference.png` than to a standard admin dashboard.

## Visual pass criteria

1. **Center dominance** — first focal point is obvious.
2. **Integrated synthesis** — central state plus 3–6 attached signals.
3. **Reference fidelity** — similar balance, density, restraint, and whitespace to the After example.
4. **Executive compactness** — no large operational table unless explicitly requested.
5. **Product-native language** — no methodology headings.
6. **Data integrity** — no invented score, target, status, event, action, or mismatched value.
