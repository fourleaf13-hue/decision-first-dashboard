import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { compileDecisionDashboard } from '../../skills/decision-first-dashboard/scripts/compile-dashboard.js';
import { verifyDeliveredArtifact } from '../../skills/decision-first-dashboard/scripts/composition.js';
import { captureCommitBinding, assertCommitBinding } from '../../scripts/acceptance-binding.mjs';

const worthiness = JSON.parse(fs.readFileSync(new URL('./fixtures/worthiness/dashboard.worthiness.json', import.meta.url), 'utf8'));
const horizonFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/horizon/horizon-reconstructed.fixture.json', import.meta.url), 'utf8'));
const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

const EVALUATIVE_VOCABULARY = /\b(improved|worsened|healthy|poor|needs attention|most worth discussing)\b/i;
const EVALUATIVE_RELABEL = /\b(anomaly|anomalous|problem|priority|needs attention)\b/i;
const FUTURE_GEOMETRY_CODES = [
  'DELIVERED_SCALE_MAP_MISMATCH',
  'SCALE_MAP_GEOMETRY_MISMATCH',
  'DELIVERED_GEOMETRY_DECLARATION_MISMATCH',
  'SCALE_MAP_DECLARATION_MISSING',
  'DELIVERED_SCALE_MAP_MISSING'
];
const FUTURE_EVALUATION_CODES = [
  'EVALUATIVE_CLAIM_WITHOUT_EVALUATION_EVIDENCE',
  'EVALUATION_EVIDENCE_KIND_REQUIRED',
  'CLAIM_EVIDENCE_KIND_INCOMPATIBLE'
];

function makeBundle(state, sourceExtra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr45-red-'));
  const sourceValue = {
    signals: state.signals.map(({ label, value }) => ({ label, value })),
    semanticNodes: state.semanticNodes.map((node) => ({
      title: node.title,
      items: node.items.map(({ label, value, detail }) => (detail === undefined ? { label, value } : { label, value, detail }))
    })),
    ...sourceExtra
  };
  const bytes = Buffer.from(`${JSON.stringify(sourceValue, null, 2)}\n`);
  const evidence = [];
  const claims = [];
  const idByPointer = {};
  const add = (pointer) => {
    const id = `ev_${evidence.length + 1}`;
    evidence.push({ id, anchor: { type: 'json_pointer', pointer } });
    claims.push({ decisionPath: pointer, evidenceRef: id });
    idByPointer[pointer] = id;
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
      if (item.detail !== undefined) add(`/semanticNodes/${nodeIndex}/items/${itemIndex}/detail`);
    });
  });
  (state.visibleClaims ?? []).forEach((claim, index) => {
    add(`/visibleClaims/${index}/text`);
  });
  fs.writeFileSync(path.join(root, 'source.json'), bytes);
  return {
    root,
    idByPointer,
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

function compileBundle(state, selections, sourceExtra = {}) {
  const fixture = makeBundle(state, sourceExtra);
  return { fixture, compiled: compileDecisionDashboard(worthiness, BRIEF, routingFor(state, selections), fixture.bundle, { baseDir: fixture.root }) };
}

function compileState(state, selections, sourceExtra = {}) {
  return compileBundle(state, selections, sourceExtra).compiled;
}

function numeric(value) {
  return Number(String(value).replace(/[%,$]/g, '').trim());
}

function renderedMagnitudes(svg, nodeIds) {
  const rows = [];
  for (const nodeId of nodeIds) {
    const start = svg.indexOf(`data-semantic-node="${nodeId}"`);
    if (start < 0) continue;
    const open = svg.lastIndexOf('<', start);
    const close = svg.indexOf('</g>\n<g data-semantic-node=', open);
    const chunk = svg.slice(open, close > 0 ? close : open + 30000);
    const itemRe = /<g[^>]*data-semantic-item="true"[^>]*>([\s\S]*?)<\/g>/g;
    let match;
    while ((match = itemRe.exec(chunk))) {
      const texts = [...match[1].matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((entry) => entry[1]);
      const widthMatch = match[1].match(/<rect[^>]*width="([0-9.]+)"[^>]*class="[^"]*(ranking-bar|distribution-bar|breakdown-bar)[^"]*"/);
      rows.push({
        nodeId,
        label: texts[1] ?? texts[0],
        value: numeric(texts[texts.length - 1]),
        width: widthMatch ? Number(widthMatch[1]) : null
      });
    }
  }
  return rows;
}

function scaleDeclarationPresent(compiled) {
  const scales = compiled.manifest.delivery.nodes.map((node) => node.visualSpec?.scale ?? {});
  return /data-scale-map-id="[^"]+"/.test(compiled.svg) ||
    /data-scale-map-id="[^"]+"/.test(compiled.html) ||
    scales.some((scale) => typeof scale.mapType === 'string' || typeof scale.scaleId === 'string');
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
  ]
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
  ]
};
const roiSingleSelections = [{ id: 'roi_all', type: 'Ranking', presentation: 'full_ranking' }];

