import { renderHtml as renderBaseHtml, renderSvg as renderBaseSvg } from './render.js';

function escapeMarkup(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function deferredRequirements(renderPlan) {
  if (!renderPlan || !Array.isArray(renderPlan.requirements)) return [];
  return renderPlan.requirements.filter((requirement) => requirement.status === 'deferred');
}

function injectBeforeLast(source, marker, addition) {
  if (!addition) return source;
  const index = source.lastIndexOf(marker);
  if (index < 0) {
    throw new Error(`Unable to inject V3.1 render-plan output: marker not found: ${marker}`);
  }
  return `${source.slice(0, index)}${addition}${source.slice(index)}`;
}

function svgDeferredBlock(renderPlan) {
  const deferred = deferredRequirements(renderPlan);
  if (deferred.length === 0) return '';

  const first = deferred[0];
  const remaining = deferred.length - 1;
  const more = remaining > 0
    ? `<text x="1340" y="837" fill="#9b7a45" font-size="11" text-anchor="end">+${remaining} more unresolved</text>`
    : '';

  return `    <g data-v31-deferred="true">
      <rect x="72" y="786" width="1296" height="78" rx="20" fill="#fffdf7" stroke="#eadfbd"/>
      <text x="96" y="813" fill="#826329" font-size="12" font-weight="700" letter-spacing="1.1">Data needed</text>
      <text x="96" y="838" fill="#403b32" font-size="13" font-weight="650">${escapeMarkup(first.label)}</text>
      <text x="360" y="838" fill="#766e61" font-size="12">${escapeMarkup(first.toUnblock)}</text>
      ${more}
    </g>
`;
}

function htmlDeferredBlock(renderPlan) {
  const deferred = deferredRequirements(renderPlan);
  if (deferred.length === 0) return '';

  const rows = deferred.map((requirement) => `<div style="display:grid;grid-template-columns:minmax(180px,0.9fr) minmax(280px,1.6fr);gap:24px;padding:10px 0;border-top:1px solid #efe7d2;">
          <strong style="font-size:13px;color:#403b32;">${escapeMarkup(requirement.label)}</strong>
          <span style="font-size:12px;line-height:1.5;color:#766e61;">${escapeMarkup(requirement.toUnblock)}</span>
        </div>`).join('\n');

  return `    <section data-v31-deferred="true" aria-label="Data needed" style="margin-top:20px;padding:18px 22px;border:1px solid #eadfbd;border-radius:18px;background:#fffdf7;">
      <div style="margin-bottom:8px;font-size:12px;font-weight:750;letter-spacing:.08em;text-transform:uppercase;color:#826329;">Data needed</div>
      ${rows}
    </section>
`;
}

export function renderSvg(data, { renderPlan = null } = {}) {
  const base = renderBaseSvg(data);
  const block = svgDeferredBlock(renderPlan);
  return injectBeforeLast(base, '  </g>\n</svg>\n', block);
}

export function renderHtml(data, { renderPlan = null } = {}) {
  const base = renderBaseHtml(data);
  const block = htmlDeferredBlock(renderPlan);
  return injectBeforeLast(base, '  </main>\n</body>\n</html>\n', block);
}
