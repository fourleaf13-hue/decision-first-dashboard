---
name: decision-first-dashboard
description: Use when redesigning KPI-heavy dashboards where users must scan multiple independent metrics before understanding overall status, the main risk, whether performance is good enough, or what requires action.
---

# Decision-First Dashboard

## Core principle

Separate agent judgment from compiler judgment and deterministic rendering.

**Source → Dashboard Worthiness Test → Decision Brief → Metric Routing Manifest → grounded evidence bundle → routed compiler gate → deterministic renderer → SVG / HTML**

The agent may assess whether a dashboard is warranted, clarify decision intent, extract and classify evidence, and propose routing. It may not invent source support, bypass routing/grounding gates, or choose a free-form dashboard layout during ordinary compilation.

A dashboard earns first-view screen space only when the information can change a decision, trigger an action, surface an exception, explain a primary signal, or support deliberate drill-down.

## Three layers

### Layer 1 — Agent intelligence

The agent may:

- run the Dashboard Worthiness Test before committing to dashboard output;
- build an adaptive Decision Brief from user context and source structure;
- extract literal source facts;
- classify every extracted metric with the Metric Router;
- produce a Metric Routing Manifest;
- choose a proposed evidence mode;
- create evidence anchors and claim references.

The agent must not render UI or fabricate score-model evidence.

### Layer 2 — Compiler contract

Code decides whether routing and grounding can proceed.

The production compiler validates, in order:

1. the Metric Routing Manifest and its semantic rules;
2. exact agreement between routed `primary_signal` metrics and the visible center metrics/components;
3. active-exception surfacing rules;
4. the closed grounded-bundle contract;
5. the closed `decision-state` contract;
6. source file SHA-256;
7. evidence reference integrity;
8. exact JSON Pointer or text-span grounding;
9. required claim coverage;
10. composite score mathematics and score-band semantics.

Machine-readable transitions are:

- `PASS`;
- `FIX_METRIC_ROUTING`;
- `RETURN_TO_EVIDENCE_EXTRACTION`;
- `FALLBACK_TO_NO_SCORE`;
- `FIX_DECISION_STATE`.

### Layer 3 — Deterministic renderer

`render.js` consumes only validated decision state and fills fixed SVG/HTML templates. It does not inspect the hidden routing inventory, source data, or invent business meaning.

Keeping hidden routing inventory out of the renderer is intentional: metrics assigned to `diagnostic`, `drilldown`, or `scorecard_only` stay preserved for traceability without becoming hidden DOM, eager chart work, or first-view clutter.

## Workflow

### 1. Run the Dashboard Worthiness Test

Before starting the Decision Brief or committing to dashboard output, ask whether the request deserves to become a persistent dashboard at all. This is a lightweight preflight, not a separate questionnaire: reuse context already supplied, ask one question at a time only when needed, and count any worthiness questions toward the same **five-question total intake budget** used by the Decision Brief.

A dashboard is justified when the workflow has a real recurring decision or recurring monitoring loop, a clear owner who is accountable for that decision or exception, and a meaningful action that changes when an important signal changes. A monitoring dashboard can qualify when a recurring exception changes attention, escalation, or intervention.

Use three tests:

1. **Recurring Decision Test** — is there a recurring decision, review, or exception-monitoring loop rather than a one-off question?
2. **Owner Test** — is there a clear owner or accountable audience who acts on the result?
3. **Action Change Test** — when a material signal changes, does a decision, priority, escalation, or action change?

**“Visibility” alone is not a decision and is not sufficient justification for a dashboard.** Wanting to feel informed, copy an old report, or fill a reporting slot does not automatically pass the test.

If the request fails the Worthiness Test, **do not build or render a dashboard by default**. Explain the mismatch briefly and recommend the smallest format that fits the actual job, such as a **one-off analysis**, **scheduled summary**, **alert**, **report**, or **chat/query** workflow. Do not continue into Metric Routing or deterministic rendering merely because the user originally asked for a dashboard.

If the user explicitly chooses a dashboard after seeing that trade-off, proceed as a user-requested exception, but still apply the Decision Brief, Metric Router, grounding, and rendering contracts. Worthiness judgment is design context, not source evidence.

### 2. Build an adaptive Decision Brief

Before routing metrics or choosing a visual mode, establish the minimum decision context needed to design the dashboard. Tell the user briefly that better dashboard design requires a few questions. Ask **one question at a time**, ask **no more than five questions total across Worthiness + Decision Brief intake**, and **stop immediately once enough information** exists to route metrics and make a defensible design decision.

