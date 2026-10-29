# Competitive Audit — OpenAI `build-dashboard`

_Date: 2026-10-25_

## Scope

This audit compares Decision-First Dashboard against OpenAI's public `build-dashboard` workflow and adjacent public Data Analytics contracts as visible on 2026-10-25.

Primary references:

- https://github.com/openai/plugins/blob/main/plugins/data-analytics/skills/build-dashboard/SKILL.md
- https://github.com/openai/plugins/blob/main/plugins/data-analytics/skills/create-data-context/SKILL.md
- https://github.com/openai/plugins/blob/main/plugins/data-analytics/skills/build-dashboard/specifications/mcp-artifact-dashboard.md

Decision-First baseline:

- current `main` repository state;
- package version currently remains `1.1.1`;
- no explicit `v1.2.0` branch or roadmap file was found in the repository, so this document treats current `main` as the candidate baseline for the next release rather than claiming an existing v1.2.0 plan.

This audit does not include unpushed local work.

## Executive conclusion

**Threat level: Medium.**

OpenAI `build-dashboard` is the first adjacent public workflow in this scan that overlaps across several layers at once: dashboard brief, source discovery, source authority, semantic context, metric selection, source-backed provenance, manifest/snapshot validation, chart rules, QA, and durable delivery.

That overlap means the following are no longer sufficient moat claims on their own:

- source-backed dashboards;
- semantic layers;
- dashboard QA;
- manifests;
- deterministic-looking artifact generation;
- "decision-relevant" metric selection.

Decision-First remains materially differentiated where it converts semantic judgment into **hard compiler authority** rather than guidance:

1. dashboard worthiness can redirect away from a dashboard;
2. Decision + Action must be explicitly confirmed before routing/rendering;
3. metric routing is bound to the confirmed decision/action;
4. evidence is anchored exactly to source locations and hashes;
5. unsupported claims and semantic ambiguities fail closed;
6. semantic node typing constrains legal presentation;
7. composition is compiler-owned rather than free-form;
8. rendering is deterministic and canonical;
9. delivered HTML/SVG is cross-checked against the manifest and hash-bound verification state.

The competitive boundary should therefore be expressed as:

**Authority → Enforcement → Verification**

not merely:

**Source-backed → Semantic → Deterministic**.

## Layer-by-layer comparison

