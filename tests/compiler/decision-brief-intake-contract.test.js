import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skill = fs.readFileSync(path.join(root, 'skills/decision-first-dashboard/SKILL.md'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

test('skill defines an adaptive Decision Brief that minimizes user cognitive load', () => {
  assert.match(skill, /Decision Brief/);
  assert.match(skill, /one question at a time/i);
  assert.match(skill, /no more than five questions/i);
  assert.match(skill, /stop immediately once enough information/i);
  assert.match(skill, /never ask for information already provided or inferable/i);

  for (const dimension of ['Decision', 'Action', 'Exception', 'Diagnosis', 'Audience']) {
    assert.match(skill, new RegExp(`\\b${dimension}\\b`), `missing ${dimension} intake dimension`);
  }
});

test('skill has a guided fallback when the user cannot answer', () => {
  assert.match(skill, /If the user is unsure/i);
  assert.match(skill, /2–4 concrete choices/i);
  assert.match(skill, /infer the most defensible answer from the data/i);
  assert.match(skill, /ask for confirmation/i);
  assert.match(skill, /Do not invent a threshold/i);
});

test('skill supports both data-first and question-first intake without redundant questions', () => {
  assert.match(skill, /data-first/i);
  assert.match(skill, /question-first/i);
  assert.match(skill, /profile the uploaded data before asking/i);
  assert.match(skill, /request only the data needed/i);
});

test('source facts alone cannot silently satisfy user intent', () => {
  assert.match(skill, /at least one question/i);
  assert.match(skill, /explicitly stated[^\n]*Decision[^\n]*Action/i);
  assert.match(skill, /screenshot[^\n]*cannot[^\n]*satisfy[^\n]*Decision Brief/i);
  assert.match(skill, /inferred candidate[^\n]*confirmation/i);
});

test('README documents Decision Brief before Metric Router', () => {
  assert.match(readme, /adaptive Decision Brief/i);
  assert.match(readme, /Decision Brief[\s\S]{0,400}Metric Router/i);
});
