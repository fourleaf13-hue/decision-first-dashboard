import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { validateGroundedBundle } from '../../skills/decision-first-dashboard/scripts/grounding.js';
import { layoutEligibilityFor } from '../../skills/decision-first-dashboard/scripts/visual-grammar.js';
import {
  deriveIntrinsicRelationship,
  requiredRelationshipPaths,
  resolveNodeRelationship,
  validateRelationships
} from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';

const worthiness = JSON.parse(fs.readFileSync(new URL('./fixtures/worthiness/dashboard.worthiness.json', import.meta.url), 'utf8'));

function codes(errors) {
  return (errors ?? []).map((error) => error.code);
}

function rankingNode(comparability) {
  return {
    id: 'roi_products',
    type: 'Ranking',
    title: 'ROI spread',
    ...(comparability ? { comparability } : {}),
    items: [
      { label: 'Sugar Cookies', value: '1109%', provenance: 'source' },
      { label: 'Caramel', value: '104%', provenance: 'source' }
    ]
  };
}

const groupRef = { unit: 'percent', comparisonGroup: 'roi_spread', comparabilityDomain: 'roi', normalization: 'raw' };
const groundedRoi = {
  id: 'roi_spread',
  relationType: 'comparison',
  subjectRefs: ['roi_products'],
  provenance: 'source',
  comparison: { metricIdentity: 'roi' }
};

function pairedLayout(node, relationships) {
  return layoutEligibilityFor({ ...node, presentation: 'both_ends' }, {
    contextRequirements: [],
    modifiers: { activeModifierIds: [] },
    relationships
  });
}

test('comparisonGroup is a reference to a grounded relationship, never evidence of comparability', () => {
  const unresolved = pairedLayout(rankingNode(groupRef), []);
  assert.equal(unresolved.membership.grounded, false);
  assert.equal(unresolved.membership.reasonCode, 'RELATIONSHIP_REF_UNRESOLVED');
  assert.equal(unresolved.membership.comparisonDomain, null);
  assert.equal(unresolved.valid, false);

  const noGroup = pairedLayout(rankingNode(null), []);
  assert.equal(noGroup.membership.reasonCode, 'COMPARISON_RELATIONSHIP_REQUIRED');
  assert.equal(noGroup.membership.comparisonDomain, null);
  assert.equal(noGroup.membership.relationshipRef, null);
  assert.equal(noGroup.valid, false, 'a same-unit Ranking must not become eligible from node id or unit alone');

  const subjectMissing = pairedLayout(rankingNode(groupRef), [{ ...groundedRoi, subjectRefs: ['other_node'] }]);
  assert.equal(subjectMissing.membership.reasonCode, 'RELATIONSHIP_SUBJECT_NOT_COVERED');
  assert.equal(subjectMissing.valid, false);

  const typeMismatch = pairedLayout(rankingNode(groupRef), [{
    id: 'roi_spread',
    relationType: 'distribution',
    subjectRefs: ['roi_products'],
    provenance: 'source',
    distribution: { dimension: 'roi' }
  }]);
  assert.equal(typeMismatch.membership.reasonCode, 'RELATIONSHIP_TYPE_MISMATCH');
  assert.equal(typeMismatch.valid, false);

  const conflict = pairedLayout({
    ...rankingNode(groupRef),
    items: [
      { label: 'Sugar Cookies', value: '1109%', provenance: 'source', comparability: groupRef },
      { label: 'Caramel', value: '104%', provenance: 'source', comparability: { ...groupRef, comparisonGroup: 'other_group' } }
    ]
  }, [groundedRoi]);
  assert.equal(conflict.membership.reasonCode, 'RELATIONSHIP_REF_CONFLICT');
  assert.equal(conflict.valid, false);

  const domainLie = pairedLayout(rankingNode({ ...groupRef, comparabilityDomain: 'growth' }), [groundedRoi]);
  assert.equal(domainLie.membership.reasonCode, 'RELATIONSHIP_IDENTITY_MISMATCH');
  assert.equal(domainLie.valid, false);

  const grounded = pairedLayout(rankingNode(groupRef), [groundedRoi]);
  assert.equal(grounded.membership.grounded, true);
  assert.equal(grounded.membership.reasonCode, 'RELATIONSHIP_GROUNDED');
  assert.equal(grounded.membership.relationshipRef, 'roi_spread');
  assert.equal(grounded.membership.comparisonDomain, 'roi');
  assert.equal(grounded.valid, true);
});

