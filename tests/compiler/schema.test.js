import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDecisionState } from '../../skills/decision-first-dashboard/scripts/validate.js';

const base = {
  mode: 'no_score',
  synthesis: {
    targetState: 'unknown',
    exceptionState: 'present'
  },
  signals: [
    { metric: 'mrr', label: 'MRR', value: '$184,320', delta: '+12.4%', direction: 'improving', provenance: 'source' },
    { metric: 'active_customers', label: 'Customers', value: '8,942', delta: '+8.1%', direction: 'improving', provenance: 'source' },
    { metric: 'churn_rate', label: 'Churn', value: '2.84%', delta: '-0.6pp', direction: 'improving', provenance: 'source' },
    { metric: 'trial_conversion', label: 'Trial conversion', value: '31.7%', delta: '+3.2%', direction: 'improving', provenance: 'source' }
  ],
  exceptions: [
    { name: 'Dovetail', plan: 'Basic', mrr: '$120', status: 'At risk', provenance: 'source' }
  ],
  events: [
    { subject: 'Dovetail', event: 'Plan cancelled', time: '1 hr ago', provenance: 'source' },
    { subject: 'Orbit Systems', event: 'Trial converted', time: '43 min ago', provenance: 'source' }
  ]
};

test('accepts the canonical no-score payload without caller-supplied overall direction', () => {
  assert.equal(validateDecisionState(base).valid, true);
});

test('rejects caller-supplied overall direction so the renderer must derive it', () => {
  const bad = structuredClone(base);
  bad.synthesis.direction = 'improving';
  assert.equal(validateDecisionState(bad).valid, false);
});

test('rejects invented score fields in no-score mode', () => {
  const bad = structuredClone(base);
  bad.score = { value: 68 };
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

test('rejects the recurring hallucination fields seen in visual regressions', () => {
  const rootFields = ['healthStatus', 'health_good', 'goal', 'workflow'];
  for (const field of rootFields) {
    const bad = structuredClone(base);
    bad[field] = 'invented';
    assert.equal(validateDecisionState(bad).valid, false, field);
  }

  const exceptionFields = ['renewalDue', 'riskFactor', 'assignee'];
  for (const field of exceptionFields) {
    const bad = structuredClone(base);
    bad.exceptions[0][field] = 'invented';
    assert.equal(validateDecisionState(bad).valid, false, field);
  }
});

test('requires visible account exceptions and events to come from source evidence', () => {
  const derivedException = structuredClone(base);
  derivedException.exceptions[0].provenance = 'derived';
  assert.equal(validateDecisionState(derivedException).valid, false);

  const derivedEvent = structuredClone(base);
  derivedEvent.events[0].provenance = 'derived';
  assert.equal(validateDecisionState(derivedEvent).valid, false);
});

test('requires explicit source provenance for numeric context series', () => {
  const missing = structuredClone(base);
  missing.context = { revenueSeries: [100, 120, 140] };
  assert.equal(validateDecisionState(missing).valid, false);

  const derived = structuredClone(base);
  derived.context = { revenueSeries: [100, 120, 140], provenance: 'derived' };
  assert.equal(validateDecisionState(derived).valid, false);

  const sourced = structuredClone(base);
  sourced.context = { revenueSeries: [100, 120, 140], provenance: 'source' };
  assert.equal(validateDecisionState(sourced).valid, true);
});

test('allows source plan names without product-specific enums', () => {
  const good = structuredClone(base);
  good.exceptions[0].plan = 'Enterprise Plus';
  assert.equal(validateDecisionState(good).valid, true);
});
