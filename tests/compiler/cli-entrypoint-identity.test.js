import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skillDir = path.join(repoRoot, 'skills/decision-first-dashboard');
const compilerName = 'compile-dashboard.js';
const worthinessDir = path.join(repoRoot, 'tests/compiler/fixtures/worthiness');
const intakeDir = path.join(repoRoot, 'tests/compiler/fixtures/intake');
const routingDir = path.join(repoRoot, 'tests/compiler/fixtures/routing');
const groundingDir = path.join(repoRoot, 'tests/compiler/fixtures/grounding');

// The installed skill is a symlink/junction on real hosts, so the CLI must be identified by the
// file it resolved to, not by the path argv was handed.
function linkType() {
  return process.platform === 'win32' ? 'junction' : 'dir';
}

function makeInstalledLink(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `decision-first-${label}-`));
  const linkPath = path.join(root, 'installed-skill');
  fs.symlinkSync(skillDir, linkPath, linkType());
  return { root, linkPath, script: path.join(linkPath, 'scripts', compilerName) };
}

// Unlink the junction before removing its parent so cleanup can never traverse into the real skill
// directory and delete sources.
function disposeLink({ root, linkPath }) {
  try {
    fs.rmSync(linkPath);
  } catch {
    // already gone
  }
  fs.rmSync(root, { recursive: true, force: true });
}

function runCli(script, inputs, outputDir) {
  return spawnSync(process.execPath, [script, ...inputs, outputDir], { cwd: repoRoot, encoding: 'utf8' });
}

function validInputs() {
  return [
    path.join(worthinessDir, 'dashboard.worthiness.json'),
    path.join(intakeDir, 'confirmed.decision-brief.json'),
    path.join(routingDir, 'no-score.routing.json'),
    path.join(groundingDir, 'no-score.grounded.json')
  ];
}

function expectedOutputs(outputDir) {
  return [
    path.join(outputDir, 'output.no-score.svg'),
    path.join(outputDir, 'output.no-score.html'),
    path.join(outputDir, 'output.manifest.json')
  ];
}

test('CLI invoked through the installed symlink path really executes and writes canonical artifacts', () => {
  const { root, linkPath, script } = makeInstalledLink('symlink-pass');
  try {
    assert.notEqual(fs.realpathSync(script), script, 'harness: the link path must differ from the realpath');
    const outputDir = path.join(root, 'out');
    const result = runCli(script, validInputs(), outputDir);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}: ${result.stderr}`);
    // The silent no-op signature: exit 0, nothing printed, nothing written.
    assert.notEqual(result.stdout.trim(), '', 'CLI exited 0 without reporting outputs (silent no-op)');
    for (const artifact of expectedOutputs(outputDir)) {
      assert.equal(fs.existsSync(artifact), true, `missing delivered artifact through symlink path: ${artifact}`);
    }
    for (const reported of result.stdout.trim().split(/\r?\n/)) {
      assert.ok(expectedOutputs(outputDir).includes(path.resolve(reported)), `stdout reported an unexpected path: ${reported}`);
    }
  } finally {
    disposeLink({ root, linkPath });
  }
});

test('CLI through the symlink path produces byte-identical artifacts to the realpath invocation', () => {
  const { root, linkPath, script } = makeInstalledLink('symlink-parity');
  try {
    const linkedOut = path.join(root, 'linked');
    const realOut = path.join(root, 'real');
    const linked = runCli(script, validInputs(), linkedOut);
    const real = runCli(path.join(skillDir, 'scripts', compilerName), validInputs(), realOut);
    assert.equal(linked.status, 0, linked.stderr);
    assert.equal(real.status, 0, real.stderr);
    for (let i = 0; i < expectedOutputs(realOut).length; i += 1) {
      const name = path.basename(expectedOutputs(realOut)[i]);
      const fromLink = fs.readFileSync(path.join(linkedOut, name));
      const fromReal = fs.readFileSync(path.join(realOut, name));
      assert.ok(fromLink.length > 0, `${name} delivered empty bytes through the symlink path`);
      assert.deepEqual(fromLink, fromReal, `${name} differs between symlink and realpath invocation`);
    }
  } finally {
    disposeLink({ root, linkPath });
  }
});

test('CLI through the symlink path still fails closed with a structured transition and no artifacts', () => {
  const { root, linkPath, script } = makeInstalledLink('symlink-fail');
  try {
    const routing = JSON.parse(fs.readFileSync(path.join(routingDir, 'no-score.routing.json'), 'utf8'));
    routing.inventoryCount = routing.metrics.length + 1;
    const badRoutingPath = path.join(root, 'broken.routing.json');
    fs.writeFileSync(badRoutingPath, `${JSON.stringify(routing, null, 2)}\n`);
    const outputDir = path.join(root, 'out');
    const result = runCli(script, [
      path.join(worthinessDir, 'dashboard.worthiness.json'),
      path.join(intakeDir, 'confirmed.decision-brief.json'),
      badRoutingPath,
      path.join(groundingDir, 'no-score.grounded.json')
    ], outputDir);
    assert.equal(result.status, 1, `expected fail-closed exit 1, got ${result.status}`);
    const failure = JSON.parse(result.stderr);
    assert.equal(failure.valid, false);
    assert.equal(failure.transition, 'FIX_METRIC_ROUTING');
    assert.equal(fs.existsSync(path.join(outputDir, 'output.no-score.html')), false);
    assert.equal(fs.existsSync(path.join(outputDir, 'output.no-score.svg')), false);
  } finally {
    disposeLink({ root, linkPath });
  }
});

test('CLI through the symlink path reports the usage error instead of exiting silently', () => {
  const { root, linkPath, script } = makeInstalledLink('symlink-usage');
  try {
    const result = spawnSync(process.execPath, [script], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(result.status, 2, `expected usage exit 2, got ${result.status}`);
    const failure = JSON.parse(result.stderr);
    assert.equal(failure.stage, 'intake');
    assert.equal(failure.errors[0].code, 'DECISION_PIPELINE_INPUT_INVALID');
  } finally {
    disposeLink({ root, linkPath });
  }
});
