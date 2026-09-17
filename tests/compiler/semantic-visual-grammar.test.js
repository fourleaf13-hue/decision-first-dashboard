import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { composeAdaptiveComposition, verifyDeliveredArtifact } from '../../skills/decision-first-dashboard/scripts/composition.js';

const worthiness = JSON.parse(fs.readFileSync(new URL('./fixtures/worthiness/dashboard.worthiness.json', import.meta.url), 'utf8'));

function visualState() {
  return {
    mode: 'no_score',
    signals: [
      { metric: 'orders', label: 'Orders', value: '218', provenance: 'source' },
      { metric: 'products', label: 'Products', value: '36', provenance: 'source' },
      { metric: 'repeat_rate', label: 'Repeat rate', value: '77%', provenance: 'source' }
    ],
    semanticNodes: [
      {
        id: 'annual_orders',
        type: 'Trend',
        title: 'Orders across years',
        items: [
          { label: '2022', value: 5, provenance: 'source' },
          { label: '2023', value: 19, provenance: 'source' },
          { label: '2024', value: 79, provenance: 'source' },
          { label: '2025', value: 72, provenance: 'source' },
          { label: '2026', value: 43, provenance: 'source' }
        ]
      },
      {
        id: 'monthly_orders',
        type: 'Distribution',
        title: 'Seasonal order volume',
        items: [
          { label: 'Jan', value: 6, provenance: 'source' },
          { label: 'Feb', value: 18, provenance: 'source' },
          { label: 'Mar', value: 23, provenance: 'source' },
          { label: 'Apr', value: 11, provenance: 'source' }
        ]
      },
      {
        id: 'demand_drivers',
        type: 'Ranking',
        title: 'Demand drivers',
        items: [
          { label: 'Holiday / Seasonal', value: 37, provenance: 'source' },
          { label: 'No Theme', value: 34, provenance: 'source' },
          { label: 'Miscellaneous', value: 28, provenance: 'source' }
        ]
      },
      {
        id: 'product_roi',
        type: 'Ranking',
        title: 'Highest and lowest ROI products',
        comparability: {
          unit: 'percent',
          comparisonGroup: 'product_roi',
          comparabilityDomain: 'roi',
          normalization: 'raw'
        },
        items: [
          { label: 'Sugar Cookies', value: '1109%', provenance: 'source' },
          { label: 'Salted Caramel Chocolate', value: '104%', provenance: 'source' },
          { label: 'Cinnamon Rolls', value: '108%', provenance: 'source' }
        ]
      },
      {
        id: 'operating_metrics',
        type: 'MetricCluster',
        title: 'Operating metrics',
        items: [
          { label: 'Orders', value: '218', provenance: 'source' },
          { label: 'Products', value: '36', provenance: 'source' },
          { label: 'Repeat rate', value: '77%', provenance: 'source' }
        ]
      }
    ]
  };
}

