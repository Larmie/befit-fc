#!/usr/bin/env node
// npm run snapshot: a READ-ONLY copy of the live data for the tests.
//
// It only ever sends GET requests, for the four public parts of the database (players, sessions, paymentDays,
// settings); the database rules allow anyone to read those. It never writes, and the tests never write either
// (the harness blocks every request to Firebase).
//
// The tests were written against the data as it stood on a fixed day (tests/snapshot-pin.json "asOf"), and
// several of them check exact numbers ("24 players owe", "40 owed dates"). New Mondays must not break them, so
// the copy is cut back to that day: matches and payment days after it, and players created after it, are left
// out. What it cannot undo is an edit to the older data (a renamed player, a fixed match). The fingerprint check
// below says when that happened; then refresh the pin and the numbers together (AGENTS.md, "Test data").
//
//   npm run snapshot                    live data, cut back to the pinned day → tests/.data/snapshot.json
//   npm run snapshot -- --as-of 2026-10-26   cut back to another day (use when moving the pin)
//   npm run snapshot -- --raw           everything, no cut (for looking, not for the tests)
//   npm run snapshot -- --pin           after moving the pin: write the new asOf + fingerprint into snapshot-pin.json
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const P = require('../paths.js');

const DB = 'https://befit-fc-default-rtdb.firebaseio.com';
const ROOTS = ['players', 'sessions', 'paymentDays', 'settings'];
const PIN_FILE = path.join(P.TESTS, 'snapshot-pin.json');
const argv = process.argv.slice(2);
const opt = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const pin = JSON.parse(fs.readFileSync(PIN_FILE, 'utf8'));
const RAW = argv.includes('--raw');
const AS_OF = opt('--as-of') || pin.asOf;
const OUT = argv.includes('--out') ? path.resolve(opt('--out')) : P.SNAPSHOT;

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

// Cut the data back to the end of a day (local dates as the app stores them: 'YYYY-MM-DD').
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
const hash = v => crypto.createHash('sha1').update(JSON.stringify(canon(v === undefined ? null : v))).digest('hex').slice(0, 12);
function fingerprint(d) {
  return { players: Object.keys(d.players || {}).length, sessions: Object.keys(d.sessions || {}).length,
    paymentDays: Object.keys(d.paymentDays || {}).length, hash: { players: hash(d.players), sessions: hash(d.sessions),
      paymentDays: hash(d.paymentDays), settings: hash(d.settings) } };
}

async function main() {
  const live = {};
  for (const r of ROOTS) live[r] = await get(r);
  const data = RAW ? live : cut(live, AS_OF);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data));
  const fp = fingerprint(data);
  console.log(`Saved ${path.relative(P.REPO, OUT)}: ${fp.players} players, ${fp.sessions} matches, ${fp.paymentDays} payment days` +
    (RAW ? ' (everything, not cut back)' : ` (live data cut back to ${AS_OF}; live has ${Object.keys(live.sessions || {}).length} matches)`));
  if (argv.includes('--pin')) {
    if (RAW) { console.log('Not pinning a --raw copy.'); process.exit(2); }
    fs.writeFileSync(PIN_FILE, JSON.stringify(Object.assign({}, pin, { asOf: AS_OF, pinnedOn: new Date().toISOString().slice(0, 10), fingerprint: fp }), null, 2) + '\n');
    console.log(`Pinned: tests/snapshot-pin.json now says asOf ${AS_OF}. Commit it with the test numbers you updated.`);
    return;
  }
  if (RAW || AS_OF !== pin.asOf) return;
  const want = pin.fingerprint || {};
  const differs = Object.keys(fp.hash).filter(k => (want.hash || {})[k] !== fp.hash[k]);
  if (!differs.length) { console.log(`Matches the pinned data the tests were written for (${pin.asOf}).`); return; }
  console.log(`\nHEADS-UP: the live data up to ${pin.asOf} has changed since the tests were pinned (${differs.join(', ')} differ: ` +
    `${want.players}→${fp.players} players, ${want.sessions}→${fp.sessions} matches, ${want.paymentDays}→${fp.paymentDays} payment days).\n` +
    'Suites that check exact numbers or names may now fail for that reason alone. See AGENTS.md "Test data" to refresh the pin.');
  if (argv.includes('--strict')) process.exit(3);
}

module.exports = { cut, fingerprint };
if (require.main === module) main().catch(e => { console.error('Snapshot failed (nothing was written to the database; only GETs are sent): ' + e.message); process.exit(1); });
