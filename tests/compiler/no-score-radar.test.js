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

function radarPath(markup) {
  return markup.match(/class="radar-shape"[^>]*d="([^"]+)"/)?.[1] ?? null;
}

test('no-score accepts 3 to 6 source-backed comparable dimension scores without an overall score', () => {
  assert.equal(validateDecisionState(scoredNoScore).valid, true);

  const six = structuredClone(scoredNoScore);
  six.signals.push(
    { metric: 'activation', label: 'Activation', value: '72', normalizedScore: 72, direction: 'improving', provenance: 'source' },
    { metric: 'adoption', label: 'Adoption', value: '58', normalizedScore: 58, direction: 'deteriorating', provenance: 'source' },
    { metric: 'expansion', label: 'Expansion', value: '75', normalizedScore: 75, direction: 'improving', provenance: 'source' }
  );
  assert.equal(validateDecisionState(six).valid, true);
});

test('no-score renders a true closed radar without an empty center badge', () => {
  const svg = renderSvg(scoredNoScore);
  const html = renderHtml(scoredNoScore);

  assert.match(radarPath(svg), /^M[^Z]+L[^Z]+L[^Z]+Z$/);
  assert.match(radarPath(html), /^M[^Z]+L[^Z]+L[^Z]+Z$/);

  // Keep the large white backing plate.
  assert.match(svg, /class="radar-plate"/);
  assert.match(html, /class="radar-plate"/);

  // No overall score exists in no_score radar mode, so the small center badge
  // and fallback copy must not cover the radar polygon.
  assert.doesNotMatch(svg, /<circle cx="698" cy="464" r="(?:58|50)"/);
  assert.doesNotMatch(svg, />(?:MIXED|IMPROVING|DETERIORATING|FLAT|UNKNOWN)</);
  assert.doesNotMatch(svg, /Target unknown/);
  assert.doesNotMatch(html, /class="synthesis-core"/);
  assert.doesNotMatch(html, />(?:MIXED|IMPROVING|DETERIORATING|FLAT|UNKNOWN)</);
  assert.doesNotMatch(html, /Target unknown/);
  assert.doesNotMatch(svg, />68<|\/ 100/);
});

test('raw heterogeneous no-score KPIs do not masquerade as a radar chart', () => {
  const raw = {
    mode: 'no_score',
    signals: [
      { metric: 'mrr', label: 'MRR', value: '$177,378', direction: 'improving', provenance: 'source' },
      { metric: 'net_revenue', label: 'Net Revenue', value: '$164,889', delta: '+11.7%', direction: 'improving', provenance: 'source' },
      { metric: 'churn', label: 'Churn', value: '2.50%', direction: 'deteriorating', provenance: 'source' }
    ]
  };
  assert.equal(validateDecisionState(raw).valid, true);
  assert.equal(radarPath(renderSvg(raw)), null);
  assert.equal(radarPath(renderHtml(raw)), null);
});

test('radar scale requires every rendered dimension to carry a comparable score and at least three dimensions', () => {
  const partial = structuredClone(scoredNoScore);
  delete partial.signals[2].normalizedScore;
  assert.equal(validateDecisionState(partial).valid, false);

  const tooFew = structuredClone(scoredNoScore);
  tooFew.signals = tooFew.signals.slice(0, 2);
  assert.equal(validateDecisionState(tooFew).valid, false);
});

test('no-score radar scores must stay inside their declared source-backed scale', () => {
  const bad = structuredClone(scoredNoScore);
  bad.signals[0].normalizedScore = 120;
  assert.equal(validateDecisionState(bad).valid, false);
});
