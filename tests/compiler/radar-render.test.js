import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDecisionState } from '../../skills/decision-first-dashboard/scripts/validate.js';
import { renderSvg, renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

const scoredNoScore = {
  mode: 'no_score',
  radarScale: { min: 0, max: 100, provenance: 'source' },
  signals: [
    { metric: 'retention', label: 'Retention', value: '60', normalizedScore: 60, direction: 'deteriorating', provenance: 'source' },
    { metric: 'growth', label: 'Growth', value: '80', normalizedScore: 80, direction: 'improving', provenance: 'source' },
    { metric: 'conversion', label: 'Conversion', value: '66.7', normalizedScore: 66.7, direction: 'improving', provenance: 'source' }
  ]
};

const composite = {
  mode: 'composite',
  score: { label: 'Product health', value: 70, min: 0, max: 100, band: 'Watch', provenance: 'source' },
  model: {
    normalization: 'source_provided',
    aggregation: 'weighted_average',
    provenance: 'source',
    components: [
      { metric: 'retention', label: 'Retention', value: '60', normalizedScore: 60, weight: 1 / 3, provenance: 'source' },
      { metric: 'growth', label: 'Growth', value: '80', normalizedScore: 80, weight: 1 / 3, provenance: 'source' },
      { metric: 'conversion', label: 'Conversion', value: '70', normalizedScore: 70, weight: 1 / 3, provenance: 'source' }
    ],
    bands: [
      { label: 'Critical', min: 0, max: 50, provenance: 'source' },
      { label: 'Watch', min: 50, max: 75, provenance: 'source' },
      { label: 'Good', min: 75, max: 100, provenance: 'source' }
    ]
  }
};

function radarPath(markup) {
  return markup.match(/class="radar-shape radar-shape--current"[^>]*d="([^"]+)"/)?.[1] ?? null;
}

test('accepts 3 to 6 source-backed comparable dimensions without requiring an overall score', () => {
  assert.equal(validateDecisionState(scoredNoScore).valid, true);

  const six = structuredClone(scoredNoScore);
  six.signals.push(
    { metric: 'activation', label: 'Activation', value: '72', normalizedScore: 72, direction: 'improving', provenance: 'source' },
    { metric: 'adoption', label: 'Adoption', value: '58', normalizedScore: 58, direction: 'deteriorating', provenance: 'source' },
    { metric: 'expansion', label: 'Expansion', value: '75', normalizedScore: 75, direction: 'improving', provenance: 'source' }
  );
  assert.equal(validateDecisionState(six).valid, true);
});

test('renders three comparable dimensions as a closed triangular radar in SVG and HTML', () => {
  const svg = renderSvg(scoredNoScore);
  const html = renderHtml(scoredNoScore);

  assert.match(radarPath(svg), /^M[^Z]+L[^Z]+L[^Z]+Z$/);
  assert.match(radarPath(html), /^M[^Z]+L[^Z]+L[^Z]+Z$/);
});

test('renders four, five, and six dimensions with one radar vertex per dimension', () => {
  const extra = [
    { metric: 'activation', label: 'Activation', value: '72', normalizedScore: 72, direction: 'improving', provenance: 'source' },
    { metric: 'adoption', label: 'Adoption', value: '58', normalizedScore: 58, direction: 'deteriorating', provenance: 'source' },
    { metric: 'expansion', label: 'Expansion', value: '75', normalizedScore: 75, direction: 'improving', provenance: 'source' }
  ];

  for (const count of [4, 5, 6]) {
    const state = structuredClone(scoredNoScore);
    state.signals.push(...extra.slice(0, count - 3));
    const path = radarPath(renderSvg(state));
    assert.equal((path.match(/L/g) ?? []).length, count - 1, `${count} dimensions`);
    assert.match(path, /Z$/);
  }
});

test('renders composite normalized components as a closed radar profile', () => {
  assert.equal(validateDecisionState(composite).valid, true);
  assert.match(radarPath(renderSvg(composite)), /^M[^Z]+L[^Z]+L[^Z]+Z$/);
  assert.match(radarPath(renderHtml(composite)), /^M[^Z]+L[^Z]+L[^Z]+Z$/);
});

test('does not turn heterogeneous raw no-score KPIs into a radar polygon', () => {
  const raw = {
    mode: 'no_score',
    signals: [
      { metric: 'mrr', label: 'MRR', value: '$177,378', direction: 'improving', provenance: 'source' },
      { metric: 'customers', label: 'Customers', value: '8,942', direction: 'improving', provenance: 'source' },
      { metric: 'churn', label: 'Churn', value: '2.50%', direction: 'deteriorating', provenance: 'source' }
    ]
  };

  assert.equal(validateDecisionState(raw).valid, true);
  assert.equal(radarPath(renderSvg(raw)), null);
  assert.equal(radarPath(renderHtml(raw)), null);
});

test('accepts a complete source-backed previous-period profile', () => {
  const compared = structuredClone(scoredNoScore);
  compared.signals[0].previousNormalizedScore = 64;
  compared.signals[1].previousNormalizedScore = 76;
  compared.signals[2].previousNormalizedScore = 70;
  assert.equal(validateDecisionState(compared).valid, true);
  const svg = renderSvg(compared);
  assert.match(svg, /class="radar-shape radar-shape--previous"/);
  assert.ok(svg.indexOf('radar-shape radar-shape--previous') < svg.indexOf('radar-shape radar-shape--current'));
});

test('rejects partial or out-of-range previous-period profile values', () => {
  const partial = structuredClone(scoredNoScore);
  partial.signals[0].previousNormalizedScore = 64;
  assert.equal(validateDecisionState(partial).valid, false);

  const outOfRange = structuredClone(scoredNoScore);
  for (const signal of outOfRange.signals) signal.previousNormalizedScore = 60;
  outOfRange.signals[1].previousNormalizedScore = 120;
  assert.equal(validateDecisionState(outOfRange).valid, false);
});

test('rejects a derived signal inside an otherwise source-backed radar', () => {
  const derived = structuredClone(scoredNoScore);
  derived.signals[1].provenance = 'derived';
  assert.equal(validateDecisionState(derived).valid, false);
});

test('rejects partial, out-of-range, or fewer-than-three radar dimensions', () => {
  const partial = structuredClone(scoredNoScore);
  delete partial.signals[2].normalizedScore;
  assert.equal(validateDecisionState(partial).valid, false);

  const outOfRange = structuredClone(scoredNoScore);
  outOfRange.signals[0].normalizedScore = 120;
  assert.equal(validateDecisionState(outOfRange).valid, false);

  const tooFew = structuredClone(scoredNoScore);
  tooFew.signals = tooFew.signals.slice(0, 2);
  assert.equal(validateDecisionState(tooFew).valid, false);
});
