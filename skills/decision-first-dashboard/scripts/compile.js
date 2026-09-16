import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGroundedBundle } from './grounding.js';
import { renderHtml, renderSvg } from './render.js';
import { buildDeliveredClaims } from './composition.js';

const currentFile = fileURLToPath(import.meta.url);

function semanticDeliveryFailure(code, pathValue, message) {
  return {
    result: {
      valid: false,
      stage: 'delivery',
      transition: 'DELIVERY_CONTRACT_FAILED',
      errors: [{ code, path: pathValue, message }]
    },
    svg: null,
    html: null,
    outputMode: null
  };
}

export function compileGroundedBundle(
  bundle,
  { baseDir = process.cwd(), composition = undefined, claims = undefined, requireSemantic = false } = {}
) {
  const result = validateGroundedBundle(bundle, { baseDir });
  if (!result.valid) return { result, svg: null, html: null, outputMode: null };

  const data = bundle.decisionState;
  if (requireSemantic && (!Array.isArray(data.semanticNodes) || data.semanticNodes.length === 0)) {
    return semanticDeliveryFailure(
      'SEMANTIC_STATE_REQUIRED',
      '/decisionState/semanticNodes',
      'canonical production delivery requires at least one semantic node; legacy rendering is compatibility-only'
    );
  }
  if (requireSemantic && (!composition || !Array.isArray(composition.nodes) || composition.nodes.length === 0)) {
    return semanticDeliveryFailure(
      'SEMANTIC_COMPOSITION_REQUIRED',
      '/composition/nodes',
      'canonical production delivery requires a non-empty validated semantic composition'
    );
  }
  const deliveredClaims = claims ?? buildDeliveredClaims(bundle);
  try {
    return {
      result,
      svg: renderSvg(data, { composition, claims: deliveredClaims, requireSemantic }),
      html: renderHtml(data, { composition, claims: deliveredClaims, requireSemantic }),
      outputMode: data.mode === 'composite' ? 'composite' : 'no-score'
    };
  } catch (error) {
    return {
      result: {
        valid: false,
        stage: 'delivery',
        transition: 'DELIVERY_CONTRACT_FAILED',
        errors: [{
          code: 'RENDERER_CONTRACT_FAILED',
          path: '',
          message: error instanceof Error ? error.message : String(error)
        }]
      },
      svg: null,
      html: null,
      outputMode: null
    };
  }
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
