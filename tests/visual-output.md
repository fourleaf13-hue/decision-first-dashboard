# Test: Visual Translation Regression

## Observed failure before this revision

A model using the earlier skill produced a dashboard that exposed internal framework labels directly in the UI:

- `(Decision)`
- `(Outcome)`
- `(Actionable)`
- `Diagnostic Signal`
- `Success Signal`

It also invented an unsupported top-level status (`MARGINAL`), treated improving churn as intrinsically bad without a threshold, and invented action buttons such as `Contact` and `Convert`.

The result explained the method instead of looking like a mature SaaS product.

## Prompt

Redesign the attached SaaS dashboard using the decision-first-dashboard skill.

Primary user: SaaS founder / revenue leader.

Primary decision:
Is subscription health good enough, or does something require intervention?

Requirements:
- create the actual visual dashboard, not only a written specification;
- use only source-supported data;
- do not invent scores, targets, statuses, customer events, actions, or causal claims;
- preserve the source product's visual maturity;
- verify every displayed value after rendering.

## Expected behavior

The agent should:

- keep decision-framework terminology backstage;
- avoid `Decision`, `Diagnostic`, `Outcome`, or `Actionable` labels in the product UI;
- use a dominant synthesis area instead of four equal KPI cards;
- use an evidence-bounded status when thresholds are missing;
- preserve improving-vs-healthy as separate concepts;
- surface confirmed account exceptions without inventing causes or workflow buttons;
- create/render the requested interface rather than stopping at analysis;
- verify that every rendered number and state matches the source.
