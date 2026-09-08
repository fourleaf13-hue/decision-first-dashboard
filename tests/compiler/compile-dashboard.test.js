import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const groundingDir = fileURLToPath(new URL('./fixtures/grounding/', import.meta.url));
const routingDir = fileURLToPath(new URL('./fixtures/routing/', import.meta.url));
const worthinessDir = fileURLToPath(new URL('./fixtures/worthiness/', import.meta.url));
const noScoreBundle = JSON.parse(fs.readFileSync(path.join(groundingDir, 'no-score.grounded.json'), 'utf8'));
const noScoreRouting = JSON.parse(fs.readFileSync(path.join(routingDir, 'no-score.routing.json'), 'utf8'));
const dashboardWorthiness = JSON.parse(fs.readFileSync(path.join(worthinessDir, 'dashboard.worthiness.json'), 'utf8'));

function runCli(routingName, bundleName) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-routed-'));
  const script = path.join(root, 'skills/decision-first-dashboard/scripts/compile-dashboard.js');
  const result = spawnSync(process.execPath, [
    script,
    path.join(worthinessDir, 'dashboard.worthiness.json'),
    path.join(routingDir, routingName),
    path.join(groundingDir, bundleName),
    outputDir
  ], { cwd: root, encoding: 'utf8' });
  return { result, outputDir };
}

test('production compile passes worthiness before routing, grounding, and rendering', () => {
  const compiled = compileDecisionDashboard(dashboardWorthiness, noScoreRouting, noScoreBundle, { baseDir: groundingDir });
  assert.equal(compiled.result.valid, true);
  assert.equal(compiled.result.transition, 'PASS');
  assert.equal(compiled.result.worthinessSummary.accountabilityMode, 'single_owner');
  assert.equal(compiled.result.routingSummary.inventoryCount, 5);
  assert.equal(compiled.result.routingSummary.primaryCount, 5);
  assert.match(compiled.svg, /Subscription health/);
  assert.match(compiled.html, /Subscription health/);
});

test('invalid Metric Router output blocks compilation after worthiness and before grounding', () => {
  const routing = structuredClone(noScoreRouting);
  routing.metrics[0].changesDecision = false;
  delete routing.metrics[0].decisionImpact;

  const bundle = structuredClone(noScoreBundle);
  bundle.source.sha256 = '0'.repeat(64);

  const compiled = compileDecisionDashboard(dashboardWorthiness, routing, bundle, { baseDir: groundingDir });
  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.stage, 'routing');
  assert.equal(compiled.result.transition, 'FIX_METRIC_ROUTING');
  assert.ok(compiled.result.errors.some((error) => error.code === 'ACTION_TRIGGER_REQUIRED'));
  assert.equal(compiled.svg, null);
  assert.equal(compiled.html, null);
});

test('production CLI writes no-score output only after all three gates pass', () => {
  const { result, outputDir } = runCli('no-score.routing.json', 'no-score.grounded.json');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.no-score.svg')), true);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.no-score.html')), true);
});

test('production CLI writes composite output only after all three gates pass', () => {
  const { result, outputDir } = runCli('composite.routing.json', 'composite.grounded.json');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.composite.svg')), true);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.composite.html')), true);
});
