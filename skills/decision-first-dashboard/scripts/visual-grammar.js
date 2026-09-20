import { resolveNodeRelationship } from './relationship-grammar.js';
import {
  BULLET_GAP_CONTRACT_TOLERANCE,
  contractWithinTolerance
} from './encoding-contracts.js';

const PRESENTATION_VISUALS = {
  Trend: {
    full_chart: { mark: 'line', orientation: 'horizontal', encoding: { x: 'ordered_item', y: 'value' }, scale: 'local', domain: 'node', layout: 'full_width', structure: 'ordered-trajectory' },
    sparkline: { mark: 'line', orientation: 'horizontal', encoding: { x: 'ordered_item', y: 'value' }, scale: 'local', domain: 'node', layout: 'compact', structure: 'ordered-trajectory' },
    summary: { mark: 'value', orientation: 'horizontal', encoding: { text: 'current_value' }, scale: 'none', domain: 'item', layout: 'compact', structure: 'current-value' }
  },
  Distribution: {
    full_chart: { mark: 'bar', orientation: 'vertical', encoding: { x: 'ordered_item', y: 'value' }, scale: 'local', domain: 'node', layout: 'full_width', structure: 'ordered-distribution' },
    peak_summary: { mark: 'bar', orientation: 'vertical', encoding: { x: 'peak_item', y: 'value' }, scale: 'local', domain: 'item', layout: 'compact', structure: 'peak-summary' },
    summary: { mark: 'value', orientation: 'horizontal', encoding: { text: 'current_value' }, scale: 'none', domain: 'item', layout: 'compact', structure: 'current-value' }
  },
  Breakdown: {
    full_breakdown: { mark: 'bar', orientation: 'horizontal', encoding: { x: 'value', y: 'component' }, scale: 'local', domain: 'node', layout: 'full_width', structure: 'decomposition' },
    waterfall: { mark: 'waterfall', orientation: 'horizontal', encoding: { x: 'signed_delta', y: 'component' }, scale: 'local', domain: 'node', layout: 'full_width', structure: 'additive-path' },
    summary: { mark: 'value', orientation: 'horizontal', encoding: { text: 'current_value' }, scale: 'none', domain: 'item', layout: 'compact', structure: 'current-value' }
  },
  Ranking: {
    both_ends: { mark: 'paired_bar', orientation: 'horizontal', encoding: { x: 'magnitude', y: 'ranking_end' }, scale: 'shared', domain: 'node', layout: 'paired', structure: 'ranked-order' },
    full_ranking: { mark: 'bar', orientation: 'horizontal', encoding: { x: 'magnitude', y: 'rank' }, scale: 'local', domain: 'node', layout: 'full_width', structure: 'ranked-order' },
    top_summary: { mark: 'bar', orientation: 'horizontal', encoding: { x: 'magnitude', y: 'top_rank' }, scale: 'local', domain: 'item', layout: 'compact', structure: 'top-ranked' },
    summary: { mark: 'value', orientation: 'horizontal', encoding: { text: 'current_value' }, scale: 'none', domain: 'item', layout: 'compact', structure: 'current-value' }
  },
  Relationship: {
    full_chart: { mark: 'gap_bar', orientation: 'horizontal', encoding: { x: 'value', y: 'relation_role' }, scale: 'shared', domain: 'node', layout: 'full_width', structure: 'target-gap' },
    bullet_target: { mark: 'bullet', orientation: 'horizontal', encoding: { x: 'value', marker: 'target', annotation: 'gap' }, scale: 'shared', domain: 'node', layout: 'full_width', structure: 'target-bullet' },
    summary: { mark: 'value', orientation: 'horizontal', encoding: { text: 'current_value' }, scale: 'none', domain: 'item', layout: 'compact', structure: 'current-value' }
  },
  ExceptionList: {
    full_list: { mark: 'list', orientation: 'vertical', encoding: { text: 'exception' }, scale: 'none', domain: 'item', layout: 'compact', structure: 'exception-list' },
    compact_list: { mark: 'list', orientation: 'vertical', encoding: { text: 'exception' }, scale: 'none', domain: 'item', layout: 'compact', structure: 'exception-list' },
    summary: { mark: 'value', orientation: 'horizontal', encoding: { text: 'current_value' }, scale: 'none', domain: 'item', layout: 'compact', structure: 'current-value' }
  },
  Drilldown: {
    reachable_detail: { mark: 'detail_list', orientation: 'vertical', encoding: { text: 'detail' }, scale: 'none', domain: 'item', layout: 'compact', structure: 'reachable-detail' },
    summary: { mark: 'value', orientation: 'horizontal', encoding: { text: 'current_value' }, scale: 'none', domain: 'item', layout: 'compact', structure: 'current-value' }
  },
  MetricCluster: {
    radar: { mark: 'radar', orientation: 'radial', encoding: { angle: 'dimension', radius: 'normalizedScore' }, scale: 'shared', domain: 'profile', layout: 'full_width', structure: 'profile-shape' },
    comparison: { mark: 'metric_tile', orientation: 'horizontal', encoding: { text: 'metric_value' }, scale: 'independent', domain: 'metric', layout: 'compact', structure: 'metric-comparison' },
    summary: { mark: 'metric_tile', orientation: 'horizontal', encoding: { text: 'metric_value' }, scale: 'independent', domain: 'metric', layout: 'compact', structure: 'current-value' }
  }
};

export const VISUAL_SPEC_REGISTRY = Object.freeze(
  Object.fromEntries(Object.entries(PRESENTATION_VISUALS).map(([type, presentations]) => [
    type,
    Object.freeze(Object.fromEntries(Object.entries(presentations).map(([presentation, spec]) => [
      presentation,
      Object.freeze({ ...spec, encoding: Object.freeze({ ...spec.encoding }) })
    ])))
  ]))
);

