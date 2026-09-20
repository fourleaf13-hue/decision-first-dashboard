// Independent delivered-encoding verifier (Visual Encoding Router v1).
//
// Like geometry-verifier.js, this module shares NO scale math with the
// renderer: it re-derives expected bullet/waterfall geometry on its own from
// the delivered artifacts and the disclosed encoding declarations, so a bug
// in the renderer execution path cannot mask itself.

const SUPPORTED_ENCODING_MAP_TYPE = 'linear';
const HTML_MAGNITUDE_TOLERANCE_PP = 0.1;
const SVG_MAGNITUDE_TOLERANCE_PP = 0.1;
const SERIALIZATION_EPSILON_PX = 0.051;
const SERIALIZATION_EPSILON_PP = 0.051;
const BAR_ORIGIN_ANCHOR_TOLERANCE_PX = 0.15;
// The renderer only floors drawn bars at 1px for visibility (svgBullet /
// svgWaterfall); the verifier must re-derive the same visibility clamp.
const RENDERER_VISIBILITY_FLOOR_PX = 1;
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

function allMatches(source, pattern) {
  const results = [];
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let match;
  while ((match = global.exec(source)) !== null) results.push(match);
  return results;
}

function styleToken(source, token) {
  const matched = source.match(new RegExp(`--${token}:(-?[0-9.]+)%`));
  if (!matched) return null;
  const numeric = Number.parseFloat(matched[1]);
  return Number.isFinite(numeric) ? numeric : null;
}

function encodingDomainValid(domain) {
  return Array.isArray(domain) && domain.length === 2 && Number.isFinite(domain[0]) && domain[0] === 0 && Number.isFinite(domain[1]) && domain[1] > 0;
}

function encodingFraction(value, domain) {
  return Math.max(0, Math.min(1, (value - domain[0]) / (domain[1] - domain[0])));
}

function encodingError(code, path, message) {
  return { code, path, message };
}

// Scan window for one delivered encoding card: starts at the container tag
// that carries both the owning node id and the encoding geometry (HTML
// <section ...> / SVG card <g ...>, both emitted from the same attribute
// builder) and stops at the next card container or channel close, so it
// never bleeds into a sibling card without tripping over nested </g> tags.
function scanWindows(source, geometry) {
  const windows = new Map();
  for (const match of allMatches(source, new RegExp(`<(?:section|g)\\s[^>]*data-semantic-node="([^"]+)"[^>]*data-visual-geometry="${geometry}"[^>]*>`, 'g'))) {
    const after = match.index + match[0].length;
    const stops = [
      source.indexOf('data-semantic-container="true"', after),
      source.indexOf('</section>', after),
      source.indexOf('</svg>', after)
    ].filter((index) => index !== -1);
    windows.set(match[1], source.slice(after, stops.length > 0 ? Math.min(...stops) : source.length));
  }
  return windows;
}

function readHtmlBullet(window) {
  const actualLi = window.match(/<li\s[^>]*data-visual-mark-item="bullet-actual"[^>]*>([\s\S]*?)<\/li>/);
  // The target marker position lives on the marker element itself (an inner
  // span), not on the owning row.
  const targetTag = window.match(/<(?:span|i|b|div)\s[^>]*data-visual-marker="target"[^>]*>/);
  return {
    percent: actualLi ? styleToken(`${actualLi[0]}${actualLi[1]}`, 'value') : null,
    at: targetTag ? styleToken(targetTag[0], 'at') : null,
    hasGap: /data-visual-annotation="gap"/.test(window)
  };
}

