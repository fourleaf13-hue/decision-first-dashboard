// Independent delivered-geometry verifier (production step 4 capability).
//
// This module deliberately shares NO scale math with the renderer: it re-derives
// expected magnitudes on its own from the delivered artifacts and the disclosed
// scale declarations. It imports nothing at all, so the renderer execution path
// stays mathematically independent and a bug in one path cannot mask the other.

const SUPPORTED_MAP_TYPE = 'linear';
const SUPPORTED_NORMALIZATION_BASIS = 'domain_max';
const HTML_MAGNITUDE_TOLERANCE_PP = 0.1;
const SVG_MAGNITUDE_TOLERANCE_PP = 0.1;
const SERIALIZATION_EPSILON_PX = 0.051;
const SERIALIZATION_EPSILON_PP = 0.051;
const BAR_ORIGIN_ANCHOR_TOLERANCE_PX = 0.15;
const HTML_MIN_BAR_PERCENT = 4;
const SVG_MIN_BAR_PX = 10;
const MEMBER_REF_PATTERN = /^\/semanticNodes\/\d+\/items\/\d+$/;
const FLOAT_EPSILON = 1e-9;

function parseDisplayNumber(text) {
  if (typeof text !== 'string') return null;
  const normalized = text.replace(/&[a-z]+;|&#\d+;/gi, '').replace(/[,\s]/g, '');
  const matched = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!matched) return null;
  const numeric = Number.parseFloat(matched[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

function numberAttribute(source, name) {
  const pattern = new RegExp(`(?:^|\\s)${name}="(-?[0-9.]+)"`);
  const matched = source.match(pattern);
  if (!matched) return null;
  const numeric = Number.parseFloat(matched[1]);
  return Number.isFinite(numeric) ? numeric : null;
}

function geometryError(code, path, message) {
  return { code, path, message };
}

function collectHtmlItems(html) {
  const byNode = new Map();
  const openPattern = /<(?:li|div|article|span)\s[^>]*data-semantic-node="([^"]+)"[^>]*data-semantic-item="true"[^>]*data-item-index="(\d+)"[^>]*>/g;
  const marks = [];
  let match;
  while ((match = openPattern.exec(html)) !== null) {
    marks.push({ nodeId: match[1], index: Number(match[2]), start: match.index + match[0].length });
  }
  marks.forEach((mark, position) => {
    const next = position + 1 < marks.length ? marks[position + 1].start : html.length;
    const sectionEnd = html.indexOf('</section>', mark.start);
    const end = sectionEnd !== -1 && sectionEnd < next ? sectionEnd : next;
    const body = html.slice(mark.start, Math.max(mark.start, end));
    const valueMatch = body.match(/<b[^>]*>([^<]*)<\/b>/);
    const percentMatch = body.match(/style="--value:([0-9.]+)%"/);
    const percent = percentMatch ? Number.parseFloat(percentMatch[1]) : null;
    const items = byNode.get(mark.nodeId) ?? new Map();
    if (!items.has(mark.index)) {
      items.set(mark.index, {
        valueText: valueMatch ? valueMatch[1] : null,
        percent: Number.isFinite(percent) ? percent : null
      });
    }
    byNode.set(mark.nodeId, items);
  });
  return byNode;
}

function collectSvgItems(svg) {
  const byNode = new Map();
  const itemPattern = /<g\s[^>]*data-semantic-node="([^"]+)"[^>]*data-semantic-item="true"[^>]*data-item-index="(\d+)"[^>]*>([\s\S]*?)<\/g>/g;
  let match;
  while ((match = itemPattern.exec(svg)) !== null) {
    const [, nodeId, index, body] = match;
    const valueMatch = body.match(/<text[^>]*class="value"[^>]*>([^<]*)<\/text>/);
    const rectMatch = body.match(/<rect[^>]*data-visual-mark-item="bar"[^>]*\/?>/);
    const items = byNode.get(nodeId) ?? new Map();
    const numericIndex = Number(index);
    if (!items.has(numericIndex)) {
      items.set(numericIndex, {
        valueText: valueMatch ? valueMatch[1] : null,
        barX: rectMatch ? numberAttribute(rectMatch[0], 'x') : null,
        barWidth: rectMatch ? numberAttribute(rectMatch[0], 'width') : null,
        hasBar: Boolean(rectMatch)
      });
    }
    byNode.set(nodeId, items);
  }
  return byNode;
}

