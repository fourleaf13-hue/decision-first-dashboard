import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSvg, renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

const composite = JSON.parse(
  fs.readFileSync(new URL('./fixtures/composite.valid.json', import.meta.url), 'utf8')
);

test('composite SVG keeps premium ambient depth without creating pseudo-scale rings', () => {
  const svg = renderSvg(composite);

  assert.match(svg, /class="radar-ambient-field"/);
  assert.match(svg, /\.radar-ambient-field\s*\{[^}]*fill:\s*url\(#radarAmbient\);[^}]*stroke:\s*none/i);
  assert.doesNotMatch(svg, /class="center-halo|class="center-field/);
  assert.equal((svg.match(/class="radar-scale-ring"/g) ?? []).length, 4);
  assert.match(svg, /\.radar-scale-ring\[data-scale="100"\]\s*\{[^}]*stroke-width:\s*1\.5/i);
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

test('HTML keeps one soft ambient field below the radar and its labels', () => {
  const html = renderHtml(composite);

  assert.match(html, /grid-template-columns:\s*300px\s+minmax\(620px,\s*1fr\)\s+320px/);
  assert.match(html, /class="card support-card score-card"/);
  assert.match(html, /\.support-card\s*\{[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*\.82\);[\s\S]*?border-radius:\s*24px;[\s\S]*?box-shadow:/);
  assert.match(html, /\.synthesis-card::before\s*\{[\s\S]*?width:\s*700px;[\s\S]*?height:\s*700px;[\s\S]*?border:\s*0;[\s\S]*?radial-gradient[\s\S]*?filter:\s*blur\(14px\);[\s\S]*?z-index:\s*0;/);
  assert.doesNotMatch(html, /\.synthesis-card::after\s*\{/);
  assert.match(html, /\.orbit\s*\{[\s\S]*?z-index:\s*1;/);
});
