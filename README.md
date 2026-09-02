# Decision-First Dashboard

**Turn dashboards people have to read into dashboards people can understand at a glance.**

Most dashboards organize data. This skill organizes decisions.

> **Many metrics → Minimum sufficient decision signals → Diagnosis → Action**

## Quick start

Install the skill:

```bash
npx skills add fourleaf13-hue/decision-first-dashboard
```

Then give your agent a dashboard screenshot, Figma frame, or existing dashboard code and ask:

> Redesign this dashboard using the `decision-first-dashboard` skill. First identify the primary user and decision. Do not change the visual style until the decision hierarchy is clear.

## Before → After

<table>
  <tr>
    <th width="50%">Before</th>
    <th width="50%">After</th>
  </tr>
  <tr>
    <td width="50%"><img src="examples/saas/before.png" width="100%"></td>
    <td width="50%"><img src="examples/saas/after.png" width="100%"></td>
  </tr>
</table>

### Before

Users scan multiple KPI cards, charts, activity feeds, and tables, then mentally combine them to decide whether the business is healthy.

### After

The dashboard builds that mental model for them:

- one dominant decision signal when one is defensible;
- supporting evidence only where needed;
- diagnostic data at the sides;
- clear action targets;
- explicit distinction between **score inputs** and **outcome impact**.

## Core idea

Do not redesign the dashboard until you can state the user’s decision in one sentence.

The skill asks the designer or agent to determine:

1. Who is looking?
2. What decision are they trying to make?
3. Which metrics can actually change that decision?
4. Can those metrics form **one defensible signal**?
5. If not, what are the **minimum sufficient decision signals**?
6. Which metrics only explain the signal?
7. What entities can the user act on?
8. Is any **hard-stop** condition present that must override normal status?

Only then should the visual hierarchy be redesigned.

## The difference

A typical dashboard redesign improves layout, spacing, typography, and charts.

This skill first asks:

> **What decision should the user be able to make in 5–10 seconds?**

Only then does it redesign the information hierarchy.

## What the skill changes

### Data-first dashboard

```text
KPI   KPI   KPI   KPI

Trend chart      Activity

Customer table
```

### Decision-first dashboard

```text
           PRIMARY DECISION / STATUS

        One dominant signal OR a few primary signals

WHY?                  WHERE?
Drivers              Segment / plan / cohort risk

WHO?                  IMPACT?
Action targets       Business outcome
```

## Important safeguards

### 1) Do not invent composite-score math

Use one composite score only when:

- the component metrics describe the same high-level condition;
- targets or healthy ranges exist;
- normalization rules are defensible;
- weights are known or explicitly defined.

If those inputs are missing, keep metrics separate or clearly mark the score as illustrative.

### 2) Hard-stop metrics override averages

Critical safety, security, compliance, regulatory, or contractual conditions should not be averaged into a reassuring health score when they independently determine status.

### 3) The example visualization is illustrative, not prescribed

The SaaS example uses a radar chart and a central health score because that fit the scenario. The skill does **not** require radar charts or scorecards. The fixed part is the **decision hierarchy**, not the chart type.

## Example: SaaS subscription health

Primary decision:

> Is subscription health good enough, or does something require intervention?

The updated After example organizes the screen around a central **Subscription health** signal.

It distinguishes:

- **Inputs to the Health Score**: Growth, Retention, Conversion, Churn, ARPA, Trial
- **Primary drag**: Enterprise churn at 6.8%
- **Who requires attention**: at-risk accounts
- **Business outcome**: Net New MRR, explicitly labeled as **not included in Health Score**

See [`examples/saas/reasoning.md`](examples/saas/reasoning.md).

## Tests

The repo includes three pressure scenarios:

- [`tests/saas.md`](tests/saas.md)
- [`tests/ecommerce.md`](tests/ecommerce.md)
- [`tests/operations.md`](tests/operations.md)

The Operations test specifically checks that a critical safety or compliance condition overrides any composite score.

## Repository structure

```text
decision-first-dashboard/
├── README.md
├── LICENSE
├── skills/
│   └── decision-first-dashboard/
│       └── SKILL.md
├── examples/
│   └── saas/
│       ├── before.png
│       ├── after.png
│       └── reasoning.md
└── tests/
    ├── saas.md
    ├── ecommerce.md
    └── operations.md
```

## What this is — and isn’t

This is **not** a dashboard template.

This is **not** a visual-style prompt.

It is a reusable decision-design framework for turning:

**many metrics → minimum sufficient decision signals → diagnosis → action**

It combines:

- UX reasoning
- information architecture
- dashboard design
- data visualization
- decision hierarchy
- action-oriented product design

The visual style can change. The decision logic should remain.

## License

MIT
