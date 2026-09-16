import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema } from './validate.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const routingSchema = JSON.parse(fs.readFileSync(path.resolve(currentDir, '../schemas/metric-routing.schema.json'), 'utf8'));
const ROLES = new Set(['primary_signal', 'diagnostic', 'exception', 'drilldown', 'scorecard_only']);
const VISIBILITIES = new Set(['first_view', 'supporting', 'on_demand', 'scorecard']);

function add(errors, code, pathValue, message) {
  errors.push({ code, path: pathValue, message });
}

function defaultVisibility(role) {
  if (role === 'primary_signal' || role === 'exception') return 'first_view';
  if (role === 'diagnostic') return 'supporting';
  if (role === 'drilldown') return 'on_demand';
  return 'scorecard';
}

function defaultChangesDecision(role) {
  return role === 'primary_signal' || role === 'exception';
}

function defaultHeroEligibility(role) {
  return role === 'primary_signal';
}

function metricRouteObject(route = {}) {
  const normalized = {};
  for (const key of ['role', 'visibility', 'changesDecision', 'decisionImpact', 'explains', 'active', 'surfacePath']) {
    if (Object.hasOwn(route, key) && route[key] !== undefined) normalized[key] = route[key];
  }
  if (normalized.role && !Object.hasOwn(normalized, 'visibility')) normalized.visibility = defaultVisibility(normalized.role);
  if (normalized.role && !Object.hasOwn(normalized, 'changesDecision')) normalized.changesDecision = defaultChangesDecision(normalized.role);
  return normalized;
}

export function normalizeMetricRouteOutcome(route = {}) {
  const normalized = metricRouteObject(route);
  return {
    ...normalized,
    heroEligible: typeof route.heroEligible === 'boolean'
      ? route.heroEligible
      : defaultHeroEligibility(normalized.role)
  };
}

function routeOutcomeKey(route) {
  return JSON.stringify({
    role: route.role,
    visibility: route.visibility,
    changesDecision: route.changesDecision,
    heroEligible: route.heroEligible
  });
}

function routeForCandidate(candidate, baseRoute) {
  if (candidate?.route && typeof candidate.route === 'object') return normalizeMetricRouteOutcome(candidate.route);
  if (candidate && typeof candidate === 'object') return normalizeMetricRouteOutcome(candidate);
  return normalizeMetricRouteOutcome(baseRoute);
}

export function detectMaterialMetricAmbiguity(candidateAssumptions = [], baseRoute = {}) {
  const outcomes = candidateAssumptions.map((candidate) => ({
    id: candidate.id,
    assumption: candidate.assumption,
    route: routeForCandidate(candidate, baseRoute)
  }));
  const uniqueKeys = new Set(outcomes.map(({ route }) => routeOutcomeKey(route)));
  const primarySignalEligibility = new Set(outcomes.map(({ route }) => route.role === 'primary_signal'));
  const heroEligibility = new Set(outcomes.map(({ route }) => route.heroEligible));
  return {
    outcomes,
    uniqueRouteOutcomeCount: uniqueKeys.size,
    primarySignalDiverges: primarySignalEligibility.size > 1,
    heroEligibilityDiverges: heroEligibility.size > 1,
    material: uniqueKeys.size >= 2 && (primarySignalEligibility.size > 1 || heroEligibility.size > 1)
  };
}

function responseChangeRequiresNoPrimary(assessment) {
  const responseChange = assessment?.responseChange;
  if (!responseChange) return false;
  return responseChange.status === 'absent' || ['monitoring', 'none'].includes(responseChange.kind);
}

function routeFromMetricWorthiness(assessment, baseRoute) {
  const base = normalizeMetricRouteOutcome(baseRoute);
  if (responseChangeRequiresNoPrimary(assessment) && base.role === 'primary_signal') {
    const fallbackRole = base.explains ? 'diagnostic' : 'scorecard_only';
    return normalizeMetricRouteOutcome({
      ...base,
      role: fallbackRole,
      visibility: defaultVisibility(fallbackRole),
      changesDecision: false,
      decisionImpact: undefined,
      active: undefined,
      surfacePath: undefined
    });
  }
  return base;
}

