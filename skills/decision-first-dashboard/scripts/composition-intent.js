import { resolveNodeRelationship } from './relationship-grammar.js';

const SUPPORTED_ARCHETYPES = Object.freeze(new Map([
  ['state+observe', 'monitor'],
  ['priority+rank', 'prioritize_readonly']
]));

const ASK_QUESTIONS = Object.freeze({
  COMPOSITION_INTENT_REQUIRED: 'What does this decision need from the dashboard: a view of the current state, or an ordered view of what to handle first?',
  COMPOSITION_INTENT_UNSUPPORTED: 'This dashboard cannot yet answer that combination of question and action. Should it instead show the current state, or an ordered view of what to handle first?',
  GROUNDED_ORDERING_BASIS_REQUIRED: "What basis from the source should determine the priority order, for example each candidate's gap to its target?"
});

export function classifyCompositionIntent(decisionBrief) {
  const questionShape = decisionBrief?.questionShape ?? null;
  const actionShape = decisionBrief?.actionShape ?? null;
  const knownQuestion = questionShape && questionShape.status !== 'absent' && typeof questionShape.value === 'string' ? questionShape.value : null;
  const knownAction = actionShape && actionShape.status !== 'absent' && typeof actionShape.value === 'string' ? actionShape.value : null;

  const confirmed = questionShape?.status === 'confirmed' &&
    actionShape?.status === 'confirmed' &&
    knownQuestion !== null &&
    knownAction !== null;
  if (!confirmed) {
    return { status: 'ask', archetype: null, questionShape: knownQuestion, actionShape: knownAction, reasonCode: 'COMPOSITION_INTENT_REQUIRED' };
  }

  const archetype = SUPPORTED_ARCHETYPES.get(`${knownQuestion}+${knownAction}`) ?? null;
  if (!archetype) {
    return { status: 'ask', archetype: null, questionShape: knownQuestion, actionShape: knownAction, reasonCode: 'COMPOSITION_INTENT_UNSUPPORTED' };
  }
  return { status: 'classified', archetype, questionShape: knownQuestion, actionShape: knownAction, reasonCode: null };
}

function askOutcome(reasonCode, questionShape, actionShape) {
  return {
    status: 'ask',
    transition: 'ASK_COMPOSITION_INTENT',
    reasonCode,
    question: ASK_QUESTIONS[reasonCode],
    intent: {
      archetype: null,
      questionShape,
      actionShape,
      eligibility: { status: 'ask', reasonCode }
    }
  };
}

