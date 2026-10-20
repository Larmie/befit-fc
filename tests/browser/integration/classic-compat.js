// Phase 3 · Is the classic app still safe on data written by the new app?
// Runs classic.html's own engine (extracted by name) over the snapshot PLUS sessions the new app wrote in test mode:
//   A · Monday night (monday-session.json): small → big poles at 46', keepers, arrivals, a move, an edited event,
//       ftCheck with a fix, publishedBy, a stoppage goal, a new name-only player (needsDetails)
//   B · console builder's match (events-written.json): again:true, ownGoal, cards, penalty save, halfTime, stoppage
//   C · setup builder's night (data-written.json): saves BEFORE the switch (as if added later), big poles at 46'
//   D · the same Monday night if it had stayed on small poles (never switched)
//   E · a match started on big poles (format.start = 'big')
// For each: does classic crash, and does every player's classic number equal the new engine's? Lists every field
// that makes them differ. Pure Node, no browser, no network.
const fs = require('fs');
const path = require('path');
const classicOf = require('./classic-engine.js');
const Scoring = classicOf.Scoring;
const P = require('../../paths.js');
const B = path.join(__dirname, '..');
const OB = path.join(P.OUT);   // output of monday.js, console/match.js, setup/flow.js (run them first)
const snap = P.snapshot();
const out = [];
const say = (...a) => { const l = a.join(' '); console.log(l); out.push(l); };
const clone = v => JSON.parse(JSON.stringify(v));

function publish(sess) {           // what the new app's Publish writes
  const s = clone(sess);
  s.status = 'completed';
  const f = Scoring.storedFields(s);
  s.goals = f.goals; s.cleanSheets = f.cleanSheets;
  s.ftCheck = s.ftCheck || { status: 'published', publishedAt: 1, by: 'referee@test' };
  return s;
}

const cases = [];
// A
const mon = JSON.parse(fs.readFileSync(path.join(OB, 'integration', 'monday-session.json'), 'utf8'));
cases.push(['A Monday night (small → big at 46\')', mon]);
// B
const { liveData } = require(path.join(B, 'console', 'data.js'));
const cd = liveData();
const cEvents = JSON.parse(fs.readFileSync(path.join(OB, 'console', 'events-written.json'), 'utf8'));
const cs = cd.sessions.test_live;
cs.events = {}; cEvents.forEach(e => { const { id, ...rest } = e; cs.events[id] = rest; });
const sw = cEvents.find(e => e.type === 'save' || e.type === 'penaltySave');
cs.format = { start: 'small', switchedAt: sw ? sw.min : 60, keepers: {} };
const P = n => Object.keys(cd.players).find(k => cd.players[k].name === n);
cs.format.keepers = { green: P('Toby'), red: P('Mike') };
cs.teams.green.players[P('Toby')] && (cs.teams.green.players[P('Toby')].position = 'GK');
cases.push(['B Console match (again, own goal, cards, pen save, stoppage)', publish(cs)]);
// C
const sd = JSON.parse(fs.readFileSync(path.join(OB, 'setup', 'data-written.json'), 'utf8'));
cases.push(['C Setup night (4 saves + pen save logged BEFORE the switch)', publish(sd.session)]);
// D
const monSmall = clone(mon); monSmall.format = { start: 'small' };
Object.values(monSmall.teams).forEach(t => Object.values(t.players).forEach(e => { if (e.position === 'GK') e.position = 'MID'; }));
Object.keys(monSmall.events).forEach(k => { if (/save/i.test(monSmall.events[k].type)) delete monSmall.events[k]; });
cases.push(['D Monday night, never switched (small poles all night)', publish(monSmall)]);
// E
const monBig = clone(mon); monBig.format = { start: 'big', keepers: mon.format.keepers };
cases.push(['E Monday night started on big poles', publish(monBig)]);
// F (Phase C): small poles all night, GK-listed players KEPT as GK (the new rule: no keepers on small poles, they play as MID)
const monGk = clone(mon); monGk.format = { start: 'small' };
Object.keys(monGk.events).forEach(k => { if (/save/i.test(monGk.events[k].type)) delete monGk.events[k]; });
cases.push(['F Monday night on small poles, GK-listed players kept as GK (they play as MID)', publish(monGk)]);
// the new app's extra fields on these sessions (classic must ignore them): ftCheck.keep / flags, timer.stoppageAtHalf
const extras = sess => ({ keep: Object.keys((sess.ftCheck && sess.ftCheck.keep) || {}), flags: (sess.ftCheck && sess.ftCheck.flags) || null, stoppageAtHalf: (sess.timer || {}).stoppageAtHalf });
say('A carries: ' + JSON.stringify(extras(mon)));
// the settings root the admin writes (Blue added), from the Monday run
const monState = JSON.parse(fs.readFileSync(path.join(OB, 'integration', 'monday-state.json'), 'utf8'));
const SETTINGS = monState.settings || { teams: { blue: { name: 'Blue', colour: 'blue', order: 3, active: true } } };
say('settings root in every db below: ' + JSON.stringify(SETTINGS).slice(0, 160));

