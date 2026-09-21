// STEP 2.2 (parent attention-ceiling repair, Model A) contract tests.
// Confirmed defect: RELEVANCE_VS_ATTENTION_INTERFACE_DEFECT — a lead child
// tile could visually escape the attention ceiling of its supporting parent
// region (SaaS 390: 9.10M/112%/76% at 33px + emphasis tile chrome >= the
// primary region's attention). Rule: local relevance may rank items within a
// region, but it may not visually exceed the attention ceiling of its parent
// region. Model A only: region owns page-level rank; local tier owns rank
// only inside the region (Model B global f(role,tier) ranking NOT implemented).
//   PA-1  the manifest emits the effective presentation trace
//         (parentRole/base/ceiling/effective) and both delivered channels
//         bind it;
//   PA-2  the ceiling is generic role-token plumbing, not fixture CSS;
//   PA-3  the ceiling is ordinal channel-wise: supporting-lead < primary on
//         every shared channel, anchor/primary ceilings unconstrained;
//   PA-4  local hierarchy survives: lead > secondary inside a clamped region
//         and clamped tiles stay delivered (no hiding);
//   PA-5  Workforce survival: the anchor ceiling equals base geometry, so the
//         ceiling is not a global KPI shrink;
//   PA-6  encoding geometry is untouched (SaaS trend/breakdown data ink);
//   PA-7  no new severity/status color or badge enters via ceiling tokens.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { requiredRelationshipPaths } from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';
import { ROLE_PRESENTATION, METRIC_VALUE_FONT_PX, LEAD_VALUE_FONT_PX } from '../../skills/decision-first-dashboard/scripts/render-semantic.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const workforceDir = path.join(root, 'fixtures/workforce');
const syntheticDir = path.join(root, 'fixtures/cr5c-synthetic');
const worthiness = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/worthiness/dashboard.worthiness.json'), 'utf8'));

// Harness identical to tests/compiler/composition-router-hierarchy.test.js.
function groundedCase(dir, fileName, { selections, decision, action, requirements = [], metrics, presentation = null }) {
  const bytes = fs.readFileSync(path.join(dir, fileName));
  const source = JSON.parse(bytes.toString('utf8'));
  const decisionState = {
    mode: 'no_score',
    signals: source.signals.map((signal) => ({ ...signal, provenance: 'source' })),
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

function saas() {
  return groundedCase(syntheticDir, 'saas-multitier-monitor.source.json', {
    selections: [
      { id: 'limit_status', type: 'ExceptionList', presentation: 'full_list' },
      { id: 'arr_trend', type: 'Trend', presentation: 'full_chart' },
      { id: 'saas_kpis', type: 'MetricCluster', presentation: 'comparison' },
      { id: 'segment_mix', type: 'Breakdown', presentation: 'full_breakdown' },
      { id: 'expansion_detail', type: 'Drilldown', presentation: 'reachable_detail' }
    ],
    decision: 'Are we operating within the declared bounds this quarter?',
    action: 'Review the current state; escalate only when a declared bound is crossed',
    requirements: [],
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
    ]
  });
}

function workforce() {
  return groundedCase(workforceDir, 'workforce-reconstructed.source.json', {
    selections: [
      { id: 'workforce_kpis', type: 'MetricCluster', presentation: 'comparison' },
      { id: 'headcount_trend', type: 'Trend', presentation: 'full_chart' },
      { id: 'department_headcount', type: 'Breakdown', presentation: 'full_breakdown' }
    ],
    decision: 'What is the current workforce state for the 2026 management review?',
    action: 'Review the current state; no action is selected from this page',
    requirements: [
      { id: 'ctx_department_headcount', type: 'decomposition', subject: 'department_headcount', minimumCoverage: 'full_breakdown', status: 'confirmed' }
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
    ]
  });
}

// ---------------------------------------------------------------- parsing helpers

function styleBlock(html) {
  return /<style>([\s\S]*?)<\/style>/.exec(html)[1];
}

const ROLE_RULE_RE = /\.semantic-card--role-(anchor|primary|supporting|detail)\{([^}]*)\}/g;

