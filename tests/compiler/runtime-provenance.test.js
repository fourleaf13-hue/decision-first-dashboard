import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  computeSkillTreeHash,
  runRuntimeProvenancePreflight
} from '../../skills/decision-first-dashboard/scripts/runtime-provenance-preflight.js';
import {
  detectRuntimeBinding,
  ensureRuntimeSkillBinding
} from '../../skills/decision-first-dashboard/scripts/bind-runtime-skill.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const expectedRepoHead = '6283029a70293408198d9c1b4033983ca06cb0bb';
const packageJson = JSON.parse(fs.readFileSync(path.join(testDir, '../../package.json'), 'utf8'));
const requiredReportFields = [
  'repoHead', 'expectedRepoHead', 'runtimeSkillPath', 'runtimeBindingType',
  'physicalTargetCheck', 'repoTreeHashPre', 'runtimeTreeHashPre',
  'repoTreeHashPost', 'runtimeTreeHashPost', 'contentMatchPre',
  'contentMatchPost', 'contentStablePost', 'requiredFilesPresent',
  'requiredInvariantsPassed', 'repoCleanPre', 'repoCleanPost',
  'stalenessRisk', 'firstFailingCheck', 'diagnostic', 'acceptanceValid', 'result'
];

function skillPath(repoRoot) {
  return path.join(repoRoot, 'skills', 'decision-first-dashboard');
}

function createFixture({ missing = [], missingInvariant = false } = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-runtime-provenance-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const repoSkillPath = skillPath(repoRoot);
  const runtimeSkillPath = path.join(tempRoot, 'runtime', 'decision-first-dashboard');
  fs.mkdirSync(path.join(repoSkillPath, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(repoSkillPath, 'schemas'), { recursive: true });

  const files = {
    'SKILL.md': missingInvariant
      ? '# decision-first-dashboard\n'
      : '# decision-first-dashboard\nAgent invocation compliance — behaviorally guarded, not runtime-enforced\n',
    'scripts/compile-dashboard.js': 'export const options = { requireSemantic: true };\n',
    'scripts/composition.js': 'export const compose = () => ({ });\n',
    'scripts/render-semantic.js': 'export const renderSemantic = () => "ok";\n'
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    if (!missing.includes(relativePath)) {
      const absolutePath = path.join(repoSkillPath, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, contents);
    }
  }
  for (const relativePath of [
    'scripts/runtime-provenance-preflight.js',
    'scripts/bind-runtime-skill.js'
  ]) {
    fs.copyFileSync(
      path.join(testDir, '../../skills/decision-first-dashboard', relativePath),
      path.join(repoSkillPath, relativePath)
    );
  }

  return { tempRoot, repoRoot, repoSkillPath, runtimeSkillPath };
}

function makeLink(target, source) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
}

function runGate({
  repoRoot,
  runtimeSkillPath,
  statusSequence = ['', ''],
  mutateDuringRun,
  expectedHead = expectedRepoHead,
  repoHead = expectedHead,
  acceptanceResult
}) {
  let statusCalls = 0;
  let acceptanceCalls = 0;
  const report = runRuntimeProvenancePreflight({
    repoRoot,
    runtimeSkillPath,
    expectedRepoHead: expectedHead,
    repoHeadReader: () => repoHead,
    repoStatusReader: () => statusSequence[Math.min(statusCalls++, statusSequence.length - 1)] ?? '',
    runAcceptance: () => {
      acceptanceCalls += 1;
      mutateDuringRun?.();
      return acceptanceResult;
    }
  });
  return { report, acceptanceCalls };
}

test('correct Windows junction passes provenance', () => {
  const fixture = createFixture();
  ensureRuntimeSkillBinding({
    repoSkillPath: fixture.repoSkillPath,
    runtimeSkillPath: fixture.runtimeSkillPath
  });

  const { report, acceptanceCalls } = runGate(fixture);
  assert.equal(report.runtimeBindingType, process.platform === 'win32' ? 'junction' : 'symlink');
  assert.equal(report.physicalTargetCheck.status, 'passed');
  assert.equal(report.acceptanceValid, true);
  assert.equal(report.result, 'RUNTIME_PROVENANCE_PASS');
  assert.equal(acceptanceCalls, 1);
});

