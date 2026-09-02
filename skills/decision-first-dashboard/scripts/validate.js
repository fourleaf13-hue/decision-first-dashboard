import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const schemaPath = path.resolve(currentDir, '../schemas/decision-state.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

function resolveRef(rootSchema, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported schema ref: ${ref}`);
  return ref
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((node, key) => node?.[key], rootSchema);
}

function pushError(errors, instancePath, keyword, message) {
  errors.push({ instancePath, keyword, message });
}

function validateNode(value, nodeSchema, instancePath, errors, rootSchema) {
  if (nodeSchema.$ref) {
    const resolved = resolveRef(rootSchema, nodeSchema.$ref);
    if (!resolved) throw new Error(`Unresolved schema ref: ${nodeSchema.$ref}`);
    validateNode(value, resolved, instancePath, errors, rootSchema);
    return;
  }

  if (Object.hasOwn(nodeSchema, 'const') && value !== nodeSchema.const) {
    pushError(errors, instancePath, 'const', `must be equal to constant ${JSON.stringify(nodeSchema.const)}`);
    return;
  }

  if (nodeSchema.enum && !nodeSchema.enum.includes(value)) {
    pushError(errors, instancePath, 'enum', `must be one of: ${nodeSchema.enum.join(', ')}`);
    return;
  }

  if (nodeSchema.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      pushError(errors, instancePath, 'type', 'must be object');
      return;
    }

    for (const required of nodeSchema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        pushError(errors, instancePath, 'required', `must have required property '${required}'`);
      }
    }

    const properties = nodeSchema.properties ?? {};
    if (nodeSchema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) {
          pushError(errors, `${instancePath}/${key}`, 'additionalProperties', 'must NOT have additional properties');
        }
      }
    }

    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        validateNode(value[key], childSchema, `${instancePath}/${key}`, errors, rootSchema);
      }
    }
    return;
  }

  if (nodeSchema.type === 'array') {
    if (!Array.isArray(value)) {
      pushError(errors, instancePath, 'type', 'must be array');
      return;
    }
    if (nodeSchema.minItems !== undefined && value.length < nodeSchema.minItems) {
      pushError(errors, instancePath, 'minItems', `must NOT have fewer than ${nodeSchema.minItems} items`);
    }
    if (nodeSchema.maxItems !== undefined && value.length > nodeSchema.maxItems) {
      pushError(errors, instancePath, 'maxItems', `must NOT have more than ${nodeSchema.maxItems} items`);
    }
    if (nodeSchema.items) {
      value.forEach((item, index) => validateNode(item, nodeSchema.items, `${instancePath}/${index}`, errors, rootSchema));
    }
    return;
  }

  if (nodeSchema.type === 'string') {
    if (typeof value !== 'string') {
      pushError(errors, instancePath, 'type', 'must be string');
      return;
    }
    if (nodeSchema.minLength !== undefined && value.length < nodeSchema.minLength) {
      pushError(errors, instancePath, 'minLength', `must NOT have fewer than ${nodeSchema.minLength} characters`);
    }
    if (nodeSchema.maxLength !== undefined && value.length > nodeSchema.maxLength) {
      pushError(errors, instancePath, 'maxLength', `must NOT have more than ${nodeSchema.maxLength} characters`);
    }
    if (nodeSchema.pattern && !(new RegExp(nodeSchema.pattern)).test(value)) {
      pushError(errors, instancePath, 'pattern', `must match pattern ${nodeSchema.pattern}`);
    }
    return;
  }

  if (nodeSchema.type === 'number' || nodeSchema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (nodeSchema.type === 'integer' && !Number.isInteger(value))) {
      pushError(errors, instancePath, 'type', `must be ${nodeSchema.type}`);
      return;
    }
    if (nodeSchema.minimum !== undefined && value < nodeSchema.minimum) {
      pushError(errors, instancePath, 'minimum', `must be >= ${nodeSchema.minimum}`);
    }
    if (nodeSchema.maximum !== undefined && value > nodeSchema.maximum) {
      pushError(errors, instancePath, 'maximum', `must be <= ${nodeSchema.maximum}`);
    }
  }
}

export function validateDecisionState(data) {
  const errors = [];
  validateNode(data, schema, '', errors, schema);
  return { valid: errors.length === 0, errors };
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
