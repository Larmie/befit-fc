// Pay ahead (5 Nov 2026) in the ONE payments rule (js/core/pay.js), Node only, no browser.
// Loads the real core files whole in a fake window, like core.test.js. Made-up data (no names, no money from
// the real club), then the real snapshot to prove old data behaves exactly as before.
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
for (const f of ['js/core/scoring.js', 'js/core/teams.js', 'js/core/pay.js'])
  vm.runInContext(fs.readFileSync(path.join(P.REPO, f), 'utf8'), ctx, { filename: f });
let NOW = new Date('2026-11-05T12:00:00').getTime();          // Thu 5 Nov
win.Store = { now: () => NOW, state: { settings: {} } };
const PAY = win.BF_PAY;

const players = { a: { name: 'Ama' }, b: { name: 'Bayo' }, c: { name: 'Coby' } };
const played = (date, pids) => ({ date, status: 'completed', mode: 'live',
  teams: { green: { players: Object.fromEntries(pids.map(p => [p, { position: 'MID' }])) }, red: { players: {} } } });
const ahead = (amount, at) => ({ amount, ahead: true, updatedAt: at || 1, by: 'admin@x' });
// Ama paid ahead for 9 Nov; on 9 Nov Ama, Bayo and Coby all play; nobody has taken money that night yet.
const night = () => ({
  players,
  sessions: { s1: played('2026-11-09', ['a', 'b', 'c']) },
  paymentDays: { '2026-11-09': { date: '2026-11-09', payments: { a: ahead(60) } } },
});

test('pay-ahead only: the night is NOT entered, so the others read "not entered" (not "not paid")', () => {
  const db = night();
  assert.equal(PAY.hasRecord('2026-11-09', db), false);
  assert.equal(PAY.status('b', '2026-11-09', db), 'not entered');
  assert.equal(PAY.status('c', '2026-11-09', db), 'not entered');
  assert.deepEqual([...PAY.owed('b', db)], []);
});
test('pay-ahead only: the person who paid ahead is still "paid" (register and status agree)', () => {
  const db = night();
  assert.equal(PAY.status('a', '2026-11-09', db), 'paid');
  assert.equal(PAY.amount('a', '2026-11-09', db), 60);
  const d = PAY.day('2026-11-09', db);
  assert.deepEqual({ entered: d.entered, played: d.played, paid: d.paid, paidPlayed: d.paidPlayed, notPaid: d.notPaid, total: d.total },
    { entered: false, played: 3, paid: 1, paidPlayed: 1, notPaid: 0, total: 60 });
  assert.deepEqual([...PAY.overview(db).missing.map(r => r.date)], ['2026-11-09'], 'the night still "needs recording"');
});
test('the referee saves a normal record for someone else: the night is entered, as today', () => {
  const db = night();
  db.paymentDays['2026-11-09'].payments.b = { amount: 60, updatedAt: 9, by: 'referee' };
  assert.equal(PAY.hasRecord('2026-11-09', db), true);
  assert.equal(PAY.status('c', '2026-11-09', db), 'not paid');
  assert.equal(PAY.status('a', '2026-11-09', db), 'paid');
  assert.equal(PAY.day('2026-11-09', db).notPaid, 1);
});
test('the referee edits the pay-ahead person\'s amount (a plain record): entered, as today', () => {
  const db = night();
  db.paymentDays['2026-11-09'].payments.a = { amount: 120, updatedAt: 9, by: 'referee' };
  assert.equal(PAY.hasRecord('2026-11-09', db), true);
  assert.equal(PAY.status('b', '2026-11-09', db), 'not paid');
  assert.equal(PAY.amount('a', '2026-11-09', db), 120);
});
test('old shapes stay entered: a day with no payments, a plain record, a ₵0 record, a plain number, legacy payments', () => {
  const base = () => ({ players, sessions: { s1: played('2026-10-05', ['a', 'b']) }, paymentDays: {} });
  const cases = [{ date: '2026-10-05' }, { payments: { a: { amount: 60, updatedAt: 1 } } }, { payments: { b: { amount: 0, updatedAt: 1 } } }, { payments: { a: 60 } }];
  for (const day of cases) {
    const db = base(); db.paymentDays['2026-10-05'] = day;
    assert.equal(PAY.hasRecord('2026-10-05', db), true, JSON.stringify(day));
  }
  const db = base(); db.sessions.s1.payments = { a: { amount: 60, updatedAt: 1 } };
  assert.equal(PAY.hasRecord('2026-10-05', db), true, 'legacy sessions/{sid}/payments');
  db.paymentDays['2026-10-05'] = { payments: { a: ahead(60) } };
  assert.equal(PAY.hasRecord('2026-10-05', db), true, 'legacy payments still count beside an ahead record');
});
test('Collected counts pay-ahead money: ₵60 entered + ₵180 ahead = ₵240; the newest money date is the last ahead one', () => {
  const db = { players, sessions: { s1: played('2026-11-02', ['a', 'b']) },
    paymentDays: { '2026-11-02': { payments: { b: { amount: 60, updatedAt: 1 } } },
      '2026-11-09': { payments: { a: ahead(60) } }, '2026-11-16': { payments: { a: ahead(60) } }, '2026-11-23': { payments: { a: ahead(60) } } } };
  const ov = PAY.overview(db);
  assert.equal(ov.total, 240);
  assert.equal(ov.first, '2026-11-02');
  assert.equal(ov.last, '2026-11-23');
});

