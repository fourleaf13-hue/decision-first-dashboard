import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';

const groundingDir = fileURLToPath(new URL('./fixtures/grounding/', import.meta.url));
const routingDir = fileURLToPath(new URL('./fixtures/routing/', import.meta.url));
const worthinessDir = fileURLToPath(new URL('./fixtures/worthiness/', import.meta.url));
const noScoreBundle = JSON.parse(fs.readFileSync(path.join(groundingDir, 'no-score.grounded.json'), 'utf8'));
const noScoreRouting = JSON.parse(fs.readFileSync(path.join(routingDir, 'no-score.routing.json'), 'utf8'));
const dashboardWorthiness = JSON.parse(fs.readFileSync(path.join(worthinessDir, 'dashboard.worthiness.json'), 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(path.join(worthinessDir, 'scenarios.json'), 'utf8'));

function compile(worthiness) {
  return compileDecisionDashboard(worthiness, noScoreRouting, noScoreBundle, { baseDir: groundingDir });
}

for (const scenario of scenarios) {
  test(`worthiness scenario: ${scenario.id}`, () => {
    const result = compile(scenario.assessment);

    assert.equal(result.result.transition, scenario.expected.transition);
    if (scenario.expected.recommendedFormat) {
      assert.equal(result.result.recommendedFormat, scenario.expected.recommendedFormat);
    }
    if (scenario.expected.accountabilityMode) {
      assert.equal(result.result.worthinessSummary.accountabilityMode, scenario.expected.accountabilityMode);
    }

    if (scenario.expected.transition !== 'PASS') {
      assert.equal(result.result.stage, 'worthiness');
      assert.equal(result.svg, null);
      assert.equal(result.html, null);
    }
  });
}

test('malformed worthiness assessments fail closed before Metric Router validation', () => {
  const malformed = { ...structuredClone(dashboardWorthiness), surprise: 'not allowed' };
  const result = compile(malformed);

  assert.equal(result.result.stage, 'worthiness');
  assert.equal(result.result.transition, 'FIX_WORTHINESS_ASSESSMENT');
  assert.ok(result.result.errors.some((error) => error.code === 'WORTHINESS_SCHEMA_INVALID'));
  assert.equal(result.svg, null);
});

test('a non-dashboard redirect cannot smuggle dashboard back in as the recommended format', () => {
  const visibility = structuredClone(scenarios.find((scenario) => scenario.id === 'visibility-only').assessment);
  visibility.recommendedFormat = 'dashboard';
  const result = compile(visibility);

  assert.equal(result.result.transition, 'FIX_WORTHINESS_ASSESSMENT');
  assert.ok(result.result.errors.some((error) => error.code === 'FORMAT_TRANSITION_CONFLICT'));
});

test('an explicit user override can proceed to Decision Brief while keeping downstream gates intact', () => {
  const visibility = structuredClone(scenarios.find((scenario) => scenario.id === 'visibility-only').assessment);
  visibility.userOverride = true;
  visibility.recommendedFormat = 'dashboard';
  const result = compile(visibility);

  assert.equal(result.result.transition, 'PASS');
  assert.equal(result.result.worthinessSummary.userOverride, true);
  assert.equal(result.result.routingSummary.primaryCount, 5);
});
