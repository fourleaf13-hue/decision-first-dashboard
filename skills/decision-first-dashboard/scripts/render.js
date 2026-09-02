import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDecisionState } from './validate.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const svgTemplatePath = path.resolve(currentDir, '../templates/no-score.svg');

function assertValid(data) {
  const result = validateDecisionState(data);
  if (!result.valid) {
    const error = new Error('Decision state failed schema validation');
    error.validationErrors = result.errors;
    throw error;
  }
}

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
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

function sparklinePath(series) {
  if (!series || series.length < 2) return 'M98 342 L332 342';

  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = Math.max(max - min, 1);
  const left = 98;
  const right = 332;
  const top = 286;
  const bottom = 360;

  return series
    .map((value, index) => {
      const x = left + ((right - left) * index) / (series.length - 1);
      const y = bottom - ((value - min) / span) * (bottom - top);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function exceptionRows(exceptions = []) {
  if (exceptions.length === 0) {
    return '<text x="1064" y="232" class="muted" font-size="13">No confirmed exceptions visible</text>';
  }

  return exceptions.slice(0, 3).map((item, index) => {
    const y = 232 + index * 70;
    const meta = [item.plan, item.mrr ? `${item.mrr} MRR` : null].filter(Boolean).join(' · ');
    return `<g>
      <circle cx="1072" cy="${y - 4}" r="5" fill="#c96e79"/>
      <text x="1088" y="${y}" class="ink" font-size="14" font-weight="650">${escapeXml(item.name)}</text>
      <text x="1088" y="${y + 22}" class="muted" font-size="12">${escapeXml(meta)}</text>
      <rect x="1268" y="${y - 19}" width="74" height="26" rx="13" fill="#fff1f3"/>
      <text x="1305" y="${y - 1}" class="danger" font-size="11" font-weight="650" text-anchor="middle">${escapeXml(item.status)}</text>
    </g>`;
  }).join('\n');
}

function eventRows(events = []) {
  if (events.length === 0) {
    return '<text x="1064" y="534" class="muted" font-size="13">No recent source-supported events</text>';
  }

  return events.slice(0, 4).map((item, index) => {
    const y = 534 + index * 68;
    return `<g>
      <circle cx="1072" cy="${y - 4}" r="4" fill="#8d7fda"/>
      <text x="1088" y="${y}" class="ink" font-size="13" font-weight="650">${escapeXml(item.subject)}</text>
      <text x="1088" y="${y + 21}" class="muted" font-size="12">${escapeXml(item.event)}</text>
      <text x="1342" y="${y + 21}" class="soft" font-size="11" text-anchor="end">${escapeXml(item.time)}</text>
    </g>`;
  }).join('\n');
}

function fillTemplate(template, replacements) {
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

export function renderSvg(data) {
  assertValid(data);

  const template = fs.readFileSync(svgTemplatePath, 'utf8');
  const mrr = signalByMetric(data, 'mrr', 0);
  const customers = signalByMetric(data, 'active_customers', 1);
  const churn = signalByMetric(data, 'churn_rate', 2);
  const trial = signalByMetric(data, 'trial_conversion', 3);
  const synthesis = synthesisCopy(data.synthesis);
  const revenueSeries = data.context?.revenueSeries ?? [];

  return fillTemplate(template, {
    MRR_VALUE: escapeXml(mrr?.value ?? '—'),
    MRR_DELTA: escapeXml(mrr?.delta ?? '—'),
    CHURN_VALUE: escapeXml(churn?.value ?? '—'),
    CHURN_DELTA: escapeXml(churn?.delta ?? '—'),
    TRIAL_DELTA: escapeXml(trial?.delta ?? '—'),
    REVENUE_PATH: sparklinePath(revenueSeries),
    SYNTHESIS: synthesis.direction,
    TARGET_COPY: synthesis.target,
    S1_DELTA: escapeXml(mrr?.delta ?? '—'),
    S1_LABEL: escapeXml(mrr?.label ?? 'Signal 1'),
    S1_VALUE: escapeXml(mrr?.value ?? '—'),
    S2_DELTA: escapeXml(customers?.delta ?? '—'),
    S2_LABEL: escapeXml(customers?.label ?? 'Signal 2'),
    S2_VALUE: escapeXml(customers?.value ?? '—'),
    S3_DELTA: escapeXml(churn?.delta ?? '—'),
    S3_LABEL: escapeXml(churn?.label ?? 'Signal 3'),
    S3_VALUE: escapeXml(churn?.value ?? '—'),
    S4_DELTA: escapeXml(trial?.delta ?? '—'),
    S4_LABEL: escapeXml(trial?.label ?? 'Signal 4'),
    S4_VALUE: escapeXml(trial?.value ?? '—'),
    EXCEPTION_ROWS: exceptionRows(data.exceptions),
    EVENT_ROWS: eventRows(data.events)
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
  fs.mkdirSync(outputDir, { recursive: true });
  const svgOutput = path.join(outputDir, 'output.no-score.svg');
  fs.writeFileSync(svgOutput, svg);
  console.log(svgOutput);
}