export const VISUAL_REASON_CODES = Object.freeze([
  'COMPARABILITY_CONFIRMED',
  'UNIT_MISMATCH',
  'COMPARISON_GROUP_MISMATCH',
  'COMPARABILITY_DOMAIN_MISMATCH',
  'NORMALIZATION_MISMATCH',
  'SCALE_MISMATCH',
  'COMPARABILITY_METADATA_REQUIRED',
  'HETEROGENEOUS_METRIC_UNCOMPARABLE',
  'PROFILE_COMPARABILITY_CONFIRMED',
  'PROFILE_COMPARABILITY_FAILED',
  'RELATIONSHIP_GROUNDED',
  'RELATIONSHIP_INTRINSIC',
  'RELATIONSHIP_NOT_REQUIRED',
  'COMPARISON_RELATIONSHIP_REQUIRED',
  'RELATIONSHIP_REF_UNRESOLVED',
  'RELATIONSHIP_REF_CONFLICT',
  'RELATIONSHIP_SUBJECT_NOT_COVERED',
  'RELATIONSHIP_TYPE_MISMATCH',
  'RELATIONSHIP_IDENTITY_MISMATCH',
  'PAIRED_RANKING_ELIGIBLE',
  'FULL_SHAPE_CONTEXT_REQUIRED',
  'SOURCE_STRUCTURE_REQUIRED',
  'AUDIENCE_DENSITY_LIMIT',
  'FIRST_VIEW_BUDGET',
  'CONTEXT_REQUIRES_DISTRIBUTION_SHAPE',
  'CONTEXT_REQUIRES_RELATIVE_COMPARISON',
  'CONTEXT_REQUIRES_RANKING_SPAN',
  'CONTEXT_REQUIRES_TEMPORAL_REFERENCE',
  'CONTEXT_REQUIRES_TARGET_REFERENCE',
  'CONTEXT_REQUIRES_GAP_ATTRIBUTION',
  'CONTEXT_REQUIRES_CONTRIBUTOR_COMPARISON',
  'CONTEXT_REQUIRES_DECOMPOSITION'
]);

const VISUAL_REASON_SET = new Set(VISUAL_REASON_CODES);
const REF_KEYS = ['requirementRef', 'modifierRef', 'evidenceRefs'];
const VISUAL_LAYOUT_PATTERNS = new Set(['compact', 'paired', 'full_width', 'hero_support', 'asymmetric']);

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0) ?? null;
}

export function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inferUnit(value) {
  if (typeof value === 'number') return 'number';
  const text = String(value ?? '').trim();
  if (!text) return 'unknown';
  if (/[%]|\bpercent\b|\bpp\b/i.test(text)) return 'percent';
  if (/^[$€£¥]|\b(?:usd|eur|gbp|currency)\b/i.test(text)) return 'currency';
  if (/\b(?:mo|month|months|day|days|week|weeks|year|years)\b/i.test(text)) return 'duration';
  if (/x$/i.test(text)) return 'ratio';
  return 'number';
}

function scaleSignature(value) {
  const scale = objectOrEmpty(value);
  const id = firstString(scale.id, scale.scaleId);
  if (id) return id;
  if (Number.isFinite(scale.min) && Number.isFinite(scale.max)) return `${scale.min}:${scale.max}`;
  return null;
}

function subjectComparability(subject, { nodeId = 'local', parent = {} } = {}) {
  const source = objectOrEmpty(subject);
  const parentSource = objectOrEmpty(parent);
  const nested = objectOrEmpty(source.comparability);
  const parentNested = objectOrEmpty(parentSource.comparability);
  const value = source.value;
  const unit = firstString(nested.unit, source.unit, parentNested.unit, parentSource.unit) ?? inferUnit(value);
  const comparisonGroup = firstString(
    nested.comparisonGroup,
    source.comparisonGroup,
    parentNested.comparisonGroup,
    parentSource.comparisonGroup
  );
  const comparabilityDomain = firstString(
    nested.comparabilityDomain,
    source.comparabilityDomain,
    parentNested.comparabilityDomain,
    parentSource.comparabilityDomain
  );
  const normalization = firstString(
    nested.normalization,
    source.normalization,
    parentNested.normalization,
    parentSource.normalization
  ) ?? 'raw';
  const scaleId = firstString(
    nested.scaleId,
    source.scaleId,
    parentNested.scaleId,
    parentSource.scaleId
  ) ?? scaleSignature(nested.scale) ?? scaleSignature(source.scale) ?? scaleSignature(parentNested.scale) ?? scaleSignature(parentSource.scale);
  return { unit, comparisonGroup, comparabilityDomain, normalization, scaleId };
}

function mismatchedField(subjects, field) {
  const values = new Set(subjects.map((subject) => subject[field]).filter((value) => value !== null && value !== undefined));
  return values.size > 1;
}

export function evaluateComparability(subjects = [], options = {}) {
  const list = Array.isArray(subjects) ? subjects : [];
  const normalized = list.map((subject) => subjectComparability(subject, options));
  const reasons = [];
  const requireExplicit = options.requireExplicit === true;
  const explicitMetadata = list.every((subject) => {
    const source = objectOrEmpty(subject);
    const nested = objectOrEmpty(source.comparability);
    return Boolean(
      firstString(nested.unit, source.unit) &&
      firstString(nested.comparisonGroup, source.comparisonGroup) &&
      firstString(nested.comparabilityDomain, source.comparabilityDomain)
    );
  });

  if (normalized.length === 0) reasons.push('no comparable subjects were supplied');
  if (mismatchedField(normalized, 'unit')) reasons.push('subjects use different units');
  if (mismatchedField(normalized, 'comparisonGroup')) reasons.push('subjects belong to different comparison groups');
  if (mismatchedField(normalized, 'comparabilityDomain')) reasons.push('subjects belong to different comparability domains');
  if (mismatchedField(normalized, 'normalization')) reasons.push('subjects use different normalization rules');
  if (mismatchedField(normalized, 'scaleId')) reasons.push('subjects use incompatible scales');
  if (requireExplicit && !explicitMetadata) reasons.push('shared comparison requires explicit source comparability metadata');

  let reasonCode = 'COMPARABILITY_CONFIRMED';
  if (reasons.some((reason) => reason.includes('different units'))) reasonCode = 'UNIT_MISMATCH';
  else if (reasons.some((reason) => reason.includes('comparison groups'))) reasonCode = 'COMPARISON_GROUP_MISMATCH';
  else if (reasons.some((reason) => reason.includes('comparability domains'))) reasonCode = 'COMPARABILITY_DOMAIN_MISMATCH';
  else if (reasons.some((reason) => reason.includes('normalization'))) reasonCode = 'NORMALIZATION_MISMATCH';
  else if (reasons.some((reason) => reason.includes('scales'))) reasonCode = 'SCALE_MISMATCH';
  else if (reasons.some((reason) => reason.includes('explicit'))) reasonCode = 'COMPARABILITY_METADATA_REQUIRED';
  else if (normalized.length === 0) reasonCode = 'COMPARABILITY_METADATA_REQUIRED';

  return {
    pass: reasons.length === 0,
    reasonCode,
    reasons,
    subjects: normalized
  };
}

