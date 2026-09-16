# Runtime Skill Provenance Hardening

## Scope

This change makes the provenance of the installed `decision-first-dashboard`
Skill an executable, bracketed gate. It is limited to runtime package identity,
Windows binding, tree hashing, required-file/invariant checks, and the
documentation and tests for those checks.

It does not change Bakery intake, Decision Brief, Metric Router, Worthiness,
composition, renderer behavior, visual output, or runtime attestation work.

## Contract

The independent `runtime-provenance-preflight.js` gate must emit JSON with these
fields:

`repoHead`, `expectedRepoHead`, `runtimeSkillPath`, `runtimeBindingType`,
`physicalTargetCheck`, `repoTreeHashPre`, `runtimeTreeHashPre`,
`repoTreeHashPost`, `runtimeTreeHashPost`, `contentMatchPre`,
`contentMatchPost`, `contentStablePost`, `requiredFilesPresent`,
`requiredInvariantsPassed`, `repoCleanPre`, `repoCleanPost`,
`stalenessRisk`, `firstFailingCheck`, `diagnostic`, `acceptanceValid`, and
`result`.

The gate order is strict:

1. expected commit;
2. runtime binding type;
3. physical target/copy identity;
4. pre-run tree equality;
5. pre-run repository cleanliness;
6. required files;
7. required content invariants;
8. acceptance run;
9. post-run repository cleanliness;
10. post-run tree equality and unchanged hashes;
11. `RUNTIME_PROVENANCE_PASS`.

The gate is valid only when the preconditions and postconditions both pass.
When a precondition fails, the acceptance command is not run. When the command
runs, post checks still execute even if the command itself fails.

## Hash contract

The hash scope is the complete `skills/decision-first-dashboard/` package. The
exclude list is explicit and defaults to empty. Runtime logs, caches, and temp
files must live outside the package; they are not silently excluded. The tree
hash enumerates every included file, keeps relative POSIX paths with original
case, sorts those paths deterministically, and hashes each
`relativePath + NUL + fileBytes` sequence. Mtime, ACL, absolute paths, and
directory metadata are excluded. The digest contract remains exactly this
stream; because the stream has no record terminator, `contentMatchPre` and
`contentMatchPost` additionally require the sorted file inventories to be
identical. The digest plus the inventory is the complete package identity
check, so a theoretical stream-boundary collision cannot pass the gate.

Only the four key files receive named invariant diagnostics:

- `SKILL.md` contains the exact phrase
  `Agent invocation compliance — behaviorally guarded, not runtime-enforced`;
- `scripts/compile-dashboard.js` contains `requireSemantic: true`;
- `scripts/composition.js` exists;
- `scripts/render-semantic.js` exists.

## Binding contract

`runtimeBindingType` is one of `junction`, `symlink`, or
`copied-directory` when the target exists. On Windows, installation prefers a
directory junction and falls back to a directory symlink. A junction or
symlink passes physical-target validation only when its resolved target equals
the repository's `skills/decision-first-dashboard` directory. A copied
directory may pass exact content checks, but reports `stalenessRisk: true`.

The installer is idempotent: it creates a missing target, validates an already
correct target, and fails without overwriting a wrong target. It never silently
deletes or replaces an ordinary copied directory. Replacing a stale copied
directory requires an explicit, recoverable backup destination.

## Failure diagnostics

Every failure reports `firstFailingCheck`, a machine-readable diagnostic with a
repair layer, and `result: RUNTIME_PROVENANCE_FAIL`. Suggested repair layers
cover repository checkout, binding/installation, package contents, repository
cleanliness, and acceptance invocation. The gate must distinguish a stale
copied package from a physically wrong link and from a content mutation during
the acceptance run.

Acceptance results fail closed when they carry a non-null `error` or `signal`,
or when more than one primary result indicator (`ok`, `status`, or `exitCode`)
is present. An acceptance callback that throws any JavaScript value is recorded
as a run failure and still receives the post-run checks.

## Required regressions

The test suite covers at least: correct junction pass, wrong junction target,
copied exact match with staleness, copied mismatch, missing required file,
missing invariant, dirty repository before the run, dirty repository after the
run, copied runtime mutation after the run, repository package mutation after
the run, Windows backslash/POSIX hash normalization, case-sensitive filename
hashing, idempotent rerun, and no-overwrite behavior for a wrong existing
target.