function collectSvgTracks(svg) {
  const byNode = new Map();
  const trackPattern = /<line[^>]*data-plot-track="true"[^>]*data-semantic-node="([^"]+)"[^>]*\/?>/g;
  let match;
  while ((match = trackPattern.exec(svg)) !== null) {
    const x1 = numberAttribute(match[0], 'x1');
    const x2 = numberAttribute(match[0], 'x2');
    if (x1 === null || x2 === null) continue;
    const tracks = byNode.get(match[1]) ?? [];
    tracks.push({ x1, x2 });
    byNode.set(match[1], tracks);
  }
  return byNode;
}

function declarationProfileErrors(entry) {
  const nodeId = entry.node.id;
  const scale = entry.scale;
  const errors = [];
  if (typeof scale?.scaleId !== 'string' || scale.scaleId.length === 0 || typeof scale.relationshipRef !== 'string' || scale.relationshipRef.length === 0) {
    errors.push(geometryError('SCALE_MAP_DECLARATION_MISSING', `/nodes/${nodeId}/visualSpec/scale`, `${nodeId} declares a relationship-wide shared scale but discloses no canonical scale map to verify against.`));
    return errors;
  }
  const mismatch = (message) => geometryError('DELIVERED_GEOMETRY_DECLARATION_MISMATCH', `/nodes/${nodeId}/visualSpec/scale`, message);
  if (scale.mapType !== SUPPORTED_MAP_TYPE) {
    errors.push(mismatch(`${nodeId} discloses mapType "${String(scale.mapType)}" on scale "${scale.scaleId}"; only the frozen linear map is supported and geometry was never checked against it.`));
  }
  if (scale.normalizationBasis !== SUPPORTED_NORMALIZATION_BASIS) {
    errors.push(mismatch(`${nodeId} discloses normalizationBasis "${String(scale.normalizationBasis)}" on scale "${scale.scaleId}"; only "${SUPPORTED_NORMALIZATION_BASIS}" is supported.`));
  }
  const domain = scale.valueDomain;
  if (!Array.isArray(domain) || domain.length !== 2 || !domain.every((bound) => Number.isFinite(bound))) {
    errors.push(mismatch(`${nodeId} scale "${scale.scaleId}" is missing a finite two-entry valueDomain.`));
    return errors;
  }
  if (domain[0] !== 0) {
    errors.push(mismatch(`${nodeId} scale "${scale.scaleId}" declares valueDomain lower bound ${domain[0]}; the frozen profile requires valueDomain[0] === 0 (negative-centered, diverging, log, and z-score domains are not supported).`));
  }
  if (!(domain[1] > 0)) {
    errors.push(mismatch(`${nodeId} scale "${scale.scaleId}" declares valueDomain upper bound ${domain[1]}; the frozen profile requires high > 0.`));
  }
  if (scale.baseline !== 0) {
    errors.push(mismatch(`${nodeId} scale "${scale.scaleId}" declares baseline ${String(scale.baseline)}; the frozen profile requires baseline === 0.`));
  }
  if (!Array.isArray(scale.memberNodeIds) || scale.memberNodeIds.length === 0 || !scale.memberNodeIds.every((id) => typeof id === 'string' && id.length > 0)) {
    errors.push(mismatch(`${nodeId} scale "${scale.scaleId}" discloses no usable memberNodeIds roster.`));
  }
  if (!Array.isArray(scale.memberRefs) || scale.memberRefs.length === 0 || !scale.memberRefs.every((ref) => typeof ref === 'string' && MEMBER_REF_PATTERN.test(ref))) {
    errors.push(mismatch(`${nodeId} scale "${scale.scaleId}" discloses no usable memberRefs roster.`));
  }
  return errors;
}