function manifestRouteFromOutcome(metric, outcome, baseRoute, assessment) {
  const route = {
    ...baseRoute,
    metric,
    ...metricRouteObject(outcome)
  };

  if (route.role === 'primary_signal' && (!route.decisionImpact || route.changesDecision !== true)) {
    route.changesDecision = true;
    route.decisionImpact = route.decisionImpact
      ?? assessment?.responseChange?.description
      ?? assessment?.whatChanges?.description
      ?? baseRoute.decisionImpact;
  }
  if (route.role === 'exception' && (!route.decisionImpact || route.changesDecision !== true)) {
    route.changesDecision = true;
    route.decisionImpact = route.decisionImpact
      ?? assessment?.responseChange?.description
      ?? baseRoute.decisionImpact;
  }
  if (route.role === 'diagnostic') {
    route.changesDecision = false;
    route.visibility = route.visibility === 'on_demand' ? 'on_demand' : 'supporting';
  }
  if (route.role === 'drilldown') {
    route.changesDecision = false;
    route.visibility = 'on_demand';
  }
  if (route.role === 'scorecard_only') {
    route.changesDecision = false;
    route.visibility = 'scorecard';
    delete route.decisionImpact;
    delete route.explains;
    delete route.active;
    delete route.surfacePath;
  }
  return route;
}

export function evaluateMetricWorthinessSet(metricWorthiness = [], manifest = null, { existingQuestionCount = 0 } = {}) {
  const assessments = Array.isArray(metricWorthiness) ? metricWorthiness : [];
  const manifestMetrics = new Map((manifest?.metrics ?? []).map((item) => [item?.metric, item]));
  const errors = [];
  const details = [];
  let materialAmbiguityCount = 0;

  for (const [index, assessment] of assessments.entries()) {
    const base = `/metricWorthiness/${index}`;
    const baseRoute = manifestMetrics.get(assessment?.metric);
    if (!baseRoute) {
      add(errors, 'METRIC_WORTHINESS_TARGET_NOT_ROUTED', `${base}/metric`, 'metric-level worthiness must target an extracted routing entry');
      continue;
    }

    const candidates = Array.isArray(assessment.candidateAssumptions) ? assessment.candidateAssumptions : [];
    const ambiguity = detectMaterialMetricAmbiguity(candidates, baseRoute);
    if (ambiguity.material) materialAmbiguityCount += 1;

    const chosenRoute = assessment.status === 'overridden'
      ? normalizeMetricRouteOutcome(assessment.override)
      : candidates.length > 0
        ? ambiguity.outcomes[0].route
        : routeFromMetricWorthiness(assessment, baseRoute);

    details.push({
      metric: assessment.metric,
      status: assessment.status,
      source: assessment.source,
      assumption: assessment.assumption ?? null,
      materialAmbiguity: ambiguity.material,
      uniqueRouteOutcomeCount: ambiguity.uniqueRouteOutcomeCount,
      primarySignalDiverges: ambiguity.primarySignalDiverges,
      heroEligibilityDiverges: ambiguity.heroEligibilityDiverges,
      routeOutcomes: ambiguity.outcomes,
      chosenRoute
    });
  }

  const clarificationQuestionCount = materialAmbiguityCount > 0 ? 1 : 0;
  const questionCount = existingQuestionCount + clarificationQuestionCount;
  if (!Number.isInteger(existingQuestionCount) || existingQuestionCount < 0) {
    add(errors, 'QUESTION_COUNT_INVALID', '/questionCount', 'existing question count must be a non-negative integer');
  }
  if (questionCount > 5) {
    add(errors, 'QUESTION_BUDGET_EXCEEDED', '/questionCount', 'Dashboard Worthiness, Decision Brief, and metric clarification must share a maximum of five questions');
  }

  return {
    valid: errors.length === 0,
    stage: 'metric_worthiness',
    transition: materialAmbiguityCount > 0 ? 'ASK_METRIC_WORTHINESS_QUESTION' : 'PASS',
    errors,
    questionCount,
    clarificationQuestionCount,
    materialAmbiguityCount,
    details
  };
}

