# Decision-First Dashboard Compiler MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic no-score dashboard compiler that converts verified SaaS dashboard facts into validated JSON and renders the same canonical data through SVG and HTML/CSS without allowing the LLM to choose page layout.

**Architecture:** The agent extracts and classifies source facts into a closed `decision-state.json` contract. A validator rejects unsupported keys/values before rendering. Two deterministic renderers consume the same JSON: SVG is the compatibility baseline; HTML/CSS is the high-fidelity path. The MVP implements only the no-score branch using the existing Lumen SaaS example; composite mode is explicitly deferred until the no-score pipeline passes.

**Tech Stack:** Node.js 20+, JSON Schema Draft-07, Ajv 8, vanilla JavaScript, deterministic SVG template, vanilla HTML/CSS, Node built-in `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-02-decision-first-dashboard-compiler-design.md`

## Global Constraints

- No React in the MVP.
- The LLM must never generate arbitrary layout HTML/CSS/SVG.
- `additionalProperties: false` must be used throughout schema objects.
- No-score payloads must physically lack score fields.
- Directional movement and absolute health must remain separate concepts.
- Do not invent scores, targets, thresholds, customer states, events, workflows, actions, or causal claims.
- SVG and HTML outputs must consume the same canonical validated JSON.
- Executive no-score layout must preserve the current After family: dominant center, compact left context, compact right exceptions/events, no four-card KPI strip, no dominant full-width customer table.
- The existing SaaS Before example is the acceptance fixture.

---

## File map

Create or modify these files:

```text
package.json
skills/decision-first-dashboard/
├── SKILL.md                         # switch skill behavior from free-form visual design to compiler pipeline
├── schemas/
│   └── decision-state.schema.json   # canonical no-score contract for MVP
├── templates/
│   ├── no-score.svg                 # fixed SVG geometry with deterministic placeholders
│   ├── no-score.html                # fixed semantic HTML shell
│   └── dashboard.css                # fixed visual system for HTML renderer
└── scripts/
    ├── validate.js                  # Ajv validation API + CLI
    └── render.js                    # deterministic SVG/HTML renderer API + CLI

examples/saas/
├── input.no-score.json              # canonical validated data extracted from Before
├── output.no-score.svg              # generated artifact
└── output.no-score.html             # generated artifact

tests/compiler/
├── schema.test.js                   # anti-hallucination contract tests
├── render-svg.test.js               # SVG structure/data tests
└── render-html.test.js              # HTML structure/data tests
```

Interfaces used across tasks:

```js
// skills/decision-first-dashboard/scripts/validate.js
export function validateDecisionState(data) {
  return { valid: boolean, errors: Array<object> };
}

// skills/decision-first-dashboard/scripts/render.js
export function renderSvg(data) { return string; }
export function renderHtml(data) { return string; }
```

---

### Task 1: Establish Node test/runtime scaffold and canonical no-score schema

**Files:**
- Create: `package.json`
- Create: `skills/decision-first-dashboard/schemas/decision-state.schema.json`
- Create: `tests/compiler/schema.test.js`

**Interfaces:**
- Produces: canonical JSON Schema consumed by `validate.js` in Task 2.
- Consumes: constraints from the approved design spec.

- [ ] **Step 1: Write the failing schema tests**

Create `tests/compiler/schema.test.js` with tests that import `validateDecisionState` (which does not exist yet) and assert the core contract:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDecisionState } from '../../skills/decision-first-dashboard/scripts/validate.js';