function canonicalDeclaration(scale) {
  return JSON.stringify([
    scale.scaleId,
    scale.comparisonDomainId ?? null,
    scale.relationshipRef,
    scale.mapType,
    scale.normalizationBasis,
    scale.baseline,
    scale.valueDomain,
    scale.unit ?? null,
    scale.normalization ?? null,
    [...(scale.memberNodeIds ?? [])].sort(),
    [...(scale.memberRefs ?? [])].sort()
  ]);
}

function expectedHtmlPercent(value, high) {
  const fraction = value / high;
  return Math.max(HTML_MIN_BAR_PERCENT, Math.min(100, fraction * 100));
}

function verifyHtmlChannel(group, declaration, htmlItems, errors) {
  const high = declaration.valueDomain[1];
  const nodeIds = new Set(group.map((entry) => entry.node.id));
  for (const nodeId of declaration.memberNodeIds) {
    if (!nodeIds.has(nodeId)) {
      errors.push(geometryError('DELIVERED_GEOMETRY_DECLARATION_MISMATCH', `/nodes/${nodeId}/visualSpec/scale`, `scale "${declaration.scaleId}" lists member node ${nodeId} that carries no delivered declaration.`));
    }
  }
  for (const entry of group) {
    const nodeId = entry.node.id;
    const items = htmlItems.get(nodeId);
    if (!items || items.size === 0) {
      errors.push(geometryError('DELIVERED_HTML_SCALE_MEMBER_MISSING', `/nodes/${nodeId}`, `${nodeId} is a declared member of shared scale "${declaration.scaleId}" but no delivered HTML items were found for it.`));
      continue;
    }
    const expectedCount = Number.isFinite(entry.node.expectedItemCount) ? entry.node.expectedItemCount : null;
    if (expectedCount !== null) {
      for (let index = 0; index < expectedCount; index += 1) {
        if (!items.has(index)) {
          errors.push(geometryError('DELIVERED_HTML_SCALE_MEMBER_MISSING', `/nodes/${nodeId}/items/${index}`, `HTML member ${index} of declared scale "${declaration.scaleId}" is missing from the delivered artifact.`));
        }
      }
    }
    for (const [index, item] of items) {
      const path = `/nodes/${nodeId}/items/${index}`;
      const value = parseDisplayNumber(item.valueText);
      if (item.valueText === null || value === null) {
        errors.push(geometryError('DELIVERED_HTML_GEOMETRY_UNREADABLE', path, `HTML member of scale "${declaration.scaleId}" exposes no displayed numeric value to verify against.`));
        continue;
      }
      if (value < 0 || value > high + FLOAT_EPSILON) {
        errors.push(geometryError('DELIVERED_HTML_VALUE_OUTSIDE_DOMAIN', path, `HTML value ${value} for scale "${declaration.scaleId}" falls outside the declared domain [0, ${high}]; the verifier refuses to normalize it.`));
        continue;
      }
      if (item.percent === null) {
        errors.push(geometryError('DELIVERED_HTML_GEOMETRY_UNREADABLE', path, `HTML member of scale "${declaration.scaleId}" carries no readable --value magnitude token.`));
        continue;
      }
      const expected = expectedHtmlPercent(value, high);
      if (Math.abs(item.percent - expected) > HTML_MAGNITUDE_TOLERANCE_PP + SERIALIZATION_EPSILON_PP + FLOAT_EPSILON) {
        errors.push(geometryError('DELIVERED_SCALE_MAP_MISMATCH', path, `HTML bar drawn at ${item.percent}% does not match the declared linear map of scale "${declaration.scaleId}" (expected ${expected.toFixed(3)}% with a tolerance of ${HTML_MAGNITUDE_TOLERANCE_PP}pp for value ${value} on domain [0, ${high}]).`));
      }
    }
  }
}