const pctPairState = {
  mode: 'no_score',
  signals: [
    { metric: 'turnover_rate', label: 'Turnover Rate', value: '1.59%', provenance: 'source' },
    { metric: 'training_completion', label: 'Training Completion', value: '79.17%', provenance: 'source' },
    { metric: 'avg_appraisal', label: 'Avg Appraisal', value: '3.58', provenance: 'source' }
  ],
  semanticNodes: [
    { id: 'pct_pair', type: 'Ranking', title: 'Percent pair', items: [{ label: 'Turnover Rate', value: '1.59%', provenance: 'source' }, { label: 'Training Completion', value: '79.17%', provenance: 'source' }] }
  ]
};
const pctPairSelections = [{ id: 'pct_pair', type: 'Ranking', presentation: 'full_ranking' }];

const mixedUnitState = {
  mode: 'no_score',
  signals: [
    { metric: 'turnover_rate', label: 'Turnover Rate', value: '1.59%', provenance: 'source' },
    { metric: 'open_roles', label: 'Open Roles', value: '12', provenance: 'source' },
    { metric: 'avg_appraisal', label: 'Avg Appraisal', value: '3.58', provenance: 'source' }
  ],
  semanticNodes: [
    { id: 'mixed_units', type: 'Ranking', title: 'Mixed units', items: [{ label: 'Turnover Rate', value: '1.59%', provenance: 'source' }, { label: 'Open Roles', value: '12', provenance: 'source' }] }
  ]
};
const mixedUnitSelections = [{ id: 'mixed_units', type: 'Ranking', presentation: 'full_ranking' }];

const HORIZON_TYPES = { horizon_kpis: 'MetricCluster', headcount_trend: 'Trend', department_headcount: 'Breakdown' };
const EVALUATIVE_CLAIM_TEXT = 'Avg Appraisal is the KPI most worth discussing.';

function horizonState(withClaim = false) {
  const source = horizonFixture.source;
  const state = {
    mode: 'no_score',
    signals: source.signals.map((signal) => ({ ...signal, provenance: 'source' })),
    semanticNodes: source.semanticNodes.map((node) => ({
      ...node,
      type: HORIZON_TYPES[node.id],
      items: node.items.map((item) => ({ ...item, provenance: 'source' }))
    }))
  };
  if (withClaim) {
    state.visibleClaims = [{
      id: 'claim_appraisal_focus',
      claimType: 'metric_summary',
      scope: 'metric',
      text: EVALUATIVE_CLAIM_TEXT,
      evidenceRefs: []
    }];
  }
  return state;
}
const horizonSelections = [
  { id: 'horizon_kpis', type: 'MetricCluster', presentation: 'comparison' },
  { id: 'headcount_trend', type: 'Trend', presentation: 'full_chart' },
  { id: 'department_headcount', type: 'Breakdown', presentation: 'full_breakdown' }
];

test('fixture integrity: RECONSTRUCTED_HORIZON_REGRESSION preserves the snapshot contradiction and keeps legacy deltas ungrounded', () => {
  assert.equal(horizonFixture.fixtureName, 'RECONSTRUCTED_HORIZON_REGRESSION');
  assert.equal(horizonFixture.reconstruction.isOriginalBaseline, false);

  const inconsistency = horizonFixture.integrity.knownInconsistentSnapshot;
  assert.equal(inconsistency.marker, 'KNOWN_INCONSISTENT_SNAPSHOT');
  assert.equal(inconsistency.kpiPriorHeadcount, 172);
  assert.equal(inconsistency.trend2025Headcount, 177);
  assert.notEqual(inconsistency.kpiPriorHeadcount, inconsistency.trend2025Headcount);

  const kpiNode = horizonFixture.source.semanticNodes.find((node) => node.id === 'horizon_kpis');
  assert.equal(kpiNode.items[0].detail, 'prior 172');
  const trend = horizonFixture.source.semanticNodes.find((node) => node.id === 'headcount_trend');
  assert.equal(trend.items.find((item) => item.label === '2025').value, 177);

  const sourceJson = JSON.stringify(horizonFixture.source);
  for (const legacy of Object.values(horizonFixture.integrity.displayOnlyDeltas.legacyScreenshotDeltas)) {
    assert.ok(!sourceJson.includes(legacy), `legacy screenshot delta ${legacy} must not be a grounded source fact`);
  }

  const departments = horizonFixture.source.semanticNodes.find((node) => node.id === 'department_headcount');
  assert.equal(departments.items.reduce((sum, item) => sum + item.value, 0), 189);

  assert.equal(horizonFixture.integrity.adversarialPolarity.marker, 'POLARITY_UNKNOWN_BY_DESIGN');
  assert.deepEqual(horizonFixture.integrity.adversarialPolarity.notEstablishedBySource, ['decrease = favorable', 'decrease = unfavorable']);
  assert.equal(horizonFixture.integrity.nonEvidentialIntent.marker, 'NON_EVIDENTIAL_INTENT');
});