function metricObjectsById(decisionState) {
  const objects = new Map();
  const collections = [
    decisionState?.signals,
    decisionState?.supportingSignals,
    decisionState?.metricInventory,
    decisionState?.scorecardSignals
  ];
  const errors = [];
  for (const collection of collections) {
    for (const item of collection ?? []) {
      if (!item?.metric) continue;
      if (objects.has(item.metric)) {
        add(errors, 'DUPLICATE_DECISION_STATE_METRIC', '/decisionState', `metric ${item.metric} appears more than once in decision state`);
      } else {
        objects.set(item.metric, item);
      }
    }
  }
  for (const node of decisionState?.semanticNodes ?? []) {
    if (!node?.id || objects.has(node.id)) continue;
    objects.set(node.id, {
      metric: node.id,
      label: node.title ?? node.id,
      value: node.title ?? node.id,
      provenance: 'source'
    });
  }
  return { objects, errors };
}

export function rebuildDecisionStateForRouting(decisionState, manifest, { heroMetric = null } = {}) {
  if (decisionState?.mode !== 'no_score') {
    return { valid: true, errors: [], decisionState };
  }

  const { objects, errors } = metricObjectsById(decisionState);
  const primaryMetrics = manifest.metrics.filter((item) => item?.role === 'primary_signal').map((item) => item.metric);
  const supportingMetrics = manifest.metrics
    .filter((item) => item?.role === 'diagnostic' && item.visibility === 'supporting')
    .map((item) => item.metric);
  const scorecardMetrics = manifest.metrics.filter((item) => item?.role === 'scorecard_only').map((item) => item.metric);

  for (const metric of [...primaryMetrics, ...supportingMetrics, ...scorecardMetrics]) {
    if (!objects.has(metric)) add(errors, 'ROUTED_METRIC_NOT_RENDERABLE', '/decisionState', `routed metric ${metric} has no grounded decision-state value`);
  }
  if (primaryMetrics.length > 0 && !objects.has(primaryMetrics[0])) {
    add(errors, 'HERO_METRIC_NOT_RENDERABLE', '/presentation/heroMetric', 'the routed hero metric must exist in decision state');
  }
  if (errors.length > 0) return { valid: false, errors, decisionState: null };

  return {
    valid: true,
    errors: [],
    decisionState: {
      ...decisionState,
      presentation: {
        primaryMetrics,
        heroMetric: primaryMetrics.includes(heroMetric) ? heroMetric : primaryMetrics[0],
        supportingMetrics,
        scorecardMetrics
      }
    }
  };
}

function metricPriorityForRoute(route, metric, heroMetric) {
  if (route?.role === 'primary_signal') return metric === heroMetric ? 'hero' : 'primary';
  if (route?.role === 'exception') return 'exception';
  if (route?.role === 'diagnostic') return 'supporting';
  if (route?.role === 'drilldown') return 'drilldown';
  return 'scorecard';
}

function decorateCompositionNodes(manifest, routes, heroMetric) {
  if (!Array.isArray(manifest?.compositionNodes)) return manifest;
  const routeByMetric = new Map(routes.map((route) => [route?.metric, route]));
  return {
    ...manifest,
    compositionNodes: manifest.compositionNodes.map((node) => {
      const metric = node?.metric ?? node?.id;
      const route = routeByMetric.get(metric);
      if (!route) return { ...node };
      const roleUsesSummary = ['diagnostic', 'drilldown', 'scorecard_only'].includes(route.role);
      return {
        ...node,
        metric,
        metricRole: route.role,
        metricPriority: metricPriorityForRoute(route, metric, heroMetric),
        ...(roleUsesSummary ? { presentation: 'summary' } : {})
      };
    })
  };
}

