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

test('does not expose layout freedom as KPI grids, tables, or action controls', () => {
  const html = renderHtml(fixture);
  assert.doesNotMatch(html, /<table\b/i);
  assert.doesNotMatch(html, /<button\b/i);
  assert.doesNotMatch(html, /kpi-grid|grid-cols-4|Executive Decision Dashboard|Primary Decision|Diagnostic Context|Required Interventions|HEALTH GOOD|Healthy|Marginal/);
});
