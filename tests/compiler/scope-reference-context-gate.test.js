import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema } from '../../skills/decision-first-dashboard/scripts/validate.js';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const decisionBriefSchema = JSON.parse(
  fs.readFileSync(path.join(root, 'skills/decision-first-dashboard/schemas/decision-brief.schema.json'), 'utf8')
);

function decisionBrief(cadence = 'monthly') {
  return {
    decision: { status: 'confirmed', value: 'Decide whether the current operating state requires intervention' },
    action: { status: 'confirmed', value: 'Prioritize the next operating follow-up' },
    cadence: { status: 'confirmed', value: 'Monthly review' },
    decisionLoop: { cadence }
  };
}

function routingManifest() {
  return {
    decision: 'Decide whether the current operating state requires intervention',
    action: 'Prioritize the next operating follow-up',
    inventoryCount: 5,
    metrics: [
      {
        metric: 'total_revenue',
        role: 'primary_signal',
        changesDecision: true,
        decisionImpact: 'Revenue level changes intervention priority',
        visibility: 'first_view',
        scope: {
          temporal: { kind: 'cumulative', unit: 'year', rangeStart: '2010', rangeEnd: '2013', isLatestPeriod: false },
          population: { kind: 'all' },
          aggregation: { kind: 'sum' }
        }
      },
      {
        metric: 'current_revenue',
        role: 'primary_signal',
        changesDecision: true,
        decisionImpact: 'Latest revenue changes intervention priority',
        visibility: 'first_view',
        scope: {
          temporal: { kind: 'period', unit: 'year', isLatestPeriod: true },
          population: { kind: 'all' },
          aggregation: { kind: 'sum' }
        }
      },
      {
        metric: 'out_of_stock_products',
        role: 'primary_signal',
        changesDecision: true,
        decisionImpact: 'Stockouts change replenishment priority',
        visibility: 'first_view',
        scope: {
          temporal: { kind: 'point', isLatestPeriod: true },
          population: { kind: 'all' },
          aggregation: { kind: 'count' }
        },
        referenceContext: {
          type: 'part_of_whole',
          provenance: 'compiler_derived',
          numeratorMetricId: 'out_of_stock_products',
          denominatorMetricId: 'total_products',
          calculation: { operator: 'ratio_percent', precision: 2 }
        }
      },
      {
        metric: 'out_of_stock_share',
        role: 'primary_signal',
        changesDecision: true,
        decisionImpact: 'Stockout share changes replenishment priority',
        visibility: 'first_view',
        scope: {
          temporal: { kind: 'point', isLatestPeriod: true },
          population: { kind: 'all' },
          aggregation: { kind: 'share' }
        },
        referenceContext: {
          type: 'part_of_whole',
          provenance: 'source_stated',
          value: 12.14,
          evidenceRef: 'ev_out_of_stock_share_value'
        }
      },
      {
        metric: 'total_products',
        role: 'primary_signal',
        changesDecision: true,
        decisionImpact: 'Total product population provides operating context',
        visibility: 'first_view',
        scope: {
          temporal: { kind: 'point', isLatestPeriod: true },
          population: { kind: 'all' },
          aggregation: { kind: 'count' }
        }
      }
    ]
  };
}

function groundedBundle() {
  return {
    decisionState: {
      mode: 'no_score',
      signals: [
        { metric: 'total_revenue', label: 'Total Revenue', value: '1,582,475.44', provenance: 'source' },
        { metric: 'current_revenue', label: 'Current Revenue', value: '522,414.66', provenance: 'source' },
        { metric: 'out_of_stock_products', label: 'Out of Stock Products', value: '453', provenance: 'source' },
        { metric: 'out_of_stock_share', label: 'Out of Stock Share', value: '12.14%', provenance: 'source' },
        { metric: 'total_products', label: 'Total Products', value: '3,731', provenance: 'source' }
      ]
    },
    evidence: [
      { id: 'ev_total_revenue_value' },
      { id: 'ev_current_revenue_value' },
      { id: 'ev_out_of_stock_products_value' },
      { id: 'ev_out_of_stock_share_value' },
      { id: 'ev_total_products_value' }
    ],
    claims: [
      { decisionPath: '/signals/0/value', evidenceRef: 'ev_total_revenue_value' },
      { decisionPath: '/signals/1/value', evidenceRef: 'ev_current_revenue_value' },
      { decisionPath: '/signals/2/value', evidenceRef: 'ev_out_of_stock_products_value' },
      { decisionPath: '/signals/3/value', evidenceRef: 'ev_out_of_stock_share_value' },
      { decisionPath: '/signals/4/value', evidenceRef: 'ev_total_products_value' }
    ]
  };
}