test('wrong expected repository commit fails before binding checks', () => {
  const fixture = createFixture();
  const { report, acceptanceCalls } = runGate({
    ...fixture,
    expectedHead: '1111111111111111111111111111111111111111',
    repoHead: expectedRepoHead
  });
  assert.equal(report.firstFailingCheck, 'REPO_HEAD_MISMATCH');
  assert.equal(report.diagnostic.repairLayer, 'repository-checkout');
  assert.equal(acceptanceCalls, 0);
});

test('wrong junction target fails without running acceptance', () => {
  const fixture = createFixture();
  const wrongSkillPath = path.join(fixture.tempRoot, 'wrong-skill');
  fs.cpSync(fixture.repoSkillPath, wrongSkillPath, { recursive: true });
  makeLink(fixture.runtimeSkillPath, wrongSkillPath);

  const { report, acceptanceCalls } = runGate(fixture);
  assert.equal(report.firstFailingCheck, 'PHYSICAL_TARGET_MISMATCH');
  assert.equal(report.physicalTargetCheck.status, 'failed');
  assert.equal(report.acceptanceValid, false);
  assert.equal(report.result, 'RUNTIME_PROVENANCE_FAIL');
  assert.equal(acceptanceCalls, 0);
});

test('copied exact package passes but reports staleness risk', () => {
  const fixture = createFixture();
  fs.mkdirSync(path.dirname(fixture.runtimeSkillPath), { recursive: true });
  fs.cpSync(fixture.repoSkillPath, fixture.runtimeSkillPath, { recursive: true });

  const { report } = runGate(fixture);
  assert.equal(report.runtimeBindingType, 'copied-directory');
  assert.equal(report.physicalTargetCheck.status, 'not_applicable');
  assert.equal(report.contentMatchPre, true);
  assert.equal(report.acceptanceValid, true);
  assert.equal(report.stalenessRisk, true);
});

test('copied package mismatch fails before acceptance', () => {
  const fixture = createFixture();
  fs.mkdirSync(path.dirname(fixture.runtimeSkillPath), { recursive: true });
  fs.cpSync(fixture.repoSkillPath, fixture.runtimeSkillPath, { recursive: true });
  fs.appendFileSync(path.join(fixture.runtimeSkillPath, 'scripts', 'composition.js'), 'drift\n');

  const { report, acceptanceCalls } = runGate(fixture);
  assert.equal(report.firstFailingCheck, 'CONTENT_MISMATCH_PRE');
  assert.equal(report.contentMatchPre, false);
  assert.equal(report.acceptanceValid, false);
  assert.equal(acceptanceCalls, 0);
});

test('tree equality rejects an ambiguous hash stream with different file inventory', () => {
  const fixture = createFixture();
  fs.mkdirSync(path.dirname(fixture.runtimeSkillPath), { recursive: true });
  fs.cpSync(fixture.repoSkillPath, fixture.runtimeSkillPath, { recursive: true });
  fs.writeFileSync(path.join(fixture.repoSkillPath, 'zz-a.txt'), 'payloadzz-b.txt\0extra');
  fs.writeFileSync(path.join(fixture.runtimeSkillPath, 'zz-a.txt'), 'payload');
  fs.writeFileSync(path.join(fixture.runtimeSkillPath, 'zz-b.txt'), 'extra');

  const { report, acceptanceCalls } = runGate(fixture);
  assert.equal(report.repoTreeHashPre, report.runtimeTreeHashPre);
  assert.equal(report.contentMatchPre, false);
  assert.equal(report.firstFailingCheck, 'CONTENT_MISMATCH_PRE');
  assert.equal(acceptanceCalls, 0);
});

test('tree equality rejects an ambiguous hash stream with the same file inventory', () => {
  const fixture = createFixture();
  fs.mkdirSync(path.dirname(fixture.runtimeSkillPath), { recursive: true });
  fs.cpSync(fixture.repoSkillPath, fixture.runtimeSkillPath, { recursive: true });
  fs.writeFileSync(path.join(fixture.repoSkillPath, 'zz-a.txt'), 'X');
  fs.writeFileSync(path.join(fixture.repoSkillPath, 'zz-b.txt'), 'Yzz-b.txt\0Z');
  fs.writeFileSync(path.join(fixture.runtimeSkillPath, 'zz-a.txt'), 'Xzz-b.txt\0Y');
  fs.writeFileSync(path.join(fixture.runtimeSkillPath, 'zz-b.txt'), 'Z');

  const { report, acceptanceCalls } = runGate(fixture);
  assert.equal(report.repoTreeHashPre, report.runtimeTreeHashPre);
  assert.deepEqual(
    computeSkillTreeHash(fixture.repoSkillPath).files,
    computeSkillTreeHash(fixture.runtimeSkillPath).files
  );
  assert.equal(report.contentMatchPre, false);
  assert.equal(report.firstFailingCheck, 'CONTENT_MISMATCH_PRE');
  assert.equal(acceptanceCalls, 0);
});

