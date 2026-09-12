---
name: decision-first-dashboard
description: Use when redesigning KPI-heavy dashboards where users must scan multiple independent metrics before understanding overall status, the main risk, whether performance is good enough, or what requires action.
---

# Decision-First Dashboard

## Core principle

Decision-First does not mean Minimal-Data. Preserve rich evidence, create strong hierarchy, and expose only justified meaning.

**Source / context → Worthiness Assessment → worthiness gate → Decision Brief → intake gate → Metric Routing Manifest → grounded evidence bundle → routing + grounding gates → deterministic renderer → canonical HTML / SVG + output.manifest.json**

The agent may assess whether a dashboard is warranted, clarify decision intent, extract and classify evidence, and propose routing. It may not invent source support, bypass worthiness/intake/routing/grounding gates, or choose a free-form dashboard layout during ordinary compilation.

A dashboard earns first-view screen space only when the information can change a decision, trigger an action, surface an exception, explain a primary signal, or support deliberate drill-down.

## Mandatory execution contract

This contract applies whenever the skill is actually invoked for a dashboard redesign.

1. **Do not render before intake passes.** A screenshot, dataset, title, KPI mix, or domain pattern may establish source facts but cannot by itself confirm business intent. If Decision or Action is not explicitly confirmed, stop and ask one question. Do not generate an image, HTML, SVG, React app, dashboard artifact, Key Insights, or action recommendations first.
2. **The agent must not render UI.** The agent prepares structured inputs; `compile-dashboard.js` owns canonical production delivery.
3. **No free-form fallback.** If the runtime cannot execute the production scripts, stop at the unresolved question or structured state. Do not substitute an agent-authored dashboard.
4. **Canonical After means exact compiler output.** The primary After is the HTML bytes written by `compile-dashboard.js`. Do not treat that HTML as a reference and redraw it afterward.
5. **Require provenance.** Canonical HTML/SVG must carry the compiler provenance markers and the run must emit `output.manifest.json`. A visually similar artifact without canonical provenance is not the official Decision-First output.

Host-level skill discovery is outside the repository's control. A generic product request may still fail to invoke an installed skill in some environments; measure that separately with live product tests. Once this skill is invoked, the execution contract above is mandatory.

## Three layers

### Layer 1 — Agent intelligence

The agent may:

- produce a structured Worthiness Assessment from explicit user/context evidence;
- build a structured adaptive Decision Brief;
- extract literal source facts;
- classify every extracted metric with the Metric Router;
- produce a Metric Routing Manifest;
- choose a proposed evidence mode;
- create evidence anchors and claim references.

The agent must not render UI, fabricate score-model evidence, or decide its own worthiness transition. **The agent does not choose or set the transition; the compiler owns the transition.**

### Layer 2 — Compiler contract

The production compiler validates, in order:

1. Worthiness Assessment against `schemas/worthiness-assessment.schema.json` plus semantic consistency rules;
2. Decision Brief against `schemas/decision-brief.schema.json`;
3. confirmed Decision + Action before routing, plus exact binding into the routing manifest;
4. Metric Routing Manifest against `schemas/metric-routing.schema.json` and semantic rules;
5. exact agreement between routed `primary_signal` metrics and visible center metrics/components;
6. exact agreement between no-score diagnostics routed as supporting and `decisionState.supportingSignals`;
7. active-exception surfacing rules;
8. the closed grounded-bundle and decision-state contracts;
9. source SHA-256, evidence integrity, exact JSON Pointer/text-span grounding, and required claim coverage;
10. composite score mathematics and score-band semantics.

Worthiness transitions:

- `BUILD_DECISION_BRIEF`
- `ASK_WORTHINESS_QUESTION`
- `REDIRECT_NON_DASHBOARD`
- `FIX_WORTHINESS_ASSESSMENT`

Decision Brief intake transitions:

- `ALLOW_ROUTING`
- `ASK_DECISION_BRIEF_QUESTION`
- `FIX_DECISION_BRIEF`

Downstream transitions:

- `PASS`
- `FIX_METRIC_ROUTING`
- `RETURN_TO_EVIDENCE_EXTRACTION`
- `FALLBACK_TO_NO_SCORE`
- `FIX_DECISION_STATE`

### Layer 3 — Deterministic renderer

`render.js` consumes only validated decision state and fills deterministic SVG/HTML compositions. It does not inspect hidden routing inventory, source data, or invent business meaning.

`drilldown`, `scorecard_only`, and diagnostics routed `on_demand` remain preserved for traceability without becoming eager first-view clutter. Only diagnostics explicitly routed with `visibility: "supporting"` may enter the closed `supportingSignals` layer and render as subordinate context.

