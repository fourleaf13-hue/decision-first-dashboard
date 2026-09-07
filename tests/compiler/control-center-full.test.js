import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDecisionState } from '../../skills/decision-first-dashboard/scripts/validate.js';
import { renderSvg, renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

const controlCenter = {
  mode: 'no_score',
  signals: [
    { metric: 'mrr', label: 'MRR', value: '$177,378', delta: '+1.5%', direction: 'improving', provenance: 'source' },
    { metric: 'net_revenue', label: 'Net Revenue', value: '$164,889', delta: '+11.7%', direction: 'improving', provenance: 'source' },
    { metric: 'mrr_growth', label: 'MRR Growth', value: '1.50%', delta: '+247.6%', direction: 'improving', provenance: 'source' },
    { metric: 'user_churn', label: 'User Churn', value: '2.50%', delta: '-47.8%', direction: 'improving', provenance: 'source' },
    { metric: 'quick_ratio', label: 'Quick Ratio', value: '1.51', delta: '+79.8%', direction: 'improving', provenance: 'source' },
    { metric: 'active_customers', label: 'Active Customers', value: '947', delta: '+1.2%', direction: 'improving', provenance: 'source' }
  ],
  breakdown: [
    { label: 'New trials', value: '4', provenance: 'source' },
    { label: 'New customer', value: '1', delta: '+$50.00', direction: 'improving', provenance: 'source' },
    { label: 'Expansions', value: '2', delta: '+$65.94', direction: 'improving', provenance: 'source' },
    { label: 'Total change', value: '+$115.94', direction: 'improving', provenance: 'source' }
  ],
  events: [
    { subject: 'That Person', event: 'Paid $189', time: '2h ago', provenance: 'source' },
    { subject: 'Another Guy', event: 'Signed up', time: '2h ago', provenance: 'source' },
    { subject: 'Awesome Company', event: 'Refunded $189', time: '2h ago', provenance: 'source' },
    { subject: 'That Person', event: 'Paid $299.40', time: '6h ago', provenance: 'source' }
  ]
};

test('full Control Center input preserves business context, breakdown, and events without inventing radar scores', () => {
  assert.equal(validateDecisionState(controlCenter).valid, true);

  const svg = renderSvg(controlCenter);
  const html = renderHtml(controlCenter);

  for (const markup of [svg, html]) {
    assert.match(markup, /\$177,378/);
    assert.match(markup, /Net Revenue/);
    assert.match(markup, /\+11\.7%/);
    assert.match(markup, /Breakdown/);
    assert.match(markup, /New trials/);
    assert.match(markup, /\+\$115\.94/);
    assert.match(markup, /That Person/);
    assert.match(markup, /Paid \$189/);
    assert.doesNotMatch(markup, /class="radar-shape"/);
    assert.doesNotMatch(markup, /No confirmed exceptions visible|No recent source-supported events|Revenue metric unavailable|No additional movement signals/);
  }
});

test('Control Center total change renders as a right-aligned summary instead of colliding with its label', () => {
  const svg = renderSvg(controlCenter);
  const html = renderHtml(controlCenter);
  assert.match(svg, /<text x="1064"[^>]*>Total change<\/text>[\s\S]*?<text x="1342"[^>]*text-anchor="end">\+\$115\.94<\/text>/);
  assert.match(html, /breakdown-row breakdown-row--summary[\s\S]*?<span>Total change<\/span>[\s\S]*?<strong[^>]*>\+\$115\.94<\/strong>/);
});