**Intent-confirmation gate:** a screenshot, uploaded dataset, dashboard title, visible KPI mix, domain pattern, or source structure can establish data facts and suggest candidate intent, but a **screenshot alone cannot satisfy the Decision Brief**. Unless the user has **explicitly stated both the Decision and the Action** in the request or prior conversation, ask **at least one question** and obtain user confirmation before Metric Router classification or rendering.

The five intake dimensions are a question pool, not a fixed questionnaire:

- **Decision** — what should the dashboard help the user determine?
- **Action** — what decision or action changes when an important signal changes?
- **Exception** — what condition deserves immediate attention?
- **Diagnosis** — where should the user investigate next after a problem appears?
- **Audience / cadence** — who uses the dashboard, how quickly must they understand it, and how often is it reviewed?

Use two notions of “known”:

- **Observed source fact** — directly visible or mechanically extracted from source. Never ask the user to repeat source facts already present in the request, prior answers, or source structure.
- **Business intent** — Decision, Action, exception policy, diagnosis priority, and audience/cadence. This is confirmed only when explicitly supplied by the user or confirmed by the user after the agent proposes an inferred candidate.

An **inferred candidate requires confirmation**. It may make the next question easier, but it does not count as a completed Decision Brief until the user responds. Do not use “inferable from the data” as a reason to skip confirmation of business intent.

After every answer, run an information-sufficiency check. If the confirmed Decision, confirmed Action, and relevant Exception, Diagnosis, or Audience context provide enough information for routing, stop. Do not ask all five questions merely for completeness.

The zero-question path is narrow: use it only when the user's request or already-established conversation context explicitly states both what the dashboard should help decide and what action/prioritization changes based on that decision, and the Worthiness Test can also be resolved from already-established context. Source data by itself never qualifies.

If the user is unsure:

1. reduce the open question to **2–4 concrete choices** grounded in known context;
2. include an explicit “I'm not sure — help me decide” path;
3. if uncertainty remains, **infer the most defensible answer from the data** and **ask for confirmation**;
4. if the data cannot support a defensible inference, leave that dimension unresolved and proceed conservatively.

**Do not invent a threshold.** Use only source-backed targets, historical ranges, peer baselines, or explicit rules when they exist.

Support both intake orders:

- **data-first** — **profile the uploaded data before asking**. Identify fields, metrics, dimensions, time range, targets/benchmarks, and evidence gaps; then ask only for missing decision context.
- **question-first** — clarify the decision context first, then **request only the data needed** to support that decision, its diagnosis path, relevant exceptions, and evidence mode.

The Decision Brief is internal design context. It may guide routing and information hierarchy, but it is not automatically source evidence.

### 3. Extract verified facts only

Identify the primary user and decision from the Decision Brief, then capture only source-supported metrics, deltas, account states, events, targets, thresholds, and score rules.

Never invent scores, targets, thresholds, customer states, events, workflows, actions, or causal claims. Direction is not the same as health.

### 4. Route every extracted metric

Use the **Metric Router** whenever the source exposes more metrics than a user can reasonably scan at first view. The canonical stress case is **70-KPI overload**: a source may contain roughly 70 valid KPIs, but validity does not make every KPI a first-view peer.

> **Preserve everything without showing everything.**

Preserve the full extracted metric inventory in a separate routing manifest. The manifest must match:

`schemas/metric-routing.schema.json`

It contains confirmed `decision`, confirmed `action`, `inventoryCount`, and one routing entry per extracted metric. `inventoryCount` must equal the number of routing entries; duplicate or missing metric routes are invalid.

Route each metric to exactly one role:

- `primary_signal` — directly changes the main decision or next action;
- `diagnostic` — explains a routed primary signal or exception;
- `exception` — a breach, outlier, critical account/event, or hard-stop condition requiring attention;
- `drilldown` — useful only after deliberate investigation begins;
- `scorecard_only` — retained for completeness, audit, or secondary scorecard use, but not promoted to the decision-first view.

Apply the **Action Trigger Test** to every candidate metric:

1. If this metric changes materially, does the user's decision or action change?
2. If yes in the ordinary decision loop, route it to `primary_signal` and state the `decisionImpact`.
3. If a threshold, safety, compliance, contractual, outage, or other critical condition is breached, route it to `exception`.
4. If it mainly explains a primary signal or exception, route it to `diagnostic` and identify what it `explains`.
5. If it matters only after investigation begins, route it to `drilldown`.
6. If no decision, action, diagnosis, or exception handling changes, route it to `scorecard_only`.

Compiler-enforced routing rules:

