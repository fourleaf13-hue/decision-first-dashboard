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
