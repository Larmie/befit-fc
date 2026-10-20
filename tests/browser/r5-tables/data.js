// Test data for the tables builder: the real snapshot, plus (blue()) Blue and Gold added the way the admin would,
// via Teams.writeFor shapes in settings/teams, and two illustrative games from the design's Blue night:
//   Mon 2 Nov  Blue 4–2 Green  (Emmanuel 12' 40' 77', Keith 58' · Harry 20', Theophilus 51')
//   Mon 9 Nov  Gold 2–2 Blue   (Reuel 33' 61' · Barnabas 18', Keith 70')
// Emmanuel + Keith usually Blue, Reuel usually Gold. TEST MODE ONLY (in-memory).
const H = require('../harness.js');
const T0 = new Date('2026-11-02T19:00:00').getTime();
function game(date, teams, goals, t0) {
  const s = { date, mode: 'live', status: 'completed', teams: {}, events: {}, goals: {}, cleanSheets: {},
    timer: { status: 'ended', startedAt: t0, endedAt: t0 + 95 * 60000, pausedTotal: 0, stoppageTotal: 0, htLogged: true } };
  for (const [team, players] of Object.entries(teams)) { s.teams[team] = { players: {} }; for (const [pid, pos] of players) s.teams[team].players[pid] = { position: pos }; s.goals[team] = 0; }
  goals.forEach(([team, pid, min], i) => { s.events['ev' + date.replace(/-/g, '') + i] = { type: 'goal', team, scorerId: pid, min, timestamp: t0 + min * 60000 }; s.goals[team]++; });
  for (const t of Object.keys(teams)) s.cleanSheets[t] = Object.keys(teams).every(o => o === t || s.goals[o] === 0);
  return s;
}
function blue() {
  const d = H.snapshot();
  d.settings = { club: { name: 'BE Fit Club', seasonLabel: 'Season 2026', fee: 60, quickAmounts: [60, 120] }, teams: {
    green: { name: 'Green', colour: 'green', order: 1, active: true }, red: { name: 'Red', colour: 'red', order: 2, active: true },
    blue: { name: 'Blue', colour: 'blue', order: 3, active: true }, gold: { name: 'Gold', colour: 'gold', order: 4, active: true } } };
  d.players.seed_p002.defaultTeam = 'blue'; d.players.seed_p010.defaultTeam = 'blue'; d.players.seed_p003.defaultTeam = 'gold';
  d.sessions.test_blue_2nov = game('2026-11-02', {
    blue: [['seed_p002', 'MID'], ['seed_p010', 'FWD'], ['seed_p047', 'GK']],
    green: [['seed_p001', 'FWD'], ['seed_p019', 'FWD'], ['seed_p016', 'DEF'], ['seed_p039', 'GK']] },
    [['blue', 'seed_p002', 12], ['green', 'seed_p001', 20], ['blue', 'seed_p002', 40], ['green', 'seed_p019', 51], ['blue', 'seed_p010', 58], ['blue', 'seed_p002', 77]], T0);
  d.sessions.test_gold_9nov = game('2026-11-09', {
    gold: [['seed_p003', 'MID'], ['seed_p018', 'MID'], ['seed_p016', 'DEF']],
    blue: [['seed_p002', 'MID'], ['seed_p010', 'FWD'], ['seed_p014', 'MID']] },
    [['blue', 'seed_p014', 18], ['gold', 'seed_p003', 33], ['gold', 'seed_p003', 61], ['blue', 'seed_p010', 70]], T0 + 7 * 86400000);
  return d;
}
module.exports = { blue, real: () => H.snapshot(), NOW_BLUE: '2026-11-10T12:00' };
