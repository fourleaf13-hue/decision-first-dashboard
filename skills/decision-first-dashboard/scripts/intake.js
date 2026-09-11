import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema } from './validate.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const schema = JSON.parse(fs.readFileSync(path.resolve(currentDir, '../schemas/decision-brief.schema.json'), 'utf8'));

function add(errors, code, path, message) {
  errors.push({ code, path, message });
}

function semanticErrors(brief) {
  const errors = [];
  for (const slotName of ['decision', 'action', 'exception', 'diagnosis', 'audience', 'cadence']) {
    const slot = brief?.[slotName];
    if (!slot) continue;
    if (slot.status === 'confirmed' && typeof slot.value !== 'string') {
      add(errors, 'CONFIRMED_SLOT_VALUE_REQUIRED', `/${slotName}/value`, `confirmed ${slotName} requires an explicit value`);
    }
    if (slot.status === 'absent' && Object.hasOwn(slot, 'value')) {
      add(errors, 'ABSENT_SLOT_VALUE_CONFLICT', `/${slotName}/value`, `absent ${slotName} must not carry a value`);
    }
  }
  return errors;
}

function summaryOf(brief) {
  const summary = {};
  for (const slotName of ['decision', 'action', 'exception', 'diagnosis', 'audience', 'cadence']) {
    if (brief?.[slotName]) summary[`${slotName}Status`] = brief[slotName].status;
  }
  return summary;
}

export function evaluateDecisionBrief(brief) {
  const schemaResult = validateAgainstSchema(brief, schema);
  if (!schemaResult.valid) {
    return {
      valid: false,
      stage: 'intake',
      transition: 'FIX_DECISION_BRIEF',
      errors: schemaResult.errors.map((error) => ({
        code: 'DECISION_BRIEF_SCHEMA_INVALID',
        path: error.instancePath,
        message: `${error.keyword}: ${error.message}`
      })),
      missingSlots: [],
      summary: null
    };
  }

  const errors = semanticErrors(brief);
  if (errors.length > 0) {
    return {
      valid: false,
      stage: 'intake',
      transition: 'FIX_DECISION_BRIEF',
      errors,
      missingSlots: [],
      summary: summaryOf(brief)
    };
  }

  const missingSlots = ['decision', 'action'].filter((slotName) => brief[slotName].status !== 'confirmed');
  if (missingSlots.length > 0) {
    return {
      valid: true,
      stage: 'intake',
      transition: 'ASK_DECISION_BRIEF_QUESTION',
      errors: [],
      missingSlots,
      summary: summaryOf(brief)
    };
  }

  return {
    valid: true,
    stage: 'intake',
    transition: 'ALLOW_ROUTING',
    errors: [],
    missingSlots: [],
    summary: summaryOf(brief)
  };
}

if (process.argv[1] === currentFile) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    process.stderr.write(`${JSON.stringify({
      valid: false,
      stage: 'intake',
      transition: 'FIX_DECISION_BRIEF',
      errors: [{ code: 'DECISION_BRIEF_INVALID', path: '', message: 'Usage: node intake.js <decision-brief.json>' }]
    })}\n`);
    process.exit(2);
  }

  const brief = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  const result = evaluateDecisionBrief(brief);
  const stream = result.valid ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(result)}\n`);
  process.exit(result.valid ? 0 : 1);
}
