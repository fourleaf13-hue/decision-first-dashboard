import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { evaluateWorthinessAssessment } from '../../skills/decision-first-dashboard/scripts/worthiness.js';
import { sha256Object } from '../../skills/decision-first-dashboard/scripts/provenance.js';
import * as routing from '../../skills/decision-first-dashboard/scripts/routing.js';

const DECISION = 'Decide which operating signals need follow-up';
const ACTION = 'Prioritize the next owner response';

function dimension(description, status = 'inferred') {
  return { status, description };
}

function metricAssessment(metric, {
  status = 'inferred',
  source = 'screenshot',
  assumption = 'The owner uses this metric to decide what to do next.',
  responseKind = 'action',
  candidates,
  override
} = {}) {
  const result = {
    metric,
    status,
    source,
    whatChanges: dimension(`${metric} changes the operating picture.`),
    whoCares: dimension('The operating owner reviews this signal.'),
    responseChange: {
      ...dimension('A material change changes the next follow-up.', responseKind === 'none' ? 'absent' : 'inferred'),
      kind: responseKind
    }
  };
  if (assumption !== undefined) result.assumption = assumption;
  if (candidates) result.candidateAssumptions = candidates;
  if (override) result.override = override;
  return result;
}

function candidate(id, role, heroEligible, extra = {}) {
  return {
    id,
    assumption: `Assumption ${id}`,
    route: {
      role,
      heroEligible,
      visibility: role === 'primary_signal' ? 'first_view' : role === 'diagnostic' ? 'supporting' : 'scorecard',
      ...(role === 'primary_signal'
        ? { changesDecision: true, decisionImpact: 'This route changes the next operating action.' }
        : role === 'diagnostic'
          ? { changesDecision: false, explains: 'm1' }
          : { changesDecision: false }),
      ...extra
    }
  };
}

function metricRoute(metric, role, extra = {}) {
  const route = {
    metric,
    role,
    changesDecision: role === 'primary_signal',
    visibility: role === 'primary_signal' ? 'first_view' : role === 'diagnostic' ? 'supporting' : 'scorecard'
  };
  if (role === 'primary_signal') route.decisionImpact = `${metric} changes the next operating action.`;
  if (role === 'diagnostic') route.explains = 'm1';
  return { ...route, ...extra };
}

function manifestForMetrics(metrics) {
  return {
    decision: DECISION,
    action: ACTION,
    inventoryCount: metrics.length,
    metrics
  };
}

function noScoreState() {
  return {
    mode: 'no_score',
    signals: [1, 2, 3, 4].map((index) => ({
      metric: `m${index}`,
      label: `Metric ${index}`,
      value: `${index * 10}`,
      provenance: 'source'
    })),
    metricInventory: [{
      metric: 'm5',
      label: 'Compliance rate',
      value: '98%',
      provenance: 'source'
    }]
  };
}

function worthinessAssessment(metricWorthiness, questionCount = 0) {
  return {
    version: '1.0',
    purpose: 'recurring_decision',
    questionCount,
    decisionLoop: { status: 'confirmed', description: 'Weekly operating review.' },
    accountability: { status: 'confirmed', mode: 'single_owner', description: 'The operations owner.' },
    responseChange: { status: 'confirmed', kind: 'priority', description: 'Prioritize the next follow-up.' },
    recommendedFormat: 'dashboard',
    metricWorthiness
  };
}

function brief(questionCount = 0) {
  return {
    questionCount,
    decision: { status: 'confirmed', value: DECISION },
    action: { status: 'confirmed', value: ACTION }
  };
}

function groundedBundle(state) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metric-worthiness-'));
  const sourceValue = { metrics: {} };
  const evidence = [];
  const claims = [];
  const fields = [];
  const addMetric = (metric, decisionPath, item) => {
    sourceValue.metrics[metric] = { label: item.label, value: item.value };
    for (const field of ['label', 'value']) {
      const evidenceId = `ev_${metric}_${field}`;
      evidence.push({
        id: evidenceId,
        anchor: {
          type: 'json_pointer',
          pointer: `/metrics/${metric}/${field}`
        }
      });
      claims.push({
        decisionPath: `${decisionPath}/${field}`,
        evidenceRef: evidenceId
      });
    }
  };

  state.signals.forEach((item, index) => addMetric(item.metric, `/signals/${index}`, item));
  state.metricInventory?.forEach((item, index) => addMetric(item.metric, `/metricInventory/${index}`, item));
  const sourcePath = path.join(root, 'source.json');
  const bytes = Buffer.from(`${JSON.stringify(sourceValue, null, 2)}\n`);
  fs.writeFileSync(sourcePath, bytes);
  return {
    root,
    bundle: {
      source: {
        kind: 'json',
        path: 'source.json',
        sha256: crypto.createHash('sha256').update(bytes).digest('hex')
      },
      decisionState: state,
      evidence,
      claims
    }
  };
}

