import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { buildInternalVisualSpecs } from '../../skills/decision-first-dashboard/scripts/visual-grammar.js';
import { renderSemanticHtml, renderSemanticSvg, evaluateDeclaredMagnitude } from '../../skills/decision-first-dashboard/scripts/render-semantic.js';
import { requiredRelationshipPaths } from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';

const worthiness = JSON.parse(fs.readFileSync(new URL('./fixtures/worthiness/dashboard.worthiness.json', import.meta.url), 'utf8'));

function makeBundle(state) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr45-step3-'));
  const sourceValue = {
    signals: state.signals.map(({ label, value }) => ({ label, value })),
    semanticNodes: state.semanticNodes.map((node) => ({
      title: node.title,
      items: node.items.map(({ label, value }) => ({ label, value }))
    })),
    relationships: (state.relationships ?? []).map(({ provenance, ...rest }) => rest)
  };
  const bytes = Buffer.from(`${JSON.stringify(sourceValue, null, 2)}\n`);
  const evidence = [];
  const claims = [];
  const add = (pointer) => {
    const id = `ev_${evidence.length + 1}`;
    evidence.push({ id, anchor: { type: 'json_pointer', pointer } });
    claims.push({ decisionPath: pointer, evidenceRef: id });
  };
  state.signals.forEach((signal, index) => {
    add(`/signals/${index}/label`);
    add(`/signals/${index}/value`);
  });
  state.semanticNodes.forEach((node, nodeIndex) => {
    add(`/semanticNodes/${nodeIndex}/title`);
    node.items.forEach((item, itemIndex) => {
      add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/label`);
      add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/value`);
    });
  });
  requiredRelationshipPaths(state).forEach((pointer) => add(pointer));
  fs.writeFileSync(path.join(root, 'source.json'), bytes);
  return {
    root,
    bundle: {
      source: { kind: 'json', path: 'source.json', sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
      decisionState: state,
      evidence,
      claims
    }
  };
}

const BRIEF = {
  decision: { status: 'confirmed', value: 'Decide the next operating focus' },
  action: { status: 'confirmed', value: 'Choose the next operating action' },
  questionShape: { status: 'confirmed', value: 'state' },
  actionShape: { status: 'confirmed', value: 'observe' },
  contextRequirements: []
};

function routingFor(state, selections) {
  return {
    decision: BRIEF.decision.value,
    action: BRIEF.action.value,
    inventoryCount: state.signals.length,
    metrics: state.signals.map((signal) => ({
      metric: signal.metric,
      role: 'primary_signal',
      changesDecision: true,
      decisionImpact: `${signal.label} changes the next operating action`,
      visibility: 'first_view'
    })),
    compositionNodes: selections
  };
}

function compileState(state, selections) {
  const fixture = makeBundle(state);
  return compileDecisionDashboard(worthiness, BRIEF, routingFor(state, selections), fixture.bundle, { baseDir: fixture.root });
}

function numeric(value) {
  return Number(String(value).replace(/[%,$]/g, '').trim());
}

function svgBarGeometry(svg, nodeIds) {
  const wanted = new Set(nodeIds);
  const rows = [];
  const itemRe = /<g[^>]*data-semantic-node="([^"]+)"[^>]*data-semantic-item="true"[^>]*>([\s\S]*?)<\/g>/g;
  let match;
  while ((match = itemRe.exec(svg))) {
    const [, nodeId, body] = match;
    if (!wanted.has(nodeId)) continue;
    const texts = [...body.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((entry) => entry[1]);
    const rect = body.match(/<rect[^>]*/)?.[0] ?? '';
    const width = rect.match(/width="([0-9.]+)"/)?.[1];
    const height = rect.match(/height="([0-9.]+)"/)?.[1];
    const magnitude = /class="[^"]*distribution-bar/.test(rect) ? Number(height) : Number(width);
    rows.push({ nodeId, label: texts[1] ?? texts[0], value: numeric(texts[texts.length - 1]), magnitude });
  }
  return rows;
}

