import { createHash } from 'node:crypto';

const PRESENTATION_COVERAGE = {
  Trend: {
    full_chart: ['temporal_reference', 'relative_comparison'],
    sparkline: ['trajectory_shape'],
    summary: ['current_value']
  },
  Distribution: {
    full_chart: ['distribution_shape'],
    peak_summary: ['peak_identity'],
    summary: ['current_value']
  },
  Breakdown: {
    full_breakdown: ['decomposition', 'gap_attribution'],
    summary: ['current_value']
  },
  Ranking: {
    both_ends: ['ranking_span', 'relative_comparison', 'contributor_comparison'],
    full_ranking: ['ranking_span', 'relative_comparison', 'contributor_comparison'],
    top_summary: ['peak_identity'],
    summary: ['current_value']
  },
  Relationship: {
    full_chart: ['relative_comparison', 'target_reference', 'gap_attribution'],
    summary: ['current_value']
  },
  ExceptionList: {
    full_list: ['exception_coverage'],
    compact_list: ['exception_coverage'],
    summary: ['current_value']
  },
  Drilldown: {
    reachable_detail: ['drilldown'],
    summary: ['current_value']
  },
  MetricCluster: {
    radar: ['profile_shape'],
    comparison: ['relative_comparison'],
    summary: ['current_value']
  }
};

const PRESENTATION_STRUCTURE = {
  Trend: {
    full_chart: 'ordered-trajectory',
    sparkline: 'ordered-trajectory',
    summary: 'current-value'
  },
  Distribution: {
    full_chart: 'ordered-distribution',
    peak_summary: 'peak-summary',
    summary: 'current-value'
  },
  Breakdown: {
    full_breakdown: 'decomposition',
    summary: 'current-value'
  },
  Ranking: {
    both_ends: 'ranked-order',
    full_ranking: 'ranked-order',
    top_summary: 'top-ranked',
    summary: 'current-value'
  },
  Relationship: {
    full_chart: 'target-gap',
    summary: 'current-value'
  },
  ExceptionList: {
    full_list: 'exception-list',
    compact_list: 'exception-list',
    summary: 'current-value'
  },
  Drilldown: {
    reachable_detail: 'reachable-detail',
    summary: 'current-value'
  },
  MetricCluster: {
    radar: 'profile-shape',
    comparison: 'metric-comparison',
    summary: 'current-value'
  }
};

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
const CONTEXT_ID_PATTERN = /^ctx_[A-Za-z0-9_~.-]{1,64}$/;
const MODIFIER_ID_PATTERN = /^[a-z0-9_~.-]{1,64}$/;

export const PRESENTATION_REGISTRY = Object.freeze(
  Object.fromEntries(Object.entries(PRESENTATION_COVERAGE).map(([type, presentations]) => [
    type,
    Object.freeze(Object.keys(presentations))
  ]))
);

export function coverageFor(node) {
  return [...(PRESENTATION_COVERAGE[node?.type]?.[node?.presentation] ?? [])];
}

export function semanticStructureFor(node) {
  return PRESENTATION_STRUCTURE[node?.type]?.[node?.presentation] ?? null;
}

function numericValue(value) {
  if (typeof value === 'number') return value;
  const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function semanticItemsForPresentation(sourceNode, selection) {
  const items = Array.isArray(sourceNode?.items) ? sourceNode.items : [];
  if (['summary', 'top_summary'].includes(selection?.presentation)) return items.slice(0, 1);
  if (selection?.presentation === 'peak_summary') {
    return items.length === 0 ? [] : [items.reduce((peak, item) => numericValue(item.value) > numericValue(peak.value) ? item : peak, items[0])];
  }
  return items;
}

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
    return { presentation: result.pass ? 'radar' : 'comparison', profileTest: result, sourcePresentation: node.presentation ?? 'comparison' };
  }
  const requested = node.presentation ?? 'summary';
  const compact = modifiers?.density === 'compact' && typeof node.compactPresentation === 'string';
  return {
    presentation: compact ? node.compactPresentation : requested,
    profileTest: null,
    sourcePresentation: requested
  };
}