function toNumber(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function findGroundedRankBasis(nodes, relationships, evidenceFor) {
  for (const [index, node] of nodes.entries()) {
    const items = Array.isArray(node?.items) ? node.items : [];
    const rankEntries = [];
    items.forEach((item, itemIndex) => {
      if (item?.role !== 'rank' || item?.provenance !== 'source') return;
      const ordinal = toNumber(item.value);
      const evidenceRef = evidenceFor.get(`/semanticNodes/${index}/items/${itemIndex}/value`) ?? null;
      if (ordinal !== null && Number.isInteger(ordinal) && ordinal >= 1 && evidenceRef) {
        rankEntries.push({ itemIndex, ordinal, evidenceRef });
      }
    });
    if (rankEntries.length < 2) continue;
    const ordinals = rankEntries.map((entry) => entry.ordinal);
    const denseOrdinals = [...ordinals].sort((a, b) => a - b).every((value, position) => value === position + 1);
    if (!denseOrdinals) continue;
    return {
      kind: 'grounded_rank',
      candidateRefs: rankEntries.map((entry) => `/semanticNodes/${index}/items/${entry.itemIndex}`),
      basisRefs: rankEntries.map((entry) => entry.evidenceRef),
      relationshipRef: resolveNodeRelationship(node, relationships)?.relationshipRef ?? null
    };
  }
  return null;
}

function findGroundedGapBasis(nodes, relationships, requirements, evidenceFor) {
  const nodesById = new Map(nodes.map((node, index) => [node?.id, { node, index }]));

  const targetRequirement = requirements.find((requirement) => requirement?.type === 'target_reference' && nodesById.has(requirement?.subject)) ?? null;
  if (!targetRequirement) return null;
  const target = nodesById.get(targetRequirement.subject);
  if (target.node?.type !== 'Relationship') return null;

  const targetItems = Array.isArray(target.node.items) ? target.node.items : [];
  const structuralItems = targetItems
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter(({ item }) => ['actual', 'target', 'gap'].includes(item?.role) && item?.provenance === 'source');
  const coveredRoles = new Set(structuralItems.map(({ item }) => item.role));
  if (!['actual', 'target', 'gap'].every((role) => coveredRoles.has(role))) return null;

  const basisRefs = [];
  for (const { itemIndex } of structuralItems) {
    const evidenceRef = evidenceFor.get(`/semanticNodes/${target.index}/items/${itemIndex}/value`) ?? null;
    if (!evidenceRef) return null;
    basisRefs.push(evidenceRef);
  }

  const gapRequirement = requirements.find((requirement) => requirement?.type === 'gap_attribution' && requirement?.subject !== targetRequirement.subject && nodesById.has(requirement?.subject)) ?? null;
  if (!gapRequirement) return null;
  const candidate = nodesById.get(gapRequirement.subject);
  const candidateItems = Array.isArray(candidate.node?.items) ? candidate.node.items : [];
  if (candidateItems.length < 2 || !candidateItems.every((item) => item?.provenance === 'source')) return null;

  const candidateRefs = [];
  for (const [itemIndex] of candidateItems.entries()) {
    const evidenceRef = evidenceFor.get(`/semanticNodes/${candidate.index}/items/${itemIndex}/value`) ?? null;
    if (!evidenceRef) return null;
    basisRefs.push(evidenceRef);
    candidateRefs.push(`/semanticNodes/${candidate.index}/items/${itemIndex}`);
  }

  return {
    kind: 'grounded_gap',
    candidateRefs,
    basisRefs: [...new Set(basisRefs)],
    relationshipRef: resolveNodeRelationship(target.node, relationships)?.relationshipRef ?? null
  };
}

function findGroundedOrderingBasis(decisionBrief, bundle) {
  const decisionState = bundle?.decisionState ?? null;
  const nodes = Array.isArray(decisionState?.semanticNodes) ? decisionState.semanticNodes : [];
  const relationships = Array.isArray(decisionState?.relationships) ? decisionState.relationships : [];
  const requirements = Array.isArray(decisionBrief?.contextRequirements) ? decisionBrief.contextRequirements : [];
  const claims = Array.isArray(bundle?.claims) ? bundle.claims : [];
  const evidenceFor = new Map(claims.map((claim) => [claim?.decisionPath, claim?.evidenceRef]));

  return findGroundedRankBasis(nodes, relationships, evidenceFor)
    ?? findGroundedGapBasis(nodes, relationships, requirements, evidenceFor);
}

export function evaluateCompositionIntent(decisionBrief, bundle = null) {
  const classification = classifyCompositionIntent(decisionBrief);
  if (classification.status === 'ask') {
    return askOutcome(classification.reasonCode, classification.questionShape, classification.actionShape);
  }
  if (classification.archetype === 'monitor') {
    return {
      status: 'pass',
      transition: 'PASS',
      reasonCode: null,
      question: null,
      intent: {
        archetype: 'monitor',
        questionShape: classification.questionShape,
        actionShape: classification.actionShape,
        eligibility: { status: 'eligible' }
      }
    };
  }

  const orderingBasis = findGroundedOrderingBasis(decisionBrief, bundle);
  if (!orderingBasis) {
    return askOutcome('GROUNDED_ORDERING_BASIS_REQUIRED', classification.questionShape, classification.actionShape);
  }
  return {
    status: 'pass',
    transition: 'PASS',
    reasonCode: null,
    question: null,
    intent: {
      archetype: 'prioritize_readonly',
      questionShape: classification.questionShape,
      actionShape: classification.actionShape,
      eligibility: { status: 'eligible' },
      orderingBasis
    }
  };
}
