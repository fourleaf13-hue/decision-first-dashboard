import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderHtml, renderSvg } from '../../skills/decision-first-dashboard/scripts/render.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const compiler = path.join(repoRoot, 'skills/decision-first-dashboard/scripts/compile.js');
const groundingDir = path.join(repoRoot, 'tests/compiler/fixtures/grounding');
const validComposite = path.join(groundingDir, 'composite.grounded.json');

function runCompiler(inputPath) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-compile-'));
  const result = spawnSync(process.execPath, [compiler, inputPath, outputDir], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  return { outputDir, result };
}

function writeV31Composite({ invalidPath = false } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-v31-'));
  fs.copyFileSync(path.join(groundingDir, 'composite.source.json'), path.join(temp, 'composite.source.json'));
  const bundle = JSON.parse(fs.readFileSync(validComposite, 'utf8'));
  bundle.contractVersion = '3.1';
  bundle.intent = {
    audience: 'VP Revenue',
    audienceType: 'executive',
    purpose: 'Monitor subscription health',
    primaryDecision: 'Is subscription health good enough to stay on plan?',
    refreshCadence: 'daily',
    requirements: [
      {
        id: 'req_health_score',
        label: 'Subscription health score',
        kind: 'single_value',
        resolution: {
          type: 'decision_path',
          path: invalidPath ? '/score/notThere' : '/score/value'
        }
      },
      {
        id: 'req_external_benchmark',
        label: 'External benchmark comparison',
        kind: 'comparison',
        resolution: {
          type: 'deferred',
          blockedBy: 'missing_source_fact',
          originalSpec: 'Compare the health score with an approved external benchmark',
          toUnblock: 'Provide a source-backed benchmark and comparison rule'
        }
      }
    ]
  };
  const bundlePath = path.join(temp, 'composite.v31.grounded.json');
  fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
  return { bundle, bundlePath };
}

test('compile CLI renders only after grounded composite passes', () => {
  const bundle = JSON.parse(fs.readFileSync(validComposite, 'utf8'));
  const { outputDir, result } = runCompiler(validComposite);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(outputDir, 'output.composite.svg'), 'utf8'), renderSvg(bundle.decisionState));
  assert.equal(fs.readFileSync(path.join(outputDir, 'output.composite.html'), 'utf8'), renderHtml(bundle.decisionState));
  assert.equal(fs.existsSync(path.join(outputDir, 'output.composite.plan.json')), false);
});

test('compile CLI refuses forged grounding and writes no dashboard output', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-forged-'));
  fs.copyFileSync(path.join(groundingDir, 'composite.source.json'), path.join(temp, 'composite.source.json'));
  const bundle = JSON.parse(fs.readFileSync(validComposite, 'utf8'));
  bundle.decisionState.model.components[0].weight = 0.5;
  bundle.decisionState.model.components[1].weight = 0.2;
  bundle.decisionState.score.value = 66;
  const bundlePath = path.join(temp, 'forged.json');
  fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));

  const { outputDir, result } = runCompiler(bundlePath);
  assert.equal(result.status, 1);
  const failure = JSON.parse(result.stderr);
  assert.equal(failure.transition, 'FALLBACK_TO_NO_SCORE');
  assert.equal(fs.existsSync(path.join(outputDir, 'output.composite.svg')), false);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.composite.html')), false);
});

test('compile CLI emits deterministic render-plan IR for valid V3.1 bundles', () => {
  const { bundlePath } = writeV31Composite();
  const { outputDir, result } = runCompiler(bundlePath);
  assert.equal(result.status, 0, result.stderr);

  const planPath = path.join(outputDir, 'output.composite.plan.json');
  assert.equal(fs.existsSync(planPath), true);
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  assert.equal(plan.contractVersion, '3.1');
  assert.equal(plan.mode, 'composite');
  assert.equal(plan.layout.focalPoint, 'center');
  assert.equal(plan.requirements[0].status, 'computed');
  assert.equal(plan.requirements[0].decisionPath, '/score/value');
  assert.equal(plan.requirements[1].status, 'deferred');
  assert.equal(plan.requirements[1].blockedBy, 'missing_source_fact');
});

test('compile CLI stops invalid V3.1 intent before renderer output', () => {
  const { bundlePath } = writeV31Composite({ invalidPath: true });
  const { outputDir, result } = runCompiler(bundlePath);
  assert.equal(result.status, 1);
  const failure = JSON.parse(result.stderr);
  assert.equal(failure.stage, 'planning');
  assert.equal(failure.transition, 'FIX_COMPILER_INTENT');
  assert.equal(failure.errors.some((error) => error.code === 'DECISION_PATH_NOT_FOUND'), true);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.composite.svg')), false);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.composite.html')), false);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.composite.plan.json')), false);
});
