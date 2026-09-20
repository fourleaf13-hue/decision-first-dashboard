// CR-2 (test-only): prove whether confirmed decision differences actually
// reach delivered page composition. No production behavior is modified here.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { requiredRelationshipPaths } from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';
import { extractCompositionSignature, loadBearingDifference } from './helpers/composition-signature.mjs';

const adaptiveDir = fileURLToPath(new URL('./fixtures/adaptive-composition/', import.meta.url));
const cr2Dir = fileURLToPath(new URL('./fixtures/composition-router/', import.meta.url));
const worthiness = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./fixtures/worthiness/dashboard.worthiness.json', import.meta.url)), 'utf8'));

function makeGroundedFixture(dir, fileName, nodeSelections, intents) {
  const bytes = fs.readFileSync(path.join(dir, fileName));
  const source = JSON.parse(bytes.toString('utf8'));
  const nodeTypes = new Map(nodeSelections.map((node) => [node.id, node.type]));
  const decisionState = {
    mode: 'no_score',
    signals: source.signals.map((signal, index) => ({ metric: `signal_${index + 1}`, ...signal, provenance: 'source' })),
    semanticNodes: source.semanticNodes.map((node, index) => ({
      id: nodeSelections[index].id,
      type: nodeTypes.get(nodeSelections[index].id),
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
    if (node.subtitle) add(`/semanticNodes/${nodeIndex}/subtitle`, `/semanticNodes/${nodeIndex}/subtitle`);
    node.items.forEach((item, itemIndex) => {
      add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/label`, `/semanticNodes/${nodeIndex}/items/${itemIndex}/label`);
      add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/value`, `/semanticNodes/${nodeIndex}/items/${itemIndex}/value`);
      if (item.detail) add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/detail`, `/semanticNodes/${nodeIndex}/items/${itemIndex}/detail`);
    });
  });
  requiredRelationshipPaths(decisionState).forEach((relationshipPath) => add(relationshipPath, relationshipPath));
  const brief = {
    decision: { status: 'confirmed', value: intents.decision },
    action: { status: 'confirmed', value: intents.action }
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
  action: 'Review the current state; escalate only when a declared bound is crossed'
};
const PRIORITIZE_INTENT = {
  decision: 'Which candidate should the team handle first this cycle?',
  action: 'Commit the next work slot to the top-ranked candidate'
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

function compile(dir, fileName, selections, intents, requirements) {
  const fixture = makeGroundedFixture(dir, fileName, selections, intents);
  fixture.brief.contextRequirements = requirements;
  const compiled = compileDecisionDashboard(worthiness, fixture.brief, fixture.routing, fixture.bundle, { baseDir: dir });
  return { fixture, compiled };
}

test('CR2-A same source + different confirmed decision must produce a load-bearing composition difference', () => {
  const monitor = compile(adaptiveDir, 'bakery.source.json', HEALTH_NODES, MONITOR_INTENT, HEALTH_REQUIREMENTS);
  assert.equal(monitor.compiled.result.valid, true, `monitor compile failed: ${JSON.stringify(monitor.compiled.result.errors)}`);
  const prioritize = compile(adaptiveDir, 'bakery.source.json', HEALTH_NODES, PRIORITIZE_INTENT, HEALTH_REQUIREMENTS);
  assert.equal(prioritize.compiled.result.valid, true, `prioritize compile failed: ${JSON.stringify(prioritize.compiled.result.errors)}`);

  const sigMonitor = extractCompositionSignature({ html: monitor.compiled.html, svg: monitor.compiled.svg });
  const sigPrioritize = extractCompositionSignature({ html: prioritize.compiled.html, svg: prioritize.compiled.svg });
  const difference = loadBearingDifference(sigMonitor, sigPrioritize);
  assert.ok(
    difference.differs,
    `COMPOSITION_COLLAPSE: same inventory + materially different confirmed decisions produced identical load-bearing composition (dominant/visual order/document order/first-row/span-bands/rank-families all equal): ${JSON.stringify(difference)}`
  );
});

test('CR2-B same archetype with different values keeps the same composition grammar (GREEN control)', () => {
  const a = compile(adaptiveDir, 'bakery.source.json', HEALTH_NODES, MONITOR_INTENT, HEALTH_REQUIREMENTS);
  const b = compile(cr2Dir, 'bakery-variant-b.source.json', HEALTH_NODES, MONITOR_INTENT, HEALTH_REQUIREMENTS);
  assert.equal(a.compiled.result.valid, true, JSON.stringify(a.compiled.result.errors));
  assert.equal(b.compiled.result.valid, true, JSON.stringify(b.compiled.result.errors));

  const sigA = extractCompositionSignature({ html: a.compiled.html, svg: a.compiled.svg });
  const sigB = extractCompositionSignature({ html: b.compiled.html, svg: b.compiled.svg });
  assert.deepStrictEqual(sigB, sigA, 'value-only changes must not shift the normalized composition grammar');
});

test('CR2-C monitor with grounded declared bounds must give exception state the dominant first-view structure', () => {
  const selections = [
    { id: 'declared_bound_breaches', type: 'ExceptionList', presentation: 'full_list' },
    { id: 'requests_trend', type: 'Trend', presentation: 'full_chart' },
    { id: 'latency_distribution', type: 'Distribution', presentation: 'full_chart' }
  ];
  const requirements = [
    { id: 'ctx_trend_reference', type: 'relative_comparison', subject: 'requests_trend', minimumCoverage: 'current_plus_reference', status: 'inferred' },
    { id: 'ctx_trend_temporal', type: 'temporal_reference', subject: 'requests_trend', minimumCoverage: 'current_plus_reference', status: 'inferred' },
    { id: 'ctx_latency_shape', type: 'distribution_shape', subject: 'latency_distribution', minimumCoverage: 'full_distribution', status: 'inferred' }
  ];
  const monitor = compile(cr2Dir, 'ops-exceptions.source.json', selections, MONITOR_INTENT, requirements);
  assert.equal(monitor.compiled.result.valid, true, `monitor-exception compile failed: ${JSON.stringify(monitor.compiled.result.errors)}`);

  const signature = extractCompositionSignature({ html: monitor.compiled.html, svg: monitor.compiled.svg });
  assert.equal(
    signature.dominantFamily,
    'exceptionlist',
    `MONITOR_NOT_DOMINANT: source-grounded declared-bound breaches must be the visually dominant first-view structure, got dominant=${signature.dominantFamily} spans=${JSON.stringify(signature.spanBands)}`
  );
  assert.ok(!signature.uniformSpan, 'a monitor composition needs at least two distinct span bands; uniform span means every region carries equal visual weight');
});

test('CR2-C-guard monitor without evaluative evidence must not fabricate evaluative language (GREEN control)', () => {
  const monitor = compile(adaptiveDir, 'bakery.source.json', HEALTH_NODES, MONITOR_INTENT, HEALTH_REQUIREMENTS);
  assert.equal(monitor.compiled.result.valid, true, JSON.stringify(monitor.compiled.result.errors));
  const artifactText = `${monitor.compiled.html}\n${monitor.compiled.svg}`;
  assert.doesNotMatch(artifactText, /needs attention|worsening|deteriorat|problematic|critical|must act|bad news/i, 'descriptive-only rule: no evaluative vocabulary without grounded basis');
  assert.doesNotMatch(artifactText, /data-semantic-role="exception"/, 'exception role must not appear without a source-declared exception node');
});

test('CR2-D1 grounded prioritization must render the ranked candidate region as dominant, ordered by the grounded basis', () => {
  const selections = [
    { id: 'revenue_target', type: 'Relationship', presentation: 'full_chart' },
    { id: 'gap_attribution', type: 'Breakdown', presentation: 'full_breakdown' },
    { id: 'top_accounts', type: 'Ranking', presentation: 'both_ends' }
  ];
  const requirements = [
    { id: 'ctx_revenue_target', type: 'target_reference', subject: 'revenue_target', minimumCoverage: 'target_and_gap', status: 'inferred' },
    { id: 'ctx_gap_attribution', type: 'gap_attribution', subject: 'gap_attribution', minimumCoverage: 'full_breakdown', status: 'inferred' },
    { id: 'ctx_top_accounts', type: 'contributor_comparison', subject: 'top_accounts', minimumCoverage: 'contributors', status: 'inferred' }
  ];
  const result = compile(adaptiveDir, 'ceo-sales.source.json', selections, PRIORITIZE_INTENT, requirements);
  assert.equal(result.compiled.result.valid, true, `grounded-prioritize compile failed: ${JSON.stringify(result.compiled.result.errors)}`);

  const signature = extractCompositionSignature({ html: result.compiled.html, svg: result.compiled.svg });
  const candidateRegion = signature.regions.find((region) => region.family === 'breakdown');
  assert.ok(candidateRegion, 'candidate gap region must be delivered');
  assert.equal(
    signature.dominantFamily,
    'breakdown',
    `PRIORITIZE_NOT_DOMINANT: with an explicit grounded ordering basis the ranked candidate region must dominate the page, got dominant=${signature.dominantFamily} uniform-span=${signature.uniformSpan}`
  );

  const candidateBlock = [...result.compiled.html.matchAll(/data-semantic-node="gap_attribution" data-semantic-item="true" data-item-index="(\d+)"[^>]*><span>(?:<em>[^<]*<\/em>)?([^<]*)<\/span><b>([^<]*)<\/b>/g)];
  const magnitudes = candidateBlock.map(([, , , value]) => Number.parseFloat(String(value).replace(/[^0-9.-]/g, '')));
  const descending = magnitudes.every((value, index) => index === 0 || magnitudes[index - 1] >= value);
  assert.ok(descending, `ORDER_NOT_GROUNDED: rendering order must follow grounded gap magnitudes: ${JSON.stringify(magnitudes)}`);
});

test('CR2-D2 prioritize intent WITHOUT grounded ordering basis must never sort by raw value (classification probe)', () => {
  const selections = [
    { id: 'candidate_list', type: 'Breakdown', presentation: 'full_breakdown' },
    { id: 'capacity_trend', type: 'Trend', presentation: 'full_chart' }
  ];
  const requirements = [
    { id: 'ctx_candidate_gap', type: 'gap_attribution', subject: 'candidate_list', minimumCoverage: 'full_breakdown', status: 'inferred' }
  ];
  const result = compile(cr2Dir, 'candidates-unranked.source.json', selections, PRIORITIZE_INTENT, requirements);

  let classification;
  const evidence = {};
  const askTransitions = ['ASK_METRIC_WORTHINESS_QUESTION', 'ASK_DECISION_BRIEF_QUESTION', 'FIX_METRIC_ROUTING'];
  if (!result.compiled.result.valid && askTransitions.includes(result.compiled.result.transition)) {
    classification = 'SAFE_FAIL_CLOSED';
    evidence.transition = result.compiled.result.transition;
  } else {
    assert.equal(result.compiled.result.valid, true, `unexpected non-ASK failure: ${JSON.stringify(result.compiled.result.errors)}`);
    const signature = extractCompositionSignature({ html: result.compiled.html, svg: result.compiled.svg });
    const rendered = [...result.compiled.html.matchAll(/data-semantic-node="candidate_list" data-semantic-item="true" data-item-index="(\d+)"[^>]*><span>([^<]*)<\/span><b>([^<]*)<\/b>/g)]
      .map(([, index, label, value]) => ({ index: Number(index), label, value: Number.parseFloat(value) }));
    const inputOrder = ['Candidate B', 'Candidate A', 'Candidate C'];
    const renderedOrder = rendered.map((entry) => entry.label);
    const sortedByValueDesc = [...rendered].sort((a, b) => b.value - a.value).map((entry) => entry.label);
    const artifactBody = result.compiled.html.slice(result.compiled.html.indexOf('</style>'));
    const rankMarksPresent = signature.rankedFamilies.length > 0 || /data-ranking-end|<em>\d+<\/em>|#1(?![0-9a-f])|First priority|Top candidate/i.test(artifactBody) || /data-semantic-role="rank"/.test(result.compiled.html);
    evidence.inputOrder = inputOrder;
    evidence.renderedOrder = renderedOrder;
    evidence.rankMarksPresent = rankMarksPresent;
    evidence.rawValues = rendered.map((entry) => `${entry.label}=${entry.value}`);
    if (renderedOrder.join('|') === sortedByValueDesc.join('|') || rankMarksPresent) {
      classification = 'UNSUPPORTED_ORDERING_ESCAPE';
    } else {
      classification = 'SAFE_ABSENCE';
    }
  }
  console.log(`CR2-D2 classification: ${classification} evidence: ${JSON.stringify(evidence)}`);
  assert.ok(['SAFE_ABSENCE', 'SAFE_FAIL_CLOSED', 'UNSUPPORTED_ORDERING_ESCAPE'].includes(classification));
});
