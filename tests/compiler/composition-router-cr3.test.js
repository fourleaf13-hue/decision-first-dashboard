// CR-3: deterministic archetype classification + Prioritize eligibility gate.
// Classification reads structured intent slots only; ordering eligibility
// requires grounded evidence and fails closed into ASK_COMPOSITION_INTENT.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { classifyCompositionIntent, evaluateCompositionIntent } from '../../skills/decision-first-dashboard/scripts/composition-intent.js';
import { requiredRelationshipPaths } from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';
import { visibleTextOf } from './helpers/composition-signature.mjs';

const adaptiveDir = fileURLToPath(new URL('./fixtures/adaptive-composition/', import.meta.url));
const cr2Dir = fileURLToPath(new URL('./fixtures/composition-router/', import.meta.url));
const worthiness = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./fixtures/worthiness/dashboard.worthiness.json', import.meta.url)), 'utf8'));

function makeGroundedFixture(dir, fileName, nodeSelections, intents) {
  const bytes = fs.readFileSync(path.join(dir, fileName));
  const source = JSON.parse(bytes.toString('utf8'));
  const decisionState = {
    mode: 'no_score',
    signals: source.signals.map((signal, index) => ({ metric: `signal_${index + 1}`, ...signal, provenance: 'source' })),
    semanticNodes: source.semanticNodes.map((node, index) => ({
      id: nodeSelections[index].id,
      type: nodeSelections[index].type,
      title: node.title,
      ...(node.subtitle ? { subtitle: node.subtitle } : {}),
      ...(node.comparability ? { comparability: node.comparability } : {}),
      items: node.items.map((item) => ({ ...item, provenance: 'source' }))
    })),
    relationships: (source.relationships ?? []).map((relationship) => ({ ...relationship, provenance: 'source' }))
  };
  const evidence = [];
  const claims = [];
  const add = (decisionPath, sourcePath) => {
    const id = `ev_${evidence.length + 1}`;
    evidence.push({ id, anchor: { type: 'json_pointer', pointer: sourcePath } });
    claims.push({ decisionPath, evidenceRef: id });
  };
  decisionState.signals.forEach((signal, index) => {
    add(`/signals/${index}/label`, `/signals/${index}/label`);
    add(`/signals/${index}/value`, `/signals/${index}/value`);
  });
  decisionState.semanticNodes.forEach((node, nodeIndex) => {
    add(`/semanticNodes/${nodeIndex}/title`, `/semanticNodes/${nodeIndex}/title`);
    node.items.forEach((item, itemIndex) => {
      add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/label`, `/semanticNodes/${nodeIndex}/items/${itemIndex}/label`);
      add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/value`, `/semanticNodes/${nodeIndex}/items/${itemIndex}/value`);
      if (item.detail) add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/detail`, `/semanticNodes/${nodeIndex}/items/${itemIndex}/detail`);
    });
  });
  requiredRelationshipPaths(decisionState).forEach((relationshipPath) => add(relationshipPath, relationshipPath));
  const brief = {
    decision: { status: 'confirmed', value: intents.decision },
    action: { status: 'confirmed', value: intents.action },
    questionShape: { status: 'confirmed', value: intents.questionShape },
    actionShape: { status: 'confirmed', value: intents.actionShape }
  };
  const routing = {
    decision: intents.decision,
    action: intents.action,
    inventoryCount: decisionState.signals.length,
    metrics: decisionState.signals.map((signal) => ({ metric: signal.metric, role: 'primary_signal', changesDecision: true, decisionImpact: `${signal.label} informs the confirmed decision`, visibility: 'first_view' })),
    compositionNodes: nodeSelections
  };
  return {
    brief,
    routing,
    bundle: {
      source: { kind: 'json', path: fileName, sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
      decisionState,
      evidence,
      claims
    }
  };
}

const MONITOR_INTENT = {
  decision: 'Are we operating within the declared bounds this week?',
  action: 'Review the current state; escalate only when a declared bound is crossed',
  questionShape: 'state',
  actionShape: 'observe'
};
const PRIORITIZE_INTENT = {
  decision: 'Which candidate should the team handle first this cycle?',
  action: 'Commit the next work slot to the top-ranked candidate',
  questionShape: 'priority',
  actionShape: 'rank'
};

const HEALTH_NODES = [
  { id: 'annual_orders', type: 'Trend', presentation: 'full_chart' },
  { id: 'monthly_orders', type: 'Distribution', presentation: 'full_chart' },
  { id: 'demand_drivers', type: 'Ranking', presentation: 'full_ranking' },
  { id: 'product_roi', type: 'Ranking', presentation: 'both_ends' }
];
const HEALTH_REQUIREMENTS = [
  { id: 'ctx_annual_relative', type: 'relative_comparison', subject: 'annual_orders', minimumCoverage: 'current_plus_reference', status: 'inferred' },
  { id: 'ctx_annual_temporal', type: 'temporal_reference', subject: 'annual_orders', minimumCoverage: 'current_plus_reference', status: 'inferred' },
  { id: 'ctx_monthly_distribution', type: 'distribution_shape', subject: 'monthly_orders', minimumCoverage: 'full_distribution', status: 'inferred' },
  { id: 'ctx_product_ranking', type: 'ranking_span', subject: 'product_roi', minimumCoverage: 'both_ends', status: 'inferred' }
];

const CEO_NODES = [
  { id: 'revenue_target', type: 'Relationship', presentation: 'full_chart' },
  { id: 'gap_attribution', type: 'Breakdown', presentation: 'full_breakdown' },
  { id: 'top_accounts', type: 'Ranking', presentation: 'both_ends' }
];
const CEO_REQUIREMENTS = [
  { id: 'ctx_revenue_target', type: 'target_reference', subject: 'revenue_target', minimumCoverage: 'target_and_gap', status: 'inferred' },
  { id: 'ctx_gap_attribution', type: 'gap_attribution', subject: 'gap_attribution', minimumCoverage: 'full_breakdown', status: 'inferred' },
  { id: 'ctx_top_accounts', type: 'contributor_comparison', subject: 'top_accounts', minimumCoverage: 'contributors', status: 'inferred' }
];

const UNRANKED_NODES = [
  { id: 'candidate_list', type: 'Breakdown', presentation: 'full_breakdown' },
  { id: 'capacity_trend', type: 'Trend', presentation: 'full_chart' }
];
const UNRANKED_REQUIREMENTS = [
  { id: 'ctx_candidate_gap', type: 'gap_attribution', subject: 'candidate_list', minimumCoverage: 'full_breakdown', status: 'inferred' }
];

function compileFixture(dir, fileName, selections, intents, requirements) {
  const fixture = makeGroundedFixture(dir, fileName, selections, intents);
  fixture.brief.contextRequirements = requirements;
  const compiled = compileDecisionDashboard(worthiness, fixture.brief, fixture.routing, fixture.bundle, { baseDir: dir });
  return { fixture, compiled };
}

test('T3-A confirmed state+observe classifies MONITOR as eligible', () => {
  const classification = classifyCompositionIntent({
    decision: { status: 'confirmed', value: MONITOR_INTENT.decision },
    action: { status: 'confirmed', value: MONITOR_INTENT.action },
    questionShape: { status: 'confirmed', value: 'state' },
    actionShape: { status: 'confirmed', value: 'observe' }
  });
  assert.equal(classification.status, 'classified');
  assert.equal(classification.archetype, 'monitor');
  assert.equal(classification.reasonCode, null);

  const { compiled } = compileFixture(adaptiveDir, 'bakery.source.json', HEALTH_NODES, MONITOR_INTENT, HEALTH_REQUIREMENTS);
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  assert.equal(compiled.result.transition, 'PASS');
  assert.equal(compiled.result.compositionIntent.archetype, 'monitor');
  assert.equal(compiled.result.compositionIntent.eligibility.status, 'eligible');
  assert.equal(compiled.manifest.compositionIntent.archetype, 'monitor');
  assert.equal(compiled.manifest.compositionIntent.eligibility.status, 'eligible');
  assert.equal('orderingBasis' in compiled.manifest.compositionIntent, false, 'monitor carries no ordering basis');
});

test('T3-B grounded prioritize classifies PRIORITIZE_READONLY as eligible with basisRefs', () => {
  const { compiled } = compileFixture(adaptiveDir, 'ceo-sales.source.json', CEO_NODES, PRIORITIZE_INTENT, CEO_REQUIREMENTS);
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  assert.equal(compiled.result.compositionIntent.archetype, 'prioritize_readonly');
  assert.equal(compiled.result.compositionIntent.questionShape, 'priority');
  assert.equal(compiled.result.compositionIntent.actionShape, 'rank');
  assert.equal(compiled.result.compositionIntent.eligibility.status, 'eligible');

  const orderingBasis = compiled.manifest.compositionIntent.orderingBasis;
  assert.equal(orderingBasis.kind, 'grounded_gap');
  assert.equal(orderingBasis.candidateRefs.length, 3);
  assert.equal(orderingBasis.candidateRefs[0], '/semanticNodes/1/items/0');
  assert.equal(orderingBasis.basisRefs.length, 6, 'basisRefs must ground the actual/target/gap structure plus every candidate magnitude');
  assert.equal(orderingBasis.relationshipRef, 'intrinsic_revenue_target_comparison');

  // The firewall guards visible copy, not machine metadata: CR-4 page grammar
  // legitimately emits data-page-archetype / data-attention-role attributes.
  assert.doesNotMatch(visibleTextOf({ html: compiled.html, svg: compiled.svg }), /prioritize_readonly|compositionIntent|questionShape|actionShape|grounded_gap/i, 'compiler-owned intent must not appear in visible dashboard copy');
});

test('T3-C prioritize without grounded basis fails closed into ASK', () => {
  const { fixture, compiled } = compileFixture(cr2Dir, 'candidates-unranked.source.json', UNRANKED_NODES, PRIORITIZE_INTENT, UNRANKED_REQUIREMENTS);
  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.transition, 'ASK_COMPOSITION_INTENT');
  assert.equal(compiled.result.stage, 'composition_intent');
  assert.equal(compiled.result.reasonCode, 'GROUNDED_ORDERING_BASIS_REQUIRED');
  assert.equal(compiled.html, null);
  assert.equal(compiled.svg, null);
  assert.equal(compiled.manifest, null);

  const unit = evaluateCompositionIntent(fixture.brief, fixture.bundle);
  assert.equal(unit.transition, 'ASK_COMPOSITION_INTENT');
  assert.equal(unit.reasonCode, 'GROUNDED_ORDERING_BASIS_REQUIRED');
});

test('T3-D raw numbers with rank clues never authorize ordering', () => {
  // candidates-rank-bait carries semanticItem.role=rank on values 120/900/40 and
  // the shared worthiness fixture already declares responseChange.kind=priority;
  // neither clue may authorize ordering.
  const { compiled } = compileFixture(cr2Dir, 'candidates-rank-bait.source.json', UNRANKED_NODES, PRIORITIZE_INTENT, UNRANKED_REQUIREMENTS);
  assert.equal(compiled.result.valid, false, '900 > 120 > 40 must never form ordering eligibility');
  assert.equal(compiled.result.transition, 'ASK_COMPOSITION_INTENT');
  assert.equal(compiled.result.reasonCode, 'GROUNDED_ORDERING_BASIS_REQUIRED');

  const rankState = {
    semanticNodes: [{
      id: 'ranked_initiatives',
      type: 'Ranking',
      title: 'Ranked initiatives',
      items: [
        { label: 'Initiative A', value: 2, role: 'rank', provenance: 'source' },
        { label: 'Initiative B', value: 1, role: 'rank', provenance: 'source' },
        { label: 'Initiative C', value: 3, role: 'rank', provenance: 'source' }
      ]
    }],
    relationships: []
  };
  const rankClaims = rankState.semanticNodes[0].items.map((item, itemIndex) => ({
    decisionPath: `/semanticNodes/0/items/${itemIndex}/value`,
    evidenceRef: `ev_rank_${itemIndex + 1}`
  }));
  const positive = evaluateCompositionIntent(
    { ...makeGroundedFixture(cr2Dir, 'candidates-unranked.source.json', UNRANKED_NODES, PRIORITIZE_INTENT).brief, contextRequirements: [] },
    { decisionState: rankState, claims: rankClaims }
  );
  assert.equal(positive.transition, 'PASS');
  assert.equal(positive.intent.archetype, 'prioritize_readonly');
  assert.equal(positive.intent.orderingBasis.kind, 'grounded_rank');
  assert.equal(positive.intent.orderingBasis.candidateRefs.length, 3);
  assert.equal(positive.intent.orderingBasis.basisRefs.length, 3);
});

test('T3-E missing or inferred intent asks instead of defaulting an archetype', () => {
  const base = {
    decision: { status: 'confirmed', value: 'Any confirmed decision' },
    action: { status: 'confirmed', value: 'Any confirmed action' }
  };
  const missingQuestion = classifyCompositionIntent(base);
  assert.equal(missingQuestion.status, 'ask');
  assert.equal(missingQuestion.reasonCode, 'COMPOSITION_INTENT_REQUIRED');
  assert.equal(missingQuestion.archetype, null, 'no default archetype');

  const inferredAction = classifyCompositionIntent({
    ...base,
    questionShape: { status: 'confirmed', value: 'state' },
    actionShape: { status: 'inferred', value: 'observe' }
  });
  assert.equal(inferredAction.status, 'ask');
  assert.equal(inferredAction.reasonCode, 'COMPOSITION_INTENT_REQUIRED');
  assert.equal(inferredAction.archetype, null, 'inferred intent must not silently decide page grammar');

  const absentQuestion = classifyCompositionIntent({
    ...base,
    questionShape: { status: 'absent' },
    actionShape: { status: 'confirmed', value: 'observe' }
  });
  assert.equal(absentQuestion.reasonCode, 'COMPOSITION_INTENT_REQUIRED');

  const pipeline = compileFixture(adaptiveDir, 'bakery.source.json', HEALTH_NODES, MONITOR_INTENT, HEALTH_REQUIREMENTS);
  delete pipeline.fixture.brief.questionShape;
  const recomputed = compileDecisionDashboard(worthiness, pipeline.fixture.brief, pipeline.fixture.routing, pipeline.fixture.bundle, { baseDir: adaptiveDir });
  assert.equal(recomputed.result.valid, false);
  assert.equal(recomputed.result.transition, 'ASK_COMPOSITION_INTENT');
  assert.equal(recomputed.result.reasonCode, 'COMPOSITION_INTENT_REQUIRED');
});

test('T3-F unsupported future combinations ask, never auto-explore', () => {
  const future = classifyCompositionIntent({
    decision: { status: 'confirmed', value: 'Understand why revenue moved' },
    action: { status: 'confirmed', value: 'Investigate the causes' },
    questionShape: { status: 'confirmed', value: 'cause' },
    actionShape: { status: 'confirmed', value: 'investigate' }
  });
  assert.equal(future.status, 'ask');
  assert.equal(future.reasonCode, 'COMPOSITION_INTENT_UNSUPPORTED');
  assert.equal(future.archetype, null, 'unknown intent must never classify as explore');

  const crossed = classifyCompositionIntent({
    decision: { status: 'confirmed', value: 'Any decision' },
    action: { status: 'confirmed', value: 'Any action' },
    questionShape: { status: 'confirmed', value: 'state' },
    actionShape: { status: 'confirmed', value: 'rank' }
  });
  assert.equal(crossed.reasonCode, 'COMPOSITION_INTENT_UNSUPPORTED');
});

test('T3-G free-form prose never overrides structured intent', () => {
  const classification = classifyCompositionIntent({
    decision: { status: 'confirmed', value: 'Prioritize the biggest issue first' },
    action: { status: 'confirmed', value: 'Rank the top issues immediately' },
    questionShape: { status: 'confirmed', value: 'state' },
    actionShape: { status: 'confirmed', value: 'observe' }
  });
  assert.equal(classification.status, 'classified');
  assert.equal(classification.archetype, 'monitor', 'structured slots win over prioritize-flavored prose');

  const prioritizeProse = makeGroundedFixture(adaptiveDir, 'ceo-sales.source.json', CEO_NODES, {
    decision: 'Prioritize the biggest issue first',
    action: 'Rank the top issues immediately',
    questionShape: 'state',
    actionShape: 'observe'
  });
  prioritizeProse.brief.contextRequirements = CEO_REQUIREMENTS;
  const compiled = compileDecisionDashboard(worthiness, prioritizeProse.brief, prioritizeProse.routing, prioritizeProse.bundle, { baseDir: adaptiveDir });
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  assert.equal(compiled.result.compositionIntent.archetype, 'monitor');
});

test('T3-copy1 ASK copy for COMPOSITION_INTENT_REQUIRED leaks no internal tokens', () => {
  const fixture = makeGroundedFixture(adaptiveDir, 'bakery.source.json', HEALTH_NODES, MONITOR_INTENT, HEALTH_REQUIREMENTS);
  delete fixture.brief.questionShape;
  fixture.brief.contextRequirements = HEALTH_REQUIREMENTS;
  const compiled = compileDecisionDashboard(worthiness, fixture.brief, fixture.routing, fixture.bundle, { baseDir: adaptiveDir });
  assert.equal(compiled.result.transition, 'ASK_COMPOSITION_INTENT');
  const question = compiled.result.askQuestion;
  assert.equal(typeof question, 'string');
  assert.ok(question.length > 0);
  assert.ok(question.endsWith('?'));
  for (const forbidden of ['COMPOSITION_INTENT_REQUIRED', 'MONITOR', 'PRIORITIZE_READONLY', 'questionShape', 'actionShape']) {
    assert.ok(!question.toLowerCase().includes(forbidden.toLowerCase()), `visible ASK copy must not contain internal token ${forbidden}: ${question}`);
  }
});

test('T3-copy2 ASK copy for GROUNDED_ORDERING_BASIS_REQUIRED asks for the basis in natural language', () => {
  const { compiled } = compileFixture(cr2Dir, 'candidates-unranked.source.json', UNRANKED_NODES, PRIORITIZE_INTENT, UNRANKED_REQUIREMENTS);
  assert.equal(compiled.result.reasonCode, 'GROUNDED_ORDERING_BASIS_REQUIRED');
  const question = compiled.result.askQuestion;
  assert.equal(typeof question, 'string');
  assert.ok(question.endsWith('?'));
  assert.match(question, /order/i);
  assert.match(question, /basis/i);
  for (const forbidden of ['GROUNDED_ORDERING_BASIS_REQUIRED', 'PRIORITIZE_READONLY', 'semanticItem.role', 'responseChange.kind', 'primary_signal', 'metric router']) {
    assert.ok(!question.toLowerCase().includes(forbidden.toLowerCase()), `visible ASK copy must not contain internal token ${forbidden}: ${question}`);
  }
});
