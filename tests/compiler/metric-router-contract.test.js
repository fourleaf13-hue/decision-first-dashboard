import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skill = fs.readFileSync(path.join(root, 'skills/decision-first-dashboard/SKILL.md'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

const requiredRouterTerms = [
  'Metric Router',
  'Action Trigger Test',
  '70-KPI overload',
  'primary_signal',
  'diagnostic',
  'exception',
  'drilldown',
  'scorecard_only',
  'Preserve everything without showing everything'
];

test('skill defines the Metric Router contract for overloaded KPI sources', () => {
  for (const term of requiredRouterTerms) {
    assert.match(skill, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing ${term}`);
  }
});

test('skill documents the compiler-enforced routing manifest and production gate', () => {
  assert.match(skill, /metric-routing\.schema\.json/);
  assert.match(skill, /compile-dashboard\.js/);
  assert.match(skill, /FIX_METRIC_ROUTING/);
  assert.match(skill, /inventoryCount/);
  assert.match(skill, /active exceptions cannot be hidden/i);
  assert.match(skill, /surfacePath/);
  assert.match(skill, /first-view information budget/i);
});

test('README distinguishes no-score and composite examples without overstating capability', () => {
  assert.match(readme, /No-score mode — no unsupported score invented/);
  assert.match(readme, /Composite mode — when the evidence supports it/);
  assert.match(readme, /examples\/radar-profile\/output\.no-score\.svg/);
  assert.match(readme, /examples\/saas\/composite-mode\.png/);
  assert.equal(fs.existsSync(path.join(root, 'examples/saas/composite-mode.png')), true);
});

test('radar grounding contract remains present while Metric Router is added', () => {
  assert.match(skill, /Radar eligibility is independent of overall-score eligibility/);
  assert.match(skill, /3–6 peer dimensions/);
  assert.match(skill, /Fewer than three dimensions are not radar-eligible/);
  assert.match(skill, /source-grounded `normalizedScore`/);
  assert.match(skill, /Profile Test[\s\S]{0,500}Action Trigger Test/);
});
