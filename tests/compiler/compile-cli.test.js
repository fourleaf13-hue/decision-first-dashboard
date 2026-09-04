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

test('compile CLI renders only after grounded composite passes', () => {
  const bundle = JSON.parse(fs.readFileSync(validComposite, 'utf8'));
  const { outputDir, result } = runCompiler(validComposite);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(outputDir, 'output.composite.svg'), 'utf8'), renderSvg(bundle.decisionState));
  assert.equal(fs.readFileSync(path.join(outputDir, 'output.composite.html'), 'utf8'), renderHtml(bundle.decisionState));
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
