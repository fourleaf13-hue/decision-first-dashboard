import {
  coverageFor,
  METRIC_TIER_GEOMETRY_RATIO,
  semanticItemsForPresentation,
  semanticStructureFor
} from './composition.js';
import {
  buildInternalVisualSpecs,
  numericValue
} from './visual-grammar.js';
import { mapFraction } from './encoding-contracts.js';

function escapeMarkup(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function visualSpecsFor(data, composition, options = {}) {
  if (Array.isArray(options.visualSpecs)) return options.visualSpecs;
  const result = buildInternalVisualSpecs(data, composition, {
    contextRequirements: options.contextRequirements ?? [],
    modifiers: options.modifiers ?? composition?.modifiers ?? {},
    decisionLog: options.decisionLog ?? composition?.decisionLog ?? []
  });
  if (!result.valid) throw new Error(`semantic visual grammar failed: ${result.errors.map((error) => error.code).join(', ')}`);
  return result.specs;
}

function resolvedNodes(data, composition, options = {}) {
  assertNoFreeFormOverallClaim(data);
  if (!composition || !Array.isArray(composition.nodes)) throw new Error('semantic nodes require a validated composition');
  const source = new Map((data.semanticNodes ?? []).map((node) => [node.id, node]));
  const specs = new Map(visualSpecsFor(data, composition, options).map((spec) => [spec.nodeId, spec]));
  return composition.nodes.map((selection) => {
    const node = source.get(selection.id);
    if (!node) throw new Error(`semantic composition node ${selection.id} is not present in decision state`);
    const visualSpec = specs.get(selection.id);
    if (!visualSpec) throw new Error(`semantic node ${selection.id} has no internal visual spec`);
    const sourceItems = Array.isArray(node.items) ? node.items : [];
    const items = semanticItemsForPresentation(node, selection);
    return {
      ...node,
      ...selection,
      presentation: selection.presentation,
      coverage: coverageFor(selection),
      structure: semanticStructureFor(selection),
      visualSpec,
      items,
      ...(items.length < sourceItems.length ? { subsetDisclosure: { shown: items.length, total: sourceItems.length } } : {})
    };
  });
}

function relationshipRole(node, index, item) {
  const declared = item?.role;
  if (['actual', 'target', 'gap'].includes(declared)) return declared;
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

function itemAttributes(node, item, index, mark = null) {
  const role = itemRole(node, index, item);
  const rank = node.type === 'Ranking' ? ` data-rank="${index + 1}"` : '';
  const itemMark = mark ? ` data-visual-mark-item="${escapeMarkup(mark)}"` : '';
  return `data-semantic-node="${escapeMarkup(node.id)}" data-semantic-item="true" data-item-index="${index}" data-semantic-role="${role}"${rank}${itemMark}`;
}

function metricNodeAttributes(node) {
  const attributes = [
    node.metric ? ` data-metric="${escapeMarkup(node.metric)}"` : '',
    node.metricRole ? ` data-metric-role="${escapeMarkup(node.metricRole)}"` : '',
    node.metricPriority ? ` data-metric-priority="${escapeMarkup(node.metricPriority)}"` : ''
  ];
  if (Array.isArray(node.metricTiers)) attributes.push(` data-metric-tiers="${escapeMarkup(node.metricTiers.map((entry) => `${entry.metric}:${entry.tier}`).join(' '))}")`);
  return attributes.join('');
}

function tierForItem(node, item) {
  if (!Array.isArray(node.metricTiers)) return null;
  if (typeof item?.metric !== 'string' || item.metric.length === 0) return null;
  return node.metricTiers.find((entry) => entry?.metric === item.metric) ?? null;
}

function tierAttributes(tier) {
  return tier ? ` data-metric-tier="${escapeMarkup(tier.tier)}" data-tier-basis="${escapeMarkup(tier.selectionBasis)}"` : '';
}

function visualGeometry(spec) {
  if (spec.mark === 'line') return 'trajectory';
  if (spec.mark === 'paired_bar') return 'paired-bars';
  if (spec.mark === 'radar') return 'radar-polygon';
  if (spec.mark === 'metric_tile') return 'metric-tiles';
  if (spec.mark === 'gap_bar') return 'gap-bars';
  if (spec.mark === 'bullet') return 'bullet-target';
  if (spec.mark === 'waterfall') return 'waterfall-segments';
  if (spec.mark === 'detail_list') return 'detail-list';
  if (spec.mark === 'list') return 'list';
  if (spec.structure === 'ordered-distribution') return 'distribution-bars';
  if (spec.structure === 'ranked-order' || spec.structure === 'top-ranked') return 'ranking-bars';
  if (spec.structure === 'decomposition') return 'breakdown-bars';
  if (spec.mark === 'value') return 'value-summary';
  return 'items';
}

function visualNodeAttributes(node) {
  const spec = node.visualSpec;
  const encoding = Object.entries(spec.encoding ?? {}).map(([key, value]) => `${key}:${value}`).join('|');
  const comparability = spec.comparability ?? {};
  const layout = spec.layout ?? {};
  const region = node.attentionRole ? ` data-attention-role="${escapeMarkup(node.attentionRole)}"${node.regionSpan ? ` data-region-span="${escapeMarkup(node.regionSpan)}"` : ''}` : '';
  return `data-semantic-node="${escapeMarkup(node.id)}" data-presentation="${escapeMarkup(node.presentation)}" data-coverage="${escapeMarkup(node.coverage.join(' '))}" data-structure="${escapeMarkup(node.structure)}" data-visual-mark="${escapeMarkup(spec.mark)}" data-visual-orientation="${escapeMarkup(spec.orientation)}" data-visual-encoding="${escapeMarkup(encoding)}" data-scale-type="${escapeMarkup(spec.scale?.type)}" data-scale-domain="${escapeMarkup(spec.scale?.domain)}" data-comparability-unit="${escapeMarkup(comparability.unit ?? '')}" data-comparison-group="${escapeMarkup(comparability.comparisonGroup ?? '')}" data-comparability-domain="${escapeMarkup(comparability.comparabilityDomain ?? '')}" data-normalization="${escapeMarkup(comparability.normalization ?? '')}" data-comparability-scale-id="${escapeMarkup(comparability.scaleId ?? '')}" data-comparability-eligible="${comparability.eligible ? 'true' : 'false'}" data-layout-pattern="${escapeMarkup(layout.pattern)}" data-layout-reason="${escapeMarkup(layout.reasonCode)}" data-layout-requirement-ref="${escapeMarkup(layout.requirementRef ?? '')}" data-layout-modifier-ref="${escapeMarkup(layout.modifierRef ?? '')}" data-layout-evidence-refs="${escapeMarkup((layout.evidenceRefs ?? []).join(' '))}" data-visual-geometry="${visualGeometry(spec)}"${metricNodeAttributes(node)}${region} data-semantic-container="true"`;
}

function ratio(value, max) {
  return Math.max(4, Math.min(100, (numericValue(value) / Math.max(max, 1)) * 100)).toFixed(1);
}

function maxValue(items) {
  return Math.max(...items.map((item) => numericValue(item.value)), 1);
}

function numericMagnitude(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const matched = String(value ?? '').replace(/[,\s]/g, '').match(/-?\d+(?:\.\d+)?/);
  return matched ? Number.parseFloat(matched[0]) : null;
}

export function evaluateDeclaredMagnitude(value, scaleDeclaration) {
  const declaration = scaleDeclaration && typeof scaleDeclaration === 'object' && !Array.isArray(scaleDeclaration)
    ? scaleDeclaration
    : null;
  if (!declaration) throw new Error('SHARED_SCALE_DECLARATION_MISSING: a shared relationship scale has no canonical declaration to consume');
  const scaleLabel = String(declaration.scaleId ?? '<unnamed>');
  if (declaration.mapType !== 'linear') {
    throw new Error(`SHARED_SCALE_MAP_UNSUPPORTED: renderer cannot consume mapType "${String(declaration.mapType)}" on declared scale "${scaleLabel}"`);
  }
  if (declaration.normalizationBasis !== 'domain_max') {
    throw new Error(`SHARED_SCALE_BASIS_UNSUPPORTED: renderer cannot consume normalizationBasis "${String(declaration.normalizationBasis)}" on declared scale "${scaleLabel}"`);
  }
  const domain = declaration.valueDomain;
  if (!Array.isArray(domain) || domain.length !== 2 || !domain.every((entry) => Number.isFinite(entry))) {
    throw new Error(`SHARED_SCALE_DOMAIN_INVALID: declared scale "${scaleLabel}" is missing a finite two-entry valueDomain`);
  }
  const [domainMin, domainMax] = domain;
  if (!(domainMax > domainMin)) {
    throw new Error(`SHARED_SCALE_DOMAIN_INVALID: declared scale "${scaleLabel}" has a non-positive valueDomain span`);
  }
  if (!Number.isFinite(declaration.baseline) || declaration.baseline < domainMin || declaration.baseline > domainMax) {
    throw new Error(`SHARED_SCALE_BASELINE_INVALID: declared scale "${scaleLabel}" needs a finite baseline inside its valueDomain`);
  }
  const numeric = numericMagnitude(value);
  if (numeric === null) throw new Error(`SHARED_SCALE_VALUE_NOT_NUMERIC: value "${String(value)}" cannot be mapped by declared scale "${scaleLabel}"`);
  if (numeric < domainMin || numeric > domainMax) {
    throw new Error(`SHARED_SCALE_VALUE_OUTSIDE_DOMAIN: value "${String(value)}" falls outside declared scale "${scaleLabel}"`);
  }
  return (numeric - domainMin) / (domainMax - domainMin);
}

function magnitudeFraction(node, value) {
  const spec = node.visualSpec;
  if (spec?.scale?.type !== 'shared' || spec?.scale?.domain !== 'relationship') return null;
  return evaluateDeclaredMagnitude(value, spec.scale);
}

function magnitudePercent(node, item, max) {
  const fraction = magnitudeFraction(node, item.value);
  if (fraction !== null) return Math.max(4, Math.min(100, fraction * 100)).toFixed(1);
  return ratio(item.value, max);
}

function magnitudeWidth(node, value, max, available) {
  const fraction = magnitudeFraction(node, value);
  if (fraction !== null) return Math.max(10, fraction * available);
  return Math.max(10, (numericValue(value) / max) * available);
}

// Structural drawable-span marker for shared relationship scales only. It is
// pure markup: the delivered-geometry verifier cross-checks these numbers
// against actual bar origins and the full-domain bar, never trusting them alone.
function plotTrack(node, x1, x2, y) {
  const spec = node.visualSpec;
  if (spec?.scale?.type !== 'shared' || spec?.scale?.domain !== 'relationship') return '';
  return `<line data-plot-track="true" data-semantic-node="${escapeMarkup(node.id)}" x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" class="plot-track"/>`;
}

function htmlRow(node, item, index, max, mark = null) {
  const detail = item.detail ? `<small>${escapeMarkup(item.detail)}</small>` : '';
  const rank = node.type === 'Ranking' ? `<em>${index + 1}</em>` : '';
  const bar = mark ? `<i class="visual-bar" data-visual-mark-item="${escapeMarkup(mark)}" style="--value:${magnitudePercent(node, item, max)}%"></i>` : '';
  return `<li ${itemAttributes(node, item, index, mark)}><span>${rank}${escapeMarkup(item.label)}</span><b>${escapeMarkup(item.value)}</b>${detail}${bar}</li>`;
}

function htmlTrend(node) {
  const max = maxValue(node.items);
  const width = 560;
  const height = 200;
  const baseline = 158;
  const amplitude = 104;
  const points = node.items.map((item, index) => {
    const x = 20 + ((width - 40) * index) / Math.max(node.items.length - 1, 1);
    const y = baseline - (numericValue(item.value) / max) * amplitude;
    return [x, y];
  });
  const polyline = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const markers = points.map(([x, y], index) => {
    const item = node.items[index];
    const labelX = Math.max(44, Math.min(width - 44, x));
    const latest = index === points.length - 1 ? ' trend-point--latest' : '';
    return `<g ${itemAttributes(node, item, index)}><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" class="trend-point${latest}"/><text x="${labelX.toFixed(1)}" y="${(y - 13).toFixed(1)}" text-anchor="middle" class="trend-value">${escapeMarkup(item.value)}</text><text x="${labelX.toFixed(1)}" y="188" text-anchor="middle" class="trend-year">${escapeMarkup(item.label)}</text></g>`;
  }).join('');
  return `<figure class="visual-plot visual-plot--trend" data-visual-geometry="trajectory" data-item-count="${node.items.length}"><svg class="trend-plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeMarkup(node.title)}"><line x1="20" y1="${baseline}" x2="540" y2="${baseline}" class="plot-baseline"/><polyline data-visual-geometry="trajectory" data-point-count="${node.items.length}" points="${polyline}" class="trend-line"/>${markers}</svg></figure>`;
}

function htmlDistribution(node) {
  const max = maxValue(node.items);
  const rows = node.items.map((item, index) => `<li class="distribution-member"><div ${itemAttributes(node, item, index, 'bar')}><span>${escapeMarkup(item.label)}</span><b>${escapeMarkup(item.value)}</b><i class="visual-bar" data-visual-mark-item="bar" style="--value:${magnitudePercent(node, item, max)}%"></i></div></li>`).join('');
  return `<figure class="visual-plot visual-plot--distribution" data-visual-geometry="distribution-bars"><ol class="distribution-bars" data-structure="ordered-distribution" data-item-count="${node.items.length}">${rows}</ol></figure>`;
}

function htmlRanking(node, paired = false) {
  const max = maxValue(node.items);
  if (paired) {
    const [high, low] = node.items;
    return `<div class="paired-ranking" data-visual-geometry="paired-bars"><article class="ranking-end ranking-end--high" data-ranking-end="high"><h3>Highest</h3><ol>${htmlRow(node, high, 0, max, 'bar')}</ol></article><article class="ranking-end ranking-end--low" data-ranking-end="low"><h3>Lowest</h3><ol>${htmlRow(node, low, 1, max, 'bar')}</ol></article></div>`;
  }
  const rows = node.items.map((item, index) => htmlRow(node, item, index, max, 'bar')).join('');
  return `<ol class="semantic-ranking visual-ranking" data-structure="${escapeMarkup(node.structure)}" data-item-count="${node.items.length}" data-visual-geometry="ranking-bars">${rows}</ol>`;
}

function htmlMetricStrip(node) {
  return `<div class="metric-strip" data-visual-geometry="metric-tiles">${node.items.map((item, index) => {
    const tier = tierForItem(node, item);
    const tierClass = tier ? (tier.tier === 'lead' ? ' metric-tile--lead' : ' metric-tile--secondary') : '';
    return `<article class="metric-tile${tierClass}" ${itemAttributes(node, item, index)}${tierAttributes(tier)}><span>${escapeMarkup(item.label)}</span><strong>${escapeMarkup(item.value)}</strong>${item.detail ? `<small>${escapeMarkup(item.detail)}</small>` : ''}</article>`;
  }).join('')}</div>`;
}

function htmlRadar(node) {
  const dimensions = Array.isArray(node.dimensions) && node.dimensions.length > 0
    ? node.dimensions
    : node.items.map((item) => ({ value: numericValue(item.value) }));
  const count = Math.max(dimensions.length, 1);
  const center = 150;
  const radius = 100;
  const points = dimensions.map((dimension, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    const value = Number.isFinite(dimension.normalizedScore) ? dimension.normalizedScore : numericValue(dimension.value);
    const pointRadius = radius * Math.max(0, Math.min(1, value / 100));
    return `${(center + Math.cos(angle) * pointRadius).toFixed(1)},${(center + Math.sin(angle) * pointRadius).toFixed(1)}`;
  }).join(' ');
  const items = node.items.map((item, index) => `<span class="radar-dimension" ${itemAttributes(node, item, index)}>${escapeMarkup(item.label)} <b>${escapeMarkup(item.value)}</b></span>`).join('');
  return `<figure class="visual-profile visual-profile--radar" data-visual-geometry="radar-polygon"><svg class="radar-plot" viewBox="0 0 300 300" role="img" aria-label="${escapeMarkup(node.title)}"><circle cx="150" cy="150" r="100" class="radar-ring"/><polygon points="${points}" data-visual-geometry="radar-polygon" class="radar-polygon"/></svg><div class="radar-dimensions">${items}</div></figure>`;
}

function htmlRelationship(node) {
  const max = maxValue(node.items);
  return `<div class="relationship-chart" data-visual-geometry="gap-bars"><ol class="relationship-bars" data-structure="target-gap" data-item-count="${node.items.length}">${node.items.map((item, index) => `<li class="relationship-row relationship-row--${relationshipRole(node, index, item)}">${htmlRow(node, item, index, max, 'bar')}</li>`).join('')}</ol></div>`;
}

function htmlBreakdown(node) {
  const max = maxValue(node.items);
  return `<ol class="semantic-breakdown breakdown-bars" data-structure="decomposition" data-item-count="${node.items.length}" data-visual-geometry="breakdown-bars">${node.items.map((item, index) => htmlRow(node, item, index, max, 'bar')).join('')}</ol>`;
}

function bulletPercent(bullet, value) {
  return (mapFraction(value, bullet.valueDomain) * 100).toFixed(1);
}

// One neutral relative-position note derived only from the declared gap and
// direction; evaluation requires a separate contract and never appears here.
function bulletGapNote(bullet, gap) {
  const detail = gap.detail ? ` (${gap.detail})` : '';
  return `${gap.value} ${bullet.direction} target${detail}`;
}

function bulletRoleItems(node) {
  const actual = node.items.find((item) => item.role === 'actual');
  const target = node.items.find((item) => item.role === 'target');
  const gap = node.items.find((item) => item.role === 'gap');
  if (!actual || !target || !gap) throw new Error('bullet rendering requires grounded actual, target, and gap items');
  return [actual, target, gap];
}

function htmlBullet(node) {
  const bullet = node.visualSpec.bullet;
  if (!bullet) throw new Error('bullet rendering requires a declared bullet scale');
  const [actual, target, gap] = bulletRoleItems(node);
  const legend = [actual, target].map((item) => `<span class="bullet-legend-item bullet-legend-item--${escapeMarkup(item.role)}" ${itemAttributes(node, item, node.items.indexOf(item))}>${escapeMarkup(item.label)} <b>${escapeMarkup(item.value)}</b></span>`).join('');
  // The actual bar and the target marker share one encoding track: the marker
  // is only meaningful as a position on the bar's own scale.
  const track = `<div class="bullet-track" data-encoding-track="true"><i class="visual-bar bullet-actual-bar" data-visual-mark-item="bullet-actual" style="--value:${bulletPercent(bullet, numericValue(actual.value))}%"></i><span class="bullet-target-marker" data-visual-marker="target" style="--at:${bulletPercent(bullet, numericValue(target.value))}%"></span></div>`;
  const note = `<p class="bullet-gap-note" ${itemAttributes(node, gap, node.items.indexOf(gap))} data-visual-annotation="gap">${escapeMarkup(bulletGapNote(bullet, gap))}</p>`;
  return `<div class="bullet-chart" data-visual-geometry="bullet-target"><div class="bullet-legend" data-structure="target-bullet" data-item-count="${node.items.length}">${legend}</div>${track}${note}</div>`;
}

function waterfallGeometry(waterfall, segment) {
  const low = Math.min(segment.cumulativeBefore, segment.cumulativeAfter);
  const high = Math.max(segment.cumulativeBefore, segment.cumulativeAfter);
  const offset = mapFraction(low, waterfall.valueDomain);
  const width = mapFraction(high, waterfall.valueDomain) - offset;
  return [offset, width];
}

// The sign is read from the declared additive path member, never guessed.
function waterfallDeltaDisplay(segment, item) {
  return `${segment.sign === 'minus' ? '-' : '+'}${item.value}`;
}

function waterfallStage(plot, label, display, extraAttributes = '') {
  return `<div class="waterfall-stage"${extraAttributes}>${plot}<span class="waterfall-stage-label">${escapeMarkup(label)}</span><b class="waterfall-stage-value">${escapeMarkup(display)}</b></div>`;
}

// One continuous bridge: totals anchor on the zero baseline, every floating
// delta starts at the previous cumulative level and ends at the new one, and
// a connector carries each junction across the stage gap.
function htmlWaterfall(node) {
  const waterfall = node.visualSpec.waterfall;
  if (!waterfall) throw new Error('waterfall rendering requires a declared additive path');
  const pct = (value) => (mapFraction(value, waterfall.valueDomain) * 100).toFixed(1);
  const stages = [waterfallStage(
    `<div class="waterfall-plot"><i class="waterfall-bar waterfall-total-bar" data-waterfall-total="start" style="--height:${pct(waterfall.startValue)}%"></i></div>`,
    waterfall.startRef,
    waterfall.startDisplay,
    ' data-waterfall-endpoint="start"'
  )];
  node.items.forEach((item, index) => {
    const segment = waterfall.segments[index];
    const [offset, width] = waterfallGeometry(waterfall, segment);
    const plot = `<div class="waterfall-plot"><i class="waterfall-connector" data-visual-connector="true" data-connector-index="${index}" style="--at:${pct(segment.cumulativeBefore)}%"></i><i class="waterfall-bar waterfall-segment" data-visual-mark-item="waterfall-segment" data-segment-index="${index}" style="--offset:${(offset * 100).toFixed(1)}%;--value:${(width * 100).toFixed(1)}%"></i></div>`;
    stages.push(waterfallStage(plot, item.label, waterfallDeltaDisplay(segment, item), ` ${itemAttributes(node, item, index)}`));
  });
  const endConnector = `<i class="waterfall-connector" data-visual-connector="true" data-connector-index="${node.items.length}" style="--at:${pct(waterfall.endValue)}%"></i>`;
  stages.push(waterfallStage(
    `<div class="waterfall-plot">${endConnector}<i class="waterfall-bar waterfall-total-bar" data-waterfall-total="end" style="--height:${pct(waterfall.endValue)}%"></i></div>`,
    waterfall.endRef,
    waterfall.endDisplay,
    ' data-waterfall-endpoint="end"'
  ));
  return `<div class="waterfall-chart" data-visual-geometry="waterfall-segments"><div class="waterfall-bridge" data-structure="additive-path" data-item-count="${node.items.length}">${stages.join('')}</div></div>`;
}

function htmlList(node) {
  const rows = node.items.map((item, index) => htmlRow(node, item, index, 1)).join('');
  return `<ol class="semantic-items semantic-list" data-structure="${escapeMarkup(node.structure)}" data-item-count="${node.items.length}" data-visual-geometry="${visualGeometry(node.visualSpec)}">${rows}</ol>`;
}

function htmlBody(node) {
  if (node.visualSpec.mark === 'line') return htmlTrend(node);
  if (node.visualSpec.mark === 'radar') return htmlRadar(node);
  if (node.visualSpec.mark === 'gap_bar') return htmlRelationship(node);
  if (node.visualSpec.mark === 'bullet') return htmlBullet(node);
  if (node.visualSpec.mark === 'waterfall') return htmlWaterfall(node);
  if (node.visualSpec.mark === 'metric_tile') return htmlMetricStrip(node);
  if (node.visualSpec.mark === 'paired_bar') return htmlRanking(node, true);
  if (node.visualSpec.structure === 'ordered-distribution') return htmlDistribution(node);
  if (node.visualSpec.structure === 'ranked-order' || node.visualSpec.structure === 'top-ranked') return htmlRanking(node);
  if (node.visualSpec.structure === 'decomposition') return htmlBreakdown(node);
  return htmlList(node);
}

function subsetNote(node) {
  if (!node.subsetDisclosure) return '';
  return `${node.subsetDisclosure.shown} of ${node.subsetDisclosure.total} shown`;
}

function htmlCard(node) {
  const roleClass = node.attentionRole ? ` semantic-card--role-${node.attentionRole}` : '';
  const spanStyle = node.regionSpan === 'full' ? ' style="grid-column:1/-1"' : '';
  const subset = node.subsetDisclosure ? `<p class="subset-note" data-subset-shown="${node.subsetDisclosure.shown}" data-subset-total="${node.subsetDisclosure.total}">${escapeMarkup(subsetNote(node))}</p>` : '';
  return `<section class="semantic-card semantic-card--${node.type.toLowerCase()} semantic-card--${node.visualSpec.mark}${roleClass}"${spanStyle} ${visualNodeAttributes(node)}><header><h2>${escapeMarkup(node.title)}</h2>${node.subtitle ? `<p>${escapeMarkup(node.subtitle)}</p>` : ''}</header>${htmlBody(node)}${subset}</section>`;
}

export const METRIC_VALUE_FONT_PX = 22;
export const LEAD_VALUE_FONT_PX = Math.round(METRIC_VALUE_FONT_PX * METRIC_TIER_GEOMETRY_RATIO);

const DEFAULT_PAGE_TITLE = 'Decision dashboard';
const DEFAULT_PAGE_SUBTITLE = 'Source-backed context for the next decision.';

function pageHeaderText(options) {
  const header = options?.pageHeader ?? {};
  const clean = (value, fallback) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback);
  return { title: clean(header.title, DEFAULT_PAGE_TITLE), subtitle: clean(header.subtitle, DEFAULT_PAGE_SUBTITLE) };
}

// Visual-polish presentation tokens. These consume the frozen CR-4 attention
// taxonomy (anchor > primary > supporting > detail) and never assign it.
// Every breakpoint keeps a strict total order on each tested ladder field, so
// collapsing span geometry cannot silently collapse semantic hierarchy.
export const ROLE_ORDER = Object.freeze(['anchor', 'primary', 'supporting', 'detail']);

// REOPEN-STEP2 repair (F1/F2 human-review FAIL @e34e7fd): the anchor carries
// its mass through declared ladder tokens (typography/spacing) and a deeper
// neutral surface shadow. Encoding data ink (e.g. waterfall totals) is never
// weakened to manufacture dominance; the gap between primary and supporting
// stays at the minimal distinguishable step, and no gap is dumped mid-ladder.
// STEP 2.2 (parent attention ceiling, model A): tileLead/tileValue/tileSurface
// are the ceiling a local relevance tier may reach INSIDE a region of that
// role. The relation is ordinal, not a fixed px cap: the anchor/primary
// ceiling equals the unconstrained relevance geometry (33/22), while the
// supporting ceiling sits strictly below the primary region's own value level
// (tileLead < rp-value(primary), asserted by PA-3), so a supporting child can
// rank locally but can never out-shout the page-level primary.
export const ROLE_PRESENTATION = Object.freeze({
  visualLanguage: 'vp-1',
  hierarchyDegradation: 'none',
  breakpoints: Object.freeze([
    Object.freeze({ id: 'wide', condition: 'min-width:901px' }),
    Object.freeze({ id: 'tablet', condition: 'max-width:900px' }),
    Object.freeze({ id: 'narrow', condition: 'max-width:620px' })
  ]),
  ladders: Object.freeze({
    wide: Object.freeze({
      anchor: Object.freeze({ title: 25, value: 21, label: 15, meta: 13, pad: 30, tileLead: LEAD_VALUE_FONT_PX, tileValue: METRIC_VALUE_FONT_PX, tileSurface: 'emphasis' }),
      primary: Object.freeze({ title: 19, value: 16, label: 13, meta: 12, pad: 24, tileLead: LEAD_VALUE_FONT_PX, tileValue: METRIC_VALUE_FONT_PX, tileSurface: 'emphasis' }),
      supporting: Object.freeze({ title: 17, value: 14, label: 13, meta: 11, pad: 22, tileLead: 15, tileValue: 13, tileSurface: 'flat' }),
      detail: Object.freeze({ title: 15, value: 13, label: 12, meta: 11, pad: 18, tileLead: 13, tileValue: 12, tileSurface: 'flat' })
    }),
    tablet: Object.freeze({
      anchor: Object.freeze({ title: 24, value: 20, label: 14, meta: 12, pad: 27, tileLead: LEAD_VALUE_FONT_PX, tileValue: METRIC_VALUE_FONT_PX, tileSurface: 'emphasis' }),
      primary: Object.freeze({ title: 18, value: 16, label: 13, meta: 11, pad: 22, tileLead: LEAD_VALUE_FONT_PX, tileValue: METRIC_VALUE_FONT_PX, tileSurface: 'emphasis' }),
      supporting: Object.freeze({ title: 16, value: 14, label: 12, meta: 11, pad: 20, tileLead: 15, tileValue: 13, tileSurface: 'flat' }),
      detail: Object.freeze({ title: 14, value: 13, label: 12, meta: 10, pad: 16, tileLead: 13, tileValue: 12, tileSurface: 'flat' })
    }),
    narrow: Object.freeze({
      anchor: Object.freeze({ title: 23, value: 20, label: 14, meta: 12, pad: 24, tileLead: LEAD_VALUE_FONT_PX, tileValue: METRIC_VALUE_FONT_PX, tileSurface: 'emphasis' }),
      primary: Object.freeze({ title: 18, value: 16, label: 13, meta: 11, pad: 18, tileLead: LEAD_VALUE_FONT_PX, tileValue: METRIC_VALUE_FONT_PX, tileSurface: 'emphasis' }),
      supporting: Object.freeze({ title: 15, value: 13, label: 12, meta: 11, pad: 16, tileLead: 15, tileValue: 13, tileSurface: 'flat' }),
      detail: Object.freeze({ title: 13, value: 12, label: 11, meta: 10, pad: 14, tileLead: 13, tileValue: 12, tileSurface: 'flat' })
    })
  })
});

// Tile surface emphasis is a prominence channel (STEP 2.2 ruling), so it is
// ceiling-governed too. Each level declares BOTH ends of the in-region band:
// the lead pair and the family's minimum bounded surface for secondary tiles
// (PA-3b, STEP 2.3: flattened < secondary < lead). Every color here is
// already declared by the base card/tile/strip system — no new palette.
const TILE_SURFACE_TOKENS = Object.freeze({
  emphasis: Object.freeze({
    lead: '--rp-tile-lead-bg:#eef3fd;--rp-tile-lead-border:#c9d6f2',
    secondary: '--rp-tile-secondary-bg:#f8fafd;--rp-tile-secondary-border:#e7ebf3'
  }),
  flat: Object.freeze({
    lead: '--rp-tile-lead-bg:none;--rp-tile-lead-border:#e7ebf3',
    secondary: '--rp-tile-secondary-bg:none;--rp-tile-secondary-border:#eef1f7'
  })
});

const ROLE_CHROME = {
  anchor: 'border-color:#b9c9ea;box-shadow:0 2px 4px rgba(15,26,44,.07),0 24px 56px rgba(15,26,44,.16)',
  detail: 'background:#fbfcfe;border-color:#eceff6;box-shadow:none'
};

function roleRules(breakpointId) {
  const ladder = ROLE_PRESENTATION.ladders[breakpointId];
  return ROLE_ORDER.map((role) => {
    const t = ladder[role];
    // The surface channel is part of the hierarchy, not of the span geometry:
    // when breakpoints collapse every card to full width, chrome is what
    // keeps anchor and detail distinguishable without re-inventing roles.
    const chrome = ROLE_CHROME[role] ? `;${ROLE_CHROME[role]}` : '';
    // Children inside the region consume the region's ceiling tokens (PA-2):
    // local relevance ranks, the parent role caps how loud that rank can be.
    // Both band ends travel together — the secondary pair is the region's
    // floor (PA-3b), so no declared-tier tile can be flattened to bare text.
    const surface = TILE_SURFACE_TOKENS[t.tileSurface];
    const ceiling = `;--rp-tile-lead:${t.tileLead}px;--rp-tile-value:${t.tileValue}px;${surface.lead};${surface.secondary}`;
    return `.semantic-card--role-${role}{--rp-title:${t.title}px;--rp-value:${t.value}px;--rp-label:${t.label}px;--rp-meta:${t.meta}px;--rp-pad:${t.pad}px${ceiling}${chrome}}`;
  }).join('');
}

// The SVG artifact is one fixed 1440 canvas (geometry scales with the viewBox,
// so it has no media breakpoints), but the same total order must still hold on
// its own typography ladders.
export const SVG_ROLE_LADDER = Object.freeze({
  title: Object.freeze({ anchor: 22, primary: 19, supporting: 17, detail: 15 }),
  value: Object.freeze({ anchor: 17, primary: 15, supporting: 14, detail: 13 })
});

function svgRoleRules() {
  const { title, value } = SVG_ROLE_LADDER;
  const tileLadder = ROLE_PRESENTATION.ladders.wide;
  const tileCeiling = ROLE_ORDER.filter((role) => tileLadder[role].tileSurface === 'flat').flatMap((role) => [
    `g[data-attention-role="${role}"] .metric-value--lead{font-size:${tileLadder[role].tileLead}px}`,
    `g[data-attention-role="${role}"] .metric-value{font-size:${tileLadder[role].tileValue}px}`,
    `g[data-attention-role="${role}"] .metric-tile--lead{fill:none;stroke:#e7ebf3}`,
    `g[data-attention-role="${role}"] .metric-tile--secondary{fill:none;stroke:#eef1f7}`
  ]);
  return [
    ...ROLE_ORDER.map((role) => `g[data-attention-role="${role}"]>.title{font-size:${title[role]}px}`).join(''),
    'g[data-attention-role="detail"]>.title{fill:#42506a}',
    'g[data-attention-role="anchor"]>.card{stroke:#c9d5ec}',
    'g[data-attention-role="detail"]>.card{fill:#fbfcfe;stroke:#eceff6}',
    ...ROLE_ORDER.map((role) => `g[data-attention-role="${role}"] .value{font-size:${value[role]}px}`).join(''),
    ...tileCeiling
  ].join('');
}

const CSS_BASE = `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#172235;background:#eef1f6}.semantic-shell{max-width:1360px;margin:0 auto;padding:44px 30px 64px}.semantic-shell h1{font-size:32px;letter-spacing:-.02em;margin:0;color:#0f1a2c}.semantic-shell>p{font-size:14px;color:#74849e;margin:8px 0 34px}.typed-claims{display:grid;gap:8px;margin:0 0 20px}.typed-claim{display:inline-flex;width:max-content;max-width:100%;padding:9px 12px;border-radius:10px;background:#fff3d8;color:#6e4b00;font-size:13px;font-weight:700}.semantic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:22px}.semantic-grid>*{min-width:0}.semantic-card{background:#fff;border:1px solid #e7ebf3;border-radius:16px;padding:var(--rp-pad,20px);box-shadow:0 1px 2px rgba(15,26,44,.04),0 10px 26px rgba(15,26,44,.07)}.semantic-card header{border-bottom:1px solid #eef1f7;padding-bottom:12px}.semantic-card h2{font-size:var(--rp-title,16px);letter-spacing:-.012em;margin:0;color:#131e30}.semantic-card p{font-size:var(--rp-meta,12px);color:#75849c;margin:6px 0 0}.semantic-card ol{list-style:none;padding:0;margin:16px 0 0;display:grid;gap:10px}.semantic-card li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;align-items:end;position:relative;padding-bottom:9px}.semantic-card li span{font-size:var(--rp-label,13px);color:#41516b}.semantic-card li b{font-size:var(--rp-value,13px);color:#111c2e}.semantic-card li em{font-size:11px;color:#8290a8;font-style:normal;margin-right:6px}.semantic-card li small{grid-column:1/-1;color:#7f8ca3;font-size:var(--rp-meta,11px)}.visual-bar{display:block;width:var(--value);height:6px;background:#7e97c9;border-radius:999px}.visual-plot{margin-top:18px}.trend-plot{display:block;width:100%;height:200px;background:#fbfcfe;border-radius:12px}.trend-plot--compact{height:120px}.plot-baseline{stroke:#e3e8f1;stroke-width:1}.trend-line{fill:none;stroke:#3e63c6;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.trend-point{fill:#fff;stroke:#3e63c6;stroke-width:2}.trend-point--latest{fill:#3e63c6}.trend-value{font:700 12px Inter,Arial;fill:#22314a}.trend-year{font:11px Inter,Arial;fill:#75839a}.visual-plot--distribution .distribution-bars{display:grid;grid-template-columns:repeat(auto-fit,minmax(48px,1fr));gap:8px;align-items:end}.distribution-member{display:block!important;padding:0!important}.distribution-member>div{min-height:126px;display:flex;flex-direction:column;justify-content:end;gap:4px;padding:8px 5px;background:#f6f8fd;border-radius:10px}.distribution-member span{font-size:11px;text-align:center;color:#66758e}.distribution-member b{font-size:12px;text-align:center}.distribution-member .visual-bar{width:100%;height:calc(var(--value) * .82);min-height:5px;background:#8fabdb}.visual-ranking{gap:12px!important}.visual-ranking li .visual-bar,.breakdown-bars li .visual-bar,.relationship-row li .visual-bar{background:#7e97c9}.paired-ranking{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}.ranking-end{border:1px solid #e7ebf3;border-radius:14px;padding:14px;background:#fbfcfe}.ranking-end h3{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#7d8aa1}.ranking-end--high{border-top:4px solid #3e63c6}.ranking-end--low{border-top:4px solid #a4b0c5}.ranking-end ol{margin-top:14px}.metric-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:18px;background:#f8fafd;border-radius:14px;padding:10px}.metric-tile{min-height:94px;display:flex;flex-direction:column;justify-content:space-between;padding:13px;border-radius:12px}.metric-tile span{font-size:12px;font-weight:600;color:#687993}.metric-tile strong{font-size:var(--rp-tile-value,${METRIC_VALUE_FONT_PX}px);letter-spacing:-.02em;color:#101b2d}.metric-tile--lead{grid-column:span 2;background:var(--rp-tile-lead-bg,#eef3fd);border:1px solid var(--rp-tile-lead-border,#c9d6f2)}.metric-tile--lead strong{font-size:var(--rp-tile-lead,${LEAD_VALUE_FONT_PX}px)}.metric-tile--secondary{background:var(--rp-tile-secondary-bg,none);border:1px solid var(--rp-tile-secondary-border,transparent)}.metric-tile small{font-size:11px;color:#8390a5}.subset-note{margin:12px 0 0;font-size:11px;color:#8390a5;text-align:right}.visual-profile{margin-top:14px;display:grid;grid-template-columns:220px 1fr;gap:14px;align-items:center}.radar-plot{width:220px;height:220px;background:#f8faff;border-radius:50%}.radar-ring{fill:none;stroke:#dce3f0}.radar-polygon{fill:#6f87e8;fill-opacity:.2;stroke:#526bd8;stroke-width:3}.radar-dimensions{display:grid;gap:8px}.radar-dimension{font-size:12px;color:#63728a}.radar-dimension b{display:block;color:#172235;font-size:14px}.relationship-bars li .visual-bar{background:#8d9db8}.relationship-row--gap .visual-bar{background:#94a1b8}.relationship-row--target .visual-bar{background:#aeb9cc}.breakdown-bars li .visual-bar{background:#7e97c9}.semantic-list li{padding-bottom:12px}.semantic-list li span{overflow-wrap:anywhere}.semantic-grid--hero_support{grid-template-columns:repeat(2,minmax(0,1fr))}.semantic-grid--asymmetric{grid-template-columns:69fr 31fr}.semantic-card--value .semantic-list li .visual-bar{display:none}.bullet-chart{margin-top:18px}.bullet-legend{display:flex;justify-content:space-between;gap:12px;font-size:var(--rp-label,13px);color:#41516b}.bullet-legend b{font-size:var(--rp-value,13px);color:#111c2e}.bullet-track{position:relative;height:12px;margin-top:12px;background:#f2f5fb;border-radius:999px}.bullet-track .bullet-actual-bar{position:absolute;left:0;top:1px;height:10px;margin-top:0;background:#7e97c9;border-radius:999px}.bullet-target-marker{position:absolute;left:var(--at);top:-6px;width:3px;height:24px;background:#3e63c6;border-radius:2px;transform:translateX(-50%)}.bullet-gap-note{margin:12px 0 0;font-size:var(--rp-meta,12px);color:#5f6f89}.waterfall-chart{margin-top:18px}.waterfall-bridge{display:flex;align-items:stretch;gap:8px;height:230px}.waterfall-stage{flex:1;min-width:0;display:flex;flex-direction:column}.waterfall-plot{position:relative;flex:1}.waterfall-bar{position:absolute;left:10%;right:10%;display:block;border-radius:4px}.waterfall-total-bar{bottom:0;height:var(--height);background:#3e63c6}.waterfall-segment{bottom:var(--offset);height:var(--value);background:#7e97c9}.waterfall-connector{position:absolute;left:0;right:0;bottom:var(--at);display:block;height:0;border-top:1px dashed #9aa8bf}.waterfall-stage-label{display:block;font-size:11px;color:#66758e;text-align:center;margin-top:8px;overflow-wrap:anywhere}.waterfall-stage-value{display:block;font-size:var(--rp-value,12px);color:#111c2e;text-align:center;margin-top:2px}`;

const CSS = `${CSS_BASE}${roleRules('wide')}@media(max-width:900px){.semantic-grid,.semantic-grid--hero_support,.semantic-grid--asymmetric{grid-template-columns:1fr}${roleRules('tablet')}}@media(max-width:620px){.semantic-shell{padding:28px 14px 48px}.semantic-shell h1{font-size:26px}.metric-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.visual-profile{grid-template-columns:1fr}.paired-ranking{grid-template-columns:1fr}${roleRules('narrow')}}`;

export function renderSemanticHtml(data, composition, options = {}) {
  const nodes = resolvedNodes(data, composition, options);
  const pageComposition = composition?.pageComposition ?? null;
  const claims = visibleClaims(data, options).map((claim, index) => renderTypedClaim(claim, 'html', index)).join('');
  const gridAttrs = pageComposition
    ? ` class="semantic-grid semantic-grid--${escapeMarkup(pageComposition.pattern)}" data-page-pattern="${escapeMarkup(pageComposition.pattern)}" data-page-archetype="${escapeMarkup(pageComposition.archetype)}"`
    : ' class="semantic-grid"';
  const header = pageHeaderText(options);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeMarkup(header.title)}</title><style>${CSS}</style></head><body><main class="semantic-shell"><h1>${escapeMarkup(header.title)}</h1><p>${escapeMarkup(header.subtitle)}</p>${claims ? `<div class="typed-claims">${claims}</div>` : ''}<div${gridAttrs}>${nodes.map(htmlCard).join('')}</div></main></body></html>`;
}

function cardHeight(node) {
  if (node.visualSpec.mark === 'radar') return 360;
  if (node.visualSpec.mark === 'waterfall') return 356;
  if (node.visualSpec.mark === 'line') return 286;
  if (node.visualSpec.mark === 'metric_tile') return 250;
  if (node.visualSpec.mark === 'paired_bar') return 270;
  if (node.visualSpec.structure === 'ordered-distribution') return 320;
  return Math.max(284, 124 + node.items.length * 31);
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

const REGION_SPAN_WIDTHS = { full: 1344, standard: 664, wide: 912, narrow: 416 };

function widthForRegion(node, soloInRow) {
  if (node.regionSpan === 'full' && soloInRow) return REGION_SPAN_WIDTHS.full;
  if (node.regionSpan === 'wide') return REGION_SPAN_WIDTHS.wide;
  if (node.regionSpan === 'narrow') return REGION_SPAN_WIDTHS.narrow;
  return REGION_SPAN_WIDTHS.standard;
}

function regionPlacements(nodes) {
  const placements = [];
  placements.push({ node: nodes[0], x: 48, width: REGION_SPAN_WIDTHS.full });
  const rest = nodes.slice(1);
  for (let index = 0; index < rest.length; index += 2) {
    const pair = rest.slice(index, index + 2);
    const asymmetricPair = pair.length === 2 && (pair[0].regionSpan === 'wide' || pair[1].regionSpan === 'narrow');
    if (asymmetricPair) {
      placements.push({ node: pair[0], x: 48, width: REGION_SPAN_WIDTHS.wide });
      placements.push({ node: pair[1], x: 48 + REGION_SPAN_WIDTHS.wide + 16, width: REGION_SPAN_WIDTHS.narrow });
    } else {
      placements.push({ node: pair[0], x: 48, width: widthForRegion(pair[0], pair.length === 1) });
      if (pair[1]) {
        placements.push({ node: pair[1], x: 48 + placements[placements.length - 1].width + 16, width: widthForRegion(pair[1], false) });
      }
    }
  }
  return placements;
}

function regionCardLayout(nodes) {
  const placements = regionPlacements(nodes);
  const rows = [];
  for (const placement of placements) {
    const previous = rows.at(-1)?.at(-1);
    if (previous && placement.x !== 48 && previous.x === 48) rows[rows.length - 1].push(placement);
    else rows.push([placement]);
  }
  const layouts = [];
  let y = 110;
  for (const row of rows) {
    const height = Math.max(...row.map((placement) => cardHeight(placement.node)));
    for (const placement of row) layouts.push({ node: placement.node, x: placement.x, y, width: placement.width, height: cardHeight(placement.node) });
    y += height + 30;
  }
  return layouts;
}

function svgTextItem(node, item, index, x, y, className = 'label', mark = null, valueX = x + 540) {
  const attributes = itemAttributes(node, item, index, mark);
  return `<g ${attributes}><text x="${x}" y="${y}" class="${className}">${escapeMarkup(item.label)}</text><text x="${valueX}" y="${y}" text-anchor="end" class="value">${escapeMarkup(item.value)}</text>${item.detail ? `<text x="${x}" y="${y + 15}" class="detail">${escapeMarkup(item.detail)}</text>` : ''}</g>`;
}

function svgTrend(node, x, y, width) {
  const max = maxValue(node.items);
  const baselineY = y + 178;
  const amplitude = 108;
  const points = node.items.map((item, index) => {
    const pointX = x + 44 + ((width - 88) * index) / Math.max(node.items.length - 1, 1);
    const pointY = baselineY - (numericValue(item.value) / max) * amplitude;
    return [pointX, pointY];
  });
  const polyline = points.map(([pointX, pointY]) => `${pointX.toFixed(1)},${pointY.toFixed(1)}`).join(' ');
  const markers = points.map(([pointX, pointY], index) => {
    const item = node.items[index];
    const latest = index === points.length - 1 ? ' trend-point--latest' : '';
    return `<g ${itemAttributes(node, item, index)}><circle cx="${pointX.toFixed(1)}" cy="${pointY.toFixed(1)}" r="4" class="trend-point${latest}"/><text x="${pointX.toFixed(1)}" y="${(pointY - 13).toFixed(1)}" text-anchor="middle" class="trend-value">${escapeMarkup(item.value)}</text><text x="${pointX.toFixed(1)}" y="${(baselineY + 22).toFixed(1)}" text-anchor="middle" class="trend-year">${escapeMarkup(item.label)}</text></g>`;
  }).join('');
  return `<g data-visual-geometry="trajectory"><line x1="${x + 28}" y1="${baselineY}" x2="${x + width - 28}" y2="${baselineY}" class="plot-baseline"/><polyline data-visual-geometry="trajectory" data-point-count="${node.items.length}" points="${polyline}" class="trend-line"/>${markers}</g>`;
}

function svgDistribution(node, x, y, width) {
  const max = maxValue(node.items);
  const gap = 10;
  const barWidth = Math.max(12, (width - 44 - gap * Math.max(node.items.length - 1, 0)) / Math.max(node.items.length, 1));
  const bars = node.items.map((item, index) => {
    const barHeight = Math.max(8, (numericValue(item.value) / max) * 88);
    const barX = x + 22 + index * (barWidth + gap);
    const barY = y + 164 - barHeight;
    return `<g ${itemAttributes(node, item, index, 'bar')}><rect data-visual-mark-item="bar" x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="5" class="distribution-bar"/><text x="${(barX + barWidth / 2).toFixed(1)}" y="${y + 184}" text-anchor="middle" class="small-label">${escapeMarkup(item.label)}</text><text x="${(barX + barWidth / 2).toFixed(1)}" y="${y + 202}" text-anchor="middle" class="small-value">${escapeMarkup(item.value)}</text></g>`;
  }).join('');
  return `<g data-visual-geometry="distribution-bars">${bars}</g>`;
}

function svgRanking(node, x, y, width, paired = false) {
  const max = maxValue(node.items);
  if (paired) {
    const [high, low] = node.items;
    const endWidth = (width - 42) / 2;
    const item = (value, index, end, startX) => {
      const barWidth = magnitudeWidth(node, value.value, max, endWidth - 36);
      return `<g data-ranking-end="${end}" class="ranking-end ranking-end--${end}"><text x="${startX}" y="${y + 118}" class="small-label">${end === 'high' ? 'Highest' : 'Lowest'}</text><g ${itemAttributes(node, value, index, 'bar')}><text x="${startX}" y="${y + 148}" class="label">${escapeMarkup(value.label)}</text><text x="${startX + endWidth - 16}" y="${y + 148}" text-anchor="end" class="value">${escapeMarkup(value.value)}</text><rect data-visual-mark-item="bar" x="${startX}" y="${y + 158}" width="${barWidth.toFixed(1)}" height="8" rx="4" class="ranking-bar"/></g></g>`;
    };
    return `<g data-visual-geometry="paired-bars">${plotTrack(node, x + 22, x + 22 + endWidth - 36, y + 162)}${plotTrack(node, x + 22 + endWidth + 20, x + 22 + endWidth + 20 + endWidth - 36, y + 162)}${item(high, 0, 'high', x + 22)}${item(low, 1, 'low', x + 22 + endWidth + 20)}</g>`;
  }
  const rows = node.items.map((item, index) => {
    const rowY = y + 110 + index * 30;
    const barWidth = magnitudeWidth(node, item.value, max, width - 190);
    return `<g ${itemAttributes(node, item, index, 'bar')}><text x="${x + 22}" y="${rowY}" class="rank">${index + 1}</text><text x="${x + 50}" y="${rowY}" class="label">${escapeMarkup(item.label)}</text><text x="${x + width - 22}" y="${rowY}" text-anchor="end" class="value">${escapeMarkup(item.value)}</text><rect data-visual-mark-item="bar" x="${x + 50}" y="${rowY + 8}" width="${barWidth.toFixed(1)}" height="6" rx="3" class="ranking-bar"/></g>`;
  }).join('');
  return `<g data-visual-geometry="ranking-bars">${plotTrack(node, x + 50, x + 50 + width - 190, y + 118)}${rows}</g>`;
}

function svgMetricStrip(node, x, y, width) {
  const gap = 10;
  const weights = node.items.map((item) => (tierForItem(node, item)?.tier === 'lead' ? METRIC_TIER_GEOMETRY_RATIO : 1));
  const totalWeight = Math.max(weights.reduce((sum, weight) => sum + weight, 0), 1);
  const unit = (width - 44 - gap * Math.max(node.items.length - 1, 0)) / totalWeight;
  let tileX = x + 22;
  const tiles = node.items.map((item, index) => {
    const tier = tierForItem(node, item);
    const tileWidth = unit * weights[index];
    const valueClass = tier?.tier === 'lead' ? 'metric-value--lead' : 'metric-value';
    const detail = item.detail ? `<text x="${(tileX + 12).toFixed(1)}" y="${y + 186}" class="small-label">${escapeMarkup(item.detail)}</text>` : '';
    const tile = `<g ${itemAttributes(node, item, index)}${tierAttributes(tier)}><rect x="${tileX.toFixed(1)}" y="${y + 92}" width="${tileWidth.toFixed(1)}" height="108" rx="12" class="metric-tile${!tier ? '' : tier.tier === 'lead' ? ' metric-tile--lead' : ' metric-tile--secondary'}"/><text x="${(tileX + 12).toFixed(1)}" y="${y + 120}" class="small-label">${escapeMarkup(item.label)}</text><text x="${(tileX + 12).toFixed(1)}" y="${tier?.tier === 'lead' ? y + 162 : y + 166}" class="${valueClass}">${escapeMarkup(item.value)}</text>${detail}</g>`;
    tileX += tileWidth + gap;
    return tile;
  }).join('');
  const plateWidth = (tileX - gap + 10) - (x + 12);
  return `<g data-visual-geometry="metric-tiles"><rect x="${x + 12}" y="${y + 82}" width="${plateWidth.toFixed(1)}" height="128" rx="16" class="metric-strip-plate"/>${tiles}</g>`;
}

function svgRadar(node, x, y, width) {
  const dimensions = Array.isArray(node.dimensions) && node.dimensions.length > 0 ? node.dimensions : node.items.map((item) => ({ value: numericValue(item.value) }));
  const count = Math.max(dimensions.length, 1);
  const cx = x + width / 2;
  const cy = y + 152;
  const radius = 82;
  const points = dimensions.map((dimension, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    const value = Number.isFinite(dimension.normalizedScore) ? dimension.normalizedScore : numericValue(dimension.value);
    const pointRadius = radius * Math.max(0, Math.min(1, value / 100));
    return `${(cx + Math.cos(angle) * pointRadius).toFixed(1)},${(cy + Math.sin(angle) * pointRadius).toFixed(1)}`;
  }).join(' ');
  const axes = dimensions.map((dimension, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    return `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(angle) * radius).toFixed(1)}" y2="${(cy + Math.sin(angle) * radius).toFixed(1)}" class="radar-axis"/>`;
  }).join('');
  const labels = node.items.map((item, index) => svgTextItem(node, item, index, x + 22, y + 228 + index * 25, 'label', null, x + width - 28)).join('');
  return `<g data-visual-geometry="radar-polygon"><circle cx="${cx}" cy="${cy}" r="${radius}" class="radar-ring"/>${axes}<polygon points="${points}" data-visual-geometry="radar-polygon" class="radar-polygon"/>${labels}</g>`;
}

