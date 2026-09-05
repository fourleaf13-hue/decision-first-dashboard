import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGroundedBundle } from '../../skills/decision-first-dashboard/scripts/grounding.js';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-screenshot-'));
  const imageBytes = pngHeader(1000, 700);
  fs.writeFileSync(path.join(dir, 'source.png'), imageBytes);

  const manifest = {
    version: 1,
    imageSha256: sha256(imageBytes),
    width: 1000,
    height: 700,
    engine: 'tesseract',
    tokens: [
      { id: 'tok_000001', text: 'MRR', confidence: 96, bbox: { x: 100, y: 100, width: 50, height: 20 } },
      { id: 'tok_000002', text: '$283,189', confidence: 97, bbox: { x: 100, y: 130, width: 120, height: 30 } },
      { id: 'tok_000003', text: 'Net', confidence: 95, bbox: { x: 300, y: 100, width: 40, height: 20 } },
      { id: 'tok_000004', text: 'change', confidence: 95, bbox: { x: 345, y: 100, width: 70, height: 20 } },
      { id: 'tok_000005', text: '-$1,292', confidence: 94, bbox: { x: 300, y: 130, width: 90, height: 30 } },
      { id: 'tok_000006', text: 'Churn', confidence: 96, bbox: { x: 500, y: 100, width: 60, height: 20 } },
      { id: 'tok_000007', text: '-$2,038', confidence: 93, bbox: { x: 500, y: 130, width: 90, height: 30 } }
    ]
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'source.ocr.json'), manifestBytes);

  const facts = [
    ['/signals/0/label', 'ev_mrr_label', ['tok_000001'], 'MRR'],
    ['/signals/0/value', 'ev_mrr_value', ['tok_000002'], '$283,189'],
    ['/signals/1/label', 'ev_change_label', ['tok_000003', 'tok_000004'], 'Net change'],
    ['/signals/1/value', 'ev_change_value', ['tok_000005'], '-$1,292'],
    ['/signals/2/label', 'ev_churn_label', ['tok_000006'], 'Churn'],
    ['/signals/2/value', 'ev_churn_value', ['tok_000007'], '-$2,038']
  ];

  const bundle = {
    source: {
      kind: 'screenshot',
      path: 'source.png',
      sha256: sha256(imageBytes),
      manifestPath: 'source.ocr.json',
      manifestSha256: sha256(manifestBytes)
    },
    decisionState: {
      mode: 'no_score',
      signals: [
        { metric: 'mrr', label: 'MRR', value: '$283,189', provenance: 'source' },
        { metric: 'net_change', label: 'Net change', value: '-$1,292', provenance: 'source' },
        { metric: 'churn', label: 'Churn', value: '-$2,038', provenance: 'source' }
      ]
    },
    evidence: facts.map(([, id, tokenRefs, valueText]) => ({
      id,
      anchor: { type: 'token_span', tokenRefs, valueText }
    })),
    claims: facts.map(([decisionPath, evidenceRef]) => ({ decisionPath, evidenceRef }))
  };

  return { dir, bundle, manifest };
}

test('passes a screenshot bundle whose claims resolve to verified OCR tokens', () => {
  const { dir, bundle } = makeFixture();
  const result = validateGroundedBundle(bundle, { baseDir: dir });
  assert.equal(result.valid, true);
  assert.equal(result.transition, 'PASS');
});

test('rejects a screenshot manifest hash mismatch', () => {
  const { dir, bundle } = makeFixture();
  bundle.source.manifestSha256 = '0'.repeat(64);
  const result = validateGroundedBundle(bundle, { baseDir: dir });
  assert.equal(result.transition, 'RETURN_TO_EVIDENCE_EXTRACTION');
  assert.ok(result.errors.some((error) => error.code === 'SCREENSHOT_MANIFEST_HASH_MISMATCH'));
});

test('rejects a screenshot image hash mismatch', () => {
  const { dir, bundle } = makeFixture();
  bundle.source.sha256 = '0'.repeat(64);
  const result = validateGroundedBundle(bundle, { baseDir: dir });
  assert.ok(result.errors.some((error) => error.code === 'SCREENSHOT_IMAGE_HASH_MISMATCH'));
});

test('rejects a token reference that is absent from the manifest', () => {
  const { dir, bundle } = makeFixture();
  bundle.evidence[0].anchor.tokenRefs = ['tok_999999'];
  const result = validateGroundedBundle(bundle, { baseDir: dir });
  assert.ok(result.errors.some((error) => error.code === 'TOKEN_NOT_FOUND'));
});

test('rejects a token bbox that escapes the screenshot dimensions', () => {
  const { dir, bundle, manifest } = makeFixture();
  manifest.tokens[0].bbox.x = 990;
  manifest.tokens[0].bbox.width = 50;
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'source.ocr.json'), bytes);
  bundle.source.manifestSha256 = sha256(bytes);
  const result = validateGroundedBundle(bundle, { baseDir: dir });
  assert.ok(result.errors.some((error) => error.code === 'TOKEN_BBOX_INVALID'));
});

test('rejects low-confidence OCR evidence', () => {
  const { dir, bundle, manifest } = makeFixture();
  manifest.tokens[1].confidence = 40;
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'source.ocr.json'), bytes);
  bundle.source.manifestSha256 = sha256(bytes);
  const result = validateGroundedBundle(bundle, { baseDir: dir });
  assert.ok(result.errors.some((error) => error.code === 'OCR_EVIDENCE_UNCERTAIN'));
});

test('rejects a token span whose text does not equal the evidence value', () => {
  const { dir, bundle } = makeFixture();
  bundle.evidence[1].anchor.valueText = '$999,999';
  const result = validateGroundedBundle(bundle, { baseDir: dir });
  assert.ok(result.errors.some((error) => error.code === 'TOKEN_TEXT_MISMATCH'));
});
