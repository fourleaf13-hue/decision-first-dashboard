import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGroundedBundle } from './grounding.js';
import { buildRenderPlan, serializeRenderPlan } from './planner.js';
import { renderHtml, renderSvg } from './render-plan.js';

const currentFile = fileURLToPath(import.meta.url);

function planningFailure(errors) {
  return {
    valid: false,
    stage: 'planning',
    transition: 'FIX_COMPILER_INTENT',
    errors
  };
}

export function compileGroundedBundle(bundle, { baseDir = process.cwd() } = {}) {
  const groundingResult = validateGroundedBundle(bundle, { baseDir });
  if (!groundingResult.valid) {
    return {
      result: groundingResult,
      svg: null,
      html: null,
      outputMode: null,
      renderPlan: null,
      renderPlanJson: null
    };
  }

  const planning = buildRenderPlan(bundle);
  if (planning.enabled && !planning.valid) {
    return {
      result: planningFailure(planning.errors),
      svg: null,
      html: null,
      outputMode: null,
      renderPlan: null,
      renderPlanJson: null
    };
  }

  const data = bundle.decisionState;
  const outputMode = data.mode === 'composite' ? 'composite' : 'no-score';
  const renderPlan = planning.enabled ? planning.plan : null;

  return {
    result: groundingResult,
    svg: renderSvg(data, { renderPlan }),
    html: renderHtml(data, { renderPlan }),
    outputMode,
    renderPlan,
    renderPlanJson: renderPlan ? serializeRenderPlan(renderPlan) : null
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

  const outputs = [svgOutput, htmlOutput];
  if (compiled.renderPlanJson) {
    const planOutput = path.join(outputDir, `output.${compiled.outputMode}.plan.json`);
    fs.writeFileSync(planOutput, compiled.renderPlanJson);
    outputs.push(planOutput);
  }

  process.stdout.write(`${outputs.join('\n')}\n`);
}