function svgBars(node, x, y, width, className = 'bar') {
  const max = maxValue(node.items);
  const rows = node.items.map((item, index) => {
    const rowY = y + 110 + index * 30;
    const barWidth = magnitudeWidth(node, item.value, max, width - 190);
    return `<g ${itemAttributes(node, item, index, 'bar')}><text x="${x + 22}" y="${rowY}" class="label">${escapeMarkup(item.label)}</text><text x="${x + width - 22}" y="${rowY}" text-anchor="end" class="value">${escapeMarkup(item.value)}</text><rect data-visual-mark-item="bar" x="${x + 22}" y="${rowY + 8}" width="${barWidth.toFixed(1)}" height="7" rx="3" class="${className}"/></g>`;
  }).join('');
  return `<g data-visual-geometry="${visualGeometry(node.visualSpec)}">${plotTrack(node, x + 22, x + 22 + width - 190, y + 118)}${rows}</g>`;
}

function encodingTrack(node, x1, x2, y) {
  return `<line data-encoding-track="true" data-semantic-node="${escapeMarkup(node.id)}" x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" class="plot-track"/>`;
}

function svgBullet(node, x, y, width) {
  const bullet = node.visualSpec.bullet;
  if (!bullet) throw new Error('bullet rendering requires a declared bullet scale');
  const [actual, target, gap] = bulletRoleItems(node);
  const trackX = x + 22;
  const trackW = width - 190;
  const at = (value) => trackX + mapFraction(value, bullet.valueDomain) * trackW;
  const legend = [actual, target].map((item) => svgTextItem(node, item, node.items.indexOf(item), x + 22, y + 100 + node.items.indexOf(item) * 24, 'label', null, x + width - 22)).join('');
  const actualWidth = Math.max(1, mapFraction(bullet.actual, bullet.valueDomain) * trackW);
  const gapGroup = `<g ${itemAttributes(node, gap, node.items.indexOf(gap))}><text x="${trackX}" y="${y + 196}" class="small-label" data-visual-annotation="gap">${escapeMarkup(bulletGapNote(bullet, gap))}</text></g>`;
  return `<g data-visual-geometry="bullet-target">${legend}${encodingTrack(node, trackX, trackX + trackW, y + 168)}<rect data-visual-mark-item="bullet-actual" x="${trackX.toFixed(1)}" y="${y + 160}" width="${actualWidth.toFixed(1)}" height="10" rx="5" class="bullet-actual-bar"/><rect data-visual-marker="target" x="${(at(bullet.target) - 1.5).toFixed(1)}" y="${y + 154}" width="3" height="22" class="bullet-target-marker"/>${gapGroup}</g>`;
}

