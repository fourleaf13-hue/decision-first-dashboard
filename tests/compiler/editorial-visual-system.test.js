import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VISUAL_SYSTEM_ID,
  applyEditorialHtml,
  applyEditorialSvg,
  loadDecisionFirstComponentManifest
} from '../../skills/decision-first-dashboard/scripts/editorial-visual-system.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../..');
const skillRoot = path.join(repoRoot, 'skills', 'decision-first-dashboard');

test('editorial visual system is explicit, machine-readable, and card-wall resistant', () => {
  assert.equal(VISUAL_SYSTEM_ID, 'editorial-v1');

  const manifest = loadDecisionFirstComponentManifest();
  const ids = manifest.components.map((component) => component.id);
  assert.deepEqual(ids, [
    'finding',
    'primary-diagnostic',
    'secondary-evidence',
    'evidence-strip',
    'recommended-action',
    'metric-inline',
    'chart-frame',
    'section-divider'
  ]);
  assert.equal(ids.includes('generic-card'), false, 'generic-card must not be a first-class component');
  assert.equal(manifest.components.find((component) => component.id === 'primary-diagnostic').dominantVisual, true);
  assert.equal(manifest.components.find((component) => component.id === 'recommended-action').surface, 'subtle');
});

test('HTML post-processing applies the editorial design system without changing semantic content', () => {
  const source = '<!doctype html><html><head><style>.semantic-card{background:#fff}</style></head><body><main class="semantic-shell"><div class="semantic-grid semantic-grid--asymmetric"><section class="semantic-card semantic-card--role-anchor">Finding</section><section class="semantic-card semantic-card--role-primary">Primary</section><section class="semantic-card semantic-card--role-supporting">Supporting</section></div></main></body></html>';
  const rendered = applyEditorialHtml(source);

  assert.match(rendered, /data-visual-system="editorial-v1"/);
  assert.match(rendered, /data-decision-first-visual-system="editorial-v1"/);
  assert.match(rendered, /--df-page:#ffffff/);
  assert.match(rendered, /semantic-grid--asymmetric\{grid-template-columns:minmax\(0,9fr\) minmax\(240px,3fr\)/);
  assert.match(rendered, /semantic-card--role-supporting[^}]*box-shadow:none/);
  assert.match(rendered, /semantic-card--role-anchor[^}]*border-radius:0/);
  assert.doesNotMatch(rendered, /linear-gradient\(/);
  assert.match(rendered, />Finding</);
  assert.match(rendered, />Primary</);
  assert.match(rendered, />Supporting</);
});

test('SVG post-processing preserves semantic markup and flattens generic card chrome', () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg"><style>.card{fill:#fff}</style><g data-attention-role="anchor"><rect class="card"/></g></svg>';
  const rendered = applyEditorialSvg(source);

  assert.match(rendered, /data-visual-system="editorial-v1"/);
  assert.match(rendered, /data-decision-first-visual-system="editorial-v1"/);
  assert.match(rendered, /\.card\{fill:none;stroke:#d7dde7/);
  assert.doesNotMatch(rendered, /linear-gradient\(/);
  assert.match(rendered, /data-attention-role="anchor"/);
});

test('Claude skill packaging includes the executable design system assets', () => {
  const stageScript = fs.readFileSync(path.join(repoRoot, 'scripts', 'stage-claude-skill.mjs'), 'utf8');
  assert.match(stageScript, /['"]design-system['"]/);

  const required = [
    'design-system/DESIGN.md',
    'design-system/tokens.css',
    'design-system/components.manifest.json',
    'design-system/archetypes/diagnosis.json'
  ];
  for (const relativePath of required) {
    assert.equal(fs.existsSync(path.join(skillRoot, relativePath)), true, `${relativePath} must exist`);
  }
});
