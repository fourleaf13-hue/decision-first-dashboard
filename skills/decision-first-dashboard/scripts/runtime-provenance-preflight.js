import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  BINDING_TYPES,
  detectRuntimeBinding,
  resolvePhysicalTarget
} from './bind-runtime-skill.js';

export const HASH_ALGORITHM = 'sha256';
export const DEFAULT_EXCLUDES = Object.freeze([]);
export const REQUIRED_RUNTIME_FILES = Object.freeze([
  'SKILL.md',
  'scripts/compile-dashboard.js',
  'scripts/composition.js',
  'scripts/render-semantic.js'
]);
export const REQUIRED_RUNTIME_INVARIANTS = Object.freeze([
  {
    relativePath: 'SKILL.md',
    substring: 'Agent invocation compliance — behaviorally guarded, not runtime-enforced',
    code: 'SKILL_INVOCATION_COMPLIANCE'
  },
  {
    relativePath: 'scripts/compile-dashboard.js',
    substring: 'requireSemantic: true',
    code: 'COMPILE_REQUIRES_SEMANTIC'
  }
]);

const currentFile = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(currentFile), '../../..');

const FAILURE_REPAIR_LAYERS = Object.freeze({
  REPO_HEAD_MISMATCH: 'repository-checkout',
  REPO_HEAD_UNAVAILABLE: 'repository-checkout',
  BINDING_MISSING: 'runtime-installation',
  BINDING_TYPE_UNSUPPORTED: 'runtime-installation',
  PHYSICAL_TARGET_MISMATCH: 'runtime-binding',
  CONTENT_MISMATCH_PRE: 'runtime-package-contents',
  REPO_DIRTY_PRE: 'repository-cleanliness',
  REQUIRED_FILES_MISSING: 'runtime-package-contents',
  REQUIRED_INVARIANT_MISSING: 'runtime-package-contents',
  RUN_NOT_PROVIDED: 'acceptance-invocation',
  RUN_FAILED: 'acceptance-invocation',
  REPO_DIRTY_POST: 'repository-cleanliness',
  CONTENT_MISMATCH_POST: 'runtime-package-contents',
  CONTENT_DRIFT_POST: 'acceptance-invocation',
  CLI_INPUT_INVALID: 'acceptance-invocation'
});

function normalizeExcludePath(relativePath) {
  return String(relativePath).replaceAll('\\', '/');
}

function comparePathNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeExcludes(exclude) {
  if (exclude === undefined) return [];
  if (!Array.isArray(exclude)) throw new TypeError('exclude must be an array of relative paths');
  return exclude.map((entry) => {
    const normalized = normalizeExcludePath(entry).replace(/\/+$/, '');
    if (!normalized) throw new TypeError('exclude entries must not be empty');
    return normalized;
  });
}

function isExcluded(relativePath, excludes) {
  return excludes.some((excludedPath) => (
    relativePath === excludedPath || relativePath.startsWith(`${excludedPath}/`)
  ));
}

function enumerateFiles(rootPath, excludes) {
  const files = [];
  const walk = (directory, relativeDirectory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => comparePathNames(left.name, right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      if (isExcluded(relativePath, excludes)) continue;
      if (entry.isDirectory()) {
        walk(absolutePath, relativePath);
        continue;
      }
      if (entry.isFile()) {
        files.push({ absolutePath, relativePath });
        continue;
      }
      if (entry.isSymbolicLink()) {
        const targetStat = fs.statSync(absolutePath);
        if (targetStat.isFile()) {
          files.push({ absolutePath, relativePath });
          continue;
        }
      }
      throw new Error(`Unsupported non-file entry in Skill hash scope: ${relativePath}`);
    }
  };
  walk(rootPath, '');
  return files.sort((left, right) => comparePathNames(left.relativePath, right.relativePath));
}

export function computeSkillTreeHash(rootPath, { exclude = DEFAULT_EXCLUDES } = {}) {
  const resolvedRoot = path.resolve(rootPath);
  const excludes = normalizeExcludes(exclude);
  const files = enumerateFiles(resolvedRoot, excludes);
  const hash = crypto.createHash(HASH_ALGORITHM);
  for (const file of files) {
    hash.update(file.relativePath, 'utf8');
    hash.update(Buffer.from([0]));
    hash.update(fs.readFileSync(file.absolutePath));
  }
  return {
    hash: hash.digest('hex'),
    files: files.map((file) => file.relativePath)
  };
}

