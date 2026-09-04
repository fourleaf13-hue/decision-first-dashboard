const CONTRACT_VERSION = '3.1';
const GRID_COLUMNS = 12;

const FIXED_SLOTS = Object.freeze([
  Object.freeze({ id: 'context', x: 0, y: 0, w: 3, h: 12 }),
  Object.freeze({ id: 'decision', x: 3, y: 0, w: 6, h: 12 }),
  Object.freeze({ id: 'evidence', x: 9, y: 0, w: 3, h: 12 })
]);

function plannerError(code, path, message) {
  return { code, path, message };
}

function decodePointerSegment(segment) {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

export function resolveDecisionPath(root, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    return { found: false, value: undefined };
  }

  const segments = pointer.slice(1).split('/').map(decodePointerSegment);
  let current = root;

  for (const segment of segments) {
    if (current === null || current === undefined || !Object.hasOwn(Object(current), segment)) {
      return { found: false, value: undefined };
    }
    current = current[segment];
  }

  return { found: true, value: current };
}

function validateIntentShape(intent, errors) {
  if (intent === null || typeof intent !== 'object' || Array.isArray(intent)) {
    errors.push(plannerError('INTENT_INVALID', '/intent', 'intent must be an object'));
    return;
  }

  const requiredStrings = ['audience', 'purpose', 'primaryDecision'];
  for (const field of requiredStrings) {
    if (typeof intent[field] !== 'string' || intent[field].trim().length === 0) {
      errors.push(plannerError('INTENT_FIELD_REQUIRED', `/intent/${field}`, `${field} must be a non-empty string`));
    }
  }

  if (!['executive', 'operational', 'diagnostic'].includes(intent.audienceType)) {
    errors.push(plannerError('AUDIENCE_TYPE_INVALID', '/intent/audienceType', 'audienceType must be executive, operational, or diagnostic'));
  } else if (intent.audienceType !== 'executive') {
    errors.push(plannerError(
      'AUDIENCE_RENDERER_UNSUPPORTED',
      '/intent/audienceType',
      `the current deterministic renderer supports executive dashboards only; ${intent.audienceType} requires a dedicated renderer`
    ));
  }

  if (!['realtime', 'hourly', 'daily', 'weekly', 'monthly'].includes(intent.refreshCadence)) {
    errors.push(plannerError('REFRESH_CADENCE_INVALID', '/intent/refreshCadence', 'refreshCadence is not supported'));
  }

  if (!Array.isArray(intent.requirements) || intent.requirements.length === 0) {
    errors.push(plannerError('REQUIREMENTS_REQUIRED', '/intent/requirements', 'at least one requested output is required'));
  }
}

function validateRequirements(intent, decisionState, errors) {
  if (!Array.isArray(intent?.requirements)) return;

  const seenIds = new Set();

  for (const [index, requirement] of intent.requirements.entries()) {
    const basePath = `/intent/requirements/${index}`;
    if (requirement === null || typeof requirement !== 'object' || Array.isArray(requirement)) {
      errors.push(plannerError('REQUIREMENT_INVALID', basePath, 'requirement must be an object'));
      continue;
    }

    if (typeof requirement.id !== 'string' || !requirement.id.startsWith('req_')) {
      errors.push(plannerError('REQUIREMENT_ID_INVALID', `${basePath}/id`, 'requirement id must start with req_'));
    } else if (seenIds.has(requirement.id)) {
      errors.push(plannerError('DUPLICATE_REQUIREMENT_ID', `${basePath}/id`, `duplicate requirement id: ${requirement.id}`));
    } else {
      seenIds.add(requirement.id);
    }

    const resolution = requirement.resolution;
    if (resolution === null || typeof resolution !== 'object' || Array.isArray(resolution)) {
      errors.push(plannerError('RESOLUTION_REQUIRED', `${basePath}/resolution`, 'requirement must declare a resolution'));
      continue;
    }

    if (resolution.type === 'decision_path') {
      const resolved = resolveDecisionPath(decisionState, resolution.path);
      if (!resolved.found) {
        errors.push(plannerError(
          'DECISION_PATH_NOT_FOUND',
          `${basePath}/resolution/path`,
          `declared decision path does not exist: ${resolution.path}`
        ));
      }
      continue;
    }

    if (resolution.type === 'deferred') {
      for (const field of ['blockedBy', 'originalSpec', 'toUnblock']) {
        if (typeof resolution[field] !== 'string' || resolution[field].trim().length === 0) {
          errors.push(plannerError('DEFERRED_FIELD_REQUIRED', `${basePath}/resolution/${field}`, `${field} is required for deferred output`));
        }
      }
      continue;
    }

    errors.push(plannerError('RESOLUTION_TYPE_INVALID', `${basePath}/resolution/type`, 'resolution must be decision_path or deferred'));
  }
}

