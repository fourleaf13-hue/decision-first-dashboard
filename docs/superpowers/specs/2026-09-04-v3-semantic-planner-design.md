# V3.1 Semantic Planner Design

## Goal

Extend the evidence-bounded V3 compiler with an opt-in semantic intent contract, Compute-or-Defer requirements, and a deterministic render-plan intermediate representation without changing existing dashboard pixels or weakening grounding.

## Why this change

V3 already separates agent judgment, compiler validation, and deterministic rendering. Two external dashboard-skill patterns are worth absorbing:

- decision methodology should make one audience, one purpose, and one primary decision explicit before visual output;
- mechanical layout/assembly/validation should be deterministic, and requested quantities must either be computed from declared state or explicitly deferred rather than silently substituted.

The current V3 contract validates source facts very strongly, but it does not yet encode the user's decision intent or the set of requested outputs. That leaves room for an agent to omit a requested quantity or substitute a nearby one before the compiler sees the bundle.

## Compatibility strategy

The existing V3 grounded-bundle contract remains valid.

V3.1 is opt-in:

```json
{
  "contractVersion": "3.1",
  "intent": {},
  "source": {},
  "decisionState": {},
  "evidence": [],
  "claims": []
}
```

Rules:

- a legacy bundle with neither `contractVersion` nor `intent` follows the existing V3 path unchanged;
- `contractVersion: "3.1"` requires `intent`;
- `intent` without `contractVersion: "3.1"` is invalid;
- no other contract version is accepted by this implementation.

This preserves all existing fixtures and byte-level SVG/HTML golden snapshots.

## Semantic intent contract

`intent` is compiler metadata, not a source fact. It is not included in the evidence-claim grounding ledger.

Required fields:

```json
{
  "audience": "Head of Growth",
  "audienceType": "executive",
  "purpose": "Monitor subscription health",
  "primaryDecision": "Is growth healthy enough to stay on plan?",
  "refreshCadence": "daily",
  "requirements": []
}
```

Allowed `audienceType` values:

- `executive`
- `operational`
- `diagnostic`

Allowed `refreshCadence` values:

- `realtime`
- `hourly`
- `daily`
- `weekly`
- `monthly`

The contract intentionally has one audience string, one purpose string, and one primary-decision string. Multi-audience dashboards must be split before entering V3.1.

## Compute-or-Defer requirements

Every requested output is represented by one requirement.

A requirement has:

- a stable `req_*` id;
- a human-readable label;
- a semantic kind;
- exactly one resolution.

Supported kinds:

- `single_value`
- `trend`
- `comparison`
- `composition`
- `distribution`
- `relationship`
- `status`
- `action`
- `evidence`

A computed resolution is explicit:

```json
{
  "id": "req_mrr",
  "label": "Current MRR",
  "kind": "single_value",
  "resolution": {
    "type": "decision_path",
    "path": "/signals/0/value"
  }
}
```

The planner must resolve the JSON Pointer against `decisionState`. A missing path is a compiler error. It must never be replaced with a different path or quantity.

A deferred resolution is also explicit:

```json
{
  "id": "req_target",
  "label": "MRR versus target",
  "kind": "comparison",
  "resolution": {
    "type": "deferred",
    "blockedBy": "missing_source_fact",
    "originalSpec": "Compare current MRR with the approved target",
    "toUnblock": "Provide a source-backed MRR target"
  }
}
```

Allowed blockers:

- `missing_source_fact`
- `ambiguous_source`
- `unsupported_computation`
- `unsupported_renderer`

The compiler accepts deferral as an intentional result. Silent omission is not accepted because every V3.1 requested output must appear in `requirements`.

## Deterministic render-plan IR

After grounding passes, V3.1 builds a canonical render plan before rendering.

Shape:

```json
{
  "schemaVersion": 1,
  "contractVersion": "3.1",
  "mode": "no_score",
  "intent": {
    "audience": "Head of Growth",
    "audienceType": "executive",
    "purpose": "Monitor subscription health",
    "primaryDecision": "Is growth healthy enough to stay on plan?",
    "refreshCadence": "daily"
  },
  "requirements": [],
  "layout": {
    "strategy": "decision-first-fixed",
    "focalPoint": "center",
    "gridColumns": 12,
    "slots": [
      { "id": "context", "x": 0, "y": 0, "w": 3, "h": 12 },
      { "id": "decision", "x": 3, "y": 0, "w": 6, "h": 12 },
      { "id": "evidence", "x": 9, "y": 0, "w": 3, "h": 12 }
    ]
  },
  "renderer": {
    "template": "no-score",
    "outputMode": "no-score"
  }
}
```

The agent does not supply coordinates. Layout is compiler-owned and fixed. This mirrors the existing visual templates, so SVG/HTML output does not drift.

Requirement order is preserved because it expresses the agent's intentional priority. Object key order is canonicalized only when serializing the plan.

## Render-plan validation

Before rendering, validate the assembled plan mechanically:

- schema/contract versions are exact;
- mode is `no_score` or `composite`;
- renderer template/output mode matches the decision-state mode;
- requirement ids are unique;
- each computed requirement has a resolvable decision path;
- each deferred requirement carries blocker/original-spec/unblock information;
- every layout slot has positive dimensions;
- no slot exceeds the 12-column grid;
- no two layout slots overlap;
- the focal point is the center slot.

Planning failure returns a machine-readable result with:

- `stage: "planning"`
- `transition: "FIX_COMPILER_INTENT"`

Grounding transitions remain unchanged and always run first.

## Compiler outputs

Legacy V3 output stays unchanged:

- `output.no-score.svg` / `output.no-score.html`
- `output.composite.svg` / `output.composite.html`

For a valid V3.1 bundle, the compiler additionally writes:

- `output.no-score.plan.json`, or
- `output.composite.plan.json`

The plan JSON uses canonical serialization so identical semantic input produces byte-identical plan output.

## Data flow

```text
source
  -> grounded bundle
  -> grounding gate
  -> decision-state validation
  -> V3.1 intent / Compute-or-Defer validation
  -> deterministic render-plan assembly
  -> render-plan validation
  -> existing deterministic SVG / HTML renderer
```

Legacy V3 branches after decision-state validation directly to the existing renderer.

## Testing

Tests must prove:

1. legacy grounded bundles remain valid and do not require intent;
2. `contractVersion: "3.1"` without intent is rejected;
3. intent without `contractVersion: "3.1"` is rejected;
4. duplicate requirement ids are rejected;
5. a computed requirement with a missing decision path is rejected;
6. a deferred requirement is preserved exactly in the plan;
7. identical V3.1 input serializes to byte-identical plan JSON;
8. fixed layout never overlaps or crosses the 12-column grid;
9. compile CLI writes the plan only after grounding and planning both pass;
10. existing SVG/HTML golden snapshots remain byte-identical.

## Non-goals

V3.1 does not:

- change the current visual design;
- add a generic chart library;
- infer KPI targets or benchmarks;
- infer a missing required quantity;
- introduce new composite score formulas;
- make intent/evidence claims source-grounded;
- remove the legacy V3 path.
