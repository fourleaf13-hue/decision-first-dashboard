import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGroundedBundle } from './compile.js';
import { validateMetricRouting } from './routing.js';
import { evaluateWorthinessAssessment } from './worthiness.js';
import { evaluateDecisionBrief } from './intake.js';
import {
  buildCanonicalProvenance,
  finalizeOutputManifest,
  injectHtmlProvenance,
  injectSvgProvenance
} from './provenance.js';

const currentFile = fileURLToPath(import.meta.url);

function normalizeIntent(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function validateConfirmedIntentBinding(decisionBrief, routingManifest) {
  const errors = [];
  const confirmedDecision = normalizeIntent(decisionBrief?.decision?.value);
  const confirmedAction = normalizeIntent(decisionBrief?.action?.value);
  const routedDecision = normalizeIntent(routingManifest?.decision);
  const routedAction = normalizeIntent(routingManifest?.action);

  if (confirmedDecision !== routedDecision) {
    errors.push({
      code: 'CONFIRMED_DECISION_MISMATCH',
      path: '/decision',
      message: 'routing decision must exactly preserve the confirmed Decision Brief wording'
    });
  }
  if (confirmedAction !== routedAction) {
    errors.push({
      code: 'CONFIRMED_ACTION_MISMATCH',
      path: '/action',
      message: 'routing action must exactly preserve the confirmed Decision Brief wording'
    });
  }
  return errors;
}

export function compileDecisionDashboard(
  worthinessAssessment,
  decisionBrief,
  routingManifest,
  bundle,
  { baseDir = process.cwd() } = {}
) {
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
      manifest: null,
      outputMode: null
    };
  }

  const intake = evaluateDecisionBrief(decisionBrief);
  if (!intake.valid || intake.transition !== 'ALLOW_ROUTING') {
    return {
      result: {
        valid: false,
        stage: 'intake',
        transition: intake.transition,
        errors: intake.errors,
        missingSlots: intake.missingSlots,
        worthinessSummary: worthiness.summary,
        intakeSummary: intake.summary
      },
      svg: null,
      html: null,
      manifest: null,
      outputMode: null
    };
  }

  const intentErrors = validateConfirmedIntentBinding(decisionBrief, routingManifest);
  if (intentErrors.length > 0) {
    return {
      result: {
        valid: false,
        stage: 'routing',
        transition: 'FIX_METRIC_ROUTING',
        errors: intentErrors,
        worthinessSummary: worthiness.summary,
        intakeSummary: intake.summary,
        routingSummary: null
      },
      svg: null,
      html: null,
      manifest: null,
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
        intakeSummary: intake.summary,
        routingSummary: routing.summary
      },
      svg: null,
      html: null,
      manifest: null,
      outputMode: null
    };
  }

  const compiled = compileGroundedBundle(bundle, { baseDir });
  if (!compiled.result.valid || compiled.result.transition !== 'PASS') {
    return {
      ...compiled,
      manifest: null,
      result: {
        ...compiled.result,
        worthinessSummary: worthiness.summary,
        intakeSummary: intake.summary,
        routingSummary: routing.summary
      }
    };
  }

  const provenance = buildCanonicalProvenance({
    worthinessAssessment,
    decisionBrief,
    routingManifest,
    bundle,
    mode: bundle.decisionState.mode
  });
  const html = injectHtmlProvenance(compiled.html, provenance);
  const svg = injectSvgProvenance(compiled.svg, provenance);
  const manifest = finalizeOutputManifest(provenance, html, svg);

  return {
    ...compiled,
    html,
    svg,
    manifest,
    result: {
      ...compiled.result,
      worthinessSummary: worthiness.summary,
      intakeSummary: intake.summary,
      routingSummary: routing.summary
    }
  };
}

if (process.argv[1] === currentFile) {
  const worthinessPath = process.argv[2];
  const decisionBriefPath = process.argv[3];
  const routingPath = process.argv[4];
  const bundlePath = process.argv[5];
  const outputDir = process.argv[6] ?? path.dirname(bundlePath ?? '.');

  if (!worthinessPath || !decisionBriefPath || !routingPath || !bundlePath) {
    process.stderr.write(`${JSON.stringify({
      valid: false,
      stage: 'intake',
      transition: 'FIX_DECISION_BRIEF',
      errors: [{
        code: 'DECISION_PIPELINE_INPUT_INVALID',
        path: '',
        message: 'Usage: node compile-dashboard.js <worthiness-assessment.json> <decision-brief.json> <routing-manifest.json> <grounded-bundle.json> [output-dir]'
      }]
    })}\n`);
    process.exit(2);
  }

  const absoluteWorthiness = path.resolve(worthinessPath);
  const absoluteDecisionBrief = path.resolve(decisionBriefPath);
  const absoluteRouting = path.resolve(routingPath);
  const absoluteBundle = path.resolve(bundlePath);
  const worthinessAssessment = JSON.parse(fs.readFileSync(absoluteWorthiness, 'utf8'));
  const decisionBrief = JSON.parse(fs.readFileSync(absoluteDecisionBrief, 'utf8'));
  const routingManifest = JSON.parse(fs.readFileSync(absoluteRouting, 'utf8'));
  const bundle = JSON.parse(fs.readFileSync(absoluteBundle, 'utf8'));
  const compiled = compileDecisionDashboard(
    worthinessAssessment,
    decisionBrief,
    routingManifest,
    bundle,
    { baseDir: path.dirname(absoluteBundle) }
  );

  if (!compiled.result.valid || compiled.result.transition !== 'PASS') {
    process.stderr.write(`${JSON.stringify(compiled.result)}\n`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const svgOutput = path.join(outputDir, `output.${compiled.outputMode}.svg`);
  const htmlOutput = path.join(outputDir, `output.${compiled.outputMode}.html`);
  const manifestOutput = path.join(outputDir, 'output.manifest.json');
  fs.writeFileSync(svgOutput, compiled.svg);
  fs.writeFileSync(htmlOutput, compiled.html);
  fs.writeFileSync(manifestOutput, `${JSON.stringify(compiled.manifest, null, 2)}\n`);
  process.stdout.write(`${svgOutput}\n${htmlOutput}\n${manifestOutput}\n`);
}
