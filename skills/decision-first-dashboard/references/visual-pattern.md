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

## Composite radar mode

Use composite only when the overall score, component normalization, weights, aggregation rule, and score bands are mechanically defensible from source evidence. Never invent an overall score merely to obtain the visual.

For 3–6 comparable composite dimensions, the center visualization is a true closed radar polygon:

- 3 dimensions → triangle;
- 4 dimensions → quadrilateral;
- 5 dimensions → pentagon;
- 6 dimensions → hexagon.

Each polygon vertex is computed from the corresponding normalized component score. A score change must move that vertex; spokes alone are not a radar chart.

### Fixed radar visual hierarchy

The visual stack is deterministic, from back to front:

1. **White circular plate** — the largest center shape and the bottom visual layer.
2. **Radar grid, spokes, and closed data polygon** — centered on top of the plate.
3. **Dimension values and labels** — placed outside the white plate, never inside it.
4. **Center score and source-supported conclusion/band** — the topmost focal content.

The plate must remain visibly larger than the radar geometry. The current reference geometry scales the prior plate/radar system to **80%** while preserving their relative proportions. In the SVG reference layout, radar radius is `142.4`, plate radius is `196`, and label radius is `224`; HTML uses the proportional equivalents `139.2`, `192`, and `220`.

Do not replace the large backing plate with an outline ring. Do not place dimension values inside the plate. Do not allow the center score badge to cover enough of the polygon that the closed radar shape becomes visually ambiguous.

If a future renderer changes these dimensions, preserve the same invariant relationships and update the radar geometry regression tests and golden snapshots intentionally.
