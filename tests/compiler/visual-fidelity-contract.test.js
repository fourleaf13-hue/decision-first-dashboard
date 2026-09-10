import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSvg, renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

const composite = JSON.parse(
  fs.readFileSync(new URL('./fixtures/composite.valid.json', import.meta.url), 'utf8')
);

test('composite SVG keeps premium ambient depth while using four quantitative radar rings', () => {
  const svg = renderSvg(composite);

  assert.match(svg, /class="center-halo center-halo--outer"/);
  assert.match(svg, /class="center-halo center-halo--inner"/);
  assert.match(svg, /<circle cx="740" cy="458" r="314" class="center-field"\/>/);
  assert.equal((svg.match(/class="radar-scale-ring"/g) ?? []).length, 4);
  assert.doesNotMatch(svg, /class="score-core"|class="direction-core"/);
  assert.doesNotMatch(svg, /class="kpi-grid"|class="dashboard-table"/);
});

test('reference radar renders current vertices and outside labels without floating metric cards', () => {
  const svg = renderSvg(composite);
  const html = renderHtml(composite);

  assert.match(svg, /<marker id="radarVertex"/);
  assert.match(svg, /class="radar-label radar-label--/);
  assert.match(svg, /\.radar-shape--current\s*\{[^}]*marker-start:\s*url\(#radarVertex\);[^}]*marker-mid:\s*url\(#radarVertex\);/);
  assert.doesNotMatch(svg, /class="metric-orb"/);

  assert.match(html, /<marker id="radarVertex"/);
  assert.match(html, /class="score-component radar-label radar-label--/);
  assert.match(html, /\.orbit \.radar-shape--current\s*\{[\s\S]*?marker-start:\s*url\(#radarVertex\);[\s\S]*?marker-mid:\s*url\(#radarVertex\);/);
  assert.doesNotMatch(html, /score-component metric-orb/);
});

test('composite score remains in the support card instead of occupying the radar center', () => {
  const svg = renderSvg(composite);
  const html = renderHtml(composite);

  assert.match(svg, /Score trend/);
  assert.match(svg, />68</);
  assert.doesNotMatch(svg, /class="score-core"/);
  assert.match(html, /class="card support-card score-card"/);
  assert.doesNotMatch(html, /class="score-core"/);
});

test('HTML uses a signature open center plus elevated support surfaces', () => {
  const html = renderHtml(composite);

  assert.match(html, /grid-template-columns:\s*300px\s+minmax\(620px,\s*1fr\)\s+320px/);
  assert.match(html, /class="card support-card score-card"/);
  assert.match(html, /\.support-card\s*\{[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*\.82\);[\s\S]*?border-radius:\s*24px;[\s\S]*?box-shadow:/);
  assert.match(html, /\.synthesis-card::before\s*\{[\s\S]*?width:\s*680px;[\s\S]*?height:\s*680px;/);
  assert.match(html, /\.synthesis-card::after\s*\{[\s\S]*?width:\s*760px;[\s\S]*?height:\s*760px;/);
});