function roleRuleSets(css) {
  const rules = [...css.matchAll(ROLE_RULE_RE)];
  assert.equal(rules.length, 12, `expected 4 roles x 3 breakpoints of role rules, saw ${rules.length}`);
  const body = (start) => Object.fromEntries(rules.slice(start, start + 4).map(([, role, text]) => [role, text]));
  return { wide: body(0), tablet: body(4), narrow: body(8) };
}

function tokenPx(body, name) {
  const value = new RegExp(`--${name}:(-?[0-9.]+)px`).exec(body);
  assert.ok(value, `missing --${name} in role rule: ${body}`);
  return Number(value[1]);
}

// ---------------------------------------------------------------- PA-1 effective trace

test('PA-1 the manifest exposes the effective presentation trace and both channels bind it', () => {
  const compiled = saas();
  const relevance = compiled.manifest.delivery.relevance;
  assert.deepEqual(relevance.attentionCeiling, {
    form: 'ordinal',
    comparison: 'channel-wise',
    model: 'region-first_local-modulation'
  }, 'the ceiling declaration must name its form, comparison and selected model');
  const wideSupporting = ROLE_PRESENTATION.ladders.wide.supporting;
  const metrics = relevance.metrics.filter((entry) => entry.node === 'saas_kpis');
  assert.equal(metrics.length, 4, 'three lead + one secondary tile under the supporting region');
  for (const entry of metrics) {
    assert.equal(entry.parentRole, 'supporting', `${entry.metric}: parent role missing from trace`);
    assert.ok(['lead', 'secondary'].includes(entry.tier));
    assert.deepEqual(entry.base, {
      valueTypography: entry.tier === 'lead' ? LEAD_VALUE_FONT_PX : METRIC_VALUE_FONT_PX,
      surface: entry.tier === 'lead' ? 'emphasis' : 'flat'
    }, 'base stays the CR-5c declared tile geometry (local tier classification untouched)');
    assert.deepEqual(entry.ceiling, {
      valueTypography: entry.tier === 'lead' ? wideSupporting.tileLead : wideSupporting.tileValue,
      surface: wideSupporting.tileSurface
    });
    assert.equal(entry.effective.valueTypography, Math.min(entry.base.valueTypography, entry.ceiling.valueTypography));
    assert.equal(entry.effective.surface, entry.base.surface === 'flat' || entry.ceiling.surface === 'flat' ? 'flat' : 'emphasis');
  }
  const sets = roleRuleSets(styleBlock(compiled.html));
  for (const [bp, rules] of Object.entries(sets)) {
    for (const entry of metrics) {
      const token = entry.tier === 'lead' ? 'rp-tile-lead' : 'rp-tile-value';
      assert.equal(tokenPx(rules.supporting, token), entry.effective.valueTypography, `${entry.metric}: effective typography not bound at ${bp}`);
    }
    assert.match(rules.supporting, /--rp-tile-lead-bg:none/, `effective surface not bound at ${bp}`);
  }
  assert.match(compiled.svg, /g\[data-attention-role="supporting"\] \.metric-value--lead\{font-size:15px\}/, 'svg lead numerals must clamp to the supporting ceiling');
  assert.match(compiled.svg, /g\[data-attention-role="supporting"\] \.metric-value\{font-size:13px\}/, 'svg secondary numerals must clamp to the supporting ceiling');
  assert.match(compiled.svg, /g\[data-attention-role="supporting"\] \.metric-tile--lead\{fill:none;stroke:none\}/, 'svg lead tile chrome must flatten under the supporting ceiling');
});

// ---------------------------------------------------------------- PA-2 generic plumbing