| Layer | OpenAI `build-dashboard` | Decision-First | Current advantage |
|---|---|---|---|
| Dashboard format choice | Chooses dashboard vs report/notebook/chat based on task fit | Explicit Worthiness Assessment with Recurring Loop, Accountability Path, Response Change and redirect transitions | **Decision-First** |
| Business intent intake | Builds a dashboard brief; asks only when missing input materially changes the work; otherwise assumptions may be stated and used | Decision and Action must be `confirmed`; unresolved intent blocks routing/rendering | **Decision-First** |
| Source discovery | Explicitly searches all relevant connected/provided sources and fresh catalogs | Primarily validates provided source evidence; no equally explicit broad source-discovery contract observed | **OpenAI** |
| Required source guardrail | Stops when a required source of truth is unavailable; weaker substitutes cannot silently replace it | Exact grounding proves provenance of supplied source, but no equivalent source-authority admission contract is visible in the current grounded bundle | **OpenAI** |
| Multi-source conflict resolution | Compares ownership, freshness, definition, grain, coverage and directness | Current grounded bundle has one top-level `source`; no first-class multi-source conflict contract | **OpenAI** |
| Data trust / reconciliation | Checks source, grain, freshness, reconciliation; escalates to data-quality analysis | Strong evidence integrity and semantic legality, but upstream data-quality/reconciliation is not equally explicit | **OpenAI** |
| Persistent semantic context | Can create maintained semantic-layer skills with source inventory and provenance | Semantic rules are embedded in the compiler/skill; no general reusable business semantic-layer authoring workflow | **OpenAI**, but outside core moat |
| Metric model | Balanced metric families mapped to hero / diagnostic / guardrail / detail roles | Metric Router binds every metric to decision roles and visibility | **Decision-First** for enforcement |
| First-view hierarchy | Decision-relevant hero metrics, trend, diagnosis, detail | First-view minimum sufficient decision signals + active exceptions; everything else preserved downstream | **Decision-First** |
| Exact evidence grounding | Provenance per source/query/card; source-backed data required | Source SHA-256 + exact JSON Pointer/text-span anchors + claim refs | **Decision-First** |
| Claim control | Strong source caveats and source-backed requirement; no observed closed typed claim/evidence gate equivalent | Typed claims, scope/evidence refs, unsupported verdicts fail closed | **Decision-First** |
| Semantic typing | Metric families and chart-selection guidance | Explicit semantic node types with axis semantics and fail-closed ambiguity handling | **Decision-First** |
| Visual encoding legality | Detailed chart guidance and artifact renderer rules | Shared visual grammar, comparability domains, normalization/scale contracts, illegal shared encodings fail closed | **Decision-First** |
| Composition | Summary-to-detail layout guidance; native block hierarchy | Compiler-owned semantic composition + reason codes + context-coverage gate | **Decision-First** |
| Renderer | Multiple delivery surfaces and a validated artifact runtime | One deterministic compiler-owned HTML/SVG production path | Different strengths |
| Manifest / snapshot | Canonical manifest + bounded reviewed snapshot for MCP/Sites | `output.manifest.json` plus canonical HTML/SVG | Comparable conceptually |
| Artifact validation | Validates manifest/snapshot before rendering; checks charts, filters, reconciliation and delivery surface | Verifier cross-checks actual delivered markers/structure against manifest and binds final artifact/manifest hashes | **Decision-First** |
| Operational delivery | BI tools, Sites, MCP artifact app, HTML, Streamlit, refresh/access handling | Primarily portable canonical HTML/SVG compiler output | **OpenAI**, but not a v1.2 moat priority |

## The most important newly exposed gap

### Exact provenance is not the same as source authority

Decision-First currently has a strong grounded-bundle contract, but the top-level `source` is singular and requires only:

- `kind`;
- `path`;
- `sha256`.

That is excellent for answering:

> "Did this visible claim come from this exact source payload?"

It is not yet enough to answer:

> "Why was this source admitted as authoritative when another source disagreed?"

OpenAI's public workflow explicitly considers:

- ownership;
- freshness;
- definition;
- grain;
- coverage;
- directness;
- source conflicts;
- required-source availability.

This is a real semantic-trust gap because exact grounding can faithfully ground a claim to a stale, secondary, wrong-grain, or superseded source.

## v1.2.0 candidate gap audit

### P0 — Add a Source Authority / Evidence Admission Gate

Add a machine-readable contract before the grounded evidence bundle is accepted.

Recommended conceptual shape:

```text
Source Registry
  → source role / authority
  → freshness
  → grain
  → coverage
  → definition/version
  → required-source status
  → conflict set
  → selection rationale
  → Evidence Admission Gate
  → grounded evidence bundle
```

Minimum fields worth considering per source:

- stable `sourceId`;
- `authorityRole`: authoritative / complementary / contextual / fallback;
- `asOf` or freshness metadata when applicable;
- `grain`;
- coverage/window;
- definition/version identifier when known;
- `requiredFor` references;
- conflict references;
- admission decision + reason code.

Required behavior:

- if a required source is unavailable, fail or ask rather than silently substitute;
- if two authoritative candidates conflict materially, fail closed or require an explicit resolution;
- a weaker source may supplement but must not silently override an authoritative source;
- source-selection decisions must be machine-attributable, not prose-only.

### P0 — Generalize the grounded bundle from one source to a source registry

The current schema's singular top-level `source` becomes a limitation once real dashboards combine business docs, metric definitions, query results and operational data.

The next contract should allow multiple admitted sources while keeping every evidence anchor unambiguous.

A safe direction is:

```text
sources[]
  sourceId
  kind
  path
  sha256
  authority metadata

evidence[]
  id
  sourceRef
  anchor

claims[]
  decisionPath
  evidenceRef(s)
```

