// Big poles → small poles (Reuben, 25 Oct): keepers' saves, clean sheets and goals conceded count ONLY while big
// poles are on. From a switch back to small the keepers play outfield (score as MID, blocks and clearances count).
// Any number of switches: format.switches = { key: { poles:'small'|'big', at:<minute> } } after the start (and the
// first small→big switchedAt). A keeper's goal scores as GK only if it came while he was in goal on big poles.
// Made-up players and events, Node only (no browser).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Scoring = require(path.join(require('../paths.js').REPO, 'js/core/scoring.js'));
// lazy: each check computes its value inside its own test, so one missing function fails one check, not the file
const eq = (label, fn, want) => test(label, () => assert.equal(JSON.stringify(fn()), JSON.stringify(want)));

const players = {
  toby: { name: 'Toby', defaultPosition: 'GK', defaultTeam: 'green' },
  mike: { name: 'Mike', defaultPosition: 'GK', defaultTeam: 'red' },
  harry: { name: 'Harry', defaultPosition: 'FWD', defaultTeam: 'green' },
  doku: { name: 'Doku', defaultPosition: 'DEF', defaultTeam: 'green' },
  keith: { name: 'Keith', defaultPosition: 'DEF', defaultTeam: 'red' },
  reuben: { name: 'Reuben', defaultPosition: 'MID', defaultTeam: 'red' },
};
const teams = () => ({ green: { players: { toby: { position: 'GK' }, harry: { position: 'FWD' }, doku: { position: 'DEF' } } },
  red: { players: { mike: { position: 'GK' }, keith: { position: 'DEF' }, reuben: { position: 'MID' } } } });
let ts = 1000;
const ev = (min, type, extra) => Object.assign({ type, min, timestamp: (ts += 10000) }, extra);
const keepers = { green: 'toby', red: 'mike' };
const sess = (format, events) => ({ date: '2026-10-26', status: 'completed', mode: 'live', teams: teams(), events, format });
const db = s => ({ players, sessions: { x: s } });
const mp = (s, pid) => Scoring.matchPoints(s, pid, db(s));
const lines = (s, pid) => mp(s, pid).breakdown.map(b => `${b.label} ${b.pts}`);

// ---------------------------------------------------------------- 1 · big from kick-off, back to small at 60'
const ev1 = {
  s1: ev(10, 'save', { playerId: 'toby' }), s2: ev(20, 'save', { playerId: 'toby' }), s3: ev(30, 'save', { playerId: 'toby' }),
  s4: ev(40, 'save', { playerId: 'toby' }),                                          // 4 saves 0–60' → +1
  s5: ev(65, 'save', { playerId: 'toby' }), s6: ev(70, 'save', { playerId: 'toby' }),  // after 60': not counted
  s7: ev(75, 'save', { playerId: 'toby' }), s8: ev(80, 'save', { playerId: 'toby' }),
  g1: ev(62, 'goal', { team: 'red', scorerId: 'reuben' }),                           // conceded after 60': ignored
  g2: ev(66, 'goal', { team: 'red', scorerId: 'reuben' }),
  g3: ev(70, 'goal', { team: 'red', scorerId: 'reuben' }),
  b1: ev(72, 'block', { playerId: 'toby' }), b2: ev(74, 'block', { playerId: 'toby' }),   // outfield after 60': MID bonus
};
const S1 = sess({ start: 'big', keepers, switches: { k1: { poles: 'small', at: 60 } } }, ev1);
eq('1a big→small at 60\': only the 4 saves before 60\' count', () => mp(S1, 'toby').tally.saves, 4);
eq('1b goals conceded after 60\' are ignored (0 conceded)', () => mp(S1, 'toby').tally.conceded, 0);
eq('1c clean sheet judged on 0\'–60\' only: Toby keeps it', () => mp(S1, 'toby').cleanSheet, true);
eq('1d Toby = 2 + 1 (4 saves) + 8 (clean sheet 0\'–60\') + 2 (MID defence bonus for 2 blocks after 60\') = 13', () => mp(S1, 'toby').total, 13);
eq('1e the period reads right', () => lines(S1, 'toby'), ['Played 2', "4 saves 0'–60' (big poles) 1", "Defence bonus · 2 blocks 2", "Clean sheet 0'–60' (big poles) 8"]);
eq('1f Doku (DEF) clean sheet judged 0\'–60\' too (2 + 3)', () => mp(S1, 'doku').total, 5);
eq('1g score carries over (red 3 after 60\')', () => Scoring.teamsOf(S1).map(t => Scoring.teamGoals(S1, t)), [0, 3]);
eq('1h stored clean sheets follow the period', () => Scoring.storedFields(S1).cleanSheets, { green: true, red: true });
eq('1i isBigPolesEvent: 59\' big, 60\' small', () => [Scoring.isBigPolesEvent(S1, { min: 59 }), Scoring.isBigPolesEvent(S1, { min: 60 })], [true, false]);
eq('1j polesText', () => Scoring.polesText(S1), "Big poles 0'–60' · small from 60'");
eq('1k formatOf: big now = false, ever big', () => [Scoring.formatOf(S1).bigNow, Scoring.formatOf(S1).everBig], [false, true]);
eq('1l keeper is GK on the night, but plays outfield now', () => [Scoring.playsAs(S1, 'toby', db(S1)), Scoring.playsAsNow(S1, 'toby', db(S1))], ['GK', 'MID']);

