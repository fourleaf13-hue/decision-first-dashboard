import { renderSvg as legacyRenderSvg, renderHtml as legacyRenderHtml } from './render-legacy.js';

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

function geometry(data, { cx, cy, radius, labelRadius }) {
  const { min, max } = data.score;
  const span = Math.max(max - min, 1);
  const count = data.model.components.length;
  const axes = [];
  const inner = [];
  const shape = [];
  const labels = [];

  data.model.components.forEach((component, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    const ratio = Math.min(1, Math.max(0, (component.normalizedScore - min) / span));
    axes.push(point(cx, cy, radius, angle));
    inner.push(point(cx, cy, radius * 0.5, angle));
    shape.push(point(cx, cy, radius * ratio, angle));
    labels.push(point(cx, cy, labelRadius, angle));
  });

  return {
    grid: pathFor(axes),
    inner: pathFor(inner),
    shape: pathFor(shape),
    spokes: axes.map((p) => `M${cx} ${cy} L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
    labels
  };
}

function svgRadar(data) {
  const g = geometry(data, { cx: 698, cy: 464, radius: 178, labelRadius: 222 });
  return `<path class="radar-grid" d="${g.grid}" fill="rgba(114,100,202,0.015)" stroke="#d8d2ef" stroke-width="1.4"/>
    <path class="radar-grid radar-grid--inner" d="${g.inner}" fill="none" stroke="#e9e5f6" stroke-width="1"/>
    <path class="radar-spokes" d="${g.spokes}" fill="none" stroke="#dfdaf2" stroke-width="1.2"/>
    <path class="radar-shape" d="${g.shape}" fill="rgba(114,100,202,0.20)" stroke="#7264ca" stroke-width="3" stroke-linejoin="round"/>`;
}

function svgNodes(data) {
  const g = geometry(data, { cx: 698, cy: 464, radius: 178, labelRadius: 222 });
  return data.model.components.map((component, index) => {
    const p = g.labels[index];
    return `<g class="score-component-node">
      <text x="${p.x.toFixed(1)}" y="${(p.y - 12).toFixed(1)}" class="accent" font-size="22" font-weight="740" text-anchor="middle">${escapeMarkup(formatScore(component.normalizedScore))}</text>
      <text x="${p.x.toFixed(1)}" y="${(p.y + 11).toFixed(1)}" class="ink" font-size="13" font-weight="650" text-anchor="middle">${escapeMarkup(component.label)}</text>
    </g>`;
  }).join('\n');
}

function enhanceSvg(markup, data) {
  const spokePath = /<path d="M698 464[^\"]*" fill="none" stroke="#dad5ed" stroke-width="2"\/>/;
  markup = markup.replace(spokePath, svgRadar(data));
  markup = markup.replaceAll('r="98" fill="#ffffff"', 'r="76" fill="#ffffff"');
  markup = markup.replaceAll('r="86" fill="#f7f4ff"', 'r="66" fill="#f7f4ff"');
  markup = markup.replace(/\n\s*<g class="score-component-node">[\s\S]*?<\/g>/g, '');
  const nodes = svgNodes(data);
  return markup.replace(/\n\s*<g filter="url\(#cardShadow\)">\n\s*<rect x="1038"/, `\n    ${nodes}\n\n    <g filter="url(#cardShadow)">\n      <rect x="1038"`);
}

function htmlRadar(data) {
  const g = geometry(data, { cx: 310, cy: 260, radius: 174, labelRadius: 216 });
  return `<svg viewBox="0 0 620 520" preserveAspectRatio="xMidYMid meet" aria-label="Component radar">
      <path class="radar-grid" d="${g.grid}"></path>
      <path class="radar-grid radar-grid--inner" d="${g.inner}"></path>
      <path class="radar-spokes" d="${g.spokes}"></path>
      <path class="radar-shape" d="${g.shape}"></path>
    </svg>`;
}

function htmlNodes(data) {
  const g = geometry(data, { cx: 310, cy: 260, radius: 174, labelRadius: 216 });
  return data.model.components.map((component, index) => {
    const p = g.labels[index];
    return `<div class="signal score-component" style="left:${(p.x / 620 * 100).toFixed(2)}%;top:${(p.y / 520 * 100).toFixed(2)}%">
      <strong>${escapeMarkup(formatScore(component.normalizedScore))}</strong>
      <span>${escapeMarkup(component.label)}</span>
    </div>`;
  }).join('\n');
}

const RADAR_CSS = `
.orbit path{vector-effect:non-scaling-stroke}.orbit .radar-grid{fill:rgba(114,100,202,.015);stroke:#d8d2ef;stroke-width:1.4}.orbit .radar-grid--inner{fill:none;stroke:#e9e5f6;stroke-width:1}.orbit .radar-spokes{fill:none;stroke:#dfdaf2;stroke-width:1.2}.orbit .radar-shape{fill:rgba(114,100,202,.22);stroke:var(--accent);stroke-width:3;stroke-linejoin:round}.score-center .synthesis-core{width:154px;height:154px}.score-component strong{font-size:24px}`;

function enhanceHtml(markup, data) {
  markup = markup.replace(/<svg viewBox="0 0 620 520"[\s\S]*?<\/svg>/, htmlRadar(data));
  markup = markup.replace(/\n\s*<div class="signal score-component"[\s\S]*?<\/div>/g, '');
  markup = markup.replace('<div class="synthesis-core">', `${htmlNodes(data)}\n\n        <div class="synthesis-core">`);
  return markup.replace('</style>', `${RADAR_CSS}\n</style>`);
}

export function renderSvg(data) {
  const markup = legacyRenderSvg(data);
  return data.mode === 'composite' ? enhanceSvg(markup, data) : markup;
}

export function renderHtml(data) {
  const markup = legacyRenderHtml(data);
  return data.mode === 'composite' ? enhanceHtml(markup, data) : markup;
}
