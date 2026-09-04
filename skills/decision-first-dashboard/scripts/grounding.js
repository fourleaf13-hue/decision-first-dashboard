import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema, validateDecisionState } from './validate.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const groundingSchema = JSON.parse(fs.readFileSync(path.resolve(currentDir, '../schemas/grounded-bundle.schema.json'), 'utf8'));

function pushError(errors, code, pathValue, message, evidenceRef = undefined) {
  const error = { code, path: pathValue, message };
  if (evidenceRef) error.evidenceRef = evidenceRef;
  errors.push(error);
}

function baseDirPath(baseDir) {
  if (baseDir instanceof URL) return fileURLToPath(baseDir);
  return path.resolve(String(baseDir));
}

function decodePointerPart(part) {
  return part.replaceAll('~1', '/').replaceAll('~0', '~');
}

function resolvePointer(root, pointer) {
  if (pointer === '') return { found: true, value: root };
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    return { found: false, value: undefined };
  }

  let node = root;
  for (const rawPart of pointer.slice(1).split('/')) {
    const key = decodePointerPart(rawPart);
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, key)) {
      return { found: false, value: undefined };
    }
    node = node[key];
  }
  return { found: true, value: node };
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function parseNumericText(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replaceAll(',', '');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function groundedValuesEqual(decisionValue, sourceValue, decisionPath) {
  if (typeof decisionValue === 'string' && typeof sourceValue === 'string') {
    if (decisionValue.trim() === sourceValue.trim()) return true;
  }
  if (typeof decisionValue === 'number' && typeof sourceValue === 'number') {
    return Object.is(decisionValue, sourceValue) || Math.abs(decisionValue - sourceValue) <= 1e-9;
  }

  if (decisionPath.endsWith('/weight') && typeof decisionValue === 'number' && typeof sourceValue === 'string') {
    const trimmed = sourceValue.trim();
    if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%$/.test(trimmed)) {
      return Math.abs(decisionValue - Number(trimmed.slice(0, -1)) / 100) <= 1e-9;
    }
  }

  if (typeof decisionValue === 'number' && typeof sourceValue === 'string') {
    const numeric = parseNumericText(sourceValue);
    return numeric !== null && Math.abs(decisionValue - numeric) <= 1e-9;
  }
  if (typeof decisionValue === 'string' && typeof sourceValue === 'number') {
    const numeric = parseNumericText(decisionValue);
    return numeric !== null && Math.abs(numeric - sourceValue) <= 1e-9;
  }

  return false;
}

function visibleObjectPaths(prefix, item, fields) {
  return fields.filter((field) => Object.hasOwn(item, field)).map((field) => `${prefix}/${field}`);
}

function requiredCompositePaths(data) {
  const paths = [
    '/score/label', '/score/value', '/score/min', '/score/max', '/score/band',
    '/model/normalization', '/model/aggregation'
  ];

  data.model.components.forEach((component, index) => {
    for (const field of ['label', 'value', 'normalizedScore', 'weight']) {
      paths.push(`/model/components/${index}/${field}`);
    }
  });

  data.model.bands.forEach((band, index) => {
    for (const field of ['label', 'min', 'max']) {
      paths.push(`/model/bands/${index}/${field}`);
    }
  });

  data.context?.scoreSeries?.forEach((_, index) => paths.push(`/context/scoreSeries/${index}`));
  data.exceptions?.forEach((item, index) => paths.push(...visibleObjectPaths(`/exceptions/${index}`, item, ['name', 'plan', 'mrr', 'status'])));
  data.events?.forEach((item, index) => paths.push(...visibleObjectPaths(`/events/${index}`, item, ['subject', 'event', 'detail', 'time'])));
  return paths;
}

function requiredNoScorePaths(data) {
  const paths = [];
  data.signals.forEach((signal, index) => {
    for (const field of ['label', 'value', 'delta', 'direction']) {
      if (Object.hasOwn(signal, field)) paths.push(`/signals/${index}/${field}`);
    }
  });
  data.context?.revenueSeries?.forEach((_, index) => paths.push(`/context/revenueSeries/${index}`));
  data.exceptions?.forEach((item, index) => paths.push(...visibleObjectPaths(`/exceptions/${index}`, item, ['name', 'plan', 'mrr', 'status'])));
  data.events?.forEach((item, index) => paths.push(...visibleObjectPaths(`/events/${index}`, item, ['subject', 'event', 'detail', 'time'])));
  return paths;
}

function transitionForMode(mode) {
  return mode === 'composite' ? 'FALLBACK_TO_NO_SCORE' : 'RETURN_TO_EVIDENCE_EXTRACTION';
}

function fail(mode, stage, errors) {
  return { valid: false, stage, transition: transitionForMode(mode), errors };
}

