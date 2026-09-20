// Independent delivered-encoding verifier (Visual Encoding Router v1.1).
//
// Like geometry-verifier.js, this module shares NO scale math with the
// renderer: it re-derives expected bullet/waterfall geometry on its own from
// the delivered artifacts and the disclosed encoding declarations, so a bug
// in the renderer execution path cannot mask itself.
//
// The cumulative-path assertions are computed from DELIVERED geometry, never
// from manifest numbers alone: every bridge primitive (connector, floating
// segment, anchored total) must map onto the disclosed value axis AND touch
// its neighbours at a shared delivered level, so a manifest that merely
// restates its own numbers can never pass.

const SUPPORTED_ENCODING_MAP_TYPE = 'linear';
const HTML_MAGNITUDE_TOLERANCE_PP = 0.1;
const SVG_MAGNITUDE_TOLERANCE_PP = 0.1;
const SERIALIZATION_EPSILON_PX = 0.051;
const SERIALIZATION_EPSILON_PP = 0.051;
const BAR_ORIGIN_ANCHOR_TOLERANCE_PX = 0.15;
// The renderer only floors drawn bars at 1px for visibility (svgWaterfall);
// the verifier must re-derive the same visibility clamp.
const RENDERER_VISIBILITY_FLOOR_PX = 1;
const FLOAT_EPSILON = 1e-9;
// Delivered-to-delivered bridge continuity tolerances: two independently
// serialized one-decimal primitives may drift by 0.1pp / 0.1px each.
const BRIDGE_CONTINUITY_PP = HTML_MAGNITUDE_TOLERANCE_PP + SERIALIZATION_EPSILON_PP + FLOAT_EPSILON;
const BRIDGE_CONTINUITY_PX = 0.25;

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

function countOccurrences(source, needle) {
  let count = 0;
  let index = source.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = source.indexOf(needle, index + needle.length);
  }
  return count;
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

// The bullet contract: the actual bar and the target marker must sit inside
// ONE delivered encoding track container — a marker floating elsewhere on the
// card is a decoration, not a target on the bar's scale.
function readHtmlBullet(window) {
  const trackMatch = window.match(/<(?:div|span|ol|ul)\s[^>]*data-encoding-track="true"[^>]*>([\s\S]*?)<\/(?:div|span|ol|ul)>/);
  const track = trackMatch ? trackMatch[1] : null;
  const barTag = track?.match(/<(?:i|b|span|div)\s[^>]*data-visual-mark-item="bullet-actual"[^>]*>/)?.[0] ?? null;
  const markerTag = track?.match(/<(?:i|b|span|div)\s[^>]*data-visual-marker="target"[^>]*>/)?.[0] ?? null;
  return {
    hasTrack: Boolean(trackMatch),
    percent: barTag ? styleToken(barTag, 'value') : null,
    at: markerTag ? styleToken(markerTag, 'at') : null,
    gapCount: countOccurrences(window, 'data-visual-annotation="gap"')
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
    gapCount: countOccurrences(window, 'data-visual-annotation="gap"')
  };
}

function readHtmlWaterfall(window) {
  const segments = [];
  for (const match of allMatches(window, /<(?:i|b|span|div)\s[^>]*data-visual-mark-item="waterfall-segment"[^>]*>/g)) {
    const indexMatch = match[0].match(/data-segment-index="(\d+)"/);
    if (!indexMatch) continue;
    segments[Number(indexMatch[1])] = {
      offset: styleToken(match[0], 'offset'),
      percent: styleToken(match[0], 'value')
    };
  }
  const connectors = [];
  for (const match of allMatches(window, /<(?:i|b|span|div)\s[^>]*data-visual-connector="true"[^>]*>/g)) {
    const indexMatch = match[0].match(/data-connector-index="(\d+)"/);
    if (!indexMatch) continue;
    connectors[Number(indexMatch[1])] = styleToken(match[0], 'at');
  }
  const totals = {};
  for (const role of ['start', 'end']) {
    const tag = window.match(new RegExp(`<(?:i|b|span|div)\\s[^>]*data-waterfall-total="${role}"[^>]*>`))?.[0] ?? null;
    totals[role] = tag ? styleToken(tag, 'height') : null;
  }
  const valueTexts = [];
  for (const match of allMatches(window, /data-semantic-item="true"[^>]*data-item-index="(\d+)"[\s\S]*?<b class="waterfall-stage-value">([^<]*)<\/b>/g)) {
    valueTexts[Number(match[1])] = match[2];
  }
  return { segments, connectors, totals, valueTexts };
}

