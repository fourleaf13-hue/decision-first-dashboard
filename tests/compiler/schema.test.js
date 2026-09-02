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

test('rejects invented target fields on no-score signals', () => {
  const bad = structuredClone(base);
  bad.signals[0].target = 183000;
  assert.equal(validateDecisionState(bad).valid, false);
});

test('allows source plan names without product-specific enums', () => {
  const good = structuredClone(base);
  good.exceptions[0].plan = 'Enterprise Plus';
  assert.equal(validateDecisionState(good).valid, true);
});
