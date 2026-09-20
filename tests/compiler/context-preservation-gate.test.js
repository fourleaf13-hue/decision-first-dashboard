import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';

const worthiness = JSON.parse(fs.readFileSync(new URL('./fixtures/worthiness/dashboard.worthiness.json', import.meta.url), 'utf8'));

const decision = 'Which products and demand patterns should receive priority investment?';
const action = 'Prioritize products and demand themes using the retained order and ROI context.';

function brief() {
  return {
    decision: { status: 'confirmed', value: decision },
    action: { status: 'confirmed', value: action },
    questionShape: { status: 'confirmed', value: 'state' },
    actionShape: { status: 'confirmed', value: 'observe' },
    contextRequirements: [
      { id: 'ctx_monthly_distribution', type: 'distribution_shape', subject: 'monthly_orders', minimumCoverage: 'full_distribution', status: 'inferred' }
    ]
  };
}

function routing() {
  return {
    decision,
    action,
    inventoryCount: 3,
    metrics: ['annual_orders', 'monthly_orders', 'product_roi'].map((metric) => ({
      metric,
      role: 'primary_signal',
      changesDecision: true,
      decisionImpact: 'Changes the prioritization decision.',
      visibility: 'first_view'
    })),
    compositionNodes: [
      { id: 'annual_orders', type: 'Trend', presentation: 'full_chart' },
      { id: 'monthly_orders', type: 'Distribution', presentation: 'peak_summary' },
      { id: 'product_roi', type: 'Ranking', presentation: 'both_ends' }
    ]
  };
}

function bundle() {
  return {
    decisionState: {
      mode: 'no_score',
      signals: [
        { metric: 'annual_orders', label: 'Annual orders', value: '72', provenance: 'source' },
        { metric: 'monthly_orders', label: 'Monthly orders', value: '43', provenance: 'source' },
        { metric: 'product_roi', label: 'Product ROI', value: '1109%', provenance: 'source' }
      ]
    }
  };
}

test('compiler stops before grounding when selected presentation drops required context', () => {
  const compiled = compileDecisionDashboard(worthiness, brief(), routing(), bundle());

  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.stage, 'composition');
  assert.equal(compiled.result.transition, 'CONTEXT_PRESERVATION_FAILED');
  assert.deepEqual(compiled.result.errors, [{
    code: 'CONTEXT_PRESERVATION_FAILED',
    path: '/nodes/1/presentation',
    message: 'monthly_orders requires distribution_shape, but selected presentation only preserves peak_identity.'
  }]);
});
