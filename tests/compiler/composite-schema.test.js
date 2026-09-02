import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateDecisionState } from '../../skills/decision-first-dashboard/scripts/validate.js';

const fixtureUrl = new URL('./fixtures/composite.valid.json', import.meta.url);
const base = JSON.parse(fs.readFileSync(fixtureUrl, 'utf8'));

function valid(data) {
  return validateDecisionState(data).valid;
}

test('accepts a source-supported composite weighted-average payload', () => {
  assert.equal(valid(base), true);
});

test('rejects a composite component without a source weight', () => {
  const bad = structuredClone(base);
  delete bad.model.components[0].weight;
  assert.equal(valid(bad), false);
});

test('rejects composite weights that do not sum to one', () => {
  const bad = structuredClone(base);
  bad.model.components[0].weight = 0.5;
  assert.equal(valid(bad), false);
});

test('rejects a composite score that does not match the weighted average', () => {
  const bad = structuredClone(base);
  bad.score.value = 72;
  assert.equal(valid(bad), false);
});

test('rejects a score band label that does not match the score', () => {
  const bad = structuredClone(base);
  bad.score.band = 'Watch';
  assert.equal(valid(bad), false);
});

test('rejects gaps in source-provided score bands', () => {
  const bad = structuredClone(base);
  bad.model.bands[1].min = 71;
  assert.equal(valid(bad), false);
});

test('rejects overlaps in source-provided score bands', () => {
  const bad = structuredClone(base);
  bad.model.bands[1].min = 69;
  assert.equal(valid(bad), false);
});

test('rejects normalized component scores outside the composite scale', () => {
  const bad = structuredClone(base);
  bad.model.components[0].normalizedScore = 120;
  assert.equal(valid(bad), false);
});

test('rejects invented or unsupported composite methods', () => {
  const inferred = structuredClone(base);
  inferred.model.normalization = 'agent_inferred';
  assert.equal(valid(inferred), false);

  const median = structuredClone(base);
  median.model.aggregation = 'median';
  assert.equal(valid(median), false);
});

test('keeps no-score mode physically closed to composite fields', () => {
  const noScore = {
    mode: 'no_score',
    signals: [
      { metric: 'mrr', label: 'MRR', value: '$184,320', delta: '+12.4%', direction: 'improving', provenance: 'source' },
      { metric: 'active_customers', label: 'Customers', value: '8,942', delta: '+8.1%', direction: 'improving', provenance: 'source' },
      { metric: 'churn_rate', label: 'Churn', value: '2.84%', delta: '-0.6pp', direction: 'improving', provenance: 'source' }
    ]
  };
  noScore.model = structuredClone(base.model);
  assert.equal(valid(noScore), false);
});
