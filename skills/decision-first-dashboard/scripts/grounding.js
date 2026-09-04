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

function isPathInside(basePath, targetPath) {
  const relative = path.relative(basePath, targetPath);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
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

function pointerParent(pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return null;
  const index = pointer.lastIndexOf('/');
  return index === 0 ? '' : pointer.slice(0, index);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function textOccurrenceCount(text, literal) {
  let count = 0;
  let fromIndex = 0;
  while (true) {
    const index = text.indexOf(literal, fromIndex);
    if (index === -1) return count;
    count += 1;
    fromIndex = index + Math.max(literal.length, 1);
  }
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

  const requestedBase = baseDirPath(baseDir);
  let basePath;
  try {
    basePath = fs.realpathSync(requestedBase);
  } catch {
    pushError(errors, 'SOURCE_FILE_NOT_FOUND', '/source/path', 'grounding base directory does not exist');
    return null;
  }

  if (path.isAbsolute(source.path)) {
    pushError(errors, 'SOURCE_PATH_OUTSIDE_BASE', '/source/path', 'grounding source path must stay inside the bundle base directory');
    return null;
  }

  const requestedSourcePath = path.resolve(basePath, source.path);
  if (!isPathInside(basePath, requestedSourcePath)) {
    pushError(errors, 'SOURCE_PATH_OUTSIDE_BASE', '/source/path', 'grounding source path must stay inside the bundle base directory');
    return null;
  }

  if (!fs.existsSync(requestedSourcePath)) {
    pushError(errors, 'SOURCE_FILE_NOT_FOUND', '/source/path', 'grounding source file does not exist');
    return null;
  }

  let sourcePath;
  try {
    sourcePath = fs.realpathSync(requestedSourcePath);
  } catch {
    pushError(errors, 'SOURCE_FILE_NOT_FOUND', '/source/path', 'grounding source file does not exist');
    return null;
  }

  if (!isPathInside(basePath, sourcePath)) {
    pushError(errors, 'SOURCE_PATH_OUTSIDE_BASE', '/source/path', 'grounding source real path escapes the bundle base directory');
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
    if (typeof anchor.literal !== 'string' || typeof anchor.valueText !== 'string' || !anchor.literal.includes(anchor.valueText)) {
      pushError(errors, 'SOURCE_ANCHOR_NOT_FOUND', decisionPath, 'exact text span/valueText was not found in source', evidence.id);
      return { found: false };
    }

    const hasStart = Object.hasOwn(anchor, 'start');
    const hasEnd = Object.hasOwn(anchor, 'end');
    if (hasStart || hasEnd) {
      if (!hasStart || !hasEnd || !Number.isInteger(anchor.start) || !Number.isInteger(anchor.end) || anchor.start < 0 || anchor.end <= anchor.start) {
        pushError(errors, 'TEXT_SPAN_LOCATION_MISMATCH', decisionPath, 'text span start/end must be a valid exact range', evidence.id);
        return { found: false };
      }
      if (source.text.slice(anchor.start, anchor.end) !== anchor.literal) {
        pushError(errors, 'TEXT_SPAN_LOCATION_MISMATCH', decisionPath, 'text span start/end does not resolve to the declared literal', evidence.id);
        return { found: false };
      }
      return { found: true, value: anchor.valueText };
    }

    const occurrenceCount = textOccurrenceCount(source.text, anchor.literal);
    if (occurrenceCount === 0) {
      pushError(errors, 'SOURCE_ANCHOR_NOT_FOUND', decisionPath, 'exact text span/valueText was not found in source', evidence.id);
      return { found: false };
    }
    if (occurrenceCount > 1) {
      pushError(errors, 'AMBIGUOUS_TEXT_ANCHOR', decisionPath, 'text literal occurs more than once and requires an explicit location', evidence.id);
      return { found: false };
    }

    return { found: true, value: anchor.valueText };
  }

  pushError(errors, 'SOURCE_ANCHOR_NOT_FOUND', decisionPath, 'evidence anchor type does not match source kind', evidence.id);
  return { found: false };
}

function validateJsonGroupCoherence(claims, evidenceById, errors) {
  const sourceParentByDecisionParent = new Map();

  for (const claim of claims) {
    const evidence = evidenceById.get(claim.evidenceRef);
    if (evidence?.anchor?.type !== 'json_pointer') continue;

    const decisionParent = pointerParent(claim.decisionPath);
    const sourceParent = pointerParent(evidence.anchor.pointer);
    if (decisionParent === null || sourceParent === null) continue;

    const existing = sourceParentByDecisionParent.get(decisionParent);
    if (existing === undefined) {
      sourceParentByDecisionParent.set(decisionParent, sourceParent);
      continue;
    }

    if (existing !== sourceParent) {
      pushError(
        errors,
        'SOURCE_GROUP_MISMATCH',
        claim.decisionPath,
        'claims from the same decision object must resolve within the same source object',
        claim.evidenceRef
      );
    }
  }
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

  if (source.kind === 'json') {
    validateJsonGroupCoherence(bundle.claims, evidenceById, errors);
  }

  const claimsByPath = new Map();
  const decisionPathByEvidenceRef = new Map();
  for (const claim of bundle.claims) {
    if (claimsByPath.has(claim.decisionPath)) {
      pushError(
        errors,
        'DUPLICATE_CLAIM',
        claim.decisionPath,
        'each decision path may have only one grounding claim',
        claim.evidenceRef
      );
      continue;
    }
    claimsByPath.set(claim.decisionPath, claim);

    const existingPath = decisionPathByEvidenceRef.get(claim.evidenceRef);
    if (existingPath !== undefined && existingPath !== claim.decisionPath) {
      pushError(
        errors,
        'EVIDENCE_REF_REUSED',
        claim.decisionPath,
        `evidence is already assigned to ${existingPath}`,
        claim.evidenceRef
      );
      continue;
    }
    decisionPathByEvidenceRef.set(claim.evidenceRef, claim.decisionPath);
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