const RELATION_TYPES = Object.freeze(['distribution', 'comparison', 'decomposition', 'diagnostic_attribution', 'temporal', 'additive_path']);

const TYPED_METADATA = Object.freeze({
  comparison: { key: 'comparison', identityField: 'metricIdentity' },
  distribution: { key: 'distribution', identityField: 'dimension' },
  decomposition: { key: 'decomposition', identityField: 'whole' },
  diagnostic_attribution: { key: 'diagnosticAttribution', identityField: 'outcomeRef' },
  additive_path: { key: 'additivePath', identityField: 'startRef' }
});

const EXPECTED_RELATION_TYPE = Object.freeze({
  Ranking: 'comparison',
  Relationship: 'comparison',
  Distribution: 'distribution',
  Breakdown: 'decomposition',
  Trend: 'temporal'
});

export const RELATIONSHIP_MEMBERSHIP_REASON_CODES = Object.freeze([
  'RELATIONSHIP_GROUNDED',
  'RELATIONSHIP_INTRINSIC',
  'RELATIONSHIP_NOT_REQUIRED',
  'COMPARISON_RELATIONSHIP_REQUIRED',
  'RELATIONSHIP_REF_UNRESOLVED',
  'RELATIONSHIP_REF_CONFLICT',
  'RELATIONSHIP_SUBJECT_NOT_COVERED',
  'RELATIONSHIP_TYPE_MISMATCH',
  'RELATIONSHIP_IDENTITY_MISMATCH'
]);

const UNRESOLVED = (reasonCode, extra = {}) => ({
  grounded: false,
  basis: null,
  relationshipRef: null,
  relationshipType: null,
  identity: null,
  comparisonDomain: null,
  reasonCode,
  ...extra
});

