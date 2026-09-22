import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInternalVisualSpecs, visualSpecErrors, sharedComparisonScaleId } from '../../skills/decision-first-dashboard/scripts/visual-grammar.js';

function rankingNode(id, title, group, domain, unit, values) {
  return {
    id,
    type: 'Ranking',
    presentation: 'full_ranking',
    title,
    comparability: { unit, comparisonGroup: group, comparabilityDomain: domain, normalization: 'raw' },
    items: values.map(([label, value]) => ({ label, value, provenance: 'source' }))
  };
}

function roiNodes() {
  return [
    rankingNode('roi_high', 'Highest ROI', 'product_roi', 'roi', 'percent', [['Sugar Cookies', '1109%'], ['SD Red Velvet', '753%']]),
    rankingNode('roi_low', 'Lowest ROI', 'product_roi', 'roi', 'percent', [['Salted Caramel Chocolate', '104%'], ['Brownies', '163%']])
  ];
}

function roiRelationships() {
  return [
    { id: 'product_roi', relationType: 'comparison', subjectRefs: ['roi_high', 'roi_low'], comparison: { metricIdentity: 'roi' } }
  ];
}

function build(semanticNodes, relationships) {
  return buildInternalVisualSpecs(
    { mode: 'no_score', semanticNodes, relationships },
    { nodes: semanticNodes.map((node) => ({ id: node.id, type: node.type, presentation: node.presentation })) }
  );
}

function codes(result) {
  return result.errors.map((error) => error.code);
}

test('grounded sibling rankings resolve to one canonical relationship-scoped scale declaration', () => {
  const result = build(roiNodes(), roiRelationships());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const [high, low] = result.specs;
  assert.equal(high.scale.type, 'shared');
  assert.equal(high.scale.domain, 'relationship');
  assert.equal(high.scale.scaleId, sharedComparisonScaleId('product_roi'));
  assert.equal(low.scale.scaleId, high.scale.scaleId, 'siblings must share one scaleId');
  assert.equal(high.scale.comparisonDomainId, 'roi');
  assert.equal(low.scale.comparisonDomainId, 'roi');
  const canonical = ({ type, domain, ...declaration }) => JSON.stringify(declaration);
  assert.equal(canonical(low.scale), canonical(high.scale), 'one scaleId must carry exactly one canonical declaration');
  assert.equal(high.scale.mapType, 'linear');
  assert.equal(high.scale.normalizationBasis, 'domain_max');
  assert.equal(high.scale.baseline, 0);
});

test('the shared domain and member set are computed relationship-wide, never node-wide', () => {
  const result = build(roiNodes(), roiRelationships());
  assert.equal(result.valid, true);
  const [high, low] = result.specs;
  assert.deepEqual(high.scale.valueDomain, [0, 1109]);
  assert.deepEqual(low.scale.valueDomain, [0, 1109], 'the low child must not shrink the domain to its own maximum');
  assert.deepEqual([...new Set(high.scale.memberRefs)].sort(), [
    '/semanticNodes/0/items/0',
    '/semanticNodes/0/items/1',
    '/semanticNodes/1/items/0',
    '/semanticNodes/1/items/1'
  ], 'every delivered item across both siblings is a declared member');
  assert.deepEqual([...high.scale.memberNodeIds], ['roi_high', 'roi_low']);
});

test('scale declarations are deterministic across repeated builds', () => {
  const first = build(roiNodes(), roiRelationships());
  const second = build(roiNodes(), roiRelationships());
  assert.equal(JSON.stringify(first.specs.map((spec) => spec.scale)), JSON.stringify(second.specs.map((spec) => spec.scale)));
});

test('an ungrounded comparisonGroup never becomes a shared scale', () => {
  const result = build(roiNodes(), []);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('VISUAL_COMPARABILITY_FAILED'), JSON.stringify(codes(result)));
  for (const spec of result.specs) {
    assert.equal(spec.scale.type, 'local', 'without a grounded relationship the node keeps its registry scale; no shared map is fabricated');
  }
});

