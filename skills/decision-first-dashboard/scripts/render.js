import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveOverallDirection as deriveOverallDirectionCore,
  renderHtml as renderHtmlCore,
  renderSvg as renderSvgCore
} from './render-core.js';

const currentFile = fileURLToPath(import.meta.url);

const SVG_LAYOUT = {
  cx: 698,
  cy: 464,
  radarRadius: 188,
  labelGap: 40,
  stageTranslateX: 8,
  stageTranslateY: -6,
  stageCenterX: 706
};

const HTML_LAYOUT = {
  cx: 310,
  cy: 260,
  radarRadius: 188,
  labelGap: 40,
  width: 620,
  height: 520
};

export const deriveOverallDirection = deriveOverallDirectionCore;

function radarDimensions(data) {
  if (data?.mode === 'composite') return data.model?.components ?? null;
  if (data?.radarScale && Array.isArray(data.signals)) return data.signals;
  return null;
}

function radialPoint(cx, cy, radius, angle) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius
  };
}

function radarSide(angle) {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  if (Math.abs(x) < 0.15) return y < 0 ? 'top' : 'bottom';
  return x < 0 ? 'left' : 'right';
}

function radarAnchor(side) {
  if (side === 'left') return 'end';
  if (side === 'right') return 'start';
  return 'middle';
}

function svgLabelStartY(pointY, side) {
  if (side === 'top') return pointY - 21;
  if (side === 'bottom') return pointY - 3;
  return pointY - 20;
}

function tuneSvgLabels(markup, dimensions) {
  const radius = SVG_LAYOUT.radarRadius + SVG_LAYOUT.labelGap;
  let index = 0;

  return markup.replace(
    /<text class="radar-label radar-label--(top|bottom|left|right)"[\s\S]*?<\/text>/g,
    (block) => {
      if (index >= dimensions.length) return block;
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / dimensions.length;
      const side = radarSide(angle);
      const anchor = radarAnchor(side);
      const point = radialPoint(SVG_LAYOUT.cx, SVG_LAYOUT.cy, radius, angle);
      const x = point.x.toFixed(1);
      const y = svgLabelStartY(point.y, side).toFixed(1);
      index += 1;

      return block
        .replace(/radar-label--(top|bottom|left|right)/, `radar-label--${side}`)
        .replace(/text-anchor="(start|end|middle)"/g, `text-anchor="${anchor}"`)
        .replace(/x="-?[\d.]+"/g, `x="${x}"`)
        .replace(/y="-?[\d.]+"/, `y="${y}"`);
    }
  );
}

function tuneHtmlLabels(markup, dimensions) {
  const radius = HTML_LAYOUT.radarRadius + HTML_LAYOUT.labelGap;
  let index = 0;

  return markup.replace(
    /<div class="[^"]*radar-label radar-label--(top|bottom|left|right)" data-outside-ring="true" style="left:[^;]+%;top:[^"]+%">/g,
    (block) => {
      if (index >= dimensions.length) return block;
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / dimensions.length;
      const side = radarSide(angle);
      const point = radialPoint(HTML_LAYOUT.cx, HTML_LAYOUT.cy, radius, angle);
      const left = (point.x / HTML_LAYOUT.width * 100).toFixed(2);
      const top = (point.y / HTML_LAYOUT.height * 100).toFixed(2);
      index += 1;

      return block
        .replace(/radar-label--(top|bottom|left|right)/, `radar-label--${side}`)
        .replace(/left:[^;]+%;top:[^"]+%/, `left:${left}%;top:${top}%`);
    }
  );
}

function tuneSvgRadar(markup, dimensions) {
  let tuned = markup
    .replace('<circle cx="740" cy="482" r="318" class="radar-ambient-field"/>', `<circle cx="${SVG_LAYOUT.stageCenterX}" cy="482" r="318" class="radar-ambient-field"/>`)
    .replace('<g transform="translate(42 -6)">', `<g transform="translate(${SVG_LAYOUT.stageTranslateX} ${SVG_LAYOUT.stageTranslateY})">`)
    .replace('.radar-label--right { transform: translateX(-24px); }', '.radar-label--right { transform: none; }');

  tuned = tuneSvgLabels(tuned, dimensions);
  return tuned;
}

function tuneHtmlRadar(markup, dimensions) {
  let tuned = markup.replace(
    '.radar-label--right { text-align: left; transform: translate(-24px, -50%); }',
    '.radar-label--right { text-align: left; transform: translate(0, -50%); }'
  );

  tuned = tuneHtmlLabels(tuned, dimensions);
  return tuned;
}

export function renderSvg(data) {
  const markup = renderSvgCore(data);
  const dimensions = radarDimensions(data);
  return dimensions?.length ? tuneSvgRadar(markup, dimensions) : markup;
}

export function renderHtml(data) {
  const markup = renderHtmlCore(data);
  const dimensions = radarDimensions(data);
  return dimensions?.length ? tuneHtmlRadar(markup, dimensions) : markup;
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
