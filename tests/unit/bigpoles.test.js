// Big-poles rule on made-up matches (mirrors the design's flow 3: 3–2 at half time, 5–2 at full time):
// saves, clean sheets and goals conceded count only from the switch to big poles. Node only, no browser.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Scoring = require(path.join(require('../paths.js').REPO, 'js/core/scoring.js'));
// same comparison as before: the JSON of what we got equals the JSON of what we want
const eq = (label, got, want) => test(label, () => assert.equal(JSON.stringify(got), JSON.stringify(want)));

const players = {
  toby: { name: 'Toby', defaultPosition: 'GK', defaultTeam: 'green' },
  mike: { name: 'Mike', defaultPosition: 'GK', defaultTeam: 'red' },
  harry: { name: 'Harry', defaultPosition: 'FWD', defaultTeam: 'green' },
  doku: { name: 'Doku', defaultPosition: 'DEF', defaultTeam: 'green' },
  keith: { name: 'Keith', defaultPosition: 'DEF', defaultTeam: 'red' },
  reuben: { name: 'Reuben', defaultPosition: 'MID', defaultTeam: 'red' },
};
const teams = { green: { players: { toby: { position: 'GK' }, harry: { position: 'FWD' }, doku: { position: 'DEF' } } },
                red:   { players: { mike: { position: 'GK' }, keith: { position: 'DEF' }, reuben: { position: 'MID' } } } };
let ts = 1000;
const ev = (min, type, extra) => Object.assign({ type, min, timestamp: (ts += 10000) }, extra);
const events = {
  e1: ev(9, 'goal', { team: 'green', scorerId: 'harry' }),
  e2: ev(20, 'goal', { team: 'red', scorerId: 'reuben' }),
  e3: ev(31, 'goal', { team: 'green', scorerId: 'harry' }),
  e4: ev(38, 'goal', { team: 'red', scorerId: 'reuben' }),
  e5: ev(44, 'goal', { team: 'green', scorerId: 'harry' }),       // 3–2 at half time
  s0: ev(40, 'save', { playerId: 'toby' }),                       // before the switch: must not count
  s1: ev(50, 'save', { playerId: 'toby' }), s2: ev(55, 'save', { playerId: 'toby' }),
  s3: ev(60, 'save', { playerId: 'toby' }), s4: ev(65, 'save', { playerId: 'toby' }),
  m1: ev(52, 'save', { playerId: 'mike' }), m2: ev(57, 'save', { playerId: 'mike' }),
  m3: ev(62, 'save', { playerId: 'mike' }), m4: ev(67, 'save', { playerId: 'mike' }),
  e6: ev(58, 'goal', { team: 'green', scorerId: 'harry' }),
  e7: ev(70, 'goal', { team: 'green', scorerId: 'harry' }),       // 5–2 at full time
};
const base = { date: '2026-10-19', status: 'completed', mode: 'live', teams, events };
const db = s => ({ players, sessions: { x: s } });
const pts = (s, pid) => Scoring.matchPoints(s, pid, db(s));

// A) small poles, switched at 46'
const A = Object.assign({}, base, { format: { start: 'small', switchedAt: 46, keepers: { green: 'toby', red: 'mike' } } });
eq('A Toby (2 + 1 + 8)', pts(A, 'toby').total, 11);
eq('A Toby lines', pts(A, 'toby').breakdown.map(b => `${b.label} ${b.pts}`), ['Played 2', "4 saves from 46' 1", "Clean sheet from 46' 8"]);
eq('A Mike (2 + 1, 2 conceded after switch = 0)', pts(A, 'mike').total, 3);
eq('A Mike conceded tally', pts(A, 'mike').tally.conceded, 2);
eq('A Doku DEF clean sheet from 46 (2 + 3)', pts(A, 'doku').total, 5);
eq('A Keith DEF no clean sheet', pts(A, 'keith').total, 2);
eq('A score carries over', Scoring.teamsOf(A).map(t => Scoring.teamGoals(A, t)), [5, 2]);
eq('A Harry goals unaffected (2 + 5×4)', pts(A, 'harry').total, 22);
eq('A storedFields', Scoring.storedFields(A), { goals: { green: 5, red: 2 }, cleanSheets: { green: true, red: false } });

// B) same events, no format (an old match) → big poles all match: Toby concedes 2 (−0), 5 saves (+1), no CS
const B = Object.assign({}, base, { cleanSheets: { green: false, red: false } });
eq('B legacy Toby (2 + 1)', pts(B, 'toby').total, 3);
eq('B legacy Mike (2 + 1 − 1 for 5 conceded)', pts(B, 'mike').total, 2);

// C) small poles, never switched → no saves, no conceded, no clean sheets
const C = Object.assign({}, base, { format: { start: 'small' } });
eq('C never switched Toby', pts(C, 'toby').total, 2);
eq('C never switched Doku (no CS)', pts(C, 'doku').total, 2);

// D) started on big poles → whole match counts (same as legacy maths)
const D = Object.assign({}, base, { format: { start: 'big' } });
eq('D big from kick-off Toby', pts(D, 'toby').total, 3);

// E) a goal with no minute in a switched match counts as after the switch (breaks the clean sheet)
const E = Object.assign({}, A, { events: Object.assign({}, events, { late: { type: 'goal', team: 'red', scorerId: 'reuben', timestamp: ts + 99999 } }) });
eq('E no-minute red goal breaks Toby CS', pts(E, 'toby').total, 3);

// F) full-time checks: double tap under 3 s, "+1 again" never flagged, no-minute events listed
const F = Object.assign({}, base, { events: {
  b1: { type: 'block', playerId: 'keith', min: 34, timestamp: 5000 },
  b2: { type: 'block', playerId: 'keith', min: 34, timestamp: 5680 },
  b3: { type: 'block', playerId: 'keith', min: 35, timestamp: 7000, again: true },
  b4: { type: 'block', playerId: 'doku', timestamp: 9000 } } });
const ck = Scoring.checks(F);
eq('F double taps', ck.doubleTaps.map(d => [d.a.id, d.b.id, d.gapMs]), [['b1', 'b2', 680]]);
eq('F no minute', ck.noMinute.map(e => e.id), ['b4']);

// G) points preview (Sosa-style scorer change)
const G2 = JSON.parse(JSON.stringify(A)); G2.events.e7.scorerId = 'reuben'; G2.events.e7.team = 'red';
const pv = Scoring.previewChange(db(A), 'x', G2);
eq('G preview players', pv.players.map(p => `${p.name} ${p.from}→${p.to}`), ['Toby 11→3', 'Reuben 12→17', 'Harry 22→18', 'Doku 5→2']);
eq('G preview score', pv.score, { from: { green: 5, red: 2 }, to: { green: 4, red: 3 } });

