import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateDecisionState } from '../../skills/decision-first-dashboard/scripts/validate.js';

const radarState = JSON.parse(
  fs.readFileSync(new URL('../../examples/radar-profile/input.no-score.json', import.meta.url), 'utf8')
);
const skill = fs.readFileSync(new URL('../../skills/decision-first-dashboard/SKILL.md', import.meta.url), 'utf8');
const visualPattern = fs.readFileSync(
  new URL('../../skills/decision-first-dashboard/references/visual-pattern.md', import.meta.url),
  'utf8'
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('decision-state validation rejects framework/method copy that would leak into visible UI', () => {
  const candidate = clone(radarState);
  candidate.signals[0].label = 'Primary Decision';
  candidate.signals[1].label = 'Source-grounded';

  const result = validateDecisionState(candidate);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === 'uiCopyFirewall'));
});

test('UI copy firewall blocks the Zepto regression vocabulary', () => {
  const forbidden = [
    'Decision-first inventory view',
    'Primary Decision',
    'Source-grounded',
    'Attention Surface',
    'Review Order',
    'Design Readout',
    'After Concept',
    'No synthetic score'
  ];

  for (const phrase of forbidden) {
    const candidate = clone(radarState);
    candidate.signals[0].label = phrase;
    const result = validateDecisionState(candidate);
    assert.equal(result.valid, false, `expected visible copy firewall to reject: ${phrase}`);
    assert.ok(result.errors.some((error) => error.keyword === 'uiCopyFirewall'));
  }
});

test('skill already requires deterministic rendering rather than agent-authored UI', () => {
  assert.match(skill, /may not.*choose a free-form dashboard layout during ordinary compilation/is);
  assert.match(skill, /The agent must not render UI/i);
  assert.match(skill, /no compiler\/framework methodology labels in visible UI/i);
  assert.match(skill, /The Decision Brief is internal design context/i);
});

test('visual reference defines a closed visible-copy policy and language preservation', () => {
  assert.match(visualPattern, /Visible-copy closed world/i);
  assert.match(visualPattern, /source-grounded visible fields/i);
  assert.match(visualPattern, /fixed neutral renderer vocabulary/i);
  assert.match(visualPattern, /do not translate or make the dashboard bilingual/i);
  assert.match(visualPattern, /Decision-First changes information hierarchy, not the voice of the dashboard/i);
});