function relationshipIdentity(relationship) {
  const meta = TYPED_METADATA[relationship?.relationType];
  if (!meta) return null;
  const value = relationship?.[meta.key]?.[meta.identityField];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function validateRelationships(decisionState, { evidenceIds = null } = {}) {
  const errors = [];
  const nodes = Array.isArray(decisionState?.semanticNodes) ? decisionState.semanticNodes : [];
  const relationships = Array.isArray(decisionState?.relationships) ? decisionState.relationships : [];

  const nodeIds = new Set(nodes.map((node) => node?.id).filter(Boolean));
  const displayIdentities = new Set();
  for (const node of nodes) {
    if (typeof node?.title === 'string' && node.title.length > 0) displayIdentities.add(node.title);
    for (const item of node?.items ?? []) {
      if (typeof item?.label === 'string' && item.label.length > 0) displayIdentities.add(item.label);
    }
  }

  const seenIds = new Set();
  relationships.forEach((relationship, index) => {
    const base = `/relationships/${index}`;
    const id = relationship?.id;
    if (typeof id === 'string' && id.length > 0) {
      if (seenIds.has(id)) {
        errors.push({ code: 'RELATIONSHIP_ID_DUPLICATE', path: `${base}/id`, message: `relationship id ${id} is declared more than once.` });
      } else {
        seenIds.add(id);
      }
    }

    const subjectRefs = Array.isArray(relationship?.subjectRefs) ? relationship.subjectRefs : [];
    subjectRefs.forEach((subjectRef, refIndex) => {
      if (!nodeIds.has(subjectRef)) {
        errors.push({ code: 'RELATIONSHIP_SUBJECT_NOT_FOUND', path: `${base}/subjectRefs/${refIndex}`, message: `relationship ${id ?? index} references subject ${subjectRef}, which is not a semantic node.` });
      }
    });

    const meta = TYPED_METADATA[relationship?.relationType];
    if (meta && relationshipIdentity(relationship) === null) {
      errors.push({ code: 'RELATIONSHIP_TYPED_METADATA_REQUIRED', path: `${base}/${meta.key}/${meta.identityField}`, message: `${relationship.relationType} relationships require typed metadata ${meta.key}.${meta.identityField}.` });
    }

    if (relationship?.relationType === 'comparison') {
      const identity = relationshipIdentity(relationship);
      if (identity !== null && (nodeIds.has(identity) || displayIdentities.has(identity))) {
        errors.push({
          code: 'RELATIONSHIP_IDENTITY_INVALID',
          path: `${base}/comparison/metricIdentity`,
          message: 'comparison metricIdentity must be a stable controlled identifier, never a node id, node title, or display label.'
        });
      }
    }

    const memberIds = new Set([
      ...subjectRefs,
      ...nodes.filter((node) => subjectRefs.includes(node?.id)).flatMap((node) => (node.items ?? []).map((item) => item?.label))
    ].filter(Boolean));

    const memberRefs = Array.isArray(relationship?.memberRefs) ? relationship.memberRefs : [];
    memberRefs.forEach((memberRef, refIndex) => {
      if (!memberIds.has(memberRef)) {
        errors.push({ code: 'RELATIONSHIP_MEMBER_NOT_FOUND', path: `${base}/memberRefs/${refIndex}`, message: `relationship ${id ?? index} references member ${memberRef}, which does not resolve to a subject node or one of its items.` });
      }
    });

    if (relationship?.relationType === 'additive_path') {
      const pathRefs = [
        [`startRef`, relationship?.additivePath?.startRef],
        [`endRef`, relationship?.additivePath?.endRef],
        ...(Array.isArray(relationship?.additivePath?.members) ? relationship.additivePath.members : [])
          .map((member, memberIndex) => [`members/${memberIndex}/memberRef`, member?.memberRef])
      ];
      for (const [refPath, ref] of pathRefs) {
        if (typeof ref === 'string' && !memberIds.has(ref)) {
          errors.push({ code: 'RELATIONSHIP_MEMBER_NOT_FOUND', path: `${base}/additivePath/${refPath}`, message: `additive path relationship ${id ?? index} references ${ref}, which does not resolve to a subject node or one of its items.` });
        }
      }
      if (memberRefs.length === 0) {
        errors.push({ code: 'RELATIONSHIP_TYPED_METADATA_REQUIRED', path: `${base}/memberRefs`, message: 'additive_path relationships require grounded memberRefs for every signed contributor.' });
      }
    }

    if (evidenceIds) {
      const basisRefs = Array.isArray(relationship?.basisRefs) ? relationship.basisRefs : [];
      basisRefs.forEach((basisRef, refIndex) => {
        if (!evidenceIds.has(basisRef)) {
          errors.push({ code: 'RELATIONSHIP_BASIS_REF_NOT_FOUND', path: `${base}/basisRefs/${refIndex}`, message: `relationship ${id ?? index} references evidence ${basisRef}, which does not exist in the bundle.` });
        }
      });
    }
  });

  return errors;
}

export function requiredRelationshipPaths(decisionState) {
  const paths = [];
  const relationships = Array.isArray(decisionState?.relationships) ? decisionState.relationships : [];
  relationships.forEach((relationship, index) => {
    paths.push(`/relationships/${index}/id`, `/relationships/${index}/relationType`);
    const meta = TYPED_METADATA[relationship?.relationType];
    if (meta) paths.push(`/relationships/${index}/${meta.key}/${meta.identityField}`);
  });
  return paths;
}

export function deriveIntrinsicRelationship(node) {
  const relationType = EXPECTED_RELATION_TYPE[node?.type];
  if (!relationType || !['Trend', 'Distribution', 'Breakdown', 'Relationship'].includes(node.type)) return null;
  const relationshipRef = `intrinsic_${node.id}_${relationType}`;
  return {
    grounded: true,
    basis: 'intrinsic',
    relationshipRef,
    relationshipType: relationType,
    identity: null,
    comparisonDomain: relationshipRef,
    reasonCode: 'RELATIONSHIP_INTRINSIC'
  };
}

export function resolveNodeRelationship(node, relationships = []) {
  const comparabilitySources = [node?.comparability, ...(Array.isArray(node?.items) ? node.items : []).map((item) => item?.comparability)];
  const refs = [...new Set(comparabilitySources.map((source) => source?.comparisonGroup).filter((value) => typeof value === 'string' && value.length > 0))];
  const declaredDomains = [...new Set(comparabilitySources.map((source) => source?.comparabilityDomain).filter((value) => typeof value === 'string' && value.length > 0))];

  if (refs.length > 1) {
    return UNRESOLVED('RELATIONSHIP_REF_CONFLICT');
  }

  if (refs.length === 1) {
    const ref = refs[0];
    const relationship = (Array.isArray(relationships) ? relationships : []).find((candidate) => candidate?.id === ref);
    if (!relationship) {
      return UNRESOLVED('RELATIONSHIP_REF_UNRESOLVED', { relationshipRef: ref });
    }
    const expectedType = EXPECTED_RELATION_TYPE[node?.type] ?? 'comparison';
    if (relationship.relationType !== expectedType) {
      return UNRESOLVED('RELATIONSHIP_TYPE_MISMATCH', { relationshipRef: ref, relationshipType: relationship.relationType });
    }
    if (!(Array.isArray(relationship.subjectRefs) && relationship.subjectRefs.includes(node?.id))) {
      return UNRESOLVED('RELATIONSHIP_SUBJECT_NOT_COVERED', { relationshipRef: ref, relationshipType: relationship.relationType });
    }
    const identity = relationshipIdentity(relationship);
    if (identity === null || declaredDomains.some((domain) => domain !== identity)) {
      return UNRESOLVED('RELATIONSHIP_IDENTITY_MISMATCH', {
        basis: 'declared',
        relationshipRef: ref,
        relationshipType: relationship.relationType,
        identity,
        comparisonDomain: identity
      });
    }
    return {
      grounded: true,
      basis: 'declared',
      relationshipRef: ref,
      relationshipType: relationship.relationType,
      identity,
      comparisonDomain: identity,
      reasonCode: 'RELATIONSHIP_GROUNDED'
    };
  }

  const intrinsic = deriveIntrinsicRelationship(node);
  if (intrinsic) return intrinsic;
  return UNRESOLVED('COMPARISON_RELATIONSHIP_REQUIRED');
}
