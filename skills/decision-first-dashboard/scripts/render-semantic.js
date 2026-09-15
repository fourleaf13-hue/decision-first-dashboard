import {
  coverageFor,
  semanticItemsForPresentation,
  semanticStructureFor
} from './composition.js';

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

function assertNoFreeFormOverallClaim(data) {
  const forbidden = ['overallVerdict', 'overallDirection', 'overall'];
  if (forbidden.some((key) => Object.hasOwn(data ?? {}, key))) {
    throw new Error('overall verdicts must enter the renderer as typed claims with evidenceRefs');
  }
}

function assertTypedClaim(claim) {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) throw new Error('typed claim must be an object');
  if (typeof claim.id !== 'string' || !/^claim_[a-z0-9_]{1,64}$/.test(claim.id)) throw new Error('typed claim requires a stable claim_ id');
  if (typeof claim.claimType !== 'string' || claim.claimType.trim().length === 0) throw new Error('typed claim requires claimType');
  if (!['overall', 'node', 'metric'].includes(claim.scope)) throw new Error('typed claim requires a supported scope');
  if (typeof claim.text !== 'string' || claim.text.trim().length === 0) throw new Error('typed claim requires visible text');
  if (!Array.isArray(claim.evidenceRefs) || claim.evidenceRefs.length === 0 || claim.evidenceRefs.some((ref) => typeof ref !== 'string')) {
    throw new Error('typed claim requires evidenceRefs');
  }
}

export function renderTypedClaim(claim, format = 'html', index = 0) {
  assertTypedClaim(claim);
  const attrs = `data-claim-id="${escapeMarkup(claim.id)}" data-claim-scope="${escapeMarkup(claim.scope)}" data-claim-type="${escapeMarkup(claim.claimType)}" data-claim-evidence-refs="${escapeMarkup(claim.evidenceRefs.join(' '))}"`;
  if (format === 'svg') {
    return `<g class="typed-claim" ${attrs}><text x="48" y="${118 + index * 24}" class="claim-text">${escapeMarkup(claim.text)}</text></g>`;
  }
  return `<div class="typed-claim" ${attrs}>${escapeMarkup(claim.text)}</div>`;
}

function visibleClaims(data, options) {
  const claims = options?.claims ?? data.visibleClaims ?? [];
  return claims.filter((claim) => claim?.scope === 'overall');
}

function resolvedNodes(data, composition) {
  assertNoFreeFormOverallClaim(data);
  if (!composition || !Array.isArray(composition.nodes)) throw new Error('semantic nodes require a validated composition');
  const source = new Map((data.semanticNodes ?? []).map((node) => [node.id, node]));
  return composition.nodes.map((selection) => {
    const node = source.get(selection.id);
    if (!node) throw new Error(`semantic composition node ${selection.id} is not present in decision state`);
    const presentation = selection.presentation;
    return {
      ...node,
      ...selection,
      presentation,
      coverage: coverageFor(selection),
      structure: semanticStructureFor(selection),
      items: semanticItemsForPresentation(node, selection)
    };
  });
}

function relationshipRole(node, index, item) {
  const label = String(item.label ?? '').toLowerCase();
  if (/target/.test(label)) return 'target';
  if (/gap|shortfall|impact/.test(label)) return 'gap';
  if (/actual|revenue|current/.test(label)) return 'actual';
  return ['actual', 'target', 'gap'][index] ?? 'context';
}

function itemRole(node, index, item) {
  if (node.type === 'Trend') return 'point';
  if (node.type === 'Distribution') return 'member';
  if (node.type === 'Ranking') return 'rank';
  if (node.type === 'Breakdown') return 'component';
  if (node.type === 'Relationship') return relationshipRole(node, index, item);
  if (node.type === 'ExceptionList') return 'exception';
  if (node.type === 'Drilldown') return 'detail';
  return 'dimension';
}

function itemAttributes(node, item, index) {
  const role = itemRole(node, index, item);
  const rank = node.type === 'Ranking' ? ` data-rank="${index + 1}"` : '';
  return `data-semantic-node="${escapeMarkup(node.id)}" data-semantic-item="true" data-item-index="${index}" data-semantic-role="${role}"${rank}`;
}

function htmlItem(node, item, index, max) {
  const ratio = Math.max(4, (numericValue(item.value) / max) * 100).toFixed(1);
  const detail = item.detail ? `<small>${escapeMarkup(item.detail)}</small>` : '';
  const rank = node.type === 'Ranking' ? `<em>${index + 1}</em>` : '';
  return `<li ${itemAttributes(node, item, index)}><span>${rank}${escapeMarkup(item.label)}</span><b>${escapeMarkup(item.value)}</b>${detail}<i style="--value:${ratio}%"></i></li>`;
}

