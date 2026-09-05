import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildManifestFromTsv,
  readImageDimensions
} from '../../skills/decision-first-dashboard/scripts/screenshot-adapter.js';

function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

const tsv = `level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n1\t1\t0\t0\t0\t0\t0\t0\t2048\t1218\t-1\t\n5\t1\t1\t1\t1\t1\t139\t21\t127\t32\t96.9\tMonthly\n5\t1\t1\t1\t1\t2\t277\t21\t150\t32\t96.4\tRecurring\n5\t1\t1\t1\t2\t1\t320\t236\t151\t34\t95.8\t$283,189\n`;

test('reads PNG dimensions directly from image bytes', () => {
  assert.deepEqual(readImageDimensions(pngHeader(2048, 1218)), { width: 2048, height: 1218 });
});

test('builds a deterministic screenshot token manifest from Tesseract TSV', () => {
  const imageBytes = pngHeader(2048, 1218);
  const manifest = buildManifestFromTsv(imageBytes, tsv);

  assert.equal(manifest.version, 1);
  assert.equal(manifest.engine, 'tesseract');
  assert.equal(manifest.imageSha256, crypto.createHash('sha256').update(imageBytes).digest('hex'));
  assert.equal(manifest.width, 2048);
  assert.equal(manifest.height, 1218);
  assert.deepEqual(manifest.tokens.map((token) => token.id), ['tok_000001', 'tok_000002', 'tok_000003']);
  assert.deepEqual(manifest.tokens[2], {
    id: 'tok_000003',
    text: '$283,189',
    confidence: 95.8,
    bbox: { x: 320, y: 236, width: 151, height: 34 }
  });
});

test('rejects OCR output with no usable word tokens', () => {
  const imageBytes = pngHeader(100, 100);
  const emptyTsv = `level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n1\t1\t0\t0\t0\t0\t0\t0\t100\t100\t-1\t\n`;
  assert.throws(() => buildManifestFromTsv(imageBytes, emptyTsv), /SCREENSHOT_OCR_FAILED/);
});
