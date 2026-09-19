import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { verifyDeliveredArtifact, issueVerificationStamp } from '../../skills/decision-first-dashboard/scripts/composition.js';
import { verifyDeliveredGeometry } from '../../skills/decision-first-dashboard/scripts/geometry-verifier.js';
import { requiredRelationshipPaths } from '../../skills/decision-first-dashboard/scripts/relationship-grammar.js';

const worthiness = JSON.parse(fs.readFileSync(new URL('./fixtures/worthiness/dashboard.worthiness.json', import.meta.url), 'utf8'));

function makeBundle(state) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr45-step4-'));
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

function codesOf(result) {
  return (result.errors ?? []).map((error) => error.code);
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
    rows.push({ nodeId, label: texts[1] ?? texts[0], value: numeric(texts[texts.length - 1]), width: width === undefined ? null : Number(width) });
  }
  return rows;
}

function restampedValidation({ html, svg, manifest, mutate }) {
  const tampered = mutate({ html, svg, manifest: structuredClone(manifest) });
  delete tampered.manifest.verification;
  tampered.manifest.verification = issueVerificationStamp({ html: tampered.html, svg: tampered.svg, manifest: tampered.manifest });
  return verifyDeliveredArtifact({ html: tampered.html, svg: tampered.svg, manifest: tampered.manifest });
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

const roiSingleState = {
  mode: 'no_score',
  signals: [
    { metric: 'roi_sugar_cookies', label: 'Sugar Cookies ROI', value: '1109%', provenance: 'source' },
    { metric: 'roi_brownies', label: 'Brownies ROI', value: '163%', provenance: 'source' },
    { metric: 'roi_caramel', label: 'Salted Caramel ROI', value: '104%', provenance: 'source' }
  ],
  semanticNodes: [
    { id: 'roi_all', type: 'Ranking', title: 'Product ROI spread', items: [roiItem('Sugar Cookies', '1109%'), roiItem('Brownies', '163%'), roiItem('Salted Caramel Chocolate', '104%')] }
  ],
  relationships: [{
    id: 'product_roi',
    relationType: 'comparison',
    subjectRefs: ['roi_all'],
    provenance: 'source',
    comparison: { metricIdentity: 'product_roi' }
  }]
};
const roiSingleSelections = [{ id: 'roi_all', type: 'Ranking', presentation: 'full_ranking' }];

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
const breakdownSummarySelections = [{ id: 'hours_breakdown', type: 'Breakdown', presentation: 'summary' }];

const signedComparability = { unit: 'percent', comparisonGroup: 'margin_pct', comparabilityDomain: 'margin_pct', normalization: 'raw' };
const signedItem = (label, value) => ({ label, value, provenance: 'source', comparability: signedComparability });
const negativeCenteredState = {
  mode: 'no_score',
  signals: [
    { metric: 'margin_peak', label: 'Margin peak', value: '50%', provenance: 'source' },
    { metric: 'margin_floor', label: 'Margin floor', value: '-20%', provenance: 'source' },
    { metric: 'margin_now', label: 'Margin now', value: '12%', provenance: 'source' }
  ],
  semanticNodes: [
    { id: 'margin_range', type: 'Ranking', title: 'Margin range', items: [signedItem('Gross margin', '50%'), signedItem('Return drag', '-20%'), signedItem('Current margin', '12%')] }
  ],
  relationships: [{
    id: 'margin_pct',
    relationType: 'comparison',
    subjectRefs: ['margin_range'],
    provenance: 'source',
    comparison: { metricIdentity: 'margin_pct' }
  }]
};
const marginSelections = [{ id: 'margin_range', type: 'Ranking', presentation: 'full_ranking' }];

const FUTURE_GEOMETRY_CODES = [
  'DELIVERED_SCALE_MAP_MISMATCH',
  'SCALE_MAP_GEOMETRY_MISMATCH',
  'DELIVERED_GEOMETRY_DECLARATION_MISMATCH',
  'SCALE_MAP_DECLARATION_MISSING',
  'DELIVERED_SCALE_MAP_MISSING'
];

test('T4-1: a canonical shared-scale artifact passes the independent verifier and the official stamp algorithm is reusable', () => {
  const compiled = compileState(roiSplitState, roiSplitSelections);
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors ?? []));
  assert.deepEqual(verifyDeliveredGeometry({ html: compiled.html, svg: compiled.svg, delivery: compiled.manifest.delivery }), []);
  assert.ok(/data-plot-track="true"/.test(compiled.svg), 'shared-scale nodes must disclose their drawable-span anchor in SVG');
  const unstamped = structuredClone(compiled.manifest);
  delete unstamped.verification;
  assert.deepEqual(issueVerificationStamp({ html: compiled.html, svg: compiled.svg, manifest: unstamped }), compiled.manifest.verification);
});

