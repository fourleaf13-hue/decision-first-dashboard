import test from 'node:test';
import assert from 'node:assert/strict';
import { composeAdaptiveComposition, verifyDeliveredArtifact } from '../../skills/decision-first-dashboard/scripts/composition.js';

test('only a successful verifier returns a hash-bound verification stamp', () => {
  const result = verifyDeliveredArtifact({
    html: '<section data-semantic-node="annual_orders" data-presentation="full_chart" data-coverage="temporal_reference relative_comparison"></section>',
    svg: '<svg></svg>',
    manifest: { nodes: [{ id: 'annual_orders', presentation: 'full_chart', coverage: ['temporal_reference', 'relative_comparison'] }], claims: [] }
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.verificationStamp.status, 'passed');
  assert.match(result.verificationStamp.verifierVersion, /^composition-verifier@/);
  assert.match(result.verificationStamp.artifactHash, /^[a-f0-9]{64}$/);
  assert.match(result.verificationStamp.manifestHash, /^[a-f0-9]{64}$/);
});

test('verifier rejects a prepopulated verification stamp', () => {
  const result = verifyDeliveredArtifact({
    html: '<svg></svg>',
    svg: '',
    manifest: { nodes: [], claims: [], verificationStamp: { status: 'passed' } }
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'PREPOPULATED_VERIFICATION_STAMP');
});

test('composition rejects a collapse decision without a stable reason code and reference', () => {
  const result = composeAdaptiveComposition({
    contextRequirements: [],
    nodes: [{ id: 'secondary_ranking', type: 'Ranking', presentation: 'top_summary' }],
    decisionLog: [{ node: 'secondary_ranking', decision: 'collapse_to_drilldown', explanation: 'too dense' }]
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'COMPOSITION_DECISION_UNATTRIBUTED');
});
