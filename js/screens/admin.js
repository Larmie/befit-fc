/* ============================================================================
   BE Fit Club · js/screens/admin.js · THE ADMIN AREA (Home, Squad, Money, Settings) + Can't connect
                                                              OWNER: Round 5 · admin builder
   ----------------------------------------------------------------------------
   SCREENS
     'admin.home'           tab home      "Needs you" (money not entered, subs owed, names used twice, new players
                            to finish, results published since you last looked; seen-time per phone in
                            BF_CONFIG.keys.lastSeen), a live-match banner (joined score block), then every match
                            with the mini score (→ 'ref.edit'), and "Log a past game".
     'ref.pastGame'         (admin)       Log a past game: date, who played per side, stats per player.
                            Writes a 'post' session exactly as classic (teams, playerStats, goals, cleanSheets).
     'ref.squad' {f?}       tab squad     Search, filter chips (All · one per team · New · Owes · Twice), rows with avatar,
                            team chip, apps, points or an "owes ₵60" tag. Twice = the duplicate groups with Merge.
     'ref.player' {pid}     tab squad     Header card (hero), usual team as big swatches (every active team; + Add a team),
                            position, Name, Subs, Merge with another player, Hold to delete.
     'ref.money' {all?|view?} tab money   Admin: a "Tonight · All dates" switch on the page. Tonight = the register
                            (collected of expected, chips To collect / Paid / Everyone, tap a row → quick amounts
                            inline, then Cancel or Save). All dates = the season list. The referee: tonight only.
     'ref.moneyDay' {date}  tab money     The register for one date (admin), plus Hold to clear payment record.
     'admin.settings'       tab settings  Club (name, season, fee, quick amounts), Teams (+ Add a team), Match rules
                            (read-only), Access (how to change the referee password), Appearance, Data (CSV, practice).
     'app.offline'          (not a page)  The status slot: viewers and the admin see "Offline · last updated 21:23";
                            the referee doesn't (the header sync chip says it); "Not sent" shows for everyone.
     ('ref.home' is retired: the shell sends it to admin.home or the referee's Match tab.)
   ACTIONS
     'admin.editPlayer' ({ pid })   open a player's page (admin only; others get a toast)
     'admin.addTeam'    ({})        Settings › Teams › Add a team sheet (colour, name, Active, live preview)

   DATA (all writes go through Store; nothing here talks to Firebase)
     players/{pid}                          { name, defaultPosition, defaultTeam, needsDetails?, createdBy?, createdAt? }
     sessions/{sid}                         post mode: { date, status:'completed', mode:'post', teams, playerStats, goals, cleanSheets }
     paymentDays/{date}                     { date, createdAt, updatedAt, payments: { pid: { amount, updatedAt, by } } }
     sessions/{sid}/payments (legacy)       read and merged by updatedAt, exactly as classic; cleared with the record.
     settings/club/{name|seasonLabel|fee|quickAmounts}     (Teams.club() reads them, with fallbacks)
     settings/teams/{id} = { name, colour, order, active } (Teams.writeFor). The first team write also writes the
                            teams on show (Green, Red) so they never vanish when `settings/teams` starts to exist.
   Payments only write the people whose amount changed (no zeros for people you didn't touch).
   Merging a player rewrites every reference in one atomic Store.multi, refuses if both played the same
   match, and checks with Scoring that the season totals add up before writing.
   Admin only: Squad, a player, Log a past game, all dates in Money, Settings (the shell gates them too).
   ========================================================================== */
