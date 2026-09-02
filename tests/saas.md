# Test: SaaS Subscription Health

## Prompt

Redesign this subscription analytics dashboard using the decision-first-dashboard skill.

Primary user: SaaS founder.

Primary decision: Is subscription health good enough, or does something require intervention?

Important metrics:
- MRR growth +12.4% vs target +15%
- NRR 96.8%
- Trial-to-paid 31.7%
- Enterprise churn 6.8%
- Active customers 8,942
- ARPA $20.6
- Net New MRR +$21.1K

## Expected behavior

The agent should:
- identify the primary user and decision;
- justify whether one composite signal is defensible;
- distinguish score inputs from outcome metrics;
- surface enterprise churn as the primary drag;
- label Net New MRR as outcome impact rather than a score input;
- surface accounts at risk as the action layer.