## Workflow

### 1. Run the Dashboard Worthiness Test

Before starting the Decision Brief or committing to dashboard output, ask whether the request deserves to become a persistent dashboard at all. Reuse context already supplied, ask one question at a time only when needed, and count Worthiness questions toward the same **five-question total intake budget** used by the Decision Brief.

A dashboard is justified when the workflow has a real recurring decision or recurring monitoring loop, a clear **accountability path**, and a meaningful response that changes when an important signal changes. An accountability path may be a single owner, an on-call team, a distributed responsible team, or a recurring **shared decision forum**.

Use three tests:

1. **Recurring Loop Test** — recurring decision, review, or exception-monitoring loop rather than a one-off question.
2. **Accountability Path Test** — identifiable person, team, or shared forum accountable for responding.
3. **Response Change Test** — when a material signal changes, an action, priority, escalation, intervention, or coordination changes.

**Visibility alone is not a decision and is not sufficient justification for a dashboard.**

The compiler, not the agent, determines the transition. If the request fails the Worthiness Test, **do not build or render a dashboard** by default. Recommend the smallest fitting alternative such as a **one-off analysis**, **scheduled summary**, **alert**, **report**, or **chat/query** workflow.

If the user explicitly chooses a dashboard after seeing that trade-off, `userOverride: true` may enter the Decision Brief, but it does not bypass intake, Metric Router, grounding, or rendering contracts.

Worthiness is design context, not source evidence. The machine gate verifies schema and semantic consistency; it does not prove the agent interpreted natural-language intent correctly.

### 2. Build an adaptive Decision Brief

Before routing metrics or choosing a visual mode, establish the minimum decision context needed to design the dashboard. Ask **one question at a time**, ask **no more than five questions** total across Worthiness + Decision Brief intake, and **stop immediately once enough information** exists.

**Intent-confirmation gate:** a **screenshot cannot satisfy the Decision Brief** by itself. Unless the user has **explicitly stated both the Decision and the Action** in the request or prior conversation, ask **at least one question** and obtain confirmation before Metric Router classification or rendering.

The intake dimensions are a question pool, not a fixed questionnaire:

- **Decision** — what should the dashboard help determine?
- **Action** — what decision or action changes when an important signal changes?
- **Exception** — what condition deserves immediate attention?
- **Diagnosis** — where should the user investigate next after a problem appears?
- **Audience / cadence** — who uses it, how quickly, and how often?

Use two notions of known:

- **Observed source fact** — directly visible or mechanically extracted. **Never ask the user to repeat source facts** already available.
- **Business intent** — Decision, Action, exception policy, diagnosis priority, and audience/cadence. It is confirmed only when explicitly supplied or explicitly confirmed by the user.

An **inferred candidate requires confirmation**. Do not use **“inferable from the data”** to **skip confirmation** of **business intent**.

After each answer, evaluate sufficiency. The zero-question path is narrow: use it only when the user's request or already-established context explicitly states both Decision and Action and Worthiness is already resolved. Source data alone never qualifies.

If the user is unsure:

1. offer **2–4 concrete choices** grounded in known context;
2. include an “I'm not sure — help me decide” path;
3. **infer the most defensible answer from the data** only as a candidate and **ask for confirmation**;
4. otherwise leave the dimension unresolved.

**Do not invent a threshold.**

Support both intake orders:

- **data-first** — **profile the uploaded data before asking**, then ask only for missing decision context;
- **question-first** — clarify decision context first, then **request only the data needed**.

The Decision Brief is internal design context. It is not automatically source evidence and **no compiler/framework methodology labels in visible UI** are permitted.

The structured brief must match `schemas/decision-brief.schema.json`. `scripts/intake.js` requires both Decision and Action to have `status: "confirmed"`. Otherwise the pipeline returns `ASK_DECISION_BRIEF_QUESTION` and produces no dashboard artifact.

### 3. Extract verified facts only

Capture only source-supported metrics, deltas, states, events, targets, thresholds, and score rules. Never invent scores, targets, thresholds, customer states, events, workflows, actions, or causal claims. Direction is not the same as health.

### 4. Route every extracted metric

Use the **Metric Router** when the source exposes more metrics than a user can reasonably scan at first view. The canonical stress case is **70-KPI overload**.

> **Preserve everything without showing everything.**

The routing manifest must match `schemas/metric-routing.schema.json`. It contains the confirmed `decision`, confirmed `action`, `inventoryCount`, and one routing entry per extracted metric. `inventoryCount` must equal the inventory size.

