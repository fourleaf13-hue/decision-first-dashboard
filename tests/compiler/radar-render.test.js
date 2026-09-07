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

function svgNodePositions(markup) {
  return [...markup.matchAll(/<g class="score-component-node">\s*<text x="([\d.]+)" y="([\d.]+)"/g)]
    .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
}

function distance(x, y, cx, cy) {
  return Math.hypot(x - cx, y - cy);
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

test('radar hierarchy uses a larger white plate behind a radar scaled to 80 percent', () => {
  const svg = renderSvg(fixture);
  const html = renderHtml(fixture);

  assert.match(svg, /class="radar-plate"[^>]*r="196"/);
  assert.match(svg, /class="radar-grid"[^>]*d="M698\.0 321\.6/);
  assert.ok(svg.indexOf('class="radar-plate"') < svg.indexOf('class="radar-shape"'));

  assert.match(html, /class="radar-plate"[^>]*r="192"/);
  assert.match(html, /class="radar-grid"[^>]*d="M310\.0 120\.8/);
  assert.ok(html.indexOf('class="radar-plate"') < html.indexOf('class="radar-shape"'));
});

test('dimension numbers and labels sit outside the white radar plate', () => {
  const svg = renderSvg(fixture);
  const nodes = svgNodePositions(svg);
  assert.equal(nodes.length, fixture.model.components.length);
  for (const node of nodes) {
    assert.ok(distance(node.x, node.y, 698, 464) > 196, `expected node at ${node.x},${node.y} outside plate`);
  }

  assert.match(svg, /class="radar-shape"[\s\S]*?<circle cx="698" cy="464" r="58"/);
  assert.match(renderHtml(fixture), /\.score-center \.synthesis-core\{[^}]*z-index:4/);
});