function readSvgBullet(window) {
  const actualRect = window.match(/<rect[^>]*data-visual-mark-item="bullet-actual"[^>]*\/?>/)?.[0] ?? null;
  const targetRect = window.match(/<rect[^>]*data-visual-marker="target"[^>]*\/?>/)?.[0] ?? null;
  const track = window.match(/<line[^>]*data-encoding-track="true"[^>]*\/?>/)?.[0] ?? null;
  return {
    actualX: actualRect ? numberAttribute(actualRect, 'x') : null,
    actualWidth: actualRect ? numberAttribute(actualRect, 'width') : null,
    targetX: targetRect ? numberAttribute(targetRect, 'x') : null,
    targetWidth: targetRect ? numberAttribute(targetRect, 'width') : null,
    trackX1: track ? numberAttribute(track, 'x1') : null,
    trackX2: track ? numberAttribute(track, 'x2') : null,
    hasGap: /data-visual-annotation="gap"/.test(window)
  };
}

function readHtmlWaterfall(window) {
  const segments = [];
  for (const itemMatch of allMatches(window, /<li\s[^>]*data-semantic-item="true"[^>]*data-item-index="(\d+)"[^>]*>([\s\S]*?)<\/li>/g)) {
    const plotMatch = itemMatch[2].match(/<div class="waterfall-plot"[^>]*>([\s\S]*?)<\/div>/);
    segments[Number(itemMatch[1])] = {
      offset: plotMatch ? styleToken(plotMatch[1], 'offset') : null,
      percent: plotMatch ? styleToken(plotMatch[1], 'value') : null,
      valueText: itemMatch[2].match(/<b[^>]*>([^<]*)<\/b>/)?.[1] ?? null
    };
  }
  const startTag = window.match(/<span\s[^>]*data-waterfall-endpoint="start"[^>]*>/)?.[0] ?? null;
  const endTag = window.match(/<span\s[^>]*data-waterfall-endpoint="end"[^>]*>/)?.[0] ?? null;
  return {
    segments,
    start: startTag ? styleToken(startTag, 'at') : null,
    end: endTag ? styleToken(endTag, 'at') : null
  };
}

function readSvgWaterfall(window) {
  const segments = [];
  for (const segmentMatch of allMatches(window, /<rect[^>]*data-visual-mark-item="waterfall-segment"[^>]*\/?>/g)) {
    const indexMatch = segmentMatch[0].match(/data-segment-index="(\d+)"/);
    if (!indexMatch) continue;
    segments[Number(indexMatch[1])] = {
      x: numberAttribute(segmentMatch[0], 'x'),
      width: numberAttribute(segmentMatch[0], 'width')
    };
  }
  const track = window.match(/<line[^>]*data-encoding-track="true"[^>]*\/?>/)?.[0] ?? null;
  const endpoints = {};
  for (const role of ['start', 'end']) {
    const groupMatch = window.match(new RegExp(`<g[^>]*data-waterfall-endpoint="${role}"[^>]*>([\\s\\S]*?)(?:<\\/g>|<g\\s)`));
    const tick = groupMatch ? groupMatch[1].match(/<line[^>]*\/?>/)?.[0] : null;
    endpoints[role] = tick ? numberAttribute(tick, 'x1') : null;
  }
  return {
    segments,
    trackX1: track ? numberAttribute(track, 'x1') : null,
    trackX2: track ? numberAttribute(track, 'x2') : null,
    endpoints
  };
}

