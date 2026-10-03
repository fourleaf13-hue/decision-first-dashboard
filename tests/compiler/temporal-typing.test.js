import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { requiredRelationshipPaths } from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';

// RDT-TS-1 TEMPORAL_STRUCTURE_LOSS regression.
// Reddit run bb1bfad6 reduced to its minimal shape: one MONTHS axis, two
// 12-point series. monthly_revenue_trend was typed Trend while
// monthly_orders_series — the identical structure — was typed Distribution and
// silently rendered as 12 tiles. Every downstream stage executed the declared
// type faithfully, so the only place this can be caught is the semantic
// typing boundary, upstream of composition and the renderer.
const worthiness = JSON.parse(fs.readFileSync(new URL('./fixtures/worthiness/dashboard.worthiness.json', import.meta.url), 'utf8'));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REVENUE = [31, 34, 39, 41, 45, 48, 47, 51, 55, 58, 62, 66];
const ORDERS = [212, 248, 301, 275, 318, 342, 331, 356, 389, 402, 447, 498];

function monthsState({ ordersType = 'Distribution', ordersAxis = null } = {}) {
  return {
    mode: 'no_score',
    signals: [
      { metric: 'orders', label: 'Orders', value: '4,119', provenance: 'source' },
      { metric: 'revenue', label: 'Revenue', value: '$577k', provenance: 'source' },
      { metric: 'aov', label: 'Average order value', value: '$140', provenance: 'source' }
    ],
    semanticNodes: [
      {
        id: 'monthly_revenue_trend',
        type: 'Trend',
        title: 'Monthly revenue',
        items: MONTHS.map((label, index) => ({ label, value: REVENUE[index], provenance: 'source' }))
      },
      {
        id: 'monthly_orders_series',
        type: ordersType,
        title: 'Monthly orders',
        ...(ordersAxis ? { axis: ordersAxis } : {}),
        items: MONTHS.map((label, index) => ({ label, value: ORDERS[index], provenance: 'source' }))
      }
    ],
    relationships: []
  };
}

function weekdayState() {
  return {
    mode: 'no_score',
    signals: [
      { metric: 'orders', label: 'Orders', value: '1,922', provenance: 'source' },
      { metric: 'revenue', label: 'Revenue', value: '$268k', provenance: 'source' },
      { metric: 'aov', label: 'Average order value', value: '$139', provenance: 'source' }
    ],
    semanticNodes: [
      {
        id: 'orders_by_weekday',
        type: 'Distribution',
        title: 'Orders by day of week',
        items: [
          { label: 'Mon', value: 312, provenance: 'source' },
          { label: 'Tue', value: 288, provenance: 'source' },
          { label: 'Wed', value: 301, provenance: 'source' },
          { label: 'Thu', value: 296, provenance: 'source' },
          { label: 'Fri', value: 334, provenance: 'source' },
          { label: 'Sat', value: 204, provenance: 'source' },
          { label: 'Sun', value: 187, provenance: 'source' }
        ]
      },
      {
        id: 'latency_distribution',
        type: 'Distribution',
        title: 'Response time distribution',
        items: [
          { label: 'p50', value: 24, provenance: 'source' },
          { label: 'p75', value: 39, provenance: 'source' },
          { label: 'p90', value: 55, provenance: 'source' },
          { label: 'p95', value: 71, provenance: 'source' },
          { label: 'p99', value: 96, provenance: 'source' }
        ]
      }
    ],
    relationships: []
  };
}

function makeBundle(state) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'temporal-typing-'));
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
  const add = (pointer) => {
    const id = `ev_${evidence.length + 1}`;
    evidence.push({ id, anchor: { type: 'json_pointer', pointer } });
    claims.push({ decisionPath: pointer, evidenceRef: id });
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
    bundle: {
      source: { kind: 'json', path: 'source.json', sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
      decisionState: state,
      evidence,
      claims
    }
  };
}

function monthsBrief({ ordersRequirementType = 'distribution_shape' } = {}) {
  return {
    title: 'Operating review',
    subtitle: 'Current state for the recurring operating review.',
    decision: { status: 'confirmed', value: 'Choose the next operating focus' },
    action: { status: 'confirmed', value: 'Prioritize the next operating action' },
    questionShape: { status: 'confirmed', value: 'state' },
    actionShape: { status: 'confirmed', value: 'observe' },
    contextRequirements: [
      { id: 'ctx_revenue_temporal', type: 'temporal_reference', subject: 'monthly_revenue_trend', minimumCoverage: 'current_plus_reference', status: 'inferred' },
      { id: 'ctx_orders_shape', type: ordersRequirementType, subject: 'monthly_orders_series', minimumCoverage: ordersRequirementType === 'distribution_shape' ? 'full_distribution' : 'current_plus_reference', status: 'inferred' }
    ]
  };
}

function weekdayBrief() {
  return {
    title: 'Operating review',
    subtitle: 'Current state for the recurring operating review.',
    decision: { status: 'confirmed', value: 'Choose the next operating focus' },
    action: { status: 'confirmed', value: 'Prioritize the next operating action' },
    questionShape: { status: 'confirmed', value: 'state' },
    actionShape: { status: 'confirmed', value: 'observe' },
    contextRequirements: [
      { id: 'ctx_weekday_shape', type: 'distribution_shape', subject: 'orders_by_weekday', minimumCoverage: 'full_distribution', status: 'inferred' },
      { id: 'ctx_latency_shape', type: 'distribution_shape', subject: 'latency_distribution', minimumCoverage: 'full_distribution', status: 'inferred' }
    ]
  };
}

