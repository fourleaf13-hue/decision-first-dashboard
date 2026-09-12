import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), '..');
const skillRoot = path.join(repoRoot, 'skills', 'decision-first-dashboard');
const defaultOutDir = path.join(repoRoot, 'dist', 'claude-skill');
const outDir = path.resolve(process.argv[2] ?? defaultOutDir);
const packageJsonPath = path.join(repoRoot, 'package.json');
const pluginManifestPath = path.join(repoRoot, '.claude-plugin', 'plugin.json');
const packageEntries = ['SKILL.md', 'scripts', 'schemas', 'templates', 'references'];
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runGit(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function resolveSourceCommit() {
  return runGit(['rev-parse', 'HEAD']) || process.env.GITHUB_SHA?.trim() || '';
}

function resolveSourceBranch() {
  const branch = process.env.GITHUB_HEAD_REF?.trim()
    || process.env.GITHUB_REF_NAME?.trim()
    || runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  return branch === 'HEAD' ? 'detached' : (branch || 'unknown');
}

function assertSourcePackageComplete() {
  for (const relativePath of requiredRuntimeFiles) {
    const absolutePath = path.join(skillRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Required production skill file is missing: ${relativePath}`);
    }
  }
}

function copyEntry(entry) {
  const source = path.join(skillRoot, entry);
  const destination = path.join(outDir, entry);
  if (!fs.existsSync(source)) {
    throw new Error(`Required skill package entry is missing: ${entry}`);
  }
  fs.cpSync(source, destination, { recursive: true });
}

function buildInfo() {
  const packageJson = readJson(packageJsonPath);
  const pluginManifest = readJson(pluginManifestPath);
  if (!/^\d+\.\d+\.\d+$/.test(packageJson.version ?? '')) {
    throw new Error('package.json must contain a semantic skill version');
  }
  if (pluginManifest.version !== packageJson.version) {
    throw new Error('package.json version and .claude-plugin/plugin.json version must match');
  }

  const sourceCommit = resolveSourceCommit();
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    throw new Error('Unable to resolve the source Git commit for the skill package');
  }

  return {
    schemaVersion: 1,
    skillName: 'decision-first-dashboard',
    skillVersion: packageJson.version,
    sourceCommit,
    sourceBranch: resolveSourceBranch(),
    builtAt: new Date().toISOString(),
    requiredEntrypoint: 'scripts/compile-dashboard.js',
    requiredRuntimeFiles
  };
}

function writeBuildInfo() {
  fs.writeFileSync(
    path.join(outDir, 'BUILD_INFO.json'),
    `${JSON.stringify(buildInfo(), null, 2)}\n`
  );
}

function assertClaudeUploadShape() {
  const skillPath = path.join(outDir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    throw new Error('Claude upload package must contain SKILL.md at the package root');
  }

  const skill = fs.readFileSync(skillPath, 'utf8');
  if (!/^---\nname:\s*decision-first-dashboard\ndescription:\s*.+\n---/s.test(skill)) {
    throw new Error('Packaged SKILL.md must keep YAML name and description frontmatter');
  }

  if (fs.existsSync(path.join(outDir, '.claude-plugin'))) {
    throw new Error('Claude skill upload package must not contain .claude-plugin');
  }

  if (!fs.existsSync(path.join(outDir, 'BUILD_INFO.json'))) {
    throw new Error('Claude upload package must contain BUILD_INFO.json');
  }

  for (const relativePath of requiredRuntimeFiles) {
    if (!fs.existsSync(path.join(outDir, relativePath))) {
      throw new Error(`Claude upload package is missing required production file: ${relativePath}`);
    }
  }
}

assertSourcePackageComplete();
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const entry of packageEntries) copyEntry(entry);
writeBuildInfo();
assertClaudeUploadShape();

console.log(`Claude skill staged at ${outDir}`);