Do not weaken exact anchoring while adding multi-source support.

### P1 — Add a bounded data-quality / reconciliation gate

Do **not** turn Decision-First into a general data platform.

Add only the checks that can invalidate dashboard meaning:

- incompatible grain;
- stale required source;
- numerator/denominator mismatch;
- conflicting metric definitions;
- comparison-window mismatch;
- duplicate or contradictory actuals;
- unsupported join assumptions.

If the compiler cannot mechanically validate a risk, it should surface a typed unresolved condition rather than invent confidence.

### P1 — Extend delivered verification to source-authority lineage

Current delivered verification is strong on semantic-node/presentation/coverage structure.

Once a source registry exists, the manifest should also make it possible to verify that visible claims/nodes point back to admitted sources, not merely to evidence IDs detached from source-authority decisions.

The user-facing dashboard does not need to display internal methodology labels. The machine-readable artifact should preserve the chain.

### P1 — Sharpen public positioning

Recommended moat language:

> **Decision-First is a governed dashboard compiler: authority decides what is allowed, enforcement blocks unsupported output, and verification proves the delivered artifact obeyed the contract.**

Plain-language version:

> **AI can build a dashboard from data. Decision-First decides what is allowed to count as evidence, what the dashboard is allowed to claim, and verifies that the delivered interface actually follows those decisions.**

Do not rely on these phrases as primary differentiation by themselves:

- source-backed;
- semantic dashboard;
- validated dashboard;
- manifest-driven dashboard;
- AI dashboard with QA.

### P1 — Add adversarial source-authority fixtures

At minimum:

1. two sources with the same metric but different freshness;
2. two sources with the same label but different definitions;
3. correct metric at incompatible grain;
4. missing required source with a tempting fallback;
5. authoritative source + complementary diagnostic source;
6. conflicting sources where no safe automatic winner exists.

Success should mean the compiler either chooses with an attributable rule or fails/asks. Silent source substitution is a failure.

### P2 — Consider source freshness/access indicators in the manifest

Useful, but not required to protect the core moat in the first v1.2.0 cut.

### P2 — Consider reusable semantic-layer interoperability

Decision-First should be able to consume a semantic layer or source-authority manifest eventually, but it does not need to become a semantic-layer authoring platform in v1.2.0.

## What not to chase in v1.2.0

The OpenAI workflow is stronger in several areas that should **not** redirect the roadmap now:

- Sites publishing;
- BI-platform publishing;
- Streamlit routing;
- broad connector discovery;
- persistent semantic-layer creation;
- generic metric-family frameworks;
- generic dashboard refresh UX;
- broad application-level filter/menu behavior.

Those capabilities improve distribution and operational reach, but they do not strengthen the core `semantic trust + deterministic delivery` chain as much as source authority does.

## Why OpenAI is not High threat yet

Raise this competitor to **High** only if the public workflow begins connecting most of the following into hard production gates rather than guidance/checklists:

`dashboard worthiness → confirmed Decision/Action → source authority resolution → exact evidence anchoring → typed fail-closed claims → semantic composition legality → deterministic rendering → delivered artifact/manifest hash verification`

Today it is strong in source discovery, data trust, metric selection, provenance, validation, and delivery surfaces. It does not publicly show the same hard confirmed-intent gate, exact claim-anchor contract, semantic fail-closed composition chain, or delivered hash-bound verifier.

## Roadmap decision

**Do not change the v1.2.0 direction toward generic dashboard generation or multi-surface publishing.**

**Do add source authority / evidence admission as the highest-value gap exposed by this audit.**

The revised strategic chain should become:

`Source discovery/context → Source Authority / Evidence Admission → Worthiness → Decision Brief → Metric Routing → exact grounding → claim control → semantic composition → deterministic renderer → canonical artifact + manifest → delivered verification`

The order between Source Authority and Worthiness may vary operationally depending on whether worthiness can be assessed from context before data access, but both must be resolved before evidence-dependent dashboard claims are admitted.
