import { createHash } from 'node:crypto';

const PRESENTATION_COVERAGE = {
  Trend: {
    full_chart: ['temporal_reference', 'relative_comparison'],
    sparkline: ['trajectory_shape'],
    summary: ['current_value']
  },
  Distribution: {
    full_chart: ['distribution_shape'],
    peak_summary: ['peak_identity']
  },
  Breakdown: {
    full_breakdown: ['decomposition', 'gap_attribution'],
    summary: ['current_value']
  },
  Ranking: {
    both_ends: ['ranking_span', 'relative_comparison', 'contributor_comparison'],
    full_ranking: ['ranking_span', 'relative_comparison', 'contributor_comparison'],
    top_summary: ['peak_identity']
  },
  Relationship: {
    full_chart: ['relative_comparison', 'target_reference', 'gap_attribution'],
    summary: ['current_value']
  },
  ExceptionList: {
    full_list: ['exception_coverage'],
    compact_list: ['exception_coverage']
  },
  Drilldown: {
    reachable_detail: ['drilldown']
  },
  MetricCluster: {
    radar: ['profile_shape'],
    comparison: ['relative_comparison']
  }
};

function profileTest(node) {
  const dimensions = Array.isArray(node.dimensions) ? node.dimensions : [];
  const units = new Set(dimensions.map((dimension) => dimension?.unit).filter(Boolean));
  const normalised = dimensions.every((dimension) => Number.isFinite(dimension?.normalizedScore));
  const sharedScale = node.profile?.sharedScale === true;
  const comparable = node.profile?.comparable === true;
  const requested = node.profile?.purpose === 'profile';
  const pass = dimensions.length >= 3 && units.size === 1 && normalised && sharedScale && comparable && requested;
  return {
    pass,
    reasons: pass ? [] : [
      ...(dimensions.length < 3 ? ['requires at least three dimensions'] : []),
      ...(units.size !== 1 ? ['dimensions do not share a unit'] : []),
      ...(!normalised ? ['dimensions lack source-backed normalization'] : []),
      ...(!sharedScale ? ['dimensions lack a shared scale'] : []),
      ...(!comparable ? ['dimensions are not declared comparable'] : []),
      ...(!requested ? ['profile comparison is not required'] : [])
    ]
  };
}

function selectPresentation(node, modifiers) {
  if (node.type === 'MetricCluster') {
    const result = profileTest(node);
    return { presentation: result.pass ? 'radar' : 'comparison', profileTest: result };
  }
  const compact = modifiers?.density === 'compact' && typeof node.compactPresentation === 'string';
  return { presentation: compact ? node.compactPresentation : node.presentation ?? 'summary', profileTest: null };
}

export function coverageFor(node) {
  return PRESENTATION_COVERAGE[node.type]?.[node.presentation] ?? [];
}

function requirementFailure(requirement, nodes) {
  const subjectNode = nodes.find((node) => node.id === requirement.subject);
  if (!subjectNode) {
    return {
      path: '/nodes',
      message: `${requirement.subject} requires ${requirement.type}, but no selected presentation provides it.`
    };
  }
  const preserved = coverageFor(subjectNode);
  return {
    path: `/nodes/${subjectNode.inputIndex}/presentation`,
    message: `${requirement.subject} requires ${requirement.type}, but selected presentation only preserves ${preserved.join(', ') || 'no required coverage'}.`
  };
}

const DECISION_REASON_CODES = new Set([
  'CONTEXT_REQUIRES_DISTRIBUTION_SHAPE',
  'CONTEXT_REQUIRES_RELATIVE_COMPARISON',
  'CONTEXT_REQUIRES_RANKING_SPAN',
  'CONTEXT_REQUIRES_TEMPORAL_REFERENCE',
  'CONTEXT_REQUIRES_TARGET_REFERENCE',
  'CONTEXT_REQUIRES_GAP_ATTRIBUTION',
  'CONTEXT_REQUIRES_CONTRIBUTOR_COMPARISON',
  'CONTEXT_REQUIRES_DECOMPOSITION',
  'AUDIENCE_DENSITY_LIMIT',
  'FIRST_VIEW_BUDGET',
  'SOURCE_STRUCTURE_REQUIRED',
  'PROFILE_COMPARABILITY_FAILED',
  'PROFILE_COMPARABILITY_CONFIRMED'
]);

const COMPOSITION_DECISIONS = new Set(['promote', 'retain_full', 'collapse_to_drilldown', 'drop']);

function defaultDecisionFor(node, contextRequirements, modifiers) {
  const requirement = contextRequirements.find((item) => item.subject === node.id);
  if (requirement) {
    return {
      node: node.id,
      decision: 'retain_full',
      reasonCode: `CONTEXT_REQUIRES_${requirement.type.toUpperCase()}`,
      requirementRef: requirement.subject
    };
  }
  if (node.profileTest) {
    return {
      node: node.id,
      decision: 'retain_full',
      reasonCode: node.profileTest.pass ? 'PROFILE_COMPARABILITY_CONFIRMED' : 'PROFILE_COMPARABILITY_FAILED',
      modifierRef: 'default_composition'
    };
  }
  if (modifiers?.density === 'compact' && node.compactPresentation === node.presentation) {
    return {
      node: node.id,
      decision: 'retain_full',
      reasonCode: 'AUDIENCE_DENSITY_LIMIT',
      modifierRef: 'density'
    };
  }
  return {
    node: node.id,
    decision: 'retain_full',
    reasonCode: 'SOURCE_STRUCTURE_REQUIRED',
    modifierRef: 'default_composition'
  };
}