test('T4-2: literal Bakery pins - the delivered HTML percentages and SVG widths are the hardcoded shared-map values', () => {
  const compiled = compileState(roiSplitState, roiSplitSelections);
  assert.equal(compiled.result.valid, true);
  const BAKERY_HTML_PCT = { 1109: 100.0, 753: 67.9, 163: 14.7, 104: 9.4 };
  const BAKERY_SVG_PX = { 1109: 442.0, 753: 300.1, 163: 65.0, 104: 41.4 };
  for (const nodeId of ['roi_high', 'roi_low']) {
    for (const row of htmlBarPercents(compiled.html, nodeId)) {
      assert.equal(row.percent, BAKERY_HTML_PCT[row.value], `HTML percent for ${row.value} must equal the hardcoded pin`);
    }
  }
  for (const row of svgBarGeometry(compiled.svg, ['roi_high', 'roi_low'])) {
    assert.equal(row.width, BAKERY_SVG_PX[row.value], `SVG width for ${row.value} must equal the hardcoded pin`);
  }
});

test('T4-3: the verifier is a separate mathematical code path from the renderer', () => {
  const verifierSource = fs.readFileSync(new URL('../../skills/decision-first-dashboard/scripts/geometry-verifier.js', import.meta.url), 'utf8');
  const rendererSource = fs.readFileSync(new URL('../../skills/decision-first-dashboard/scripts/render-semantic.js', import.meta.url), 'utf8');
  assert.ok(!/^\s*import[^;\n]*render-semantic/m.test(verifierSource), 'the verifier must not import anything from the renderer');
  assert.ok(!/^\s*import\s/m.test(verifierSource), 'the verifier imports no module at all, so it shares no math code path with the renderer');
  assert.ok(!/evaluateDeclaredMagnitude\s*\(/.test(verifierSource), 'the verifier must not call the renderer evaluator');
  assert.ok(!/magnitudeFraction|magnitudePercent|magnitudeWidth/.test(verifierSource), 'the verifier must not reuse renderer magnitude helpers');
  assert.ok(!/geometry-verifier|verifyDeliveredGeometry/.test(rendererSource), 'the renderer must not consume the verifier');
});

test('T4-4: mutation A1 (HTML-only --value lie) is caught after an honest re-stamp with the official algorithm', () => {
  const compiled = compileState(roiSplitState, roiSplitSelections);
  assert.equal(compiled.result.valid, true);
  const baseline = restampedValidation({
    html: compiled.html,
    svg: compiled.svg,
    manifest: compiled.manifest,
    mutate: (input) => input
  });
  assert.equal(baseline.valid, true, JSON.stringify(codesOf(baseline)));

  const result = restampedValidation({
    html: compiled.html,
    svg: compiled.svg,
    manifest: compiled.manifest,
    mutate: (input) => ({ ...input, html: input.html.replace('--value:14.7%', '--value:99%') })
  });
  assert.equal(result.valid, false, 'an HTML bar redrawn to 99% for a 14.7% member must fail');
  const codes = codesOf(result);
  assert.ok(codes.includes('DELIVERED_SCALE_MAP_MISMATCH'), JSON.stringify(codes));
  assert.ok(!codes.includes('VERIFICATION_STAMP_MISMATCH'), `the re-stamp was legitimate, so only the geometry verifier can catch the lie: ${JSON.stringify(codes)}`);
});

test('T4-5: HTML tolerance boundary pins - 67.95 passes, 68.2 fails against expected 67.899 (inclusive at the cap)', () => {
  const compiled = compileState(roiSplitState, roiSplitSelections);
  const delivery = compiled.manifest.delivery;
  const pass = verifyDeliveredGeometry({ html: compiled.html.replace('--value:67.9%', '--value:67.95%'), svg: compiled.svg, delivery });
  assert.deepEqual(pass.map((error) => error.code), [], '67.95 vs expected 67.899 (delta 0.051pp) sits inside the inclusive 0.1pp + 0.051pp serialization budget');
  const fail = verifyDeliveredGeometry({ html: compiled.html.replace('--value:67.9%', '--value:68.2%'), svg: compiled.svg, delivery });
  assert.deepEqual(fail.map((error) => error.code), ['DELIVERED_SCALE_MAP_MISMATCH'], '68.2 vs 67.899 (delta 0.301pp) must exceed the tolerance');
});

test('T4-6: mutation A2 (SVG-only width lie) - sub-tolerance survives, doubled tolerance is caught after re-stamp', () => {
  const compiled = compileState(roiSplitState, roiSplitSelections);
  const delivery = compiled.manifest.delivery;
  const withinTolerance = verifyDeliveredGeometry({ html: compiled.html, svg: compiled.svg.replace('width="300.1"', 'width="300.2"'), delivery });
  assert.deepEqual(withinTolerance.map((error) => error.code), [], 'a 0.087px deviation is below the normalized 0.151px budget');
  const beyondTolerance = verifyDeliveredGeometry({ html: compiled.html, svg: compiled.svg.replace('width="300.1"', 'width="300.5"'), delivery });
  assert.ok(beyondTolerance.some((error) => error.code === 'SCALE_MAP_GEOMETRY_MISMATCH'), 'a deviation of more than twice the tolerance must fail');
  const result = restampedValidation({
    html: compiled.html,
    svg: compiled.svg,
    manifest: compiled.manifest,
    mutate: (input) => ({ ...input, svg: input.svg.replace('width="300.1"', 'width="300.5"') })
  });
  assert.equal(result.valid, false);
  const codes = codesOf(result);
  assert.ok(codes.includes('SCALE_MAP_GEOMETRY_MISMATCH'), JSON.stringify(codes));
  assert.ok(!codes.includes('VERIFICATION_STAMP_MISMATCH'), `the re-stamp was legitimate: ${JSON.stringify(codes)}`);
});

test('T4-7: mutation A3 (coherent two-channel lie) fails because geometry is compared to the declaration, not HTML to SVG', () => {
  const compiled = compileState(roiSplitState, roiSplitSelections);
  const result = restampedValidation({
    html: compiled.html,
    svg: compiled.svg,
    manifest: compiled.manifest,
    mutate: (input) => ({
      html: input.html.replace('--value:14.7%', '--value:100.0%'),
      svg: input.svg.replace('width="65.0"', 'width="442.0"'),
      manifest: input.manifest
    })
  });
  assert.equal(result.valid, false, '163 drawn as long as 1109 in both channels must fail against the declared map');
  const codes = codesOf(result);
  assert.ok(codes.includes('DELIVERED_SCALE_MAP_MISMATCH'), `HTML channel must fire: ${JSON.stringify(codes)}`);
  assert.ok(codes.includes('SCALE_MAP_GEOMETRY_MISMATCH'), `SVG channel must fire: ${JSON.stringify(codes)}`);
  assert.ok(!codes.includes('VERIFICATION_STAMP_MISMATCH'), `the re-stamp was legitimate: ${JSON.stringify(codes)}`);
});

test('T4-8: mutation A4 (primitive removal) fails closed with precise missing-primitive codes, never a silent skip', () => {
  const compiled = compileState(roiSplitState, roiSplitSelections);
  const svgBarless = restampedValidation({
    html: compiled.html,
    svg: compiled.svg,
    manifest: compiled.manifest,
    mutate: (input) => ({ ...input, svg: input.svg.replace(/<rect[^>]*width="65\.0"[^>]*\/>/, '') })
  });
  assert.equal(svgBarless.valid, false);
  let codes = codesOf(svgBarless);
  assert.ok(codes.includes('DELIVERED_SVG_GEOMETRY_UNREADABLE'), JSON.stringify(codes));
  assert.ok(!codes.includes('DELIVERED_SVG_SCALE_MEMBER_MISSING'), 'the member is still displayed, so only the primitive is unreadable');

  const htmlBarless = restampedValidation({
    html: compiled.html,
    svg: compiled.svg,
    manifest: compiled.manifest,
    mutate: (input) => ({ ...input, html: input.html.replace(/<i class="visual-bar"[^>]*style="--value:14\.7%"[^>]*><\/i>/, '') })
  });
  assert.equal(htmlBarless.valid, false);
  codes = codesOf(htmlBarless);
  assert.ok(codes.includes('DELIVERED_HTML_GEOMETRY_UNREADABLE'), JSON.stringify(codes));
  assert.ok(!codes.includes('DELIVERED_HTML_SCALE_MEMBER_MISSING'), 'the member row remains, so only the magnitude bar is unreadable');

  const delivery = compiled.manifest.delivery;
  const cardless = verifyDeliveredGeometry({
    html: compiled.html.replace(/<section[^>]*data-semantic-node="roi_low"[\s\S]*?<\/section>/, ''),
    svg: compiled.svg,
    delivery
  });
  codes = cardless.map((error) => error.code);
  assert.ok(codes.includes('DELIVERED_HTML_SCALE_MEMBER_MISSING'), `a declared member removed entirely must report MEMBER_MISSING: ${JSON.stringify(codes)}`);
  assert.ok(!codes.includes('DELIVERED_SVG_SCALE_MEMBER_MISSING'), 'the SVG channel is untouched');
});

function withScaleManifest(manifest, transform) {
  const mutated = structuredClone(manifest);
  for (const node of mutated.delivery.nodes) {
    if (node.visualSpec?.scale?.type === 'shared' && node.visualSpec?.scale?.domain === 'relationship') {
      node.visualSpec.scale = transform(node.id, structuredClone(node.visualSpec.scale));
    }
  }
  return mutated;
}

test('T4-9: an unsupported or contradictory delivered declaration fails closed before any geometry is trusted', () => {
  const compiled = compileState(roiSingleState, roiSingleSelections);
  assert.equal(compiled.result.valid, true);
  const args = { html: compiled.html, svg: compiled.svg };

  const logMap = verifyDeliveredGeometry({ ...args, delivery: withScaleManifest(compiled.manifest, (id, scale) => ({ ...scale, mapType: 'log' })).delivery });
  assert.deepEqual(logMap.map((error) => error.code), ['DELIVERED_GEOMETRY_DECLARATION_MISMATCH'], 'a log map is outside the frozen profile and must abort verification for that scale');

  const centeredDomain = verifyDeliveredGeometry({ ...args, delivery: withScaleManifest(compiled.manifest, (id, scale) => ({ ...scale, valueDomain: [-10, 1109] })).delivery });
  assert.deepEqual(centeredDomain.map((error) => error.code), ['DELIVERED_GEOMETRY_DECLARATION_MISMATCH'], 'valueDomain[0] must be pinned to exactly 0 (negative-centered profiles are not half-supported)');

  const driftedBaseline = verifyDeliveredGeometry({ ...args, delivery: withScaleManifest(compiled.manifest, (id, scale) => ({ ...scale, baseline: 5 })).delivery });
  assert.deepEqual(driftedBaseline.map((error) => error.code), ['DELIVERED_GEOMETRY_DECLARATION_MISMATCH'], 'baseline must stay pinned at 0');

  const stripped = verifyDeliveredGeometry({ ...args, delivery: withScaleManifest(compiled.manifest, () => ({ type: 'shared', domain: 'relationship' })).delivery });
  assert.deepEqual(stripped.map((error) => error.code), ['SCALE_MAP_DECLARATION_MISSING'], 'a shared relationship scale with no canonical declaration fails closed');
});

test('T4-10: displayed members outside the declared domain fail the verifier independently in both channels', () => {
  const compiled = compileState(roiSingleState, roiSingleSelections);
  const result = verifyDeliveredGeometry({
    html: compiled.html,
    svg: compiled.svg,
    delivery: withScaleManifest(compiled.manifest, (id, scale) => ({ ...scale, valueDomain: [0, 50] })).delivery
  });
  const codes = result.map((error) => error.code);
  assert.ok(codes.includes('DELIVERED_HTML_VALUE_OUTSIDE_DOMAIN'), JSON.stringify(codes));
  assert.ok(codes.includes('DELIVERED_SVG_VALUE_OUTSIDE_DOMAIN'), JSON.stringify(codes));
  assert.ok(!codes.includes('DELIVERED_SCALE_MAP_MISMATCH'), 'out-of-domain members must not be normalized and compared, only rejected');
});

test('T4-11: cross-node equal values on one shared scale receive one literal-pinned normalized magnitude in both channels', () => {
  const compiled = compileState(roiEqualState, roiEqualSelections);
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors ?? []));
  assert.deepEqual(verifyDeliveredGeometry({ html: compiled.html, svg: compiled.svg, delivery: compiled.manifest.delivery }), []);
  const BAKERY_EQUAL_HTML_PCT = { 200: 100.0, 150: 75.0, 90: 45.0 };
  const BAKERY_EQUAL_SVG_PX = { 200: 442.0, 150: 331.5, 90: 198.9 };
  for (const nodeId of ['roi_node_a', 'roi_node_b']) {
    for (const row of htmlBarPercents(compiled.html, nodeId)) {
      assert.equal(row.percent, BAKERY_EQUAL_HTML_PCT[row.value], `HTML percent pin for ${row.value}`);
    }
  }
  const rows = svgBarGeometry(compiled.svg, ['roi_node_a', 'roi_node_b']);
  for (const row of rows) {
    assert.equal(row.width, BAKERY_EQUAL_SVG_PX[row.value], `SVG width pin for ${row.value}`);
  }
  const peakRows = rows.filter((row) => row.value === 200);
  assert.equal(peakRows.length, 2);
  assert.equal(peakRows[0].width, peakRows[1].width, 'the same value under the same scaleId must draw identically across nodes');
});

