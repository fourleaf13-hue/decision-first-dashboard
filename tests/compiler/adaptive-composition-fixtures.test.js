import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { verifyDeliveredArtifact } from '../../skills/decision-first-dashboard/scripts/composition.js';
import { VISUAL_SPEC_REGISTRY } from '../../skills/decision-first-dashboard/scripts/visual-grammar.js';
import { requiredRelationshipPaths } from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';

const fixtureDir = fileURLToPath(new URL('./fixtures/adaptive-composition/', import.meta.url));
const worthiness = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./fixtures/worthiness/dashboard.worthiness.json', import.meta.url)), 'utf8'));

function pointer(parts) {
  return `/${parts.join('/')}`;
}

function makeGroundedFixture(fileName, nodeSelections) {
  const bytes = fs.readFileSync(path.join(fixtureDir, fileName));
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
    decision: { status: 'confirmed', value: 'Choose the next operating focus' },
    action: { status: 'confirmed', value: 'Review the evidence before allocating the next action' }
  };
  const routing = {
    decision: brief.decision.value,
    action: brief.action.value,
    inventoryCount: decisionState.signals.length,
    metrics: decisionState.signals.map((signal) => ({ metric: signal.metric, role: 'primary_signal', changesDecision: true, decisionImpact: `${signal.label} informs the operating focus`, visibility: 'first_view' })),
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

test('Bakery regression preserves seasonality, demand drivers, and both ends of ROI through the delivered artifact', () => {
  const nodes = [
    { id: 'annual_orders', type: 'Trend', presentation: 'full_chart' },
    { id: 'monthly_orders', type: 'Distribution', presentation: 'full_chart' },
    { id: 'demand_drivers', type: 'Ranking', presentation: 'full_ranking' },
    { id: 'product_roi', type: 'Ranking', presentation: 'both_ends' }
  ];
  const fixture = makeGroundedFixture('bakery.source.json', nodes);
  fixture.brief.contextRequirements = [
    { id: 'ctx_annual_relative', type: 'relative_comparison', subject: 'annual_orders', minimumCoverage: 'current_plus_reference', status: 'inferred' },
    { id: 'ctx_annual_temporal', type: 'temporal_reference', subject: 'annual_orders', minimumCoverage: 'current_plus_reference', status: 'inferred' },
    { id: 'ctx_monthly_distribution', type: 'distribution_shape', subject: 'monthly_orders', minimumCoverage: 'full_distribution', status: 'inferred' },
    { id: 'ctx_product_ranking', type: 'ranking_span', subject: 'product_roi', minimumCoverage: 'both_ends', status: 'inferred' }
  ];

  const compiled = compileDecisionDashboard(worthiness, fixture.brief, fixture.routing, fixture.bundle, { baseDir: fixtureDir });
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  assert.match(compiled.html, /Seasonal order volume/);
  assert.match(compiled.svg, /data-semantic-node="monthly_orders"[^>]*data-presentation="full_chart"[^>]*data-coverage="distribution_shape"/);
  assert.match(compiled.html, /Sugar Cookies/);
  assert.match(compiled.html, /Salted Caramel Chocolate/);
  assert.doesNotMatch(compiled.html, /DETERIORATING|IMPROVING|MIXED/);
  for (const artifact of [compiled.html, compiled.svg]) {
    assert.equal((artifact.match(/data-semantic-node="monthly_orders" data-semantic-item="true"/g) ?? []).length, 12);
    assert.match(artifact, /data-semantic-node="monthly_orders"[^>]*data-structure="ordered-distribution"/);
  }
  assert.equal(compiled.manifest.delivery.coverage.missing.length, 0);
  assert.equal(compiled.manifest.delivery.nodes.find((node) => node.id === 'monthly_orders').expectedItemCount, 12);
  assert.ok(compiled.manifest.delivery.claims.length > 0);
  assert.equal(compiled.manifest.verification.status, 'passed');
  assert.equal(verifyDeliveredArtifact({ html: compiled.html, svg: compiled.svg, manifest: compiled.manifest }).valid, true);
});

test('CEO Sales uses the same grammar and renderer while selecting only the required target-gap nodes', () => {
  const nodes = [
    { id: 'revenue_target', type: 'Relationship', presentation: 'full_chart' },
    { id: 'gap_attribution', type: 'Breakdown', presentation: 'full_breakdown' },
    { id: 'top_accounts', type: 'Ranking', presentation: 'both_ends' }
  ];
  const fixture = makeGroundedFixture('ceo-sales.source.json', nodes);
  fixture.brief.contextRequirements = [
    { id: 'ctx_revenue_target', type: 'target_reference', subject: 'revenue_target', minimumCoverage: 'target_and_gap', status: 'inferred' },
    { id: 'ctx_gap_attribution', type: 'gap_attribution', subject: 'gap_attribution', minimumCoverage: 'full_breakdown', status: 'inferred' },
    { id: 'ctx_top_accounts', type: 'contributor_comparison', subject: 'top_accounts', minimumCoverage: 'contributors', status: 'inferred' }
  ];

  const compiled = compileDecisionDashboard(worthiness, fixture.brief, fixture.routing, fixture.bundle, { baseDir: fixtureDir });
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  assert.match(compiled.html, /Revenue against annual target/);
  assert.match(compiled.svg, /data-semantic-node="gap_attribution"[^>]*data-presentation="full_breakdown"[^>]*data-coverage="decomposition gap_attribution"/);
  for (const artifact of [compiled.html, compiled.svg]) {
    assert.match(artifact, /data-semantic-node="revenue_target"[^>]*data-structure="target-gap"/);
    assert.equal((artifact.match(/data-semantic-node="revenue_target" data-semantic-item="true"/g) ?? []).length, 3);
  }
  assert.equal(compiled.manifest.delivery.nodes.length, 3);
  assert.equal(compiled.manifest.verification.status, 'passed');
  assert.equal(verifyDeliveredArtifact({ html: compiled.html, svg: compiled.svg, manifest: compiled.manifest }).valid, true);
});

test('Bakery and CEO Sales deliver through the shared visual grammar without inventing a radar', () => {
  const cases = [
    {
      fileName: 'bakery.source.json',
      nodes: [
        { id: 'annual_orders', type: 'Trend', presentation: 'full_chart' },
        { id: 'monthly_orders', type: 'Distribution', presentation: 'full_chart' },
        { id: 'demand_drivers', type: 'Ranking', presentation: 'full_ranking' },
        { id: 'product_roi', type: 'Ranking', presentation: 'both_ends' }
      ],
      contextRequirements: [
        { id: 'ctx_annual_relative', type: 'relative_comparison', subject: 'annual_orders', minimumCoverage: 'current_plus_reference', status: 'inferred' },
        { id: 'ctx_annual_temporal', type: 'temporal_reference', subject: 'annual_orders', minimumCoverage: 'current_plus_reference', status: 'inferred' },
        { id: 'ctx_monthly_distribution', type: 'distribution_shape', subject: 'monthly_orders', minimumCoverage: 'full_distribution', status: 'inferred' },
        { id: 'ctx_product_ranking', type: 'ranking_span', subject: 'product_roi', minimumCoverage: 'both_ends', status: 'inferred' }
      ]
    },
    {
      fileName: 'ceo-sales.source.json',
      nodes: [
        { id: 'revenue_target', type: 'Relationship', presentation: 'full_chart' },
        { id: 'gap_attribution', type: 'Breakdown', presentation: 'full_breakdown' },
        { id: 'top_accounts', type: 'Ranking', presentation: 'both_ends' }
      ],
      contextRequirements: [
        { id: 'ctx_revenue_target', type: 'target_reference', subject: 'revenue_target', minimumCoverage: 'target_and_gap', status: 'inferred' },
        { id: 'ctx_gap_attribution', type: 'gap_attribution', subject: 'gap_attribution', minimumCoverage: 'full_breakdown', status: 'inferred' },
        { id: 'ctx_top_accounts', type: 'contributor_comparison', subject: 'top_accounts', minimumCoverage: 'contributors', status: 'inferred' }
      ]
    }
  ];

  for (const testCase of cases) {
    const fixture = makeGroundedFixture(testCase.fileName, testCase.nodes);
    fixture.brief.contextRequirements = testCase.contextRequirements;
    const compiled = compileDecisionDashboard(worthiness, fixture.brief, fixture.routing, fixture.bundle, { baseDir: fixtureDir });
    assert.equal(compiled.result.valid, true, `${testCase.fileName}: ${JSON.stringify(compiled.result.errors)}`);

    assert.ok(compiled.manifest.delivery.nodes.length > 0, `${testCase.fileName}: expected delivered nodes`);
    for (const node of compiled.manifest.delivery.nodes) {
      const spec = node.visualSpec;
      assert.ok(spec, `${testCase.fileName}: ${node.id} must carry a visual spec`);
      const config = VISUAL_SPEC_REGISTRY[node.type]?.[node.presentation];
      assert.ok(config, `${testCase.fileName}: ${node.type}/${node.presentation} must exist in the shared registry`);
      assert.equal(spec.mark, config.mark, `${testCase.fileName}: ${node.id} mark must come from the shared registry`);
      assert.equal(spec.structure, config.structure, `${testCase.fileName}: ${node.id} structure must come from the shared registry`);
      for (const artifact of [compiled.html, compiled.svg]) {
        assert.match(artifact, new RegExp(`data-semantic-node="${node.id}"[^>]*data-visual-mark="${config.mark}"`));
      }
    }

    assert.doesNotMatch(compiled.html, /data-visual-mark="radar"|<polygon/, `${testCase.fileName}: HTML must not invent a radar`);
    assert.doesNotMatch(compiled.svg, /data-visual-mark="radar"|<polygon/, `${testCase.fileName}: SVG must not invent a radar`);
    assert.equal(verifyDeliveredArtifact({ html: compiled.html, svg: compiled.svg, manifest: compiled.manifest }).valid, true);
  }
});
