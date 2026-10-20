/* ============================================================================
   BE Fit Club · js/core/scoring.js · THE points engine (the only one)
   ----------------------------------------------------------------------------
   Every screen gets points from here. Nothing else may do its own maths.
   Pure functions over a data object `db = { players, sessions }` (Store.state
   by default), so the same file runs in the browser and in Node tests.

   Rules (unchanged from the classic app, proven identical on all real data):
     App 2 · goal GK 10 / DEF 6 / MID 5 / FWD 4 · assist 3 · own goal −2
     yellow −1 · red −3 · GK: 1 per 4 saves, penalty save +6, −1 per 3 conceded,
     clean sheet +8 · DEF: block +2, clearance +1, clean sheet +3
     MID / FWD: defence bonus +2 per 4 / 6 "def-pts" (block 2, clearance 1)

   NEW big-poles rule (decided 19 Oct): saves, penalty saves, goals conceded and
   clean sheets count only from the switch to big poles.
     sessions/{sid}/format = { start:'small'|'big', switchedAt:<minute>, keepers:{team:pid} }
     - no `format` (every old match) or start 'big' → big poles all match.
     - start 'small' + switchedAt n → big poles for events with min >= n.
       An event with no minute in a switched match counts as big poles.
     - start 'small', never switched → no saves, no conceded, no clean sheets.
   Goals always count for the score and the scorer.

   PUBLIC API (window.Scoring, or module.exports in Node)
     SCORE, TEAM_ORDER, defActionPoints(pos, blocks, clearances)
     sessPlayers(sess, db)            → [{pid,name,pos,team}]
     sessEvents(sess)                 → [{id, ...event}]
     teamsOf(sess)                    → teams in the match (stored order)
     orderTeams(teams)                → Green, Red, Blue, Gold order for display
     teamGoals(sess, team)            → goals for a team (events for live, stored for post/history)
     result(sess)                     → { teams:[{team,goals}], winner|null, draw }
     formatOf(sess)                   → { start, switchedAt, bigFrom, everBig, keepers, legacy }
     isBigPolesEvent(sess, ev)
     cleanSheet(sess, team)           → bool, under the rule above
     storedFields(sess)               → { goals, cleanSheets } to write at publish / after edits
     matchPoints(sess, pid, db)       → { pid,name,pos,team,total,breakdown:[{key,label,count,pts}],tally,cleanSheet } | null
     matchBreakdown(sess, db)         → per-team columns of matchPoints, team totals, top points
     scorers(sess, db)                → { team: [{pid,name,mins:[ev..],og}] }
     livePoints(sess, db)             → everyone in an (active) match, by points
     seasonStats(pid, db)             → { pts,g,a,sv,apps,y,r }   (== classic calcStats)
     seasonTable(db)                  → rows with rank, move since last game, last-game points
     lastGame(db)                     → { sid, sess } latest completed non-history match | null
     completedSessions(db)            → [{sid,sess}] newest first (all modes)
     playerHistory(pid, db, limit)    → [{sid,date,pos,team,pts,breakdown,tally,result,for,against}]
     teamStandings(db)                → { team: {w,d,l,gf,ga,pts,played} }  (== classic calcTeams)
     teamForm(db)                     → { team: ['W','D','L', ...] } oldest first (== calcForm)
     streak(db)                       → { team, count }                     (== calcStreak)
     leaders(db)                      → { goals, assists, saves } each { value, players:[{pid,name}] }
     checks(sess)                     → { doubleTaps:[{a,b,gapMs}], noMinute:[ev] } for the full-time check
     previewChange(db, sid, nextSess) → { players:[{pid,name,from,to,delta}], score:{from,to}|null, season:[...] }
     minuteText(ev)                   → "33'" or "45+2'" or ''
   ========================================================================== */
