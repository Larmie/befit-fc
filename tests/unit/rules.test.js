// Round 5 rules (Node, no browser): big poles + GK plays as MID on small poles, stoppage labels restart each half
// (46+12', not cumulative; decided 20 Oct), Adjust clock, Teams as data. Loads the real core files in a fake window.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../paths.js');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const REPO = P.REPO;
const check = (name, cond, extra) => test(name, () => assert.ok(cond, extra !== undefined ? JSON.stringify(extra) : 'false'));

// ---------------------------------------------------------------- load the core files in a fake window
const win = { BF_CONFIG: { fee: 60, currency: '₵', seasonLabel: 'Season 2026' } };
win.window = win;
const ctx = vm.createContext(win);
const load = f => vm.runInContext(fs.readFileSync(path.join(REPO, f), 'utf8'), ctx, { filename: f });
load('js/core/scoring.js');
load('js/core/clock.js');
load('js/core/teams.js');
const { Scoring: S, Clock: C, Teams: T } = win;
let NOW = new Date('2026-10-26T19:30:00').getTime();
win.Store = { now: () => NOW, state: { settings: {} } };

// ---------------------------------------------------------------- data
const players = {
  gk1: { name: 'Toby', defaultPosition: 'GK', defaultTeam: 'green' },
  gk2: { name: 'Bona', defaultPosition: 'GK', defaultTeam: 'green' },
  gk3: { name: 'Joel', defaultPosition: 'GK', defaultTeam: 'red' },
  d1: { name: 'Andrew', defaultPosition: 'DEF', defaultTeam: 'red' },
  m1: { name: 'Harry', defaultPosition: 'MID', defaultTeam: 'green' },
};
const teams = () => ({ green: { players: { gk1: { position: 'GK' }, gk2: { position: 'GK' }, m1: { position: 'MID' } } },
  red: { players: { gk3: { position: 'GK' }, d1: { position: 'DEF' } } } });
const ev = (type, o, min) => Object.assign({ type, min, timestamp: NOW + (min || 0) * 60000 }, o);
const events = () => ({
  e1: ev('goal', { team: 'green', scorerId: 'gk2' }, 5),          // a GK-position player scores on small poles
  e2: ev('block', { playerId: 'gk2' }, 6), e3: ev('block', { playerId: 'gk2' }, 7),
  e4: ev('clearance', { playerId: 'gk2' }, 8), e5: ev('clearance', { playerId: 'gk2' }, 9),
  e6: ev('save', { playerId: 'gk1' }, 10), e7: ev('save', { playerId: 'gk1' }, 11),
  e8: ev('save', { playerId: 'gk1' }, 25), e9: ev('save', { playerId: 'gk1' }, 26), e10: ev('save', { playerId: 'gk1' }, 27), e11: ev('save', { playerId: 'gk1' }, 28),
  e12: ev('goal', { team: 'red', scorerId: 'd1' }, 12),            // conceded on small poles: never counts
  e13: ev('goal', { team: 'red', scorerId: 'd1' }, 30),            // conceded after the switch: counts
  e14: ev('save', { playerId: 'gk3' }, 31),
});
const sess = format => ({ date: '2026-10-26', status: 'completed', mode: 'live', teams: teams(), events: events(), format });
const db = s => ({ players, sessions: { x: s } });
const mp = (s, pid) => S.matchPoints(s, pid, db(s));