export function evaluateProfileComparability(dimensions = [], node = {}) {
  const profile = objectOrEmpty(node.profile);
  const result = evaluateComparability(dimensions, { nodeId: node.id ?? 'profile', parent: node });
  const sharedScale = profile.sharedScale === true;
  const normalized = dimensions.every((dimension) => Number.isFinite(dimension?.normalizedScore));
  const pass = result.pass && sharedScale && normalized;
  const reasons = [...result.reasons];
  if (!sharedScale) reasons.push('profile does not declare a shared scale');
  if (!normalized) reasons.push('profile dimensions lack source-backed normalization');
  return {
    ...result,
    pass,
    reasonCode: pass ? 'PROFILE_COMPARABILITY_CONFIRMED' : result.pass ? 'PROFILE_COMPARABILITY_FAILED' : result.reasonCode,
    reasons
  };
}

function modifierReference(modifiers = {}) {
  return Array.isArray(modifiers.activeModifierIds) && modifiers.activeModifierIds.length > 0
    ? modifiers.activeModifierIds[0]
    : 'default_composition';
}

function contextRequirementFor(node, contextRequirements = []) {
  return contextRequirements.find((requirement) => requirement?.subject === node.id) ?? null;
}

function decisionFor(node, decisionLog = []) {
  return decisionLog.find((entry) => entry?.node === node.id) ?? null;
}

function layoutAttribution(node, pattern, { contextRequirements = [], modifiers = {}, decisionLog = [] } = {}) {
  const requirement = contextRequirementFor(node, contextRequirements);
  const decision = decisionFor(node, decisionLog);
  if (pattern === 'paired') {
    return {
      reasonCode: 'PAIRED_RANKING_ELIGIBLE',
      ...(requirement ? { requirementRef: requirement.id } : decision?.modifierRef ? { modifierRef: decision.modifierRef } : { modifierRef: modifierReference(modifiers) })
    };
  }
  if (requirement) {
    return { reasonCode: `CONTEXT_REQUIRES_${String(requirement.type).toUpperCase()}`, requirementRef: requirement.id };
  }
  if (modifiers.density === 'compact' && node.sourcePresentation && node.sourcePresentation !== node.presentation) {
    return { reasonCode: 'AUDIENCE_DENSITY_LIMIT', modifierRef: modifierReference(modifiers) };
  }
  if (node.type === 'MetricCluster' && node.presentation === 'comparison') {
    return { reasonCode: 'HETEROGENEOUS_METRIC_UNCOMPARABLE', modifierRef: modifierReference(modifiers) };
  }
  return { reasonCode: pattern === 'full_width' ? 'SOURCE_STRUCTURE_REQUIRED' : 'FIRST_VIEW_BUDGET', modifierRef: decision?.modifierRef ?? modifierReference(modifiers) };
}

function layoutError(code, node, message) {
  return { code, path: `/nodes/${node.id}/layout`, message };
}

function relationshipMembershipFor(node, config, options) {
  if (!['shared', 'local'].includes(config.scale) || (node.type === 'MetricCluster' && node.presentation === 'radar')) {
    return {
      grounded: null,
      basis: null,
      relationshipRef: null,
      relationshipType: null,
      identity: null,
      comparisonDomain: null,
      reasonCode: 'RELATIONSHIP_NOT_REQUIRED'
    };
  }
  return resolveNodeRelationship(node, Array.isArray(options.relationships) ? options.relationships : []);
}

export function layoutEligibilityFor(node = {}, options = {}) {
  const config = VISUAL_SPEC_REGISTRY[node.type]?.[node.presentation];
  if (!config) {
    return {
      valid: false,
      layout: null,
      comparability: null,
      membership: null,
      errors: [layoutError('VISUAL_PRESENTATION_UNKNOWN', node, `${node.type} ${node.presentation} has no registered visual specification.`)]
    };
  }

  const items = Array.isArray(node.items) ? node.items : [];
  const comparability = evaluateComparability(items, { parent: node });
  const membership = relationshipMembershipFor(node, config, options);
  const layout = {
    pattern: config.layout,
    span: config.layout === 'full_width' ? 'wide' : config.layout,
    ...layoutAttribution(node, config.layout, options)
  };
  const errors = [];

  if (!VISUAL_REASON_SET.has(layout.reasonCode)) {
    errors.push(layoutError('VISUAL_LAYOUT_REASON_UNKNOWN', node, `visual layout reason ${layout.reasonCode} is not registered.`));
  }
  const refs = REF_KEYS.filter((key) => {
    if (key === 'evidenceRefs') return Array.isArray(layout[key]) && layout[key].length > 0;
    return typeof layout[key] === 'string' && layout[key].length > 0;
  });
  if (refs.length === 0) {
    errors.push(layoutError('VISUAL_LAYOUT_UNATTRIBUTED', node, 'visual layout decisions require a stable reasonCode and a resolvable reference.'));
  }
  if (layout.pattern === 'paired') {
    if (node.type !== 'Ranking' || items.length < 2) {
      errors.push(layoutError('VISUAL_LAYOUT_INELIGIBLE', node, 'paired layout requires at least two Ranking items.'));
    }
    if (membership.grounded === false) {
      errors.push(layoutError('VISUAL_LAYOUT_INELIGIBLE', node, `paired layout requires a grounded comparison relationship (${membership.reasonCode}).`));
    }
    if (!comparability.pass) {
      errors.push(layoutError('VISUAL_LAYOUT_INELIGIBLE', node, `paired layout requires compatible unit, comparison group, domain, normalization, and scale (${comparability.reasonCode}).`));
    }
  }
  if (layout.pattern === 'compact' && items.length > 6 && node.type === 'MetricCluster') {
    errors.push(layoutError('VISUAL_LAYOUT_INELIGIBLE', node, 'compact metric strips may contain at most six metrics.'));
  }
  if (['full_width', 'paired'].includes(layout.pattern) && !(comparability.pass && (membership.grounded ?? true)) && !['MetricCluster', 'ExceptionList', 'Drilldown'].includes(node.type)) {
    errors.push(layoutError('VISUAL_COMPARABILITY_FAILED', node, `shared visual encoding is not legal for ${membership.reasonCode}/${comparability.reasonCode}.`));
  }
  return { valid: errors.length === 0, layout, comparability, membership, errors };
}