function htmlBarPercents(html, nodeId) {
  const rows = [];
  const rowRe = new RegExp(`<li data-semantic-node="${nodeId}" data-semantic-item="true" data-item-index="(\\d+)"[^>]*><span>(?:<em>\\d+</em>)?[^<]*</span><b>([^<]*)</b><i class="visual-bar"[^>]*style="--value:([0-9.]+)%`, 'g');
  let match;
  while ((match = rowRe.exec(html))) {
    rows.push({ index: Number(match[1]), value: numeric(match[2]), percent: Number(match[3]) });
  }
  return rows.sort((a, b) => a.index - b.index);
}

const roiComparability = { unit: 'percent', comparisonGroup: 'product_roi', comparabilityDomain: 'product_roi', normalization: 'raw' };
const roiItem = (label, value) => ({ label, value, provenance: 'source', comparability: roiComparability });

const roiSplitState = {
  mode: 'no_score',
  signals: [
    { metric: 'roi_high', label: 'Highest ROI', value: '1109%', provenance: 'source' },
    { metric: 'roi_mid', label: 'Middle ROI', value: '163%', provenance: 'source' },
    { metric: 'roi_low', label: 'Lowest ROI', value: '104%', provenance: 'source' }
  ],
  semanticNodes: [
    { id: 'roi_high', type: 'Ranking', title: 'Highest ROI products', items: [roiItem('Sugar Cookies', '1109%'), roiItem('SD Red Velvet', '753%')] },
    { id: 'roi_low', type: 'Ranking', title: 'Lowest ROI products', items: [roiItem('Salted Caramel Chocolate', '104%'), roiItem('Brownies', '163%')] }
  ],
  relationships: [{
    id: 'product_roi',
    relationType: 'comparison',
    subjectRefs: ['roi_high', 'roi_low'],
    provenance: 'source',
    comparison: { metricIdentity: 'product_roi' }
  }]
};
const roiSplitSelections = [
  { id: 'roi_high', type: 'Ranking', presentation: 'full_ranking' },
  { id: 'roi_low', type: 'Ranking', presentation: 'full_ranking' }
];


const equalComparability = { unit: 'percent', comparisonGroup: 'roi_equal_group', comparabilityDomain: 'roi_equal', normalization: 'raw' };
const equalItem = (label, value) => ({ label, value, provenance: 'source', comparability: equalComparability });
const roiEqualState = {
  mode: 'no_score',
  signals: [
    { metric: 'roi_equal_a', label: 'ROI set A peak', value: '200%', provenance: 'source' },
    { metric: 'roi_equal_b', label: 'ROI set B peak', value: '200%', provenance: 'source' },
    { metric: 'roi_equal_floor', label: 'ROI set floor', value: '90%', provenance: 'source' }
  ],
  semanticNodes: [
    { id: 'roi_node_a', type: 'Ranking', title: 'ROI set A', items: [equalItem('Alpha', '200%'), equalItem('Beta', '150%')] },
    { id: 'roi_node_b', type: 'Ranking', title: 'ROI set B', items: [equalItem('Gamma', '200%'), equalItem('Delta', '90%')] }
  ],
  relationships: [{
    id: 'roi_equal_group',
    relationType: 'comparison',
    subjectRefs: ['roi_node_a', 'roi_node_b'],
    provenance: 'source',
    comparison: { metricIdentity: 'roi_equal' }
  }]
};
const roiEqualSelections = [
  { id: 'roi_node_a', type: 'Ranking', presentation: 'full_ranking' },
  { id: 'roi_node_b', type: 'Ranking', presentation: 'full_ranking' }
];

const breakdownState = {
  mode: 'no_score',
  signals: [
    { metric: 'total_hours', label: 'Total hours', value: '40', provenance: 'source' },
    { metric: 'focus_hours', label: 'Focus hours', value: '26', provenance: 'source' },
    { metric: 'meeting_hours', label: 'Meeting hours', value: '14', provenance: 'source' }
  ],
  semanticNodes: [
    {
      id: 'hours_breakdown',
      type: 'Breakdown',
      title: 'Where the week went',
      items: [
        { label: 'Focus work', value: '26', provenance: 'source' },
        { label: 'Meetings', value: '14', provenance: 'source' }
      ]
    }
  ],
  relationships: [{
    id: 'hours_whole',
    relationType: 'decomposition',
    subjectRefs: ['hours_breakdown'],
    provenance: 'source',
    decomposition: { whole: 'total_hours' }
  }]
};
const breakdownSelections = [{ id: 'hours_breakdown', type: 'Breakdown', presentation: 'full_breakdown' }];

