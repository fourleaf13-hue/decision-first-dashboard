// CR-5c: Monitor v1 acceptance fixes for the real Capacity case.
// Covers CP-1 (context preservation, dual fixture), CP-2 (subset disclosure),
// M-1/M-1G (single relevance mechanism + frozen geometry predicate),
// M-2 (exception-linked relevance), M-3 (fail-closed tiering),
// P-1 (period honesty), A-1 (provenance audit), U-1/U-2 (unit + basis),
// COPY-1 (visible-copy firewall). All contracts are generic — no fixture
// is special-cased anywhere in production code.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { METRIC_TIER_GEOMETRY_RATIO } from '../../skills/decision-first-dashboard/scripts/composition.js';
import { requiredRelationshipPaths } from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';
import { visibleTextOf } from './helpers/composition-signature.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const capacityDir = path.join(root, 'fixtures/capacity');
const syntheticDir = path.join(root, 'fixtures/cr5c-synthetic');
const worthiness = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/worthiness/dashboard.worthiness.json'), 'utf8'));

const firewallTerms = /\b(monitor|prioritize_readonly|anchor|primary|grounded_gap|grounded_rank|compositionIntent|orderingBasis|questionShape|actionShape|primary_signal|metric router|responseChange\.kind|semanticItem\.role)\b/i;
const alertFramingTerms = /\b(alert|alerts|attention|problem|problems|bad|critical|exception|exceptions|warning|breach|breaches|severity)\b/i;

