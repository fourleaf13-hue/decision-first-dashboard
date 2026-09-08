import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSvg, renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

const composite = JSON.parse(
  fs.readFileSync(new URL('./fixtures/composite.valid.json', import.meta.url), 'utf8')
);

test('composite SVG uses the open reference composition instead of three boxed columns', () => {
  const svg = renderSvg(composite);

  assert.match(svg, /<circle cx="740" cy="458" r="306" class="center-field"\/?>/);
  assert.equal((svg.match(/class="radar-guide"/g) ?? []).length, 3);
  assert.match(svg, /<circle cx="740" cy="458" r="68" class="score-core"\/?>/);
  assert.doesNotMatch(svg, /class="card"/);
});

test('reference radar renders visible vertex markers at the scored polygon corners', () => {
  const svg = renderSvg(composite);
  const html = renderHtml(composite);

  assert.match(svg, /<marker id="radarVertex"/);
  assert.match(svg, /\.radar-shape \{ marker-start: url\(#radarVertex\); marker-mid: url\(#radarVertex\); \}/);
  assert.match(html, /<marker id="radarVertex"/);
  assert.match(html, /\.orbit \.radar-shape \{ marker-start: url\(#radarVertex\); marker-mid: url\(#radarVertex\); \}/);
});

test('reference composition does not add a floating current-score method label', () => {
  const svg = renderSvg(composite);
  const html = renderHtml(composite);

  assert.doesNotMatch(svg, />CURRENT SCORE</);
  assert.doesNotMatch(html, />Current score<\/div>/);
});

test('HTML mirrors the open reference layout with a dominant circular center field', () => {
  const html = renderHtml(composite);

  assert.match(html, /grid-template-columns:\s*286px\s+minmax\(580px,\s*1fr\)\s+330px/);
  assert.match(html, /\.card\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;/);
  assert.match(html, /\.synthesis-card::before\s*\{[\s\S]*?width:\s*640px;[\s\S]*?height:\s*640px;/);
});
