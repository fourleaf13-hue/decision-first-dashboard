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
const intakeDir = fileURLToPath(new URL('./fixtures/intake/', import.meta.url));
const agentEvalDir = fileURLToPath(new URL('./fixtures/agent-eval/', import.meta.url));

const worthiness = JSON.parse(fs.readFileSync(path.join(worthinessDir, 'dashboard.worthiness.json'), 'utf8'));
const routing = JSON.parse(fs.readFileSync(path.join(routingDir, 'no-score.routing.json'), 'utf8'));
const bundle = JSON.parse(fs.readFileSync(path.join(groundingDir, 'no-score.grounded.json'), 'utf8'));
const confirmedBrief = JSON.parse(fs.readFileSync(path.join(intakeDir, 'confirmed.decision-brief.json'), 'utf8'));
const incompleteBrief = JSON.parse(fs.readFileSync(path.join(intakeDir, 'incomplete.decision-brief.json'), 'utf8'));

function runCompilerCli(briefName = 'confirmed.decision-brief.json') {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-intake-'));
  const script = path.join(root, 'skills/decision-first-dashboard/scripts/compile-dashboard.js');
  const result = spawnSync(process.execPath, [
    script,
    path.join(worthinessDir, 'dashboard.worthiness.json'),
    path.join(intakeDir, briefName),
    path.join(routingDir, 'no-score.routing.json'),
    path.join(groundingDir, 'no-score.grounded.json'),
    outputDir
  ], { cwd: root, encoding: 'utf8' });
  return { result, outputDir };
}

test('incomplete Decision Brief blocks routing and rendering with one intake transition', () => {
  const compiled = compileDecisionDashboard(worthiness, incompleteBrief, routing, bundle, { baseDir: groundingDir });

  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.stage, 'intake');
  assert.equal(compiled.result.transition, 'ASK_DECISION_BRIEF_QUESTION');
  assert.deepEqual(compiled.result.missingSlots, ['decision', 'action']);
  assert.equal(compiled.svg, null);
  assert.equal(compiled.html, null);
});

test('confirmed Decision Brief is bound exactly to routing decision and action', () => {
  const mismatchedRouting = structuredClone(routing);
  mismatchedRouting.action = 'Invent a different next action';

  const compiled = compileDecisionDashboard(worthiness, confirmedBrief, mismatchedRouting, bundle, { baseDir: groundingDir });

  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.stage, 'routing');
  assert.equal(compiled.result.transition, 'FIX_METRIC_ROUTING');
  assert.ok(compiled.result.errors.some((error) => error.code === 'CONFIRMED_ACTION_MISMATCH'));
  assert.equal(compiled.html, null);
});

test('canonical dashboard compile emits machine-verifiable provenance', () => {
  const compiled = compileDecisionDashboard(worthiness, confirmedBrief, routing, bundle, { baseDir: groundingDir });

  assert.equal(compiled.result.valid, true);
  assert.equal(compiled.result.transition, 'PASS');
  assert.match(compiled.html, /<meta name="decision-first-renderer" content="canonical">/);
  assert.match(compiled.html, /<meta name="decision-first-mode" content="no_score">/);
  assert.match(compiled.html, /<meta name="decision-first-routing-manifest-sha256" content="[a-f0-9]{64}">/);
  assert.match(compiled.svg, /<metadata id="decision-first-provenance">/);
  assert.equal(compiled.manifest.canonical, true);
  assert.equal(compiled.manifest.mode, 'no_score');
  assert.match(compiled.manifest.htmlSha256, /^[a-f0-9]{64}$/);
  assert.match(compiled.manifest.decisionStateSha256, /^[a-f0-9]{64}$/);
});

test('production CLI writes output manifest beside canonical HTML and SVG', () => {
  const { result, outputDir } = runCompilerCli();
  assert.equal(result.status, 0, result.stderr);

  const htmlPath = path.join(outputDir, 'output.no-score.html');
  const manifestPath = path.join(outputDir, 'output.manifest.json');
  assert.equal(fs.existsSync(htmlPath), true);
  assert.equal(fs.existsSync(manifestPath), true);

  const html = fs.readFileSync(htmlPath, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.match(html, /decision-first-renderer/);
  assert.equal(manifest.canonical, true);
  assert.match(manifest.htmlSha256, /^[a-f0-9]{64}$/);
});

test('recorded ambiguous-prompt agent eval accepts one question and rejects native artifact bypass', () => {
  const script = path.join(root, 'skills/decision-first-dashboard/scripts/agent-eval.js');
  const spec = path.join(agentEvalDir, 'sales-dashboard-ambiguous.eval.json');
  const good = path.join(agentEvalDir, 'sales-dashboard-good-first-turn.json');
  const bad = path.join(agentEvalDir, 'sales-dashboard-bad-first-turn.json');

  const goodRun = spawnSync(process.execPath, [script, spec, good], { cwd: root, encoding: 'utf8' });
  assert.equal(goodRun.status, 0, goodRun.stderr);

  const badRun = spawnSync(process.execPath, [script, spec, bad], { cwd: root, encoding: 'utf8' });
  assert.equal(badRun.status, 1);
  assert.match(badRun.stderr, /AGENT_OUTPUT_BYPASSED_INTAKE|CANONICAL_PROVENANCE_REQUIRED/);
});