function makeBundle(state) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-visual-grammar-'));
  const sourceValue = {
    signals: state.signals.map(({ label, value }) => ({ label, value })),
    semanticNodes: state.semanticNodes.map((node) => ({
      title: node.title,
      items: node.items.map(({ label, value }) => ({ label, value }))
    }))
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

function compileVisualFixture() {
  const state = visualState();
  const selections = state.semanticNodes.map(({ id, type, comparability }) => ({
    id,
    type,
    presentation: id === 'annual_orders' || id === 'monthly_orders'
      ? 'full_chart'
      : id === 'demand_drivers'
        ? 'full_ranking'
        : id === 'product_roi'
          ? 'both_ends'
          : 'comparison',
    ...(comparability ? { comparability } : {})
  }));
  const fixture = makeBundle(state);
  const brief = {
    decision: { status: 'confirmed', value: 'Choose the next operating focus' },
    action: { status: 'confirmed', value: 'Prioritize the next operating action' },
    contextRequirements: [
      { id: 'ctx_annual_temporal', type: 'temporal_reference', subject: 'annual_orders', minimumCoverage: 'current_plus_reference', status: 'inferred' },
      { id: 'ctx_monthly_distribution', type: 'distribution_shape', subject: 'monthly_orders', minimumCoverage: 'full_distribution', status: 'inferred' },
      { id: 'ctx_product_ranking', type: 'ranking_span', subject: 'product_roi', minimumCoverage: 'both_ends', status: 'inferred' }
    ]
  };
  const routing = {
    decision: brief.decision.value,
    action: brief.action.value,
    inventoryCount: state.signals.length,
    metrics: state.signals.map((signal) => ({
      metric: signal.metric,
      role: 'primary_signal',
      changesDecision: true,
      decisionImpact: `${signal.label} changes the next operating action`,
      visibility: 'first_view'
    })),
    compositionNodes: selections
  };
  return compileDecisionDashboard(worthiness, brief, routing, fixture.bundle, { baseDir: fixture.root });
}

test('final semantic artifacts use structurally distinct visuals for each semantic presentation', () => {
  const compiled = compileVisualFixture();
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  assert.ok(compiled.manifest.delivery.nodes.every((node) => node.visualSpec), 'delivery manifest must carry the internal visual spec');

  for (const artifact of [compiled.html, compiled.svg]) {
    assert.match(artifact, /data-semantic-node="annual_orders"[^>]*data-visual-mark="line"/);
    assert.match(artifact, /data-visual-geometry="trajectory"/);
    assert.match(artifact, /data-semantic-node="monthly_orders"[^>]*data-visual-mark="bar"/);
    assert.match(artifact, /data-visual-geometry="distribution-bars"/);
    assert.match(artifact, /data-semantic-node="demand_drivers"[^>]*data-visual-mark="bar"/);
    assert.match(artifact, /data-visual-geometry="ranking-bars"/);
    assert.match(artifact, /data-semantic-node="product_roi"[^>]*data-visual-mark="paired_bar"/);
    assert.match(artifact, /data-ranking-end="high"/);
    assert.match(artifact, /data-ranking-end="low"/);
    assert.match(artifact, /data-semantic-node="operating_metrics"[^>]*data-visual-mark="metric_tile"/);
    assert.match(artifact, /data-visual-geometry="metric-tiles"/);
  }

  assert.match(compiled.html, /class="visual-plot visual-plot--trend"/);
  assert.match(compiled.html, /class="paired-ranking"/);
  assert.match(compiled.svg, /<polyline[^>]*data-visual-geometry="trajectory"/);
  assert.match(compiled.svg, /<rect[^>]*data-visual-mark-item="bar"/);
  assert.equal(verifyDeliveredArtifact({ html: compiled.html, svg: compiled.svg, manifest: compiled.manifest }).valid, true);
});

test('same-unit but semantically different profile dimensions cannot become a radar', () => {
  const result = composeAdaptiveComposition({
    nodes: [{
      id: 'profile',
      type: 'MetricCluster',
      dimensions: [
        { metric: 'growth', unit: 'percent', value: 80, normalizedScore: 80, comparisonGroup: 'growth', comparabilityDomain: 'growth' },
        { metric: 'margin', unit: 'percent', value: 70, normalizedScore: 70, comparisonGroup: 'margin', comparabilityDomain: 'margin' },
        { metric: 'retention', unit: 'percent', value: 60, normalizedScore: 60, comparisonGroup: 'retention', comparabilityDomain: 'retention' }
      ],
      profile: { purpose: 'profile', sharedScale: true, comparable: true }
    }]
  });

  assert.equal(result.valid, true);
  assert.equal(result.composition.nodes[0].presentation, 'comparison');
  assert.equal(result.composition.nodes[0].profileTest.pass, false);
});

test('comparability and layout eligibility expose stable attribution instead of free-form explanations', async () => {
  const {
    buildInternalVisualSpecs,
    evaluateComparability,
    layoutEligibilityFor
  } = await import('../../skills/decision-first-dashboard/scripts/visual-grammar.js');

  const mismatch = evaluateComparability([
    { unit: 'percent', comparisonGroup: 'roi', comparabilityDomain: 'roi', normalization: 'raw' },
    { unit: 'percent', comparisonGroup: 'roi', comparabilityDomain: 'growth', normalization: 'raw' }
  ]);
  assert.equal(mismatch.pass, false);
  assert.equal(mismatch.reasonCode, 'COMPARABILITY_DOMAIN_MISMATCH');

  const legal = evaluateComparability([
    { unit: 'percent', comparisonGroup: 'roi', comparabilityDomain: 'roi', normalization: 'raw' },
    { unit: 'percent', comparisonGroup: 'roi', comparabilityDomain: 'roi', normalization: 'raw' }
  ]);
  assert.equal(legal.pass, true);

  const paired = layoutEligibilityFor({
    id: 'product_roi',
    type: 'Ranking',
    presentation: 'both_ends',
    items: [{ label: 'High', value: '1109%' }, { label: 'Low', value: '104%' }],
    comparability: { unit: 'percent', comparisonGroup: 'roi', comparabilityDomain: 'roi', normalization: 'raw' }
  }, { contextRequirements: [], modifiers: { activeModifierIds: [] } });
  assert.equal(paired.valid, true);
  assert.equal(paired.layout.pattern, 'paired');
  assert.equal(typeof paired.layout.reasonCode, 'string');
  assert.ok(paired.layout.modifierRef || paired.layout.requirementRef || paired.layout.evidenceRefs?.length);

  const specs = buildInternalVisualSpecs({ semanticNodes: [{
    id: 'product_roi',
    type: 'Ranking',
    title: 'ROI',
    items: [{ label: 'High', value: '1109%', provenance: 'source' }, { label: 'Low', value: '104%', provenance: 'source' }]
  }] }, { nodes: [{
    id: 'product_roi',
    type: 'Ranking',
    presentation: 'both_ends',
    comparability: { unit: 'percent', comparisonGroup: 'roi', comparabilityDomain: 'roi', normalization: 'raw' }
  }] }, { contextRequirements: [], modifiers: { activeModifierIds: [] } });
  assert.equal(specs.valid, true, JSON.stringify(specs.errors));
  assert.equal(specs.specs[0].mark, 'paired_bar');
  assert.equal(specs.specs[0].layout.pattern, 'paired');
});

test('delivered verifier rejects visual-spec marker drift in the final artifact', () => {
  const compiled = compileVisualFixture();
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  const mutatedHtml = compiled.html.replace('data-visual-mark="line"', 'data-visual-mark="bar"');
  const result = verifyDeliveredArtifact({ html: mutatedHtml, svg: compiled.svg, manifest: compiled.manifest });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'DELIVERED_VISUAL_SPEC_MISMATCH'));
});