function verifyBulletNode(node, htmlWindow, svgWindow, errors) {
  const bullet = node.visualSpec.bullet;
  const path = `/nodes/${node.id}/visualSpec/bullet`;
  if (bullet.mapType !== SUPPORTED_ENCODING_MAP_TYPE) {
    errors.push(encodingError('DELIVERED_ENCODING_DECLARATION_INVALID', path, `${node.id} bullet discloses mapType "${String(bullet.mapType)}"; only the frozen linear map is verifiable.`));
    return;
  }
  if (!encodingDomainValid(bullet.valueDomain)) {
    errors.push(encodingError('DELIVERED_ENCODING_DECLARATION_INVALID', path, `${node.id} bullet discloses no finite [0, high] value domain to verify against.`));
    return;
  }
  const high = bullet.valueDomain[1];
  for (const [field, value] of [['actual', bullet.actual], ['target', bullet.target]]) {
    if (!Number.isFinite(value) || value < 0 || value > high + FLOAT_EPSILON) {
      errors.push(encodingError('DELIVERED_ENCODING_VALUE_OUTSIDE_DOMAIN', path, `${node.id} bullet ${field} ${value} falls outside the declared domain [0, ${high}].`));
    }
  }
  if (htmlWindow === undefined) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} bullet declares a target scale but the delivered HTML exposes no bullet-target card to read.`));
  } else {
    const entry = readHtmlBullet(htmlWindow);
    const tolerancePp = HTML_MAGNITUDE_TOLERANCE_PP + SERIALIZATION_EPSILON_PP + FLOAT_EPSILON;
    if (entry.percent === null || entry.at === null || !entry.hasGap) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} bullet declares a target scale but the delivered HTML exposes no readable actual bar, target marker, and gap annotation triple.`));
    } else {
      const expectedActual = Math.min(100, encodingFraction(bullet.actual, bullet.valueDomain) * 100);
      if (Math.abs(entry.percent - expectedActual) > tolerancePp) {
        errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `${node.id} bullet actual bar drawn at ${entry.percent}% but the declared map places actual ${bullet.actual} on domain [0, ${high}] at ${expectedActual.toFixed(3)}%.`));
      }
      const expectedTarget = Math.min(100, encodingFraction(bullet.target, bullet.valueDomain) * 100);
      if (Math.abs(entry.at - expectedTarget) > tolerancePp) {
        errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `${node.id} bullet target marker drawn at ${entry.at}% but the declared map places target ${bullet.target} on domain [0, ${high}] at ${expectedTarget.toFixed(3)}%.`));
      }
    }
  }
  if (svgWindow === undefined) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} bullet declares a target scale but the delivered SVG exposes no bullet-target card to read.`));
    return;
  }
  const entry = readSvgBullet(svgWindow);
  if (entry.actualX === null || entry.actualWidth === null || entry.targetX === null || entry.trackX1 === null || entry.trackX2 === null) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} bullet declares a target scale but the delivered SVG exposes no readable bar, marker, and encoding track.`));
    return;
  }
  const span = entry.trackX2 - entry.trackX1;
  if (!(span > 0)) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} bullet encoding track has a non-positive drawable span.`));
    return;
  }
  const tolerancePx = SERIALIZATION_EPSILON_PX + (SVG_MAGNITUDE_TOLERANCE_PP * span) / 100 + FLOAT_EPSILON;
  if (Math.abs(entry.actualX - entry.trackX1) > BAR_ORIGIN_ANCHOR_TOLERANCE_PX) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `${node.id} bullet actual bar starts at x=${entry.actualX} instead of the encoding track origin ${entry.trackX1}.`));
  }
  const expectedActualPx = Math.max(RENDERER_VISIBILITY_FLOOR_PX, encodingFraction(bullet.actual, bullet.valueDomain) * span);
  if (Math.abs(entry.actualWidth - expectedActualPx) > tolerancePx) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `${node.id} bullet actual bar drawn ${entry.actualWidth}px but the declared map requires ${expectedActualPx.toFixed(2)}px for actual ${bullet.actual} on domain [0, ${high}].`));
  }
  const markerCenterOffset = entry.targetX + (entry.targetWidth ?? 0) / 2 - entry.trackX1;
  const expectedTargetPx = encodingFraction(bullet.target, bullet.valueDomain) * span;
  if (Math.abs(markerCenterOffset - expectedTargetPx) > tolerancePx + (entry.targetWidth ?? 0) / 2) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `${node.id} bullet target marker drawn centered at ${markerCenterOffset.toFixed(2)}px but the declared map places target ${bullet.target} at ${expectedTargetPx.toFixed(2)}px on domain [0, ${high}].`));
  }
  if (!entry.hasGap) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} bullet declares a gap but the delivered SVG carries no gap annotation node.`));
  }
}