function readRepoHead(repoRoot) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8'
    }).trim();
  } catch {
    return '';
  }
}

function readRepoStatus(repoRoot) {
  try {
    return execFileSync('git', [
      'status',
      '--porcelain',
      '--',
      'skills/decision-first-dashboard/'
    ], {
      cwd: repoRoot,
      encoding: 'utf8'
    }).trim();
  } catch {
    return null;
  }
}

function isRegularFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function readRequiredFileChecks(runtimeSkillPath) {
  const missingFiles = REQUIRED_RUNTIME_FILES.filter((relativePath) => (
    !isRegularFile(path.join(runtimeSkillPath, relativePath))
  ));
  return { missingFiles, passed: missingFiles.length === 0 };
}

function readInvariantChecks(runtimeSkillPath) {
  const missingInvariants = [];
  for (const invariant of REQUIRED_RUNTIME_INVARIANTS) {
    const absolutePath = path.join(runtimeSkillPath, invariant.relativePath);
    let contents = '';
    try {
      contents = fs.readFileSync(absolutePath, 'utf8');
    } catch {
      missingInvariants.push({ ...invariant, reason: 'file_unreadable' });
      continue;
    }
    if (!contents.includes(invariant.substring)) {
      missingInvariants.push({ ...invariant, reason: 'substring_missing' });
    }
  }
  return { missingInvariants, passed: missingInvariants.length === 0 };
}

