import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema } from '../../skills/decision-first-dashboard/scripts/validate.js';

const schemaPath = fileURLToPath(new URL('../../skills/decision-first-dashboard/schemas/grounded-bundle.schema.json', import.meta.url));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

function screenshotBundle() {
  return {
    source: {
      kind: 'screenshot',
      path: 'mrr-dashboard.png',
      sha256: 'a'.repeat(64),
      manifestPath: 'mrr-dashboard.ocr.json',
      manifestSha256: 'b'.repeat(64)
    },
    decisionState: { mode: 'no_score' },
    evidence: [
      {
        id: 'ev_mrr',
        anchor: {
          type: 'token_span',
          tokenRefs: ['tok_000101', 'tok_000102'],
          valueText: '$283,189'
        }
      }
    ],
    claims: [{ decisionPath: '/signals/0/value', evidenceRef: 'ev_mrr' }]
  };
}

test('accepts the closed screenshot source and token-span anchor shape', () => {
  assert.equal(validateAgainstSchema(screenshotBundle(), schema).valid, true);
});

test('screenshot source requires a manifest path and manifest hash', () => {
  const bad = screenshotBundle();
  delete bad.source.manifestSha256;
  assert.equal(validateAgainstSchema(bad, schema).valid, false);
});

test('token-span anchors reject freeform fields', () => {
  const bad = screenshotBundle();
  bad.evidence[0].anchor.literal = 'trust me';
  const result = validateAgainstSchema(bad, schema);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === 'oneOf'));
});

test('screenshot source rejects extra properties', () => {
  const bad = screenshotBundle();
  bad.source.ocrText = '$283,189';
  assert.equal(validateAgainstSchema(bad, schema).valid, false);
});
