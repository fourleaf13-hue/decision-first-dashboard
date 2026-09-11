import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMetricRouting } from '../../skills/decision-first-dashboard/scripts/routing.js';
import { validateGroundedBundle } from '../../skills/decision-first-dashboard/scripts/grounding.js';
import { renderHtml, renderSvg } from '../../skills/decision-first-dashboard/scripts/render.js';

const groundingDir = fileURLToPath(new URL('./fixtures/grounding/', import.meta.url));
const routingDir = fileURLToPath(new URL('./fixtures/routing/', import.meta.url));
const bundle = JSON.parse(fs.readFileSync(path.join(groundingDir, 'zepto-inventory.grounded.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(routingDir, 'zepto-inventory.routing.json'), 'utf8'));

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('real inventory regression keeps routed primaries and supporting diagnostics separate', () => {
  const result = validateMetricRouting(manifest, bundle.decisionState);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.summary.primaryCount, 4);
  assert.equal(result.summary.supportingCount, 3);
});

test('real inventory supporting context is fully grounded', () => {
  const result = validateGroundedBundle(bundle, { baseDir: groundingDir });
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.transition, 'PASS');
});

test('missing visible supporting evidence returns to evidence extraction instead of silently dropping the metric', () => {
  const broken = structuredClone(bundle);
  broken.claims = broken.claims.filter((claim) => claim.decisionPath !== '/supportingSignals/1/value');
  broken.evidence = broken.evidence.filter((evidence) => evidence.id !== 'ev_s1_value');
  const result = validateGroundedBundle(broken, { baseDir: groundingDir });
  assert.equal(result.valid, false);
  assert.equal(result.transition, 'RETURN_TO_EVIDENCE_EXTRACTION');
  assert.ok(result.errors.some((error) => error.code === 'MISSING_REQUIRED_GROUNDING' && error.path === '/supportingSignals/1/value'));
});

test('real inventory HTML renders four primaries and a subordinate supporting context rail', () => {
  const html = renderHtml(bundle.decisionState);
  for (const value of ['453', '12.14%', '14.61%', '₹2.243M', '3.731K', '43.42%', '29.83%']) {
    assert.match(html, new RegExp(escapeRegex(value)));
  }
  assert.match(html, /supporting-context-rail/);
  assert.match(html, /supporting-context-item/);
  assert.doesNotMatch(html, /Average Discount|Total Categories/);
  assert.doesNotMatch(html, /class="orbit-spokes"/);
});

test('real inventory SVG renders supporting diagnostics without fake relationship spokes', () => {
  const svg = renderSvg(bundle.decisionState);
  for (const value of ['453', '12.14%', '14.61%', '₹2.243M', '3.731K', '43.42%', '29.83%']) {
    assert.match(svg, new RegExp(escapeRegex(value)));
  }
  assert.match(svg, /supporting-context-rail/);
  assert.doesNotMatch(svg, /Average Discount|Total Categories/);
  assert.doesNotMatch(svg, /class="orbit-spokes"/);
});

test('primary-only center layout uses the compact density path instead of the legacy giant stage', () => {
  const primaryOnly = structuredClone(bundle.decisionState);
  delete primaryOnly.supportingSignals;
  const html = renderHtml(primaryOnly);
  assert.match(html, /\.decision-layout--center-only\{[^}]*min-height:0/);
  assert.match(html, /\.decision-layout--center-only \.synthesis-card\{[^}]*min-height:min\(40vh,420px\)/);
  assert.match(html, /\.decision-layout--center-only \.signal-focus\{[^}]*gap:32px/);
});

test('mobile CSS preserves the compact center-only height instead of restoring a 540px empty stage', () => {
  const primaryOnly = structuredClone(bundle.decisionState);
  delete primaryOnly.supportingSignals;
  const html = renderHtml(primaryOnly);
  assert.match(
    html,
    /@media\(max-width:620px\)\{[\s\S]*?\.synthesis-card\{min-height:540px\}[\s\S]*?\.decision-layout--center-only \.synthesis-card\{min-height:min\(40vh,420px\)\}/
  );
});
