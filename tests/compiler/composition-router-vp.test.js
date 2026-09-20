// Visual Polish (VP) contract tests. These lock the responsive hierarchy
// totals order, per-surface canonical attentionRole exposure, detail
// reachability, the no-invented-encoding boundary, neutral delta styling,
// and "same visual language != same composition" across four routed pages
// (Workforce, Capacity, synthetic SaaS multi-tier, FP&A CEO-sales).
// All production behavior under test already exists; nothing here patches it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { requiredRelationshipPaths } from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';
import { extractCompositionSignature, blackoutSkeleton, visibleTextOf } from './helpers/composition-signature.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const workforceDir = path.join(root, 'fixtures/workforce');
const capacityDir = path.join(root, 'fixtures/capacity');
const syntheticDir = path.join(root, 'fixtures/cr5c-synthetic');
const adaptiveDir = path.join(root, 'fixtures/adaptive-composition');
const worthiness = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/worthiness/dashboard.worthiness.json'), 'utf8'));

const ROLE_NAMES = Object.freeze(['anchor', 'primary', 'supporting', 'detail']);

// Harness identical to tests/compiler/composition-router-cr5c.test.js.
function groundedCase(dir, fileName, { selections, decision, action, requirements = [], metrics, presentation = null, header = null, decorateState = null }) {
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
    ...(header?.title ? { title: header.title } : {}),
    ...(header?.subtitle ? { subtitle: header.subtitle } : {}),
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

// ---------------------------------------------------------------- fixtures

const WORKFORCE = {
  dir: workforceDir,
  file: 'workforce-reconstructed.source.json',
  decision: 'What is the current workforce state for the 2026 management review?',
  action: 'Review the current state; no action is selected from this page',
  selections: [
    { id: 'workforce_kpis', type: 'MetricCluster', presentation: 'comparison' },
    { id: 'headcount_trend', type: 'Trend', presentation: 'full_chart' },
    { id: 'department_headcount', type: 'Breakdown', presentation: 'full_breakdown' }
  ],
  presentation: {
    primaryMetrics: ['total_headcount', 'turnover_rate', 'training_completion'],
    heroMetric: 'total_headcount',
    supportingMetrics: [],
    scorecardMetrics: ['avg_appraisal']
  },
  metrics: [
    primaryRoute('total_headcount', 'Total headcount'),
    primaryRoute('turnover_rate', 'Turnover rate'),
    primaryRoute('training_completion', 'Training completion'),
    { metric: 'avg_appraisal', role: 'scorecard_only', changesDecision: false, visibility: 'scorecard' }
  ],
  requirements: [
    { id: 'ctx_department_headcount', type: 'decomposition', subject: 'department_headcount', minimumCoverage: 'full_breakdown', status: 'confirmed' }
  ]
};

const CAPACITY = {
  dir: capacityDir,
  file: 'capacity-reconstructed.source.json',
  decision: 'What is the current capacity state of the Horizon delivery portfolio for the management review?',
  action: 'Review the current state; no action is selected from this page',
  selections: [
    { id: 'capacity_kpis', type: 'MetricCluster', presentation: 'comparison' },
    { id: 'billable_hours_trend', type: 'Trend', presentation: 'full_chart' },
    { id: 'department_budget_usage', type: 'Breakdown', presentation: 'full_breakdown' },
    { id: 'budget_usage_by_project', type: 'Breakdown', presentation: 'full_breakdown' }
  ],
  presentation: {
    primaryMetrics: ['budget_hours_used', 'utilization', 'hours_logged'],
    heroMetric: 'budget_hours_used',
    supportingMetrics: [],
    scorecardMetrics: ['task_completion', 'projects', 'avg_hours_logged']
  },
  metrics: [
    primaryRoute('budget_hours_used', 'Portfolio budget consumption'),
    primaryRoute('utilization', 'Utilization'),
    primaryRoute('hours_logged', 'Logged hours'),
    { metric: 'task_completion', role: 'scorecard_only', changesDecision: false, visibility: 'scorecard' },
    { metric: 'projects', role: 'scorecard_only', changesDecision: false, visibility: 'scorecard' },
    { metric: 'avg_hours_logged', role: 'scorecard_only', changesDecision: false, visibility: 'scorecard' }
  ],
  requirements: [
    { id: 'ctx_department_diagnostic', type: 'decomposition', subject: 'department_budget_usage', minimumCoverage: 'full_breakdown', status: 'confirmed' }
  ]
};

// Synthetic exception-led SaaS page: the only fixture that delivers all four
// attention tiers at once (anchor ExceptionList > primary Trend > supporting
// MetricCluster/Breakdown > detail Drilldown).
const SAAS = {
  dir: syntheticDir,
  file: 'saas-multitier-monitor.source.json',
  decision: 'Are we operating within the declared bounds this quarter?',
  action: 'Review the current state; escalate only when a declared bound is crossed',
  selections: [
    { id: 'limit_status', type: 'ExceptionList', presentation: 'full_list' },
    { id: 'arr_trend', type: 'Trend', presentation: 'full_chart' },
    { id: 'saas_kpis', type: 'MetricCluster', presentation: 'comparison' },
    { id: 'segment_mix', type: 'Breakdown', presentation: 'full_breakdown' },
    { id: 'expansion_detail', type: 'Drilldown', presentation: 'reachable_detail' }
  ],
  presentation: {
    primaryMetrics: ['arr', 'net_revenue_retention', 'gross_margin'],
    heroMetric: 'arr',
    supportingMetrics: [],
    scorecardMetrics: ['support_tickets']
  },
  metrics: [
    primaryRoute('arr', 'Annual recurring revenue'),
    primaryRoute('net_revenue_retention', 'Net revenue retention'),
    primaryRoute('gross_margin', 'Gross margin'),
    { metric: 'margin_floor', role: 'exception', changesDecision: true, decisionImpact: 'Crossing the confirmed margin floor changes what the review must address.', visibility: 'first_view', active: true, surfacePath: '/exceptions/0' },
    { metric: 'support_tickets', role: 'scorecard_only', changesDecision: false, visibility: 'scorecard' }
  ],
  requirements: []
};

function compileFixture(spec) {
  return groundedCase(
    spec.dir,
    spec.file,
    {
      selections: spec.selections,
      decision: spec.decision,
      action: spec.action,
      requirements: spec.requirements,
      metrics: spec.metrics,
      presentation: spec.presentation
    }
  );
}

const workforce = () => compileFixture(WORKFORCE);
const capacity = () => compileFixture(CAPACITY);
const saas = () => compileFixture(SAAS);

// FP&A CEO-sales regression: harness identical to
// tests/compiler/composition-router-cr4.test.js makeGroundedFixture.
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
const CEO_MONITOR_INTENT = {
  decision: 'Are we operating within the declared bounds this quarter?',
  action: 'Review the current state; escalate only when a declared bound is crossed',
  questionShape: 'state',
  actionShape: 'observe'
};

function ceoMonitor() {
  const fileName = 'ceo-sales.source.json';
  const bytes = fs.readFileSync(path.join(adaptiveDir, fileName));
  const source = JSON.parse(bytes.toString('utf8'));
  const decisionState = {
    mode: 'no_score',
    signals: source.signals.map((signal, index) => ({ metric: `signal_${index + 1}`, ...signal, provenance: 'source' })),
    semanticNodes: source.semanticNodes.map((node, index) => ({
      id: CEO_NODES[index].id,
      type: CEO_NODES[index].type,
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
    decision: { status: 'confirmed', value: CEO_MONITOR_INTENT.decision },
    action: { status: 'confirmed', value: CEO_MONITOR_INTENT.action },
    questionShape: { status: 'confirmed', value: CEO_MONITOR_INTENT.questionShape },
    actionShape: { status: 'confirmed', value: CEO_MONITOR_INTENT.actionShape },
    contextRequirements: CEO_REQUIREMENTS
  };
  const routing = {
    decision: CEO_MONITOR_INTENT.decision,
    action: CEO_MONITOR_INTENT.action,
    inventoryCount: decisionState.signals.length,
    metrics: decisionState.signals.map((signal) => ({ metric: signal.metric, role: 'primary_signal', changesDecision: true, decisionImpact: `${signal.label} informs the confirmed decision`, visibility: 'first_view' })),
    compositionNodes: CEO_NODES
  };
  const bundle = {
    source: { kind: 'json', path: fileName, sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
    decisionState,
    evidence,
    claims
  };
  return compileDecisionDashboard(worthiness, brief, routing, bundle, { baseDir: adaptiveDir });
}

// ---------------------------------------------------------------- parsing helpers

function styleBlock(artifact) {
  const html = typeof artifact === 'string' ? artifact : artifact.html;
  return /<style>([\s\S]*?)<\/style>/.exec(html)[1];
}

const ROLE_RULE_RE = /\.semantic-card--role-(anchor|primary|supporting|detail)\{([^}]*)\}/g;

function tokenPx(body, name) {
  const value = new RegExp(`--${name}:(-?[\\d.]+)px`).exec(body);
  assert.ok(value, `missing --${name} in role rule: ${body}`);
  return Number(value[1]);
}

// Returns { wide, tablet, narrow } in delivered-CSS order; each is a map of
// role -> rule body for the ladder fields the polish layer claims to order.
function htmlRoleLadders(css) {
  const rules = [...css.matchAll(ROLE_RULE_RE)];
  assert.equal(rules.length, 12, `expected 4 roles x 3 breakpoints of role rules, saw ${rules.length}`);
  const order = ROLE_NAMES.concat(ROLE_NAMES, ROLE_NAMES).join(',');
  assert.equal(rules.map(([, role]) => role).join(','), order, 'role rules must appear in wide/tablet/narrow blocks, canonical order each');
  const body = (start) => Object.fromEntries(rules.slice(start, start + 4).map(([, role, text]) => [role, text]));
  return { wide: body(0), tablet: body(4), narrow: body(8) };
}

// Total-order checker used by VP-1/VP-5: operates on an arbitrary ladder map
// so the detector itself is falsifiable.
function hierarchyViolations(ladder, fields) {
  const violations = [];
  for (const field of fields) {
    for (let i = 1; i < ROLE_NAMES.length; i += 1) {
      const higher = ladder[ROLE_NAMES[i - 1]][field];
      const lower = ladder[ROLE_NAMES[i]][field];
      if (!(higher > lower)) violations.push(`${field}: ${ROLE_NAMES[i - 1]}(${higher}) !> ${ROLE_NAMES[i]}(${lower})`);
    }
  }
  return violations;
}

function toNumberLadder(ladder, fields) {
  return Object.fromEntries(Object.entries(ladder).map(([role, body]) => [role, Object.fromEntries(fields.map((field) => [field, tokenPx(body, field)]))]));
}

const LADDER_FIELDS = ['rp-title', 'rp-value', 'rp-pad'];

function svgLadder(css, selector) {
  const rules = [...css.matchAll(new RegExp(selector, 'g'))];
  assert.equal(rules.length, 4);
  return Object.fromEntries(rules.map(([, role, size]) => [role, { size: Number(size) }]));
}

function htmlRegionSlice(html, nodeId) {
  const start = html.indexOf(`data-semantic-node="${nodeId}"`);
  assert.notEqual(start, -1, `region ${nodeId} missing`);
  const next = html.indexOf('<section', start);
  return html.slice(start, next === -1 ? html.length : next);
}

// ---------------------------------------------------------------- VP-1/VP-2 hierarchy totals order

test('VP-1 HTML hierarchy is a strict TOTAL order anchor>primary>supporting>detail at every breakpoint', () => {
  const compiled = saas();
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  const css = styleBlock(compiled);
  const ladders = htmlRoleLadders(css);
  for (const breakpoint of ['wide', 'tablet', 'narrow']) {
    const numeric = toNumberLadder(ladders[breakpoint], LADDER_FIELDS);
    assert.deepEqual(hierarchyViolations(numeric, LADDER_FIELDS), [], `total order broken at ${breakpoint}`);
  }
});

test('VP-2 SVG ladder keeps the same total order on its single fixed canvas', () => {
  const compiled = saas();
  const css = /<style>([\s\S]*?)<\/style>/.exec(compiled.svg)[1];
  const title = svgLadder(css, 'g\\[data-attention-role="(anchor|primary|supporting|detail)"\\]>.title\\{font-size:([\\d.]+)px\\}');
  const value = svgLadder(css, 'g\\[data-attention-role="(anchor|primary|supporting|detail)"\\] \\.value\\{font-size:([\\d.]+)px\\}');
  assert.deepEqual(hierarchyViolations(title, ['size']), [], 'SVG title ladder order');
  assert.deepEqual(hierarchyViolations(value, ['size']), [], 'SVG value ladder order');
});

// ---------------------------------------------------------------- VP-3 per-surface canonical role

test('VP-3 every rendered surface exposes the canonical attentionRole in HTML, SVG, and manifest', () => {
  const compiled = saas();
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  const regions = compiled.manifest.delivery.pageComposition.regions;
  assert.deepEqual(regions.map((region) => region.attentionRole), ['anchor', 'primary', 'supporting', 'supporting', 'detail']);
  for (const region of regions) {
    assert.match(compiled.html, new RegExp(`data-semantic-node="${region.nodeId}"[^>]*data-attention-role="${region.attentionRole}"|data-attention-role="${region.attentionRole}"[^>]*data-semantic-node="${region.nodeId}"`), `${region.nodeId} html role`);
    assert.match(compiled.html, new RegExp(`semantic-card--role-${region.attentionRole}\\b`), `${region.nodeId} html role class`);
    assert.ok(compiled.svg.includes(`data-semantic-node="${region.nodeId}"`) && compiled.svg.includes(`data-attention-role="${region.attentionRole}"`), `${region.nodeId} svg role`);
  }
  const presentation = compiled.manifest.delivery.presentation;
  assert.equal(presentation.visualLanguage, 'vp-1');
  assert.equal(presentation.hierarchyChannel, 'attentionRole');
  assert.deepEqual(presentation.hierarchyOrder, [...ROLE_NAMES]);
  assert.equal(presentation.hierarchyDegradation, 'none');
  assert.deepEqual(presentation.surfaces, regions.map((region) => ({ surfaceId: region.nodeId, attentionRole: region.attentionRole, regionSpan: region.span })));
});

// ---------------------------------------------------------------- VP-4 span collapse keeps hierarchy

test('VP-4 responsive collapse flattens span geometry while the role ladder stays intact', () => {
  const compiled = saas();
  const css = styleBlock(compiled);
  for (const bp of ['900', '620']) {
    const start = css.indexOf(`@media(max-width:${bp}px){`);
    assert.notEqual(start, -1, `media block for ${bp}px missing`);
    const next = css.indexOf('@media', start + 8);
    const block = css.slice(start, next === -1 ? css.length : next);
    if (bp === '900') assert.match(block, /\.semantic-grid,\.semantic-grid--hero_support,\.semantic-grid--asymmetric\{grid-template-columns:1fr\}/, 'span geometry must collapse from 900px down');
    else assert.doesNotMatch(block, /\.semantic-grid[^{]*\{[^}]*grid-template-columns:(?!1fr)/, 'the narrowest block must not restore multi-column page spans');
    const rules = [...block.matchAll(ROLE_RULE_RE)].map(([, role, text]) => [role, text]);
    assert.equal(rules.length, 4, `role ladder must be re-declared inside the ${bp}px block`);
    const ladder = toNumberLadder(Object.fromEntries(rules), LADDER_FIELDS);
    assert.deepEqual(hierarchyViolations(ladder, LADDER_FIELDS), [], `total order broken inside ${bp}px media block`);
  }
  // the role classes stay attached to markup; geometry collapse never moves roles
  assert.equal((compiled.html.match(/<section class="[^"]*semantic-card--role-/g) ?? []).length, 5, 'every delivered region keeps its role class in markup');
  // min-content of a long grounded value must never widen the page past the viewport
  assert.match(css, /\.semantic-grid>\*\{min-width:0\}/, 'grid items may shrink below min-content');
  assert.match(css, /\.semantic-card li\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/, 'label track may shrink; value track stays content-sized');
  for (const section of compiled.html.matchAll(/<section[^>]*>/g)) {
    if (section[0].includes('style="grid-column:1/-1"')) {
      assert.match(section[0], /data-attention-role="anchor"/, 'only the anchor may hold a full-row span');
    }
  }
});

// ---------------------------------------------------------------- VP-5 silent flattening fails

test('VP-5 a ladder that silently equates two roles is detected as degradation', () => {
  const compiled = saas();
  const ladders = htmlRoleLadders(styleBlock(compiled));
  const healthy = toNumberLadder(ladders.wide, LADDER_FIELDS);
  assert.deepEqual(hierarchyViolations(healthy, LADDER_FIELDS), []);
  const flattened = structuredClone(healthy);
  flattened.primary = { ...flattened.anchor };
  assert.ok(hierarchyViolations(flattened, LADDER_FIELDS).length > 0, 'primary==anchor must register as degradation');
  const dropped = structuredClone(healthy);
  dropped.detail = { ...dropped.supporting };
  assert.ok(hierarchyViolations(dropped, LADDER_FIELDS).length > 0, 'detail==supporting must register as degradation');
  // no delivered artifact currently declares degradation
  assert.equal(compiled.manifest.delivery.presentation.hierarchyDegradation, 'none');
  for (const compiled2 of [workforce(), capacity()]) {
    assert.equal(compiled2.manifest.delivery.presentation.hierarchyDegradation, 'none');
  }
});

// ---------------------------------------------------------------- VP-6 detail stays reachable

test('VP-6 the detail tier is compacted in prominence, never dropped from delivered bytes', () => {
  const compiled = saas();
  const slice = htmlRegionSlice(compiled.html, 'expansion_detail');
  for (const text of ['Renewal motion detail', 'Renewals closed', '148', 'Seats added on renewal', '912', 'Seats reduced on renewal', '64']) {
    assert.ok(slice.includes(text), `detail region missing grounded copy: ${text}`);
  }
  assert.doesNotMatch(slice, /display:\s*none|hidden/, 'detail region must not be hidden');
  const visible = visibleTextOf({ svg: compiled.svg });
  for (const text of ['Renewals closed', 'Seats added on renewal', 'Seats reduced on renewal']) {
    assert.ok(visible.includes(text), `svg detail missing: ${text}`);
  }
  const detailNode = compiled.manifest.delivery.nodes.find((node) => node.id === 'expansion_detail');
  assert.equal(detailNode.attentionRole, 'detail');
  assert.equal(detailNode.expectedItemCount, 3);
});

// ---------------------------------------------------------------- VP-7 no invented encodings

test('VP-7a polish delivers no encoding the router did not declare', () => {
  for (const compiled of [saas(), workforce(), capacity()]) {
    assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
    assert.doesNotMatch(compiled.html, /data-visual-mark="sparkline"/, 'sparkline may not be invented by polish');
    assert.doesNotMatch(compiled.html, /<polygon|data-visual-mark="radar"/, 'radar may not appear without a passing Profile Test');
    assert.doesNotMatch(compiled.svg, /<polygon|data-visual-mark="radar"/);
    assert.doesNotMatch(compiled.html, /class="[^"]*trend-plot--compact/, 'compact sparkline styling is consumed only from a router-declared compact layout');
    for (const node of compiled.manifest.delivery.nodes) {
      assert.ok(node.visualSpec, `${node.id} must carry the internal visual spec`);
      const allowed = ['line', 'value', 'bar', 'paired_bar', 'gap_bar', 'list', 'detail_list', 'metric_tile', 'radar'];
      assert.ok(allowed.includes(node.visualSpec.mark), `unexpected mark ${node.visualSpec.mark}`);
      assert.notEqual(node.visualSpec.mark, 'radar');
    }
  }
  const trendSpec = saas().manifest.delivery.nodes.find((node) => node.id === 'arr_trend').visualSpec;
  assert.equal(trendSpec.mark, 'line');
  assert.equal(trendSpec.presentation, 'full_chart');
});

test('VP-7b anchor styling may not borrow strength from a missing encoding', () => {
  const compiled = workforce();
  const anchorRegion = htmlRegionSlice(compiled.html, 'workforce_kpis');
  assert.match(anchorRegion, /data-visual-mark="metric_tile"/);
  assert.doesNotMatch(anchorRegion, /<svg[^>]*class="[^"]*trend-plot/, 'no chart materialized inside the anchor by polish');
  assert.doesNotMatch(anchorRegion, /data-visual-mark="(line|bar|paired_bar|gap_bar)"/, 'anchor keeps only the marks the router granted');
});

test('VP-7c polish may style a router-declared sparkline when one is delivered', {
  skip: 'no fixture routes sparkline today; the consumption branch in htmlTrend was governance-blocked this round — recorded in the STOP report as an ownership-boundary gap'
}, () => {});

// ---------------------------------------------------------------- VP-8 neutral delta rendering

test('VP-8 grounded PY context stays directional-neutral: no success/failure semantic colors or classes', () => {
  const semanticColors = [/#2a987a/i, /#cf6b73/i, /#ce7474/i, /\bgreen\b/i, /\bred\b/i];
  for (const compiled of [saas(), workforce(), capacity(), ceoMonitor()]) {
    assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
    for (const channel of [compiled.html, compiled.svg]) {
      for (const pattern of semanticColors) {
        assert.doesNotMatch(channel, pattern, 'status-bearing color must not return to the delivered bytes');
      }
      assert.doesNotMatch(channel, /class="[^"]*\b(success|failure|positive|negative|danger|good|bad)\b[^"]*"/i);
    }
    const visible = visibleTextOf({ html: compiled.html, svg: compiled.svg });
    assert.doesNotMatch(visible, /\b(improved|declined|better|worse|healthy|favorable|unfavorable)\b/i, 'delta copy must not acquire evaluative status');
  }
});

// ---------------------------------------------------------------- VP-9 same language, different composition

test('VP-9 identical presentation CSS across four domains, yet the copy-blind compositions stay distinct', () => {
  const artifacts = { workforce: workforce(), capacity: capacity(), saas: saas(), ceo: ceoMonitor() };
  const styles = Object.entries(artifacts).map(([name, compiled]) => {
    assert.equal(compiled.result.valid, true, `${name}: ${JSON.stringify(compiled.result.errors)}`);
    return [name, styleBlock(compiled)];
  });
  for (const [name, css] of styles) {
    assert.equal(css, styles[0][1], `${name} must ship the exact same visual language bytes`);
  }
  const skeletons = Object.fromEntries(Object.entries(artifacts).map(([name, compiled]) => [name, blackoutSkeleton(extractCompositionSignature({ html: compiled.html, svg: compiled.svg }))]));
  const names = Object.keys(skeletons);
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      assert.notEqual(skeletons[names[i]], skeletons[names[j]], `${names[i]} and ${names[j]} share one visual language but must not share one composition`);
    }
  }
  // the silhouette itself carries no copy
  for (const skeleton of Object.values(skeletons)) {
    assert.doesNotMatch(skeleton, /revenue|headcount|budget|margin|target|gap/i);
  }
});
