# Supporting Context Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore grounded supporting context and compact non-radar density while preserving exact primary routing, grounding, and no-clutter constraints.

**Architecture:** Add optional `supportingSignals` to the closed no-score decision-state contract. The routing gate owns which diagnostics may surface, the grounding gate requires evidence for every visible supporting field, and the non-radar renderer consumes only the validated decision state. The renderer never selects hidden routing metrics or truncates supporting diagnostics.

**Tech Stack:** Node.js ESM, JSON Schema draft-07, built-in `node:test`, deterministic SVG/HTML renderers, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-11-supporting-context-density.md`

## Global Constraints

- `decisionState.signals[*].metric` remains exact-set-equal to routed `primary_signal` metrics.
- `decisionState.supportingSignals[*].metric` is exact-set-equal to routed `diagnostic` metrics with `visibility: "supporting"`.
- At most 4 diagnostics may use `visibility: "supporting"`; extra diagnostics must be `on_demand`.
- Supporting routing mismatches return `FIX_METRIC_ROUTING`; missing supporting evidence returns `RETURN_TO_EVIDENCE_EXTRACTION`.
- `scorecard_only` remains excluded from the first-view decision surface.
- Radar and composite contracts remain unchanged.
- No renderer-side truncation, invented copy, thresholds, alerts, actions, or domain-specific assumptions.

---

### Task 1: Lock the real inventory regression before production changes

**Files:**
- Create: `tests/compiler/fixtures/grounding/zepto-inventory.source.txt`
- Create: `tests/compiler/fixtures/grounding/zepto-inventory.grounded.json`
- Create: `tests/compiler/fixtures/routing/zepto-inventory.routing.json`
- Create: `tests/compiler/supporting-context-density.test.js`

**Interfaces:**
- Consumes: existing `validateMetricRouting`, `validateGroundedBundle`, `renderHtml`, `renderSvg`.
- Produces: one permanent real-world regression that later tasks must make green.

- [ ] **Step 1: Add source sidecar with the seven visible source facts**

```text
Out of Stock Products: 453
Out of Stock: 12.14%
Low Stock: 14.61%
Inventory Value: ₹2.243M
Total Products: 3.731K
High Stock: 43.42%
Medium Stock: 29.83%
Average Discount: 7.62%
Total Categories: 14
```

- [ ] **Step 2: Add routing fixture with exact roles**

Primary metrics: `out_of_stock_products`, `out_of_stock_share`, `low_stock_share`, `inventory_value`.
Supporting diagnostics: `total_products`, `high_stock_share`, `medium_stock_share` with `visibility: "supporting"` and valid `explains` targets.
Scorecard-only: `average_discount`, `total_categories`.

- [ ] **Step 3: Add grounded decision-state fixture with four primaries and three `supportingSignals`**

Every visible label/value gets a unique evidence record and claim. Do not add claims for scorecard-only metrics because they are not rendered.

- [ ] **Step 4: Add failing regression tests**

```js
test('Zepto regression preserves routed primaries and supporting diagnostics separately', () => {
  const routing = validateMetricRouting(manifest, bundle.decisionState);
  assert.equal(routing.valid, true);
});

test('Zepto visible supporting context is fully grounded', () => {
  const grounded = validateGroundedBundle(bundle, { baseDir: groundingDir });
  assert.equal(grounded.valid, true);
});

