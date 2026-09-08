import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';

const groundingDir = fileURLToPath(new URL('./fixtures/grounding/', import.meta.url));
const routingDir = fileURLToPath(new URL('./fixtures/routing/', import.meta.url));
const noScoreBundle = JSON.parse(fs.readFileSync(path.join(groundingDir, 'no-score.grounded.json'), 'utf8'));
const noScoreRouting = JSON.parse(fs.readFileSync(path.join(routingDir, 'no-score.routing.json'), 'utf8'));

function assessment(overrides = {}) {
  return {
    version: '1.0',
    purpose: 'recurring_decision',
    decisionLoop: {
      status: 'confirmed',
      description: 'Weekly review changes which retention risk receives attention first.'
    },
    accountability: {
      status: 'confirmed',
      mode: 'single_owner',
      description: 'Head of Customer Success owns the review.'
    },
    responseChange: {
      status: 'confirmed',
      kind: 'priority',
      description: 'The review changes which accounts are prioritized for intervention.'
    },
    recommendedFormat: 'dashboard',
    ...overrides
  };
}

function compile(worthiness) {
  return compileDecisionDashboard(worthiness, noScoreRouting, noScoreBundle, { baseDir: groundingDir });
}

test('visibility-only requests are redirected before routing or rendering', () => {
  const result = compile(assessment({
    purpose: 'visibility_only',
    decisionLoop: { status: 'absent', description: 'The request is only to glance at numbers each week.' },
    accountability: { status: 'absent', mode: 'absent', description: 'No person or forum is accountable for acting on it.' },
    responseChange: { status: 'absent', kind: 'none', description: 'No action, priority, escalation, intervention, or coordination changes.' },
    recommendedFormat: 'scheduled_summary'
  }));

  assert.equal(result.result.stage, 'worthiness');
  assert.equal(result.result.transition, 'REDIRECT_NON_DASHBOARD');
  assert.equal(result.result.recommendedFormat, 'scheduled_summary');
  assert.equal(result.svg, null);
  assert.equal(result.html, null);
});

test('one-off questions redirect to one-off analysis instead of a persistent dashboard', () => {
  const result = compile(assessment({
    purpose: 'one_off_question',
    decisionLoop: { status: 'absent', description: 'This is a single investigation of last quarter.' },
    accountability: { status: 'confirmed', mode: 'single_owner', description: 'The analyst owns the one-time answer.' },
    responseChange: { status: 'absent', kind: 'none', description: 'There is no recurring response loop.' },
    recommendedFormat: 'one_off_analysis'
  }));

  assert.equal(result.result.transition, 'REDIRECT_NON_DASHBOARD');
  assert.equal(result.result.recommendedFormat, 'one_off_analysis');
});

test('inferred worthiness cannot silently pass and asks for confirmation', () => {
  const result = compile(assessment({
    purpose: 'unclear',
    decisionLoop: { status: 'inferred', description: 'A weekly decision loop seems plausible but is not confirmed.' },
    accountability: { status: 'inferred', mode: 'shared_forum', description: 'A cross-functional review may own the decision.' },
    responseChange: { status: 'inferred', kind: 'coordination', description: 'The meeting may change coordination priorities.' },
    recommendedFormat: 'undetermined'
  }));

  assert.equal(result.result.transition, 'ASK_WORTHINESS_QUESTION');
  assert.equal(result.svg, null);
});

test('recurring exception monitoring with an on-call team can proceed', () => {
  const result = compile(assessment({
    purpose: 'recurring_monitoring',
    decisionLoop: { status: 'confirmed', description: 'The service is monitored continuously for operational exceptions.' },
    accountability: { status: 'confirmed', mode: 'on_call_team', description: 'The on-call operations team owns escalation.' },
    responseChange: { status: 'confirmed', kind: 'escalation', description: 'A breach changes escalation and intervention.' }
  }));

  assert.equal(result.result.transition, 'PASS');
  assert.equal(result.result.worthinessSummary.accountabilityMode, 'on_call_team');
});

test('a shared decision forum is a valid accountability path without a single owner', () => {
  const result = compile(assessment({
    purpose: 'shared_coordination',
    decisionLoop: { status: 'confirmed', description: 'The board reviews the same operating signals every month.' },
    accountability: { status: 'confirmed', mode: 'shared_forum', description: 'The board is the recurring accountable decision forum.' },
    responseChange: { status: 'confirmed', kind: 'coordination', description: 'The review changes cross-functional priorities and coordination.' }
  }));

  assert.equal(result.result.transition, 'PASS');
  assert.equal(result.result.worthinessSummary.accountabilityMode, 'shared_forum');
});

test('malformed worthiness assessments fail closed before Metric Router validation', () => {
  const malformed = assessment({ surprise: 'not allowed' });
  const result = compile(malformed);

  assert.equal(result.result.stage, 'worthiness');
  assert.equal(result.result.transition, 'FIX_WORTHINESS_ASSESSMENT');
  assert.ok(result.result.errors.some((error) => error.code === 'WORTHINESS_SCHEMA_INVALID'));
  assert.equal(result.svg, null);
});
