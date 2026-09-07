import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSvg as legacyRenderSvg, renderHtml as legacyRenderHtml } from './render-legacy.js';

const currentFile = fileURLToPath(import.meta.url);
const RADAR_VISUAL_SCALE = 0.8;

const SVG_RADAR_LAYOUT = {
  cx: 698,
  cy: 464,
  radarRadius: 178 * RADAR_VISUAL_SCALE,
  plateRadius: 245 * RADAR_VISUAL_SCALE,
  labelRadius: 280 * RADAR_VISUAL_SCALE
};

const HTML_RADAR_LAYOUT = {
  cx: 310,
  cy: 260,
  radarRadius: 174 * RADAR_VISUAL_SCALE,
  plateRadius: 240 * RADAR_VISUAL_SCALE,
  labelRadius: 275 * RADAR_VISUAL_SCALE
};

function formatScore(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function escapeMarkup(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function point(cx, cy, radius, angle) {
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

function pathFor(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
}

function radarSource(data) {
  if (data.mode === 'composite') {
    return {
      min: data.score.min,
      max: data.score.max,
      dimensions: data.model.components
    };
  }

  if (
    data.mode === 'no_score' &&
    data.radarScale &&
    data.signals.length >= 3 &&
    data.signals.every((signal) => Object.hasOwn(signal, 'normalizedScore'))
  ) {
    return {
      min: data.radarScale.min,
      max: data.radarScale.max,
      dimensions: data.signals
    };
  }

  return null;
}

function geometry(data, { cx, cy, radarRadius, labelRadius }) {
  const source = radarSource(data);
  if (!source) return null;

  const { min, max, dimensions } = source;
  const span = Math.max(max - min, 1);
  const count = dimensions.length;
  const axes = [];
  const inner = [];
  const shape = [];
  const labels = [];

  dimensions.forEach((dimension, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    const ratio = Math.min(1, Math.max(0, (dimension.normalizedScore - min) / span));
    axes.push(point(cx, cy, radarRadius, angle));
    inner.push(point(cx, cy, radarRadius * 0.5, angle));
    shape.push(point(cx, cy, radarRadius * ratio, angle));
    labels.push(point(cx, cy, labelRadius, angle));
  });

  return {
    grid: pathFor(axes),
    inner: pathFor(inner),
    shape: pathFor(shape),
    spokes: axes.map((p) => `M${cx} ${cy} L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
    labels,
    dimensions
  };
}

function svgRadar(data) {
  const { cx, cy, plateRadius } = SVG_RADAR_LAYOUT;
  const g = geometry(data, SVG_RADAR_LAYOUT);
  if (!g) return '';
  return `<circle class="radar-plate" cx="${cx}" cy="${cy}" r="${plateRadius}" fill="#ffffff" fill-opacity="0.98" stroke="#f0eef8" stroke-width="1" filter="url(#cardShadow)"/>
    <path class="radar-grid" d="${g.grid}" fill="none" stroke="#d8d2ef" stroke-width="1.4" stroke-dasharray="5 7"/>
    <path class="radar-grid radar-grid--inner" d="${g.inner}" fill="none" stroke="#e9e5f6" stroke-width="1" stroke-dasharray="4 7"/>
    <path class="radar-spokes" d="${g.spokes}" fill="none" stroke="#dfdaf2" stroke-width="1.2"/>
    <path class="radar-shape" d="${g.shape}" fill="#7264ca" fill-opacity="0.20" stroke="#7264ca" stroke-width="3" stroke-linejoin="round"/>`;
}

function svgNodes(data, nodeClass = 'score-component-node') {
  const g = geometry(data, SVG_RADAR_LAYOUT);
  if (!g) return '';
  return g.dimensions.map((dimension, index) => {
    const p = g.labels[index];
    return `<g class="${nodeClass}">
      <text x="${p.x.toFixed(1)}" y="${(p.y - 12).toFixed(1)}" class="accent" font-size="22" font-weight="740" text-anchor="middle">${escapeMarkup(formatScore(dimension.normalizedScore))}</text>
      <text x="${p.x.toFixed(1)}" y="${(p.y + 11).toFixed(1)}" class="ink" font-size="13" font-weight="650" text-anchor="middle">${escapeMarkup(dimension.label)}</text>
    </g>`;
  }).join('\n');
}

function enhanceCompositeSvg(markup, data) {
  const legacyRadarBlock = /<circle cx="698" cy="464" r="188"[\s\S]*?<path d="M698 464[^"]*" fill="none" stroke="[^"]+" stroke-width="[^"]+"\/>/;
  markup = markup.replace(legacyRadarBlock, svgRadar(data));
  markup = markup.replaceAll('r="98" fill="#ffffff"', 'r="58" fill="#ffffff"');
  markup = markup.replaceAll('r="86" fill="#f7f4ff"', 'r="50" fill="#f7f4ff"');
  markup = markup.replace(/\n\s*<g class="score-component-node">[\s\S]*?<\/g>/g, '');
  const nodes = svgNodes(data);
  return markup.replace(/\n\s*<g filter="url\(#cardShadow\)">\n\s*<rect x="1038"/, `\n    ${nodes}\n\n    <g filter="url(#cardShadow)">\n      <rect x="1038"`);
}

function enhanceNoScoreSvg(markup, data) {
  const legacyRadarBlock = /<circle cx="698" cy="464" r="188"[\s\S]*?<path d="M698 464[^"]*" fill="none" stroke="[^"]+" stroke-width="[^"]+"\/>/;
  markup = markup.replace(legacyRadarBlock, svgRadar(data));
  markup = markup.replace(
    /\n\s*<circle cx="698" cy="464" r="94"[\s\S]*?<text x="698" y="490" class="muted" font-size="14" text-anchor="middle">Target unknown<\/text>\n/,
    '\n'
  );
  markup = markup.replace(/\n\s*<g class="signal-node">[\s\S]*?<\/g>/g, '');
  const nodes = svgNodes(data, 'radar-dimension-node');
  return markup.replace(/\n\s*<g filter="url\(#cardShadow\)">\n\s*<rect x="1038"/, `\n    ${nodes}\n\n    <g filter="url(#cardShadow)">\n      <rect x="1038"`);
}

function htmlRadar(data) {
  const { cx, cy, plateRadius } = HTML_RADAR_LAYOUT;
  const g = geometry(data, HTML_RADAR_LAYOUT);
  if (!g) return '';
  return `<svg viewBox="0 0 620 520" preserveAspectRatio="xMidYMid meet" aria-label="Component radar">
      <circle class="radar-plate" cx="${cx}" cy="${cy}" r="${plateRadius}"></circle>
      <path class="radar-grid" d="${g.grid}"></path>
      <path class="radar-grid radar-grid--inner" d="${g.inner}"></path>
      <path class="radar-spokes" d="${g.spokes}"></path>
      <path class="radar-shape" d="${g.shape}"></path>
    </svg>`;
}

function htmlNodes(data, className = 'signal score-component') {
  const g = geometry(data, HTML_RADAR_LAYOUT);
  if (!g) return '';
  return g.dimensions.map((dimension, index) => {
    const p = g.labels[index];
    return `<div class="${className}" style="left:${(p.x / 620 * 100).toFixed(2)}%;top:${(p.y / 520 * 100).toFixed(2)}%">
      <strong>${escapeMarkup(formatScore(dimension.normalizedScore))}</strong>
      <span>${escapeMarkup(dimension.label)}</span>
    </div>`;
  }).join('\n');
}

const RADAR_BASE_CSS = `.orbit-ring{display:none}.orbit svg{z-index:1}.orbit .radar-plate{fill:#fff;stroke:#f0eef8;stroke-width:1;filter:drop-shadow(0 14px 24px rgba(85,77,134,.08))}.orbit path{vector-effect:non-scaling-stroke}.orbit .radar-grid{fill:none;stroke:#d8d2ef;stroke-width:1.4;stroke-dasharray:5 7}.orbit .radar-grid--inner{fill:none;stroke:#e9e5f6;stroke-width:1;stroke-dasharray:4 7}.orbit .radar-spokes{fill:none;stroke:#dfdaf2;stroke-width:1.2}.orbit .radar-shape{fill:rgba(114,100,202,.22);stroke:var(--accent);stroke-width:3;stroke-linejoin:round}`;

const COMPOSITE_RADAR_CSS = `
.score-center .orbit-ring{display:none}.orbit svg{z-index:1}.orbit .radar-plate{fill:#fff;stroke:#f0eef8;stroke-width:1;filter:drop-shadow(0 14px 24px rgba(85,77,134,.08))}.orbit path{vector-effect:non-scaling-stroke}.orbit .radar-grid{fill:none;stroke:#d8d2ef;stroke-width:1.4;stroke-dasharray:5 7}.orbit .radar-grid--inner{fill:none;stroke:#e9e5f6;stroke-width:1;stroke-dasharray:4 7}.orbit .radar-spokes{fill:none;stroke:#dfdaf2;stroke-width:1.2}.orbit .radar-shape{fill:rgba(114,100,202,.22);stroke:var(--accent);stroke-width:3;stroke-linejoin:round}.score-center .score-component{z-index:3}.score-center .synthesis-core{width:118px;height:118px;z-index:4}.score-center .synthesis-core strong{font-size:40px}.score-component strong{font-size:24px}`;

const NO_SCORE_RADAR_CSS = `
${RADAR_BASE_CSS}.synthesis-card .radar-dimension{position:absolute;width:142px;text-align:center;z-index:3;transform:translate(-50%,-50%)}.synthesis-card .radar-dimension strong{display:block;color:var(--accent);font-size:24px;line-height:1;letter-spacing:-.025em}.synthesis-card .radar-dimension span{display:block;margin-top:9px;font-weight:700;font-size:13px}`;

function enhanceCompositeHtml(markup, data) {
  markup = markup.replace(/<svg viewBox="0 0 620 520"[\s\S]*?<\/svg>/, htmlRadar(data));
  markup = markup.replace(/\n\s*<div class="signal score-component"[\s\S]*?<\/div>/g, '');
  markup = markup.replace('<div class="synthesis-core">', `${htmlNodes(data)}\n\n        <div class="synthesis-core">`);
  return markup.replace('</style>', `${COMPOSITE_RADAR_CSS}\n</style>`);
}

function enhanceNoScoreHtml(markup, data) {
  markup = markup.replace(/<svg viewBox="0 0 620 520"[\s\S]*?<\/svg>/, htmlRadar(data));
  markup = markup.replace(/\n\s*<div class="signal"[^>]*>[\s\S]*?<\/div>/g, '');
  markup = markup.replace('<div class="synthesis-core">', `${htmlNodes(data, 'radar-dimension')}\n\n        <div class="synthesis-core">`);
  markup = markup.replace(/\n\s*<div class="synthesis-core">[\s\S]*?<\/div>/, '');
  return markup.replace('</style>', `${NO_SCORE_RADAR_CSS}\n</style>`);
}

export function renderSvg(data) {
  const markup = legacyRenderSvg(data);
  if (data.mode === 'composite') return enhanceCompositeSvg(markup, data);
  return radarSource(data) ? enhanceNoScoreSvg(markup, data) : markup;
}

export function renderHtml(data) {
  const markup = legacyRenderHtml(data);
  if (data.mode === 'composite') return enhanceCompositeHtml(markup, data);
  return radarSource(data) ? enhanceNoScoreHtml(markup, data) : markup;
}

if (process.argv[1] === currentFile) {
  const inputPath = process.argv[2];
  const outputDir = process.argv[3] ?? path.dirname(inputPath ?? '.');

  if (!inputPath) {
    console.error('Usage: node render.js <decision-state.json> [output-dir]');
    process.exit(2);
  }

  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const svg = renderSvg(data);
  const html = renderHtml(data);
  fs.mkdirSync(outputDir, { recursive: true });

  const outputMode = data.mode === 'composite' ? 'composite' : 'no-score';
  const svgOutput = path.join(outputDir, `output.${outputMode}.svg`);
  const htmlOutput = path.join(outputDir, `output.${outputMode}.html`);
  fs.writeFileSync(svgOutput, svg);
  fs.writeFileSync(htmlOutput, html);
  console.log(svgOutput);
  console.log(htmlOutput);
}