test('relationship membership and magnitude commensurability are separate gates', () => {
  const groundedButIncommensurate = pairedLayout({
    ...rankingNode(groupRef),
    items: [
      { label: 'Sugar Cookies', value: '1109%', provenance: 'source', comparability: groupRef },
      { label: 'Caramel Count', value: '104', provenance: 'source', comparability: { ...groupRef, unit: 'number' } }
    ]
  }, [groundedRoi]);
  assert.equal(groundedButIncommensurate.membership.grounded, true, 'gate 1 passes: the relationship is grounded');
  assert.equal(groundedButIncommensurate.comparability.pass, false, 'gate 2 fails: magnitudes are not commensurate');
  assert.equal(groundedButIncommensurate.comparability.reasonCode, 'UNIT_MISMATCH');
  assert.equal(groundedButIncommensurate.valid, false);

  const commensurateButUngrouped = pairedLayout(rankingNode(null), []);
  assert.equal(commensurateButUngrouped.comparability.pass, true, 'gate 2 alone would pass on inferred units');
  assert.equal(commensurateButUngrouped.membership.grounded, false, 'gate 1 still blocks: no grounded relationship');
  assert.equal(commensurateButUngrouped.membership.reasonCode, 'COMPARISON_RELATIONSHIP_REQUIRED');
  assert.equal(commensurateButUngrouped.valid, false);
});

test('stable metric identity is a controlled field, never a node id, title, or display label', () => {
  const state = { mode: 'no_score', semanticNodes: [rankingNode(groupRef)] };

  assert.deepEqual(codes(validateRelationships({ ...state, relationships: [{ ...groundedRoi, comparison: { metricIdentity: 'roi_products' } }] })), ['RELATIONSHIP_IDENTITY_INVALID']);
  assert.ok(codes(validateRelationships({ ...state, relationships: [{ ...groundedRoi, comparison: { metricIdentity: 'ROI spread' } }] })).includes('RELATIONSHIP_IDENTITY_INVALID'), 'node title must not serve as metric identity');
  assert.ok(codes(validateRelationships({ ...state, relationships: [{ ...groundedRoi, comparison: { metricIdentity: 'Sugar Cookies' } }] })).includes('RELATIONSHIP_IDENTITY_INVALID'), 'display label must not serve as metric identity');
  assert.deepEqual(codes(validateRelationships({ ...state, relationships: [{ ...groundedRoi, comparison: undefined }] })), ['RELATIONSHIP_TYPED_METADATA_REQUIRED']);
  assert.deepEqual(codes(validateRelationships({ ...state, relationships: [groundedRoi] })), []);
});

test('distribution relationships run through the same engine with their own typed metadata', () => {
  const distributionNode = {
    id: 'monthly_orders',
    type: 'Distribution',
    title: 'Seasonal order volume',
    comparability: { unit: 'number', comparisonGroup: 'monthly_shape', comparabilityDomain: 'month', normalization: 'raw' },
    items: [
      { label: 'Nov', value: 29, provenance: 'source' },
      { label: 'Dec', value: 43, provenance: 'source' }
    ]
  };
  const distributionRelationship = {
    id: 'monthly_shape',
    relationType: 'distribution',
    subjectRefs: ['monthly_orders'],
    provenance: 'source',
    distribution: { dimension: 'month' }
  };

  const membership = resolveNodeRelationship(distributionNode, [distributionRelationship]);
  assert.equal(membership.grounded, true);
  assert.equal(membership.basis, 'declared');
  assert.equal(membership.relationshipType, 'distribution');
  assert.equal(membership.comparisonDomain, 'month');
  assert.equal(membership.reasonCode, 'RELATIONSHIP_GROUNDED');

  const missingMetadata = validateRelationships({
    mode: 'no_score',
    semanticNodes: [distributionNode],
    relationships: [{ ...distributionRelationship, distribution: {} }]
  });
  assert.deepEqual(codes(missingMetadata), ['RELATIONSHIP_TYPED_METADATA_REQUIRED']);
  assert.equal(missingMetadata[0].path, '/relationships/0/distribution/dimension');
});

