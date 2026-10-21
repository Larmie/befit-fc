// The test picker (tests/tools/pick.js): a change runs the suites it can affect, and errs towards running more.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pick } = require('../tools/pick.js');
const SUITES = require('../suites.js');
const P = require('../paths.js');
const ALL = SUITES.map(s => s.name);

test('every suite file in the catalogue exists', () => {
  for (const s of SUITES) assert.ok(fs.existsSync(path.join(P.BROWSER, s.file)), s.file);
  for (const s of SUITES) for (const u of s.uses || []) assert.ok(fs.existsSync(path.join(P.TESTS, u)), u);
});
test('every browser test file is in the catalogue or used by a suite (nothing silently never runs)', () => {
  const listed = new Set(SUITES.flatMap(s => ['browser/' + s.file, ...(s.uses || [])]));
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(P.BROWSER).map(f => path.relative(P.TESTS, f).replace(/\\/g, '/')).filter(f => f.endsWith('.js') && f !== 'browser/harness.js');
  assert.deepEqual(files.filter(f => !listed.has(f)), []);
});
test('css/tables.css → the tables suites and the tables sweep groups, nothing else', () => {
  const r = pick(['css/tables.css']);
  assert.equal(r.all, false);
  assert.deepEqual(r.suites, ['tables', 'unseen', 'sweep-tables', 'sweep-tablesguest', 'sweep-tablesblue']);
});
test('js/core/scoring.js → Monday night, classic-compat (and what it needs) and the suites that show points', () => {
  const r = pick(['js/core/scoring.js']);
  for (const n of ['monday', 'classic-compat', 'console-match', 'setup-flow', 'home', 'tables', 'fulltime', 'fix']) assert.ok(r.suites.includes(n), n);
  assert.ok(!r.suites.includes('sweep-console'), 'no sweep for a maths change');
});
test('js/core/pay.js → the money suites and Monday night', () => {
  const r = pick(['js/core/pay.js']);
  for (const n of ['admin', 'admin-payrule', 'admin-tonight', 'r5-admin', 'paycheck', 'monday']) assert.ok(r.suites.includes(n), n);
});
test('the shared shell or look → every suite', () => {
  for (const f of ['js/ui/shell.js', 'js/ui/components.js', 'css/tokens.css', 'css/components.css', 'index.html']) assert.equal(pick([f]).all, true, f);
});
test('test tooling, package files, CI and unknown paths → every suite', () => {
  for (const f of ['tests/browser/harness.js', 'tests/paths.js', 'tests/suites.js', 'tests/tools/run.js', 'package.json', '.github/workflows/checks.yml', 'new-folder/thing.js']) {
    const r = pick([f]);
    assert.equal(r.all, true, f);
    assert.deepEqual(r.suites, ALL, f);
  }
});
test('docs, notes, unit checks and deploy files → no browser suite', () => {
  assert.deepEqual(pick(['AGENTS.md', 'CLAUDE.md', 'tests/unit/core.test.js', '_redirects', 'manifest.json', 'design-review/x.html']).suites, []);
});
test('a shared test data file → every suite that uses it', () => {
  const r = pick(['tests/browser/console/data.js']);
  for (const n of ['console-match', 'console-audit', 'deck', 'outbox', 'sweep-console']) assert.ok(r.suites.includes(n), n);
});
test('a suite file → that suite', () => assert.deepEqual(pick(['tests/browser/admin/card-test.js']).suites, ['admin-card']));
test('Windows paths work too', () => assert.deepEqual(pick(['css\\fix.css']).suites, pick(['css/fix.css']).suites));
