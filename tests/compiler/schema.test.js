import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDecisionState } from '../../skills/decision-first-dashboard/scripts/validate.js';

const base = {
  mode: 'no_score',
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

test('accepts the canonical no-score payload with no caller-owned synthesis verdict', () => {
  assert.equal(validateDecisionState(base).valid, true);
});

test('rejects any caller-supplied synthesis object so the renderer owns the verdict', () => {
  for (const synthesis of [
    { direction: 'improving' },
    { targetState: 'unknown' },
    { exceptionState: 'present' }
  ]) {
    const bad = structuredClone(base);
    bad.synthesis = synthesis;
    assert.equal(validateDecisionState(bad).valid, false);
  }
});

test('accepts the full supported 3 to 6 signal range', () => {
  const three = structuredClone(base);
  three.signals = three.signals.slice(0, 3);
  assert.equal(validateDecisionState(three).valid, true);

  const six = structuredClone(base);
  six.signals.push(
    { metric: 'nrr', label: 'NRR', value: '96.8%', delta: '-0.4pp', direction: 'deteriorating', provenance: 'source' },
    { metric: 'expansion', label: 'Expansion', value: '$21,100', delta: '+14%', direction: 'improving', provenance: 'source' }
  );
  assert.equal(validateDecisionState(six).valid, true);
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

test('accepts point-in-time source signals when the source exposes no delta or direction', () => {
  const good = structuredClone(base);
  good.signals = [
    { metric: 'arr', label: 'ARR', value: '$4.98M', provenance: 'source' },
    { metric: 'ndr', label: 'NDR', value: '80.7%', provenance: 'source' },
    { metric: 'gross_margin', label: 'Gross margin', value: '88.9%', provenance: 'source' },
    { metric: 'cac_payback', label: 'CAC payback', value: '9.4 mo', provenance: 'source' },
    { metric: 'burn_multiple', label: 'Burn multiple', value: '1.5x', provenance: 'source' }
  ];
  delete good.exceptions;
  delete good.events;

  assert.equal(validateDecisionState(good).valid, true);
});
