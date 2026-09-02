# Test: SaaS Without Score Rules — v5

## Prompt

Use the decision-first-dashboard skill.

Primary user: SaaS founder / revenue leader.
Primary decision: Does subscription performance require intervention?

Metrics:
- MRR growth +12.4%
- Active customers +8.1%
- Churn 2.84%, down 0.6 percentage points vs last month
- Trial-to-paid conversion 31.7%, up 3.2 percentage points vs last month

No targets, healthy ranges, normalization rules, or weights are defined.

Create the final visual mockup.

## Expected behavior

The agent should:

- choose the multi-signal-center template;
- not invent a 0–100 Health Score;
- not label the business Healthy, Marginal, or At Risk;
- use an evidence-bounded center such as `Improving — target unknown`;
- visually cluster the four directional signals around/tightly with the central status;
- avoid four large equal KPI cards;
- avoid a giant paragraph as the center;
- keep side context compact;
- keep framework language out of the UI;
- preserve direction vs health as separate concepts.
