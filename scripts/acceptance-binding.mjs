import path from 'node:path';
import { execFileSync } from 'node:child_process';

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

export function captureCommitBinding({ repoRoot, expectedHead = null, renderCwd = null } = {}) {
  if (!repoRoot) throw new Error('captureCommitBinding requires repoRoot');
  if (!expectedHead) {
    throw new Error('captureCommitBinding requires an explicit --expected-head; a measured-only head is not acceptance evidence');
  }
  const resolvedRoot = path.resolve(repoRoot);
  const revParseStdout = git(resolvedRoot, ['rev-parse', 'HEAD']);
  const statusPorcelainStdout = git(resolvedRoot, ['status', '--porcelain']);
  const showToplevelStdout = git(resolvedRoot, ['rev-parse', '--show-toplevel']);
  const measuredHead = revParseStdout.trim();
  const binding = {
    expectedHead,
    measuredHead,
    revParseStdout,
    statusPorcelainStdout,
    showToplevelStdout: showToplevelStdout.trim(),
    worktreeClean: statusPorcelainStdout.trim().length === 0,
    headMatches: measuredHead === expectedHead,
    renderCwdMatchesRepoRoot: renderCwd ? path.resolve(renderCwd) === path.resolve(showToplevelStdout.trim()) : null
  };
  return binding;
}

export function assertCommitBinding(binding) {
  const problems = [];
  if (!binding.headMatches) problems.push(`expected head ${binding.expectedHead} but measured ${binding.measuredHead}`);
  if (!binding.worktreeClean) problems.push('render worktree is dirty; acceptance evidence requires a clean tree');
  if (binding.renderCwdMatchesRepoRoot === false) {
    problems.push(`renderer cwd diverges from the binding repository root ${binding.showToplevelStdout}`);
  }
  if (problems.length > 0) {
    const error = new Error(`COMMIT_BINDING_FAILED: ${problems.join('; ')}`);
    error.code = 'COMMIT_BINDING_FAILED';
    error.binding = binding;
    throw error;
  }
  return binding;
}

function parseArgs(argv) {
  const options = { repoRoot: process.cwd(), expectedHead: null, renderCwd: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--expected-head') options.expectedHead = argv[++index];
    else if (arg === '--repo-root') options.repoRoot = argv[++index];
    else if (arg === '--render-cwd') options.renderCwd = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const binding = assertCommitBinding(captureCommitBinding(parseArgs(process.argv.slice(2))));
    process.stdout.write(`${JSON.stringify({ binding }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    if (error.binding) process.stderr.write(`${JSON.stringify(error.binding, null, 2)}\n`);
    process.exitCode = 1;
  }
}