function compileWith(metricWorthiness, { demote = false } = {}) {
  const state = noScoreState();
  const routes = manifestForMetrics([
    metricRoute('m1', 'primary_signal'),
    metricRoute('m2', 'primary_signal'),
    metricRoute('m3', 'primary_signal'),
    metricRoute('m4', 'primary_signal'),
    metricRoute('m5', demote ? 'primary_signal' : 'scorecard_only')
  ]);
  const grounded = groundedBundle(state);
  return compileDecisionDashboard(
    worthinessAssessment(metricWorthiness),
    brief(),
    routes,
    grounded.bundle,
    { baseDir: grounded.root }
  );
}

test('worthiness contract accepts typed metric-level assessments and preserves inferred state', () => {
  const assessment = worthinessAssessment([metricAssessment('m5')]);
  const result = evaluateWorthinessAssessment(assessment);
  assert.equal(result.valid, true);
  assert.equal(result.metricWorthinessSummary.count, 1);
  assert.equal(result.metricWorthinessSummary.inferredCount, 1);
});

test('same-route candidate assumptions do not ask a question', () => {
  const assessment = metricAssessment('m5', {
    candidates: [candidate('owner_action_a', 'primary_signal', true), candidate('owner_action_b', 'primary_signal', true)]
  });
  const result = routing.evaluateMetricWorthinessSet([assessment], manifestForMetrics([metricRoute('m5', 'primary_signal')]));
  assert.equal(result.valid, true);
  assert.equal(result.transition, 'PASS');
  assert.equal(result.materialAmbiguityCount, 0);
});

test('different non-hero route classes do not ask a question', () => {
  const assessment = metricAssessment('m5', {
    candidates: [candidate('diagnostic_slice', 'diagnostic', false), candidate('compliance_register', 'scorecard_only', false)]
  });
  const result = routing.evaluateMetricWorthinessSet([assessment], manifestForMetrics([metricRoute('m5', 'diagnostic')]));
  assert.equal(result.valid, true);
  assert.equal(result.transition, 'PASS');
  assert.equal(result.materialAmbiguityCount, 0);
});

test('primary versus diagnostic candidate routing creates material ambiguity mechanically', () => {
  const assessment = metricAssessment('m5', {
    candidates: [candidate('owner_action', 'primary_signal', true), candidate('monitoring_only', 'diagnostic', false)]
  });
  const result = routing.evaluateMetricWorthinessSet([assessment], manifestForMetrics([metricRoute('m5', 'primary_signal')]));
  assert.equal(result.valid, true);
  assert.equal(result.transition, 'ASK_METRIC_WORTHINESS_QUESTION');
  assert.equal(result.materialAmbiguityCount, 1);
  assert.equal(result.questionCount, 1);
  assert.equal(result.details[0].uniqueRouteOutcomeCount, 2);
  assert.equal(result.details[0].primarySignalDiverges, true);
  assert.equal(result.details[0].heroEligibilityDiverges, true);
});

test('70 KPI inference adds no per-metric questions and stays inside the shared five-question budget', () => {
  const assessments = Array.from({ length: 70 }, (_, index) => metricAssessment(`m${index + 1}`, {
    source: 'label',
    assumption: undefined,
    responseKind: index < 4 ? 'action' : 'monitoring'
  }));
  const result = routing.evaluateMetricWorthinessSet(
    assessments,
    manifestForMetrics(assessments.map((item, index) => metricRoute(item.metric, index < 4 ? 'primary_signal' : 'scorecard_only'))),
    { existingQuestionCount: 4 }
  );
  assert.equal(result.valid, true);
  assert.equal(result.questionCount, 4);
  assert.equal(result.questionCount <= 5, true);
  assert.equal(result.details.length, 70);
});

