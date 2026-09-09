import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const manifestPath = '.claude-plugin/plugin.json';
const skillPath = 'skills/decision-first-dashboard/SKILL.md';

test('Anthropic plugin manifest exposes the dashboard skill with stable metadata', () => {
  assert.equal(existsSync(manifestPath), true, `${manifestPath} must exist`);
  assert.equal(existsSync(skillPath), true, `${skillPath} must remain at plugin root`);

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.name, 'decision-first-dashboard');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.match(manifest.description, /dashboard/i);
  assert.equal(manifest.author?.name, 'fourleaf13-hue');
  assert.equal(manifest.author?.url, 'https://github.com/fourleaf13-hue');
  assert.equal(manifest.homepage, 'https://github.com/fourleaf13-hue/decision-first-dashboard');
  assert.equal(manifest.repository, 'https://github.com/fourleaf13-hue/decision-first-dashboard');
  assert.equal(manifest.license, 'MIT');
  assert.ok(Array.isArray(manifest.keywords));
  assert.ok(manifest.keywords.includes('dashboard'));
  assert.ok(manifest.keywords.includes('decision-support'));
});