function htmlBody(node) {
  const max = Math.max(...node.items.map((item) => numericValue(item.value)), 1);
  const rows = node.items.map((item, index) => htmlItem(node, item, index, max)).join('');
  const structureAttributes = `data-structure="${escapeMarkup(node.structure)}" data-item-count="${node.items.length}"`;
  if (node.structure === 'ordered-trajectory') return `<div class="semantic-trajectory" ${structureAttributes}><ol>${rows}</ol></div>`;
  if (node.structure === 'ordered-distribution') return `<ol class="semantic-distribution" ${structureAttributes}>${rows}</ol>`;
  if (node.structure === 'ranked-order') return `<ol class="semantic-ranking" ${structureAttributes}>${rows}</ol>`;
  if (node.structure === 'target-gap') return `<div class="semantic-relationship" ${structureAttributes}><ol>${rows}</ol></div>`;
  if (node.structure === 'decomposition') return `<ol class="semantic-breakdown" ${structureAttributes}>${rows}</ol>`;
  return `<ol class="semantic-items" ${structureAttributes}>${rows}</ol>`;
}

function htmlCard(node) {
  return `<section class="semantic-card semantic-card--${node.type.toLowerCase()}" data-semantic-node="${escapeMarkup(node.id)}" data-presentation="${escapeMarkup(node.presentation)}" data-coverage="${escapeMarkup(node.coverage.join(' '))}" data-structure="${escapeMarkup(node.structure)}" data-semantic-container="true">
    <header><h2>${escapeMarkup(node.title)}</h2>${node.subtitle ? `<p>${escapeMarkup(node.subtitle)}</p>` : ''}</header>
    ${htmlBody(node)}
  </section>`;
}

const CSS = `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#172235;background:#f7f8fc}.semantic-shell{max-width:1360px;margin:0 auto;padding:38px 28px 56px}.semantic-shell h1{font-size:30px;margin:0}.semantic-shell>p{color:#60708a;margin:8px 0 28px}.typed-claims{display:grid;gap:8px;margin:0 0 18px}.typed-claim{display:inline-flex;width:max-content;max-width:100%;padding:9px 12px;border-radius:10px;background:#fff3d8;color:#6e4b00;font-size:13px;font-weight:700}.semantic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px}.semantic-card{background:#fff;border:1px solid #e5e9f2;border-radius:18px;padding:20px;box-shadow:0 10px 28px rgba(38,55,92,.08)}.semantic-card header{border-bottom:1px solid #edf0f5;padding-bottom:12px}.semantic-card h2{font-size:16px;margin:0}.semantic-card p{font-size:12px;color:#66758c;margin:6px 0 0}.semantic-card ol{list-style:none;padding:0;margin:16px 0 0;display:grid;gap:12px}.semantic-card li{display:grid;grid-template-columns:1fr auto;gap:2px 12px;align-items:end;position:relative;padding-bottom:8px}.semantic-card li span{font-size:13px}.semantic-card li b{font-size:13px}.semantic-card li em{font-size:11px;color:#7b86a0;font-style:normal;margin-right:5px}.semantic-card li small{grid-column:1/-1;color:#728098;font-size:11px}.semantic-card li i{position:absolute;left:0;bottom:0;width:var(--value);height:4px;background:#5268d9;border-radius:9px}.semantic-card--ranking li:first-child i{background:#20816c}.semantic-card--ranking li:last-child i{background:#c15b64}.semantic-relationship li[data-semantic-role="actual"] i{background:#5268d9}.semantic-relationship li[data-semantic-role="target"] i{background:#8d96ad}.semantic-relationship li[data-semantic-role="gap"] i{background:#d16b65}`;

