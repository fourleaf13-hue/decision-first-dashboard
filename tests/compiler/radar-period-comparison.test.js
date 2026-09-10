import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDecisionState } from '../../skills/decision-first-dashboard/scripts/validate.js';
import { renderSvg, renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

const profile = {
  mode: 'no_score',
  radarScale: { min: 0, max: 100, provenance: 'source' },
  radarComparison: {
    currentLabel: 'This month',
    previousLabel: 'Last month',
    provenance: 'source'
  },
  signals: [
    { metric: 'retail', label: 'Retail', value: '80%', radarValue: 80, previousRadarValue: 72, delta: '+8pp', direction: 'improving', provenance: 'source' },
    { metric: 'b2b', label: 'To B', value: '62%', radarValue: 62, previousRadarValue: 74, delta: '-12pp', direction: 'deteriorating', provenance: 'source' },
    { metric: 'retention', label: 'Retention', value: '74%', radarValue: 74, previousRadarValue: 69, delta: '+5pp', direction: 'improving', provenance: 'source' },
    { metric: 'conversion', label: 'Conversion', value: '51%', radarValue: 51, previousRadarValue: 58, delta: '-7pp', direction: 'deteriorating', provenance: 'source' }
  ]
};

function count(markup, token) {
  return (markup.match(new RegExp(token, 'g')) ?? []).length;
}

test('no-score radar accepts source-backed profile values without an overall score', () => {
  assert.equal(validateDecisionState(profile).valid, true);
});

test('radar renders four concentric scale rings with previous period beneath current period', () => {
  const svg = renderSvg(profile);
  const html = renderHtml(profile);

  assert.equal(count(svg, 'class="radar-scale-ring"'), 4);
  assert.equal(count(html, 'class="radar-scale-ring"'), 4);
  assert.ok(svg.indexOf('radar-shape--previous') < svg.indexOf('radar-shape--current'));
  assert.ok(html.indexOf('radar-shape--previous') < html.indexOf('radar-shape--current'));
  assert.match(svg, /Last month/);
  assert.match(svg, /This month/);
});

test('radar center stays empty while each dimension keeps its current value and movement cue', () => {
  const svg = renderSvg(profile);
  const html = renderHtml(profile);

  assert.doesNotMatch(svg, /direction-core|score-core|OVERALL DIRECTION|Target unknown/);
  assert.doesNotMatch(html, /direction-core|score-core|OVERALL DIRECTION|Target unknown/);
  assert.match(svg, />80%<\/text>/);
  assert.match(svg, />↑ 8pp<\/text>/);
  assert.match(svg, />↓ 12pp<\/text>/);
  assert.match(html, />80%<\/strong>/);
  assert.match(html, />↑ 8pp<\/em>/);
  assert.match(html, />↓ 12pp<\/em>/);
});

test('period comparison fails closed when only some radar dimensions provide a previous value', () => {
  const partial = structuredClone(profile);
  delete partial.signals[3].previousRadarValue;
  assert.equal(validateDecisionState(partial).valid, false);
});
