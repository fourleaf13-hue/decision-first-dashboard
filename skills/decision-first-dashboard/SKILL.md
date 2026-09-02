---
name: decision-first-dashboard
description: Use when redesigning KPI-heavy dashboards where users must scan multiple independent metrics before understanding overall status, the main risk, whether performance is good enough, or what requires action.
---

# Decision-First Dashboard

## Core principle

Design the user's conclusion before designing the cards.

**Many metrics → Minimum sufficient decision signals → Diagnosis → Action**

Decision-first is an internal design method. The finished interface must look like a mature product, not a diagram explaining the method.

## 1. Define the decision

Identify:

- primary user;
- primary decision;
- primary business outcome;
- what evidence would change the judgment.

Role must change the result:
- **Executive / founder:** synthesis, exceptions, business impact, minimal detail.
- **Operator / analyst:** diagnosis, segmentation, drill-down, operational detail.

## 2. Classify the data

Assign each item a role:

- **Outcome** — result the user ultimately cares about.
- **Driver** — explains the outcome or overall condition.
- **Diagnostic** — needed after a signal looks abnormal.
- **Action data** — entity the user can act on.

Do not invent missing metrics, targets, customer states, events, workflows, or causal relationships.

## 3. Choose composite or multi-signal mode

Use one composite signal only when normalization, thresholds/targets, and weights are defensible.

**Never invent score math.**

If those rules are missing, use the minimum sufficient primary signals instead.

### Resolve the decision to the limit of the evidence

Do not stop at organizing metrics and make the user reconstruct the conclusion.

If evidence supports a judgment, state it. If targets or thresholds are missing, use an evidence-bounded status such as:

- `Improving — target unknown`
- `Deteriorating — threshold unknown`
- `Mixed`
- `Cannot determine against target`
- `Insufficient evidence`

Direction is not the same as health.

## 4. Handle hard stops

Critical safety, compliance, security, regulatory, contractual, or outage conditions override normal status.

Never average a hard stop into a reassuring composite. Promote it to the top level and subordinate normal health interpretation.

## 5. Use the executive composition grammar

For executive/founder dashboards, do **not** default to a KPI strip or a generic three-column report.

Prefer one integrated composition:

- **LEFT — context / diagnosis:** compact evidence explaining why or where.
- **CENTER — dominant synthesis:** the strongest visual region on the page.
- **RIGHT — exceptions / trend / impact:** who needs attention, movement, and business consequence.

The center should normally own roughly **40–50% of the main content width** or otherwise be unmistakably dominant. Left and right should be supporting columns, not peers.

### The center must be a visual synthesis, not a large text card

Do not satisfy this requirement by placing a sentence such as `Metric performance is improving` inside a large rectangle.

Instead, visually combine the primary signals into one coherent composition:

- composite mode: score/status with contributing dimensions arranged around or adjacent to it;
- multi-signal mode: central evidence-bounded status with 3–6 compact directional signals clustered around it;
- use radar, radial, ring, compact matrix, orbit, or another integrated form only when the data supports it.

Supporting signals should visually converge on the central state.

See `references/visual-pattern.md`.

## 6. Follow supplied visual references literally enough to preserve composition

When a reference image is supplied specifically as a visual/composition target, inspect it before rendering.

Preserve its major structural traits unless the user's data makes them invalid:

- dominant center;
- asymmetric supporting columns;
- compact card density;
- whitespace ratio;
- visual balance;
- chart prominence;
- restrained semantic color;
- hierarchy of large vs. small elements.

Do **not** reinterpret a strong reference as a generic dashboard layout.

Use the reference for composition and visual language, **not** as a source of business facts.

## 7. Keep the reasoning backstage

Never expose framework labels such as:

- Decision
- Diagnostic
- Outcome
- Actionable
- Driver
- Success Signal
- Diagnostic Context
- Overall State
- Required Interventions

unless they are established domain language.

Do not put the design brief itself in the UI.

Use domain-native labels such as `Subscription health`, `Revenue growth`, `Accounts to watch`, `Health trend`, or `Business impact` when supported by the product.

## 8. Separate inputs from outcomes

If a composite score exists, distinguish score inputs from business outcomes. Never make an outcome metric look like another score component.

## 9. Show diagnosis without overstating causality

Make the main explanatory path easy to follow, but claim causality only when supported.

When causality is not established, prefer wording such as `primary drag`, `associated with`, `likely contributor`, or `coincides with`.

## 10. Respect evidence scope

Do not generalize a partial table, sample, cohort, or visible subset to the full population.

Four displayed accounts out of 8,942 customers do not prove that only one account company-wide is at risk.

## 11. Do not invent status or actions

Do not label a system `Healthy`, `Marginal`, `At risk`, `Critical`, `Good`, or `Bad` unless thresholds, benchmarks, rules, or hard-stop evidence support that judgment.

Do not invent buttons or workflows such as `Contact`, `Convert`, `Intervene`, `Escalate`, or `Pause campaign` unless the source product or brief supports them.

If an issue requires attention but the workflow is unknown, surface the issue without fabricating the mechanism.

## 12. Keep executive detail compact

For executive mode, do not add a full-width customer table merely because one exists in the source.

Prefer the minimum actionable subset: a compact account list, exception card, or short ranked set.

Keep a full table only when:

- the table itself is the primary decision/action surface;
- the user explicitly asks for operational account management; or
- removing it would discard essential information with no compact substitute.

## 13. Use restrained product-native visuals

Prefer:

- one dominant focal point;
- calm neutral surfaces;
- restrained accent color;
- generous whitespace;
- compact supporting metrics;
- clear typography;
- natural product terminology.

Avoid:

- traffic-light coloring on every card;
- giant warning banners without evidence;
- four or more equal KPI cards as the default top row;
- explanatory prose inside every card;
- framework labels in parentheses;
- three equal columns with section headings that merely restate the framework.

Radar charts are optional, never mandatory.

## 14. Finish at the requested output layer

If the user asks for a visual redesign or mockup and the host can render/build one, create the actual interface. Do not stop at reasoning or a layout specification.

After rendering, verify every displayed number, label, customer state, event, threshold, status, chart value, and action against the source.

## Quick check before delivery

1. Can the primary user understand the top-level state in 3–5 seconds?
2. Does the interface answer the primary decision as far as the evidence allows?
3. Is the center a real visual synthesis rather than a large sentence card?
4. Does the composition preserve the supplied reference's dominant-center structure when one was provided?
5. Are diagnosis and exceptions compact and easy to find?
6. Are unsupported scores, statuses, actions, or causal claims absent?
7. Does the UI look like a real product rather than a framework diagram or consulting slide?
8. Does every displayed value still match the source?
