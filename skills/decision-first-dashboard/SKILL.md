---
name: decision-first-dashboard
description: Use when redesigning KPI-heavy dashboards where users must scan multiple independent metrics before understanding overall status, primary risks, or what requires attention.
---

# Decision-First Dashboard

## Core principle

Do not begin by rearranging cards.

A dashboard should first answer:

> What should the user conclude?

Transform the information model from:

**Many metrics → One decision signal → Drivers → Diagnosis → Action**

The goal is not to make the dashboard prettier. The goal is to reduce the amount of mental synthesis required from the user.

## 1. Define the decision before designing

Identify:

- Primary user
- Primary decision
- Primary business outcome
- Decision frequency
- Conditions that would change the user's judgment

Do not redesign the dashboard until the primary decision can be stated in one sentence.

Example:

- User: SaaS founder / revenue leader
- Decision: Is subscription health good enough, or does something require intervention?

## 2. Classify every metric

Classify each metric into one of four roles.

### Outcome

The result the user ultimately cares about.

Examples: revenue, MRR, production output, conversion, service level.

### Drivers

Metrics that directly explain the outcome.

Examples: retention, acquisition, ARPA, churn, utilization, defect rate.

### Diagnostics

Metrics needed only after an abnormal signal is found.

Examples: churn by plan, conversion by channel, cohort retention, defects by machine.

### Action data

Entities the user can act on.

Examples: at-risk accounts, failing jobs, campaigns, machines, SKUs, overdue invoices.

## 3. Decide whether a composite signal is appropriate

A composite score is useful when several metrics jointly describe one concept and the user benefits from an overall judgment.

Use a composite score only when:

- dimensions describe the same high-level condition;
- each dimension has a meaningful target, threshold, baseline, or benchmark;
- normalization rules are defensible;
- weights are known or explicitly defined.

### Never invent score math

If raw metrics cannot be defensibly mapped to a common scale, do not fabricate a 0–100 score.

If thresholds, normalization rules, or weights are missing:

1. ask for them, or
2. keep the metrics separate, or
3. clearly label any example score as illustrative.

## 4. Handle hard-stop metrics

Never average critical safety, compliance, security, regulatory, or contractual violations into a reassuring composite score when they independently determine status.

A hard-stop condition overrides the composite score.

Example:

If production performance is 92/100 but a critical safety event is active, the dashboard status is **Critical**, not an averaged health score.

## 5. Build the decision hierarchy

Use one dominant decision signal.

Recommended hierarchy:

### Center: core decision signal

Examples:

- Subscription Health: 68 / 100 — At risk
- Commerce Health: 76 / 100 — Needs attention
- Operational Health: Critical

The user should understand the overall state in 5–10 seconds.

### Around the center: driver signals

Show the dimensions that create or explain the central state.

Examples:

- Growth
- Retention
- Conversion
- ARPA
- Churn control
- Trial volume

### Sides: supporting evidence

Supporting panels should answer only one of these questions:

- **WHY?** What is driving the state?
- **WHERE?** Which segment or area is causing it?
- **WHO?** Which entities require attention?
- **IMPACT?** What business result is affected?

## 6. Explain the score in plain language

Never rely on a number alone.

Prefer:

- `68 / 100`
- `At risk`
- `-6 vs last month`
- `Primary drag: Enterprise churn`

instead of only:

- `68`

The dashboard should translate data into judgment.

## 7. Make score composition scannable

If a composite score exists, separate positive and negative drivers.

Prefer:

### Driving the score up
- MRR growth — 83
- Trial volume — 78
- Trial → paid conversion — 74

### Dragging the score down
- Net revenue retention — 68
- ARPA — 65
- Churn control — 40

Avoid flat lists that require the user to discover the ranking themselves.

## 8. Visualize thresholds, not just values

If a threshold determines whether a metric is healthy, encode it visually.

Example:

If healthy churn is `<2%`, show the 2% threshold on the chart.

Color semantics must match the threshold:

- green = healthy
- orange = warning / near threshold
- red = risk / beyond threshold

Do not use semantic colors decoratively.

## 9. Use radar charts selectively

Radar charts are appropriate when:

- 4–7 normalized dimensions describe one overall condition;
- the goal is pattern recognition;
- the user needs to see imbalance across dimensions;
- current vs previous period comparison is useful.

Do not use a radar chart when exact quantitative comparison is the primary task.

If a radar chart is used, reinforce it with explicit numeric labels and a plain-language summary.

## 10. Reduce supporting visual weight

The core decision signal should dominate the page.

As a starting point:

- Core visualization: 45–55% of attention
- Supporting panels: 20–30% each side

This is a hierarchy guideline, not a rigid layout formula.

## 11. End with action

If the dashboard reveals a problem, surface what can be acted upon.

Bad:

- Customers
- Orders
- Machines

Better:

- Accounts at risk
- Orders requiring intervention
- Machines causing output loss

Action-oriented data should include, when available:

- severity
- business impact
- affected entity
- recommended next action

## Final review

Before finishing, verify that the user can answer these questions quickly:

1. Are we healthy?
2. Why?
3. What changed?
4. Where is the problem?
5. Who or what requires attention?
6. What should I inspect or do next?

If the user still needs to scan many unrelated cards and mentally combine them, simplify further.
