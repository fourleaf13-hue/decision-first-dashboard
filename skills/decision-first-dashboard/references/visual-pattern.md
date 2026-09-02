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

## Composite mode

`after-reference.png` demonstrates the intended composite visual family. Use a composite only when score math, normalization, weights, and thresholds are defensible from the source. The current deterministic MVP renderer implements the no-score executive branch; do not invent a composite score to imitate the reference.
