# Composite Mode Compiler Implementation Plan

> **Status:** Completed and merged to `main` via PR #1. Final feature squash commit: `b41fd8e7904b13b0f6649a836d310209335a73ea`.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a strict, deterministic composite-score branch to the existing Decision-First Dashboard compiler while preserving all no-score anti-hallucination guarantees.

**Architecture:** Extend the closed decision-state schema to two mutually exclusive modes, teach the lightweight validator `oneOf` plus composite semantic checks, and dispatch the existing renderer API to fixed composite SVG/HTML templates. Composite v1 accepts only source-provided normalized component scores, source weights, weighted-average aggregation, and complete score-band thresholds.

**Tech Stack:** Node.js 22 in CI, vanilla JavaScript, JSON Schema Draft-07 subset, Node built-in `node:test`, deterministic SVG, vanilla HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-09-03-composite-mode-design.md`

## Global Constraints

- Never infer or invent normalization, weights, thresholds, bands, score values, account states, events, actions, or causal claims.
- Composite v1 supports only `normalization: "source_provided"` and `aggregation: "weighted_average"`.
- Existing no-score payloads must remain valid and must continue to physically reject `score` / `model` fields.
- Existing `renderSvg(data)` and `renderHtml(data)` public APIs remain unchanged.
- No-score rendering behavior must remain unchanged.
- No compiler/framework methodology labels may appear in rendered UI.

---

### Task 1: Establish RED composite contract tests and CI coverage

**Files:**
- Create: `tests/compiler/composite-schema.test.js`
- Create: `tests/compiler/fixtures/composite.valid.json`
- Modify: `.github/workflows/compiler-tests.yml`

**Interfaces:**
- Fixture provides the canonical synthetic contract input used only by automated tests.
- Tests consume `validateDecisionState(data)`.

- [x] **Step 1: Add `feature/composite-mode-compiler` to the workflow push branches.**
- [x] **Step 2: Add a valid composite fixture with score 68/100, three components whose weighted average is 68, and contiguous bands 0–70 / 70–85 / 85–100.**
- [x] **Step 3: Add failing tests asserting a valid composite payload is accepted and malformed composite payloads are rejected: missing weight, weights != 1, weighted-score mismatch, band mismatch, band gap, component outside score scale.**
- [x] **Step 4: Push and confirm GitHub Actions fails for the expected reason: the current schema accepts only `mode: "no_score"`.**

---

### Task 2: Implement the composite schema and semantic validator

**Files:**
- Modify: `skills/decision-first-dashboard/schemas/decision-state.schema.json`
- Modify: `skills/decision-first-dashboard/scripts/validate.js`
- Test: `tests/compiler/schema.test.js`
- Test: `tests/compiler/composite-schema.test.js`

**Interfaces:**
- Root schema becomes `oneOf` between `noScoreState` and `compositeState`.
- `validateDecisionState(data)` retains `{ valid, errors }`.

- [x] **Step 1: Extend the lightweight schema walker to evaluate `oneOf` branches without leaking branch-local errors when exactly one branch validates.**
- [x] **Step 2: Refactor the existing no-score object into `definitions.noScoreState` without loosening any current property constraints.**
- [x] **Step 3: Add `definitions.compositeState`, `score`, `scoreModel`, `scoreComponent`, `scoreBand`, and `scoreContext` definitions. All objects use `additionalProperties: false`.**
- [x] **Step 4: Add semantic validation after schema validation for composite mode: score scale, component ranges, positive weights, weight sum tolerance `1e-6`, weighted-score tolerance `0.01`, contiguous bands, band selection, and band-label match.**
- [x] **Step 5: Run the full compiler suite and confirm schema/composite tests pass while all existing no-score tests remain green.**

---

### Task 3: Establish RED composite renderer tests

**Files:**
- Create: `tests/compiler/render-composite-svg.test.js`
- Create: `tests/compiler/render-composite-html.test.js`

**Interfaces:**
- Tests consume existing `renderSvg(data)` / `renderHtml(data)` APIs.

- [x] **Step 1: Add SVG tests requiring score label/value/band, all component labels/scores/weights, score trend, exceptions/events, no unresolved template tokens, and no methodology labels.**
- [x] **Step 2: Add equivalent HTML tests plus a structural assertion that the output uses the dominant center composition rather than KPI cards.**
- [x] **Step 3: Push and confirm tests fail because the renderer still loads no-score templates for composite data.**

---

### Task 4: Implement fixed composite templates and mode dispatch

**Files:**
- Create: `skills/decision-first-dashboard/templates/composite.svg`
- Create: `skills/decision-first-dashboard/templates/composite.html`
- Modify: `skills/decision-first-dashboard/templates/dashboard.css`
- Modify: `skills/decision-first-dashboard/scripts/render.js`

**Interfaces:**
- `renderSvg(data)` dispatches by validated `data.mode`.
- `renderHtml(data)` dispatches by validated `data.mode`.

- [x] **Step 1: Add deterministic composite SVG geometry: compact left score context, dominant center score, compact right exceptions/events.**
- [x] **Step 2: Add deterministic composite HTML shell with equivalent hierarchy and reuse shared CSS tokens.**
- [x] **Step 3: Add renderer helpers for score-series path, weighted component cluster placement for 3–6 components, composition rows, and score display.**
- [x] **Step 4: Keep no-score helper paths untouched where possible; dispatch to composite templates only for `mode === "composite"`.**
- [x] **Step 5: Run the full test suite and confirm both composite renderer suites and all existing no-score suites pass.**

---

### Task 5: CLI naming, skill instructions, and final verification

**Files:**
- Modify: `skills/decision-first-dashboard/scripts/render.js`
- Modify: `skills/decision-first-dashboard/SKILL.md`
- Modify: `README.md`

**Interfaces:**
- CLI writes `output.composite.svg` / `output.composite.html` for composite input and preserves `output.no-score.*` for no-score input.

- [x] **Step 1: Add a regression test for mode-specific CLI output basenames if needed by renderer tests.**
- [x] **Step 2: Update `SKILL.md` with exact composite eligibility rules and the fallback-to-no-score rule.**
- [x] **Step 3: Update README compiler documentation without presenting synthetic test values as real product data.**
- [x] **Step 4: Run GitHub Actions on the feature branch. Verify `npm test`, `npm run validate:saas`, and `npm run render:saas` all succeed.**
- [x] **Step 5: Compare the feature branch with `main`, review changed files against the spec, and leave the feature branch ready for merge.**
