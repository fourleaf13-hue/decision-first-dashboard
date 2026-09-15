import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeAdaptiveComposition,
  verifyDeliveredArtifact
} from '../../skills/decision-first-dashboard/scripts/composition.js';
import { renderHtml, renderSvg } from '../../skills/decision-first-dashboard/scripts/render.js';
import { renderTypedClaim } from '../../skills/decision-first-dashboard/scripts/render-semantic.js';

const monthlyRequirement = {
  id: 'ctx_monthly_orders',
  type: 'distribution_shape',
  subject: 'monthly_orders',
  minimumCoverage: 'full_distribution',
  status: 'inferred'
};

test('coverage is evaluated for the required subject, not satisfied by another node', () => {
  const result = composeAdaptiveComposition({
    contextRequirements: [monthlyRequirement],
    nodes: [
      { id: 'monthly_orders', type: 'Distribution', presentation: 'peak_summary' },
      { id: 'demand_theme_distribution', type: 'Distribution', presentation: 'full_chart' }
    ]
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'CONTEXT_PRESERVATION_FAILED'));
  assert.ok(result.errors.some((error) => error.path === '/nodes/0/presentation'));
});

function semanticState(itemCount = 12) {
  const items = Array.from({ length: itemCount }, (_, index) => ({
    label: `Month ${index + 1}`,
    value: index + 1,
    provenance: 'source'
  }));
  return {
    mode: 'no_score',
    signals: [
      { metric: 'orders', label: 'Orders', value: '218', provenance: 'source' },
      { metric: 'products', label: 'Products', value: '36', provenance: 'source' },
      { metric: 'share', label: 'Share', value: '77%', provenance: 'source' }
    ],
    semanticNodes: [
      { id: 'monthly_orders', type: 'Distribution', title: 'Monthly orders', items },
      { id: 'annual_orders', type: 'Trend', title: 'Annual orders', items: items.slice(0, 4) },
      { id: 'product_roi', type: 'Ranking', title: 'Product ROI', items: items.slice(0, 4) },
      { id: 'revenue_target', type: 'Relationship', title: 'Revenue against target', items: items.slice(0, 3) }
    ]
  };
}

const semanticComposition = {
  nodes: [
    { id: 'monthly_orders', type: 'Distribution', presentation: 'full_chart' },
    { id: 'annual_orders', type: 'Trend', presentation: 'full_chart' },
    { id: 'product_roi', type: 'Ranking', presentation: 'full_ranking' },
    { id: 'revenue_target', type: 'Relationship', presentation: 'full_chart' }
  ]
};

test('delivered SVG must contain every source item promised by the manifest', () => {
  const state = semanticState(12);
  const html = renderHtml(state, { composition: { nodes: [semanticComposition.nodes[0]] } });
  const renderedSvg = renderSvg(state, { composition: { nodes: [semanticComposition.nodes[0]] } });
  const svg = renderedSvg.replace(/<g data-semantic-node="monthly_orders" data-semantic-item="true" data-item-index="(?:8|9|10|11)"[^>]*>[\s\S]*?<\/g>/g, '');
  const result = verifyDeliveredArtifact({
    html,
    svg,
    manifest: {
      nodes: [{
        id: 'monthly_orders',
        type: 'Distribution',
        presentation: 'full_chart',
        coverage: ['distribution_shape'],
        expectedItemCount: 12
      }],
      claims: [],
      evidence: []
    }
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'DELIVERED_ITEM_COUNT_MISMATCH'));
});

test('semantic presentations expose their actual structure for every node type', () => {
  const state = semanticState(4);
  const composition = { nodes: semanticComposition.nodes.slice(1) };
  const html = renderHtml(state, { composition });
  const svg = renderSvg(state, { composition });

  for (const artifact of [html, svg]) {
    assert.match(artifact, /data-semantic-node="annual_orders"[^>]*data-structure="ordered-trajectory"/);
    assert.match(artifact, /data-semantic-node="product_roi"[^>]*data-structure="ranked-order"/);
    assert.match(artifact, /data-semantic-node="revenue_target"[^>]*data-structure="target-gap"/);
  }

  const distributionHtml = renderHtml(state, { composition: { nodes: [semanticComposition.nodes[0]] } });
  const distributionSvg = renderSvg(state, { composition: { nodes: [semanticComposition.nodes[0]] } });
  assert.match(distributionHtml, /data-semantic-node="monthly_orders"[^>]*data-structure="ordered-distribution"/);
  assert.match(distributionSvg, /data-semantic-node="monthly_orders"[^>]*data-structure="ordered-distribution"/);
});