test('T4-12: local-scale nodes never enter shared-scale verification', () => {
  const compiled = compileState(breakdownState, breakdownSelections);
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors ?? []));
  const scale = compiled.manifest.delivery.nodes.find((node) => node.id === 'hours_breakdown').visualSpec.scale;
  assert.equal(scale.type, 'local');
  assert.notEqual(scale.domain, 'relationship');
  assert.ok(/width="/.test(compiled.svg), 'the control still delivers real bars, it just keeps node-local normalization');
  assert.ok(!/data-plot-track="true"/.test(compiled.svg), 'local-scale nodes must not disclose a shared-map anchor');
  assert.deepEqual(verifyDeliveredGeometry({ html: compiled.html, svg: compiled.svg, delivery: compiled.manifest.delivery }), []);
});

test('T4-13: text-only deliveries are unaffected by the geometry verifier', () => {
  const compiled = compileState(breakdownState, breakdownSummarySelections);
  assert.equal(compiled.result.valid, true, JSON.stringify(compiled.result.errors ?? []));
  assert.ok(!/data-visual-mark-item="bar"/.test(compiled.html), 'the summary presentation carries no magnitude bars');
  assert.deepEqual(verifyDeliveredGeometry({ html: compiled.html, svg: compiled.svg, delivery: compiled.manifest.delivery }), []);
});

