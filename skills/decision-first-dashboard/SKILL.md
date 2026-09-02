---
name: decision-first-dashboard
description: Use when redesigning KPI-heavy dashboards where users must scan multiple independent metrics before understanding overall status, the main risk, or what requires action.
---

# Decision-First Dashboard

## Core principle

Do not begin by rearranging cards.

A dashboard should first answer:

> What should the user conclude?

Transform the information model from:

**Many metrics → Minimum sufficient decision signals → Diagnosis → Action**

The goal is not to make the dashboard prettier. The goal is to reduce the amount of mental synthesis required from the user.

## 1. Define the decision before designing

Identify:

- primary user;
- primary decision;
- primary business outcome;
- decision frequency;
- conditions that would change the user’s judgment.

Do not redesign the dashboard until the primary decision can be stated in one sentence.

Example:

- User: SaaS founder / revenue leader
- Decision: Is subscription health good enough, or does something require intervention?

## 2. Let “who is looking” change the output

The same metrics do not necessarily produce the same first-layer layout.

The primary user determines:

- information density;
- level of synthesis vs. detail;
- how much diagnosability is promoted to the first layer.

Guideline:

- **Executives / founders** need synthesis and impact.
- **Operators / analysts** need diagnosis and drill-down.

Do not treat “who is looking?” as a ritual question. It must affect the hierarchy.

## 3. Classify every metric

Classify each metric into one of four roles.

### Outcome

The result the user ultimately cares about.

Examples: revenue, MRR, production output, conversion, service level.

### Drivers

Metrics that directly explain the outcome or the main status.

Examples: retention, acquisition, ARPA, churn, utilization, defect rate.

### Diagnostics

Metrics needed only after an abnormal signal is found.

Examples: churn by plan, conversion by channel, cohort retention, defects by machine.

### Action data

Entities the user can act on.

Examples: at-risk accounts, failing jobs, campaigns, machines, SKUs, overdue invoices.

## 4. Decide whether one composite signal is appropriate

This is a branch, not a default.

Use **one dominant composite signal** only when:

- several metrics jointly describe one concept;
- each dimension has a meaningful target, threshold, baseline, or benchmark;
- normalization rules are defensible;
- weights are known or explicitly defined.

### Never invent score math

If raw metrics cannot be defensibly mapped to a common scale, do not fabricate a 0–100 score.

If thresholds, normalization rules, or weights are missing:

1. ask for them, or
2. keep the metrics separate, or
3. clearly label any example score as illustrative.

## 5. If one signal is not defensible, use multi-signal mode

Decision-first does **not** mean everything must collapse into one score.

When metrics cannot responsibly be combined, use:

**Many metrics → minimum sufficient decision signals**

For example:

- Growth: +12.4% — Below target
- Retention: 96.8% NRR — At risk
- Acquisition: 31.7% — Healthy

This is still decision-first if the user can immediately understand the top-level state.

## 6. Handle hard-stop conditions as overrides

Never average critical safety, compliance, security, regulatory, or contractual violations into a reassuring composite score when they independently determine status.

A hard-stop condition overrides the composite or normal status.

Examples:

- “Critical safety event active”
- “Compliance breach detected”
- “Service outage unresolved”

When a hard-stop condition is active:

- it must be promoted to the top level;
- it must not be visually buried in secondary content;
- the dashboard should suspend or subordinate the normal health interpretation.

## 7. Build the decision hierarchy

Recommended sequence:

### Center or primary position: core decision signal

Examples:

- Subscription Health: 68 / 100 — At risk
- Commerce Health: 76 / 100 — Needs attention
- Operational Status: Critical

### Around it: drivers

Show the dimensions that create or explain the state.

Examples:

- Growth
- Retention
- Conversion
- ARPA
- Churn control
- Trial volume

### Sides: evidence with explicit roles

Supporting panels should answer one of these questions:

- **WHY?** What is driving the state?
- **WHERE?** Which segment or area is causing it?
- **WHO?** Which entities require attention?
- **IMPACT?** What business result is affected?

## 8. Separate score inputs from business outcomes

If a dashboard includes both:

- inputs used to calculate a health signal; and
- business results affected by that signal,

label them explicitly.

Example:

- “6 weighted inputs used to calculate Health Score”
- “Outcome impact — Net New MRR”
- “Not included in Health Score”

Do not leave outcome metrics floating as if they were extra score components.

## 9. Express the main causal chain

If one risk is the main drag, the user should not have to assemble the story from scattered hints.

Prefer a visible causal spine such as:

Enterprise churn 6.8% → Retention weakened → Health Score 68 / At risk → MRR growth below target

Use concise summaries, annotations, or ordered supporting panels to make the chain obvious.

## 10. Explain the status in plain language

Never rely on a number alone.

Prefer:

- `68 / 100`
- `At risk`
- `Primary drag: Enterprise churn`
- `-6 vs last month`

instead of only:

- `68`

The dashboard should translate data into judgment.

## 11. Visualize thresholds, not just values

If a threshold determines whether a metric is healthy, encode it visually.

Examples:

- healthy churn is `<2%`
- target growth is `+15%`
- compliance breach is a hard-stop

Color semantics must match the threshold:

- green = healthy
- orange = warning / near threshold
- red = risk / beyond threshold

Do not use semantic colors decoratively.

## 12. Use radar charts selectively

Radar charts are appropriate when:

- 4–7 normalized dimensions describe one overall condition;
- the goal is pattern recognition;
- the user needs to see imbalance across dimensions;
- current vs. previous period comparison is useful.

Do not use a radar chart when exact quantitative comparison is the primary task.

The SaaS example uses a radar chart only as one possible representation.

## 13. One page can contain multiple decision modules

The atomic unit of this skill is a **decision module**.

A single page may contain:

- one **primary** decision module; and
- a few **secondary** decision modules.

Do not let multiple modules collapse back into a KPI soup.

Give one module clear primacy.

## 14. End with action

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
6. What is the business impact?
7. Is there any hard-stop condition overriding normal status?
8. What should I inspect or do next?

If the user still needs to scan many unrelated cards and mentally combine them, simplify further.