test('missing required file fails closed', () => {
  const fixture = createFixture({ missing: ['scripts/composition.js'] });
  ensureRuntimeSkillBinding({
    repoSkillPath: fixture.repoSkillPath,
    runtimeSkillPath: fixture.runtimeSkillPath
  });

  const { report, acceptanceCalls } = runGate(fixture);
  assert.equal(report.requiredFilesPresent, false);
  assert.equal(report.firstFailingCheck, 'REQUIRED_FILES_MISSING');
  assert.equal(report.acceptanceValid, false);
  assert.equal(acceptanceCalls, 0);
});

test('missing required invariant fails closed', () => {
  const fixture = createFixture({ missingInvariant: true });
  ensureRuntimeSkillBinding({
    repoSkillPath: fixture.repoSkillPath,
    runtimeSkillPath: fixture.runtimeSkillPath
  });

  const { report, acceptanceCalls } = runGate(fixture);
  assert.equal(report.requiredInvariantsPassed, false);
  assert.equal(report.firstFailingCheck, 'REQUIRED_INVARIANT_MISSING');
  assert.equal(report.acceptanceValid, false);
  assert.equal(acceptanceCalls, 0);
});

test('dirty repository before run fails before acceptance', () => {
  const fixture = createFixture();
  ensureRuntimeSkillBinding({
    repoSkillPath: fixture.repoSkillPath,
    runtimeSkillPath: fixture.runtimeSkillPath
  });

  const { report, acceptanceCalls } = runGate({ ...fixture, statusSequence: [' M skills/decision-first-dashboard/SKILL.md'] });
  assert.equal(report.repoCleanPre, false);
  assert.equal(report.firstFailingCheck, 'REPO_DIRTY_PRE');
  assert.equal(report.acceptanceValid, false);
  assert.equal(acceptanceCalls, 0);
});

test('dirty repository after run fails the bracket', () => {
  const fixture = createFixture();
  ensureRuntimeSkillBinding({
    repoSkillPath: fixture.repoSkillPath,
    runtimeSkillPath: fixture.runtimeSkillPath
  });

  const { report, acceptanceCalls } = runGate({ ...fixture, statusSequence: ['', ' M skills/decision-first-dashboard/SKILL.md'] });
  assert.equal(acceptanceCalls, 1);
  assert.equal(report.repoCleanPost, false);
  assert.equal(report.firstFailingCheck, 'REPO_DIRTY_POST');
  assert.equal(report.acceptanceValid, false);
});

test('null-status acceptance result fails closed', () => {
  const fixture = createFixture();
  ensureRuntimeSkillBinding({
    repoSkillPath: fixture.repoSkillPath,
    runtimeSkillPath: fixture.runtimeSkillPath
  });

  const { report } = runGate({
    ...fixture,
    acceptanceResult: { status: null, signal: 'SIGTERM' }
  });
  assert.equal(report.firstFailingCheck, 'RUN_FAILED');
  assert.equal(report.acceptanceValid, false);
  assert.equal(report.diagnostic.details.acceptanceResult.status, null);
});

test('asynchronous acceptance callback fails closed instead of being treated as complete', () => {
  const fixture = createFixture();
  ensureRuntimeSkillBinding({
    repoSkillPath: fixture.repoSkillPath,
    runtimeSkillPath: fixture.runtimeSkillPath
  });

  const report = runRuntimeProvenancePreflight({
    repoRoot: fixture.repoRoot,
    runtimeSkillPath: fixture.runtimeSkillPath,
    expectedRepoHead,
    repoHeadReader: () => expectedRepoHead,
    repoStatusReader: () => '',
    runAcceptance: () => Promise.resolve({ status: 0 })
  });
  assert.equal(report.firstFailingCheck, 'RUN_FAILED');
  assert.equal(report.acceptanceValid, false);
  assert.equal(report.diagnostic.details.reasonCode, 'ASYNC_ACCEPTANCE_UNSUPPORTED');
});

