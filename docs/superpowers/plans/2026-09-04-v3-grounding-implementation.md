# V3 Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mechanically verifiable evidence-grounding gate in front of the existing decision-state validator and deterministic renderer.

**Architecture:** Keep `decision-state.schema.json` and `render.js` as the existing closed Layer 2/Layer 3 contracts. Add a grounded bundle plus a new `grounding.js` validator and `compile.js` production entry point. JSON sources use exact JSON Pointer resolution; text sources use exact literal spans plus deterministic value normalization. Composite grounding failure falls back instead of rendering.

**Tech Stack:** Node.js 22, built-in `fs`, `path`, `crypto`, `node:test`; zero third-party runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-04-v3-grounding-design.md`

## Global Constraints

- Do not add OCR or fuzzy semantic matching.
- Do not change the visual templates or layout.
- Preserve existing `no_score` and `composite` decision-state schema behavior.
- Preserve existing `render.js` deterministic outputs.
- Composite missing/mismatched grounding must not render and must transition to `FALLBACK_TO_NO_SCORE`.
- No-score missing/mismatched grounding must transition to `RETURN_TO_EVIDENCE_EXTRACTION`.
- Decision-state contract failure must transition to `FIX_DECISION_STATE`.
- No third-party runtime dependencies.

---

### Task 1: Grounded composite semantic gate

**Files:**
- Create: `skills/decision-first-dashboard/scripts/grounding.js`
- Create: `tests/compiler/grounding.test.js`
- Create: `tests/compiler/fixtures/grounding/composite.source.json`
- Create: `tests/compiler/fixtures/grounding/composite.grounded.json`

**Interfaces:**
- Consumes: `validateDecisionState(data)` from `scripts/validate.js`.
- Produces: `validateGroundedBundle(bundle, { baseDir }) -> { valid, stage, transition, errors }`.

- [ ] **Step 1: Write failing tests for valid and forged composite grounding**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateGroundedBundle } from '../../skills/decision-first-dashboard/scripts/grounding.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/grounding/composite.grounded.json', import.meta.url), 'utf8'));
const baseDir = new URL('./fixtures/grounding/', import.meta.url);

test('passes a composite whose required scoring claims resolve to the source', () => {
  assert.equal(validateGroundedBundle(fixture, { baseDir }).transition, 'PASS');
});

test('rejects a mathematically valid but source-forged composite weight', () => {
  const bad = structuredClone(fixture);
  bad.decisionState.model.components[0].weight = 0.5;
  bad.decisionState.model.components[1].weight = 0.2;
  const result = validateGroundedBundle(bad, { baseDir });
  assert.equal(result.transition, 'FALLBACK_TO_NO_SCORE');
  assert.ok(result.errors.some((error) => error.code === 'SOURCE_VALUE_MISMATCH'));
});
```

- [ ] **Step 2: Run the grounding test and verify RED**

Run: `node --test tests/compiler/grounding.test.js`
Expected: FAIL because `grounding.js` does not exist.

- [ ] **Step 3: Implement JSON source hash, pointer resolution, claim resolution, and value comparison**

`grounding.js` must export:

```js
export function validateGroundedBundle(bundle, { baseDir = process.cwd() } = {}) { /* ... */ }
```

Use `crypto.createHash('sha256')` on source bytes. Resolve RFC6901-style JSON Pointer escapes `~1` and `~0`. For every claim, resolve `claim.decisionPath`, resolve `claim.evidenceRef`, resolve the evidence anchor against source, then compare values.

- [ ] **Step 4: Add required composite scoring coverage**

Generate required paths for score fields, all component label/value/normalizedScore/weight fields, and all band label/min/max fields. Missing required claims produce `MISSING_REQUIRED_GROUNDING` and `FALLBACK_TO_NO_SCORE`.

- [ ] **Step 5: Run tests GREEN, then full suite**

Run: `node --test tests/compiler/grounding.test.js && npm test`
Expected: all tests pass.

---

### Task 2: Stable machine-readable failure transitions

**Files:**
- Modify: `skills/decision-first-dashboard/scripts/grounding.js`
- Modify: `tests/compiler/grounding.test.js`

**Interfaces:**
- Produces stable error objects `{ code, path, evidenceRef?, message }` and transitions.

- [ ] **Step 1: Add RED tests** for `EVIDENCE_REF_NOT_FOUND`, `SOURCE_HASH_MISMATCH`, `DECISION_PATH_NOT_FOUND`, and invalid decision state.

```js
assert.equal(result.stage, 'grounding');
assert.equal(result.transition, 'FALLBACK_TO_NO_SCORE');
assert.ok(result.errors.some((error) => error.code === 'EVIDENCE_REF_NOT_FOUND'));
```

For invalid decision state assert `stage === 'decision_state'` and `transition === 'FIX_DECISION_STATE'`.

- [ ] **Step 2: Verify RED** with `node --test tests/compiler/grounding.test.js`.

- [ ] **Step 3: Implement deterministic transition mapping**

Rules:

```text
invalid decision state -> FIX_DECISION_STATE
composite grounding error -> FALLBACK_TO_NO_SCORE
no_score grounding error -> RETURN_TO_EVIDENCE_EXTRACTION
no errors -> PASS
```