export function renderSemanticHtml(data, composition, options = {}) {
  const nodes = resolvedNodes(data, composition);
  const claims = visibleClaims(data, options).map((claim, index) => renderTypedClaim(claim, 'html', index)).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Decision dashboard</title><style>${CSS}</style></head><body><main class="semantic-shell"><h1>Decision dashboard</h1><p>Source-backed context for the next decision.</p>${claims ? `<div class="typed-claims">${claims}</div>` : ''}<div class="semantic-grid">${nodes.map(htmlCard).join('')}</div></main></body></html>`;
}

function cardHeight(node) {
  const structureOverhead = node.structure === 'ordered-trajectory' ? 72 : 0;
  return Math.max(284, 104 + node.items.length * 28 + structureOverhead);
}

function cardLayout(nodes) {
  const rowHeights = [];
  for (let index = 0; index < nodes.length; index += 2) rowHeights.push(Math.max(cardHeight(nodes[index]), cardHeight(nodes[index + 1] ?? nodes[index])));
  return nodes.map((node, index) => ({
    node,
    x: 48 + (index % 2) * 680,
    y: 110 + rowHeights.slice(0, Math.floor(index / 2)).reduce((sum, height) => sum + height + 30, 0),
    width: 632,
    height: cardHeight(node)
  }));
}

function svgPoints(node, x, y, width) {
  const max = Math.max(...node.items.map((item) => numericValue(item.value)), 1);
  const top = y + 82;
  const bottom = y + 134;
  return node.items.map((item, index) => {
    const pointX = x + 28 + ((width - 56) * index) / Math.max(node.items.length - 1, 1);
    const pointY = bottom - (numericValue(item.value) / max) * (bottom - top);
    return `${pointX.toFixed(1)},${pointY.toFixed(1)}`;
  }).join(' ');
}

function svgItem(node, item, index, x, y, width, max) {
  const role = itemRole(node, index, item);
  const rowY = y + 92 + index * 28;
  const barWidth = Math.max(8, (numericValue(item.value) / max) * (width - 170)).toFixed(1);
  const rank = node.type === 'Ranking' ? `<text x="${x + 22}" y="${rowY}" class="rank">${index + 1}</text>` : '';
  return `<g ${itemAttributes(node, item, index)}><text x="${x + (node.type === 'Ranking' ? 48 : 22)}" y="${rowY}" class="label">${escapeMarkup(item.label)}</text><text x="${x + width - 22}" y="${rowY}" text-anchor="end" class="value">${escapeMarkup(item.value)}</text>${rank}<rect x="${x + 22}" y="${rowY + 8}" width="${barWidth}" height="4" rx="2" class="bar"/></g>`;
}

function svgStructureVisual(node, x, y, width) {
  if (node.structure === 'ordered-trajectory') {
    return `<polyline data-structure="ordered-trajectory" data-point-count="${node.items.length}" points="${svgPoints(node, x, y, width)}" class="trajectory"/>`;
  }
  if (node.structure === 'ordered-distribution') return `<g data-structure="ordered-distribution" data-member-count="${node.items.length}" class="distribution-bars"/>`;
  if (node.structure === 'ranked-order') return `<g data-structure="ranked-order" data-rank-count="${node.items.length}" class="ranking-rows"/>`;
  if (node.structure === 'target-gap') return `<line data-structure="target-gap" data-relation-count="${node.items.length}" x1="${x + 22}" y1="${y + 78}" x2="${x + width - 22}" y2="${y + 78}" class="relationship-line"/>`;
  if (node.structure === 'decomposition') return `<g data-structure="decomposition" data-component-count="${node.items.length}" class="breakdown-rows"/>`;
  return '';
}

function svgCard(layout) {
  const { node, x, y, width, height } = layout;
  const max = Math.max(...node.items.map((item) => numericValue(item.value)), 1);
  const rows = node.items.map((item, index) => svgItem(node, item, index, x, y, width, max)).join('');
  return `<g data-semantic-node="${escapeMarkup(node.id)}" data-presentation="${escapeMarkup(node.presentation)}" data-coverage="${escapeMarkup(node.coverage.join(' '))}" data-structure="${escapeMarkup(node.structure)}" data-semantic-container="true"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" class="card"/><text x="${x + 22}" y="${y + 34}" class="title">${escapeMarkup(node.title)}</text>${node.subtitle ? `<text x="${x + 22}" y="${y + 56}" class="subtitle">${escapeMarkup(node.subtitle)}</text>` : ''}${svgStructureVisual(node, x, y, width)}${rows}</g>`;
}

export function renderSemanticSvg(data, composition, options = {}) {
  const nodes = resolvedNodes(data, composition);
  const layouts = cardLayout(nodes);
  const claims = visibleClaims(data, options).map((claim, index) => renderTypedClaim(claim, 'svg', index)).join('');
  const last = layouts.at(-1);
  const height = Math.max(520, (last?.y ?? 110) + (last?.height ?? 284) + 60);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 ${height}" role="img"><style>.card{fill:#fff;stroke:#e5e9f2}.title{font:700 18px Inter,Arial;fill:#172235}.subtitle{font:12px Inter,Arial;fill:#66758c}.label{font:13px Inter,Arial;fill:#34445d}.value{font:700 13px Inter,Arial;fill:#172235}.rank{font:700 11px Inter,Arial;fill:#7b86a0}.bar{fill:#5268d9}.trajectory{fill:none;stroke:#5268d9;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.relationship-line{stroke:#9aa4bb;stroke-width:2;stroke-dasharray:5 5}</style><rect width="1440" height="${height}" fill="#f7f8fc"/><text x="48" y="52" class="title" font-size="28">Decision dashboard</text><text x="48" y="78" class="subtitle">Source-backed context for the next decision.</text>${claims}${layouts.map(svgCard).join('')}</svg>`;
}
