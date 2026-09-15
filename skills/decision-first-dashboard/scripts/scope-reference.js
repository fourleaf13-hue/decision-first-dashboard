function add(errors, code, path, message) {
  errors.push({ code, path, message });
}

function parseMetricNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const normalized = value
    .trim()
    .replaceAll(',', '')
    .replace(/[\s$€£¥]/g, '')
    .replace(/%$/, '');

  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function visibleMetricBindings(bundle) {
  const bindings = new Map();
  const state = bundle?.decisionState;
  if (!state || typeof state !== 'object') return bindings;

  if (state.mode === 'no_score') {
    for (const [index, item] of (state.signals ?? []).entries()) {
      if (item?.metric) bindings.set(item.metric, { item, valuePath: `/signals/${index}/value` });
    }
    return bindings;
  }

  if (state.mode === 'composite') {
    for (const [index, item] of (state.model?.components ?? []).entries()) {
      if (item?.metric) bindings.set(item.metric, { item, valuePath: `/model/components/${index}/value` });
    }
  }
  return bindings;
}

function evidenceIds(bundle) {
  return new Set((bundle?.evidence ?? []).map((item) => item?.id).filter(Boolean));
}

function claimEvidenceForPath(bundle, decisionPath) {
  return (bundle?.claims ?? []).find((claim) => claim?.decisionPath === decisionPath)?.evidenceRef ?? null;
}

function groundedOperand(bundle, bindings, metricId) {
  const binding = bindings.get(metricId);
  if (!binding) return { grounded: false, numericValue: null };

  const evidenceRef = claimEvidenceForPath(bundle, binding.valuePath);
  const grounded = binding.item?.provenance === 'source'
    && Boolean(evidenceRef)
    && evidenceIds(bundle).has(evidenceRef);

  return {
    grounded,
    numericValue: parseMetricNumber(binding.item?.value),
    evidenceRef
  };
}

function isHighFrequencyDecisionLoop(cadence) {
  return ['hourly', 'daily', 'weekly', 'monthly'].includes(cadence);
}

function isMultiYearCumulative(scope) {
  const temporal = scope?.temporal;
  return temporal?.kind === 'cumulative'
    && temporal?.unit === 'year'
    && typeof temporal?.rangeStart === 'string'
    && typeof temporal?.rangeEnd === 'string'
    && temporal.rangeStart !== temporal.rangeEnd;
}

function temporalAssessment(cadence, route) {
  if (isHighFrequencyDecisionLoop(cadence) && isMultiYearCumulative(route?.scope)) {
    return {
      compatible: false,
      reasons: ['MULTI_PERIOD_CUMULATIVE_CADENCE_MISMATCH']
    };
  }

  return { compatible: true, reasons: [] };
}

function sourceStatedReference(route, bundle, bindings, errors, metricPath) {
  const reference = route.referenceContext;
  const ids = evidenceIds(bundle);
  if (!ids.has(reference.evidenceRef)) {
    add(errors, 'REFERENCE_EVIDENCE_NOT_FOUND', `${metricPath}/referenceContext/evidenceRef`, 'source-stated reference evidenceRef must resolve to an evidence record');
    return null;
  }

  const binding = bindings.get(route.metric);
  if (!binding || claimEvidenceForPath(bundle, binding.valuePath) !== reference.evidenceRef || binding.item?.provenance !== 'source') {
    add(errors, 'REFERENCE_EVIDENCE_NOT_GROUNDED', `${metricPath}/referenceContext/evidenceRef`, 'source-stated reference evidence must ground the routed metric value');
    return null;
  }

  const sourceValue = parseMetricNumber(binding.item.value);
  if (sourceValue === null || Math.abs(sourceValue - reference.value) > 1e-9) {
    add(errors, 'REFERENCE_VALUE_MISMATCH', `${metricPath}/referenceContext/value`, 'source-stated reference value must match its grounded metric value');
    return null;
  }

  return {
    type: 'part_of_whole',
    provenance: 'source_stated',
    value: reference.value
  };
}

