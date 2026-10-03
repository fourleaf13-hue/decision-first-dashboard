## Problem

What problem does this PR solve? Link issues when applicable.

## Scope / out of scope

- **In scope:**
- **Out of scope:**

## Change classification

- [ ] No production behavior changed (docs/templates/metadata only)
- [ ] Behavior changed — described below
- [ ] Semantic contract changed (worthiness / intake / routing / grounding / composition / rendering)
- [ ] Canonical artifact, release anchor, or provenance record changed or regenerated
- [ ] Schemas or fixtures changed

Explicit maintainer review is required for any checked item in the last three rows (see CONTRIBUTING.md).

## Tests

- [ ] `npm test` — pass/fail counts: ______ (baseline: 395 tests, 392 pass, 0 fail, 3 skip)
- [ ] `npm run preflight:skill` — result: ______
- [ ] Red-lane status unchanged (`npm run test:red-lane`: 12 / 11 pass / **RED-6 expected-fail**) — [ ] yes

## Regression evidence

Deterministic artifact / suite evidence for anything touching the pipeline.

## Security implications

None / path handling / generated HTML-SVG / dependency / CI — describe.

## Documentation

README / SKILL.md / examples updated where relevant.

## Checklist

- [ ] No fixture-specific branching added to production logic
- [ ] No invented semantics: fail-closed refusals were not bypassed to make a case pass
- [ ] No unrelated file touched; diff matches the scope declared above
