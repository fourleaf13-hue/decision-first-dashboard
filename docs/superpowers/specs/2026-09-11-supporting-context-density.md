# Supporting Context Density Design

## Problem

PR #34 fixed domain leakage and empty-module filler in the non-radar renderer, but the latest Zepto-style run exposed an over-correction: the output can become visually sparse and can surface the wrong supporting metric mix.

There are four distinct bugs to fix together:

1. **The real Zepto regression is not locked in.** The current inventory test fixture is simplified and does not preserve the exact primary/diagnostic split observed in the real run.
2. **`decisionState` has no domain-neutral supporting-context channel.** For `no_score`, the renderer currently receives primary signals, optional revenue series, exceptions, and events. Grounded diagnostics cannot be rendered without being promoted to primary signals.
3. **Routing guidance does not explicitly reject redundant/complementary primaries.** A related metric can be promoted merely because it is relevant, even when it only explains another primary signal or represents another slice of the same distribution.
4. **The non-radar renderer has only one density mode.** It can render a lead signal plus other primaries, but cannot restore grounded diagnostic context in a lower visual tier.

## Goal

Restore grounded information density in non-radar output without reintroducing KPI clutter, unsupported prose, fake relationships, synthetic scores, or domain-specific assumptions.

The guiding rule is:

> **Minimum sufficient decision signals does not mean minimum possible content.**

Primary signals remain the decision layer. Grounded diagnostics may appear only as visually subordinate supporting context.

## Data model

Extend the `no_score` decision-state contract with an optional `supportingSignals` array.

Each supporting signal uses a closed object schema:

```json
{
  "metric": "high_stock_share",
  "label": "High Stock",
  "value": "43.42%",
  "provenance": "source"
}
```

Allowed fields match ordinary signal copy where useful (`metric`, `label`, `value`, optional `delta`, optional `direction`, `provenance`) but **no `normalizedScore`** is allowed in this layer.

Constraints:

- optional;
- maximum 4 supporting signals;
- every item must be source/derived according to the existing provenance rules;
- no metric may appear in both `signals` and `supportingSignals`;
- supporting signals are not part of radar eligibility and are never treated as primary signals.

## Routing contract

The routing manifest remains the source of truth for role assignment.

`decisionState.signals[*].metric` must continue to equal the routed `primary_signal` set exactly.

`decisionState.supportingSignals[*].metric` may only come from routing entries where:

- `role === "diagnostic"`;
- `visibility === "supporting"`;
- `changesDecision === false`;
- `explains` resolves to a routed `primary_signal` or active `exception`.

`scorecard_only` metrics stay out of the first-view decision surface by default. This change does **not** promote scorecard-only metrics into the dashboard merely to fill space.

Add semantic validation so supporting metrics cannot silently substitute for or replace primary metrics.

## Redundancy / complementary metric rule

The Skill contract must explicitly say:

> Do not promote multiple metrics to `primary_signal` merely because they are all relevant. If one metric mainly explains another primary signal, or is a complementary slice of the same distribution, route it as `diagnostic` unless a material change independently alters the confirmed decision or action.

Examples:

- `Out of Stock Products` and `Out of Stock Share` may both be primary only if count and rate independently change the confirmed response.
- `High Stock Share` should normally be diagnostic when the active decision is stockout replenishment and it mainly explains inventory mix.
- `High / Medium / Low / Out of Stock` shares should not all become equal first-view primaries just because they form one distribution.

This remains an agent judgment rule; the compiler validates consistency but does not infer business intent from labels.

## Grounding

`supportingSignals` are visible source claims and therefore require the same grounding coverage as visible no-score signals:

- label;
- value;
- optional delta/direction when source-dependent;
- exact source evidence resolution;
- source SHA verification.

The compiler must fail or return to evidence extraction if a visible supporting signal lacks valid evidence.

## Renderer behavior

### Non-radar hierarchy

The non-radar renderer should produce three visual tiers when data exists:

1. **Lead primary signal** — dominant visual focus.
2. **Remaining primary signals** — secondary decision cards.
3. **Supporting context rail** — compact diagnostic context, lower contrast and smaller visual weight.

The supporting rail:

- renders only when `supportingSignals.length > 0`;
- contains at most 4 items;
- uses no relationship lines or spokes;
- uses no alarm semantics unless source-backed alert semantics already exist elsewhere;
- collapses completely when empty.

The renderer must remain domain-neutral. No SaaS-only titles, revenue placeholders, inventory-specific hard-coded copy, or synthetic explanatory text.

### Density behavior

The layout must adapt to content:

- primary-only: compact hero layout, no giant empty stage;
- primary + supporting: hero plus compact context rail;
- real source-supported trend / movement / exceptions / events: existing support modules may appear in addition to the context rail;
- radar-eligible: existing radar renderer remains unchanged.

The page should not manufacture filler solely to occupy space.

## Zepto regression fixture

Add a permanent regression case reflecting the real inventory run rather than the simplified current fixture.

Expected role split:

### Primary signals

- `out_of_stock_products` — `453`
- `out_of_stock_share` — `12.14%`
- `low_stock_share` — `14.61%`
- `inventory_value` — `₹2.243M`

### Diagnostics

- `total_products` — `3.731K`
- `high_stock_share` — `43.42%`
- `medium_stock_share` — `29.83%`

### Scorecard-only

- `average_discount` — `7.62%`
- `total_categories` — `14`

The exact regression must verify:

- the four routed primaries remain exactly the four rendered primary signals;
- `high_stock_share` / `medium_stock_share` / `total_products` can appear only through `supportingSignals`, never as primaries;
- `average_discount` and `total_categories` do not enter the first-view decision surface unless a different confirmed Decision Brief changes their routing;
- no radar is rendered because the primary metrics are heterogeneous raw units;
- no fake spokes / relationship lines;
- no empty placeholder modules;
- no SaaS-specific copy;
- HTML remains the primary deliverable.

## Compatibility

- `supportingSignals` is optional, so existing valid decision-state fixtures remain valid.
- Radar and composite behavior must remain unchanged.
- Existing routing equality for primaries remains unchanged.
- Existing scorecard-only exclusion remains unchanged.
- No new external dependency is required.

## Testing strategy

Use TDD.

1. Add the real Zepto routing + grounded decision-state fixture and regression tests first.
2. Verify RED because the current schema/renderer does not support `supportingSignals`.
3. Extend schema and routing validation.
4. Extend grounding coverage.
5. Extend non-radar HTML/SVG rendering and compact density rules.
6. Add/adjust golden hashes only after semantic tests are green.
7. Run the full compiler workflow, not only targeted tests.
8. Merge only after PR CI and post-merge main CI are green.

## Non-goals

This change does not:

- weaken radar eligibility;
- allow scorecard-only metrics back into the first view by default;
- invent thresholds, alerts, actions, trends, or causal explanations;
- add a new composite scoring model;
- redesign the radar visual system;
- add industry-specific templates.
