// STEP 2 (VP-HIERARCHY-DELIVERY-GAP) contract tests. These lock the three
// things the exit criterion needs from the delivered artifact alone:
//   HP-1  the surface channel ships at EVERY breakpoint, not just wide;
//   HP-2  hierarchy-differentiating tokens stay inside the declared neutral
//         CR-4/VP token set — no severity color may enter via chrome;
//   HP-3  at the narrowest delivered ladder the anchor keeps >=2 non-span
//         signals and the total order survives span collapse;
//   HP-4  Workforce tiles deliver exactly the manifest-declared tiers and the
//         renderer invents no extra winner;
//   HP-5  region roles/spans on the three canonical pages are untouched
//         (hierarchy delivery must not move composition);
//   HP-6  guardrail 1: the Workforce KPI lead<->secondary geometry survives
//         the ladder repair exactly as declared;
//   HP-7  F2' fidelity hook: waterfall data ink is never weakened to buy
//         anchor dominance.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { requiredRelationshipPaths } from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const workforceDir = path.join(root, 'fixtures/workforce');
const syntheticDir = path.join(root, 'fixtures/cr5c-synthetic');
const adaptiveDir = path.join(root, 'fixtures/adaptive-composition');
const worthiness = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/worthiness/dashboard.worthiness.json'), 'utf8'));

const ROLE_NAMES = Object.freeze(['anchor', 'primary', 'supporting', 'detail']);

// Harness identical to tests/compiler/composition-router-vp.test.js.
function groundedCase(dir, fileName, { selections, decision, action, requirements = [], metrics, presentation = null, nameSignals = false }) {
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

function ceoEncoding() {
  const source = JSON.parse(fs.readFileSync(path.join(adaptiveDir, 'ceo-sales-encoding.source.json'), 'utf8'));
  return groundedCase(adaptiveDir, 'ceo-sales-encoding.source.json', {
    selections: [
      { id: 'revenue_target', type: 'Relationship', presentation: 'bullet_target' },
      { id: 'gap_attribution', type: 'Breakdown', presentation: 'waterfall' },
      { id: 'top_accounts', type: 'Ranking', presentation: 'full_ranking' }
    ],
    decision: 'Are we operating within the declared bounds this quarter?',
    action: 'Review the current state; escalate only when a declared bound is crossed',
    requirements: [
      { id: 'ctx_revenue_target', type: 'target_reference', subject: 'revenue_target', minimumCoverage: 'target_and_gap', status: 'confirmed' },
      { id: 'ctx_gap_attribution', type: 'gap_attribution', subject: 'gap_attribution', minimumCoverage: 'full_breakdown', status: 'inferred' },
      { id: 'ctx_top_accounts', type: 'contributor_comparison', subject: 'top_accounts', minimumCoverage: 'contributors', status: 'inferred' }
    ],
    metrics: source.signals.map((signal, index) => primaryRoute(`signal_${index + 1}`, signal.label)),
    nameSignals: true
  });
}

// ---------------------------------------------------------------- parsing helpers

function styleBlock(html) {
  return /<style>([\s\S]*?)<\/style>/.exec(html)[1];
}

const ROLE_RULE_RE = /\.semantic-card--role-(anchor|primary|supporting|detail)\{([^}]*)\}/g;

// The three delivered role-rule sets, in CSS order: [base(wide), tablet, narrow].
function roleRuleSets(css) {
  const rules = [...css.matchAll(ROLE_RULE_RE)];
  assert.equal(rules.length, 12, `expected 4 roles x 3 breakpoints of role rules, saw ${rules.length}`);
  const body = (start) => Object.fromEntries(rules.slice(start, start + 4).map(([, role, text]) => [role, text]));
  return { wide: body(0), tablet: body(4), narrow: body(8) };
}

function tokenPx(body, name) {
  const value = new RegExp(`--${name}:(-?[\\d.]+)px`).exec(body);
  assert.ok(value, `missing --${name} in role rule: ${body}`);
  return Number(value[1]);
}

// ---------------------------------------------------------------- HP-1 surface channel survives span collapse

