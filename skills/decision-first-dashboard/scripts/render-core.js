import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDecisionState } from './validate.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const noScoreSvgTemplatePath = path.resolve(currentDir, '../templates/no-score.svg');
const noScoreHtmlTemplatePath = path.resolve(currentDir, '../templates/no-score.html');
const compositeSvgTemplatePath = path.resolve(currentDir, '../templates/composite.svg');
const compositeHtmlTemplatePath = path.resolve(currentDir, '../templates/composite.html');
const cssTemplatePath = path.resolve(currentDir, '../templates/dashboard.css');

function assertValid(data) {
  const result = validateDecisionState(data);
  if (!result.valid) {
    const error = new Error('Decision state failed schema validation');
    error.validationErrors = result.errors;
    throw error;
  }
}

function escapeMarkup(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function deriveOverallDirection(signals = []) {
  const known = new Set(
    signals
      .map((signal) => signal.direction)
      .filter((direction) => direction && direction !== 'unknown')
  );

  if (known.size === 0) return 'unknown';
  if (known.has('improving') && known.has('deteriorating')) return 'mixed';
  if (known.has('improving')) return 'improving';
  if (known.has('deteriorating')) return 'deteriorating';
  if (known.has('flat')) return 'flat';
  return 'unknown';
}

function directionClass(direction) {
  if (direction === 'improving') return 'positive';
  if (direction === 'deteriorating') return 'danger';
  return 'muted';
}

function deltaWithArrow(delta) {
  if (!delta) return null;
  const text = String(delta).trim();
  if (text.startsWith('+')) return `↑ ${text.slice(1)}`;
  if (text.startsWith('-')) return `↓ ${text.slice(1)}`;
  if (/^0(?:\D|$)/.test(text)) return `→ ${text.replace(/^[-+]/, '')}`;
  return text;
}

function signalDisplay(signal) {
  const hasMovement = Boolean(signal.delta);
  return {
    primary: hasMovement ? signal.delta : signal.value,
    detail: hasMovement ? signal.value : null,
    hasMovement
  };
}

function selectRevenueSignal(signals) {
  return signals.find((signal) => signal.metric === 'mrr')
    ?? signals.find((signal) => signal.metric === 'arr')
    ?? null;
}

function revenueTitle(signal) {
  return signal ? `${signal.label} context` : 'Revenue context';
}

function currentRevenueLabel(signal) {
  return signal ? `Current ${signal.label}` : 'Revenue metric unavailable';
}

function svgRevenueDeltaBlock(signal) {
  if (!signal?.delta) return '';
  return `<text x="98" y="252" class="${directionClass(signal.direction)}" font-size="14" font-weight="650">${escapeMarkup(signal.delta)}</text>`;
}

function htmlRevenueDeltaBlock(signal) {
  if (!signal?.delta) return '';
  return `<div class="metric-delta ${directionClass(signal.direction)}">${escapeMarkup(signal.delta)}</div>`;
}

function pathForSeries(series, { left, right, top, bottom }) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = Math.max(max - min, 1);

  return series
    .map((value, index) => {
      const x = left + ((right - left) * index) / (series.length - 1);
      const y = bottom - ((value - min) / span) * (bottom - top);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function svgRevenueVisual(series) {
  if (!series?.length) {
    return '<text x="98" y="330" class="muted" font-size="12">Trend data unavailable</text>';
  }
  const path = pathForSeries(series, { left: 98, right: 332, top: 286, bottom: 360 });
  return `<path d="${path}" fill="none" stroke="url(#accentLine)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function htmlRevenueVisual(series) {
  if (!series?.length) {
    return '<div class="trend-unavailable">Trend data unavailable</div>';
  }
  const path = pathForSeries(series, { left: 0, right: 234, top: 6, bottom: 80 });
  return `<svg class="sparkline" viewBox="0 0 234 86" aria-label="Revenue trend"><path d="${path}"></path></svg>`;
}

function svgScoreVisual(series) {
  if (!series?.length) {
    return '<text x="98" y="330" class="muted" font-size="12">Trend data unavailable</text>';
  }
  const path = pathForSeries(series, { left: 98, right: 332, top: 286, bottom: 360 });
  return `<path d="${path}" fill="none" stroke="url(#accentLine)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function htmlScoreVisual(series) {
  if (!series?.length) {
    return '<div class="trend-unavailable">Trend data unavailable</div>';
  }
  const path = pathForSeries(series, { left: 0, right: 234, top: 6, bottom: 80 });
  return `<svg class="sparkline" viewBox="0 0 234 86" aria-label="Score trend"><path d="${path}"></path></svg>`;
}

function splitSignalRows(signals) {
  const topCount = Math.ceil(signals.length / 2);
  return {
    top: signals.slice(0, topCount),
    bottom: signals.slice(topCount)
  };
}

function svgRowXs(count) {
  return {
    1: [698],
    2: [548, 848],
    3: [478, 698, 918]
  }[count] ?? [];
}

function htmlRowXs(count) {
  return {
    1: [50],
    2: [26, 74],
    3: [15, 50, 85]
  }[count] ?? [];
}

const SVG_RADAR_LAYOUT = { cx: 698, cy: 464, radarRadius: 188, labelRadius: 238, labelSafeLeft: 500, labelSafeRight: 900 };
const HTML_RADAR_LAYOUT = { cx: 310, cy: 260, radarRadius: 188, labelRadius: 238, labelSafeLeft: 120, labelSafeRight: 500 };
const RADAR_SCALE_STEPS = [40, 60, 80, 100];

function radialPoint(cx, cy, radius, angle) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius
  };
}

function pointPath(points, close = false) {
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
  return close ? `${path} Z` : path;
}

function radarSide(angle) {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  if (Math.abs(x) < 0.15) return y < 0 ? 'top' : 'bottom';
  return x < 0 ? 'left' : 'right';
}

function safeRadarLabelPoint(point, angle, layout) {
  const side = radarSide(angle);
  if (side === 'left') return { ...point, x: Math.max(point.x, layout.labelSafeLeft) };
  if (side === 'right') return { ...point, x: Math.min(point.x, layout.labelSafeRight) };
  return point;
}

function radarGeometry(dimensions, min, max, layout, valueKey = 'normalizedScore') {
  const span = max - min;
  const count = dimensions.length;
  const axes = [];
  const shape = [];
  const labels = [];
  const angles = [];

  dimensions.forEach((dimension, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    const value = dimension[valueKey];
    const ratio = Math.min(1, Math.max(0, (value - min) / span));
    axes.push(radialPoint(layout.cx, layout.cy, layout.radarRadius, angle));
    shape.push(radialPoint(layout.cx, layout.cy, layout.radarRadius * ratio, angle));
    labels.push(safeRadarLabelPoint(radialPoint(layout.cx, layout.cy, layout.labelRadius, angle), angle, layout));
    angles.push(angle);
  });

  return {
    shape: pointPath(shape, true),
    spokes: axes.map((point) => `M${layout.cx} ${layout.cy} L${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' '),
    labels,
    angles
  };
}

function radarScaleRings(layout) {
  return [...RADAR_SCALE_STEPS].reverse().map((scale) => {
    const radius = Number((layout.radarRadius * scale / 100).toFixed(1));
    return `<circle class="radar-scale-ring" data-scale="${scale}" r="${radius}" cx="${layout.cx}" cy="${layout.cy}"/>`;
  }).join('\n');
}

function hasCompletePreviousProfile(dimensions) {
  return dimensions.length > 0 && dimensions.every((dimension) => Number.isFinite(dimension.previousNormalizedScore));
}

function radarAnchor(side) {
  if (side === 'left') return 'end';
  if (side === 'right') return 'start';
  return 'middle';
}

function svgRadarVisual(dimensions, min, max) {
  const current = radarGeometry(dimensions, min, max, SVG_RADAR_LAYOUT);
  const previous = hasCompletePreviousProfile(dimensions)
    ? radarGeometry(dimensions, min, max, SVG_RADAR_LAYOUT, 'previousNormalizedScore')
    : null;
  const previousPath = previous
    ? `<path class="radar-shape radar-shape--previous" d="${previous.shape}"/>`
    : '';

  return `${radarScaleRings(SVG_RADAR_LAYOUT)}
    <path class="radar-spokes" d="${current.spokes}"/>
    ${previousPath}
    <path class="radar-shape radar-shape--current" d="${current.shape}"/>`;
}

function htmlRadarVisual(dimensions, min, max) {
  const current = radarGeometry(dimensions, min, max, HTML_RADAR_LAYOUT);
  const previous = hasCompletePreviousProfile(dimensions)
    ? radarGeometry(dimensions, min, max, HTML_RADAR_LAYOUT, 'previousNormalizedScore')
    : null;
  const previousPath = previous
    ? `<path class="radar-shape radar-shape--previous" d="${previous.shape}"></path>`
    : '';

  return `${radarScaleRings(HTML_RADAR_LAYOUT)}
            <path class="radar-spokes" d="${current.spokes}"></path>
            ${previousPath}
            <path class="radar-shape radar-shape--current" d="${current.shape}"></path>`;
}

function svgRadarNodes(dimensions, min, max, nodeClass) {
  const geometry = radarGeometry(dimensions, min, max, SVG_RADAR_LAYOUT);
  return dimensions.map((dimension, index) => {
    const point = geometry.labels[index];
    const side = radarSide(geometry.angles[index]);
    const anchor = radarAnchor(side);
    const startY = side === 'top' ? point.y - 21 : side === 'bottom' ? point.y - 3 : point.y - 20;
    const delta = deltaWithArrow(dimension.delta);
    const deltaNode = delta
      ? `<tspan x="${point.x.toFixed(1)}" dy="18" text-anchor="${anchor}" class="${directionClass(dimension.direction)}" font-size="11" font-weight="700">${escapeMarkup(delta)}</tspan>`
      : '';
    return `<g class="${nodeClass}">
      <text class="radar-label radar-label--${side}" data-outside-ring="true" text-anchor="${anchor}" x="${point.x.toFixed(1)}" y="${startY.toFixed(1)}">
        <tspan x="${point.x.toFixed(1)}" text-anchor="${anchor}" class="muted" font-size="11" font-weight="650">${escapeMarkup(dimension.label)}</tspan>
        <tspan x="${point.x.toFixed(1)}" dy="20" text-anchor="${anchor}" class="ink" font-size="16" font-weight="760">${escapeMarkup(dimension.value)}</tspan>
        ${deltaNode}
      </text>
    </g>`;
  }).join('\n');
}

function htmlRadarNodes(dimensions, min, max, className) {
  const geometry = radarGeometry(dimensions, min, max, HTML_RADAR_LAYOUT);
  return dimensions.map((dimension, index) => {
    const point = geometry.labels[index];
    const side = radarSide(geometry.angles[index]);
    const delta = deltaWithArrow(dimension.delta);
    const deltaNode = delta
      ? `<small class="${directionClass(dimension.direction)}">${escapeMarkup(delta)}</small>`
      : '';
    return `<div class="${className} radar-label radar-label--${side}" data-outside-ring="true" style="left:${(point.x / 620 * 100).toFixed(2)}%;top:${(point.y / 520 * 100).toFixed(2)}%">
    <span>${escapeMarkup(dimension.label)}</span>
    <strong>${escapeMarkup(dimension.value)}</strong>
    ${deltaNode}
  </div>`;
  }).join('\n');
}

function svgSignalCluster(signals) {
  const { top, bottom } = splitSignalRows(signals);
  const placed = [];

  for (const [rowName, row, y] of [['top', top, 330], ['bottom', bottom, 590]]) {
    const xs = svgRowXs(row.length);
    row.forEach((signal, index) => placed.push({ signal, x: xs[index], y, rowName }));
  }

  const paths = placed
    .map(({ x, y }) => `M698 464 L${x} ${y}`)
    .join(' ');

  const nodes = placed.map(({ signal, x, y, rowName }) => {
    const topRow = rowName === 'top';
    const primaryY = topRow ? y - 62 : y + 66;
    const labelY = topRow ? y - 37 : y + 91;
    const detailY = topRow ? y - 18 : y + 110;
    const display = signalDisplay(signal);
    const cardY = topRow ? y - 104 : y + 34;
    const cardHeight = display.detail ? 92 : 74;
    const detailNode = display.detail
      ? `<text x="${x}" y="${detailY}" class="muted" font-size="10" text-anchor="middle">${escapeMarkup(display.detail)}</text>`
      : '';
    return `<g class="signal-node">
      <rect x="${x - 72}" y="${cardY}" width="144" height="${cardHeight}" rx="19" class="metric-orb"/>
      <circle cx="${x}" cy="${y}" r="8" fill="#ffffff" stroke="#6555e8" stroke-width="3"/>
      <text x="${x}" y="${primaryY}" class="accent" font-size="23" font-weight="760" text-anchor="middle">${escapeMarkup(display.primary)}</text>
      <text x="${x}" y="${labelY}" class="ink" font-size="12" font-weight="670" text-anchor="middle">${escapeMarkup(signal.label)}</text>
      ${detailNode}
    </g>`;
  }).join('\n');

  return { paths, nodes };
}

function htmlSignalCluster(signals) {
  const { top, bottom } = splitSignalRows(signals);
  const placed = [];

  for (const [row, y] of [[top, 28], [bottom, 72]]) {
    const xs = htmlRowXs(row.length);
    row.forEach((signal, index) => placed.push({ signal, x: xs[index], y }));
  }

  const paths = placed.map(({ x, y }) => {
    const px = (620 * x / 100).toFixed(1);
    const py = (520 * y / 100).toFixed(1);
    return `M310 260 L${px} ${py}`;
  }).join(' ');

  const nodes = placed.map(({ signal, x, y }) => {
    const display = signalDisplay(signal);
    const detailNode = display.detail ? `<small>${escapeMarkup(display.detail)}</small>` : '';
    return `<div class="signal metric-orb" style="left:${x}%;top:${y}%">
    <strong>${escapeMarkup(display.primary)}</strong>
    <span>${escapeMarkup(signal.label)}</span>
    ${detailNode}
  </div>`;
  }).join('\n');

  return { paths, nodes };
}

function formatScore(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(1)));
}

function formatWeight(weight) {
  return `${Number((weight * 100).toFixed(1))}%`;
}

function svgComponentCluster(components, min, max) {
  return {
    visual: svgRadarVisual(components, min, max),
    nodes: svgRadarNodes(components, min, max, 'score-component-node')
  };
}

function htmlComponentCluster(components, min, max) {
  return {
    visual: htmlRadarVisual(components, min, max),
    nodes: htmlRadarNodes(components, min, max, 'score-component')
  };
}

function svgCompositionRows(components) {
  return components.map((component, index) => {
    const y = 552 + index * 34;
    const detail = `${formatScore(component.normalizedScore)} · ${formatWeight(component.weight)}`;
    return `<g>
      <text x="98" y="${y}" class="ink" font-size="12" font-weight="650">${escapeMarkup(component.label)}</text>
      <text x="332" y="${y}" class="muted" font-size="11" text-anchor="end">${escapeMarkup(detail)}</text>
    </g>`;
  }).join('\n');
}

function htmlCompositionRows(components) {
  return components.map((component) => `<div class="composition-row">
    <span>${escapeMarkup(component.label)}</span>
    <small>${escapeMarkup(`${formatScore(component.normalizedScore)} · ${formatWeight(component.weight)}`)}</small>
  </div>`).join('\n');
}

function movementSignals(signals, revenueMetric = null) {
  const eligible = signals.filter((signal) => signal.delta);
  const preferred = ['churn_rate', 'trial_conversion'];
  const selected = [];

  for (const metric of preferred) {
    const match = eligible.find((signal) => signal.metric === metric);
    if (match && !selected.includes(match)) selected.push(match);
  }

  for (const signal of eligible) {
    if (selected.length >= 2) break;
    if (signal.metric !== revenueMetric && !selected.includes(signal)) selected.push(signal);
  }

  return selected.slice(0, 2);
}

function svgMovementRows(signals) {
  if (signals.length === 0) {
    return '<text x="98" y="566" class="muted" font-size="12">No additional movement signals</text>';
  }

  return signals.map((signal, index) => {
    const labelY = 552 + index * 72;
    const valueY = labelY + 27;
    const divider = index === 0 && signals.length > 1
      ? '<line x1="98" y1="600" x2="332" y2="600" stroke="#efedf6"/>'
      : '';
    return `<g>
      <text x="98" y="${labelY}" class="muted" font-size="12">${escapeMarkup(signal.label)}</text>
      <text x="98" y="${valueY}" class="ink" font-size="21" font-weight="700">${escapeMarkup(signal.value)}</text>
      <text x="332" y="${valueY}" class="${directionClass(signal.direction)}" font-size="13" font-weight="650" text-anchor="end">${escapeMarkup(signal.delta)}</text>
      ${divider}
    </g>`;
  }).join('\n');
}

function htmlMovementRows(signals) {
  if (signals.length === 0) {
    return '<div class="empty-state">No additional movement signals</div>';
  }

  return signals.map((signal) => `<div class="context-metric">
    <span>${escapeMarkup(signal.label)}</span>
    <strong>${escapeMarkup(signal.value)}</strong>
    <em class="${directionClass(signal.direction)}">${escapeMarkup(signal.delta)}</em>
  </div>`).join('\n');
}

function svgExceptionRows(exceptions = []) {
  if (exceptions.length === 0) {
    return '<text x="1064" y="232" class="muted" font-size="13">No confirmed exceptions visible</text>';
  }

  return exceptions.slice(0, 3).map((item, index) => {
    const y = 232 + index * 70;
    const meta = [item.plan, item.mrr ? `${item.mrr} MRR` : null].filter(Boolean).join(' · ');
    return `<g>
      <circle cx="1072" cy="${y - 4}" r="5" fill="#e25462"/>
      <text x="1088" y="${y}" class="ink" font-size="14" font-weight="650">${escapeMarkup(item.name)}</text>
      <text x="1088" y="${y + 22}" class="muted" font-size="12">${escapeMarkup(meta)}</text>
      <rect x="1268" y="${y - 19}" width="74" height="26" rx="13" fill="#fff1f3"/>
      <text x="1305" y="${y - 1}" class="danger" font-size="11" font-weight="650" text-anchor="middle">${escapeMarkup(item.status)}</text>
    </g>`;
  }).join('\n');
}

function svgEventRows(events = []) {
  if (events.length === 0) {
    return '<text x="1064" y="534" class="muted" font-size="13">No recent source-supported events</text>';
  }

  return events.slice(0, 4).map((item, index) => {
    const y = 534 + index * 68;
    return `<g>
      <circle cx="1072" cy="${y - 4}" r="4" fill="#6555e8"/>
      <text x="1088" y="${y}" class="ink" font-size="13" font-weight="650">${escapeMarkup(item.subject)}</text>
      <text x="1088" y="${y + 21}" class="muted" font-size="12">${escapeMarkup(item.event)}</text>
      <text x="1342" y="${y + 21}" class="soft" font-size="11" text-anchor="end">${escapeMarkup(item.time)}</text>
    </g>`;
  }).join('\n');
}

function htmlExceptionRows(exceptions = []) {
  if (exceptions.length === 0) {
    return '<div class="empty-state">No confirmed exceptions visible</div>';
  }

  return exceptions.slice(0, 3).map((item) => {
    const meta = [item.plan, item.mrr ? `${item.mrr} MRR` : null].filter(Boolean).join(' · ');
    return `<div class="exception-row">
      <span class="dot dot--risk" aria-hidden="true"></span>
      <div class="row-copy"><strong>${escapeMarkup(item.name)}</strong><span>${escapeMarkup(meta)}</span></div>
      <span class="badge">${escapeMarkup(item.status)}</span>
    </div>`;
  }).join('\n');
}

function htmlEventRows(events = []) {
  if (events.length === 0) {
    return '<div class="empty-state">No recent source-supported events</div>';
  }

  return events.slice(0, 4).map((item) => `<div class="event-row">
    <span class="dot" aria-hidden="true"></span>
    <div class="row-copy"><strong>${escapeMarkup(item.subject)}</strong><span>${escapeMarkup(item.event)}</span></div>
    <span class="event-time">${escapeMarkup(item.time)}</span>
  </div>`).join('\n');
}

function fillTemplate(template, replacements) {
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

function noScoreViewModel(data) {
  const revenue = selectRevenueSignal(data.signals);
  const revenueSeries = data.context?.provenance === 'source' ? data.context.revenueSeries : null;
  const movement = movementSignals(data.signals, revenue?.metric ?? null);
  return { revenue, revenueSeries, movement };
}

function renderNoScoreSvg(data) {
  const template = fs.readFileSync(noScoreSvgTemplatePath, 'utf8');
  const { revenue, revenueSeries, movement } = noScoreViewModel(data);
  const radar = data.radarScale
    ? {
        visual: svgRadarVisual(data.signals, data.radarScale.min, data.radarScale.max),
        nodes: svgRadarNodes(data.signals, data.radarScale.min, data.radarScale.max, 'radar-dimension-node')
      }
    : null;
  const signalCluster = radar ?? svgSignalCluster(data.signals);
  const orbitVisual = radar
    ? radar.visual
    : `<path class="orbit-spokes" d="${signalCluster.paths}" fill="none" stroke="#d6d0ef" stroke-width="1.6"/>`;

  return fillTemplate(template, {
    REVENUE_TITLE: escapeMarkup(revenueTitle(revenue)),
    REVENUE_VALUE: escapeMarkup(revenue?.value ?? '—'),
    REVENUE_DELTA_BLOCK: svgRevenueDeltaBlock(revenue),
    CURRENT_REVENUE_LABEL: escapeMarkup(currentRevenueLabel(revenue)),
    REVENUE_VISUAL: svgRevenueVisual(revenueSeries),
    MOVEMENT_ROWS: svgMovementRows(movement),
    SVG_ORBIT_VISUAL: orbitVisual,
    SVG_SIGNAL_NODES: signalCluster.nodes,
    EXCEPTION_ROWS: svgExceptionRows(data.exceptions),
    EVENT_ROWS: svgEventRows(data.events)
  });
}

function renderNoScoreHtml(data) {
  const template = fs.readFileSync(noScoreHtmlTemplatePath, 'utf8');
  const css = fs.readFileSync(cssTemplatePath, 'utf8');
  const { revenue, revenueSeries, movement } = noScoreViewModel(data);
  const radar = data.radarScale
    ? {
        visual: htmlRadarVisual(data.signals, data.radarScale.min, data.radarScale.max),
        nodes: htmlRadarNodes(data.signals, data.radarScale.min, data.radarScale.max, 'radar-dimension')
      }
    : null;
  const signalCluster = radar ?? htmlSignalCluster(data.signals);
  const orbitVisual = radar
    ? radar.visual
    : `<path class="orbit-spokes" d="${signalCluster.paths}"></path>`;

  return fillTemplate(template, {
    CSS: css,
    REVENUE_TITLE: escapeMarkup(revenueTitle(revenue)),
    REVENUE_VALUE: escapeMarkup(revenue?.value ?? '—'),
    HTML_REVENUE_DELTA_BLOCK: htmlRevenueDeltaBlock(revenue),
    CURRENT_REVENUE_LABEL: escapeMarkup(currentRevenueLabel(revenue)),
    HTML_REVENUE_VISUAL: htmlRevenueVisual(revenueSeries),
    HTML_MOVEMENT_ROWS: htmlMovementRows(movement),
    HTML_ORBIT_VISUAL: orbitVisual,
    HTML_SIGNAL_NODES: signalCluster.nodes,
    HTML_EXCEPTION_ROWS: htmlExceptionRows(data.exceptions),
    HTML_EVENT_ROWS: htmlEventRows(data.events)
  });
}

function renderCompositeSvg(data) {
  const template = fs.readFileSync(compositeSvgTemplatePath, 'utf8');
  const scoreSeries = data.context?.provenance === 'source' ? data.context.scoreSeries : null;
  const cluster = svgComponentCluster(data.model.components, data.score.min, data.score.max);

  return fillTemplate(template, {
    SCORE_LABEL: escapeMarkup(data.score.label),
    SCORE_VALUE: escapeMarkup(formatScore(data.score.value)),
    SCORE_MAX: escapeMarkup(formatScore(data.score.max)),
    SCORE_BAND: escapeMarkup(data.score.band),
    SVG_SCORE_TREND: svgScoreVisual(scoreSeries),
    SVG_COMPOSITION_ROWS: svgCompositionRows(data.model.components),
    SVG_COMPONENT_RADAR: cluster.visual,
    SVG_COMPONENT_NODES: cluster.nodes,
    EXCEPTION_ROWS: svgExceptionRows(data.exceptions),
    EVENT_ROWS: svgEventRows(data.events)
  });
}

function renderCompositeHtml(data) {
  const template = fs.readFileSync(compositeHtmlTemplatePath, 'utf8');
  const css = fs.readFileSync(cssTemplatePath, 'utf8');
  const scoreSeries = data.context?.provenance === 'source' ? data.context.scoreSeries : null;
  const cluster = htmlComponentCluster(data.model.components, data.score.min, data.score.max);

  return fillTemplate(template, {
    CSS: css,
    SCORE_LABEL: escapeMarkup(data.score.label),
    SCORE_VALUE: escapeMarkup(formatScore(data.score.value)),
    SCORE_MAX: escapeMarkup(formatScore(data.score.max)),
    SCORE_BAND: escapeMarkup(data.score.band),
    HTML_SCORE_TREND: htmlScoreVisual(scoreSeries),
    HTML_COMPOSITION_ROWS: htmlCompositionRows(data.model.components),
    HTML_COMPONENT_RADAR: cluster.visual,
    HTML_COMPONENT_NODES: cluster.nodes,
    HTML_EXCEPTION_ROWS: htmlExceptionRows(data.exceptions),
    HTML_EVENT_ROWS: htmlEventRows(data.events)
  });
}

export function renderSvg(data) {
  assertValid(data);
  return data.mode === 'composite' ? renderCompositeSvg(data) : renderNoScoreSvg(data);
}

export function renderHtml(data) {
  assertValid(data);
  return data.mode === 'composite' ? renderCompositeHtml(data) : renderNoScoreHtml(data);
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