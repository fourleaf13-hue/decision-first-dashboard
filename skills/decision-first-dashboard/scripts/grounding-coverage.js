import { validateGroundedBundle as validateBaseGrounding } from './grounding.js';

function visibleBreakdownPaths(decisionState) {
  const paths = [];
  decisionState?.breakdown?.forEach((item, index) => {
    for (const field of ['label', 'value', 'delta', 'direction']) {
      if (Object.hasOwn(item, field)) paths.push(`/breakdown/${index}/${field}`);
    }
  });
  return paths;
}

export function validateGroundedBundle(bundle, options = {}) {
  const base = validateBaseGrounding(bundle, options);
  if (!base.valid) return base;

  const decisionState = bundle?.decisionState;
  if (decisionState?.mode !== 'no_score' || !decisionState.breakdown?.length) {
    return base;
  }

  const claimedPaths = new Set(bundle.claims.map((claim) => claim.decisionPath));
  const errors = visibleBreakdownPaths(decisionState)
    .filter((path) => !claimedPaths.has(path))
    .map((path) => ({
      code: 'MISSING_REQUIRED_GROUNDING',
      path,
      message: 'required source fact has no evidence claim'
    }));

  if (errors.length === 0) return base;

  return {
    valid: false,
    stage: 'grounding',
    transition: 'RETURN_TO_EVIDENCE_EXTRACTION',
    errors
  };
}
