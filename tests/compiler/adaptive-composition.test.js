import test from 'node:test';
import assert from 'node:assert/strict';

const composition = await import('../../skills/decision-first-dashboard/scripts/composition.js');

const bakeryRequirements = [
  { id: 'ctx_annual_relative', type: 'relative_comparison', subject: 'annual_orders', minimumCoverage: 'current_plus_reference', status: 'inferred' },
  { id: 'ctx_monthly_distribution', type: 'distribution_shape', subject: 'monthly_orders', minimumCoverage: 'full_distribution', status: 'inferred' },
  { id: 'ctx_product_ranking', type: 'ranking_span', subject: 'product_roi', minimumCoverage: 'both_ends', status: 'inferred' },
  { id: 'ctx_annual_temporal', type: 'temporal_reference', subject: 'annual_orders', minimumCoverage: 'current_plus_reference', status: 'inferred' }
];

test('Bakery routes heterogeneous metrics to comparison rather than a radar profile', () => {
  const result = composition.composeAdaptiveComposition({
    contextRequirements: bakeryRequirements,
    nodes: [
      {
        id: 'bakery_focus',
        type: 'MetricCluster',
        dimensions: [
          { metric: 'sugar_cookie_share', unit: 'percent', value: 77 },
          { metric: 'holiday_orders', unit: 'orders', value: 37 },
          { metric: 'sugar_cookie_roi', unit: 'percent', value: 1109 },
          { metric: 'salted_caramel_roi', unit: 'percent', value: 104 },
          { metric: 'all_orders', unit: 'orders', value: 218 },
          { metric: 'orders_yoy', unit: 'percent', value: -9 }
        ]
      },
      { id: 'annual_orders', type: 'Trend', presentation: 'full_chart' },
      { id: 'monthly_orders', type: 'Distribution', presentation: 'full_chart' },
      { id: 'product_roi', type: 'Ranking', presentation: 'both_ends' },
      { id: 'demand_themes', type: 'Ranking', presentation: 'full_ranking' }
    ]
  });

  assert.equal(result.valid, true);
  assert.equal(result.composition.nodes[0].presentation, 'comparison');
  assert.equal(result.composition.nodes[0].profileTest.pass, false);
  assert.deepEqual(result.coverageManifest.missing, []);
});

test('Context Preservation Gate fails closed when a required distribution is reduced to a peak summary', () => {
  const result = composition.composeAdaptiveComposition({
    contextRequirements: bakeryRequirements,
    nodes: [
      { id: 'annual_orders', type: 'Trend', presentation: 'full_chart' },
      { id: 'monthly_orders', type: 'Distribution', presentation: 'peak_summary' },
      { id: 'product_roi', type: 'Ranking', presentation: 'both_ends' }
    ]
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.coverageManifest.missing, ['distribution_shape']);
  assert.deepEqual(result.errors, [{
    code: 'CONTEXT_PRESERVATION_FAILED',
    path: '/nodes/1/presentation',
    message: 'monthly_orders requires distribution_shape, but selected presentation only preserves peak_identity.'
  }]);
});
