# Visual Pattern Reference — v5

Use this as an **executable composition target**, not as a source of business data.

The intended visual family is `after-reference.png`: one dominant synthesis region, compact supporting areas, restrained product styling, and no visible decision-framework language.

## Non-negotiable composition rules

For an executive dashboard:

- The synthesis region is the unmistakable first focal point.
- It should normally occupy roughly 40–50% of the main content width or otherwise dominate by scale and whitespace.
- Left/right support areas must be visually subordinate and may be asymmetric.
- Do not start with four equal KPI cards.
- Do not render a full-width customer table unless the task explicitly requires operational account management.
- Do not use large explanatory paragraphs as the synthesis.
- Do not label columns with methodology language.

## Template A — Composite center

Use only when the source provides a defensible score/status model.

```text
┌──────────────────────────────────────────────────────────────────┐
│ Subscription health                                              │
│                                                                  │
│  compact context          DOMINANT CENTER        compact action  │
│                                                                  │
│  MRR / target             Growth   Retention     Accounts at risk│
│  score composition          ↘       ↓       ↙     Score trend     │
│  segment weakness           68 / 100              Business impact │
│                               At risk                            │
│                            ↗       ↑       ↖                      │
│                         Conversion  Churn                          │
└──────────────────────────────────────────────────────────────────┘
```

### Render behavior

- The score/status is central and largest.
- 3–6 validated inputs visually orbit, converge on, or tightly surround the center.
- Left side explains why/where.
- Right side answers who/trend/impact.
- Outcome metrics remain visually separate from score inputs.

## Template B — Multi-signal center

Use when no defensible composite score exists.

**Never replace the missing score with a fabricated one. Never retreat to a standard KPI grid.**

```text
┌──────────────────────────────────────────────────────────────────┐
│ Subscription health                                              │
│                                                                  │
│  Revenue growth            ↑ MRR +12.4%         Accounts to watch│
│  7-month trend                   ╲               Dovetail         │
│                               IMPROVING           At risk          │
│  Retention context          target unknown       Recent events    │
│  Churn 2.84%                   ╱    ╲                               │
│                         ↓ Churn   ↑ Conversion    MRR context       │
│                           -0.6pp      +3.2%       $184,320          │
│                              ↑ Customers +8.1%                    │
└──────────────────────────────────────────────────────────────────┘
```

### Render behavior

- `Improving — target unknown` or another evidence-bounded status sits at the visual center.
- 3–6 source-supported directional signals form a **single visual cluster** around it.
- Signals are compact; do not turn each into a large independent card.
- Left side carries only the minimum context needed to explain the movement.
- Right side carries only confirmed exceptions, recent events, trend, or business impact.
- If only one confirmed at-risk account is visible, show that account compactly; do not imply it is the only risk company-wide.

## Product-native language

Good labels when supported:

- Subscription health
- Revenue growth
- Accounts to watch
- Recent events
- Score trend
- Business impact
- Churn by plan

Do not render:

- Executive Decision Dashboard
- Primary Decision
- Diagnostic / Diagnostic Context
- Actionable
- Required Interventions
- Overall State
- Key Health Metrics Context
- Outcome / Driver / Success Signal

## Reference fidelity

When `after-reference.png` is available, inspect it before rendering and preserve:

- center dominance;
- compact side cards;
- whitespace ratio;
- restrained color usage;
- card density;
- asymmetric balance;
- absence of large operational tables;
- one coherent page composition.

Do **not** copy its numbers, score, thresholds, or customer facts unless those facts also exist in the source dashboard.

## Data integrity

If a source has no target, do not add one.
If an account is only `At risk`, do not invent a reason such as failed payment.
If an event says a trial converted, do not render a `Convert` button.
If table and event states conflict, preserve the conflict rather than silently resolving it.