// ---------------------------------------------------------------- A. small poles, never switched: every GK-position player is a MID
{
  const s = sess({ start: 'small' });
  const b = mp(s, 'gk2');
  // MID: played 2 + goal 5 + defence bonus floor((2 blocks × 2 + 2 clearances × 1) / 4) × 2 = 2 → 9
  check('A1 small poles: GK-position scorer scores as MID (2 + 5 + 2 = 9)', b.total === 9 && b.pos === 'MID' && b.listedPos === 'GK', b);
  check('A2 small poles: his blocks + clearances count (defence bonus +2)', b.breakdown.some(x => x.key === 'defBonus' && x.pts === 2), b.breakdown);
  const k = mp(s, 'gk1');
  check('A3 small poles: no saves, no conceded, no clean sheet for a GK-position player (just Played 2)', k.total === 2 && k.pos === 'MID' && !k.breakdown.some(x => /save|conceded|clean/i.test(x.label)), k.breakdown);
  const r = mp(s, 'gk3');
  check('A4 small poles: the other side\'s GK-position player is a MID too', r.pos === 'MID' && r.total === 2, r);
  check('A5 Scoring.playsAs agrees', S.playsAs(s, 'gk2', db(s)) === 'MID' && S.playsAs(s, 'm1', db(s)) === 'MID' && S.playsAs(s, 'd1', db(s)) === 'DEF');
}
// ---------------------------------------------------------------- B. switched to big poles at 20' with keepers: only the chosen keepers are GK
{
  const s = sess({ start: 'small', switchedAt: 20, keepers: { green: 'gk1', red: 'gk3' } });
  const k = mp(s, 'gk1');
  // GK: played 2 + saves from 20' only: 4 (25–28') → floor(4/4) = 1; conceded from 20': 1 (30') → −floor(1/3) = 0; no clean sheet → 3
  check('B1 big poles from 20\': the keeper scores as GK, saves count only from the switch (4 → +1) = 3', k.total === 3 && k.pos === 'GK' && k.tally.saves === 4, k);
  check('B2 big poles: conceded only from the switch (1, not 2)', k.tally.conceded === 1, k.tally);
  check('B3 big poles: the "from 20\'" label is on saves', k.breakdown.some(x => x.label === "4 saves from 20'"), k.breakdown);
  const o = mp(s, 'gk2');
  check('B4 big poles: a GK-position player who is NOT the keeper scores as MID (= 9)', o.pos === 'MID' && o.total === 9, o);
  const r = mp(s, 'gk3');
  check("B5 the other keeper: GK, 1 save after the switch (floor 1/4 = 0), clean sheet from 20' (Red conceded nothing) = 2 + 8 = 10", r.pos === 'GK' && r.tally.saves === 1 && r.cleanSheet && r.total === 10, r);
  const s2 = sess({ start: 'small', switchedAt: 32, keepers: { green: 'gk1', red: 'gk3' } });
  check('B6 clean sheet counts only from the switch (nothing conceded after 32\' → +8)', mp(s2, 'gk1').cleanSheet === true && mp(s2, 'gk1').breakdown.some(x => x.key === 'cleanSheet' && x.pts === 8));
}
// ---------------------------------------------------------------- C. legacy + big poles with no keepers recorded: GK stays GK (old points unchanged)
{
  const s = sess(undefined);
  check('C1 legacy (no format): GK-position players stay GK', mp(s, 'gk2').pos === 'GK' && mp(s, 'gk1').pos === 'GK');
  check('C2 legacy: a GK scorer gets the GK goal value 10 (unchanged)', mp(s, 'gk2').breakdown.some(x => x.key === 'goals' && x.pts === 10));
  const b = sess({ start: 'big' });
  check('C3 big poles from the start, no keepers recorded: GK stays GK', mp(b, 'gk1').pos === 'GK' && mp(b, 'gk2').pos === 'GK');
  const bk = sess({ start: 'big', keepers: { green: 'gk1' } });
  check('C4 big poles from the start with keepers: only the chosen keeper is GK', mp(bk, 'gk1').pos === 'GK' && mp(bk, 'gk2').pos === 'MID');
}
// ---------------------------------------------------------------- D. every real match unchanged (engine equality, short form)
{
  const snap = P.snapshot();
  const withFormat = Object.values(snap.sessions).filter(s => s.format).length;
  let gk = 0, changed = 0;
  for (const s of Object.values(snap.sessions)) for (const p of S.sessPlayers(s, snap)) {
    const m = S.matchPoints(s, p.pid, snap); if (!m) continue;
    if (p.pos === 'GK') { gk++; if (m.pos !== 'GK') changed++; }
  }
  check(`D1 real data: ${withFormat} matches carry a format, ${gk} GK rows all still score as GK`, withFormat === 0 && changed === 0 && gk > 0, { withFormat, gk, changed });
}