const base = {
  mode: 'no_score',
  synthesis: {
    direction: 'improving',
    targetState: 'unknown',
    exceptionState: 'present'
  },
  signals: [
    { metric: 'mrr', label: 'MRR', value: '$184,320', delta: '+12.4%', direction: 'improving', provenance: 'source' },
    { metric: 'active_customers', label: 'Customers', value: '8,942', delta: '+8.1%', direction: 'improving', provenance: 'source' },
    { metric: 'churn_rate', label: 'Churn', value: '2.84%', delta: '-0.6pp', direction: 'improving', provenance: 'source' },
    { metric: 'trial_conversion', label: 'Trial conversion', value: '31.7%', delta: '+3.2%', direction: 'improving', provenance: 'source' }
  ],
  context: {
    revenueSeries: [74000, 85000, 99000, 118000, 137000, 159000, 184320]
  },
  exceptions: [
    { name: 'Dovetail', plan: 'Basic', mrr: '$120', status: 'At risk', provenance: 'source' }
  ],
  events: [
    { subject: 'Dovetail', event: 'Plan cancelled', detail: 'Basic plan', time: '1 hr ago', provenance: 'source' },
    { subject: 'Orbit Systems', event: 'Trial converted', detail: '43 min ago', time: '43 min ago', provenance: 'source' }
  ]
};

test('accepts the canonical no-score payload', () => {
  assert.equal(validateDecisionState(base).valid, true);
});

test('rejects invented score fields in no-score mode', () => {
  const bad = structuredClone(base);
  bad.score = { value: 68 };
  assert.equal(validateDecisionState(bad).valid, false);
});

test('rejects unsupported health verdicts', () => {
  const bad = structuredClone(base);
  bad.synthesis.direction = 'healthy';
  assert.equal(validateDecisionState(bad).valid, false);
});

test('rejects invented workflow/action fields', () => {
  const bad = structuredClone(base);
  bad.exceptions[0].action = 'Contact';
  assert.equal(validateDecisionState(bad).valid, false);
});

test('allows source plan names without product-specific enums', () => {
  const good = structuredClone(base);
  good.exceptions[0].plan = 'Enterprise Plus';
  assert.equal(validateDecisionState(good).valid, true);
});
```

- [ ] **Step 2: Run tests to verify RED state**

Run:

```bash
node --test tests/compiler/schema.test.js
```

Expected: FAIL because `scripts/validate.js` does not exist.

- [ ] **Step 3: Create `package.json`**

Use:

```json
{
  "name": "decision-first-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/compiler/*.test.js",
    "validate:saas": "node skills/decision-first-dashboard/scripts/validate.js examples/saas/input.no-score.json",
    "render:saas": "node skills/decision-first-dashboard/scripts/render.js examples/saas/input.no-score.json examples/saas"
  },
  "dependencies": {
    "ajv": "^8.17.1"
  }
}
```

- [ ] **Step 4: Create the strict no-score schema**

Create `decision-state.schema.json` with these top-level rules:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["mode", "synthesis", "signals"],
  "properties": {
    "mode": { "const": "no_score" },
    "synthesis": {
      "type": "object",
      "additionalProperties": false,
      "required": ["direction", "targetState", "exceptionState"],
      "properties": {
        "direction": { "enum": ["improving", "deteriorating", "mixed", "unknown"] },
        "targetState": { "enum": ["known", "unknown"] },
        "exceptionState": { "enum": ["present", "none_visible", "unknown"] }
      }
    },
    "signals": {
      "type": "array",
      "minItems": 3,
      "maxItems": 6,
      "items": { "$ref": "#/definitions/signal" }
    },
    "context": { "$ref": "#/definitions/context" },
    "exceptions": {
      "type": "array",
      "maxItems": 5,
      "items": { "$ref": "#/definitions/exception" }
    },
    "events": {
      "type": "array",
      "maxItems": 5,
      "items": { "$ref": "#/definitions/event" }
    }
  },
  "definitions": {
    "signal": {
      "type": "object",
      "additionalProperties": false,
      "required": ["metric", "label", "value", "delta", "direction", "provenance"],
      "properties": {
        "metric": { "type": "string", "pattern": "^[a-z0-9_]{1,40}$" },
        "label": { "type": "string", "minLength": 1, "maxLength": 24 },
        "value": { "type": "string", "minLength": 1, "maxLength": 24 },
        "delta": { "type": "string", "minLength": 1, "maxLength": 20 },
        "direction": { "enum": ["improving", "deteriorating", "flat", "unknown"] },
        "provenance": { "enum": ["source", "derived"] }
      }
    },
    "context": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "revenueSeries": {
          "type": "array",
          "minItems": 2,
          "maxItems": 24,
          "items": { "type": "number", "minimum": 0 }
        }
      }
    },
    "exception": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "status", "provenance"],
      "properties": {
        "name": { "type": "string", "minLength": 1, "maxLength": 40 },
        "plan": { "type": "string", "maxLength": 24 },
        "mrr": { "type": "string", "maxLength": 24 },
        "status": { "type": "string", "minLength": 1, "maxLength": 24 },
        "provenance": { "enum": ["source", "derived"] }
      }
    },
    "event": {
      "type": "object",
      "additionalProperties": false,
      "required": ["subject", "event", "time", "provenance"],
      "properties": {
        "subject": { "type": "string", "minLength": 1, "maxLength": 40 },
        "event": { "type": "string", "minLength": 1, "maxLength": 40 },
        "detail": { "type": "string", "maxLength": 50 },
        "time": { "type": "string", "minLength": 1, "maxLength": 24 },
        "provenance": { "enum": ["source", "derived"] }
      }
    }
  }
}
```