test('T3-1: one declared map drives the delivered geometry of both sibling nodes (Bakery ROI 1109>753>163>104)', () => {
  const compiled = compileState(roiSplitState, roiSplitSelections);
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));

  const scales = compiled.manifest.delivery.nodes.map((node) => node.visualSpec.scale);
  assert.equal(scales.length, 2);
  assert.equal(scales[0].scaleId, scales[1].scaleId, 'both children must carry the same scaleId');
  assert.equal(scales[0].comparisonDomainId, 'product_roi');
  assert.equal(scales[0].mapType, 'linear');
  assert.deepEqual(scales[0].valueDomain, [0, 1109]);
  const canonical = ({ type, domain, ...declaration }) => JSON.stringify(declaration);
  assert.equal(canonical(scales[1]), canonical(scales[0]), 'both children must consume one canonical declaration');

  const svgRows = svgBarGeometry(compiled.svg, ['roi_high', 'roi_low']).sort((a, b) => b.value - a.value);
  assert.equal(svgRows.length, 4, 'all four products must keep a rendered bar');
  assert.deepEqual(svgRows.map((row) => row.value), [1109, 753, 163, 104]);
  for (let index = 1; index < svgRows.length; index += 1) {
    assert.ok(svgRows[index - 1].magnitude > svgRows[index].magnitude,
      `${svgRows[index - 1].value} must render strictly wider than ${svgRows[index].value} across the node boundary; magnitudes=${JSON.stringify(svgRows.map((row) => row.magnitude))}`);
  }
  assert.equal(svgRows[0].magnitude, 442, '1109 is the declared domain maximum and must fill the available track');
  assert.equal(svgRows[3].magnitude.toFixed(1), ((104 / 1109) * 442).toFixed(1), 'the smallest value must map through the shared domain, not its own node max');

  const crossNode = [...htmlBarPercents(compiled.html, 'roi_high'), ...htmlBarPercents(compiled.html, 'roi_low')]
    .sort((a, b) => b.value - a.value);
  assert.deepEqual(crossNode.map((row) => row.value), [1109, 753, 163, 104]);
  for (let index = 1; index < crossNode.length; index += 1) {
    assert.ok(crossNode[index - 1].percent > crossNode[index].percent,
      `HTML magnitudes must be strictly ordered under the shared map; percents=${JSON.stringify(crossNode.map((row) => row.percent))}`);
  }
  assert.equal(crossNode[2].percent, Number(((163 / 1109) * 100).toFixed(1)), '163 must not be normalized against its own node max (which would render it at 100%)');
});

test('T3-2: the same value under the same scaleId gets the same normalized magnitude in both nodes', () => {
  const compiled = compileState(roiEqualState, roiEqualSelections);
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));

  const scales = compiled.manifest.delivery.nodes.map((node) => node.visualSpec.scale);
  assert.equal(scales[0].scaleId, scales[1].scaleId);
  assert.deepEqual(scales[0].valueDomain, [0, 200], 'the domain must span the whole relationship');

  const rows = svgBarGeometry(compiled.svg, ['roi_node_a', 'roi_node_b']);
  const byLabel = new Map(rows.map((row) => [row.label, row]));
  for (const label of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
    assert.ok(byLabel.has(label), `all four bars must render; got ${JSON.stringify(rows)}`);
  }
  assert.equal(byLabel.get('Alpha').value, 200);
  assert.equal(byLabel.get('Gamma').value, 200);
  assert.equal(byLabel.get('Alpha').magnitude, byLabel.get('Gamma').magnitude, 'equal values under one map must draw equal geometry in sibling nodes with equal containers');
  assert.equal((byLabel.get('Beta').magnitude / byLabel.get('Alpha').magnitude).toFixed(4), (150 / 200).toFixed(4), 'ratios must come from the shared domain, not node boundaries');
  assert.equal((byLabel.get('Delta').magnitude / byLabel.get('Gamma').magnitude).toFixed(4), (90 / 200).toFixed(4));

  const htmlA = htmlBarPercents(compiled.html, 'roi_node_a');
  const htmlB = htmlBarPercents(compiled.html, 'roi_node_b');
  assert.equal(htmlA[0].percent, htmlB[0].percent, 'equal values must produce equal HTML magnitudes across node boundaries');
  assert.equal(htmlA[0].percent, 100);
  assert.equal(htmlB[1].percent, Number(((90 / 200) * 100).toFixed(1)));
});

