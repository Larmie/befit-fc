#!/usr/bin/env node
// Runs BeFit's checks and reports in plain words.
//
//   npm run test:unit                the Node-only maths checks (seconds)
//   npm run test:changed             unit + only the browser suites this change can affect (tests/tools/pick.js)
//   npm run test:full                unit + every browser suite, one at a time (the end-of-batch run)
//   npm test -- tables fix           unit + the suites named
//   npm run test:pick                show what test:changed would run, run nothing
//
// Options: --base <git ref> (what "changed" is measured against; default origin/main) · --jobs N (suites at once;
// default 1 for --full, 3 otherwise; the sweep checks phone sizes only, --full checks every size) · --no-unit · --dry-run. Env: CHROME_PATH, BEFIT_SNAPSHOT, TEST_TIMEOUT_S.
//
// A run is red only for a NEW failure: tests/known-failures.json lists suites that fail for a known reason
// ("failing") or must not run somewhere ("skip", e.g. in CI), each with a reason and a date.
// Every suite's full output goes to tests/.out/logs/<name>.log.
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const P = require('../paths.js');
const SUITES = require('../suites.js');
const { pick } = require('./pick.js');

const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const names = argv.filter((a, i) => !a.startsWith('--') && !['--base', '--jobs'].includes(argv[i - 1]));
const FULL = flag('--full'), CHANGED = flag('--changed'), DRY = flag('--dry-run');
const JOBS = Math.max(1, Number(opt('--jobs', process.env.TEST_JOBS || (FULL ? 1 : 3))));
const TIMEOUT = (Number(process.env.TEST_TIMEOUT_S) || 900) * 1000;
const CI = !!process.env.CI;
const known = JSON.parse(fs.readFileSync(path.join(P.TESTS, 'known-failures.json'), 'utf8'));
const LOGS = path.join(P.OUT, 'logs');
const secs = ms => { const t = Math.round(ms / 1000); return t < 60 ? `${t}s` : `${Math.floor(t / 60)}m ${String(t % 60).padStart(2, '0')}s`; };
const git = args => execFileSync('git', args, { cwd: P.REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function changedFiles() {
  let base = opt('--base', process.env.TEST_BASE || null);
  const tries = base ? [base] : ['origin/main', 'main'];
  let mb = null;
  for (const b of tries) { try { mb = git(['merge-base', 'HEAD', b]); base = b; break; } catch (e) { /* next */ } }
  if (!mb) return { base: null, files: null };
  const committedAndWorking = git(['diff', '--name-only', mb]).split(/\r?\n/);       // commits since base + uncommitted edits
  const untracked = git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/);
  return { base, files: [...committedAndWorking, ...untracked].filter(Boolean) };
}

function plan() {
  if (FULL) return { label: 'every suite (end-of-batch run)', suites: SUITES.map(s => s.name) };
  if (names.length) {
    const unknown = names.filter(n => !SUITES.some(s => s.name === n));
    if (unknown.length) { console.log(`Unknown suite(s): ${unknown.join(', ')}.\nSuites: ${SUITES.map(s => s.name).join(', ')}`); process.exit(2); }
    const want = new Set(names);
    let grew = true;
    while (grew) { grew = false; for (const n of [...want]) for (const d of (SUITES.find(s => s.name === n).needs || [])) if (!want.has(d)) { want.add(d); grew = true; } }
    return { label: 'the suites named', suites: SUITES.map(s => s.name).filter(n => want.has(n)) };
  }
  if (CHANGED) {
    const { base, files } = changedFiles();
    if (!files) return { label: 'every suite (git could not say what changed)', suites: SUITES.map(s => s.name) };
    const r = pick(files, SUITES);
    console.log(`Changed since ${base}: ${files.length ? files.join(', ') : 'nothing'}`);
    if (r.all) console.log(`Picker: every suite, because ${r.reason}.`);
    else for (const n of r.suites) console.log(`  ${n.padEnd(18)} ← ${[...new Set(r.why[n])].slice(0, 3).join('; ')}`);
    return { label: r.all ? 'every suite' : `${r.suites.length} of ${SUITES.length} suites this change can affect`, suites: r.suites };
  }
  return { label: 'unit checks only', suites: [] };
}

function runProc(cmd, args, cwd, logName) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd, env: Object.assign({}, process.env, { MSYS_NO_PATHCONV: '1' }) });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { out += `\n[run] timed out after ${TIMEOUT / 1000}s`; child.kill(); }, TIMEOUT);
    child.on('close', code => {
      clearTimeout(timer);
      fs.mkdirSync(LOGS, { recursive: true });
      fs.writeFileSync(path.join(LOGS, logName + '.log'), out);
      resolve({ code, out, ms: Date.now() - started });
    });
  });
}

const counts = out => ({ ok: (out.match(/^\s*(ok|✓|PASS)\b/gm) || []).length, fail: (out.match(/^\s*(FAIL|not ok|✗)\b/gm) || []).length });

