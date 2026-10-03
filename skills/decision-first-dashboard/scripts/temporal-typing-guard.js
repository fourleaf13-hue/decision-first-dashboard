// RDT-TS-1 TEMPORAL_STRUCTURE_LOSS: semantic typing contract guard.
// A set of observations organized in temporal order by a real time index
// expresses a trajectory and must be typed Trend. This guard enforces that
// contract at the semantic typing boundary, upstream of composition and the
// renderer; it never rewrites a node's type on its own. Strong temporal
// evidence (a declared temporal axis, a bound temporal_reference requirement,
// or absolute date labels) on a non-Trend node fails closed. Bare month or
// quarter labels are only weak evidence — a recurring period-bin distribution
// is legal — so they stop for an explicit axis confirmation instead.
const MONTH_LABELS = Object.freeze(new Set([
  'jan', 'january', 'feb', 'february', 'mar', 'march', 'apr', 'april', 'may',
  'jun', 'june', 'jul', 'july', 'aug', 'august', 'sep', 'sept', 'september',
  'oct', 'october', 'nov', 'november', 'dec', 'december'
]));

const QUARTER_LABEL = /^q[1-4]$/;
const ISO_DATE_LABEL = /^\d{4}-\d{2}(-\d{2})?$/;

const ASK_QUESTIONS = Object.freeze({
  TEMPORAL_AXIS_AMBIGUOUS: 'These observations are labeled by month or quarter. Do they trace one continuous span of time, or do they aggregate recurring periods across many spans?'
});

function isBarePeriodLabel(label) {
  const normalized = typeof label === 'string' ? label.trim().toLowerCase() : '';
  return MONTH_LABELS.has(normalized) || QUARTER_LABEL.test(normalized);
}

function isAbsoluteDateLabel(label) {
  return typeof label === 'string' && ISO_DATE_LABEL.test(label.trim());
}

export function evaluateSemanticTyping(decisionBrief, bundle) {
  const decisionState = bundle?.decisionState ?? null;
  const nodes = Array.isArray(decisionState?.semanticNodes) ? decisionState.semanticNodes : [];
  const requirements = Array.isArray(decisionBrief?.contextRequirements) ? decisionBrief.contextRequirements : [];

  const errors = [];
  const ambiguousNodeIds = [];

  nodes.forEach((node, index) => {
    if (!node || node.type === 'Trend') return;
    const items = Array.isArray(node.items) ? node.items : [];
    if (items.length === 0) return;

    const axisSemantics = node.axis?.semantics ?? null;
    if (axisSemantics === 'categorical') return;

    const nodeId = node.id ?? `semanticNodes/${index}`;
    const evidence = [];
    if (axisSemantics === 'temporal') evidence.push('declares a temporal axis');
    if (requirements.some((requirement) => requirement?.type === 'temporal_reference' && requirement?.subject === node.id)) {
      evidence.push('is bound to a temporal_reference requirement');
    }
    if (items.filter((item) => isAbsoluteDateLabel(item?.label)).length * 2 > items.length) {
      evidence.push('is indexed by absolute dates');
    }

    if (evidence.length > 0) {
      errors.push({
        code: 'TEMPORAL_SERIES_TYPE_MISMATCH',
        path: `/semanticNodes/${index}/type`,
        message: `${nodeId} ${evidence.join(' and ')}, so it must be typed Trend, not ${node.type}.`
      });
      return;
    }

    if (items.filter((item) => isBarePeriodLabel(item?.label)).length * 2 > items.length) {
      ambiguousNodeIds.push(nodeId);
    }
  });

  if (errors.length > 0) {
    return { status: 'fail', transition: 'FIX_SEMANTIC_TYPING', errors, reasonCode: null, question: null };
  }
  if (ambiguousNodeIds.length > 0) {
    return {
      status: 'ask',
      transition: 'ASK_SEMANTIC_TYPING',
      errors: [],
      reasonCode: 'TEMPORAL_AXIS_AMBIGUOUS',
      question: ASK_QUESTIONS.TEMPORAL_AXIS_AMBIGUOUS,
      nodes: ambiguousNodeIds
    };
  }
  return { status: 'pass', transition: 'PASS', errors: [], reasonCode: null, question: null };
}
