import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGroundedBundle } from './compile.js';
import { validateMetricRouting } from './routing.js';
import { evaluateWorthinessAssessment } from './worthiness.js';

const currentFile = fileURLToPath(import.meta.url);

export function compileDecisionDashboard(worthinessAssessment, routingManifest, bundle, { baseDir = process.cwd() } = {}) {
  const worthiness = evaluateWorthinessAssessment(worthinessAssessment);
  if (!worthiness.valid || worthiness.transition !== 'BUILD_DECISION_BRIEF') {
    return {
      result: {
        valid: false,
        assessmentValid: worthiness.valid,
        stage: 'worthiness',
        transition: worthiness.transition,
        errors: worthiness.errors,
        recommendedFormat: worthiness.recommendedFormat,
        worthinessSummary: worthiness.summary
      },
      svg: null,
      html: null,
      outputMode: null
    };
  }

  const routing = validateMetricRouting(routingManifest, bundle?.decisionState);
  if (!routing.valid) {
    return {
      result: {
        valid: false,
        stage: 'routing',
        transition: 'FIX_METRIC_ROUTING',
        errors: routing.errors,
        worthinessSummary: worthiness.summary,
        routingSummary: routing.summary
      },
      svg: null,
      html: null,
      outputMode: null
    };
  }

  const compiled = compileGroundedBundle(bundle, { baseDir });
  return {
    ...compiled,
    result: {
      ...compiled.result,
      worthinessSummary: worthiness.summary,
      routingSummary: routing.summary
    }
  };
}

if (process.argv[1] === currentFile) {
  const worthinessPath = process.argv[2];
  const routingPath = process.argv[3];
  const bundlePath = process.argv[4];
  const outputDir = process.argv[5] ?? path.dirname(bundlePath ?? '.');

  if (!worthinessPath || !routingPath || !bundlePath) {
    process.stderr.write(`${JSON.stringify({
      valid: false,
      stage: 'worthiness',
      transition: 'FIX_WORTHINESS_ASSESSMENT',
      errors: [{ code: 'WORTHINESS_ASSESSMENT_INVALID', path: '', message: 'Usage: node compile-dashboard.js <worthiness-assessment.json> <routing-manifest.json> <grounded-bundle.json> [output-dir]' }]
    })}\n`);
    process.exit(2);
  }

  const absoluteWorthiness = path.resolve(worthinessPath);
  const absoluteRouting = path.resolve(routingPath);
  const absoluteBundle = path.resolve(bundlePath);
  const worthinessAssessment = JSON.parse(fs.readFileSync(absoluteWorthiness, 'utf8'));
  const routingManifest = JSON.parse(fs.readFileSync(absoluteRouting, 'utf8'));
  const bundle = JSON.parse(fs.readFileSync(absoluteBundle, 'utf8'));
  const compiled = compileDecisionDashboard(worthinessAssessment, routingManifest, bundle, { baseDir: path.dirname(absoluteBundle) });

  if (!compiled.result.valid || compiled.result.transition !== 'PASS') {
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
