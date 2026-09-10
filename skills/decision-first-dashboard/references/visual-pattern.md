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
- compact floating metric treatments around the center rather than equal KPI cards across the top;
- elevated translucent support surfaces at the sides for context, diagnosis, exceptions, and events;
- asymmetric information density: synthesis/profile in the center, explanation on the left, attention items on the right;
- restrained violet/blue accents, soft cool background, generous whitespace, and strong typographic hierarchy;
- source-backed mini trends where they genuinely explain movement.

Supporting cards are allowed and encouraged when they make the output feel like a production dashboard. They must remain subordinate to the center and must not collapse back into a flat wall of equally weighted KPI cards.

## No-score executive composition

For heterogeneous raw KPIs that are not radar-eligible, keep the ordinary radial/orbit composition and renderer-derived direction summary.

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

Ordinary raw signals may use radial/orbit placement, but their different units must never be encoded as polygon distance.

## Evidence rules that affect rendering

- Overall direction is derived by the renderer from signal directions only for the ordinary non-radar no-score composition.
- `Improving` does not mean `Healthy`.
- Numeric trend series render only when the contract marks them as source-supported.
- If an exact trend series is unavailable, the renderer states that the trend data is unavailable instead of drawing an invented chart.
- Account exceptions and events render only with source provenance.
- No-score mode never renders a 0–100 overall score or unsupported health band.
- Visual depth, halos, cards, rings, and connection lines are presentation only. They do not create evidence or business semantics.

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

A radar is a **multi-dimensional profile**, not a score by definition. Use it only to show one object or condition across **3–6 peer dimensions** on one shared, source-backed numeric scale.

- 3 dimensions render as a triangle; fewer than 3 are invalid for radar.
- 4–6 dimensions render with one vertex per dimension.
- A no-score profile should use `radarValue` for each dimension. Legacy `normalizedScore` remains accepted for backward compatibility, but new profile data should not be framed as a score unless it truly is one.
- Every radar vertex must be grounded on the same declared `radarScale`.
- The radar center is **neutral and empty by default**. Do not place an overall score, health verdict, `At risk`, or other alarm copy in the center merely to fill space.
- Render **four concentric circular scale rings** from inner to outer so distance has a readable visual scale and the center keeps depth without extra copy.
- Keep each dimension's concrete current business value visible around the radar. The polygon supplies shape; labels supply precision.
- If a source-backed `delta` exists, show a compact movement cue beside the dimension value. Arrow direction follows numeric movement; color follows business direction (`improving` green, `deteriorating` red, flat/unknown neutral). A decreasing churn rate can therefore be a green downward arrow.
- Do not connect mixed-unit KPIs such as dollars, counts, rates, durations, and ratios into a polygon unless the plotted `radarValue` values are explicitly comparable on one grounded scale.

## Period comparison

A simple current-vs-previous overlay is preferred when both periods use identical dimensions and the same scale.

- Previous period renders **first, in blue**, beneath the current profile.
- Current period renders **second, in pink/coral**, with light fill and visible current-period vertex markers.
- The legend uses the source-backed period labels in `radarComparison`.
- Every dimension must provide a source-backed previous value (`previousRadarValue` for no-score profiles, `previousNormalizedScore` for composite components) before the previous polygon is rendered.
- Partial comparison data fails closed. Never infer, interpolate, or duplicate current values to manufacture a previous-period polygon.
- Do not create more than two overlapping radar series in the signature view; beyond that, use a time-series or another comparison chart.

The intended reading order is: **shape shows the profile; concrete values show magnitude; deltas show movement; color shows whether movement is favorable.** The center does not need to announce a verdict because contraction or a collapsed dimension is already visually legible.

## Composite mode

A genuinely grounded composite model may still exist, and its source score, weights, bands, and trend remain visible in supporting evidence. The center radar itself remains a neutral component profile rather than a score badge.

Never invent a composite score, normalized component, weight, band, radar scale, prior-period value, or period label merely to obtain the signature visual.