function representative(subjects, field) {
  const value = subjects.map((subject) => subject[field]).find((item) => item !== null && item !== undefined);
  return value ?? null;
}

function specError(code, node, message) {
  return { code, path: `/nodes/${node.id}/visualSpec`, message };
}

export function visualSpecErrors(spec = {}) {
  const errors = [];
  const config = VISUAL_SPEC_REGISTRY[spec.semanticType]?.[spec.presentation];
  if (!config) errors.push({ code: 'VISUAL_SPEC_UNKNOWN', path: '/visualSpec', message: 'visual spec must use the shared semantic presentation registry.' });
  for (const field of ['nodeId', 'semanticType', 'presentation', 'mark', 'orientation']) {
    if (typeof spec[field] !== 'string' || spec[field].length === 0) errors.push({ code: 'VISUAL_SPEC_FIELD_REQUIRED', path: `/visualSpec/${field}`, message: `visual spec requires ${field}.` });
  }
  if (config && (spec.mark !== config.mark || spec.orientation !== config.orientation || spec.structure !== config.structure)) {
    errors.push({ code: 'VISUAL_SPEC_REGISTRY_MISMATCH', path: '/visualSpec', message: 'visual spec mark, orientation, and structure must match the shared presentation registry.' });
  }
  const sharedComparisonScale = spec.scale?.type === 'shared' && spec.scale?.domain === 'relationship';
  if (sharedComparisonScale) {
    const membership = spec.comparability?.membership ?? {};
    const declarationBound = config
      && ['shared', 'local'].includes(config.scale)
      && spec.comparability?.eligible === true
      && membership.grounded === true
      && membership.basis === 'declared'
      && membership.relationshipType === 'comparison'
      && membership.comparisonDomain === spec.scale.comparisonDomainId
      && spec.scale.scaleId === sharedComparisonScaleId(membership.relationshipRef)
      && spec.scale.relationshipRef === membership.relationshipRef
      && typeof spec.scale.mapType === 'string' && spec.scale.mapType.length > 0
      && typeof spec.scale.normalizationBasis === 'string' && spec.scale.normalizationBasis.length > 0
      && typeof spec.scale.baseline === 'number' && Number.isFinite(spec.scale.baseline)
      && Array.isArray(spec.scale.valueDomain)
      && spec.scale.valueDomain.length === 2
      && spec.scale.valueDomain.every((bound) => Number.isFinite(bound))
      && spec.scale.valueDomain[0] <= spec.scale.baseline
      && spec.scale.valueDomain[1] >= spec.scale.baseline
      && Array.isArray(spec.scale.memberRefs)
      && spec.scale.memberRefs.length > 0
      && spec.scale.memberRefs.every((ref) => typeof ref === 'string' && /^\/semanticNodes\/\d+\/items\/\d+$/.test(ref))
      && Array.isArray(spec.scale.memberNodeIds)
      && spec.scale.memberNodeIds.includes(spec.nodeId);
    if (!declarationBound) {
      errors.push({ code: 'SHARED_SCALE_DECLARATION_INVALID', path: '/visualSpec/scale', message: 'a relationship-scoped shared comparison scale requires the complete canonical declaration bound to the grounded comparison relationship.' });
    }
  } else if (config && (spec.scale?.type !== config.scale || spec.scale?.domain !== config.domain)) {
    errors.push({ code: 'VISUAL_SPEC_REGISTRY_MISMATCH', path: '/visualSpec/scale', message: 'visual spec scale type and domain must match the shared presentation registry.' });
  }
  if (config) {
    const encoding = spec.encoding && typeof spec.encoding === 'object' && !Array.isArray(spec.encoding) ? spec.encoding : {};
    const expectedEncoding = config.encoding;
    const encodingMatches = Object.keys(encoding).length === Object.keys(expectedEncoding).length && Object.entries(expectedEncoding).every(([key, value]) => encoding[key] === value);
    if (!encodingMatches) errors.push({ code: 'VISUAL_SPEC_REGISTRY_MISMATCH', path: '/visualSpec/encoding', message: 'visual spec encoding must match the shared presentation registry.' });
  }
  if (!spec.scale || typeof spec.scale.type !== 'string') errors.push({ code: 'VISUAL_SPEC_SCALE_REQUIRED', path: '/visualSpec/scale', message: 'visual spec requires a scale contract.' });
  if (!spec.comparability || typeof spec.comparability.reasonCode !== 'string' || typeof spec.comparability.eligible !== 'boolean') errors.push({ code: 'VISUAL_SPEC_COMPARABILITY_REQUIRED', path: '/visualSpec/comparability', message: 'visual spec requires a comparability result, eligibility, and reason code.' });
  if (spec.comparability && typeof spec.comparability.reasonCode === 'string' && !VISUAL_REASON_SET.has(spec.comparability.reasonCode)) errors.push({ code: 'VISUAL_SPEC_REASON_UNKNOWN', path: '/visualSpec/comparability/reasonCode', message: 'visual comparability reason must come from the shared reason-code registry.' });
  if (config && ['shared', 'local'].includes(config.scale) && spec.comparability?.eligible !== true) errors.push({ code: 'VISUAL_SPEC_COMPARABILITY_INELIGIBLE', path: '/visualSpec/comparability/eligible', message: 'visual specs with shared or local quantitative encodings require eligible comparability.' });
  if (config && ['shared', 'local'].includes(config.scale) && spec.comparability) {
    if (spec.comparability.membership?.grounded !== true) {
      errors.push({ code: 'VISUAL_SPEC_RELATIONSHIP_REQUIRED', path: '/visualSpec/comparability/membership', message: 'visual specs with shared or local quantitative encodings require grounded relationship membership.' });
    } else if (!VISUAL_REASON_SET.has(spec.comparability.membership.reasonCode)) {
      errors.push({ code: 'VISUAL_SPEC_REASON_UNKNOWN', path: '/visualSpec/comparability/membership/reasonCode', message: 'relationship membership reason must come from the shared reason-code registry.' });
    }
  }
  if (!spec.layout || typeof spec.layout.pattern !== 'string' || typeof spec.layout.reasonCode !== 'string') errors.push({ code: 'VISUAL_SPEC_LAYOUT_REQUIRED', path: '/visualSpec/layout', message: 'visual spec requires a layout pattern and reason code.' });
  if (spec.layout?.pattern && !VISUAL_LAYOUT_PATTERNS.has(spec.layout.pattern)) errors.push({ code: 'VISUAL_SPEC_LAYOUT_PATTERN_UNKNOWN', path: '/visualSpec/layout/pattern', message: 'visual layout pattern must come from the shared layout registry.' });
  if (spec.layout && !VISUAL_REASON_SET.has(spec.layout.reasonCode)) errors.push({ code: 'VISUAL_SPEC_REASON_UNKNOWN', path: '/visualSpec/layout/reasonCode', message: 'visual layout reason must come from the shared reason-code registry.' });
  if (spec.layout) {
    const hasReference = (typeof spec.layout.requirementRef === 'string' && spec.layout.requirementRef.length > 0) || (typeof spec.layout.modifierRef === 'string' && spec.layout.modifierRef.length > 0) || (Array.isArray(spec.layout.evidenceRefs) && spec.layout.evidenceRefs.length > 0);
    if (!hasReference) errors.push({ code: 'VISUAL_SPEC_LAYOUT_UNATTRIBUTED', path: '/visualSpec/layout', message: 'visual layout requires a resolvable requirement, modifier, or evidence reference.' });
  }
  if (config?.mark === 'bullet') {
    const bullet = spec.bullet;
    const bulletValid = bullet && typeof bullet === 'object' && !Array.isArray(bullet) &&
      bullet.mapType === 'linear' &&
      Array.isArray(bullet.valueDomain) && bullet.valueDomain.length === 2 &&
      Number.isFinite(bullet.valueDomain[0]) && bullet.valueDomain[0] === 0 &&
      Number.isFinite(bullet.valueDomain[1]) && bullet.valueDomain[1] > 0 &&
      [bullet.actual, bullet.target, bullet.gap].every((value) => Number.isFinite(value)) &&
      bullet.valueDomain[1] >= Math.max(bullet.actual, bullet.target) &&
      ['below', 'above', 'at'].includes(bullet.direction);
    if (!bulletValid) errors.push({ code: 'BULLET_SPEC_DECLARATION_INVALID', path: '/visualSpec/bullet', message: 'a bullet visual spec requires a linear [0, high] declaration covering finite actual, target, and gap values with a grounded direction.' });
  }
  if (config?.mark === 'waterfall') {
    const waterfall = spec.waterfall;
    const waterfallValid = waterfall && typeof waterfall === 'object' && !Array.isArray(waterfall) &&
      waterfall.mapType === 'linear' &&
      Array.isArray(waterfall.valueDomain) && waterfall.valueDomain.length === 2 &&
      waterfall.valueDomain[0] === 0 && Number.isFinite(waterfall.valueDomain[1]) && waterfall.valueDomain[1] > 0 &&
      Number.isFinite(waterfall.startValue) && Number.isFinite(waterfall.endValue) &&
      typeof waterfall.relationshipRef === 'string' && waterfall.relationshipRef.length > 0 &&
      Array.isArray(waterfall.segments) && waterfall.segments.length > 0 &&
      waterfall.segments.every((segment) => segment && Number.isFinite(segment.value) &&
        (segment.sign === 'plus' || segment.sign === 'minus') &&
        Number.isFinite(segment.cumulativeBefore) && Number.isFinite(segment.cumulativeAfter) &&
        Math.abs(segment.cumulativeAfter - (segment.cumulativeBefore + (segment.sign === 'minus' ? -segment.value : segment.value))) < 1e-6) &&
      Math.abs(waterfall.segments.at(-1).cumulativeAfter - waterfall.endValue) < 1e-6 &&
      waterfall.segments.every((segment) => segment.cumulativeBefore >= 0 && segment.cumulativeBefore <= waterfall.valueDomain[1] &&
        segment.cumulativeAfter >= 0 && segment.cumulativeAfter <= waterfall.valueDomain[1]);
    if (!waterfallValid) errors.push({ code: 'WATERFALL_SPEC_DECLARATION_INVALID', path: '/visualSpec/waterfall', message: 'a waterfall visual spec requires a grounded additive_path declaration whose signed segments reconcile start to end inside the value domain.' });
  }
  if (spec.ranking !== undefined) {
    const ranking = spec.ranking;
    const rankingValid = ranking && typeof ranking === 'object' && !Array.isArray(ranking) &&
      typeof ranking.basis === 'string' && ranking.basis.length > 0 &&
      ranking.direction === 'delivered_order' &&
      Array.isArray(ranking.candidateValues) && ranking.candidateValues.length > 0 &&
      ranking.candidateValues.every((value) => Number.isFinite(value));
    if (!rankingValid) errors.push({ code: 'RANKING_SPEC_DECLARATION_INVALID', path: '/visualSpec/ranking', message: 'a ranking visual spec requires a grounded basis, delivered-order direction, and finite candidate values.' });
  }
  return errors;
}

