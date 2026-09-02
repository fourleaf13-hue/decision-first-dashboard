# Visual Pattern Reference

Use this as a **composition target**, not a source of business data.

The desired executive pattern is the same visual family as `after-reference.png`: a dominant central synthesis region, compact diagnostics on the left, compact exceptions/trend/impact on the right, and no visible decision-framework terminology.

## Reference fidelity protocol

When `after-reference.png` or another explicit visual reference is available, inspect it before rendering and preserve these traits:

- the center is the largest and strongest continuous region;
- left and right columns are visibly subordinate;
- cards are compact rather than report-like;
- whitespace is generous;
- the page does not begin with four equal KPI cards;
- the central synthesis visually integrates supporting signals;
- the layout feels like one composition, not three independent columns;
- no full-width operational table dominates the bottom unless the task explicitly requires it.

Do not translate this pattern into `Diagnostic Context | Overall State | Required Interventions` headings. Those are reasoning concepts, not product UI.

## Composite mode

Use when a real composite score/status model exists.

```text
┌────────────────────────────────────────────────────────────────┐
│ Subscription health                                            │
│                                                                │
│  compact WHY / WHERE       DOMINANT SYNTHESIS      WHO / IMPACT│
│                                                                │
│  Revenue / target          contributing signals    Accounts    │
│  Score composition      ↘       68 / 100      ↙    at risk     │
│  Segment weakness             At risk               Trend      │
│                           ↗                 ↖        Outcome    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Required behavior

- Central synthesis should normally occupy about 40–50% of main content width or otherwise dominate visually.
- Inputs should feel attached to the central state, not like unrelated KPI cards.
- Left side explains why/where.
- Right side answers who/trend/impact.
- Business outcome remains visible but visually separate from score inputs.

## Multi-signal mode

Use when no defensible composite score can be calculated.

Do **not** fall back to a generic KPI grid and do **not** invent a score.

Instead, keep the same visual grammar:

```text
┌────────────────────────────────────────────────────────────────┐
│ Subscription health                                            │
│                                                                │
│  Revenue context         ↑ MRR +12.4%          Account exception│
│                       ↘                    ↙    Dovetail          │
│                         IMPROVING                               │
│  Churn context          Target unknown          Recent events   │
│                       ↗                    ↖                    │
│                 ↓ Churn -0.6pp   ↑ Conv +3.2%                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

The central synthesis is an **integrated visual cluster**:

- one evidence-bounded status in the center;
- 3–6 compact supporting signals around/adjacent to it;
- directional markers when the source supports them;
- no unsupported health threshold.

A large text rectangle that simply says `Metric performance is improving` does **not** satisfy this pattern.

## Preferred product-language examples

Use domain-native labels when supported:

- `Subscription health`
- `Revenue growth`
- `What is changing`
- `Accounts to watch`
- `Health trend`
- `Business impact`

Avoid framework-like headings:

- `Diagnostic Context`
- `Overall Subscription State`
- `Required Interventions`
- `Decision`
- `Outcome`
- `Actionable`

## Executive density

For executive/founder mode:

- prefer 2–4 compact support cards per side;
- show only the most relevant account exceptions;
- demote or remove large operational tables;
- avoid action buttons unless the product already supports the workflow;
- preserve important source information through compact summaries rather than equal visual weight.

## Visual restraint

If the reference style is appropriate to the source brand, match its calm visual tone:

- soft neutral or subtly tinted page surface;
- white/near-white cards;
- restrained accent color;
- light borders or low-elevation shadows;
- generous internal padding;
- clear typographic scale;
- limited warning color reserved for supported exceptions.

Do not color a metric as unhealthy merely because its name is negative. For example, falling churn is an improving direction; health status still requires a threshold.

## Preserve product credibility

If a source dashboard has no target, do not add one.
If an account is only labeled `At risk`, do not invent `Failed payment`.
If a trial has already converted in the activity log, do not render a `Convert` action.
If a list is a sample, do not imply it represents the whole customer base.

## Reference image

When the runtime can inspect local image assets, inspect `after-reference.png` before rendering. Match its **composition, visual balance, central emphasis, compact card scale, whitespace, and restraint** much more literally than a loose inspiration board.

Do not copy its literal numbers, score model, labels, or business facts unless those are also present in the user's source data.
