import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skill = fs.readFileSync(path.join(root, 'skills/decision-first-dashboard/SKILL.md'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

test('skill evaluates dashboard worthiness before the Decision Brief', () => {
  const worthinessIndex = skill.indexOf('Dashboard Worthiness Test');
  const briefIndex = skill.indexOf('Build an adaptive Decision Brief');

  assert.ok(worthinessIndex >= 0, 'missing Dashboard Worthiness Test');
  assert.ok(briefIndex >= 0, 'missing Decision Brief workflow step');
  assert.ok(worthinessIndex < briefIndex, 'worthiness must be evaluated before the Decision Brief');
});

test('worthiness requires a recurring loop, accountability path, and response change', () => {
  assert.match(skill, /recurring decision|recurring monitoring/i);
  assert.match(skill, /accountability path/i);
  assert.match(skill, /shared forum|shared decision forum/i);
  assert.match(skill, /action[^\n]*changes|changes[^\n]*action|priority[^\n]*changes|coordination[^\n]*changes/i);
  assert.match(skill, /visibility[^\n]*not[^\n]*(decision|sufficient)|visibility alone[^\n]*insufficient/i);
});

test('skill documents the machine-readable worthiness gate', () => {
  assert.match(skill, /worthiness-assessment\.schema\.json/i);
  assert.match(skill, /BUILD_DECISION_BRIEF/);
  assert.match(skill, /ASK_WORTHINESS_QUESTION/);
  assert.match(skill, /REDIRECT_NON_DASHBOARD/);
  assert.match(skill, /FIX_WORTHINESS_ASSESSMENT/);
  assert.match(skill, /agent[^\n]*does not[^\n]*(choose|own|set)[^\n]*(transition|next)|compiler[^\n]*(owns|decides)[^\n]*(transition|next)/i);
});

test('an unworthy request is redirected instead of forced into a dashboard', () => {
  assert.match(skill, /do not (build|force|render)[^\n]*dashboard/i);

  for (const alternative of ['one-off analysis', 'scheduled summary', 'alert', 'report', 'chat']) {
    assert.match(skill, new RegExp(alternative, 'i'), `missing ${alternative} alternative`);
  }
});

test('README explains both refusal and the executable gate boundary', () => {
  assert.match(readme, /does this need to be a dashboard at all|deserves to (exist|be a dashboard)/i);
  assert.match(readme, /accountability path/i);
  assert.match(readme, /worthiness-assessment\.schema\.json/i);
  assert.match(readme, /does not prove[^\n]*(agent|model)|cannot prove[^\n]*(agent|model)|semantic[^\n]*(still|remains)[^\n]*(agent|model)/i);
});