export function applyRegionItemOrder(items, strategy) {
  const list = Array.isArray(items) ? items : [];
  if (list.length < 2 || (strategy !== 'gap_desc' && strategy !== 'rank_asc')) return [...list];
  const direction = strategy === 'gap_desc' ? -1 : 1;
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => direction * (numericValue(a.item.value) - numericValue(b.item.value)) || a.index - b.index)
    .map((entry) => entry.item);
}

function itemsForSelection(sourceNode, selection) {
  const items = applyRegionItemOrder(sourceNode?.items, selection?.itemOrderStrategy);
  if (['summary', 'top_summary'].includes(selection?.presentation)) return items.slice(0, 1);
  if (selection?.presentation === 'peak_summary') {
    return items.length === 0 ? [] : [items.reduce((peak, item) => numericValue(item.value) > numericValue(peak.value) ? item : peak, items[0])];
  }
  if (selection?.presentation === 'both_ends' && items.length > 2) {
    const high = items.reduce((best, item) => numericValue(item.value) > numericValue(best.value) ? item : best, items[0]);
    const low = items.reduce((best, item) => numericValue(item.value) < numericValue(best.value) ? item : best, items[0]);
    return high === low ? [high] : [high, low];
  }
  return items;
}

const SHARED_SCALE_ID_PREFIX = 'scale:comparison:';
const SHARED_SCALE_MAP_TYPE = 'linear';
const SHARED_SCALE_NORMALIZATION_BASIS = 'domain_max';

