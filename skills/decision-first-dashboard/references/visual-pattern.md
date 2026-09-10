# Visual Pattern Reference

Use `after-reference.png` and the approved premium data-visualization references as a **visual family**, never as a source of business data.

The deterministic renderer owns geometry. The agent supplies only validated decision-state data.

## Signature composition

The renderer should feel like a designed decision interface rather than a cleaned-up BI template.

Preferred balance:

- left support: about 20–25%;
- dominant center: about 45–50%;
- right support: about 25–30%.

The signature visual language is:

- a large open circular center field as the first focal point;
- layered halos / orbit geometry that creates depth without implying unsupported relationships;
- compact floating metric orbs around the center rather than equal KPI cards across the top;
- elevated translucent support surfaces at the sides for context, diagnosis, exceptions, and events;
- asymmetric information density: synthesis/profile in the center, explanation on the left, attention items on the right;
- restrained violet/blue accents, soft cool background, generous whitespace, and strong typographic hierarchy;
- source-backed mini trends where they genuinely explain movement.

Supporting cards are allowed and encouraged when they make the output feel like a production dashboard. They must remain subordinate to the center and must not collapse back into a flat wall of equally weighted KPI cards.

## No-score executive composition

```text
┌────────────────┬──────────────────────────────────┬──────────────────┐
│ Revenue        │          open center field       │ Accounts to watch│
│ context        │                                  │                  │
│ + real trend   │     MRR              Customers   │ confirmed source │
│                │        ╲            ╱             │ exceptions       │
│ Movement       │          IMPROVING               │                  │
│ context        │          target unknown          │ Recent events    │
│                │        ╱            ╲             │                  │
│                │     Churn          Conversion    │                  │
└────────────────┴──────────────────────────────────┴──────────────────┘
```

The center is a synthesis cluster, not a large prose card. Ordinary raw signals may use radial/orbit placement, but their different units must never be encoded as polygon distance.

## Evidence rules that affect rendering

- Overall direction is derived by the renderer from signal directions.
- `Improving` does not mean `Healthy`.
- Numeric trend series render only when the contract marks them as source-supported.
- If an exact trend series is unavailable, the renderer states that the trend data is unavailable instead of drawing an invented chart.
- Account exceptions and events render only with source provenance.
- No-score mode never renders a 0–100 score or unsupported health band.
- Visual depth, halos, cards, and connection lines are presentation only. They do not create evidence or business semantics.

## Product language

Use product-native labels such as `Subscription health`, `Revenue growth`, `Movement context`, `Accounts to watch`, and `Recent events`.

Do not expose method labels such as `Primary Decision`, `Diagnostic`, `Outcome`, `Actionable`, `Required Interventions`, or `Decision-first view`.

## Geometry guardrails

The templates intentionally omit:

- four-card KPI strips;
- full-width customer tables;
- health banners without source support;
- workflow/action buttons without source support;
- arbitrary free-text insight panels.

The center should remain visually dominant even when the side support surfaces contain more literal information. Do not solve overload by shrinking type or squeezing more peers into the center.

If a user wants a different visual system, modify the deterministic templates deliberately; do not let the LLM improvise a replacement layout during ordinary dashboard compilation.

## Visualization tool routing

Do not confuse a chart library with a visual-design skill. Recharts, visx, Bokeh, Cube, Nivo, Vue-ECharts, and Scrollama are primarily implementation libraries or infrastructure; ApexCharts currently provides a dedicated official AI skill.

The default production path in this repository remains deterministic SVG/HTML. If a user explicitly asks for a framework implementation, choose the tool according to `visual-stack-routing.md`. In particular, prefer **visx** for bespoke React geometry that must closely reproduce the signature layout, and **Recharts** for conventional supporting charts. Never import a library merely to obtain its default demo aesthetic.

## Radar profile eligibility

Use a radar only to show the profile of one object or condition across **3–6 peer dimensions** on one shared, source-backed numeric scale.

- 3 dimensions render as a triangle; fewer than 3 are invalid for radar.
- 4–6 dimensions render with one vertex per dimension.
- Each radar vertex must use a source-backed normalized score on the same scale.
- A radar does not require an overall score: `no_score` may still use a radar when the comparable dimension scores and shared scale are grounded.
- Do not connect mixed-unit KPIs such as dollars, counts, rates, durations, and ratios into a polygon. Use the ordinary radial signal composition instead.
- Prefer one profile, or at most a simple before/after comparison when both series use identical dimensions and scale. Do not create a multi-series spider web.

## Composite mode

When a composite model is genuinely grounded, the center score remains dominant and its 3–6 normalized components form a closed radar profile. The same floating-orb and side-support visual language applies.

Never invent a composite score, normalized component, weight, band, or radar scale merely to obtain the signature visual.