- `primary_signal` must have `changesDecision: true`, a non-empty `decisionImpact`, and `visibility: "first_view"`.
- The current deterministic renderer accepts **3–6 primary signals**; more than six fails the first-view information budget instead of silently squeezing more KPI peers into the layout.
- The routed `primary_signal` metric IDs must exactly equal `decisionState.signals[*].metric` in `no_score`, or `decisionState.model.components[*].metric` in `composite`.
- `diagnostic` metrics must have `changesDecision: false`, must point via `explains` to a routed `primary_signal` or `exception`, and must stay `supporting` or `on_demand`.
- `drilldown` metrics must stay `on_demand`.
- `scorecard_only` metrics must stay `scorecard` and cannot claim to change the current decision.
- **Active exceptions cannot be hidden** because a stakeholder dislikes red or negative states. An active exception must use `visibility: "first_view"` and its `surfacePath` must resolve to an actually rendered `/exceptions/<n>` or `/events/<n>` item in the decision state.
- Current first-view information budget is at most 11 decision items: 3–6 primary signals plus active exceptions. Do not solve overload by shrinking type or adding more equal-weight cards.
- Do not promote a metric because it is easy to visualize, numerically large, or already placed in a KPI card.
- Do not leak role labels such as `primary_signal` or `scorecard_only` into product UI.

The routing manifest is a durable decision trace. It preserves what was considered, why it was promoted or demoted, and what would change the decision, so later analysis does not have to rediscover the same KPI-prioritization logic from scratch.

### 5. Choose the evidence mode

The compiler supports two mutually exclusive decision-state modes.

Use `composite` only when the source already provides all of the following:

- an overall score and score scale;
- normalized component scores;
- component weights;
- a weighted-average aggregation rule;
- complete score bands / thresholds that determine displayed status.

Composite accepts only:

- `normalization: "source_provided"`;
- `aggregation: "weighted_average"`;
- source-grounded score, component, weight, band, exception, event, and trend facts.

If any required composite scoring fact cannot be mechanically grounded, transition to `FALLBACK_TO_NO_SCORE`. Do not fill gaps with inferred formulas, guessed weights, or invented benchmarks.

For `no_score`, do not create `Healthy`, `Marginal`, `At risk`, or a 0–100 overall score. Overall direction remains a deterministic renderer derivation from validated signal directions.

**Radar eligibility is independent of overall-score eligibility.** A `no_score` dashboard may render a closed radar profile only when the source explicitly provides:

- **3–6 peer dimensions** describing the same object or condition as one profile;
- one shared, source-backed numeric scale in `radarScale.min` / `radarScale.max`;
- a source-grounded `normalizedScore` for every displayed dimension.

Three dimensions are sufficient and render as a triangle. **Fewer than three dimensions are not radar-eligible.** Four to six dimensions render with the corresponding number of vertices.

Radar is a profile chart, not a generic multi-metric chart. Do not connect heterogeneous raw KPIs such as revenue dollars, customer counts, percentages, latency, ratios, or unrelated business outcomes merely because several numbers exist.

A radar must pass two gates:

- **Profile Test** — 3–6 peer dimensions, same object, same grounded scale;
- **Action Trigger Test** — every displayed radar dimension must also be a routed `primary_signal`, meaning a material change can alter the confirmed decision or action.

If the Profile Test passes but the Action Trigger Test fails, keep those dimensions in diagnostic/drilldown/scorecard layers instead of using a decorative radar as the dominant visual.

### 6. Build a grounded bundle

The grounded bundle remains separate from the routing inventory and contains only facts used by the rendered decision state:

```json
{
  "source": {
    "kind": "json",
    "path": "source.json",
    "sha256": "..."
  },
  "decisionState": {},
  "evidence": [],
  "claims": []
}
```

The envelope must match `schemas/grounded-bundle.schema.json` and `decisionState` must independently match `schemas/decision-state.schema.json`.

Supported source grounding:

- JSON source → `json_pointer` anchor;
- text source → exact `text_span` anchor with `literal` and `valueText`.

The compiler verifies the source file hash before accepting source claims.

Image-only coordinates are not strong composite grounding because this repository has no deterministic OCR/token extractor. For screenshot inputs, first produce a verifiable text/JSON sidecar.

### 7. Required grounding coverage

For `composite`, ground all source-dependent scoring facts:

- score label/value/min/max/band;
- normalization and aggregation;
- each component label/value/normalized score/weight;
- each score-band label/min/max;
- score-series values when present;
- visible exception/event fields when present.

For ordinary `no_score`, ground each visible signal label/value, optional source delta/direction, source series values, and visible exception/event fields.

For a `no_score` radar, additionally ground:

- `radarScale.min` and `radarScale.max`;
- every signal `normalizedScore` used as a radar vertex.

A missing radar-scale or normalized-score claim returns to evidence extraction. Do not silently fall back to an ungrounded radar.

Do not ground deterministic renderer synthesis or Metric Router role decisions as if they were source facts.

### 8. Compile through both gates

Production execution is:

```bash
node scripts/compile-dashboard.js <routing-manifest.json> <grounded-bundle.json> <output-dir>
```

The production gate runs Metric Router validation first. On routing failure it returns `FIX_METRIC_ROUTING` and produces no SVG/HTML. Only after routing passes does it run the existing grounding compiler.

On final `PASS`, the CLI writes:

- `no_score` → `output.no-score.svg` and `output.no-score.html`;
- `composite` → `output.composite.svg` and `output.composite.html`.

`compile.js` remains the lower-level grounding-only compiler for tests and internal compatibility. `validate.js` and `render.js` remain lower-level Layer 2 / Layer 3 tools. Do not use these lower-level entry points as a substitute for `compile-dashboard.js` in ordinary Decision-First production workflows.

### 9. Follow failure transitions literally

- `FIX_METRIC_ROUTING` → repair routing roles, action-trigger logic, first-view budget, primary/visible mismatch, or exception surfacing; do not bypass the gate.
- `FIX_DECISION_STATE` → repair contract/schema errors only; do not weaken validation.
- `RETURN_TO_EVIDENCE_EXTRACTION` → re-read source and repair evidence/claims.
- `FALLBACK_TO_NO_SCORE` → abandon unsupported composite scoring and rebuild a grounded no-score state.
- `PASS` → render deterministically.

Do not turn a failed routing or grounding check into an invitation to guess.

## Visual contract

The renderer owns layout after routing and grounding have passed.

For `no_score`:

- when all 3–6 routed primary dimensions have grounded `normalizedScore` values on one grounded `radarScale`, render a true closed radar profile;
- otherwise use the non-radar signal layout and never connect heterogeneous raw KPI values into a fake radar;
- compact left business context;
- compact right exceptions/events.

For `composite`:

- dominant center source-supported score and band;
- 3–6 routed normalized weighted components form a true closed radar profile;
- compact left score trend and score composition;
- compact right account exceptions and events.

For both modes:

- no flat KPI wall;
- no dominant full-width customer table;
- no invented action controls;
- product-native labels only;
- no compiler/framework methodology labels in visible UI;
- restrained color and generous whitespace;
- negative or critical states may not be cosmetically suppressed;
- hidden diagnostic/drilldown/scorecard routes are not rendered eagerly.

See `references/visual-pattern.md` and `references/visual-stack-routing.md`.

## Hard stops

Safety, compliance, security, regulatory, contractual, or outage conditions override ordinary synthesis. Never average them into a reassuring status. Never hide them because a stakeholder wants the dashboard to look more positive.

## Final gate

Before delivery, verify:

- the Dashboard Worthiness Test passed, or the user explicitly chose a dashboard after the trade-off was explained;
- any worthiness questions counted toward the same five-question intake budget rather than creating a second questionnaire;
- the Decision Brief contains enough confirmed decision context to route metrics, and intake stopped as soon as that context was sufficient;
- source facts were not mistaken for business intent; if Decision and Action were not explicitly stated beforehand, at least one user-confirmation question was asked;
- no more than five questions were asked, one at a time, with no redundant request for source information already known;
- user uncertainty did not cause invented business intent, thresholds, targets, or source claims;
- `schemas/metric-routing.schema.json` is respected;
- `inventoryCount` equals the routed metric inventory and no metric is duplicated or omitted;
- every `primary_signal` passes the Action Trigger Test and the visible center matches the primary set exactly;
- diagnostics explain routed primary/exception items rather than competing as peer headlines;
- active exceptions cannot be hidden and every active exception has a valid rendered `surfacePath`;
- the first-view information budget is respected instead of shrinking typography or adding equal-weight KPI cards;
- the grounded-bundle schema passes;
- source SHA-256 matches actual source bytes;
- every required visible/source scoring fact has a resolvable claim and evidence anchor;
- every grounded value matches the referenced decision-state value under allowed deterministic normalization only;
- `no_score` overall direction matches signal directions;
- a `no_score` radar passes both the Profile Test and Action Trigger Test;
- raw mixed-unit KPIs never masquerade as radar dimensions;
- `composite` weights, weighted score, score scale, and score band pass semantic validation;
- no unsupported score/status/target/action appears;
- no framework or compiler labels leak into visible UI;
- the center is the first focal point;
- outputs contain no unresolved template tokens.