export function sharedComparisonScaleId(relationshipRef) {
  return `${SHARED_SCALE_ID_PREFIX}${relationshipRef}`;
}

function sharedScaleEligible(entry) {
  const membership = entry.spec.comparability?.membership ?? {};
  // A bullet carries its own canonical target-scale declaration; upgrading it
  // into a group-wide relationship scale would replace the map its geometry
  // was drawn from.
  if (entry.spec.bullet) return false;
  return !entry.isRadar
    && ['shared', 'local'].includes(entry.config.scale)
    && membership.basis === 'declared'
    && membership.relationshipType === 'comparison'
    && membership.grounded === true
    && entry.comparabilityPass === true;
}

function buildSharedComparisonScaleDeclaration(ref, relationship, group, nodeIndexById) {
  const errors = [];
  const identity = group
    .map((entry) => entry.spec.comparability.membership.identity)
    .find((value) => typeof value === 'string' && value.length > 0) ?? null;
  if (identity === null) {
    for (const entry of group) {
      errors.push(specError('SHARED_SCALE_DECLARATION_MISSING', entry.spec, `grounded comparison relationship ${ref} has members without a stable comparison domain identity.`));
    }
    return { declaration: null, errors };
  }

  const units = new Set(group.map((entry) => entry.spec.comparability.unit).filter((unit) => typeof unit === 'string' && unit.length > 0));
  const normalizations = new Set(group.map((entry) => entry.spec.comparability.normalization).filter((value) => typeof value === 'string' && value.length > 0));
  if (units.size > 1 || normalizations.size > 1) {
    for (const entry of group) {
      errors.push(specError('SHARED_SCALE_MEMBERS_INCOMMENSURATE', entry.spec, `members of grounded comparison relationship ${ref} are not commensurate across the whole relationship (unit/normalization divergence).`));
    }
    return { declaration: null, errors };
  }

  const memberRefs = [];
  const values = [];
  for (const entry of group) {
    const sourceItems = Array.isArray(entry.sourceNode?.items) ? entry.sourceNode.items : [];
    const nodeIndex = nodeIndexById.get(entry.spec.nodeId);
    for (const item of entry.deliveredItems) {
      values.push(numericValue(item?.value));
      if (nodeIndex === undefined) {
        errors.push(specError('SHARED_SCALE_MEMBER_OUTSIDE_RELATIONSHIP', entry.spec, `delivered member of ${ref} does not resolve to a decision-state semantic node.`));
        return { declaration: null, errors };
      }
      const itemIndex = sourceItems.indexOf(item);
      memberRefs.push(`/semanticNodes/${nodeIndex}/items/${itemIndex < 0 ? 0 : itemIndex}`);
    }
  }
  const memberNodeIds = [...new Set(group.map((entry) => entry.spec.nodeId))].sort();
  const subjectRefs = Array.isArray(relationship?.subjectRefs) ? relationship.subjectRefs : [];
  if (memberNodeIds.some((nodeId) => !subjectRefs.includes(nodeId))) {
    for (const entry of group) {
      errors.push(specError('SHARED_SCALE_MEMBER_OUTSIDE_RELATIONSHIP', entry.spec, `shared scale for ${ref} would cover members outside the grounded relationship subjectRefs.`));
    }
    return { declaration: null, errors };
  }

  const valueDomain = [
    Math.min(0, ...values),
    Math.max(0, ...values)
  ];
  // Frozen supported profile: linear / domain_max / low == baseline == 0 / high > 0.
  // Negative lower bounds, centered, diverging, log and z-score maps are NOT supported -
  // the builder must fail closed rather than half-support a domain the verifier cannot check.
  const high = valueDomain[1];
  const outsideProfile = values.some((value) => !Number.isFinite(value) || value < 0 || value > high) || !(high > 0);
  if (outsideProfile) {
    for (const entry of group) {
      errors.push(specError('SHARED_SCALE_PROFILE_UNSUPPORTED', entry.spec, `members of grounded comparison relationship ${ref} fall outside the frozen shared-scale profile (0 <= value, high > 0); negative-centered, diverging, log, or z-score domains are not supported.`));
    }
    return { declaration: null, errors };
  }
  const declaration = Object.freeze({
    scaleId: sharedComparisonScaleId(ref),
    comparisonDomainId: identity,
    relationshipRef: ref,
    mapType: SHARED_SCALE_MAP_TYPE,
    normalizationBasis: SHARED_SCALE_NORMALIZATION_BASIS,
    baseline: 0,
    valueDomain: Object.freeze(valueDomain),
    unit: group.map((entry) => entry.spec.comparability.unit).find((unit) => typeof unit === 'string' && unit.length > 0) ?? null,
    normalization: group.map((entry) => entry.spec.comparability.normalization).find((unit) => typeof unit === 'string' && unit.length > 0) ?? 'raw',
    memberNodeIds: Object.freeze(memberNodeIds),
    memberRefs: Object.freeze([...new Set(memberRefs)].sort())
  });
  return { declaration, errors };
}

