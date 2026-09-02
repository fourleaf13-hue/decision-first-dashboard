---
name: decision-first-dashboard
description: Use when redesigning KPI-heavy dashboards where users must scan multiple independent metrics before understanding overall status, the main risk, whether performance is good enough, or what requires action.
---

# Decision-First Dashboard

## Core principle

Design the conclusion first, then render it as a product interface.

**Many metrics → Minimum sufficient decision signals → Diagnosis → Action**

The method stays backstage. The finished dashboard must look like a mature product, not a diagram explaining the method.

## 1. Define the decision

Identify:

- primary user;
- primary decision;
- primary business outcome;
- what evidence would change the judgment.

Role must change the output:
- **Executive / founder:** synthesis, exceptions, impact, minimal detail.
- **Operator / analyst:** diagnosis, segmentation, drill-down, operational detail.

## 2. Preserve evidence discipline

Do not invent:

- scores or score math;
- targets or thresholds;
- customer states or events;
- workflow buttons or actions;
- causal relationships;
- missing metrics.

Do not generalize a visible sample to the full population.

Direction is not the same as health. If targets are missing, use an evidence-bounded conclusion such as `Improving — target unknown`, `Mixed`, or `Cannot determine against target`.

## 3. Choose exactly one executive visual template

Read `references/visual-pattern.md` before rendering.

### Template A — Composite center

Use only when a defensible composite score/status model already exists.

The center is the dominant focal point and may show the score/status. Supporting inputs visually converge on it. Compact diagnostics sit to the left; compact exceptions, trend, and business impact sit to the right.

### Template B — Multi-signal center

Use when no defensible composite exists.

**Do not fall back to a generic KPI grid.**

The center is still the dominant focal point, but it becomes a compact signal cluster:

- one evidence-bounded status in the middle;
- 3–6 directional signals arranged around or tightly attached to it;
- left side = compact context that explains the movement;
- right side = confirmed exceptions, events, trend, or impact.

The central synthesis must be visual, not a large paragraph card.

## 4. Preserve the supplied visual reference

When `after-reference.png` or another explicit reference is available, inspect it before rendering.

Match its **composition**, not its data:

- dominant center;
- subordinate asymmetric support areas;
- compact cards;
- generous whitespace;
- restrained color;
- no full-width operational table dominating the page;
- one composition rather than three equal report columns.

Do not reinterpret the reference as a generic `left / center / right` report.

## 5. Keep reasoning language out of the UI

Do not expose framework or brief language such as:

- Decision / Primary Decision
- Diagnostic
- Outcome
- Actionable
- Driver
- Required Interventions
- Overall State
- Key Health Metrics Context
- Executive Decision Dashboard

Use domain-native labels such as `Subscription health`, `Revenue growth`, `Accounts to watch`, `Recent events`, `Score trend`, or `Business impact` when supported.

## 6. Hard stops override normal health

Critical safety, compliance, security, regulatory, contractual, or outage conditions override normal status. Never average them into a reassuring composite.

## 7. Finish at the requested output layer

If the user asks for a visual redesign and the host can render/build one, create the actual interface. Do not stop at reasoning or a layout specification.

After rendering, verify every displayed number, label, state, event, threshold, status, action, and chart value against the source.

## Delivery check

A passing executive dashboard should satisfy all of these:

1. Top-level state is understandable in 3–5 seconds.
2. The center is the unmistakable first focal point.
3. Supporting signals visually contribute to the center.
4. Left/right support areas are compact and subordinate.
5. No unsupported score, status, event, action, or causal claim appears.
6. No framework terminology leaks into the product UI.
7. The result feels structurally closer to the supplied After reference than to a standard admin dashboard.
