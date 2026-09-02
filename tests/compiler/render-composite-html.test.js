import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

const fixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/composite.valid.json', import.meta.url), 'utf8')
);

test('renders a dominant composite score in fixed HTML composition', () => {
  const html = renderHtml(fixture);
  assert.match(html, /Subscription health/);
  assert.match(html, />68</);
  assert.match(html, /\/ 100/);
  assert.match(html, /At risk/);
  assert.match(html, /score-center/);
});

test('renders every weighted score component and source score trend', () => {
  const html = renderHtml(fixture);
  for (const label of ['Retention', 'Growth', 'Conversion']) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.match(html, /40%/);
  assert.match(html, /30%/);
  assert.match(html, /aria-label="Score trend"/);
});

test('keeps exceptions and events compact without KPI grids or tables', () => {
  const html = renderHtml(fixture);
  assert.match(html, /Northstar/);
  assert.match(html, /Plan downgrade requested/);
  assert.doesNotMatch(html, /<table\b/i);
  assert.doesNotMatch(html, /<button\b/i);
  assert.doesNotMatch(html, /kpi-grid|grid-cols-4/i);
});

test('does not leak composite methodology labels into HTML', () => {
  const html = renderHtml(fixture);
  assert.doesNotMatch(html, /Composite mode|Weighted average|Aggregation|Normalization|Decision|Driver|Diagnostic|Framework|Compiler/i);
});

test('composite HTML is deterministic and fully resolved', () => {
  const first = renderHtml(fixture);
  const second = renderHtml(structuredClone(fixture));
  assert.equal(first, second);
  assert.doesNotMatch(first, /{{[^}]+}}/);
});
