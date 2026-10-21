#!/usr/bin/env node
// npm run snapshot: a READ-ONLY copy of the live data for the tests.
//
// It only ever sends GET requests, for the four public parts of the database (players, sessions, paymentDays,
// settings); the database rules allow anyone to read those. It never writes, and the tests never write either
// (the harness blocks every request to Firebase).
//
// The tests were written against the data as it stood on a fixed day, and several of them check exact numbers
// ("24 players owe", "All 76" players) or names. tests/snapshot-pin.json keeps that data reproducible from live:
//   asOf         matches and payment days after this day, and players created after it, are left out
//   patch        later edits to the older data, undone: { players: { <id>: <value then> | null }, ... }
//                (null = that entry did not exist then). Made with --pin --keep <the old copy>.
//   fingerprint  what the result must look like; checked on every run
// Result: the same data the tests were written for, every time, on any machine and in CI.
//
//   npm run snapshot                          → tests/.data/snapshot.json, checked against the pin
//   npm run snapshot -- --raw                 everything as it is now, nothing cut or undone (for looking)
//   npm run snapshot -- --as-of 2026-10-26 --pin
//                                             move the pin forward (no patch): then update the test numbers
//   npm run snapshot -- --pin --keep <file>   keep today's pin after someone edited old data: stores the
//                                             difference between live and <file> (a copy made before the edit)
//   --out <file>  write somewhere else · --strict  exit 3 when the result does not match the pin
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const P = require('../paths.js');

const DB = 'https://befit-fc-default-rtdb.firebaseio.com';
const ROOTS = ['players', 'sessions', 'paymentDays', 'settings'];
const KEYED = ['players', 'sessions', 'paymentDays'];
const PIN_FILE = path.join(P.TESTS, 'snapshot-pin.json');

function get(root, tries = 3) {
  const url = `${DB}/${root}.json`;
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', timeout: 30000, headers: { Accept: 'application/json' } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`GET ${url} → HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(`GET ${url}: not JSON`)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`GET ${url} timed out`)));
    req.on('error', reject);
    req.end();
  }).catch(e => (tries > 1 ? new Promise(r => setTimeout(r, 2000)).then(() => get(root, tries - 1)) : Promise.reject(e)));
}

// Cut the data back to the end of a day (the app stores local dates as 'YYYY-MM-DD').
function cut(d, asOf) {
  const end = new Date(asOf + 'T23:59:59.999Z').getTime() + 14 * 3600e3;   // generous: any time zone still on that day
  const out = { players: {}, sessions: {}, paymentDays: {}, settings: d.settings || {} };   // no settings yet = {} (as the app reads it)
  for (const [k, p] of Object.entries(d.players || {})) if (!(p && p.createdAt > end)) out.players[k] = p;
  for (const [k, s] of Object.entries(d.sessions || {})) if (!(s && s.date > asOf)) out.sessions[k] = s;
  for (const [k, v] of Object.entries(d.paymentDays || {})) if (!(k > asOf)) out.paymentDays[k] = v;
  return out;
}

const canon = v => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a === undefined ? null : a)) === JSON.stringify(canon(b === undefined ? null : b));
const hash = v => crypto.createHash('sha1').update(JSON.stringify(canon(v === undefined ? null : v))).digest('hex').slice(0, 12);
function fingerprint(d) {
  return { players: Object.keys(d.players || {}).length, sessions: Object.keys(d.sessions || {}).length,
    paymentDays: Object.keys(d.paymentDays || {}).length, hash: { players: hash(d.players), sessions: hash(d.sessions),
      paymentDays: hash(d.paymentDays), settings: hash(d.settings) } };
}

