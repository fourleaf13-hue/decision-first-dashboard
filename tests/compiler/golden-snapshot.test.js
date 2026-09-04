import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { renderHtml, renderSvg } from '../../skills/decision-first-dashboard/scripts/render.js';

const noScore = JSON.parse(fs.readFileSync(new URL('../../examples/saas/input.no-score.json', import.meta.url), 'utf8'));
const composite = JSON.parse(fs.readFileSync(new URL('./fixtures/composite.valid.json', import.meta.url), 'utf8'));
const hashes = JSON.parse(fs.readFileSync(new URL('./golden/hashes.json', import.meta.url), 'utf8'));

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

test('no-score SVG matches golden bytes', () => {
  assert.equal(sha256(renderSvg(noScore)), hashes['no-score.svg']);
});

test('no-score HTML matches golden bytes', () => {
  assert.equal(sha256(renderHtml(noScore)), hashes['no-score.html']);
});

test('composite SVG matches golden bytes', () => {
  assert.equal(sha256(renderSvg(composite)), hashes['composite.svg']);
});

test('composite HTML matches golden bytes', () => {
  assert.equal(sha256(renderHtml(composite)), hashes['composite.html']);
});
