# V3.1 Semantic Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in V3.1 semantic intent contract, Compute-or-Defer requirements, and deterministic render-plan IR while preserving the existing V3 grounding and renderer outputs.

**Architecture:** Extend the grounded-bundle envelope with optional V3.1 compiler metadata. Add a deterministic `planner.js` that validates semantic intent, resolves computed requirement pointers, assembles a fixed 12-column render plan, validates layout invariants, and canonically serializes the plan. `compile.js` runs the planner only for V3.1 bundles and emits the plan beside unchanged SVG/HTML output.

**Tech Stack:** Node.js 22, ESM, `node:test`, existing hand-rolled JSON-schema validator, deterministic JSON serialization.

**Spec:** `docs/superpowers/specs/2026-09-04-v3-semantic-planner-design.md`

## Global Constraints

- Existing grounded bundles without `contractVersion` and `intent` must continue to compile unchanged.
- V3.1 is enabled only by `contractVersion: "3.1"` plus `intent`.
- Grounding validation runs before semantic planning.
- No missing requested quantity may be silently replaced with another quantity.
- Existing SVG/HTML rendering code and golden snapshots must remain byte-identical.
- Layout coordinates are compiler-owned, never agent-authored.
- V3.1 plan JSON must be byte-identical for identical semantic input.

---

### Task 1: Specify failing V3.1 semantic-planner behavior

**Files:**
- Create: `tests/compiler/semantic-planner.test.js`

**Interfaces:**
- Consumes: `buildRenderPlan(bundle)`, `validateCompilerIntent(bundle)`, `serializeRenderPlan(plan)` from a not-yet-existing `scripts/planner.js`.
- Produces: executable behavior contract for Tasks 2–4.

- [ ] **Step 1: Add tests for opt-in compatibility and intent pairing**

Create tests that assert a legacy bundle returns `{ enabled: false, valid: true }`, `contractVersion: "3.1"` without intent fails with `INTENT_REQUIRED`, and intent without the version fails with `CONTRACT_VERSION_REQUIRED`.

- [ ] **Step 2: Add tests for Compute-or-Defer**

Create one valid V3.1 no-score bundle with a computed requirement pointing at `/signals/0/value` and a deferred target comparison. Assert the plan reports `computed` and `deferred` respectively and preserves `blockedBy`, `originalSpec`, and `toUnblock` exactly.

- [ ] **Step 3: Add negative tests**

Assert duplicate requirement ids fail with `DUPLICATE_REQUIREMENT_ID` and a missing decision path fails with `DECISION_PATH_NOT_FOUND`.

- [ ] **Step 4: Add determinism and layout tests**

Build the same plan twice and assert canonical serialized bytes are identical. Assert every fixed layout slot ends at or before column 12 and no two slots overlap.

- [ ] **Step 5: Commit red tests**

Expected CI state: tests fail because `scripts/planner.js` does not exist.

---

### Task 2: Extend the grounded-bundle schema for V3.1 metadata

**Files:**
- Modify: `skills/decision-first-dashboard/schemas/grounded-bundle.schema.json`

**Interfaces:**
- Consumes: existing schema validator in `scripts/grounding.js` / `scripts/validate.js`.
- Produces: optional `contractVersion` and `intent` envelope accepted by grounding schema validation.

- [ ] **Step 1: Add optional `contractVersion`**

Allow only the string constant `"3.1"` when present.

- [ ] **Step 2: Add optional `intent` definition**

Require `audience`, `audienceType`, `purpose`, `primaryDecision`, `refreshCadence`, and `requirements`; reject additional properties.

- [ ] **Step 3: Add requirement resolution definitions**

Each requirement must have unique-by-planner `id`, `label`, `kind`, and a `resolution` matching exactly one of `decision_path` or `deferred`. Schema enforces shape; planner enforces uniqueness and pointer resolution.

- [ ] **Step 4: Run existing grounding tests**

Expected: all legacy tests remain green because both new top-level fields are optional.

---

### Task 3: Implement deterministic semantic planner

**Files:**
- Create: `skills/decision-first-dashboard/scripts/planner.js`

**Interfaces:**
- Consumes: grounded bundle after existing grounding validation.
- Produces:
  - `validateCompilerIntent(bundle) -> { enabled, valid, errors }`
  - `buildRenderPlan(bundle) -> { enabled, valid, errors, plan }`
  - `validateRenderPlan(plan, decisionState) -> { valid, errors }`
  - `serializeRenderPlan(plan) -> string`

- [ ] **Step 1: Implement JSON Pointer resolution**

Support RFC-6901 `~1` and `~0` unescaping. Return an explicit missing-path result rather than guessing or fuzzy matching.