test('RED-1: two child nodes declaring one comparison domain must not silently keep independent local scales', () => {
  const compiled = compileState(roiSplitState, roiSplitSelections);
  const specs = compiled.manifest.delivery.nodes
    .filter((node) => node.id === 'roi_high' || node.id === 'roi_low')
    .map((node) => node.visualSpec);
  assert.equal(specs.length, 2, 'both ROI child nodes must be delivered for this contract probe');

  const independentLocalScales = specs.every((spec) => spec.scale?.type === 'local' && spec.scale?.domain === 'node');
  const oneDeclaredMap = scaleDeclarationPresent(compiled) &&
    new Set(specs.map((spec) => `${spec.scale?.scaleId ?? ''}|${spec.scale?.mapType ?? ''}`)).size === 1;
  assert.ok(
    compiled.result.valid === false || !independentLocalScales || oneDeclaredMap,
    `sibling nodes sharing comparisonGroup product_roi were permitted independent local scales: ${JSON.stringify(specs.map((spec) => spec.scale))}`
  );
});

test('RED-2: delivered magnitude encoding must declare one scale map and satisfy it monotonically', () => {
  const compiled = compileState(roiSplitState, roiSplitSelections);
  assert.ok(scaleDeclarationPresent(compiled), 'magnitude encoding exists but the artifact declares no scale map');

  const rows = renderedMagnitudes(compiled.svg, ['roi_high', 'roi_low']).filter((row) => row.width !== null);
  assert.ok(rows.length >= 4, 'expected rendered ranking bars for both ROI child nodes');
  const sorted = [...rows].sort((a, b) => a.value - b.value);
  for (let index = 1; index < sorted.length; index += 1) {
    assert.ok(sorted[index].width >= sorted[index - 1].width, `value ${sorted[index].value} rendered narrower than ${sorted[index - 1].value}`);
  }
});

test('RED-3: non-commensurate metrics cannot share magnitude encoding', () => {
  const compiled = compileState(mixedUnitState, mixedUnitSelections);
  assert.equal(compiled.result.valid, false, 'mixed percent/count ranking must fail closed before any shared magnitude encoding');
});

test('RED-4: same unit with different metric identity must not become commensurate', () => {
  const compiled = compileState(pctPairState, pctPairSelections);
  const spec = compiled.manifest.delivery.nodes.find((node) => node.id === 'pct_pair')?.visualSpec;
  assert.ok(spec, 'pct_pair node must be delivered for this contract probe');
  assert.ok(
    compiled.result.valid === false || spec.mark === 'metric_tile' || spec.scale?.type === 'independent',
    `Turnover Rate % and Training Completion % share unit percent but are different metrics; shared magnitude encoding was granted: ${JSON.stringify({ mark: spec.mark, scale: spec.scale, comparability: spec.comparability })}`
  );
});

function errorCodes(result) {
  return Array.isArray(result?.errors) ? result.errors.map((entry) => entry.code) : [];
}