Route every metric to exactly one role:

- `primary_signal` — directly changes the main decision/action;
- `diagnostic` — explains a routed primary signal or exception;
- `exception` — breach, outlier, critical account/event, or hard-stop condition;
- `drilldown` — useful after deliberate investigation starts;
- `scorecard_only` — retained for completeness/audit but not promoted to the decision-first view.

Apply the **Action Trigger Test**: if this metric changes materially, what decision or action changes?

Do not promote metrics merely because they are relevant. If one mainly explains another primary signal, or is a **complementary slice** of the same distribution, route it as diagnostic unless a material change **independently alters the confirmed decision or action**.

Compiler-enforced routing rules:

- `primary_signal` requires `changesDecision: true`, non-empty `decisionImpact`, and `visibility: "first_view"`;
- 3–6 primary signals are allowed in the current renderer;
- routed primaries must exactly equal rendered center metrics/components;
- diagnostics require `changesDecision: false`, an `explains` target, and `supporting` or `on_demand` visibility;
- no-score `supportingSignals` **must exactly equal** diagnostics routed as supporting;
- **at most four diagnostics** may use supporting visibility; **additional diagnostics must use `on_demand`**;
- `drilldown` stays `on_demand`; `scorecard_only` stays `scorecard`;
- **active exceptions cannot be hidden** and must resolve through `surfacePath` to a rendered exception/event;
- current **first-view information budget** is at most 11 decision items: 3–6 primary signals plus active exceptions;
- supporting diagnostics have a separate four-item subordinate budget.

A supporting semantic mismatch returns `FIX_METRIC_ROUTING`; missing evidence returns `RETURN_TO_EVIDENCE_EXTRACTION`.

### 5. Choose the evidence mode

Use `composite` only when the source already provides overall score/scale, normalized component scores, component weights, a weighted-average aggregation rule, and complete score bands.

If any required composite fact cannot be mechanically grounded, return `FALLBACK_TO_NO_SCORE`. Never invent score math.

For `no_score`, do not create a synthetic overall score or health band.

**Radar eligibility is independent of overall-score eligibility.** A no-score radar requires **3–6 peer dimensions** describing the same object/condition, one shared source-backed numeric scale, and a **source-grounded `normalizedScore`** for every displayed dimension. **Fewer than three dimensions are not radar-eligible.**

A radar must pass:

- **Profile Test** — 3–6 peer dimensions, same object, same grounded scale;
- **Action Trigger Test** — every displayed radar dimension is also a routed primary signal.

Never connect heterogeneous raw KPIs merely because several numbers exist.

### 6. Build a grounded bundle

The grounded bundle stays separate from the routing inventory and must match `schemas/grounded-bundle.schema.json`; `decisionState` must independently match `schemas/decision-state.schema.json`.

Supported grounding:

- JSON → `json_pointer` anchor;
- text → exact `text_span` anchor.

The compiler verifies source SHA-256. Screenshot workflows should first create a verifiable text/JSON sidecar for claims that need byte-level grounding.

### 7. Required grounding coverage

Ground every source-dependent field that becomes visible. Composite additionally grounds the complete score model. No-score radar additionally grounds `radarScale.min/max` and each `normalizedScore`.

Do not ground deterministic renderer synthesis or Metric Router roles as if they were source facts.

### 8. Compile through all gates

Canonical production execution:

```bash
node scripts/compile-dashboard.js <worthiness-assessment.json> <decision-brief.json> <routing-manifest.json> <grounded-bundle.json> <output-dir>
```

Before that, the individual preflight evaluators may be run directly:

```bash
node scripts/worthiness.js <worthiness-assessment.json>
node scripts/intake.js <decision-brief.json>
```

`FIX_WORTHINESS_ASSESSMENT`, `ASK_WORTHINESS_QUESTION`, `REDIRECT_NON_DASHBOARD`, `FIX_DECISION_BRIEF`, or `ASK_DECISION_BRIEF_QUESTION` produces no final SVG/HTML. Only `ALLOW_ROUTING` may enter Metric Router validation.

On final `PASS`, the CLI writes:

- `no_score` → `output.no-score.html` + `output.no-score.svg`;
- `composite` → `output.composite.html` + `output.composite.svg`;
- both modes → `output.manifest.json`.

### Primary delivery contract

The **primary After deliverable is HTML** whenever file generation is available. Present or link the canonical `output.no-score.html` or `output.composite.html` first.

SVG is a deterministic preview/regression artifact. A screenshot, PNG, SVG, mockup, or concept image alone does not complete an ordinary redesign when the HTML renderer is available.