function pathEquals(left, right, platform = process.platform) {
  if (platform === 'win32') return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

function isMainModule(moduleFile, platform = process.platform) {
  if (!process.argv[1]) return false;
  try {
    return pathEquals(
      resolvePhysicalTarget(process.argv[1]),
      resolvePhysicalTarget(moduleFile),
      platform
    );
  } catch {
    return path.resolve(process.argv[1]) === path.resolve(moduleFile);
  }
}

function baseReport({
  repoHead,
  expectedRepoHead,
  runtimeSkillPath,
  expectedPhysicalTarget
}) {
  return {
    repoHead,
    expectedRepoHead,
    runtimeSkillPath,
    runtimeBindingType: null,
    physicalTargetCheck: {
      status: 'not_checked',
      expected: expectedPhysicalTarget,
      actual: null,
      equalsRepoSkillRoot: null
    },
    repoTreeHashPre: null,
    runtimeTreeHashPre: null,
    repoTreeHashPost: null,
    runtimeTreeHashPost: null,
    contentMatchPre: null,
    contentMatchPost: null,
    contentStablePost: null,
    requiredFilesPresent: null,
    requiredInvariantsPassed: null,
    repoCleanPre: null,
    repoCleanPost: null,
    stalenessRisk: null,
    firstFailingCheck: null,
    diagnostic: null,
    acceptanceValid: false,
    result: 'RUNTIME_PROVENANCE_FAIL'
  };
}

function setFailure(report, check, message, details = {}) {
  if (report.firstFailingCheck !== null) return;
  report.firstFailingCheck = check;
  report.diagnostic = {
    code: check,
    message,
    repairLayer: FAILURE_REPAIR_LAYERS[check] ?? 'runtime-provenance',
    details
  };
}

function assessAcceptanceResult(result) {
  if (result === undefined || result === null) return { success: true };
  if (typeof result?.then === 'function') {
    return { success: false, reasonCode: 'ASYNC_ACCEPTANCE_UNSUPPORTED' };
  }
  if (typeof result === 'boolean') {
    return { success: result, reasonCode: 'BOOLEAN_RESULT_FALSE' };
  }
  if (typeof result === 'number') {
    return { success: result === 0, reasonCode: 'NONZERO_EXIT_CODE' };
  }
  if (typeof result === 'object') {
    if (Object.hasOwn(result, 'ok')) {
      return { success: result.ok === true, reasonCode: 'OK_FALSE' };
    }
    if (Object.hasOwn(result, 'status')) {
      return {
        success: typeof result.status === 'number' && result.status === 0,
        reasonCode: 'INVALID_OR_NONZERO_STATUS'
      };
    }
    if (Object.hasOwn(result, 'exitCode')) {
      return {
        success: typeof result.exitCode === 'number' && result.exitCode === 0,
        reasonCode: 'INVALID_OR_NONZERO_EXIT_CODE'
      };
    }
  }
  return { success: false, reasonCode: 'UNSUPPORTED_ACCEPTANCE_RESULT' };
}

function recordPostHashes(report, repoSkillPath, runtimeSkillPath, exclude) {
  const repoTree = computeSkillTreeHash(repoSkillPath, { exclude });
  const runtimeTree = computeSkillTreeHash(runtimeSkillPath, { exclude });
  report.repoTreeHashPost = repoTree.hash;
  report.runtimeTreeHashPost = runtimeTree.hash;
  report.contentMatchPost = repoTree.hash === runtimeTree.hash;
  report.contentStablePost = (
    report.repoTreeHashPre === report.repoTreeHashPost
    && report.runtimeTreeHashPre === report.runtimeTreeHashPost
  );
  return { repoTree, runtimeTree };
}

export function runRuntimeProvenancePreflight({
  repoRoot,
  runtimeSkillPath,
  expectedRepoHead,
  runAcceptance,
  exclude = DEFAULT_EXCLUDES,
  repoHeadReader = () => readRepoHead(repoRoot),
  repoStatusReader = () => readRepoStatus(repoRoot),
  platform = process.platform
}) {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const resolvedRuntimeSkillPath = path.resolve(runtimeSkillPath);
  const repoSkillPath = path.join(resolvedRepoRoot, 'skills', 'decision-first-dashboard');
  let expectedPhysicalTarget = null;
  try {
    expectedPhysicalTarget = resolvePhysicalTarget(repoSkillPath);
  } catch {
    expectedPhysicalTarget = path.resolve(repoSkillPath);
  }

  let repoHead = '';
  try {
    repoHead = String(repoHeadReader() ?? '').trim();
  } catch {
    repoHead = '';
  }
  const report = baseReport({
    repoHead,
    expectedRepoHead,
    runtimeSkillPath: resolvedRuntimeSkillPath,
    expectedPhysicalTarget
  });

  if (!repoHead) {
    setFailure(report, 'REPO_HEAD_UNAVAILABLE', 'Unable to read the repository HEAD for provenance validation', {
      repoRoot: resolvedRepoRoot
    });
    return report;
  }
  if (repoHead.toLowerCase() !== String(expectedRepoHead ?? '').trim().toLowerCase()) {
    setFailure(report, 'REPO_HEAD_MISMATCH', 'Repository HEAD does not match the expected acceptance commit', {
      repoRoot: resolvedRepoRoot,
      repoHead,
      expectedRepoHead
    });
    return report;
  }

  let bindingType;
  try {
    bindingType = detectRuntimeBinding(resolvedRuntimeSkillPath, { platform });
  } catch (error) {
    setFailure(report, 'BINDING_TYPE_UNSUPPORTED', 'Unable to determine the runtime Skill binding type', {
      runtimeSkillPath: resolvedRuntimeSkillPath,
      error: error.message
    });
    return report;
  }
  report.runtimeBindingType = bindingType;
  if (!BINDING_TYPES.includes(bindingType)) {
    setFailure(report, 'BINDING_MISSING', 'Runtime Skill path is missing or is not a supported directory binding', {
      runtimeSkillPath: resolvedRuntimeSkillPath,
      supportedBindingTypes: BINDING_TYPES
    });
    return report;
  }
  report.stalenessRisk = bindingType === 'copied-directory';

  if (bindingType === 'junction' || bindingType === 'symlink') {
    let actualPhysicalTarget;
    try {
      actualPhysicalTarget = resolvePhysicalTarget(resolvedRuntimeSkillPath);
    } catch (error) {
      report.physicalTargetCheck = {
        status: 'failed',
        expected: expectedPhysicalTarget,
        actual: null,
        equalsRepoSkillRoot: false,
        error: error.message
      };
      setFailure(report, 'PHYSICAL_TARGET_MISMATCH', 'Runtime link cannot be resolved to a physical target', {
        runtimeSkillPath: resolvedRuntimeSkillPath,
        expectedPhysicalTarget
      });
      return report;
    }
    const physicalMatch = pathEquals(actualPhysicalTarget, expectedPhysicalTarget, platform);
    report.physicalTargetCheck = {
      status: physicalMatch ? 'passed' : 'failed',
      expected: expectedPhysicalTarget,
      actual: actualPhysicalTarget,
      equalsRepoSkillRoot: physicalMatch
    };
    if (!physicalMatch) {
      setFailure(report, 'PHYSICAL_TARGET_MISMATCH', 'Runtime link resolves to a different physical directory than the repository Skill', {
        runtimeSkillPath: resolvedRuntimeSkillPath,
        expectedPhysicalTarget,
        actualPhysicalTarget,
        bindingType
      });
      return report;
    }
  } else {
    report.physicalTargetCheck = {
      status: 'not_applicable',
      expected: expectedPhysicalTarget,
      actual: null,
      equalsRepoSkillRoot: null
    };
  }

  let repoTree;
  let runtimeTree;
  try {
    repoTree = computeSkillTreeHash(repoSkillPath, { exclude });
    runtimeTree = computeSkillTreeHash(resolvedRuntimeSkillPath, { exclude });
  } catch (error) {
    setFailure(report, 'CONTENT_MISMATCH_PRE', 'Unable to hash the complete repository and runtime Skill package trees', {
      error: error.message,
      exclude
    });
    return report;
  }
  report.repoTreeHashPre = repoTree.hash;
  report.runtimeTreeHashPre = runtimeTree.hash;
  report.contentMatchPre = repoTree.hash === runtimeTree.hash;
  if (!report.contentMatchPre) {
    setFailure(report, 'CONTENT_MISMATCH_PRE', 'Repository and runtime Skill tree hashes differ before acceptance', {
      repoTreeHashPre: repoTree.hash,
      runtimeTreeHashPre: runtimeTree.hash,
      repoFiles: repoTree.files,
      runtimeFiles: runtimeTree.files,
      exclude
    });
    return report;
  }

  let preStatus;
  try {
    preStatus = repoStatusReader();
  } catch {
    preStatus = null;
  }
  report.repoCleanPre = preStatus === '';
  if (!report.repoCleanPre) {
    setFailure(report, 'REPO_DIRTY_PRE', 'Repository Skill path is dirty before acceptance', {
      status: preStatus
    });
    return report;
  }

  const requiredFiles = readRequiredFileChecks(resolvedRuntimeSkillPath);
  report.requiredFilesPresent = requiredFiles.passed;
  if (!requiredFiles.passed) {
    setFailure(report, 'REQUIRED_FILES_MISSING', 'Runtime Skill is missing one or more required production files', {
      missingFiles: requiredFiles.missingFiles
    });
    return report;
  }

  const requiredInvariants = readInvariantChecks(resolvedRuntimeSkillPath);
  report.requiredInvariantsPassed = requiredInvariants.passed;
  if (!requiredInvariants.passed) {
    setFailure(report, 'REQUIRED_INVARIANT_MISSING', 'Runtime Skill is missing one or more required provenance invariants', {
      missingInvariants: requiredInvariants.missingInvariants
    });
    return report;
  }

  let runStarted = false;
  if (typeof runAcceptance !== 'function') {
    setFailure(report, 'RUN_NOT_PROVIDED', 'The provenance bracket requires an acceptance callback or CLI command', {});
  } else {
    runStarted = true;
    try {
      const acceptanceResult = runAcceptance();
      const acceptanceAssessment = assessAcceptanceResult(acceptanceResult);
      if (!acceptanceAssessment.success) {
        setFailure(report, 'RUN_FAILED', 'The bracketed acceptance command failed', {
          acceptanceResult,
          reasonCode: acceptanceAssessment.reasonCode
        });
      }
    } catch (error) {
      setFailure(report, 'RUN_FAILED', 'The bracketed acceptance command threw an error', {
        error: error.message
      });
    }
  }

  if (runStarted) {
    let postStatus;
    try {
      postStatus = repoStatusReader();
    } catch {
      postStatus = null;
    }
    report.repoCleanPost = postStatus === '';
    if (!report.repoCleanPost) {
      setFailure(report, 'REPO_DIRTY_POST', 'Repository Skill path became dirty during acceptance', {
        status: postStatus
      });
    }

    try {
      const postTrees = recordPostHashes(report, repoSkillPath, resolvedRuntimeSkillPath, exclude);
      if (!report.contentMatchPost) {
        setFailure(report, 'CONTENT_MISMATCH_POST', 'Repository and runtime Skill tree hashes differ after acceptance', {
          repoTreeHashPost: report.repoTreeHashPost,
          runtimeTreeHashPost: report.runtimeTreeHashPost,
          repoFiles: postTrees.repoTree.files,
          runtimeFiles: postTrees.runtimeTree.files,
          exclude
        });
      } else if (!report.contentStablePost) {
        setFailure(report, 'CONTENT_DRIFT_POST', 'The repository or runtime Skill tree changed during acceptance', {
          repoTreeHashPre: report.repoTreeHashPre,
          repoTreeHashPost: report.repoTreeHashPost,
          runtimeTreeHashPre: report.runtimeTreeHashPre,
          runtimeTreeHashPost: report.runtimeTreeHashPost
        });
      }
    } catch (error) {
      setFailure(report, 'CONTENT_MISMATCH_POST', 'Unable to hash the Skill package after acceptance', {
        error: error.message,
        exclude
      });
    }
  }

  if (report.firstFailingCheck === null) {
    report.diagnostic = {
      code: 'RUNTIME_PROVENANCE_PASS',
      message: 'Runtime Skill binding, package contents, invariants, and bracketed acceptance are verified',
      repairLayer: null,
      details: {
        hashAlgorithm: HASH_ALGORITHM,
        exclude,
        bindingType,
        physicalTarget: report.physicalTargetCheck.actual ?? report.physicalTargetCheck.expected
      }
    };
    report.acceptanceValid = true;
    report.result = 'RUNTIME_PROVENANCE_PASS';
  }

  return report;
}

function parseCliArgs(argv) {
  const options = {
    repoRoot: defaultRepoRoot,
    runtimeSkillPath: process.env.DECISION_FIRST_RUNTIME_SKILL_PATH ?? null,
    expectedRepoHead: process.env.DECISION_FIRST_EXPECTED_REPO_HEAD ?? null,
    exclude: DEFAULT_EXCLUDES,
    runCommand: null,
    runArgs: []
  };
  const runIndex = argv.indexOf('--run');
  const optionArgs = runIndex >= 0 ? argv.slice(0, runIndex) : argv;
  if (runIndex >= 0) {
    options.runCommand = argv[runIndex + 1] ?? null;
    if (!options.runCommand) throw new Error('--run requires a command');
    options.runArgs = argv.slice(runIndex + 2);
  }
  const valueFor = (index, flag) => {
    const value = optionArgs[index + 1];
    if (value === undefined) throw new Error(`${flag} requires a value`);
    return value;
  };
  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];
    if (arg === '--repo-root') {
      options.repoRoot = valueFor(index, arg);
      index += 1;
    } else if (arg === '--runtime-skill-path') {
      options.runtimeSkillPath = valueFor(index, arg);
      index += 1;
    } else if (arg === '--expected-repo-head') {
      options.expectedRepoHead = valueFor(index, arg);
      index += 1;
    } else if (arg === '--exclude') {
      options.exclude = valueFor(index, arg).split(',').filter(Boolean);
      index += 1;
    }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function createCliInputFailureReport(options, error) {
  const resolvedRepoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const runtimeSkillPath = typeof options.runtimeSkillPath === 'string'
    ? path.resolve(options.runtimeSkillPath)
    : null;
  const report = baseReport({
    repoHead: readRepoHead(resolvedRepoRoot),
    expectedRepoHead: options.expectedRepoHead ?? null,
    runtimeSkillPath,
    expectedPhysicalTarget: null
  });
  setFailure(report, 'CLI_INPUT_INVALID', error.message, {
    repoRoot: resolvedRepoRoot,
    runtimeSkillPath,
    error: error.message
  });
  return report;
}

if (isMainModule(currentFile)) {
  let options = {};
  try {
    options = parseCliArgs(process.argv.slice(2));
    let runAcceptance;
    if (options.runCommand) {
      runAcceptance = () => {
        const result = spawnSync(options.runCommand, options.runArgs, {
          cwd: options.repoRoot,
          encoding: 'utf8'
        });
        return {
          status: result.status ?? 1,
          signal: result.signal,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.error
            ? { code: result.error.code, message: result.error.message }
            : null
        };
      };
    }
    const report = runRuntimeProvenancePreflight({
      ...options,
      runAcceptance
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (report.result !== 'RUNTIME_PROVENANCE_PASS') process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(createCliInputFailureReport(options, error))}\n`);
    process.exitCode = 1;
  }
}
