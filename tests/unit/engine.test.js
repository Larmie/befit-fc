// Engine equality: classic.html's engine vs js/core/scoring.js on the real data (the snapshot): every season total,
// every match, every player's points, the breakdowns, team standings, form and streak. Must be 0 differences.
// Node only, no browser. Run: npm run test:unit · ENGINE_VERBOSE=1 prints the summary (table top 3, leaders …).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../paths.js');
const fs = require('fs');
const path = require('path');
const REPO = P.REPO;
const data = P.snapshot();
const src = fs.readFileSync(path.join(REPO, 'classic.html'), 'utf8');

// --- pull the classic engine out of classic.html by name (no line numbers) ---
function grab(re) {
  const m = src.match(re);
  if (!m) throw new Error('not found: ' + re);
  let i = m.index + m[0].length - 1, depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(m.index, i + 1) + (src[i + 1] === ';' ? ';' : '');
}
const parts = [
  grab(/const SCORE = \{/),
  grab(/function defActionPoints\([^)]*\) \{/),
  "const ALL_TEAMS = ['red','green','blue','gold'];",
  ...['sessPlayers', 'sessEvents', 'goalsFor', 'getTeamGoals', 'getActiveTeams', 'calcMatchPoints',
      'calcStats', 'calcTeams', 'calcStreak', 'calcForm', 'getPlayerHistory'].map(n => grab(new RegExp('function ' + n + '\\([^)]*\\) \\{'))),
];
const classic = new Function('S', parts.join('\n') + '\nreturn {calcStats,calcMatchPoints,calcTeams,calcStreak,calcForm,getPlayerHistory,sessPlayers};')(
  { players: data.players, sessions: data.sessions, paymentDays: data.paymentDays });

const Scoring = require(path.join(REPO, 'js/core/scoring.js'));
const lines = [];
const log = (...a) => lines.push(a.map(String).join(' '));
const db = { players: data.players, sessions: data.sessions, paymentDays: data.paymentDays };

let diffs = 0, checked = { players: 0, matches: 0, matchRows: 0, breakdownRows: 0 };
const found = [];
const fail = (...a) => { diffs++; if (found.length < 30) found.push(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };

// 1) every player's season total (all 7 fields)
for (const pid of Object.keys(data.players)) {
  const a = classic.calcStats(pid), b = Scoring.seasonStats(pid, db);
  for (const k of ['pts', 'g', 'a', 'sv', 'apps', 'y', 'r']) if (a[k] !== b[k]) fail('season', pid, data.players[pid].name, k, a[k], b[k]);
  checked.players++;
}
// 2) every match, every player's points (total, and breakdown adds up)
for (const [sid, sess] of Object.entries(data.sessions)) {
  checked.matches++;
  for (const p of classic.sessPlayers(sess)) {
    const a = classic.calcMatchPoints(sess, p.pid), b = Scoring.matchPoints(sess, p.pid, db);
    checked.matchRows++;
    if (a === null || b === null) { if (a !== b && !(a === null && b === null)) fail('match null', sid, p.name, a, b); continue; }
    if (a.total !== b.total) fail('match', sid, sess.date, p.name, a.total, b.total);
    const sumB = b.breakdown.reduce((s, x) => s + x.pts, 0);
    const sumA = a.breakdown.reduce((s, x) => s + x.pts, 0);
    if (sumB !== b.total || sumA !== sumB) fail('breakdown', sid, p.name, sumA, sumB, b.total);
    if (a.breakdown.length !== b.breakdown.length) fail('breakdown lines', sid, p.name, a.breakdown.map(x => x.label), b.breakdown.map(x => x.label));
    checked.breakdownRows++;
  }
}
// 3) season = carryover + sum of match points (the table re-adds)
for (const pid of Object.keys(data.players)) {
  const co = data.players[pid].carryover || {};
  let sum = co.pts || 0;
  for (const { sess } of Scoring.completedSessions(db)) { const mp = Scoring.matchPoints(sess, pid, db); if (mp && sess.mode !== 'history') sum += mp.total; }
  if (sum !== Scoring.seasonStats(pid, db).pts) fail('re-add', pid, sum);
}
// 4) team standings, form, streak
const tA = classic.calcTeams(), tB = Scoring.teamStandings(db);
for (const t of Object.keys(tA)) for (const k of Object.keys(tA[t])) if (tA[t][k] !== tB[t][k]) fail('teams', t, k, tA[t][k], tB[t][k]);
const fA = classic.calcForm(), fB = Scoring.teamForm(db);
for (const t of Object.keys(fA)) if (fA[t].join('') !== (fB[t] || []).join('')) fail('form', t, fA[t].join(''), (fB[t] || []).join(''));
const sA = classic.calcStreak(), sB = Scoring.streak(db);
if (sA.team !== sB.team || sA.count !== sB.count) fail('streak', sA, sB);

// 5) profile history: the old shortcut maths vs the one engine (expected to differ = the review.md bug)
let histRows = 0, histFixed = 0, histExample = null;
for (const pid of Object.keys(data.players)) {
  const old = classic.getPlayerHistory(pid, 999), neu = Scoring.playerHistory(pid, db);
  const byDate = {}; neu.forEach(h => { byDate[h.date + h.team] = h; });
  for (const h of old) {
    histRows++;
    const n = byDate[h.date + (Object.entries(data.sessions).find(([, s]) => s.date === h.date && classic.sessPlayers(s).some(p => p.pid === pid)) ? '' : '')];
    const m = neu.find(x => x.date === h.date);
    if (m && m.pts !== h.pts) { histFixed++; if (!histExample) histExample = `${data.players[pid].name} ${h.date}: old profile +${h.pts}, engine +${m.pts}`; }
  }
}

// 6) table selectors sanity
const table = Scoring.seasonTable(db);
const top3 = table.slice(0, 3).map(r => `${r.rank}. ${r.name} ${r.pts}`).join(' | ');
const moves = table.filter(r => r.move).length;

log('Season totals:   ', checked.players, 'players x 7 fields');
log('Match points:    ', checked.matches, 'matches,', checked.matchRows, 'player-match rows,', checked.breakdownRows, 'breakdowns re-added');
log('Teams/form/streak compared; re-add check on every player');
log('DIFFERENCES:     ', diffs);
log('Profile history: ', histRows, 'rows; the old shortcut maths disagreed on', histFixed, '(now fixed). e.g.', histExample);
log('Table top 3:     ', top3, '| last game', table.lastGame && table.lastGame.date, '| rows with movement:', moves);
log('Standings:       ', JSON.stringify({ green: tB.green, red: tB.red }));
log('Leaders:         ', JSON.stringify(Scoring.leaders(db), (k, v) => k === 'team' ? undefined : v));
if (process.env.ENGINE_VERBOSE) console.log(lines.join('\n'));

test(`classic and the new engine agree: ${checked.players} players x 7 season fields, ${checked.matches} matches, ${checked.matchRows} player-match rows (0 differences)`, () => {
  assert.equal(diffs, 0, 'differences:\n' + found.join('\n'));
});
test('the comparison really ran on the data (at least 30 matches, 50 players, 300 player-match rows)', () => {
  assert.ok(checked.matches >= 30 && checked.players >= 50 && checked.matchRows >= 300, JSON.stringify(checked));
});

