# V4 Screenshot Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic screenshot OCR adapter and screenshot grounding contract so PNG/JPG dashboard inputs can enter the existing V3 compiler without trusting agent-authored OCR text.

**Architecture:** A new `screenshot-adapter.js` produces a closed OCR token manifest from image bytes using the system Tesseract binary. `grounding.js` verifies the image and manifest hashes plus token-level anchors before the existing decision-state validator and renderer are allowed to run.

**Tech Stack:** Node.js ESM, system `tesseract` CLI/TSV, existing zero-NPM-dependency compiler scripts and JSON-schema validator.

**Spec:** `docs/superpowers/specs/2026-09-05-screenshot-grounding-design.md`

## Global Constraints

- Existing json/text grounding behavior must remain backward compatible.
- Agent cannot author OCR tokens; it can only reference IDs emitted by the adapter.
- Screenshot claims require OCR token confidence >= 70.
- Screenshot/image/manifest paths must remain inside the bundle base directory.
- Renderer code and templates are unchanged in V4.0.
- Composite mode remains forbidden unless existing composite eligibility and grounding rules pass.

---

### Task 1: Screenshot manifest schema and adapter

**Files:**
- Create: `skills/decision-first-dashboard/schemas/screenshot-manifest.schema.json`
- Create: `skills/decision-first-dashboard/scripts/screenshot-adapter.js`
- Create: `tests/compiler/screenshot-adapter.test.js`

**Interfaces:**
- Produces CLI: `node screenshot-adapter.js <image> <manifest.json>`
- Produces manifest fields: `version,imageSha256,width,height,engine,tokens[]`.

- [ ] Write failing tests for deterministic token IDs, image hash, dimensions, bbox/confidence parsing, and missing-Tesseract/no-token failure.
- [ ] Run `node --test tests/compiler/screenshot-adapter.test.js` and confirm RED.
- [ ] Implement adapter using `child_process.spawnSync('tesseract', [image, 'stdout', '--psm', '6', 'tsv'])`, PNG/JPEG dimension parsing in Node, TSV parsing, SHA-256, and closed manifest validation.
- [ ] Re-run the adapter tests and confirm GREEN.

### Task 2: Screenshot source/anchor schema

**Files:**
- Modify: `skills/decision-first-dashboard/schemas/grounded-bundle.schema.json`
- Test: `tests/compiler/grounding-schema.test.js`

**Interfaces:**
- Adds `source.kind = "screenshot"`, `manifestPath`, `manifestSha256`.
- Adds evidence anchor `type = "token_span"`, `tokenRefs[]`, `valueText`.

- [ ] Write failing tests that accept a well-formed screenshot bundle and reject missing manifest fields, freeform screenshot literal anchors, and extra properties.
- [ ] Run targeted tests and confirm RED.
- [ ] Update schema with a screenshot source branch and token-span anchor branch while preserving json/text branches.
- [ ] Re-run targeted and full schema tests; confirm GREEN.

### Task 3: Screenshot grounding verifier

**Files:**
- Modify: `skills/decision-first-dashboard/scripts/grounding.js`
- Test: `tests/compiler/screenshot-grounding.test.js`

**Interfaces:**
- Consumes screenshot source + manifest + token_span anchors.
- Returns existing `{valid,stage,transition,errors}` state machine with new error codes.

- [ ] Write RED tests for manifest hash mismatch, image hash mismatch, missing token, bbox outside image, confidence <70, token text mismatch, and valid token span.
- [ ] Implement manifest loading with base-directory confinement and regular-file checks, hash verification, closed manifest validation, token lookup, reading-order check, confidence gate, bbox gate, and conservative whitespace-normalized `valueText` matching.
- [ ] Confirm targeted tests GREEN and run all compiler tests.

### Task 4: Real screenshot regression fixtures

**Files:**
- Create: `tests/compiler/fixtures/screenshots/mrr-dashboard.png`
- Create: `tests/compiler/fixtures/screenshots/control-center.png`
- Create: `tests/compiler/fixtures/screenshots/recover-dashboard.png`
- Create generated/checked manifests under the same fixture directory.
- Create: `tests/compiler/screenshot-real-world.test.js`

**Interfaces:**
- MRR screenshot is primary end-to-end adapter regression.
- All three fixtures must generate non-empty manifests and expose their main KPI text at confidence >=70.

- [ ] Add the three user-approved screenshots as fixtures.
- [ ] Add tests that invoke the adapter and assert expected visible high-value tokens (`$283,189`, `$134,755`, `65.2%` or equivalent OCR tokenization).
- [ ] Confirm all three smoke tests GREEN.

### Task 5: Screenshot-grounded compile regression and docs/CI

**Files:**
- Create: `tests/compiler/fixtures/screenshots/mrr.grounded.json`
- Create: `tests/compiler/screenshot-compile.test.js`
- Modify: `README.md`
- Modify: `skills/decision-first-dashboard/SKILL.md`
- Modify: `.github/workflows/compiler-tests.yml` if a dedicated screenshot smoke step is useful.

**Interfaces:**
- Existing `compile.js` accepts screenshot-grounded bundles without renderer changes.

- [ ] Add a screenshot-grounded no-score fixture using token IDs from the MRR manifest for `MRR`, `$283,189`, and `2.63%`, plus two additional source-grounded signals visible in the breakout table.
- [ ] Write a compile test proving PASS produces `output.no-score.svg/html` and invalid screenshot grounding produces no output.
- [ ] Document `Screenshot -> adapter -> grounded bundle -> compile` workflow and fail-closed behavior.
- [ ] Run `npm test`, canonical SaaS validation/render, SaaSGrid regression, grounded json/text compile, and screenshot-grounded compile.
- [ ] Open PR, require GitHub Actions GREEN, squash merge, then verify the new `main` push workflow and artifact.