function verifySvgChannel(group, declaration, svgItems, svgTracks, errors) {
  const high = declaration.valueDomain[1];
  let domainMaximumDrawnAtFullSpan = false;
  for (const entry of group) {
    const nodeId = entry.node.id;
    const items = svgItems.get(nodeId);
    if (!items || items.size === 0) {
      errors.push(geometryError('DELIVERED_SVG_SCALE_MEMBER_MISSING', `/nodes/${nodeId}`, `${nodeId} is a declared member of shared scale "${declaration.scaleId}" but no delivered SVG items were found for it.`));
      continue;
    }
    const tracks = svgTracks.get(nodeId) ?? [];
    const expectedCount = Number.isFinite(entry.node.expectedItemCount) ? entry.node.expectedItemCount : null;
    if (expectedCount !== null) {
      for (let index = 0; index < expectedCount; index += 1) {
        if (!items.has(index)) {
          errors.push(geometryError('DELIVERED_SVG_SCALE_MEMBER_MISSING', `/nodes/${nodeId}/items/${index}`, `SVG member ${index} of declared scale "${declaration.scaleId}" is missing from the delivered artifact.`));
        }
      }
    }
    for (const [index, item] of items) {
      const path = `/nodes/${nodeId}/items/${index}`;
      const value = parseDisplayNumber(item.valueText);
      if (item.valueText === null || value === null) {
        errors.push(geometryError('DELIVERED_SVG_GEOMETRY_UNREADABLE', path, `SVG member of scale "${declaration.scaleId}" exposes no displayed numeric value to verify against.`));
        continue;
      }
      if (value < 0 || value > high + FLOAT_EPSILON) {
        errors.push(geometryError('DELIVERED_SVG_VALUE_OUTSIDE_DOMAIN', path, `SVG value ${value} for scale "${declaration.scaleId}" falls outside the declared domain [0, ${high}]; the verifier refuses to normalize it.`));
        continue;
      }
      if (!item.hasBar || item.barX === null || item.barWidth === null) {
        errors.push(geometryError('DELIVERED_SVG_GEOMETRY_UNREADABLE', path, `SVG member of scale "${declaration.scaleId}" carries no readable bar primitive.`));
        continue;
      }
      if (tracks.length === 0) {
        errors.push(geometryError('DELIVERED_SVG_GEOMETRY_UNREADABLE', `/nodes/${nodeId}`, `${nodeId} has magnitude bars for scale "${declaration.scaleId}" but no delivered plot-track anchor to measure them against.`));
        continue;
      }
      const track = tracks.find((candidate) => Math.abs(item.barX - candidate.x1) <= BAR_ORIGIN_ANCHOR_TOLERANCE_PX && item.barX + item.barWidth <= candidate.x2 + BAR_ORIGIN_ANCHOR_TOLERANCE_PX);
      if (!track) {
        errors.push(geometryError('DELIVERED_SVG_GEOMETRY_UNREADABLE', path, `SVG bar at x=${item.barX} width=${item.barWidth} is not anchored inside any plot track delivered for ${nodeId}.`));
        continue;
      }
      const span = track.x2 - track.x1;
      if (!(span > 0)) {
        errors.push(geometryError('DELIVERED_SVG_GEOMETRY_UNREADABLE', path, `plot track for ${nodeId} has a non-positive drawable span.`));
        continue;
      }
      const expectedPixels = Math.max(SVG_MIN_BAR_PX, (value / high) * span);
      const actualNormalized = item.barWidth / span;
      const expectedNormalized = expectedPixels / span;
      const toleranceNormalized = (SVG_MAGNITUDE_TOLERANCE_PP + SERIALIZATION_EPSILON_PX) / span;
      if (Math.abs(actualNormalized - expectedNormalized) > toleranceNormalized + FLOAT_EPSILON) {
        errors.push(geometryError('SCALE_MAP_GEOMETRY_MISMATCH', path, `SVG bar of ${item.barWidth.toFixed(2)}px over a ${span.toFixed(2)}px drawable span (magnitude ${(actualNormalized * 100).toFixed(3)}%) does not match the declared linear map of scale "${declaration.scaleId}" (expected ${(expectedNormalized * 100).toFixed(3)}% for value ${value} on domain [0, ${high}]).`));
      }
      if (Math.abs(value - high) <= FLOAT_EPSILON && item.barWidth >= span - BAR_ORIGIN_ANCHOR_TOLERANCE_PX) {
        domainMaximumDrawnAtFullSpan = true;
      }
    }
  }
  return domainMaximumDrawnAtFullSpan;
}