(function () {
  'use strict';
  const CFG = window.BF_CONFIG;
  const esc = UI.esc, fmt = UI.fmt;
  const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
  const MINUS = '−';
  const today = () => fmt.iso(Store.now());
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
  const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const isAdmin = () => Auth.isAdmin();
  const club = () => Teams.club();
  const fee = () => club().fee;
  const cap = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

  // ---------------------------------------------------------------- small helpers
  function hdOn(ctx, name, fn) {
    const hd = document.getElementById('app-header');
    if (!hd) return;
    const h = e => { const b = e.target.closest(`[data-hd="${name}"]`); if (b) fn(b, e); };
    hd.addEventListener('click', h);
    ctx.onCleanup(() => hd.removeEventListener('click', h));
  }
  const hdBtn = (label, name) => `<button type="button" class="hd-btn" data-hd="${esc(name)}">${esc(label)}</button>`;
  const signedMoney = n => (n > 0 ? '+' : n < 0 ? MINUS : '') + fmt.money(Math.abs(n));
  const who = by => !by || by === 'referee' ? 'the referee' : String(by).includes('@') ? String(by).split('@')[0] : String(by);
  const plural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + 's')}`;
  const inverseOf = updates => { const inv = {}; Object.keys(updates).forEach(p => { const v = Store.get(p); inv[p] = v === undefined ? null : clone(v); }); return inv; };
  const parseAmount = v => { const n = Number(String(v || '').replace(/[^\d.]/g, '')); return n > 0 ? Math.round(n * 100) / 100 : 0; };
  const toggle = (name, on, o) => `<button type="button" class="adm-tog${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-tap="${esc(name)}"${o && o.disabled ? ' disabled' : ''} aria-label="${esc((o && o.label) || 'Active')}"><i></i></button>`;
  // Admin-only screens: the shell already sends the referee away; this is the second lock.
  function blocked(el) {
    if (isAdmin()) return false;
    el.innerHTML = UI.empty('Admin only', '');
    setTimeout(() => App.go('ref.money', {}, { replace: true }), 0);
    return true;
  }
  // The teams a picker offers: every active team (Settings), plus `extra` if it isn't one of them (an old team).
  function teamChoices(extra) {
    const ids = Teams.ids();
    if (extra && !ids.includes(extra)) ids.push(extra);
    return ids;
  }

  // ---------------------------------------------------------------- payments model: js/core/pay.js (shared with Me › Subs)
  const { amountOf, recTime, isDate, sessionsOn, recordsFor, playedOn } = window.BF_PAY;
  const hasRecord = BF_PAY.hasRecord, daySummary = BF_PAY.day;
  const moneyOverview = BF_PAY.overview;
  // Tonight = a match today (active or played).
  function tonightDate() {
    const act = Store.activeSession();
    if (act && isDate(act.date)) return act.date;
    const d = today();
    return sessionsOn(d).some(([, s]) => Scoring.sessPlayers(s).length) ? d : null;
  }
  // Who owes what (same rule as BF_PAY.owed, one pass for everyone; memo per data object).
  let owedMemo = null;
  function owedMap(db) {
    db = db || Store.state;
    if (owedMemo && owedMemo.db === db) return owedMemo.map;
    const map = {};
    const dates = [...new Set(Object.values(db.sessions || {}).map(s => s && s.date).filter(isDate))].sort();
    for (const d of dates) {
      if (!hasRecord(d, db)) continue;
      const recs = recordsFor(d, db);
      for (const pid of playedOn(d, db).keys()) if (!(amountOf(recs[pid]) > 0)) (map[pid] = map[pid] || []).push(d);
    }
    owedMemo = { db, map };
    return map;
  }
  const owedDates = pid => owedMap()[pid] || [];

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
  const isNew = pid => { const p = Store.player(pid); return !!(p && (p.needsDetails || Scoring.seasonStats(pid).apps === 0)); };
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

  // ================================================================ ADMIN.HOME
  let seenBase;                                       // read once per app start, so the list holds steady while you click around
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

  // Flags still open when the referee published (fix.js): ftCheck.flags = { longStoppage?, doubleTaps?, noMinute? } (counts).
  function openFlags(sess) {
    const f = (sess.ftCheck && typeof sess.ftCheck.flags === 'object' && sess.ftCheck.flags) || {};
    const c = k => Math.max(0, Number(f[k]) || 0);
    const parts = [];
    if (c('longStoppage')) parts.push(c('longStoppage') === 1 ? 'long stoppage' : `${c('longStoppage')} long stoppages`);
    if (c('doubleTaps')) parts.push(c('doubleTaps') === 1 ? 'double tap' : `${c('doubleTaps')} double taps`);
    if (c('noMinute')) parts.push(`${c('noMinute')} with no minute`);
    return { n: c('longStoppage') + c('doubleTaps') + c('noMinute'), text: parts.join(', ') };
  }
  // Everything that needs the admin, most urgent first. Each: { tap, data, title, sub, n, kind:'warn'|'ink' }
  function needs() {
    const out = [];
    const ov = moneyOverview();
    const t = tonightDate();
    const m = ov.missing.filter(r => r.date !== t);   // tonight has its own line below
    if (m.length) {
      out.push({ tap: 'need-money', title: 'Money not entered', n: m.length, kind: 'warn',
        sub: `${plural(m.length, 'match day')} · ${fmt.short(m[m.length - 1].date)}${m.length > 1 ? ' – ' + fmt.short(m[0].date) : ''}` });
    }
    if (t) {
      const d = daySummary(t);
      const paid = d.paidPlayed, left = d.played - paid;
      if (left > 0) out.push({ tap: 'need-tonight', title: 'Money tonight', n: left, kind: 'warn', sub: `${paid} of ${d.played} paid · ${left} to collect` });
    }
    const owe = owedMap();
    const owers = Object.keys(owe).filter(pid => Store.player(pid));
    if (owers.length) {
      const nights = owers.reduce((s, pid) => s + owe[pid].length, 0);
      out.push({ tap: 'need-owes', title: 'Subs owed', n: owers.length, kind: 'warn',
        sub: `${plural(owers.length, 'player')} · ${fmt.money(nights * fee())} for ${plural(nights, 'night')}` });
    }
    const groups = dupGroups();
    if (groups.length) out.push({ tap: 'need-twice', title: 'Names used twice', n: groups.length, kind: 'ink', sub: groups.map(g => g.name).join(', ') });
    const todo = Object.entries(Store.players()).filter(([, p]) => p && p.needsDetails);
    if (todo.length) out.push({ tap: 'finish', title: `${plural(todo.length, 'new player')} to finish`, n: todo.length, kind: 'ink', sub: 'Position, usual team' });
    const base = lastSeenBase();
    const pub = Scoring.completedSessions().filter(x => isPublished(x.sess)).sort((a, b) => publishedAt(b.sess) - publishedAt(a.sess));
    const fresh = base ? pub.filter(x => publishedAt(x.sess) > base) : pub.slice(0, 1);
    fresh.slice(0, 3).forEach(({ sid, sess }) => {
      const fixes = fixList(sess), kept = Object.keys((sess.ftCheck && sess.ftCheck.keep) || {}).length;
      const flags = openFlags(sess);
      const by = sess.ftCheck.by || sess.publishedBy || null;
      const bits = [`By ${who(by)}`];
      if (fixes.length) bits.push(`${plural(fixes.length, 'fix', 'fixes')} at full time`);
      if (flags.n) bits.push(`${plural(flags.n, 'flag')}: ${flags.text}`);
      else if (kept) bits.push(`${plural(kept, 'flag')} kept`);
      out.push({ tap: 'edit', data: { sid }, title: `Published · ${fmt.date(sess.date)}`, kind: flags.n ? 'warn' : 'ink', sub: bits.join(' · '),
        lines: fixes.slice(0, 2).map(f => f.text).filter(Boolean),
        right: flags.n ? `<span class="adm-review">Review</span>` : UI.miniScore(sess) });
    });
    return out;
  }
  function needRow(x) {
    const right = x.right || (x.n != null ? `<span class="adm-n${x.kind === 'warn' ? ' warn' : ''}">${esc(x.n)}</span>` : '');
    return `<button type="button" class="r adm-need ${x.kind === 'warn' ? 'is-warn' : 'is-ink'}" data-tap="${esc(x.tap)}"${x.data ? Object.entries(x.data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('') : ''}>` +
      `<span class="grow"><span class="nm">${esc(x.title)}</span><span class="meta">${esc(x.sub || '')}</span>` +
      (x.lines || []).map(l => `<span class="adm-need-l">${esc(l)}</span>`).join('') + `</span>` +
      `<span class="end">${right}<span class="chev">›</span></span></button>`;
  }
  function liveBanner() {
    const sid = Store.activeSessionId(), s = sid && Store.activeSession();
    if (!s) return '';
    return `<div class="card hero adm-live"><div class="spread adm-live-h">${UI.liveDot()}<span class="meta">${esc(fmt.date(s.date))}</span></div>` +
      UI.scoreFor(s, { size: 'compact' }) +
      `<div class="mt-3">${UI.btn('Open console ›', { tap: 'console', sm: true })}</div></div>`;
  }
  function openFinishList() {
    const todo = Object.entries(Store.players()).filter(([, p]) => p && p.needsDetails).map(([pid, p]) => ({ pid, name: p.name })).sort(byName);
    if (todo.length === 1) { App.action('admin.editPlayer', { pid: todo[0].pid }); return; }
    const h = UI.sheet.open({ title: 'New players to finish', cls: 'sh-admin-finish', cancel: 'Close',
      body: UI.rows(todo.map(p => UI.row({ tap: 'pick', data: { pid: p.pid }, left: UI.avatar(p.name, Store.player(p.pid).defaultTeam), title: p.name, meta: playerMeta(p.pid), chevron: true }))) });
    UI.on(h.el, 'pick', b => { h.close(); App.action('admin.editPlayer', { pid: b.dataset.pid }); });
  }

  App.registerScreen('admin.home', {
    tab: 'home', mode: 'admin',
    mount(el) {
      UI.on(el, 'edit', b => App.go('ref.edit', { sid: b.dataset.sid }));
      UI.on(el, 'finish', openFinishList);
      UI.on(el, 'need-money', () => App.go('ref.money', { all: 1 }));
      UI.on(el, 'need-tonight', () => App.go('ref.money', { view: 'tonight' }));
      UI.on(el, 'need-owes', () => App.go('ref.squad', { f: 'owes' }));
      UI.on(el, 'need-twice', () => App.go('ref.squad', { f: 'twice' }));
      UI.on(el, 'past', () => App.go('ref.pastGame'));
      UI.on(el, 'console', () => { App.setRole('referee'); App.go('ref.console'); });
    },
    render(el) {
      if (blocked(el)) return;
      const list = needs();
      const all = Scoring.completedSessions();
      const rows = all.map(({ sid, sess }) => {
        const n = Scoring.sessPlayers(sess).length;
        return UI.row({ tap: 'edit', data: { sid }, title: fmt.date(sess.date), meta: n ? plural(n, 'player') : 'Score only', right: UI.miniScore(sess), chevron: true });
      });
      el.innerHTML = `<div class="adm-home">
        <div class="adm-home-a">
          ${liveBanner()}
          <div class="adm-needs-h"><h2 class="head">${list.length ? 'Needs you' : 'All in order'}</h2>
            <span class="sub">${list.length ? plural(list.length, 'thing') : 'Nothing needs you'}</span></div>
          <div class="adm-card-wrap">${list.length ? UI.rows(list.map(needRow), { cls: 'adm-needs' }) : ''}</div>
        </div>
        <div class="adm-home-b">
          <div class="lbl adm-lblrow"><span>Matches <b class="n">${all.length}</b></span><button type="button" class="link adm-lnk" data-tap="past">Log a past game ›</button></div>
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
    const ids = Teams.ids();
    const two = ids.length >= 2 ? ids.slice(0, 2) : ['green', 'red'];
    return { date: today(), team: two[0], teams: two, picks: {}, q: '' };
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
    const more = Teams.ids().find(t => !past.teams.includes(t));
    const set = (part, html) => { const x = el.querySelector(`[data-part="${part}"]`); if (x) x.innerHTML = html; };
    set('addlbl', `Add to ${esc(fmt.team(past.team))}`);
    set('clash', clash ? `<div class="flag mt-2">${esc(fmt.date(past.date))} already has a match</div>` : '');
    set('score', UI.score({ teams: teams.map(t => ({ team: t, goals: goals[t] || 0 })), centre: { top: 'FT', sub: fmt.short(past.date), state: 'ft' }, size: 'compact' }));
    set('teams', UI.teamSwitch('pg-team', teams.map(t => ({ team: t, count: counts[t] || 0 })), past.team, { ref: true }) +
      (more ? `<button type="button" class="link adm-addteam" data-tap="pg-addteam">+ ${esc(fmt.team(more))} team</button>` : ''));
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
    tab: 'home', title: 'Log a past game',
    header: () => ({ right: `<button type="button" class="hd-btn" data-shell="back">Close</button>` }),
    mount(el) {
      if (!past) past = freshPast();
      el.addEventListener('input', e => {
        if (e.target.matches('[data-search="pg"]')) { past.q = e.target.value; paintPast(el); }
      });
      el.addEventListener('change', e => {
        if (e.target.matches('[data-pg-date]') && isDate(e.target.value)) { past.date = e.target.value; paintPast(el); }
      });
      UI.onSeg(el, 'pg-team', v => { past.team = v; paintPast(el); });
      UI.on(el, 'pg-addteam', () => { const t = Teams.ids().find(x => !past.teams.includes(x)); if (t) { past.teams.push(t); past.team = t; paintPast(el); } });
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
          onSaved: () => { past = null; App.go('admin.home', {}, { replace: true }); },
        });
      });
    },
    render(el) {
      if (blocked(el)) return;
      if (!past) past = freshPast();
      el.innerHTML = `<div class="adm-narrow">
        <label class="inp adm-date"><span class="adm-date-l">Date</span><input type="date" data-pg-date value="${esc(past.date)}" max="${esc(today())}" aria-label="Date of the game"></label>
        <div data-part="clash"></div>
        <div class="mt-3" data-part="score"></div>
        <div class="mt-4" data-part="teams"></div>
        <div class="mt-3" data-part="mine"></div>
        <div class="lbl mt-6" data-part="addlbl"></div>
        ${UI.search({ name: 'pg', placeholder: 'Search everyone', value: past.q })}
        <div class="mt-2" data-part="pool"></div>
        <div class="mt-6" data-part="save"></div>
      </div>`;
      paintPast(el);
    },
    onData(el) { if (isAdmin()) paintPast(el); },
  });

  // ================================================================ REF.SQUAD + REF.PLAYER
  function owesTag(pid) {
    const n = owedDates(pid).length;
    return n ? `<span class="adm-owes">owes ${esc(fmt.money(n * fee()))}</span>` : '';
  }
  function squadFilters() {
    const players = Object.entries(Store.players()).filter(([, p]) => p);
    const groups = dupGroups();
    const owe = owedMap();
    const items = [{ value: 'all', label: 'All', n: players.length }];
    Teams.list().forEach(t => items.push({ value: 'team:' + t.id, label: t.name }));
    const nNew = players.filter(([pid]) => isNew(pid)).length;
    if (nNew) items.push({ value: 'new', label: 'New', n: nNew });
    const nOwe = players.filter(([pid]) => (owe[pid] || []).length).length;
    if (nOwe) items.push({ value: 'owes', label: 'Owes', n: nOwe });
    if (groups.length) items.push({ value: 'twice', label: 'Twice', n: groups.length });
    return items;
  }
  function squadRow(pid, selPid) {
    const p = Store.player(pid) || {};
    const st = Scoring.seasonStats(pid);
    const tag = owesTag(pid);
    const meta = `<span class="adm-sub">${UI.teamChip(p.defaultTeam)}<span>${esc(p.defaultPosition || 'MID')} · ${esc(plural(st.apps, 'app'))}</span>` +
      (p.needsDetails ? `<span class="adm-warn">details to finish</span>` : '') + `</span>`;
    return UI.row({ tap: 'open', data: { pid }, left: UI.avatar(p.name, p.defaultTeam), titleHtml: esc(p.name), metaHtml: meta,
      right: tag || `<span class="adm-pts n">${esc(st.pts)}</span>`, chevron: true, sel: pid === selPid, cls: 'adm-sq' });
  }
  function squadRows(st, selPid) {
    const s = String(st.q || '').trim().toLowerCase();
    if (st.f === 'twice' && !s) return dupReviewHtml();
    const owe = owedMap();
    const list = Object.entries(Store.players()).filter(([, p]) => p)
      .map(([pid, p]) => ({ pid, name: p.name, p }))
      .filter(x => !s || String(x.name).toLowerCase().includes(s))
      .filter(x => {
        if (s || !st.f || st.f === 'all') return true;
        if (st.f.startsWith('team:')) return x.p.defaultTeam === st.f.slice(5);
        if (st.f === 'new') return isNew(x.pid);
        if (st.f === 'owes') return (owe[x.pid] || []).length > 0;
        return true;
      }).sort(byName);
    if (!list.length && s) return UI.empty(`No one called "${String(st.q).trim()}"`, '') + `<div class="mt-2">${UI.btn(`Add “${String(st.q).trim()}”`, { kind: 'g', sm: true, tap: 'add', data: { name: String(st.q).trim() } })}</div>`;
    if (!list.length) return UI.empty('No one here', '');
    return UI.rows(list.map(x => squadRow(x.pid, selPid)));
  }
  function squadState(el, ctx) {
    if (!el._sq) el._sq = { q: '', f: (ctx && ctx.params && ctx.params.f) || 'all' };
    return el._sq;
  }
  function squadList(el, ctx, selPid) {
    const st = squadState(el, ctx);
    const n = Object.keys(Store.players()).length;
    const items = squadFilters();
    if (!items.some(i => i.value === st.f)) st.f = 'all';
    return `${UI.search({ name: 'squad', placeholder: `Search ${n} players`, value: st.q })}
      <div class="mt-3" data-part="chips">${UI.chips('sq-f', items.map(i => Object.assign({ on: i.value === st.f }, i)))}</div>
      <div class="mt-3" data-part="list">${squadRows(st, selPid)}</div>`;
  }
  function wireSquadList(el, ctx) {
    const repaint = () => { const list = el.querySelector('[data-part="list"]'); if (list) list.innerHTML = squadRows(squadState(el, ctx), ctx.params && ctx.params.pid); };
    el.addEventListener('input', e => {
      if (!e.target.matches('[data-search="squad"]')) return;
      squadState(el, ctx).q = e.target.value;
      repaint();
    });
    UI.onChip(el, 'sq-f', v => { squadState(el, ctx).f = v; repaint(); });
    UI.on(el, 'open', b => {
      if (ctx.id === 'ref.player') App.go('ref.player', { pid: b.dataset.pid }, { replace: true });
      else App.go('ref.player', { pid: b.dataset.pid });
    });
    UI.on(el, 'add', b => openAddPlayer(b.dataset.name || ''));
    UI.on(el, 'dup-open', b => App.action('admin.editPlayer', { pid: b.dataset.pid }));
    UI.on(el, 'dup-merge', b => { const g = dupGroups().find(x => x.name === b.dataset.name); if (g) openMergeConfirm(g.pids.slice(1), g.pids[0], { pickKeep: g.pids }); });
  }

  function dupReviewHtml() {
    const groups = dupGroups();
    if (!groups.length) return UI.empty('No names used twice', '');
    return `<div class="adm-dups">` + groups.map((g, i) => `<div class="lbl${i ? ' mt-6' : ''}">${esc(g.name)} <b class="n">×${g.pids.length}</b></div>` +
      UI.rows(g.pids.map(pid => UI.row({ tap: 'dup-open', data: { pid }, left: UI.avatar(Store.player(pid).name, Store.player(pid).defaultTeam), title: Store.player(pid).name, meta: playerMeta(pid, { pts: true }), chevron: true }))) +
      `<div class="mt-2">${UI.btn(`Merge into one ${g.name}`, { kind: 'o', sm: true, tap: 'dup-merge', data: { name: g.name } })}</div>`).join('') + `</div>`;
  }

  // Merge confirm sheet: srcs → dst. pickKeep: let the admin choose which one stays (duplicate groups).
  function openMergeConfirm(srcs, dst, o) {
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
    const isBlocked = () => { const p = planMerge(from, keep); return p.conflicts.length || !p.ok; };
    h = UI.sheet.open({ title: o.pickKeep ? `Merge ${plural(o.pickKeep.length, 'player')}` : 'Merge players', cls: 'sh-admin-merge', body: body(),
      footer: UI.btn(`Merge into ${(Store.player(keep) || {}).name}`, { tap: 'do-merge' }), cancel: true });
    const refresh = () => {
      h.setBody(body());
      const btn = h.el.querySelector('[data-tap="do-merge"]');
      btn.textContent = `Merge into ${(Store.player(keep) || {}).name}`;
      btn.disabled = !!isBlocked();
    };
    refresh();
    UI.on(h.el, 'keep', b => { keep = b.dataset.pid; from = o.pickKeep.filter(p => p !== keep); refresh(); });
    UI.on(h.el, 'do-merge', b => {
      if (!isAdmin()) return;
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
    if (!isAdmin()) return null;
    const st = { name: prefill || '', pos: 'MID', team: Teams.ids()[0] || 'green' };
    const matches = () => {
      const m = similarNames(st.name);
      return m.length ? `<div class="lbl mt-3">Already in the squad</div>` + UI.rows(m.map(p => UI.row({ tap: 'twin', data: { pid: p.pid }, title: p.name, meta: playerMeta(p.pid), chevron: true }))) : '';
    };
    const h = UI.sheet.open({ title: 'Add a player', cls: 'sh-admin-add',
      body: `<label class="inp"><input type="text" data-add-name autocomplete="off" autocapitalize="words" placeholder="Name" aria-label="Name" value="${esc(st.name)}"></label>
        <div data-part="twins">${matches()}</div>
        <div class="lbl mt-4">Position</div>${UI.seg('add-pos', POSITIONS.map(p => ({ value: p, label: p })), st.pos, { ref: true })}
        <div class="lbl mt-4">Usual team</div>${UI.seg('add-team', teamChoices().map(t => ({ value: t, label: fmt.team(t), team: t })), st.team, { ref: true })}`,
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
    tab: 'squad', title: 'Squad',
    header: () => ({ right: hdBtn('+ Add', 'add') }),
    mount(el, ctx) {
      wireSquadList(el, ctx);
      hdOn(ctx, 'add', () => openAddPlayer(''));
    },
    render(el, ctx) {
      if (blocked(el)) return;
      el.innerHTML = `<div class="adm-narrow">${squadList(el, ctx)}</div>`;
    },
    onData(el, ctx) {
      if (!isAdmin()) return;
      const c = el.querySelector('[data-part="chips"]'), st = squadState(el, ctx);
      if (c) c.innerHTML = UI.chips('sq-f', squadFilters().map(i => Object.assign({ on: i.value === st.f }, i)));
      const l = el.querySelector('[data-part="list"]'); if (l) l.innerHTML = squadRows(st);
    },
  });

  // ---- one player
  function swatches(p) {
    const ids = teamChoices(p.defaultTeam);
    const sw = ids.map(t => `<button type="button" class="adm-sw ${Teams.cls(t)}${t === p.defaultTeam ? ' on' : ''}" data-tap="sw" data-team="${esc(t)}" aria-pressed="${t === p.defaultTeam}" aria-label="Usual team ${esc(fmt.team(t))}">` +
      `<i>${t === p.defaultTeam ? '✓' : ''}</i><span>${esc(fmt.team(t))}</span></button>`).join('');
    const add = Teams.unusedColours().length ? `<button type="button" class="adm-sw adm-sw-add" data-tap="sw-add" aria-label="Add a team"><i>+</i><span>Add</span></button>` : '';
    return `<div class="adm-sws">${sw}${add}</div>`;
  }
  function subsSummary(pid) {
    const owed = owedDates(pid);
    if (owed.length === 1) return `<span class="adm-owes">${esc(fmt.short(owed[0]))} not paid</span>`;
    if (owed.length) return `<span class="adm-owes">${owed.length} not paid · ${esc(fmt.money(owed.length * fee()))}</span>`;
    return `<span class="meta">All paid</span>`;
  }
  function editorHtml(pid) {
    const p = Store.player(pid);
    if (!p) return UI.empty('Player not found', '');
    const st = Scoring.seasonStats(pid);
    const row = Scoring.seasonTable().find(r => r.pid === pid);
    const rank = row && st.apps ? ` · ${fmt.ordinal(row.rank)}` : '';
    return `<div class="adm-ed">
      <div class="card hero adm-ed-hd ${Teams.cls(p.defaultTeam)}">${UI.avatar(p.name, p.defaultTeam, { size: 58 })}
        <div class="grow"><div class="adm-ed-name">${esc(p.name)}</div>
        <div class="adm-ed-meta"><span class="n">${esc(plural(st.apps, 'app'))} · ${esc(st.pts)} pts${esc(rank)}</span></div></div>
        <button type="button" class="link adm-lnk" data-tap="profile">Page ›</button></div>
      ${p.needsDetails ? `<div class="flag mt-3 adm-newflag"><span class="grow">New player · details to finish</span>${UI.btn('Details are right', { kind: 'o', sm: true, tap: 'ed-done', cls: 'auto' })}</div>` : ''}
      <div class="lbl mt-6">Usual team</div>${swatches(p)}
      <div class="lbl mt-6">Position</div>${UI.seg('ed-pos', POSITIONS.map(x => ({ value: x, label: x })), p.defaultPosition || 'MID', { ref: true })}
      <div class="mt-4">${UI.rows([
        UI.row({ tap: 'ed-name', title: 'Name', right: `<span class="meta adm-val">${esc(p.name)}</span>`, chevron: true }),
        UI.row({ tap: 'ed-subs', title: 'Subs', right: subsSummary(pid), chevron: true }),
        UI.row({ tap: 'ed-merge', title: 'Merge with another player', chevron: true }),
      ])}</div>
      <div class="mt-6">${st.apps ? `<div class="adm-delflag meta">${plural(st.apps, 'app')} · ${st.pts} pts leave the table</div>` : ''}
        ${UI.hold('Hold to delete', { name: 'ed-delete', warn: true, doneText: 'Deleting…' })}</div>
    </div>`;
  }
  function savePlayer(pid, next, label, btn) {
    const p = Store.player(pid); if (!p || !isAdmin()) return;
    const prev = {}; Object.keys(next).forEach(k => { prev[k] = p[k] == null ? null : p[k]; });
    Save.run({ label, button: btn,
      write: () => Store.update('players/' + pid, next), undo: () => Store.update('players/' + pid, prev),
      onSaved: () => App.rerender(), onUndone: () => App.rerender() });
  }
  function openNameSheet(pid) {
    const p = Store.player(pid); if (!p) return;
    const twinsHtml = name => { const t = similarNames(name, pid); return t.length ? `<div class="adm-twins"><span class="warnchip">Also in the squad</span> ${t.map(x => esc(x.name)).join(', ')}</div>` : ''; };
    const h = UI.sheet.open({ title: 'Name', cls: 'sh-admin-name', autofocus: false,
      body: `<label class="inp"><input type="text" data-ed-name autocomplete="off" autocapitalize="words" value="${esc(p.name)}" aria-label="Name"></label><div data-part="twins">${twinsHtml(p.name)}</div>`,
      footer: UI.btn('Save', { tap: 'ed-save', attrs: ' disabled' }), cancel: true });
    const input = h.el.querySelector('[data-ed-name]');
    const btn = h.el.querySelector('[data-tap="ed-save"]');
    input.addEventListener('input', () => {
      h.el.querySelector('[data-part="twins"]').innerHTML = twinsHtml(input.value);
      const v = input.value.trim().replace(/\s+/g, ' ');
      btn.disabled = !v || v === (Store.player(pid) || {}).name;
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !btn.disabled) { e.preventDefault(); btn.click(); } });
    UI.on(h.el, 'ed-save', b => {
      const name = input.value.trim().replace(/\s+/g, ' ');
      const cur = Store.player(pid); if (!name || !cur) return;
      Save.run({ label: `Saved ${name}`, button: b, group: h.el,
        write: () => Store.update('players/' + pid, { name }), undo: () => Store.update('players/' + pid, { name: cur.name }),
        onSaved: () => { h.close(); App.rerender(); } });
    });
    return h;
  }
  function openSubsSheet(pid) {
    const p = Store.player(pid); if (!p) return;
    const dates = [...new Set(Object.values(Store.sessions()).filter(s => s && isDate(s.date) && Scoring.sessPlayers(s).some(x => x.pid === pid)).map(s => s.date))].sort().reverse();
    const extra = BF_PAY.dates().filter(d => !dates.includes(d) && BF_PAY.amount(pid, d) > 0);
    const all = [...dates, ...extra].sort().reverse();
    const rowOf = d => {
      const st = BF_PAY.status(pid, d), amt = BF_PAY.amount(pid, d);
      const right = st === 'paid' ? `<span class="n">${esc(fmt.money(amt))}</span>` : st === 'not paid' ? `<span class="adm-owes">not paid</span>` : `<span class="meta">not entered</span>`;
      return UI.row({ tap: 'day', data: { date: d }, title: fmt.date(d), meta: dates.includes(d) ? 'Played' : 'Paid · didn’t play', right, chevron: true });
    };
    const owed = owedDates(pid);
    const h = UI.sheet.open({ title: `Subs · ${p.name}`, titleEnd: owed.length ? `${owed.length} not paid` : '', cls: 'sh-admin-subs', cancel: 'Close',
      body: all.length ? UI.rows(all.slice(0, 40).map(rowOf)) : UI.empty('Nothing yet', '') });
    UI.on(h.el, 'day', b => { h.close(); App.go('ref.moneyDay', { date: b.dataset.date }); });
  }

  App.registerScreen('ref.player', {
    tab: 'squad', title: 'Squad',
    header: () => ({ center: `<button type="button" class="hd-btn adm-crumb" data-hd="squad">Squad ›</button>`, right: '' }),
    mount(el, ctx) {
      const pid = ctx.params.pid;
      wireSquadList(el, ctx);
      hdOn(ctx, 'squad', () => App.go('ref.squad', {}, { replace: true }));
      UI.onSeg(el, 'ed-pos', (v, b) => {
        const p = Store.player(pid); if (!p || p.defaultPosition === v) return;
        savePlayer(pid, { defaultPosition: v, needsDetails: null }, `${p.name} · ${v}`, null);
      });
      UI.on(el, 'sw', b => {
        const p = Store.player(pid), t = b.dataset.team; if (!p || (p.defaultTeam === t && !p.needsDetails)) return;
        savePlayer(pid, { defaultTeam: t, needsDetails: null }, `${p.name} · usual team ${fmt.team(t)}`, null);
      });
      UI.on(el, 'sw-add', () => App.action('admin.addTeam', {}));
      UI.on(el, 'ed-done', b => { const p = Store.player(pid); if (p) savePlayer(pid, { needsDetails: null }, `${p.name} · details done`, b); });
      UI.on(el, 'ed-name', () => openNameSheet(pid));
      UI.on(el, 'ed-subs', () => openSubsSheet(pid));
      UI.on(el, 'profile', () => App.go('player.profile', { pid }));
      UI.on(el, 'squad', () => App.go('ref.squad', {}, { replace: true }));
      UI.on(el, 'ed-merge', () => { if (isAdmin()) openMergePicker(pid); });
      UI.onHold(el, 'ed-delete', () => {
        const p = Store.player(pid); if (!p || !isAdmin()) return;
        Store.remove('players/' + pid).then(() => UI.toast(`${p.name} deleted`), () => UI.toast('Not deleted · try again', { err: true }));
        App.go('ref.squad', {}, { replace: true });
      });
    },
    render(el, ctx) {
      if (blocked(el)) return;
      const pid = ctx.params.pid;
      if (!Store.player(pid) && Store.hasData()) { el.innerHTML = UI.empty('Player not found', '') + `<div class="mt-3">${UI.btn('Back to Squad', { kind: 'g', sm: true, tap: 'squad' })}</div>`; return; }
      el.innerHTML = ctx.wide
        ? `<div class="split"><div>${squadList(el, ctx, pid)}</div><div class="split-side"><div class="adm-edcard">${editorHtml(pid)}</div></div></div>`
        : `<div class="adm-narrow">${editorHtml(pid)}</div>`;
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
      expected: playedRows.length * fee(),
      changes, delta: changes.reduce((s, r) => s + r.amount - r.saved, 0),
      hasRecord: hasRecord(date, db),
    };
  }

  function quickPanel(r, st) {
    const q = club().quickAmounts;
    const isOther = r.amount > 0 && !q.includes(r.amount);
    const btns = q.map(a => `<button type="button" class="adm-q${r.amount === a ? ' on' : ''}" data-tap="set" data-v="${a}">${esc(fmt.money(a))}</button>`).join('') +
      `<button type="button" class="adm-q${isOther || st.other ? ' on' : ''}" data-tap="other">${isOther ? esc(fmt.money(r.amount)) : 'Other'}</button>`;
    const other = st.other ? `<div class="adm-otherrow"><label class="inp adm-other"><span class="adm-cur">${esc(club().currency)}</span>` +
      `<input type="text" inputmode="decimal" autocomplete="off" data-other placeholder="Amount" aria-label="Other amount" value="${isOther ? esc(r.amount) : ''}"></label>` +
      `<button type="button" class="btn w sm auto adm-use" data-tap="use">Use</button></div>` : '';
    const none = r.saved > 0 || r.amount > 0 ? `<button type="button" class="link warn adm-none" data-tap="none">Not paid</button>` : '';
    return `<div class="adm-panel"><div class="adm-quick" style="--q:${q.length + 1}">${btns}</div>${other}${none}</div>`;
  }
  function payItem(r, st) {
    const open = st.open === r.pid;
    const chg = r.amount !== r.saved;
    const end = r.amount > 0
      ? `<span class="adm-amtv n${chg ? ' chg' : ''}">${esc(fmt.money(r.amount))}${chg ? '' : ' <span class="adm-ck">✓</span>'}</span>`
      : '';
    return `<div class="adm-pi${open ? ' open' : ''}${chg ? ' chg' : ''}">` +
      `<button type="button" class="r adm-pay" data-tap="row" data-pid="${esc(r.pid)}" aria-expanded="${open}">` +
      `<span class="grow"><span class="nm">${esc(r.name)}</span><span class="adm-sub">${UI.teamChip(r.team)}${r.tag ? `<span class="meta">${esc(r.tag)}</span>` : ''}</span></span>` +
      `<span class="end">${end}<span class="chev${open ? ' up' : ''}">${open ? '⌄' : '›'}</span></span></button>` +
      (open ? quickPanel(r, st) : '') + `</div>`;
  }
  function regChips(m, tab) {
    const items = m.playedRows.length
      ? [{ value: 'unpaid', label: 'To collect', n: m.notPaid.length }, { value: 'paid', label: 'Paid', n: m.paid.length }, { value: 'all', label: 'Everyone' }]
      : [{ value: 'paid', label: 'Paid', n: m.paid.length }, { value: 'all', label: 'Everyone' }];
    return UI.chips('reg-tab', items.map(i => Object.assign({ on: i.value === tab }, i)));
  }
  function regTop(m) {
    const kick = (() => { const s = sessionsOn(m.date).map(([, x]) => x).find(x => x.timer && x.timer.startedAt); return s ? s.timer.startedAt : null; })();
    const allPaid = m.playedRows.length && !m.notPaid.length;
    const kicker = m.tonight ? 'Collected' : `Collected · ${fmt.date(m.date)}`;
    if (allPaid) {
      const paidP = m.playedRows.filter(r => r.saved > 0);
      const before = kick ? paidP.filter(r => recTime(r.rec) && recTime(r.rec) < kick) : [];
      const after = kick ? paidP.filter(r => !(recTime(r.rec) && recTime(r.rec) < kick)) : [];
      const sum = l => l.reduce((s, r) => s + r.saved, 0);
      const bys = [...new Set(paidP.map(r => r.rec && r.rec.by).filter(Boolean))].map(who);
      const lines = [];
      if (kick && m.tonight) {
        lines.push(`<div class="r"><span class="grow nm">Before kick-off</span><span class="n">${before.length} · ${esc(fmt.money(sum(before)))}</span></div>`);
        lines.push(`<div class="r"><span class="grow nm">After the game</span><span class="n">${after.length} · ${esc(fmt.money(sum(after)))}</span></div>`);
      }
      if (bys.length) lines.push(`<div class="r"><span class="grow nm">Recorded by</span><span class="meta">${esc(bys.join(', '))}</span></div>`);
      return `<div class="card hero adm-hero"><div class="lbl adm-k">${esc(kicker)}</div>` +
        `<div class="adm-done"><span class="adm-done-tick">✓</span><div><div class="adm-done-t">Everyone’s paid</div>` +
        `<div class="sub"><span class="n">${esc(fmt.money(m.total))}</span> · ${m.paid.length} paid</div></div></div>` + (lines.length ? UI.rows(lines, { cls: 'adm-donerows' }) : '') + `</div>`;
    }
    const pct = m.playedRows.length ? Math.round(100 * m.paidPlayed / m.playedRows.length) : 0;
    const of = m.playedRows.length ? (m.tonight ? `of ${fmt.money(m.expected)}` : `of ${m.playedRows.length} who played`) : 'no match';
    const chip = !m.playedRows.length || !m.notPaid.length ? ''
      : !m.hasRecord && !m.tonight ? `<span class="adm-chip">not entered</span>` : `<span class="adm-chip">${m.notPaid.length} to collect</span>`;
    const line = m.playedRows.length
      ? `<div class="prog adm-prog"><i style="width:${pct}%"></i></div><div class="adm-progline"><span>${m.paidPlayed} of ${m.playedRows.length} paid</span>${chip}</div>`
      : `<div class="adm-progline"><span>${plural(m.paid.length, 'person', 'people')} paid</span></div>`;
    return `<div class="card hero adm-hero"><div class="lbl adm-k">${esc(kicker)}</div>` +
      `<div class="adm-big"><b class="hn">${esc(fmt.money(m.total))}</b><span class="adm-big-l">${esc(of)}</span></div>${line}</div>`;
  }
  function regList(el, m) {
    const st = el._reg;
    let list = st.tab === 'unpaid' ? m.notPaid : st.tab === 'paid' ? m.paid : m.rows;
    // drafted rows stay where they were until saved
    if (st.tab === 'unpaid') list = m.playedRows.filter(r => !(r.saved > 0));
    const q = st.q.trim().toLowerCase();
    if (st.tab === 'all' && q) list = list.filter(r => String(r.name).toLowerCase().includes(q));
    if (!list.length) {
      if (st.tab === 'unpaid') return UI.empty('Nobody left to collect from', '');
      if (st.tab === 'paid') return UI.empty('No one paid yet', '');
      return UI.empty(`No one called "${st.q.trim()}"`, '');
    }
    return `<div class="rows adm-reg">${list.map(r => payItem(r, st)).join('')}</div>`;
  }
  function regSavebar(m) {
    if (!m.changes.length) return '';
    return `<div class="savebar adm-savebar" role="status"><span class="adm-sb-t"><b>Save ${m.changes.length}</b> · <span class="n">${esc(signedMoney(m.delta))}</span></span>` +
      `<span class="adm-sb-b"><button type="button" class="ub ghost" data-tap="pay-cancel">Cancel</button><button type="button" class="ub" data-tap="pay-save">Save</button></span></div>`;
  }
  function clearBlock(m) {
    if (!isAdmin() || !m.hasRecord || m.changes.length) return '';
    return `<div class="adm-clear"><div class="meta">${esc(fmt.money(m.total))} · ${plural(m.paid.length, 'person', 'people')} paid</div>` +
      UI.hold('Hold to clear payment record', { name: 'clear', warn: true, doneText: 'Clearing…' }) + `</div>`;
  }
  function paintReg(el, full) {
    const st = el._reg;
    const m = regModel(st.date);
    if (!st.tab || (st.tab === 'unpaid' && !m.playedRows.length)) st.tab = m.playedRows.length ? (m.notPaid.length ? 'unpaid' : 'paid') : 'all';
    const set = (part, html) => { const x = el.querySelector(`[data-part="${part}"]`); if (x) x.innerHTML = html; };
    if (full) {
      el.querySelector('[data-part="reg"]').innerHTML = `
        <div class="adm-reg-a"><div data-part="top"></div></div>
        <div class="adm-reg-b"><div data-part="tabs"></div>
        <div class="mt-3" data-part="search"></div>
        <div class="mt-3" data-part="rows"></div>
        <div data-part="clear"></div></div>
        <div data-part="bar"></div>`;
    }
    set('top', regTop(m));
    set('tabs', regChips(m, st.tab));
    const sWrap = el.querySelector('[data-part="search"]');
    const hasSearch = !!(sWrap && sWrap.querySelector('[data-search="reg"]'));
    if (sWrap && st.tab === 'all' && !hasSearch) sWrap.innerHTML = UI.search({ name: 'reg', placeholder: `Search ${m.rows.length} players`, value: st.q });
    if (sWrap && st.tab !== 'all' && hasSearch) sWrap.innerHTML = '';
    if (sWrap) sWrap.hidden = st.tab !== 'all';
    set('rows', regList(el, m));
    set('clear', clearBlock(m));
    set('bar', regSavebar(m));
    el.classList.toggle('adm-has-bar', m.changes.length > 0);
    return m;
  }
  function setDraft(el, pid, v) {
    const date = el._reg.date;
    const r = regModel(date).rows.find(x => x.pid === pid); if (!r) return;
    const d = draftOf(date);
    if (v === r.saved) delete d[pid]; else d[pid] = v;
    el._reg.other = false;
    paintReg(el);
  }
  function savePayments(el, btn) {
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
    const inverse = inverseOf(updates);
    const n = m.changes.length;
    Save.run({
      label: `${fmt.date(date)} · ${plural(n, 'payment')} · ${signedMoney(m.delta)}`, button: btn, savingText: 'Saving…',
      write: () => Store.multi(updates), undo: () => Store.multi(inverse),
      onSaved: () => { m.changes.forEach(r => { delete draftOf(date)[r.pid]; }); el._reg.open = null; paintReg(el); },
    });
  }
  function mountRegister(el) {
    el.addEventListener('input', e => {
      if (!e.target.matches('[data-search="reg"]') || !el._reg) return;
      el._reg.q = e.target.value;
      const rows = el.querySelector('[data-part="rows"]');
      if (rows) rows.innerHTML = regList(el, regModel(el._reg.date));
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('[data-other]')) { e.preventDefault(); useOther(el); }
    });
    UI.onChip(el, 'reg-tab', v => { if (el._reg) { el._reg.tab = v; el._reg.open = null; paintReg(el); } });
    UI.on(el, 'row', b => {
      if (!el._reg) return;
      el._reg.open = el._reg.open === b.dataset.pid ? null : b.dataset.pid;
      el._reg.other = false;
      paintReg(el);
    });
    UI.on(el, 'set', b => { if (el._reg && el._reg.open) setDraft(el, el._reg.open, Number(b.dataset.v)); });
    UI.on(el, 'none', () => { if (el._reg && el._reg.open) setDraft(el, el._reg.open, 0); });
    UI.on(el, 'other', () => {
      if (!el._reg || !el._reg.open) return;
      el._reg.other = true; paintReg(el);
      const i = el.querySelector('[data-other]'); if (i) { i.focus(); const v = i.value; i.value = ''; i.value = v; }
    });
    UI.on(el, 'use', () => useOther(el));
    UI.on(el, 'pay-cancel', () => { if (!el._reg) return; drafts[el._reg.date] = {}; el._reg.open = null; el._reg.other = false; paintReg(el); });
    UI.on(el, 'pay-save', b => savePayments(el, b));
    UI.onHold(el, 'clear', () => {
      if (!isAdmin() || !el._reg) return;
      const date = el._reg.date;
      const paths = {};
      if ((Store.state.paymentDays || {})[date]) paths[`paymentDays/${date}`] = null;
      sessionsOn(date).forEach(([sid, s]) => { if (s.payments && Object.keys(s.payments).length) paths[`sessions/${sid}/payments`] = null; });
      drafts[date] = {};
      Store.multi(paths).then(() => { UI.toast('Payment record cleared'); paintReg(el); }, () => UI.toast('Not cleared · try again', { err: true }));
    });
  }
  function useOther(el) {
    const i = el.querySelector('[data-other]'); if (!i || !el._reg || !el._reg.open) return;
    const v = parseAmount(i.value);
    if (!v) { UI.toast('Type an amount', { err: true }); i.focus(); return; }
    i.blur();
    setDraft(el, el._reg.open, v);
  }

  // ---- list of dates
  function moneyListHtml(el) {
    const ov = moneyOverview();
    const range = ov.first ? `${fmt.short(ov.first)} – ${fmt.short(ov.last)}` : '';
    const row = r => UI.row({ tap: 'day', data: { date: r.date }, title: fmt.date(r.date),
      meta: !r.entered ? (r.isMatch ? `${r.played} played` : 'No match') :
        r.isMatch ? `${r.paidPlayed} of ${r.played} paid${r.others ? ` · ${r.others} didn’t play` : ''}` : `${plural(r.paid, 'person', 'people')} paid · no match`,
      right: r.active ? UI.pill('Tonight') : r.entered ? `<span class="n bk">${esc(fmt.money(r.total))}</span>` : `<span class="adm-chip">not entered</span>`, chevron: true });
    const missing = ov.missing;
    const st = el._ml || (el._ml = { early: false });
    const entered = ov.rows.filter(r => r.entered).length;
    const summary = `<div class="card hero adm-hero adm-collected"><div class="lbl adm-k">Collected${range ? ' · ' + esc(range) : ''}</div>` +
      `<div class="adm-big"><b class="hn">${esc(fmt.money(ov.total))}</b></div>` +
      `<div class="adm-progline"><span>${plural(entered, 'date')} entered</span>${missing.length ? `<span class="adm-chip">${plural(missing.length, 'match day')} not entered</span>` : ''}</div></div>`;
    const list = `<div class="lbl adm-lblrow"><span>Match days</span><button type="button" class="link adm-lnk" data-tap="add-date">+ Date</button></div>` +
      (ov.tracked.length ? UI.rows(ov.tracked.map(row)) : UI.empty('Nothing yet', '')) +
      (ov.earlier.length ? (st.early
        ? `<div class="lbl mt-6">Before ${esc(fmt.short(ov.first))}</div>` + UI.rows(ov.earlier.map(row))
        : `<div class="mt-3">${UI.btn(`Show ${plural(ov.earlier.length, 'earlier day')}`, { kind: 'o', sm: true, tap: 'early' })}</div>`) : '');
    return `<div class="adm-reg-a">${summary}</div><div class="adm-reg-b">${list}</div>`;
  }
  function openAddDate(cur) {
    const h = UI.sheet.open({ title: 'Payment date', cls: 'sh-admin-date',
      body: `<label class="inp adm-date"><span class="adm-date-l">Date</span><input type="date" data-newdate value="${esc(cur || today())}" aria-label="Payment date"></label>`,
      footer: UI.btn('Open', { tap: 'go' }), cancel: true, autofocus: false });
    UI.on(h.el, 'go', () => {
      const d = h.el.querySelector('[data-newdate]').value;
      if (!isDate(d)) { UI.toast('Pick a date', { err: true }); return; }
      h.close(); App.go('ref.moneyDay', { date: d });
    });
  }
  const showSeg = ctx => isAdmin() && ctx.role === 'admin';
  const moneySeg = v => UI.seg('money-view', [{ value: 'tonight', label: 'Tonight' }, { value: 'all', label: 'All dates' }], v, { ref: true });
  function wireMoneySeg(el) {
    UI.onSeg(el, 'money-view', v => App.go('ref.money', v === 'all' ? { all: 1 } : { view: 'tonight' }, { replace: true }));
  }
  function regShell(el, date, seg) {
    const fresh = !el._reg || el._reg.date !== date || !el.querySelector('[data-part="reg"] [data-part="top"]');
    if (!el._reg || el._reg.date !== date) el._reg = { date, tab: null, q: '', open: null, other: false };
    if (fresh) el.innerHTML = `${seg || ''}<div class="adm-money adm-regwrap" data-part="reg"></div>`;
    paintReg(el, fresh);
  }

  App.registerScreen('ref.money', {
    tab: 'money', title: 'Money',
    mount(el) {
      wireMoneySeg(el);
      UI.on(el, 'day', b => App.go('ref.moneyDay', { date: b.dataset.date }));
      UI.on(el, 'early', () => { el._ml = { early: true }; App.rerender(); });
      UI.on(el, 'add-date', () => openAddDate());
      mountRegister(el);
    },
    render(el, ctx) {
      const seg = showSeg(ctx);
      const view = !seg ? 'tonight' : ctx.params.all ? 'all' : (ctx.params.view === 'tonight' || tonightDate()) ? 'tonight' : 'all';
      el.classList.toggle('is-ref', !seg);
      if (view === 'tonight') { regShell(el, tonightDate() || today(), seg ? moneySeg('tonight') : ''); return; }
      el._reg = null;
      el.classList.remove('adm-has-bar');
      el.innerHTML = `${moneySeg('all')}<div class="adm-money">${moneyListHtml(el)}</div>`;
    },
    onData(el, ctx) { if (el._reg && el.querySelector('[data-part="top"]')) paintReg(el); else this.render(el, ctx); },
  });

  App.registerScreen('ref.moneyDay', {
    tab: 'money',
    header: ctx => (isAdmin() && ctx.role === 'admin' && isDate(ctx.params.date) ? { center: `<button type="button" class="hd-btn adm-crumb" data-hd="pick-date">${esc(fmt.date(ctx.params.date))} ›</button>` } : null),
    mount(el, ctx) {
      wireMoneySeg(el);
      hdOn(ctx, 'pick-date', () => openAddDate(ctx.params.date));
      mountRegister(el);
    },
    render(el, ctx) {
      const date = ctx.params.date;
      if (!isDate(date)) { el.innerHTML = UI.empty('Not a date', ''); return; }
      // The referee sees tonight only.
      if (!isAdmin() && date !== (tonightDate() || today())) { el.innerHTML = ''; setTimeout(() => App.go('ref.money', {}, { replace: true }), 0); return; }
      const seg = showSeg(ctx);
      el.classList.toggle('is-ref', !seg);
      regShell(el, date, seg ? moneySeg(date === tonightDate() ? 'tonight' : 'all') : '');
    },
    onData(el) { if (el._reg && el.querySelector('[data-part="top"]')) paintReg(el); },
  });

  // ================================================================ SETTINGS
  // Writes for a changed team. While `settings/teams` doesn't exist yet, the teams on show (the Green / Red
  // fallback) are written too, so adding Blue never makes Green and Red disappear.
  function teamWrites(changed) {
    const raw = (Store.state.settings || {}).teams;
    const u = {};
    if (!raw || typeof raw !== 'object' || !Object.keys(raw).length) Teams.all().forEach(t => Object.assign(u, Teams.writeFor(t)));
    (Array.isArray(changed) ? changed : [changed]).forEach(t => Object.assign(u, Teams.writeFor(t)));
    return u;
  }
  function saveSettings(updates, label, btn, group, onSaved) {
    if (!isAdmin()) return null;
    const inverse = inverseOf(updates);
    return Save.run({ label, button: btn, group,
      write: () => Store.multi(updates), undo: () => Store.multi(inverse), onSaved });
  }

  // ---- Club
  const CLUB_FIELDS = {
    name: { title: 'Club name', get: c => c.name },
    seasonLabel: { title: 'Season', get: c => c.seasonLabel },
    fee: { title: 'Fee', get: c => fmt.money(c.fee) },
    quickAmounts: { title: 'Quick amounts', get: c => c.quickAmounts.join(' · ') },
  };
  function followsFee(c) { return c.quickAmounts.length === 2 && c.quickAmounts[0] === c.fee && c.quickAmounts[1] === c.fee * 2; }
  function openClubField(field) {
    const c = club(), f = CLUB_FIELDS[field]; if (!f) return;
    let body;
    if (field === 'quickAmounts') {
      const q = c.quickAmounts.slice(0, 3);
      body = [0, 1, 2].map(i => `<label class="inp adm-amtinp"><span class="adm-cur">${esc(c.currency)}</span><input type="text" inputmode="decimal" autocomplete="off" data-q="${i}" value="${esc(q[i] != null ? q[i] : '')}" placeholder="${i === 2 ? 'Optional' : 'Amount'}" aria-label="Quick amount ${i + 1}"></label>`).join('');
    } else if (field === 'fee') {
      body = `<label class="inp adm-amtinp"><span class="adm-cur">${esc(c.currency)}</span><input type="text" inputmode="decimal" autocomplete="off" data-v value="${esc(c.fee)}" aria-label="Fee"></label><div class="meta mt-2" data-part="note"></div>`;
    } else {
      body = `<label class="inp"><input type="text" autocomplete="off" data-v value="${esc(field === 'name' ? c.name : c.seasonLabel)}" aria-label="${esc(f.title)}"></label>`;
    }
    const h = UI.sheet.open({ title: f.title, cls: 'sh-admin-club', autofocus: false, body, footer: UI.btn('Save', { tap: 'club-save' }), cancel: true });
    const note = () => {
      const n = h.el.querySelector('[data-part="note"]'); if (!n) return;
      const v = parseAmount(h.el.querySelector('[data-v]').value);
      n.textContent = v && followsFee(c) && v !== c.fee ? `Quick amounts become ${v} · ${v * 2}` : '';
    };
    h.el.addEventListener('input', note);
    note();
    const plan = () => {
      const u = {};
      if (field === 'quickAmounts') {
        const list = [...h.el.querySelectorAll('[data-q]')].map(i => parseAmount(i.value)).filter(Boolean);
        if (!list.length) return { err: 'Type an amount' };
        u['settings/club/quickAmounts'] = [...new Set(list)];
        return { u, label: `Quick amounts · ${u['settings/club/quickAmounts'].join(' · ')}` };
      }
      const raw = h.el.querySelector('[data-v]').value;
      if (field === 'fee') {
        const v = parseAmount(raw); if (!v) return { err: 'Type an amount' };
        u['settings/club/fee'] = v;
        if (followsFee(c)) u['settings/club/quickAmounts'] = [v, v * 2];
        return { u, label: `Fee · ${fmt.money(v)}` };
      }
      const v = String(raw || '').trim().replace(/\s+/g, ' '); if (!v) return { err: 'Type a name' };
      u['settings/club/' + field] = v;
      return { u, label: `${f.title} · ${v}` };
    };
    const go = b => {
      const p = plan();
      if (p.err) { UI.toast(p.err, { err: true }); return; }
      saveSettings(p.u, p.label, b, h.el, () => h.close());
    };
    UI.on(h.el, 'club-save', b => go(b));
    h.el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); go(h.el.querySelector('[data-tap="club-save"]')); } });
    return h;
  }

  // ---- Teams
  function colourSwatches(sel, own) {
    const used = new Set(Teams.all().map(t => t.colour));
    return `<div class="adm-sws">` + Teams.COLOURS.map(c => {
      const taken = used.has(c) && c !== own;
      return `<button type="button" class="adm-sw${c === sel ? ' on' : ''}${taken ? ' taken' : ''}" style="--tc:var(--${c})" data-tap="colour" data-colour="${c}"${taken ? ' disabled' : ''} aria-pressed="${c === sel}">` +
        `<i>${c === sel ? '✓' : ''}</i><span>${taken ? 'In use' : esc(cap(c))}</span></button>`;
    }).join('') + `</div>`;
  }
  // The score block with the team as it will look: its colour straight from the colour token and its name as
  // typed (Settings doesn't have either yet), against the first other active team.
  function previewScore(id, colour, name) {
    const other = Teams.list().find(t => t.id !== id) || Teams.all().find(t => t.id !== id) || { id: 'green' };
    const nm = esc(String(name || '').trim() || cap(colour));
    return UI.score({ teams: [{ team: '__pv', goals: 0 }, { team: other.id, goals: 0 }], centre: { top: 'VS', state: 'vs' }, size: 'compact' })
      .replace(/>__pv</g, '>' + nm + '<').replace(/__pv 0/g, nm + ' 0')
      .replace(/t-__pv"/g, `t-__pv" style="--tc:var(--${colour})"`);
  }
  const newTeamId = colour => (Teams.all().some(t => t.id === colour) ? colour + '2' : colour);
  function openTeamSheet(id) {
    const isNewTeam = !id;
    const cur = isNewTeam ? null : Teams.get(id);
    const free = Teams.unusedColours();
    if (isNewTeam && !free.length) { UI.toast('All four colours are in use'); return null; }
    const st = { colour: cur ? cur.colour : free[0], name: cur ? cur.name : cap(free[0]), named: !isNewTeam, active: cur ? cur.active : true };
    const activeOthers = Teams.list().filter(t => t.id !== id).length;
    const canOff = isNewTeam || activeOthers >= 2;
    const body = () => `<div class="lbl">Colour</div>${colourSwatches(st.colour, cur && cur.colour)}
      <div class="rows mt-4">
        <label class="r adm-namer"><span class="grow nm">Name</span><input type="text" data-team-name autocomplete="off" autocapitalize="words" value="${esc(st.name)}" aria-label="Team name"></label>
        <div class="r"><span class="grow"><span class="nm">Active</span>${!canOff ? '<span class="meta" style="display:block">At least two teams play</span>' : ''}</span>${toggle('active', st.active, { disabled: !canOff && st.active })}</div>
      </div>
      <div class="lbl mt-4">Preview</div><div data-part="preview">${previewScore(id || st.colour, st.colour, st.name)}</div>
      ${!isNewTeam && Teams.all().length > 1 ? `<div class="lbl mt-4">Order</div><div class="grid2">${UI.btn('Move left', { kind: 'g', sm: true, tap: 'move', data: { d: -1 } })}${UI.btn('Move right', { kind: 'g', sm: true, tap: 'move', data: { d: 1 } })}</div>` : ''}`;
    const label = () => isNewTeam ? `Add ${st.name.trim() || cap(st.colour)}` : 'Save';
    const h = UI.sheet.open({ title: isNewTeam ? 'Add a team' : cur.name, cls: 'sh-admin-team', autofocus: false, body: body(),
      footer: UI.btn(label(), { tap: 'team-save' }), cancel: true });
    const redraw = () => {
      h.setBody(body());
      const b = h.el.querySelector('[data-tap="team-save"]'); if (b) b.textContent = label();
    };
    h.el.addEventListener('input', e => {
      if (!e.target.matches('[data-team-name]')) return;
      st.name = e.target.value; st.named = true;
      h.el.querySelector('[data-part="preview"]').innerHTML = previewScore(id || st.colour, st.colour, st.name);
      const b = h.el.querySelector('[data-tap="team-save"]'); if (b) b.textContent = label();
    });
    UI.on(h.el, 'colour', b => {
      const prevAuto = !st.named || st.name === cap(st.colour);
      st.colour = b.dataset.colour;
      if (isNewTeam && prevAuto) { st.name = cap(st.colour); st.named = false; }
      redraw();
    });
    UI.on(h.el, 'active', () => { if (!st.active || canOff) { st.active = !st.active; redraw(); } });
    UI.on(h.el, 'move', b => {
      const list = Teams.all(), i = list.findIndex(t => t.id === id), j = i + Number(b.dataset.d);
      if (i < 0 || j < 0 || j >= list.length) return;
      const a = Object.assign({}, list[i]), o = Object.assign({}, list[j]);
      // orders are rewritten 1…n so a swap always moves exactly one place
      const orders = list.map((t, k) => k + 1);
      a.order = orders[j]; o.order = orders[i];
      const rest = list.filter((t, k) => k !== i && k !== j).map(t => Object.assign({}, t, { order: orders[list.indexOf(t)] }));
      saveSettings(teamWrites([a, o, ...rest]), `${a.name} moved ${Number(b.dataset.d) < 0 ? 'left' : 'right'}`, b, h.el, () => h.close());
    });
    UI.on(h.el, 'team-save', b => {
      const name = st.name.trim().replace(/\s+/g, ' ') || cap(st.colour);
      if (Teams.all().some(t => t.id !== id && t.name.toLowerCase() === name.toLowerCase())) { UI.toast(`${name} is already a team`, { err: true }); return; }
      if (isNewTeam) {
        const order = Math.max(0, ...Teams.all().map(t => t.order)) + 1;
        const t = { id: newTeamId(st.colour), name, colour: st.colour, order, active: st.active };
        saveSettings(teamWrites(t), `Added ${name}`, b, h.el, () => h.close());
      } else {
        const t = Object.assign({}, cur, { name, colour: st.colour, active: st.active });
        saveSettings(teamWrites(t), `Saved ${name}`, b, h.el, () => h.close());
      }
    });
    return h;
  }

  // ---- Match rules, Access
  function openPointsSheet() {
    const S = Scoring.SCORE, P = POSITIONS;
    const v = n => (n > 0 ? '+' + n : n < 0 ? MINUS + Math.abs(n) : '–');
    const rows = [
      ['Playing', P.map(p => v(S[p].app))],
      ['Goal', P.map(p => v(S[p].goal))],
      ['Assist', P.map(p => v(S[p].assist))],
      ['Clean sheet', P.map(p => v(S[p].cleanSheet))],
      ['Saves', ['+1 per 4', '–', '–', '–']],
      ['Penalty save', [v(S.GK.penaltySave), '–', '–', '–']],
      ['Conceded', [MINUS + '1 per 3', '–', '–', '–']],
      ['Block', ['–', v(S.DEF.block), 'bonus', 'bonus']],
      ['Clearance', ['–', v(S.DEF.clearance), 'bonus', 'bonus']],
      ['Defence bonus', ['–', '–', `+${S.MID.defBonusPts} per ${S.MID.defBonusPer}`, `+${S.FWD.defBonusPts} per ${S.FWD.defBonusPer}`]],
      ['Own goal', P.map(() => MINUS + '2')],
      ['Yellow card', P.map(p => v(S[p].yellow))],
      ['Red card', P.map(p => v(S[p].red))],
    ];
    const tbl = `<div class="adm-pts-t"><div class="adm-pts-r hd"><span></span>${P.map(p => `<span>${p}</span>`).join('')}</div>` +
      rows.map(([l, cells]) => `<div class="adm-pts-r"><span class="l">${esc(l)}</span>${cells.map(c => `<span class="n">${esc(c)}</span>`).join('')}</div>`).join('') + `</div>`;
    const notes = UI.rows([
      UI.row({ title: 'Defence bonus', meta: 'Block counts 2, clearance 1' }),
      UI.row({ title: 'Keepers', meta: 'Saves, conceded, clean sheets: from big poles' }),
      UI.row({ title: 'Small poles', meta: 'No keepers: a GK plays as MID' }),
    ]);
    UI.sheet.open({ title: 'Points table', cls: 'sh-admin-points', cancel: 'Close', body: tbl + `<div class="mt-4">${notes}</div>` });
  }
  function openAccessSheet() {
    const steps = [
      'On a laptop, open console.firebase.google.com and pick the befit-fc project.',
      'Go to Build › Authentication › Users.',
      `Find ${CFG.refereeEmail}. Copy its User UID, then ⋮ › Delete account.`,
      `Add user: the same email, the new password. Copy the new User UID.`,
      'Go to Realtime Database › Data › roles. Add the new UID with the value referee, and delete the old UID’s line.',
      'Tell the referee the new password. Phones sign in again once.',
    ];
    UI.sheet.open({ title: 'Referee password', cls: 'sh-admin-access', cancel: 'Close',
      body: `<div class="sub mb-3">Firebase can’t show or edit a password, so you replace the referee login.</div>` +
        `<ol class="adm-steps-ol">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` });
  }

  // ---- Data: export the season as CSV (the same numbers as Scoring)
  function seasonCsv(db) {
    const rows = Scoring.seasonTable(db);
    const owe = owedMap(db);
    const q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['Rank', 'Name', 'Usual team', 'Position', 'Apps', 'Points', 'Goals', 'Assists', 'Saves', 'Yellow cards', 'Red cards', 'Nights not paid', 'Subs owed'];
    const lines = rows.map(r => [r.rank, r.name, fmt.team(r.team), r.pos || '', r.apps, r.pts, r.g, r.a, r.sv, r.y, r.r,
      (owe[r.pid] || []).length, (owe[r.pid] || []).length * fee()].map(q).join(','));
    return [head.join(','), ...lines].join('\r\n') + '\r\n';
  }
  function csvName() {
    const slug = String(club().seasonLabel || 'season').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `befit-${slug || 'season'}-${today()}.csv`;
  }
  function exportCsv() {
    try {
      const blob = new Blob(['﻿' + seasonCsv()], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = csvName(); a.hidden = true;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
      UI.toast(`Saved ${Scoring.seasonTable().length} players · CSV`);
    } catch (e) { UI.toast('Couldn’t export · try again', { err: true }); }
  }

  const themeLabel = () => ({ auto: 'Auto', light: 'Light', dark: 'Dark' })[App.theme.get()] || 'Auto';
  function settingsHtml() {
    const c = club();
    const free = Teams.unusedColours();
    const r = (tap, title, right) => UI.row({ tap, title, right: right ? `<span class="meta adm-val">${right}</span>` : '', chevron: !!tap });
    const user = Auth.user() || {};
    const me = user.name && user.name !== 'Referee' ? user.name : (user.email ? String(user.email).split('@')[0] : 'You');
    const clubBlock = `<div class="lbl">Club</div>` + UI.rows([
      r('club-name', 'Name', esc(c.name)),
      r('club-seasonLabel', 'Season', esc(c.seasonLabel)),
      r('club-fee', 'Fee', esc(fmt.money(c.fee))),
      r('club-quickAmounts', 'Quick amounts', esc(c.quickAmounts.join(' · '))),
    ]);
    const teamsBlock = `<div class="lbl mt-6">Teams</div>` + UI.rows(Teams.all().map(t =>
      UI.row({ tap: 'team', data: { id: t.id }, cls: 'adm-team wash ' + Teams.cls(t.id), left: `<i class="adm-bar ${Teams.cls(t.id)}"></i>`, title: t.name,
        right: `<span class="meta">${t.active ? 'Active' : 'Not active'}</span>`, chevron: true })).concat(
      free.length ? [UI.row({ tap: 'add-team', titleHtml: '+ Add a team', right: `<span class="adm-dots">${free.map(x => `<i style="--tc:var(--${x})"></i>`).join('')}</span>`, cls: 'adm-addrow' })] : []));
    const rulesBlock = `<div class="lbl mt-6">Match rules</div>` + UI.rows([
      r('points', 'Points table', 'View'),
      UI.row({ title: 'Keepers', right: '<span class="meta adm-val">Count from big poles</span>' }),
      UI.row({ title: 'Small poles', right: '<span class="meta adm-val">GK plays as MID</span>' }),
    ]);
    const accessBlock = `<div class="lbl mt-6">Access</div>` + UI.rows([
      r('access', 'Referee password', 'How to change'),
      UI.row({ title: 'Admins', right: `<span class="meta adm-val">${esc(me)}</span>` }),
    ]);
    const lookBlock = `<div class="lbl mt-6">Appearance</div>` + UI.rows([
      r('appearance', 'Theme', esc(themeLabel())),
      r('appearance', 'Referee console', App.theme.getConsole() === 'app' ? 'Same as the app' : 'Always dark'),
    ]);
    const dataBlock = `<div class="lbl mt-6">Data</div>` + UI.rows([
      r('csv', 'Export season', 'CSV'),
      `<a class="r" href="${esc(location.pathname)}?practice" target="_blank" rel="noopener" data-practice><span class="grow"><span class="nm">Practice mode</span></span><span class="end"><span class="meta adm-val">Open</span><span class="chev">›</span></span></a>`,
    ]);
    return `<div class="adm-set"><div class="adm-set-a">${clubBlock}${teamsBlock}${rulesBlock}</div><div class="adm-set-b">${accessBlock}${lookBlock}${dataBlock}</div></div>`;
  }

  App.registerScreen('admin.settings', {
    tab: 'settings', mode: 'admin', title: 'Settings',
    mount(el) {
      Object.keys(CLUB_FIELDS).forEach(f => UI.on(el, 'club-' + f, () => openClubField(f)));
      UI.on(el, 'team', b => openTeamSheet(b.dataset.id));
      UI.on(el, 'add-team', () => openTeamSheet(null));
      UI.on(el, 'points', openPointsSheet);
      UI.on(el, 'access', openAccessSheet);
      UI.on(el, 'appearance', () => {
        const h = App.openAppearance();          // the shell's sheet; redraw the rows once it closes
        const layer = document.getElementById('app-layer');
        if (!h || !h.el || !layer) return;
        const obs = new MutationObserver(() => { if (!layer.contains(h.el)) { obs.disconnect(); App.rerender(); } });
        obs.observe(layer, { childList: true, subtree: true });
      });
      UI.on(el, 'csv', exportCsv);
    },
    render(el) {
      if (blocked(el)) return;
      el.innerHTML = settingsHtml();
    },
  });

  // ================================================================ CAN'T CONNECT (status slot + first-load screen)
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
      // Signal is fine but the database refused the oldest save (e.g. the login expired): saves stay on the phone.
      if (info.failed && info.status !== 'offline') {
        const signIn = !Auth.isReferee();
        const why = info.error === 'invalid' ? 'refused' : 'sign in again';
        el.innerHTML = `<div class="offline adm-offline adm-notsent" role="alert"><span class="grow"><b>Not sent (${info.failed})</b> · <span>${why}</span></span>` +
          `<button type="button" class="ub" ${signIn ? 'data-offline-signin' : 'data-offline-retry'}>${signIn ? 'Sign in' : retrying ? 'Trying…' : 'Retry'}</button></div>`;
        const si = el.querySelector('[data-offline-signin]');
        if (si) si.onclick = () => App.openSignIn();
        const rb = el.querySelector('[data-offline-retry]');
        if (rb) rb.onclick = () => retryNow(info.store, rb);
        return;
      }
      if (info.status !== 'offline') {
        el.innerHTML = '';
        if (wasOffline && info.status === 'online' && !(window.App && App.role() === 'referee')) UI.toast(info.pending ? `Back online · sending ${info.pending}` : 'Back online');
        return;
      }
      if (info.source === 'none') {
        el.innerHTML = `<div class="adm-nodata" role="alert"><span class="wm">BE FIT <em>CLUB</em></span>
          <div class="adm-nodata-c">${UI.icon('wifi-off')}<b>Can’t connect</b><span class="sub">Nothing saved on this phone yet</span>
          <button type="button" class="btn w adm-retry" data-offline-retry>${retrying ? 'Trying…' : 'Retry'}</button></div></div>`;
      } else if (window.App && App.role && App.role() === 'referee') {
        el.innerHTML = '';                              // the referee's header sync chip says it ("On phone · 3 waiting")
        return;
      } else {
        const when = info.savedAt ? (fmt.iso(info.savedAt) === today() ? fmt.time(info.savedAt) : `${fmt.short(fmt.iso(info.savedAt))} ${fmt.time(info.savedAt)}`) : '';
        const detail = info.pending && Auth.isReferee() ? `${info.pending} waiting to send` : when ? `last updated ${when}` : 'showing this phone’s copy';
        el.innerHTML = `<div class="offline adm-offline" role="status">${UI.icon('wifi-off')}<span class="grow"><b>Offline</b> · <span class="n">${esc(detail)}</span></span>` +
          `<button type="button" class="ub" data-offline-retry>${retrying ? 'Trying…' : 'Retry'}</button></div>`;
      }
      const b = el.querySelector('[data-offline-retry]');
      if (b) b.onclick = () => retryNow(info.store, b);
    },
  });
  // Retry by itself when the phone says the signal is back, or the app comes back to the front.
  window.addEventListener('online', () => { try { Store.retry(); } catch (e) { /* ignore */ } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Store.status().status === 'offline') Store.retry(); });
  // The status slot follows the role (the referee hides the bar): redraw it when the page changes.
  window.addEventListener('hashchange', () => setTimeout(() => {
    const el = document.getElementById('app-status');
    if (el && App.screens['app.offline']) App.screens['app.offline'].render(el, Object.assign({ store: Store }, Store.status()));
  }, 0));

  // ================================================================ ACTIONS
  App.registerAction('admin.editPlayer', ({ pid }) => {
    if (!isAdmin()) { UI.toast('Only the admin can change players'); return; }
    App.go('ref.player', { pid });
  });
  App.registerAction('admin.addTeam', () => (isAdmin() ? openTeamSheet(null) : null));

  // Test hooks (pure helpers; no writes) so the harness can check the maths against Scoring.
  window.__BEFIT_ADMIN__ = { daySummary, moneyOverview, recordsFor, playedOn, planMerge, dupGroups, regModel, owedMap, seasonCsv, teamWrites, needs };

})();