test('single-series structures keep intrinsic eligibility without any declared relationship', () => {
  const intrinsicTypes = [
    { type: 'Trend', relationType: 'temporal' },
    { type: 'Distribution', relationType: 'distribution' },
    { type: 'Breakdown', relationType: 'decomposition' },
    { type: 'Relationship', relationType: 'comparison' }
  ];
  for (const { type, relationType } of intrinsicTypes) {
    const node = { id: `node_${type}`, type, title: `${type} structure`, items: [{ label: 'a', value: 1, provenance: 'source' }] };
    const derived = deriveIntrinsicRelationship(node);
    assert.equal(derived.grounded, true);
    assert.equal(derived.basis, 'intrinsic');
    assert.equal(derived.relationshipType, relationType);
    assert.equal(derived.comparisonDomain, `intrinsic_node_${type}_${relationType}`);
    assert.equal(resolveNodeRelationship(node, []).reasonCode, 'RELATIONSHIP_INTRINSIC');
  }
  assert.equal(deriveIntrinsicRelationship({ id: 'roi_products', type: 'Ranking', items: [] }), null);
  assert.equal(deriveIntrinsicRelationship({ id: 'cluster', type: 'MetricCluster', items: [] }), null);

  const trendLayout = layoutEligibilityFor({
    id: 'annual_orders',
    type: 'Trend',
    presentation: 'full_chart',
    title: 'Orders across years',
    items: [
      { label: '2024', value: 79, provenance: 'source' },
      { label: '2025', value: 72, provenance: 'source' }
    ]
  }, { contextRequirements: [], modifiers: { activeModifierIds: [] }, relationships: [] });
  assert.equal(trendLayout.membership.grounded, true);
  assert.equal(trendLayout.membership.basis, 'intrinsic');
  assert.equal(trendLayout.valid, true, 'intrinsic eligibility must not regress existing Trend delivery');
});

function rankingBundleState(overrides = {}) {
  return {
    mode: 'no_score',
    signals: [
      { metric: 'roi_high', label: 'Top ROI', value: '1109%', provenance: 'source' },
      { metric: 'roi_low', label: 'Lowest ROI', value: '104%', provenance: 'source' },
      { metric: 'margin', label: 'Gross margin', value: '62%', provenance: 'source' }
    ],
    semanticNodes: [rankingNode(groupRef)],
    relationships: [groundedRoi],
    ...overrides
  };
}

function makeFixture(state) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr45-step1-'));
  const sourceValue = {
    signals: state.signals.map(({ label, value }) => ({ label, value })),
    semanticNodes: state.semanticNodes.map((node) => ({
      title: node.title,
      items: node.items.map(({ label, value }) => ({ label, value }))
    })),
    relationships: (state.relationships ?? []).map(({ provenance, ...rest }) => rest)
  };
  const bytes = Buffer.from(`${JSON.stringify(sourceValue, null, 2)}\n`);
  const evidence = [];
  const claims = [];
  const idByPointer = {};
  const add = (pointer) => {
    const id = `ev_${evidence.length + 1}`;
    evidence.push({ id, anchor: { type: 'json_pointer', pointer } });
    claims.push({ decisionPath: pointer, evidenceRef: id });
    idByPointer[pointer] = id;
  };
  state.signals.forEach((signal, index) => {
    add(`/signals/${index}/label`);
    add(`/signals/${index}/value`);
  });
  state.semanticNodes.forEach((node, nodeIndex) => {
    add(`/semanticNodes/${nodeIndex}/title`);
    node.items.forEach((item, itemIndex) => {
      add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/label`);
      add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/value`);
    });
  });
  requiredRelationshipPaths(state).forEach((pointer) => add(pointer));
  fs.writeFileSync(path.join(root, 'source.json'), bytes);
  return {
    root,
    idByPointer,
    bundle: {
      source: { kind: 'json', path: 'source.json', sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
      decisionState: state,
      evidence,
      claims
    }
  };
}

test('relationship identity is grounded source and fails closed when the claim is missing', () => {
  const fixture = makeFixture(rankingBundleState());
  const grounded = validateGroundedBundle(fixture.bundle, { baseDir: fixture.root });
  assert.equal(grounded.valid, true, JSON.stringify(grounded.errors));

  const stripped = structuredClone(fixture.bundle);
  const evidenceId = fixture.idByPointer['/relationships/0/comparison/metricIdentity'];
  stripped.claims = stripped.claims.filter((claim) => claim.evidenceRef !== evidenceId);
  stripped.evidence = stripped.evidence.filter((entry) => entry.id !== evidenceId);
  const failed = validateGroundedBundle(stripped, { baseDir: fixture.root });
  assert.equal(failed.valid, false);
  assert.ok(codes(failed.errors).includes('MISSING_REQUIRED_GROUNDING'), JSON.stringify(failed.errors));
});

