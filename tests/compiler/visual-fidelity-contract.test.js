import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSvg, renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

const composite = JSON.parse(
  fs.readFileSync(new URL('./fixtures/composite.valid.json', import.meta.url), 'utf8')
);

test('composite SVG uses a dominant premium center field with layered halo depth', () => {
  const svg = renderSvg(composite);

  assert.match(svg, /class="center-halo center-halo--outer"/);
  assert.match(svg, /class="center-halo center-halo--inner"/);
  assert.match(svg, /<circle cx="740" cy="458" r="314" class="center-field"\/>/);
  assert.equal((svg.match(/class="radar-guide"/g) ?? []).length, 3);
  assert.match(svg, /<circle cx="740" cy="458" r="68" class="score-core"\/>/);
  assert.doesNotMatch(svg, /class="kpi-grid"|class="dashboard-table"/);
});

test('reference radar renders visible vertex markers and floating metric orbs', () => {
  const svg = renderSvg(composite);
  const html = renderHtml(composite);

  assert.match(svg, /<marker id="radarVertex"/);
  assert.match(svg, /class="metric-orb"/);
  assert.match(svg, /\.radar-shape \{ marker-start: url\(#radarVertex\); marker-mid: url\(#radarVertex\); \}/);
  assert.match(html, /<marker id="radarVertex"/);
  assert.match(html, /class="signal score-component metric-orb"/);
  assert.match(html, /\.orbit \.radar-shape \{ marker-start: url\(#radarVertex\); marker-mid: url\(#radarVertex\); \}/);
});

test('reference composition does not add a floating current-score method label', () => {
  const svg = renderSvg(composite);
  const html = renderHtml(composite);

  assert.doesNotMatch(svg, />CURRENT SCORE</);
  assert.doesNotMatch(html, />Current score<\/div>/);
});

test('HTML uses a signature open center plus elevated support surfaces', () => {
  const html = renderHtml(composite);

  assert.match(html, /grid-template-columns:\s*300px\s+minmax\(620px,\s*1fr\)\s+320px/);
  assert.match(html, /class="card support-card score-card"/);
  assert.match(html, /\.support-card\s*\{[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*\.82\);[\s\S]*?border-radius:\s*24px;[\s\S]*?box-shadow:/);
  assert.match(html, /\.synthesis-card::before\s*\{[\s\S]*?width:\s*680px;[\s\S]*?height:\s*680px;/);
  assert.match(html, /\.synthesis-card::after\s*\{[\s\S]*?width:\s*760px;[\s\S]*?height:\s*760px;/);
});