export function applyMetricWorthinessRouting(manifest, decisionState, metricWorthiness = []) {
  const assessments = Array.isArray(metricWorthiness) ? metricWorthiness : [];
  if (assessments.length === 0) {
    return { valid: true, errors: [], manifest, decisionState, details: [] };
  }

  const metrics = Array.isArray(manifest?.metrics) ? manifest.metrics : [];
  const byMetric = new Map(metrics.map((item) => [item?.metric, item]));
  const errors = [];
  const details = [];
  const nextMetrics = metrics.map((item) => ({ ...item }));
  let preferredHeroMetric = null;

  for (const [index, assessment] of assessments.entries()) {
    const baseRoute = byMetric.get(assessment?.metric);
    if (!baseRoute) {
      add(errors, 'METRIC_WORTHINESS_TARGET_NOT_ROUTED', `/metricWorthiness/${index}/metric`, 'metric-level worthiness must target an extracted routing entry');
      continue;
    }

    const candidates = Array.isArray(assessment.candidateAssumptions) ? assessment.candidateAssumptions : [];
    const ambiguity = detectMaterialMetricAmbiguity(candidates, baseRoute);
    const outcome = assessment.status === 'overridden'
      ? normalizeMetricRouteOutcome(assessment.override)
      : candidates.length > 0
        ? ambiguity.outcomes[0].route
        : routeFromMetricWorthiness(assessment, baseRoute);
    const route = manifestRouteFromOutcome(assessment.metric, outcome, baseRoute, assessment);
    const routeIndex = nextMetrics.findIndex((item) => item.metric === assessment.metric);
    if (routeIndex >= 0) nextMetrics[routeIndex] = route;
    if (assessment.status === 'overridden' && outcome.role === 'primary_signal' && outcome.heroEligible === true) {
      preferredHeroMetric = assessment.metric;
    }
    details.push({ metric: assessment.metric, route, ambiguity });
  }

  if (errors.length > 0) return { valid: false, errors, manifest: null, decisionState: null, details };

  const nextManifest = { ...manifest, metrics: nextMetrics };
  const rebuilt = rebuildDecisionStateForRouting(decisionState, nextManifest, { heroMetric: preferredHeroMetric });
  if (!rebuilt.valid) return { valid: false, errors: rebuilt.errors, manifest: null, decisionState: null, details };
  const heroMetric = rebuilt.decisionState?.presentation?.heroMetric ?? preferredHeroMetric;
  const decoratedManifest = decorateCompositionNodes(nextManifest, nextMetrics, heroMetric);
  return { valid: true, errors: [], manifest: decoratedManifest, decisionState: rebuilt.decisionState, details };
}

function visibleMetricIds(decisionState) {
  if (!decisionState || typeof decisionState !== 'object') return [];
  if (decisionState.mode === 'no_score') {
    if (decisionState.presentation?.primaryMetrics) return decisionState.presentation.primaryMetrics;
    return (decisionState.signals ?? []).map((item) => item.metric).filter(Boolean);
  }
  if (decisionState.mode === 'composite') return (decisionState.model?.components ?? []).map((item) => item.metric).filter(Boolean);
  return [];
}

function visibleSupportingMetricIds(decisionState) {
  if (!decisionState || decisionState.mode !== 'no_score') return [];
  if (decisionState.presentation?.supportingMetrics) return decisionState.presentation.supportingMetrics;
  return (decisionState.supportingSignals ?? []).map((item) => item.metric).filter(Boolean);
}

function visibleScorecardMetricIds(decisionState) {
  if (!decisionState || decisionState.mode !== 'no_score') return [];
  return decisionState.presentation?.scorecardMetrics ?? [];
}

function resolvePointer(root, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return { found: false };
  let node = root;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, key)) return { found: false };
    node = node[key];
  }
  return { found: true, value: node };
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  if (left.size !== a.length) return false;
  return b.every((item) => left.has(item));
}

