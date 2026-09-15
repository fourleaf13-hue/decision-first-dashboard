import test from 'node:test';
import assert from 'node:assert/strict';
import { composeAdaptiveComposition } from '../../skills/decision-first-dashboard/scripts/composition.js';

test('one source keeps its semantic nodes while audience/cadence modifiers may select a coverage-safe compact variant', () => {
  const sourceNodes = [
    { id: 'top_accounts', type: 'Ranking', presentation: 'full_ranking', compactPresentation: 'both_ends' },
    { id: 'gap_attribution', type: 'Breakdown', presentation: 'full_breakdown' }
  ];
  const requirements = [
    { type: 'ranking_span', subject: 'top_accounts', minimumCoverage: 'both_ends' },
    { type: 'gap_attribution', subject: 'gap_attribution', minimumCoverage: 'full_breakdown' }
  ];

  const operatingReview = composeAdaptiveComposition({
    contextRequirements: requirements,
    nodes: sourceNodes,
    modifiers: { audience: 'sales operations', cadence: 'weekly', density: 'full' }
  });
  const executiveReview = composeAdaptiveComposition({
    contextRequirements: requirements,
    nodes: sourceNodes,
    modifiers: { audience: 'CEO', cadence: 'monthly', density: 'compact' }
  });

  assert.equal(operatingReview.valid, true);
  assert.equal(executiveReview.valid, true);
  assert.deepEqual(operatingReview.composition.nodes.map((node) => node.id), executiveReview.composition.nodes.map((node) => node.id));
  assert.equal(operatingReview.composition.nodes[0].presentation, 'full_ranking');
  assert.equal(executiveReview.composition.nodes[0].presentation, 'both_ends');
  assert.deepEqual(executiveReview.coverageManifest.missing, []);
  for (const entry of executiveReview.composition.decisionLog) {
    assert.match(entry.reasonCode, /^[A-Z_]+$/);
    assert.ok(entry.requirementRef || entry.modifierRef);
  }
});
