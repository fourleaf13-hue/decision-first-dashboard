import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml, renderSvg } from '../../skills/decision-first-dashboard/scripts/render.js';

const state = {
  mode: 'no_score',
  signals: [
    { metric: 'orders', label: 'Orders', value: '218', provenance: 'source' },
    { metric: 'products', label: 'Products', value: '36', provenance: 'source' },
    { metric: 'sugar_cookie_share', label: 'Sugar cookie share', value: '77%', provenance: 'source' }
  ],
  semanticNodes: [
    {
      id: 'monthly_orders',
      type: 'Distribution',
      title: 'Order seasonality',
      items: [
        { label: 'Jan', value: 6 },
        { label: 'Feb', value: 18 },
        { label: 'Mar', value: 23 }
      ]
    },
    {
      id: 'product_roi',
      type: 'Ranking',
      title: 'Highest and lowest ROI',
      comparability: { unit: 'percent', comparisonGroup: 'product_roi', comparabilityDomain: 'roi', normalization: 'raw' },
      items: [
        { label: 'Sugar Cookies', value: '1109%' },
        { label: 'Salted Caramel Chocolate', value: '104%' }
      ]
    }
  ],
  relationships: [
    { id: 'product_roi', relationType: 'comparison', subjectRefs: ['product_roi'], provenance: 'source', comparison: { metricIdentity: 'roi' } }
  ]
};

const composition = {
  nodes: [
    { id: 'monthly_orders', type: 'Distribution', presentation: 'full_chart' },
    { id: 'product_roi', type: 'Ranking', presentation: 'both_ends' }
  ]
};

test('semantic nodes render through the existing renderer entrypoint with delivered markers', () => {
  const html = renderHtml(state, { composition });
  const svg = renderSvg(state, { composition });

  for (const artifact of [html, svg]) {
    assert.match(artifact, /data-semantic-node="monthly_orders"[^>]*data-presentation="full_chart"[^>]*data-coverage="distribution_shape"/);
    assert.match(artifact, /data-semantic-node="product_roi"[^>]*data-presentation="both_ends"[^>]*data-coverage="ranking_span relative_comparison[^\"]*"/);
    assert.match(artifact, /Order seasonality/);
    assert.doesNotMatch(artifact, /DETERIORATING|IMPROVING|MIXED/);
  }
});
