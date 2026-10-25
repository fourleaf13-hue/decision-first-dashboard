# Decision-First Dashboard — Moat & Market Evidence

_Last updated: 2026-10-25_

This document separates **market signals** from **product claims**. Reddit posts and competitor examples are directional evidence, not proof of market size or causal advantage.

## Moat thesis

Decision-First should not compete on “AI can build a dashboard.” Dashboard construction is becoming cheaper and more automated. The defensible layer is the governed chain that decides **whether a dashboard is warranted, what decision it must support, which sources are admissible, what evidence may be used, what may be claimed, how metrics are routed and typed, how composition is selected, and whether the delivered artifact actually matches that contract**.

Current production chain:

`Source / context → Worthiness Assessment → worthiness gate → Decision Brief → intake gate → Metric Routing Manifest → grounded evidence bundle → routing + grounding gates → semantic-node composition → deterministic renderer → canonical HTML / SVG + output.manifest.json → delivered-artifact verification`

Competitive audits now suggest one upstream extension should be considered for the next release candidate:

`Source discovery/context → Source Authority / Evidence Admission → Worthiness → Decision Brief → Metric Routing → exact grounding → claim control → semantic composition → deterministic delivery → delivered verification`

The moat is therefore not a single framework or visual style. It is the combination of:

1. **Decision worthiness** — refuse or redirect when a persistent dashboard is not the right artifact.
2. **Decision/Action intake** — confirm business intent before routing or rendering.
3. **Source authority** — admit evidence according to source role, freshness, grain, coverage, definition, and conflicts rather than merely because a source is available. This is a candidate extension, not yet a claim about current production capability.
4. **Semantic trust** — exact evidence grounding, metric routing, semantic typing, claim scope, fail-closed behavior.
5. **Composition authority** — semantic nodes and explicit composition decisions instead of free-form layout generation.
6. **Deterministic delivery** — one compiler/renderer path, canonical artifacts, no agent-authored visual fallback.
7. **Delivered-artifact verification** — provenance, manifest binding, machine-readable markers, and final hash-bound verification.

A shorter framing for the defensible core is:

**Authority → Enforcement → Verification**

- **Authority** decides what source, decision, metric meaning, claim, and composition are allowed.
- **Enforcement** blocks unsupported or unresolved output rather than smoothing over missing semantics.
- **Verification** proves the delivered artifact obeyed the admitted contract.

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

## Competitor watch — OpenAI Data Analytics / `build-dashboard`

Primary public sources:

- https://github.com/openai/plugins/blob/main/plugins/data-analytics/skills/build-dashboard/SKILL.md
- https://github.com/openai/plugins/blob/main/plugins/data-analytics/skills/create-data-context/SKILL.md
- https://github.com/openai/plugins/blob/main/plugins/data-analytics/skills/build-dashboard/specifications/mcp-artifact-dashboard.md

### Why this matters

This is the first adjacent public workflow in the current scan that overlaps across several layers at once:

- dashboard brief and business context;
- source discovery and source-of-truth guardrails;
- semantic-layer context;
- metric selection and role assignment;
- source-backed provenance;
- manifest/snapshot packaging;
- chart and dashboard validation;
- durable artifact delivery.

That overlap means **source-backed**, **semantic**, **manifest-driven**, and **validated dashboard** are no longer sufficient moat descriptions by themselves.

### OpenAI strengths relative to current Decision-First

OpenAI's public workflow is stronger or broader in:

- searching across all relevant connected/provided sources;
- rejecting a weaker substitute when a required source of truth is unavailable;
- resolving source conflicts using ownership, freshness, definition, grain, coverage, and directness;
- explicit data-quality and reconciliation checks;
- reusable semantic-layer creation and maintenance;
- BI/Sites/MCP/HTML/Streamlit delivery routing;
- access/freshness handling for operational dashboard handoff.

### Decision-First strengths relative to OpenAI's public contract

Decision-First remains stronger in the publicly visible contract around:

- explicit dashboard-worthiness machine gate;
- mandatory confirmed Decision + Action before routing/rendering;
- metric routing bound to the confirmed decision/action;
- exact source hashing plus JSON Pointer/text-span evidence anchors;
- typed claim/evidence control and unsupported-verdict fail-closed behavior;
- semantic-node typing with axis semantics;
- composition reason codes and context-coverage enforcement;
- deterministic compiler-owned canonical HTML/SVG;
- delivered artifact ↔ manifest structural cross-checks and hash-bound verifier-issued status.

### Newly exposed gap: source authority

The current grounded bundle proves **where a claim came from**, but its top-level source contract is singular and primarily identifies the source by kind, path, and SHA-256.

That does not yet encode an equally strong answer to:

> Why was this source allowed to control the metric when another source disagreed?

This is now the highest-value gap exposed by the competitor audit.

A v1.2.0 candidate should consider a machine-readable **Source Authority / Evidence Admission Gate** covering source role, freshness, grain, coverage, definition/version, required-source status, conflicts, and attributable selection rationale.

Detailed audit: `docs/competitive-audit-openai-build-dashboard-2026-10-25.md`.

### Threat assessment

**Threat: Medium.**

It is not High yet because the public workflow does not show the same combined hard gate across:

`worthiness → confirmed Decision/Action → exact evidence anchors → typed fail-closed claims → semantic composition legality → deterministic rendering → delivered artifact/manifest hash verification`

However, its strong source-discovery, data-trust, provenance, manifest and delivery contracts mean Decision-First should no longer rely on generic “source-backed semantic dashboard” language as differentiation.

### Roadmap response

Do **not** chase OpenAI's multi-surface publishing or generic metric-family breadth in v1.2.0.

Do consider, in priority order:

1. Source Authority / Evidence Admission Gate;
2. multi-source source registry while preserving exact evidence anchors;
3. bounded data-quality/reconciliation checks where grain/freshness/definition conflicts can invalidate meaning;
4. delivered lineage back to admitted source authority;
5. adversarial fixtures for conflicting/stale/wrong-grain/missing-required sources.

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

Also avoid relying on this as sufficient differentiation:

> source-backed semantic dashboard

Prefer:

> A governed decision-first compiler: authority decides what is allowed, enforcement blocks unsupported output, and verification proves the delivered dashboard obeyed the contract.

Or, in plainer language:

> AI can build a dashboard from data. Decision-First governs what is allowed to count as evidence, what the dashboard is allowed to claim, and whether the delivered interface actually follows those decisions.

## What would change the moat judgment

Raise a competitor to **High** threat only if one product begins to connect most of this chain in production rather than as prose guidance:

`worthiness → confirmed decision/action → source authority resolution → exact grounding → fail-closed claim control → semantic composition legality → deterministic rendering → provenance + delivered-artifact hash verification`

A competitor that only adds KPI selection, “decision-first” wording, prettier visuals, AI chart generation, semantic-layer context, or a manifest does not meet that threshold by itself.