- [ ] **Step 5: Commit task 1**

```bash
git add package.json skills/decision-first-dashboard/schemas/decision-state.schema.json tests/compiler/schema.test.js
git commit -m "feat: define no-score decision state schema"
```

---

### Task 2: Implement executable schema validation

**Files:**
- Create: `skills/decision-first-dashboard/scripts/validate.js`
- Test: `tests/compiler/schema.test.js`

**Interfaces:**
- Consumes: `decision-state.schema.json`.
- Produces: `validateDecisionState(data)` used by renderers and tests.

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install
```

Expected: `ajv` installed successfully.

- [ ] **Step 2: Implement validator API + CLI**

Create `validate.js` with this shape:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '../schemas/decision-state.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

export function validateDecisionState(data) {
  const valid = validate(data);
  return { valid: Boolean(valid), errors: validate.errors ? structuredClone(validate.errors) : [] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node validate.js <decision-state.json>');
    process.exit(2);
  }
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const result = validateDecisionState(data);
  if (!result.valid) {
    console.error(JSON.stringify(result.errors, null, 2));
    process.exit(1);
  }
  console.log('valid');
}
```

- [ ] **Step 3: Run schema tests**

Run:

```bash
npm test
```

Expected: all `schema.test.js` tests PASS.

- [ ] **Step 4: Add one explicit anti-hallucination regression**

Append a test that adds `target: 183000` to a signal and confirms schema rejection because target is not an allowed no-score signal field.

- [ ] **Step 5: Re-run tests and commit**

```bash
npm test
git add skills/decision-first-dashboard/scripts/validate.js tests/compiler/schema.test.js package-lock.json
git commit -m "feat: validate decision state payloads"
```

---

### Task 3: Add the canonical SaaS no-score input fixture

**Files:**
- Create: `examples/saas/input.no-score.json`

**Interfaces:**
- Consumes: values already present in the repository's SaaS Before example.
- Produces: the canonical fixture for both renderers and regression tests.

- [ ] **Step 1: Create the fixture using only verified source-supported fields**

Use this payload shape:

```json
{
  "mode": "no_score",
  "synthesis": {
    "direction": "improving",
    "targetState": "unknown",
    "exceptionState": "present"
  },
  "signals": [
    { "metric": "mrr", "label": "MRR", "value": "$184,320", "delta": "+12.4%", "direction": "improving", "provenance": "source" },
    { "metric": "active_customers", "label": "Customers", "value": "8,942", "delta": "+8.1%", "direction": "improving", "provenance": "source" },
    { "metric": "churn_rate", "label": "Churn", "value": "2.84%", "delta": "-0.6pp", "direction": "improving", "provenance": "source" },
    { "metric": "trial_conversion", "label": "Trial conversion", "value": "31.7%", "delta": "+3.2%", "direction": "improving", "provenance": "source" }
  ],
  "context": {
    "revenueSeries": [74000, 85000, 99000, 118000, 137000, 159000, 184320]
  },
  "exceptions": [
    { "name": "Dovetail", "plan": "Basic", "mrr": "$120", "status": "At risk", "provenance": "source" }
  ],
  "events": [
    { "subject": "Dovetail", "event": "Plan cancelled", "detail": "Basic plan", "time": "1 hr ago", "provenance": "source" },
    { "subject": "Orbit Systems", "event": "Trial converted", "time": "43 min ago", "provenance": "source" }
  ]
}
```

