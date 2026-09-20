import { resolveNodeRelationship } from './relationship-grammar.js';
import { evaluateComparability, numericValue } from './visual-grammar.js';
import {
  ADDITIVE_CONTRACT_TOLERANCE,
  BULLET_GAP_CONTRACT_TOLERANCE,
  GROUNDED_RANKING_MAX_CANDIDATES,
  contractWithinTolerance
} from './encoding-contracts.js';

const CONFIRMED_STATUSES = new Set(['confirmed', 'source']);

function subjectItemIndex(sourceNode) {
  const byLabel = new Map();
  for (const item of sourceNode?.items ?? []) {
    if (typeof item?.label === 'string' && !byLabel.has(item.label)) byLabel.set(item.label, item);
  }
  return byLabel;
}

function groundedComparison(node, relationships) {
  const membership = resolveNodeRelationship(node, relationships ?? []);
  return membership.grounded === true && membership.relationshipType === 'comparison'
    ? membership
    : null;
}

function evaluateBulletEligibility({ sourceNode, contextRequirements, relationships }) {
  const items = Array.isArray(sourceNode?.items) ? sourceNode.items : [];
  const actual = items.find((item) => item?.role === 'actual');
  const target = items.find((item) => item?.role === 'target');
  const gap = items.find((item) => item?.role === 'gap');

  if (!target || target.provenance !== 'source') return { eligible: false, reasonCode: 'BULLET_INELIGIBLE_TARGET_NOT_GROUNDED' };
  if (!actual || actual.provenance !== 'source') return { eligible: false, reasonCode: 'BULLET_INELIGIBLE_ACTUAL_NOT_GROUNDED' };
  if (!gap || gap.provenance !== 'source') return { eligible: false, reasonCode: 'BULLET_INELIGIBLE_GAP_NOT_TRACEABLE' };

  const requirement = (contextRequirements ?? []).find((entry) => entry?.subject === sourceNode?.id && entry?.type === 'target_reference');
  if (!requirement || !CONFIRMED_STATUSES.has(requirement.status)) {
    return { eligible: false, reasonCode: 'BULLET_INELIGIBLE_REQUIREMENT_UNCONFIRMED' };
  }

  if (!groundedComparison(sourceNode, relationships)) {
    return { eligible: false, reasonCode: 'BULLET_INELIGIBLE_RELATIONSHIP_NOT_GROUNDED' };
  }

  const subjects = gap ? [actual, target, gap] : [actual, target];
  if (!evaluateComparability(subjects, { parent: sourceNode }).pass) {
    return { eligible: false, reasonCode: 'BULLET_INELIGIBLE_COMPARABILITY_FAILED' };
  }

  const delta = numericValue(target.value) - numericValue(actual.value);
  if (!contractWithinTolerance(Math.abs(delta), Math.abs(numericValue(gap.value)), BULLET_GAP_CONTRACT_TOLERANCE)) {
    return { eligible: false, reasonCode: 'BULLET_INELIGIBLE_GAP_NOT_TRACEABLE' };
  }

  return { eligible: true, reasonCode: 'BULLET_TARGET_ELIGIBLE' };
}

function findAdditivePath(relationships, nodeId) {
  return (relationships ?? []).find((relationship) =>
    relationship?.relationType === 'additive_path' &&
    Array.isArray(relationship.subjectRefs) &&
    relationship.subjectRefs.includes(nodeId)
  ) ?? null;
}

function evaluateWaterfallEligibility({ sourceNode, decisionState }) {
  const relationships = Array.isArray(decisionState?.relationships) ? decisionState.relationships : [];
  const path = findAdditivePath(relationships, sourceNode?.id);
  if (!path || !Array.isArray(path.basisRefs) || path.basisRefs.length === 0) {
    return { eligible: false, reasonCode: 'WATERFALL_INELIGIBLE_PATH_NOT_DECLARED' };
  }

  const subjectNodes = (decisionState.semanticNodes ?? []).filter((node) => path.subjectRefs?.includes(node?.id));
  const labelIndex = new Map();
  for (const node of subjectNodes) {
    for (const [label, item] of subjectItemIndex(node)) {
      if (!labelIndex.has(label)) labelIndex.set(label, { node, item });
    }
  }

  const start = labelIndex.get(path.additivePath?.startRef);
  const end = labelIndex.get(path.additivePath?.endRef);
  if (!start) return { eligible: false, reasonCode: 'WATERFALL_INELIGIBLE_START_UNGROUNDED' };
  if (!end) return { eligible: false, reasonCode: 'WATERFALL_INELIGIBLE_END_UNGROUNDED' };

  const members = Array.isArray(path.additivePath?.members) ? path.additivePath.members : [];
  if (members.length === 0) return { eligible: false, reasonCode: 'WATERFALL_INELIGIBLE_MEMBER_NOT_GROUNDED' };
  for (const member of members) {
    if (member?.sign !== 'plus' && member?.sign !== 'minus') {
      return { eligible: false, reasonCode: 'WATERFALL_INELIGIBLE_MEMBER_SIGN_UNGROUNDED' };
    }
    if (!labelIndex.has(member?.memberRef)) {
      return { eligible: false, reasonCode: 'WATERFALL_INELIGIBLE_MEMBER_NOT_GROUNDED' };
    }
  }

  // The waterfall may only decompose this node's own contributors, in the
  // order the typed path declares: the renderer never re-sequences segments.
  const nodeItems = Array.isArray(sourceNode?.items) ? sourceNode.items : [];
  const memberLabels = members.map((member) => member.memberRef);
  const nodeLabels = nodeItems.map((item) => item?.label).filter(Boolean);
  if (memberLabels.length !== nodeLabels.length || memberLabels.some((label, index) => label !== nodeLabels[index])) {
    return { eligible: false, reasonCode: 'WATERFALL_INELIGIBLE_MEMBER_NOT_GROUNDED' };
  }

  const involved = [start.item, end.item, ...members.map((member) => labelIndex.get(member.memberRef).item)];
  if (!evaluateComparability(involved, { parent: sourceNode }).pass) {
    return { eligible: false, reasonCode: 'WATERFALL_INELIGIBLE_UNIT_MISMATCH' };
  }

  let running = numericValue(start.item.value);
  for (const member of members) {
    const value = numericValue(labelIndex.get(member.memberRef).item.value);
    running += member.sign === 'minus' ? -value : value;
  }
  if (!contractWithinTolerance(running, numericValue(end.item.value))) {
    return { eligible: false, reasonCode: 'WATERFALL_INELIGIBLE_ADDITIVE_CONTRACT_FAILED' };
  }

  return { eligible: true, reasonCode: 'WATERFALL_ELIGIBLE' };
}

