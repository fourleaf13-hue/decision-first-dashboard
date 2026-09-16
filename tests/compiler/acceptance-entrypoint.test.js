import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ensureRuntimeSkillBinding } from '../../skills/decision-first-dashboard/scripts/bind-runtime-skill.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../..');
const repoSkillPath = path.join(repoRoot, 'skills', 'decision-first-dashboard');
const acceptanceEntrypoint = path.join(repoRoot, 'scripts', 'run-acceptance.js');

function currentHead(checkoutRoot = repoRoot) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: checkoutRoot,
    encoding: 'utf8'
  }).trim();
}

function createRuntimeCopy() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-acceptance-entrypoint-'));
  const runtimeSkillPath = path.join(tempRoot, 'runtime', 'decision-first-dashboard');
  fs.mkdirSync(path.dirname(runtimeSkillPath), { recursive: true });
  fs.cpSync(repoSkillPath, runtimeSkillPath, { recursive: true });
  return { tempRoot, runtimeSkillPath };
}

function createSentinelPath() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-acceptance-sentinel-'));
  return {
    artifactPath: path.join(tempRoot, 'canonical-artifact.html'),
    resultPath: path.join(tempRoot, 'acceptance-result.json')
  };
}

function runFormalAcceptance(
  runtimeSkillPath,
  { artifactPath, resultPath },
  { acceptanceRepoRoot = repoRoot } = {}
) {
  const acceptanceCode = [
    "const fs = require('node:fs');",
    `fs.writeFileSync(${JSON.stringify(artifactPath)}, '<canonical-artifact/>');`,
    `fs.writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({ status: 'started' }));`
  ].join('\n');
  return spawnSync(process.execPath, [
    path.join(acceptanceRepoRoot, 'scripts', 'run-acceptance.js'),
    '--repo-root', acceptanceRepoRoot,
    '--runtime-skill-path', runtimeSkillPath,
    '--expected-repo-head', currentHead(acceptanceRepoRoot),
    '--run', process.execPath, '-e', acceptanceCode
  ], {
    cwd: acceptanceRepoRoot,
    encoding: 'utf8'
  });
}

function readReport(run) {
  assert.ok(run.stdout.trim(), `formal acceptance must emit a JSON provenance report; stderr: ${run.stderr}`);
  return JSON.parse(run.stdout.trim());
}

test('formal acceptance auto-runs provenance and blocks an exact copied runtime before execution', () => {
  const { runtimeSkillPath } = createRuntimeCopy();
  const outputPaths = createSentinelPath();

  const run = runFormalAcceptance(runtimeSkillPath, outputPaths);
  const report = readReport(run);

  assert.notEqual(run.status, 0);
  assert.equal(report.result, 'RUNTIME_PROVENANCE_FAIL');
  assert.equal(report.firstFailingCheck, 'STALE_RUNTIME_BINDING');
  assert.equal(report.stalenessRisk, true);
  assert.equal(fs.existsSync(outputPaths.artifactPath), false);
  assert.equal(fs.existsSync(outputPaths.resultPath), false);
});

test('formal acceptance blocks a runtime binding that resolves outside the repository Skill', () => {
  const { tempRoot } = createRuntimeCopy();
  const otherSkillPath = path.join(tempRoot, 'other', 'decision-first-dashboard');
  const runtimeSkillPath = path.join(tempRoot, 'runtime-link', 'decision-first-dashboard');
  fs.mkdirSync(path.dirname(otherSkillPath), { recursive: true });
  fs.cpSync(repoSkillPath, otherSkillPath, { recursive: true });
  ensureRuntimeSkillBinding({ repoSkillPath: otherSkillPath, runtimeSkillPath });
  const outputPaths = createSentinelPath();

  const run = runFormalAcceptance(runtimeSkillPath, outputPaths);
  const report = readReport(run);

  assert.notEqual(run.status, 0);
  assert.equal(report.result, 'RUNTIME_PROVENANCE_FAIL');
  assert.equal(report.firstFailingCheck, 'PHYSICAL_TARGET_MISMATCH');
  assert.equal(fs.existsSync(outputPaths.artifactPath), false);
  assert.equal(fs.existsSync(outputPaths.resultPath), false);
});

test('formal acceptance starts only after a healthy runtime binding passes provenance', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-acceptance-healthy-'));
  const cleanRepoRoot = path.join(tempRoot, 'repo');
  const cleanRepoSkillPath = path.join(cleanRepoRoot, 'skills', 'decision-first-dashboard');
  fs.mkdirSync(path.join(cleanRepoRoot, 'scripts'), { recursive: true });
  fs.cpSync(acceptanceEntrypoint, path.join(cleanRepoRoot, 'scripts', 'run-acceptance.js'));
  fs.mkdirSync(path.dirname(cleanRepoSkillPath), { recursive: true });
  fs.cpSync(repoSkillPath, cleanRepoSkillPath, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: cleanRepoRoot });
  execFileSync('git', ['config', 'user.email', 'acceptance-test@example.invalid'], { cwd: cleanRepoRoot });
  execFileSync('git', ['config', 'user.name', 'Acceptance Test'], { cwd: cleanRepoRoot });
  execFileSync('git', ['add', '.'], { cwd: cleanRepoRoot });
  execFileSync('git', ['commit', '-qm', 'acceptance fixture'], { cwd: cleanRepoRoot });

  const runtimeSkillPath = path.join(tempRoot, 'runtime', 'decision-first-dashboard');
  ensureRuntimeSkillBinding({ repoSkillPath: cleanRepoSkillPath, runtimeSkillPath });
  const outputPaths = createSentinelPath();

  const run = runFormalAcceptance(runtimeSkillPath, outputPaths, { acceptanceRepoRoot: cleanRepoRoot });
  const report = readReport(run);

  assert.equal(run.status, 0);
  assert.equal(report.result, 'RUNTIME_PROVENANCE_PASS');
  assert.equal(report.acceptanceValid, true);
  assert.equal(fs.existsSync(outputPaths.artifactPath), true);
  assert.equal(fs.existsSync(outputPaths.resultPath), true);
});
