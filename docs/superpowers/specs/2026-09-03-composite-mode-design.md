# Decision-First Dashboard Composite Mode Design

## Purpose

Add the deferred composite branch to the existing deterministic dashboard compiler without weakening the no-score anti-hallucination guarantees.

## Scope

Composite v1 is intentionally narrow. It is valid only when the source explicitly provides:

- an overall composite score and scale;
- source-provided normalized component scores;
- source-provided component weights;
- a weighted-average aggregation rule;
- complete source-provided score bands / thresholds.

If any of these are unavailable, the agent must use `no_score` instead.
