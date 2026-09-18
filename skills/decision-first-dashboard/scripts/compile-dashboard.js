import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGroundedBundle } from './compile.js';
import { validateMetricRouting } from './routing.js';
import {
  buildDeliveredClaims,
  composeAdaptiveComposition,
  coverageFor,
  semanticItemsForPresentation,
  semanticStructureFor,
  verifyDeliveredArtifact
} from './composition.js';
import { evaluateWorthinessAssessment } from './worthiness.js';
import { evaluateDecisionBrief } from './intake.js';
import {
  buildCanonicalProvenance,
  finalizeOutputManifest,
  injectHtmlProvenance,
  injectSvgProvenance
} from './provenance.js';
import { buildInternalVisualSpecs } from './visual-grammar.js';

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

  const intake = evaluateDecisionBrief(decisionBrief, {
    worthinessQuestionCount: worthiness.summary?.questionCount ?? 0
  });
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

  const routing = validateMetricRouting(routingManifest, bundle?.decisionState, {
    metricWorthiness: worthinessAssessment.metricWorthiness,
    existingQuestionCount: intake.summary?.questionCount ?? 0
  });
  if (!routing.valid) {
    return {
      result: {
        valid: false,
        stage: routing.stage ?? 'routing',
        transition: routing.transition ?? 'FIX_METRIC_ROUTING',
        errors: routing.errors,
        worthinessSummary: worthiness.summary,
        intakeSummary: intake.summary,
        routingSummary: routing.summary,
        metricWorthiness: routing.metricWorthiness ?? null
      },
      svg: null,
      html: null,
      manifest: null,
      outputMode: null
    };
  }

  const effectiveBundle = routing.decisionState && routing.decisionState !== bundle.decisionState
    ? { ...bundle, decisionState: routing.decisionState }
    : bundle;
  const effectiveRoutingManifest = routing.manifest ?? routingManifest;
  const compositionModifiers = {
    audience: decisionBrief.audience?.value ?? null,
    cadence: decisionBrief.cadence?.value ?? null,
    density: effectiveRoutingManifest.compositionModifiers?.density ?? 'full',
    activeModifierIds: [
      ...(effectiveRoutingManifest.compositionModifiers?.activeModifierIds ?? []),
      ...(effectiveRoutingManifest.compositionModifiers?.density === 'compact' ? ['density_compact'] : [])
    ]
  };
  const composition = composeAdaptiveComposition({
    contextRequirements: decisionBrief.contextRequirements ?? [],
    nodes: effectiveRoutingManifest.compositionNodes ?? [],
    decisionLog: effectiveRoutingManifest.decisionLog ?? [],
    modifiers: compositionModifiers
  });
  if (!composition.valid) {
    return {
      result: {
        valid: false,
        stage: 'composition',
        transition: 'CONTEXT_PRESERVATION_FAILED',
        errors: composition.errors,
        worthinessSummary: worthiness.summary,
        intakeSummary: intake.summary,
        routingSummary: routing.summary,
        coverageManifest: composition.coverageManifest,
        metricWorthiness: routing.metricWorthiness ?? null
      },
      svg: null,
      html: null,
      manifest: null,
      outputMode: null
    };
  }

  const hasSemanticState = Array.isArray(effectiveBundle.decisionState?.semanticNodes) && effectiveBundle.decisionState.semanticNodes.length > 0;
  const visualGrammar = hasSemanticState
    ? buildInternalVisualSpecs(
      effectiveBundle.decisionState,
      composition.composition,
      {
        contextRequirements: decisionBrief.contextRequirements ?? [],
        modifiers: composition.composition.modifiers,
        decisionLog: composition.composition.decisionLog
      }
    )
    : { valid: true, specs: [], errors: [] };
  if (!visualGrammar.valid) {
    return {
      result: {
        valid: false,
        stage: 'composition',
        transition: 'DELIVERY_CONTRACT_FAILED',
        errors: visualGrammar.errors,
        worthinessSummary: worthiness.summary,
        intakeSummary: intake.summary,
        routingSummary: routing.summary,
        coverageManifest: composition.coverageManifest,
        visualSpecs: visualGrammar.specs
      },
      svg: null,
      html: null,
      manifest: null,
      outputMode: null
    };
  }

  const deliveredClaims = buildDeliveredClaims(effectiveBundle);
  const compiled = compileGroundedBundle(effectiveBundle, {
    baseDir,
    composition: composition.composition,
    claims: deliveredClaims,
    requireSemantic: true,
    visualSpecs: visualGrammar.specs,
    contextRequirements: decisionBrief.contextRequirements ?? [],
    modifiers: composition.composition.modifiers,
    decisionLog: composition.composition.decisionLog
  });
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
    routingManifest: effectiveRoutingManifest,
    bundle: effectiveBundle,
    mode: effectiveBundle.decisionState.mode
  });
  const html = injectHtmlProvenance(compiled.html, provenance);
  const svg = injectSvgProvenance(compiled.svg, provenance);
  const sourceNodes = new Map((effectiveBundle.decisionState.semanticNodes ?? []).map((node) => [node.id, node]));
  const visualSpecs = new Map(visualGrammar.specs.map((spec) => [spec.nodeId, spec]));
  const deliveredManifest = {
    nodes: composition.composition.nodes.map((node) => {
      const sourceNode = sourceNodes.get(node.id);
      const renderedItems = semanticItemsForPresentation(sourceNode, node);
      return {
        id: node.id,
        type: node.type,
        presentation: node.presentation,
        ...(node.metric ? { metric: node.metric } : {}),
        ...(node.metricRole ? { metricRole: node.metricRole } : {}),
        ...(node.metricPriority ? { metricPriority: node.metricPriority } : {}),
        coverage: coverageFor(node),
        ...(sourceNode ? { expectedItemCount: renderedItems.length } : {}),
        ...(semanticStructureFor(node) ? { structure: semanticStructureFor(node) } : {}),
        visualSpec: visualSpecs.get(node.id)
      };
    }),
    claims: deliveredClaims,
    evidence: effectiveBundle.evidence,
    coverage: composition.coverageManifest,
    decisionLog: composition.composition.decisionLog,
    modifiers: composition.composition.modifiers
  };
  const manifestPayload = {
    ...finalizeOutputManifest(provenance, html, svg),
    delivery: deliveredManifest
  };
  const delivery = verifyDeliveredArtifact({ html, svg, manifest: manifestPayload });
  if (!delivery.valid) {
    return {
      result: {
        valid: false,
        stage: 'delivery',
        transition: 'DELIVERY_CONTRACT_FAILED',
        errors: delivery.errors,
        worthinessSummary: worthiness.summary,
        intakeSummary: intake.summary,
        routingSummary: routing.summary,
        coverageManifest: composition.coverageManifest
      },
      svg: null,
      html: null,
      manifest: null,
      outputMode: null
    };
  }
  const manifest = { ...manifestPayload, verification: delivery.verification };

  return {
    ...compiled,
    html,
    svg,
    manifest,
    effectiveRoutingManifest,
    effectiveDecisionState: effectiveBundle.decisionState,
    result: {
      ...compiled.result,
      worthinessSummary: worthiness.summary,
      intakeSummary: intake.summary,
      routingSummary: routing.summary,
      metricWorthiness: routing.metricWorthiness ?? null
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
