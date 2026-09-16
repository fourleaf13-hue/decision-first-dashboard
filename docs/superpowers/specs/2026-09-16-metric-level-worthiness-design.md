# Metric-level Worthiness Design

## Goal

Extend the existing Dashboard Worthiness → Decision Brief → Metric Router →
grounding → deterministic renderer pipeline with a typed, metric-level
worthiness assessment. The assessment remains a routing input and must reach
the canonical HTML and SVG; it is not a second Action Trigger subsystem.

## Contract

`worthiness-assessment.schema.json` gains an optional `metricWorthiness` array.
Each entry is keyed by a stable metric id and contains the three typed
worthiness dimensions `whatChanges`, `whoCares`, and `responseChange`, a
`status` (`inferred`, `confirmed`, or `overridden`), a provenance `source`, and
an optional recorded `assumption`. `candidateAssumptions` are typed candidate
contexts with an explicit route outcome. An `override` is a typed routing
outcome and is the only way an entry may have `status: overridden`.

The current Dashboard Worthiness and Decision Brief contracts remain backward
compatible. Existing manifests without metric-level entries keep their current
behavior. Metric-level assessment does not create one question per metric.

## Routing and ambiguity

`routing.js` owns the deterministic functions that evaluate each candidate
assumption and normalize its route outcome. Material ambiguity is true only
when the candidate route outcome set has at least two members and the
outcomes differ in `primary_signal` eligibility or hero eligibility. Same-route
candidates and candidates that differ only in non-hero placement do not
request clarification.

An override is applied before routing validation. The compiler recomputes the
metric route, rebuilds the no-score presentation collections, and validates
that routed primary/supporting/scorecard metrics match the state that will be
rendered. Missing or conflicting metric/state bindings fail closed.

## Delivery

The existing `compile-dashboard.js` remains the only production entrypoint and
`render.js` remains the only renderer entrypoint. The existing renderer receives
the recomputed decision state. Every rendered metric gets stable
`data-metric`/`data-role`/`data-presentation` markers in HTML and SVG. Primary
signals use the existing lead/primary composition; demoted diagnostics and
scorecard metrics remain preserved in supporting or collapsed additional-metric
surfaces rather than being deleted.

## Intake and verification

The existing five-question budget is shared by Dashboard Worthiness, Decision
Brief, and at most one metric clarification. Screenshot-only assumptions are
recorded as `inferred`; they do not ask by themselves. Only the mechanical
routing-divergence gate can return `ASK_METRIC_WORTHINESS_QUESTION`.

Tests must cover contract validation, routing behavior, 70-KPI question count,
monitoring/compliance preservation, screenshot inference, both override
directions, and final HTML/SVG hierarchy with no stale hero marker. The project
documentation explicitly treats schema, routing, and canonical output as
separate gates.