async function evaluate(brief = decisionBrief(), routing = routingManifest(), bundle = groundedBundle()) {
  const { evaluateScopeReferenceContext } = await import('../../skills/decision-first-dashboard/scripts/scope-reference.js');
  return evaluateScopeReferenceContext(brief, routing, bundle);
}

test('Decision Brief schema accepts a structured decision-loop cadence enum', () => {
  const result = validateAgainstSchema(decisionBrief('monthly'), decisionBriefSchema);
  assert.equal(result.valid, true, JSON.stringify(result.errors));

  const invalid = validateAgainstSchema(decisionBrief('whenever-it-feels-right'), decisionBriefSchema);
  assert.equal(invalid.valid, false);
});

test('monthly decision loop marks a multi-year cumulative primary metric hero-ineligible', async () => {
  const result = await evaluate();
  assert.equal(result.valid, true);
  assert.equal(result.summary.metrics.total_revenue.temporalCompatible, false);
  assert.equal(result.summary.metrics.total_revenue.heroEligible, false);
  assert.ok(result.summary.metrics.total_revenue.reasons.includes('MULTI_PERIOD_CUMULATIVE_CADENCE_MISMATCH'));
});

test('latest-period metric remains temporally compatible with a monthly decision loop', async () => {
  const result = await evaluate();
  assert.equal(result.valid, true);
  assert.equal(result.summary.metrics.current_revenue.temporalCompatible, true);
});

test('source-stated part-of-whole reference is hero-eligible only when its evidenceRef resolves', async () => {
  const result = await evaluate();
  assert.equal(result.valid, true);
  assert.equal(result.summary.metrics.out_of_stock_share.heroEligible, true);
  assert.deepEqual(result.summary.metrics.out_of_stock_share.referenceContext, {
    type: 'part_of_whole',
    provenance: 'source_stated',
    value: 12.14
  });
});

test('compiler-derived part-of-whole reference computes the share from grounded operands', async () => {
  const result = await evaluate();
  assert.equal(result.valid, true);
  assert.equal(result.summary.metrics.out_of_stock_products.heroEligible, true);
  assert.deepEqual(result.summary.metrics.out_of_stock_products.referenceContext, {
    type: 'part_of_whole',
    provenance: 'compiler_derived',
    value: 12.14,
    numeratorMetricId: 'out_of_stock_products',
    denominatorMetricId: 'total_products'
  });
});

test('compiler-derived reference fails closed when a referenced metric id does not exist', async () => {
  const routing = routingManifest();
  routing.metrics[2].referenceContext.denominatorMetricId = 'missing_total_products';
  const result = await evaluate(decisionBrief(), routing, groundedBundle());

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'REFERENCE_METRIC_NOT_FOUND'));
});

test('compiler-derived reference fails closed when an operand is not grounded', async () => {
  const bundle = groundedBundle();
  bundle.decisionState.signals[4].provenance = 'agent_inferred';
  bundle.claims = bundle.claims.filter((claim) => claim.decisionPath !== '/signals/4/value');
  const result = await evaluate(decisionBrief(), routingManifest(), bundle);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'REFERENCE_OPERAND_NOT_GROUNDED'));
});

test('compiler-derived reference fails closed when denominator is zero', async () => {
  const bundle = groundedBundle();
  bundle.decisionState.signals[4].value = '0';
  const result = await evaluate(decisionBrief(), routingManifest(), bundle);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'REFERENCE_DENOMINATOR_ZERO'));
});