function verifyWaterfallNode(node, htmlWindow, svgWindow, errors) {
  const waterfall = node.visualSpec.waterfall;
  const path = `/nodes/${node.id}/visualSpec/waterfall`;
  if (waterfall.mapType !== SUPPORTED_ENCODING_MAP_TYPE) {
    errors.push(encodingError('DELIVERED_ENCODING_DECLARATION_INVALID', path, `${node.id} waterfall discloses mapType "${String(waterfall.mapType)}"; only the frozen linear map is verifiable.`));
    return;
  }
  if (!encodingDomainValid(waterfall.valueDomain)) {
    errors.push(encodingError('DELIVERED_ENCODING_DECLARATION_INVALID', path, `${node.id} waterfall discloses no finite [0, high] value domain to verify against.`));
    return;
  }
  const high = waterfall.valueDomain[1];
  const segments = Array.isArray(waterfall.segments) ? waterfall.segments : [];
  if (segments.length === 0) {
    errors.push(encodingError('DELIVERED_ENCODING_DECLARATION_INVALID', path, `${node.id} waterfall declares no segments to verify.`));
    return;
  }
  const tolerancePp = HTML_MAGNITUDE_TOLERANCE_PP + SERIALIZATION_EPSILON_PP + FLOAT_EPSILON;
  if (htmlWindow !== undefined) {
    const entry = readHtmlWaterfall(htmlWindow);
    const readable = entry.segments.filter(Boolean);
    if (readable.length !== segments.length) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall declares ${segments.length} segments but the delivered HTML exposes ${readable.length} readable segment bars.`));
    } else {
      segments.forEach((segment, index) => {
        const drawn = entry.segments[index];
        if (!drawn || drawn.offset === null || drawn.percent === null) {
          errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', `${path}/segments/${index}`, `waterfall segment ${index} has no readable offset/width pair in the delivered HTML.`));
          return;
        }
        const low = Math.min(segment.cumulativeBefore, segment.cumulativeAfter);
        const top = Math.max(segment.cumulativeBefore, segment.cumulativeAfter);
        const expectedOffset = encodingFraction(low, waterfall.valueDomain) * 100;
        const expectedWidth = (encodingFraction(top, waterfall.valueDomain) - encodingFraction(low, waterfall.valueDomain)) * 100;
        if (Math.abs(drawn.offset - expectedOffset) > tolerancePp || Math.abs(drawn.percent - expectedWidth) > tolerancePp) {
          errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${index}`, `waterfall segment ${index} drawn at offset ${drawn.offset}% width ${drawn.percent}% but the declared cumulative path [${low}, ${top}] on domain [0, ${high}] requires offset ${expectedOffset.toFixed(3)}% width ${expectedWidth.toFixed(3)}%.`));
        }
        const displayed = parseDisplayNumber(drawn.valueText);
        const magnitude = Math.abs(segment.cumulativeAfter - segment.cumulativeBefore);
        if (displayed !== null && Math.abs(displayed - magnitude) > Math.max(magnitude * 0.02, 0.011) + FLOAT_EPSILON) {
          errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${index}`, `waterfall segment ${index} displays ${drawn.valueText} but its declared cumulative path moves by ${magnitude}.`));
        }
      });
      for (const [role, value] of [['start', waterfall.startValue], ['end', waterfall.endValue]]) {
        const drawn = entry[role];
        if (drawn === null || drawn === undefined) {
          errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall is missing its delivered ${role} endpoint anchor.`));
          continue;
        }
        const expected = encodingFraction(value, waterfall.valueDomain) * 100;
        if (Math.abs(drawn - expected) > tolerancePp) {
          errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `waterfall ${role} endpoint drawn at ${drawn}% but the declared value ${value} maps to ${expected.toFixed(3)}% on domain [0, ${high}].`));
        }
      }
    }
  } else {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall declares an additive path but the delivered HTML exposes no waterfall card to read.`));
  }
  if (svgWindow === undefined) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall declares an additive path but the delivered SVG exposes no waterfall card to read.`));
    return;
  }
  const svgEntry = readSvgWaterfall(svgWindow);
  const svgReadable = svgEntry.segments.filter(Boolean);
  if (svgEntry.trackX1 === null || svgEntry.trackX2 === null || svgReadable.length !== segments.length) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall declares ${segments.length} segments but the delivered SVG exposes no fully readable segment/track geometry.`));
    return;
  }
  const span = svgEntry.trackX2 - svgEntry.trackX1;
  if (!(span > 0)) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall encoding track has a non-positive drawable span.`));
    return;
  }
  segments.forEach((segment, index) => {
    const drawn = svgEntry.segments[index];
    if (!drawn || drawn.x === null || drawn.width === null) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', `${path}/segments/${index}`, `waterfall segment ${index} has no readable rect geometry in the delivered SVG.`));
      return;
    }
    const low = Math.min(segment.cumulativeBefore, segment.cumulativeAfter);
    const top = Math.max(segment.cumulativeBefore, segment.cumulativeAfter);
    const expectedX = svgEntry.trackX1 + encodingFraction(low, waterfall.valueDomain) * span;
    const expectedWidth = Math.max(1, (encodingFraction(top, waterfall.valueDomain) - encodingFraction(low, waterfall.valueDomain)) * span);
    if (Math.abs(drawn.x - expectedX) > SERIALIZATION_EPSILON_PX + FLOAT_EPSILON || Math.abs(drawn.width - expectedWidth) > SERIALIZATION_EPSILON_PX + FLOAT_EPSILON) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${index}`, `waterfall segment ${index} drawn at x=${drawn.x} width=${drawn.width} but the declared cumulative path [${low}, ${top}] requires x=${expectedX.toFixed(2)} width=${expectedWidth.toFixed(2)} on the delivered ${span.toFixed(2)}px track.`));
    }
  });
  for (const [role, value] of [['start', waterfall.startValue], ['end', waterfall.endValue]]) {
    const drawn = svgEntry.endpoints?.[role];
    if (drawn === null || drawn === undefined) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall SVG is missing its ${role} endpoint tick.`));
      continue;
    }
    const expected = svgEntry.trackX1 + encodingFraction(value, waterfall.valueDomain) * span;
    if (Math.abs(drawn - expected) > SERIALIZATION_EPSILON_PX + FLOAT_EPSILON) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `waterfall SVG ${role} endpoint tick drawn at x=${drawn} but the declared value ${value} maps to x=${expected.toFixed(2)}.`));
    }
  }
}

export function verifyDeliveredEncodingGeometry({ html = '', svg = '', delivery = null } = {}) {
  const errors = [];
  const nodes = Array.isArray(delivery?.nodes) ? delivery.nodes : [];
  const bulletNodes = nodes.filter((node) => node?.visualSpec?.bullet);
  const waterfallNodes = nodes.filter((node) => node?.visualSpec?.waterfall);
  if (bulletNodes.length === 0 && waterfallNodes.length === 0) return errors;
  if (bulletNodes.length > 0) {
    const htmlCards = scanWindows(String(html), 'bullet-target');
    const svgCards = scanWindows(String(svg), 'bullet-target');
    for (const node of bulletNodes) verifyBulletNode(node, htmlCards.get(node.id), svgCards.get(node.id), errors);
  }
  if (waterfallNodes.length > 0) {
    const htmlCards = scanWindows(String(html), 'waterfall-segments');
    const svgCards = scanWindows(String(svg), 'waterfall-segments');
    for (const node of waterfallNodes) verifyWaterfallNode(node, htmlCards.get(node.id), svgCards.get(node.id), errors);
  }
  return errors;
}
