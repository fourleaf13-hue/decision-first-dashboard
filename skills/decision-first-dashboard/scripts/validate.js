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

  if (nodeSchema.oneOf) {
    let matches = 0;
    for (const branch of nodeSchema.oneOf) {
      const branchErrors = [];
      validateNode(value, branch, instancePath, branchErrors, rootSchema);
      if (branchErrors.length === 0) matches += 1;
    }
    if (matches !== 1) {
      pushError(errors, instancePath, 'oneOf', 'must match exactly one decision-state mode');
    }
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

function nearlyEqual(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

function validateCompositeSemantics(data, errors) {
  const { score, model } = data;

  if (!(score.min < score.max)) {
    pushError(errors, '/score', 'scoreScale', 'score min must be less than score max');
    return;
  }

  if (score.value < score.min || score.value > score.max) {
    pushError(errors, '/score/value', 'scoreScale', 'score value must lie within the declared score scale');
  }

  let weightSum = 0;
  let weightedScore = 0;
  for (const [index, component] of model.components.entries()) {
    if (!(component.weight > 0 && component.weight <= 1)) {
      pushError(errors, `/model/components/${index}/weight`, 'weight', 'component weight must be greater than 0 and no greater than 1');
    }
    if (component.normalizedScore < score.min || component.normalizedScore > score.max) {
      pushError(errors, `/model/components/${index}/normalizedScore`, 'scoreScale', 'normalized score must lie within the composite score scale');
    }
    weightSum += component.weight;
    weightedScore += component.normalizedScore * component.weight;
  }

  if (!nearlyEqual(weightSum, 1, 1e-6)) {
    pushError(errors, '/model/components', 'weightSum', 'component weights must sum to 1');
  }

  if (!nearlyEqual(weightedScore, score.value, 0.01)) {
    pushError(errors, '/score/value', 'weightedAverage', 'score value must equal the weighted average of normalized component scores');
  }

  const bands = model.bands;
  if (!nearlyEqual(bands[0].min, score.min, 1e-9)) {
    pushError(errors, '/model/bands/0/min', 'bandCoverage', 'first band must begin at the score minimum');
  }

  for (const [index, band] of bands.entries()) {
    if (!(band.min < band.max)) {
      pushError(errors, `/model/bands/${index}`, 'bandRange', 'band min must be less than band max');
    }
    if (band.min < score.min || band.max > score.max) {
      pushError(errors, `/model/bands/${index}`, 'bandCoverage', 'band must remain within the score scale');
    }
    if (index > 0 && !nearlyEqual(bands[index - 1].max, band.min, 1e-9)) {
      pushError(errors, `/model/bands/${index}/min`, 'bandContinuity', 'score bands must be contiguous and non-overlapping');
    }
  }

  if (!nearlyEqual(bands[bands.length - 1].max, score.max, 1e-9)) {
    pushError(errors, `/model/bands/${bands.length - 1}/max`, 'bandCoverage', 'last band must end at the score maximum');
  }

  const selectedBand = bands.find((band, index) => {
    const isLast = index === bands.length - 1;
    return score.value >= band.min && (isLast ? score.value <= band.max : score.value < band.max);
  });

  if (!selectedBand) {
    pushError(errors, '/score/band', 'bandSelection', 'score value must map to exactly one declared band');
  } else if (selectedBand.label !== score.band) {
    pushError(errors, '/score/band', 'bandSelection', 'score band must match the threshold band selected by the score value');
  }
}

export function validateDecisionState(data) {
  const errors = [];
  validateNode(data, schema, '', errors, schema);

  if (errors.length === 0 && data.mode === 'composite') {
    validateCompositeSemantics(data, errors);
  }

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