function verifyMembershipRoster(group, declaration, svgItems, errors) {
  const refsBySourceNode = new Map();
  for (const ref of declaration.memberRefs) {
    const nodeSegment = Number(ref.split('/')[2]);
    refsBySourceNode.set(nodeSegment, (refsBySourceNode.get(nodeSegment) ?? 0) + 1);
  }
  const declaredCounts = [...refsBySourceNode.values()].filter((count) => count > 0).sort((a, b) => a - b);
  const deliveredCounts = group
    .map((entry) => svgItems.get(entry.node.id)?.size ?? 0)
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  if (JSON.stringify(declaredCounts) !== JSON.stringify(deliveredCounts)) {
    errors.push(geometryError('DELIVERED_GEOMETRY_DECLARATION_MISMATCH', `/scale/${declaration.scaleId}/memberRefs`, `scale "${declaration.scaleId}" declares member rosters of shape ${JSON.stringify(declaredCounts)} but the delivered artifact carries per-node magnitudes of shape ${JSON.stringify(deliveredCounts)}.`));
  }
}

export function verifyDeliveredGeometry({ html = '', svg = '', delivery = null } = {}) {
  const errors = [];
  const nodes = Array.isArray(delivery?.nodes) ? delivery.nodes : [];
  const declared = [];
  for (const node of nodes) {
    const scale = node?.visualSpec?.scale;
    if (scale?.type !== 'shared' || scale?.domain !== 'relationship') continue;
    declared.push({ node, scale });
  }
  if (declared.length === 0) return errors;

  const groups = new Map();
  for (const entry of declared) {
    const profileErrors = declarationProfileErrors(entry);
    if (profileErrors.length > 0) {
      errors.push(...profileErrors);
      continue;
    }
    if (!groups.has(entry.scale.scaleId)) groups.set(entry.scale.scaleId, []);
    groups.get(entry.scale.scaleId).push(entry);
  }

  const htmlItems = collectHtmlItems(String(html));
  const svgItems = collectSvgItems(String(svg));
  const svgTracks = collectSvgTracks(String(svg));

  for (const group of groups.values()) {
    const declaration = group[0].scale;
    const canonical = canonicalDeclaration(declaration);
    let conflicting = false;
    for (const entry of group.slice(1)) {
      if (canonicalDeclaration(entry.scale) !== canonical) {
        errors.push(geometryError('DELIVERED_GEOMETRY_DECLARATION_MISMATCH', `/nodes/${entry.node.id}/visualSpec/scale`, `delivered node ${entry.node.id} discloses scaleId "${declaration.scaleId}" with a map that contradicts the declaration carried by another sibling node.`));
        conflicting = true;
      }
    }
    if (conflicting) continue;

    verifyMembershipRoster(group, declaration, svgItems, errors);
    verifyHtmlChannel(group, declaration, htmlItems, errors);
    const anchored = verifySvgChannel(group, declaration, svgItems, svgTracks, errors);
    const high = declaration.valueDomain[1];
    const displayed = new Set();
    for (const entry of group) {
      for (const item of svgItems.get(entry.node.id)?.values() ?? []) displayed.add(item.valueText);
      for (const item of htmlItems.get(entry.node.id)?.values() ?? []) displayed.add(item.valueText);
    }
    const values = [...displayed].map((text) => parseDisplayNumber(text)).filter((value) => value !== null);
    if (!values.some((value) => Math.abs(value - high) <= FLOAT_EPSILON)) {
      errors.push(geometryError('DELIVERED_GEOMETRY_DECLARATION_MISMATCH', `/scale/${declaration.scaleId}/valueDomain`, `scale "${declaration.scaleId}" declares domain maximum ${high}, but no delivered member displays that value, so the plot span is not anchored to actual delivered geometry.`));
    } else if (!anchored) {
      errors.push(geometryError('SCALE_MAP_GEOMETRY_MISMATCH', `/scale/${declaration.scaleId}`, `scale "${declaration.scaleId}" declares domain maximum ${high}, but no delivered full-domain bar reaches the end of its plot track; the structural anchor contradicts the actual bar geometry.`));
    }
  }
  return errors;
}
