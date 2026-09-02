# Test: E-commerce Store Health

## Prompt

Redesign this e-commerce dashboard using the decision-first-dashboard skill.

Primary user: head of growth.

Primary decision: Is the store performing normally, and where should the team intervene this week?

Metrics:
- Revenue attainment 83%
- Traffic +6%
- Conversion 2.1% (down)
- AOV +1.2%
- Return rate 8.4%
- Repeat purchase 21%
- Top SKUs by refund loss
- Top campaigns by spend

## Expected behavior

The agent should:
- determine whether one composite signal is defensible or whether multi-signal mode is better;
- avoid inventing a store-health score unless thresholds and weights are available;
- surface the main action targets such as campaigns or SKUs;
- show outcome impact separately from diagnostics.