test('same unit alone never forms a shared scale across different relationships', () => {
  const nodes = [
    rankingNode('roi_high', 'Highest ROI', 'spread_a', 'roi_a', 'percent', [['Sugar Cookies', '1109%'], ['SD Red Velvet', '753%']]),
    rankingNode('roi_low', 'Lowest ROI', 'spread_b', 'roi_b', 'percent', [['Salted Caramel Chocolate', '104%'], ['Brownies', '163%']])
  ];
  const result = build(nodes, [
    { id: 'spread_a', relationType: 'comparison', subjectRefs: ['roi_high'], comparison: { metricIdentity: 'roi_a' } },
    { id: 'spread_b', relationType: 'comparison', subjectRefs: ['roi_low'], comparison: { metricIdentity: 'roi_b' } }
  ]);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const [high, low] = result.specs;
  assert.equal(high.scale.comparisonDomainId, 'roi_a');
  assert.equal(low.scale.comparisonDomainId, 'roi_b');
  assert.notEqual(high.scale.scaleId, low.scale.scaleId);
  assert.deepEqual(high.scale.valueDomain, [0, 1109], 'each relationship computes only its own membership');
  assert.deepEqual(low.scale.valueDomain, [0, 163]);
});

test('one comparison domain backed by two scale ids fails closed', () => {
  const nodes = [
    rankingNode('roi_high', 'Highest ROI', 'roi_first', 'roi', 'percent', [['Sugar Cookies', '1109%'], ['SD Red Velvet', '753%']]),
    rankingNode('roi_low', 'Lowest ROI', 'roi_second', 'roi', 'percent', [['Salted Caramel Chocolate', '104%'], ['Brownies', '163%']])
  ];
  const result = build(nodes, [
    { id: 'roi_first', relationType: 'comparison', subjectRefs: ['roi_high'], comparison: { metricIdentity: 'roi' } },
    { id: 'roi_second', relationType: 'comparison', subjectRefs: ['roi_low'], comparison: { metricIdentity: 'roi' } }
  ]);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('SHARED_SCALE_DOMAIN_CONFLICT'), JSON.stringify(codes(result)));
});

test('members that are not commensurate across the relationship fail closed instead of sharing a map', () => {
  const nodes = [
    rankingNode('roi_high', 'Highest ROI', 'product_roi', 'roi', 'percent', [['Sugar Cookies', '1109%'], ['SD Red Velvet', '753%']]),
    rankingNode('roi_low', 'Lowest ROI', 'product_roi', 'roi', 'number', [['Salted Caramel Chocolate', '1'], ['Brownies', '2']])
  ];
  const result = build(nodes, roiRelationships());
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('SHARED_SCALE_MEMBERS_INCOMMENSURATE'), JSON.stringify(codes(result)));
});

test('fabricated shared scale declarations that detach from the grounded relationship fail closed', () => {
  const result = build(roiNodes(), roiRelationships());
  assert.equal(result.valid, true);
  assert.deepEqual(visualSpecErrors(structuredClone(result.specs[0])), [], 'the canonical declaration must verify clean');

  for (const [name, mutate] of [
    ['scaleId swapped to another relationship', (spec) => { spec.scale.scaleId = sharedComparisonScaleId('intruder'); }],
    ['comparisonDomainId laundered to a different domain', (spec) => { spec.scale.comparisonDomainId = 'laundered'; }],
    ['memberRefs dropped', (spec) => { delete spec.scale.memberRefs; }],
    ['memberNodeIds pointing at a foreign node', (spec) => { spec.scale.memberNodeIds = ['someone_else']; }],
    ['membership basis demoted to intrinsic', (spec) => { spec.comparability.membership = { ...spec.comparability.membership, basis: 'intrinsic' }; }],
    ['relationshipRef detached from membership', (spec) => { spec.scale.relationshipRef = 'elsewhere'; }]
  ]) {
    const tampered = structuredClone(result.specs[0]);
    mutate(tampered);
    const tamperedCodes = visualSpecErrors(tampered).map((error) => error.code);
    assert.ok(tamperedCodes.includes('SHARED_SCALE_DECLARATION_INVALID'), `${name} must fail closed; codes=${JSON.stringify(tamperedCodes)}`);
  }
  // Declarations that stay structurally well-formed but contradict the delivered geometry
  // (e.g. mapType flipped to log) are the delivered-geometry verifier's jurisdiction (Step 4,
  // pinned RED by RED-7 mutation B on purpose); the per-spec registry guard binds the
  // declaration to its relationship, and the build-time pass guarantees one canonical map.
});