function applySharedComparisonScales(entries, relationships, nodeIndexById) {
  const errors = [];
  const groups = new Map();
  for (const entry of entries) {
    if (!sharedScaleEligible(entry)) continue;
    const ref = entry.spec.comparability.membership.relationshipRef;
    if (!groups.has(ref)) groups.set(ref, []);
    groups.get(ref).push(entry);
  }

  const declarations = new Map();
  for (const [ref, group] of groups) {
    const relationship = relationships.find((candidate) => candidate?.id === ref);
    const built = buildSharedComparisonScaleDeclaration(ref, relationship, group, nodeIndexById);
    errors.push(...built.errors);
    if (built.declaration) declarations.set(ref, built.declaration);
  }

  const scaleIdsByDomain = new Map();
  const domainsByScaleId = new Map();
  for (const declaration of declarations.values()) {
    if (!scaleIdsByDomain.has(declaration.comparisonDomainId)) scaleIdsByDomain.set(declaration.comparisonDomainId, new Set());
    scaleIdsByDomain.get(declaration.comparisonDomainId).add(declaration.scaleId);
    if (!domainsByScaleId.has(declaration.scaleId)) domainsByScaleId.set(declaration.scaleId, new Set());
    domainsByScaleId.get(declaration.scaleId).add(JSON.stringify(declaration));
  }
  for (const [ref, declaration] of declarations) {
    if (scaleIdsByDomain.get(declaration.comparisonDomainId).size > 1) {
      for (const entry of groups.get(ref)) {
        errors.push(specError('SHARED_SCALE_DOMAIN_CONFLICT', entry.spec, `comparison domain ${declaration.comparisonDomainId} resolves to more than one scaleId; siblings must share exactly one canonical scale map.`));
      }
      declarations.delete(ref);
      continue;
    }
    if (domainsByScaleId.get(declaration.scaleId).size > 1) {
      for (const entry of groups.get(ref)) {
        errors.push(specError('SHARED_SCALE_DECLARATION_CONFLICT', entry.spec, `scaleId ${declaration.scaleId} would carry more than one canonical map declaration.`));
      }
      declarations.delete(ref);
    }
  }

  for (const [ref, declaration] of declarations) {
    for (const entry of groups.get(ref)) {
      entry.spec.scale = { type: 'shared', domain: 'relationship', ...declaration };
    }
  }
  return errors;
}

function bulletDeclarationFor(node, errors) {
  const items = Array.isArray(node.items) ? node.items : [];
  const actual = items.find((item) => item?.role === 'actual');
  const target = items.find((item) => item?.role === 'target');
  const gap = items.find((item) => item?.role === 'gap');
  if (!actual || !target || !gap) {
    errors.push(specError('BULLET_SPEC_DECLARATION_FAILED', node, 'a bullet_target visual spec requires source-grounded actual, target, and gap items.'));
    return null;
  }
  const actualValue = numericValue(actual.value);
  const targetValue = numericValue(target.value);
  const gapValue = numericValue(gap.value);
  if (!contractWithinTolerance(Math.abs(targetValue - actualValue), Math.abs(gapValue), BULLET_GAP_CONTRACT_TOLERANCE)) {
    errors.push(specError('BULLET_SPEC_DECLARATION_FAILED', node, 'the bullet gap annotation is not traceable to target minus actual within the frozen tolerance.'));
    return null;
  }
  const high = Math.max(actualValue, targetValue);
  if (!(high > 0)) {
    errors.push(specError('BULLET_SPEC_DECLARATION_FAILED', node, 'a bullet requires a positive shared value domain.'));
    return null;
  }
  return Object.freeze({
    mapType: 'linear',
    valueDomain: Object.freeze([0, high]),
    actual: actualValue,
    target: targetValue,
    gap: gapValue,
    direction: actualValue < targetValue ? 'below' : actualValue > targetValue ? 'above' : 'at'
  });
}

function waterfallDeclarationFor(node, sourceNodes, context, errors) {
  const path = (context.relationships ?? []).find((relationship) =>
    relationship?.relationType === 'additive_path' &&
    Array.isArray(relationship.subjectRefs) &&
    relationship.subjectRefs.includes(node.id)
  );
  if (!path || !Array.isArray(path.basisRefs) || path.basisRefs.length === 0 || !path.additivePath) {
    errors.push(specError('WATERFALL_SPEC_PATH_MISSING', node, 'a waterfall visual spec requires a grounded additive_path relationship with evidence basisRefs.'));
    return null;
  }
  const labelIndex = new Map();
  for (const nodeId of path.subjectRefs) {
    for (const item of sourceNodes.get(nodeId)?.items ?? []) {
      if (typeof item?.label === 'string' && !labelIndex.has(item.label)) labelIndex.set(item.label, item);
    }
  }
  const start = labelIndex.get(path.additivePath.startRef);
  const end = labelIndex.get(path.additivePath.endRef);
  if (!start || !end) {
    errors.push(specError('WATERFALL_SPEC_PATH_MISSING', node, 'additive_path startRef/endRef must resolve to source items of the subject nodes.'));
    return null;
  }
  const members = Array.isArray(path.additivePath.members) ? path.additivePath.members : [];
  const delivered = Array.isArray(node.items) ? node.items : [];
  if (members.length !== delivered.length || members.some((member, index) => member?.memberRef !== delivered[index]?.label)) {
    errors.push(specError('WATERFALL_SPEC_MEMBERS_NOT_ALIGNED', node, 'waterfall segments must equal the typed additive_path members in declared order.'));
    return null;
  }
  const segments = [];
  let running = numericValue(start.value);
  for (const [index, member] of members.entries()) {
    const item = labelIndex.get(member.memberRef);
    const sign = member.sign === 'plus' ? 1 : member.sign === 'minus' ? -1 : null;
    if (!item || sign === null) {
      errors.push(specError('WATERFALL_SPEC_MEMBERS_NOT_ALIGNED', node, `waterfall member ${member?.memberRef ?? index} is not grounded with a declared sign.`));
      return null;
    }
    const value = numericValue(item.value);
    const cumulativeBefore = running;
    running += sign * value;
    segments.push(Object.freeze({
      memberRef: member.memberRef,
      sign: member.sign,
      value,
      cumulativeBefore,
      cumulativeAfter: running
    }));
  }
  const startValue = numericValue(start.value);
  const endValue = numericValue(end.value);
  if (!contractWithinTolerance(running, endValue)) {
    errors.push(specError('WATERFALL_SPEC_ADDITIVE_CONTRACT_FAILED', node, 'the declared additive path does not reconcile start plus signed members to end within the frozen tolerance.'));
    return null;
  }
  const high = Math.max(startValue, endValue, ...segments.map((segment) => Math.max(segment.cumulativeBefore, segment.cumulativeAfter)));
  if (!(high > 0)) {
    errors.push(specError('WATERFALL_SPEC_ADDITIVE_CONTRACT_FAILED', node, 'a waterfall requires a positive shared value domain.'));
    return null;
  }
  return Object.freeze({
    mapType: 'linear',
    relationshipRef: path.id,
    valueDomain: Object.freeze([0, high]),
    startRef: path.additivePath.startRef,
    endRef: path.additivePath.endRef,
    startDisplay: String(start.value),
    endDisplay: String(end.value),
    startValue,
    endValue,
    segments: Object.freeze(segments)
  });
}