// ---------------------------------------------------------------- 2 · small → big at 20' → small at 60'
const ev2 = {
  s0: ev(10, 'save', { playerId: 'toby' }),                                             // small: no
  s1: ev(25, 'save', { playerId: 'toby' }), s2: ev(30, 'save', { playerId: 'toby' }),
  s3: ev(35, 'save', { playerId: 'toby' }), s4: ev(40, 'save', { playerId: 'toby' }),    // big 20–60: 4
  s5: ev(70, 'save', { playerId: 'toby' }),                                             // small again: no
  g1: ev(15, 'goal', { team: 'red', scorerId: 'reuben' }),                              // small: ignored
  g2: ev(80, 'goal', { team: 'red', scorerId: 'reuben' }),                              // small again: ignored
  m1: ev(50, 'goal', { team: 'green', scorerId: 'harry' }),                             // Mike concedes on big
};
const S2 = sess({ start: 'small', switchedAt: 20, keepers, switches: { k1: { poles: 'small', at: 60 } } }, ev2);
eq('2a small→big→small: saves count only 20\'–60\' (4)', () => mp(S2, 'toby').tally.saves, 4);
eq('2b Toby: no goals conceded in 20\'–60\' → clean sheet', () => [mp(S2, 'toby').tally.conceded, mp(S2, 'toby').cleanSheet], [0, true]);
eq('2c Mike conceded 1 in 20\'–60\' (no clean sheet)', () => [mp(S2, 'mike').tally.conceded, mp(S2, 'mike').cleanSheet], [1, false]);
eq('2d lines read 20\'–60\'', () => lines(S2, 'toby'), ['Played 2', "4 saves 20'–60' (big poles) 1", "Clean sheet 20'–60' (big poles) 8"]);
eq('2e polesText', () => Scoring.polesText(S2), "Big poles 20'–60' · small from 60'");
// any number of switches: … → big again at 75'
const S2b = sess({ start: 'small', switchedAt: 20, keepers, switches: { k1: { poles: 'small', at: 60 }, k2: { poles: 'big', at: 75 } } }, ev2);
eq('2f small→big→small→big: the 80\' goal (big again) breaks Toby\'s clean sheet', () => [mp(S2b, 'toby').tally.conceded, mp(S2b, 'toby').cleanSheet], [1, false]);
eq('2g polesText with two big periods', () => Scoring.polesText(S2b), "Big poles 20'–60', from 75'");

// ---------------------------------------------------------------- 3 · a keeper's goal: before / during / after big poles
const ev3 = {
  a: ev(10, 'goal', { team: 'green', scorerId: 'toby' }),   // small poles (before): outfield → MID 5
  b: ev(30, 'goal', { team: 'green', scorerId: 'toby' }),   // big poles, in goal → GK 10
  c: ev(70, 'goal', { team: 'green', scorerId: 'toby' }),   // small again (after): MID 5
};
const S3 = sess({ start: 'small', switchedAt: 20, keepers, switches: { k1: { poles: 'small', at: 60 } } }, ev3);
const t3 = () => mp(S3, 'toby');
eq('3a keeper goals: before 5 (MID) + during 10 (GK) + after 5 (MID)', () => t3().breakdown.filter(b => /goal/.test(b.key)).map(b => `${b.label} ${b.pts}`), ['1 goal in goal (big poles) 10', '2 goals outfield 10']);
eq('3b Toby total = 2 + 10 + 10 + clean sheet 20\'–60\' 8 = 30', () => t3().total, 30);
// the existing small→big switch follows the same rule: a keeper's goal before the switch is an outfield goal
const S3b = sess({ start: 'small', switchedAt: 20, keepers }, { a: ev3.a, b: ev3.b });
eq('3c small→big only: goal before the switch MID 5, after GK 10', () => mp(S3b, 'toby').breakdown.filter(b => /goal/.test(b.key)).map(b => `${b.label} ${b.pts}`), ['1 goal in goal (big poles) 10', '1 goal outfield 5']);
// a keeper who never left big poles: one plain goals line, GK value (unchanged)
const S3c = sess({ start: 'big', keepers }, { b: ev3.b });
eq('3d big all match: "1 goal 10" (unchanged)', () => mp(S3c, 'toby').breakdown.filter(b => /goal/.test(b.key)).map(b => `${b.label} ${b.pts}`), ['1 goal 10']);

// ---------------------------------------------------------------- 4 · old shapes score exactly as before
const old = sess({ start: 'small', switchedAt: 46, keepers }, { s1: ev(50, 'save', { playerId: 'toby' }), s2: ev(51, 'save', { playerId: 'toby' }), s3: ev(52, 'save', { playerId: 'toby' }), s4: ev(53, 'save', { playerId: 'toby' }) });
eq('4a small→big lines keep "from 46\'"', () => lines(old, 'toby'), ['Played 2', "4 saves from 46' 1", "Clean sheet from 46' 8"]);
eq('4b polesText small→big', () => Scoring.polesText(old), "Big poles from 46'");
eq('4c polesText big / small / legacy', () => [Scoring.polesText(sess({ start: 'big' }, {})), Scoring.polesText(sess({ start: 'small' }, {})), Scoring.polesText(sess(undefined, {}))], ['Big poles', 'Small poles', '']);
eq('4d a no-op switch (to the poles already on) is ignored', () => Scoring.formatOf(sess({ start: 'big', switches: { a: { poles: 'big', at: 30 } } }, {})).periods.length, 1);