function readSvgWaterfall(window) {
  const segments = [];
  for (const match of allMatches(window, /<rect[^>]*data-visual-mark-item="waterfall-segment"[^>]*\/?>/g)) {
    const indexMatch = match[0].match(/data-segment-index="(\d+)"/);
    if (!indexMatch) continue;
    segments[Number(indexMatch[1])] = {
      x: numberAttribute(match[0], 'x'),
      y: numberAttribute(match[0], 'y'),
      width: numberAttribute(match[0], 'width'),
      height: numberAttribute(match[0], 'height')
    };
  }
  const totals = {};
  for (const role of ['start', 'end']) {
    const rect = window.match(new RegExp(`<rect[^>]*data-waterfall-total="${role}"[^>]*\\/>`))?.[0] ?? null;
    totals[role] = rect
      ? { x: numberAttribute(rect, 'x'), y: numberAttribute(rect, 'y'), width: numberAttribute(rect, 'width'), height: numberAttribute(rect, 'height') }
      : null;
  }
  const connectors = [];
  for (const match of allMatches(window, /<line[^>]*data-visual-connector="true"[^>]*\/?>/g)) {
    const indexMatch = match[0].match(/data-connector-index="(\d+)"/);
    if (!indexMatch) continue;
    connectors[Number(indexMatch[1])] = {
      x1: numberAttribute(match[0], 'x1'),
      x2: numberAttribute(match[0], 'x2'),
      y1: numberAttribute(match[0], 'y1'),
      y2: numberAttribute(match[0], 'y2')
    };
  }
  const axis = window.match(/<line[^>]*data-encoding-axis="true"[^>]*\/?>/)?.[0] ?? null;
  const track = window.match(/<line[^>]*data-encoding-track="true"[^>]*\/?>/)?.[0] ?? null;
  return {
    segments,
    totals,
    connectors,
    axis: axis
      ? { x1: numberAttribute(axis, 'x1'), y1: numberAttribute(axis, 'y1'), x2: numberAttribute(axis, 'x2'), y2: numberAttribute(axis, 'y2') }
      : null,
    trackY: track ? numberAttribute(track, 'y1') : null
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
    if (!entry.hasTrack || entry.percent === null || entry.at === null) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} bullet declares a target scale but the delivered HTML does not expose one shared encoding track carrying both a readable actual bar and a target marker.`));
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
    if (entry.gapCount !== 1) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} bullet must expose exactly one neutral gap annotation but the delivered HTML carries ${entry.gapCount}.`));
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
  if (entry.gapCount !== 1) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} bullet must expose exactly one neutral gap annotation but the delivered SVG carries ${entry.gapCount}.`));
  }
}

function closePct(a, b) {
  return Math.abs(a - b) <= BRIDGE_CONTINUITY_PP;
}

function touchesEdge(level, rectTop, rectBottom, tolerance) {
  return Math.abs(level - rectTop) <= tolerance || Math.abs(level - rectBottom) <= tolerance;
}

function verifyHtmlWaterfallBridge(node, waterfall, htmlWindow, errors) {
  const path = `/nodes/${node.id}/visualSpec/waterfall`;
  const segments = waterfall.segments;
  const tolerancePp = HTML_MAGNITUDE_TOLERANCE_PP + SERIALIZATION_EPSILON_PP + FLOAT_EPSILON;
  const pctOf = (value) => encodingFraction(value, waterfall.valueDomain) * 100;
  const entry = readHtmlWaterfall(htmlWindow);
  const readable = entry.segments.filter((drawn) => drawn && drawn.offset !== null && drawn.percent !== null);
  if (readable.length !== segments.length) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall declares ${segments.length} segments but the delivered HTML exposes ${readable.length} readable segment bars.`));
    return;
  }
  const connectorCount = entry.connectors.filter((at) => at !== null && at !== undefined).length;
  if (connectorCount !== segments.length + 1 || entry.totals.start === null || entry.totals.end === null) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall bridge is not delivered as a continuous chain: ${segments.length + 1} junction connectors and two anchored totals are required, got ${connectorCount} connectors and totals at ${String(entry.totals.start)}/${String(entry.totals.end)}.`));
    return;
  }

  // Declared-map anchoring: every delivered primitive must sit where the
  // disclosed linear map places its cumulative value.
  segments.forEach((segment, index) => {
    const drawn = entry.segments[index];
    const low = Math.min(segment.cumulativeBefore, segment.cumulativeAfter);
    const top = Math.max(segment.cumulativeBefore, segment.cumulativeAfter);
    const expectedOffset = pctOf(low);
    const expectedWidth = pctOf(top) - expectedOffset;
    if (Math.abs(drawn.offset - expectedOffset) > tolerancePp || Math.abs(drawn.percent - expectedWidth) > tolerancePp) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${index}`, `waterfall segment ${index} drawn at offset ${drawn.offset}% width ${drawn.percent}% but the declared cumulative path [${low}, ${top}] on domain [0, ${waterfall.valueDomain[1]}] requires offset ${expectedOffset.toFixed(3)}% width ${expectedWidth.toFixed(3)}%.`));
    }
    const displayed = entry.valueTexts[index];
    const magnitude = Math.abs(segment.cumulativeAfter - segment.cumulativeBefore);
    const parsed = parseDisplayNumber(displayed);
    if (displayed === undefined || parsed === null) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', `${path}/segments/${index}`, `waterfall segment ${index} exposes no displayed delta value to verify against the declared path.`));
    } else {
      if (Math.abs(parsed - magnitude) > Math.max(magnitude * 0.02, 0.011) + FLOAT_EPSILON) {
        errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${index}`, `waterfall segment ${index} displays ${displayed} but its declared cumulative path moves by ${magnitude}.`));
      }
      const drawnNegative = /-[^\d]*\d/.test(displayed);
      if (segment.sign === 'minus' && !drawnNegative) {
        errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${index}`, `waterfall segment ${index} declares a minus sign but displays ${displayed} without one.`));
      }
      if (segment.sign === 'plus' && drawnNegative) {
        errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${index}`, `waterfall segment ${index} declares a plus sign but displays ${displayed}.`));
      }
    }
  });
  for (const [role, value] of [['start', waterfall.startValue], ['end', waterfall.endValue]]) {
    const drawn = entry.totals[role];
    const expected = pctOf(value);
    if (Math.abs(drawn - expected) > tolerancePp) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `waterfall ${role} total drawn at ${drawn}% but the declared value ${value} maps to ${expected.toFixed(3)}% on domain [0, ${waterfall.valueDomain[1]}].`));
    }
  }
  segments.forEach((segment, index) => {
    const expected = pctOf(segment.cumulativeBefore);
    if (Math.abs(entry.connectors[index] - expected) > tolerancePp) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${index}`, `waterfall connector ${index} drawn at ${entry.connectors[index]}% but the declared junction level ${segment.cumulativeBefore} maps to ${expected.toFixed(3)}%.`));
    }
  });
  const lastJunction = pctOf(waterfall.endValue);
  if (Math.abs(entry.connectors[segments.length] - lastJunction) > tolerancePp) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `waterfall closing connector drawn at ${entry.connectors[segments.length]}% but the declared end value ${waterfall.endValue} maps to ${lastJunction.toFixed(3)}%.`));
  }

  // Delivered staircase continuity: connector levels must touch the bar edges
  // they bridge, using only delivered geometry.
  const drawnEdges = (index) => {
    const drawn = entry.segments[index];
    return [drawn.offset, drawn.offset + drawn.percent];
  };
  if (!closePct(entry.connectors[0], entry.totals.start)) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `waterfall bridge break at the start total: first connector drawn at ${entry.connectors[0]}% does not meet the ${entry.totals.start}% top of the start total.`));
  }
  if (!closePct(entry.connectors[segments.length], entry.totals.end)) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `waterfall bridge break at the end total: closing connector drawn at ${entry.connectors[segments.length]}% does not meet the ${entry.totals.end}% top of the end total.`));
  }
  segments.forEach((segment, index) => {
    const level = entry.connectors[index];
    const [bottom, top] = drawnEdges(index);
    if (!closePct(level, bottom) && !closePct(level, top)) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${index}`, `waterfall segment ${index} leaves the staircase: its drawn edges sit at ${bottom.toFixed(3)}%/${top.toFixed(3)}% but the junction connector entering it is drawn at ${level}%.`));
    }
    if (index > 0) {
      const previous = drawnEdges(index - 1);
      if (!closePct(level, previous[0]) && !closePct(level, previous[1])) {
        errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${index}`, `waterfall bridge break between segments ${index - 1} and ${index}: the connector sits at ${level}% while segment ${index - 1} ends at ${previous[0].toFixed(3)}%/${previous[1].toFixed(3)}%.`));
      }
    }
  });
  const closingLevel = entry.connectors[segments.length];
  const lastEdges = drawnEdges(segments.length - 1);
  if (!closePct(closingLevel, lastEdges[0]) && !closePct(closingLevel, lastEdges[1])) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${segments.length - 1}`, `waterfall bridge break at the final segment: the closing connector sits at ${closingLevel}% while the last floating segment ends at ${lastEdges[0].toFixed(3)}%/${lastEdges[1].toFixed(3)}%.`));
  }
}

function verifySvgWaterfallBridge(node, waterfall, svgWindow, errors) {
  const path = `/nodes/${node.id}/visualSpec/waterfall`;
  const segments = waterfall.segments;
  const entry = readSvgWaterfall(svgWindow);
  const svgReadable = entry.segments.filter(Boolean);
  if (svgReadable.length !== segments.length || svgReadable.some((drawn) => !drawn || drawn.x === null || drawn.y === null || drawn.width === null || drawn.height === null)) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall declares ${segments.length} segments but the delivered SVG exposes no fully readable floating bar geometry.`));
    return;
  }
  const totalsReadable = ['start', 'end'].every((role) => {
    const rect = entry.totals[role];
    return rect && rect.x !== null && rect.y !== null && rect.height !== null;
  });
  const connectorCount = entry.connectors.filter(Boolean).length;
  if (!totalsReadable || connectorCount !== segments.length + 1) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall bridge needs two anchored totals and ${segments.length + 1} junction connectors in the delivered SVG, got totals ${JSON.stringify(entry.totals)} and ${connectorCount} connectors.`));
    return;
  }
  if (!entry.axis || entry.axis.x1 === null || entry.axis.y1 === null || entry.axis.x2 === null || entry.axis.y2 === null) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall SVG exposes no readable value axis to anchor the delivered bridge against.`));
    return;
  }
  if (Math.abs(entry.axis.x1 - entry.axis.x2) > BRIDGE_CONTINUITY_PX) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall value axis is not vertical (x1=${entry.axis.x1}, x2=${entry.axis.x2}).`));
    return;
  }
  const baseline = entry.axis.y1;
  const plotTop = entry.axis.y2;
  const plotH = baseline - plotTop;
  if (!(plotH > 0)) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall value axis has a non-positive drawable span (baseline ${baseline}, top ${plotTop}).`));
    return;
  }
  if (entry.trackY !== null && Math.abs(entry.trackY - baseline) > BRIDGE_CONTINUITY_PX) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `${node.id} waterfall value axis baseline ${baseline} disagrees with the delivered plot track at y=${entry.trackY}; the bridge is anchored on two different zeroes.`));
  }
  const tolerancePx = SERIALIZATION_EPSILON_PX + (SVG_MAGNITUDE_TOLERANCE_PP * plotH) / 100 + FLOAT_EPSILON;
  const at = (value) => baseline - encodingFraction(value, waterfall.valueDomain) * plotH;

  segments.forEach((segment, index) => {
    const drawn = entry.segments[index];
    const top = Math.max(segment.cumulativeBefore, segment.cumulativeAfter);
    const low = Math.min(segment.cumulativeBefore, segment.cumulativeAfter);
    const expectedY = at(top);
    const expectedBottom = Math.max(at(low), expectedY + RENDERER_VISIBILITY_FLOOR_PX);
    if (Math.abs(drawn.y - expectedY) > tolerancePx || Math.abs(drawn.y + drawn.height - expectedBottom) > tolerancePx + (drawn.height > RENDERER_VISIBILITY_FLOOR_PX ? 0 : FLOAT_EPSILON)) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${index}`, `waterfall segment ${index} drawn at y=${drawn.y} height=${drawn.height} but the declared cumulative path [${low}, ${top}] requires y=${expectedY.toFixed(2)} bottom=${expectedBottom.toFixed(2)} on the delivered ${plotH.toFixed(2)}px value axis.`));
    }
  });
  for (const [role, value] of [['start', waterfall.startValue], ['end', waterfall.endValue]]) {
    const rect = entry.totals[role];
    const expectedY = at(value);
    if (Math.abs(rect.y - expectedY) > tolerancePx) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `waterfall SVG ${role} total drawn from y=${rect.y} but the declared value ${value} maps to y=${expectedY.toFixed(2)} on the delivered axis.`));
    }
    if (Math.abs(rect.y + rect.height - baseline) > tolerancePx) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `waterfall SVG ${role} total is not anchored on the delivered zero baseline (bottom y=${rect.y + rect.height}, baseline ${baseline}); totals must grow from the axis, unlike floating delta segments.`));
    }
  }
  segments.forEach((segment, index) => {
    const connector = entry.connectors[index];
    if (Math.abs(connector.y1 - connector.y2) > BRIDGE_CONTINUITY_PX) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${index}`, `waterfall connector ${index} is slanted (y1=${connector.y1}, y2=${connector.y2}); junction levels must be delivered horizontal.`));
    }
    const expected = at(segment.cumulativeBefore);
    if (Math.abs(connector.y1 - expected) > tolerancePx) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${path}/segments/${index}`, `waterfall connector ${index} drawn at y=${connector.y1} but the declared junction level ${segment.cumulativeBefore} maps to y=${expected.toFixed(2)} on the delivered axis.`));
    }
  });
  const closingConnector = entry.connectors[segments.length];
  if (Math.abs(closingConnector.y1 - at(waterfall.endValue)) > tolerancePx) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', path, `waterfall closing connector drawn at y=${closingConnector.y1} but the declared end value ${waterfall.endValue} maps to y=${at(waterfall.endValue).toFixed(2)} on the delivered axis.`));
  }

  // Delivered staircase continuity in pure geometry: each connector must
  // start at the previous stage bar's edge, end at the next bar's x slot, and
  // touch a horizontal edge of both bars it bridges.
  const stages = [entry.totals.start, ...segments.map((segment, index) => entry.segments[index]), entry.totals.end];
  for (let index = 1; index < stages.length; index += 1) {
    if (!(stages[index].x > stages[index - 1].x + 1)) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', `${index < stages.length - 1 ? `${path}/segments/${index - 1}` : path}`, `waterfall bridge stage ${index} is drawn at x=${stages[index].x}, out of the delivered left-to-right cumulative order (previous stage starts at x=${stages[index - 1].x}).`));
    }
  }
  for (let index = 0; index < segments.length + 1; index += 1) {
    const connector = entry.connectors[index];
    const previous = stages[index];
    const next = stages[index + 1];
    const connectorPath = index < segments.length ? `${path}/segments/${index}` : path;
    if (Math.abs(connector.x1 - (previous.x + previous.width)) > BRIDGE_CONTINUITY_PX) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', connectorPath, `waterfall connector ${index} starts at x=${connector.x1} instead of the right edge of the previous bridge stage (x=${previous.x + previous.width}).`));
    }
    if (Math.abs(connector.x2 - next.x) > BRIDGE_CONTINUITY_PX) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', connectorPath, `waterfall connector ${index} ends at x=${connector.x2} instead of the left edge of the next bridge stage (x=${next.x}).`));
    }
    if (!touchesEdge(connector.y1, previous.y, previous.y + previous.height, tolerancePx + SERIALIZATION_EPSILON_PX)) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', connectorPath, `waterfall connector ${index} drawn at y=${connector.y1} touches no edge of the previous bridge stage (y=${previous.y}..${previous.y + previous.height}); the staircase is broken at that junction.`));
    }
    if (!touchesEdge(connector.y1, next.y, next.y + next.height, tolerancePx + SERIALIZATION_EPSILON_PX)) {
      errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_MISMATCH', connectorPath, `waterfall connector ${index} drawn at y=${connector.y1} touches no edge of the next bridge stage (y=${next.y}..${next.y + next.height}); the staircase is broken at that junction.`));
    }
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
  const segments = Array.isArray(waterfall.segments) ? waterfall.segments : [];
  if (segments.length === 0) {
    errors.push(encodingError('DELIVERED_ENCODING_DECLARATION_INVALID', path, `${node.id} waterfall declares no segments to verify.`));
    return;
  }
  if (!Number.isFinite(waterfall.startValue) || !Number.isFinite(waterfall.endValue)) {
    errors.push(encodingError('DELIVERED_ENCODING_DECLARATION_INVALID', path, `${node.id} waterfall declares no finite start/end totals to verify.`));
    return;
  }
  if (htmlWindow === undefined) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall declares an additive path but the delivered HTML exposes no waterfall card to read.`));
  } else {
    verifyHtmlWaterfallBridge(node, waterfall, htmlWindow, errors);
  }
  if (svgWindow === undefined) {
    errors.push(encodingError('DELIVERED_ENCODING_GEOMETRY_UNREADABLE', path, `${node.id} waterfall declares an additive path but the delivered SVG exposes no waterfall card to read.`));
    return;
  }
  verifySvgWaterfallBridge(node, waterfall, svgWindow, errors);
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
