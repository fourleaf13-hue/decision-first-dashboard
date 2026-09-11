import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../..');
const packScript = path.join(repoRoot, 'scripts', 'stage-claude-skill.mjs');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'compiler-tests.yml');
const readmePath = path.join(repoRoot, 'README.md');

function listRelativeFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else files.push(path.relative(root, absolute).replaceAll('\\\\', '/'));
    }
  };
  walk(root);
  return files.sort();
}

test('Claude upload package stages the skill with SKILL.md at ZIP root and no plugin manifest', () => {
  assert.equal(fs.existsSync(packScript), true, 'expected scripts/stage-claude-skill.mjs to exist');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-claude-skill-'));
  const outDir = path.join(tempRoot, 'skill');
  const run = spawnSync(process.execPath, [packScript, outDir], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(fs.existsSync(path.join(outDir, 'SKILL.md')), true, 'SKILL.md must be at package root');
  assert.equal(fs.existsSync(path.join(outDir, '.claude-plugin', 'plugin.json')), false);

  const skillText = fs.readFileSync(path.join(outDir, 'SKILL.md'), 'utf8');
  assert.match(skillText, /^---\nname:\s*decision-first-dashboard\ndescription:\s*.+\n---/s);

  const files = listRelativeFiles(outDir);
  assert.ok(files.some((file) => file.startsWith('scripts/')), 'scripts must be packaged');
  assert.ok(files.some((file) => file.startsWith('schemas/')), 'schemas must be packaged');
  assert.ok(files.some((file) => file.startsWith('templates/')), 'templates must be packaged');
  assert.ok(files.some((file) => file.startsWith('references/')), 'references must be packaged');
  assert.equal(files.some((file) => file.includes('.claude-plugin/')), false, 'plugin manifest must never enter skill upload package');
});

test('CI publishes a Claude-ready artifact instead of the whole repository ZIP', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /npm run package:claude-skill/);
  assert.match(workflow, /name:\s*decision-first-dashboard-skill/);
  assert.match(workflow, /path:\s*dist\/claude-skill\//);
});

test('README tells Claude users to use the dedicated skill artifact, not GitHub Download ZIP', () => {
  const readme = fs.readFileSync(readmePath, 'utf8');
  assert.match(readme, /Claude.*Upload skill/is);
  assert.match(readme, /decision-first-dashboard-skill/i);
  assert.match(readme, /do not use.*Download ZIP/is);
});
