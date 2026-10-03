# Contributing

Thanks for your interest in improving Decision-First Dashboard.

## What contributions are welcome

- **Bug reports**: incorrect compiler results, rendering defects, false passes/failures in the verification chain, packaging or installation problems.
- **Feature proposals**: new decision shapes, presentation coverage, or acceptance capabilities — ideally grounded in a recurring decision you actually need to make.
- **Documentation fixes**: wrong, unclear, or stale docs and examples.

## Setup

The package has **no runtime dependencies**. Tests use Node's built-in test runner (`node --test`, Node.js 18+).

```bash
npm install   # no-op for dependencies, validates the manifest
npm test      # compiler/acceptance suite
```

## The red lane is intentionally red

`npm run test:red-lane` contains **one expected-failing test (RED-6)** that records an unproductized contract.

- A failing RED-6 is the expected, correct state — it is not a regression.
- Do not "fix" RED-6 in an unrelated PR. Making its contract production-ready is its own change, reviewed separately.

## Core principles any change must preserve

- **Evidence-grounded output**: every delivered fact must trace to source-backed evidence. No invented metrics, no made-up health scores, no fabricated relationships.
- **Fail closed**: when semantics are missing or unlawful, the pipeline must refuse (ASK or named error with null artifacts), not silently fall back to a plausible-looking page.
- **No fixture-specific production branching**: behavior must come from declared decision semantics and general rules — never `if (this known case) …` branches inside compiler/renderer logic.
- **Determinism**: identical inputs must produce byte-identical canonical artifacts.

## Pull requests

Use the PR template. Keep diffs small and focused. Run `npm test` and `npm run preflight:skill` before submitting.

**Changes to any of the following require explicit maintainer review — say so in your PR:**

- canonical artifacts, release anchors, or provenance records
- semantic contracts (worthiness, intake, routing, grounding, composition)
- the renderers or the compiler pipeline
- schemas and fixtures
- CI workflow definitions or packaging paths

This repository is maintained by a single maintainer; all merges happen through maintainer-reviewed PRs with green CI.
