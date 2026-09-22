# Semantic Visual Grammar implementation plan

## Goal

Implement the frozen Semantic Visual Grammar contract on branch `codex/semantic-visual-grammar`, based on merged main `00335e58f974cd34f737f0e080ac415284687f5e`, without changing Finding #0 or adding a second rendering pipeline.

## Task 1: Establish RED regression coverage

Add `tests/compiler/semantic-visual-grammar.test.js` and extend the existing adaptive fixture assertions with:

1. final HTML/SVG structural diversity for Trend, Distribution, full Ranking, both-end Ranking, and heterogeneous MetricCluster comparison;
2. comparability rejection for mixed units and same-unit semantic domains, plus a legal same-domain comparison;
3. paired-layout eligibility and missing/unknown reason attribution failures;
4. manifest/artifact visual-spec marker mismatch rejection;
5. Bakery and CEO Sales assertions that use the shared grammar and contain no radar for heterogeneous metrics.

Initially assert markers/elements that the current generic semantic renderer does not produce. Run the focused file and record that the baseline is RED before changing production code.

## Task 2: Extend the existing input contracts

Add optional, closed-schema comparability metadata to semantic nodes/composition nodes and profile dimensions without making unrelated legacy inputs invalid. Use stable fields for `unit`, `comparisonGroup`, `comparabilityDomain`, `normalization`, and optional source-compatible scale metadata. Add any visual-spec manifest shape needed by the delivery contract. Keep node types and presentation registry shared; do not add audience or fixture enums.

Update only test fixture metadata required to make cross-node comparisons explicit. Do not add Bakery/CEO branches or synthetic facts.

## Task 3: Add the shared visual grammar module

Create one non-rendering module, `skills/decision-first-dashboard/scripts/visual-grammar.js`, that owns:

- registered mark/encoding/orientation/scale/layout values;
- stable visual reason codes;
- comparability evaluation and same-unit semantic mismatch checks;
- profile/radar eligibility integration with the existing Profile Test;
- layout eligibility and requirement/modifier/evidence reference validation;
- deterministic `buildInternalVisualSpecs(data, composition, context)` output;
- visual-spec contract errors that fail closed.

Do not move routing, Worthiness, Decision Brief, or evidence extraction into this module. Avoid circular imports: visual grammar may consume composition registry helpers, while composition remains the owner of semantic selection and coverage.

## Task 4: Thread specs through the canonical pipeline

Build specs in `compile-dashboard.js` after adaptive composition and before `compileGroundedBundle`. Pass the exact specs through `compile.js`/`render.js` to `render-semantic.js`. The production path must fail with `DELIVERY_CONTRACT_FAILED` when specs cannot be built. Lower-level compatibility render calls may retain their existing behavior when no semantic composition/spec is supplied.

Keep one renderer entrypoint and one semantic renderer. `render-semantic.js` must consume the spec instead of deriving visual behavior from the node label, audience, or fixture. Preserve typed claims, context coverage, decision logs, provenance, and existing `requireSemantic: true` behavior.

## Task 5: Implement deterministic structural visuals

Refactor only the semantic renderer's HOW layer:

- Trend full chart: ordered plot/polyline with points and temporal structure;
- Distribution full chart: one visual bar/member per ordered item;
- full Ranking: ordered magnitude bars/ranks;
- both-end Ranking: explicit high/low paired regions with complementary roles;
- MetricCluster comparison: independent metric strip, no shared magnitude scale;
- MetricCluster radar: actual polygon/axes only after Profile Test;
- existing Breakdown/Relationship/ExceptionList/Drilldown: explicit registered structures.

Emit the same semantic markers plus `data-visual-mark`, `data-visual-orientation`, `data-scale-type`, `data-comparability-domain`, `data-layout-pattern`, and `data-layout-reason` (or the final names established by the contract). Use deterministic local scales and escaped source content. No chart library or network asset is allowed.

## Task 6: Strengthen delivered verification

Extend `verifyDeliveredArtifact` to validate the delivered visual spec against both final artifacts, including structural elements and manifest values. Reject missing/unknown markers, illegal scale/comparability claims, visual-spec manifest drift, and artifact structures that do not match the registered mark. Continue issuing hash-bound verification only after all checks pass.

Add direct tampering tests for HTML, SVG, and manifest independently.

## Task 7: Verify and package

Run, in order:

1. focused visual-grammar tests (RED before implementation, GREEN after);
2. Bakery and CEO adaptive regressions;
3. all `npm test` tests and legacy golden snapshots;
4. package/preflight checks, including no external visualization dependency and no use-case template registry;
5. diff review confirming no Finding #0/runtime-provenance changes and no fixture-specific production branch.

Record the existing expected skip exactly:

```text
Skipped: POSIX literal backslash filenames remain different from nested paths
Reason: Windows filesystem does not expose POSIX literal backslash filename semantics
Risk: POSIX-only hash edge case remains unexecuted; Windows runtime provenance/staleness paths are covered
```

Commit, push `codex/semantic-visual-grammar`, open a PR to `main`, and wait for GitHub Actions to complete. Do not run the real post-merge Bakery acceptance in this branch; that requires rebinding the runtime package to the merged-main SHA first.