function decisionLogErrors(decisionLog, selectedNodes) {
  const knownNodes = new Set(selectedNodes.map((node) => node.id));
  return decisionLog.flatMap((entry, index) => {
    const attributable = typeof entry?.requirementRef === 'string' || typeof entry?.modifierRef === 'string';
    if (knownNodes.has(entry?.node) && COMPOSITION_DECISIONS.has(entry?.decision) && DECISION_REASON_CODES.has(entry?.reasonCode) && attributable) {
      return [];
    }
    return [{
      code: 'COMPOSITION_DECISION_UNATTRIBUTED',
      path: `/decisionLog/${index}`,
      message: 'composition decision must name a known node, stable reasonCode, supported decision, and requirementRef or modifierRef.'
    }];
  });
}

export function composeAdaptiveComposition({ contextRequirements = [], nodes = [], decisionLog = [], modifiers = {} } = {}) {
  const selectedNodes = nodes.map((node, inputIndex) => {
    const selected = selectPresentation(node, modifiers);
    return {
      ...node,
      ...selected,
      inputIndex
    };
  });
  const delivered = [...new Set(selectedNodes.flatMap(coverageFor))];
  const required = [...new Set(contextRequirements.map((requirement) => requirement.type))];
  const missing = required.filter((requirement) => !delivered.includes(requirement));
  const errors = contextRequirements
    .filter((requirement) => missing.includes(requirement.type))
    .map((requirement) => {
      const failure = requirementFailure(requirement, selectedNodes);
      return { code: 'CONTEXT_PRESERVATION_FAILED', path: failure.path, message: failure.message };
    });
  const resolvedDecisionLog = selectedNodes.map((node) => defaultDecisionFor(node, contextRequirements, modifiers));
  const decisionErrors = decisionLogErrors(decisionLog, selectedNodes);

  return {
    valid: errors.length + decisionErrors.length === 0,
    composition: {
      nodes: selectedNodes.map(({ inputIndex, ...node }) => node),
      decisionLog: [...resolvedDecisionLog, ...decisionLog],
      modifiers
    },
    coverageManifest: { required, delivered, missing },
    errors: [...decisionErrors, ...errors]
  };
}

function nodeMarkerPresent(artifact, node) {
  const escapedId = node.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedPresentation = node.presentation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const marker = new RegExp(`data-semantic-node="${escapedId}"[^>]*data-presentation="${escapedPresentation}"[^>]*data-coverage="[^"]*${node.coverage.join('[^\"]*')}[^"]*"`);
  return marker.test(artifact);
}

export function verifyDeliveredArtifact({ html = '', svg = '', manifest = {} } = {}) {
  const artifact = `${html}\n${svg}`;
  const errors = [];
  if (manifest.verificationStamp !== undefined) {
    errors.push({
      code: 'PREPOPULATED_VERIFICATION_STAMP',
      path: '/verificationStamp',
      message: 'verification stamps are issued only by the delivery verifier after a successful check.'
    });
  }
  for (const node of manifest.nodes ?? []) {
    if (!nodeMarkerPresent(artifact, node)) {
      errors.push({
        code: 'DELIVERED_COMPOSITION_MISMATCH',
        path: `/nodes/${node.id}`,
        message: `${node.id} manifest presentation or coverage is not present in the final artifact.`
      });
    }
  }
  const overallElements = artifact.match(/<[^>]*data-claim-scope="overall"[^>]*>/g) ?? [];
  const verifiedOverallClaimIds = new Set();
  for (const element of overallElements) {
    const id = element.match(/data-claim-id="([^"]+)"/)?.[1];
    if (verifiedOverallClaimIds.has(id)) continue;
    verifiedOverallClaimIds.add(id);
    const index = (manifest.claims ?? []).findIndex((claim) => claim.id === id && claim.scope === 'overall');
    const claim = index === -1 ? null : manifest.claims[index];
    if (!claim) {
      errors.push({
        code: 'OVERALL_CLAIM_UNDECLARED',
        path: '/claims',
        message: 'visible overall claim must resolve to a typed delivered-manifest claim.'
      });
      continue;
    }
    if (typeof claim.claimType !== 'string' || claim.claimType.length === 0) {
      errors.push({
        code: 'OVERALL_CLAIM_TYPE_REQUIRED',
        path: `/claims/${index}/claimType`,
        message: `visible overall claim ${claim.id} must declare claimType.`
      });
    }
    if (!Array.isArray(claim.evidenceRefs) || claim.evidenceRefs.length === 0) {
      errors.push({
        code: 'OVERALL_CLAIM_EVIDENCE_REQUIRED',
        path: `/claims/${index}/evidenceRefs`,
        message: `visible overall claim ${claim.id} must reference source evidence.`
      });
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return {
    valid: true,
    errors: [],
    verificationStamp: {
      status: 'passed',
      verifierVersion: 'composition-verifier@1',
      artifactHash: sha256(artifact),
      manifestHash: sha256(stableJson(manifest))
    }
  };
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