// ---------------------------------------------------------------- E. stoppage labels restart each half (decided 20 Oct)
{
  const M = 60000, K0 = 1e9;                                  // kick-off time (any non-zero ms)
  let s = { timer: C.kickOff(K0) };
  const at = ms => ({ ms, parts: C.minuteParts(s, K0 + ms) });
  s.timer = C.startStoppage(s, K0 + 40 * M);                       // 1st half: stoppage from 40:00 …
  const a = at(40 * M + 3.5 * M).parts;                       // … 3:30 in
  check("E1 1st half: 3:30 into stoppage at 40' reads 40+4'", a.min === 40 && a.stoppageBaseMin === 40 && a.stoppageMin === 4, a);
  s.timer = C.endStoppage(s, K0 + 44 * M);                          // 4 min of stoppage in the 1st half
  s.timer = C.halfTime(s, K0 + 49 * M);                             // regular 45:00 at half time
  check('E2 half time stores the 1st half\'s stoppage (stoppageAtHalf = 4 min)', s.timer.stoppageAtHalf === 4 * M, s.timer);
  s.timer = C.resume(s, K0 + 60 * M);
  s.timer = C.startStoppage(s, K0 + 60 * M + 15 * M);               // 2nd half: stoppage at regular 60:00
  const b = at(60 * M + 15 * M + 70000).parts;                 // 1:10 in
  check("E3 2nd half: 1:10 into stoppage at 60' reads 60+2' (restarts; the old cumulative count said 60+6')", b.min === 60 && b.stoppageBaseMin === 60 && b.stoppageMin === 2, b);
  check('E4 total tonight still adds both halves (4:00 + 1:10 = 5:10)', C.fmtClock(C.stoppageMs(s, K0 + 60 * M + 15 * M + 70000)) === '5:10' && C.fmtClock(C.halfStoppageMs(s, K0 + 60 * M + 15 * M + 70000)) === '1:10');
  check('E5 the current stoppage has run 1:10 (the 4-minute escalation reads this)', C.stoppageNowMs(s, K0 + 60 * M + 15 * M + 70000) === 70000);
  const stamped = C.stamp({ type: 'save' }, s, K0 + 60 * M + 15 * M + 70000);
  check("E6 Clock.stamp writes 60+2' on a new event", S.minuteText(stamped) === "60+2'", stamped);
  // an old timer (before round 5: no stoppageAtHalf) keeps the old cumulative count, and stored minutes never change
  const old = { timer: Object.assign({}, s.timer) }; delete old.timer.stoppageAtHalf;
  check("E7 a timer from before round 5 keeps counting as it did (60+6')", C.minuteParts(old, K0 + 60 * M + 15 * M + 70000).stoppageMin === 6);
  check("E8 events already logged keep their stored minutes (46+18' stays 46+18')", S.minuteText({ min: 46, stoppageBaseMin: 46, stoppageMin: 18 }) === "46+18'");
  // F. Adjust clock
  const adj = { timer: C.adjust(s, K0 + 60 * M + 15 * M + 70000, 57) };
  check("F1 Adjust clock from stoppage: ends the stoppage, the clock reads 57:00", adj.timer.status === 'running' && C.fmtClock(C.elapsedMs(adj, K0 + 60 * M + 15 * M + 70000)) === '57:00', adj.timer);
  check('F2 … and keeps counting from there', C.fmtClock(C.elapsedMs(adj, K0 + 60 * M + 15 * M + 70000 + 30000)) === '57:30');
  const zero = { timer: C.adjust(adj, K0 + 80 * M, 0) };
  check('F3 Reset to 0:00', C.fmtClock(C.elapsedMs(zero, K0 + 80 * M)) === '0:00' && C.fmtClock(C.elapsedMs(zero, K0 + 80 * M + 5000)) === '0:05');
  const p = { timer: C.pause({ timer: C.kickOff(K0) }, K0 + 10 * M) };
  const pa = { timer: C.adjust(p, K0 + 12 * M, 20) };
  check('F4 Adjust while paused: reads 20:00 and stays paused', pa.timer.status === 'paused' && C.fmtClock(C.elapsedMs(pa, K0 + 13 * M)) === '20:00');
}

// ---------------------------------------------------------------- G. Teams are data
{
  win.Store.state = { settings: {} };
  check('G1 no settings: Green (left) and Red (right), the fallback', T.list().map(t => t.id).join() === 'green,red' && T.name('green') === 'Green');
  check('G2 no settings: club falls back to ₵60 and 60 · 120', T.club().fee === 60 && T.club().quickAmounts.join() === '60,120' && T.club().matchDay === 1);
  win.Store.state = { settings: { club: { fee: 50, quickAmounts: [50, 100], seasonLabel: 'Season 2027' }, teams: {
    green: { name: 'Green', colour: 'green', order: 2, active: true }, red: { name: 'Red', colour: 'red', order: 3, active: true },
    blue: { name: 'Blue', colour: 'blue', order: 1, active: true }, gold: { name: 'Gold', colour: 'gold', order: 4, active: false } } } };
  check('G3 Blue added (order 1), Gold inactive: list = Blue, Green, Red', T.list().map(t => t.id).join() === 'blue,green,red', T.list());
  check('G4 all() keeps the inactive Gold for old matches', T.all().map(t => t.id).join() === 'blue,green,red,gold');
  check('G5 Scoring.orderTeams follows Settings (Blue left of Green)', S.orderTeams(['green', 'blue']).join() === 'blue,green');
  check('G6 club from Settings: ₵50, 50 · 100', T.club().fee === 50 && T.club().quickAmounts.join() === '50,100' && T.club().seasonLabel === 'Season 2027');
  check('G7 unused colours: none left (all four used)', T.unusedColours().length === 0);
  check('G8 unknown team id from an old match gets a stand-in', T.get('purple').name === 'Purple' && T.get('purple').unknown === true);
  check('G9 writeFor builds the settings path', JSON.stringify(T.writeFor({ id: 'blue', name: 'Blue', colour: 'blue', order: 3 })) === JSON.stringify({ 'settings/teams/blue': { name: 'Blue', colour: 'blue', order: 3, active: true } }));
  const st = S.teamStandings({ players: {}, sessions: {} });
  check('G10 team standings have a row for every team in Settings', ['green', 'red', 'blue', 'gold'].every(t => st[t]));
  win.Store.state = { settings: {} };
}

