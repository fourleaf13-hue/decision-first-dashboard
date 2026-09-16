import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const repoRootDefault = path.resolve(path.dirname(currentFile), '..');
const runtimeSkillPathDefault = path.join(
  os.homedir(),
  '.agents',
  'skills',
  'decision-first-dashboard'
);
const preflightRelativePath = path.join(
  'skills',
  'decision-first-dashboard',
  'scripts',
  'runtime-provenance-preflight.js'
);

function readRepoHead(repoRoot) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8'
    }).trim();
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const runIndex = argv.indexOf('--run');
  const separatorIndex = argv.indexOf('--');
  const markerIndex = runIndex >= 0 ? runIndex : separatorIndex;
  if (markerIndex < 0) {
    throw new Error('run-acceptance requires an acceptance command after --run or --');
  }

  const optionArgs = argv.slice(0, markerIndex);
  const command = argv[markerIndex + 1] ?? null;
  if (!command) throw new Error('run-acceptance requires an acceptance command');

  const options = {
    repoRoot: repoRootDefault,
    runtimeSkillPath: process.env.DECISION_FIRST_RUNTIME_SKILL_PATH ?? runtimeSkillPathDefault,
    expectedRepoHead: process.env.DECISION_FIRST_EXPECTED_REPO_HEAD ?? null,
    command,
    commandArgs: argv.slice(markerIndex + 2)
  };

  const valueFor = (index, flag) => {
    const value = optionArgs[index + 1];
    if (value === undefined) throw new Error(`${flag} requires a value`);
    return value;
  };

  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];
    if (arg === '--repo-root') {
      options.repoRoot = valueFor(index, arg);
      index += 1;
    } else if (arg === '--runtime-skill-path') {
      options.runtimeSkillPath = valueFor(index, arg);
      index += 1;
    } else if (arg === '--expected-repo-head') {
      options.expectedRepoHead = valueFor(index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.repoRoot = path.resolve(options.repoRoot);
  options.runtimeSkillPath = path.resolve(options.runtimeSkillPath);
  options.expectedRepoHead = options.expectedRepoHead ?? readRepoHead(options.repoRoot);
  return options;
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  const preflightScript = path.join(options.repoRoot, preflightRelativePath);
  if (!fs.existsSync(preflightScript)) {
    throw new Error(`Canonical runtime provenance preflight is missing: ${preflightScript}`);
  }

  const result = spawnSync(process.execPath, [
    preflightScript,
    '--repo-root', options.repoRoot,
    '--runtime-skill-path', options.runtimeSkillPath,
    '--expected-repo-head', options.expectedRepoHead,
    '--reject-staleness-risk',
    '--run', options.command,
    ...options.commandArgs
  ], {
    cwd: options.repoRoot,
    encoding: 'utf8'
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) process.stderr.write(`${result.error.message}\n`);
  process.exitCode = result.status ?? 1;
}

try {
  run();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
