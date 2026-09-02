import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSvg } from '../../skills/decision-first-dashboard/scripts/render.js';

const fixture = JSON.parse(
  fs.readFileSync(new URL('../../examples/saas/input.no-score.json', import.meta.url), 'utf8')
);

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
  delete mixed.synthesis.direction;
  mixed.signals[2].direction = 'deteriorating';
  const svg = renderSvg(mixed);
  assert.match(svg, />MIXED</);
  assert.doesNotMatch(svg, />IMPROVING</);
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
