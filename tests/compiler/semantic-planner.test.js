import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRenderPlan,
  serializeRenderPlan,
  validateCompilerIntent,
  validateRenderPlan
} from '../../skills/decision-first-dashboard/scripts/planner.js';

function noScoreState() {
  return {
    mode: 'no_score',
    signals: [
      { metric: 'mrr', label: 'MRR', value: '$184k', delta: '+3.2%', direction: 'improving', provenance: 'source' },
      { metric: 'churn_rate', label: 'Churn', value: '2.1%', delta: '-0.3pp', direction: 'improving', provenance: 'source' },
      { metric: 'trial_conversion', label: 'Trial conversion', value: '22%', delta: '+2pp', direction: 'improving', provenance: 'source' }
    ]
  };
}

function legacyBundle() {
  return { decisionState: noScoreState() };
}

function v31Bundle() {
  return {
    contractVersion: '3.1',
    intent: {
      audience: 'Head of Growth',
      audienceType: 'executive',
      purpose: 'Monitor subscription health',
      primaryDecision: 'Is growth healthy enough to stay on plan?',
      refreshCadence: 'daily',
      requirements: [
        {
          id: 'req_mrr',
          label: 'Current MRR',
          kind: 'single_value',
          resolution: { type: 'decision_path', path: '/signals/0/value' }
        },
        {
          id: 'req_target',
          label: 'MRR versus target',
          kind: 'comparison',
          resolution: {
            type: 'deferred',
            blockedBy: 'missing_source_fact',
            originalSpec: 'Compare current MRR with the approved target',
            toUnblock: 'Provide a source-backed MRR target'
          }
        }
      ]
    },
    decisionState: noScoreState()
  };
}

function overlaps(a, b) {
  return a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y;
}

test('legacy bundles keep the semantic planner disabled', () => {
  assert.deepEqual(validateCompilerIntent(legacyBundle()), {
    enabled: false,
    valid: true,
    errors: []
  });
  assert.deepEqual(buildRenderPlan(legacyBundle()), {
    enabled: false,
    valid: true,
    errors: [],
    plan: null
  });
});

test('contractVersion 3.1 requires intent', () => {
  const result = validateCompilerIntent({ contractVersion: '3.1', decisionState: noScoreState() });
  assert.equal(result.enabled, true);
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'INTENT_REQUIRED');
});

test('intent requires contractVersion 3.1', () => {
  const bundle = v31Bundle();
  delete bundle.contractVersion;
  const result = validateCompilerIntent(bundle);
  assert.equal(result.enabled, true);
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'CONTRACT_VERSION_REQUIRED');
});

test('computed and deferred requirements are preserved without substitution', () => {
  const result = buildRenderPlan(v31Bundle());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.plan.requirements[0].status, 'computed');
  assert.equal(result.plan.requirements[0].decisionPath, '/signals/0/value');
  assert.equal(result.plan.requirements[1].status, 'deferred');
  assert.equal(result.plan.requirements[1].blockedBy, 'missing_source_fact');
  assert.equal(result.plan.requirements[1].originalSpec, 'Compare current MRR with the approved target');
  assert.equal(result.plan.requirements[1].toUnblock, 'Provide a source-backed MRR target');
  assert.equal(Object.hasOwn(result.plan.requirements[1], 'decisionPath'), false);
});

test('duplicate requirement ids are rejected', () => {
  const bundle = v31Bundle();
  bundle.intent.requirements[1].id = 'req_mrr';
  const result = buildRenderPlan(bundle);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.code === 'DUPLICATE_REQUIREMENT_ID'), true);
});

test('missing computed decision paths are rejected instead of substituted', () => {
  const bundle = v31Bundle();
  bundle.intent.requirements[0].resolution.path = '/signals/99/value';
  const result = buildRenderPlan(bundle);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.code === 'DECISION_PATH_NOT_FOUND'), true);
});

test('render plan layout is fixed, bounded, and non-overlapping', () => {
  const result = buildRenderPlan(v31Bundle());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const validation = validateRenderPlan(result.plan, v31Bundle().decisionState);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const { slots, gridColumns } = result.plan.layout;
  for (const slot of slots) {
    assert.ok(slot.x >= 0);
    assert.ok(slot.w > 0);
    assert.ok(slot.x + slot.w <= gridColumns);
  }
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      assert.equal(overlaps(slots[i], slots[j]), false, `${slots[i].id} overlaps ${slots[j].id}`);
    }
  }
});

test('identical semantic input produces byte-identical canonical plan JSON', () => {
  const first = buildRenderPlan(v31Bundle());
  const second = buildRenderPlan(v31Bundle());
  assert.equal(first.valid, true);
  assert.equal(second.valid, true);
  assert.equal(serializeRenderPlan(first.plan), serializeRenderPlan(second.plan));
  assert.ok(serializeRenderPlan(first.plan).endsWith('\n'));
});