function wrapSvgLabel(text, maxLength = 12) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maxLength) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 3 ? [`${lines.slice(0, 3).join(' ')}…`] : lines;
}

// The delivered SVG mirrors the HTML bridge: one shared value axis, totals
// anchored on the zero baseline, floating deltas chained by connectors.
function svgWaterfall(node, x, y, width) {
  const waterfall = node.visualSpec.waterfall;
  if (!waterfall) throw new Error('waterfall rendering requires a declared additive path');
  const trackX = x + 22;
  const trackW = width - 190;
  const plotTop = y + 88;
  const baseline = y + 216;
  const stageCount = node.items.length + 2;
  const slotW = trackW / stageCount;
  const barW = Math.min(64, slotW * 0.6);
  const at = (value) => baseline - mapFraction(value, waterfall.valueDomain) * (baseline - plotTop);
  const slotX = (slot) => trackX + slotW * slot + (slotW - barW) / 2;
  const slotCenter = (slot) => (slotX(slot) + barW / 2).toFixed(1);
  const stageLabel = (slot, lines) => lines.map((line, offset) => `<text x="${slotCenter(slot)}" y="${(baseline + 18 + offset * 12).toFixed(1)}" text-anchor="middle" class="small-label">${escapeMarkup(line)}</text>`).join('');
  const stageValue = (slot, lines, display) => `<text x="${slotCenter(slot)}" y="${(baseline + 18 + lines.length * 12).toFixed(1)}" text-anchor="middle" class="small-value">${escapeMarkup(display)}</text>`;
  const startLines = wrapSvgLabel(waterfall.startRef);
  const endLines = wrapSvgLabel(waterfall.endRef);
  const captionBottom = baseline + 18 + Math.max(startLines.length, endLines.length, ...node.items.map((item) => wrapSvgLabel(item.label).length)) * 12 + 26;
  const parts = [];
  parts.push(`<g data-waterfall-endpoint="start"><rect data-waterfall-total="start" x="${slotX(0).toFixed(1)}" y="${at(waterfall.startValue).toFixed(1)}" width="${barW.toFixed(1)}" height="${(baseline - at(waterfall.startValue)).toFixed(1)}" rx="3" class="waterfall-total-bar"/>${stageLabel(0, startLines)}${stageValue(0, startLines, waterfall.startDisplay)}</g>`);
  node.items.forEach((item, index) => {
    const segment = waterfall.segments[index];
    const top = Math.max(segment.cumulativeBefore, segment.cumulativeAfter);
    const low = Math.min(segment.cumulativeBefore, segment.cumulativeAfter);
    const rectY = at(top);
    const rectHeight = Math.max(1, at(low) - at(top));
    const connectorY = at(segment.cumulativeBefore);
    const connector = `<line data-visual-connector="true" data-connector-index="${index}" x1="${(slotX(index) + barW).toFixed(1)}" y1="${connectorY.toFixed(1)}" x2="${slotX(index + 1).toFixed(1)}" y2="${connectorY.toFixed(1)}" class="waterfall-connector-line"/>`;
    const labelLines = wrapSvgLabel(item.label);
    parts.push(`${connector}<g ${itemAttributes(node, item, index)}><rect data-visual-mark-item="waterfall-segment" data-segment-index="${index}" x="${slotX(index + 1).toFixed(1)}" y="${rectY.toFixed(1)}" width="${barW.toFixed(1)}" height="${rectHeight.toFixed(1)}" rx="3" class="waterfall-segment-bar"/>${stageLabel(index + 1, labelLines)}${stageValue(index + 1, labelLines, waterfallDeltaDisplay(segment, item))}</g>`);
  });
  const endSlot = node.items.length + 1;
  const endConnector = `<line data-visual-connector="true" data-connector-index="${node.items.length}" x1="${(slotX(endSlot - 1) + barW).toFixed(1)}" y1="${at(waterfall.endValue).toFixed(1)}" x2="${slotX(endSlot).toFixed(1)}" y2="${at(waterfall.endValue).toFixed(1)}" class="waterfall-connector-line"/>`;
  parts.push(`${endConnector}<g data-waterfall-endpoint="end"><rect data-waterfall-total="end" x="${slotX(endSlot).toFixed(1)}" y="${at(waterfall.endValue).toFixed(1)}" width="${barW.toFixed(1)}" height="${(baseline - at(waterfall.endValue)).toFixed(1)}" rx="3" class="waterfall-total-bar"/>${stageLabel(endSlot, endLines)}${stageValue(endSlot, endLines, waterfall.endDisplay)}</g>`);
  const axis = `<line data-encoding-axis="true" data-semantic-node="${escapeMarkup(node.id)}" x1="${trackX.toFixed(1)}" y1="${baseline.toFixed(1)}" x2="${trackX.toFixed(1)}" y2="${plotTop.toFixed(1)}" class="plot-axis"/>`;
  return `<g data-visual-geometry="waterfall-segments">${parts.join('')}${encodingTrack(node, trackX, trackX + trackW, baseline)}${axis}<text x="${trackX}" y="${captionBottom.toFixed(1)}" class="small-label">Cumulative path from ${escapeMarkup(waterfall.startRef)} to ${escapeMarkup(waterfall.endRef)}</text></g>`;
}

