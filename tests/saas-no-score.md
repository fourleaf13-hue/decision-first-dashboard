# Test: SaaS Without Score Rules — v6

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

The agent must use the no-score executive mode.

Expected center:

```text
        MRR +12.4%      Customers +8.1%
               \          /
                IMPROVING
              target unknown
               /          \
        Churn -0.6pp    Trial +3.2%
```

The agent should:

- not invent a Health Score;
- not say `HEALTH GOOD`, Healthy, Marginal, or At Risk;
- keep all four directional signals attached to the center rather than in four equal cards;
- keep revenue/context compact on the left;
- keep exceptions/events compact on the right;
- avoid a full-width account table;
- keep framework/report language out of the UI;
- preserve direction vs health as separate concepts;
- redraw before delivery if any automatic-fail condition from `visual-output.md` is present.