test('PA-2 the ceiling is role-token plumbing, not fixture-specific CSS', () => {
  const saasCss = styleBlock(saas().html);
  const wfCss = styleBlock(workforce().html);
  // Base tile rules consume custom properties only; the fallback preserves
  // the unconstrained base geometry for pages without a role classification.
  assert.match(saasCss, /\.metric-tile strong\{font-size:var\(--rp-tile-value,\d+px\)/);
  assert.match(saasCss, /\.metric-tile--lead strong\{font-size:var\(--rp-tile-lead,\d+px\)\}/);
  assert.match(saasCss, /\.metric-tile--lead\{grid-column:span 2;background:var\(--rp-tile-lead-bg,#eef3fd\);border:1px solid var\(--rp-tile-lead-border,#c9d6f2\)\}/);
  const grab = (css) => /\.metric-tile--lead strong\{[^}]*\}/.exec(css)[0] + /\.metric-tile strong\{[^}]*\}/.exec(css)[0];
  assert.equal(grab(saasCss), grab(wfCss), 'tile rules are generic; the ceiling lives only in the role tokens');
  const sets = roleRuleSets(saasCss);
  for (const [bp, rules] of Object.entries(sets)) {
    assert.equal(tokenPx(rules.supporting, 'rp-tile-lead'), ROLE_PRESENTATION.ladders[bp].supporting.tileLead, `supporting ceiling drifted at ${bp}`);
    assert.match(rules.supporting, /--rp-tile-lead-bg:none/, `supporting surface ceiling drifted at ${bp}`);
  }
});

// ---------------------------------------------------------------- PA-3 ordinal, channel-wise

test('PA-3 the ceiling is ordinal: supporting-lead stays below the primary region on every shared channel', () => {
  const sets = roleRuleSets(styleBlock(saas().html));
  for (const [bp, rules] of Object.entries(sets)) {
    // Typography channel vs typography channel.
    assert.ok(tokenPx(rules.supporting, 'rp-tile-lead') < tokenPx(rules.primary, 'rp-value'), `supporting lead escapes the primary value size at ${bp}`);
    assert.ok(tokenPx(rules.detail, 'rp-tile-lead') <= tokenPx(rules.supporting, 'rp-tile-lead'), `detail tile out-speaks supporting at ${bp}`);
    assert.ok(tokenPx(rules.anchor, 'rp-tile-lead') >= tokenPx(rules.primary, 'rp-tile-lead'), `anchor ceiling must never sit below primary at ${bp}`);
    // Surface channel vs surface channel (never a cross-channel proxy).
    assert.match(rules.primary, /--rp-tile-lead-bg:#eef3fd/, `primary region lost its emphasis surface at ${bp}`);
    assert.match(rules.supporting, /--rp-tile-lead-bg:none/, `supporting surface not flattened at ${bp}`);
  }
  // The ceiling is not a global KPI shrink: anchor/primary ceilings equal the
  // unconstrained base geometry by construction.
  for (const bp of ['wide', 'tablet', 'narrow']) {
    assert.equal(ROLE_PRESENTATION.ladders[bp].anchor.tileLead, LEAD_VALUE_FONT_PX, `anchor tile ceiling moved at ${bp}`);
    assert.equal(ROLE_PRESENTATION.ladders[bp].primary.tileLead, LEAD_VALUE_FONT_PX, `primary tile ceiling moved at ${bp}`);
    assert.equal(ROLE_PRESENTATION.ladders[bp].anchor.tileSurface, 'emphasis');
    assert.equal(ROLE_PRESENTATION.ladders[bp].primary.tileSurface, 'emphasis');
  }
});

// ---------------------------------------------------------------- PA-4 local hierarchy survives

test('PA-4 clamping the ceiling keeps lead > secondary inside the region and keeps tiles delivered', () => {
  const sets = roleRuleSets(styleBlock(saas().html));
  for (const [bp, rules] of Object.entries(sets)) {
    assert.ok(tokenPx(rules.supporting, 'rp-tile-lead') > tokenPx(rules.supporting, 'rp-tile-value'), `supporting local tier flattened at ${bp} (over-correction)`);
    assert.ok(tokenPx(rules.detail, 'rp-tile-lead') > tokenPx(rules.detail, 'rp-tile-value'), `detail local tier flattened at ${bp}`);
  }
  const compiled = saas();
  // F3 reachability: the ceiling derives effective presentation; it never
  // removes or hides the relevance-ranked children.
  assert.equal((compiled.html.match(/class="metric-tile metric-tile--lead"/g) ?? []).length, 3, 'three lead tiles still delivered in the supporting region');
  assert.equal((compiled.html.match(/class="metric-tile metric-tile--secondary"/g) ?? []).length, 1, 'secondary tile still delivered');
});

// ---------------------------------------------------------------- PA-5 Workforce survival

test('PA-5 the Workforce anchor ceiling equals base geometry, so the ceiling is not a global KPI shrink', () => {
  const compiled = workforce();
  const metrics = compiled.manifest.delivery.relevance.metrics;
  assert.equal(metrics.filter((entry) => entry.tier === 'lead').length, 3);
  assert.equal(metrics.filter((entry) => entry.tier === 'secondary').length, 1);
  for (const entry of metrics) {
    assert.equal(entry.parentRole, 'anchor', `${entry.metric}: workforce KPIs live in the anchor region`);
    assert.equal(entry.effective.valueTypography, entry.base.valueTypography, `${entry.metric}: ceiling shrank the anchor region`);
  }
  for (const entry of metrics.filter((m) => m.tier === 'lead')) {
    assert.equal(entry.effective.valueTypography, LEAD_VALUE_FONT_PX);
    assert.equal(entry.effective.surface, 'emphasis', `${entry.metric}: anchor surface must stay at base geometry`);
  }
  for (const entry of metrics.filter((m) => m.tier === 'secondary')) {
    assert.equal(entry.effective.valueTypography, METRIC_VALUE_FONT_PX);
    assert.equal(entry.effective.surface, 'flat');
  }
  const sets = roleRuleSets(styleBlock(compiled.html));
  for (const [bp, rules] of Object.entries(sets)) {
    assert.ok(tokenPx(rules.anchor, 'rp-tile-lead') / tokenPx(rules.anchor, 'rp-tile-value') >= 1.5, `anchor lead<->secondary tile ratio narrowed at ${bp}`);
    assert.match(rules.anchor, /--rp-tile-lead-bg:#eef3fd/, `anchor tile surface weakened at ${bp}`);
  }
});

// ---------------------------------------------------------------- PA-6 encoding geometry lock

test('PA-6 the ceiling repair leaves SaaS encoding data ink byte-identical', () => {
  const css = styleBlock(saas().html);
  assert.match(css, /\.trend-line\{fill:none;stroke:#3e63c6;stroke-width:2\.5;stroke-linecap:round;stroke-linejoin:round\}/, 'trend line ink must not weaken');
  assert.match(css, /\.visual-bar\{display:block;width:var\(--value\);height:6px;background:#7e97c9;border-radius:999px\}/, 'bar ink must not weaken');
  assert.match(css, /\.breakdown-bars li \.visual-bar\{background:#7e97c9\}/, 'breakdown ink must not weaken');
});

// ---------------------------------------------------------------- PA-7 token firewall

test('PA-7 ceiling tokens use only the declared neutral set; no severity channel opens', () => {
  const declared = new Set(['#b9c9ea', '#fbfcfe', '#eceff6', '#eef3fd', '#c9d6f2', '#e7ebf3']);
  const css = styleBlock(saas().html);
  for (const [, role, body] of [...css.matchAll(ROLE_RULE_RE)]) {
    for (const hex of body.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
      assert.ok(declared.has(hex), `undeclared color ${hex} entered the role layer on ${role}`);
    }
    assert.doesNotMatch(body, /red|green|crimson|emerald|#d|#e74|#2e7/i, `severity-flavored token entered ${role}`);
  }
});
