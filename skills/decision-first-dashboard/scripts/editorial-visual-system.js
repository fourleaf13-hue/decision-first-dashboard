import fs from 'node:fs';

export const VISUAL_SYSTEM_ID = 'editorial-v1';

const tokensUrl = new URL('../design-system/tokens.css', import.meta.url);
const manifestUrl = new URL('../design-system/components.manifest.json', import.meta.url);

function readUtf8(url) {
  return fs.readFileSync(url, 'utf8').trim();
}

export function loadDecisionFirstComponentManifest() {
  const manifest = JSON.parse(readUtf8(manifestUrl));
  if (manifest?.visualSystem !== VISUAL_SYSTEM_ID || !Array.isArray(manifest?.components)) {
    throw new Error('EDITORIAL_VISUAL_SYSTEM_INVALID: component manifest does not match editorial-v1');
  }
  return manifest;
}

const TOKENS = readUtf8(tokensUrl);

const EDITORIAL_HTML_CSS = `${TOKENS}
html{background:var(--df-page)}
body{margin:0;background:var(--df-page);color:var(--df-ink);font-family:var(--df-font)}
.semantic-shell{max-width:var(--df-container);margin:0 auto;padding:48px var(--df-gutter-desktop) 72px}
.semantic-shell>h1{max-width:980px;margin:0;color:var(--df-ink);font-size:var(--df-text-finding);font-weight:650;line-height:var(--df-leading-tight);letter-spacing:var(--df-tracking-display)}
.semantic-shell>p{max-width:760px;margin:12px 0 48px;color:var(--df-ink-secondary);font-size:var(--df-text-body);line-height:var(--df-leading-body)}
.typed-claims{display:block;margin:0 0 40px}
.typed-claim{display:block;width:auto;max-width:900px;padding:3px 0 3px 12px;border-left:2px solid var(--df-accent);border-radius:0;background:transparent;color:var(--df-ink);font-size:var(--df-text-body);font-weight:600}
.semantic-grid{gap:48px 24px}
.semantic-grid--hero_support{grid-template-columns:minmax(0,1fr)}
.semantic-grid--asymmetric{grid-template-columns:minmax(0,9fr) minmax(240px,3fr)}
.semantic-card{min-width:0;background:transparent;border:0;border-top:1px solid var(--df-border);border-radius:0;box-shadow:none;padding:24px 0 0}
.semantic-card header{margin:0 0 20px;padding:0;border-bottom:0}
.semantic-card h2{margin:0;color:var(--df-ink);letter-spacing:-.018em}
.semantic-card p{margin:6px 0 0;color:var(--df-ink-muted);line-height:1.45}
.semantic-card--role-anchor{grid-column:1/-1;border-top:4px solid var(--df-accent);border-radius:0;box-shadow:none;padding:28px 0 12px;--rp-title:28px;--rp-value:18px;--rp-label:14px;--rp-meta:13px}
.semantic-card--role-primary{border-top:1px solid var(--df-ink);border-radius:0;box-shadow:none;padding-top:24px}
.semantic-card--role-supporting{border-top:1px solid var(--df-border);border-radius:0;box-shadow:none;padding-top:24px;opacity:.94}
.semantic-card--role-detail{background:transparent;border-top:1px solid var(--df-border-soft);border-radius:0;box-shadow:none;padding-top:20px}
.semantic-card--role-supporting h2,.semantic-card--role-detail h2{font-weight:600}
.metric-strip{display:grid;margin-top:20px;padding:0;gap:0;background:transparent;border-top:1px solid var(--df-border-soft);border-bottom:1px solid var(--df-border-soft);border-radius:0}
.metric-tile{min-height:82px;padding:16px 18px;border:0!important;border-right:1px solid var(--df-border-soft)!important;border-radius:0!important;background:transparent!important}
.metric-tile:last-child{border-right:0!important}
.metric-tile strong{color:var(--df-ink)}
.metric-tile span,.metric-tile small{color:var(--df-ink-muted)}
.visual-plot{margin-top:22px}
.trend-plot,.radar-plot{background:transparent;border-radius:0}
.ranking-end{background:transparent;border-radius:0;box-shadow:none}
.ranking-end--high,.ranking-end--low{border-top-color:var(--df-border)}
.visual-bar,.visual-ranking li .visual-bar,.breakdown-bars li .visual-bar,.relationship-bars li .visual-bar{background:var(--df-accent)}
.waterfall-total-bar{background:var(--df-accent)}
.waterfall-segment{background:#8797b8}
.subset-note{color:var(--df-ink-muted)}
@media(max-width:900px){.semantic-shell{padding:36px var(--df-gutter-tablet) 56px}.semantic-grid,.semantic-grid--hero_support,.semantic-grid--asymmetric{grid-template-columns:1fr}.semantic-card--role-anchor{grid-column:auto}}
@media(max-width:620px){.semantic-shell{padding:28px var(--df-gutter-phone) 48px}.semantic-shell>h1{font-size:34px}.semantic-shell>p{margin-bottom:36px}.semantic-grid{gap:36px}.metric-strip{grid-template-columns:1fr}.metric-tile{border-right:0!important;border-bottom:1px solid var(--df-border-soft)!important}.metric-tile:last-child{border-bottom:0!important}}`;

