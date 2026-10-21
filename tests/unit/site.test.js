// What the public site serves. Cloudflare Pages publishes the repo folder, so every committed top-level file or
// folder must be either part of the app (site-build.sh's APP list) or sent away by _redirects. A new tooling file
// that is in neither would be served to the public: this check fails until it is added to one of them.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const P = require('../paths.js');

const tracked = execFileSync('git', ['ls-files'], { cwd: P.REPO, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const top = [...new Set(tracked.map(f => f.split('/')[0]))];
const app = fs.readFileSync(path.join(P.REPO, 'site-build.sh'), 'utf8').match(/^APP=\(([^)]*)\)/m)[1].trim().split(/\s+/);
const redirects = fs.readFileSync(path.join(P.REPO, '_redirects'), 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'))
  .map(l => l.split(/\s+/)[0]);
const blocked = name => redirects.some(r => r === '/' + name || r === '/' + name + '/*');

test('every committed top-level file or folder is either the app or blocked from the public site', () => {
  const neither = top.filter(t => !app.includes(t) && !blocked(t));
  assert.deepEqual(neither, [], 'add these to site-build.sh APP (app files) or to _redirects (everything else)');
});
test('nothing is both app and blocked', () => assert.deepEqual(app.filter(a => a !== '_redirects' && blocked(a)), []));
test('every app item in site-build.sh exists', () => { for (const a of app) assert.ok(fs.existsSync(path.join(P.REPO, a)), a); });
test('the app itself (index.html, css/, js/) is never blocked', () => {
  for (const a of ['index.html', 'css', 'js', 'sw.js', 'manifest.json', 'classic.html']) assert.ok(!blocked(a), a);
});
