import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

const fixture = JSON.parse(
  fs.readFileSync(new URL('../../examples/saas/input.no-score.json', import.meta.url), 'utf8')
);

test('renders the same canonical decision state into a fixed HTML composition', () => {
  const html = renderHtml(fixture);
  assert.match(html, /Subscription health/);
  assert.match(html, /IMPROVING/);
  assert.match(html, /Target unknown/);
  assert.match(html, /\$184,320/);
  assert.match(html, /Dovetail/);
  assert.match(html, /Plan cancelled/);
});

test('renders an intentionally styled unavailable state instead of an invented trend line', () => {
  const html = renderHtml(fixture);
  assert.match(html, /Trend data unavailable/);
  assert.match(html, /\.trend-unavailable\s*\{/);
  assert.doesNotMatch(html, /aria-label="Revenue trend"/);
});

test('renders a trend line only when an exact source-supported series is supplied', () => {
  const sourced = structuredClone(fixture);
  sourced.context = { revenueSeries: [100, 120, 140], provenance: 'source' };
  const html = renderHtml(sourced);
  assert.match(html, /aria-label="Revenue trend"/);
  assert.doesNotMatch(html, /Trend data unavailable/);
});

test('does not expose layout freedom as KPI grids, tables, or action controls', () => {
  const html = renderHtml(fixture);
  assert.doesNotMatch(html, /<table\b/i);
  assert.doesNotMatch(html, /<button\b/i);
  assert.doesNotMatch(
    html,
    /kpi-grid|grid-cols-4|Executive Decision Dashboard|Primary Decision|Diagnostic Context|Required Interventions|HEALTH GOOD|Healthy|Marginal|Decision-first view|No composite score/
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
