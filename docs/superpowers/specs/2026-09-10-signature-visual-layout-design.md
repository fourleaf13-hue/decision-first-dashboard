# Signature Visual Layout Design

## Scope

Change only deterministic SVG/HTML presentation. Preserve dashboard worthiness, Decision Brief, Metric Router, grounding, no-score/composite eligibility, and radar eligibility contracts.

## Visual system

- Keep the center as the first focal point, but increase visual depth with layered circular halos and stronger orbit geometry.
- Use elevated translucent support cards on the left and right so the output still feels like a production dashboard rather than a sparse presentation slide.
- Give radar dimensions and ordinary radial signals compact floating metric-orb treatments instead of plain text around a large empty field.
- Maintain asymmetric information density: center for synthesis/profile, left for context/diagnosis, right for exceptions/events.
- Keep real source-backed trends when available and preserve explicit unavailable states when not.

## Evidence constraints

- Never invent a composite score or health band.
- Never connect mixed-unit raw KPIs into a radar polygon.
- A no-score radar still requires 3–6 peer dimensions on one grounded scale with source-backed normalized scores.
- Composite score rendering still requires the existing grounded score model.

## Testing

Update the visual-fidelity contract first so the old layout fails. Then implement the renderer/template/CSS changes and run the full compiler test suite plus both production compile paths before merge.
