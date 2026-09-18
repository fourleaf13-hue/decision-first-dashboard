# Semantic Visual Grammar design

## Scope

This change evolves the existing `Decision Brief → routing → composition → compile → render → delivered verifier` pipeline. It does not add a compiler, renderer, template registry, audience branch, fixture branch, or external visualization dependency. Finding #0 runtime provenance remains unchanged.

The new boundary is:

```text
Semantic Node
  → presentation eligibility
  → comparability gate
  → layout eligibility
  → Internal Visual Spec
  → existing deterministic renderer
  → delivered verifier
```

The composer continues to decide WHAT, WHY, priority, and coverage. A new visual-grammar module decides the mechanically eligible HOW and emits an internal visual spec consumed by the existing semantic renderer. The renderer does not infer a chart from labels or invent a visual type.

## Internal Visual Spec

Every selected semantic node receives one deterministic spec with these fields:

```js
{
  nodeId,
  semanticType,
  presentation,
  mark,
  orientation,
  encoding,
  scale,
  comparability,
  layout: { pattern, reasonCode, requirementRef|modifierRef|evidenceRefs }
}
```

`mark`, `orientation`, `encoding`, `scale`, and `layout.pattern` are registered values. `comparability` records the unit, comparison group, domain, normalization, and eligibility reason. The spec is serialized into the delivered manifest and mirrored by machine-readable HTML/SVG markers.

The shared visual registry is presentation-owned, not use-case-owned:

| Semantic presentation | Required structural visual |
| --- | --- |
| `Trend.full_chart` | ordered temporal plot/polyline or columns |
| `Distribution.full_chart` | full ordered categorical/temporal distribution |
| `Ranking.full_ranking` | ordered magnitude comparison |
| `Ranking.both_ends` | explicit paired high/low comparison |
| `MetricCluster.comparison` | heterogeneous metric strip with independent scales |
| `MetricCluster.radar` | true radar only after the existing Profile Test |

Existing `Breakdown`, `Relationship`, `ExceptionList`, and `Drilldown` structures retain their registered semantics and receive explicit marks as well.

## Comparability

Shared position, length, area, or scale is legal only when the compared values have compatible unit, comparison group, comparability domain, normalization, and scale. Same unit alone is insufficient. A mixed-unit `MetricCluster` uses independent metric tiles and never a shared radar/length encoding. A radar additionally requires the existing 3–6 dimension Profile Test, source-backed normalized values, shared scale, profile purpose, and the explicit comparability contract.

Cross-node paired layouts require the same semantic family, domain, compatible unit/normalization, complementary high/low role, and preserved coverage. Invalid comparisons fail closed with a stable reason code.

## Layout eligibility and attribution

Allowed patterns are `compact`, `paired`, `full_width`, `hero_support`, and `asymmetric`. A non-default pattern must include a registered reason code and a resolvable requirement, modifier, or source evidence reference. `paired` is reserved for eligible complementary ends; `full_width` needs full distribution/trajectory context or a density justification; `hero_support` needs a real diagnostic/hero relation; `asymmetric` needs priority/density evidence. `compact` is legal only for low-item, non-primary-shape content.

The reason-code registry is shared by composition and visual eligibility. Unknown or unattributed visual decisions fail validation. Free-form explanation text is informative only and cannot satisfy the contract.

## Delivery contract

The production compiler builds the visual specs before rendering and places the exact specs in `delivery.nodes`. The verifier reads final HTML/SVG and the delivered manifest, then cross-checks:

- node and presentation markers;
- mark, orientation, scale, comparability, and layout markers;
- structural elements and item counts appropriate to each mark;
- manifest specs against actual artifact markers;
- no external-renderer marker or undeclared visual structure.

The renderer cannot self-certify verification. Existing artifact hashes and verifier stamps remain owned by the verifier.

## Regression evidence

Tests must prove structural diversity in both final HTML and SVG, negative comparability cases, legal same-domain comparisons, same-unit semantic mismatches, paired eligibility and reason attribution, manifest/artifact tampering rejection, and Bakery plus non-Bakery/CEO Sales reuse through one pipeline. Existing no-score, composite, radar, grounding, runtime-provenance, and legacy golden tests must remain green. No Bakery or CEO-specific conditional appears in production code.
