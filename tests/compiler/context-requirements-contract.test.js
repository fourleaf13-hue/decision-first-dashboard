import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDecisionBrief } from '../../skills/decision-first-dashboard/scripts/intake.js';

const bakeryBrief = {
  decision: {
    status: 'confirmed',
    value: 'Which products and demand patterns should receive priority investment?'
  },
  action: {
    status: 'confirmed',
    value: 'Prioritize products and demand themes using the retained order and ROI context.'
  },
  audience: { status: 'confirmed', value: 'bakery owner / operations manager' },
  cadence: { status: 'confirmed', value: 'monthly operating review' },
  contextRequirements: [
    { type: 'relative_comparison', subject: 'annual_orders', minimumCoverage: 'current_plus_reference', status: 'inferred' },
    { type: 'distribution_shape', subject: 'monthly_orders', minimumCoverage: 'full_distribution', status: 'inferred' },
    { type: 'ranking_span', subject: 'product_roi', minimumCoverage: 'both_ends', status: 'inferred' },
    { type: 'temporal_reference', subject: 'annual_orders', minimumCoverage: 'current_plus_reference', status: 'inferred' }
  ]
};

test('Decision Brief accepts structured context requirements without turning intake into a questionnaire', () => {
  const result = evaluateDecisionBrief(bakeryBrief);

  assert.equal(result.valid, true);
  assert.equal(result.transition, 'ALLOW_ROUTING');
  assert.deepEqual(result.summary.contextRequirements, bakeryBrief.contextRequirements);
});
