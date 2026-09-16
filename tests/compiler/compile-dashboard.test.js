import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { compileGroundedBundle } from '../../skills/decision-first-dashboard/scripts/compile.js';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const groundingDir = fileURLToPath(new URL('./fixtures/grounding/', import.meta.url));
const routingDir = fileURLToPath(new URL('./fixtures/routing/', import.meta.url));
const worthinessDir = fileURLToPath(new URL('./fixtures/worthiness/', import.meta.url));
const intakeDir = fileURLToPath(new URL('./fixtures/intake/', import.meta.url));
const noScoreBundle = JSON.parse(fs.readFileSync(path.join(groundingDir, 'no-score.grounded.json'), 'utf8'));
const noScoreRouting = JSON.parse(fs.readFileSync(path.join(routingDir, 'no-score.routing.json'), 'utf8'));
const dashboardWorthiness = JSON.parse(fs.readFileSync(path.join(worthinessDir, 'dashboard.worthiness.json'), 'utf8'));
const noScoreBrief = JSON.parse(fs.readFileSync(path.join(intakeDir, 'confirmed.decision-brief.json'), 'utf8'));
const compositeBundle = JSON.parse(fs.readFileSync(path.join(groundingDir, 'composite.grounded.json'), 'utf8'));
const compositeRouting = JSON.parse(fs.readFileSync(path.join(routingDir, 'composite.routing.json'), 'utf8'));
const compositeBrief = JSON.parse(fs.readFileSync(path.join(intakeDir, 'composite-confirmed.decision-brief.json'), 'utf8'));