Every canonical HTML includes `decision-first-renderer=canonical` provenance metadata; SVG contains `<metadata id="decision-first-provenance">`; `output.manifest.json` records the source, Worthiness, Decision Brief, routing, grounded bundle, decision-state, HTML, and SVG hashes.

Do not regenerate a separate free-form image or app as the “real” After. If the runtime cannot execute the production compiler, do not fake a substitute.

`compile.js`, `validate.js`, and `render.js` remain lower-level compatibility/testing tools. They are not substitutes for `compile-dashboard.js` in ordinary production workflows.

### 9. Follow failure transitions literally

- `FIX_WORTHINESS_ASSESSMENT` → repair the structured assessment;
- `ASK_WORTHINESS_QUESTION` → ask the minimum missing Worthiness question;
- `REDIRECT_NON_DASHBOARD` → stop dashboard compilation;
- `BUILD_DECISION_BRIEF` → continue to Decision Brief, not final render;
- `FIX_DECISION_BRIEF` → repair malformed intake state;
- `ASK_DECISION_BRIEF_QUESTION` → ask one high-information question for unresolved Decision/Action;
- `ALLOW_ROUTING` → continue to Metric Router;
- `FIX_METRIC_ROUTING` → repair routing; do not bypass it;
- `RETURN_TO_EVIDENCE_EXTRACTION` → repair evidence/claims;
- `FALLBACK_TO_NO_SCORE` → abandon unsupported composite scoring;
- `FIX_DECISION_STATE` → repair contract/schema errors;
- `PASS` → deliver the exact canonical compiler outputs.

## Visual contract

The renderer owns layout only after all upstream gates have passed.

For `no_score`:

- true radar only when all eligible primary dimensions have grounded normalized scores on one grounded scale;
- otherwise use the non-radar signal layout without fake spokes;
- one lead primary signal may be the dominant focal point;
- validated `supportingSignals` render as lower-weight diagnostic context and collapse when absent;
- primary-only center layouts use the compact density path;
- support modules appear only when source-supported.

For `composite`:

- source-supported score/band;
- 3–6 normalized weighted components may form a true radar;
- compact trend/composition and exception/event support only when grounded.

For both modes:

- no flat four-equal-KPI wall;
- no dominant full-width table;
- no invented action controls, targets, scores, weights, thresholds, trend facts, or insights;
- product-native source-derived copy only;
- no compiler/framework methodology labels in visible UI;
- **soft attention is the default**;
- hard alert treatment requires source-grounded severity/threshold, hard-stop status, or explicit user alert policy;
- negative/critical states may not be cosmetically suppressed.

See `references/visual-pattern.md` and `references/visual-stack-routing.md`.

## Hard stops

Safety, compliance, security, regulatory, contractual, or outage conditions override ordinary synthesis. Never average an active hard stop into a reassuring status.

## Agent E2E regression

The repository contains a recorded ambiguous-prompt regression based on a real Sales Dashboard screenshot and the user request:

> 帮我 redesign 一下这个 dashboard，感觉信息很多但不好用。

The passing first turn asks one question covering missing Decision/Action context and produces no artifact. A recorded native-artifact response that skips intake is rejected by `scripts/agent-eval.js`.

This harness verifies a recorded first-turn contract. It is not a live model benchmark and cannot guarantee that a host product will automatically invoke the skill for every generic dashboard prompt.

## Final gate

Before delivery, verify:

- Worthiness schema passes and the compiler owns the transition;
- unresolved Worthiness never silently passes;
- accountability may be one owner, team, or shared forum;
- redirects stop rendering unless the user explicitly overrides;
- Decision Brief follows the one-question-at-a-time / five-question budget;
- source facts were not mistaken for business intent;
- Decision and Action are explicitly confirmed before routing;
- `schemas/decision-brief.schema.json` passes and `intake.js` returns `ALLOW_ROUTING`;
- routing Decision/Action exactly preserve confirmed intake wording;
- `schemas/metric-routing.schema.json` passes and `inventoryCount` is complete;
- every primary passes the Action Trigger Test;
- diagnostics remain subordinate and complementary slices do not inflate primaries;
- active exceptions surface correctly;
- first-view budgets are respected;
- grounding schema, source SHA-256, evidence references, and visible claim coverage pass;
- no unsupported score/status/target/action/insight appears;
- no framework or compiler labels leak into visible UI;
- HTML is the primary After deliverable;
- final HTML/SVG contain canonical provenance and `output.manifest.json` exists;
- the delivered After is the exact compiler output, not a free-form redraw;
- outputs contain no unresolved template tokens.
