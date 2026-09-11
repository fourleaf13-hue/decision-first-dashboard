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

test('skill requires deterministic output instead of free-form dashboard rendering', () => {
  assert.match(skill, /UI Copy Firewall \(mandatory\)/);
  assert.match(skill, /Do not hand-author, freestyle, or regenerate an alternate dashboard UI/i);
  assert.match(skill, /Decision Brief.*internal.*never.*visible UI copy/is);
  assert.match(skill, /preserve the source dashboard's primary language/i);
  assert.match(skill, /Decision-First changes information hierarchy, not the voice of the dashboard/i);
});

test('visual reference keeps copy provenance closed and method vocabulary out of product UI', () => {
  assert.match(visualPattern, /Visible-copy closed world/i);
  assert.match(visualPattern, /source-grounded visible fields/i);
  assert.match(visualPattern, /fixed neutral renderer vocabulary/i);
  assert.match(visualPattern, /do not translate or make the dashboard bilingual/i);
});