function compilerDerivedReference(route, routingManifest, bundle, bindings, errors, metricPath) {
  const reference = route.referenceContext;
  const routedIds = new Set((routingManifest?.metrics ?? []).map((item) => item?.metric).filter(Boolean));

  for (const [field, metricId] of [
    ['numeratorMetricId', reference.numeratorMetricId],
    ['denominatorMetricId', reference.denominatorMetricId]
  ]) {
    if (!routedIds.has(metricId)) {
      add(errors, 'REFERENCE_METRIC_NOT_FOUND', `${metricPath}/referenceContext/${field}`, `referenced metric ${metricId} does not exist in the routing manifest`);
    }
  }
  if (errors.length > 0) return null;

  const numerator = groundedOperand(bundle, bindings, reference.numeratorMetricId);
  const denominator = groundedOperand(bundle, bindings, reference.denominatorMetricId);
  if (!numerator.grounded || !denominator.grounded) {
    add(errors, 'REFERENCE_OPERAND_NOT_GROUNDED', `${metricPath}/referenceContext`, 'compiler-derived references require grounded numerator and denominator metric values');
    return null;
  }
  if (numerator.numericValue === null || denominator.numericValue === null) {
    add(errors, 'REFERENCE_OPERAND_NOT_NUMERIC', `${metricPath}/referenceContext`, 'compiler-derived ratio operands must resolve to numeric values');
    return null;
  }
  if (denominator.numericValue === 0) {
    add(errors, 'REFERENCE_DENOMINATOR_ZERO', `${metricPath}/referenceContext/denominatorMetricId`, 'compiler-derived ratio denominator cannot be zero');
    return null;
  }

  const precision = reference.calculation?.precision ?? 2;
  const value = Number(((numerator.numericValue / denominator.numericValue) * 100).toFixed(precision));
  return {
    type: 'part_of_whole',
    provenance: 'compiler_derived',
    value,
    numeratorMetricId: reference.numeratorMetricId,
    denominatorMetricId: reference.denominatorMetricId
  };
}

function evaluateReferenceContext(route, routingManifest, bundle, bindings, errors, metricPath) {
  const reference = route?.referenceContext;
  if (!reference) return null;

  if (reference.type !== 'part_of_whole') {
    add(errors, 'REFERENCE_CONTEXT_UNSUPPORTED', `${metricPath}/referenceContext/type`, 'only part_of_whole reference context is currently supported');
    return null;
  }

  if (reference.provenance === 'source_stated') {
    return sourceStatedReference(route, bundle, bindings, errors, metricPath);
  }
  if (reference.provenance === 'compiler_derived') {
    return compilerDerivedReference(route, routingManifest, bundle, bindings, errors, metricPath);
  }

  add(errors, 'REFERENCE_PROVENANCE_UNSUPPORTED', `${metricPath}/referenceContext/provenance`, 'reference context provenance is not supported');
  return null;
}

export function evaluateScopeReferenceContext(decisionBrief, routingManifest, bundle) {
  const cadence = decisionBrief?.decisionLoop?.cadence ?? null;
  const bindings = visibleMetricBindings(bundle);
  const errors = [];
  const metrics = {};

  for (const [index, route] of (routingManifest?.metrics ?? []).entries()) {
    if (!route?.metric) continue;
    const metricErrors = [];
    const temporal = temporalAssessment(cadence, route);
    const referenceContext = evaluateReferenceContext(
      route,
      routingManifest,
      bundle,
      bindings,
      metricErrors,
      `/metrics/${index}`
    );

    const reasons = [...temporal.reasons];
    if (route.role === 'primary_signal' && !route.referenceContext) {
      reasons.push('REFERENCE_CONTEXT_REQUIRED_FOR_HERO');
    }
    if (route.referenceContext && !referenceContext) {
      reasons.push('REFERENCE_CONTEXT_INVALID');
    }

    metrics[route.metric] = {
      temporalCompatible: temporal.compatible,
      heroEligible: route.role === 'primary_signal'
        && temporal.compatible
        && referenceContext !== null,
      reasons,
      ...(referenceContext ? { referenceContext } : {})
    };

    errors.push(...metricErrors);
  }

  return {
    valid: errors.length === 0,
    stage: 'scope_reference',
    transition: errors.length === 0 ? 'PASS' : 'FIX_SCOPE_REFERENCE_CONTEXT',
    errors,
    summary: {
      decisionLoopCadence: cadence,
      metrics
    }
  };
}
