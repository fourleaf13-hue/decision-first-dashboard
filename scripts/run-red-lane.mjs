// Runs the expected-negative lane (RED-* tests that document standing un-productionized
// contracts). The default `npm test` must stay green for external users; this lane keeps
// the recorded gaps visible and executable: a non-zero exit here is the DOCUMENTED status
// of the gap, not a CI gate (see .github/workflows/compiler-tests.yml, continue-on-error).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, ['--test', 'tests/compiler/pr45-red-phase.test.js'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: { ...process.env, RED_LANE: '1' }
});
process.exit(result.status ?? 1);
