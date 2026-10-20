/* ============================================================================
   BE Fit Club · js/screens/admin.js · REFEREE HOME, SQUAD, MONEY, CAN'T CONNECT
                                                              OWNER: Phase 2 · Admin builder
   ----------------------------------------------------------------------------
   SCREENS
     'ref.home'             tab match   Referee home (Match tab when no game is active): Start tonight's game,
                            Log a past game, the admin card "New since you last looked" (published results,
                            new players to finish, money to check; seen-time per phone in BF_CONFIG.keys.lastSeen),
                            then every match as one row (→ 'ref.edit').
     'ref.pastGame'         tab match   Log a past game: date, who played per side, stats per player.
                            Writes a 'post' session exactly as classic (teams, playerStats, goals, cleanSheets).
     'ref.squad'            tab squad   Search, A–Z rows (position · team · apps, points), duplicate-name
                            warning with Review (merge a group into one), + Add.
     'ref.player' {pid}     tab squad   Edit name, position, usual team; merge into another player; delete (hold).
     'ref.money' {all?}     tab money   Tonight's register when there is a match today (unless all=1),
                            otherwise the list: Collected, match days counted against who played, + Date.
     'ref.moneyDay' {date}  tab money   The register for one date: Not paid / Paid / All, one 60 button per row,
                            save bar, Clear payment record (hold) in ⋯.
     'app.offline'          (not a page) the OfflineBar in the shell's status slot, plus the full-screen
                            "Can't connect" when the first load has no data at all.
   ACTIONS
     'admin.editPlayer' ({ pid })   open a player's details (admin card, Squad, other screens)

   DATA (all writes go through Store; nothing here talks to Firebase)
     players/{pid}                          { name, defaultPosition, defaultTeam, needsDetails?, createdBy?, createdAt? }
     sessions/{sid}                         post mode: { date, status:'completed', mode:'post', teams, playerStats, goals, cleanSheets }
     paymentDays/{date}                     { date, createdAt, updatedAt, payments: { pid: { amount, updatedAt, by } } }
     sessions/{sid}/payments (legacy)       read and merged by updatedAt, exactly as classic; cleared with the record.
   Payments only write the people whose amount changed (fixes review #15: no zeros for people you didn't touch).
   Merging a player rewrites every reference in one atomic Store.multi, refuses if both played the same
   match, and checks with Scoring that the season totals add up before writing.

   Admin rule: until Firebase Auth, Auth.isAdmin() === Auth.isReferee(). Places marked TODO(auth): admin-only.
   ========================================================================== */
