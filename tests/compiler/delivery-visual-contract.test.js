import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../..');
const skill = fs.readFileSync(path.join(repoRoot, 'skills', 'decision-first-dashboard', 'SKILL.md'), 'utf8');
const visual = fs.readFileSync(path.join(repoRoot, 'skills', 'decision-first-dashboard', 'references', 'visual-pattern.md'), 'utf8');
const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

test('HTML is the primary After deliverable and SVG is a preview/support artifact', () => {
  assert.match(skill, /primary After deliverable.*HTML/is);
  assert.match(skill, /SVG.*preview/is);
  assert.match(readme, /HTML.*primary.*deliverable/is);
});

test('soft attention is the default and hard alerts require explicit source-grounded alert semantics', () => {
  assert.match(skill, /soft attention.*default/is);
  assert.match(skill, /hard alert.*explicit.*source/is);
  assert.match(visual, /soft attention.*default/is);
  assert.match(visual, /hard alert.*explicit.*source/is);
});

test('a routed exception alone does not authorize alarm-heavy visual treatment', () => {
  assert.match(visual, /exception.*does not.*authorize.*hard alert/is);
  assert.match(visual, /large red.*background|red banner|alarm icon/is);
});