test('relationship reference fields resolve against real nodes and evidence', () => {
  const ghost = makeFixture(rankingBundleState({ relationships: [{ ...groundedRoi, subjectRefs: ['ghost_node'] }] }));
  assert.ok(codes(validateGroundedBundle(ghost.bundle, { baseDir: ghost.root }).errors).includes('RELATIONSHIP_SUBJECT_NOT_FOUND'));

  const duplicate = makeFixture(rankingBundleState({ relationships: [groundedRoi, { ...groundedRoi }] }));
  assert.ok(codes(validateGroundedBundle(duplicate.bundle, { baseDir: duplicate.root }).errors).includes('RELATIONSHIP_ID_DUPLICATE'));

  const missingBasis = makeFixture(rankingBundleState({ relationships: [{ ...groundedRoi, basisRefs: ['ev_missing'] }] }));
  assert.ok(codes(validateGroundedBundle(missingBasis.bundle, { baseDir: missingBasis.root }).errors).includes('RELATIONSHIP_BASIS_REF_NOT_FOUND'));

  const realBasis = makeFixture(rankingBundleState());
  const basisEvidenceId = realBasis.idByPointer['/semanticNodes/0/items/0/value'];
  const basisState = rankingBundleState({ relationships: [{ ...groundedRoi, basisRefs: [basisEvidenceId] }] });
  const basisFixture = makeFixture(basisState);
  const resolved = validateGroundedBundle(basisFixture.bundle, { baseDir: basisFixture.root });
  assert.equal(resolved.valid, true, JSON.stringify(resolved.errors));
});

const SPLIT_BRIEF = {
  decision: { status: 'confirmed', value: 'Decide the next operating focus' },
  action: { status: 'confirmed', value: 'Choose the next operating action' },
  questionShape: { status: 'confirmed', value: 'state' },
  actionShape: { status: 'confirmed', value: 'observe' },
  contextRequirements: []
};

function splitChildNode(id, title, rows) {
  return {
    id,
    type: 'Ranking',
    title,
    comparability: { unit: 'percent', comparisonGroup: 'product_roi', comparabilityDomain: 'product_roi', normalization: 'raw' },
    items: rows.map(([label, value]) => ({ label, value, provenance: 'source' }))
  };
}

const splitState = {
  mode: 'no_score',
  signals: [
    { metric: 'roi_high', label: 'Highest ROI', value: '1109%', provenance: 'source' },
    { metric: 'roi_mid', label: 'Middle ROI', value: '163%', provenance: 'source' },
    { metric: 'roi_low', label: 'Lowest ROI', value: '104%', provenance: 'source' }
  ],
  semanticNodes: [
    splitChildNode('roi_high', 'Highest ROI products', [['Sugar Cookies', '1109%'], ['SD Red Velvet', '753%']]),
    splitChildNode('roi_low', 'Lowest ROI products', [['Salted Caramel Chocolate', '104%'], ['Brownies', '163%']])
  ],
  relationships: [{
    id: 'product_roi',
    relationType: 'comparison',
    subjectRefs: ['roi_high', 'roi_low'],
    provenance: 'source',
    comparison: { metricIdentity: 'product_roi' }
  }]
};

test('step-1 minimum: split comparison siblings preserve one grounded relationship identity across both child nodes', () => {
  const fixture = makeFixture(splitState);
  const routing = {
    decision: SPLIT_BRIEF.decision.value,
    action: SPLIT_BRIEF.action.value,
    inventoryCount: splitState.signals.length,
    metrics: splitState.signals.map((signal) => ({
      metric: signal.metric,
      role: 'primary_signal',
      changesDecision: true,
      decisionImpact: `${signal.label} changes the next operating action`,
      visibility: 'first_view'
    })),
    compositionNodes: [
      { id: 'roi_high', type: 'Ranking', presentation: 'full_ranking' },
      { id: 'roi_low', type: 'Ranking', presentation: 'full_ranking' }
    ]
  };
  const compiled = compileDecisionDashboard(worthiness, SPLIT_BRIEF, routing, fixture.bundle, { baseDir: fixture.root });
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));

  const specs = compiled.manifest.delivery.nodes
    .filter((node) => node.id === 'roi_high' || node.id === 'roi_low')
    .map((node) => node.visualSpec);
  assert.equal(specs.length, 2);
  for (const spec of specs) {
    assert.equal(spec.comparability.membership.grounded, true);
    assert.equal(spec.comparability.membership.relationshipRef, 'product_roi');
    assert.equal(spec.comparability.membership.relationshipType, 'comparison');
    assert.equal(spec.comparability.comparisonGroup, 'product_roi');
    assert.equal(spec.comparability.comparabilityDomain, 'product_roi');
    assert.equal(spec.comparability.eligible, true);
  }
  assert.equal(new Set(specs.map((spec) => spec.comparability.membership.relationshipRef)).size, 1, 'both siblings must resolve to the SAME grounded relationship');
  for (const artifact of [compiled.html, compiled.svg]) {
    assert.match(artifact, /data-comparison-group="product_roi"/);
    assert.match(artifact, /data-comparability-domain="product_roi"/);
  }
});
