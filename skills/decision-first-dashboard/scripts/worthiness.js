import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema } from './validate.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const schema = JSON.parse(fs.readFileSync(path.resolve(currentDir, '../schemas/worthiness-assessment.schema.json'), 'utf8'));

function add(errors, code, path, message) {
  errors.push({ code, path, message });
}

function summaryOf(assessment) {
  return {
    purpose: assessment.purpose,
    decisionLoopStatus: assessment.decisionLoop.status,
    accountabilityStatus: assessment.accountability.status,
    accountabilityMode: assessment.accountability.mode,
    responseChangeStatus: assessment.responseChange.status,
    responseChangeKind: assessment.responseChange.kind,
    userOverride: assessment.userOverride === true
  };
}

function validateSemantics(assessment) {
  const errors = [];
  const { accountability, responseChange, recommendedFormat, purpose } = assessment;
  const userOverride = assessment.userOverride === true;

  if (accountability.status === 'absent' && accountability.mode !== 'absent') {
    add(errors, 'ACCOUNTABILITY_STATUS_CONFLICT', '/accountability/mode', 'absent accountability must use mode "absent"');
  }
  if (accountability.status !== 'absent' && accountability.mode === 'absent') {
    add(errors, 'ACCOUNTABILITY_STATUS_CONFLICT', '/accountability/mode', 'present or inferred accountability cannot use mode "absent"');
  }
  if (responseChange.status === 'absent' && responseChange.kind !== 'none') {
    add(errors, 'RESPONSE_CHANGE_STATUS_CONFLICT', '/responseChange/kind', 'absent response change must use kind "none"');
  }
  if (responseChange.status !== 'absent' && responseChange.kind === 'none') {
    add(errors, 'RESPONSE_CHANGE_STATUS_CONFLICT', '/responseChange/kind', 'present or inferred response change cannot use kind "none"');
  }
  if (purpose === 'visibility_only' && responseChange.status === 'confirmed') {
    add(errors, 'VISIBILITY_PURPOSE_CONFLICT', '/purpose', 'visibility_only cannot simultaneously claim a confirmed action, priority, escalation, intervention, or coordination change');
  }

  if (userOverride) {
    if (recommendedFormat !== 'dashboard') {
      add(errors, 'FORMAT_TRANSITION_CONFLICT', '/recommendedFormat', 'an explicit user override must use recommendedFormat "dashboard"');
    }
    return errors;
  }

  const explicitRedirect = purpose === 'visibility_only' || purpose === 'one_off_question';
  const needsQuestion = !explicitRedirect && (
    purpose === 'unclear' ||
    assessment.decisionLoop.status === 'inferred' ||
    accountability.status === 'inferred' ||
    responseChange.status === 'inferred' ||
    accountability.mode === 'unclear' ||
    responseChange.kind === 'unclear'
  );
  const qualifies = !explicitRedirect && !needsQuestion &&
    assessment.decisionLoop.status === 'confirmed' &&
    accountability.status === 'confirmed' &&
    responseChange.status === 'confirmed';

  if (qualifies && recommendedFormat !== 'dashboard') {
    add(errors, 'FORMAT_TRANSITION_CONFLICT', '/recommendedFormat', 'a confirmed dashboard-worthy assessment must recommend "dashboard"');
  }
  if (needsQuestion && recommendedFormat !== 'undetermined') {
    add(errors, 'FORMAT_TRANSITION_CONFLICT', '/recommendedFormat', 'an unresolved assessment must use recommendedFormat "undetermined"');
  }
  if (!qualifies && !needsQuestion && ['dashboard', 'undetermined'].includes(recommendedFormat)) {
    add(errors, 'FORMAT_TRANSITION_CONFLICT', '/recommendedFormat', 'a non-dashboard redirect must recommend a concrete non-dashboard format');
  }

  return errors;
}

export function evaluateWorthinessAssessment(assessment) {
  const schemaResult = validateAgainstSchema(assessment, schema);
  if (!schemaResult.valid) {
    return {
      valid: false,
      stage: 'worthiness',
      transition: 'FIX_WORTHINESS_ASSESSMENT',
      errors: schemaResult.errors.map((error) => ({
        code: 'WORTHINESS_SCHEMA_INVALID',
        path: error.instancePath,
        message: `${error.keyword}: ${error.message}`
      })),
      recommendedFormat: null,
      summary: null
    };
  }

  const semanticErrors = validateSemantics(assessment);
  if (semanticErrors.length > 0) {
    return {
      valid: false,
      stage: 'worthiness',
      transition: 'FIX_WORTHINESS_ASSESSMENT',
      errors: semanticErrors,
      recommendedFormat: null,
      summary: summaryOf(assessment)
    };
  }

  if (assessment.userOverride === true) {
    return {
      valid: true,
      stage: 'worthiness',
      transition: 'BUILD_DECISION_BRIEF',
      errors: [],
      recommendedFormat: 'dashboard',
      summary: summaryOf(assessment)
    };
  }

  const explicitRedirect = assessment.purpose === 'visibility_only' || assessment.purpose === 'one_off_question';
  if (explicitRedirect) {
    return {
      valid: true,
      stage: 'worthiness',
      transition: 'REDIRECT_NON_DASHBOARD',
      errors: [],
      recommendedFormat: assessment.recommendedFormat,
      summary: summaryOf(assessment)
    };
  }

  const needsQuestion = assessment.purpose === 'unclear' ||
    assessment.decisionLoop.status === 'inferred' ||
    assessment.accountability.status === 'inferred' ||
    assessment.responseChange.status === 'inferred' ||
    assessment.accountability.mode === 'unclear' ||
    assessment.responseChange.kind === 'unclear';

  if (needsQuestion) {
    return {
      valid: true,
      stage: 'worthiness',
      transition: 'ASK_WORTHINESS_QUESTION',
      errors: [],
      recommendedFormat: 'undetermined',
      summary: summaryOf(assessment)
    };
  }

  const qualifies = assessment.decisionLoop.status === 'confirmed' &&
    assessment.accountability.status === 'confirmed' &&
    assessment.responseChange.status === 'confirmed';

  if (!qualifies) {
    return {
      valid: true,
      stage: 'worthiness',
      transition: 'REDIRECT_NON_DASHBOARD',
      errors: [],
      recommendedFormat: assessment.recommendedFormat,
      summary: summaryOf(assessment)
    };
  }

  return {
    valid: true,
    stage: 'worthiness',
    transition: 'BUILD_DECISION_BRIEF',
    errors: [],
    recommendedFormat: 'dashboard',
    summary: summaryOf(assessment)
  };
}

if (process.argv[1] === currentFile) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    process.stderr.write(`${JSON.stringify({
      valid: false,
      stage: 'worthiness',
      transition: 'FIX_WORTHINESS_ASSESSMENT',
      errors: [{ code: 'WORTHINESS_ASSESSMENT_INVALID', path: '', message: 'Usage: node worthiness.js <worthiness-assessment.json>' }]
    })}\n`);
    process.exit(2);
  }

  const assessment = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  const result = evaluateWorthinessAssessment(assessment);
  const stream = result.valid ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(result)}\n`);
  process.exit(result.valid ? 0 : 1);
}