If the existing source image/text does not support any listed revenue-series point, omit `context.revenueSeries` rather than infer it. Source fidelity wins over visual completeness.

- [ ] **Step 2: Validate the fixture**

```bash
npm run validate:saas
```

Expected: `valid`.

- [ ] **Step 3: Commit**

```bash
git add examples/saas/input.no-score.json
git commit -m "test: add canonical SaaS no-score fixture"
```

---

### Task 4: Build deterministic SVG renderer first

**Files:**
- Create: `skills/decision-first-dashboard/templates/no-score.svg`
- Create: `skills/decision-first-dashboard/scripts/render.js`
- Create: `tests/compiler/render-svg.test.js`
- Generate: `examples/saas/output.no-score.svg`

**Interfaces:**
- Consumes: validated decision-state JSON.
- Produces: `renderSvg(data)` and deterministic SVG artifact.

- [ ] **Step 1: Write failing SVG tests**

Tests must assert:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSvg } from '../../skills/decision-first-dashboard/scripts/render.js';

const data = JSON.parse(fs.readFileSync('examples/saas/input.no-score.json', 'utf8'));

test('renders evidence-bounded synthesis and source signals', () => {
  const svg = renderSvg(data);
  assert.match(svg, /Subscription health/);
  assert.match(svg, /IMPROVING/i);
  assert.match(svg, /Target unknown/);
  assert.match(svg, /\+12\.4%/);
  assert.match(svg, /-0\.6pp/);
  assert.match(svg, /Dovetail/);
});

test('does not render forbidden admin-dashboard language', () => {
  const svg = renderSvg(data);
  for (const forbidden of ['HEALTH GOOD', 'Primary Decision', 'Diagnostic Context', 'Required Interventions', 'Contact', 'Intervene']) {
    assert.equal(svg.includes(forbidden), false);
  }
});