test('contradictory or error-marked acceptance results fail closed', () => {
  const cases = [
    { ok: true, status: 1 },
    { status: 0, error: { code: 'ENOENT', message: 'missing command' } },
    { status: 0, signal: 'SIGTERM' }
  ];
  for (const acceptanceResult of cases) {
    const fixture = createFixture();
    ensureRuntimeSkillBinding({
      repoSkillPath: fixture.repoSkillPath,
      runtimeSkillPath: fixture.runtimeSkillPath
    });
    const { report } = runGate({ ...fixture, acceptanceResult });
    assert.equal(report.firstFailingCheck, 'RUN_FAILED');
    assert.equal(report.acceptanceValid, false);
  }
});

test('arbitrary thrown values fail closed and still run postflight', () => {
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const throwingMessageError = new Error('placeholder');
  Object.defineProperty(throwingMessageError, 'message', {
    configurable: true,
    get() {
      throw new Error('message getter failed');
    }
  });
  for (const thrown of [null, undefined, 'boom', revoked.proxy, throwingMessageError]) {
    const fixture = createFixture();
    ensureRuntimeSkillBinding({
      repoSkillPath: fixture.repoSkillPath,
      runtimeSkillPath: fixture.runtimeSkillPath
    });
    const report = runRuntimeProvenancePreflight({
      repoRoot: fixture.repoRoot,
      runtimeSkillPath: fixture.runtimeSkillPath,
      expectedRepoHead,
      repoHeadReader: () => expectedRepoHead,
      repoStatusReader: () => '',
      runAcceptance: () => { throw thrown; }
    });
    assert.equal(report.firstFailingCheck, 'RUN_FAILED');
    assert.equal(report.repoCleanPost, true);
    assert.equal(typeof report.repoTreeHashPost, 'string');
    assert.equal(report.acceptanceValid, false);
  }
});

test('inherited non-null acceptance errors and signals fail closed', () => {
  const cases = [
    Object.assign(Object.create({ error: { code: 'ENOENT' } }), { status: 0 }),
    Object.assign(Object.create({ signal: 'SIGTERM' }), { status: 0 })
  ];
  for (const acceptanceResult of cases) {
    const fixture = createFixture();
    ensureRuntimeSkillBinding({
      repoSkillPath: fixture.repoSkillPath,
      runtimeSkillPath: fixture.runtimeSkillPath
    });
    const { report } = runGate({ ...fixture, acceptanceResult });
    assert.equal(report.firstFailingCheck, 'RUN_FAILED');
    assert.equal(report.acceptanceValid, false);
  }
});

test('copied runtime mutation is detected by the post hash', () => {
  const fixture = createFixture();
  fs.mkdirSync(path.dirname(fixture.runtimeSkillPath), { recursive: true });
  fs.cpSync(fixture.repoSkillPath, fixture.runtimeSkillPath, { recursive: true });

  const { report } = runGate({
    ...fixture,
    mutateDuringRun: () => fs.appendFileSync(path.join(fixture.runtimeSkillPath, 'scripts', 'composition.js'), 'runtime drift\n')
  });
  assert.equal(report.contentMatchPost, false);
  assert.equal(report.contentStablePost, false);
  assert.equal(report.firstFailingCheck, 'CONTENT_MISMATCH_POST');
  assert.equal(report.acceptanceValid, false);
});

test('repository package mutation is detected by the post hash', () => {
  const fixture = createFixture();
  ensureRuntimeSkillBinding({
    repoSkillPath: fixture.repoSkillPath,
    runtimeSkillPath: fixture.runtimeSkillPath
  });

  const { report } = runGate({
    ...fixture,
    mutateDuringRun: () => fs.appendFileSync(path.join(fixture.repoSkillPath, 'scripts', 'composition.js'), 'repo drift\n')
  });
  assert.equal(report.contentMatchPost, true);
  assert.equal(report.contentStablePost, false);
  assert.equal(report.firstFailingCheck, 'CONTENT_DRIFT_POST');
  assert.equal(report.acceptanceValid, false);
});

test('backslashes normalize only as path separators', () => {
  const fixture = createFixture();
  const slashHash = computeSkillTreeHash(fixture.repoSkillPath, { exclude: ['scripts/composition.js'] });
  const backslashHash = computeSkillTreeHash(fixture.repoSkillPath, { exclude: ['scripts\\composition.js'] });
  assert.deepEqual(backslashHash, slashHash);
});