function rankingDeclarationFor(node, options) {
  const basisKind = options.orderingBasis?.kind;
  const items = Array.isArray(node.items) ? node.items : [];
  const ordinalOrder = items.length >= 2 && items.every((item, index) => Number.isInteger(item?.rank) && item.rank === index + 1);
  return Object.freeze({
    basis: basisKind ? `composition_intent:${basisKind}` : ordinalOrder ? 'source_rank_ordinals' : 'source_order',
    direction: 'delivered_order',
    candidateValues: Object.freeze(items.map((item) => numericValue(item.value)))
  });
}

export function buildInternalVisualSpecs(data = {}, composition = {}, options = {}) {
  const source = new Map((data.semanticNodes ?? []).map((node) => [node.id, node]));
  const nodes = Array.isArray(composition?.nodes) ? composition.nodes : [];
  const context = {
    contextRequirements: options.contextRequirements ?? [],
    modifiers: options.modifiers ?? composition.modifiers ?? {},
    decisionLog: options.decisionLog ?? composition.decisionLog ?? [],
    relationships: Array.isArray(data.relationships) ? data.relationships : []
  };
  const specs = [];
  const errors = [];
  const entries = [];

  for (const selection of nodes) {
    const sourceNode = source.get(selection.id);
    if (!sourceNode) {
      errors.push(specError('VISUAL_SOURCE_NODE_MISSING', selection, `semantic node ${selection.id} is not present in decision state.`));
      continue;
    }
    const node = { ...sourceNode, ...selection, items: itemsForSelection(sourceNode, selection) };
    const config = VISUAL_SPEC_REGISTRY[node.type]?.[node.presentation];
    if (!config) {
      errors.push(specError('VISUAL_PRESENTATION_UNKNOWN', node, `${node.type} ${node.presentation} is not registered in the shared visual grammar.`));
      continue;
    }
    const layoutResult = layoutEligibilityFor(node, context);
    errors.push(...layoutResult.errors);
    const isRadar = node.type === 'MetricCluster' && node.presentation === 'radar';
    const profileResult = isRadar
      ? evaluateProfileComparability(node.dimensions ?? [], node)
      : layoutResult.comparability;
    const membership = isRadar
      ? {
        grounded: profileResult.pass,
        basis: 'intrinsic',
        relationshipRef: `intrinsic_${node.id}_profile`,
        relationshipType: 'comparison',
        identity: null,
        comparisonDomain: `intrinsic_${node.id}_profile`,
        reasonCode: profileResult.pass ? 'PROFILE_COMPARABILITY_CONFIRMED' : 'PROFILE_COMPARABILITY_FAILED'
      }
      : layoutResult.membership;
    if (node.presentation === 'radar' && !profileResult.pass) {
      errors.push(specError('VISUAL_PRESENTATION_INELIGIBLE', node, `radar requires the passing Profile Test (${profileResult.reasonCode}).`));
    }
    if (!['MetricCluster', 'ExceptionList', 'Drilldown'].includes(node.type) && !(profileResult.pass && (membership.grounded ?? true))) {
      errors.push(specError('VISUAL_COMPARABILITY_FAILED', node, `visual encoding requires grounded relationship membership and compatible items (${membership.reasonCode}/${profileResult.reasonCode}).`));
    }

    const subjects = profileResult.subjects ?? [];
    const overallReasonCode = isRadar
      ? profileResult.reasonCode
      : (node.type === 'MetricCluster' && node.presentation === 'comparison' && !profileResult.pass)
        ? 'HETEROGENEOUS_METRIC_UNCOMPARABLE'
        : membership.grounded === false
          ? membership.reasonCode
          : !profileResult.pass
            ? profileResult.reasonCode
            : 'COMPARABILITY_CONFIRMED';
    const spec = {
      nodeId: node.id,
      semanticType: node.type,
      presentation: node.presentation,
      mark: config.mark,
      orientation: config.orientation,
      encoding: { ...config.encoding },
      scale: { type: config.scale, domain: config.domain },
      comparability: {
        eligible: membership.grounded !== false && Boolean(profileResult.pass),
        membership,
        commensurability: {
          pass: profileResult.pass,
          reasonCode: profileResult.reasonCode,
          unit: representative(subjects, 'unit'),
          normalization: representative(subjects, 'normalization'),
          scaleId: representative(subjects, 'scaleId')
        },
        unit: representative(subjects, 'unit'),
        comparisonGroup: membership.relationshipRef,
        comparabilityDomain: membership.comparisonDomain,
        normalization: representative(subjects, 'normalization') ?? 'raw',
        scaleId: representative(subjects, 'scaleId'),
        reasonCode: overallReasonCode
      },
      layout: layoutResult.layout,
      structure: config.structure
    };
    if (config.mark === 'bullet') {
      const declaration = bulletDeclarationFor(node, errors);
      if (declaration) spec.bullet = declaration;
    }
    if (config.mark === 'waterfall') {
      const declaration = waterfallDeclarationFor(node, source, context, errors);
      if (declaration) spec.waterfall = declaration;
    }
    if (node.type === 'Ranking' && ['both_ends', 'full_ranking'].includes(node.presentation)) {
      spec.ranking = rankingDeclarationFor(node, options);
    }
    const specErrors = visualSpecErrors(spec);
    for (const error of specErrors) errors.push(specError(error.code, node, error.message));
    specs.push(spec);
    entries.push({
      spec,
      config,
      isRadar,
      sourceNode,
      deliveredItems: node.items,
      comparabilityPass: Boolean(profileResult.pass)
    });
  }

  const nodeIndexById = new Map((Array.isArray(data.semanticNodes) ? data.semanticNodes : []).map((node, index) => [node?.id, index]));
  errors.push(...applySharedComparisonScales(entries, context.relationships, nodeIndexById));
  for (const entry of entries) {
    if (entry.spec.scale?.domain !== 'relationship') continue;
    for (const error of visualSpecErrors(entry.spec)) {
      errors.push(specError(error.code, { id: entry.spec.nodeId }, error.message));
    }
  }

  return { valid: errors.length === 0, specs, errors };
}
