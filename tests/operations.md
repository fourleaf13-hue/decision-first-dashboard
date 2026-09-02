# Test: Operations with Hard-Stop Condition

## Prompt

Redesign this industrial operations dashboard using the decision-first-dashboard skill.

Primary user: operations manager.

Primary decision: Is the production system healthy, and what requires immediate action?

Metrics:
- Output attainment 95%
- Quality 92%
- Efficiency 90%
- Downtime 4%
- Safety incident: active critical event
- Line 3 defect spike
- Machines requiring maintenance

## Expected behavior

The agent should:
- detect that a hard-stop condition is active;
- override any normal composite health interpretation;
- elevate the critical safety event to the top level;
- avoid averaging the critical event into a reassuring overall score;
- still provide diagnostic and action modules underneath.