test('filename case differences remain different', () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-case-a-'));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-case-b-'));
  fs.writeFileSync(path.join(first, 'CaseSensitive.txt'), 'same bytes');
  fs.writeFileSync(path.join(second, 'casesensitive.txt'), 'same bytes');
  assert.notEqual(computeSkillTreeHash(first).hash, computeSkillTreeHash(second).hash);
});

test('POSIX literal backslash filenames remain different from nested paths', (context) => {
  if (process.platform === 'win32') {
    context.skip('Windows filesystem does not expose POSIX backslash filename semantics');
    return;
  }
  const literal = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-literal-slash-'));
  const nested = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-first-nested-slash-'));
  fs.writeFileSync(path.join(literal, 'a\\b'), 'same bytes');
  fs.mkdirSync(path.join(nested, 'a'));
  fs.writeFileSync(path.join(nested, 'a', 'b'), 'same bytes');
  assert.notEqual(computeSkillTreeHash(literal).hash, computeSkillTreeHash(nested).hash);
});

test('rerunning a correct binding is idempotent', () => {
  const fixture = createFixture();
  const first = ensureRuntimeSkillBinding({
    repoSkillPath: fixture.repoSkillPath,
    runtimeSkillPath: fixture.runtimeSkillPath
  });
  const second = ensureRuntimeSkillBinding({
    repoSkillPath: fixture.repoSkillPath,
    runtimeSkillPath: fixture.runtimeSkillPath
  });
  assert.equal(second.bindingType, first.bindingType);
  assert.equal(second.physicalTarget, first.physicalTarget);
  assert.equal(detectRuntimeBinding(fixture.runtimeSkillPath), first.bindingType);
});

test('wrong existing target is not overwritten', () => {
  const fixture = createFixture();
  const wrongSkillPath = path.join(fixture.tempRoot, 'wrong-skill');
  fs.cpSync(fixture.repoSkillPath, wrongSkillPath, { recursive: true });
  fs.writeFileSync(path.join(wrongSkillPath, 'sentinel.txt'), 'preserve me');
  makeLink(fixture.runtimeSkillPath, wrongSkillPath);

  assert.throws(
    () => ensureRuntimeSkillBinding({
      repoSkillPath: fixture.repoSkillPath,
      runtimeSkillPath: fixture.runtimeSkillPath
    }),
    /target|binding|physical/i
  );
  assert.equal(fs.existsSync(path.join(wrongSkillPath, 'sentinel.txt')), true);
});

test('CLI input failures still emit the complete provenance report schema', () => {
  const preflightPath = path.join(testDir, '../../skills/decision-first-dashboard/scripts/runtime-provenance-preflight.js');
  const run = spawnSync(process.execPath, [preflightPath, '--unknown-option'], {
    cwd: testDir,
    encoding: 'utf8'
  });
  assert.equal(run.status, 1);
  const report = JSON.parse(run.stdout.trim());
  for (const field of requiredReportFields) assert.equal(Object.hasOwn(report, field), true, `missing report field: ${field}`);
  assert.equal(report.firstFailingCheck, 'CLI_INPUT_INVALID');
  assert.equal(report.acceptanceValid, false);
});

test('CLI rejects a dangling option value with the complete provenance report schema', () => {
  const preflightPath = path.join(testDir, '../../skills/decision-first-dashboard/scripts/runtime-provenance-preflight.js');
  const run = spawnSync(process.execPath, [
    preflightPath,
    '--repo-root', path.resolve(testDir, '../..'),
    '--runtime-skill-path', path.resolve(testDir, '../../skills/decision-first-dashboard'),
    '--expected-repo-head'
  ], {
    cwd: testDir,
    encoding: 'utf8'
  });
  assert.equal(run.status, 1);
  const report = JSON.parse(run.stdout.trim());
  for (const field of requiredReportFields) assert.equal(Object.hasOwn(report, field), true, `missing report field: ${field}`);
  assert.equal(report.firstFailingCheck, 'CLI_INPUT_INVALID');
  assert.equal(report.expectedRepoHead, null);
});

test('Windows reparse-type ambiguity fails closed instead of guessing symlink', (context) => {
  if (process.platform !== 'win32') {
    context.skip('Windows-specific reparse-point fallback');
    return;
  }
  const fixture = createFixture();
  ensureRuntimeSkillBinding({
    repoSkillPath: fixture.repoSkillPath,
    runtimeSkillPath: fixture.runtimeSkillPath
  });
  assert.equal(
    detectRuntimeBinding(fixture.runtimeSkillPath, { linkTypeReader: () => null }),
    null
  );
});