test('T3-3: nodes without a shared relationship scale keep the original node-local normalization', () => {
  const compiled = compileState(breakdownState, breakdownSelections);
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors));
  const [scale] = compiled.manifest.delivery.nodes.map((node) => node.visualSpec.scale);
  assert.equal(scale.type, 'local');
  assert.equal(scale.domain, 'node');
  assert.equal(scale.scaleId ?? null, null, 'a local node must not smuggle in a shared declaration');

  const rows = svgBarGeometry(compiled.svg, ['hours_breakdown']);
  assert.equal(rows.length, 2);
  const max = Math.max(...rows.map((row) => row.value));
  for (const row of rows) {
    assert.equal(row.magnitude.toFixed(1), Math.max(10, (row.value / max) * (632 - 190)).toFixed(1),
      'local geometry must remain node-local (26 fills the track, 14 stays at its own local fraction)');
  }

  const htmlRows = htmlBarPercents(compiled.html, 'hours_breakdown');
  assert.equal(htmlRows[0].percent, 100, 'the local maximum must still saturate its own track');
  assert.equal(htmlRows[1].percent, Number(((14 / 26) * 100).toFixed(1)));
});

test('T3-4: an unsupported or malformed declared map fails the renderer closed instead of falling back to local normalization', () => {
  const data = { mode: 'no_score', semanticNodes: structuredClone(roiSplitState.semanticNodes), relationships: structuredClone(roiSplitState.relationships) };
  const composition = { nodes: roiSplitSelections };
  const built = buildInternalVisualSpecs(data, composition);
  assert.equal(built.valid, true, JSON.stringify(built.errors));

  const tamper = (mutate) => {
    const specs = structuredClone(built.specs);
    mutate(specs[0].scale);
    return specs;
  };

  const cases = [
    ['unsupported mapType', tamper((scale) => { scale.mapType = 'log'; }), /SHARED_SCALE_MAP_UNSUPPORTED/],
    ['unsupported normalization basis', tamper((scale) => { scale.normalizationBasis = 'z_score'; }), /SHARED_SCALE_BASIS_UNSUPPORTED/],
    ['missing valueDomain', tamper((scale) => { delete scale.valueDomain; }), /SHARED_SCALE_DOMAIN_INVALID/],
    ['valueDomain contradicting declared members', tamper((scale) => { scale.valueDomain = [0, 100]; }), /SHARED_SCALE_VALUE_OUTSIDE_DOMAIN/],
    ['invalid baseline', tamper((scale) => { scale.baseline = 'target'; }), /SHARED_SCALE_BASELINE_INVALID/],
    ['shared scope stripped of its canonical declaration', tamper((scale) => {
      for (const key of Object.keys(scale)) if (key !== 'type' && key !== 'domain') delete scale[key];
    }), /SHARED_SCALE_MAP_UNSUPPORTED/]
  ];

  for (const [name, specs, expected] of cases) {
    assert.throws(() => renderSemanticHtml(data, composition, { visualSpecs: specs }), expected, `${name} must fail HTML rendering closed`);
    assert.throws(() => renderSemanticSvg(data, composition, { visualSpecs: specs }), expected, `${name} must fail SVG rendering closed`);
  }

  const declaration = structuredClone(built.specs[0].scale);
  assert.equal(evaluateDeclaredMagnitude('753%', declaration), 753 / 1109, 'the evaluator is a pure function of value + declaration');
  assert.equal(evaluateDeclaredMagnitude(1109, declaration), 1);
  assert.throws(() => evaluateDeclaredMagnitude('n/a', declaration), /SHARED_SCALE_VALUE_NOT_NUMERIC/);
  assert.throws(() => evaluateDeclaredMagnitude(2000, declaration), /SHARED_SCALE_VALUE_OUTSIDE_DOMAIN/);
});