function horizonEvaluativeClaimBundle() {
  const state = horizonState(true);
  const fixture = makeBundle(state, { observations: [{ text: EVALUATIVE_CLAIM_TEXT }] });
  const notePointer = '/observations/0/text';
  const textPointer = '/visibleClaims/0/text';
  for (const claim of fixture.bundle.claims.filter((entry) => entry.decisionPath === textPointer)) {
    fixture.bundle.claims = fixture.bundle.claims.filter((entry) => entry !== claim);
    fixture.bundle.evidence = fixture.bundle.evidence.filter((entry) => entry.id !== claim.evidenceRef);
    delete fixture.idByPointer[textPointer];
  }
  const noteEvidenceId = `ev_note_${fixture.bundle.evidence.length + 1}`;
  fixture.bundle.evidence.push({ id: noteEvidenceId, anchor: { type: 'json_pointer', pointer: notePointer } });
  fixture.bundle.claims.push({ decisionPath: textPointer, evidenceRef: noteEvidenceId });
  fixture.idByPointer[notePointer] = noteEvidenceId;
  state.visibleClaims[0].evidenceRefs = [noteEvidenceId, fixture.idByPointer['/semanticNodes/0/items/2/value']];
  return fixture;
}

test('RED-5: Horizon compiles without source-backed evaluation vocabulary', () => {
  const compiled = compileState(horizonState(false), horizonSelections);
  assert.equal(compiled.result.valid, true, `reconstructed Horizon must compile: ${JSON.stringify(errorCodes(compiled.result))}`);
  const artifact = `${compiled.html}\n${compiled.svg}`;

  assert.ok(!EVALUATIVE_VOCABULARY.test(artifact), 'artifact asserts evaluation without polarity/target/benchmark/policy evidence');
  assert.ok(!EVALUATIVE_RELABEL.test(artifact), 'change magnitude was relabelled as anomaly/problem/priority without evaluation evidence');
  for (const value of ['189', '3.58', '1.59%', '79.17%', 'prior 3.64']) {
    assert.ok(artifact.includes(value), `grounded value ${value} disappeared from the descriptive output`);
  }
});

test('RED-6: an evaluative typed claim anchored only to raw metric values must fail closed', () => {
  const fixture = horizonEvaluativeClaimBundle();
  const compiled = compileDecisionDashboard(
    worthiness,
    BRIEF,
    routingFor(fixture.bundle.decisionState, horizonSelections),
    fixture.bundle,
    { baseDir: fixture.root }
  );
  const codes = errorCodes(compiled.result);
  assert.ok(
    codes.some((code) => FUTURE_EVALUATION_CODES.includes(code)),
    `claim "${EVALUATIVE_CLAIM_TEXT}" was accepted with only raw-value evidenceRefs; codes=${JSON.stringify(codes)}`
  );
});

test('RED-7: delivered geometry must be verified against the declared scale map', () => {
  const compiled = compileState(roiSingleState, roiSingleSelections);
  assert.equal(compiled.result.valid, true, `mutation harness needs a valid baseline: ${JSON.stringify(errorCodes(compiled.result))}`);

  const verifyRestamped = ({ html, svg, manifest }) => {
    const unstamped = structuredClone(manifest);
    delete unstamped.verification;
    return verifyDeliveredArtifact({ html, svg, manifest: unstamped });
  };

  const baseline = verifyRestamped({ html: compiled.html, svg: compiled.svg, manifest: compiled.manifest });
  assert.equal(baseline.valid, true, `unmutated artifact must pass the unstamped verifier: ${JSON.stringify(errorCodes(baseline))}`);
  assert.ok(!errorCodes(baseline).some((code) => FUTURE_GEOMETRY_CODES.includes(code)));

  const mutatedGeometry = compiled.svg.replace(
    /<rect([^>]*?)width="[0-9.]+"([^>]*class="[^"]*ranking-bar)/,
    '<rect$1width="1"$2'
  );
  assert.notEqual(mutatedGeometry, compiled.svg, 'mutation A must alter delivered geometry');

  const mutatedManifest = structuredClone(compiled.manifest);
  const declaredNode = mutatedManifest.delivery.nodes.find((node) => node.id === 'roi_all');
  declaredNode.visualSpec.scale = { ...(declaredNode.visualSpec.scale ?? {}), type: 'log', mapType: 'log', scaleId: 'mutated_scale_map' };
  const mutatedDeclarationSvg = compiled.svg.replace(/ data-scale-type="[^"]*"/, ' data-scale-type="log"');

  const strippedManifest = structuredClone(compiled.manifest);
  for (const node of strippedManifest.delivery.nodes) delete node.visualSpec?.scale;
  const strippedSvg = compiled.svg.replace(/ data-scale-map-id="[^"]*"/g, '').replace(/ data-scale-type="[^"]*"/g, '');
  const strippedHtml = compiled.html.replace(/ data-scale-map-id="[^"]*"/g, '').replace(/ data-scale-type="[^"]*"/g, '');

  const mutations = {
    'mutation A (geometry changed, declaration unchanged)': verifyRestamped({ html: compiled.html, svg: mutatedGeometry, manifest: compiled.manifest }),
    'mutation B (declaration changed, geometry unchanged)': verifyRestamped({ html: compiled.html, svg: mutatedDeclarationSvg, manifest: mutatedManifest }),
    'mutation C (magnitude encoding without scale declaration)': verifyRestamped({ html: strippedHtml, svg: strippedSvg, manifest: strippedManifest })
  };
  const undetected = [];
  for (const [name, result] of Object.entries(mutations)) {
    if (!errorCodes(result).some((code) => FUTURE_GEOMETRY_CODES.includes(code))) {
      undetected.push(`${name}: codes=${JSON.stringify(errorCodes(result))}`);
    }
  }
  assert.ok(
    undetected.length === 0,
    `the delivered-geometry verifier missed mutations because it never compares geometry against the declared map:\n${undetected.join('\n')}`
  );
});

