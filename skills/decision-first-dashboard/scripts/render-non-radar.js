function escapeMarkup(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function directionClass(direction) {
  if (direction === 'improving') return 'positive';
  if (direction === 'deteriorating') return 'negative';
  return 'neutral';
}

function signalCopy(signal) {
  const delta = signal.delta ? escapeMarkup(signal.delta) : '';
  return {
    label: escapeMarkup(signal.label),
    value: escapeMarkup(signal.value),
    delta,
    direction: directionClass(signal.direction)
  };
}

function sourceRevenueTrend(data) {
  const series = data.context?.provenance === 'source' ? data.context.revenueSeries : null;
  if (!Array.isArray(series) || series.length < 2) return null;
  const signal = data.signals.find((item) => item.metric === 'mrr' || item.metric === 'arr');
  return signal ? { signal, series } : null;
}

function movementSignals(signals) {
  return signals.filter((signal) => signal.delta).slice(0, 3);
}

function pathForSeries(series, { left, right, top, bottom }) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = Math.max(max - min, 1);
  return series.map((value, index) => {
    const x = left + ((right - left) * index) / (series.length - 1);
    const y = bottom - ((value - min) / span) * (bottom - top);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function htmlTrendCard(trend) {
  if (!trend) return '';
  const path = pathForSeries(trend.series, { left: 0, right: 234, top: 6, bottom: 80 });
  const signal = signalCopy(trend.signal);
  const delta = signal.delta ? `<span class="support-delta ${signal.direction}">${signal.delta}</span>` : '';
  return `<article class="support-card trend-card">
    <div class="support-label">${signal.label} trend</div>
    <div class="support-value">${signal.value}</div>
    ${delta}
    <svg class="sparkline" viewBox="0 0 234 86" aria-label="Revenue trend"><path d="${path}"></path></svg>
  </article>`;
}

function htmlMovementCard(signals) {
  if (!signals.length) return '';
  const rows = signals.map((item) => {
    const signal = signalCopy(item);
    return `<div class="movement-row">
      <span>${signal.label}</span>
      <strong>${signal.value}</strong>
      <em class="${signal.direction}">${signal.delta}</em>
    </div>`;
  }).join('');
  return `<article class="support-card movement-card"><div class="support-label">Movement</div>${rows}</article>`;
}

function htmlExceptionsCard(exceptions = []) {
  if (!exceptions.length) return '';
  const rows = exceptions.slice(0, 3).map((item) => {
    const meta = [item.plan, item.mrr ? `${item.mrr} MRR` : null].filter(Boolean).join(' · ');
    return `<div class="exception-row">
      <span class="attention-dot" aria-hidden="true"></span>
      <div><strong>${escapeMarkup(item.name)}</strong>${meta ? `<span>${escapeMarkup(meta)}</span>` : ''}</div>
      <small>${escapeMarkup(item.status)}</small>
    </div>`;
  }).join('');
  return `<article class="support-card"><div class="support-label">Accounts to watch</div>${rows}</article>`;
}

function htmlEventsCard(events = []) {
  if (!events.length) return '';
  const rows = events.slice(0, 4).map((item) => `<div class="event-row">
    <span class="event-dot" aria-hidden="true"></span>
    <div><strong>${escapeMarkup(item.subject)}</strong><span>${escapeMarkup(item.event)}</span></div>
    <small>${escapeMarkup(item.time)}</small>
  </div>`).join('');
  return `<article class="support-card"><div class="support-label">Recent events</div>${rows}</article>`;
}

function htmlSignalFocus(signals) {
  const [lead, ...rest] = signals;
  const primary = signalCopy(lead);
  const leadDelta = primary.delta ? `<span class="lead-delta ${primary.direction}">${primary.delta}</span>` : '';
  const supporting = rest.map((item) => {
    const signal = signalCopy(item);
    const delta = signal.delta ? `<small class="${signal.direction}">${signal.delta}</small>` : '';
    return `<article class="signal-support">
      <span>${signal.label}</span>
      <strong>${signal.value}</strong>
      ${delta}
    </article>`;
  }).join('');
  return `<div class="signal-focus">
    <article class="signal-lead">
      <span>${primary.label}</span>
      <strong>${primary.value}</strong>
      ${leadDelta}
    </article>
    <div class="signal-support-grid">${supporting}</div>
  </div>`;
}

function htmlSupportingContextRail(signals = []) {
  if (!signals.length) return '';
  const items = signals.map((item) => {
    const signal = signalCopy(item);
    const delta = signal.delta ? `<small class="${signal.direction}">${signal.delta}</small>` : '';
    return `<article class="supporting-context-item">
      <span>${signal.label}</span>
      <strong>${signal.value}</strong>
      ${delta}
    </article>`;
  }).join('');
  return `<section class="supporting-context-rail" aria-label="Supporting context">${items}</section>`;
}

function layoutClass(hasLeft, hasRight) {
  if (hasLeft && hasRight) return 'decision-layout--with-both';
  if (hasLeft) return 'decision-layout--with-left';
  if (hasRight) return 'decision-layout--with-right';
  return 'decision-layout--center-only';
}

const HTML_CSS = `
:root{color-scheme:light;--ink:#24243a;--muted:#747a9b;--accent:#5448df;--positive:#238764;--negative:#d75b67;--line:#ececf5;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}body{min-height:100vh;color:var(--ink);background:radial-gradient(circle at 50% 43%,rgba(221,216,247,.62),rgba(248,248,252,0) 40%),linear-gradient(135deg,#f8f8fc,#f5f6fb)}
.dashboard-shell{width:min(1320px,calc(100vw - 48px));margin:0 auto;padding:44px 0 56px}.page-header{margin:0 0 28px}.page-header h1{margin:0;font-size:31px;line-height:1.05;letter-spacing:-.035em}.page-header p{margin:9px 0 0;color:var(--muted);font-size:13px}
.decision-layout{display:grid;gap:24px;align-items:stretch;min-height:610px}.decision-layout--center-only{grid-template-columns:minmax(0,900px);justify-content:center;min-height:0}.decision-layout--with-left{grid-template-columns:290px minmax(0,860px);justify-content:center}.decision-layout--with-right{grid-template-columns:minmax(0,860px) 300px;justify-content:center}.decision-layout--with-both{grid-template-columns:280px minmax(0,720px) 290px}
.support-column{display:flex;flex-direction:column;gap:18px;padding:22px 0}.support-card{background:rgba(255,255,255,.92);border:1px solid rgba(235,236,245,.98);border-radius:24px;padding:23px 24px;box-shadow:0 18px 44px rgba(100,88,150,.09)}.support-label{font-size:14px;font-weight:730}.support-value{margin-top:18px;font-size:32px;font-weight:790;letter-spacing:-.04em}.support-delta{display:block;margin-top:7px;font-size:12px;font-weight:720}.sparkline{width:100%;height:86px;margin-top:18px;overflow:visible}.sparkline path{fill:none;stroke:var(--accent);stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.positive{color:var(--positive)}.negative{color:var(--negative)}.neutral{color:var(--muted)}
.movement-row{display:grid;grid-template-columns:1fr auto;grid-template-areas:"label delta" "value delta";gap:5px 12px;align-items:center;padding:15px 0}.movement-row+.movement-row{border-top:1px solid var(--line)}.movement-row span{grid-area:label;color:var(--muted);font-size:11px}.movement-row strong{grid-area:value;font-size:19px}.movement-row em{grid-area:delta;font-size:11px;font-style:normal;font-weight:720}
.synthesis-card{position:relative;min-height:610px;display:flex;flex-direction:column;gap:24px;align-items:center;justify-content:center}.synthesis-card:before{content:"";position:absolute;width:min(720px,92%);aspect-ratio:1;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(217,210,241,.34),rgba(238,241,250,.15) 62%,rgba(238,241,250,0) 78%);filter:blur(10px);pointer-events:none}.decision-layout--center-only .synthesis-card{min-height:min(40vh,420px);padding:24px 0}.decision-layout--center-only .signal-focus{gap:32px}
.signal-focus{position:relative;z-index:1;width:min(700px,92%);display:flex;flex-direction:column;align-items:center;gap:28px}.signal-lead{width:min(520px,100%);min-height:240px;padding:42px 38px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:rgba(255,255,255,.96);border:1px solid rgba(229,228,244,.98);border-radius:38px;box-shadow:0 30px 64px rgba(111,96,169,.16)}.signal-lead span{color:var(--muted);font-size:15px;font-weight:700}.signal-lead strong{margin-top:16px;color:var(--accent);font-size:68px;line-height:.95;letter-spacing:-.055em}.lead-delta{margin-top:16px;font-size:13px;font-weight:720}
.signal-support-grid{width:100%;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}.signal-support{min-height:118px;padding:22px 20px;text-align:center;background:rgba(255,255,255,.9);border:1px solid rgba(231,229,247,.96);border-radius:22px;box-shadow:0 14px 34px rgba(94,82,147,.08)}.signal-support span{display:block;color:var(--muted);font-size:11px;font-weight:680}.signal-support strong{display:block;margin-top:10px;font-size:27px;letter-spacing:-.035em}.signal-support small{display:block;margin-top:7px;font-size:10px;font-weight:720}
.supporting-context-rail{position:relative;z-index:1;width:min(760px,94%);display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}.supporting-context-item{min-height:82px;padding:15px 18px;background:rgba(255,255,255,.72);border:1px solid rgba(235,235,246,.92);border-radius:18px;text-align:left}.supporting-context-item span{display:block;color:var(--muted);font-size:10px;font-weight:650}.supporting-context-item strong{display:block;margin-top:8px;color:var(--ink);font-size:20px;letter-spacing:-.025em}.supporting-context-item small{display:block;margin-top:5px;font-size:9px;font-weight:700}
.exception-row,.event-row{display:grid;grid-template-columns:10px 1fr auto;gap:9px;align-items:start;padding:14px 0}.exception-row+.exception-row,.event-row+.event-row{border-top:1px solid var(--line)}.exception-row strong,.event-row strong{display:block;font-size:12px}.exception-row div span,.event-row div span{display:block;margin-top:4px;color:var(--muted);font-size:10px;line-height:1.4}.exception-row small{padding:5px 8px;border-radius:999px;background:#fff1f3;color:var(--negative);font-size:9px;font-weight:720}.event-row small{color:#9aa1c5;font-size:9px;white-space:nowrap}.attention-dot,.event-dot{width:8px;height:8px;border-radius:50%;margin-top:5px;background:#d75b67}.event-dot{background:#6555e8}
@media(max-width:1080px){.decision-layout,.decision-layout--center-only,.decision-layout--with-left,.decision-layout--with-right,.decision-layout--with-both{grid-template-columns:1fr}.synthesis-card{order:-1}.support-column{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));padding:0}.signal-lead strong{font-size:58px}}
@media(max-width:620px){.dashboard-shell{width:calc(100vw - 24px);padding-top:28px}.synthesis-card{min-height:540px}.decision-layout--center-only .synthesis-card{min-height:min(40vh,420px)}.signal-lead{min-height:210px;padding:34px 24px}.signal-lead strong{font-size:48px}.signal-support-grid{grid-template-columns:1fr 1fr}.supporting-context-rail{grid-template-columns:1fr 1fr}}
`;

export function renderNonRadarHtml(data) {
  const trend = sourceRevenueTrend(data);
  const movement = movementSignals(data.signals);
  const leftCards = [htmlTrendCard(trend), htmlMovementCard(movement)].filter(Boolean);
  const rightCards = [htmlExceptionsCard(data.exceptions), htmlEventsCard(data.events)].filter(Boolean);
  const left = leftCards.length ? `<aside class="support-column support-column--left">${leftCards.join('')}</aside>` : '';
  const right = rightCards.length ? `<aside class="support-column support-column--right">${rightCards.join('')}</aside>` : '';
  const layout = layoutClass(Boolean(leftCards.length), Boolean(rightCards.length));
  const supportingContext = htmlSupportingContextRail(data.supportingSignals);

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Current overview</title><style>${HTML_CSS}</style></head>
<body><main class="dashboard-shell">
  <header class="page-header"><h1>Current overview</h1><p>Key signals and supporting context</p></header>
  <section class="decision-layout ${layout}">
    ${left}
    <section class="synthesis-card">${htmlSignalFocus(data.signals)}${supportingContext}</section>
    ${right}
  </section>
</main></body></html>`;
}

function svgSignalFocus(signals) {
  const [lead, ...rest] = signals;
  const primary = signalCopy(lead);
  const leadDelta = primary.delta
    ? `<text x="720" y="464" class="${primary.direction}" font-size="14" font-weight="700" text-anchor="middle">${primary.delta}</text>`
    : '';
  const supportXs = rest.length === 1 ? [720] : rest.length === 2 ? [590,850] : rest.length === 3 ? [500,720,940] : rest.length === 4 ? [435,625,815,1005] : [400,560,720,880,1040];
  const support = rest.map((item, index) => {
    const signal = signalCopy(item);
    const x = supportXs[index];
    const delta = signal.delta ? `<text x="${x}" y="657" class="${signal.direction}" font-size="10" font-weight="700" text-anchor="middle">${signal.delta}</text>` : '';
    return `<g class="signal-support">
      <rect x="${x - 82}" y="548" width="164" height="126" rx="24" class="support-signal-card"/>
      <text x="${x}" y="580" class="muted" font-size="11" font-weight="650" text-anchor="middle">${signal.label}</text>
      <text x="${x}" y="620" class="ink" font-size="27" font-weight="780" text-anchor="middle">${signal.value}</text>
      ${delta}
    </g>`;
  }).join('');
  return `<g class="signal-focus">
    <g class="signal-lead">
      <rect x="475" y="238" width="490" height="270" rx="38" class="lead-card"/>
      <text x="720" y="312" class="muted" font-size="15" font-weight="680" text-anchor="middle">${primary.label}</text>
      <text x="720" y="408" class="accent" font-size="70" font-weight="800" text-anchor="middle">${primary.value}</text>
      ${leadDelta}
    </g>
    ${support}
  </g>`;
}

function svgSupportingContextRail(signals = []) {
  if (!signals.length) return '';
  const xs = signals.length === 1
    ? [720]
    : signals.length === 2
      ? [620, 820]
      : signals.length === 3
        ? [520, 720, 920]
        : [420, 620, 820, 1020];
  const items = signals.map((item, index) => {
    const signal = signalCopy(item);
    const x = xs[index];
    const delta = signal.delta ? `<text x="${x}" y="804" class="${signal.direction}" font-size="9" font-weight="700" text-anchor="middle">${signal.delta}</text>` : '';
    return `<g class="supporting-context-item">
      <rect x="${x - 88}" y="714" width="176" height="96" rx="18" class="context-card"/>
      <text x="${x}" y="744" class="muted" font-size="10" font-weight="650" text-anchor="middle">${signal.label}</text>
      <text x="${x}" y="780" class="ink" font-size="20" font-weight="730" text-anchor="middle">${signal.value}</text>
      ${delta}
    </g>`;
  }).join('');
  return `<g class="supporting-context-rail" aria-label="Supporting context">${items}</g>`;
}

function svgTrendCard(trend) {
  if (!trend) return '';
  const signal = signalCopy(trend.signal);
  const path = pathForSeries(trend.series, { left: 94, right: 328, top: 264, bottom: 332 });
  return `<g class="support-card trend-card">
    <rect x="64" y="176" width="294" height="210" rx="25" class="support-panel"/>
    <text x="92" y="214" class="ink" font-size="14" font-weight="700">${signal.label} trend</text>
    <text x="92" y="254" class="ink" font-size="30" font-weight="780">${signal.value}</text>
    <path d="${path}" fill="none" stroke="#5448df" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function svgMovementCard(signals) {
  if (!signals.length) return '';
  const rows = signals.map((item, index) => {
    const signal = signalCopy(item);
    const y = 484 + index * 58;
    return `<text x="92" y="${y}" class="muted" font-size="11">${signal.label}</text>
      <text x="92" y="${y + 22}" class="ink" font-size="18" font-weight="700">${signal.value}</text>
      <text x="330" y="${y + 22}" class="${signal.direction}" font-size="11" font-weight="700" text-anchor="end">${signal.delta}</text>`;
  }).join('');
  const height = 70 + signals.length * 58;
  return `<g class="support-card movement-card"><rect x="64" y="432" width="294" height="${height}" rx="25" class="support-panel"/><text x="92" y="464" class="ink" font-size="14" font-weight="700">Movement</text>${rows}</g>`;
}

function svgRightCards(exceptions = [], events = []) {
  const groups = [];
  let y = 176;
  if (exceptions.length) {
    const rows = exceptions.slice(0, 3).map((item, index) => {
      const rowY = y + 70 + index * 58;
      return `<circle cx="1096" cy="${rowY - 4}" r="4" fill="#d75b67"/><text x="1110" y="${rowY}" class="ink" font-size="12" font-weight="650">${escapeMarkup(item.name)}</text><text x="1318" y="${rowY}" class="negative" font-size="10" font-weight="700" text-anchor="end">${escapeMarkup(item.status)}</text>`;
    }).join('');
    const height = 76 + Math.min(exceptions.length, 3) * 58;
    groups.push(`<g><rect x="1064" y="${y}" width="312" height="${height}" rx="25" class="support-panel"/><text x="1092" y="${y + 38}" class="ink" font-size="14" font-weight="700">Accounts to watch</text>${rows}</g>`);
    y += height + 22;
  }
  if (events.length) {
    const rows = events.slice(0, 4).map((item, index) => {
      const rowY = y + 70 + index * 56;
      return `<circle cx="1096" cy="${rowY - 4}" r="4" fill="#6555e8"/><text x="1110" y="${rowY}" class="ink" font-size="12" font-weight="650">${escapeMarkup(item.subject)}</text><text x="1110" y="${rowY + 18}" class="muted" font-size="10">${escapeMarkup(item.event)}</text>`;
    }).join('');
    const height = 76 + Math.min(events.length, 4) * 56;
    groups.push(`<g><rect x="1064" y="${y}" width="312" height="${height}" rx="25" class="support-panel"/><text x="1092" y="${y + 38}" class="ink" font-size="14" font-weight="700">Recent events</text>${rows}</g>`);
  }
  return groups.join('');
}

export function renderNonRadarSvg(data) {
  const trend = sourceRevenueTrend(data);
  const movement = movementSignals(data.signals);
  const left = `${svgTrendCard(trend)}${svgMovementCard(movement)}`;
  const right = svgRightCards(data.exceptions, data.events);
  const supportingContext = svgSupportingContextRail(data.supportingSignals);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900" role="img" aria-labelledby="title desc">
  <title id="title">Current overview</title><desc id="desc">Key source-supported signals and supporting context.</desc>
  <defs><linearGradient id="pageBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F8F8FC"/><stop offset="1" stop-color="#F5F6FB"/></linearGradient><filter id="panelShadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#B6A9E3" flood-opacity="0.14"/></filter></defs>
  <style>.sans{font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.ink{fill:#24243a}.muted{fill:#747a9b}.accent{fill:#5448df}.positive{fill:#238764}.negative{fill:#d75b67}.neutral{fill:#747a9b}.support-panel,.lead-card,.support-signal-card{fill:#fff;stroke:#ececf5;stroke-width:1;filter:url(#panelShadow)}.lead-card{fill-opacity:.97}.support-signal-card{fill-opacity:.94}.context-card{fill:#fff;fill-opacity:.74;stroke:#ececf5;stroke-width:1}</style>
  <rect width="1440" height="900" fill="url(#pageBg)"/><circle cx="720" cy="450" r="390" fill="#e9e5f7" fill-opacity=".30"/>
  <g class="sans"><text x="72" y="76" class="ink" font-size="29" font-weight="760">Current overview</text><text x="72" y="107" class="muted" font-size="14">Key signals and supporting context</text>${left}${svgSignalFocus(data.signals)}${supportingContext}${right}</g>
</svg>`;
}