function readSource(bundle, baseDir, errors) {
  const source = bundle?.source;
  if (!source || !['json', 'text'].includes(source.kind) || typeof source.path !== 'string' || typeof source.sha256 !== 'string') {
    pushError(errors, 'SOURCE_ANCHOR_NOT_FOUND', '/source', 'source must declare kind, path, and sha256');
    return null;
  }

  const sourcePath = path.resolve(baseDirPath(baseDir), source.path);
  if (!fs.existsSync(sourcePath)) {
    pushError(errors, 'SOURCE_FILE_NOT_FOUND', '/source/path', 'grounding source file does not exist');
    return null;
  }

  const bytes = fs.readFileSync(sourcePath);
  if (sha256(bytes) !== source.sha256) {
    pushError(errors, 'SOURCE_HASH_MISMATCH', '/source/sha256', 'grounding source hash does not match source bytes');
    return null;
  }

  const text = bytes.toString('utf8');
  if (source.kind === 'text') return { kind: 'text', text };

  try {
    return { kind: 'json', value: JSON.parse(text) };
  } catch {
    pushError(errors, 'SOURCE_ANCHOR_NOT_FOUND', '/source/path', 'JSON grounding source is not valid JSON');
    return null;
  }
}

function anchorValue(source, evidence, decisionPath, errors) {
  const anchor = evidence?.anchor;
  if (!anchor || typeof anchor.type !== 'string') {
    pushError(errors, 'SOURCE_ANCHOR_NOT_FOUND', decisionPath, 'evidence anchor is missing or invalid', evidence?.id);
    return { found: false };
  }

  if (anchor.type === 'json_pointer' && source.kind === 'json') {
    const resolved = resolvePointer(source.value, anchor.pointer);
    if (!resolved.found) {
      pushError(errors, 'SOURCE_ANCHOR_NOT_FOUND', decisionPath, 'JSON pointer did not resolve in source', evidence.id);
      return { found: false };
    }
    return resolved;
  }

  if (anchor.type === 'text_span' && source.kind === 'text') {
    if (typeof anchor.literal !== 'string' || typeof anchor.valueText !== 'string' || !source.text.includes(anchor.literal) || !anchor.literal.includes(anchor.valueText)) {
      pushError(errors, 'SOURCE_ANCHOR_NOT_FOUND', decisionPath, 'exact text span/valueText was not found in source', evidence.id);
      return { found: false };
    }
    return { found: true, value: anchor.valueText };
  }

  pushError(errors, 'SOURCE_ANCHOR_NOT_FOUND', decisionPath, 'evidence anchor type does not match source kind', evidence.id);
  return { found: false };
}

export function validateGroundedBundle(bundle, { baseDir = process.cwd() } = {}) {
  const bundleResult = validateAgainstSchema(bundle, groundingSchema);
  if (!bundleResult.valid) {
    const mode = bundle?.decisionState?.mode;
    return {
      valid: false,
      stage: 'grounding',
      transition: transitionForMode(mode),
      errors: bundleResult.errors.map((error) => ({
        code: 'GROUNDING_BUNDLE_INVALID',
        path: error.instancePath,
        message: `${error.keyword}: ${error.message}`
      }))
    };
  }

  const decisionState = bundle.decisionState;
  const stateResult = validateDecisionState(decisionState);
  if (!stateResult.valid) {
    return {
      valid: false,
      stage: 'decision_state',
      transition: 'FIX_DECISION_STATE',
      errors: stateResult.errors.map((error) => ({
        code: 'DECISION_STATE_INVALID',
        path: error.instancePath,
        message: `${error.keyword}: ${error.message}`
      }))
    };
  }

  const mode = decisionState.mode;
  const errors = [];
  const source = readSource(bundle, baseDir, errors);
  if (!source) return fail(mode, 'grounding', errors);

  const evidenceById = new Map();
  for (const evidence of bundle.evidence) {
    if (evidenceById.has(evidence.id)) {
      pushError(errors, 'EVIDENCE_REF_NOT_FOUND', '/evidence', 'evidence ids must be unique');
      continue;
    }
    evidenceById.set(evidence.id, evidence);
  }

  const claimsByPath = new Map();
  for (const claim of bundle.claims) {
    if (!claimsByPath.has(claim.decisionPath)) claimsByPath.set(claim.decisionPath, claim);
  }

  const requiredPaths = mode === 'composite' ? requiredCompositePaths(decisionState) : requiredNoScorePaths(decisionState);
  for (const requiredPath of requiredPaths) {
    if (!claimsByPath.has(requiredPath)) {
      pushError(errors, 'MISSING_REQUIRED_GROUNDING', requiredPath, 'required source fact has no evidence claim');
    }
  }

  for (const claim of bundle.claims) {
    const decision = resolvePointer(decisionState, claim.decisionPath);
    if (!decision.found) {
      pushError(errors, 'DECISION_PATH_NOT_FOUND', claim.decisionPath, 'decisionPath does not resolve in decision state', claim.evidenceRef);
      continue;
    }

    const evidence = evidenceById.get(claim.evidenceRef);
    if (!evidence) {
      pushError(errors, 'EVIDENCE_REF_NOT_FOUND', claim.decisionPath, 'claim references an evidence id that does not exist', claim.evidenceRef);
      continue;
    }

    const anchored = anchorValue(source, evidence, claim.decisionPath, errors);
    if (!anchored.found) continue;
    if (!groundedValuesEqual(decision.value, anchored.value, claim.decisionPath)) {
      pushError(errors, 'SOURCE_VALUE_MISMATCH', claim.decisionPath, 'grounded source value does not match decision-state value', claim.evidenceRef);
    }
  }

  if (errors.length > 0) return fail(mode, 'grounding', errors);
  return { valid: true, stage: 'grounding', transition: 'PASS', errors: [] };
}
