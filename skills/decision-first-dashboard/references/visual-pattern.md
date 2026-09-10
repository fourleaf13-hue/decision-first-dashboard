# Visual Pattern Reference

Use `after-reference.png` and the approved premium data-visualization references as a **visual family**, never as a source of business data.

The deterministic renderer owns geometry. The agent supplies only validated decision-state data.

## Signature composition

The renderer should feel like a designed decision interface rather than a cleaned-up BI template.

Preferred balance:

- left support: about 20–25%;
- dominant center: about 45–50%;
- right support: about 25–30%.

The signature visual language is:

- a large open circular center field as the first focal point;
- layered ambient halos that create depth without pretending to be quantitative scale;
- a true profile radar only when 3–6 dimensions are comparable on one grounded scale;
- elevated translucent support surfaces at the sides for context, diagnosis, exceptions, and events;
- asymmetric information density: profile in the center, explanation on the left, attention items on the right;
- restrained cool background, generous whitespace, and strong typographic hierarchy;
- source-backed mini trends where they genuinely explain movement.

Supporting cards are allowed and encouraged when they make the output feel like a production dashboard. They must remain subordinate to the center and must not collapse back into a flat wall of equally weighted KPI cards.

## No-score composition

A no-score dashboard has two valid center behaviors.

When the routed primary signals are heterogeneous raw KPIs, use the non-radar radial/orbit signal composition. Different units must never be encoded as polygon distance.

When 3–6 routed primary dimensions pass radar eligibility, use a neutral profile radar:

```text
                         Dimension
                      value  ↑/↓ delta

                    ┌── 100% ──┐
                 ┌───── 80% ─────┐
              ┌──────── 60% ────────┐
           ┌─────────── 40% ───────────┐
 left label  ←   previous/current profile   →  right label
 right aligned                               left aligned
           └───────────────────────────────┘

                         Dimension
                      value  ↑/↓ delta
```

The radar center is intentionally empty. Do not place an overall score, health badge, `IMPROVING`, `At risk`, or other synthetic verdict in the middle. The profile shape itself communicates expansion, contraction, imbalance, and relative weakness.

## Radar profile eligibility

Radar is a profile visualization, **not a score visualization**. It may represent percentages, achievement rates, normalized values, maturity levels, or other peer dimensions when they share one meaningful source-backed scale.

Use a radar only when all of these conditions hold:

- 3–6 peer dimensions describe the same object or condition;
- every vertex uses the same source-backed numeric scale;
- the dimensions are meaningfully comparable;
- every displayed dimension is grounded and passes the Action Trigger Test;
- mixed-unit raw KPIs are not being normalized merely to make a radar possible.

Three dimensions form a triangle. Four to six dimensions use one vertex per dimension. Fewer than three dimensions are not radar-eligible.

A radar does **not** require an overall score. `no_score` may render a radar whenever the comparable dimensions and shared scale are grounded.

## Quantitative radar geometry

The quantitative grid is fixed and must not be improvised for visual effect.

- Render exactly **four concentric scale rings** at **40%, 60%, 80%, and 100%** of the radar radius.
- All four rings share exactly one center.
- Ring radii are proportional: `0.4R`, `0.6R`, `0.8R`, `1.0R`.
- The scale rings are thin and quiet. They are measurement guides, not decorative halos.
- Decorative ambient halos may sit behind the radar, but they must remain visually distinct from the four quantitative rings.
- All polygon vertices stay inside the 100% ring.

## Current versus previous profile

A simple period comparison is allowed only when both periods use identical dimensions and scale.

- Previous period: blue profile, rendered first/below the current profile.
- Current period: pink/red profile, rendered above the previous profile.
- Current vertices use small visible circular markers.
- Previous vertices do not need markers.
- A previous-period profile must be complete across every displayed dimension; partial comparison profiles are rejected.
- Every previous-period normalized value must be source-backed and remain inside the same declared scale.

Do not create multi-series spider webs. One current profile plus at most one comparison profile is the intended pattern.

## Dimension labels and deltas

Every radar dimension keeps its concrete business value visible. The polygon shape is not a replacement for the actual number.

All dimension copy belongs **outside the 100% ring**:

1. dimension name;
2. current concrete value;
3. optional period delta.

Alignment follows physical position around the circle:

- left-side labels and values: **right-aligned**;
- right-side labels and values: **left-aligned**;
- exact top and bottom labels: centered.

Delta arrows communicate numeric movement:

- positive numeric change → `↑`;
- negative numeric change → `↓`;
- flat change → `→`.

Delta **color** communicates business favorability and must use the grounded signal direction, not the arithmetic sign. For example, churn falling from 6.8% to 4.2% may correctly render a green downward arrow.

## Evidence rules that affect rendering

- Numeric trend series render only when the contract marks them as source-supported.
- If an exact trend series is unavailable, the renderer states that the trend data is unavailable instead of drawing an invented chart.
- Account exceptions and events render only with source provenance.
- No-score mode never renders a 0–100 overall score or unsupported health band.
- Radar scale, current normalized values, and any previous-period normalized values must be grounded.
- Visual depth, ambient halos, cards, and connection lines are presentation only. They do not create evidence or business semantics.

## Product language

Use product-native labels such as `Subscription health`, `Revenue growth`, `Movement context`, `Accounts to watch`, and `Recent events`.

Do not expose method labels such as `Primary Decision`, `Diagnostic`, `Outcome`, `Actionable`, `Required Interventions`, or `Decision-first view`.

## Geometry guardrails

The templates intentionally omit:

- four-card KPI strips;
- full-width customer tables;
- health banners without source support;
- workflow/action buttons without source support;
- arbitrary free-text insight panels;
- score-like text in the middle of a radar merely to fill empty space.

The center should remain visually dominant even when the side support surfaces contain more literal information. Do not solve overload by shrinking type or squeezing more peers into the center.

If a user wants a different visual system, modify the deterministic templates deliberately; do not let the LLM improvise a replacement layout during ordinary dashboard compilation.

## Composite mode

A genuine source-supported composite score may still exist. Keep that real score and its band in a support card rather than using it as the radar's center label. Its 3–6 comparable normalized components may form the profile radar using the same neutral center and 40/60/80/100 visual grammar.

Never invent a composite score, normalized component, weight, band, previous-period value, or radar scale merely to obtain the signature visual.

## Visualization tool routing

Do not confuse a chart library with a visual-design skill. Recharts, visx, Bokeh, Cube, Nivo, Vue-ECharts, and Scrollama are primarily implementation libraries or infrastructure; ApexCharts currently provides a dedicated official AI skill.

The default production path in this repository remains deterministic SVG/HTML. If a user explicitly asks for a framework implementation, choose the tool according to `visual-stack-routing.md`. In particular, prefer **visx** for bespoke React geometry that must closely reproduce the signature layout, and **Recharts** for conventional supporting charts. Never import a library merely to obtain its default demo aesthetic.
