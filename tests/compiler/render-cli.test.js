import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const renderer = path.join(repoRoot, 'skills/decision-first-dashboard/scripts/render.js');
const compositeFixture = path.join(repoRoot, 'tests/compiler/fixtures/composite.valid.json');
const noScoreFixture = path.join(repoRoot, 'examples/saas/input.no-score.json');

function runRenderer(inputPath) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-render-'));
  const result = spawnSync(process.execPath, [renderer, inputPath, outputDir], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  return { outputDir, result };
}

test('CLI writes composite mode to output.composite.svg and output.composite.html', () => {
  const { outputDir, result } = runRenderer(compositeFixture);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.composite.svg')), true);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.composite.html')), true);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.no-score.svg')), false);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.no-score.html')), false);
});

test('CLI preserves no-score output basenames', () => {
  const { outputDir, result } = runRenderer(noScoreFixture);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.no-score.svg')), true);
  assert.equal(fs.existsSync(path.join(outputDir, 'output.no-score.html')), true);
});
