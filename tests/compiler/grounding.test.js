import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateGroundedBundle } from '../../skills/decision-first-dashboard/scripts/grounding.js';

const groundingDir = new URL('./fixtures/grounding/', import.meta.url);
const composite = JSON.parse(fs.readFileSync(new URL('composite.grounded.json', groundingDir), 'utf8'));
const noScore = JSON.parse(fs.readFileSync(new URL('no-score.grounded.json', groundingDir), 'utf8'));

function validate(bundle) {
  return validateGroundedBundle(bundle, { baseDir: groundingDir });
}

test('passes a composite whose required scoring claims resolve to the source', () => {
  const result = validate(composite);
  assert.equal(result.valid, true);
  assert.equal(result.transition, 'PASS');
});

test('rejects a mathematically valid but source-forged composite weight', () => {
  const bad = structuredClone(composite);
  bad.decisionState.model.components[0].weight = 0.5;
  bad.decisionState.model.components[1].weight = 0.2;
  bad.decisionState.score.value = 66;
  const result = validate(bad);
  assert.equal(result.valid, false);
  assert.equal(result.transition, 'FALLBACK_TO_NO_SCORE');
  assert.ok(result.errors.some((error) => error.code === 'SOURCE_VALUE_MISMATCH' && error.path === '/model/components/0/weight'));
});

test('rejects a missing evidence reference in composite mode', () => {
  const bad = structuredClone(composite);
  bad.claims.find((claim) => claim.decisionPath === '/score/value').evidenceRef = 'ev_missing';
  const result = validate(bad);
  assert.equal(result.transition, 'FALLBACK_TO_NO_SCORE');
  assert.ok(result.errors.some((error) => error.code === 'EVIDENCE_REF_NOT_FOUND'));
});

test('rejects a source hash mismatch', () => {
  const bad = structuredClone(composite);
  bad.source.sha256 = '0'.repeat(64);
  const result = validate(bad);
  assert.equal(result.transition, 'FALLBACK_TO_NO_SCORE');
  assert.ok(result.errors.some((error) => error.code === 'SOURCE_HASH_MISMATCH'));
});

test('missing required composite grounding explicitly falls back to no-score', () => {
  const bad = structuredClone(composite);
  bad.claims = bad.claims.filter((claim) => claim.decisionPath !== '/score/band');
  const result = validate(bad);
  assert.equal(result.transition, 'FALLBACK_TO_NO_SCORE');
  assert.ok(result.errors.some((error) => error.code === 'MISSING_REQUIRED_GROUNDING' && error.path === '/score/band'));
});

test('passes a no-score bundle grounded by exact text spans', () => {
  const result = validate(noScore);
  assert.equal(result.valid, true);
  assert.equal(result.transition, 'PASS');
});

test('missing no-score grounding returns to evidence extraction', () => {
  const bad = structuredClone(noScore);
  bad.claims = bad.claims.filter((claim) => claim.decisionPath !== '/signals/0/value');
  const result = validate(bad);
  assert.equal(result.transition, 'RETURN_TO_EVIDENCE_EXTRACTION');
  assert.ok(result.errors.some((error) => error.code === 'MISSING_REQUIRED_GROUNDING'));
});

test('rejects unknown fields in the grounded bundle contract', () => {
  const bad = structuredClone(composite);
  bad.agentNote = 'trust me';
  const result = validate(bad);
  assert.equal(result.valid, false);
  assert.equal(result.transition, 'FALLBACK_TO_NO_SCORE');
  assert.ok(result.errors.some((error) => error.code === 'GROUNDING_BUNDLE_INVALID'));
});
