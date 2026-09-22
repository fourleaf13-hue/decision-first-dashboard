// Visual Encoding Router (VER) v1 contract tests — the first implementation
// slice of the existing post-CR-5 VER specification. These lock the three
// grounded encodings (bullet_target, waterfall, ranked_bar), the fail-closed
// eligibility + non-silent fallback contract, the delivered-encoding geometry
// verifier (including mutation detection), and the survival of non-encoding
// pages (Workforce / SaaS) plus the copy firewall.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { verifyDeliveredArtifact } from '../../skills/decision-first-dashboard/scripts/composition.js';
import { requiredRelationshipPaths } from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';
import {
  ADDITIVE_CONTRACT_TOLERANCE,
  GROUNDED_RANKING_MAX_CANDIDATES
} from '../../skills/decision-first-dashboard/scripts/encoding-contracts.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const adaptiveDir = path.join(root, 'fixtures/adaptive-composition');
const workforceDir = path.join(root, 'fixtures/workforce');
const syntheticDir = path.join(root, 'fixtures/cr5c-synthetic');
const worthiness = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/worthiness/dashboard.worthiness.json'), 'utf8'));

// Harness identical to tests/compiler/composition-router-vp.test.js groundedCase,
// with the signal_${i+1} metric naming used by that file's ceoMonitor.
function groundedCase(dir, fileName, { selections, decision, action, requirements = [], metrics, presentation = null, decorateState = null, nameSignals = false }) {
  const bytes = fs.readFileSync(path.join(dir, fileName));
  const source = JSON.parse(bytes.toString('utf8'));
  const decisionState = {
    mode: 'no_score',
    signals: source.signals.map((signal, index) => (nameSignals
      ? { metric: `signal_${index + 1}`, ...signal, provenance: 'source' }
      : { ...signal, provenance: 'source' })),
    ...(presentation ? { presentation } : {}),
    ...((source.exceptions ?? []).length > 0 ? { exceptions: source.exceptions.map((entry) => ({ ...entry, provenance: 'source' })) } : {}),
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
  if (decorateState) decorateState(decisionState);
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
  (decisionState.exceptions ?? []).forEach((entry, index) => {
    for (const key of Object.keys(entry)) {
      if (key === 'provenance') continue;
      add(`/exceptions/${index}/${key}`, `/exceptions/${index}/${key}`);
    }
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
    contextRequirements: requirements
  };
  const routing = {
    decision,
    action,
    inventoryCount: metrics.length,
    metrics,
    compositionNodes: selections
  };
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

// ------------------------------------------------------------- CEO encoding page

const CEO_DECISION = 'Are we operating within the declared bounds this quarter?';
const CEO_ACTION = 'Review the current state; escalate only when a declared bound is crossed';

const CEO_BASE_REQUIREMENTS = [
  { id: 'ctx_revenue_target', type: 'target_reference', subject: 'revenue_target', minimumCoverage: 'target_and_gap', status: 'confirmed' },
  { id: 'ctx_gap_attribution', type: 'gap_attribution', subject: 'gap_attribution', minimumCoverage: 'full_breakdown', status: 'inferred' },
  { id: 'ctx_top_accounts', type: 'contributor_comparison', subject: 'top_accounts', minimumCoverage: 'contributors', status: 'inferred' }
];

const ENCODING_FILE = 'ceo-sales-encoding.source.json';
const BROKEN_FILE = 'ceo-sales-encoding-broken.source.json';

const FULL_PAGE = [
  { id: 'revenue_target', type: 'Relationship', presentation: 'bullet_target' },
  { id: 'gap_attribution', type: 'Breakdown', presentation: 'waterfall' },
  { id: 'top_accounts', type: 'Ranking', presentation: 'full_ranking' }
];

function ceoCase({ file = ENCODING_FILE, selections, requirements = CEO_BASE_REQUIREMENTS, decorateState = null } = {}) {
  const bytes = fs.readFileSync(path.join(adaptiveDir, file));
  const source = JSON.parse(bytes.toString('utf8'));
  const metrics = source.signals.map((signal, index) => primaryRoute(`signal_${index + 1}`, signal.label));
  return groundedCase(adaptiveDir, file, {
    selections,
    decision: CEO_DECISION,
    action: CEO_ACTION,
    requirements,
    metrics,
    decorateState,
    nameSignals: true
  });
}

function deliveryNode(compiled, id) {
  const node = (compiled.manifest?.delivery?.nodes ?? []).find((entry) => entry.id === id);
  assert.ok(node, `delivery manifest is missing node ${id}`);
  return node;
}

function encodingOf(compiled, id) {
  const encoding = deliveryNode(compiled, id).encoding;
  assert.ok(encoding, `node ${id} carries no encoding decision trace`);
  return encoding;
}

function assertCompiled(compiled) {
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  assert.equal(compiled.result.transition, 'PASS');
  return compiled;
}

function mismatches(errors, fragment = null) {
  const hit = errors.filter((entry) => entry.code === 'DELIVERED_ENCODING_GEOMETRY_MISMATCH');
  assert.ok(hit.length > 0, `expected a delivered encoding geometry mismatch, got ${JSON.stringify(errors)}`);
  if (fragment) {
    assert.ok(
      hit.some((entry) => `${entry.path} ${entry.message}`.includes(fragment)),
      `expected mismatch about "${fragment}", got ${JSON.stringify(hit.map((entry) => [entry.path, entry.message]))}`
    );
  }
  return hit;
}

function fallbackEntry(compiled, reasonCode) {
  const entry = (compiled.manifest.delivery.decisionLog ?? []).find((candidate) => candidate.reasonCode === reasonCode);
  assert.ok(entry, `the fallback (${reasonCode}) must be logged, not silent`);
  assert.equal(entry.decision, 'retain_full');
  return entry;
}

function encodingFallbackEntries(compiled) {
  return (compiled.manifest.delivery.decisionLog ?? []).filter((entry) =>
    /^(BULLET|WATERFALL|RANKING)_/.test(String(entry.reasonCode))
  );
}

// ------------------------------------------------------------- VER-1 bullet_target

test('VER-1 bullet_target: a fully grounded target is honored and drawn as actual bar + target marker + gap annotation', () => {
  const compiled = assertCompiled(ceoCase({ selections: FULL_PAGE }));
  const node = deliveryNode(compiled, 'revenue_target');
  assert.equal(node.presentation, 'bullet_target');
  assert.equal(node.structure, 'target-bullet');

  const encoding = encodingOf(compiled, 'revenue_target');
  assert.equal(encoding.requestedEncoding, 'bullet_target');
  assert.equal(encoding.selectedEncoding, 'bullet_target');
  assert.ok(encoding.eligibleEncodings.includes('bullet_target'));
  assert.deepEqual(encoding.rejected, []);

  const bullet = node.visualSpec.bullet;
  assert.equal(bullet.mapType, 'linear');
  assert.deepEqual([...bullet.valueDomain], [0, 6]);
  assert.equal(bullet.actual, 4.98);
  assert.equal(bullet.target, 6);
  assert.equal(bullet.gap, 1.02);
  assert.equal(bullet.direction, 'below');

  // The delivered contract is a bar, a marker, and a neutral annotation —
  // never three parallel bars.
  assert.match(compiled.html, /data-visual-mark-item="bullet-actual"[^>]*style="--value:83\.0%"/);
  assert.match(compiled.html, /data-visual-marker="target" style="--at:100\.0%"/);
  assert.match(compiled.html, /data-visual-annotation="gap"/);
  assert.doesNotMatch(compiled.html, /data-visual-geometry="gap-bars"/);
  assert.match(compiled.svg, /data-visual-mark-item="bullet-actual"/);
  assert.match(compiled.svg, /data-visual-marker="target"/);
  assert.match(compiled.svg, /data-visual-annotation="gap"/);
  assert.match(compiled.svg, /data-encoding-track="true" data-semantic-node="revenue_target"/);

  // Independent re-derivation of the declared map must agree with the drawing.
  assert.deepEqual(verifyDeliveredArtifact({ html: compiled.html, svg: compiled.svg, manifest: compiled.manifest }).errors
    .filter((error) => error.code.startsWith('DELIVERED_ENCODING')), []);
});

test('VER-1 bullet_target: a moved target marker fails the delivered geometry verifier in HTML and in SVG', () => {
  const compiled = assertCompiled(ceoCase({ selections: FULL_PAGE }));
  const delivery = compiled.manifest;

  const cleanErrors = verifyDeliveredArtifact({ html: compiled.html, svg: compiled.svg, manifest: delivery }).errors;
  assert.equal(cleanErrors.filter((error) => error.code.startsWith('DELIVERED_ENCODING')).length, 0);

  const htmlMutated = compiled.html.replace(/(data-visual-marker="target" style="--at:)[0-9.]+%/, '$170.0%');
  assert.notEqual(htmlMutated, compiled.html, 'mutation target not found in HTML');
  mismatches(verifyDeliveredArtifact({ html: htmlMutated, svg: compiled.svg, manifest: delivery }).errors, 'target marker');

  const svgMutated = compiled.svg.replace(/(<rect data-visual-marker="target" x=")[0-9.]+/, '$1123.4');
  assert.notEqual(svgMutated, compiled.svg, 'mutation target not found in SVG');
  mismatches(verifyDeliveredArtifact({ html: compiled.html, svg: svgMutated, manifest: delivery }).errors, 'target marker');
});

test('VER-1 bullet_target: an unconfirmed target_reference requirement falls back to full_chart with a logged reason', () => {
  const requirements = CEO_BASE_REQUIREMENTS.map((entry) =>
    entry.id === 'ctx_revenue_target' ? { ...entry, status: 'inferred' } : entry
  );
  const compiled = assertCompiled(ceoCase({
    file: 'ceo-sales.source.json',
    selections: [
      { id: 'revenue_target', type: 'Relationship', presentation: 'bullet_target' },
      { id: 'gap_attribution', type: 'Breakdown', presentation: 'full_breakdown' },
      { id: 'top_accounts', type: 'Ranking', presentation: 'both_ends' }
    ],
    requirements
  }));
  const node = deliveryNode(compiled, 'revenue_target');
  assert.equal(node.presentation, 'full_chart');
  assert.ok(!node.visualSpec.bullet);

  const encoding = encodingOf(compiled, 'revenue_target');
  assert.equal(encoding.requestedEncoding, 'bullet_target');
  assert.equal(encoding.selectedEncoding, 'full_chart');
  assert.ok(encoding.rejected.some((entry) => entry.reasonCode === 'BULLET_INELIGIBLE_REQUIREMENT_UNCONFIRMED'));

  fallbackEntry(compiled, 'BULLET_INELIGIBLE_REQUIREMENT_UNCONFIRMED');
});

// ------------------------------------------------------------- VER-2 waterfall

test('VER-2 waterfall: a grounded additive_path renders a reconciling segment chain and passes the verifier', () => {
  const compiled = assertCompiled(ceoCase({ selections: FULL_PAGE }));
  const node = deliveryNode(compiled, 'gap_attribution');
  assert.equal(node.presentation, 'waterfall');
  assert.equal(node.structure, 'additive-path');

  const encoding = encodingOf(compiled, 'gap_attribution');
  assert.equal(encoding.requestedEncoding, 'waterfall');
  assert.equal(encoding.selectedEncoding, 'waterfall');
  assert.ok(encoding.eligibleEncodings.includes('waterfall'));
  assert.deepEqual(encoding.rejected, []);

  const waterfall = node.visualSpec.waterfall;
  assert.equal(waterfall.mapType, 'linear');
  assert.equal(waterfall.relationshipRef, 'gap_path');
  assert.deepEqual([...waterfall.valueDomain], [0, 6]);
  assert.equal(waterfall.startRef, 'Annual target');
  assert.equal(waterfall.endRef, 'Actual revenue');
  assert.equal(waterfall.startDisplay, '$6.00M');
  assert.equal(waterfall.endDisplay, '$4.98M');

  const labels = ['New business shortfall', 'Expansion shortfall', 'Churn impact'];
  const cumulative = [6, 5.45, 5.14, 4.98];
  assert.equal(waterfall.segments.length, 3);
  waterfall.segments.forEach((segment, index) => {
    assert.equal(segment.memberRef, labels[index]);
    assert.equal(segment.sign, 'minus');
    // startValue + Σsigned(members) must reconcile segment-by-segment.
    assert.ok(Math.abs(segment.cumulativeBefore - cumulative[index]) < 1e-9);
    assert.ok(Math.abs(segment.cumulativeAfter - cumulative[index + 1]) < 1e-9);
  });

  assert.match(compiled.html, /data-waterfall-endpoint="start"/);
  assert.match(compiled.html, /data-waterfall-endpoint="end"/);
  assert.equal((compiled.html.match(/<i class="waterfall-bar waterfall-segment" data-visual-mark-item="waterfall-segment"/g) ?? []).length, 3);
  assert.equal((compiled.html.match(/data-visual-connector="true"/g) ?? []).length, 4);
  assert.equal((compiled.html.match(/class="waterfall-bar waterfall-total-bar"/g) ?? []).length, 2);
  assert.doesNotMatch(compiled.html, /class="visual-bar waterfall-segment"/);
  assert.equal((compiled.svg.match(/<rect data-visual-mark-item="waterfall-segment" data-segment-index=/g) ?? []).length, 3);
  assert.equal((compiled.svg.match(/<line data-visual-connector="true"/g) ?? []).length, 4);
  assert.equal((compiled.svg.match(/<rect data-waterfall-total=/g) ?? []).length, 2);
  assert.match(compiled.svg, /<line data-encoding-axis="true" data-semantic-node="gap_attribution"/);
  assert.match(compiled.svg, /data-encoding-track="true" data-semantic-node="gap_attribution"/);
});

test('VER-2 waterfall: W1-W4 mutations of the delivered bridge fail the verifier in HTML and in SVG', () => {
  const compiled = assertCompiled(ceoCase({ selections: FULL_PAGE }));
  const delivery = compiled.manifest;
  const deliveredErrors = ({ html, svg }) => verifyDeliveredArtifact({ html, svg, manifest: delivery }).errors;

  // W1 — move a floating segment's start (its bottom edge in HTML, its
  // bottom-anchored offset; in SVG the rect y marks the junction edge for a
  // minus segment).
  const w1Html = compiled.html.replace(/(data-segment-index="0" style="--offset:)[0-9.]+%/, '$150.0%');
  assert.notEqual(w1Html, compiled.html, 'W1 target not found in HTML');
  mismatches(deliveredErrors({ html: w1Html, svg: compiled.svg }), '/segments/0');
  const w1Svg = compiled.svg.replace(/(<rect data-visual-mark-item="waterfall-segment" data-segment-index="0" x="[0-9.]+" y=")[0-9.]+/, '$1999.9');
  assert.notEqual(w1Svg, compiled.svg, 'W1 target not found in SVG');
  mismatches(deliveredErrors({ html: compiled.html, svg: w1Svg }), '/segments/0');

  // W2 — move a segment's end (its drawn height/width).
  const w2Html = compiled.html.replace(/(data-segment-index="1" style="--offset:[0-9.]+%;--value:)[0-9.]+%/, '$140.0%');
  assert.notEqual(w2Html, compiled.html, 'W2 target not found in HTML');
  mismatches(deliveredErrors({ html: w2Html, svg: compiled.svg }), '/segments/1');
  const w2Svg = compiled.svg.replace(/(<rect data-visual-mark-item="waterfall-segment" data-segment-index="1"[^>]*height=")[0-9.]+/, '$199.9');
  assert.notEqual(w2Svg, compiled.svg, 'W2 target not found in SVG');
  mismatches(deliveredErrors({ html: compiled.html, svg: w2Svg }), '/segments/1');

  // W3 — break staircase continuity: slide a junction connector away from the
  // cumulative level it must bridge (bars untouched).
  const w3Html = compiled.html.replace(/(data-connector-index="1" style="--at:)[0-9.]+%/, '$145.0%');
  assert.notEqual(w3Html, compiled.html, 'W3 target not found in HTML');
  mismatches(deliveredErrors({ html: w3Html, svg: compiled.svg }), '/segments/1');
  const w3Svg = compiled.svg.replace(/(<line data-visual-connector="true" data-connector-index="2" x1="[0-9.]+" y1=")[0-9.]+/, '$1999.9');
  assert.notEqual(w3Svg, compiled.svg, 'W3 target not found in SVG');
  mismatches(deliveredErrors({ html: compiled.html, svg: w3Svg }), '/segments/2');

  // W4 — move the final actual total (the end anchored bar).
  const w4Html = compiled.html.replace(/(data-waterfall-total="end" style="--height:)[0-9.]+%/, '$160.0%');
  assert.notEqual(w4Html, compiled.html, 'W4 target not found in HTML');
  mismatches(deliveredErrors({ html: w4Html, svg: compiled.svg }), 'end total');
  const w4Svg = compiled.svg.replace(/(<rect data-waterfall-total="end" x="[0-9.]+" y=")[0-9.]+/, '$1999.9');
  assert.notEqual(w4Svg, compiled.svg, 'W4 target not found in SVG');
  mismatches(deliveredErrors({ html: compiled.html, svg: w4Svg }), 'end total');
});

test('VER-2 waterfall: a declared path that does not reconcile falls back to full_breakdown with a logged reason', () => {
  // The broken fixture moves Churn impact to $0.30M: 6.00 − 0.55 − 0.31 − 0.30
  // = 4.84 drifts from the grounded end value $4.98M beyond the frozen
  // ADDITIVE_CONTRACT_TOLERANCE — numeric grounding, not numeric closeness.
  const drift = Math.abs((6 - 0.55 - 0.31 - 0.3) - 4.98);
  assert.ok(drift > Math.max(4.98 * ADDITIVE_CONTRACT_TOLERANCE.relativeFactor, ADDITIVE_CONTRACT_TOLERANCE.absoluteFloor));

  const compiled = assertCompiled(ceoCase({
    file: BROKEN_FILE,
    selections: FULL_PAGE.map((entry) =>
      entry.id === 'top_accounts' ? { ...entry, presentation: 'both_ends' } : entry
    )
  }));
  const node = deliveryNode(compiled, 'gap_attribution');
  assert.equal(node.presentation, 'full_breakdown');
  assert.ok(!node.visualSpec.waterfall);
  assert.doesNotMatch(compiled.html, /data-visual-geometry="waterfall-segments"/);

  const encoding = encodingOf(compiled, 'gap_attribution');
  assert.equal(encoding.requestedEncoding, 'waterfall');
  assert.equal(encoding.selectedEncoding, 'full_breakdown');
  assert.ok(encoding.rejected.some((entry) => entry.reasonCode === 'WATERFALL_INELIGIBLE_ADDITIVE_CONTRACT_FAILED'));

  fallbackEntry(compiled, 'WATERFALL_INELIGIBLE_ADDITIVE_CONTRACT_FAILED');
});

// ------------------------------------------------------------- VER-3 ranked_bar

test('VER-3 ranking: dense source rank ordinals ground the delivered order and the small set shows every candidate', () => {
  const compiled = assertCompiled(ceoCase({ selections: FULL_PAGE }));
  assert.ok(3 <= GROUNDED_RANKING_MAX_CANDIDATES);
  const node = deliveryNode(compiled, 'top_accounts');
  assert.equal(node.presentation, 'full_ranking');
  assert.equal(node.expectedItemCount, 3);

  const encoding = encodingOf(compiled, 'top_accounts');
  assert.ok(encoding.eligibleEncodings.includes('ranked_bar'));
  assert.ok(!encoding.rejected.some((entry) => entry.reasonCode === 'RANKING_ORDER_NOT_GROUNDED'));

  const ranking = node.visualSpec.ranking;
  assert.equal(ranking.basis, 'source_rank_ordinals');
  assert.equal(ranking.direction, 'delivered_order');
  assert.deepEqual([...ranking.candidateValues], [0.24, 0.18, 0.13]);

  for (const label of ['Northstar Health', 'Copper Labs', 'Pilgrim Retail']) {
    assert.ok(compiled.html.includes(label), `full_ranking must show every candidate, missing ${label}`);
  }
});

test('VER-3 ranking: both_ends on a small candidate set without a ranking_span license is rewritten to full_ranking and logged', () => {
  const compiled = assertCompiled(ceoCase({
    selections: FULL_PAGE.map((entry) =>
      entry.id === 'top_accounts' ? { ...entry, presentation: 'both_ends' } : entry
    )
  }));
  const node = deliveryNode(compiled, 'top_accounts');
  assert.equal(node.presentation, 'full_ranking');

  const encoding = encodingOf(compiled, 'top_accounts');
  assert.equal(encoding.requestedEncoding, 'both_ends');
  assert.equal(encoding.selectedEncoding, 'full_ranking');
  assert.ok(encoding.rejected.some((entry) => entry.reasonCode === 'RANKING_EXTREMES_NOT_GROUNDED'));

  fallbackEntry(compiled, 'RANKING_EXTREMES_NOT_GROUNDED');

  for (const label of ['Northstar Health', 'Copper Labs', 'Pilgrim Retail']) {
    assert.ok(compiled.html.includes(label), `the rewrite must show all ${label}`);
  }
});

test('VER-3 ranking: a declared ranking_span requirement licenses both_ends to keep a small set at its two ends', () => {
  const requirements = [
    ...CEO_BASE_REQUIREMENTS,
    { id: 'ctx_top_span', type: 'ranking_span', subject: 'top_accounts', minimumCoverage: 'both_ends', status: 'confirmed' }
  ];
  const compiled = assertCompiled(ceoCase({
    selections: FULL_PAGE.map((entry) =>
      entry.id === 'top_accounts' ? { ...entry, presentation: 'both_ends' } : entry
    ),
    requirements
  }));
  const node = deliveryNode(compiled, 'top_accounts');
  assert.equal(node.presentation, 'both_ends');
  assert.equal(node.expectedItemCount, 2);
  assert.ok(compiled.html.includes('Northstar Health'));
  assert.ok(compiled.html.includes('Pilgrim Retail'));
  assert.ok(!compiled.html.includes('Copper Labs'), 'licensed extremes must truncate the middle candidate');
  assert.ok(!(compiled.manifest.delivery.decisionLog ?? []).some((entry) => entry.reasonCode === 'RANKING_EXTREMES_NOT_GROUNDED'));
});

test('VER-3 ranking: order without a grounded basis is traced as RANKING_ORDER_NOT_GROUNDED, never silently promoted', () => {
  const compiled = assertCompiled(ceoCase({
    selections: FULL_PAGE,
    decorateState: (state) => {
      for (const node of state.semanticNodes) {
        for (const item of node.items) delete item.rank;
      }
    }
  }));
  const encoding = encodingOf(compiled, 'top_accounts');
  assert.ok(!encoding.eligibleEncodings.includes('ranked_bar'));
  assert.ok(encoding.rejected.some((entry) => entry.reasonCode === 'RANKING_ORDER_NOT_GROUNDED'));
  assert.equal(deliveryNode(compiled, 'top_accounts').visualSpec.ranking.basis, 'source_order');
});

// ------------------------------------------------------------- VER-4 survival + firewalls

const WORKFORCE = {
  dir: workforceDir,
  file: 'workforce-reconstructed.source.json',
  decision: 'What is the current workforce state for the 2026 management review?',
  action: 'Review the current state; no action is selected from this page',
  selections: [
    { id: 'workforce_kpis', type: 'MetricCluster', presentation: 'comparison' },
    { id: 'headcount_trend', type: 'Trend', presentation: 'full_chart' },
    { id: 'department_headcount', type: 'Breakdown', presentation: 'full_breakdown' }
  ],
  presentation: {
    primaryMetrics: ['total_headcount', 'turnover_rate', 'training_completion'],
    heroMetric: 'total_headcount',
    supportingMetrics: [],
    scorecardMetrics: ['avg_appraisal']
  },
  metrics: [
    primaryRoute('total_headcount', 'Total headcount'),
    primaryRoute('turnover_rate', 'Turnover rate'),
    primaryRoute('training_completion', 'Training completion'),
    { metric: 'avg_appraisal', role: 'scorecard_only', changesDecision: false, visibility: 'scorecard' }
  ],
  requirements: [
    { id: 'ctx_department_headcount', type: 'decomposition', subject: 'department_headcount', minimumCoverage: 'full_breakdown', status: 'confirmed' }
  ]
};

const SAAS = {
  dir: syntheticDir,
  file: 'saas-multitier-monitor.source.json',
  decision: 'Are we operating within the declared bounds this quarter?',
  action: 'Review the current state; escalate only when a declared bound is crossed',
  selections: [
    { id: 'limit_status', type: 'ExceptionList', presentation: 'full_list' },
    { id: 'arr_trend', type: 'Trend', presentation: 'full_chart' },
    { id: 'saas_kpis', type: 'MetricCluster', presentation: 'comparison' },
    { id: 'segment_mix', type: 'Breakdown', presentation: 'full_breakdown' },
    { id: 'expansion_detail', type: 'Drilldown', presentation: 'reachable_detail' }
  ],
  presentation: {
    primaryMetrics: ['arr', 'net_revenue_retention', 'gross_margin'],
    heroMetric: 'arr',
    supportingMetrics: [],
    scorecardMetrics: ['support_tickets']
  },
  metrics: [
    primaryRoute('arr', 'Annual recurring revenue'),
    primaryRoute('net_revenue_retention', 'Net revenue retention'),
    primaryRoute('gross_margin', 'Gross margin'),
    { metric: 'margin_floor', role: 'exception', changesDecision: true, decisionImpact: 'Crossing the confirmed margin floor changes what the review must address.', visibility: 'first_view', active: true, surfacePath: '/exceptions/0' },
    { metric: 'support_tickets', role: 'scorecard_only', changesDecision: false, visibility: 'scorecard' }
  ],
  requirements: []
};

function survivalCase(spec, overrideSelections = null) {
  return groundedCase(spec.dir, spec.file, {
    selections: overrideSelections ?? spec.selections,
    decision: spec.decision,
    action: spec.action,
    requirements: spec.requirements,
    metrics: spec.metrics,
    presentation: spec.presentation
  });
}

test('VER-4 Workforce survives unchanged: no encoding is invented, no fallback fires', () => {
  const compiled = assertCompiled(survivalCase(WORKFORCE));
  for (const node of compiled.manifest.delivery.nodes) {
    const encoding = encodingOf(compiled, node.id);
    assert.equal(encoding.selectedEncoding, encoding.requestedEncoding, `${node.id} presentation must be untouched`);
  }
  const department = encodingOf(compiled, 'department_headcount');
  assert.ok(department.rejected.some((entry) => entry.reasonCode === 'WATERFALL_NOT_REQUESTED'));
  assert.deepEqual(encodingFallbackEntries(compiled), []);
  assert.doesNotMatch(compiled.html, /data-visual-geometry="(waterfall-segments|bullet-target)"/);
});

test('VER-4 SaaS survives unchanged and even an explicitly requested waterfall is refused with a reason when no path is grounded', () => {
  const compiled = assertCompiled(survivalCase(SAAS));
  const segmentMix = encodingOf(compiled, 'segment_mix');
  assert.ok(segmentMix.rejected.some((entry) => entry.reasonCode === 'WATERFALL_NOT_REQUESTED'));
  assert.deepEqual(encodingFallbackEntries(compiled), []);
  assert.doesNotMatch(compiled.html, /data-visual-geometry="(waterfall-segments|bullet-target)"/);

  const requested = assertCompiled(survivalCase(SAAS, SAAS.selections.map((entry) =>
    entry.id === 'segment_mix' ? { ...entry, presentation: 'waterfall' } : entry
  )));
  const encoding = encodingOf(requested, 'segment_mix');
  assert.equal(encoding.requestedEncoding, 'waterfall');
  assert.equal(encoding.selectedEncoding, 'full_breakdown');
  assert.ok(encoding.rejected.some((entry) => entry.reasonCode === 'WATERFALL_INELIGIBLE_PATH_NOT_DECLARED'));
  fallbackEntry(requested, 'WATERFALL_INELIGIBLE_PATH_NOT_DECLARED');
  assert.doesNotMatch(requested.html, /data-visual-geometry="waterfall-segments"/);
});

test('VER-4 §16 the manifest carries an encoding decision trace for every delivered node', () => {
  const compiled = assertCompiled(ceoCase({ selections: FULL_PAGE }));
  for (const node of compiled.manifest.delivery.nodes) {
    const encoding = encodingOf(compiled, node.id);
    assert.equal(typeof encoding.requestedEncoding, 'string');
    assert.equal(typeof encoding.selectedEncoding, 'string');
    assert.ok(Array.isArray(encoding.eligibleEncodings));
    assert.ok(Array.isArray(encoding.rejected));
    for (const rejection of encoding.rejected) {
      assert.equal(typeof rejection.reasonCode, 'string', 'every rejection carries a reason code');
    }
  }
});

test('VER-4 copy firewall: the bullet states the relative position once, without evaluative language', () => {
  const compiled = assertCompiled(ceoCase({ selections: FULL_PAGE }));
  for (const [label, artifact] of [['html', compiled.html], ['svg', compiled.svg]]) {
    assert.match(artifact, /\$1\.02M below target/, `${label} must state the gap as one neutral relative-position note`);
    // The same gap amount must never be rendered twice ("Gap $1.02M" plus
    // "Gap: $1.02M" was the duplicated-copy failure mode).
    assert.equal((artifact.match(/\$1\.02M/g) ?? []).length, 1, `${label} must carry exactly one delivered gap amount`);
    assert.doesNotMatch(artifact, /Gap:?\s*\$1\.02M/, `${label} must not duplicate the gap label beside the amount`);
    assert.doesNotMatch(artifact, /\b(missed|fails|failed|failing|bad|poor|underperform\w*|disappoint\w*)\b/i, `${label} must stay descriptive without an evaluation contract`);
  }
});

// Desktop and true-390 render the SAME delivered artifact: the continuity
// assertions above are geometry-of-the-artifact checks, so the contract at
// 390px holds as long as no breakpoint CSS hides or swaps bridge primitives.
test('VER-1.1 narrow viewport: bullet and waterfall bridge primitives survive every breakpoint', () => {
  const compiled = assertCompiled(ceoCase({ selections: FULL_PAGE }));
  const style = /<style>([\s\S]*?)<\/style>/.exec(compiled.html)[1];
  const mediaBlocks = style.match(/@media[^{]*\{[\s\S]*?\}\}/g) ?? [];
  assert.ok(mediaBlocks.length > 0, 'the delivered page must carry breakpoint CSS');
  for (const block of mediaBlocks) {
    assert.doesNotMatch(block, /\.bullet-track\s*\{[^}]*display:none/, 'breakpoints must not drop the shared bullet track');
    assert.doesNotMatch(block, /\.bullet-target-marker\s*\{[^}]*display:none/, 'breakpoints must not drop the target marker');
    assert.doesNotMatch(block, /\.waterfall-plot|\.waterfall-connector|\.waterfall-total-bar|\.waterfall-segment/, 'breakpoints must not restyle away the delivered bridge');
    assert.doesNotMatch(block, /display:none/, 'no encoding primitive may be display:none at a breakpoint');
  }
  // One delivered bridge for the whole document, at every width.
  assert.equal((compiled.html.match(/class="waterfall-bridge"/g) ?? []).length, 1);
  assert.equal((compiled.html.match(/class="bullet-track" data-encoding-track="true"/g) ?? []).length, 1);
  // The identity run of the verifier over the same artifact proves the
  // continuity assertions are artifact-scoped, not viewport-scoped.
  assert.deepEqual(verifyDeliveredArtifact({ html: compiled.html, svg: compiled.svg, manifest: compiled.manifest }).errors
    .filter((error) => error.code.startsWith('DELIVERED_ENCODING')), []);
});

test('VER-4 §20 responsive presentation restyles geometry but never re-selects an encoding', () => {
  const compiled = assertCompiled(ceoCase({ selections: FULL_PAGE }));
  const style = /<style>([\s\S]*?)<\/style>/.exec(compiled.html)[1];
  assert.match(style, /@media/);
  // Exactly one delivered instance of each encoding contract exists in the
  // document; breakpoint CSS operates on it instead of swapping shapes.
  assert.equal((compiled.html.match(/data-visual-marker="target"/g) ?? []).length, 1);
  assert.equal((compiled.html.match(/data-waterfall-endpoint="start"/g) ?? []).length, 1);
  assert.equal((compiled.html.match(/data-visual-mark-item="waterfall-segment"/g) ?? []).length, 3);
});
