import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSvg, deriveOverallDirection } from '../../skills/decision-first-dashboard/scripts/render.js';

const fixture = JSON.parse(
  fs.readFileSync(new URL('../../examples/saas/input.no-score.json', import.meta.url), 'utf8')
);

function extraSignals() {
  return [
    { metric: 'nrr', label: 'NRR', value: '96.8%', delta: '-0.4pp', direction: 'deteriorating', provenance: 'source' },
    { metric: 'expansion', label: 'Expansion', value: '$21,100', delta: '+14%', direction: 'improving', provenance: 'source' }
  ];
}

function pointInTimeFixture() {
  return {
    mode: 'no_score',
    signals: [
      { metric: 'arr', label: 'ARR', value: '$4.98M', provenance: 'source' },
      { metric: 'ndr', label: 'NDR', value: '80.7%', provenance: 'source' },
      { metric: 'gross_margin', label: 'Gross Margin', value: '88.9%', provenance: 'source' },
      { metric: 'cac_payback', label: 'CAC Payback', value: '9.4 mo', provenance: 'source' },
      { metric: 'burn_multiple', label: 'Burn Multiple', value: '1.5x', provenance: 'source' }
    ]
  };
}

function inventoryFixture() {
  return {
    mode: 'no_score',
    signals: [
      { metric: 'out_of_stock_products', label: 'Out of Stock Products', value: '453', provenance: 'source' },
      { metric: 'low_stock_share', label: 'Low Stock', value: '14.61%', provenance: 'source' },
      { metric: 'average_discount', label: 'Average Discount', value: '7.62%', provenance: 'source' }
    ],
    exceptions: [],
    events: []
  };
}

test('renders a dominant no-score signal cluster without a synthetic center verdict', () => {
  const svg = renderSvg(fixture);
  assert.match(svg, /Current overview/);
  assert.doesNotMatch(svg, />IMPROVING<|Target unknown|OVERALL DIRECTION/);
  assert.match(svg, /\+12\.4%/);
  assert.match(svg, /\+8\.1%/);
  assert.match(svg, /-0\.6pp/);
  assert.match(svg, /\+3\.2%/);
});

test('keeps direction derivation available without rendering it as a verdict', () => {
  const mixed = structuredClone(fixture);
  mixed.signals[2].direction = 'deteriorating';
  assert.equal(deriveOverallDirection(mixed.signals), 'mixed');
  const svg = renderSvg(mixed);
  assert.doesNotMatch(svg, />MIXED<|>IMPROVING</);
});

test('renders exactly three signals without inventing a fourth slot', () => {
  const three = structuredClone(fixture);
  three.signals = three.signals.slice(0, 3);
  const svg = renderSvg(three);
  assert.match(svg, />MRR</);
  assert.match(svg, />Customers</);
  assert.match(svg, />Churn</);
  assert.doesNotMatch(svg, /Trial conversion|Signal 4/);
});

test('renders all six supported signals instead of silently dropping extras', () => {
  const six = structuredClone(fixture);
  six.signals.push(...extraSignals());
  const svg = renderSvg(six);
  for (const label of ['MRR', 'Customers', 'Churn', 'Trial conversion', 'NRR', 'Expansion']) {
    assert.match(svg, new RegExp(`>${label}<`));
  }
});

test('keeps confirmed exceptions and events compact on the right', () => {
  const svg = renderSvg(fixture);
  assert.match(svg, /Accounts to watch/);
  assert.match(svg, /Dovetail/);
  assert.match(svg, /At risk/);
  assert.match(svg, /Plan cancelled/);
  assert.match(svg, /Trial converted/);
});

test('uses a domain-neutral adaptive fallback for non-radar inventory snapshots', () => {
  const svg = renderSvg(inventoryFixture());
  for (const forbidden of [
    'Subscription health',
    'Revenue context',
    'Revenue metric unavailable',
    'Trend data unavailable',
    'Movement context',
    'No additional movement signals',
    'Accounts to watch',
    'No confirmed exceptions visible',
    'Recent events',
    'No recent source-supported events'
  ]) {
    assert.doesNotMatch(svg, new RegExp(forbidden));
  }
  assert.match(svg, /signal-lead/);
  assert.doesNotMatch(svg, /class="orbit-spokes"/);
  assert.match(svg, />453</);
  assert.match(svg, />Out of Stock Products</);
  assert.match(svg, />14\.61%</);
  assert.match(svg, />7\.62%</);
});

test('does not leak framework, compiler, or fabricated verdict copy', () => {
  const svg = renderSvg(fixture);
  assert.doesNotMatch(
    svg,
    /Executive Decision Dashboard|Primary Decision|Diagnostic Context|Required Interventions|HEALTH GOOD|Healthy|Marginal|No composite score|Decision-first view|Directional evidence is improving|OVERALL DIRECTION|Target unknown/
  );
});

test('is deterministic and leaves no unresolved template placeholders', () => {
  const first = renderSvg(fixture);
  const second = renderSvg(structuredClone(fixture));
  assert.equal(first, second);
  assert.doesNotMatch(first, /{{[^}]+}}/);
});

test('refuses to render a payload that fails the decision-state schema', () => {
  const bad = structuredClone(fixture);
  bad.score = { value: 68 };
  assert.throws(() => renderSvg(bad), /failed schema validation/);
});

test('renders point-in-time KPI values prominently without blank movement labels', () => {
  const svg = renderSvg(pointInTimeFixture());
  for (const value of ['$4.98M', '80.7%', '88.9%', '9.4 mo', '1.5x']) {
    assert.match(svg, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(svg, />UNKNOWN</);
  assert.doesNotMatch(svg, />\s*<\/text>/);
  assert.doesNotMatch(svg, /undefined/);
});

test('does not invent SaaS revenue chrome for a point-in-time ARR signal', () => {
  const svg = renderSvg(pointInTimeFixture());
  assert.match(svg, /\$4\.98M/);
  assert.doesNotMatch(svg, /ARR context|Current ARR|Current MRR|vs last month|Trend data unavailable/);
});