test('does not expose full customer table markup', () => {
  const svg = renderSvg(data);
  assert.equal(svg.includes('CUSTOMER_TABLE'), false);
});
```

- [ ] **Step 2: Run SVG tests to verify RED state**

```bash
node --test tests/compiler/render-svg.test.js
```

Expected: FAIL because `renderSvg` is not implemented.

- [ ] **Step 3: Create fixed SVG template geometry**

`no-score.svg` must use a fixed `viewBox="0 0 1440 900"` and hard-code these layout regions:

- navigation/sidebar: 0–160px;
- content left: approximately x=200–455;
- dominant center: approximately x=475–1035;
- right support: approximately x=1055–1380.

The center must contain four fixed signal slots around a central synthesis label. Side regions must not expose general-purpose card-grid placeholders.

Use placeholders only for bounded data such as:

```text
{{TITLE}}
{{CENTER_STATUS}}
{{CENTER_SUBSTATUS}}
{{SIGNAL_1_LABEL}}
{{SIGNAL_1_VALUE}}
...
{{EXCEPTION_1_NAME}}
{{EXCEPTION_1_STATUS}}
```

- [ ] **Step 4: Implement `renderSvg(data)`**

Renderer behavior:

1. Call `validateDecisionState(data)` and throw on invalid data.
2. Map synthesis enum deterministically:
   - `improving` → `Improving`
   - `deteriorating` → `Deteriorating`
   - `mixed` → `Mixed`
   - `unknown` → `Direction unknown`
3. Map `targetState=unknown` → `Target unknown`.
4. Fill up to four central signal slots from validated `signals`.
5. Fill right exception/event slots from validated arrays.
6. Escape XML entities.
7. Never generate arbitrary layout elements from payload keys.

- [ ] **Step 5: Run SVG tests**

```bash
npm test
```

Expected: schema and SVG tests PASS.

- [ ] **Step 6: Generate the SVG example**

```bash
npm run render:saas
```

At this stage `render.js` may generate only SVG; HTML is added in Task 5.

- [ ] **Step 7: Commit**

```bash
git add skills/decision-first-dashboard/templates/no-score.svg skills/decision-first-dashboard/scripts/render.js tests/compiler/render-svg.test.js examples/saas/output.no-score.svg
git commit -m "feat: render deterministic decision-first SVG"
```

---

### Task 5: Build high-fidelity HTML/CSS renderer from the same JSON

**Files:**
- Create: `skills/decision-first-dashboard/templates/no-score.html`
- Create: `skills/decision-first-dashboard/templates/dashboard.css`
- Modify: `skills/decision-first-dashboard/scripts/render.js`
- Create: `tests/compiler/render-html.test.js`
- Generate: `examples/saas/output.no-score.html`

**Interfaces:**
- Consumes: same validated JSON as SVG renderer.
- Produces: `renderHtml(data)` and static HTML artifact.

- [ ] **Step 1: Write failing HTML tests**

Assert:

- `renderHtml()` includes `Subscription health`, `Improving`, `Target unknown`, source values, Dovetail.
- output does not contain `grid-template-columns: repeat(4` or class names such as `kpi-grid`.
- output does not contain `<table`.
- output does not contain invented workflow labels.
- HTML references or embeds the fixed dashboard stylesheet.

- [ ] **Step 2: Run tests to verify RED state**

```bash
node --test tests/compiler/render-html.test.js
```

Expected: FAIL because `renderHtml` is not implemented.

- [ ] **Step 3: Create fixed HTML shell**

The template must contain only these zones:

```html
<main class="dashboard-shell">
  <aside class="context-column">...</aside>
  <section class="synthesis-region">...</section>
  <aside class="exceptions-column">...</aside>
</main>
```

The LLM never edits this template during normal skill execution.

- [ ] **Step 4: Create the CSS visual system**

Use a calm SaaS style derived from the existing After family:

- page background: very light lavender/gray;
- cards: white or near-white;
- border radius: 18–22px;
- subtle 1px borders;
- center region width: 48%;
- left region: 22%;
- right region: 30%;
- center signal cluster uses absolute/grid placement internal to that region;
- muted semantic green for improving movement;
- restrained warning color only for source-supported account exception labels;
- no traffic-light card backgrounds;
- no full-width table styles.

- [ ] **Step 5: Implement `renderHtml(data)` and CLI generation of both formats**

CLI behavior:

```bash
node render.js <input.json> <output-directory>
```

writes:

```text
output.no-score.svg
output.no-score.html
```

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all schema/SVG/HTML tests PASS.

- [ ] **Step 7: Generate examples and commit**

```bash
npm run render:saas
git add skills/decision-first-dashboard/templates/no-score.html skills/decision-first-dashboard/templates/dashboard.css skills/decision-first-dashboard/scripts/render.js tests/compiler/render-html.test.js examples/saas/output.no-score.html examples/saas/output.no-score.svg
git commit -m "feat: render high-fidelity dashboard HTML"
```

---

### Task 6: Add renderer-level integrity and deterministic-output tests

**Files:**
- Modify: `tests/compiler/render-svg.test.js`
- Modify: `tests/compiler/render-html.test.js`
- Modify: `tests/compiler/schema.test.js`

**Interfaces:**
- Produces: regression guard against the hallucinations observed in Gemini v3–v6.

- [ ] **Step 1: Add invalid fixture tests**

Add cases that must fail validation when payload contains:

```text
score
healthStatus
health_good
target
goal
renewalDue
riskFactor
action
assignee
workflow
```

- [ ] **Step 2: Add rendered-text equality test**

Extract every dynamic text token used by SVG/HTML and assert it comes from:

- fixed renderer-owned UI vocabulary; or
- validated source JSON.

Maintain a renderer-owned copy allowlist such as:

```js
const fixedCopy = new Set([
  'Subscription health',
  'Improving',
  'Deteriorating',
  'Mixed',
  'Direction unknown',
  'Target unknown',
  'Revenue growth',
  'Accounts to watch',
  'Recent events'
]);
```

- [ ] **Step 3: Add deterministic output test**

Call `renderSvg(data)` and `renderHtml(data)` twice and assert byte-for-byte equality.

- [ ] **Step 4: Run tests and commit**

```bash
npm test
git add tests/compiler
git commit -m "test: harden compiler against dashboard hallucinations"
```

---

### Task 7: Rewrite the Skill to use the compiler pipeline

**Files:**
- Modify: `skills/decision-first-dashboard/SKILL.md`
- Modify: `skills/decision-first-dashboard/references/visual-pattern.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: schema, validator, renderer scripts created in Tasks 1–6.
- Produces: agent workflow that no longer asks models to freely design visuals.

- [ ] **Step 1: Rewrite Skill execution flow**

The Skill must instruct agents to:

```text
1. Extract verified source facts.
2. Determine composite vs no-score mode.
3. Populate canonical decision-state JSON only.
4. If code execution is available, run validate.js.
5. If validation fails, correct JSON; do not render.
6. Run render.js using the fixed renderer.
7. Return the generated SVG/HTML artifact.
8. If execution is unavailable, emit canonical JSON + use deterministic SVG fallback instructions; do not free-design a dashboard image.
```

The Skill must explicitly state:

> Do not ask an image model or visual canvas to reinterpret the layout when the deterministic renderer is available.

- [ ] **Step 2: Update visual reference docs**

`visual-pattern.md` becomes renderer documentation, not instructions for free-form visual generation.

- [ ] **Step 3: Update README Quick Start**

Document both paths:

```bash
npm install
npm run validate:saas
npm run render:saas
```

and explain that the skill now behaves like a small dashboard compiler.

- [ ] **Step 4: Run all tests**

```bash
npm test
npm run validate:saas
npm run render:saas
```

Expected:

- all tests PASS;
- validation prints `valid`;
- both output artifacts are generated.

- [ ] **Step 5: Commit**

```bash
git add skills/decision-first-dashboard/SKILL.md skills/decision-first-dashboard/references/visual-pattern.md README.md
git commit -m "feat: route dashboard skill through deterministic compiler"
```

---

### Task 8: Final MVP verification against acceptance criteria

**Files:**
- Inspect: `examples/saas/output.no-score.svg`
- Inspect: `examples/saas/output.no-score.html`
- Inspect: test output and git diff

**Interfaces:**
- Produces: evidence that the compiler MVP satisfies the approved design spec.

- [ ] **Step 1: Run the complete verification sequence**

```bash
npm test
npm run validate:saas
npm run render:saas
```

Expected:

- zero test failures;
- validator returns `valid`;
- SVG and HTML artifacts exist.

- [ ] **Step 2: Inspect rendered structure**

Check both outputs against this acceptance checklist:

```text
[ ] no invented score
[ ] no invented target/goal
[ ] no unsupported health verdict
[ ] no invented customer event/workflow/action
[ ] no four equal KPI cards across the top
[ ] no dominant full-width customer table
[ ] dominant center synthesis
[ ] 3–6 source-supported signals attached to center
[ ] compact left context
[ ] compact right exceptions/events
[ ] all dynamic values match canonical JSON
```

- [ ] **Step 3: Compare repository changes**

```bash
git status --short
git diff --stat HEAD~7..HEAD
```

Verify no unrelated files were changed.

- [ ] **Step 4: Only after the checklist passes, mark the compiler MVP ready for external agent testing**

Next external test should no longer ask Gemini/Claude to draw the UI. Ask the agent to extract/populate the JSON contract and invoke the renderer when its environment permits.
