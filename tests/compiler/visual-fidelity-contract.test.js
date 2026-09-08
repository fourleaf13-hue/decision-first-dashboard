import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSvg, renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

const composite = {
  mode: 'composite',
  score: { label: 'Subscription health', value: 68, min: 0, max: 100, band: 'At risk', provenance: 'source' },
  model: {
    normalization: 'source_provided',
    aggregation: 'weighted_average',
    provenance: 'source',
    components: [
      { metric: 'retention', label: 'Retention', value: '60', normalizedScore: 60, weight: 0.4, provenance: 'source' },
      { metric: 'growth', label: 'Growth', value: '80', normalizedScore: 80, weight: 0.3, provenance: 'source' },
      { metric: 'conversion', label: 'Conversion', value: '66.7', normalizedScore: 66.7, weight: 0.3, provenance: 'source' }
    ],
    bands: [
      { label: 'Critical', min: 0, max: 50, provenance: 'source' },
      { label: 'At risk', min: 50, max: 75, provenance: 'source' },
      { label: 'Good', min: 75, max: 100, provenance: 'source' }
    ]
  },
  scoreSeries: [52, 58, 61, 65, 67, 68],
  exceptions: [
    { account: 'Northstar', detail: 'Enterprise · $7,200 MRR', status: 'At risk', provenance: 'source' }
  ],
  events: [
    { account: 'Northstar', event: 'Plan downgrade requested', occurredAt: '2 hr ago', provenance: 'source' }
  ]
};

test('composite SVG uses the open reference composition instead of three boxed columns', () => {
  const svg = renderSvg(composite);

  assert.match(svg, /<circle cx="740" cy="458" r="306" class="center-field"\/?>/);
  assert.equal((svg.match(/class="radar-guide"/g) ?? []).length, 3);
  assert.match(svg, /<circle cx="740" cy="458" r="68" class="score-core"\/?>/);
  assert.doesNotMatch(svg, /class="card"/);
});

test('HTML mirrors the open reference layout with a dominant circular center field', () => {
  const html = renderHtml(composite);

  assert.match(html, /grid-template-columns:\s*286px\s+minmax\(580px,\s*1fr\)\s+330px/);
  assert.match(html, /\.card\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;/);
  assert.match(html, /\.synthesis-card::before\s*\{[\s\S]*?width:\s*640px;[\s\S]*?height:\s*640px;/);
});