test('an overall verdict must enter through a typed claim renderer path', () => {
  const state = semanticState(3);
  state.overallVerdict = 'Business is weakening';

  assert.throws(
    () => renderHtml(state, { composition: { nodes: [semanticComposition.nodes[0]] } }),
    /typed claim/i
  );
});

test('visible overall claims must resolve every evidence reference', () => {
  const result = verifyDeliveredArtifact({
    html: '<div data-claim-id="claim-1" data-claim-scope="overall"></div>',
    svg: '<svg data-claim-id="claim-1" data-claim-scope="overall"></svg>',
    manifest: {
      nodes: [],
      claims: [{
        id: 'claim-1',
        claimType: 'overall_direction',
        scope: 'overall',
        evidenceRefs: ['ev_missing']
      }],
      evidence: [{ id: 'ev_real' }]
    }
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'CLAIM_EVIDENCE_REF_NOT_FOUND'));
});

test('overall claim markers carry the same evidence refs in both final artifacts', () => {
  const claim = {
    id: 'claim_direction',
    claimType: 'overall_direction',
    scope: 'overall',
    text: 'Orders are improving',
    evidenceRefs: ['ev_direction']
  };
  const html = renderTypedClaim(claim, 'html');
  const svg = renderTypedClaim(claim, 'svg');
  const manifest = { nodes: [], claims: [claim], evidence: [{ id: 'ev_direction' }] };

  assert.equal(verifyDeliveredArtifact({ html, svg, manifest }).valid, true);

  const mutatedSvg = svg.replace('data-claim-evidence-refs="ev_direction"', 'data-claim-evidence-refs="ev_other"');
  const result = verifyDeliveredArtifact({ html, svg: mutatedSvg, manifest });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'OVERALL_CLAIM_EVIDENCE_MARKER_MISMATCH'));
});

test('composition decisions reject fake requirement and modifier references', () => {
  const result = composeAdaptiveComposition({
    contextRequirements: [monthlyRequirement],
    nodes: [
      { id: 'monthly_orders', type: 'Distribution', presentation: 'full_chart' },
      { id: 'secondary_ranking', type: 'Ranking', presentation: 'full_ranking', compactPresentation: 'both_ends' }
    ],
    modifiers: { density: 'compact', activeModifierIds: ['executive_monthly'] },
    decisionLog: [
      {
        node: 'monthly_orders',
        decision: 'retain_full',
        reasonCode: 'CONTEXT_REQUIRES_DISTRIBUTION_SHAPE',
        requirementRef: 'ctx_missing'
      },
      {
        node: 'secondary_ranking',
        decision: 'collapse_to_drilldown',
        reasonCode: 'AUDIENCE_DENSITY_LIMIT',
        modifierRef: 'modifier_missing'
      }
    ]
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors.filter((error) => error.code === 'COMPOSITION_DECISION_REF_NOT_FOUND').length, 2);
});

test('empty artifacts cannot claim delivered coverage', () => {
  const result = verifyDeliveredArtifact({
    html: '',
    svg: '',
    manifest: {
      nodes: [{
        id: 'monthly_orders',
        type: 'Distribution',
        presentation: 'full_chart',
        coverage: ['distribution_shape'],
        expectedItemCount: 12
      }],
      claims: [],
      evidence: []
    }
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'DELIVERED_ARTIFACT_EMPTY'));
});

test('verification binds the final manifest payload and detects later mutation', () => {
  const html = '<section data-semantic-node="monthly_orders" data-presentation="full_chart" data-coverage="distribution_shape"></section>';
  const svg = '<g data-semantic-node="monthly_orders" data-presentation="full_chart" data-coverage="distribution_shape"></g>';
  const payload = {
    nodes: [{ id: 'monthly_orders', type: 'Distribution', presentation: 'full_chart', coverage: ['distribution_shape'] }],
    claims: [],
    coverage: { required: ['distribution_shape'], delivered: ['distribution_shape'], missing: [] },
    decisionLog: []
  };
  const issued = verifyDeliveredArtifact({ html, svg, manifest: payload });
  assert.equal(issued.valid, true);

  const finalManifest = { ...payload, verification: issued.verification };
  assert.equal(verifyDeliveredArtifact({ html, svg, manifest: finalManifest }).valid, true);

  const mutated = {
    ...finalManifest,
    coverage: { ...payload.coverage, delivered: [] }
  };
  const checked = verifyDeliveredArtifact({ html, svg, manifest: mutated });
  assert.equal(checked.valid, false);
  assert.ok(checked.errors.some((error) => error.code === 'VERIFICATION_STAMP_MISMATCH'));
});