function routingFor(state, selections) {
  return {
    decision: 'Choose the next operating focus',
    action: 'Prioritize the next operating action',
    inventoryCount: state.signals.length,
    metrics: state.signals.map((signal) => ({
      metric: signal.metric,
      role: 'primary_signal',
      changesDecision: true,
      decisionImpact: `${signal.label} changes the next operating focus`,
      visibility: 'first_view'
    })),
    compositionNodes: selections
  };
}

function compileMonths({ ordersType = 'Distribution', ordersAxis = null, ordersRequirementType = 'distribution_shape' } = {}) {
  const state = monthsState({ ordersType, ordersAxis });
  const fixture = makeBundle(state);
  const brief = monthsBrief({ ordersRequirementType });
  const routing = routingFor(state, [
    { id: 'monthly_revenue_trend', type: 'Trend', presentation: 'full_chart' },
    { id: 'monthly_orders_series', type: ordersType, presentation: 'full_chart' }
  ]);
  return compileDecisionDashboard(worthiness, brief, routing, fixture.bundle, { baseDir: fixture.root });
}

test('RDT-TS-1: month-indexed series typed Distribution must stop for typing instead of silently compiling', () => {
  const compiled = compileMonths();

  assert.equal(compiled.result.valid, false, 'the Reddit bb1bfad6 shape silently compiled: temporal structure loss is not caught before delivery');
  assert.equal(compiled.result.transition, 'ASK_SEMANTIC_TYPING');
  assert.equal(compiled.svg, null);
  assert.equal(compiled.html, null);
  assert.equal(compiled.manifest, null);
});

test('RDT-TS-1 control: both month-indexed series typed Trend deliver line trajectories', () => {
  const compiled = compileMonths({ ordersType: 'Trend', ordersRequirementType: 'temporal_reference' });

  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  for (const node of compiled.manifest.delivery.nodes) {
    assert.equal(node.visualSpec.mark, 'line', `${node.id} must encode as a line trajectory`);
  }

  for (const artifact of [compiled.html, compiled.svg]) {
    assert.match(artifact, /data-semantic-node="monthly_revenue_trend"[^>]*data-visual-mark="line"/);
    assert.match(artifact, /data-semantic-node="monthly_orders_series"[^>]*data-visual-mark="line"/);
    assert.match(artifact, /data-semantic-node="monthly_revenue_trend"[^>]*data-structure="ordered-trajectory"/);
    assert.match(artifact, /data-semantic-node="monthly_orders_series"[^>]*data-structure="ordered-trajectory"/);
    assert.match(artifact, /data-visual-geometry="trajectory"/);
  }
  assert.match(compiled.svg, /<polyline[^>]*data-visual-geometry="trajectory"/);
  assert.doesNotMatch(compiled.html, /data-semantic-node="monthly_orders_series"[^>]*data-visual-mark="bar"/);
});

test('RDT-TS-1 strong evidence: temporal_reference bound to a non-Trend node fails closed as a typing error', () => {
  const compiled = compileMonths({ ordersRequirementType: 'temporal_reference' });

  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.transition, 'FIX_SEMANTIC_TYPING');
  assert.ok(
    compiled.result.errors.some((error) => error.code === 'TEMPORAL_SERIES_TYPE_MISMATCH'),
    `expected TEMPORAL_SERIES_TYPE_MISMATCH, got ${JSON.stringify(compiled.result.errors)}`
  );
});

test('RDT-TS-1 strong evidence: declared temporal axis on a non-Trend node fails closed as a typing error', () => {
  const compiled = compileMonths({ ordersAxis: { semantics: 'temporal' } });

  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.transition, 'FIX_SEMANTIC_TYPING');
  assert.ok(
    compiled.result.errors.some((error) => error.code === 'TEMPORAL_SERIES_TYPE_MISMATCH'),
    `expected TEMPORAL_SERIES_TYPE_MISMATCH, got ${JSON.stringify(compiled.result.errors)}`
  );
});

test('RDT-TS-1 false-positive control: day-of-week and percentile distributions compile without a typing stop', () => {
  const state = weekdayState();
  const fixture = makeBundle(state);
  const brief = weekdayBrief();
  const routing = routingFor(state, [
    { id: 'orders_by_weekday', type: 'Distribution', presentation: 'full_chart' },
    { id: 'latency_distribution', type: 'Distribution', presentation: 'full_chart' }
  ]);
  const compiled = compileDecisionDashboard(worthiness, brief, routing, fixture.bundle, { baseDir: fixture.root });

  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  assert.match(compiled.html, /data-semantic-node="orders_by_weekday"[^>]*data-visual-mark="bar"/);
  assert.match(compiled.html, /data-semantic-node="latency_distribution"[^>]*data-visual-mark="bar"/);
});

test('RDT-TS-1 resolution: month-labeled recurring period bins with a declared categorical axis stay a Distribution', () => {
  const compiled = compileMonths({ ordersAxis: { semantics: 'categorical' } });

  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  assert.match(compiled.html, /data-semantic-node="monthly_orders_series"[^>]*data-visual-mark="bar"/);
  assert.match(compiled.html, /data-semantic-node="monthly_orders_series"[^>]*data-structure="ordered-distribution"/);
  assert.match(compiled.html, /data-semantic-node="monthly_revenue_trend"[^>]*data-visual-mark="line"/);
});