- [ ] **Step 2: Implement intent gating**

Legacy bundle: planner disabled and valid. V3.1 version without intent: `INTENT_REQUIRED`. Intent without version: `CONTRACT_VERSION_REQUIRED`.

- [ ] **Step 3: Implement requirement validation**

Reject duplicate ids. For `decision_path`, mechanically resolve the declared path. For `deferred`, preserve the declared blocker/spec/unblock fields; do not create substitute paths.

- [ ] **Step 4: Implement deterministic plan assembly**

Use fixed slots:

```json
[
  { "id": "context", "x": 0, "y": 0, "w": 3, "h": 12 },
  { "id": "decision", "x": 3, "y": 0, "w": 6, "h": 12 },
  { "id": "evidence", "x": 9, "y": 0, "w": 3, "h": 12 }
]
```

Renderer mapping is `no_score -> no-score` and `composite -> composite`.

- [ ] **Step 5: Implement render-plan validation**

Check schema version, contract version, renderer-mode match, requirement uniqueness, bounds, overlap, and center focal point.

- [ ] **Step 6: Implement canonical serializer**

Recursively sort object keys while preserving array order, then `JSON.stringify(..., null, 2) + "\n"`.

- [ ] **Step 7: Run semantic planner tests**

Expected: all tests from Task 1 pass.

---

### Task 4: Integrate planner into the production compiler

**Files:**
- Modify: `skills/decision-first-dashboard/scripts/compile.js`
- Modify: `tests/compiler/compile-cli.test.js`

**Interfaces:**
- Consumes: planner APIs from Task 3 and existing `validateGroundedBundle`, `renderSvg`, `renderHtml`.
- Produces: V3.1 planning gate and mode-specific `.plan.json` output.

- [ ] **Step 1: Write failing compiler integration test**

Use the existing valid grounded composite fixture, add V3.1 intent in-memory, compile with the fixture directory as `baseDir`, and assert `renderPlan` exists. Add a CLI test that writes a V3.1 temporary bundle and expects `output.composite.plan.json`.

- [ ] **Step 2: Verify integration tests fail before production edit**

Expected: current `compile.js` has no render plan.

- [ ] **Step 3: Add planning gate after grounding**

If planning fails, return:

```json
{
  "valid": false,
  "stage": "planning",
  "transition": "FIX_COMPILER_INTENT",
  "errors": []
}
```

Do not call the renderer on planning failure.

- [ ] **Step 4: Emit plan on V3.1 success**

Return `renderPlan` and canonical `renderPlanJson` from `compileGroundedBundle`. CLI writes `output.<mode>.plan.json` only when planning is enabled and valid. Legacy CLI output remains SVG/HTML only.

- [ ] **Step 5: Run compiler integration tests**

Expected: V3.1 plan is emitted and existing render equality assertions remain green.

---

### Task 5: Teach the skill and CI about V3.1

**Files:**
- Modify: `skills/decision-first-dashboard/SKILL.md`
- Modify: `.github/workflows/compiler-tests.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: implemented V3.1 compiler behavior.
- Produces: agent instructions, public documentation, CI artifact coverage.

- [ ] **Step 1: Document one-audience/one-purpose/one-decision intent**

Explain that V3.1 captures decision intent before rendering and that multiple audiences must be split.

- [ ] **Step 2: Document Compute-or-Defer**

State that every requested output must resolve to an exact decision-state path or an explicit deferred resolution; substitution is forbidden.

- [ ] **Step 3: Document render-plan output**

Add `.plan.json` to the V3.1 production path and state that the agent never authors layout coordinates.

- [ ] **Step 4: Add plan artifacts to CI**

After compiling grounded fixtures, upload plan files only for a dedicated V3.1 fixture/test generated during CI; do not require plan files for legacy fixtures.

---

### Task 6: Full verification and branch delivery

**Files:**
- No new production files unless verification exposes a defect.

**Interfaces:**
- Consumes: complete branch.
- Produces: verified GitHub branch / pull request ready for user testing.

- [ ] **Step 1: Run full `npm test`**

Expected: 0 failures.

- [ ] **Step 2: Run existing example validation/render commands**

Expected: legacy SaaS and SaaSGrid paths still pass.

- [ ] **Step 3: Run grounded compile smoke tests**

Expected: legacy composite and no-score compile exactly as before; V3.1 compile additionally emits canonical plan JSON.

- [ ] **Step 4: Re-run determinism test**

Compile the same V3.1 bundle twice and compare SHA-256 of plan, SVG, and HTML. All three pairs must match.

- [ ] **Step 5: Push branch and inspect GitHub Actions**

Open a PR against `main` so the existing pull-request workflow runs. Do not merge unless the full suite is green.
