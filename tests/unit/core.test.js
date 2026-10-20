// The payments rule (js/core/pay.js) and the match clock (js/core/clock.js), Node only, no browser.
// Loads the real core files in a fake window, like rules.test.js. Made-up matches for the rules, then the real
// data (the snapshot) for the numbers the Money screen shows (same numbers as browser/admin/payrule-test.js).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const P = require('../paths.js');

const win = { BF_CONFIG: { fee: 60, currency: '₵', seasonLabel: 'Season 2026' } };
win.window = win;
const ctx = vm.createContext(win);
for (const f of ['js/core/scoring.js', 'js/core/teams.js', 'js/core/pay.js', 'js/core/clock.js'])
  vm.runInContext(fs.readFileSync(path.join(P.REPO, f), 'utf8'), ctx, { filename: f });
let NOW = new Date('2026-10-26T19:30:00').getTime();
win.Store = { now: () => NOW, state: { settings: {} } };
const { BF_PAY: PAY, Clock: C } = win;

// ---------------------------------------------------------------- payments rule, made-up data
const players = { a: { name: 'Ama' }, b: { name: 'Bayo' }, c: { name: 'Coby' }, d: { name: 'Dede' } };
const played = (date, pids) => ({ date, status: 'completed', mode: 'live',
  teams: { green: { players: Object.fromEntries(pids.map(p => [p, { position: 'MID' }])) }, red: { players: {} } } });
const db = {
  players,
  sessions: { s1: played('2026-10-05', ['a', 'b', 'c']), s2: played('2026-10-12', ['a', 'b']), s3: played('2026-10-19', ['a', 'b', 'c']) },
  paymentDays: {
    '2026-10-05': { payments: { a: { amount: 60, updatedAt: 1 }, b: { amount: 0, updatedAt: 1 } } },  // c played, no record → not paid
    // 12 Oct has no record at all → "not entered" for everyone
    '2026-10-19': { payments: { a: 60, c: { amount: 60, updatedAt: 5 } } },
  },
};
db.sessions.s3.payments = { c: { amount: 0, updatedAt: 9 }, d: { amount: 60, updatedAt: 1 } };   // legacy record on the match, newer for c

test('paid: an amount above ₵0 on the day', () => assert.equal(PAY.status('a', '2026-10-05', db), 'paid'));
test('not paid: played on an entered day with ₵0', () => assert.equal(PAY.status('b', '2026-10-05', db), 'not paid'));
test('not paid: played on an entered day with no amount at all', () => assert.equal(PAY.status('c', '2026-10-05', db), 'not paid'));
test('not entered: a day with no payment record, for everyone who played', () => {
  assert.equal(PAY.status('a', '2026-10-12', db), 'not entered');
  assert.equal(PAY.hasRecord('2026-10-12', db), false);
});
test('nothing to say: did not play and did not pay', () => assert.equal(PAY.status('d', '2026-10-05', db), null));
test('the newest record wins when a day has two (legacy ₵0 at 9 beats ₵60 at 5)', () => assert.equal(PAY.status('c', '2026-10-19', db), 'not paid'));
test('a plain number counts as an amount (legacy shape)', () => assert.equal(PAY.amount('a', '2026-10-19', db), 60));
test('owed dates, oldest first: Coby owes 5 Oct and 19 Oct, never the un-entered 12 Oct', () => assert.deepEqual([...PAY.owed('c', db)], ['2026-10-05', '2026-10-19']));
test('day summary adds up: 19 Oct = 3 played, 2 paid (Ama, Dede) of whom 1 played, 2 not paid', () => {
  const d = PAY.day('2026-10-19', db);
  assert.deepEqual({ played: d.played, paid: d.paid, paidPlayed: d.paidPlayed, notPaid: d.notPaid, others: d.others, total: d.total },
    { played: 3, paid: 2, paidPlayed: 1, notPaid: 2, others: 1, total: 120 });
});

// ---------------------------------------------------------------- payments on the real data (pinned numbers: see tests/snapshot-pin.json)
{
  const snap = P.snapshot();
  const owe = {};
  for (const pid of Object.keys(snap.players)) { const l = PAY.owed(pid, snap); if (l.length) owe[pid] = l; }
  const hist = {}; Object.values(owe).forEach(l => { hist[l.length] = (hist[l.length] || 0) + 1; });
  const total = Object.values(owe).reduce((a, l) => a + l.length, 0);
  const rows = PAY.overview(snap).rows;
  test('real data: 24 players owe at least one date (14 owe 1 · 6 owe 2 · 3 owe 3 · 1 owes 5)', () => {
    assert.equal(Object.keys(owe).length, 24);
    assert.deepEqual(hist, { 1: 14, 2: 6, 3: 3, 5: 1 });
  });
  test('real data: owed dates = 14 + 12 + 9 + 5 = 40, and the Money list\'s "not paid" adds to the same 40', () => {
    assert.equal(total, 40);
    assert.equal(rows.reduce((a, d) => a + d.notPaid, 0), 40);
  });
  test('real data: 16 match days not entered (10 before tracking + 6 since)', () => assert.equal(rows.filter(d => d.isMatch && !d.entered).length, 16));
}

// ---------------------------------------------------------------- the clock (timestamps, not a ticking counter)
{
  const M = 60000, K = 1e9;
  let s = { timer: C.kickOff(K) };
  test('kick-off: running, 0:30 in reads minute 1 (minutes round up)', () => {
    assert.equal(C.status(s), 'running');
    assert.equal(C.minute(s, K + 30000), 1);
  });
  test('10:00 on the clock reads 10\', 10:01 reads 11\'', () => {
    assert.equal(C.minute(s, K + 10 * M), 10);
    assert.equal(C.minute(s, K + 10 * M + 1000), 11);
  });
  const sPaused = { timer: C.pause(s, K + 20 * M) };
  test('a pause stops the clock (20:00 stays 20:00 five minutes later)', () => {
    assert.equal(C.fmtClock(C.elapsedMs(sPaused, K + 25 * M)), '20:00');
    assert.equal(C.phase(sPaused), 'Paused');
  });
  const sResumed = { timer: C.resume(sPaused, K + 25 * M) };
  test('resume carries on from 20:00 (paused time is left out)', () => assert.equal(C.fmtClock(C.elapsedMs(sResumed, K + 26 * M)), '21:00'));
  const sHT = { timer: C.halfTime(sResumed, K + 50 * M) };
  test('half time: paused, phase "Half time", the 2nd half is "2nd half"', () => {
    assert.equal(C.phase(sHT), 'Half time');
    assert.equal(C.phase({ timer: C.resume(sHT, K + 60 * M) }), '2nd half');
  });
  const sEnd = { timer: C.end({ timer: C.resume(sHT, K + 60 * M) }, K + 90 * M) };
  test('full time freezes the clock: 45 + 30 = 75:00, phase "Full time"', () => {
    assert.equal(C.phase(sEnd), 'Full time');
    assert.equal(C.fmtClock(C.elapsedMs(sEnd, K + 200 * M)), '75:00');
  });
  test('events can only be logged on a live clock (running or stoppage, not paused or ended)', () => {
    assert.equal(C.canLog(s), true);
    assert.equal(C.canLog(sPaused), false);
    assert.equal(C.canLog(sEnd), false);
  });
  test('a match that never kicked off has no minute', () => assert.equal(C.minute({}, K), null));
}
