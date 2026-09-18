# Semantic Visual Grammar

The semantic renderer has one shared grammar. Composition answers what context to preserve and why; the Internal Visual Spec answers how that selected context may be represented.

```text
Semantic Node
  → presentation eligibility
  → comparability gate
  → layout eligibility
  → Internal Visual Spec
  → deterministic renderer
  → delivered verifier
```

## Internal Visual Spec

Each delivered node carries:

```json
{
  "nodeId": "monthly_orders",
  "semanticType": "Distribution",
  "presentation": "full_chart",
  "mark": "bar",
  "orientation": "vertical",
  "encoding": { "x": "ordered_item", "y": "value" },
  "scale": { "type": "local", "domain": "node" },
  "comparability": {
    "eligible": true,
    "unit": "orders",
    "comparisonGroup": "monthly_orders",
    "comparabilityDomain": "orders",
    "normalization": "raw",
    "reasonCode": "COMPARABILITY_CONFIRMED"
  },
  "layout": {
    "pattern": "full_width",
    "reasonCode": "CONTEXT_REQUIRES_DISTRIBUTION_SHAPE",
    "requirementRef": "ctx_monthly_distribution"
  }
}
```

## Structural rules

- `Trend.full_chart` renders an ordered trajectory with a line/polyline and point order.
- `Distribution.full_chart` renders every ordered member as a bar/member; a peak summary cannot satisfy a distribution requirement.
- `Ranking.full_ranking` renders ordered magnitude bars; `Ranking.both_ends` renders complementary `high` and `low` regions.
- `MetricCluster.comparison` uses independent metric tiles and never fakes a shared scale for heterogeneous measures.
- `MetricCluster.radar` requires the existing 3–6-dimension Profile Test plus compatible comparability metadata and a shared scale.
- Pairing requires semantic-family, domain, normalization, scale, and complementary-role compatibility. Same units alone do not authorize a pair.

All non-default layout choices have a stable reason code and a machine-readable reference. The final verifier checks the manifest spec against `data-visual-*` markers and structural geometry in both HTML and SVG.
