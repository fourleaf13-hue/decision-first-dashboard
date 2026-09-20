// CR-4: archetype-driven composition. These tests assert that the classified
// archetype measurably changes the DELIVERED page structure (region order,
// attention roles, span geometry, page pattern) for both archetypes and both
// grounded ordering bases, while fail-closed ASK behavior stays untouched.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { derivePageComposition } from '../../skills/decision-first-dashboard/scripts/composition.js';
import { applyRegionItemOrder } from '../../skills/decision-first-dashboard/scripts/visual-grammar.js';
import { requiredRelationshipPaths } from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';
import { extractCompositionSignature, blackoutSkeleton, loadBearingDimensions, visibleTextOf } from './helpers/composition-signature.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const adaptiveDir = path.join(root, 'fixtures/adaptive-composition');
const cr2Dir = path.join(root, 'fixtures/composition-router');
const scriptsDir = path.join(root, '..', '..', 'skills/decision-first-dashboard/scripts');
const worthiness = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/worthiness/dashboard.worthiness.json'), 'utf8'));

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

function compile(dir, fileName, selections, intents, requirements) {
  const fixture = makeGroundedFixture(dir, fileName, selections, intents);
  fixture.brief.contextRequirements = requirements;
  const compiled = compileDecisionDashboard(worthiness, fixture.brief, fixture.routing, fixture.bundle, { baseDir: dir });
  return { fixture, compiled };
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

const SERVICE_NODES = [
  { id: 'region_load', type: 'MetricCluster', presentation: 'comparison' },
  { id: 'requests_week', type: 'Trend', presentation: 'full_chart' },
  { id: 'response_latency', type: 'Distribution', presentation: 'full_chart' }
];
const SERVICE_REQUIREMENTS = [
  { id: 'ctx_cluster_relative', type: 'relative_comparison', subject: 'region_load', minimumCoverage: 'current_plus_reference', status: 'inferred' },
  { id: 'ctx_week_temporal', type: 'temporal_reference', subject: 'requests_week', minimumCoverage: 'current_plus_reference', status: 'inferred' },
  { id: 'ctx_latency_shape', type: 'distribution_shape', subject: 'response_latency', minimumCoverage: 'full_distribution', status: 'inferred' }
];
const FLEET_NODES = [
  { id: 'depot_load', type: 'MetricCluster', presentation: 'comparison' },
  { id: 'deliveries_week', type: 'Trend', presentation: 'full_chart' },
  { id: 'route_duration', type: 'Distribution', presentation: 'full_chart' }
];
const FLEET_REQUIREMENTS = [
  { id: 'ctx_cluster_relative', type: 'relative_comparison', subject: 'depot_load', minimumCoverage: 'current_plus_reference', status: 'inferred' },
  { id: 'ctx_week_temporal', type: 'temporal_reference', subject: 'deliveries_week', minimumCoverage: 'current_plus_reference', status: 'inferred' },
  { id: 'ctx_route_shape', type: 'distribution_shape', subject: 'route_duration', minimumCoverage: 'full_distribution', status: 'inferred' }
];
const RANK_NODES = [
  { id: 'initiative_rank', type: 'Ranking', presentation: 'full_ranking' },
  { id: 'throughput_trend', type: 'Trend', presentation: 'full_chart' },
  { id: 'cycle_time', type: 'Distribution', presentation: 'full_chart' }
];
const RANK_REQUIREMENTS = [
  { id: 'ctx_rank_span', type: 'ranking_span', subject: 'initiative_rank', minimumCoverage: 'both_ends', status: 'inferred' },
  { id: 'ctx_throughput_temporal', type: 'temporal_reference', subject: 'throughput_trend', minimumCoverage: 'current_plus_reference', status: 'inferred' },
  { id: 'ctx_cycle_shape', type: 'distribution_shape', subject: 'cycle_time', minimumCoverage: 'full_distribution', status: 'inferred' }
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

const SVG_RECT_RE = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="18" class="card"\/>/g;

function svgWidths(svg) {
  return [...svg.matchAll(SVG_RECT_RE)].map(([, x, y, width, height]) => ({ x: Number(x), y: Number(y), width: Number(width), height: Number(height) }));
}

function renderedItemLabels(html, nodeId) {
  return [...html.matchAll(new RegExp(`data-semantic-node="${nodeId}" data-semantic-item="true"[^>]*><span>(?:<em>[^<]*<\\/em>)?([^<]*)<\\/span>`, 'g'))]
    .map(([, label]) => label);
}

test('CR4-C2 descriptive monitor keeps the state cluster dominant without fabricating exception framing', () => {
  const result = compile(cr2Dir, 'service-status.source.json', SERVICE_NODES, MONITOR_INTENT, SERVICE_REQUIREMENTS);
  assert.equal(result.compiled.result.valid, true, JSON.stringify(result.compiled.result.errors));
  assert.equal(result.compiled.result.compositionIntent.archetype, 'monitor');

  const signature = extractCompositionSignature({ html: result.compiled.html, svg: result.compiled.svg });
  assert.equal(signature.pagePattern, 'hero_support');
  assert.equal(signature.dominantFamily, 'metriccluster', 'the grounded state summary cluster, not a synthetic alert block, must anchor a descriptive monitor');
  assert.equal(signature.regions.filter((region) => region.attentionRole === 'anchor').length, 1, 'exactly one anchor per page');
  assert.equal(signature.regions.find((region) => region.attentionRole === 'anchor').family, 'metriccluster');
  assert.equal(signature.familyDocumentOrder.includes('exceptionlist'), false, 'no exception region may be invented for a source without declared bounds');
  assert.ok(!signature.uniformSpan, 'a descriptive monitor must not regress to a uniform equal-weight grid');
  assert.equal(result.compiled.manifest.delivery.pageComposition.exceptionLed, null);

  const visible = visibleTextOf({ html: result.compiled.html, svg: result.compiled.svg });
  assert.doesNotMatch(visible, /\b(alert|alerts|attention|problem|problems|bad|critical|exception|exceptions|warning|breach|breaches|severity)\b/i,
    'descriptive monitor copy must stay factual: no evaluative or alert framing without a grounded exception source');
  assert.doesNotMatch(result.compiled.html, /data-semantic-role="exception"/, 'exception role must not appear without a source-declared exception node');
  console.log('CR4-C2 classification: DESCRIPTIVE_MONITOR_PASS');
});

test('CR4-G delivered geometry really changes: anchor span dominates in HTML and SVG for both patterns', () => {
  const monitor = compile(cr2Dir, 'service-status.source.json', SERVICE_NODES, MONITOR_INTENT, SERVICE_REQUIREMENTS);
  assert.equal(monitor.compiled.result.valid, true, JSON.stringify(monitor.compiled.result.errors));
  const monitorRects = svgWidths(monitor.compiled.svg);
  assert.ok(monitorRects.every((rect) => rect.width > 0), 'svg region rects must be parsed');
  const monitorAnchor = monitorRects.find((rect) => rect.y === Math.min(...monitorRects.map((r) => r.y)));
  assert.ok(monitorRects.every((rect) => rect === monitorAnchor || monitorAnchor.width > rect.width),
    `anchor must be geometrically dominant in SVG: ${JSON.stringify(monitorRects.map((r) => r.width))}`);
  assert.match(monitor.compiled.html, /class="semantic-grid semantic-grid--hero_support" data-page-pattern="hero_support"/);
  assert.match(monitor.compiled.html, /<section class="semantic-card[^"]*semantic-card--role-anchor[^>]*style="grid-column:1\/-1"/,
    'the anchor section must occupy the full first row in delivered HTML, not just carry a data attribute');
  assert.match(monitor.compiled.html, /\.semantic-grid--hero_support\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
    'page grammar must override the generic auto-fit grid with an explicit two-column template');
  assert.match(monitor.compiled.svg, /<svg[^>]*data-page-pattern="hero_support"/);
  assert.match(monitor.compiled.svg, /data-attention-role="anchor"[^>]*data-region-span="full"/);

  const prioritize = compile(cr2Dir, 'initiatives-rank.source.json', RANK_NODES, PRIORITIZE_INTENT, RANK_REQUIREMENTS);
  assert.equal(prioritize.compiled.result.valid, true, JSON.stringify(prioritize.compiled.result.errors));
  const prioRects = svgWidths(prioritize.compiled.svg);
  const widths = prioRects.map((rect) => rect.width);
  assert.equal(Math.max(...widths), 1344, 'anchor region must render at full content width');
  assert.ok(widths.includes(912) && widths.includes(416), `asymmetric pattern needs distinct wide and narrow spans: ${JSON.stringify(widths)}`);
  assert.ok(Math.min(...widths.filter((width) => width !== 1344)) < 632, 'supporting regions must be narrower than the legacy uniform width');
  assert.match(prioritize.compiled.html, /class="semantic-grid semantic-grid--asymmetric" data-page-pattern="asymmetric"/);
  assert.match(prioritize.compiled.html, /\.semantic-grid--asymmetric\{grid-template-columns:69fr 31fr\}/);
  assert.match(prioritize.compiled.svg, /<svg[^>]*data-page-pattern="asymmetric"/);
});

test('CR4-P grounded rank basis drives the prioritize reading path and item order, not input or raw-value order', () => {
  const result = compile(cr2Dir, 'initiatives-rank.source.json', RANK_NODES, PRIORITIZE_INTENT, RANK_REQUIREMENTS);
  assert.equal(result.compiled.result.valid, true, JSON.stringify(result.compiled.result.errors));
  assert.equal(result.compiled.manifest.compositionIntent.orderingBasis.kind, 'grounded_rank');

  const signature = extractCompositionSignature({ html: result.compiled.html, svg: result.compiled.svg });
  assert.equal(signature.pagePattern, 'asymmetric');
  assert.equal(signature.familyVisualOrder[0], 'ranking', 'the ranked candidate set must be first in visual order');
  assert.equal(signature.dominantFamily, 'ranking');
  assert.equal(signature.regions[0].attentionRole, 'anchor');

  const inputOrder = ['Warehouse routing', 'Returns portal', 'Fleet telemetry'];
  const renderedOrder = renderedItemLabels(result.compiled.html, 'initiative_rank');
  assert.deepEqual(renderedOrder, ['Returns portal', 'Warehouse routing', 'Fleet telemetry'],
    'items must be re-ordered by the declared rank ordinals consumed from orderingBasis');
  assert.notDeepEqual(renderedOrder, inputOrder);

  const anchorRegion = result.compiled.manifest.delivery.pageComposition.regions[0];
  assert.equal(anchorRegion.nodeId, 'initiative_rank');
  assert.equal(anchorRegion.itemOrderStrategy, 'rank_asc');
});

test('CR4-D1 grounded gap path anchors the candidate region and demotes the target relationship to support', () => {
  const result = compile(adaptiveDir, 'ceo-sales.source.json', CEO_NODES, PRIORITIZE_INTENT, CEO_REQUIREMENTS);
  assert.equal(result.compiled.result.valid, true, JSON.stringify(result.compiled.result.errors));
  assert.equal(result.compiled.manifest.compositionIntent.orderingBasis.kind, 'grounded_gap');

  const signature = extractCompositionSignature({ html: result.compiled.html, svg: result.compiled.svg });
  assert.equal(signature.dominantFamily, 'breakdown');
  assert.equal(signature.regions[0].attentionRole, 'anchor');
  assert.equal(signature.regions[0].family, 'breakdown');
  const relationshipRegion = signature.regions.find((region) => region.family === 'relationship');
  assert.ok(['primary', 'supporting', 'detail'].includes(relationshipRegion.attentionRole), 'the target/actual relationship is supporting context under the candidates');
  assert.ok(relationshipRegion.attentionRole !== 'anchor');

  const pageComposition = result.compiled.manifest.delivery.pageComposition;
  assert.equal(pageComposition.regions[0].nodeId, 'gap_attribution');
  assert.equal(pageComposition.regions[0].itemOrderStrategy, 'gap_desc');
  const candidateOrder = renderedItemLabels(result.compiled.html, 'gap_attribution');
  assert.deepEqual(candidateOrder, ['New business shortfall', 'Expansion shortfall', 'Churn impact']);
});

test('CR4-AT anti-template: different business domains on the same archetype share one composition grammar', () => {
  const service = compile(cr2Dir, 'service-status.source.json', SERVICE_NODES, MONITOR_INTENT, SERVICE_REQUIREMENTS);
  const fleet = compile(cr2Dir, 'fleet-status.source.json', FLEET_NODES, MONITOR_INTENT, FLEET_REQUIREMENTS);
  assert.equal(service.compiled.result.valid, true, JSON.stringify(service.compiled.result.errors));
  assert.equal(fleet.compiled.result.valid, true, JSON.stringify(fleet.compiled.result.errors));

  const serviceSignature = extractCompositionSignature({ html: service.compiled.html, svg: service.compiled.svg });
  const fleetSignature = extractCompositionSignature({ html: fleet.compiled.html, svg: fleet.compiled.svg });
  assert.deepEqual(loadBearingDimensions(fleetSignature), loadBearingDimensions(serviceSignature),
    'the same archetype must deliver the same grammar regardless of business domain');

  const productionScripts = fs.readdirSync(scriptsDir).filter((name) => name.endsWith('.js'));
  for (const name of productionScripts) {
    const text = fs.readFileSync(path.join(scriptsDir, name), 'utf8');
    assert.doesNotMatch(text, /\b(bakery|workforce|sales|ceo|fleet|initiatives)\b/i, `production script ${name} must not branch on fixture business domains`);
  }
});

test('CR4-BL blackout skeleton: page grammar is distinguishable without reading any copy', () => {
  const monitor = compile(adaptiveDir, 'ceo-sales.source.json', CEO_NODES, MONITOR_INTENT, CEO_REQUIREMENTS);
  const prioritize = compile(adaptiveDir, 'ceo-sales.source.json', CEO_NODES, PRIORITIZE_INTENT, CEO_REQUIREMENTS);
  assert.equal(monitor.compiled.result.valid, true, JSON.stringify(monitor.compiled.result.errors));
  assert.equal(prioritize.compiled.result.valid, true, JSON.stringify(prioritize.compiled.result.errors));

  const monitorSkeleton = blackoutSkeleton(extractCompositionSignature({ html: monitor.compiled.html, svg: monitor.compiled.svg }));
  const prioritizeSkeleton = blackoutSkeleton(extractCompositionSignature({ html: prioritize.compiled.html, svg: prioritize.compiled.svg }));
  console.log(`CR4-BL monitor:\n${monitorSkeleton}\nCR4-BL prioritize:\n${prioritizeSkeleton}`);

  assert.notEqual(monitorSkeleton, prioritizeSkeleton, 'same source, different confirmed intent: the copy-blind silhouette must differ');
  const businessCopy = /revenue|target|gap|account|shortfall|pilgrim|northstar|copper/i;
  assert.doesNotMatch(monitorSkeleton, businessCopy);
  assert.doesNotMatch(prioritizeSkeleton, businessCopy);
});

test('CR4-FW delivered visible copy never leaks internal composition vocabulary', () => {
  const artifacts = [
    compile(cr2Dir, 'service-status.source.json', SERVICE_NODES, MONITOR_INTENT, SERVICE_REQUIREMENTS),
    compile(adaptiveDir, 'ceo-sales.source.json', CEO_NODES, MONITOR_INTENT, CEO_REQUIREMENTS),
    compile(cr2Dir, 'initiatives-rank.source.json', RANK_NODES, PRIORITIZE_INTENT, RANK_REQUIREMENTS),
    compile(adaptiveDir, 'ceo-sales.source.json', CEO_NODES, PRIORITIZE_INTENT, CEO_REQUIREMENTS)
  ];
  // Visible text only: data-* machine metadata legitimately carries this
  // vocabulary and must not trip the copy firewall.
  const forbidden = /\b(monitor|prioritize_readonly|anchor|primary|grounded_gap|grounded_rank|compositionIntent|orderingBasis|questionShape|actionShape|primary_signal|metric router|responseChange\.kind|semanticItem\.role)\b/i;
  for (const [index, artifact] of artifacts.entries()) {
    assert.equal(artifact.compiled.result.valid, true, `artifact ${index} failed to compile`);
    const visible = visibleTextOf({ html: artifact.compiled.html, svg: artifact.compiled.svg });
    const leaked = visible.match(new RegExp(forbidden.source, 'gi'));
    assert.equal(leaked, null, `internal vocabulary leaked into visible copy in artifact ${index}: ${JSON.stringify(leaked)}`);
  }
});

test('CR4-U page grammar is generic: archetype gating, anchor count, and fail-closed rules hold without rendering', () => {
  const threeNodes = [
    { id: 'a', type: 'MetricCluster', presentation: 'comparison' },
    { id: 'b', type: 'Trend', presentation: 'full_chart' },
    { id: 'c', type: 'Distribution', presentation: 'full_chart' }
  ];
  assert.equal(derivePageComposition({ nodes: threeNodes, compositionIntent: null }), null, 'no archetype means no page grammar');
  assert.equal(derivePageComposition({ nodes: threeNodes, compositionIntent: { archetype: 'investigate' } }), null, 'unsupported archetypes never gain a grammar');
  assert.equal(derivePageComposition({ nodes: threeNodes.slice(0, 2), compositionIntent: { archetype: 'monitor' } }), null, 'sub-three pages keep presentation-level layout');

  const monitorGrammar = derivePageComposition({ nodes: threeNodes, compositionIntent: { archetype: 'monitor' } });
  assert.equal(monitorGrammar.pattern, 'hero_support');
  assert.equal(monitorGrammar.regions.filter((region) => region.attentionRole === 'anchor').length, 1);
  assert.equal(monitorGrammar.regions.every((region) => ['anchor', 'primary', 'supporting', 'detail'].includes(region.attentionRole)), true);

  assert.equal(
    derivePageComposition({ nodes: threeNodes, compositionIntent: { archetype: 'prioritize_readonly', orderingBasis: { kind: 'inferred_order', candidateRefs: [] } }, semanticNodeIds: ['a', 'b', 'c'] }),
    null,
    'an unrecognised ordering basis must fail closed to the uniform layout'
  );
  assert.equal(
    derivePageComposition({ nodes: threeNodes, compositionIntent: { archetype: 'prioritize_readonly', orderingBasis: { kind: 'grounded_rank', candidateRefs: ['/semanticNodes/9/items/0'] } }, semanticNodeIds: ['a', 'b', 'c'] }),
    null,
    'candidate refs that resolve outside the delivered page must fail closed'
  );

  const items = [{ label: 'X', value: '$0.16M' }, { label: 'Y', value: '$0.55M' }, { label: 'Z', value: '$0.31M' }];
  assert.deepEqual(applyRegionItemOrder(items, 'gap_desc').map((item) => item.label), ['Y', 'Z', 'X']);
  assert.deepEqual(applyRegionItemOrder(items, 'unsupported_strategy').map((item) => item.label), ['X', 'Y', 'Z']);
});

test('CR4-D2 prioritize without a grounded basis still fails closed to ASK after the composition layer', () => {
  const selections = [
    { id: 'candidate_list', type: 'Breakdown', presentation: 'full_breakdown' },
    { id: 'capacity_trend', type: 'Trend', presentation: 'full_chart' },
    { id: 'load_shape', type: 'Distribution', presentation: 'full_chart' }
  ];
  const requirements = [
    { id: 'ctx_candidate_gap', type: 'gap_attribution', subject: 'candidate_list', minimumCoverage: 'full_breakdown', status: 'inferred' }
  ];
  const bytes = fs.readFileSync(path.join(cr2Dir, 'candidates-unranked.source.json'));
  const source = JSON.parse(bytes.toString('utf8'));
  assert.equal(source.semanticNodes.length, 2, 'fail-closed probe runs on the unranked source even with three selected regions');
  const result = compile(cr2Dir, 'candidates-unranked.source.json', selections.slice(0, 2), PRIORITIZE_INTENT, requirements);
  assert.equal(result.compiled.result.valid, false);
  assert.equal(result.compiled.result.transition, 'ASK_COMPOSITION_INTENT');
  assert.equal(result.compiled.html, null, 'no artifact may render without a grounded ordering basis');
  assert.equal(result.compiled.manifest, null);
});
