import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSvg, renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

const comparisonRadar = {
  mode: 'no_score',
  radarScale: { min: 0, max: 100, provenance: 'source' },
  signals: [
    { metric: 'retail', label: 'Retail', value: '80%', delta: '+8pp', direction: 'improving', normalizedScore: 80, previousNormalizedScore: 72, provenance: 'source' },
    { metric: 'to_b', label: 'To B', value: '64%', delta: '-6pp', direction: 'deteriorating', normalizedScore: 64, previousNormalizedScore: 70, provenance: 'source' },
    { metric: 'retention', label: 'Retention', value: '92%', delta: '+4pp', direction: 'improving', normalizedScore: 92, previousNormalizedScore: 88, provenance: 'source' },
    { metric: 'conversion', label: 'Conversion', value: '55%', delta: '-10pp', direction: 'deteriorating', normalizedScore: 55, previousNormalizedScore: 65, provenance: 'source' }
  ]
};

function scaleRadii(markup) {
  return [...markup.matchAll(/class="radar-scale-ring"[^>]*data-scale="(40|60|80|100)"[^>]*r="([0-9.]+)"/g)]
    .map((match) => [Number(match[1]), Number(match[2])]);
}

test('profile radar uses exactly four proportional 40/60/80/100 scale rings', () => {
  const svg = renderSvg(comparisonRadar);
  const html = renderHtml(comparisonRadar);

  assert.deepEqual(scaleRadii(svg), [[100, 188], [80, 150.4], [60, 112.8], [40, 75.2]]);
  assert.deepEqual(scaleRadii(html), [[100, 188], [80, 150.4], [60, 112.8], [40, 75.2]]);
});

test('quantitative radar tiers are opaque white circles with visible gray boundaries', () => {
  const svg = renderSvg(comparisonRadar);
  const html = renderHtml(comparisonRadar);

  assert.match(svg, /\.radar-scale-ring\s*\{[^}]*fill:\s*#ffffff;[^}]*fill-opacity:\s*1;[^}]*stroke:/i);
  assert.match(html, /\.orbit \.radar-scale-ring\s*\{[^}]*fill:\s*#ffffff;[^}]*fill-opacity:\s*1;[^}]*stroke:/i);
});

test('previous month is blue below the current pink profile and current vertices stay visible', () => {
  const svg = renderSvg(comparisonRadar);
  const previousIndex = svg.indexOf('radar-shape radar-shape--previous');
  const currentIndex = svg.indexOf('radar-shape radar-shape--current');

  assert.ok(previousIndex >= 0, 'previous profile should render');
  assert.ok(currentIndex > previousIndex, 'current profile must render above previous profile');
  assert.match(svg, /\.radar-shape--previous\s*\{[^}]*stroke:\s*#3b82f6/i);
  assert.match(svg, /\.radar-shape--current\s*\{[^}]*stroke:\s*#f45fa5/i);
  assert.match(svg, /\.radar-shape--current\s*\{[^}]*marker-start:/i);
});

test('radar center stays empty and all dimension copy sits outside the 100% ring', () => {
  const svg = renderSvg(comparisonRadar);

  assert.doesNotMatch(svg, /OVERALL DIRECTION|Target unknown|class="direction-core"|>IMPROVING<|>DETERIORATING</);
  assert.match(svg, /class="radar-label radar-label--top"[^>]*data-outside-ring="true"/);
  assert.match(svg, /class="radar-label radar-label--right"[^>]*data-outside-ring="true"/);
  assert.match(svg, /class="radar-label radar-label--bottom"[^>]*data-outside-ring="true"/);
  assert.match(svg, /class="radar-label radar-label--left"[^>]*data-outside-ring="true"/);
  assert.match(svg, />Retail<[^]*?>80%<[^]*?>↑ 8pp</);
  assert.match(svg, />To B<[^]*?>64%<[^]*?>↓ 6pp</);
  assert.match(svg, /class="positive"[^>]*>↑ 8pp</);
  assert.match(svg, /class="danger"[^>]*>↓ 6pp</);
});

test('left labels are explicitly right-aligned line by line and right labels are left-aligned', () => {
  const svg = renderSvg(comparisonRadar);

  const leftBlock = svg.match(/<text class="radar-label radar-label--left"[\s\S]*?<\/text>/)?.[0] ?? '';
  const rightBlock = svg.match(/<text class="radar-label radar-label--right"[\s\S]*?<\/text>/)?.[0] ?? '';
  assert.match(leftBlock, /text-anchor="end"/);
  assert.equal((leftBlock.match(/text-anchor="end"/g) ?? []).length, 4, 'left label and all three lines must share the same right edge');
  assert.match(rightBlock, /text-anchor="start"/);
  assert.equal((rightBlock.match(/text-anchor="start"/g) ?? []).length, 4, 'right label and all three lines must share the same left edge');
});

test('side labels stay inside the center safe zone and cannot overlap support cards', () => {
  const svg = renderSvg(comparisonRadar);
  const html = renderHtml(comparisonRadar);

  for (const match of svg.matchAll(/class="radar-label radar-label--(left|right)"[^>]*x="([0-9.]+)"/g)) {
    const [, side, xText] = match;
    const x = Number(xText);
    if (side === 'left') assert.ok(x >= 500, `left label x=${x} must clear the left support card`);
    if (side === 'right') assert.ok(x <= 900, `right label x=${x} must clear the right support card`);
  }

  for (const match of html.matchAll(/class="[^\"]*radar-label radar-label--(left|right)[^\"]*"[^>]*style="left:([0-9.]+)%/g)) {
    const [, side, pctText] = match;
    const pct = Number(pctText);
    if (side === 'left') assert.ok(pct >= 19.35, `left HTML label ${pct}% must clear the left support card`);
    if (side === 'right') assert.ok(pct <= 80.65, `right HTML label ${pct}% must clear the right support card`);
  }
});

test('ambient field is a non-quantitative bottom layer and the 100% ring remains the outer data boundary', () => {
  const svg = renderSvg(comparisonRadar);
  const html = renderHtml(comparisonRadar);
  const ambientIndex = svg.indexOf('class="radar-ambient-field"');
  const firstRingIndex = svg.indexOf('class="radar-scale-ring');
  const firstLabelIndex = svg.indexOf('class="radar-label');

  assert.ok(ambientIndex >= 0, 'ambient field should render');
  assert.ok(ambientIndex < firstRingIndex, 'ambient field must sit below quantitative rings');
  assert.ok(ambientIndex < firstLabelIndex, 'ambient field must sit below labels and values');
  assert.doesNotMatch(svg, /class="center-halo|class="center-field/);
  assert.match(svg, /\.radar-ambient-field\s*\{[^}]*stroke:\s*none/i);
  assert.match(svg, /\.radar-scale-ring\[data-scale="100"\]\s*\{[^}]*stroke-width:\s*1\.5/i);

  assert.match(html, /\.synthesis-card::before\s*\{[^}]*radial-gradient[^}]*z-index:\s*0/is);
  assert.doesNotMatch(html, /\.synthesis-card::after\s*\{/);
  assert.match(html, /\.orbit\s*\{[^}]*z-index:\s*1/is);
  assert.match(html, /\.orbit \.radar-scale-ring\[data-scale="100"\]\s*\{[^}]*stroke-width:\s*1\.5/is);
});