// The patch that turns `now` into `then`, entry by entry (whole player / match / payment day; settings whole).
function diff(now, then) {
  const patch = {};
  for (const r of KEYED) {
    const a = now[r] || {}, b = then[r] || {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!same(a[k], b[k])) (patch[r] = patch[r] || {})[k] = b[k] === undefined ? null : b[k];
  }
  if (!same(now.settings, then.settings)) patch.settings = then.settings;
  return patch;
}
function applyPatch(d, patch) {
  const out = JSON.parse(JSON.stringify(d));
  for (const r of KEYED) for (const [k, v] of Object.entries((patch || {})[r] || {})) { if (v === null) delete out[r][k]; else out[r][k] = v; }
  if (patch && 'settings' in patch) out.settings = patch.settings;
  return out;
}
const describe = patch => KEYED.concat('settings').filter(r => patch[r]).map(r => (r === 'settings' ? 'settings' : `${Object.keys(patch[r]).length} ${r}`)).join(', ') || 'nothing';

async function main() {
  const argv = process.argv.slice(2);
  const opt = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const pin = JSON.parse(fs.readFileSync(PIN_FILE, 'utf8'));
  const RAW = argv.includes('--raw'), PIN = argv.includes('--pin');
  const AS_OF = opt('--as-of') || pin.asOf;
  const OUT = opt('--out') ? path.resolve(opt('--out')) : P.SNAPSHOT;

  const live = {};
  for (const r of ROOTS) live[r] = await get(r);
  const liveCut = cut(live, AS_OF);

  if (PIN) {
    if (RAW) { console.log('Not pinning a --raw copy.'); process.exit(2); }
    const keep = opt('--keep');
    const then = keep ? JSON.parse(fs.readFileSync(path.resolve(keep), 'utf8')) : null;
    const patch = then ? diff(liveCut, then) : {};
    const data = applyPatch(liveCut, patch);
    if (then && !same(data, then)) throw new Error('the patch does not rebuild ' + keep);
    const next = { about: pin.about, asOf: AS_OF, pinnedOn: new Date().toISOString().slice(0, 10), fingerprint: fingerprint(data), patch };
    fs.writeFileSync(PIN_FILE, JSON.stringify(next, null, 1) + '\n');
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(data));
    console.log(`Pinned tests/snapshot-pin.json: asOf ${AS_OF}, undoing ${describe(patch)} edited since. ` +
      `${next.fingerprint.players} players, ${next.fingerprint.sessions} matches, ${next.fingerprint.paymentDays} payment days.` +
      (keep ? '' : '\nCommit it together with the test numbers you updated (AGENTS.md, "Test data").'));
    return;
  }

  const data = RAW ? live : applyPatch(liveCut, AS_OF === pin.asOf ? pin.patch : {});
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data));
  const fp = fingerprint(data);
  console.log(`Saved ${path.relative(P.REPO, OUT)}: ${fp.players} players, ${fp.sessions} matches, ${fp.paymentDays} payment days` +
    (RAW ? ' (everything as it is now)' : ` (live has ${Object.keys(live.sessions || {}).length} matches; cut back to ${AS_OF}` +
      (AS_OF === pin.asOf && pin.patch && describe(pin.patch) !== 'nothing' ? `, with ${describe(pin.patch)} put back as they were then)` : ')')));
  if (RAW || AS_OF !== pin.asOf) return;
  const want = pin.fingerprint || { hash: {} };
  const differs = Object.keys(fp.hash).filter(k => want.hash[k] !== fp.hash[k]);
  if (!differs.length) { console.log(`Identical to the data the tests were pinned to (${pin.asOf}).`); return; }
  console.log(`\nHEADS-UP: the live data up to ${pin.asOf} was edited after the tests were pinned (${differs.join(', ')} differ: ` +
    `${want.players}→${fp.players} players, ${want.sessions}→${fp.sessions} matches, ${want.paymentDays}→${fp.paymentDays} payment days).\n` +
    'Suites that check exact numbers or names may now fail for that reason alone. See AGENTS.md "Test data".');
  if (argv.includes('--strict')) process.exit(3);
}

module.exports = { cut, fingerprint, diff, applyPatch };
if (require.main === module) main().catch(e => { console.error('Snapshot failed (nothing was written to the database; only GETs are sent): ' + e.message); process.exit(1); });
