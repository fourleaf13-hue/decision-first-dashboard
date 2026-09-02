import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSvg } from '../../skills/decision-first-dashboard/scripts/render.js';

const fixture = JSON.parse(
  fs.readFileSync(new URL('../../examples/saas/input.no-score.json', import.meta.url), 'utf8')
);

function extraSignals() {
  return [
    { metric: 'nrr', label: 'NRR', value: '96.8%', delta: '-0.4pp', direction: 'deteriorating', provenance: 'source' },
    { metric: 'expansion', label: 'Expansion', value: '$21,100', delta: '+14%', direction: 'improving', provenance: 'source' }
  ];
}

test('renders a dominant no-score synthesis cluster from validated data', () => {
  const svg = renderSvg(fixture);
  assert.match(svg, /Subscription health/);
  assert.match(svg, /IMPROVING/);
  assert.match(svg, /Target unknown/);
  assert.match(svg, /\+12\.4%/);
  assert.match(svg, /\+8\.1%/);
  assert.match(svg, /-0\.6pp/);
  assert.match(svg, /\+3\.2%/);
});

test('derives mixed overall direction from conflicting signal directions', () => {
  const mixed = structuredClone(fixture);
  mixed.signals[2].direction = 'deteriorating';
  const svg = renderSvg(mixed);
  assert.match(svg, />MIXED</);
  assert.doesNotMatch(svg, />IMPROVING</);
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

test('does not leak framework, compiler, or fabricated verdict copy', () => {
  const svg = renderSvg(fixture);
  assert.doesNotMatch(
    svg,
    /Executive Decision Dashboard|Primary Decision|Diagnostic Context|Required Interventions|HEALTH GOOD|Healthy|Marginal|No composite score|Decision-first view|Directional evidence is improving/
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