export function validateMetricRouting(manifest, decisionState, options = {}) {
  const rawSchemaResult = validateAgainstSchema(manifest, routingSchema);
  if (!rawSchemaResult.valid) {
    return {
      valid: false,
      errors: rawSchemaResult.errors.map((error) => ({
        code: 'ROUTING_SCHEMA_INVALID',
        path: error.instancePath,
        message: `${error.keyword}: ${error.message}`
      })),
      summary: null
    };
  }

  const metricWorthiness = Array.isArray(options)
    ? options
    : options?.metricWorthiness ?? [];
  let effectiveManifest = manifest;
  let effectiveDecisionState = decisionState;
  let metricWorthinessResult = {
    valid: true,
    transition: 'PASS',
    errors: [],
    questionCount: Number.isInteger(options?.existingQuestionCount) ? options.existingQuestionCount : 0,
    clarificationQuestionCount: 0,
    materialAmbiguityCount: 0,
    details: []
  };

  if (metricWorthiness.length > 0) {
    metricWorthinessResult = evaluateMetricWorthinessSet(metricWorthiness, manifest, {
      existingQuestionCount: Number.isInteger(options?.existingQuestionCount) ? options.existingQuestionCount : 0
    });
    if (!metricWorthinessResult.valid || metricWorthinessResult.transition === 'ASK_METRIC_WORTHINESS_QUESTION') {
      return {
        valid: false,
        stage: 'metric_worthiness',
        transition: metricWorthinessResult.transition === 'ASK_METRIC_WORTHINESS_QUESTION'
          ? metricWorthinessResult.transition
          : 'FIX_METRIC_WORTHINESS',
        errors: metricWorthinessResult.errors,
        summary: null,
        metricWorthiness: metricWorthinessResult
      };
    }
    const applied = applyMetricWorthinessRouting(manifest, decisionState, metricWorthiness);
    if (!applied.valid) {
      return {
        valid: false,
        stage: 'metric_worthiness',
        transition: 'FIX_METRIC_WORTHINESS',
        errors: applied.errors,
        summary: null,
        metricWorthiness: metricWorthinessResult
      };
    }
    effectiveManifest = applied.manifest;
    effectiveDecisionState = applied.decisionState;
  }

  const errors = [];
  if (!effectiveManifest || typeof effectiveManifest !== 'object' || Array.isArray(effectiveManifest)) {
    return { valid: false, errors: [{ code: 'ROUTING_MANIFEST_INVALID', path: '', message: 'routing manifest must be an object' }], summary: null };
  }

  if (typeof effectiveManifest.decision !== 'string' || effectiveManifest.decision.trim().length === 0) add(errors, 'DECISION_REQUIRED', '/decision', 'confirmed decision is required');
  if (typeof effectiveManifest.action !== 'string' || effectiveManifest.action.trim().length === 0) add(errors, 'ACTION_REQUIRED', '/action', 'confirmed action is required');
  if (!Number.isInteger(effectiveManifest.inventoryCount) || effectiveManifest.inventoryCount < 1 || effectiveManifest.inventoryCount > 200) add(errors, 'INVENTORY_COUNT_INVALID', '/inventoryCount', 'inventoryCount must be an integer from 1 to 200');
  if (!Array.isArray(effectiveManifest.metrics) || effectiveManifest.metrics.length === 0 || effectiveManifest.metrics.length > 200) {
    add(errors, 'ROUTING_METRICS_INVALID', '/metrics', 'metrics must contain 1 to 200 routing entries');
  }

  const metrics = Array.isArray(effectiveManifest.metrics) ? effectiveManifest.metrics : [];
  if (Number.isInteger(effectiveManifest.inventoryCount) && effectiveManifest.inventoryCount !== metrics.length) {
    add(errors, 'INVENTORY_COUNT_MISMATCH', '/inventoryCount', 'every extracted metric must have exactly one routing entry');
  }

  const compositionNodes = Array.isArray(effectiveManifest.compositionNodes) ? effectiveManifest.compositionNodes : [];
  const semanticNodeIds = new Set((effectiveDecisionState?.semanticNodes ?? []).map((node) => node?.id).filter(Boolean));
  const compositionNodeIds = new Set();
  for (const [index, node] of compositionNodes.entries()) {
    if (compositionNodeIds.has(node.id)) add(errors, 'DUPLICATE_COMPOSITION_NODE', `/compositionNodes/${index}/id`, 'each semantic node may be selected only once');
    compositionNodeIds.add(node.id);
    if (semanticNodeIds.size > 0 && !semanticNodeIds.has(node.id)) {
      add(errors, 'COMPOSITION_NODE_NOT_FOUND', `/compositionNodes/${index}/id`, 'composition node must resolve to a semantic node in the decision state');
    }
  }

  const byMetric = new Map();
  for (const [index, item] of metrics.entries()) {
    const base = `/metrics/${index}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      add(errors, 'ROUTING_ENTRY_INVALID', base, 'routing entry must be an object');
      continue;
    }
    if (typeof item.metric !== 'string' || !/^[a-z0-9_]{1,64}$/.test(item.metric)) {
      add(errors, 'METRIC_ID_INVALID', `${base}/metric`, 'metric must be a stable snake_case identifier');
      continue;
    }
    if (byMetric.has(item.metric)) add(errors, 'DUPLICATE_METRIC_ROUTE', `${base}/metric`, 'each extracted metric may be routed only once');
    else byMetric.set(item.metric, item);

    if (!ROLES.has(item.role)) add(errors, 'ROLE_INVALID', `${base}/role`, 'metric role is not supported');
    if (typeof item.changesDecision !== 'boolean') add(errors, 'ACTION_TRIGGER_INVALID', `${base}/changesDecision`, 'changesDecision must be boolean');
    if (!VISIBILITIES.has(item.visibility)) add(errors, 'VISIBILITY_INVALID', `${base}/visibility`, 'visibility is not supported');

    if (item.role === 'primary_signal') {
      if (item.changesDecision !== true || typeof item.decisionImpact !== 'string' || item.decisionImpact.trim().length === 0) {
        add(errors, 'ACTION_TRIGGER_REQUIRED', base, 'primary signals must state how a material change alters the decision or action');
      }
      if (item.visibility !== 'first_view') add(errors, 'PRIMARY_SIGNAL_MUST_SURFACE', `${base}/visibility`, 'primary signals must be visible on the first view');
    }

    if (item.role === 'exception') {
      if (item.changesDecision !== true || typeof item.decisionImpact !== 'string' || item.decisionImpact.trim().length === 0) {
        add(errors, 'EXCEPTION_TRIGGER_REQUIRED', base, 'exceptions must state the required attention or decision impact');
      }
      if (item.active !== true && item.active !== false) add(errors, 'EXCEPTION_STATE_REQUIRED', `${base}/active`, 'exception routes must declare whether the exception is active');
      if (item.active === true && item.visibility !== 'first_view') add(errors, 'ACTIVE_EXCEPTION_MUST_SURFACE', `${base}/visibility`, 'active exceptions cannot be hidden or deferred for visual preference');
      if (item.active === true) {
        const surface = resolvePointer(effectiveDecisionState, item.surfacePath);
        if (typeof item.surfacePath !== 'string' || !/^\/(exceptions|events)\/\d+$/.test(item.surfacePath) || !surface.found) {
          add(errors, 'ACTIVE_EXCEPTION_NOT_SURFACED', `${base}/surfacePath`, 'active exceptions must map to a visible decision-state exception or event');
        }
      }
    }

    if (item.role === 'diagnostic') {
      if (item.changesDecision !== false) add(errors, 'DIAGNOSTIC_NOT_PRIMARY', `${base}/changesDecision`, 'a diagnostic that changes the decision belongs in primary_signal');
      if (typeof item.explains !== 'string' || item.explains.length === 0) add(errors, 'DIAGNOSTIC_TARGET_REQUIRED', `${base}/explains`, 'diagnostics must identify the primary signal or exception they explain');
      if (!['supporting', 'on_demand'].includes(item.visibility)) add(errors, 'DIAGNOSTIC_VISIBILITY_INVALID', `${base}/visibility`, 'diagnostics must stay supporting or on demand');
    }

    if (item.role === 'drilldown') {
      if (item.changesDecision !== false) add(errors, 'DRILLDOWN_NOT_PRIMARY', `${base}/changesDecision`, 'a drilldown that changes the decision belongs in primary_signal');
      if (item.visibility !== 'on_demand') add(errors, 'DRILLDOWN_VISIBILITY_INVALID', `${base}/visibility`, 'drilldown metrics must remain on demand');
    }

    if (item.role === 'scorecard_only') {
      if (item.changesDecision !== false) add(errors, 'SCORECARD_NOT_PRIMARY', `${base}/changesDecision`, 'a scorecard-only metric cannot claim to change the active decision');
      if (item.visibility !== 'scorecard') add(errors, 'SCORECARD_VISIBILITY_INVALID', `${base}/visibility`, 'scorecard-only metrics must stay out of the decision-first view');
    }
  }

  const primaries = metrics.filter((item) => item?.role === 'primary_signal');
  const activeExceptions = metrics.filter((item) => item?.role === 'exception' && item.active === true);
  const supportingDiagnostics = metrics.filter((item) => item?.role === 'diagnostic' && item.visibility === 'supporting');
  if (primaries.length < 3) add(errors, 'PRIMARY_SIGNAL_MINIMUM_NOT_MET', '/metrics', 'the current deterministic renderer requires at least 3 primary signals');
  if (primaries.length > 6) add(errors, 'PRIMARY_SIGNAL_BUDGET_EXCEEDED', '/metrics', 'the first view may contain at most 6 primary signals');
  if (primaries.length + activeExceptions.length > 11) add(errors, 'FIRST_VIEW_BUDGET_EXCEEDED', '/metrics', 'first-view primary signals plus active exceptions exceed the current information budget');
  if (supportingDiagnostics.length > 4) add(errors, 'SUPPORTING_DIAGNOSTIC_BUDGET_EXCEEDED', '/metrics', 'at most 4 diagnostics may use supporting visibility; additional diagnostics must be on_demand');

  const explainable = new Set(metrics.filter((item) => item?.role === 'primary_signal' || item?.role === 'exception').map((item) => item.metric));
  const supportExplainable = new Set([
    ...primaries.map((item) => item.metric),
    ...activeExceptions.map((item) => item.metric)
  ]);
  for (const [index, item] of metrics.entries()) {
    if (item?.role === 'diagnostic' && typeof item.explains === 'string' && !explainable.has(item.explains)) {
      add(errors, 'DIAGNOSTIC_TARGET_INVALID', `/metrics/${index}/explains`, 'diagnostic must explain a routed primary signal or exception');
    }
    if (item?.role === 'diagnostic' && item.visibility === 'supporting' && typeof item.explains === 'string' && !supportExplainable.has(item.explains)) {
      add(errors, 'SUPPORTING_DIAGNOSTIC_TARGET_INVALID', `/metrics/${index}/explains`, 'a visible supporting diagnostic must explain a routed primary signal or active exception');
    }
  }

  const routedPrimaryIds = primaries.map((item) => item.metric);
  const renderedIds = visibleMetricIds(effectiveDecisionState);
  if (!sameSet(routedPrimaryIds, renderedIds)) {
    add(errors, 'VISIBLE_PRIMARY_MISMATCH', '/metrics', 'rendered center metrics must exactly match the routed primary_signal set');
  }

  if (effectiveDecisionState?.mode === 'no_score') {
    const routedSupportingIds = supportingDiagnostics.map((item) => item.metric);
    const renderedSupportingIds = visibleSupportingMetricIds(effectiveDecisionState);
    const primarySet = new Set(renderedIds);
    if (renderedSupportingIds.some((metric) => primarySet.has(metric))) {
      add(errors, 'PRIMARY_SUPPORTING_OVERLAP', '/supportingSignals', 'a metric cannot appear in both primary signals and supporting context');
    }
    if (!sameSet(routedSupportingIds, renderedSupportingIds)) {
      add(errors, 'VISIBLE_SUPPORTING_MISMATCH', '/metrics', 'rendered supporting metrics must exactly match diagnostics routed with supporting visibility');
    }

    if (effectiveDecisionState.presentation) {
      const routedScorecardIds = metrics.filter((item) => item?.role === 'scorecard_only').map((item) => item.metric);
      const renderedScorecardIds = visibleScorecardMetricIds(effectiveDecisionState);
      if (!sameSet(routedScorecardIds, renderedScorecardIds)) {
        add(errors, 'VISIBLE_SCORECARD_MISMATCH', '/metrics', 'collapsed additional metrics must exactly match scorecard_only routes');
      }
    }
  }

  const summary = {
    inventoryCount: metrics.length,
    primaryCount: primaries.length,
    supportingCount: supportingDiagnostics.length,
    scorecardCount: metrics.filter((item) => item?.role === 'scorecard_only').length,
    activeExceptionCount: activeExceptions.length,
    hiddenCount: metrics.length - primaries.length - supportingDiagnostics.length - activeExceptions.length,
    firstViewCount: primaries.length + activeExceptions.length,
    metricWorthinessQuestionCount: metricWorthinessResult.questionCount
  };
  return {
    valid: errors.length === 0,
    errors,
    summary,
    manifest: effectiveManifest,
    decisionState: effectiveDecisionState,
    metricWorthiness: metricWorthinessResult
  };
}
