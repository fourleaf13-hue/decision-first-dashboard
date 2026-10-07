# Decision-First Editorial Visual System

> Visual system id: `editorial-v1`

This layer controls **how already-grounded decision content is presented**. It does not create metrics, infer causality, invent actions, change evidence strength, or override the semantic composition selected upstream.

## Design intent

Decision-First output should read like an edited decision brief, not a generic BI card wall.

1. **Editorial hierarchy first.** Use typography, whitespace, alignment, and dividers before introducing containers.
2. **One dominant visual.** A first view may contain several pieces of evidence, but only one visual region may behave as the primary diagnostic anchor.
3. **Border before card.** If whitespace or a divider can establish grouping, do not create a raised card.
4. **Semantic color only.** Accent and status colors must encode hierarchy or source-grounded state. Decorative gradients are forbidden.
5. **Explicit reading path.** The composition must make the intended order legible without requiring the user to compare equally weighted tiles.
6. **Action remains distinct.** A recommended action, when source/decision semantics authorize one, is an independent subtle region rather than a CTA embedded inside an evidence card.

## Component authority

`components.manifest.json` is the machine-readable component inventory. There is deliberately no first-class `generic-card` component. Renderers should select the narrowest semantic component that matches the upstream role.

`tokens.css` is the executable visual token source. Production rendering should not invent new color, spacing, radius, or type values when a token exists.

## Surfaces

- Page and analytical regions default to flat white surfaces.
- Anchor and primary regions are separated with stronger rules and typography, not elevation.
- Supporting evidence is visually quieter than primary diagnostic content.
- Subtle tinted surfaces are reserved for bounded callouts such as a recommended next move.
- Decorative shadows and glass effects are not part of this system.

## Typography

The scale is intentionally editorial: large finding copy, restrained analytical labels, and compact metadata. A title should not become large merely because it is inside a component; type size follows semantic role.

## Color

Neutral ink carries ordinary facts. The brand accent identifies hierarchy and focus. Positive/negative/warning tokens may be used only when the upstream semantic payload explicitly authorizes that state. The visual system must never derive severity from a raw numeric sign.

## Diagnosis presentation contract

`archetypes/diagnosis.json` describes the desired visual slot grammar for a diagnosis page. It is a **presentation contract only**. It does not add a new composition-intent router capability and does not authorize the renderer to classify a page as diagnosis on its own.

When an upstream semantic layer eventually supplies a grounded diagnosis composition, the intended order is:

1. Finding
2. Primary diagnostic
3. Secondary evidence
4. Driver evidence strip
5. Recommended next move

The current renderer may consume only the subset of these roles that the canonical semantic composition already exposes. Missing semantic roles must collapse rather than be fabricated.

## Anti-patterns

- Uniform KPI rows before the finding
- Equal visual weight across all regions
- Generic rounded cards as the default grouping primitive
- Decorative gradients or icon confetti
- Multiple competing hero charts
- Action copy inserted into evidence regions
- Visual treatment that implies causality or severity not present in the grounded semantic state
