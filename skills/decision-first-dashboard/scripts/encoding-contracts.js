// Frozen encoding contracts shared by the encoding router, the internal
// visual spec builder, and the delivered geometry verifier. This module must
// stay dependency-free so production layers can share one source of truth
// without import cycles.

export const ADDITIVE_CONTRACT_TOLERANCE = Object.freeze({
  name: 'ADDITIVE_CONTRACT_TOLERANCE',
  relativeFactor: 0.011,
  absoluteFloor: 0.0005
});

export const BULLET_GAP_CONTRACT_TOLERANCE = Object.freeze({
  name: 'BULLET_GAP_CONTRACT_TOLERANCE',
  relativeFactor: 0.011,
  absoluteFloor: 0.0005
});

export const GROUNDED_RANKING_MAX_CANDIDATES = 5;

export function contractWithinTolerance(computed, declared, tolerance = ADDITIVE_CONTRACT_TOLERANCE) {
  const allowed = Math.max(Math.abs(declared) * tolerance.relativeFactor, tolerance.absoluteFloor);
  return Math.abs(computed - declared) <= allowed;
}

export function mapFraction(value, domain) {
  const [low, high] = domain;
  if (!(high > low)) return 0;
  return Math.max(0, Math.min(1, (value - low) / (high - low)));
}