const newPlayer = { name: 'Kwesi Monday', defaultPosition: 'MID', defaultTeam: 'red', needsDetails: true, createdBy: 'referee@test', createdAt: 1 };
let crashes = 0, totalDiffRows = 0;
const fieldsSeen = new Set();
for (const [label, sess] of cases) {
  const db = clone(snap);
  db.settings = clone(SETTINGS);
  db.sessions.zz_new = sess;
  Object.keys(sess.teams).forEach(t => Object.keys(sess.teams[t].players).forEach(pid => { if (!db.players[pid]) db.players[pid] = Object.assign({}, newPlayer); }));
  let C;
  try { C = classicOf(db); } catch (e) { crashes++; say('CRASH building classic', label, e.message); continue; }
  say(`\n## ${label} · score ${Scoring.orderTeams(Scoring.teamsOf(sess)).map(t => Scoring.teamGoals(sess, t)).join('–')} · format ${JSON.stringify(Scoring.formatOf(sess)).slice(0, 80)}`);
  const diffs = [];
  try {
    for (const p of C.sessPlayers(sess)) {
      const a = C.calcMatchPoints(sess, p.pid), b = Scoring.matchPoints(sess, p.pid, db);
      if ((a && a.total) !== (b && b.total)) {
        const why = [];
        if (b.listedPos === 'GK' && b.pos !== 'GK') why.push('listed GK, plays as ' + b.pos + ' on small poles (new rule); classic scores him as a keeper'), fieldsSeen.add('GK-listed player on small poles (position)');
        if (b.pos === 'GK') {
          const allConc = Scoring.sessEvents(sess).filter(e => (e.type === 'goal' && e.team !== b.team) || (e.type === 'ownGoal' && e.benefitTeam !== b.team)).length;
          if (allConc !== b.tally.conceded) why.push(`conceded: classic counts ${allConc} (whole match), engine ${b.tally.conceded} (from ${Scoring.formatOf(sess).switchedAt}')`), fieldsSeen.add('goals conceded before the switch (events)');
          const allSv = Scoring.sessEvents(sess).filter(e => e.type === 'save' && e.playerId === p.pid).length;
          if (allSv !== b.tally.saves) why.push(`saves: classic ${allSv}, engine ${b.tally.saves}`), fieldsSeen.add('saves before the switch (events)');
          const allPs = Scoring.sessEvents(sess).filter(e => e.type === 'penaltySave' && e.playerId === p.pid).length;
          if (allPs !== b.tally.penSaves) why.push(`penalty saves: classic ${allPs}, engine ${b.tally.penSaves}`), fieldsSeen.add('saves before the switch (events)');
        }
        const csA = a.breakdown.some(x => x.label === 'CS'), csB = !!b.cleanSheet;
        if (csA !== csB) why.push(`clean sheet: classic ${csA}, engine ${csB}`), fieldsSeen.add('cleanSheets');
        diffs.push(`${p.name} (${b.pos}, ${b.team}): classic ${a.total} vs engine ${b.total} · ${why.join('; ') || 'other'}`);
      }
    }
    const statsDiff = Object.keys(db.players).filter(pid => { const a = C.calcStats(pid), b = Scoring.seasonStats(pid, db); return ['pts', 'g', 'a', 'sv', 'apps', 'y', 'r'].some(k => a[k] !== b[k]); });
    C.calcTeams(); C.calcForm(); C.calcStreak();
    const t = C.getTeamGoals(sess, 'green') + '–' + C.getTeamGoals(sess, 'red');
    say(`classic: no crash · classic score ${t} · ${C.sessPlayers(sess).length} players · ${diffs.length} player(s) differ · ${statsDiff.length} season total(s) differ`);
    diffs.forEach(d => say('   ' + d));
    totalDiffRows += diffs.length;
  } catch (e) { crashes++; say('CRASH', label, e.stack.split('\n').slice(0, 3).join(' | ')); }
}
say(`\nSUMMARY: ${cases.length} new-app matches, ${crashes} crashes, ${totalDiffRows} player rows where classic shows different points.`);
say(`Fields that change classic's numbers: ${fieldsSeen.size ? [...fieldsSeen].join('; ') : 'none'}`);
fs.writeFileSync(path.join(P.out(__dirname), 'classic-compat-result.txt'), out.join('\n') + '\n');