function normalizeRequirements(contextRequirements) {
  const errors = [];
  const ids = new Set();
  const requirements = contextRequirements.map((requirement, index) => {
    const id = requirement?.id;
    if (typeof id !== 'string' || !CONTEXT_ID_PATTERN.test(id)) {
      errors.push({
        code: 'COMPOSITION_REQUIREMENT_ID_INVALID',
        path: `/contextRequirements/${index}/id`,
        message: 'every context requirement must declare a stable ctx_ identifier.'
      });
    } else if (ids.has(id)) {
      errors.push({
        code: 'COMPOSITION_REQUIREMENT_ID_DUPLICATE',
        path: `/contextRequirements/${index}/id`,
        message: 'context requirement ids must be unique.'
      });
    } else {
      ids.add(id);
    }
    return { ...requirement, id };
  });
  return { requirements, ids, errors };
}

function normalizeModifiers(modifiers) {
  const activeModifierIds = Array.isArray(modifiers?.activeModifierIds)
    ? modifiers.activeModifierIds.filter((id) => typeof id === 'string' && MODIFIER_ID_PATTERN.test(id))
    : [];
  return { ...(modifiers ?? {}), activeModifierIds };
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

function validateSelectedPresentations(selectedNodes) {
  return selectedNodes.flatMap((node) => {
    const knownType = Object.hasOwn(PRESENTATION_REGISTRY, node.type);
    const knownPresentation = knownType && PRESENTATION_REGISTRY[node.type].includes(node.presentation);
    if (knownPresentation) return [];
    return [{
      code: knownType ? 'COMPOSITION_PRESENTATION_UNKNOWN' : 'COMPOSITION_NODE_TYPE_UNKNOWN',
      path: `/nodes/${node.inputIndex}/presentation`,
      message: knownType
        ? `${node.type} presentation ${node.presentation} is not registered for the shared renderer.`
        : `semantic node type ${node.type} is not registered for the shared renderer.`
    }];
  });
}

function modifierReference(modifiers) {
  return modifiers.activeModifierIds[0] ?? 'default_composition';
}

function defaultDecisionsFor(node, contextRequirements, modifiers) {
  const requirements = contextRequirements.filter((item) => item.subject === node.id);
  if (requirements.length > 0) {
    return requirements.map((requirement) => ({
      node: node.id,
      decision: 'retain_full',
      reasonCode: `CONTEXT_REQUIRES_${requirement.type.toUpperCase()}`,
      requirementRef: requirement.id
    }));
  }
  if (node.profileTest) {
    return [{
      node: node.id,
      decision: 'retain_full',
      reasonCode: node.profileTest.pass ? 'PROFILE_COMPARABILITY_CONFIRMED' : 'PROFILE_COMPARABILITY_FAILED',
      modifierRef: modifierReference(modifiers)
    }];
  }
  if (modifiers.density === 'compact' && node.sourcePresentation !== node.presentation) {
    return [{
      node: node.id,
      decision: 'collapse_to_drilldown',
      reasonCode: 'AUDIENCE_DENSITY_LIMIT',
      modifierRef: modifierReference(modifiers)
    }];
  }
  return [{
    node: node.id,
    decision: 'retain_full',
    reasonCode: 'SOURCE_STRUCTURE_REQUIRED',
    modifierRef: modifierReference(modifiers)
  }];
}

export function decisionLogErrors(decisionLog, selectedNodes, contextRequirements = [], modifiers = {}) {
  const knownNodes = new Set(selectedNodes.map((node) => node.id));
  const knownRequirements = new Map(contextRequirements.map((requirement) => [requirement.id, requirement]));
  const knownModifiers = new Set(['default_composition', ...(modifiers.activeModifierIds ?? [])]);

  return decisionLog.flatMap((entry, index) => {
    const base = `/decisionLog/${index}`;
    if (!knownNodes.has(entry?.node) || !COMPOSITION_DECISIONS.has(entry?.decision) || !DECISION_REASON_CODES.has(entry?.reasonCode)) {
      return [{
        code: 'COMPOSITION_DECISION_UNATTRIBUTED',
        path: base,
        message: 'composition decision must name a known node, stable reasonCode, and supported decision.'
      }];
    }

    const refs = [entry?.requirementRef, entry?.modifierRef].filter((ref) => typeof ref === 'string');
    if (refs.length === 0) {
      return [{
        code: 'COMPOSITION_DECISION_UNATTRIBUTED',
        path: base,
        message: 'every promote, retain, collapse, or drop decision needs a requirementRef or modifierRef.'
      }];
    }

    const errors = [];
    if (entry.requirementRef && !knownRequirements.has(entry.requirementRef)) {
      errors.push({
        code: 'COMPOSITION_DECISION_REF_NOT_FOUND',
        path: `${base}/requirementRef`,
        message: `requirementRef ${entry.requirementRef} does not resolve to a context requirement.`
      });
    } else if (entry.requirementRef && knownRequirements.get(entry.requirementRef)?.subject !== entry.node) {
      errors.push({
        code: 'COMPOSITION_DECISION_REF_SCOPE_MISMATCH',
        path: `${base}/requirementRef`,
        message: 'requirementRef must resolve to a requirement for the same semantic node.'
      });
    }
    if (entry.modifierRef && !knownModifiers.has(entry.modifierRef)) {
      errors.push({
        code: 'COMPOSITION_DECISION_REF_NOT_FOUND',
        path: `${base}/modifierRef`,
        message: `modifierRef ${entry.modifierRef} is not an active composition modifier.`
      });
    }
    return errors;
  });
}

export function buildDeliveredClaims(bundle) {
  const claims = (bundle?.claims ?? []).map((claim, index) => ({
    id: `claim_grounding_${index + 1}`,
    claimType: 'grounded_fact',
    scope: 'metric',
    decisionPath: claim.decisionPath,
    evidenceRefs: [claim.evidenceRef]
  }));
  const visibleClaims = bundle?.decisionState?.visibleClaims ?? [];
  for (const claim of visibleClaims) {
    if (!claims.some((existing) => existing.id === claim.id)) claims.push({ ...claim });
  }
  if (bundle?.decisionState?.mode === 'composite' && !claims.some((claim) => claim.id === 'claim_score_band')) {
    const scoreEvidence = (bundle?.claims ?? []).find((claim) => claim.decisionPath === '/score/band');
    if (scoreEvidence) {
      claims.push({
        id: 'claim_score_band',
        claimType: 'score_band',
        scope: 'overall',
        text: bundle.decisionState.score.band,
        decisionPath: '/score/band',
        evidenceRefs: [scoreEvidence.evidenceRef]
      });
    }
  }
  return claims;
}

export function composeAdaptiveComposition({ contextRequirements = [], nodes = [], decisionLog = [], modifiers = {} } = {}) {
  const normalizedModifiers = normalizeModifiers(modifiers);
  const { requirements, errors: requirementErrors } = normalizeRequirements(contextRequirements);
  const selectedNodes = nodes.map((node, inputIndex) => {
    const selected = selectPresentation(node, normalizedModifiers);
    return {
      ...node,
      ...selected,
      inputIndex
    };
  });
  const presentationErrors = validateSelectedPresentations(selectedNodes);
  const delivered = [...new Set(selectedNodes.flatMap(coverageFor))];
  const required = [...new Set(requirements.map((requirement) => requirement.type))];
  const missingRequirements = requirements.filter((requirement) => {
    const subjectNode = selectedNodes.find((node) => node.id === requirement.subject);
    return !subjectNode || !coverageFor(subjectNode).includes(requirement.type);
  });
  const missing = [...new Set(missingRequirements.map((requirement) => requirement.type))];
  const contextErrors = missingRequirements.map((requirement) => {
    const failure = requirementFailure(requirement, selectedNodes);
    return { code: 'CONTEXT_PRESERVATION_FAILED', path: failure.path, message: failure.message };
  });
  const resolvedDecisionLog = selectedNodes.flatMap((node) => defaultDecisionsFor(node, requirements, normalizedModifiers));
  const resolvedLog = [...resolvedDecisionLog, ...decisionLog];
  const decisionErrors = decisionLogErrors(resolvedLog, selectedNodes, requirements, normalizedModifiers);

  return {
    valid: requirementErrors.length + presentationErrors.length + contextErrors.length + decisionErrors.length === 0,
    composition: {
      nodes: selectedNodes.map(({ inputIndex, ...node }) => node),
      decisionLog: resolvedLog,
      modifiers: normalizedModifiers
    },
    coverageManifest: {
      required,
      delivered,
      missing,
      requirements: requirements.map(({ id, subject, type, minimumCoverage }) => ({ id, subject, type, minimumCoverage }))
    },
    errors: [...requirementErrors, ...presentationErrors, ...decisionErrors, ...contextErrors]
  };
}

function tagAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/\b(data-[a-z-]+)="([^"]*)"/g)) attributes[match[1]] = match[2];
  return attributes;
}

