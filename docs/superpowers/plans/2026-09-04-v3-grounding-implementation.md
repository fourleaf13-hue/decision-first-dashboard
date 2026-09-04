# V3 Grounding Implementation Plan

**Goal:** Add a mechanically verifiable evidence-grounding gate in front of the existing decision-state validator and deterministic renderer.

**Spec:** `docs/superpowers/specs/2026-09-04-v3-grounding-design.md`

## Completed implementation

- [x] Add closed `grounded-bundle.schema.json` for source, evidence, and claims.
- [x] Add `grounding.js` with source SHA-256 verification, JSON Pointer grounding, exact text-span grounding, required-claim coverage, and deterministic value comparison.
- [x] Add machine-readable transitions: `PASS`, `RETURN_TO_EVIDENCE_EXTRACTION`, `FALLBACK_TO_NO_SCORE`, and `FIX_DECISION_STATE`.
- [x] Reject mathematically valid but source-forged composite facts through `SOURCE_VALUE_MISMATCH`.
- [x] Reject missing evidence refs, missing required grounding, source hash mismatch, unresolved decision paths, and unknown grounded-bundle fields.
- [x] Add text-span grounding for no-score inputs.
- [x] Add `compile.js` as the production hard gate; non-`PASS` results exit non-zero and write no dashboard output.
- [x] Preserve the existing `decision-state.schema.json`, composite semantics, and deterministic `render.js` visual output.
- [x] Add SHA-256 golden byte snapshots for canonical no-score/composite SVG and HTML output.
- [x] Update `SKILL.md` and README for the three-layer V3 pipeline.
- [x] Update GitHub Actions to compile grounded composite and no-score fixtures and upload both outputs.
- [x] Verify GitHub Actions with 65 tests passing, canonical SaaS validation/rendering, SaaSGrid validation/rendering, and both V3 grounded compile paths.

## TDD evidence

The implementation was developed in red/green cycles:

1. Grounding tests initially failed because `grounding.js` did not exist.
2. Grounding semantic tests were made green, including the forged-but-mathematically-valid composite case.
3. Compile CLI tests initially failed because `compile.js` did not exist.
4. Compile hard-gate tests were made green.
5. A closed-envelope test initially failed when an unknown `agentNote` field was accepted.
6. `grounded-bundle.schema.json` and generic schema validation made that case green.
7. Golden byte-hash tests were added only after semantic grounding behavior was green.

## Final verification target

Before merge, the feature branch must remain green for:

```bash
npm test
node skills/decision-first-dashboard/scripts/compile.js tests/compiler/fixtures/grounding/composite.grounded.json /tmp/v3-composite
node skills/decision-first-dashboard/scripts/compile.js tests/compiler/fixtures/grounding/no-score.grounded.json /tmp/v3-no-score
```

After squash merge, the same GitHub Actions workflow must pass again on `main` before V3 is considered complete.