export function validateCompilerIntent(bundle) {
  const hasVersion = Object.hasOwn(bundle ?? {}, 'contractVersion');
  const hasIntent = Object.hasOwn(bundle ?? {}, 'intent');

  if (!hasVersion && !hasIntent) {
    return { enabled: false, valid: true, errors: [] };
  }

  const errors = [];

  if (!hasVersion) {
    errors.push(plannerError('CONTRACT_VERSION_REQUIRED', '/contractVersion', `intent requires contractVersion ${CONTRACT_VERSION}`));
  } else if (bundle.contractVersion !== CONTRACT_VERSION) {
    errors.push(plannerError('CONTRACT_VERSION_UNSUPPORTED', '/contractVersion', `only contractVersion ${CONTRACT_VERSION} is supported`));
  }

  if (!hasIntent) {
    errors.push(plannerError('INTENT_REQUIRED', '/intent', `contractVersion ${CONTRACT_VERSION} requires intent`));
  }

  if (errors.length === 0) {
    validateIntentShape(bundle.intent, errors);
    validateRequirements(bundle.intent, bundle.decisionState, errors);
  }

  return { enabled: true, valid: errors.length === 0, errors };
}

function rendererForMode(mode) {
  if (mode === 'composite') return { template: 'composite', outputMode: 'composite' };
  if (mode === 'no_score') return { template: 'no-score', outputMode: 'no-score' };
  return { template: 'unknown', outputMode: 'unknown' };
}

function planRequirement(requirement) {
  if (requirement.resolution.type === 'decision_path') {
    return {
      id: requirement.id,
      label: requirement.label,
      kind: requirement.kind,
      status: 'computed',
      decisionPath: requirement.resolution.path
    };
  }

  return {
    id: requirement.id,
    label: requirement.label,
    kind: requirement.kind,
    status: 'deferred',
    blockedBy: requirement.resolution.blockedBy,
    originalSpec: requirement.resolution.originalSpec,
    toUnblock: requirement.resolution.toUnblock
  };
}

function slotsOverlap(a, b) {
  return a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y;
}