function groundedRankingBasis({ sourceNode, orderingBasis }) {
  if (orderingBasis && typeof orderingBasis === 'object') {
    return { grounded: true, basis: `composition_intent:${orderingBasis.kind ?? 'grounded'}` };
  }
  const items = Array.isArray(sourceNode?.items) ? sourceNode.items : [];
  // Grounded by ordinals only when the delivered source order is exactly the
  // dense rank sequence 1..n - the renderer never re-sorts to earn the claim.
  const grounded = items.length >= 2 && items.every((item, index) => Number.isInteger(item?.rank) && item.rank === index + 1);
  return grounded ? { grounded: true, basis: 'source_rank_ordinals' } : { grounded: false, basis: null };
}

export function routeVisualEncoding({ decisionState, compositionNodes = [], contextRequirements = [], orderingBasis = null } = {}) {
  const nodesById = new Map((decisionState?.semanticNodes ?? []).map((node) => [node?.id, node]));
  const decisions = new Map();
  const decisionLog = [];
  const nodes = compositionNodes.map((node) => ({ ...node }));

  for (const node of nodes) {
    const sourceNode = nodesById.get(node.id) ?? null;
    const eligibleEncodings = [];
    const rejected = [];
    let selected = node.presentation;
    let requested = node.presentation;

    if (node.type === 'Relationship') {
      eligibleEncodings.push('bullet_target');
      if (node.presentation === 'bullet_target') {
        const result = evaluateBulletEligibility({ sourceNode, contextRequirements, relationships: decisionState?.relationships });
        if (result.eligible) {
          decisions.set(node.id, { requestedEncoding: requested, selectedEncoding: selected, eligibleEncodings, rejected });
          continue;
        }
        rejected.push({ encoding: 'bullet_target', reasonCode: result.reasonCode });
        selected = 'full_chart';
        node.presentation = 'full_chart';
        delete node.compactPresentation;
        decisionLog.push({ node: node.id, decision: 'retain_full', reasonCode: result.reasonCode, modifierRef: 'default_composition' });
      } else {
        rejected.push({ encoding: 'bullet_target', reasonCode: 'BULLET_NOT_REQUESTED' });
      }
    }

    if (node.type === 'Breakdown') {
      eligibleEncodings.push('waterfall');
      if (node.presentation === 'waterfall') {
        const result = evaluateWaterfallEligibility({ sourceNode, decisionState });
        if (result.eligible) {
          decisions.set(node.id, { requestedEncoding: requested, selectedEncoding: selected, eligibleEncodings, rejected });
          continue;
        }
        rejected.push({ encoding: 'waterfall', reasonCode: result.reasonCode });
        selected = 'full_breakdown';
        node.presentation = 'full_breakdown';
        delete node.compactPresentation;
        decisionLog.push({ node: node.id, decision: 'retain_full', reasonCode: result.reasonCode, modifierRef: 'default_composition' });
      } else {
        rejected.push({ encoding: 'waterfall', reasonCode: 'WATERFALL_NOT_REQUESTED' });
      }
    }

    if (node.type === 'Ranking') {
      const rankingBasis = groundedRankingBasis({ sourceNode, orderingBasis });
      if (rankingBasis.grounded) eligibleEncodings.push('ranked_bar');
      else rejected.push({ encoding: 'ranked_bar', reasonCode: 'RANKING_ORDER_NOT_GROUNDED' });

      const candidateCount = Array.isArray(sourceNode?.items) ? sourceNode.items.length : 0;
      if (node.presentation === 'both_ends') {
        // An explicitly declared ranking_span requirement is the only license
        // to keep a small candidate set truncated to its two ends. The
        // requirement is authored in the Decision Brief, so its mere presence
        // is the traceable upstream judgement; no composition status re-grading
        // applies here.
        const groundedExtremes = (contextRequirements ?? []).some((requirement) =>
          requirement?.subject === node.id &&
          requirement?.type === 'ranking_span' &&
          requirement?.minimumCoverage === 'both_ends'
        );
        if (!groundedExtremes && candidateCount > 0 && candidateCount <= GROUNDED_RANKING_MAX_CANDIDATES) {
          rejected.push({ encoding: 'both_ends', reasonCode: 'RANKING_EXTREMES_NOT_GROUNDED' });
          selected = 'full_ranking';
          node.presentation = 'full_ranking';
          if (node.compactPresentation === 'both_ends') delete node.compactPresentation;
          decisionLog.push({ node: node.id, decision: 'retain_full', reasonCode: 'RANKING_EXTREMES_NOT_GROUNDED', modifierRef: 'default_composition' });
        }
      }
    }

    decisions.set(node.id, { requestedEncoding: requested, selectedEncoding: selected, eligibleEncodings, rejected });
  }

  return { nodes, decisionLog, encodingDecisions: decisions };
}
