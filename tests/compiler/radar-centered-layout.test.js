import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSvg, renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

const state = JSON.parse(fs.readFileSync(new URL('../../examples/radar-profile/input.no-score.json', import.meta.url), 'utf8'));

function svgLabels(svg) {
  return [...svg.matchAll(/<text class="radar-label radar-label--(top|bottom|left|right)"[^>]*x="([\d.]+)" y="([\d.]+)"/g)]
    .map((match) => ({ side: match[1], x: Number(match[2]), y: Number(match[3]) }));
}

function htmlLabels(html) {
  return [...html.matchAll(/radar-label--(top|bottom|left|right)" data-outside-ring="true" style="left:([\d.]+)%;top:([\d.]+)%/g)]
    .map((match) => ({
      side: match[1],
      x: Number(match[2]) * 620 / 100,
      y: Number(match[3]) * 520 / 100
    }));
}

function svgAnchorPoint(label) {
  const y = label.side === 'top' ? label.y + 21 : label.side === 'bottom' ? label.y + 3 : label.y + 20;
  return { x: label.x, y };
}

function assertUniformRadius(points, cx, cy, expectedRadius, tolerance = 0.35) {
  for (const point of points) {
    const radius = Math.hypot(point.x - cx, point.y - cy);
    assert.ok(Math.abs(radius - expectedRadius) <= tolerance, `expected label radius ${expectedRadius}, got ${radius}`);
  }
}

test('radar module is centered in the middle stage instead of only centering the raw circle', () => {
  const svg = renderSvg(state);
  assert.match(svg, /<g transform="translate\(8 -6\)">/);
  assert.match(svg, /<circle cx="706" cy="482" r="318" class="radar-ambient-field"\/>/);
  assert.equal(698 + 8, (376 + 1036) / 2);
});

test('all SVG dimension labels use one shared radial gap outside the 100% circle', () => {
  const svg = renderSvg(state);
  const labels = svgLabels(svg);
  assert.equal(labels.length, 5);
  assertUniformRadius(labels.map(svgAnchorPoint), 698, 464, 228);
  assert.equal(228 - 188, 40);
  assert.doesNotMatch(svg, /translateX\(-24px\)/);
});

test('left and right SVG labels remain symmetric and leave room for support cards', () => {
  const labels = svgLabels(renderSvg(state));
  const right = labels.filter((label) => label.side === 'right');
  const left = labels.filter((label) => label.side === 'left');
  assert.equal(right.length, 2);
  assert.equal(left.length, 2);

  const rightXs = right.map((label) => label.x).sort((a, b) => a - b);
  const leftXs = left.map((label) => label.x).sort((a, b) => a - b);
  assert.ok(Math.abs((rightXs[1] + leftXs[0]) - 1396) < 0.3);
  assert.ok(Math.abs((rightXs[0] + leftXs[1]) - 1396) < 0.3);
  assert.ok(Math.max(...rightXs) + 8 <= 924, 'right label anchor must keep a safe margin before the x=1036 support card');
});

test('HTML uses the same uniform radial label-gap rule without an inward right-side nudge', () => {
  const html = renderHtml(state);
  const labels = htmlLabels(html);
  assert.equal(labels.length, 5);
  assertUniformRadius(labels, 310, 260, 228, 0.6);
  assert.doesNotMatch(html, /radar-label--right \{ text-align: left; transform: translate\(-24px, -50%\); \}/);
});