(function (root) {
  'use strict';

  const SCORE = {
    GK:  { app:2, goal:10, assist:3, penaltySave:6, cleanSheet:8, yellow:-1, red:-3, savePer:4, concedePer:3 },
    DEF: { app:2, goal:6,  assist:3, penaltySave:0, cleanSheet:3, yellow:-1, red:-3, block:2, clearance:1 },
    MID: { app:2, goal:5,  assist:3, penaltySave:0, cleanSheet:0, yellow:-1, red:-3, defBonusPer:4, defBonusPts:2 },
    FWD: { app:2, goal:4,  assist:3, penaltySave:0, cleanSheet:0, yellow:-1, red:-3, defBonusPer:6, defBonusPts:2 },
  };
  const OWN_GOAL = -2;
  const TEAM_ORDER = ['green', 'red', 'blue', 'gold'];
  const DOUBLE_TAP_MS = 3000;
  const LOGGABLE = ['goal','ownGoal','save','penaltySave','block','clearance','yellowCard','redCard'];

  // ---------------------------------------------------------------- basics
  function getDb(db) {
    if (db) return db;
    if (root.Store && root.Store.state) return root.Store.state;
    return { players:{}, sessions:{}, paymentDays:{} };
  }
  const modeOf = sess => (sess && sess.mode) || 'live';
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function defActionPoints(pos, blocks, clearances) {
    if (pos === 'DEF') return (blocks || 0) * 2 + (clearances || 0) * 1;
    const r = SCORE[pos];
    if (!r || !r.defBonusPer) return 0;
    const defPts = (blocks || 0) * 2 + (clearances || 0) * 1;
    return Math.floor(defPts / r.defBonusPer) * r.defBonusPts;
  }

  function sessPlayers(sess, db) {
    if (!sess || !sess.teams) return [];
    const players = getDb(db).players || {};
    const out = [];
    for (const [team, td] of Object.entries(sess.teams)) {
      for (const [pid, pd] of Object.entries((td && td.players) || {})) {
        const pl = players[pid];
        if (pl) out.push({ pid, name: pl.name, pos: pd.position, team });
      }
    }
    return out;
  }

  function sessEvents(sess) {
    if (!sess || !sess.events) return [];
    return Object.entries(sess.events).filter(([, e]) => e).map(([id, e]) => Object.assign({ id }, e));
  }

  function teamsOf(sess) {
    if (!sess) return [];
    if (modeOf(sess) === 'live') return Object.keys(sess.teams || {});
    return Object.keys(sess.goals || {}).filter(t => sess.goals[t] !== undefined);
  }

  function orderTeams(teams) {
    const rank = t => { const i = TEAM_ORDER.indexOf(t); return i < 0 ? 99 : i; };
    return [...teams].sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)));
  }

  function goalsFromEvents(sess, team) {
    return sessEvents(sess).filter(e =>
      (e.type === 'goal' && e.team === team) || (e.type === 'ownGoal' && e.benefitTeam === team)
    ).length;
  }

  function teamGoals(sess, team) {
    if (modeOf(sess) === 'live') return goalsFromEvents(sess, team);
    return ((sess.goals || {})[team]) || 0;
  }

  // Result across any number of teams. Two teams behave exactly like the classic app.
  function result(sess) {
    const teams = teamsOf(sess).map(team => ({ team, goals: teamGoals(sess, team) }));
    if (teams.length < 2) return { teams, winner: null, draw: false, valid: false };
    const max = Math.max(...teams.map(t => t.goals));
    const top = teams.filter(t => t.goals === max);
    return { teams, winner: top.length === 1 ? top[0].team : null, draw: top.length > 1, valid: true };
  }
  function outcomeFor(res, team) {
    if (!res.valid) return null;
    if (res.winner === team) return 'W';
    if (res.draw && res.teams.find(t => t.team === team && t.goals === Math.max(...res.teams.map(x => x.goals)))) return 'D';
    return 'L';
  }

  // ---------------------------------------------------------------- poles
  function formatOf(sess) {
    const f = sess && sess.format;
    if (!f || f.start !== 'small') {
      return { start: 'big', switchedAt: null, bigFrom: 0, everBig: true, keepers: (f && f.keepers) || {}, legacy: !f };
    }
    const sw = Number.isFinite(Number(f.switchedAt)) && f.switchedAt !== null && f.switchedAt !== '' ? Number(f.switchedAt) : null;
    return { start: 'small', switchedAt: sw, bigFrom: sw, everBig: sw != null, keepers: f.keepers || {}, legacy: false };
  }

  function isBigPolesEvent(sess, ev) {
    const f = formatOf(sess);
    if (!f.everBig) return false;
    if (!f.bigFrom) return true;
    if (!ev || ev.min == null) return true;
    return Number(ev.min) >= f.bigFrom;
  }

  const concedes = (ev, team) =>
    (ev.type === 'goal' && ev.team !== team) || (ev.type === 'ownGoal' && ev.benefitTeam !== team);

  function cleanSheet(sess, team) {
    if (!sess) return false;
    const f = formatOf(sess);
    if (!f.everBig) return false;
    const mode = modeOf(sess);
    if (!f.legacy && mode === 'live') {
      return !sessEvents(sess).some(e => concedes(e, team) && isBigPolesEvent(sess, e));
    }
    // Old matches: the stored value wins (that is what every total was built on).
    if (sess.cleanSheets && sess.cleanSheets[team] !== undefined) return !!sess.cleanSheets[team];
    if (mode === 'live') return !sessEvents(sess).some(e => concedes(e, team));
    return false;
  }

  // What to store on the session so the classic app (and old readers) agree.
  function storedFields(sess) {
    const teams = teamsOf(sess);
    const goals = {}, cleanSheets = {};
    teams.forEach(t => { goals[t] = teamGoals(sess, t); });
    teams.forEach(t => { cleanSheets[t] = formatOf(sess).legacy
      ? teams.every(o => o === t || goals[o] === 0)
      : cleanSheet(sess, t); });
    return { goals, cleanSheets };
  }

  // ---------------------------------------------------------------- one match
  function tallyFor(sess, pid, sp) {
    const t = { goals:0, assists:0, ogs:0, yellow:0, red:0, saves:0, penSaves:0, conceded:0, blocks:0, clearances:0 };
    const mode = modeOf(sess);
    if (mode === 'live') {
      for (const e of sessEvents(sess)) {
        switch (e.type) {
          case 'goal':
            if (e.scorerId === pid) t.goals++;
            if (e.assistId === pid) t.assists++;
            break;
          case 'ownGoal':
            if (e.scorerId === pid) t.ogs++;
            if (e.assistId === pid) t.assists++;
            break;
          case 'yellowCard':  if (e.playerId === pid) t.yellow++; break;
          case 'redCard':     if (e.playerId === pid) t.red++; break;
          case 'save':        if (e.playerId === pid && isBigPolesEvent(sess, e)) t.saves++; break;
          case 'penaltySave': if (e.playerId === pid && isBigPolesEvent(sess, e)) t.penSaves++; break;
          case 'block':       if (e.playerId === pid) t.blocks++; break;
          case 'clearance':   if (e.playerId === pid) t.clearances++; break;
        }
        if (sp.pos === 'GK' && concedes(e, sp.team) && isBigPolesEvent(sess, e)) t.conceded++;
      }
    } else {
      const ps = (sess.playerStats && sess.playerStats[pid]) || {};
      t.goals = ps.goals || 0; t.assists = ps.assists || 0;
      t.yellow = ps.yellow || 0; t.red = ps.red || 0;
      t.saves = ps.saves || 0; t.penSaves = ps.penaltySaves || 0; t.conceded = ps.conceded || 0;
    }
    return t;
  }

  function matchPoints(sess, pid, db) {
    if (!sess) return null;
    const sp = sessPlayers(sess, db).find(p => p.pid === pid);
    if (!sp) return null;
    if (modeOf(sess) === 'history') return null;
    const rules = SCORE[sp.pos];
    if (!rules) return null;
    const f = formatOf(sess);
    const from = f.switchedAt != null ? ` from ${f.switchedAt}'` : '';
    const t = tallyFor(sess, pid, sp);
    const breakdown = [];
    let total = 0;
    const add = (key, label, count, pts) => { if (pts !== 0) { breakdown.push({ key, label, count, pts }); total += pts; } };

    add('app', 'Played', 1, rules.app);
    if (t.goals)   add('goals',   plural(t.goals, 'goal'),       t.goals,   t.goals * rules.goal);
    if (t.ogs)     add('ogs',     plural(t.ogs, 'own goal'),     t.ogs,     t.ogs * OWN_GOAL);
    if (t.assists) add('assists', plural(t.assists, 'assist'),   t.assists, t.assists * rules.assist);
    if (sp.pos === 'GK') {
      add('saves', plural(t.saves, 'save') + from, t.saves, Math.floor(t.saves / rules.savePer));
      if (t.penSaves) add('penSaves', plural(t.penSaves, 'penalty save') + from, t.penSaves, t.penSaves * rules.penaltySave);
      add('conceded', `${t.conceded} conceded${from}`, t.conceded, -Math.floor(t.conceded / rules.concedePer));
    }
    if (t.yellow) add('yellow', plural(t.yellow, 'yellow card'), t.yellow, t.yellow * rules.yellow);
    if (t.red)    add('red',    plural(t.red, 'red card'),       t.red,    t.red * rules.red);
    if (sp.pos === 'DEF') {
      if (t.blocks)     add('blocks',     plural(t.blocks, 'block'),         t.blocks,     t.blocks * (rules.block || 0));
      if (t.clearances) add('clearances', plural(t.clearances, 'clearance'), t.clearances, t.clearances * (rules.clearance || 0));
    } else if (sp.pos === 'MID' || sp.pos === 'FWD') {
      const bonus = defActionPoints(sp.pos, t.blocks, t.clearances);
      const parts = [];
      if (t.blocks) parts.push(plural(t.blocks, 'block'));
      if (t.clearances) parts.push(plural(t.clearances, 'clearance'));
      add('defBonus', `Defence bonus · ${parts.join(', ')}`, t.blocks + t.clearances, bonus);
    }
    let cs = false;
    if ((sp.pos === 'GK' || sp.pos === 'DEF') && rules.cleanSheet) {
      cs = cleanSheet(sess, sp.team);
      if (cs) add('cleanSheet', 'Clean sheet' + from, 1, rules.cleanSheet);
    }
    return { pid, name: sp.name, pos: sp.pos, team: sp.team, total, breakdown, tally: t, cleanSheet: cs };
  }

  function minuteText(ev) {
    if (ev && ev.stoppageMin != null && ev.stoppageBaseMin != null) return `${ev.stoppageBaseMin}+${ev.stoppageMin}'`;
    return ev && ev.min != null ? `${ev.min}'` : '';
  }

  function matchBreakdown(sess, db) {
    const res = result(sess);
    const players = sessPlayers(sess, db).map(p => matchPoints(sess, p.pid, db)).filter(Boolean);
    const teamList = orderTeams(Array.from(new Set([...teamsOf(sess), ...players.map(p => p.team)])));
    const columns = teamList.map(team => {
      const list = players.filter(p => p.team === team).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
      return { team, goals: teamGoals(sess, team), points: list.reduce((s, p) => s + p.total, 0), players: list };
    });
    const best = players.length ? Math.max(...players.map(p => p.total)) : null;
    const top = best == null ? null : { pts: best, players: players.filter(p => p.total === best) };
    return { result: res, columns, top, format: formatOf(sess), mode: modeOf(sess), total: players.reduce((s, p) => s + p.total, 0) };
  }

  function scorers(sess, db) {
    const players = getDb(db).players || {};
    const byTeam = {};
    const evs = sessEvents(sess).filter(e => e.type === 'goal' || e.type === 'ownGoal')
      .sort((a, b) => (a.min ?? 9999) - (b.min ?? 9999) || (a.timestamp || 0) - (b.timestamp || 0));
    for (const e of evs) {
      const team = e.type === 'goal' ? e.team : e.benefitTeam;
      const og = e.type === 'ownGoal';
      const list = byTeam[team] || (byTeam[team] = []);
      let row = list.find(r => r.pid === e.scorerId && r.og === og);
      if (!row) { row = { pid: e.scorerId, name: (players[e.scorerId] || {}).name || '?', og, mins: [] }; list.push(row); }
      row.mins.push(e);
    }
    return byTeam;
  }

  function livePoints(sess, db) {
    return sessPlayers(sess, db).map(p => matchPoints(sess, p.pid, db)).filter(Boolean)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }

  // ---------------------------------------------------------------- season
  const memo = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function completedSessions(db) {
    const sessions = getDb(db).sessions || {};
    return Object.entries(sessions).filter(([, s]) => s && s.status === 'completed')
      .map(([sid, sess]) => ({ sid, sess }))
      .sort((a, b) => String(b.sess.date || '').localeCompare(String(a.sess.date || '')));
  }

  function lastGame(db) {
    const c = completedSessions(db).filter(x => modeOf(x.sess) !== 'history' && sessPlayers(x.sess, db).length > 0);
    return c[0] || null;
  }

  // One pass over every completed match; memoised per data object.
  function compute(db) {
    db = getDb(db);
    if (memo && memo.has(db)) return memo.get(db);
    const players = db.players || {};
    const totals = {};
    for (const [pid, pl] of Object.entries(players)) {
      const co = (pl && pl.carryover) || {};
      totals[pid] = { pid, pts: co.pts || 0, g: co.g || 0, a: co.a || 0, sv: co.sv || 0, apps: co.apps || 0, y: co.y || 0, r: co.r || 0 };
    }
    const perMatch = {}; // sid -> { pid -> matchPoints }
    for (const [sid, sess] of Object.entries(db.sessions || {})) {
      if (!sess || sess.status !== 'completed' || modeOf(sess) === 'history') continue;
      const m = perMatch[sid] = {};
      for (const sp of sessPlayers(sess, db)) {
        const mp = matchPoints(sess, sp.pid, db);
        if (!mp) continue;
        m[sp.pid] = mp;
        const t = totals[sp.pid];
        t.apps++; t.pts += mp.total;
        t.g += mp.tally.goals; t.a += mp.tally.assists;
        t.y += mp.tally.yellow; t.r += mp.tally.red;
        if (mp.pos === 'GK') t.sv += mp.tally.saves;
      }
    }
    const out = { totals, perMatch };
    if (memo) memo.set(db, out);
    return out;
  }

  function seasonStats(pid, db) {
    const t = compute(db).totals[pid];
    if (!t) return { g:0, a:0, sv:0, apps:0, pts:0, y:0, r:0 };
    return { g: t.g, a: t.a, sv: t.sv, apps: t.apps, pts: t.pts, y: t.y, r: t.r };
  }

  const tableSort = (a, b) => b.pts - a.pts || b.g - a.g;

  function seasonTable(db) {
    db = getDb(db);
    const { totals, perMatch } = compute(db);
    const players = db.players || {};
    const last = lastGame(db);
    const lastPts = last ? (perMatch[last.sid] || {}) : {};
    const rows = Object.keys(players).map(pid => {
      const p = players[pid], t = totals[pid];
      const lp = lastPts[pid];
      return { pid, name: p.name, pos: p.defaultPosition, team: p.defaultTeam,
        pts: t.pts, g: t.g, a: t.a, sv: t.sv, apps: t.apps, y: t.y, r: t.r,
        lastPts: lp ? lp.total : null,
        prevPts: t.pts - (lp ? lp.total : 0), prevG: t.g - (lp ? lp.tally.goals : 0) };
    });
    rows.sort(tableSort).forEach((r, i) => { r.rank = i + 1; });
    if (last) {
      const prev = [...rows].sort((a, b) => b.prevPts - a.prevPts || b.prevG - a.prevG || a.rank - b.rank);
      prev.forEach((r, i) => { r.prevRank = i + 1; r.move = r.prevRank - r.rank; });
    } else rows.forEach(r => { r.prevRank = r.rank; r.move = 0; });
    rows.lastGame = last ? { sid: last.sid, date: last.sess.date } : null;
    return rows;
  }

  function playerHistory(pid, db, limit) {
    db = getDb(db);
    const { perMatch } = compute(db);
    const out = [];
    for (const { sid, sess } of completedSessions(db)) {
      const mp = perMatch[sid] && perMatch[sid][pid];
      if (!mp) continue;
      const res = result(sess);
      const others = res.teams.filter(t => t.team !== mp.team);
      out.push({ sid, date: sess.date, pos: mp.pos, team: mp.team, pts: mp.total, breakdown: mp.breakdown, tally: mp.tally,
        result: outcomeFor(res, mp.team), for: teamGoals(sess, mp.team),
        against: others.length ? Math.max(...others.map(t => t.goals)) : null });
      if (limit && out.length >= limit) break;
    }
    return out;
  }

  function teamStandings(db) {
    db = getDb(db);
    const T = {};
    const blank = () => ({ w:0, d:0, l:0, gf:0, ga:0, pts:0, played:0 });
    TEAM_ORDER.forEach(t => { T[t] = blank(); });
    for (const sess of Object.values(db.sessions || {})) {
      if (!sess || sess.status !== 'completed') continue;
      const res = result(sess);
      if (!res.valid) continue;
      for (const { team, goals } of res.teams) {
        const row = T[team] || (T[team] = blank());
        const others = res.teams.filter(t => t.team !== team);
        row.gf += goals; row.ga += others.reduce((s, t) => s + t.goals, 0); row.played++;
        const o = outcomeFor(res, team);
        if (o === 'W') { row.w++; row.pts += 3; } else if (o === 'D') { row.d++; row.pts += 1; } else row.l++;
      }
    }
    return T;
  }

  // Oldest first; equal dates keep stored order (same as the classic app's stable sort).
  function chronological(db) {
    const sessions = getDb(db).sessions || {};
    return Object.entries(sessions).filter(([, s]) => s && s.status === 'completed')
      .map(([sid, sess]) => ({ sid, sess }))
      .sort((a, b) => String(a.sess.date || '').localeCompare(String(b.sess.date || '')));
  }

  function teamForm(db) {
    const F = {};
    for (const { sess } of chronological(db)) {
      const res = result(sess);
      if (!res.valid) continue;
      for (const { team } of res.teams) (F[team] || (F[team] = [])).push(outcomeFor(res, team));
    }
    return F;
  }

  function streak(db) {
    const list = chronological(db);
    if (!list.length) return { team: null, count: 0 };
    const lastRes = result(list[list.length - 1].sess);
    if (!lastRes.valid || !lastRes.winner) return { team: null, count: 0 };
    let count = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const r = result(list[i].sess);
      if (!r.valid) break;
      if (r.winner === lastRes.winner) count++; else break;
    }
    return { team: lastRes.winner, count };
  }

  function leaders(db) {
    db = getDb(db);
    const { totals } = compute(db);
    const players = db.players || {};
    const pick = key => {
      let value = 0, list = [];
      for (const [pid, t] of Object.entries(totals)) {
        if (t[key] > value) { value = t[key]; list = [pid]; } else if (t[key] === value && value > 0) list.push(pid);
      }
      return { value, players: list.map(pid => ({ pid, name: players[pid].name, team: players[pid].defaultTeam })) };
    };
    return { goals: pick('g'), assists: pick('a'), saves: pick('sv'), points: pick('pts') };
  }

  // ---------------------------------------------------------------- full-time check
  function checks(sess) {
    const evs = sessEvents(sess);
    const who = e => e.scorerId || e.playerId || '';
    const groups = {};
    evs.filter(e => LOGGABLE.includes(e.type)).forEach(e => {
      (groups[e.type + '|' + who(e)] = groups[e.type + '|' + who(e)] || []).push(e);
    });
    const doubleTaps = [];
    Object.values(groups).forEach(list => {
      list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      for (let i = 1; i < list.length; i++) {
        const gap = (list[i].timestamp || 0) - (list[i - 1].timestamp || 0);
        if (gap >= 0 && gap < DOUBLE_TAP_MS && !list[i].again) doubleTaps.push({ a: list[i - 1], b: list[i], gapMs: gap });
      }
    });
    const noMinute = evs.filter(e => e.type !== 'halfTime' && e.min == null);
    return { doubleTaps, noMinute };
  }

  // Points preview before an edit: compare a match (and the season) before and after.
  function previewChange(db, sid, nextSess) {
    db = getDb(db);
    const before = db.sessions[sid];
    const after = nextSess;
    const nextDb = Object.assign({}, db, { sessions: Object.assign({}, db.sessions, { [sid]: after }) });
    if (!after) delete nextDb.sessions[sid];
    const pids = new Set([...sessPlayers(before, db).map(p => p.pid), ...sessPlayers(after, nextDb).map(p => p.pid)]);
    const players = [];
    pids.forEach(pid => {
      const a = matchPoints(before, pid, db), b = matchPoints(after, pid, nextDb);
      const from = a ? a.total : 0, to = b ? b.total : 0;
      if (from !== to) players.push({ pid, name: (db.players[pid] || {}).name || '?', from, to, delta: to - from });
    });
    players.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
    const teams = orderTeams(Array.from(new Set([...teamsOf(before), ...teamsOf(after)])));
    const sFrom = {}, sTo = {};
    let scoreChanged = false;
    teams.forEach(t => { sFrom[t] = before ? teamGoals(before, t) : 0; sTo[t] = after ? teamGoals(after, t) : 0; if (sFrom[t] !== sTo[t]) scoreChanged = true; });
    const season = players.map(p => ({ pid: p.pid, name: p.name, from: seasonStats(p.pid, db).pts, to: seasonStats(p.pid, nextDb).pts }));
    return { players, score: scoreChanged ? { from: sFrom, to: sTo } : null, season };
  }

  const Scoring = {
    SCORE, OWN_GOAL, TEAM_ORDER, DOUBLE_TAP_MS,
    defActionPoints, sessPlayers, sessEvents, teamsOf, orderTeams, teamGoals, result, outcomeFor,
    formatOf, isBigPolesEvent, cleanSheet, storedFields,
    matchPoints, matchBreakdown, scorers, livePoints, minuteText,
    compute, seasonStats, seasonTable, lastGame, completedSessions, playerHistory,
    teamStandings, teamForm, streak, leaders, checks, previewChange,
  };
  root.Scoring = Scoring;
  if (typeof module !== 'undefined' && module.exports) module.exports = Scoring;
})(typeof window !== 'undefined' ? window : globalThis);
