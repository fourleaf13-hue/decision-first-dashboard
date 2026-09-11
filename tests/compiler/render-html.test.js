import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

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

test('renders the same canonical decision state into a fixed HTML composition without a center verdict', () => {
  const html = renderHtml(fixture);
  assert.match(html, /Current overview/);
  assert.doesNotMatch(html, />IMPROVING<|Target unknown|OVERALL DIRECTION/);
  assert.match(html, /\$184,320/);
  assert.match(html, /Dovetail/);
  assert.match(html, /Plan cancelled/);
});

test('renders every signal in the supported 3 to 6 range', () => {
  const three = structuredClone(fixture);
  three.signals = three.signals.slice(0, 3);
  const threeHtml = renderHtml(three);
  assert.match(threeHtml, />Churn</);
  assert.doesNotMatch(threeHtml, /Trial conversion|Signal 4/);

  const six = structuredClone(fixture);
  six.signals.push(...extraSignals());
  const sixHtml = renderHtml(six);
  for (const label of ['MRR', 'Customers', 'Churn', 'Trial conversion', 'NRR', 'Expansion']) {
    assert.match(sixHtml, new RegExp(`>${label}<`));
  }
});

test('collapses unavailable support modules instead of rendering placeholder cards', () => {
  const html = renderHtml(pointInTimeFixture());
  assert.doesNotMatch(html, /Trend data unavailable|Revenue metric unavailable|No additional movement signals/);
  assert.doesNotMatch(html, /ARR context|Current ARR/);
});

test('renders a trend card only when an exact source-supported series is supplied', () => {
  const sourced = structuredClone(fixture);
  sourced.context = { revenueSeries: [100, 120, 140], provenance: 'source' };
  const html = renderHtml(sourced);
  assert.match(html, /aria-label="Revenue trend"/);
  assert.doesNotMatch(html, /Trend data unavailable/);
});

test('uses a domain-neutral adaptive fallback for non-radar inventory snapshots', () => {
  const html = renderHtml(inventoryFixture());
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
    assert.doesNotMatch(html, new RegExp(forbidden));
  }
  assert.match(html, /decision-layout--center-only/);
  assert.match(html, /signal-focus/);
  assert.match(html, /signal-lead/);
  assert.doesNotMatch(html, /class="orbit-spokes"/);
  assert.match(html, />453</);
  assert.match(html, />Out of Stock Products</);
  assert.match(html, />14\.61%</);
  assert.match(html, />7\.62%</);
});

test('does not expose layout freedom as KPI grids, tables, action controls, or synthetic center verdicts', () => {
  const html = renderHtml(fixture);
  assert.doesNotMatch(html, /<table\b/i);
  assert.doesNotMatch(html, /<button\b/i);
  assert.doesNotMatch(
    html,
    /kpi-grid|grid-cols-4|Executive Decision Dashboard|Primary Decision|Diagnostic Context|Required Interventions|HEALTH GOOD|Healthy|Marginal|Decision-first view|No composite score|OVERALL DIRECTION|Target unknown/
  );
});

test('is deterministic and leaves no unresolved template placeholders', () => {
  const first = renderHtml(fixture);
  const second = renderHtml(structuredClone(fixture));
  assert.equal(first, second);
  assert.doesNotMatch(first, /{{[^}]+}}/);
});

test('refuses to render a payload that fails the decision-state schema', () => {
  const bad = structuredClone(fixture);
  bad.exceptions[0].action = 'Contact';
  assert.throws(() => renderHtml(bad), /failed schema validation/);
});

test('does not invent SaaS revenue chrome for a point-in-time ARR signal', () => {
  const html = renderHtml(pointInTimeFixture());
  assert.match(html, /\$4\.98M/);
  assert.doesNotMatch(html, /ARR context|Current ARR|Current MRR|vs last month/);
});