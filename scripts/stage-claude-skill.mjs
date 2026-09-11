import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), '..');
const skillRoot = path.join(repoRoot, 'skills', 'decision-first-dashboard');
const defaultOutDir = path.join(repoRoot, 'dist', 'claude-skill');
const outDir = path.resolve(process.argv[2] ?? defaultOutDir);
const packageEntries = ['SKILL.md', 'scripts', 'schemas', 'templates', 'references'];

function copyEntry(entry) {
  const source = path.join(skillRoot, entry);
  const destination = path.join(outDir, entry);
  if (!fs.existsSync(source)) {
    throw new Error(`Required skill package entry is missing: ${entry}`);
  }
  fs.cpSync(source, destination, { recursive: true });
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
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const entry of packageEntries) copyEntry(entry);
assertClaudeUploadShape();

console.log(`Claude skill staged at ${outDir}`);