async function unit() {
  const r = await runProc(process.execPath, ['--test', '--test-reporter=tap', 'tests/unit/*.test.js'], P.REPO, 'unit');
  const pass = +((r.out.match(/^# pass (\d+)/m) || [])[1] || 0), fail = +((r.out.match(/^# fail (\d+)/m) || [])[1] || 0);
  const ok = r.code === 0 && pass > 0;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${'unit'.padEnd(18)} ${`${pass} ok, ${fail} FAIL`.padEnd(28)} ${secs(r.ms)}`);
  if (!ok) {
    console.log('      ' + r.out.split(/\r?\n/).filter(l => /^\s*not ok|^\s+(error|expected|actual):/.test(l)).slice(0, 40).join('\n      '));
    console.log('      full output: tests/.out/logs/unit.log');
  }
  return { name: 'unit', ok, ms: r.ms };
}

async function suite(s) {
  const skip = (known.skip || {})[s.name];
  if (skip && (skip.when === 'always' || (skip.when === 'CI' && CI))) { console.log(`skip  ${s.name.padEnd(18)} ${skip.reason}`); return { name: s.name, skipped: true, ms: 0 }; }
  const file = path.join(P.BROWSER, s.file);
  const r = await runProc(process.execPath, [file, ...((!FULL && s.quickArgs) || s.args || [])], path.dirname(file), s.name);
  const c = counts(r.out);
  const ok = r.code === 0 && !(s.failIf && s.failIf.test(r.out));
  const knownFail = !ok && (known.failing || {})[s.name];
  const word = ok ? 'pass' : knownFail ? 'known' : 'FAIL';
  const detail = s.file === 'integration/sweep.js' ? ((r.out.match(/(\d+) screen\/sheet checks, (\d+) with problems/) || [, '?', '?']).slice(1).join(' checks, ') + ' with problems')
    : `${c.ok} ok, ${c.fail} FAIL`;
  console.log(`${word.padEnd(5)} ${s.name.padEnd(18)} ${detail.padEnd(28)} ${secs(r.ms)}${r.code && r.code !== 1 ? `  (exit ${r.code})` : ''}`);
  if (!ok && !knownFail) {
    const lines = r.out.split(/\r?\n/);
    const interesting = lines.filter(l => /FAIL|Error|CRASH|problems|timed out|^- \[/.test(l) && !/^\s+at /.test(l));
    console.log('      ' + (interesting.length ? interesting : lines.slice(-15)).slice(0, 25).join('\n      '));
    console.log(`      full output: tests/.out/logs/${s.name}.log`);
  }
  return { name: s.name, ok, known: !!knownFail, ms: r.ms, okLines: c.ok, failLines: c.fail };
}

(async () => {
  const started = Date.now();
  const p = plan();
  const list = p.suites.map(n => SUITES.find(s => s.name === n));
  if (DRY) { console.log(`\nWould run: unit + ${list.length ? list.map(s => s.name).join(', ') : 'no browser suites'}`); return; }
  if (list.length && !fs.existsSync(P.SNAPSHOT)) { console.log(`No test data yet (${path.relative(P.REPO, P.SNAPSHOT)}). Run "npm run snapshot" first: a read-only copy of the live data.`); process.exit(2); }
  console.log(`\nRunning: unit + ${p.label}${list.length ? ` (${list.length}, ${JOBS} at a time)` : ''}\n`);
  const results = [];
  if (!flag('--no-unit')) results.push(await unit());
  // waves: suites that read another suite's output wait for it
  const done = new Set();
  let pending = list.slice();
  while (pending.length) {
    const ready = pending.filter(s => (s.needs || []).every(d => done.has(d) || !list.some(x => x.name === d)));
    if (!ready.length) throw new Error('suites wait on each other: ' + pending.map(s => s.name).join(', '));
    const queue = ready.slice();
    await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
      while (queue.length) { const s = queue.shift(); const r = await suite(s); results.push(r); done.add(s.name); }
    }));
    pending = pending.filter(s => !ready.includes(s));
  }
  const ran = results.filter(r => !r.skipped);
  const bad = ran.filter(r => !r.ok && !r.known);
  const knownBad = ran.filter(r => r.known);
  const skipped = results.filter(r => r.skipped);
  const slow = ran.filter(r => r.name !== 'unit').sort((a, b) => b.ms - a.ms).slice(0, 3);
  console.log(`\n${ran.length} run in ${secs(Date.now() - started)} · ${ran.filter(r => r.ok).length} passed · ${bad.length} new failures · ${knownBad.length} known failures · ${skipped.length} skipped`);
  for (const r of knownBad) console.log(`  known failure: ${r.name} — ${known.failing[r.name].reason}`);
  for (const r of ran.filter(r => r.ok && (known.failing || {})[r.name])) console.log(`  NOW PASSES (remove it from tests/known-failures.json): ${r.name}`);
  if (slow.length) console.log(`  slowest: ${slow.map(r => `${r.name} ${secs(r.ms)}`).join(', ')}`);
  if (bad.length) { console.log(`\nRED: ${bad.map(r => r.name).join(', ')}`); process.exit(1); }
  console.log('\nGREEN: no new failures.');
})().catch(e => { console.error(e); process.exit(2); });