test('T4-14: the scale builder refuses to declare a domain outside the frozen profile (negative-centered members fail closed at the build layer)', () => {
  const compiled = compileState(negativeCenteredState, marginSelections);
  assert.equal(compiled.result.valid, false, 'a comparison domain with a negative member cannot be hosted by the frozen linear/domain_max profile');
  const codes = (compiled.result.errors ?? []).map((error) => error.code);
  assert.ok(codes.includes('SHARED_SCALE_PROFILE_UNSUPPORTED'), JSON.stringify(codes));
});

test('T4-15: the verifier only inspects shared relationship scales and reports nothing for the untouched baseline', () => {
  const compiled = compileState(roiSingleState, roiSingleSelections);
  assert.equal(compiled.result.valid, true);
  assert.deepEqual(verifyDeliveredGeometry({ html: compiled.html, svg: compiled.svg, delivery: compiled.manifest.delivery }), []);
  assert.deepEqual(verifyDeliveredGeometry({ html: compiled.html, svg: compiled.svg, delivery: { nodes: [] } }), []);
  assert.deepEqual(verifyDeliveredGeometry({ html: '', svg: '', delivery: null }), []);
  const noFutures = FUTURE_GEOMETRY_CODES;
  assert.equal(noFutures.every((code) => typeof code === 'string'), true);
});
