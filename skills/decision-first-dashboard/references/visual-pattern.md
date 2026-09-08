# Visual Pattern Reference

Use `after-reference.png` as the visual family reference, not as a source of business data.

The deterministic renderer owns geometry. The agent supplies only validated decision-state data.

## No-score executive composition

Preferred balance:

- left support: about 20–25%;
- dominant center: about 45–50%;
- right support: about 25–30%.

```text
┌───────────────┬──────────────────────────────┬──────────────────┐
│ Revenue       │       Subscription health    │ Accounts to watch│
│ context       │                              │                  │
│               │   MRR       Customers        │ Confirmed source │
│ Movement      │      \       /                │ exceptions       │
│ context       │       IMPROVING              │                  │
│               │     target unknown           │ Recent events    │
│               │      /       \                │                  │
│               │   Churn     Conversion       │                  │
└───────────────┴──────────────────────────────┴──────────────────┘
```

The center is a synthesis cluster, not a large prose card. Signals are not rendered as four equal KPI cards.

## Evidence rules that affect rendering

- Overall direction is derived by the renderer from signal directions.
- `Improving` does not mean `Healthy`.
- Numeric trend series render only when the contract marks them as source-supported.
- If an exact trend series is unavailable, the renderer states that the trend data is unavailable instead of drawing an invented chart.
- Account exceptions and events render only with source provenance.
- No-score mode never renders a 0–100 score or unsupported health band.

## Product language

Use product-native labels such as `Subscription health`, `Revenue growth`, `Movement context`, `Accounts to watch`, and `Recent events`.

Do not expose method labels such as `Primary Decision`, `Diagnostic`, `Outcome`, `Actionable`, `Required Interventions`, or `Decision-first view`.

## Geometry guardrails

The templates intentionally omit:

- four-card KPI strips;
- full-width customer tables;
- health banners;
- workflow/action buttons;
- arbitrary free-text insight panels.

If a user wants a different visual system, modify the deterministic templates deliberately; do not let the LLM improvise a replacement layout during ordinary dashboard compilation.

## Visualization tool routing

Do not confuse a chart library with a visual-design skill. Recharts, visx, Bokeh, Cube, Nivo, Vue-ECharts, and Scrollama are primarily implementation libraries or infrastructure; ApexCharts currently provides a dedicated official AI skill.

The default production path in this repository remains deterministic SVG/HTML. If a user explicitly asks for a framework implementation, choose the tool according to `visual-stack-routing.md`. In particular, prefer **visx** for bespoke React geometry that must closely reproduce `after-reference.png`, and **Recharts** for conventional supporting charts. Never import a library merely to obtain its default demo aesthetic.

## Radar profile eligibility

Use a radar only to show the profile of one object or condition across **3–6 peer dimensions** on one shared, source-backed numeric scale.

- 3 dimensions render as a triangle; fewer than 3 are invalid for radar.
- 4–6 dimensions render with one vertex per dimension.
- Each radar vertex must use a source-backed normalized score on the same scale.
- A radar does not require an overall score: `no_score` may still use a radar when the comparable dimension scores and shared scale are grounded.
- Do not connect mixed-unit KPIs such as dollars, counts, rates, durations, and ratios into a polygon. Use the ordinary signal composition instead.
- Prefer one profile, or at most a simple before/after comparison when both series use identical dimensions and scale. Do not create a multi-series spider web.

## Composite mode

`after-reference.png` demonstrates the intended composite visual family. Use a composite only when score math, normalization, weights, and thresholds are defensible from the source. Its 3–6 normalized components render as a closed radar profile; never invent a composite score merely to obtain that visual.
