# Decision-First Dashboard

**Turn dashboards people have to read into dashboards people can understand at a glance.**

Most dashboards organize data. This skill organizes decisions.

> **Many metrics → One decision signal → Drivers → Diagnosis → Action**

## Before → After

<table>
  <tr>
    <th width="50%">Before</th>
    <th width="50%">After</th>
  </tr>
  <tr>
    <td width="50%">
      <img src="examples/saas/before.png" width="100%">
    </td>
    <td width="50%">
      <img src="examples/saas/after.png" width="100%">
    </td>
  </tr>
</table>

### Before

Users scan multiple KPI cards, charts, activity feeds, and tables, then mentally combine them to decide whether the business is healthy.

### After

The dashboard builds that mental model for them:

- one dominant decision signal;
- explicit drivers around it;
- supporting evidence at the sides;
- diagnostic data only where needed;
- action-oriented entities when intervention is required.

## Core idea

Do not redesign the dashboard until you can state the user's decision in one sentence.

The skill asks the designer/agent to determine:

1. Who is looking?
2. What decision are they trying to make?
3. Which metrics can actually change that decision?
4. Can those metrics form one defensible decision signal?
5. Which metrics only explain the signal?
6. What entities can the user act on?

Only then should the visual hierarchy be redesigned.

## Install

Install this skill with any Agent Skills-compatible client:

```bash
npx skills add fourleaf13-hue/decision-first-dashboard
```

The skill file lives at:

```text
skills/decision-first-dashboard/SKILL.md
```

## What the skill changes

### Data-first dashboard

```text
KPI   KPI   KPI   KPI

Trend chart      Activity

Customer table
```

### Decision-first dashboard

```text
                CORE DECISION SIGNAL

                 Health / Status

        Driver       Driver       Driver

 WHY?                                        WHERE?
 Score composition                         Segment risk

 IMPACT?                                     WHO?
 Outcome movement                         At-risk entities
```

## Important safeguards

### Do not invent composite-score math

A health score is appropriate only when:

- component metrics describe the same high-level condition;
- targets or healthy ranges exist;
- normalization rules are defensible;
- weights are known or explicitly defined.

If those inputs are missing, keep metrics separate or clearly mark the score as illustrative.

### Hard-stop metrics override averages

Critical safety, security, compliance, or regulatory conditions should not be averaged into a normal-looking health score when they independently determine status.

## Example: SaaS subscription health

Primary decision:

> Is subscription health good enough, or does something require intervention?

The After example organizes the screen around a central **Subscription Health** signal, with supporting information answering:

- **WHY?** What is driving the score?
- **WHERE?** Which plan is causing churn?
- **WHO?** Which accounts are at risk?
- **IMPACT?** What is happening to Net New MRR?

See [`examples/saas/reasoning.md`](examples/saas/reasoning.md).

## Tests

The repo includes three pressure scenarios:

- [`tests/saas.md`](tests/saas.md)
- [`tests/ecommerce.md`](tests/ecommerce.md)
- [`tests/operations.md`](tests/operations.md)

The Operations test specifically checks that a critical safety condition overrides any composite score.

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

## Positioning

This is not a visual-style prompt.

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
