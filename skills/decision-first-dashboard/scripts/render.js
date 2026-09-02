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

function synthesisCopy(signals) {
  const direction = {
    improving: 'IMPROVING',
    deteriorating: 'DETERIORATING',
    mixed: 'MIXED',
    flat: 'FLAT',
    unknown: 'UNKNOWN'
  }[deriveOverallDirection(signals)];

  return { direction, target: 'Target unknown' };
}

function directionClass(direction) {
  if (direction === 'improving') return 'positive';
  if (direction === 'deteriorating') return 'danger';
  return 'muted';
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
    const deltaY = topRow ? y - 62 : y + 66;
    const labelY = topRow ? y - 37 : y + 91;
    const valueY = topRow ? y - 18 : y + 110;
    return `<g class="signal-node">
      <circle cx="${x}" cy="${y}" r="9" fill="#ffffff" stroke="#8d7fda" stroke-width="3"/>
      <text x="${x}" y="${deltaY}" class="accent" font-size="24" font-weight="740" text-anchor="middle">${escapeMarkup(signal.delta)}</text>
      <text x="${x}" y="${labelY}" class="ink" font-size="13" font-weight="650" text-anchor="middle">${escapeMarkup(signal.label)}</text>
      <text x="${x}" y="${valueY}" class="muted" font-size="11" text-anchor="middle">${escapeMarkup(signal.value)}</text>
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

  const nodes = placed.map(({ signal, x, y }) => `<div class="signal" style="left:${x}%;top:${y}%">
    <strong>${escapeMarkup(signal.delta)}</strong>
    <span>${escapeMarkup(signal.label)}</span>
    <small>${escapeMarkup(signal.value)}</small>
  </div>`).join('\n');

  return { paths, nodes };
}

function formatScore(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(1)));
}

function formatWeight(weight) {
  return `${Number((weight * 100).toFixed(1))}%`;
}

function svgComponentCluster(components) {
  const { top, bottom } = splitSignalRows(components);
  const placed = [];

  for (const [rowName, row, y] of [['top', top, 330], ['bottom', bottom, 590]]) {
    const xs = svgRowXs(row.length);
    row.forEach((component, index) => placed.push({ component, x: xs[index], y, rowName }));
  }

  const paths = placed.map(({ x, y }) => `M698 464 L${x} ${y}`).join(' ');
  const nodes = placed.map(({ component, x, y, rowName }) => {
    const topRow = rowName === 'top';
    const scoreY = topRow ? y - 62 : y + 66;
    const labelY = topRow ? y - 37 : y + 91;
    const detailY = topRow ? y - 18 : y + 110;
    const detail = `${formatWeight(component.weight)} · ${component.value}`;
    return `<g class="score-component-node">
      <circle cx="${x}" cy="${y}" r="9" fill="#ffffff" stroke="#8d7fda" stroke-width="3"/>
      <text x="${x}" y="${scoreY}" class="accent" font-size="24" font-weight="740" text-anchor="middle">${escapeMarkup(formatScore(component.normalizedScore))}</text>
      <text x="${x}" y="${labelY}" class="ink" font-size="13" font-weight="650" text-anchor="middle">${escapeMarkup(component.label)}</text>
      <text x="${x}" y="${detailY}" class="muted" font-size="11" text-anchor="middle">${escapeMarkup(detail)}</text>
    </g>`;
  }).join('\n');

  return { paths, nodes };
}

function htmlComponentCluster(components) {
  const { top, bottom } = splitSignalRows(components);
  const placed = [];

  for (const [row, y] of [[top, 28], [bottom, 72]]) {
    const xs = htmlRowXs(row.length);
    row.forEach((component, index) => placed.push({ component, x: xs[index], y }));
  }

  const paths = placed.map(({ x, y }) => {
    const px = (620 * x / 100).toFixed(1);
    const py = (520 * y / 100).toFixed(1);
    return `M310 260 L${px} ${py}`;
  }).join(' ');

  const nodes = placed.map(({ component, x, y }) => `<div class="signal score-component" style="left:${x}%;top:${y}%">
    <strong>${escapeMarkup(formatScore(component.normalizedScore))}</strong>
    <span>${escapeMarkup(component.label)}</span>
    <small>${escapeMarkup(`${formatWeight(component.weight)} · ${component.value}`)}</small>
  </div>`).join('\n');

  return { paths, nodes };
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

function movementSignals(signals) {
  const preferred = ['churn_rate', 'trial_conversion'];
  const selected = [];

  for (const metric of preferred) {
    const match = signals.find((signal) => signal.metric === metric);
    if (match && !selected.includes(match)) selected.push(match);
  }

  for (const signal of signals) {
    if (selected.length >= 2) break;
    if (signal.metric !== 'mrr' && !selected.includes(signal)) selected.push(signal);
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
      <circle cx="1072" cy="${y - 4}" r="5" fill="#c96e79"/>
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
      <circle cx="1072" cy="${y - 4}" r="4" fill="#8d7fda"/>
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
  const mrr = data.signals.find((signal) => signal.metric === 'mrr');
  const synthesis = synthesisCopy(data.signals);
  const revenueSeries = data.context?.provenance === 'source' ? data.context.revenueSeries : null;
  const movement = movementSignals(data.signals);
  return { mrr, synthesis, revenueSeries, movement };
}

function renderNoScoreSvg(data) {
  const template = fs.readFileSync(noScoreSvgTemplatePath, 'utf8');
  const { mrr, synthesis, revenueSeries, movement } = noScoreViewModel(data);
  const signalCluster = svgSignalCluster(data.signals);

  return fillTemplate(template, {
    MRR_VALUE: escapeMarkup(mrr?.value ?? '—'),
    MRR_DELTA: escapeMarkup(mrr?.delta ?? '—'),
    MRR_DIRECTION_CLASS: directionClass(mrr?.direction),
    REVENUE_VISUAL: svgRevenueVisual(revenueSeries),
    MOVEMENT_ROWS: svgMovementRows(movement),
    SYNTHESIS: synthesis.direction,
    SVG_ORBIT_PATHS: signalCluster.paths,
    SVG_SIGNAL_NODES: signalCluster.nodes,
    EXCEPTION_ROWS: svgExceptionRows(data.exceptions),
    EVENT_ROWS: svgEventRows(data.events)
  });
}

function renderNoScoreHtml(data) {
  const template = fs.readFileSync(noScoreHtmlTemplatePath, 'utf8');
  const css = fs.readFileSync(cssTemplatePath, 'utf8');
  const { mrr, synthesis, revenueSeries, movement } = noScoreViewModel(data);
  const signalCluster = htmlSignalCluster(data.signals);

  return fillTemplate(template, {
    CSS: css,
    MRR_VALUE: escapeMarkup(mrr?.value ?? '—'),
    MRR_DELTA: escapeMarkup(mrr?.delta ?? '—'),
    MRR_DIRECTION_CLASS: directionClass(mrr?.direction),
    HTML_REVENUE_VISUAL: htmlRevenueVisual(revenueSeries),
    HTML_MOVEMENT_ROWS: htmlMovementRows(movement),
    SYNTHESIS: synthesis.direction,
    HTML_ORBIT_PATHS: signalCluster.paths,
    HTML_SIGNAL_NODES: signalCluster.nodes,
    HTML_EXCEPTION_ROWS: htmlExceptionRows(data.exceptions),
    HTML_EVENT_ROWS: htmlEventRows(data.events)
  });
}

function renderCompositeSvg(data) {
  const template = fs.readFileSync(compositeSvgTemplatePath, 'utf8');
  const scoreSeries = data.context?.provenance === 'source' ? data.context.scoreSeries : null;
  const cluster = svgComponentCluster(data.model.components);

  return fillTemplate(template, {
    SCORE_LABEL: escapeMarkup(data.score.label),
    SCORE_VALUE: escapeMarkup(formatScore(data.score.value)),
    SCORE_MAX: escapeMarkup(formatScore(data.score.max)),
    SCORE_BAND: escapeMarkup(data.score.band),
    SVG_SCORE_TREND: svgScoreVisual(scoreSeries),
    SVG_COMPOSITION_ROWS: svgCompositionRows(data.model.components),
    SVG_COMPONENT_PATHS: cluster.paths,
    SVG_COMPONENT_NODES: cluster.nodes,
    EXCEPTION_ROWS: svgExceptionRows(data.exceptions),
    EVENT_ROWS: svgEventRows(data.events)
  });
}

function renderCompositeHtml(data) {
  const template = fs.readFileSync(compositeHtmlTemplatePath, 'utf8');
  const css = fs.readFileSync(cssTemplatePath, 'utf8');
  const scoreSeries = data.context?.provenance === 'source' ? data.context.scoreSeries : null;
  const cluster = htmlComponentCluster(data.model.components);

  return fillTemplate(template, {
    CSS: css,
    SCORE_LABEL: escapeMarkup(data.score.label),
    SCORE_VALUE: escapeMarkup(formatScore(data.score.value)),
    SCORE_MAX: escapeMarkup(formatScore(data.score.max)),
    SCORE_BAND: escapeMarkup(data.score.band),
    HTML_SCORE_TREND: htmlScoreVisual(scoreSeries),
    HTML_COMPOSITION_ROWS: htmlCompositionRows(data.model.components),
    HTML_COMPONENT_PATHS: cluster.paths,
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