test('HP-1 delivered surface chrome ships at every breakpoint, not only while spans exist', () => {
  const sets = roleRuleSets(styleBlock(saas().html));
  for (const [bp, rules] of Object.entries(sets)) {
    assert.match(rules.anchor, /border-color:#b9c9ea/, `anchor surface border missing at ${bp}`);
    assert.match(rules.anchor, /box-shadow:0 2px 4px rgba\(15,26,44,\.07\),0 24px 56px rgba\(15,26,44,\.16\)/, `anchor elevation missing at ${bp}`);
    assert.match(rules.detail, /background:#fbfcfe/, `detail receded surface missing at ${bp}`);
    assert.match(rules.detail, /box-shadow:none/, `detail flat shadow missing at ${bp}`);
    assert.doesNotMatch(rules.primary, /border-color|box-shadow|background:/, `primary must not carry invented chrome at ${bp}`);
    assert.doesNotMatch(rules.supporting, /border-color|box-shadow|background:/, `supporting must not carry invented chrome at ${bp}`);
  }
});

// ---------------------------------------------------------------- HP-2 declared-token firewall

test('HP-2 role chrome values stay inside the declared neutral token set (no severity color)', () => {
  const declaredChrome = new Set([
    'border-color:#b9c9ea',
    'box-shadow:0 2px 4px rgba(15,26,44,.07),0 24px 56px rgba(15,26,44,.16)',
    'background:#fbfcfe',
    'border-color:#eceff6',
    'box-shadow:none'
  ]);
  const css = styleBlock(saas().html);
  for (const [, role, body] of [...css.matchAll(ROLE_RULE_RE)]) {
    const chrome = body.split(';').filter((part) => !part.startsWith('--rp-') && part.length > 0);
    for (const token of chrome) {
      assert.ok(declaredChrome.has(token), `undeclared hierarchy token on ${role}: ${token}`);
    }
    assert.doesNotMatch(body, /red|green|crimson|emerald|#d|#e74|#2e7/i, `severity-flavored color entered role rule for ${role}`);
  }
});

// ---------------------------------------------------------------- HP-3 narrow total order, non-span signals

test('HP-3 at the narrowest breakpoint the anchor keeps >=2 non-span signals and the full order survives', () => {
  const sets = roleRuleSets(styleBlock(saas().html));
  for (const bp of ['tablet', 'narrow']) {
    const rules = sets[bp];
    for (let i = 1; i < ROLE_NAMES.length; i += 1) {
      for (const field of ['rp-title', 'rp-value', 'rp-pad']) {
        const higher = tokenPx(rules[ROLE_NAMES[i - 1]], field);
        const lower = tokenPx(rules[ROLE_NAMES[i]], field);
        assert.ok(higher > lower, `${field}: ${ROLE_NAMES[i - 1]}(${higher}) !> ${ROLE_NAMES[i]}(${lower}) at ${bp}`);
      }
    }
    const anchor = rules.anchor;
    const typography = tokenPx(anchor, 'rp-title') > tokenPx(rules.primary, 'rp-title');
    const spacing = tokenPx(anchor, 'rp-pad') > tokenPx(rules.primary, 'rp-pad');
    const surface = /box-shadow:/.test(anchor) && !/box-shadow:/.test(rules.primary);
    assert.ok([typography, spacing, surface].filter(Boolean).length >= 2, `anchor needs >=2 distinct non-span signals at ${bp}`);
    // REOPEN-STEP2 repair contracts: anchor carries real mass (F2), the mid-tier
    // gap is just wide enough to read as two tiers (F1), and no gap is dumped
    // mid-ladder at the cost of the anchor step.
    assert.ok(tokenPx(anchor, 'rp-title') - tokenPx(rules.primary, 'rp-title') >= 4, `anchor mass step too small at ${bp}`);
    assert.ok(tokenPx(rules.primary, 'rp-title') - tokenPx(rules.supporting, 'rp-title') >= 2, `primary<->supporting not distinguishable at ${bp}`);
    assert.ok(tokenPx(rules.primary, 'rp-title') - tokenPx(rules.supporting, 'rp-title') < tokenPx(anchor, 'rp-title') - tokenPx(rules.primary, 'rp-title'), `ladder gap stacked mid-tier at ${bp}`);
  }
});

// ---------------------------------------------------------------- HP-4 Workforce tile tiers = manifest tiers

test('HP-4 Workforce tiles deliver exactly the manifest-declared tiers and invent no winner', () => {
  const compiled = workforce();
  const relevance = compiled.manifest.delivery.relevance;
  const leads = relevance.metrics.filter((entry) => entry.tier === 'lead').map((entry) => entry.metric);
  const secondaries = relevance.metrics.filter((entry) => entry.tier === 'secondary').map((entry) => entry.metric);
  assert.deepEqual(leads.sort(), ['total_headcount', 'training_completion', 'turnover_rate'], 'manifest tiers come from routed roles, not the renderer');
  assert.deepEqual(secondaries, ['avg_appraisal']);
  const tiles = [...compiled.html.matchAll(/<article class="metric-tile([^"]*)"([^>]*)>/g)];
  assert.equal(tiles.length, relevance.metrics.length, 'every declared KPI renders as a tile');
  const delivered = tiles.map(([, classes, attrs]) => ({
    tier: /data-metric-tier="([^"]*)"/.exec(attrs)?.[1] ?? null,
    lead: classes.includes('metric-tile--lead'),
    secondary: classes.includes('metric-tile--secondary')
  }));
  assert.equal(delivered.filter((tile) => tile.tier === 'lead' && tile.lead && !tile.secondary).length, 3, 'three lead tiles delivered');
  assert.equal(delivered.filter((tile) => tile.tier === 'secondary' && tile.secondary && !tile.lead).length, 1, 'one secondary tile delivered');
  assert.doesNotMatch(compiled.html, /metric-tile--(hero|primary|winner)/, 'the renderer must not invent a tile tier the manifest never declared');
});

// ---------------------------------------------------------------- HP-5 composition untouched

test('HP-5 hierarchy delivery moved no region role or span on the three canonical pages', () => {
  const expected = {
    'ceo-sales-encoding': [
      ['revenue_target', 'anchor', 'full'],
      ['gap_attribution', 'supporting', 'standard'],
      ['top_accounts', 'supporting', 'standard']
    ],
    'workforce-survival': [
      ['workforce_kpis', 'anchor', 'full'],
      ['headcount_trend', 'supporting', 'standard'],
      ['department_headcount', 'supporting', 'standard']
    ],
    'saas-survival': [
      ['limit_status', 'anchor', 'full'],
      ['arr_trend', 'primary', 'standard'],
      ['saas_kpis', 'supporting', 'standard'],
      ['segment_mix', 'supporting', 'standard'],
      ['expansion_detail', 'detail', 'standard']
    ]
  };
  const cases = { 'ceo-sales-encoding': ceoEncoding(), 'workforce-survival': workforce(), 'saas-survival': saas() };
  for (const [name, compiled] of Object.entries(cases)) {
    assert.equal(compiled.result.valid, true, `${name} valid`);
    const surfaces = compiled.manifest.delivery.presentation.surfaces.map((surface) => [surface.surfaceId, surface.attentionRole, surface.regionSpan]);
    assert.deepEqual(surfaces, expected[name], `${name} region roles/spans changed`);
    assert.equal(compiled.manifest.delivery.presentation.hierarchyDegradation, 'none', `${name} declared a degradation`);
  }
});

// ---------------------------------------------------------------- HP-6 guardrail 1: untouched pages don't regress

test('HP-6 the ladder repair leaves the Workforce KPI lead<->secondary geometry exactly as declared', () => {
  const css = styleBlock(workforce().html);
  const secondary = /(?:^|\})\.metric-tile strong\{font-size:var\(--rp-tile-value,([\d.]+)px\)/.exec(css);
  const lead = /\.metric-tile--lead strong\{font-size:var\(--rp-tile-lead,([\d.]+)px\)\}/.exec(css);
  assert.ok(secondary && lead, 'metric tile geometry contract missing from delivered CSS');
  assert.equal(Number(secondary[1]), 22, 'secondary tile value size must not move (CR-5c contract)');
  assert.equal(Number(lead[1]), 33, 'lead tile value size must not move (CR-5c contract)');
  assert.ok(Number(lead[1]) / Number(secondary[1]) >= 1.5, 'lead<->secondary gap narrowed below the declared 1.5 ratio');
  // Workforce tiles live in the ANCHOR region: the STEP 2.2 ceiling for that
  // role must equal the unconstrained base geometry at every breakpoint, so
  // the survival page renders byte-identically loud.
  const sets = roleRuleSets(css);
  for (const [bp, rules] of Object.entries(sets)) {
    assert.equal(tokenPx(rules.anchor, 'rp-tile-lead'), 33, `anchor tile ceiling moved at ${bp}`);
    assert.equal(tokenPx(rules.anchor, 'rp-tile-value'), 22, `anchor tile base moved at ${bp}`);
  }
});

// ---------------------------------------------------------------- HP-7 encoding data-ink fidelity hook

// F2' regression hook: anchor dominance must be bought with anchor tokens,
// never by dimming the waterfall's data ink. These encoding constants are the
// same ones accepted in the previous round; any weakening must fail here.
test('HP-7 waterfall data ink is untouched by the anchor-mass repair', () => {
  const css = styleBlock(ceoEncoding().html);
  assert.match(css, /\.waterfall-total-bar\{bottom:0;height:var\(--height\);background:#3e63c6\}/, 'waterfall total columns must keep their full-strength ink');
  assert.match(css, /\.waterfall-segment\{bottom:var\(--offset\);height:var\(--value\);background:#7e97c9\}/, 'waterfall segments must keep their declared ink');
  assert.match(css, /\.waterfall-bridge\{display:flex;align-items:stretch;gap:8px;height:230px\}/, 'waterfall staircase canvas height must not shrink');
});
