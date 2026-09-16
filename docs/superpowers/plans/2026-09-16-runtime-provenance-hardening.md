# Runtime Skill Provenance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the installed `decision-first-dashboard` Skill version and package binding an executable pre/post acceptance gate.

**Architecture:** Add a standalone `runtime-provenance-preflight.js` library/CLI that computes deterministic package tree hashes, validates the repository commit, detects the runtime binding, checks required files/invariants, and brackets an acceptance command with pre/post checks. Add a separate idempotent binding installer that prefers Windows junctions, falls back to symlinks, and never overwrites a copied or wrong target without an explicit recoverable backup. Existing compiler/package-readiness scripts remain separate and unchanged in behavior.

**Tech Stack:** Node.js ESM, built-in `node:fs`, `node:crypto`, `node:child_process`, `node:path`, `node:test`, PowerShell/Windows filesystem links for the actual local runtime.

**Spec:** `docs/superpowers/specs/2026-09-16-runtime-provenance-hardening.md`

## Global Constraints

- Do not modify Bakery, intake, composition, renderer, Metric-level Worthiness, visual behavior, or Issue #43/runtime attestation.
- The gate must use the exact field names in the spec and return `RUNTIME_PROVENANCE_PASS` or `RUNTIME_PROVENANCE_FAIL`.
- The hash scope is the complete Skill package with an explicit, empty-by-default exclude list; logs, caches, and temp files remain outside the package.
- Hash relative POSIX paths preserving case and file bytes; exclude mtime, ACL, absolute paths, and directory metadata.
- On Windows prefer a directory junction, then fall back to a directory symlink; copied-directory exact matches may pass only with `stalenessRisk: true`.
- A wrong existing target and an ordinary copied directory are never silently overwritten or deleted.
- Pre/post `git status --porcelain -- skills/decision-first-dashboard/` must be empty.
- No Bakery acceptance run is valid until the provenance gate passes; do not reuse historical Bakery inputs or artifacts.

---

### Task 1: Freeze the RED contract tests

**Files:**
- Create: `tests/compiler/runtime-provenance.test.js`
- Test: `tests/compiler/runtime-provenance.test.js`

**Interfaces:**
- Consumes the future exports from `skills/decision-first-dashboard/scripts/runtime-provenance-preflight.js` and `skills/decision-first-dashboard/scripts/bind-runtime-skill.js`.
- Produces executable assertions for the gate report, deterministic tree hash, binding installer, and mutation/cleanliness sequencing.

- [ ] **Step 1: Write the failing test file**

Create temporary repository/package/runtime directories and a fixture helper
that writes the four required runtime files, including both exact invariant
strings. Add tests for:

```js
test('correct Windows junction passes provenance', () => {
  const { repoRoot, runtimeSkillPath } = createFixture();
  ensureRuntimeSkillBinding({ repoSkillPath: skillPath(repoRoot), runtimeSkillPath });
  const report = runGate({ repoRoot, runtimeSkillPath, runAcceptance: () => {} });
  assert.equal(report.runtimeBindingType, process.platform === 'win32' ? 'junction' : 'symlink');
  assert.equal(report.physicalTargetCheck.status, 'passed');
  assert.equal(report.acceptanceValid, true);
});

test('wrong link target fails without running acceptance', () => { /* assert PHYSICAL_TARGET_MISMATCH */ });
test('copied exact package passes but reports staleness risk', () => { /* assert copied-directory, true */ });
test('copied package mismatch fails before acceptance', () => { /* assert CONTENT_MISMATCH_PRE */ });
test('missing required file fails closed', () => { /* assert REQUIRED_FILES_MISSING */ });
test('missing required invariant fails closed', () => { /* assert REQUIRED_INVARIANT_MISSING */ });
test('dirty repository before run fails before acceptance', () => { /* assert REPO_DIRTY_PRE */ });
test('dirty repository after run fails the bracket', () => { /* assert REPO_DIRTY_POST */ });
test('copied runtime mutation is detected by the post hash', () => { /* assert contentStablePost false */ });
test('repository package mutation is detected by the post hash', () => { /* assert post mismatch and failure */ });
test('backslashes normalize only as path separators', () => { /* assert same tree hash */ });
test('filename case differences remain different', () => { /* assert different tree hash */ });
test('rerunning a correct binding is idempotent', () => { /* assert target and physical target unchanged */ });
test('wrong existing target is not overwritten', () => { /* assert sentinel remains */ });
```