function openTags(artifact) {
  return String(artifact ?? '').match(/<(?!!)[^>]+>/g) ?? [];
}

function semanticContainerTags(artifact) {
  return openTags(artifact).filter((tag) => tag.includes('data-semantic-node=') && !tag.includes('data-semantic-item="true"'));
}

function semanticItemTags(artifact, nodeId) {
  return openTags(artifact).filter((tag) => {
    const attrs = tagAttributes(tag);
    return attrs['data-semantic-node'] === nodeId && attrs['data-semantic-item'] === 'true';
  });
}

function nodeMarkerPresent(artifact, node) {
  const expectedCoverage = new Set(node.coverage ?? []);
  return semanticContainerTags(artifact).some((tag) => {
    const attrs = tagAttributes(tag);
    const actualCoverage = new Set(String(attrs['data-coverage'] ?? '').split(/\s+/).filter(Boolean));
    return attrs['data-semantic-node'] === node.id &&
      attrs['data-presentation'] === node.presentation &&
      sameSet(actualCoverage, expectedCoverage);
  });
}

function sameSet(left, right) {
  const a = [...new Set(left ?? [])].sort();
  const b = [...new Set(right ?? [])].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function addError(errors, code, path, message) {
  errors.push({ code, path, message });
}

function verifySemanticItems(artifact, node, errors, artifactLabel) {
  if (!Number.isInteger(node.expectedItemCount)) return;
  const itemTags = semanticItemTags(artifact, node.id);
  const indices = itemTags.map((tag) => Number.parseInt(tagAttributes(tag)['data-item-index'], 10));
  const expected = Array.from({ length: node.expectedItemCount }, (_, index) => index);
  if (!sameSet(indices, expected) || indices.length !== expected.length) {
    addError(
      errors,
      'DELIVERED_ITEM_COUNT_MISMATCH',
      `/nodes/${node.id}/expectedItemCount`,
      `${node.id} expected ${node.expectedItemCount} ordered items in ${artifactLabel}, but the final artifact delivered ${indices.filter(Number.isInteger).length}.`
    );
    return;
  }

  const structure = semanticStructureFor(node);
  const tags = semanticContainerTags(artifact).filter((tag) => tagAttributes(tag)['data-semantic-node'] === node.id);
  if (structure && !tags.some((tag) => tagAttributes(tag)['data-structure'] === structure)) {
    addError(errors, 'DELIVERED_STRUCTURE_MISMATCH', `/nodes/${node.id}/structure`, `${node.id} did not deliver the registered ${structure} structure in ${artifactLabel}.`);
  }

  const roles = itemTags.map((tag) => tagAttributes(tag)['data-semantic-role']).filter(Boolean);
  const roleRequired = {
    'ordered-trajectory': 'point',
    'ordered-distribution': 'member',
    'ranked-order': 'rank',
    'decomposition': 'component'
  }[structure];
  if (roleRequired && roles.some((role) => role !== roleRequired)) {
    addError(errors, 'DELIVERED_STRUCTURE_CONTENT_MISMATCH', `/nodes/${node.id}/structure`, `${node.id} contains non-${roleRequired} items in its ${structure} presentation.`);
  }
  if (structure === 'target-gap' && !['actual', 'target', 'gap'].every((role) => roles.includes(role))) {
    addError(errors, 'DELIVERED_STRUCTURE_CONTENT_MISMATCH', `/nodes/${node.id}/structure`, `${node.id} target-gap presentation must contain actual, target, and gap roles.`);
  }
  if (structure === 'ranked-order') {
    const ranks = itemTags.map((tag) => Number.parseInt(tagAttributes(tag)['data-rank'], 10));
    const expectedRanks = Array.from({ length: node.expectedItemCount }, (_, index) => index + 1);
    if (!sameSet(ranks, expectedRanks) || ranks.length !== expectedRanks.length) {
      addError(errors, 'DELIVERED_STRUCTURE_CONTENT_MISMATCH', `/nodes/${node.id}/structure`, `${node.id} ranking items must retain a complete ordered rank sequence.`);
    }
  }
}

function verifyCoverageManifest(deliveryManifest, nodes, errors) {
  const coverage = deliveryManifest.coverage;
  if (!coverage || typeof coverage !== 'object') return;
  const actualDelivered = [...new Set(nodes.flatMap((node) => node.coverage ?? []))];
  if (Array.isArray(coverage.delivered) && !sameSet(coverage.delivered, actualDelivered)) {
    addError(errors, 'DELIVERED_COVERAGE_MANIFEST_MISMATCH', '/coverage/delivered', 'delivered coverage must equal coverage actually declared by delivered nodes.');
  }
  if (!Array.isArray(coverage.requirements)) return;
  const actualMissing = coverage.requirements
    .filter((requirement) => {
      const subject = nodes.find((node) => node.id === requirement.subject);
      return !subject || !subject.coverage?.includes(requirement.type);
    })
    .map((requirement) => requirement.type);
  if (Array.isArray(coverage.missing) && !sameSet(coverage.missing, actualMissing)) {
    addError(errors, 'DELIVERED_COVERAGE_MANIFEST_MISMATCH', '/coverage/missing', 'subject-scoped coverage missing must match the delivered node markers.');
  }
}

function verifyDeliveredDecisionLog(deliveryManifest, nodes, errors) {
  if (!Array.isArray(deliveryManifest.decisionLog)) return;
  const requirements = deliveryManifest.coverage?.requirements ?? [];
  const modifiers = deliveryManifest.modifiers ?? {};
  errors.push(...decisionLogErrors(deliveryManifest.decisionLog, nodes, requirements, modifiers));
}

function evidenceIds(deliveryManifest) {
  return new Set((deliveryManifest.evidence ?? []).map((evidence) => evidence?.id).filter(Boolean));
}

function verifyClaims(deliveryManifest, html, svg, errors) {
  const claims = Array.isArray(deliveryManifest.claims) ? deliveryManifest.claims : [];
  const evidence = evidenceIds(deliveryManifest);
  for (const [index, claim] of claims.entries()) {
    if (!Array.isArray(claim.evidenceRefs)) continue;
    for (const evidenceRef of claim.evidenceRefs) {
      if (!evidence.has(evidenceRef)) {
        addError(errors, 'CLAIM_EVIDENCE_REF_NOT_FOUND', `/claims/${index}/evidenceRefs`, `claim ${claim.id ?? index} references evidence ${evidenceRef}, which is not delivered.`);
      }
    }
  }

  const artifactClaims = [
    ['html', openTags(html).filter((tag) => tag.includes('data-claim-scope="overall"'))],
    ['svg', openTags(svg).filter((tag) => tag.includes('data-claim-scope="overall"'))]
  ];
  const validatedOverallClaims = new Set();
  for (const [artifactLabel, elements] of artifactClaims) {
    for (const element of elements) {
      const attrs = tagAttributes(element);
      const id = attrs['data-claim-id'];
      const index = claims.findIndex((claim) => claim.id === id && claim.scope === 'overall');
      const claim = index === -1 ? null : claims[index];
      if (!claim) {
        addError(errors, 'OVERALL_CLAIM_UNDECLARED', '/claims', 'visible overall claim must resolve to a typed delivered-manifest claim.');
        continue;
      }
      if (!validatedOverallClaims.has(id)) {
        if (typeof claim.claimType !== 'string' || claim.claimType.length === 0) {
          addError(errors, 'OVERALL_CLAIM_TYPE_REQUIRED', `/claims/${index}/claimType`, `visible overall claim ${claim.id} must declare claimType.`);
        }
        if (!Array.isArray(claim.evidenceRefs) || claim.evidenceRefs.length === 0) {
          addError(errors, 'OVERALL_CLAIM_EVIDENCE_REQUIRED', `/claims/${index}/evidenceRefs`, `visible overall claim ${claim.id} must reference source evidence.`);
        }
        validatedOverallClaims.add(id);
      }
      if (attrs['data-claim-type'] && attrs['data-claim-type'] !== claim.claimType) {
        addError(errors, 'OVERALL_CLAIM_TYPE_MISMATCH', `/claims/${index}/claimType`, `artifact claim ${claim.id} does not match the delivered claim type.`);
      }
      const markerRefs = String(attrs['data-claim-evidence-refs'] ?? '').split(/\s+/).filter(Boolean);
      if (!sameSet(markerRefs, claim.evidenceRefs ?? [])) {
        addError(errors, 'OVERALL_CLAIM_EVIDENCE_MARKER_MISMATCH', `/claims/${index}/evidenceRefs`, `${artifactLabel} claim ${claim.id} does not carry the delivered evidence references.`);
      }
    }
  }

  for (const [index, claim] of claims.entries()) {
    if (claim.scope !== 'overall') continue;
    const deliveredInHtml = artifactClaims[0][1].some((element) => tagAttributes(element)['data-claim-id'] === claim.id);
    const deliveredInSvg = artifactClaims[1][1].some((element) => tagAttributes(element)['data-claim-id'] === claim.id);
    if (!deliveredInHtml || !deliveredInSvg) {
      addError(errors, 'OVERALL_CLAIM_NOT_DELIVERED', `/claims/${index}`, `overall claim ${claim.id} is not rendered by both final HTML and SVG artifacts.`);
    }
  }
}

function stripVerification(manifest) {
  const payload = { ...(manifest ?? {}) };
  delete payload.verification;
  return payload;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function expectedVerification(artifact, manifest) {
  const manifestPayloadHash = sha256(stableJson(stripVerification(manifest)));
  return {
    status: 'passed',
    verifierVersion: 'composition-verifier@2',
    artifactHash: sha256(artifact),
    manifestHash: manifestPayloadHash,
    manifestPayloadHash
  };
}

function verificationMismatch(supplied, expected) {
  return ['status', 'verifierVersion', 'artifactHash', 'manifestHash', 'manifestPayloadHash']
    .some((key) => supplied?.[key] !== expected[key]);
}

export function verifyDeliveredArtifact({ html = '', svg = '', manifest = {} } = {}) {
  const artifact = `${html}\n${svg}`;
  const errors = [];
  const deliveryManifest = manifest?.delivery && typeof manifest.delivery === 'object' ? manifest.delivery : manifest;

  if (manifest.verificationStamp !== undefined || deliveryManifest.verificationStamp !== undefined) {
    addError(errors, 'PREPOPULATED_VERIFICATION_STAMP', '/verificationStamp', 'verification stamps are issued only by the delivery verifier after a successful check.');
  }
  if (!String(html).trim() && !String(svg).trim()) {
    addError(errors, 'DELIVERED_ARTIFACT_EMPTY', '/', 'final HTML and SVG artifacts cannot both be empty.');
  }

  const nodes = Array.isArray(deliveryManifest.nodes) ? deliveryManifest.nodes : [];
  const knownNodeIds = new Set(nodes.map((node) => node.id));
  for (const artifactPart of [html, svg]) {
    for (const tag of semanticContainerTags(artifactPart)) {
      const id = tagAttributes(tag)['data-semantic-node'];
      if (id && !knownNodeIds.has(id)) addError(errors, 'UNDECLARED_DELIVERED_NODE', '/nodes', `final artifact contains semantic node ${id} that is absent from the delivered manifest.`);
    }
  }

  for (const node of nodes) {
    if (node?.type) {
      const registeredCoverage = coverageFor(node);
      if (!sameSet(node.coverage, registeredCoverage)) {
        addError(errors, 'DELIVERED_MANIFEST_COVERAGE_INVALID', `/nodes/${node.id}/coverage`, `${node.id} manifest coverage does not match the registered presentation coverage.`);
      }
    }
    const requiresBothArtifacts = Boolean(node?.type);
    const artifacts = requiresBothArtifacts ? [['html', html], ['svg', svg]] : [['artifact', artifact]];
    for (const [label, part] of artifacts) {
      if (!nodeMarkerPresent(part, node)) {
        addError(errors, 'DELIVERED_COMPOSITION_MISMATCH', `/nodes/${node.id}`, `${node.id} manifest presentation or coverage is not present in the final artifact.`);
      }
      verifySemanticItems(part, node, errors, label);
    }
  }

  verifyCoverageManifest(deliveryManifest, nodes, errors);
  verifyDeliveredDecisionLog(deliveryManifest, nodes, errors);
  verifyClaims(deliveryManifest, html, svg, errors);

  const expected = expectedVerification(artifact, manifest);
  if (errors.length > 0) {
    if (Object.hasOwn(manifest, 'verification') && verificationMismatch(manifest.verification, expected)) {
      addError(errors, 'VERIFICATION_STAMP_MISMATCH', '/verification', 'verification does not match the current final artifact and manifest payload.');
    }
    return { valid: false, errors };
  }

  if (Object.hasOwn(manifest, 'verification')) {
    if (verificationMismatch(manifest.verification, expected)) {
      return {
        valid: false,
        errors: [{
          code: 'VERIFICATION_STAMP_MISMATCH',
          path: '/verification',
          message: 'verification does not match the current final artifact and manifest payload.'
        }]
      };
    }
    return { valid: true, errors: [], verification: manifest.verification, verificationStamp: manifest.verification };
  }

  return { valid: true, errors: [], verification: expected, verificationStamp: expected };
}
