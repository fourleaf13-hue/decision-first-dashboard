import { coverageFor } from './composition.js';

function escapeMarkup(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function numericValue(value) {
  if (typeof value === 'number') return value;
  const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolvedNodes(data, composition) {
  const source = new Map((data.semanticNodes ?? []).map((node) => [node.id, node]));
  return (composition?.nodes ?? []).flatMap((selection) => {
    const node = source.get(selection.id);
    return node ? [{ ...node, presentation: selection.presentation, coverage: coverageFor(selection) }] : [];
  });
}

function htmlCard(node) {
  const max = Math.max(...node.items.map((item) => numericValue(item.value)), 1);
  const rows = node.items.map((item) => {
    const ratio = Math.max(4, (numericValue(item.value) / max) * 100).toFixed(1);
    const detail = item.detail ? `<small>${escapeMarkup(item.detail)}</small>` : '';
    return `<li><span>${escapeMarkup(item.label)}</span><b>${escapeMarkup(item.value)}</b>${detail}<i style="--value:${ratio}%"></i></li>`;
  }).join('');
  return `<section class="semantic-card semantic-card--${node.type.toLowerCase()}" data-semantic-node="${node.id}" data-presentation="${node.presentation}" data-coverage="${node.coverage.join(' ')}">
    <header><h2>${escapeMarkup(node.title)}</h2>${node.subtitle ? `<p>${escapeMarkup(node.subtitle)}</p>` : ''}</header>
    <ol>${rows}</ol>
  </section>`;
}

const CSS = `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#172235;background:#f7f8fc}.semantic-shell{max-width:1360px;margin:0 auto;padding:38px 28px 56px}.semantic-shell h1{font-size:30px;margin:0}.semantic-shell>p{color:#60708a;margin:8px 0 28px}.semantic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px}.semantic-card{background:#fff;border:1px solid #e5e9f2;border-radius:18px;padding:20px;box-shadow:0 10px 28px rgba(38,55,92,.08)}.semantic-card header{border-bottom:1px solid #edf0f5;padding-bottom:12px}.semantic-card h2{font-size:16px;margin:0}.semantic-card p{font-size:12px;color:#66758c;margin:6px 0 0}.semantic-card ol{list-style:none;padding:0;margin:16px 0 0;display:grid;gap:12px}.semantic-card li{display:grid;grid-template-columns:1fr auto;gap:2px 12px;align-items:end;position:relative;padding-bottom:8px}.semantic-card li span{font-size:13px}.semantic-card li b{font-size:13px}.semantic-card li small{grid-column:1/-1;color:#728098;font-size:11px}.semantic-card li i{position:absolute;left:0;bottom:0;width:var(--value);height:4px;background:#5268d9;border-radius:9px}.semantic-card--ranking li:first-child i{background:#20816c}.semantic-card--ranking li:last-child i{background:#c15b64}`;

export function renderSemanticHtml(data, composition) {
  const nodes = resolvedNodes(data, composition);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Decision dashboard</title><style>${CSS}</style></head><body><main class="semantic-shell"><h1>Decision dashboard</h1><p>Source-backed context for the next decision.</p><div class="semantic-grid">${nodes.map(htmlCard).join('')}</div></main></body></html>`;
}

function svgCard(node, index) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  const x = 48 + column * 680;
  const y = 110 + row * 330;
  const max = Math.max(...node.items.map((item) => numericValue(item.value)), 1);
  const rows = node.items.slice(0, 8).map((item, itemIndex) => {
    const rowY = y + 92 + itemIndex * 27;
    const width = Math.max(8, (numericValue(item.value) / max) * 470).toFixed(1);
    return `<text x="${x + 22}" y="${rowY}" class="label">${escapeMarkup(item.label)}</text><text x="${x + 610}" y="${rowY}" text-anchor="end" class="value">${escapeMarkup(item.value)}</text><rect x="${x + 22}" y="${rowY + 8}" width="${width}" height="4" rx="2" class="bar"/>`;
  }).join('');
  return `<g data-semantic-node="${node.id}" data-presentation="${node.presentation}" data-coverage="${node.coverage.join(' ')}"><rect x="${x}" y="${y}" width="632" height="284" rx="18" class="card"/><text x="${x + 22}" y="${y + 34}" class="title">${escapeMarkup(node.title)}</text>${node.subtitle ? `<text x="${x + 22}" y="${y + 56}" class="subtitle">${escapeMarkup(node.subtitle)}</text>` : ''}${rows}</g>`;
}

export function renderSemanticSvg(data, composition) {
  const nodes = resolvedNodes(data, composition);
  const rows = Math.max(1, Math.ceil(nodes.length / 2));
  const height = Math.max(520, 110 + rows * 330 + 44);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 ${height}" role="img"><style>.card{fill:#fff;stroke:#e5e9f2}.title{font:700 18px Inter,Arial;fill:#172235}.subtitle{font:12px Inter,Arial;fill:#66758c}.label{font:13px Inter,Arial;fill:#34445d}.value{font:700 13px Inter,Arial;fill:#172235}.bar{fill:#5268d9}</style><rect width="1440" height="${height}" fill="#f7f8fc"/><text x="48" y="52" class="title" font-size="28">Decision dashboard</text><text x="48" y="78" class="subtitle">Source-backed context for the next decision.</text>${nodes.map(svgCard).join('')}</svg>`;
}