test('Zepto non-radar output renders four primaries plus a diagnostic rail', () => {
  const html = renderHtml(bundle.decisionState);
  for (const value of ['453', '12.14%', '14.61%', '₹2.243M', '3.731K', '43.42%', '29.83%']) {
    assert.match(html, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(html, /7\.62%|>14</);
  assert.match(html, /supporting-context-rail/);
});
```

- [ ] **Step 5: Run the PR CI and verify RED**

Expected: schema/routing/rendering tests fail because `supportingSignals` is not yet accepted or rendered. The failure must be feature-related, not fixture syntax.

---

### Task 2: Extend the closed decision-state schema and routing gate

**Files:**
- Modify: `skills/decision-first-dashboard/schemas/decision-state.schema.json`
- Modify: `skills/decision-first-dashboard/scripts/routing.js`
- Modify: `tests/compiler/schema.test.js`
- Modify: `tests/compiler/metric-routing.test.js`

**Interfaces:**
- Consumes: optional `decisionState.supportingSignals`.
- Produces: schema validation plus exact supporting-diagnostic set validation.

- [ ] **Step 1: Add a closed `supportingSignal` definition**

Allowed fields: `metric`, `label`, `value`, optional `delta`, optional `direction`, `provenance`. Reuse no `normalizedScore` fields.

- [ ] **Step 2: Add optional `supportingSignals` to `noScoreState`**

```json
"supportingSignals": {
  "type": "array",
  "maxItems": 4,
  "items": { "$ref": "#/definitions/supportingSignal" }
}
```

- [ ] **Step 3: Add routing validation helpers**

Compute routed supporting diagnostics and rendered supporting IDs. Reject:
- more than four routed diagnostics with `visibility: "supporting"` using `SUPPORTING_DIAGNOSTIC_BUDGET_EXCEEDED`;
- any primary/supporting overlap using `PRIMARY_SUPPORTING_OVERLAP`;
- any set mismatch using `VISIBLE_SUPPORTING_MISMATCH`.

- [ ] **Step 4: Preserve existing primary equality**

`VISIBLE_PRIMARY_MISMATCH` behavior remains unchanged.

- [ ] **Step 5: Run schema/routing tests**

Expected: supporting schema and routing tests green; grounding/render tests still red.

---

### Task 3: Ground every visible supporting field

**Files:**
- Modify: `skills/decision-first-dashboard/scripts/grounding.js`
- Modify: `tests/compiler/grounding.test.js`
- Modify: `tests/compiler/grounding-adversarial.test.js`

**Interfaces:**
- Consumes: validated no-score `supportingSignals`.
- Produces: required grounding paths for every visible supporting label/value/delta/direction.

- [ ] **Step 1: Extend `requiredNoScorePaths`**

For each `supportingSignals[index]`, require claims for all present fields among `label`, `value`, `delta`, `direction`.

- [ ] **Step 2: Add missing-grounding adversarial test**

Delete one supporting-value claim from the Zepto bundle and assert:

```js
assert.equal(result.valid, false);
assert.equal(result.transition, 'RETURN_TO_EVIDENCE_EXTRACTION');
assert.ok(result.errors.some((error) => error.code === 'MISSING_REQUIRED_GROUNDING'));
```

- [ ] **Step 3: Run grounding tests**

Expected: full Zepto bundle passes; missing supporting claim fails with the required transition.

---

### Task 4: Render a compact supporting context rail and remove the giant center-only stage

**Files:**
- Modify: `skills/decision-first-dashboard/scripts/render-non-radar.js`
- Modify: `tests/compiler/render-html.test.js`
- Modify: `tests/compiler/render-svg.test.js`
- Modify: `tests/compiler/supporting-context-density.test.js`

**Interfaces:**
- Consumes: `data.signals` and optional `data.supportingSignals` only; no routing manifest access.
- Produces: deterministic HTML/SVG with three visual tiers.

- [ ] **Step 1: Add deterministic HTML supporting rail**

Render only when `supportingSignals.length > 0`:

```html
<section class="supporting-context-rail" aria-label="Supporting context">
  <article class="supporting-context-item">...</article>
</section>
```

No generic explanatory filler copy beyond the neutral accessibility label.

- [ ] **Step 2: Add deterministic SVG supporting rail**

Use fixed lower-weight cards beneath the primary group, at most four items, no spokes or lines.

- [ ] **Step 3: Make center-only HTML density compact**

Remove the unconditional 610px feel from center-only composition. Add an explicit compact path such as:

```css
.decision-layout--center-only{min-height:0}
.decision-layout--center-only .synthesis-card{min-height:min(40vh,420px)}
.decision-layout--center-only .signal-focus{gap:32px}
```

Content may naturally exceed the target if needed.

- [ ] **Step 4: Add layout assertions**

Tests assert `supporting-context-rail`, all seven visible values, absence of scorecard-only values, absence of `orbit-spokes`, and the compact center-only CSS rule.

- [ ] **Step 5: Run renderer regression tests**

Expected: HTML and SVG tests green; radar/composite snapshots unchanged except any no-score golden output intentionally affected by compact layout.

---

### Task 5: Update the agent contract and snapshots

**Files:**
- Modify: `skills/decision-first-dashboard/SKILL.md`
- Modify: `tests/compiler/metric-router-contract.test.js`
- Modify if required: `tests/compiler/golden/hashes.json`

**Interfaces:**
- Produces: agent guidance aligned with compiler behavior.

- [ ] **Step 1: Document the redundancy/complementary rule**

Add the exact principle from the spec: related/complementary metrics are diagnostics unless they independently change the confirmed decision/action.

- [ ] **Step 2: Document supporting budget semantics**

At most four diagnostics may be `supporting`; additional diagnostics are `on_demand`. No renderer truncation.

- [ ] **Step 3: Add contract-text tests**

Assert the Skill contains `supportingSignals`, the four-item supporting budget, and the redundancy/complementary rule.

- [ ] **Step 4: Refresh golden hashes only after semantic tests are green**

Update only intentionally changed no-score artifacts.

---

### Task 6: Full verification, PR, merge, and post-merge verification

**Files:**
- No new production behavior.

**Interfaces:**
- Produces: verified merged main and fresh Claude Upload Skill artifact.

- [ ] **Step 1: Run full GitHub Actions workflow on the PR**

Required green steps include `npm test`, SaaS validation/render, radar showcase validation/render, real-world fixture, grounded/routed compilation, worthiness, Claude package staging, and artifact upload.

- [ ] **Step 2: Review changed-file set against spec**

No unrelated refactor, no scorecard-only first-view regression, no radar/composite behavior change.

- [ ] **Step 3: Merge only with green PR CI**

- [ ] **Step 4: Verify the post-merge `main` workflow is green**

- [ ] **Step 5: Download the fresh `decision-first-dashboard-skill` artifact**

Provide the resulting ZIP to the user.