test('copied directory replacement requires an explicit recoverable backup', () => {
  const fixture = createFixture();
  fs.mkdirSync(path.dirname(fixture.runtimeSkillPath), { recursive: true });
  fs.cpSync(fixture.repoSkillPath, fixture.runtimeSkillPath, { recursive: true });

  assert.throws(
    () => ensureRuntimeSkillBinding({
      repoSkillPath: fixture.repoSkillPath,
      runtimeSkillPath: fixture.runtimeSkillPath
    }),
    /explicit.*backup/i
  );

  const backupPath = path.join(fixture.tempRoot, 'runtime-backup');
  const result = ensureRuntimeSkillBinding({
    repoSkillPath: fixture.repoSkillPath,
    runtimeSkillPath: fixture.runtimeSkillPath,
    backupExisting: backupPath
  });
  assert.equal(fs.existsSync(path.join(backupPath, 'SKILL.md')), true);
  assert.equal(result.bindingType, process.platform === 'win32' ? 'junction' : 'symlink');
});

test('CLI emits one machine-readable pass report for a clean git checkout', () => {
  const fixture = createFixture();
  execFileSync('git', ['init', '-q'], { cwd: fixture.repoRoot });
  execFileSync('git', ['config', 'user.email', 'provenance@example.test'], { cwd: fixture.repoRoot });
  execFileSync('git', ['config', 'user.name', 'Runtime Provenance Test'], { cwd: fixture.repoRoot });
  execFileSync('git', ['add', '.'], { cwd: fixture.repoRoot });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: fixture.repoRoot });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fixture.repoRoot, encoding: 'utf8' }).trim();
  ensureRuntimeSkillBinding({
    repoSkillPath: fixture.repoSkillPath,
    runtimeSkillPath: fixture.runtimeSkillPath
  });

  const preflightPath = path.join(testDir, '../../skills/decision-first-dashboard/scripts/runtime-provenance-preflight.js');
  const run = spawnSync(process.execPath, [
    preflightPath,
    '--repo-root', fixture.repoRoot,
    '--runtime-skill-path', fixture.runtimeSkillPath,
    '--expected-repo-head', head,
    '--run', process.execPath, '-e', 'process.exit(0)'
  ], { cwd: fixture.repoRoot, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout.trim());
  for (const field of requiredReportFields) assert.equal(Object.hasOwn(report, field), true, `missing report field: ${field}`);
  assert.equal(report.result, 'RUNTIME_PROVENANCE_PASS');
  assert.equal(report.acceptanceValid, true);
  assert.equal(report.contentMatchPre, true);
  assert.equal(report.contentMatchPost, true);
  assert.equal(report.contentStablePost, true);
  assert.equal(report.repoCleanPre, true);
  assert.equal(report.repoCleanPost, true);

  const runtimeEntrypointRun = spawnSync(process.execPath, [
    path.join(fixture.runtimeSkillPath, 'scripts', 'runtime-provenance-preflight.js'),
    '--repo-root', fixture.repoRoot,
    '--runtime-skill-path', fixture.runtimeSkillPath,
    '--expected-repo-head', head,
    '--run', process.execPath, '-e', 'process.exit(0)'
  ], { cwd: fixture.repoRoot, encoding: 'utf8' });
  assert.equal(runtimeEntrypointRun.status, 0, runtimeEntrypointRun.stderr || runtimeEntrypointRun.stdout);
  const runtimeEntrypointReport = JSON.parse(runtimeEntrypointRun.stdout.trim());
  assert.equal(runtimeEntrypointReport.result, 'RUNTIME_PROVENANCE_PASS');
});

test('runtime provenance gate remains independent and documented', () => {
  const readme = fs.readFileSync(path.join(testDir, '../../README.md'), 'utf8');
  const skill = fs.readFileSync(path.join(testDir, '../../skills/decision-first-dashboard/SKILL.md'), 'utf8');
  assert.equal(typeof packageJson.scripts['preflight:runtime-provenance'], 'string');
  assert.equal(typeof packageJson.scripts['run:acceptance'], 'string');
  assert.equal(typeof packageJson.scripts['bind:runtime-skill'], 'string');
  assert.match(readme, /Runtime Skill provenance gate/);
  assert.match(readme, /run:acceptance/);
  assert.match(skill, /runtime-provenance-preflight\.js/);
  assert.match(skill, /reject-staleness-risk/);
  assert.match(readme, /logs, caches, and temp files must remain\s+outside the package/i);
});
