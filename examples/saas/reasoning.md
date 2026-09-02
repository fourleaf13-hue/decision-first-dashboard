# SaaS Example — Reasoning

## Before

The original dashboard exposes four KPI cards, a revenue trend, recent activity, and a customer table.

The user must manually combine:

- MRR
- active customers
- churn
- trial conversion
- revenue trend
- customer events

before deciding whether the business is healthy.

The visual hierarchy mirrors the database schema more than the user's decision process.

## Primary user

SaaS founder / Head of Growth / Revenue leader.

## Primary decision

> Is subscription health good enough, or is there a problem that requires intervention?

## After

The redesign moves from a data-first model to a decision-first model.

### Core decision signal

**Subscription Health Score: 68 / 100 — At risk**

The score is surrounded by the normalized dimensions that create it:

- Growth — 83
- Retention — 68
- Conversion — 74
- ARPA — 65
- Churn control — 40
- Trial volume — 78

In the demo these six scores average to 68. This is illustrative. In a real product, each raw metric must have an explicit normalization rule and weight before a composite score is used.

### Left-side explanation

The score composition explains which signals are helping and hurting overall health.

Churn by plan provides a diagnostic drill-down.

### Right-side explanation

- Score trend answers: what changed?
- Accounts at risk answers: who requires attention?
- Net new MRR answers: what is the business impact?

## Information transformation

Before:

`Metrics → charts → table → user mentally synthesizes conclusion`

After:

`Decision signal → drivers → diagnosis → affected entities → impact`