Use injected `repoHeadReader` and `repoStatusReader` only to make pre/post
status transitions deterministic; use the real filesystem and real tree hash
implementation for package identity and mutations.

- [ ] **Step 2: Run the new test file and verify RED**

Run:

```powershell
node --test tests/compiler/runtime-provenance.test.js
```

Expected: FAIL because the new runtime provenance and binding modules do not
exist yet. Record the failure as the pre-implementation RED result; do not
weaken or skip the tests.

- [ ] **Step 3: Commit the RED tests**

```powershell
git add tests/compiler/runtime-provenance.test.js
git commit -m "test: define runtime skill provenance gate"
```

### Task 2: Implement deterministic package hashing and report helpers

**Files:**
- Create: `skills/decision-first-dashboard/scripts/runtime-provenance-preflight.js`
- Test: `tests/compiler/runtime-provenance.test.js`

**Interfaces:**
- Produces `computeSkillTreeHash(root, { exclude = [] }) -> { hash, files }`.
- Produces `runRuntimeProvenancePreflight(options) -> report`, with required
  options `repoRoot`, `runtimeSkillPath`, `expectedRepoHead`, and
  `runAcceptance`; optional readers are `repoHeadReader`, `repoStatusReader`.

- [ ] **Step 1: Implement the hash scope**

Enumerate regular files recursively, convert only path separators to `/`, keep
case unchanged, sort with a code-unit comparator, and update one SHA-256 hash
with each `relativePath`, one NUL byte, and the file bytes. Normalize only
backslash separators in an explicit exclude list; do not lower-case names or
auto-exclude runtime-generated files. Return the sorted included paths for
diagnostics.

- [ ] **Step 2: Implement repository and invariant readers**

Read `git rev-parse HEAD` and
`git status --porcelain -- skills/decision-first-dashboard/` from the supplied
repository root by default. Check the four required files and the two exact
content invariants against the runtime package. Keep missing-file and missing-
invariant details separate in the diagnostic object.

- [ ] **Step 3: Implement ordered preflight and postflight checks**

Return all required fields, initialize unavailable post fields to `null`, and
record only the first failing check according to the contract order. Set
`stalenessRisk` to `true` only for `copied-directory`; require physical target
identity for links and content equality for every binding. Run the acceptance
callback only after all preconditions pass, then always calculate post checks
after a run has started.

- [ ] **Step 4: Run the targeted tests**

```powershell
node --test tests/compiler/runtime-provenance.test.js
```

Expected: the hash, invariant, and pre/post gate assertions pass except for
installer-dependent binding tests until Task 3 is complete.

### Task 3: Implement safe Windows runtime binding

**Files:**
- Create: `skills/decision-first-dashboard/scripts/bind-runtime-skill.js`
- Modify: `tests/compiler/runtime-provenance.test.js`

**Interfaces:**
- Produces `detectRuntimeBinding(runtimeSkillPath) -> 'junction' | 'symlink' | 'copied-directory' | null`.
- Produces `ensureRuntimeSkillBinding({ repoSkillPath, runtimeSkillPath, backupExisting }) -> { bindingType, physicalTarget }`.

- [ ] **Step 1: Implement binding detection**

Use `lstat`/link resolution to distinguish a Windows directory junction from a
directory symlink and a normal directory. Treat a missing target as `null` for
installer diagnostics. Do not infer binding from the path name.

- [ ] **Step 2: Implement idempotent installation**

Create a missing target with a Windows junction first and a directory symlink
fallback; use a directory symlink on non-Windows hosts. Validate an existing
link's resolved physical target before returning success. Fail with no write
when an existing link targets elsewhere. For a copied directory, fail unless
the caller supplied an explicit backup destination, then move it to that exact
recoverable destination before creating the link; never call recursive delete.