export function validateRenderPlan(plan, decisionState) {
  const errors = [];

  if (plan?.schemaVersion !== 1) {
    errors.push(plannerError('PLAN_SCHEMA_VERSION_INVALID', '/schemaVersion', 'render plan schemaVersion must be 1'));
  }
  if (plan?.contractVersion !== CONTRACT_VERSION) {
    errors.push(plannerError('PLAN_CONTRACT_VERSION_INVALID', '/contractVersion', `render plan contractVersion must be ${CONTRACT_VERSION}`));
  }
  if (!['no_score', 'composite'].includes(plan?.mode)) {
    errors.push(plannerError('PLAN_MODE_INVALID', '/mode', 'render plan mode must be no_score or composite'));
  }

  const expectedRenderer = rendererForMode(decisionState?.mode);
  if (plan?.mode !== decisionState?.mode) {
    errors.push(plannerError('PLAN_MODE_MISMATCH', '/mode', 'render plan mode must match decision state mode'));
  }
  if (plan?.renderer?.template !== expectedRenderer.template || plan?.renderer?.outputMode !== expectedRenderer.outputMode) {
    errors.push(plannerError('RENDERER_MODE_MISMATCH', '/renderer', 'renderer template/outputMode must match decision state mode'));
  }

  const requirementIds = new Set();
  for (const [index, requirement] of (plan?.requirements ?? []).entries()) {
    const basePath = `/requirements/${index}`;
    if (requirementIds.has(requirement.id)) {
      errors.push(plannerError('DUPLICATE_REQUIREMENT_ID', `${basePath}/id`, `duplicate requirement id: ${requirement.id}`));
    }
    requirementIds.add(requirement.id);

    if (requirement.status === 'computed') {
      if (!resolveDecisionPath(decisionState, requirement.decisionPath).found) {
        errors.push(plannerError('DECISION_PATH_NOT_FOUND', `${basePath}/decisionPath`, `declared decision path does not exist: ${requirement.decisionPath}`));
      }
    } else if (requirement.status === 'deferred') {
      for (const field of ['blockedBy', 'originalSpec', 'toUnblock']) {
        if (typeof requirement[field] !== 'string' || requirement[field].trim().length === 0) {
          errors.push(plannerError('DEFERRED_FIELD_REQUIRED', `${basePath}/${field}`, `${field} is required for deferred output`));
        }
      }
    } else {
      errors.push(plannerError('REQUIREMENT_STATUS_INVALID', `${basePath}/status`, 'requirement status must be computed or deferred'));
    }
  }

  const layout = plan?.layout;
  if (layout?.strategy !== 'decision-first-fixed') {
    errors.push(plannerError('LAYOUT_STRATEGY_INVALID', '/layout/strategy', 'layout strategy must be decision-first-fixed'));
  }
  if (layout?.focalPoint !== 'center') {
    errors.push(plannerError('FOCAL_POINT_INVALID', '/layout/focalPoint', 'focal point must be center'));
  }
  if (layout?.gridColumns !== GRID_COLUMNS) {
    errors.push(plannerError('GRID_COLUMNS_INVALID', '/layout/gridColumns', `grid must contain ${GRID_COLUMNS} columns`));
  }

  const slots = layout?.slots ?? [];
  const slotIds = new Set();
  for (const [index, slot] of slots.entries()) {
    const basePath = `/layout/slots/${index}`;
    if (slotIds.has(slot.id)) {
      errors.push(plannerError('DUPLICATE_LAYOUT_SLOT', `${basePath}/id`, `duplicate layout slot: ${slot.id}`));
    }
    slotIds.add(slot.id);

    if (![slot.x, slot.y, slot.w, slot.h].every(Number.isInteger) || slot.w <= 0 || slot.h <= 0 || slot.x < 0 || slot.y < 0) {
      errors.push(plannerError('LAYOUT_SLOT_INVALID', basePath, 'layout coordinates must be non-negative integers with positive width/height'));
      continue;
    }
    if (slot.x + slot.w > GRID_COLUMNS) {
      errors.push(plannerError('LAYOUT_OUT_OF_BOUNDS', basePath, 'layout slot exceeds the 12-column grid'));
    }
  }

  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      if (slotsOverlap(slots[i], slots[j])) {
        errors.push(plannerError('LAYOUT_OVERLAP', '/layout/slots', `${slots[i].id} overlaps ${slots[j].id}`));
      }
    }
  }

  if (!slotIds.has('decision')) {
    errors.push(plannerError('DECISION_SLOT_REQUIRED', '/layout/slots', 'fixed layout must contain the decision slot'));
  }

  return { valid: errors.length === 0, errors };
}

export function buildRenderPlan(bundle) {
  const intentResult = validateCompilerIntent(bundle);
  if (!intentResult.enabled) {
    return { enabled: false, valid: true, errors: [], plan: null };
  }
  if (!intentResult.valid) {
    return { enabled: true, valid: false, errors: intentResult.errors, plan: null };
  }

  const plan = {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    mode: bundle.decisionState.mode,
    intent: {
      audience: bundle.intent.audience,
      audienceType: bundle.intent.audienceType,
      purpose: bundle.intent.purpose,
      primaryDecision: bundle.intent.primaryDecision,
      refreshCadence: bundle.intent.refreshCadence
    },
    requirements: bundle.intent.requirements.map(planRequirement),
    layout: {
      strategy: 'decision-first-fixed',
      focalPoint: 'center',
      gridColumns: GRID_COLUMNS,
      slots: FIXED_SLOTS.map((slot) => ({ ...slot }))
    },
    renderer: rendererForMode(bundle.decisionState.mode)
  };

  const validation = validateRenderPlan(plan, bundle.decisionState);
  if (!validation.valid) {
    return { enabled: true, valid: false, errors: validation.errors, plan: null };
  }

  return { enabled: true, valid: true, errors: [], plan };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function serializeRenderPlan(plan) {
  return `${JSON.stringify(canonicalize(plan), null, 2)}\n`;
}
