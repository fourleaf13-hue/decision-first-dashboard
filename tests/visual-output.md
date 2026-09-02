# Test: Visual Translation Regression — v6

## Why this test exists

Earlier revisions improved reasoning but repeatedly collapsed back into a standard admin dashboard.

Latest observed v5 failure:

- invented top-level status `HEALTH GOOD` despite no target/threshold;
- four equal KPI cards across the top;
- large revenue chart + full-width account table dominating the page;
- no dominant central synthesis cluster;
- visual structure drifted far from `after-reference.png`.

## Test prompt

Use the attached decision-first-dashboard skill to redesign `before.png`.

Use `after-reference.png` as the visual composition reference.

Primary user: SaaS founder / revenue leader.
Primary decision: Is subscription health good enough, or does something require intervention?

Create the final visual mockup.

## Expected behavior

Because no score rules or healthy thresholds are provided, the agent must use the no-score executive template.

A passing result must:

- use `Improving — target unknown` or an equivalent evidence-bounded center, never `Healthy`, `Health good`, `Marginal`, or `At risk`;
- place MRR growth, customer growth, churn direction, and trial-conversion direction as compact signals around/tightly attached to the center;
- make the center the first focal point;
- use a small revenue-trend/context area on the left;
- use compact account exception / recent-event cards on the right;
- avoid a top strip of four KPI cards;
- avoid a full-width account table;
- avoid giant paragraphs as the center;
- avoid framework labels or invented workflow buttons;
- preserve every source value and state exactly.

## Automatic fail conditions

Fail the result if any of these appear:

1. four equal KPI cards form the primary top row;
2. `HEALTH GOOD`, `Healthy`, `Marginal`, or `At risk` is used as overall status without source rules;
3. a full-width customer table dominates the lower page;
4. the center is not the strongest visual region;
5. the center is mainly explanatory prose instead of a signal cluster;
6. framework terms such as `Primary Decision`, `Diagnostic`, `Outcome`, or `Actionable` appear in the UI;
7. unsupported buttons/actions or mismatched data appear.
