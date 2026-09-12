import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);

function add(errors, code, message) {
  errors.push({ code, message });
}

export function evaluateRecordedAgentTurn(spec, response) {
  const errors = [];
  const expected = spec.expectedFirstTurn ?? {};
  const outputs = Array.isArray(response.outputs) ? response.outputs : [];
  const assumptions = Array.isArray(response.assumptions) ? response.assumptions : [];
  const askedSlots = Array.isArray(response.askedSlots) ? response.askedSlots : [];

  if (expected.artifactAllowed === false && (response.responseType === 'artifact' || outputs.length > 0)) {
    add(errors, 'AGENT_OUTPUT_BYPASSED_INTAKE', 'ambiguous first turn must ask for missing decision context before generating an artifact');
  }

  if (typeof expected.requiredQuestionCount === 'number' && response.questionCount !== expected.requiredQuestionCount) {
    add(errors, 'QUESTION_COUNT_MISMATCH', `expected ${expected.requiredQuestionCount} intake question, received ${response.questionCount ?? 0}`);
  }

  for (const slot of expected.requiredMissingSlots ?? []) {
    if (!askedSlots.includes(slot)) {
      add(errors, 'REQUIRED_INTAKE_SLOT_NOT_ASKED', `first-turn question must cover missing slot: ${slot}`);
    }
  }

  for (const assumption of expected.forbiddenAssumptions ?? []) {
    if (assumptions.includes(assumption)) {
      add(errors, 'UNCONFIRMED_ASSUMPTION', `agent assumed ${assumption} before confirmation`);
    }
  }

  for (const output of expected.forbiddenOutputs ?? []) {
    if (outputs.includes(output)) {
      add(errors, 'FORBIDDEN_OUTPUT', `first turn produced forbidden output: ${output}`);
    }
  }

  if (response.responseType === 'artifact' && response.canonicalProvenance !== true) {
    add(errors, 'CANONICAL_PROVENANCE_REQUIRED', 'final dashboard artifacts must come from the canonical compiler output path');
  }

  return {
    valid: errors.length === 0,
    stage: 'agent_e2e',
    transition: errors.length === 0 ? 'PASS' : 'FAIL_AGENT_E2E',
    errors
  };
}

if (process.argv[1] === currentFile) {
  const specPath = process.argv[2];
  const responsePath = process.argv[3];
  if (!specPath || !responsePath) {
    process.stderr.write(`${JSON.stringify({
      valid: false,
      stage: 'agent_e2e',
      transition: 'FAIL_AGENT_E2E',
      errors: [{ code: 'AGENT_EVAL_USAGE', message: 'Usage: node agent-eval.js <eval-spec.json> <recorded-response.json>' }]
    })}\n`);
    process.exit(2);
  }

  const spec = JSON.parse(fs.readFileSync(path.resolve(specPath), 'utf8'));
  const response = JSON.parse(fs.readFileSync(path.resolve(responsePath), 'utf8'));
  const result = evaluateRecordedAgentTurn(spec, response);
  const stream = result.valid ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(result)}\n`);
  process.exit(result.valid ? 0 : 1);
}
