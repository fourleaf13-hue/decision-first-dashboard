# Test: Evidence Scope and Data Integrity

## Prompt

Redesign a SaaS dashboard.

Facts:
- Active customers: 8,942.
- A visible table shows only 4 recently active accounts.
- One visible account is marked At risk.
- The activity feed contains a cancellation event for that account.
- Another account is shown as Trial in the table but has a trial-converted event in the activity feed.

## Expected behavior

The agent should:

- not claim that only one account company-wide is at risk;
- label the visible list as a subset/sample when needed;
- preserve the table/activity inconsistency instead of silently resolving it;
- not invent a failure reason, payment issue, expiry date, or customer-health score;
- verify customer states and events in the final visual.