test('screenshot-only assumptions are recorded as inferred without automatically asking', () => {
  const assessment = metricAssessment('m5', { source: 'screenshot', responseKind: 'monitoring' });
  const worthiness = evaluateWorthinessAssessment(worthinessAssessment([assessment]));
  const routes = routing.evaluateMetricWorthinessSet([assessment], manifestForMetrics([metricRoute('m5', 'primary_signal')]));
  assert.equal(worthiness.valid, true);
  assert.equal(worthiness.metricWorthinessSummary.assumptionsRecorded, 1);
  assert.equal(routes.transition, 'PASS');
});

test('monitoring/compliance demotion preserves the metric as a scorecard presentation', () => {
  const result = compileWith([metricAssessment('m5', { responseKind: 'monitoring' })], { demote: true });
  assert.equal(result.result.transition, 'PASS');
  assert.equal(result.result.routingSummary.primaryCount, 4);
  assert.equal(result.effectiveRoutingManifest?.metrics?.find((item) => item.metric === 'm5')?.role, 'scorecard_only');
  assert.equal(result.manifest.routingManifestSha256, sha256Object(result.effectiveRoutingManifest));
  assert.equal(result.manifest.decisionStateSha256, sha256Object(result.effectiveDecisionState));
  assert.ok(result.html.includes('data-metric="m5"'));
  assert.match(result.html, /data-metric="m5"[^>]*data-role="scorecard_only"/);
  assert.match(result.svg, /data-metric="m5"[^>]*data-role="scorecard_only"/);
});

test('diagnostic override promotes the metric into the canonical HTML/SVG hero', () => {
  const override = {
    role: 'primary_signal',
    heroEligible: true,
    visibility: 'first_view',
    changesDecision: true,
    decisionImpact: 'Compliance changes the next operating action.'
  };
  const result = compileWith([metricAssessment('m5', { responseKind: 'monitoring', status: 'overridden', override })]);
  assert.equal(result.result.transition, 'PASS');
  assert.equal(result.result.routingSummary.primaryCount, 5);
  assert.equal(result.result.metricWorthiness.details[0].chosenRoute.role, 'primary_signal');
  assert.match(result.html, /data-metric="m5"[^>]*data-role="primary_signal"[^>]*data-presentation="hero"/);
  assert.match(result.svg, /data-metric="m5"[^>]*data-role="primary_signal"[^>]*data-presentation="hero"/);
});

test('primary override demotes the old hero and leaves a non-hero canonical marker', () => {
  const override = {
    role: 'scorecard_only',
    heroEligible: false,
    visibility: 'scorecard',
    changesDecision: false
  };
  const result = compileWith([metricAssessment('m1', { status: 'overridden', override })]);
  assert.equal(result.result.transition, 'PASS');
  assert.equal(result.result.routingSummary.primaryCount, 3);
  assert.doesNotMatch(result.html, /data-metric="m1"[^>]*data-presentation="hero"/);
  assert.doesNotMatch(result.svg, /data-metric="m1"[^>]*data-presentation="hero"/);
  assert.match(result.html, /data-metric="m1"[^>]*data-role="scorecard_only"[^>]*data-presentation="scorecard"/);
  assert.match(result.svg, /data-metric="m1"[^>]*data-role="scorecard_only"[^>]*data-presentation="scorecard"/);
});

test('metric clarification consumes at most one shared question even with multiple ambiguous metrics', () => {
  const assessments = ['m1', 'm2', 'm3'].map((metric) => metricAssessment(metric, {
    candidates: [candidate(`${metric}_primary`, 'primary_signal', true), candidate(`${metric}_diagnostic`, 'diagnostic', false)]
  }));
  const result = routing.evaluateMetricWorthinessSet(
    assessments,
    manifestForMetrics(assessments.map((item) => metricRoute(item.metric, 'primary_signal'))),
    { existingQuestionCount: 4 }
  );
  assert.equal(result.valid, true);
  assert.equal(result.questionCount, 5);
  assert.equal(result.transition, 'ASK_METRIC_WORTHINESS_QUESTION');
});

test('shared question budget rejects a metric clarification after five questions are already used', () => {
  const assessment = metricAssessment('m1', {
    candidates: [candidate('primary', 'primary_signal', true), candidate('diagnostic', 'diagnostic', false)]
  });
  const result = routing.evaluateMetricWorthinessSet(
    [assessment],
    manifestForMetrics([metricRoute('m1', 'primary_signal')]),
    { existingQuestionCount: 5 }
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'QUESTION_BUDGET_EXCEEDED'));
});