- [ ] **Step 3: Run installer and binding regressions**

```powershell
node --test tests/compiler/runtime-provenance.test.js
```

Expected: all provenance tests pass, including correct-link, idempotency, wrong-
target, copied-directory, mutation, case, and separator assertions.

### Task 4: Add CLI/package/docs integration without changing compiler behavior

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `skills/decision-first-dashboard/SKILL.md`
- Modify: `.github/workflows/compiler-tests.yml`
- Modify: `tests/compiler/claude-skill-package.test.js`

**Interfaces:**
- Adds `npm run preflight:runtime-provenance -- ...` as a separate command;
  it does not replace or extend `preflight:skill`.
- Documents the exact runtime path/binding contract, hash algorithm, output
  fields, and explicit backup rule.
- CI runs the new unit tests and checks that the standalone script is packaged;
  CI does not pretend an Ubuntu runner is the user's Windows runtime.

- [ ] **Step 1: Add the standalone CLI wrapper**

Parse `--repo-root`, `--runtime-skill-path`, `--expected-repo-head`, and a
trailing `--run <command> [args...]`; print exactly one JSON report and return
non-zero on `RUNTIME_PROVENANCE_FAIL`. Keep all acceptance logs/output outside
the Skill package.

- [ ] **Step 2: Register and package the command**

Add only the new package script and required runtime file declarations needed
to stage the independent gate and binding helper. Keep `preflight.js` as the
existing package-readiness preflight.

- [ ] **Step 3: Document the operational workflow**

Document: bind/validate runtime, run the gate around a fresh acceptance
command, inspect pre/post hashes and `stalenessRisk`, and only then begin a new
Bakery session with new input and output paths. State that a copied exact match
is not a zero-staleness-risk runtime.

- [ ] **Step 4: Run package and documentation tests**

```powershell
npm test
npm run package:claude-skill
node dist/claude-skill/scripts/preflight.js
```

Expected: the original package-readiness tests and all new provenance tests
remain green.

### Task 5: Verify the actual Windows runtime binding and delivery gate

**Files:**
- No source changes; use the actual repository and runtime paths.

**Interfaces:**
- Consumes the merged `main` checkout and the installed runtime path
  `C:\Users\wuyin\.agents\skills\decision-first-dashboard`.
- Produces the final provenance JSON report and the completion evidence.

- [ ] **Step 1: Record the clean repository and expected commit**

Run `git rev-parse HEAD` and
`git status --porcelain -- skills/decision-first-dashboard/` in the source
checkout, requiring the expected delivery commit supplied to the gate and an
empty status for the source used by the gate.

- [ ] **Step 2: Preserve any stale copied runtime package**

If the installed path is an ordinary copied directory, verify the exact path
and move it only to an explicit, recoverable sibling backup path through the
installer's backup option. Do not delete it and do not overwrite an unrelated
link.

- [ ] **Step 3: Create or validate the Windows binding**

Use the installer to create/validate a junction, then verify the resolved
physical target equals the repository package directory. Record binding type,
runtime path, physical target, and backup path if one was needed.

- [ ] **Step 4: Run the bracketed provenance gate**

Run a non-Bakery smoke acceptance command first, with logs outside the Skill
directory, and retain the JSON report. Require pre/post tree equality,
unchanged hashes, clean repository status, required files/invariants, and
`result: RUNTIME_PROVENANCE_PASS` before any future fresh Bakery acceptance.

- [ ] **Step 5: Run final verification commands**

```powershell
node --test tests/compiler/runtime-provenance.test.js
npm test
git status --short --branch
git log -1 --oneline
```

Report the pre-implementation RED result, exact hash algorithm and empty
exclude list, actual binding/path/physical target, all four pre/post hashes,
clean pre/post values, staleness risk, first failing check if any, package
readiness, and CI result. Do not claim Bakery acceptance validity until the
provenance gate has passed.
