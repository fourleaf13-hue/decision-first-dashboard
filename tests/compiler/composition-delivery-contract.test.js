import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDeliveredArtifact } from '../../skills/decision-first-dashboard/scripts/composition.js';

test('delivery gate rejects a manifest that claims coverage absent from final artifacts', () => {
  const result = verifyDeliveredArtifact({
    html: '<section data-semantic-node="monthly_orders" data-presentation="peak_summary" data-coverage="peak_identity"></section>',
    svg: '<svg></svg>',
    manifest: {
      nodes: [{ id: 'monthly_orders', presentation: 'full_chart', coverage: ['distribution_shape'] }],
      claims: []
    }
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, [{
    code: 'DELIVERED_COMPOSITION_MISMATCH',
    path: '/nodes/monthly_orders',
    message: 'monthly_orders manifest presentation or coverage is not present in the final artifact.'
  }]);
});

test('delivery gate requires source evidence for every visible overall claim', () => {
  const result = verifyDeliveredArtifact({
    html: '<div data-claim-id="claim-1" data-claim-scope="overall">Deteriorating</div>',
    svg: '<svg data-claim-id="claim-1" data-claim-scope="overall"></svg>',
    manifest: { nodes: [], claims: [{ id: 'claim-1', claimType: 'overall_verdict', scope: 'overall', evidenceRefs: [] }] }
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, [{
    code: 'OVERALL_CLAIM_EVIDENCE_REQUIRED',
    path: '/claims/0/evidenceRefs',
    message: 'visible overall claim claim-1 must reference source evidence.'
  }]);
});

test('delivery gate rejects an overall artifact claim that cannot resolve to a typed manifest claim', () => {
  const result = verifyDeliveredArtifact({
    html: '<section data-claim-id="claim-missing" data-claim-scope="overall">Needs intervention</section>',
    manifest: { nodes: [], claims: [] }
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'OVERALL_CLAIM_UNDECLARED');
});