(function () {
  'use strict';
  const CFG = window.BF_CONFIG;
  const esc = UI.esc, fmt = UI.fmt;
  const FEE = CFG.fee || 60;
  const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
  const MINUS = '−';
  const today = () => fmt.iso(Store.now());
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
  const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const isAdmin = () => Auth.isAdmin();            // TODO(auth): admin-only (true for every referee until Firebase Auth)

  // ---------------------------------------------------------------- small helpers
  function hdOn(ctx, name, fn) {
    const hd = document.getElementById('app-header');
    if (!hd) return;
    const h = e => { const b = e.target.closest(`[data-hd="${name}"]`); if (b) fn(b, e); };
    hd.addEventListener('click', h);
    ctx.onCleanup(() => hd.removeEventListener('click', h));
  }
  const hdBtn = (label, name) => `<button type="button" class="hd-btn" data-hd="${esc(name)}">${esc(label)}</button>`;
  const backBtn = label => `<button type="button" class="hd-btn" data-shell="back">‹ ${esc(label)}</button>`;
  const signedMoney = n => (n > 0 ? '+' : n < 0 ? MINUS : '') + fmt.money(Math.abs(n));
  const who = by => !by || by === 'referee' ? 'the referee' : String(by).includes('@') ? String(by).split('@')[0] : String(by);
  const plural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + 's')}`;

  function teamsInUse() {
    const used = new Set(['green', 'red']);
    Object.values(Store.players()).forEach(p => p && p.defaultTeam && used.add(p.defaultTeam));
    return CFG.teams.filter(t => used.has(t));
  }

  // colour squares + score, Green left (design: "Referee home and matches")
  function scoreMarks(sess) {
    const r = Scoring.result(sess);
    const teams = Scoring.orderTeams(r.teams.map(t => t.team)).map(t => r.teams.find(x => x.team === t));
    if (!teams.length) return '';
    const label = teams.map(t => `${fmt.team(t.team)} ${t.goals}`).join(', ');
    const sq = t => `<i class="adm-sq t-${esc(t.team)}"></i>`;
    const inner = teams.length === 2
      ? `${sq(teams[0])}${teams[0].goals}–${teams[1].goals}${sq(teams[1])}`
      : teams.map(t => `${sq(t)}${t.goals}`).join('<span class="adm-dash">–</span>');
    return `<span class="adm-score n" role="img" aria-label="${esc(label)}">${inner}</span>`;
  }

  // ---------------------------------------------------------------- payments model (same rules as classic)
  const amountOf = rec => { const raw = typeof rec === 'number' ? rec : rec && rec.amount; const n = Number(raw); return Number.isFinite(n) && n > 0 ? n : 0; };
  const recTime = rec => (rec && typeof rec === 'object' ? Number(rec.updatedAt) || 0 : 0);
  const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

  function sessionsOn(date, db) {
    return Object.entries((db || Store.state).sessions || {}).filter(([, s]) => s && s.date === date);
  }
  function recordsFor(date, db) {
    db = db || Store.state;
    const merged = {};
    const put = (pid, rec) => { if (rec == null) return; if (merged[pid] == null || recTime(rec) >= recTime(merged[pid])) merged[pid] = rec; };
    sessionsOn(date, db).forEach(([, s]) => Object.entries(s.payments || {}).forEach(([pid, r]) => put(pid, r)));
    Object.entries(((db.paymentDays || {})[date] || {}).payments || {}).forEach(([pid, r]) => put(pid, r));
    return merged;
  }
  // Late arrivals, as setup.js stores them: teams/{team}/players/{pid} = { position, arrived?: { at: 23 }, moved?: { from, at } }
  function arrivalMin(pd) {
    const at = pd && pd.arrived && typeof pd.arrived === 'object' ? Number(pd.arrived.at) : NaN;
    return Number.isFinite(at) && at > 0 ? at : null;
  }
  // Who played on a date (every session that day): pid → { team, pos, tag }
  function playedOn(date, db) {
    db = db || Store.state;
    const out = new Map();
    for (const [, s] of sessionsOn(date, db)) {
      const f = Scoring.formatOf(s);
      for (const [team, td] of Object.entries(s.teams || {})) {
        for (const [pid, pd] of Object.entries((td && td.players) || {})) {
          if (out.has(pid) || !(db.players || {})[pid]) continue;
          let tag = '';
          if (f.switchedAt != null && f.keepers && f.keepers[team] === pid) tag = `keeper · ${f.switchedAt}'`;
          else if (arrivalMin(pd) != null) tag = `arrived ${arrivalMin(pd)}'`;
          out.set(pid, { team, pos: pd && pd.position, tag });
        }
      }
    }
    return out;
  }
  // ONE rule for "paid / not paid / not entered" (shared with Me › Subs via window.BF_PAY):
  //   a date is "entered" when it has a payment record: paymentDays/{date} exists, or the legacy
  //   sessions/{sid}/payments on that date (3 Aug) has entries. Then someone who PLAYED with ₵0 or no
  //   amount is "not paid". A date with no record is "not entered" for everyone (nobody owes it).
  function hasRecord(date, db) {
    db = db || Store.state;
    return !!(db.paymentDays || {})[date] || sessionsOn(date, db).some(([, s]) => s.payments && Object.keys(s.payments).length > 0);
  }
  // → 'paid' | 'not paid' | 'not entered' | null (didn't play and didn't pay: nothing to say)
  function payStatus(pid, date, db) {
    db = db || Store.state;
    if (amountOf(recordsFor(date, db)[pid]) > 0) return 'paid';
    if (!playedOn(date, db).has(pid)) return null;
    return hasRecord(date, db) ? 'not paid' : 'not entered';
  }
  // Every date a player owes: [{ date }], oldest first.
  function owedDates(pid, db) {
    db = db || Store.state;
    const dates = [...new Set(Object.values(db.sessions || {}).map(s => s && s.date).filter(isDate))].sort();
    return dates.filter(d => payStatus(pid, d, db) === 'not paid');
  }
  function daySummary(date, db) {
    db = db || Store.state;
    const players = db.players || {};
    const played = playedOn(date, db);
    const recs = recordsFor(date, db);
    let total = 0, paid = 0, paidPlayed = 0;
    for (const [pid, rec] of Object.entries(recs)) {
      if (!players[pid]) continue;                     // classic counts registered players only
      const a = amountOf(rec);
      if (a > 0) { paid++; total += a; if (played.has(pid)) paidPlayed++; }
    }
    const sess = sessionsOn(date, db);
    const entered = hasRecord(date, db);
    return { date, played: played.size, paid, paidPlayed, notPaid: entered ? played.size - paidPlayed : 0, others: paid - paidPlayed, total, entered,
      isMatch: played.size > 0, active: sess.some(([, s]) => s.status === 'active') };
  }
  // Every date that matters for money: match days with players, payment days, legacy payments. Newest first.
  function moneyDates(db) {
    db = db || Store.state;
    const dates = new Set();
    Object.entries(db.paymentDays || {}).forEach(([k, d]) => { const date = (d && d.date) || k; if (isDate(date)) dates.add(date); });
    Object.values(db.sessions || {}).forEach(s => {
      if (s && isDate(s.date) && (Scoring.sessPlayers(s, db).length || Object.keys(s.payments || {}).length)) dates.add(s.date);
    });
    return [...dates].sort((a, b) => b.localeCompare(a));
  }
  function moneyOverview(db) {
    db = db || Store.state;
    const rows = moneyDates(db).map(d => daySummary(d, db));
    const withMoney = rows.filter(r => r.entered);
    const first = withMoney.length ? withMoney[withMoney.length - 1].date : null;
    const last = withMoney.length ? withMoney[0].date : null;
    const tracked = rows.filter(r => !first || r.date >= first);
    const earlier = first ? rows.filter(r => r.date < first) : [];
    const missing = tracked.filter(r => r.isMatch && !r.entered && !r.active);
    return { rows, tracked, earlier, first, last, total: withMoney.reduce((s, r) => s + r.total, 0), missing };
  }
  // Tonight = a match today (active or played), shown first on the Money tab.
  function tonightDate() {
    const act = Store.activeSession();
    if (act && isDate(act.date)) return act.date;
    const d = today();
    return sessionsOn(d).some(([, s]) => Scoring.sessPlayers(s).length) ? d : null;
  }

  // ---------------------------------------------------------------- squad model
  function dupGroups() {
    const by = {};
    Object.entries(Store.players()).forEach(([pid, p]) => {
      const k = String((p && p.name) || '').trim().toLowerCase();
      if (k) (by[k] = by[k] || []).push(pid);
    });
    return Object.values(by).filter(l => l.length > 1)
      .map(pids => ({ name: Store.player(pids[0]).name.trim(), pids: pids.sort((a, b) => Scoring.seasonStats(b).apps - Scoring.seasonStats(a).apps) }))
      .sort(byName);
  }
  function playerMeta(pid, o) {
    const p = Store.player(pid) || {};
    const st = Scoring.seasonStats(pid);
    const parts = [p.defaultPosition || 'MID', fmt.team(p.defaultTeam) || 'No team', plural(st.apps, 'app')];
    if (o && o.pts) parts.push(`${st.pts} pts`);
    return parts.join(' · ');
  }
  function similarNames(name, exceptPid) {
    const q = String(name || '').trim().toLowerCase();
    if (q.length < 2) return [];
    return Object.entries(Store.players()).filter(([pid, p]) => {
      if (pid === exceptPid || !p) return false;
      const n = String(p.name || '').trim().toLowerCase();
      return n === q || n.includes(q) || (n.length >= 3 && q.includes(n));
    }).map(([pid, p]) => ({ pid, name: p.name })).sort(byName).slice(0, 6);
  }

  // ---------------------------------------------------------------- merge (one atomic write, Scoring-checked)
  function applyUpdates(db, updates) {
    const out = clone(db);
    for (const [path, val] of Object.entries(updates)) {
      const keys = path.split('/');
      let o = out;
      for (let i = 0; i < keys.length - 1; i++) { if (!o[keys[i]] || typeof o[keys[i]] !== 'object') o[keys[i]] = {}; o = o[keys[i]]; }
      if (val === null) delete o[keys[keys.length - 1]]; else o[keys[keys.length - 1]] = clone(val);
    }
    return out;
  }
  const getIn = (db, path) => path.split('/').reduce((o, k) => (o != null && typeof o === 'object' ? o[k] : undefined), db);

  // Plan merging `src` into `dst` on `db`: { updates, conflicts:[date] }
  function mergePlan(src, dst, db) {
    const u = {}, conflicts = [];
    const sub = (obj, base) => {          // replace every string value === src (events, keepers, unknown fields)
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        if (v === src) u[`${base}/${k}`] = dst;
        else if (v && typeof v === 'object') sub(v, `${base}/${k}`);
      }
    };
    for (const [sid, s] of Object.entries(db.sessions || {})) {
      if (!s) continue;
      const base = `sessions/${sid}`;
      const teams = s.teams || {};
      const srcTeam = Object.keys(teams).find(t => teams[t] && teams[t].players && teams[t].players[src]);
      const dstIn = Object.keys(teams).some(t => teams[t] && teams[t].players && teams[t].players[dst]);
      if (srcTeam && dstIn) { conflicts.push(s.date); continue; }
      if (srcTeam) {
        u[`${base}/teams/${srcTeam}/players/${src}`] = null;
        u[`${base}/teams/${srcTeam}/players/${dst}`] = clone(teams[srcTeam].players[src]);
      }
      if (s.playerStats && s.playerStats[src] != null) {
        u[`${base}/playerStats/${src}`] = null;
        u[`${base}/playerStats/${dst}`] = clone(s.playerStats[src]);
      }
      if (s.payments && s.payments[src] != null) movePay(u, `${base}/payments`, src, dst, s.payments);
      sub(s.events, `${base}/events`);
      if (s.format) sub(s.format, `${base}/format`);
    }
    for (const [date, d] of Object.entries(db.paymentDays || {})) {
      const pay = (d && d.payments) || {};
      if (pay[src] == null) continue;
      movePay(u, `paymentDays/${date}/payments`, src, dst, pay);
    }
    const sp = (db.players || {})[src] || {}, dp = (db.players || {})[dst] || {};
    if (sp.carryover) {
      const c = Object.assign({}, dp.carryover || {});
      Object.entries(sp.carryover).forEach(([k, v]) => { c[k] = (Number(c[k]) || 0) + (Number(v) || 0); });
      u[`players/${dst}/carryover`] = c;
    }
    u[`players/${src}`] = null;
    return { updates: u, conflicts };
  }
  // Both paid the same day → amounts add up (collected money never changes). An unpaid source changes nothing.
  function combinePay(a, b) {
    if (b == null) return clone(a);
    if (!amountOf(a)) return undefined;
    return { amount: amountOf(a) + amountOf(b), updatedAt: Math.max(recTime(a), recTime(b), Store.now()) };
  }
  function movePay(u, base, src, dst, map) {
    u[`${base}/${src}`] = null;
    const c = combinePay(map[src], map[dst]);
    if (c !== undefined) u[`${base}/${dst}`] = c;
  }
  // Merge several sources into one target, on a simulated copy, then prove the totals with Scoring.
  function planMerge(srcs, dst) {
    const db0 = Store.state;
    let db = db0, updates = {}, conflicts = [];
    for (const src of srcs) {
      const p = mergePlan(src, dst, db);
      conflicts = conflicts.concat(p.conflicts);
      updates = Object.assign(updates, p.updates);
      db = applyUpdates(db, p.updates);
    }
    const keys = ['pts', 'g', 'a', 'sv', 'apps', 'y', 'r'];
    const before = [dst, ...srcs].map(pid => Scoring.seasonStats(pid, db0));
    const expect = {}; keys.forEach(k => { expect[k] = before.reduce((s, x) => s + x[k], 0); });
    const after = Scoring.seasonStats(dst, db);
    const moneyBefore = moneyOverview(db0).rows.map(r => r.total).join(), moneyAfter = moneyOverview(db).rows.map(r => r.total).join();
    const ok = keys.every(k => expect[k] === after[k]) && moneyBefore === moneyAfter;
    const inverse = {};
    Object.keys(updates).forEach(path => { const v = getIn(db0, path); inverse[path] = v === undefined ? null : clone(v); });
    return { updates, inverse, conflicts: [...new Set(conflicts)].sort(), before, after, expect, ok, nextDb: db };
  }

  // ================================================================ REF.HOME
  let seenBase;                                       // read once per app start, so the card holds steady while you click around
  function lastSeenBase() {
    if (seenBase !== undefined) return seenBase;
    let v = null;
    try { v = Number(localStorage.getItem(CFG.keys.lastSeen)) || null; localStorage.setItem(CFG.keys.lastSeen, String(Store.now())); } catch (e) { v = null; }
    seenBase = v;
    return v;
  }
  // Published at full time by the referee (fix.js): status 'completed', ftCheck = { status:'published', publishedAt,
  // by, fixes:{eid:{text,pid,delta,at,by}}, keep:{eid:true} }, plus publishedBy. Older matches have no ftCheck: seen.
  const isPublished = s => !!(s && s.status === 'completed' && s.ftCheck && s.ftCheck.status === 'published' && s.ftCheck.publishedAt);
  const publishedAt = s => Number(s.ftCheck.publishedAt) || 0;
  const fixList = s => Object.values((s.ftCheck && typeof s.ftCheck.fixes === 'object' && s.ftCheck.fixes) || {})
    .filter(f => f && typeof f === 'object').sort((a, b) => (a.at || 0) - (b.at || 0));

  function adminCard() {
    // TODO(auth): admin-only
    if (!isAdmin()) return '';
    const base = lastSeenBase();
    const list = Scoring.completedSessions().filter(x => isPublished(x.sess))
      .sort((a, b) => publishedAt(b.sess) - publishedAt(a.sess));
    const fresh = base ? list.filter(x => publishedAt(x.sess) > base) : list.slice(0, 1);
    const parts = [];
    if (fresh.length) {
      const { sid, sess } = fresh[0];
      const r = Scoring.result(sess);
      const teams = Scoring.orderTeams(r.teams.map(t => t.team)).map(t => r.teams.find(x => x.team === t));
      const fixes = fixList(sess);
      const by = sess.ftCheck.by || sess.publishedBy || null;
      parts.push(`<div class="card adm-new">
        <div class="spread"><b class="adm-new-t">Published · ${esc(fmt.date(sess.date))}</b><span class="n faint adm-new-time">${esc(fmt.time(publishedAt(sess)))}</span></div>
        <div class="adm-new-score">${UI.score({ teams, mid: '<span class="adm-ft">FT</span>' })}</div>
        <div class="adm-new-by">By ${esc(who(by))}${fixes.length ? ` · ${plural(fixes.length, 'fix', 'fixes')} at full time` : ''}</div>
        ${fixes.slice(0, 3).map(f => f.text ? `<div class="adm-new-fix">${esc(f.text)}</div>` : '').join('')}
        <div class="grid2 mt-3">${UI.btn('Open match ›', { kind: 'g', sm: true, tap: 'open-match', data: { sid } })}${UI.btn('Edit ›', { kind: 'g', sm: true, tap: 'edit', data: { sid } })}</div>
      </div>`);
      fresh.slice(1, 4).forEach(({ sid: s2, sess: x }) => parts.push(
        `<button type="button" class="card adm-line" data-tap="edit" data-sid="${esc(s2)}"><span class="grow adm-line-t">Published · ${esc(fmt.date(x.date))}</span>${scoreMarks(x)}<span class="chev">›</span></button>`));
    }
    const todo = Object.entries(Store.players()).filter(([, p]) => p && p.needsDetails);
    if (todo.length) {
      parts.push(`<button type="button" class="card adm-line" data-tap="finish"><span class="warnchip grow adm-ink">${plural(todo.length, 'new player')} to finish</span><span class="adm-line-r">position, usual team ›</span></button>`);
    }
    const ov = moneyOverview();
    const recent = ov.tracked.find(r => r.isMatch && !r.active && r.date <= today());
    if (recent && (!recent.entered || recent.paidPlayed < recent.played)) {
      parts.push(`<button type="button" class="card adm-line" data-tap="money" data-date="${esc(recent.date)}"><span class="grow adm-line-t">Money · ${esc(fmt.date(recent.date))}</span>` +
        (recent.entered ? `<span class="adm-line-r n">${recent.paidPlayed} of ${recent.played} paid</span>` : `<span class="warnchip">not entered</span>`) + `<span class="chev">›</span></button>`);
    }
    return parts.length ? `<div class="lbl">New since you last looked</div><div class="adm-stack">${parts.join('')}</div>` : '';
  }

  function openFinishList() {
    const todo = Object.entries(Store.players()).filter(([, p]) => p && p.needsDetails).map(([pid, p]) => ({ pid, name: p.name })).sort(byName);
    if (todo.length === 1) { App.action('admin.editPlayer', { pid: todo[0].pid }); return; }
    const h = UI.sheet.open({ title: 'New players to finish', cls: 'sh-admin-finish', cancel: 'Close',
      body: UI.rows(todo.map(p => UI.row({ tap: 'pick', data: { pid: p.pid }, title: p.name, meta: playerMeta(p.pid), chevron: true }))) });
    UI.on(h.el, 'pick', b => { h.close(); App.action('admin.editPlayer', { pid: b.dataset.pid }); });
  }

  App.registerScreen('ref.home', {
    tab: 'match',
    mount(el) {
      UI.on(el, 'start', () => App.go(Store.activeSessionId() ? 'ref.console' : 'ref.setup'));
      UI.on(el, 'past', () => App.go('ref.pastGame'));
      UI.on(el, 'edit', b => App.go('ref.edit', { sid: b.dataset.sid }));
      UI.on(el, 'open-match', b => App.go('player.match', { sid: b.dataset.sid }));
      UI.on(el, 'finish', openFinishList);
      UI.on(el, 'money', b => App.go('ref.moneyDay', { date: b.dataset.date }));
    },
    render(el) {
      const all = Scoring.completedSessions();
      const active = Store.activeSessionId();
      const rows = all.map(({ sid, sess }) => {
        const n = Scoring.sessPlayers(sess).length;
        return UI.row({ tap: 'edit', data: { sid }, title: fmt.date(sess.date),
          meta: n ? plural(n, 'player') : 'Score only', right: scoreMarks(sess), chevron: true });
      });
      el.innerHTML = `<div class="adm-home">
        <div class="adm-home-a">
          ${UI.btn(active ? 'Back to tonight’s game' : 'Start tonight’s game', { tap: 'start', cls: 'adm-start' })}
          ${UI.btn('Log a past game', { kind: 'g', sm: true, tap: 'past', cls: 'mt-2' })}
          <div class="adm-card-wrap">${adminCard()}</div>
        </div>
        <div class="adm-home-b">
          <div class="lbl">Matches <b class="n">${all.length}</b></div>
          ${all.length ? UI.rows(rows) : UI.empty('No matches yet', '')}
        </div>
      </div>`;
    },
  });

  // ================================================================ REF.PASTGAME (classic "Log Past Game", post mode)
  const STATS = [
    { k: 'goals', label: 'Goals' }, { k: 'assists', label: 'Assists' },
    { k: 'yellow', label: 'Yellow cards' }, { k: 'red', label: 'Red cards' },
    { k: 'saves', label: 'Saves', gk: true }, { k: 'penaltySaves', label: 'Penalty saves', gk: true }, { k: 'conceded', label: 'Conceded', gk: true },
  ];
  let past = null;
  function freshPast() {
    return { date: today(), team: 'green', teams: ['green', 'red'], picks: {}, q: '' };
  }
  function pastTally(pk) {
    const bits = [];
    if (pk.goals) bits.push(plural(pk.goals, 'goal'));
    if (pk.assists) bits.push(plural(pk.assists, 'assist'));
    if (pk.pos === 'GK' && pk.saves) bits.push(plural(pk.saves, 'save'));
    if (pk.yellow) bits.push(plural(pk.yellow, 'yellow'));
    if (pk.red) bits.push(plural(pk.red, 'red'));
    return [pk.pos, ...bits].join(' · ');
  }
  function pastGoals() {
    const goals = {};
    past.teams.forEach(t => { goals[t] = 0; });
    Object.values(past.picks).forEach(pk => { goals[pk.team] = (goals[pk.team] || 0) + (pk.goals || 0); });
    return goals;
  }
  function pastPayload() {
    const teams = {}, playerStats = {}, goals = {};
    for (const [pid, pk] of Object.entries(past.picks)) {
      if (!Store.player(pid)) continue;
      (teams[pk.team] = teams[pk.team] || { players: {} }).players[pid] = { position: pk.pos };
      const st = { played: true, goals: pk.goals || 0, assists: pk.assists || 0, yellow: pk.yellow || 0, red: pk.red || 0 };
      if (pk.pos === 'GK') Object.assign(st, { saves: pk.saves || 0, penaltySaves: pk.penaltySaves || 0, conceded: pk.conceded || 0 });
      playerStats[pid] = st;
      goals[pk.team] = (goals[pk.team] || 0) + st.goals;
    }
    const tKeys = Object.keys(teams);
    const cleanSheets = {};
    tKeys.forEach(t => { cleanSheets[t] = tKeys.every(o => o === t || goals[o] === 0); });
    return { date: past.date, status: 'completed', mode: 'post', teams, playerStats, goals, cleanSheets,
      createdBy: Auth.by(), createdAt: Store.now() };
  }
  function pastCounts() {
    const c = {}; past.teams.forEach(t => { c[t] = 0; });
    Object.values(past.picks).forEach(pk => { c[pk.team] = (c[pk.team] || 0) + 1; });
    return c;
  }
  function paintPast(el) {
    const goals = pastGoals();
    const counts = pastCounts();
    const teams = Scoring.orderTeams(past.teams);
    const n = Object.keys(past.picks).length;
    const clash = sessionsOn(past.date).length;
    const q = past.q.trim().toLowerCase();
    const mine = Object.entries(past.picks).filter(([, pk]) => pk.team === past.team)
      .map(([pid, pk]) => ({ pid, pk, name: (Store.player(pid) || {}).name || '?' })).sort(byName);
    const pool = Object.entries(Store.players()).filter(([pid, p]) => p && !past.picks[pid])
      .map(([pid, p]) => ({ pid, name: p.name, team: p.defaultTeam, pos: p.defaultPosition }))
      .filter(p => q ? String(p.name).toLowerCase().includes(q) : p.team === past.team).sort(byName);
    const set = (part, html) => { const x = el.querySelector(`[data-part="${part}"]`); if (x) x.innerHTML = html; };
    set('addlbl', `Add to ${esc(fmt.team(past.team))}`);
    set('clash', clash ? `<div class="flag mt-2">${esc(fmt.date(past.date))} already has a match</div>` : '');
    set('score', UI.score({ teams: teams.map(t => ({ team: t, goals: goals[t] || 0 })), mid: '<span class="adm-ft">FT</span>' }));
    set('teams', UI.teamSwitch('pg-team', teams.map(t => ({ team: t, count: counts[t] || 0 })), past.team, { ref: true }) +
      (past.teams.length < CFG.teams.length ? `<button type="button" class="link adm-addteam" data-tap="pg-addteam">+ ${esc(fmt.team(CFG.teams.find(t => !past.teams.includes(t))))} team</button>` : ''));
    set('mine', mine.length
      ? `<div class="lbl">Played for ${esc(fmt.team(past.team))} <b class="n">${mine.length}</b></div>` +
        UI.rows(mine.map(m => UI.row({ tap: 'pg-edit', data: { pid: m.pid }, title: m.name, meta: pastTally(m.pk), chevron: true })))
      : '');
    set('pool', (pool.length
      ? UI.rows(pool.slice(0, q ? 40 : 60).map(p => UI.row({ tap: 'pg-add', data: { pid: p.pid }, title: p.name,
          meta: `${p.pos || 'MID'} · ${fmt.team(p.team) || 'No team'}`, right: `<span class="adm-plus">${UI.icon('plus')}</span>` })))
      : UI.empty(q ? `No one called "${past.q.trim()}"` : 'Everyone’s picked', '')));
    set('save', UI.btn(n ? `Save game · ${plural(n, 'player')}` : 'Save game', { big: true, tap: 'pg-save', attrs: n ? '' : ' disabled' }));
  }
  function openStatSheet(el, pid) {
    const pk = past.picks[pid]; if (!pk) return;
    const name = (Store.player(pid) || {}).name || '?';
    const body = () => `<div class="lbl">Position</div>${UI.seg('pg-pos', POSITIONS.map(p => ({ value: p, label: p })), pk.pos, { ref: true })}
      <div class="lbl mt-4">${esc(fmt.team(pk.team))}</div>
      <div class="rows adm-steps">${STATS.filter(s => !s.gk || pk.pos === 'GK').map(s => `<div class="r"><span class="grow nm">${esc(s.label)}</span>
        <button type="button" class="step" data-tap="pg-dec" data-k="${s.k}" aria-label="One fewer ${esc(s.label)}">${MINUS}</button>
        <span class="n adm-stepv">${pk[s.k] || 0}</span>
        <button type="button" class="step" data-tap="pg-inc" data-k="${s.k}" aria-label="One more ${esc(s.label)}">+</button></div>`).join('')}</div>`;
    const h = UI.sheet.open({ title: name, cls: 'sh-admin-stats', body: body(),
      footer: UI.btn('Done', { tap: 'pg-done' }) + `<button type="button" class="link warn adm-center" data-tap="pg-remove">Remove from this game</button>` });
    const redraw = () => { h.setBody(body()); paintPast(el); };
    UI.onSeg(h.el, 'pg-pos', v => { pk.pos = v; redraw(); });
    UI.on(h.el, 'pg-inc', b => { pk[b.dataset.k] = (pk[b.dataset.k] || 0) + 1; redraw(); });
    UI.on(h.el, 'pg-dec', b => { pk[b.dataset.k] = Math.max(0, (pk[b.dataset.k] || 0) - 1); redraw(); });
    UI.on(h.el, 'pg-done', () => h.close());
    UI.on(h.el, 'pg-remove', () => { delete past.picks[pid]; h.close(); paintPast(el); });
  }

  App.registerScreen('ref.pastGame', {
    tab: 'match',
    header: () => ({ left: backBtn('Match'), center: 'Log a past game', right: '' }),
    mount(el) {
      if (!past) past = freshPast();
      el.addEventListener('input', e => {
        if (e.target.matches('[data-search="pg"]')) { past.q = e.target.value; paintPast(el); }
      });
      el.addEventListener('change', e => {
        if (e.target.matches('[data-pg-date]') && isDate(e.target.value)) { past.date = e.target.value; paintPast(el); }
      });
      UI.onSeg(el, 'pg-team', v => { past.team = v; paintPast(el); });
      UI.on(el, 'pg-addteam', () => { const t = CFG.teams.find(x => !past.teams.includes(x)); if (t) { past.teams.push(t); past.team = t; paintPast(el); } });
      UI.on(el, 'pg-add', b => {
        const p = Store.player(b.dataset.pid); if (!p) return;
        past.picks[b.dataset.pid] = { team: past.team, pos: POSITIONS.includes(p.defaultPosition) ? p.defaultPosition : 'MID' };
        paintPast(el);
      });
      UI.on(el, 'pg-edit', b => openStatSheet(el, b.dataset.pid));
      UI.on(el, 'pg-save', b => {
        if (!Object.keys(past.picks).length) return;
        const data = pastPayload();
        const sid = Store.newKey(), path = 'sessions/' + sid;
        const g = Scoring.orderTeams(Object.keys(data.goals)).map(t => data.goals[t]).join('–');
        Save.run({
          label: `Past game · ${fmt.date(data.date)} · ${g}`, button: b, group: el,
          write: () => Store.set(path, data), undo: () => Store.remove(path),
          onSaved: () => { past = null; App.go('ref.home', {}, { replace: true }); },
        });
      });
    },
    render(el) {
      if (!past) past = freshPast();
      el.innerHTML = `<div class="adm-narrow">
        <label class="inp adm-date"><span class="adm-date-l">Date</span><input type="date" data-pg-date value="${esc(past.date)}" max="${esc(today())}" aria-label="Date of the game"></label>
        <div data-part="clash"></div>
        <div class="card mt-3" data-part="score"></div>
        <div class="mt-4" data-part="teams"></div>
        <div class="mt-3" data-part="mine"></div>
        <div class="lbl mt-6" data-part="addlbl"></div>
        ${UI.search({ name: 'pg', placeholder: 'Search everyone', value: past.q })}
        <div class="mt-2" data-part="pool"></div>
        <div class="mt-6" data-part="save"></div>
      </div>`;
      paintPast(el);
    },
    onData(el) { paintPast(el); },
  });

  // ================================================================ REF.SQUAD + REF.PLAYER
  function squadRows(q, selPid) {
    const s = String(q || '').trim().toLowerCase();
    const list = Object.entries(Store.players()).filter(([, p]) => p)
      .map(([pid, p]) => ({ pid, name: p.name, p }))
      .filter(x => !s || String(x.name).toLowerCase().includes(s)).sort(byName);
    if (!list.length) return UI.empty(`No one called "${String(q).trim()}"`, '') + `<div class="mt-2">${UI.btn(`Add “${String(q).trim()}”`, { kind: 'g', sm: true, tap: 'add', data: { name: String(q).trim() } })}</div>`;
    return UI.rows(list.map(x => {
      const st = Scoring.seasonStats(x.pid);
      const meta = esc(playerMeta(x.pid)) + (x.p.needsDetails ? ` · <span class="adm-warn">details to finish</span>` : '');
      return UI.row({ tap: 'open', data: { pid: x.pid }, title: x.name, metaHtml: meta, pts: st.pts, chevron: true, sel: x.pid === selPid });
    }));
  }
  function dupCard(groups) {
    if (!groups.length) return '';
    return `<button type="button" class="card adm-line mt-3" data-tap="dups"><span class="warnchip grow adm-ink">${plural(groups.length, 'name')} used twice or more</span><span class="adm-line-r">Review ›</span></button>`;
  }
  function squadList(el, selPid) {
    const st = el._sq || (el._sq = { q: '' });
    const n = Object.keys(Store.players()).length;
    return `${UI.search({ name: 'squad', placeholder: `Search ${n} players`, value: st.q })}
      ${dupCard(dupGroups())}
      <div class="lbl mt-6">A–Z <b>pts</b></div>
      <div data-part="list">${squadRows(st.q, selPid)}</div>`;
  }
  function wireSquadList(el, ctx) {
    el.addEventListener('input', e => {
      if (!e.target.matches('[data-search="squad"]')) return;
      const st = el._sq || (el._sq = { q: '' });
      st.q = e.target.value;
      const list = el.querySelector('[data-part="list"]');
      if (list) list.innerHTML = squadRows(st.q, ctx.params && ctx.params.pid);
    });
    UI.on(el, 'open', b => {
      if (ctx.id === 'ref.player') App.go('ref.player', { pid: b.dataset.pid }, { replace: true });
      else App.go('ref.player', { pid: b.dataset.pid });
    });
    UI.on(el, 'dups', () => openDupReview());
    UI.on(el, 'add', b => openAddPlayer(b.dataset.name || ''));
  }

  function dupReviewHtml() {
    const groups = dupGroups();
    if (!groups.length) return UI.empty('No names used twice', '');
    return groups.map((g, i) => `<div class="lbl${i ? ' mt-6' : ''}">${esc(g.name)} <b class="n">×${g.pids.length}</b></div>` +
      UI.rows(g.pids.map(pid => UI.row({ tap: 'dup-open', data: { pid }, title: Store.player(pid).name, meta: playerMeta(pid, { pts: true }), chevron: true }))) +
      `<div class="mt-2">${UI.btn(`Merge into one ${g.name}`, { kind: 'o', sm: true, tap: 'dup-merge', data: { name: g.name } })}</div>`).join('');
  }
  function openDupReview() {
    // TODO(auth): admin-only
    const h = UI.sheet.open({ title: 'Names used twice', cls: 'sh-admin-dups', body: dupReviewHtml(), cancel: 'Close' });
    UI.on(h.el, 'dup-open', b => { h.close(); App.action('admin.editPlayer', { pid: b.dataset.pid }); });
    UI.on(h.el, 'dup-merge', b => {
      const g = dupGroups().find(x => x.name === b.dataset.name);
      if (!g) return;
      h.close();
      openMergeConfirm(g.pids.slice(1), g.pids[0], { pickKeep: g.pids });
    });
  }

  // Merge confirm sheet: srcs → dst. pickKeep: let the admin choose which one stays (duplicate groups).
  function openMergeConfirm(srcs, dst, o) {
    // TODO(auth): admin-only
    o = o || {};
    let keep = dst, from = srcs.slice();
    let h = null;
    const body = () => {
      const plan = planMerge(from, keep);
      const kp = Store.player(keep) || {};
      const lines = [keep, ...from].map(pid => {
        const s = Scoring.seasonStats(pid);
        return `<div class="dr"><span>${esc((Store.player(pid) || {}).name)} <span class="faint">${esc(playerMeta(pid))}</span></span><b>${s.pts} pts</b></div>`;
      }).join('');
      const keepSeg = o.pickKeep ? `<div class="lbl">Keep</div><div class="rows">${o.pickKeep.map(pid => UI.row({ tap: 'keep', data: { pid },
        title: (Store.player(pid) || {}).name, meta: playerMeta(pid, { pts: true }), right: pid === keep ? '<span class="tick-on" aria-label="Kept">✓</span>' : '' })).join('')}</div>` : '';
      const res = plan.conflicts.length
        ? `<div class="flag mt-3">Both played on ${esc(plan.conflicts.map(d => fmt.date(d)).join(', '))}</div>`
        : !plan.ok ? `<div class="flag mt-3">Points don’t add up · not merged</div>`
        : `<div class="delta">${lines}<div class="dr adm-total"><span>${esc(kp.name)} after</span><b>${plural(plan.after.apps, 'app')} · ${plan.after.pts} pts</b></div></div>`;
      return keepSeg + res;
    };
    const blocked = () => { const p = planMerge(from, keep); return p.conflicts.length || !p.ok; };
    h = UI.sheet.open({ title: o.pickKeep ? `Merge ${plural(o.pickKeep.length, 'player')}` : 'Merge players', cls: 'sh-admin-merge', body: body(),
      footer: UI.btn(`Merge into ${(Store.player(keep) || {}).name}`, { tap: 'do-merge' }), cancel: true });
    const refresh = () => {
      h.setBody(body());
      const btn = h.el.querySelector('[data-tap="do-merge"]');
      btn.textContent = `Merge into ${(Store.player(keep) || {}).name}`;
      btn.disabled = !!blocked();
    };
    refresh();
    UI.on(h.el, 'keep', b => { keep = b.dataset.pid; from = o.pickKeep.filter(p => p !== keep); refresh(); });
    UI.on(h.el, 'do-merge', b => {
      const plan = planMerge(from, keep);
      if (plan.conflicts.length || !plan.ok) return;
      const name = (Store.player(keep) || {}).name;
      Save.run({
        label: `Merged into ${name} · ${plan.after.pts} pts`, button: b, group: h.el,
        write: () => Store.multi(plan.updates), undo: () => Store.multi(plan.inverse),
        onSaved: () => { h.close(); App.go('ref.player', { pid: keep }, { replace: App.current().id === 'ref.player' }); },
      });
    });
    return h;
  }

  function openMergePicker(src) {
    const me = Store.player(src); if (!me) return;
    const draw = q => {
      const s = String(q || '').trim().toLowerCase();
      const same = dupGroups().find(g => g.pids.includes(src));
      const samePids = same ? same.pids.filter(p => p !== src) : [];
      const others = Object.entries(Store.players()).filter(([pid, p]) => p && pid !== src && !samePids.includes(pid))
        .filter(([, p]) => !s || String(p.name).toLowerCase().includes(s)).map(([pid, p]) => ({ pid, name: p.name })).sort(byName);
      const row = pid => UI.row({ tap: 'into', data: { pid }, title: Store.player(pid).name, meta: playerMeta(pid, { pts: true }), chevron: true });
      return (samePids.length && !s ? `<div class="lbl">Same name</div>${UI.rows(samePids.map(row))}<div class="lbl mt-6">Everyone</div>` : '') +
        (others.length ? UI.rows(others.slice(0, 40).map(p => row(p.pid))) : UI.empty(`No one called "${String(q).trim()}"`, ''));
    };
    const h = UI.sheet.open({ title: `Merge ${me.name} into…`, cls: 'sh-admin-pick', cancel: true, autofocus: false,
      body: (b) => { b.innerHTML = `${UI.search({ name: 'into', placeholder: 'Search players' })}<div class="mt-3" data-part="into">${draw('')}</div>`; } });
    h.el.addEventListener('input', e => { if (e.target.matches('[data-search="into"]')) h.el.querySelector('[data-part="into"]').innerHTML = draw(e.target.value); });
    UI.on(h.el, 'into', b => { h.close(); openMergeConfirm([src], b.dataset.pid); });
  }

  function openAddPlayer(prefill) {
    // TODO(auth): admin-only
    const st = { name: prefill || '', pos: 'MID', team: teamsInUse()[0] || 'green' };
    const matches = () => {
      const m = similarNames(st.name);
      return m.length ? `<div class="lbl mt-3">Already in the squad</div>` + UI.rows(m.map(p => UI.row({ tap: 'twin', data: { pid: p.pid }, title: p.name, meta: playerMeta(p.pid), chevron: true }))) : '';
    };
    const h = UI.sheet.open({ title: 'Add a player', cls: 'sh-admin-add',
      body: `<label class="inp"><input type="text" data-add-name autocomplete="off" autocapitalize="words" placeholder="Name" aria-label="Name" value="${esc(st.name)}"></label>
        <div data-part="twins">${matches()}</div>
        <div class="lbl mt-4">Position</div>${UI.seg('add-pos', POSITIONS.map(p => ({ value: p, label: p })), st.pos, { ref: true })}
        <div class="lbl mt-4">Usual team</div>${UI.seg('add-team', teamsInUse().map(t => ({ value: t, label: fmt.team(t), team: t })), st.team, { ref: true })}`,
      footer: UI.btn('Add player', { tap: 'add-save' }), cancel: true });
    const input = h.el.querySelector('[data-add-name]');
    input.addEventListener('input', () => { st.name = input.value; h.el.querySelector('[data-part="twins"]').innerHTML = matches(); });
    UI.onSeg(h.el, 'add-pos', v => { st.pos = v; });
    UI.onSeg(h.el, 'add-team', v => { st.team = v; });
    UI.on(h.el, 'twin', b => { h.close(); App.action('admin.editPlayer', { pid: b.dataset.pid }); });
    UI.on(h.el, 'add-save', b => {
      const name = st.name.trim().replace(/\s+/g, ' ');
      if (!name) { input.focus(); UI.toast('Type a name', { err: true }); return; }
      const pid = Store.newKey(), path = 'players/' + pid;
      Save.run({
        label: `Added ${name}`, button: b, group: h.el,
        write: () => Store.set(path, { name, defaultPosition: st.pos, defaultTeam: st.team, createdBy: Auth.by(), createdAt: Store.now() }),
        undo: () => Store.remove(path),
        onSaved: () => h.close(),
      });
    });
    return h;
  }

  App.registerScreen('ref.squad', {
    tab: 'squad',
    header: () => ({ center: 'Squad', right: hdBtn('+ Add', 'add') }),
    mount(el, ctx) {
      wireSquadList(el, ctx);
      hdOn(ctx, 'add', () => openAddPlayer(''));
      UI.on(el, 'dup-open', b => App.action('admin.editPlayer', { pid: b.dataset.pid }));
      UI.on(el, 'dup-merge', b => { const g = dupGroups().find(x => x.name === b.dataset.name); if (g) openMergeConfirm(g.pids.slice(1), g.pids[0], { pickKeep: g.pids }); });
    },
    render(el, ctx) {
      el.innerHTML = ctx.wide
        ? `<div class="split"><div>${squadList(el)}</div><div class="split-side adm-side">${dupGroups().length ? `<div class="card">${dupReviewHtml()}</div>` : ''}</div></div>`
        : squadList(el);
    },
  });

  // ---- one player
  function editorHtml(el, pid) {
    const p = Store.player(pid);
    if (!p) return UI.empty('Player not found', '');
    const f = el._form && el._form.pid === pid ? el._form : (el._form = { pid, name: p.name, pos: p.defaultPosition || 'MID', team: p.defaultTeam || 'green' });
    const st = Scoring.seasonStats(pid);
    const twins = similarNames(f.name, pid);
    const teams = teamsInUse(); if (f.team && !teams.includes(f.team)) teams.push(f.team);
    const dirty = f.name.trim() !== p.name || f.pos !== p.defaultPosition || f.team !== p.defaultTeam || p.needsDetails;
    return `<div class="adm-ed">
      <div class="head adm-ed-name">${esc(p.name)}</div>
      <div class="adm-ed-meta"><span>${esc(playerMeta(pid))} · <span class="n">${st.pts}</span> pts</span>
        <button type="button" class="link" data-tap="profile">Profile ›</button></div>
      ${p.needsDetails ? `<div class="flag mt-3">New player · details to finish</div>` : ''}
      <div class="lbl mt-6">Name</div>
      <label class="inp"><input type="text" data-ed-name autocomplete="off" autocapitalize="words" value="${esc(f.name)}" aria-label="Name"></label>
      <div data-part="twins">${twinsHtml(twins)}</div>
      <div class="lbl mt-4">Position</div>${UI.seg('ed-pos', POSITIONS.map(x => ({ value: x, label: x })), f.pos, { ref: true })}
      <div class="lbl mt-4">Usual team</div>${UI.seg('ed-team', teams.map(t => ({ value: t, label: fmt.team(t), team: t })), f.team, { ref: true })}
      <div class="mt-4">${UI.btn('Save', { tap: 'ed-save', attrs: dirty ? '' : ' disabled', data: { pid } })}</div>
      <div class="lbl mt-6">Same person twice?</div>
      ${UI.btn('Merge into another player ›', { kind: 'g', sm: true, tap: 'ed-merge' })}
      <div class="mt-6">${st.apps ? `<div class="flag adm-delflag">${plural(st.apps, 'app')} · ${st.pts} pts leave the table</div>` : ''}
        ${UI.hold('Hold to delete player', { name: 'ed-delete', warn: true, doneText: 'Deleting…' })}</div>
    </div>`;
  }
  const twinsHtml = twins => twins.length ? `<div class="adm-twins"><span class="warnchip">Also in the squad</span> ${twins.map(t =>
    `<button type="button" class="link adm-twin" data-tap="open" data-pid="${esc(t.pid)}">${esc(t.name)}</button>`).join('')}</div>` : '';
  function refreshSaveBtn(el, pid) {
    const p = Store.player(pid), f = el._form; if (!p || !f) return;
    const dirty = f.name.trim() !== p.name || f.pos !== p.defaultPosition || f.team !== p.defaultTeam || !!p.needsDetails;
    const b = el.querySelector('[data-tap="ed-save"]'); if (b) b.disabled = !dirty || !f.name.trim();
  }

  App.registerScreen('ref.player', {
    tab: 'squad',
    header: ctx => ({ left: backBtn('Squad'), center: ctx.wide ? 'Squad' : '', right: ctx.wide ? hdBtn('+ Add', 'add') : '' }),
    mount(el, ctx) {
      const pid = ctx.params.pid;
      wireSquadList(el, ctx);
      hdOn(ctx, 'add', () => openAddPlayer(''));
      el.addEventListener('input', e => {
        if (!e.target.matches('[data-ed-name]') || !el._form) return;
        el._form.name = e.target.value;
        const t = el.querySelector('[data-part="twins"]'); if (t) t.innerHTML = twinsHtml(similarNames(el._form.name, pid));
        refreshSaveBtn(el, pid);
      });
      UI.onSeg(el, 'ed-pos', v => { if (el._form) { el._form.pos = v; refreshSaveBtn(el, pid); } });
      UI.onSeg(el, 'ed-team', v => { if (el._form) { el._form.team = v; refreshSaveBtn(el, pid); } });
      UI.on(el, 'profile', () => App.go('player.profile', { pid }));
      UI.on(el, 'squad', () => App.go('ref.squad', {}, { replace: true }));
      UI.on(el, 'ed-merge', () => openMergePicker(pid));     // TODO(auth): admin-only
      UI.on(el, 'ed-save', b => {
        const p = Store.player(pid), f = el._form;
        const name = f.name.trim().replace(/\s+/g, ' ');
        if (!p || !name) return;
        const next = { name, defaultPosition: f.pos, defaultTeam: f.team, needsDetails: null };
        const prev = { name: p.name, defaultPosition: p.defaultPosition || null, defaultTeam: p.defaultTeam || null, needsDetails: p.needsDetails || null };
        Save.run({
          label: `Saved ${name}`, button: b,
          write: () => Store.update('players/' + pid, next), undo: () => Store.update('players/' + pid, prev),
          onSaved: () => { el._form = null; App.rerender(); }, onUndone: () => { el._form = null; App.rerender(); },
        });
      });
      // TODO(auth): admin-only
      UI.onHold(el, 'ed-delete', () => {
        const p = Store.player(pid); if (!p) return;
        Store.remove('players/' + pid).then(() => UI.toast(`${p.name} deleted`), () => UI.toast('Not deleted · try again', { err: true }));
        App.go('ref.squad', {}, { replace: true });
      });
    },
    render(el, ctx) {
      const pid = ctx.params.pid;
      if (!Store.player(pid) && Store.hasData()) { el.innerHTML = UI.empty('Player not found', '') + `<div class="mt-3">${UI.btn('Back to Squad', { kind: 'g', sm: true, tap: 'squad' })}</div>`; return; }
      el.innerHTML = ctx.wide
        ? `<div class="split"><div>${squadList(el, pid)}</div><div class="split-side"><div class="card adm-edcard">${editorHtml(el, pid)}</div></div></div>`
        : editorHtml(el, pid);
    },
  });

  // ================================================================ MONEY
  const drafts = {};                                  // date → { pid: amount }, unsaved; kept while the app is open
  const draftOf = date => drafts[date] || (drafts[date] = {});

  function regModel(date) {
    const db = Store.state;
    const played = playedOn(date, db);
    const saved = recordsFor(date, db);
    const draft = draftOf(date);
    const rows = Object.entries(db.players || {}).filter(([, p]) => p).map(([pid, p]) => {
      const pl = played.get(pid);
      const sv = amountOf(saved[pid]);
      return { pid, name: p.name, team: pl ? pl.team : p.defaultTeam, played: !!pl, tag: pl ? pl.tag : '',
        saved: sv, amount: pid in draft ? draft[pid] : sv, rec: saved[pid] };
    }).sort(byName);
    // forget draft entries that now match what's saved (e.g. saved from another phone)
    Object.keys(draft).forEach(pid => { const r = rows.find(x => x.pid === pid); if (!r || r.saved === draft[pid]) delete draft[pid]; });
    const playedRows = rows.filter(r => r.played);
    const changes = rows.filter(r => r.amount !== r.saved);
    return {
      date, rows, playedRows,
      tonight: date === tonightDate(),
      paidPlayed: playedRows.filter(r => r.saved > 0).length,
      notPaid: playedRows.filter(r => !(r.saved > 0)),
      paid: rows.filter(r => r.saved > 0),
      total: rows.reduce((s, r) => s + r.saved, 0),
      changes, delta: changes.reduce((s, r) => s + r.amount - r.saved, 0),
      hasRecord: hasRecord(date, db),
    };
  }

  function amtBtn(r) {
    const on = r.amount > 0;
    return `<button type="button" class="adm-amt${on ? ' on' : ''}" data-tap="amt" data-pid="${esc(r.pid)}" aria-label="${esc(r.name)} ${on ? 'paid ' + fmt.money(r.amount) : 'not paid'}">` +
      `<span class="n">${on ? esc(r.amount) : FEE}</span>${on ? '<span class="adm-ck"> ✓</span>' : ''}</button>`;
  }
  function payRow(r) {
    return `<div class="r adm-pay${r.amount !== r.saved ? ' chg' : ''}"><span class="grow"><span class="nm">${esc(r.name)}</span>` +
      `<span class="adm-sub">${UI.teamMark(r.team)}${r.tag ? `<span class="meta">${esc(r.tag)}</span>` : ''}</span></span>${amtBtn(r)}</div>`;
  }
  function regTabs(m, tab) {
    const all = m.rows.length;
    const items = m.playedRows.length
      ? [{ value: 'unpaid', label: m.tonight ? 'To collect' : 'Not paid', n: m.notPaid.length },
        { value: 'paid', label: 'Paid', n: m.paid.length },
        { value: 'all', label: m.tonight ? 'Everyone' : 'All', n: m.tonight ? null : all }]
      : [{ value: 'paid', label: 'Paid', n: m.paid.length }, { value: 'all', label: 'All', n: all }];
    return UI.seg('reg-tab', items, tab, { ref: true });
  }
  function regTop(m) {
    const kick = (() => { const s = sessionsOn(m.date).map(([, x]) => x).find(x => x.timer && x.timer.startedAt); return s ? s.timer.startedAt : null; })();
    const allPaid = m.playedRows.length && !m.notPaid.length;
    if (m.tonight && allPaid) {
      const paidP = m.playedRows.filter(r => r.saved > 0);
      const before = kick ? paidP.filter(r => recTime(r.rec) && recTime(r.rec) < kick) : [];
      const after = kick ? paidP.filter(r => !(recTime(r.rec) && recTime(r.rec) < kick)) : [];
      const sum = l => l.reduce((s, r) => s + r.saved, 0);
      const bys = [...new Set(paidP.map(r => r.rec && r.rec.by).filter(Boolean))].map(who);
      const lines = [];
      if (kick) {
        lines.push(`<div class="r"><span class="grow nm">Before kick-off</span><span class="n">${before.length} · ${esc(fmt.money(sum(before)))}</span></div>`);
        lines.push(`<div class="r"><span class="grow nm">After the game</span><span class="n">${after.length} · ${esc(fmt.money(sum(after)))}</span></div>`);
      }
      if (bys.length) lines.push(`<div class="r"><span class="grow nm">Recorded by</span><span class="meta">${esc(bys.join(', '))}</span></div>`);
      return `<div class="adm-done"><span class="adm-done-tick">✓</span><div><div class="adm-done-t">Everyone’s paid</div>` +
        `<div class="sub"><span class="n">${esc(fmt.money(m.total))}</span> · ${m.paid.length} paid</div></div></div>` + (lines.length ? UI.rows(lines) : '');
    }
    const pct = m.playedRows.length ? Math.round(100 * m.paidPlayed / m.playedRows.length) : 0;
    const head = m.tonight ? `<div class="adm-kicker">${esc(fmt.date(m.date))} · ${m.playedRows.length} played</div>` : '';
    const line = m.playedRows.length
      ? `<div class="adm-progline"><span>${m.paidPlayed} of ${m.playedRows.length} ${m.tonight ? 'paid' : 'who played'}</span>` +
        (!m.notPaid.length ? '' : m.tonight ? `<span class="warnchip">${m.notPaid.length} to collect</span>`
          : m.hasRecord ? `<span class="warnchip">${m.notPaid.length} not paid</span>` : `<span class="warnchip">not entered</span>`) + `</div><div class="prog"><i style="width:${pct}%"></i></div>`
      : `<div class="adm-progline"><span>${plural(m.paid.length, 'person', 'people')} paid · no match</span></div>`;
    return `${head}<div class="adm-big"><span class="n">${esc(fmt.money(m.total))}</span><span class="adm-big-l">collected</span></div>${line}`;
  }
  function regList(el, m) {
    const st = el._reg;
    let list = st.tab === 'unpaid' ? m.notPaid : st.tab === 'paid' ? m.paid : m.rows;
    const q = st.q.trim().toLowerCase();
    if (st.tab === 'all' && q) list = list.filter(r => String(r.name).toLowerCase().includes(q));
    if (!list.length) {
      if (st.tab === 'unpaid') return UI.empty(m.tonight ? 'Nobody left to collect from' : 'Everyone who played has paid', '');
      if (st.tab === 'paid') return UI.empty('No one paid yet', '');
      return UI.empty(`No one called "${st.q.trim()}"`, '');
    }
    return UI.rows(list.map(payRow));
  }
  function regSavebar(m) {
    if (!m.changes.length) return '';
    return `<div class="savebar adm-savebar" role="status"><span><b>Save ${m.changes.length}</b> · <span class="n">${esc(signedMoney(m.delta))}</span></span>` +
      `<button type="button" class="ub" data-tap="pay-save">Save</button></div>`;
  }
  function paintReg(el, full) {
    const st = el._reg;
    const m = regModel(st.date);
    if (!st.tab || (st.tab === 'unpaid' && !m.playedRows.length)) st.tab = m.playedRows.length ? (m.notPaid.length ? 'unpaid' : 'paid') : 'all';
    const set = (part, html) => { const x = el.querySelector(`[data-part="${part}"]`); if (x) x.innerHTML = html; };
    if (full) {
      el.querySelector('[data-part="reg"]').innerHTML = `<div class="adm-narrow">
        <div data-part="top"></div>
        <div class="mt-4" data-part="tabs"></div>
        <div class="mt-3" data-part="search"></div>
        <div class="mt-3" data-part="rows"></div>
        <div data-part="bar"></div></div>`;
    }
    set('top', regTop(m));
    set('tabs', regTabs(m, st.tab));
    const sWrap = el.querySelector('[data-part="search"]');
    const hasSearch = !!(sWrap && sWrap.querySelector('[data-search="reg"]'));
    if (sWrap && st.tab === 'all' && !hasSearch) sWrap.innerHTML = UI.search({ name: 'reg', placeholder: `Search ${m.rows.length} players`, value: st.q });
    if (sWrap && st.tab !== 'all' && hasSearch) sWrap.innerHTML = '';
    set('rows', regList(el, m));
    set('bar', regSavebar(m));
    return m;
  }

  function openAmountSheet(el, pid) {
    const st = el._reg, date = st.date;
    const p = Store.player(pid); if (!p) return;
    const m = regModel(date);
    const r = m.rows.find(x => x.pid === pid);
    const cur = r ? r.amount : 0;
    const opts = [FEE, FEE * 2];
    const h = UI.sheet.open({ title: p.name, titleEnd: esc(fmt.date(date)), cls: 'sh-admin-amount',
      body: `<div class="amt adm-amtrow">${opts.map(a => `<button type="button" class="${cur === a ? 'on' : ''}" data-tap="set" data-v="${a}">${a}</button>`).join('')}` +
        `<button type="button" class="${cur > 0 && !opts.includes(cur) ? 'on' : ''}" data-tap="other">Other</button></div>
        <div class="adm-other mt-3" data-part="other" hidden><label class="inp"><span class="adm-cur">${esc(CFG.currency || '₵')}</span>` +
        `<input type="text" inputmode="decimal" autocomplete="off" data-other placeholder="Amount" aria-label="Other amount" value="${cur > 0 && !opts.includes(cur) ? esc(cur) : ''}"></label>
        <div class="mt-2">${UI.btn('Use this amount', { kind: 'g', sm: true, tap: 'use' })}</div></div>`,
      footer: UI.btn('Not paid', { kind: 'warn', sm: true, tap: 'none' }), cancel: true, autofocus: false });
    const apply = v => { const d = draftOf(date); d[pid] = v; h.close(); paintReg(el); };
    UI.on(h.el, 'set', b => apply(Number(b.dataset.v)));
    UI.on(h.el, 'none', () => apply(0));
    UI.on(h.el, 'other', () => { const box = h.el.querySelector('[data-part="other"]'); box.hidden = false; const i = box.querySelector('input'); i.focus(); });
    const useOther = () => {
      const v = Number(String(h.el.querySelector('[data-other]').value).replace(/[^\d.]/g, ''));
      if (!(v > 0)) { UI.toast('Type an amount', { err: true }); return; }
      apply(Math.round(v * 100) / 100);
    };
    UI.on(h.el, 'use', useOther);
    h.el.querySelector('[data-other]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); useOther(); } });
    if (cur > 0 && !opts.includes(cur)) h.el.querySelector('[data-part="other"]').hidden = false;
  }

  function savePayments(el, btn) {
    // TODO(auth): admin-only? Referees collect at the pitch too, so any signed-in referee can save.
    const date = el._reg.date;
    const m = regModel(date);
    if (!m.changes.length) return;
    const now = Store.now(), by = Auth.by();
    const day = (Store.state.paymentDays || {})[date];
    const updates = {};
    m.changes.forEach(r => { updates[`paymentDays/${date}/payments/${r.pid}`] = { amount: r.amount, updatedAt: now, by }; });
    updates[`paymentDays/${date}/date`] = date;
    updates[`paymentDays/${date}/updatedAt`] = now;
    if (!day || !day.createdAt) updates[`paymentDays/${date}/createdAt`] = now;
    const inverse = {};
    Object.keys(updates).forEach(path => { const v = Store.get(path); inverse[path] = v === undefined ? null : clone(v); });
    const n = m.changes.length;
    Save.run({
      label: `${fmt.date(date)} · ${plural(n, 'payment')} · ${signedMoney(m.delta)}`, button: btn, savingText: 'Saving…',
      write: () => Store.multi(updates), undo: () => Store.multi(inverse),
      onSaved: () => { m.changes.forEach(r => { delete draftOf(date)[r.pid]; }); paintReg(el); },
    });
  }

  function openRegMenu(el) {
    // TODO(auth): admin-only
    const date = el._reg.date;
    const m = regModel(date);
    const h = UI.sheet.open({ title: fmt.date(date), cls: 'sh-admin-more',
      body: m.hasRecord ? `<div class="sub mb-3">${esc(fmt.money(m.total))} · ${plural(m.paid.length, 'person', 'people')} paid</div>` +
        UI.hold('Hold to clear payment record', { name: 'clear', warn: true, doneText: 'Clearing…' })
        : UI.empty('Nothing recorded', ''), cancel: true });
    UI.onHold(h.el, 'clear', () => {
      const paths = {};
      if ((Store.state.paymentDays || {})[date]) paths[`paymentDays/${date}`] = null;
      sessionsOn(date).forEach(([sid, s]) => { if (s.payments && Object.keys(s.payments).length) paths[`sessions/${sid}/payments`] = null; });
      drafts[date] = {};
      Store.multi(paths).then(() => { h.close(); UI.toast('Payment record cleared'); }, () => { h.close(); UI.toast('Not cleared · try again', { err: true }); });
    });
  }

  function mountRegister(el, ctx, getDate) {
    el.addEventListener('input', e => {
      if (!e.target.matches('[data-search="reg"]') || !el._reg) return;
      el._reg.q = e.target.value;
      const rows = el.querySelector('[data-part="rows"]');
      if (rows) rows.innerHTML = regList(el, regModel(el._reg.date));
    });
    UI.onSeg(el, 'reg-tab', v => { if (el._reg) { el._reg.tab = v; paintReg(el); } });
    UI.on(el, 'amt', b => {
      const date = getDate(); if (!date) return;
      const m = regModel(date);
      const r = m.rows.find(x => x.pid === b.dataset.pid); if (!r) return;
      if (r.amount > 0) openAmountSheet(el, r.pid);
      else { draftOf(date)[r.pid] = FEE; paintReg(el); }
    });
    UI.on(el, 'pay-save', b => savePayments(el, b));
  }

  // ---- list of dates
  function moneyListHtml(ctx) {
    const ov = moneyOverview();
    const range = ov.first ? `${fmt.short(ov.first)} – ${fmt.short(ov.last)}` : '';
    const row = r => UI.row({ tap: 'day', data: { date: r.date }, title: fmt.date(r.date),
      meta: !r.entered ? (r.isMatch ? `${r.played} played` : 'No match') :
        r.isMatch ? `${r.paidPlayed} of ${r.played} paid${r.others ? ` · ${r.others} didn’t play` : ''}` : `${plural(r.paid, 'person', 'people')} paid · no match`,
      right: r.active ? UI.pill('Tonight') : r.entered ? `<span class="n bk">${esc(fmt.money(r.total))}</span>` : `<span class="warnchip">not entered</span>`, chevron: true });
    const missing = ov.missing;
    const st = ctx.el._ml || (ctx.el._ml = { early: false });
    const summary = `<div class="card adm-collected"><div class="adm-kicker">Collected${range ? ' · ' + esc(range) : ''}</div><div class="adm-big"><span class="n">${esc(fmt.money(ov.total))}</span></div></div>` +
      (missing.length ? `<div class="card adm-line adm-miss"><span class="warnchip grow adm-ink">${plural(missing.length, 'match day')} not entered</span>` +
        `<span class="adm-line-r">${esc(fmt.short(missing[missing.length - 1].date))}${missing.length > 1 ? ' – ' + esc(fmt.short(missing[0].date)) : ''}</span></div>` : '');
    const list = `<div class="lbl">Match days</div>` + (ov.tracked.length ? UI.rows(ov.tracked.map(row)) : UI.empty('Nothing yet', '')) +
      (ov.earlier.length ? (st.early
        ? `<div class="lbl mt-6">Before ${esc(fmt.short(ov.first))}</div>` + UI.rows(ov.earlier.map(row))
        : `<div class="mt-3">${UI.btn(`Show ${plural(ov.earlier.length, 'earlier day')}`, { kind: 'o', sm: true, tap: 'early' })}</div>`) : '');
    return `<div class="adm-money"><div class="adm-money-a">${summary}</div><div class="adm-money-b">${list}</div></div>`;
  }
  function openAddDate() {
    const h = UI.sheet.open({ title: 'Payment date', cls: 'sh-admin-date',
      body: `<label class="inp adm-date"><span class="adm-date-l">Date</span><input type="date" data-newdate value="${esc(today())}" aria-label="Payment date"></label>`,
      footer: UI.btn('Open', { tap: 'go' }), cancel: true, autofocus: false });
    UI.on(h.el, 'go', () => {
      const d = h.el.querySelector('[data-newdate]').value;
      if (!isDate(d)) { UI.toast('Pick a date', { err: true }); return; }
      h.close(); App.go('ref.moneyDay', { date: d });
    });
  }

  App.registerScreen('ref.money', {
    tab: 'money',
    header: ctx => (tonightDate() && !ctx.params.all)
      ? { center: 'Money · tonight', right: hdBtn('All dates', 'all') }
      : { center: 'Money', right: hdBtn('+ Date', 'date') },
    mount(el, ctx) {
      ctx.el = el;
      hdOn(ctx, 'all', () => App.go('ref.money', { all: 1 }));
      hdOn(ctx, 'date', openAddDate);
      UI.on(el, 'day', b => App.go('ref.moneyDay', { date: b.dataset.date }));
      UI.on(el, 'early', () => { el._ml = { early: true }; App.rerender(); });
      mountRegister(el, ctx, () => el._reg && el._reg.date);
    },
    render(el, ctx) {
      ctx.el = el;
      const t = ctx.params.all ? null : tonightDate();
      if (t) {
        const fresh = !el._reg || el._reg.date !== t || !el.querySelector('[data-part="reg"] [data-part="top"]');
        if (!el._reg || el._reg.date !== t) el._reg = { date: t, tab: null, q: '' };
        if (fresh) el.innerHTML = '<div data-part="reg"></div>';
        paintReg(el, fresh);
      } else {
        el._reg = null;
        el.innerHTML = moneyListHtml(ctx);
      }
    },
  });

  App.registerScreen('ref.moneyDay', {
    tab: 'money',
    header: ctx => ({ left: backBtn('Money'), center: esc(ctx.params.date === tonightDate() ? 'Money · tonight' : fmt.date(ctx.params.date)),
      right: `<button type="button" class="hd-btn adm-more" data-hd="more" aria-label="More">${UI.icon('more')}</button>` }),
    mount(el, ctx) {
      el._reg = { date: ctx.params.date, tab: null, q: '' };
      hdOn(ctx, 'more', () => openRegMenu(el));
      mountRegister(el, ctx, () => ctx.params.date);
    },
    render(el, ctx) {
      if (!isDate(ctx.params.date)) { el.innerHTML = UI.empty('Not a date', ''); return; }
      const fresh = !el.querySelector('[data-part="reg"] [data-part="top"]');
      if (fresh) el.innerHTML = '<div data-part="reg"></div>';
      paintReg(el, fresh);
    },
    onData(el) { if (el.querySelector('[data-part="top"]')) paintReg(el); },
  });

  // ================================================================ CAN'T CONNECT (OfflineBar + first-load screen)
  let lastStatus = null, retrying = false;
  function retryNow(store, btn) {
    retrying = true;
    if (btn) { btn.textContent = 'Trying…'; btn.classList.add('is-saving'); }
    try { (store || Store).retry(); } catch (e) { /* ignore */ }
    setTimeout(() => { retrying = false; const s = Store.status(); if (window.App && App.screens['app.offline']) App.screens['app.offline'].render(document.getElementById('app-status'), Object.assign({ store: Store }, s)); }, 1500);
  }
  App.registerScreen('app.offline', {
    mode: 'any',
    render(el, info) {
      const wasOffline = lastStatus === 'offline';
      lastStatus = info.status;
      if (info.status !== 'offline') {
        el.innerHTML = '';
        if (wasOffline && info.status === 'online') UI.toast(info.pending ? `Back online · sending ${info.pending}` : 'Back online');
        return;
      }
      if (info.source === 'none') {
        el.innerHTML = `<div class="adm-nodata" role="alert"><span class="wm">BE FIT <em>CLUB</em></span>
          <div class="adm-nodata-c">${UI.icon('wifi-off')}<b>Can’t connect</b><span class="sub">Nothing saved on this phone yet</span>
          <button type="button" class="btn w adm-retry" data-offline-retry>${retrying ? 'Trying…' : 'Retry'}</button></div></div>`;
      } else {
        const ref = Auth.isReferee();
        const when = info.savedAt ? (fmt.iso(info.savedAt) === today() ? fmt.time(info.savedAt) : `${fmt.short(fmt.iso(info.savedAt))} ${fmt.time(info.savedAt)}`) : '';
        const detail = info.pending && ref ? `Waiting to send (${info.pending})` : when ? `saved ${when}` : 'showing this phone’s copy';
        el.innerHTML = `<div class="offline adm-offline" role="status">${UI.icon('wifi-off')}<span class="grow"><b>Offline</b> · <span class="${info.pending && ref ? '' : 'n'}">${esc(detail)}</span></span>` +
          `<button type="button" class="ub" data-offline-retry>${retrying ? 'Trying…' : 'Retry'}</button></div>`;
      }
      const b = el.querySelector('[data-offline-retry]');
      if (b) b.onclick = () => retryNow(info.store, b);
    },
  });
  // Retry by itself when the phone says the signal is back, or the app comes back to the front.
  window.addEventListener('online', () => { try { Store.retry(); } catch (e) { /* ignore */ } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Store.status().status === 'offline') Store.retry(); });

  // ================================================================ ACTIONS
  App.registerAction('admin.editPlayer', ({ pid }) => App.go('ref.player', { pid }));

  // Test hooks (pure helpers; no writes) so the harness can check the maths against Scoring.
  window.__BEFIT_ADMIN__ = { daySummary, moneyOverview, recordsFor, playedOn, planMerge, dupGroups, regModel };

  // The one payments rule, for any screen (e.g. Me › Subs): read-only, takes an optional db like Scoring.
  //   BF_PAY.status(pid, date, db?)  → 'paid' | 'not paid' | 'not entered' | null
  //   BF_PAY.owed(pid, db?)          → ['2026-08-24', ...] dates this player owes
  //   BF_PAY.hasRecord(date, db?) · BF_PAY.amount(pid, date, db?) · BF_PAY.day(date, db?) (the Money row summary)
  window.BF_PAY = Object.freeze({
    status: payStatus, owed: owedDates, hasRecord, day: daySummary,
    amount: (pid, date, db) => amountOf(recordsFor(date, db)[pid]),
  });
})();
