import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema } from './validate.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const manifestSchema = JSON.parse(
  fs.readFileSync(path.resolve(currentDir, '../schemas/screenshot-manifest.schema.json'), 'utf8')
);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;

  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 2 > bytes.length) break;

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

    if (sofMarkers.has(marker)) {
      if (offset + 7 > bytes.length) break;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (width > 0 && height > 0) return { width, height };
      break;
    }

    offset += segmentLength;
  }

  return null;
}

export function readImageDimensions(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);

  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(pngSignature) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width > 0 && height > 0) return { width, height };
  }

  const jpeg = readJpegDimensions(bytes);
  if (jpeg) return jpeg;

  throw new Error('SCREENSHOT_OCR_FAILED: unsupported or invalid PNG/JPEG image');
}

function parseTsvRows(tsv) {
  const lines = String(tsv).replaceAll('\r\n', '\n').split('\n').filter((line) => line.length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split('\t');
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const required = ['level', 'left', 'top', 'width', 'height', 'conf', 'text'];
  if (required.some((name) => index[name] === undefined)) {
    throw new Error('SCREENSHOT_OCR_FAILED: Tesseract TSV is missing required columns');
  }

  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = line.split('\t');
    const level = Number(cells[index.level]);
    if (level !== 5) continue;

    const text = (cells[index.text] ?? '').trim();
    const confidence = Number(cells[index.conf]);
    const x = Number(cells[index.left]);
    const y = Number(cells[index.top]);
    const width = Number(cells[index.width]);
    const height = Number(cells[index.height]);

    if (!text || !Number.isFinite(confidence) || confidence < 0) continue;
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) continue;

    rows.push({ text, confidence, bbox: { x, y, width, height } });
  }
  return rows;
}

export function buildManifestFromTsv(imageBytes, tsv) {
  if (!Buffer.isBuffer(imageBytes)) imageBytes = Buffer.from(imageBytes);
  const { width, height } = readImageDimensions(imageBytes);
  const rows = parseTsvRows(tsv);
  if (rows.length === 0) {
    throw new Error('SCREENSHOT_OCR_FAILED: OCR produced no usable word tokens');
  }

  const manifest = {
    version: 1,
    imageSha256: sha256(imageBytes),
    width,
    height,
    engine: 'tesseract',
    tokens: rows.map((row, i) => ({ id: `tok_${String(i + 1).padStart(6, '0')}`, ...row }))
  };

  const result = validateAgainstSchema(manifest, manifestSchema);
  if (!result.valid) {
    const detail = result.errors.map((error) => `${error.instancePath} ${error.keyword}: ${error.message}`).join('; ');
    throw new Error(`SCREENSHOT_OCR_FAILED: generated manifest is invalid: ${detail}`);
  }

  return manifest;
}

export function runScreenshotAdapter(imagePath, { tesseractBin = process.env.TESSERACT_BIN || 'tesseract' } = {}) {
  const imageBytes = fs.readFileSync(imagePath);
  readImageDimensions(imageBytes);

  const result = spawnSync(tesseractBin, [imagePath, 'stdout', '--psm', '6', 'tsv'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });

  if (result.error || result.status !== 0) {
    const detail = result.error?.message || String(result.stderr || '').trim() || `exit ${result.status}`;
    throw new Error(`SCREENSHOT_OCR_FAILED: ${detail}`);
  }

  return buildManifestFromTsv(imageBytes, result.stdout);
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error('Usage: node screenshot-adapter.js <image.png|jpg> <manifest.json>');
    process.exit(2);
  }

  try {
    const manifest = runScreenshotAdapter(path.resolve(inputPath));
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(path.resolve(outputPath));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