test('GREEN-A: a valid single-domain ROI comparison still delivers one monotonic magnitude map', () => {
  const compiled = compileState(roiSingleState, roiSingleSelections);
  assert.equal(compiled.result.valid, true, `valid ROI comparison must survive: ${JSON.stringify(errorCodes(compiled.result))}`);
  assert.ok(/data-visual-mark="bar"/.test(compiled.svg), 'ROI comparison must remain a visible magnitude encoding');

  const rows = renderedMagnitudes(compiled.svg, ['roi_all']).filter((row) => row.width !== null);
  assert.equal(rows.length, 3, 'all three ROI products must keep a rendered bar');
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  assert.deepEqual(sorted.map((row) => row.value), [1109, 163, 104]);
  for (let index = 1; index < sorted.length; index += 1) {
    assert.ok(sorted[index - 1].width > sorted[index].width, `${sorted[index - 1].value} must render strictly wider than ${sorted[index].value}`);
  }
});

test('GREEN-B: Horizon still delivers useful grounded structure without smuggling judgment', () => {
  const compiled = compileState(horizonState(false), horizonSelections);
  assert.equal(compiled.result.valid, true, `Horizon must remain useful: ${JSON.stringify(errorCodes(compiled.result))}`);

  const departments = renderedMagnitudes(compiled.svg, ['department_headcount']).filter((row) => row.width !== null);
  assert.equal(departments.length, 7, 'all seven departments must keep a rendered breakdown bar');
  const artifact = `${compiled.html}\n${compiled.svg}`;
  for (const value of ['34', '33', '26', '25', '20', '18', '144', '167', '177']) {
    assert.ok(artifact.includes(value), `grounded department/trend value ${value} must stay visible`);
  }
  assert.ok(!EVALUATIVE_VOCABULARY.test(artifact), 'Horizon output asserted evaluation without evaluation evidence');
  assert.ok(!EVALUATIVE_RELABEL.test(artifact), 'Horizon change magnitude was relabelled as anomaly/problem/priority');
});

test('acceptance binding infra: expected head is runtime-supplied and any divergence fails closed', () => {
  assert.throws(
    () => captureCommitBinding({ repoRoot, expectedHead: null, renderCwd: repoRoot }),
    /requires an explicit --expected-head/
  );

  const bogus = captureCommitBinding({ repoRoot, expectedHead: '0'.repeat(40), renderCwd: repoRoot });
  assert.equal(bogus.headMatches, false);
  assert.match(bogus.revParseStdout.trim(), /^[0-9a-f]{40}$/);
  assert.equal(bogus.showToplevelStdout.length > 0, true);
  assert.throws(() => assertCommitBinding(bogus), /COMMIT_BINDING_FAILED/);

  const measured = captureCommitBinding({ repoRoot, expectedHead: bogus.measuredHead, renderCwd: repoRoot });
  assert.equal(measured.headMatches, true);
  assert.equal(measured.renderCwdMatchesRepoRoot, true);
  assert.equal(typeof measured.statusPorcelainStdout, 'string');

  const clean = { ...measured, worktreeClean: true };
  assert.doesNotThrow(() => assertCommitBinding(clean));
  assert.throws(() => assertCommitBinding({ ...clean, worktreeClean: false }), /COMMIT_BINDING_FAILED/);
  assert.throws(() => assertCommitBinding({ ...clean, headMatches: false }), /COMMIT_BINDING_FAILED/);
  assert.throws(() => assertCommitBinding({ ...clean, renderCwdMatchesRepoRoot: false }), /COMMIT_BINDING_FAILED/);
});
