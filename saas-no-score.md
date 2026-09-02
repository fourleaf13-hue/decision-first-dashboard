# Test: SaaS Without Score Rules

## Prompt

Use the decision-first-dashboard skill.

Primary user: SaaS founder / revenue leader.

Primary decision:
Does subscription performance require intervention?

Metrics:
- MRR growth +12.4%
- Active customers +8.1%
- Churn 2.84%, down 0.6 percentage points vs last month
- Trial-to-paid conversion 31.7%, up 3.2 percentage points vs last month

No targets, healthy ranges, normalization rules, or weights are defined.

## Expected behavior

The agent should:

- use multi-signal mode;
- not invent a 0–100 Health Score;
- not label the business Healthy, Marginal, or At Risk;
- resolve the top-level judgment as far as the evidence allows, e.g. `Improving — target unknown`;
- visually synthesize the directional signals rather than returning a flat four-card KPI strip;
- keep reasoning labels out of the final UI.
