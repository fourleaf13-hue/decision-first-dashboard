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

  assert.deepEqual(scaleRadii(svg), [[40, 75.2], [60, 112.8], [80, 150.4], [100, 188]]);
  assert.deepEqual(scaleRadii(html), [[40, 75.2], [60, 112.8], [80, 150.4], [100, 188]]);
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

test('left labels are right-aligned and right labels are left-aligned', () => {
  const svg = renderSvg(comparisonRadar);

  assert.match(svg, /class="radar-label radar-label--left"[^>]*text-anchor="end"/);
  assert.match(svg, /class="radar-label radar-label--right"[^>]*text-anchor="start"/);
  assert.match(svg, /class="radar-label radar-label--top"[^>]*text-anchor="middle"/);
  assert.match(svg, /class="radar-label radar-label--bottom"[^>]*text-anchor="middle"/);
});
