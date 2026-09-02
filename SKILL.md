---
name: decision-first-dashboard
description: Use when redesigning KPI-heavy dashboards where users must scan multiple independent metrics before understanding overall status, the main risk, whether performance is good enough, or what requires action.
---

# Decision-First Dashboard

## Core principle

Design the user's conclusion before designing the cards.

**Many metrics → Minimum sufficient decision signals → Diagnosis → Action**

Decision-first is an internal design method. The finished interface should look like a mature product, not a diagram explaining the method.

## 1. Define the decision

Before redesigning, identify:

- primary user;
- primary decision;
- primary business outcome;
- what evidence would change the judgment.

The user's role must change the hierarchy:
- **Executive / founder:** more synthesis, impact, exceptions.
- **Operator / analyst:** more diagnosis, segmentation, drill-down.

## 2. Classify the data

Assign each item a role:

- **Outcome:** result the user ultimately cares about.
- **Driver:** explains the outcome or overall condition.
- **Diagnostic:** needed after an abnormal signal appears.
- **Action data:** entity the user can act on.

Do not invent missing metrics, targets, customer states, events, workflows, or causal relationships.

## 3. Choose composite or multi-signal mode

Use one composite signal only when the metrics jointly describe one concept and the normalization, targets/thresholds, and weights are defensible.

**Never invent score math.**

If those rules are missing, use the minimum sufficient primary signals instead.

### Resolve the decision to the limit of the evidence

Do not stop at organizing metrics and make the user reconstruct the conclusion.

If evidence supports a judgment, state it.

If targets or thresholds are missing, use an evidence-bounded status such as:

- `Improving — target unknown`
- `Deteriorating — threshold unknown`
- `Mixed`
- `Cannot determine against target`
- `Insufficient evidence`

Direction is not the same as health. A falling churn rate can be improving while its absolute level is still unevaluable without a threshold.

## 4. Handle hard stops

Critical safety, compliance, security, regulatory, contractual, or outage conditions override normal status.

Never average a hard stop into a reassuring composite.

When active, promote it to the top level and subordinate normal health interpretation.

## 5. Build the visual hierarchy

Prefer one dominant executive composition instead of a strip of equally weighted KPI cards.

When appropriate, use three zones:

- **LEFT — Why / Where:** strongest diagnostics and explanatory context.
- **CENTER — Overall state:** one defensible composite signal, or a compact multi-signal synthesis.
- **RIGHT — Who / Trend / Impact:** action targets, movement over time, and business outcome.

Supporting metrics should visually converge on the central judgment through scale, position, grouping, whitespace, and chart prominence.

See `references/visual-pattern.md`.

## 6. Keep the reasoning backstage

Never expose framework labels such as:

- Decision
- Diagnostic
- Outcome
- Actionable
- Driver
- Success Signal

unless they are established product/domain language.

Do not put the design brief itself in the UI.

Use natural product copy. The hierarchy should be visible without explaining the framework.

## 7. Separate inputs from outcomes

If a composite score exists, distinguish:

- inputs used to calculate it; and
- business outcomes affected by it.

Never make an outcome metric look like an extra score component.

## 8. Show diagnosis without overstating causality

Make the main explanatory path easy to follow, but only claim causality when supported.

Prefer language such as:

- primary drag
- associated with
- likely contributor
- coincides with

when causality is not established.

## 9. Respect evidence scope

Do not generalize a partial table, sample, cohort, or visible subset to the full population.

Example: four displayed accounts out of 8,942 customers do not prove that only one account company-wide is at risk.

Label the scope when it matters to the decision.

## 10. Do not invent status or actions

Do not label the system `Healthy`, `Marginal`, `At risk`, `Critical`, `Good`, or `Bad` unless thresholds, benchmarks, explicit rules, or hard-stop evidence support that judgment.

Do not invent buttons or workflows such as `Contact`, `Convert`, `Escalate`, or `Pause campaign` unless the source product or brief supports them.

If an issue requires attention but the workflow is unknown, surface the issue without fabricating the mechanism.

## 11. Use restrained product-native visuals

Prefer:

- one dominant focal point;
- calm neutral surfaces;
- restrained semantic color;
- generous whitespace;
- compact supporting metrics;
- clear typography;
- natural product terminology.

Avoid:

- traffic-light coloring on every card;
- giant warning banners without evidence;
- four or more equal KPI cards as the default top row;
- explanatory prose inside every card;
- framework labels in parentheses.

Radar charts are optional. Use them only when normalized dimensions legitimately describe one overall condition.

## 12. Finish at the requested output layer

If the user asks for a visual redesign or mockup and the host can render/build one, create the actual interface. Do not stop at reasoning or a layout specification.

If implementation is the available output mode, build the interface in code.

After rendering, verify every displayed:

- number;
- label;
- customer state;
- event;
- threshold;
- status;
- chart value

against the source. Do not let values leak into the wrong chart or context.

## Quick check before delivery

The result should pass all of these:

1. Can the primary user understand the top-level state in 3–5 seconds?
2. Does the interface answer the primary decision as far as the evidence allows?
3. Is the first visual focal point a decision signal rather than a flat KPI strip?
4. Are diagnosis and action targets easy to find?
5. Are unsupported scores, statuses, actions, or causal claims absent?
6. Does the UI look like a real product rather than a decision-framework diagram?
7. Does every displayed value still match the source?
