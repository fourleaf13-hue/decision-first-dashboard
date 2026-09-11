import crypto from 'node:crypto';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256Text(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function sha256Object(value) {
  return sha256Text(stableJson(value));
}

function escapeXmlText(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function buildCanonicalProvenance({ worthinessAssessment, decisionBrief, routingManifest, bundle, mode }) {
  return {
    provenanceVersion: 1,
    canonical: true,
    compiler: 'compile-dashboard.js',
    renderer: 'deterministic',
    mode,
    sourceSha256: bundle.source.sha256,
    worthinessAssessmentSha256: sha256Object(worthinessAssessment),
    decisionBriefSha256: sha256Object(decisionBrief),
    routingManifestSha256: sha256Object(routingManifest),
    groundedBundleSha256: sha256Object(bundle),
    decisionStateSha256: sha256Object(bundle.decisionState)
  };
}

export function injectHtmlProvenance(html, provenance) {
  const metas = [
    '<meta name="decision-first-renderer" content="canonical">',
    `<meta name="decision-first-mode" content="${provenance.mode}">`,
    `<meta name="decision-first-provenance-version" content="${provenance.provenanceVersion}">`,
    `<meta name="decision-first-decision-state-sha256" content="${provenance.decisionStateSha256}">`,
    `<meta name="decision-first-routing-manifest-sha256" content="${provenance.routingManifestSha256}">`
  ].join('');
  if (!html.includes('<head>')) throw new Error('Canonical HTML renderer output must contain <head>');
  return html.replace('<head>', `<head>${metas}`);
}

export function injectSvgProvenance(svg, provenance) {
  const metadata = escapeXmlText(stableJson(provenance));
  if (!svg.startsWith('<svg')) throw new Error('Canonical SVG renderer output must start with <svg');
  const close = svg.indexOf('>');
  return `${svg.slice(0, close + 1)}<metadata id="decision-first-provenance">${metadata}</metadata>${svg.slice(close + 1)}`;
}

export function finalizeOutputManifest(provenance, html, svg) {
  return {
    ...provenance,
    htmlSha256: sha256Text(html),
    svgSha256: sha256Text(svg)
  };
}

export function hasCanonicalHtmlProvenance(html) {
  return typeof html === 'string' &&
    html.includes('<meta name="decision-first-renderer" content="canonical">') &&
    /<meta name="decision-first-decision-state-sha256" content="[a-f0-9]{64}">/.test(html) &&
    /<meta name="decision-first-routing-manifest-sha256" content="[a-f0-9]{64}">/.test(html);
}