function svgList(node, x, y, width) {
  const rows = node.items.map((item, index) => svgTextItem(node, item, index, x + 22, y + 110 + index * 30, 'label', null, x + width - 22)).join('');
  return `<g data-visual-geometry="${visualGeometry(node.visualSpec)}">${rows}</g>`;
}

function svgBody(node, x, y, width) {
  if (node.visualSpec.mark === 'line') return svgTrend(node, x, y, width);
  if (node.visualSpec.mark === 'radar') return svgRadar(node, x, y, width);
  if (node.visualSpec.mark === 'bullet') return svgBullet(node, x, y, width);
  if (node.visualSpec.mark === 'waterfall') return svgWaterfall(node, x, y, width);
  if (node.visualSpec.mark === 'metric_tile') return svgMetricStrip(node, x, y, width);
  if (node.visualSpec.mark === 'paired_bar') return svgRanking(node, x, y, width, true);
  if (node.visualSpec.mark === 'gap_bar') return svgBars(node, x, y, width, 'gap-bar');
  if (node.visualSpec.structure === 'ordered-distribution') return svgDistribution(node, x, y, width);
  if (node.visualSpec.structure === 'ranked-order' || node.visualSpec.structure === 'top-ranked') return svgRanking(node, x, y, width);
  if (node.visualSpec.structure === 'decomposition') return svgBars(node, x, y, width, 'breakdown-bar');
  return svgList(node, x, y, width);
}

