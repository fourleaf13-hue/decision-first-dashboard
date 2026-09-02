import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDecisionState } from './validate.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const svgTemplatePath = path.resolve(currentDir, '../templates/no-score.svg');
const htmlTemplatePath = path.resolve(currentDir, '../templates/no-score.html');
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

function signalByMetric(data, metric, fallbackIndex) {
  return data.signals.find((signal) => signal.metric === metric) ?? data.signals[fallbackIndex];
}

function synthesisCopy(synthesis) {
  const direction = {
    improving: 'IMPROVING',
    deteriorating: 'DETERIORATING',
    mixed: 'MIXED',
    unknown: 'UNKNOWN'
  }[synthesis.direction];

  const target = synthesis.targetState === 'known' ? 'Target known' : 'Target unknown';
  return { direction, target };
}

function pathForSeries(series, { left, right, top, bottom }) {
  if (!series || series.length < 2) {
    const mid = ((top + bottom) / 2).toFixed(1);
    return `M${left} ${mid} L${right} ${mid}`;
  }

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

function viewModel(data) {
  const mrr = signalByMetric(data, 'mrr', 0);
  const customers = signalByMetric(data, 'active_customers', 1);
  const churn = signalByMetric(data, 'churn_rate', 2);
  const trial = signalByMetric(data, 'trial_conversion', 3);
  const synthesis = synthesisCopy(data.synthesis);
  const revenueSeries = data.context?.revenueSeries ?? [];

  return { mrr, customers, churn, trial, synthesis, revenueSeries };
}

export function renderSvg(data) {
  assertValid(data);
  const template = fs.readFileSync(svgTemplatePath, 'utf8');
  const { mrr, customers, churn, trial, synthesis, revenueSeries } = viewModel(data);

  return fillTemplate(template, {
    MRR_VALUE: escapeMarkup(mrr?.value ?? '—'),
    MRR_DELTA: escapeMarkup(mrr?.delta ?? '—'),
    CHURN_VALUE: escapeMarkup(churn?.value ?? '—'),
    CHURN_DELTA: escapeMarkup(churn?.delta ?? '—'),
    TRIAL_DELTA: escapeMarkup(trial?.delta ?? '—'),
    REVENUE_PATH: pathForSeries(revenueSeries, { left: 98, right: 332, top: 286, bottom: 360 }),
    SYNTHESIS: synthesis.direction,
    TARGET_COPY: synthesis.target,
    S1_DELTA: escapeMarkup(mrr?.delta ?? '—'),
    S1_LABEL: escapeMarkup(mrr?.label ?? 'Signal 1'),
    S1_VALUE: escapeMarkup(mrr?.value ?? '—'),
    S2_DELTA: escapeMarkup(customers?.delta ?? '—'),
    S2_LABEL: escapeMarkup(customers?.label ?? 'Signal 2'),
    S2_VALUE: escapeMarkup(customers?.value ?? '—'),
    S3_DELTA: escapeMarkup(churn?.delta ?? '—'),
    S3_LABEL: escapeMarkup(churn?.label ?? 'Signal 3'),
    S3_VALUE: escapeMarkup(churn?.value ?? '—'),
    S4_DELTA: escapeMarkup(trial?.delta ?? '—'),
    S4_LABEL: escapeMarkup(trial?.label ?? 'Signal 4'),
    S4_VALUE: escapeMarkup(trial?.value ?? '—'),
    EXCEPTION_ROWS: svgExceptionRows(data.exceptions),
    EVENT_ROWS: svgEventRows(data.events)
  });
}

export function renderHtml(data) {
  assertValid(data);
  const template = fs.readFileSync(htmlTemplatePath, 'utf8');
  const css = fs.readFileSync(cssTemplatePath, 'utf8');
  const { mrr, customers, churn, trial, synthesis, revenueSeries } = viewModel(data);

  return fillTemplate(template, {
    CSS: css,
    MRR_VALUE: escapeMarkup(mrr?.value ?? '—'),
    MRR_DELTA: escapeMarkup(mrr?.delta ?? '—'),
    CHURN_VALUE: escapeMarkup(churn?.value ?? '—'),
    CHURN_DELTA: escapeMarkup(churn?.delta ?? '—'),
    TRIAL_VALUE: escapeMarkup(trial?.value ?? '—'),
    TRIAL_DELTA: escapeMarkup(trial?.delta ?? '—'),
    HTML_REVENUE_PATH: pathForSeries(revenueSeries, { left: 0, right: 234, top: 6, bottom: 80 }),
    SYNTHESIS: synthesis.direction,
    TARGET_COPY: synthesis.target,
    S1_DELTA: escapeMarkup(mrr?.delta ?? '—'),
    S1_LABEL: escapeMarkup(mrr?.label ?? 'Signal 1'),
    S1_VALUE: escapeMarkup(mrr?.value ?? '—'),
    S2_DELTA: escapeMarkup(customers?.delta ?? '—'),
    S2_LABEL: escapeMarkup(customers?.label ?? 'Signal 2'),
    S2_VALUE: escapeMarkup(customers?.value ?? '—'),
    S3_DELTA: escapeMarkup(churn?.delta ?? '—'),
    S3_LABEL: escapeMarkup(churn?.label ?? 'Signal 3'),
    S3_VALUE: escapeMarkup(churn?.value ?? '—'),
    S4_DELTA: escapeMarkup(trial?.delta ?? '—'),
    S4_LABEL: escapeMarkup(trial?.label ?? 'Signal 4'),
    S4_VALUE: escapeMarkup(trial?.value ?? '—'),
    HTML_EXCEPTION_ROWS: htmlExceptionRows(data.exceptions),
    HTML_EVENT_ROWS: htmlEventRows(data.events)
  });
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

  const svgOutput = path.join(outputDir, 'output.no-score.svg');
  const htmlOutput = path.join(outputDir, 'output.no-score.html');
  fs.writeFileSync(svgOutput, svg);
  fs.writeFileSync(htmlOutput, html);
  console.log(svgOutput);
  console.log(htmlOutput);
}
