import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSvg } from '../../skills/decision-first-dashboard/scripts/render.js';

const readme = fs.readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const showcasePath = new URL('../../examples/radar-profile/input.no-score.json', import.meta.url);

test('README primary After uses the radar-profile showcase instead of the mixed-unit fallback', () => {
  assert.match(readme, /examples\/radar-profile\/output\.no-score\.svg/);
  assert.doesNotMatch(readme, /<td width="50%"><img src="examples\/saas\/output\.no-score\.svg"/);
});

test('radar-profile showcase is a true comparable no-score profile with current and previous periods', () => {
  const fixture = JSON.parse(fs.readFileSync(showcasePath, 'utf8'));
  assert.equal(fixture.mode, 'no_score');
  assert.deepEqual(fixture.radarScale, { min: 0, max: 100, provenance: 'source' });
  assert.ok(fixture.signals.length >= 3 && fixture.signals.length <= 6);
  for (const signal of fixture.signals) {
    assert.equal(signal.provenance, 'source');
    assert.equal(Number.isFinite(signal.normalizedScore), true);
    assert.equal(Number.isFinite(signal.previousNormalizedScore), true);
  }

  const svg = renderSvg(fixture);
  assert.equal((svg.match(/class="radar-scale-ring"/g) ?? []).length, 4);
  assert.match(svg, /class="radar-shape radar-shape--previous"/);
  assert.match(svg, /class="radar-shape radar-shape--current"/);
  assert.doesNotMatch(svg, /IMPROVING|Target unknown|Health Score|score-core/);
});
