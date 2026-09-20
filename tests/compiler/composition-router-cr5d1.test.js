// CR-5d.1 Final: acceptance-cleanup regressions, test-only — no production
// behavior is introduced here.
// W-1 (delta audit) lives in the evidence record. This file locks:
// CONS-1 cross-region consistency for same metricKey + same explicit periodKey,
// CONS-2 PY vs explicit-year stay OUT_OF_CHECK_DOMAIN with fixture values intact,
// NOTE-1 the snapshot-inconsistency note is data-driven (swap payload, no renderer edit),
// NOTE-2 the note carries no severity framing,
// HDR (page header provenance controls) already covered in composition-router-cr5c.test.js.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { requiredRelationshipPaths } from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';
import { visibleTextOf } from './helpers/composition-signature.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const workforceDir = path.join(root, 'fixtures/workforce');
const worthiness = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/worthiness/dashboard.worthiness.json'), 'utf8'));

const alertFramingTerms = /\b(alert|alerts|attention|problem|problems|bad|critical|exception|exceptions|warning|breach|breaches|severity|error|wrong|needs attention)\b/i;
const evaluativeTerms = /\b(better|worse|favorable|unfavorable|good|positive|negative|concerning|alarming|improved|declined)\b/i;

// Same mirror as tests/compiler/composition-router-cr5c.test.js groundedCase.
function groundedCase(dir, fileName, { selections, decision, action, requirements = [], metrics, presentation = null, header = null }) {
  const bytes = fs.readFileSync(path.join(dir, fileName));
  const source = JSON.parse(bytes.toString('utf8'));
  const decisionState = {
    mode: 'no_score',
    signals: source.signals.map((signal) => ({ ...signal, provenance: 'source' })),
    ...(presentation ? { presentation } : {}),
    semanticNodes: source.semanticNodes.map((node, index) => ({
      id: selections[index].id,
      type: selections[index].type,
      title: node.title,
      ...(node.subtitle ? { subtitle: node.subtitle } : {}),
      ...(node.comparability ? { comparability: node.comparability } : {}),
      items: node.items.map((item) => ({ ...item, provenance: 'source' }))
    })),
    relationships: (source.relationships ?? []).map((relationship) => ({ ...relationship, provenance: 'source' }))
  };
  const evidence = [];
  const claims = [];
  const add = (decisionPath, sourcePath) => {
    const id = `ev_${evidence.length + 1}`;
    evidence.push({ id, anchor: { type: 'json_pointer', pointer: sourcePath } });
    claims.push({ decisionPath, evidenceRef: id });
  };
  decisionState.signals.forEach((signal, index) => {
    add(`/signals/${index}/label`, `/signals/${index}/label`);
    add(`/signals/${index}/value`, `/signals/${index}/value`);
  });
  decisionState.semanticNodes.forEach((node, nodeIndex) => {
    add(`/semanticNodes/${nodeIndex}/title`, `/semanticNodes/${nodeIndex}/title`);
    if (node.subtitle) add(`/semanticNodes/${nodeIndex}/subtitle`, `/semanticNodes/${nodeIndex}/subtitle`);
    node.items.forEach((item, itemIndex) => {
      add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/label`, `/semanticNodes/${nodeIndex}/items/${itemIndex}/label`);
      add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/value`, `/semanticNodes/${nodeIndex}/items/${itemIndex}/value`);
      if (item.detail) add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/detail`, `/semanticNodes/${nodeIndex}/items/${itemIndex}/detail`);
    });
  });
  requiredRelationshipPaths(decisionState).forEach((relationshipPath) => add(relationshipPath, relationshipPath));
  const brief = {
    decision: { status: 'confirmed', value: decision },
    action: { status: 'confirmed', value: action },
    questionShape: { status: 'confirmed', value: 'state' },
    actionShape: { status: 'confirmed', value: 'observe' },
    ...(header?.title ? { title: header.title } : {}),
    ...(header?.subtitle ? { subtitle: header.subtitle } : {}),
    contextRequirements: requirements
  };
  const routing = { decision, action, inventoryCount: metrics.length, metrics, compositionNodes: selections };
  const bundle = {
    source: { kind: 'json', path: fileName, sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
    decisionState,
    evidence,
    claims
  };
  return compileDecisionDashboard(worthiness, brief, routing, bundle, { baseDir: dir });
}

function primaryRoute(metric, label) {
  return { metric, role: 'primary_signal', changesDecision: true, decisionImpact: `${label} changes the current-state read.`, visibility: 'first_view' };
}

const WORKFORCE_FILE = 'workforce-reconstructed.source.json';
const WORKFORCE_DECISION = 'What is the current workforce state for the 2026 management review?';
const WORKFORCE_ACTION = 'Review the current state; no action is selected from this page';
const WORKFORCE_NODES = [
  { id: 'workforce_kpis', type: 'MetricCluster', presentation: 'comparison' },
  { id: 'headcount_trend', type: 'Trend', presentation: 'full_chart' },
  { id: 'department_headcount', type: 'Breakdown', presentation: 'full_breakdown' }
];
const WORKFORCE_PRESENTATION = {
  primaryMetrics: ['total_headcount', 'turnover_rate', 'training_completion'],
  heroMetric: 'total_headcount',
  supportingMetrics: [],
  scorecardMetrics: ['avg_appraisal']
};
const WORKFORCE_METRICS = [
  primaryRoute('total_headcount', 'Total headcount'),
  primaryRoute('turnover_rate', 'Turnover rate'),
  primaryRoute('training_completion', 'Training completion'),
  { metric: 'avg_appraisal', role: 'scorecard_only', changesDecision: false, visibility: 'scorecard' }
];
const WORKFORCE_REQUIREMENTS = [
  { id: 'ctx_department_headcount', type: 'decomposition', subject: 'department_headcount', minimumCoverage: 'full_breakdown', status: 'confirmed' }
];

function compileWorkforce(overrides = {}) {
  return groundedCase(workforceDir, WORKFORCE_FILE, {
    selections: WORKFORCE_NODES,
    decision: WORKFORCE_DECISION,
    action: WORKFORCE_ACTION,
    requirements: WORKFORCE_REQUIREMENTS,
    metrics: WORKFORCE_METRICS,
    presentation: WORKFORCE_PRESENTATION,
    ...overrides
  });
}

function regionSlice(html, nodeId) {
  const start = html.indexOf(`data-semantic-node="${nodeId}"`);
  assert.notEqual(start, -1, `region ${nodeId} missing`);
  const next = html.indexOf('<section', start);
  return html.slice(start, next === -1 ? html.length : next);
}

function kpiValue(slice, label) {
  return new RegExp(`<span>${label}</span><strong>([^<]*)</strong>`).exec(slice)?.[1];
}

function kpiDetail(slice, label) {
  return new RegExp(`<span>${label}</span><strong>[^<]*</strong><small>([^<]*)</small>`).exec(slice)?.[1];
}

function trendValueAt(slice, itemIndex) {
  const block = new RegExp(`data-item-index="${itemIndex}"[\\s\\S]*?class="trend-value">\\s*([^<\\s]+)`).exec(slice);
  return block?.[1];
}

function breakdownItems(slice) {
  return [...slice.matchAll(/<span>([^<]*)<\/span><b>([^<]*)<\/b>/g)].map(([, label, value]) => ({ label, value }));
}

// Generic rule under test: for one metricKey delivered by several regions under
// the SAME explicit periodKey, the delivered values must be equal. PY-labeled
// observations and explicit years are different period keys by construction
// and never enter this comparison (CONS-2).
function crossRegionValues(compiled, { periodKey }) {
  const kpi = kpiValue(regionSlice(compiled.html, 'workforce_kpis'), 'Total Headcount');
  const fixture = JSON.parse(fs.readFileSync(path.join(workforceDir, WORKFORCE_FILE), 'utf8'));
  const trendIndex = fixture.semanticNodes[1].items.findIndex((item) => String(item.label) === periodKey);
  const trend = trendIndex >= 0 ? trendValueAt(regionSlice(compiled.html, 'headcount_trend'), trendIndex) : undefined;
  const departments = breakdownItems(regionSlice(compiled.html, 'department_headcount'));
  const decompositionTotal = departments.reduce((sum, item) => sum + Number(item.value), 0);
  return { kpi, trend, decompositionTotal: String(decompositionTotal) };
}

test('CONS-1 same metricKey + same explicit periodKey across regions delivers equal values', () => {
  const compiled = compileWorkforce();
  assert.equal(compiled.result.transition, 'PASS');
  const reads = crossRegionValues(compiled, { periodKey: '2026' });
  assert.equal(reads.kpi, '189');
  assert.equal(reads.trend, '189');
  assert.equal(reads.decompositionTotal, '189');
  assert.equal(new Set(Object.values(reads)).size, 1, JSON.stringify(reads));
});

test('CONS-2 PY vs explicit year stay out of the check domain; fixture values are preserved untouched', () => {
  const fixtureText = fs.readFileSync(path.join(workforceDir, WORKFORCE_FILE), 'utf8');
  const fixture = JSON.parse(fixtureText);
  const kpiItems = fixture.semanticNodes[0].items;
  const trendItems = fixture.semanticNodes[1].items;
  assert.equal(kpiItems.find((item) => item.metric === 'total_headcount').detail, 'PY 172', 'fixture PY value must never be rewritten to satisfy a checker');
  assert.equal(trendItems.find((item) => item.label === '2025').value, 177, 'fixture explicit-year value must never be rewritten to satisfy a checker');
  const compiled = compileWorkforce();
  const visible = visibleTextOf({ html: compiled.html, svg: compiled.svg });
  assert.match(visible, /PY 172/);
  assert.match(visible, /\b177\b/);
  // The 2026-domain equality of CONS-1 holds WITHOUT consuming 172 or 177:
  const reads = crossRegionValues(compiled, { periodKey: '2026' });
  assert.ok(!Object.values(reads).includes('172') && !Object.values(reads).includes('177'));
});

test('NOTE-1 the snapshot-inconsistency note is parameterized data, not renderer copy', () => {
  const original = compileWorkforce();
  const originalNote = JSON.parse(fs.readFileSync(path.join(workforceDir, WORKFORCE_FILE), 'utf8')).semanticNodes[0].subtitle;
  assert.ok(original.html.includes(originalNote));
  const swappedNote = 'Source snapshot shows PY turnover 1.74% in the KPI and 1.81% for 2025 in the annual trend; the source does not reconcile them.';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr5d1-note-'));
  try {
    const swapped = JSON.parse(fs.readFileSync(path.join(workforceDir, WORKFORCE_FILE), 'utf8'));
    swapped.semanticNodes[0].subtitle = swappedNote;
    fs.writeFileSync(path.join(tmpDir, WORKFORCE_FILE), JSON.stringify(swapped, null, 2));
    const compiled = groundedCase(tmpDir, WORKFORCE_FILE, {
      selections: WORKFORCE_NODES,
      decision: WORKFORCE_DECISION,
      action: WORKFORCE_ACTION,
      requirements: WORKFORCE_REQUIREMENTS,
      metrics: WORKFORCE_METRICS,
      presentation: WORKFORCE_PRESENTATION
    });
    assert.equal(compiled.result.transition, 'PASS');
    const htmlVisible = visibleTextOf({ html: compiled.html });
    const svgVisible = visibleTextOf({ svg: compiled.svg });
    assert.ok(htmlVisible.includes(swappedNote) && svgVisible.includes(swappedNote), 'swapped payload must render without any renderer edit');
    assert.ok(!htmlVisible.includes(originalNote) && !svgVisible.includes(originalNote));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('NOTE-2 the integrity note is neutral secondary copy with no severity or evaluative framing', () => {
  const compiled = compileWorkforce();
  const note = JSON.parse(fs.readFileSync(path.join(workforceDir, WORKFORCE_FILE), 'utf8')).semanticNodes[0].subtitle;
  assert.equal(alertFramingTerms.test(note), false);
  assert.equal(evaluativeTerms.test(note), false);
  const visible = visibleTextOf({ html: compiled.html, svg: compiled.svg });
  assert.equal(alertFramingTerms.test(visible), false);
  assert.equal(evaluativeTerms.test(visible), false);
  // secondary presentation: the note rides the generic node-subtitle channel,
  // never a banner/alert class or dominant position.
  const kpiRegion = compiled.html.slice(compiled.html.indexOf('data-semantic-node="workforce_kpis"'));
  assert.equal(/class="[^"]*(banner|alert|warning|error|danger)[^"]*"/.test(kpiRegion), false);
  assert.match(kpiRegion, /class="[^"]*(subtitle|small|note|label)[^"]*"|<p>/i);
});
