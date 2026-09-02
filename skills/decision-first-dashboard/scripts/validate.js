import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const schemaPath = path.resolve(currentDir, '../schemas/decision-state.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

export function validateDecisionState(data) {
  const valid = validate(data);
  return {
    valid: Boolean(valid),
    errors: validate.errors ? structuredClone(validate.errors) : []
  };
}

if (process.argv[1] === currentFile) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node validate.js <decision-state.json>');
    process.exit(2);
  }

  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const result = validateDecisionState(data);

  if (!result.valid) {
    console.error(JSON.stringify(result.errors, null, 2));
    process.exit(1);
  }

  console.log('valid');
}
