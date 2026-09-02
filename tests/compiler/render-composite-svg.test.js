import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSvg } from '../../skills/decision-first-dashboard/scripts/render.js';

const fixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/composite.valid.json', import.meta.url), 'utf8')
);

test('renders a dominant composite score with its source-supported band', () => {
  const svg = renderSvg(fixture);
  assert.match(svg, /Subscription health/);
  assert.match(svg, />68</);
  assert.match(svg, /\/ 100/);
  assert.match(svg, /At risk/);
});

test('renders all weighted score components around the composite score', () => {
  const svg = renderSvg(fixture);
  for (const label of ['Retention', 'Growth', 'Conversion']) {
    assert.match(svg, new RegExp(`>${label}<`));
  }
  for (const score of ['60', '80', '66.7']) {
    assert.match(svg, new RegExp(score.replace('.', '\\.')));
  }
  for (const weight of ['40%', '30%']) {
    assert.match(svg, new RegExp(weight));
  }
});

test('renders source score trend plus compact exceptions and events', () => {
  const svg = renderSvg(fixture);
  assert.match(svg, /Score trend/);
  assert.match(svg, /Northstar/);
  assert.match(svg, /Plan downgrade requested/);
});

test('does not leak composite methodology labels into SVG', () => {
  const svg = renderSvg(fixture);
  assert.doesNotMatch(svg, /Composite mode|Weighted average|Aggregation|Normalization|Decision|Driver|Diagnostic|Framework|Compiler/i);
});

test('composite SVG is deterministic and fully resolved', () => {
  const first = renderSvg(fixture);
  const second = renderSvg(structuredClone(fixture));
  assert.equal(first, second);
  assert.doesNotMatch(first, /{{[^}]+}}/);
});
