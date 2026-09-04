import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGroundedBundle } from './grounding.js';
import { renderHtml, renderSvg } from './render.js';

const currentFile = fileURLToPath(import.meta.url);

export function compileGroundedBundle(bundle, { baseDir = process.cwd() } = {}) {
  const result = validateGroundedBundle(bundle, { baseDir });
  if (!result.valid) return { result, svg: null, html: null, outputMode: null };

  const data = bundle.decisionState;
  return {
    result,
    svg: renderSvg(data),
    html: renderHtml(data),
    outputMode: data.mode === 'composite' ? 'composite' : 'no-score'
  };
}

if (process.argv[1] === currentFile) {
  const inputPath = process.argv[2];
  const outputDir = process.argv[3] ?? path.dirname(inputPath ?? '.');

  if (!inputPath) {
    process.stderr.write(`${JSON.stringify({
      valid: false,
      stage: 'grounding',
      transition: 'FIX_DECISION_STATE',
      errors: [{ code: 'GROUNDING_BUNDLE_INVALID', path: '', message: 'Usage: node compile.js <grounded-bundle.json> [output-dir]' }]
    })}\n`);
    process.exit(2);
  }

  const absoluteInput = path.resolve(inputPath);
  const bundle = JSON.parse(fs.readFileSync(absoluteInput, 'utf8'));
  const compiled = compileGroundedBundle(bundle, { baseDir: path.dirname(absoluteInput) });

  if (!compiled.result.valid) {
    process.stderr.write(`${JSON.stringify(compiled.result)}\n`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const svgOutput = path.join(outputDir, `output.${compiled.outputMode}.svg`);
  const htmlOutput = path.join(outputDir, `output.${compiled.outputMode}.html`);
  fs.writeFileSync(svgOutput, compiled.svg);
  fs.writeFileSync(htmlOutput, compiled.html);
  process.stdout.write(`${svgOutput}\n${htmlOutput}\n`);
}
