import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGroundedBundle } from './compile.js';
import { validateMetricRouting } from './routing.js';

const currentFile = fileURLToPath(import.meta.url);

export function compileDecisionDashboard(routingManifest, bundle, { baseDir = process.cwd() } = {}) {
  const routing = validateMetricRouting(routingManifest, bundle?.decisionState);
  if (!routing.valid) {
    return {
      result: {
        valid: false,
        stage: 'routing',
        transition: 'FIX_METRIC_ROUTING',
        errors: routing.errors,
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
      routingSummary: routing.summary
    }
  };
}

if (process.argv[1] === currentFile) {
  const routingPath = process.argv[2];
  const bundlePath = process.argv[3];
  const outputDir = process.argv[4] ?? path.dirname(bundlePath ?? '.');

  if (!routingPath || !bundlePath) {
    process.stderr.write(`${JSON.stringify({
      valid: false,
      stage: 'routing',
      transition: 'FIX_METRIC_ROUTING',
      errors: [{ code: 'ROUTING_MANIFEST_INVALID', path: '', message: 'Usage: node compile-dashboard.js <routing-manifest.json> <grounded-bundle.json> [output-dir]' }]
    })}\n`);
    process.exit(2);
  }

  const absoluteRouting = path.resolve(routingPath);
  const absoluteBundle = path.resolve(bundlePath);
  const routingManifest = JSON.parse(fs.readFileSync(absoluteRouting, 'utf8'));
  const bundle = JSON.parse(fs.readFileSync(absoluteBundle, 'utf8'));
  const compiled = compileDecisionDashboard(routingManifest, bundle, { baseDir: path.dirname(absoluteBundle) });

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
