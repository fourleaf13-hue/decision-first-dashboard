import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema } from './validate.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const routingSchema = JSON.parse(fs.readFileSync(path.resolve(currentDir, '../schemas/metric-routing.schema.json'), 'utf8'));
const ROLES = new Set(['primary_signal', 'diagnostic', 'exception', 'drilldown', 'scorecard_only']);
const VISIBILITIES = new Set(['first_view', 'supporting', 'on_demand', 'scorecard']);

function add(errors, code, path, message) {
  errors.push({ code, path, message });
}

function visibleMetricIds(decisionState) {
  if (!decisionState || typeof decisionState !== 'object') return [];
  if (decisionState.mode === 'no_score') return (decisionState.signals ?? []).map((item) => item.metric).filter(Boolean);
  if (decisionState.mode === 'composite') return (decisionState.model?.components ?? []).map((item) => item.metric).filter(Boolean);
  return [];
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

export function validateMetricRouting(manifest, decisionState) {
  const schemaResult = validateAgainstSchema(manifest, routingSchema);
  if (!schemaResult.valid) {
    return {
      valid: false,
      errors: schemaResult.errors.map((error) => ({
        code: 'ROUTING_SCHEMA_INVALID',
        path: error.instancePath,
        message: `${error.keyword}: ${error.message}`
      })),
      summary: null
    };
  }

  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: [{ code: 'ROUTING_MANIFEST_INVALID', path: '', message: 'routing manifest must be an object' }], summary: null };
  }

  if (typeof manifest.decision !== 'string' || manifest.decision.trim().length === 0) add(errors, 'DECISION_REQUIRED', '/decision', 'confirmed decision is required');
  if (typeof manifest.action !== 'string' || manifest.action.trim().length === 0) add(errors, 'ACTION_REQUIRED', '/action', 'confirmed action is required');
  if (!Number.isInteger(manifest.inventoryCount) || manifest.inventoryCount < 1 || manifest.inventoryCount > 200) add(errors, 'INVENTORY_COUNT_INVALID', '/inventoryCount', 'inventoryCount must be an integer from 1 to 200');
  if (!Array.isArray(manifest.metrics) || manifest.metrics.length === 0 || manifest.metrics.length > 200) {
    add(errors, 'ROUTING_METRICS_INVALID', '/metrics', 'metrics must contain 1 to 200 routing entries');
  }

  const metrics = Array.isArray(manifest.metrics) ? manifest.metrics : [];
  if (Number.isInteger(manifest.inventoryCount) && manifest.inventoryCount !== metrics.length) {
    add(errors, 'INVENTORY_COUNT_MISMATCH', '/inventoryCount', 'every extracted metric must have exactly one routing entry');
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
        const surface = resolvePointer(decisionState, item.surfacePath);
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
  if (primaries.length < 3) add(errors, 'PRIMARY_SIGNAL_MINIMUM_NOT_MET', '/metrics', 'the current deterministic renderer requires at least 3 primary signals');
  if (primaries.length > 6) add(errors, 'PRIMARY_SIGNAL_BUDGET_EXCEEDED', '/metrics', 'the first view may contain at most 6 primary signals');
  if (primaries.length + activeExceptions.length > 11) add(errors, 'FIRST_VIEW_BUDGET_EXCEEDED', '/metrics', 'first-view primary signals plus active exceptions exceed the current information budget');

  const explainable = new Set(metrics.filter((item) => item?.role === 'primary_signal' || item?.role === 'exception').map((item) => item.metric));
  for (const [index, item] of metrics.entries()) {
    if (item?.role === 'diagnostic' && typeof item.explains === 'string' && !explainable.has(item.explains)) {
      add(errors, 'DIAGNOSTIC_TARGET_INVALID', `/metrics/${index}/explains`, 'diagnostic must explain a routed primary signal or exception');
    }
  }

  const routedPrimaryIds = primaries.map((item) => item.metric);
  const renderedIds = visibleMetricIds(decisionState);
  if (!sameSet(routedPrimaryIds, renderedIds)) {
    add(errors, 'VISIBLE_PRIMARY_MISMATCH', '/metrics', 'rendered center metrics must exactly match the routed primary_signal set');
  }

  const summary = {
    inventoryCount: metrics.length,
    primaryCount: primaries.length,
    activeExceptionCount: activeExceptions.length,
    hiddenCount: metrics.length - primaries.length - activeExceptions.length,
    firstViewCount: primaries.length + activeExceptions.length
  };
  return { valid: errors.length === 0, errors, summary };
}