function groundedCase(dir, fileName, { selections, decision, action, requirements = [], metrics, presentation = null, decorateState = null }) {
  const bytes = fs.readFileSync(path.join(dir, fileName));
  const source = JSON.parse(bytes.toString('utf8'));
  const decisionState = {
    mode: 'no_score',
    signals: source.signals.map((signal) => ({ ...signal, provenance: 'source' })),
    ...(presentation ? { presentation } : {}),
    ...((source.exceptions ?? []).length > 0 ? { exceptions: source.exceptions.map((entry) => ({ ...entry, provenance: 'source' })) } : {}),
    semanticNodes: source.semanticNodes.map((node, index) => ({
      id: selections[index].id,
      type: selections[index].type,
      title: node.title,
      ...(node.subtitle ? { subtitle: node.subtitle } : {}),
      ...(node.comparability ? { comparability: node.comparability } : {}),
      items: node.items.map((item) => ({ ...item, provenance: 'source' }))
    })),
    relationships: (source.relationships ?? []).map((relationship) => ({ ...relationship, provenance: 'source' }))
  };
  if (decorateState) decorateState(decisionState);
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
  (decisionState.exceptions ?? []).forEach((entry, index) => {
    for (const key of Object.keys(entry)) {
      if (key === 'provenance') continue;
      add(`/exceptions/${index}/${key}`, `/exceptions/${index}/${key}`);
    }
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
    decision: { status: 'confirmed', value: decision },
    action: { status: 'confirmed', value: action },
    questionShape: { status: 'confirmed', value: 'state' },
    actionShape: { status: 'confirmed', value: 'observe' },
    contextRequirements: requirements
  };
  const routing = {
    decision,
    action,
    inventoryCount: metrics.length,
    metrics,
    compositionNodes: selections
  };
  const bundle = {
    source: { kind: 'json', path: fileName, sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
    decisionState,
    evidence,
    claims
  };
  return compileDecisionDashboard(worthiness, brief, routing, bundle, { baseDir: dir });
}

function primaryRoute(metric, label) {
  return { metric, role: 'primary_signal', changesDecision: true, decisionImpact: `${label} changes the current-state read.`, visibility: 'first_view' };
}

const CAPACITY_DECISION = 'What is the current capacity state of the Horizon delivery portfolio for the management review?';
const CAPACITY_ACTION = 'Review the current state; no action is selected from this page';
const CAPACITY_NODES = [
  { id: 'capacity_kpis', type: 'MetricCluster', presentation: 'comparison' },
  { id: 'billable_hours_trend', type: 'Trend', presentation: 'full_chart' },
  { id: 'department_budget_usage', type: 'Breakdown', presentation: 'full_breakdown' },
  { id: 'budget_usage_by_project', type: 'Breakdown', presentation: 'full_breakdown' }
];
const CAPACITY_PRESENTATION = {
  primaryMetrics: ['budget_hours_used', 'utilization', 'hours_logged'],
  heroMetric: 'budget_hours_used',
  supportingMetrics: [],
  scorecardMetrics: ['task_completion', 'projects', 'avg_hours_logged']
};
const CAPACITY_METRICS = [
  primaryRoute('budget_hours_used', 'Portfolio budget consumption'),
  primaryRoute('utilization', 'Utilization'),
  primaryRoute('hours_logged', 'Logged hours'),
  { metric: 'task_completion', role: 'scorecard_only', changesDecision: false, visibility: 'scorecard' },
  { metric: 'projects', role: 'scorecard_only', changesDecision: false, visibility: 'scorecard' },
  { metric: 'avg_hours_logged', role: 'scorecard_only', changesDecision: false, visibility: 'scorecard' }
];
const CAPACITY_REQUIREMENTS = [
  { id: 'ctx_department_diagnostic', type: 'decomposition', subject: 'department_budget_usage', minimumCoverage: 'full_breakdown', status: 'confirmed' }
];

function compileCapacity(overrides = {}) {
  const selections = overrides.selections ?? CAPACITY_NODES;
  return groundedCase(capacityDir, 'capacity-reconstructed.source.json', {
    selections,
    decision: CAPACITY_DECISION,
    action: CAPACITY_ACTION,
    requirements: CAPACITY_REQUIREMENTS,
    metrics: CAPACITY_METRICS,
    presentation: CAPACITY_PRESENTATION,
    ...overrides
  });
}

function htmlItemValues(html, nodeId) {
  return [...html.matchAll(new RegExp(`data-semantic-node="${nodeId}" data-semantic-item="true"[^>]*><span>[^<]*</span><b>([^<]*)</b>`, 'g'))].map(([, value]) => value);
}

function svgItemBlocks(svg, nodeId) {
  return [...svg.matchAll(new RegExp(`<g ([^>]*data-semantic-node="${nodeId}"[^>]*data-semantic-item="true"[^>]*)>([\\s\\S]*?)<\\/g>`, 'g'))].map(([, attrs, body]) => ({ attrs, body }));
}

const MONITOR_INTENT = {
  decision: 'Are we operating within the declared bounds this week?',
  action: 'Review the current state; escalate only when a declared bound is crossed'
};

// ---------------------------------------------------------------- CP-1

test('CP-1a capacity regression: dropping department decomposition fails closed before rendering', () => {
  const selections = CAPACITY_NODES.map((node) => (node.id === 'department_budget_usage' ? { ...node, presentation: 'summary' } : node));
  const compiled = compileCapacity({ selections });
  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.stage, 'composition');
  assert.equal(compiled.result.transition, 'CONTEXT_PRESERVATION_FAILED');
  assert.ok(compiled.result.errors.some((error) => error.code === 'CONTEXT_PRESERVATION_FAILED' && error.message.includes('decomposition')));
  assert.equal(compiled.html, null);
  assert.equal(compiled.svg, null);
});

test('CP-1b synthetic minimal: the same decomposition-shaped contract fails and passes without any capacity special case', () => {
  const nodes = [
    { id: 'platform_status', type: 'MetricCluster', presentation: 'comparison' },
    { id: 'response_latency', type: 'Distribution', presentation: 'full_chart' },
    { id: 'requests_week', type: 'Trend', presentation: 'full_chart' }
  ];
  const requirements = [
    { id: 'ctx_latency_shape', type: 'distribution_shape', subject: 'response_latency', minimumCoverage: 'full_distribution', status: 'confirmed' }
  ];
  const metrics = [primaryRoute('service_count', 'Services'), primaryRoute('requests_today', 'Requests'), primaryRoute('regions_covered', 'Regions')];
  const dropped = groundedCase(syntheticDir, 'region-shape.source.json', {
    selections: nodes.map((node) => (node.id === 'response_latency' ? { ...node, presentation: 'peak_summary' } : node)),
    ...MONITOR_INTENT, requirements, metrics
  });
  assert.equal(dropped.result.valid, false);
  assert.equal(dropped.result.transition, 'CONTEXT_PRESERVATION_FAILED');
  assert.ok(dropped.result.errors.some((error) => error.code === 'CONTEXT_PRESERVATION_FAILED' && error.message.includes('distribution_shape')));

  const kept = groundedCase(syntheticDir, 'region-shape.source.json', { selections: nodes, ...MONITOR_INTENT, requirements, metrics });
  assert.equal(kept.result.valid, true, JSON.stringify(kept.result.errors));
  const visible = visibleTextOf({ html: kept.html, svg: kept.svg });
  for (const member of ['API', 'Search', 'Checkout', 'Media', 'Reports']) assert.ok(visible.includes(member), `full distribution member ${member} must be visibly delivered`);
});

test('CP-1c capacity: the full department decomposition is visibly delivered in HTML and SVG (context reachability)', () => {
  const compiled = compileCapacity();
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  const departmentRows = [
    ['Operations', '115.91%'], ['IT', '120.93%'], ['Finance', '124.52%'], ['Sales', '79.12%'],
    ['Marketing', '104.72%'], ['Consulting', '151.05%'], ['HR', '415.39%'], ['Total', '116.86%']
  ];
  const htmlValues = htmlItemValues(compiled.html, 'department_budget_usage');
  const svgValues = svgItemBlocks(compiled.svg, 'department_budget_usage').map((entry) => /class="value">([^<]*)</.exec(entry.body)?.[1] ?? '');
  for (const [label, value] of departmentRows) {
    assert.ok(compiled.html.includes(`>${label}</span><b>${value}</b>`), `${label} must be visible in the delivered HTML`);
    assert.ok(htmlValues.includes(value));
    assert.ok(svgValues.includes(value), `${value} must be visible in the delivered SVG`);
  }
  assert.equal(htmlValues.length, 8);
  assert.equal(svgValues.length, 8);
  // No disclosure widget exists in the delivered artifact, so reachability is
  // satisfied by direct visibility: the department region itself carries no
  // hidden attribute and no inline display:none (generic sheet CSS excluded).
  const regionStart = compiled.html.indexOf('data-semantic-node="department_budget_usage"');
  const nextRegion = compiled.html.indexOf('<section', regionStart);
  const departmentRegion = compiled.html.slice(regionStart, nextRegion < 0 ? compiled.html.length : nextRegion);
  assert.doesNotMatch(departmentRegion, /\bhidden\b|display:\s*none/i);
});

// ---------------------------------------------------------------- CP-2

test('CP-2 synthetic subset: a sliced presentation discloses N of M in visible text of both channels', () => {
  const compiled = groundedCase(syntheticDir, 'span-check.source.json', {
    selections: [{ id: 'initiative_rank', type: 'Ranking', presentation: 'both_ends' }],
    ...MONITOR_INTENT,
    requirements: [{ id: 'ctx_rank_span', type: 'ranking_span', subject: 'initiative_rank', minimumCoverage: 'contributors', status: 'confirmed' }],
    metrics: [primaryRoute('score_top', 'Top score'), primaryRoute('score_spread', 'Spread'), primaryRoute('score_floor', 'Floor score')]
  });
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  assert.match(compiled.html, /class="subset-note" data-subset-shown="2" data-subset-total="6">2 of 6 shown</);
  assert.match(compiled.svg, /data-subset-shown="2" data-subset-total="6">2 of 6 shown</);
  const visible = visibleTextOf({ html: compiled.html, svg: compiled.svg });
  assert.ok(visible.includes('2 of 6 shown'));
  // deterministic rule: both_ends shows exactly max and min.
  assert.ok(visible.includes('Alpha') && visible.includes('Zeta'));
  assert.ok(!visible.includes('Beta') && !visible.includes('Gamma'), 'only the deterministic ends may render');
});

// ---------------------------------------------------------------- M-1 / M-1G

test('M-1 every summary metric carries a tier and selectionBasis, and the tiers are mixed', () => {
  const compiled = compileCapacity();
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  const tiles = [...compiled.html.matchAll(/data-semantic-node="capacity_kpis" data-semantic-item="true"([^>]*)/g)].map(([, attrs]) => attrs);
  assert.equal(tiles.length, 6);
  for (const attrs of tiles) {
    assert.match(attrs, /data-metric-tier="(lead|secondary)"/);
    assert.match(attrs, /data-tier-basis="routed_role:[a-z_]+"/);
  }
  const relevance = compiled.manifest.delivery.relevance;
  assert.equal(relevance.mechanism, 'routed_metric_roles');
  assert.equal(relevance.metrics.length, 6);
  const lead = relevance.metrics.filter((entry) => entry.tier === 'lead').map((entry) => entry.metric).sort();
  const secondary = relevance.metrics.filter((entry) => entry.tier === 'secondary').map((entry) => entry.metric).sort();
  assert.deepEqual(lead, ['budget_hours_used', 'hours_logged', 'utilization']);
  assert.deepEqual(secondary, ['avg_hours_logged', 'projects', 'task_completion']);
  for (const entry of relevance.metrics) {
    assert.equal(entry.selectionBasis, `routed_role:${entry.tier === 'lead' ? 'primary_signal' : 'scorecard_only'}`);
  }
});

test('M-1G the frozen geometry predicate: lead value size and tile width are >= 1.5x secondary in both channels', () => {
  assert.equal(METRIC_TIER_GEOMETRY_RATIO, 1.5);
  const compiled = compileCapacity();
  assert.equal(compiled.manifest.delivery.relevance.geometryRatio, METRIC_TIER_GEOMETRY_RATIO);
  // HTML: lead numeric font-size must be >= ratio x the base tile size.
  const baseFont = Number(/\.metric-tile strong\{font-size:(\d+)px/.exec(compiled.html)[1]);
  const leadFont = Number(/\.metric-tile--lead strong\{font-size:(\d+)px/.exec(compiled.html)[1]);
  assert.ok(leadFont / baseFont >= METRIC_TIER_GEOMETRY_RATIO, `html numeric ratio ${leadFont}/${baseFont} below ${METRIC_TIER_GEOMETRY_RATIO}`);
  // SVG: same numeric rule via classes.
  const svgBaseFont = Number(/\.metric-value\{font:700 (\d+)px/.exec(compiled.svg)[1]);
  const svgLeadFont = Number(/\.metric-value--lead\{font:700 (\d+)px/.exec(compiled.svg)[1]);
  assert.ok(svgLeadFont / svgBaseFont >= METRIC_TIER_GEOMETRY_RATIO, `svg numeric ratio ${svgLeadFont}/${svgBaseFont} below ${METRIC_TIER_GEOMETRY_RATIO}`);
  // Measured delivered geometry: lead tile rects are wider than secondary rects by >= ratio.
  const widths = { lead: [], secondary: [] };
  for (const entry of svgItemBlocks(compiled.svg, 'capacity_kpis')) {
    const tier = /data-metric-tier="(\w+)"/.exec(entry.attrs)?.[1];
    const width = Number(/<rect[^>]*width="([\d.]+)"/.exec(entry.body)?.[1]);
    if (tier && Number.isFinite(width)) widths[tier].push(width);
  }
  assert.ok(widths.lead.length === 3 && widths.secondary.length === 3);
  const minLead = Math.min(...widths.lead);
  const maxSecondary = Math.max(...widths.secondary);
  assert.ok(minLead / maxSecondary >= METRIC_TIER_GEOMETRY_RATIO - 0.001, `measured width ratio ${(minLead / maxSecondary).toFixed(3)} below ${METRIC_TIER_GEOMETRY_RATIO}`);
  assert.notEqual(minLead, maxSecondary, 'lead and secondary geometry must materially differ');
});

// ---------------------------------------------------------------- M-2

const WATCH_NODES = [
  { id: 'limit_status', type: 'ExceptionList', presentation: 'full_list' },
  { id: 'throughput_status', type: 'MetricCluster', presentation: 'comparison' },
  { id: 'batches_week', type: 'Trend', presentation: 'full_chart' }
];
const WATCH_PRESENTATION = {
  primaryMetrics: ['queue_depth', 'active_batches', 'review_load'],
  heroMetric: 'queue_depth',
  supportingMetrics: [],
  scorecardMetrics: ['cycle_days']
};
const WATCH_METRICS = [
  primaryRoute('queue_depth', 'Queue depth'),
  primaryRoute('active_batches', 'Active batches'),
  primaryRoute('review_load', 'Review load'),
  { metric: 'batch_ceiling', role: 'exception', changesDecision: true, decisionImpact: 'Going over the confirmed limit changes what the review must address.', visibility: 'first_view', active: true, surfacePath: '/exceptions/0' },
  { metric: 'cycle_days', role: 'scorecard_only', changesDecision: false, visibility: 'scorecard' }
];

function compileWatch(overrides = {}) {
  return groundedCase(syntheticDir, 'exception-watch.source.json', {
    selections: WATCH_NODES,
    ...MONITOR_INTENT,
    metrics: WATCH_METRICS,
    presentation: WATCH_PRESENTATION,
    ...overrides
  });
}

test('M-2 a grounded exception reaches attention in both consumers: metric tier lead and exception-anchored region', () => {
  const compiled = compileWatch();
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  // consumer 1: state-summary metric tier
  assert.match(compiled.html, /data-semantic-node="throughput_status"[^>]*data-metric-tier="lead" data-tier-basis="routed_role:exception"/);
  const relevance = compiled.manifest.delivery.relevance;
  const ceiling = relevance.metrics.find((entry) => entry.metric === 'batch_ceiling');
  assert.equal(ceiling.tier, 'lead');
  assert.equal(ceiling.selectionBasis, 'routed_role:exception');
  // consumer 2: page region tier
  const regions = compiled.manifest.delivery.pageComposition.regions;
  assert.equal(regions[0].nodeId, 'limit_status');
  assert.equal(regions[0].attentionRole, 'anchor');
  assert.equal(regions[0].roleBasis, 'grounded_exception_anchor');
  for (const region of regions) assert.ok(typeof region.roleBasis === 'string' && region.roleBasis.length > 0);
});

test('M-3a fail closed: routing every linked metric to one tier is rejected as a uniform KPI wall', () => {
  const compiled = compileWatch({
    metrics: [
      primaryRoute('queue_depth', 'Queue depth'),
      primaryRoute('active_batches', 'Active batches'),
      primaryRoute('review_load', 'Review load'),
      primaryRoute('batch_ceiling', 'Batch ceiling'),
      primaryRoute('cycle_days', 'Cycle days')
    ],
    presentation: {
      primaryMetrics: ['queue_depth', 'active_batches', 'review_load', 'batch_ceiling', 'cycle_days'],
      heroMetric: 'queue_depth',
      supportingMetrics: [],
      scorecardMetrics: []
    }
  });
  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.stage, 'composition');
  assert.equal(compiled.result.transition, 'FIX_METRIC_ROUTING');
  assert.ok(compiled.result.errors.some((error) => error.code === 'METRIC_TIER_UNIFORM_WALL'));
  assert.equal(compiled.html, null);
});

test('M-3b fail closed: a linked metric without a route is rejected instead of rendered untiered', () => {
  const compiled = compileWatch({
    decorateState: (state) => {
      state.semanticNodes[1].items[3].metric = 'ghost_metric';
    }
  });
  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.transition, 'FIX_METRIC_ROUTING');
  assert.ok(compiled.result.errors.some((error) => error.code === 'METRIC_TIER_ROUTE_UNRESOLVED'));
});

// ---------------------------------------------------------------- P-1 / A-1 / U-1 / U-2 / COPY-1

test('P-1 the 2026 period basis is disclosed as not stated, with no decline interpretation', () => {
  const compiled = compileCapacity();
  const visible = visibleTextOf({ html: compiled.html, svg: compiled.svg });
  assert.ok(visible.includes('The source does not state whether 2026 is a full or partial year.'));
  assert.doesNotMatch(visible, /\b(declin\w*|decreas\w*|dropp?ed|fell|falling|downturn|worst)\b/i, 'UNKNOWN period basis forbids invented decline narratives');
  const fixture = JSON.parse(fs.readFileSync(path.join(capacityDir, 'capacity-reconstructed.source.json'), 'utf8'));
  assert.equal(fixture.integrity.periodBasis.year2026, 'UNKNOWN');
});

test('A-1 the 415 project value and the 415.39 department value stay two distinct source facts', () => {
  const compiled = compileCapacity();
  const projectValues = htmlItemValues(compiled.html, 'budget_usage_by_project');
  const departmentValues = htmlItemValues(compiled.html, 'department_budget_usage');
  assert.equal(projectValues.filter((value) => value === '415%').length, 1);
  assert.equal(departmentValues.filter((value) => value === '415%').length, 0);
  assert.equal(departmentValues.filter((value) => value === '415.39%').length, 1);
  assert.equal(projectValues.filter((value) => value === '415.39%').length, 0);
  const fixture = JSON.parse(fs.readFileSync(path.join(capacityDir, 'capacity-reconstructed.source.json'), 'utf8'));
  assert.equal(fixture.integrity.valueAudit.misalignment, false);
});

test('U-1 percent semantics are displayed as percent in the delivered artifact (title = display = source)', () => {
  const compiled = compileCapacity();
  for (const nodeId of ['budget_usage_by_project', 'department_budget_usage']) {
    const values = htmlItemValues(compiled.html, nodeId);
    assert.ok(values.length > 0);
    for (const value of values) assert.match(value, /^\d+(?:\.\d+)?%$/, `${nodeId} must display percent values with the % suffix, got ${value}`);
  }
  const svgValues = svgItemBlocks(compiled.svg, 'budget_usage_by_project').map((entry) => /class="value">([^<]*)</.exec(entry.body)?.[1] ?? '');
  for (const value of svgValues) assert.match(value, /^\d+%/);
});

test('U-2 the Avg Hours Logged tile discloses its unknown basis instead of guessing a denominator', () => {
  const compiled = compileCapacity();
  assert.ok(compiled.html.includes('<small>Average basis not stated in source</small>'));
  const svgText = visibleTextOf({ html: '', svg: compiled.svg });
  assert.ok(svgText.includes('Average basis not stated in source'));
  const fixture = JSON.parse(fs.readFileSync(path.join(capacityDir, 'capacity-reconstructed.source.json'), 'utf8'));
  assert.equal(fixture.integrity.avgMetricBasis.marker, 'AVG_METRIC_BASIS_UNKNOWN');
});

test('COPY-1 the delivered capacity page exposes no internal vocabulary and no severity framing', () => {
  const compiled = compileCapacity();
  const visible = visibleTextOf({ html: compiled.html, svg: compiled.svg });
  assert.equal(firewallTerms.test(visible), false, `firewall hits: ${visible.match(new RegExp(firewallTerms.source, 'gi'))}`);
  assert.equal(alertFramingTerms.test(visible), false, `alert framing hits: ${visible.match(new RegExp(alertFramingTerms.source, 'gi'))}`);
  // ungrounded 100% threshold: no above/below-budget evaluative framing either
  assert.doesNotMatch(visible, /\b(over budget|under budget|exceed\w* the budget|budget breach|unsustainab\w*)\b/i);
});

// ---------------------------------------------------------------- hierarchy (B/E/F structural side)

test('M-4 the capacity page is a state-led monitor: one dominant anchor region, supporting reading below, no uniform grid', () => {
  const compiled = compileCapacity();
  const regions = compiled.manifest.delivery.pageComposition.regions;
  assert.equal(compiled.manifest.delivery.pageComposition.exceptionLed, null);
  assert.equal(regions.filter((region) => region.attentionRole === 'anchor').length, 1);
  assert.equal(regions[0].nodeId, 'capacity_kpis');
  assert.equal(regions[0].roleBasis, 'monitor_state_reading');
  const spans = regions.map((region) => region.span);
  assert.notEqual(new Set(spans).size, 1, 'a uniform equal-span grid is an acceptance failure');
  assert.equal(spans.at(-1), 'full', 'a trailing odd supporting region takes the full row instead of stranding whitespace');
  // F: no grounded exception must exist and none may be invented
  assert.doesNotMatch(compiled.html, /data-semantic-role="exception"/);
});