const EDITORIAL_SVG_CSS = `.card{fill:none;stroke:#d7dde7;stroke-width:1}.title{fill:#111318}.subtitle{fill:#77808d}.label{fill:#4d5562}.value{fill:#111318}.small-label{fill:#77808d}.small-value{fill:#111318}.metric-strip-plate{fill:none;stroke:#edf0f4}.metric-tile,.metric-tile--lead,.metric-tile--secondary{fill:none;stroke:#edf0f4}.metric-value,.metric-value--lead{fill:#111318}.trend-line{stroke:#2357c6}.trend-point{stroke:#2357c6}.trend-point--latest{fill:#2357c6}.ranking-bar,.breakdown-bar,.bullet-actual-bar,.waterfall-total-bar{fill:#2357c6}.distribution-bar,.gap-bar,.waterfall-segment-bar{fill:#8797b8}g[data-attention-role="anchor"]>.card{fill:none;stroke:#2357c6;stroke-width:2}g[data-attention-role="primary"]>.card{fill:none;stroke:#111318}g[data-attention-role="supporting"]>.card,g[data-attention-role="detail"]>.card{fill:none;stroke:#d7dde7}`;

function assertMarkup(markup, kind) {
  if (typeof markup !== 'string' || markup.length === 0) {
    throw new Error(`EDITORIAL_VISUAL_SYSTEM_INVALID: ${kind} markup must be a non-empty string`);
  }
}

function addRootAttribute(markup, tagName) {
  const open = `<${tagName}`;
  if (!markup.includes(open)) throw new Error(`EDITORIAL_VISUAL_SYSTEM_INVALID: ${tagName} root is missing`);
  if (markup.includes(`data-visual-system="${VISUAL_SYSTEM_ID}"`)) return markup;
  return markup.replace(open, `${open} data-visual-system="${VISUAL_SYSTEM_ID}"`);
}

export function applyEditorialHtml(markup) {
  assertMarkup(markup, 'HTML');
  let output = addRootAttribute(markup, 'html');
  const style = `<style data-decision-first-visual-system="${VISUAL_SYSTEM_ID}">${EDITORIAL_HTML_CSS}</style>`;
  if (!output.includes('</head>')) throw new Error('EDITORIAL_VISUAL_SYSTEM_INVALID: HTML head is missing');
  output = output.replace('</head>', `${style}</head>`);
  return output;
}

export function applyEditorialSvg(markup) {
  assertMarkup(markup, 'SVG');
  let output = addRootAttribute(markup, 'svg');
  const firstClose = output.indexOf('>');
  if (firstClose < 0) throw new Error('EDITORIAL_VISUAL_SYSTEM_INVALID: SVG root is malformed');
  const style = `<style data-decision-first-visual-system="${VISUAL_SYSTEM_ID}">${EDITORIAL_SVG_CSS}</style>`;
  output = `${output.slice(0, firstClose + 1)}${style}${output.slice(firstClose + 1)}`;
  output = output.replace(/<rect width="1440" height="([^"]+)" fill="#eef1f6"\/>/, '<rect width="1440" height="$1" fill="#ffffff"/>');
  return output;
}
