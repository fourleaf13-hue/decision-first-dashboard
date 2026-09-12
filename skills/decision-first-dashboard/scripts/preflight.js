import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const skillRoot = path.resolve(path.dirname(currentFile), '..');
const repoRoot = path.resolve(skillRoot, '../..');
const buildInfoPath = path.join(skillRoot, 'BUILD_INFO.json');
const requiredRuntimeFiles = [
  'SKILL.md',
  'scripts/preflight.js',
  'scripts/worthiness.js',
  'scripts/intake.js',
  'scripts/routing.js',
  'scripts/grounding.js',
  'scripts/compile-dashboard.js',
  'scripts/render.js',
  'schemas/worthiness-assessment.schema.json',
  'schemas/decision-brief.schema.json',
  'schemas/metric-routing.schema.json',
  'schemas/grounded-bundle.schema.json',
  'schemas/decision-state.schema.json'
];

function runGit(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function sourceCheckoutBuildInfo() {
  const expectedSkillRoot = path.resolve(repoRoot, 'skills', 'decision-first-dashboard');
  const packageJsonPath = path.join(repoRoot, 'package.json');
  if (expectedSkillRoot !== skillRoot || !fs.existsSync(packageJsonPath)) return null;

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const sourceCommit = runGit(['rev-parse', 'HEAD']);
  const sourceBranchRaw = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  return {
    schemaVersion: 1,
    skillName: 'decision-first-dashboard',
    skillVersion: packageJson.version,
    sourceCommit,
    sourceBranch: sourceBranchRaw === 'HEAD' ? 'detached' : (sourceBranchRaw || 'unknown'),
    builtAt: null,
    requiredEntrypoint: 'scripts/compile-dashboard.js',
    requiredRuntimeFiles,
    mode: 'source_checkout'
  };
}

function loadBuildInfo() {
  if (fs.existsSync(buildInfoPath)) {
    return {
      ...JSON.parse(fs.readFileSync(buildInfoPath, 'utf8')),
      mode: 'packaged_skill'
    };
  }
  return sourceCheckoutBuildInfo();
}

function validateBuildInfo(info) {
  const errors = [];
  if (!info) {
    errors.push('BUILD_INFO.json is missing and this is not a recognized source checkout');
    return errors;
  }
  if (info.schemaVersion !== 1) errors.push('Unsupported or missing BUILD_INFO schemaVersion');
  if (info.skillName !== 'decision-first-dashboard') errors.push('Unexpected skillName in BUILD_INFO');
  if (!/^\d+\.\d+\.\d+$/.test(info.skillVersion ?? '')) errors.push('Invalid or missing semantic skillVersion');
  if (!/^[0-9a-f]{40}$/i.test(info.sourceCommit ?? '')) errors.push('Invalid or missing sourceCommit');
  if (typeof info.sourceBranch !== 'string' || info.sourceBranch.trim() === '') errors.push('Invalid or missing sourceBranch');
  if (info.mode === 'packaged_skill' && Number.isNaN(Date.parse(info.builtAt ?? ''))) errors.push('Invalid or missing builtAt');
  if (info.requiredEntrypoint !== 'scripts/compile-dashboard.js') errors.push('Unexpected requiredEntrypoint');

  const declared = new Set(Array.isArray(info.requiredRuntimeFiles) ? info.requiredRuntimeFiles : []);
  for (const relativePath of requiredRuntimeFiles) {
    if (!declared.has(relativePath)) {
      errors.push(`BUILD_INFO does not declare required runtime file: ${relativePath}`);
    }
  }
  return errors;
}

function validateRuntimeFiles() {
  const errors = [];
  for (const relativePath of requiredRuntimeFiles) {
    if (!fs.existsSync(path.join(skillRoot, relativePath))) {
      errors.push(`Missing required runtime file: ${relativePath}`);
    }
  }
  return errors;
}

const buildInfo = loadBuildInfo();
const errors = [...validateRuntimeFiles(), ...validateBuildInfo(buildInfo)];

if (errors.length > 0) {
  process.stderr.write(`${JSON.stringify({
    valid: false,
    code: 'SKILL_PACKAGE_INCOMPLETE_OR_OUTDATED',
    message: 'The installed decision-first-dashboard skill package is incomplete or outdated. Reinstall the latest main artifact before generating a dashboard.',
    errors
  })}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  valid: true,
  code: 'SKILL_PACKAGE_READY',
  mode: buildInfo.mode,
  skillVersion: buildInfo.skillVersion,
  sourceCommit: buildInfo.sourceCommit,
  sourceBranch: buildInfo.sourceBranch,
  requiredEntrypoint: buildInfo.requiredEntrypoint
})}\n`);