test('aheadPlan: 3 weeks from Mon 9 Nov = 9, 16, 23 Nov (weekly)', () => {
  const p = PAY.aheadPlan('a', '2026-11-09', 3, { players, sessions: {}, paymentDays: {} });
  assert.deepEqual({ dates: [...p.dates], skipped: [...p.skipped] }, { dates: ['2026-11-09', '2026-11-16', '2026-11-23'], skipped: [] });
});
test('aheadPlan: a date this person already paid is skipped and the next week used (3 weeks = 3 NEW dates)', () => {
  const db = { players, sessions: {}, paymentDays: { '2026-11-16': { payments: { a: { amount: 60, updatedAt: 1 }, b: 0 } }, '2026-11-23': { payments: { a: { amount: 0, updatedAt: 1 } } } } };
  const p = PAY.aheadPlan('a', '2026-11-09', 3, db);
  assert.deepEqual({ dates: [...p.dates], skipped: [...p.skipped] }, { dates: ['2026-11-09', '2026-11-23', '2026-11-30'], skipped: ['2026-11-16'] });
  assert.deepEqual([...PAY.aheadPlan('b', '2026-11-09', 3, db).dates], ['2026-11-09', '2026-11-16', '2026-11-23'], 'another person is not skipped');
});
test('aheadPlan: 12 weeks runs across the month and the clocks going back (no day drift)', () => {
  const p = PAY.aheadPlan('a', '2026-10-19', 12, { players, sessions: {}, paymentDays: {} });
  assert.equal(p.dates.length, 12);
  assert.equal(p.dates[11], '2027-01-04');
  assert.ok(p.dates.every(d => new Date(d + 'T12:00:00').getDay() === 1), 'every date a Monday');
});
test('upcoming: later than today yes, earlier no; today yes until tonight\'s match is finished', () => {
  NOW = new Date('2026-11-09T19:00:00').getTime();
  const db = { players, sessions: {}, paymentDays: {} };
  assert.equal(PAY.upcoming('2026-11-16', db), true);
  assert.equal(PAY.upcoming('2026-11-02', db), false);
  assert.equal(PAY.upcoming('2026-11-09', db), true);
  db.sessions.s1 = played('2026-11-09', ['a']);
  assert.equal(PAY.upcoming('2026-11-09', db), false);
  NOW = new Date('2026-11-05T12:00:00').getTime();
});

// ---------------------------------------------------------------- old data behaves exactly as before
{
  const snap = P.snapshot();
  test('real data: no pay-ahead records exist yet, and "entered" = the old rule on every money date', () => {
    const all = Object.values(snap.paymentDays || {}).flatMap(d => Object.values((d && d.payments) || {}));
    assert.equal(all.filter(r => PAY.isAhead(r)).length, 0);
    const oldRule = d => !!(snap.paymentDays || {})[d] || PAY.sessionsOn(d, snap).some(([, s]) => s.payments && Object.keys(s.payments).length > 0);
    const diff = PAY.dates(snap).filter(d => PAY.hasRecord(d, snap) !== oldRule(d));
    assert.deepEqual([...diff], []);
  });
}