function semanticBundleForContract() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-contract-'));
  const decisionState = {
    mode: 'no_score',
    signals: [
      { metric: 'orders', label: 'Orders', value: '218', provenance: 'source' },
      { metric: 'products', label: 'Products', value: '36', provenance: 'source' },
      { metric: 'repeat_rate', label: 'Repeat rate', value: '77%', provenance: 'source' }
    ],
    semanticNodes: [{
      id: 'orders_trend',
      type: 'Trend',
      title: 'Orders trend',
      items: [
        { label: 'Current', value: '218', provenance: 'source' },
        { label: 'Reference', value: '190', provenance: 'source' }
      ]
    }]
  };
  const sourceValue = {
    signals: decisionState.signals.map(({ label, value }) => ({ label, value })),
    semanticNodes: decisionState.semanticNodes.map((node) => ({
      title: node.title,
      items: node.items.map(({ label, value }) => ({ label, value }))
    }))
  };
  const evidence = [];
  const claims = [];
  const add = (decisionPath, sourcePath) => {
    const id = `ev_contract_${evidence.length + 1}`;
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
    });
  });
  const bytes = Buffer.from(`${JSON.stringify(sourceValue, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'source.json'), bytes);
  return {
    root,
    bundle: {
      source: { kind: 'json', path: 'source.json', sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
      decisionState,
      evidence,
      claims
    }
  };
}

function briefNameFor(routingName) {
  return routingName.startsWith('composite') ? 'composite-confirmed.decision-brief.json' : 'confirmed.decision-brief.json';
}

function runCli(routingName, bundleName) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-routed-'));
  const script = path.join(root, 'skills/decision-first-dashboard/scripts/compile-dashboard.js');
  const result = spawnSync(process.execPath, [
    script,
    path.join(worthinessDir, 'dashboard.worthiness.json'),
    path.join(intakeDir, briefNameFor(routingName)),
    path.join(routingDir, routingName),
    path.join(groundingDir, bundleName),
    outputDir
  ], { cwd: root, encoding: 'utf8' });
  return { result, outputDir };
}

test('production compile passes worthiness and intake before routing, grounding, and rendering', () => {
  const compiled = compileDecisionDashboard(dashboardWorthiness, noScoreBrief, noScoreRouting, noScoreBundle, { baseDir: groundingDir });
  assert.equal(compiled.result.valid, true);
  assert.equal(compiled.result.transition, 'PASS');
  assert.equal(compiled.result.worthinessSummary.accountabilityMode, 'single_owner');
  assert.equal(compiled.result.intakeSummary.decisionStatus, 'confirmed');
  assert.equal(compiled.result.intakeSummary.actionStatus, 'confirmed');
  assert.equal(compiled.result.routingSummary.inventoryCount, 5);
  assert.equal(compiled.result.routingSummary.primaryCount, 5);
  assert.match(compiled.svg, /data-semantic-node="primary_signals"/);
  assert.match(compiled.html, /data-semantic-node="primary_signals"/);
  assert.match(compiled.html, /decision-first-renderer/);
  assert.match(compiled.svg, /data-structure="metric-comparison"/);
  assert.match(compiled.html, /data-structure="metric-comparison"/);
  assert.doesNotMatch(compiled.svg, /OVERALL DIRECTION|Revenue context|Trend data unavailable/);
  assert.doesNotMatch(compiled.html, /OVERALL DIRECTION|Revenue context|Trend data unavailable/);
});

test('production composite compilation reaches the shared semantic renderer with score context preserved', () => {
  const compiled = compileDecisionDashboard(dashboardWorthiness, compositeBrief, compositeRouting, compositeBundle, { baseDir: groundingDir });

  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  assert.equal(compiled.result.transition, 'PASS');
  assert.equal(compiled.manifest.verification.status, 'passed');
  for (const artifact of [compiled.html, compiled.svg]) {
    assert.match(artifact, /data-semantic-node="score_summary"/);
    assert.match(artifact, /data-semantic-node="score_components"/);
    assert.match(artifact, /data-semantic-node="score_trend"/);
    assert.match(artifact, /data-semantic-node="active_exceptions"/);
    assert.match(artifact, /data-semantic-node="recent_events"/);
    assert.match(artifact, /data-structure="profile-shape"/);
    assert.match(artifact, /data-claim-id="claim_score_band"/);
    assert.match(artifact, /At risk/);
  }
});

test('production compile cannot disable semantic delivery by omitting all semantic inputs', () => {
  const routing = structuredClone(noScoreRouting);
  delete routing.compositionNodes;
  const bundle = structuredClone(noScoreBundle);
  delete bundle.decisionState.semanticNodes;
  const compiled = compileDecisionDashboard(dashboardWorthiness, noScoreBrief, routing, bundle, { baseDir: groundingDir });

  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.stage, 'delivery');
  assert.equal(compiled.result.transition, 'DELIVERY_CONTRACT_FAILED');
  assert.ok(compiled.result.errors.some((error) => error.code === 'SEMANTIC_STATE_REQUIRED'));
  assert.equal(compiled.html, null);
  assert.equal(compiled.svg, null);
});

test('production compile fails closed when semantic state is empty', () => {
  const bundle = structuredClone(noScoreBundle);
  bundle.decisionState.semanticNodes = [];
  const compiled = compileDecisionDashboard(dashboardWorthiness, noScoreBrief, noScoreRouting, bundle, { baseDir: groundingDir });

  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.stage, 'delivery');
  assert.equal(compiled.result.transition, 'DELIVERY_CONTRACT_FAILED');
  assert.ok(compiled.result.errors.some((error) => error.code === 'SEMANTIC_STATE_REQUIRED'));
  assert.equal(compiled.html, null);
  assert.equal(compiled.svg, null);
});

test('production compile fails closed when semantic composition is empty', () => {
  const routing = structuredClone(noScoreRouting);
  routing.compositionNodes = [];
  const compiled = compileDecisionDashboard(dashboardWorthiness, noScoreBrief, routing, noScoreBundle, { baseDir: groundingDir });

  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.stage, 'delivery');
  assert.equal(compiled.result.transition, 'DELIVERY_CONTRACT_FAILED');
  assert.ok(compiled.result.errors.some((error) => error.code === 'SEMANTIC_COMPOSITION_REQUIRED'));
  assert.equal(compiled.html, null);
  assert.equal(compiled.svg, null);
});

test('production semantic compilation fails closed instead of rendering a legacy artifact when semantic state is missing', () => {
  const semanticRouting = {
    ...noScoreRouting,
    compositionNodes: [{ id: 'arr', type: 'Trend', presentation: 'full_chart' }]
  };
  const bundle = structuredClone(noScoreBundle);
  delete bundle.decisionState.semanticNodes;
  const compiled = compileDecisionDashboard(dashboardWorthiness, noScoreBrief, semanticRouting, bundle, { baseDir: groundingDir });

  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.stage, 'delivery');
  assert.equal(compiled.result.transition, 'DELIVERY_CONTRACT_FAILED');
  assert.ok(compiled.result.errors.some((error) => error.code === 'SEMANTIC_STATE_REQUIRED'));
  assert.equal(compiled.html, null);
  assert.equal(compiled.svg, null);
});

test('required semantic compilation fails closed when the semantic composition is missing', () => {
  const { root, bundle } = semanticBundleForContract();
  const compiled = compileGroundedBundle(bundle, { baseDir: root, requireSemantic: true });

  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.stage, 'delivery');
  assert.equal(compiled.result.transition, 'DELIVERY_CONTRACT_FAILED');
  assert.ok(compiled.result.errors.some((error) => error.code === 'SEMANTIC_COMPOSITION_REQUIRED'));
  assert.equal(compiled.html, null);
  assert.equal(compiled.svg, null);
});

test('invalid Metric Router output blocks compilation after intake and before grounding', () => {
  const routing = structuredClone(noScoreRouting);
  routing.metrics[0].changesDecision = false;
  delete routing.metrics[0].decisionImpact;
  const bundle = structuredClone(noScoreBundle);
  bundle.source.sha256 = '0'.repeat(64);
  const compiled = compileDecisionDashboard(dashboardWorthiness, noScoreBrief, routing, bundle, { baseDir: groundingDir });
  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.stage, 'routing');
  assert.equal(compiled.result.transition, 'FIX_METRIC_ROUTING');
  assert.ok(compiled.result.errors.some((error) => error.code === 'ACTION_TRIGGER_REQUIRED'));
  assert.equal(compiled.svg, null);
  assert.equal(compiled.html, null);
});

test('production CLI writes no-score output only after all four gates pass', () => {
  const { result, outputDir } = runCli('no-score.routing.json', 'no-score.grounded.json');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.no-score.svg')), true);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.no-score.html')), true);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.manifest.json')), true);
});

test('production CLI writes composite output only after all four gates pass', () => {
  const { result, outputDir } = runCli('composite.routing.json', 'composite.grounded.json');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.composite.svg')), true);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.composite.html')), true);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.manifest.json')), true);
});