- [ ] **Step 4: Verify GREEN** with grounding tests and full `npm test`.

---

### Task 3: Text-span grounding for real-world no-score input

**Files:**
- Modify: `skills/decision-first-dashboard/scripts/grounding.js`
- Modify: `tests/compiler/grounding.test.js`
- Create: `tests/compiler/fixtures/grounding/no-score.source.txt`
- Create: `tests/compiler/fixtures/grounding/no-score.grounded.json`

**Interfaces:**
- Text evidence anchor shape:

```json
{
  "type": "text_span",
  "literal": "ARR: $4.98M",
  "valueText": "$4.98M"
}
```

- [ ] **Step 1: Add RED tests** for valid text span, missing literal, and value mismatch.

- [ ] **Step 2: Verify RED**.

- [ ] **Step 3: Implement exact text matching**

Require `sourceText.includes(anchor.literal)` and `anchor.literal.includes(anchor.valueText)`. Deterministic comparison permits trimmed exact string, numeric string vs number, comma-formatted numerics, and `%` to fraction only for decision paths ending in `/weight`.

- [ ] **Step 4: Add required no-score claim coverage**

Require every signal label/value, optional delta/direction when present, and source-provenance visible exception/event fields. Derived synthesis remains ungrounded.

- [ ] **Step 5: Verify GREEN** with grounding tests and full suite.

---

### Task 4: Production `compile.js` gate

**Files:**
- Create: `skills/decision-first-dashboard/scripts/compile.js`
- Create: `tests/compiler/compile-cli.test.js`
- Modify: `package.json`

**Interfaces:**

CLI:

```bash
node skills/decision-first-dashboard/scripts/compile.js <grounded-bundle.json> <output-dir>
```

- [ ] **Step 1: Add RED CLI tests**

Valid bundle must create the same mode-specific files as `render.js`. Forged bundle must exit non-zero, emit the machine-readable grounding result on stderr, and create no SVG/HTML files.

- [ ] **Step 2: Verify RED**.

- [ ] **Step 3: Implement `compile.js`**

Load bundle, call `validateGroundedBundle(bundle, { baseDir: dirname(bundlePath) })`; if transition is not `PASS`, print JSON and exit 1. On `PASS`, call existing `renderSvg(bundle.decisionState)` / `renderHtml(bundle.decisionState)` and write `output.no-score.*` or `output.composite.*`.

- [ ] **Step 4: Add package scripts**

Add `compile:grounded` only if it improves reproducibility; do not remove existing scripts.

- [ ] **Step 5: Verify GREEN** with CLI tests and `npm test`.

---

### Task 5: Golden output snapshots

**Files:**
- Create: `tests/compiler/golden-snapshot.test.js`
- Create: `tests/compiler/golden/no-score.svg`
- Create: `tests/compiler/golden/no-score.html`
- Create: `tests/compiler/golden/composite.svg`
- Create: `tests/compiler/golden/composite.html`

**Interfaces:**
- Uses existing `renderSvg()` / `renderHtml()` and canonical fixtures.

- [ ] **Step 1: Create golden files from the current verified renderer output** without changing renderer code.

- [ ] **Step 2: Add byte-equality tests**

```js
assert.equal(renderSvg(noScoreFixture), fs.readFileSync(noScoreGolden, 'utf8'));
assert.equal(renderHtml(noScoreFixture), fs.readFileSync(noScoreGoldenHtml, 'utf8'));
assert.equal(renderSvg(compositeFixture), fs.readFileSync(compositeGolden, 'utf8'));
assert.equal(renderHtml(compositeFixture), fs.readFileSync(compositeGoldenHtml, 'utf8'));
```

- [ ] **Step 3: Run full suite** and confirm no renderer drift.

---

### Task 6: Skill contract, README, and CI

**Files:**
- Modify: `skills/decision-first-dashboard/SKILL.md`
- Modify: `README.md`
- Modify: `.github/workflows/compiler-tests.yml`
- Modify: `docs/superpowers/plans/2026-09-04-v3-grounding-implementation.md`

**Interfaces:**
- Production agent path becomes `grounded bundle -> compile.js`.

- [ ] **Step 1: Document the three layers and hard gate**

State that `render.js` is Layer 3/internal deterministic rendering; agents should use `compile.js` for V3 production execution. Composite without fully verifiable scoring evidence must fall back to `no_score`.

- [ ] **Step 2: Add CI commands**

CI must run full `npm test` and compile at least one valid grounded composite fixture and one valid grounded no-score fixture.

- [ ] **Step 3: Run final verification**

Run:

```bash
npm test
node skills/decision-first-dashboard/scripts/compile.js tests/compiler/fixtures/grounding/composite.grounded.json /tmp/v3-composite
node skills/decision-first-dashboard/scripts/compile.js tests/compiler/fixtures/grounding/no-score.grounded.json /tmp/v3-no-score
```

Expected: all tests pass and both output pairs are generated.

- [ ] **Step 4: Mark plan checkboxes complete and commit docs**.
