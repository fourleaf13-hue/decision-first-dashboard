import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { validateGroundedBundle } from '../../skills/decision-first-dashboard/scripts/grounding.js';

const fixtureDir = fileURLToPath(new URL('./fixtures/grounding/', import.meta.url));
const compositeFixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'composite.grounded.json'), 'utf8'));
const compositeSource = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'composite.source.json'), 'utf8'));
const noScoreFixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'no-score.grounded.json'), 'utf8'));
const noScoreSource = fs.readFileSync(path.join(fixtureDir, 'no-score.source.txt'), 'utf8');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function writeJson(dir, filename, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, filename), bytes);
  return sha256(bytes);
}

function writeText(dir, filename, value) {
  const bytes = Buffer.from(value);
  fs.writeFileSync(path.join(dir, filename), bytes);
  return sha256(bytes);
}

test('rejects a same-valued JSON pointer from an unrelated source object', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-grounding-'));
  const source = structuredClone(compositeSource);
  source.decoy = { weight: 0.4 };

  const bundle = structuredClone(compositeFixture);
  bundle.source.path = 'source.json';
  bundle.source.sha256 = writeJson(tempDir, 'source.json', source);

  const weightClaim = bundle.claims.find((claim) => claim.decisionPath === '/model/components/0/weight');
  const weightEvidence = bundle.evidence.find((evidence) => evidence.id === weightClaim.evidenceRef);
  weightEvidence.anchor.pointer = '/decoy/weight';

  const result = validateGroundedBundle(bundle, { baseDir: tempDir });

  assert.equal(result.transition, 'FALLBACK_TO_NO_SCORE');
  assert.ok(result.errors.some((error) => error.code === 'SOURCE_GROUP_MISMATCH'));
});

test('rejects an unlocated text anchor when its literal occurs more than once', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-grounding-'));
  const duplicateLine = 'ARR: $4.98M';
  const sourceText = `${noScoreSource.trimEnd()}\n${duplicateLine}\n`;

  const bundle = structuredClone(noScoreFixture);
  bundle.source.path = 'source.txt';
  bundle.source.sha256 = writeText(tempDir, 'source.txt', sourceText);

  const result = validateGroundedBundle(bundle, { baseDir: tempDir });

  assert.equal(result.transition, 'RETURN_TO_EVIDENCE_EXTRACTION');
  assert.ok(result.errors.some((error) => error.code === 'AMBIGUOUS_TEXT_ANCHOR'));
});

test('accepts an exact start/end location for a duplicated text literal', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-grounding-'));
  const duplicateLine = 'ARR: $4.98M';
  const sourceText = `${noScoreSource.trimEnd()}\n${duplicateLine}\n`;
  const start = sourceText.indexOf(duplicateLine);
  const end = start + duplicateLine.length;

  const bundle = structuredClone(noScoreFixture);
  bundle.source.path = 'source.txt';
  bundle.source.sha256 = writeText(tempDir, 'source.txt', sourceText);

  for (const evidenceId of ['ev_signal_0_label', 'ev_signal_0_value']) {
    const evidence = bundle.evidence.find((item) => item.id === evidenceId);
    evidence.anchor.start = start;
    evidence.anchor.end = end;
  }

  const result = validateGroundedBundle(bundle, { baseDir: tempDir });

  assert.equal(result.transition, 'PASS');
});

test('rejects a grounding source path that escapes the bundle base directory', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-grounding-'));
  const bundleDir = path.join(tempRoot, 'bundle');
  fs.mkdirSync(bundleDir);

  const bundle = structuredClone(compositeFixture);
  bundle.source.path = '../outside.json';
  bundle.source.sha256 = writeJson(tempRoot, 'outside.json', compositeSource);

  const result = validateGroundedBundle(bundle, { baseDir: bundleDir });

  assert.equal(result.transition, 'FALLBACK_TO_NO_SCORE');
  assert.ok(result.errors.some((error) => error.code === 'SOURCE_PATH_OUTSIDE_BASE'));
});

test('rejects duplicate claims for the same decision path', () => {
  const bundle = structuredClone(compositeFixture);
  bundle.claims.push(structuredClone(bundle.claims[0]));

  const result = validateGroundedBundle(bundle, { baseDir: fixtureDir });

  assert.equal(result.transition, 'FALLBACK_TO_NO_SCORE');
  assert.ok(result.errors.some((error) => error.code === 'DUPLICATE_CLAIM'));
});

test('rejects one evidence record reused for two decision paths', () => {
  const bundle = structuredClone(compositeFixture);
  const scoreMin = bundle.claims.find((claim) => claim.decisionPath === '/score/min');
  const bandMin = bundle.claims.find((claim) => claim.decisionPath === '/model/bands/0/min');
  bandMin.evidenceRef = scoreMin.evidenceRef;

  const result = validateGroundedBundle(bundle, { baseDir: fixtureDir });

  assert.equal(result.transition, 'FALLBACK_TO_NO_SCORE');
  assert.ok(result.errors.some((error) => error.code === 'EVIDENCE_REF_REUSED'));
});