function svgCard(layout) {
  const { node, x, y, width, height } = layout;
  const subset = node.subsetDisclosure ? `<text x="${x + width - 22}" y="${y + height - 16}" text-anchor="end" class="small-label" data-subset-shown="${node.subsetDisclosure.shown}" data-subset-total="${node.subsetDisclosure.total}">${escapeMarkup(subsetNote(node))}</text>` : '';
  return `<g ${visualNodeAttributes(node)}><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" class="card"/><text x="${x + 22}" y="${y + 34}" class="title">${escapeMarkup(node.title)}</text>${node.subtitle ? `<text x="${x + 22}" y="${y + 56}" class="subtitle">${escapeMarkup(node.subtitle)}</text>` : ''}${svgBody(node, x, y, width)}${subset}</g>`;
}

export function renderSemanticSvg(data, composition, options = {}) {
  const nodes = resolvedNodes(data, composition, options);
  const pageComposition = composition?.pageComposition ?? null;
  const layouts = pageComposition && nodes.length >= 3 ? regionCardLayout(nodes) : cardLayout(nodes);
  const claims = visibleClaims(data, options).map((claim, index) => renderTypedClaim(claim, 'svg', index)).join('');
  const last = layouts.at(-1);
  const height = Math.max(520, (last?.y ?? 110) + (last?.height ?? 284) + 60);
  const pageAttrs = pageComposition ? ` data-page-pattern="${escapeMarkup(pageComposition.pattern)}" data-page-archetype="${escapeMarkup(pageComposition.archetype)}"` : '';
  const header = pageHeaderText(options);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 ${height}" role="img"${pageAttrs}><style>.card{fill:#fff;stroke:#e7ebf3}.title{font:700 18px Inter,Arial;fill:#131e30}.subtitle{font:12px Inter,Arial;fill:#75849c}.label{font:13px Inter,Arial;fill:#3d4d67}.value{font:700 13px Inter,Arial;fill:#111c2e}.small-label{font:11px Inter,Arial;fill:#75839a}.small-value{font:700 12px Inter,Arial;fill:#172235}.rank{font:700 11px Inter,Arial;fill:#8290a8}.detail{font:11px Inter,Arial;fill:#7f8ca3}.plot-baseline{stroke:#e3e8f1;stroke-width:1}.plot-track{stroke:none}.bullet-actual-bar{fill:#7e97c9}.bullet-target-marker{fill:#3e63c6}.waterfall-segment-bar{fill:#7e97c9}.waterfall-total-bar{fill:#3e63c6}.waterfall-connector-line{stroke:#9aa8bf;stroke-width:1;stroke-dasharray:3 3}.plot-axis{stroke:#dce3f0;stroke-width:1}.trend-line{fill:none;stroke:#3e63c6;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.trend-point{fill:#fff;stroke:#3e63c6;stroke-width:2}.trend-point--latest{fill:#3e63c6}.trend-value{font:700 12px Inter,Arial;fill:#22314a}.trend-year{font:11px Inter,Arial;fill:#75839a}.distribution-bar{fill:#8fabdb}.ranking-bar{fill:#7e97c9}.gap-bar{fill:#8d9db8}.breakdown-bar{fill:#7e97c9}.metric-strip-plate{fill:#f8fafd;stroke:none}.metric-tile{fill:none;stroke:none}.metric-tile--lead{fill:#eef3fd;stroke:#c9d6f2}.metric-tile--secondary{fill:#f8fafd;stroke:#e7ebf3}.metric-value{font:700 22px Inter,Arial;fill:#101b2d}.metric-value--lead{font:700 ${LEAD_VALUE_FONT_PX}px Inter,Arial;fill:#101b2d}.radar-ring{fill:none;stroke:#dce3f0}.radar-axis{stroke:#e2e7f1;stroke-width:1}.radar-polygon{fill:#6f87e8;fill-opacity:.2;stroke:#526bd8;stroke-width:3}text.title[x="48"][font-size="28"]{font:700 28px Inter,Arial;letter-spacing:-.02em;fill:#0f1a2c}text.subtitle[x="48"]{font-size:13px;fill:#74849e}${svgRoleRules()}</style><rect width="1440" height="${height}" fill="#eef1f6"/><text x="48" y="52" class="title" font-size="28">${escapeMarkup(header.title)}</text><text x="48" y="78" class="subtitle">${escapeMarkup(header.subtitle)}</text>${claims}${layouts.map(svgCard).join('')}</svg>`;
}
