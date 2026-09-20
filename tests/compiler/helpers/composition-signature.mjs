// CR-2 test-only helper: extracts a normalized page-level composition
// signature from the DELIVERED canonical HTML/SVG artifact (never from
// manifest intent). Business text, metric values, fixture names, node ids,
// and exact repeated item counts are deliberately not part of the signature.

const VIEWPORT_WIDTH = 1440;

const SECTION_RE = /<section class="semantic-card([^"]*)"([^>]*)>/g;
const SVG_CARD_RE = /<g ([^>]*data-semantic-container="true"[^>]*)><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="18" class="card"\/>/g;
const ITEM_RE = /data-semantic-node="([^"]+)" data-semantic-item="true" data-item-index="(\d+)" data-semantic-role="([^"]*)"(?: data-rank="(\d+)")?/g;

function getAttr(source, name) {
  const matched = new RegExp(`${name}="([^"]*)"`).exec(source);
  return matched ? matched[1] : null;
}

function spanBand(width) {
  const ratio = Number(width) / VIEWPORT_WIDTH;
  if (!Number.isFinite(ratio)) return 'unknown';
  if (ratio >= 0.85) return 'full';
  if (ratio >= 0.3) return 'half';
  return 'narrow';
}

export function extractCompositionSignature({ html, svg }) {
  const sections = [...html.matchAll(SECTION_RE)];
  const svgCards = [...svg.matchAll(SVG_CARD_RE)];

  const geometryByNode = new Map();
  svgCards.forEach(([, attrs, x, y, width, height], index) => {
    geometryByNode.set(getAttr(attrs, 'data-semantic-node'), {
      x: Number(x),
      y: Number(y),
      area: Number(width) * Number(height),
      spanBand: spanBand(width),
      svgOrder: index
    });
  });

  const items = [];
  for (const [, nodeId, itemIndex, role, rank] of html.matchAll(ITEM_RE)) {
    items.push({ nodeId, itemIndex: Number(itemIndex), role, rank: rank === undefined ? null : Number(rank) });
  }

  const regions = sections.map(([, classTail, attrs], index) => {
    const family = classTail.trim().split(/\s+/)[0]?.replace('semantic-card--', '') ?? 'unknown';
    const nodeId = getAttr(attrs, 'data-semantic-node');
    const geometry = geometryByNode.get(nodeId);
    const nodeItems = items.filter((item) => item.nodeId === nodeId);
    return {
      family,
      presentation: getAttr(attrs, 'data-presentation'),
      structure: getAttr(attrs, 'data-structure'),
      geometryKind: getAttr(attrs, 'data-visual-geometry'),
      layoutPattern: getAttr(attrs, 'data-layout-pattern'),
      attentionRole: getAttr(attrs, 'data-metric-priority'),
      spanBand: geometry?.spanBand ?? 'unmatched',
      documentOrder: index,
      visualOrder: geometry?.svgOrder ?? index,
      visualY: geometry?.y ?? null,
      renderedArea: geometry?.area ?? 0,
      rankMarkCount: nodeItems.filter((item) => item.rank !== null).length
    };
  });

  const areas = regions.map((region) => region.renderedArea);
  const dominantIndex = areas.length > 0 ? areas.indexOf(Math.max(...areas)) : -1;
  const minY = Math.min(...regions.map((region) => region.visualY ?? Number.MAX_SAFE_INTEGER));
  const firstRowFamilies = regions
    .filter((region) => region.visualY === minY)
    .map((region) => region.family);
  const spanSet = new Set(regions.map((region) => region.spanBand));

  return {
    regions: regions.map((region) => ({ ...region })),
    regionCount: regions.length,
    dominantIndex,
    dominantFamily: regions[dominantIndex]?.family ?? null,
    familyDocumentOrder: regions.map((region) => region.family),
    familyVisualOrder: [...regions].sort((a, b) => a.visualOrder - b.visualOrder).map((region) => region.family),
    firstRowFamilies,
    spanBands: regions.map((region) => region.spanBand),
    uniformSpan: spanSet.size <= 1,
    attentionRoles: regions.map((region) => region.attentionRole),
    rankedFamilies: regions.filter((region) => region.rankMarkCount > 0).map((region) => region.family)
  };
}

export function loadBearingDimensions(signature) {
  return {
    dominantFamily: signature.dominantFamily,
    familyVisualOrder: signature.familyVisualOrder.join('|'),
    familyDocumentOrder: signature.familyDocumentOrder.join('|'),
    firstRowFamilies: signature.firstRowFamilies.join('|'),
    spanBands: signature.spanBands.join('|'),
    rankedFamilies: signature.rankedFamilies.join('|')
  };
}

export function loadBearingDifference(left, right) {
  const a = loadBearingDimensions(left);
  const b = loadBearingDimensions(right);
  const changed = Object.keys(a).filter((key) => a[key] !== b[key]);
  return { changed, differs: changed.length > 0 };
}
