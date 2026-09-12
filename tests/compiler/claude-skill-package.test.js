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
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const requiredRuntimeFiles = [
  'scripts/preflight.js',
  'scripts/worthiness.js',
  'scripts/intake.js',
  'scripts/routing.js',
  'scripts/grounding.js',
  'scripts/compile-dashboard.js',
  'scripts/render.js',
  'schemas/worthiness-assessment.schema.json',
  'schemas/decision-brief.schema.json',
  'schemas/metric-routing.schema.json',
  'schemas/grounded-bundle.schema.json',
  'schemas/decision-state.schema.json'
];

function listRelativeFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  };
  walk(root);
  return files.sort();
}

function stageSkill() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-claude-skill-'));
  const outDir = path.join(tempRoot, 'skill');
  const run = spawnSync(process.execPath, [packScript, outDir], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  return { tempRoot, outDir };
}

test('Claude upload package stages the complete production skill with build provenance', () => {
  assert.equal(fs.existsSync(packScript), true, 'expected scripts/stage-claude-skill.mjs to exist');

  const { outDir } = stageSkill();
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

  for (const relativePath of requiredRuntimeFiles) {
    assert.equal(fs.existsSync(path.join(outDir, relativePath)), true, `${relativePath} must be packaged`);
  }

  const buildInfoPath = path.join(outDir, 'BUILD_INFO.json');
  assert.equal(fs.existsSync(buildInfoPath), true, 'BUILD_INFO.json must be packaged');
  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
  assert.equal(buildInfo.schemaVersion, 1);
  assert.equal(buildInfo.skillName, 'decision-first-dashboard');
  assert.equal(buildInfo.skillVersion, packageJson.version);
  assert.match(buildInfo.sourceCommit, /^[0-9a-f]{40}$/i);
  assert.equal(typeof buildInfo.sourceBranch, 'string');
  assert.ok(buildInfo.sourceBranch.length > 0);
  assert.equal(Number.isNaN(Date.parse(buildInfo.builtAt)), false);
  assert.equal(buildInfo.requiredEntrypoint, 'scripts/compile-dashboard.js');
  for (const relativePath of requiredRuntimeFiles) {
    assert.ok(buildInfo.requiredRuntimeFiles.includes(relativePath));
  }
});

test('staged skill preflight rejects an incomplete or stale package', () => {
  const { outDir } = stageSkill();
  fs.rmSync(path.join(outDir, 'scripts', 'compile-dashboard.js'));

  const run = spawnSync(process.execPath, [path.join(outDir, 'scripts', 'preflight.js')], {
    cwd: outDir,
    encoding: 'utf8'
  });

  assert.notEqual(run.status, 0, 'preflight must fail when the production compiler is missing');
  const result = JSON.parse(run.stderr.trim());
  assert.equal(result.valid, false);
  assert.equal(result.code, 'SKILL_PACKAGE_INCOMPLETE_OR_OUTDATED');
  assert.match(result.message, /incomplete or outdated/i);
  assert.ok(result.errors.some((error) => error.includes('scripts/compile-dashboard.js')));
});

test('staged skill preflight passes and the staged package executes the canonical compiler', () => {
  const { tempRoot, outDir } = stageSkill();
  const preflight = spawnSync(process.execPath, [path.join(outDir, 'scripts', 'preflight.js')], {
    cwd: outDir,
    encoding: 'utf8'
  });
  assert.equal(preflight.status, 0, preflight.stderr || preflight.stdout);
  const preflightResult = JSON.parse(preflight.stdout.trim());
  assert.equal(preflightResult.valid, true);
  assert.equal(preflightResult.code, 'SKILL_PACKAGE_READY');
  assert.equal(preflightResult.mode, 'packaged_skill');

  const outputDir = path.join(tempRoot, 'compiled');
  const fixture = (relativePath) => path.join(repoRoot, 'tests', 'compiler', 'fixtures', relativePath);
  const compile = spawnSync(process.execPath, [
    path.join(outDir, 'scripts', 'compile-dashboard.js'),
    fixture('worthiness/dashboard.worthiness.json'),
    fixture('intake/confirmed.decision-brief.json'),
    fixture('routing/no-score.routing.json'),
    fixture('grounding/no-score.grounded.json'),
    outputDir
  ], {
    cwd: outDir,
    encoding: 'utf8'
  });

  assert.equal(compile.status, 0, compile.stderr || compile.stdout);
  const htmlPath = path.join(outputDir, 'output.no-score.html');
  const svgPath = path.join(outputDir, 'output.no-score.svg');
  const manifestPath = path.join(outputDir, 'output.manifest.json');
  assert.equal(fs.existsSync(htmlPath), true, 'staged compiler must emit canonical HTML');
  assert.equal(fs.existsSync(svgPath), true, 'staged compiler must emit canonical SVG');
  assert.equal(fs.existsSync(manifestPath), true, 'staged compiler must emit output.manifest.json');
  assert.match(fs.readFileSync(htmlPath, 'utf8'), /decision-first-renderer=canonical/);
});

test('CI publishes a Claude-ready artifact from main instead of the whole repository ZIP', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /npm run package:claude-skill/);
  assert.match(workflow, /name:\s*decision-first-dashboard-skill/);
  assert.match(workflow, /path:\s*dist\/claude-skill\//);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
});

test('README tells Claude users to use the dedicated skill artifact, not GitHub Download ZIP', () => {
  const readme = fs.readFileSync(readmePath, 'utf8');
  assert.match(readme, /Claude.*Upload skill/is);
  assert.match(readme, /decision-first-dashboard-skill/i);
  assert.match(readme, /do not use.*Download ZIP/is);
});
