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

test('worthiness requires a recurring decision owner and action path', () => {
  assert.match(skill, /recurring decision/i);
  assert.match(skill, /clear owner|accountable owner|decision owner/i);
  assert.match(skill, /action[^\n]*changes|changes[^\n]*action/i);
  assert.match(skill, /visibility[^\n]*not[^\n]*(decision|sufficient)|visibility alone[^\n]*insufficient/i);
});

test('an unworthy request is redirected instead of forced into a dashboard', () => {
  assert.match(skill, /do not (build|force|render)[^\n]*dashboard/i);

  for (const alternative of ['one-off analysis', 'scheduled summary', 'alert', 'report', 'chat']) {
    assert.match(skill, new RegExp(alternative, 'i'), `missing ${alternative} alternative`);
  }
});

test('README explains that the skill can refuse an unnecessary dashboard', () => {
  assert.match(readme, /does this need to be a dashboard at all|deserves to (exist|be a dashboard)/i);
  assert.match(readme, /recurring decision/i);
  assert.match(readme, /one-off analysis|scheduled summary|alert/i);
});
