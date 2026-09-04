# V3 Evidence-Bounded Compiler Design

## Goal

Make every source-provided decision fact mechanically traceable to the original source before deterministic rendering, with stricter grounding requirements for composite mode.

## Architecture

The system has three explicit layers.

1. **Layer 1 — Agent intelligence**: extract evidence, classify decision roles, propose `no_score` or `composite`, and build a grounded bundle. The agent may reason here, but it may not render UI.
2. **Layer 2 — Compiler contract**: validate the decision state, validate evidence/reference integrity, mechanically verify source anchors, and return a machine-readable transition: `PASS`, `RETURN_TO_EVIDENCE_EXTRACTION`, `FALLBACK_TO_NO_SCORE`, or `FIX_DECISION_STATE`.
3. **Layer 3 — Deterministic renderer**: render validated decision state into the existing fixed SVG/HTML templates. It does not interpret source material or invent business meaning.

The supported production path becomes:

`source -> grounded bundle -> grounding gate -> decision-state validation -> deterministic render`

The existing `decision-state.schema.json` remains the closed visual/data contract. V3 adds a grounded envelope instead of weakening or duplicating the existing mode schema.

## Grounded bundle

A grounded bundle contains:

```json
{
  "source": {
    "kind": "json|text",
    "path": "relative/path/to/source",
    "sha256": "64 lowercase hex characters"
  },
  "decisionState": {},
  "evidence": [
    {
      "id": "ev_001",
      "anchor": {
        "type": "json_pointer",
        "pointer": "/score/value"
      }
    }
  ],
  "claims": [
    {
      "decisionPath": "/score/value",
      "evidenceRef": "ev_001"
    }
  ]
}
```

`evidence` is the ledger. `claims` is the reference map from decision-state paths to ledger entries.

## Source kinds and grounding strength

V3 supports two mechanically verifiable source kinds.

### JSON source

- `source.kind = "json"`
- the compiler reads the referenced source file;
- the compiler verifies its SHA-256;
- each evidence anchor uses `json_pointer`;
- the compiler resolves the pointer against the source JSON and compares the anchored value to the referenced decision-state value.

### Text source

- `source.kind = "text"`
- the compiler reads the referenced source file;
- the compiler verifies its SHA-256;
- each evidence anchor uses `text_span` with an exact `literal` and a `valueText` contained inside that literal;
- the compiler verifies the literal occurs in the source and compares `valueText` to the referenced decision-state value using deterministic normalization only.

Image-only/bounding-box grounding is intentionally not accepted as strong composite grounding in V3 because this repository currently has no deterministic OCR/token extractor. Screenshot-derived inputs may still be transformed into a verifiable text/JSON sidecar first; composite rendering must not proceed from an unverified free-form image claim.

## Value normalization

Grounding comparison may normalize representation but must not change meaning.

Allowed deterministic equivalences:

- surrounding whitespace differences;
- numeric strings versus numbers (`"68"` == `68`);
- percentage weights (`"40%"` == `0.4` only when the decision path ends in `/weight`);
- formatted numeric strings with commas (`"1,204"` == `1204`).

Not allowed:

- inferred formulas;
- inferred unit conversion;
- inferred direction or health status;
- fuzzy semantic matching;
- benchmark substitution.

## Required claim coverage

### Composite mode

Every source-dependent scoring fact must be grounded:

- `/score/label`
- `/score/value`
- `/score/min`
- `/score/max`
- `/score/band`
- `/model/normalization`
- `/model/aggregation`
- every component `label`, `value`, `normalizedScore`, and `weight`
- every band `label`, `min`, and `max`
- source score-series values when present
- visible exceptions/events when present

If any required composite scoring claim is missing, unresolved, hash-mismatched, or value-mismatched, the compiler returns `FALLBACK_TO_NO_SCORE` and does not render composite.

### No-score mode

Every visible source fact must be grounded when using the V3 grounded compiler path:

- each signal `label` and `value`;
- `delta` and `direction` when they are source supplied;
- source revenue-series values when present;
- visible exceptions/events when present.

Derived overall synthesis is not grounded because it remains a deterministic renderer derivation.

## Machine-readable result

Grounding validation returns:

```json
{
  "valid": false,
  "stage": "grounding",
  "transition": "FALLBACK_TO_NO_SCORE",
  "errors": [
    {
      "code": "SOURCE_VALUE_MISMATCH",
      "path": "/model/components/0/weight",
      "evidenceRef": "ev_retention_weight",
      "message": "grounded source value does not match decision-state value"
    }
  ]
}
```

Stable error codes include at minimum:

- `SOURCE_FILE_NOT_FOUND`
- `SOURCE_HASH_MISMATCH`
- `EVIDENCE_REF_NOT_FOUND`
- `DECISION_PATH_NOT_FOUND`
- `SOURCE_ANCHOR_NOT_FOUND`
- `SOURCE_VALUE_MISMATCH`
- `MISSING_REQUIRED_GROUNDING`
- `DECISION_STATE_INVALID`

Transition rules:

- malformed/invalid decision-state contract -> `FIX_DECISION_STATE`;
- missing/broken evidence for `no_score` -> `RETURN_TO_EVIDENCE_EXTRACTION`;
- missing/broken grounding for `composite` scoring facts -> `FALLBACK_TO_NO_SCORE`;
- all checks pass -> `PASS`.

## CLI boundary

Add a V3 compiler entry point:

```bash
node skills/decision-first-dashboard/scripts/compile.js <grounded-bundle.json> <output-dir>
```

It must:

1. load the bundle;
2. run the grounding gate;
3. stop without rendering on any non-`PASS` transition;
4. on `PASS`, pass only `bundle.decisionState` into the existing deterministic renderer;
5. write the existing mode-specific output basenames.

`render.js` remains Layer 3 and existing low-level tests remain valid. `SKILL.md` must teach agents to use `compile.js` as the production path rather than bypassing Layer 2.

## Testing strategy

### Semantic grounding tests first

Tests must cover:

- valid JSON-pointer-grounded composite passes;
- a mathematically valid composite with a forged weight is rejected because the source value differs;
- a fake evidenceRef is rejected;
- a source hash mismatch is rejected;
- missing required composite grounding returns `FALLBACK_TO_NO_SCORE`;
- missing no-score grounding returns `RETURN_TO_EVIDENCE_EXTRACTION`;
- a valid text-span-grounded no-score fixture passes;
- compile CLI refuses to render on failed grounding;
- compile CLI renders the same deterministic output as `render.js` after `PASS`.

### Golden snapshots second

After semantic grounding is green, add byte-level golden snapshot regression for canonical no-score and composite SVG/HTML outputs. Semantic tests explain why a behavior is wrong; golden snapshots detect any unplanned template drift.

## Non-goals

V3 does not:

- add OCR;
- infer facts from screenshot pixels inside Layer 2;
- change the visual design system;
- add new composite formulas;
- support agent-inferred weights/thresholds;
- replace semantic tests with snapshots.
