import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMetricRouting } from '../../skills/decision-first-dashboard/scripts/routing.js';

function makeMetric(metric, role, extra = {}) {
  const base = {
    metric,
    role,
    changesDecision: role === 'primary_signal' || role === 'exception',
    visibility: role === 'primary_signal' || role === 'exception'
      ? 'first_view'
      : role === 'diagnostic'
        ? 'supporting'
        : role === 'drilldown'
          ? 'on_demand'
          : 'scorecard'
  };
  if (role === 'primary_signal' || role === 'exception') base.decisionImpact = `${metric} changes the decision`;
  if (role === 'exception') base.active = true;
  return { ...base, ...extra };
}

function make70() {
  const metrics = [
    makeMetric('m1', 'primary_signal'),
    makeMetric('m2', 'primary_signal'),
    makeMetric('m3', 'primary_signal'),
    makeMetric('m4', 'primary_signal'),
    makeMetric('m5', 'diagnostic', { explains: 'm1' }),
    makeMetric('m6', 'diagnostic', { explains: 'm2' }),
    makeMetric('m7', 'drilldown'),
    makeMetric('m8', 'drilldown')
  ];
  for (let i = 9; i <= 70; i++) metrics.push(makeMetric(`m${i}`, 'scorecard_only'));
  return {
    decision: 'Decide whether intervention is needed',
    action: 'Prioritize the next intervention',
    inventoryCount: 70,
    metrics
  };
}

function noScoreState(metrics = ['m1', 'm2', 'm3', 'm4'], supporting = ['m5', 'm6']) {
  const state = { mode: 'no_score', signals: metrics.map((metric) => ({ metric })) };
  if (supporting.length) state.supportingSignals = supporting.map((metric) => ({ metric }));
  return state;
}

test('accepts a 70-KPI inventory while keeping only a small primary set', () => {
  const result = validateMetricRouting(make70(), noScoreState());
  assert.equal(result.valid, true);
  assert.equal(result.summary.inventoryCount, 70);
  assert.equal(result.summary.primaryCount, 4);
  assert.equal(result.summary.supportingCount, 2);
  assert.equal(result.summary.hiddenCount, 64);
});

test('rejects KPI sprawl when too many metrics are promoted to first-view primary signals', () => {
  const manifest = make70();
  manifest.metrics = manifest.metrics.map((item) => ({
    ...item,
    role: 'primary_signal',
    changesDecision: true,
    decisionImpact: 'changes decision',
    visibility: 'first_view'
  }));
  const result = validateMetricRouting(manifest, noScoreState(manifest.metrics.map(({ metric }) => metric), []));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'PRIMARY_SIGNAL_BUDGET_EXCEEDED'));
});

test('Action Trigger Test rejects a primary signal that does not change a decision or action', () => {
  const manifest = make70();
  manifest.metrics[0].changesDecision = false;
  delete manifest.metrics[0].decisionImpact;
  const result = validateMetricRouting(manifest, noScoreState());
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'ACTION_TRIGGER_REQUIRED'));
});

test('active exceptions cannot be hidden to make the dashboard look healthier', () => {
  const manifest = make70();
  manifest.metrics[10] = makeMetric('m11', 'exception', { active: true, visibility: 'on_demand' });
  const result = validateMetricRouting(manifest, noScoreState());
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'ACTIVE_EXCEPTION_MUST_SURFACE'));
});

test('active exceptions must map to an actually rendered exception or event', () => {
  const manifest = make70();
  manifest.metrics[10] = makeMetric('m11', 'exception', { active: true, visibility: 'first_view' });
  const result = validateMetricRouting(manifest, noScoreState());
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'ACTIVE_EXCEPTION_NOT_SURFACED'));
});

test('diagnostics must explain a routed primary signal or exception', () => {
  const manifest = make70();
  manifest.metrics[4].explains = 'm70';
  const result = validateMetricRouting(manifest, noScoreState());
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'DIAGNOSTIC_TARGET_INVALID'));
});

test('preserve everything requires one routing entry per extracted metric', () => {
  const manifest = make70();
  manifest.metrics.pop();
  const result = validateMetricRouting(manifest, noScoreState());
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'INVENTORY_COUNT_MISMATCH'));
});

test('rendered center metrics must exactly match the routed primary signals', () => {
  const result = validateMetricRouting(make70(), noScoreState(['m1', 'm2', 'm3', 'm9']));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'VISIBLE_PRIMARY_MISMATCH'));
});

test('visible supporting metrics must exactly match routed supporting diagnostics', () => {
  const result = validateMetricRouting(make70(), noScoreState(['m1', 'm2', 'm3', 'm4'], ['m5']));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'VISIBLE_SUPPORTING_MISMATCH'));
});

test('supporting diagnostics have a four-item first-view budget instead of renderer truncation', () => {
  const manifest = make70();
  manifest.metrics[6] = makeMetric('m7', 'diagnostic', { explains: 'm1' });
  manifest.metrics[7] = makeMetric('m8', 'diagnostic', { explains: 'm2' });
  manifest.metrics[8] = makeMetric('m9', 'diagnostic', { explains: 'm3' });
  const result = validateMetricRouting(manifest, noScoreState(['m1', 'm2', 'm3', 'm4'], ['m5', 'm6', 'm7', 'm8', 'm9']));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'SUPPORTING_DIAGNOSTIC_BUDGET_EXCEEDED'));
});

test('a metric cannot appear as both primary and supporting context', () => {
  const result = validateMetricRouting(make70(), noScoreState(['m1', 'm2', 'm3', 'm4'], ['m5', 'm6', 'm1']));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'PRIMARY_SUPPORTING_OVERLAP'));
});

test('composite components use the same primary routing contract', () => {
  const manifest = make70();
  const result = validateMetricRouting(manifest, {
    mode: 'composite',
    model: { components: ['m1', 'm2', 'm3', 'm4'].map((metric) => ({ metric })) }
  });
  assert.equal(result.valid, true);
});

test('rejects unknown routing fields through the closed schema contract', () => {
  const manifest = make70();
  manifest.unexpected = 'not allowed';
  const result = validateMetricRouting(manifest, noScoreState());
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'ROUTING_SCHEMA_INVALID'));
});
