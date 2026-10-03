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

## Semantic typing contract — temporal trajectory vs categorical distribution

When a set of observations is organized in temporal order by a real time index and expresses a state or trajectory changing over time, its semantic type must be `Trend`. `Distribution` covers category, bin, share, and frequency distributions; it must never substitute for a temporal trajectory.

Two boundaries protect this rule:

- **Ordered is not `Trend`.** Rankings and other ordinal structures are also ordered. What is locked is the axis semantics the node expresses, not order alone.
- **One table may yield several types.** A single source table can legitimately derive a `Trend`, a `Breakdown`, and a `Ranking`. The contract never requires same-table nodes to share one type; it locks each node's axis semantics, never its table origin.

Legal `Distribution` axes are categorical: channels, categories, customers, regions, percentiles, bins, shares. Recurring period categories — day-of-week, hour-of-day, or month-of-year aggregated across many spans — are legal categorical distributions only when the node genuinely aggregates recurring periods instead of tracing one continuous span. Twelve consecutive months of one covered period read as consecutive time points are a trajectory, not bins.

When month- or quarter-labeled items are genuinely recurring period bins rather than one continuous span, declare the axis on the semantic node so the typing is explicit:

```json
{ "axis": { "semantics": "categorical" } }
```

The compiler enforces this contract at the semantic-typing boundary, upstream of composition and the renderer: a non-`Trend` node with unambiguous temporal evidence (a declared temporal axis, a bound `temporal_reference` requirement, or absolute date labels) fails closed, and a non-`Trend` node whose items are bare month/quarter labels stops for an explicit axis confirmation instead of silently compiling. The guard never rewrites a node's type on its own.

## Internal Visual Spec

Each delivered node carries:

```json
{
  "nodeId": "orders_by_channel",
  "semanticType": "Distribution",
  "presentation": "full_chart",
  "mark": "bar",
  "orientation": "vertical",
  "encoding": { "x": "ordered_item", "y": "value" },
  "scale": { "type": "local", "domain": "node" },
  "comparability": {
    "eligible": true,
    "unit": "orders",
    "comparisonGroup": "orders_by_channel",
    "comparabilityDomain": "orders",
    "normalization": "raw",
    "reasonCode": "COMPARABILITY_CONFIRMED"
  },
  "layout": {
    "pattern": "full_width",
    "reasonCode": "CONTEXT_REQUIRES_DISTRIBUTION_SHAPE",
    "requirementRef": "ctx_channel_shape"
  }
}
```

This example's axis is categorical: each bar is a channel, and the bars are not time points. Month- or quarter-indexed observations tracing one continuous span are a trajectory and must be typed `Trend` (see the semantic typing contract above); a genuine recurring period-bin distribution declares `"axis": { "semantics": "categorical" }` so the typing is explicit.

## Structural rules

- `Trend.full_chart` renders an ordered trajectory with a line/polyline and point order.
- `Distribution.full_chart` renders every ordered member as a bar/member; a peak summary cannot satisfy a distribution requirement.
- `Ranking.full_ranking` renders ordered magnitude bars; `Ranking.both_ends` renders complementary `high` and `low` regions.
- `MetricCluster.comparison` uses independent metric tiles and never fakes a shared scale for heterogeneous measures.
- `MetricCluster.radar` requires the existing 3–6-dimension Profile Test plus compatible comparability metadata and a shared scale.
- Pairing requires semantic-family, domain, normalization, scale, and complementary-role compatibility. Same units alone do not authorize a pair.

All non-default layout choices have a stable reason code and a machine-readable reference. The final verifier checks the manifest spec against `data-visual-*` markers and structural geometry in both HTML and SVG.
