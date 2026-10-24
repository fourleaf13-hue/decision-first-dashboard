# Decision-First Dashboard — Moat & Market Evidence

_Last updated: 2026-10-24_

This document separates **market signals** from **product claims**. Reddit posts and competitor examples are directional evidence, not proof of market size or causal advantage.

## Moat thesis

Decision-First should not compete on “AI can build a dashboard.” Dashboard construction is becoming cheaper and more automated. The defensible layer is the governed chain that decides **whether a dashboard is warranted, what decision it must support, what evidence may be used, what may be claimed, how metrics are routed and typed, how composition is selected, and whether the delivered artifact actually matches that contract**.

Current production chain:

`Source / context → Worthiness Assessment → worthiness gate → Decision Brief → intake gate → Metric Routing Manifest → grounded evidence bundle → routing + grounding gates → semantic-node composition → deterministic renderer → canonical HTML / SVG + output.manifest.json → delivered-artifact verification`

The moat is therefore not a single framework or visual style. It is the combination of:

1. **Decision worthiness** — refuse or redirect when a persistent dashboard is not the right artifact.
2. **Decision/Action intake** — confirm business intent before routing or rendering.
3. **Semantic trust** — exact evidence grounding, metric routing, semantic typing, claim scope, fail-closed behavior.
4. **Composition authority** — semantic nodes and explicit composition decisions instead of free-form layout generation.
5. **Deterministic delivery** — one compiler/renderer path, canonical artifacts, no agent-authored visual fallback.
6. **Delivered-artifact verification** — provenance, manifest binding, machine-readable markers, and final hash-bound verification.

## Market evidence ledger

### 2026-10-22 — Power BI community signal: construction value is moving upstream

Source: https://www.reddit.com/r/PowerBI/comments/1xc8vhy/my_power_bi_progress/

A learner shared Power BI progress while explicitly worrying that AI is reducing job openings and increasing competition. In the discussion, one community response argued that dashboard creation is increasingly commoditized by AI and that the more important skills are telling the data story, asking the right questions, and knowing enough DAX to detect when AI is wrong.

**Interpretation:** this is not evidence that dashboard building is “irrelevant.” It is evidence that at least part of the practitioner community is moving perceived value from manual construction toward question selection, business meaning, validation, and judgment.

**Implication for Decision-First:** strengthen positioning around upstream decision authority and downstream trust. Do **not** reposition as a faster dashboard generator.

### Supporting community pattern — business understanding over tool depth

Source: https://www.reddit.com/r/PowerBI/comments/1wbqmt8/what_should_i_focus_on_to_become_good_at_power_bi/

In a September 2026 thread asking what to learn next after Power BI fundamentals, prominent replies emphasized business acumen, requirements gathering, understanding the problem the dashboard is supposed to solve, and simplicity of design rather than increasingly advanced DAX alone.

**Implication:** Decision-First's Worthiness Assessment and Decision Brief remain strategically aligned with practitioner pain. They should remain first-class compiler gates, not optional UX flourishes.

## Competitor watch — `phuryn/pm-skills` / `metrics-dashboard`

Source skill: https://github.com/phuryn/pm-skills/blob/main/pm-product-discovery/skills/metrics-dashboard/SKILL.md

Observed capability:

- defines a North Star Metric, 3–5 input metrics, health metrics, and business metrics;
- asks for exact metric definitions, data sources, visualization types, targets, and alert thresholds;
- proposes a fixed dashboard layout;
- defines review cadence and alert rules;
- outputs a markdown dashboard specification.

### Layer comparison

| Layer | `metrics-dashboard` | Decision-First |
|---|---|---|
| Metric selection | Strong product-metrics framework | Metric routing tied to confirmed Decision/Action |
| Dashboard worthiness | Not observed | Explicit recurring-loop / accountability / response-change gate |
| Business intent confirmation | Context-driven, but no mandatory confirmed Decision + Action gate | Mandatory confirmed Decision + Action before routing/rendering |
| Evidence grounding | Reads source files, but no exact evidence-anchor contract observed | Closed grounded bundle, source hashes, exact JSON Pointer/text-span grounding |
| Claim control | No fail-closed typed claim contract observed | Typed claims, scope, evidence refs, unsupported verdicts fail closed |
| Semantic typing | Metric taxonomy, but no semantic-node grammar observed | Trend / Distribution / Ranking / MetricCluster / etc. with explicit axis semantics |
| Rendering | Markdown spec + suggested visual/layout | Deterministic compiler-owned HTML/SVG renderer |
| Provenance / manifest | Not observed | Canonical manifest + provenance markers |
| Delivered verification | Not observed | Final artifact/manifest cross-check and hash-bound verification |

### Threat assessment

**Threat: Low–Medium.**

It overlaps with the upstream “which metrics belong on the dashboard?” layer and benefits from a large surrounding PM-skills ecosystem. It does **not**, based on the current published skill, cover the combined `semantic trust + deterministic delivery` chain.

### Roadmap response

No v1.2.0 direction change is justified by this competitor.

Do not copy its generic North-Star template into the compiler. The more useful competitive response is to make Decision-First's differentiation legible:

- metrics are not selected because a framework says they are important;
- they earn first-view space because they change the confirmed decision/action;
- their visible meaning must be source-grounded;
- the production artifact must be deterministic and verifiably delivered.

## Positioning language to preserve

Avoid:

> AI dashboard builder

Prefer:

> A decision-first compiler for dashboards that must be grounded, semantically controlled, and reproducibly delivered.

Or, in plainer language:

> AI can generate the interface. Decision-First governs what deserves to be on it, what the evidence supports, and whether the delivered dashboard actually matches that contract.

## What would change the moat judgment

Raise a competitor to **High** threat only if one product begins to connect most of this chain in production rather than as prose guidance:

`worthiness / decision intake → semantic routing + exact grounding → fail-closed claim control → deterministic composition/rendering → provenance + delivered-artifact verification`

A competitor that only adds KPI selection, “decision-first” wording, prettier visuals, or AI chart generation does not meet that threshold.
