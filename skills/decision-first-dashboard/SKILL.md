---
name: decision-first-dashboard
description: Use when redesigning KPI-heavy dashboards where users must scan multiple independent metrics before understanding overall status, the main risk, whether performance is good enough, or what requires action.
---

# Decision-First Dashboard

## Core principle

Design the conclusion first, then make the interface visually converge on that conclusion.

**Many metrics → Minimum sufficient decision signals → Diagnosis → Action**

The method stays backstage. The final UI must look like a mature product, not a framework diagram.

## 1. Define the decision

Identify the primary user, primary decision, business outcome, and evidence that would change the judgment.

Executive users need synthesis, exceptions, and impact. Operators need more diagnosis and drill-down.

## 2. Preserve evidence discipline

Never invent scores, score math, targets, thresholds, customer states, events, actions, workflows, missing metrics, or causal claims.

Direction is not the same as health.

If no target/threshold exists, the overall status MUST NOT be `Healthy`, `Health good`, `Marginal`, `At risk`, `Good`, or `Bad`.

Use an evidence-bounded status such as:

- `Improving — target unknown`
- `Deteriorating — target unknown`
- `Mixed — target unknown`
- `Target status unknown`

## 3. Choose one visual mode

### A. Composite mode

Use only when a defensible score/status model already exists.

Make the score/status the dominant center. Arrange validated inputs around it. Keep compact diagnostics on the left and compact exceptions/trend/impact on the right.

### B. No-score executive mode

Use when no defensible composite exists.

**This mode has a hard visual contract. Do not reinterpret it as a standard dashboard.**

The center must be the largest visual region and contain a compact synthesis cluster like this:

```text
        MRR growth        Customer growth
          +12.4%              +8.1%
               \              /
                IMPROVING
              target unknown
               /              \
        Churn direction    Trial conversion
           -0.6pp              +3.2%
```

Rules:

- Put 3–6 directional signals inside or immediately around the center.
- Do NOT render those signals as four equal KPI cards across the top.
- The center must be visual, not a large paragraph.
- Left support: only 1–2 compact context blocks such as revenue trend or segment diagnosis.
- Right support: only 1–3 compact blocks such as accounts to watch, recent events, trend, or business impact.
- Do NOT render a full-width customer table in executive mode unless explicitly requested.
- Do NOT add a top banner such as `HEALTH GOOD`.

## 4. Follow the visual reference literally enough

When `after-reference.png` is provided, inspect it before rendering.

Preserve its geometry and hierarchy:

- dominant center;
- smaller asymmetric side cards;
- compact density;
- generous whitespace;
- restrained color;
- one coherent composition;
- no large operational table dominating the page.

Match composition, not the reference's numbers or score.

## 5. Keep framework language out of the UI

Do not render:

`Executive Decision Dashboard`, `Primary Decision`, `Diagnostic`, `Diagnostic Context`, `Outcome`, `Actionable`, `Required Interventions`, `Overall State`, `Key Health Metrics Context`, `Driver`, `Success Signal`.

Use product-native labels such as `Subscription health`, `Revenue growth`, `Accounts to watch`, `Recent events`, `Score trend`, or `Business impact` when supported.

## 6. Hard stops

Critical safety, compliance, security, regulatory, contractual, or outage conditions override normal status. Never average them into a reassuring composite.

## 7. Render, inspect, and redraw if necessary

If the user asks for a visual redesign and the host can render/build one, create the actual interface.

Before delivering, inspect the rendered result. If ANY condition below is true, redesign it before returning:

- four equal KPI cards form the primary top row;
- overall status says Healthy/Good/Marginal/At risk without source rules;
- a full-width account table dominates executive mode;
- the center is not the first focal point;
- the center is mostly prose rather than a signal cluster;
- framework labels appear;
- invented actions/buttons appear;
- any displayed value/state differs from the source.

A passing result should feel structurally closer to `after-reference.png` than to a conventional admin dashboard.
