import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSvg, renderHtml } from '../../skills/decision-first-dashboard/scripts/render.js';

const fixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/composite.valid.json', import.meta.url), 'utf8')
);

function radarPath(markup) {
  const match = markup.match(/class="radar-shape"[^>]*d="([^"]+)"/);
  assert.ok(match, 'expected a radar-shape path');
  return match[1];
}

function fixtureWithDimensions(count) {
  const next = structuredClone(fixture);
  next.model.components = Array.from({ length: count }, (_, index) => ({
    metric: `dimension_${index + 1}`,
    label: `Dimension ${index + 1}`,
    value: `${55 + index * 5}`,
    normalizedScore: 55 + index * 5,
    weight: 1 / count,
    provenance: 'source'
  }));
  next.score.value = Number(next.model.components.reduce(
    (sum, component) => sum + component.normalizedScore * component.weight,
    0
  ).toFixed(4));
  next.score.band = 'At risk';
  return next;
}

test('three composite dimensions render as a closed triangular radar shape in SVG and HTML', () => {
  const svg = renderSvg(fixture);
  const html = renderHtml(fixture);
  const svgPath = radarPath(svg);
  const htmlPath = radarPath(html);
  assert.match(svgPath, /^M[^Z]+L[^Z]+L[^Z]+Z$/);
  assert.match(htmlPath, /^M[^Z]+L[^Z]+L[^Z]+Z$/);
  assert.match(svg, /class="radar-grid"/);
  assert.match(html, /class="radar-grid"/);
});

test('four through six dimensions produce closed polygons with one vertex per dimension', () => {
  for (const count of [4, 5, 6]) {
    const data = fixtureWithDimensions(count);
    for (const markup of [renderSvg(data), renderHtml(data)]) {
      const path = radarPath(markup);
      assert.equal((path.match(/L/g) ?? []).length, count - 1);
      assert.match(path, /^M.*Z$/);
    }
  }
});

test('changing a normalized component score moves the corresponding radar polygon vertex', () => {
  const baseline = radarPath(renderSvg(fixture));
  const changedFixture = structuredClone(fixture);
  changedFixture.model.components[0].normalizedScore = 70;
  changedFixture.score.value = Number(changedFixture.model.components.reduce(
    (sum, component) => sum + component.normalizedScore * component.weight,
    0
  ).toFixed(2));
  changedFixture.score.band = 'Watch';
  const changed = radarPath(renderSvg(changedFixture));
  assert.notEqual(changed, baseline);
});
