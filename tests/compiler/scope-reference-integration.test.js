import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';

const worthiness = {
  version: '1.0',
  purpose: 'recurring_decision',
  decisionLoop: {
    status: 'confirmed',
    description: 'A monthly operating review determines where intervention is needed.'
  },
  accountability: {
    status: 'confirmed',
    mode: 'single_owner',
    description: 'The operating owner is accountable for the review.'
  },
  responseChange: {
    status: 'confirmed',
    kind: 'priority',
    description: 'Material changes alter operating priorities.'
  },
  recommendedFormat: 'dashboard'
};

const brief = {
  decision: { status: 'confirmed', value: 'Decide whether the current operating state requires intervention' },
  action: { status: 'confirmed', value: 'Prioritize the next operating follow-up' },
  cadence: { status: 'confirmed', value: 'Monthly review' },
  decisionLoop: { cadence: 'monthly' }
};

function invalidReferenceRouting() {
  return {
    decision: 'Decide whether the current operating state requires intervention',
    action: 'Prioritize the next operating follow-up',
    inventoryCount: 3,
    metrics: [
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
          denominatorMetricId: 'missing_total_products',
          calculation: { operator: 'ratio_percent', precision: 2 }
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
        metric: 'total_products',
        role: 'primary_signal',
        changesDecision: true,
        decisionImpact: 'Total products provide operating context',
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

const bundle = {
  decisionState: {
    mode: 'no_score',
    signals: [
      { metric: 'out_of_stock_products', label: 'Out of Stock Products', value: '453', provenance: 'source' },
      { metric: 'current_revenue', label: 'Current Revenue', value: '522,414.66', provenance: 'source' },
      { metric: 'total_products', label: 'Total Products', value: '3,731', provenance: 'source' }
    ]
  },
  evidence: [],
  claims: []
};

test('production compiler stops at the scope/reference gate before grounding', () => {
  const compiled = compileDecisionDashboard(worthiness, brief, invalidReferenceRouting(), bundle);

  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.stage, 'scope_reference');
  assert.equal(compiled.result.transition, 'FIX_SCOPE_REFERENCE_CONTEXT');
  assert.ok(compiled.result.errors.some((error) => error.code === 'REFERENCE_METRIC_NOT_FOUND'));
  assert.equal(compiled.html, null);
  assert.equal(compiled.svg, null);
});
