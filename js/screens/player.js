/* ============================================================================
   BE Fit Club · js/screens/player.js · PLAYER MODE            OWNER: Phase 2 · Player builder
   ----------------------------------------------------------------------------
   Every screen a player or watcher sees. All points come from Scoring (never
   our own maths); every name goes through UI.esc. Styles: css/player.css,
   scoped under .scr-player-* (sheets: .sh-player-*, goal moment: .pl-gm).

   SCREENS (ids are fixed; other files link to them)
     'player.live'            tab live    Live viewer: score + scorers, "You · n pts live" (tap: the maths),
                                          Live points top 5 (All n ›), Latest feed (All ›).
                                          No game: Tonight · No game yet, last game, your last game, top 3.
     'player.table'           tab table   Season | Last game, position chips, rank + movement, sticky "you" row.
                                          Laptop: table left, the tapped player's page right.
     'player.season'          tab season  Points race + W/D/L bar, Full table ›, form, leaders, results.
     'player.me'              tab me      Your page + Subs + settings (Share card, Appearance, sign-in, Not you?)
     'player.match'  {sid}    tab season  Score, scorers, poles, Top points, team switch "Green 57", tap-to-expand maths.
     'player.profile' {pid}   tab table   Anyone's page (Me without Subs); laptop: beside the table.
   ACTIONS
     'player.shareCard' ({ pid })         share card sheet: Season | Last game, Dark | Light, Share, Save image.
   GLOBAL
     GoalMoment: 2 s full-screen "Goal" on every phone except the referee's (Auth.isReferee()).
   ========================================================================== */
(function () {
  'use strict';
  const esc = UI.esc, fmt = UI.fmt;
  const db = () => Store.state;
  const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
  const LOADING = '<div class="skel" style="height:190px"></div><div class="skel mt-3" style="height:260px"></div>';

  // ======================================================================== shared helpers
  const teamsScore = sess => Scoring.orderTeams(Scoring.teamsOf(sess)).map(team => ({ team, goals: Scoring.teamGoals(sess, team) }));
  function teamOfIn(sess, pid) {
    for (const [t, td] of Object.entries((sess && sess.teams) || {})) if (td && td.players && td.players[pid]) return t;
    return null;
  }
  const rowsOf = () => Scoring.seasonTable(db());
  const rankOf = (rows, pid) => rows.find(r => r.pid === pid) || null;
  const backBtn = label => `<button type="button" class="hd-btn" data-shell="back">‹ ${esc(label)}</button>`;
  const shareBtn = pid => `<button type="button" class="hd-btn" data-pl-share="${esc(pid)}">Share card</button>`;

  function polesText(sess) {
    const f = Scoring.formatOf(sess);
    if (f.legacy) return '';
    if (f.start === 'big') return 'Big poles';
    return f.switchedAt != null ? `Big poles from ${f.switchedAt}'` : 'Small poles';
  }

  // "Red lost 4–7" from a playerHistory row (for – against, from their side)
  function resultLine(h) {
    if (!h || h.result == null) return '';
    const verb = h.result === 'W' ? 'won' : h.result === 'L' ? 'lost' : 'drew';
    return `${fmt.team(h.team)} ${verb} ${h.for}–${h.against}`;
  }

  // "2 goals · 1 assist": the first two things that earned or cost points
  function shortTally(m, max) {
    const t = m.tally || {}, out = [];
    const cs = (m.breakdown || []).some(b => b.key === 'cleanSheet');
    if (t.goals) out.push(fmt.plural(t.goals, 'goal'));
    if (t.assists) out.push(fmt.plural(t.assists, 'assist'));
    if (m.pos === 'GK' && t.saves) out.push(fmt.plural(t.saves, 'save'));
    if (t.penSaves) out.push(fmt.plural(t.penSaves, 'penalty save'));
    if (cs) out.push('clean sheet');
    if (m.pos === 'DEF' && t.blocks) out.push(fmt.plural(t.blocks, 'block'));
    if (m.pos === 'DEF' && t.clearances) out.push(fmt.plural(t.clearances, 'clearance'));
    if (t.ogs) out.push(fmt.plural(t.ogs, 'own goal'));
    if (t.yellow) out.push(fmt.plural(t.yellow, 'yellow card'));
    if (t.red) out.push(fmt.plural(t.red, 'red card'));
    return out.slice(0, max || 2).join(' · ');
  }

  // The maths, one short line per item ("Played +2", "3 goals +12", "Clean sheet from 46' +8")
  const bdHtml = list => `<div class="pl-bd">${(list || []).map(b =>
    `<div class="pl-bd-r"><span>${esc(b.label)}</span><span class="n">${esc(fmt.signed(b.pts))}</span></div>`).join('')}</div>`;

  function scorersHtml(sess) {
    const by = Scoring.scorers(sess, db());
    const teams = teamsScore(sess).map(t => t.team);
    if (!teams.some(t => (by[t] || []).length)) return '';
    const col = t => (by[t] || []).map(r =>
      `<span class="pl-sc">${esc(r.name)}${r.og ? ' <span class="pl-og">og</span>' : ''} <span class="n">${esc(r.mins.map(fmt.minute).filter(Boolean).join(' '))}</span></span>`).join('');
    if (teams.length <= 2) return `<div class="scorers pl-scorers"><div>${col(teams[0])}</div><div>${teams[1] ? col(teams[1]) : ''}</div></div>`;
    return `<div class="pl-scorers-multi">${teams.map(t => `<div>${UI.teamMark(t)}${col(t)}</div>`).join('')}</div>`;
  }

  // Score card. o = { label (html), mid (html), sid (tap opens the match) }
  function scoreCard(sess, o) {
    const poles = polesText(sess);
    const tapA = o.sid ? ` role="link" tabindex="0" data-tap="match" data-sid="${esc(o.sid)}"` : '';
    return `<div class="card pl-scard"${tapA}>${o.label ? `<div class="lbl">${o.label}</div>` : ''}` +
      UI.score({ teams: teamsScore(sess), mid: o.mid }) + scorersHtml(sess) +
      (poles ? `<div class="pl-poles">${esc(poles)}</div>` : '') + `</div>`;
  }

  // Live clock label: LIVE 72' / Half time / Full time / Not started
  function liveLabel(sess) {
    const st = Clock.status(sess);
    if (st === 'ended') return { live: false, text: 'Full time' };
    if (st === 'idle') return { live: false, text: 'Not started' };
    if (st === 'paused') return { live: true, text: Clock.phase(sess) };
    const p = Clock.minuteParts(sess);
    return { live: true, text: p ? Scoring.minuteText(p) : '' };
  }

  // A ranked row: rank · name · team · points (the "you" row is highlighted)
  function rankRow(o) {
    const tapA = o.pid ? ` data-tap="profile" data-pid="${esc(o.pid)}"` : '';
    const tag = o.pid ? 'button type="button"' : 'div';
    return `<${tag} class="r pl-rr${o.you ? ' pl-me' : ''}"${tapA}><span class="n pl-rn">${esc(o.rank)}</span>` +
      `<span class="grow"><span class="nm">${esc(o.name)}</span></span>${UI.teamMark(o.team)}<span class="pts">${esc(o.pts)}</span></${tag.split(' ')[0]}>`;
  }

  // Keyboard: Enter / Space on our non-button tap targets
  function keyTaps(el) {
    el.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-tap]:not(button)')) { e.preventDefault(); e.target.click(); }
    });
  }

  // ======================================================================== profile (Me + anyone)
  // Me › Subs uses the same payments rule as Money (js/core/pay.js), so both screens always agree.
  // Lists every date the player paid or owes, newest first; dates with no record ("not entered") are left out.
  function subsFor(pid) {
    const d = db();
    const out = BF_PAY.dates(d).map(date => ({ date, status: BF_PAY.status(pid, date, d) }))
      .filter(x => x.status === 'paid' || x.status === 'not paid')
      .map(x => ({ date: x.date, played: BF_PAY.playedOn(x.date, d).has(pid), amount: BF_PAY.amount(pid, x.date, d) }));
    return { dates: out, unpaid: out.filter(x => x.played && !x.amount) };
  }

  function statCells(st, pos) {
    const cells = pos === 'GK'
      ? [['Apps', st.apps], ['Saves', st.sv], ['Goals', st.g]]
      : [['Apps', st.apps], ['Goals', st.g], ['Assists', st.a]];
    cells.push(st.r ? ['Cards', st.y + st.r] : ['Yellow', st.y]);
    return cells.map(([k, v]) => `<div><div class="n pl-stat">${esc(v)}</div><div class="meta">${esc(k)}</div></div>`).join('');
  }

  function barsHtml(hist) {
    if (!hist.length) return '';
    const list = hist.slice().reverse();          // oldest left, newest right
    const max = Math.max(1, ...list.map(h => h.pts));
    return `<div class="lbl pl-gap">Last ${list.length === 1 ? 'game' : list.length + ' games'}</div><div class="pl-bars">` + list.map(h => {
      const ht = Math.max(4, Math.round(54 * Math.max(0, h.pts) / max));
      return `<button type="button" class="pl-bar${h.result === 'W' ? ' won' : ''}" data-tap="match" data-sid="${esc(h.sid)}" aria-label="${esc(fmt.date(h.date))}: ${esc(h.pts)} points${h.result === 'W' ? ', won' : ''}">` +
        `<span class="n pl-bar-v">${esc(h.pts)}</span><i style="height:${ht}px"></i><span class="pl-bar-d">${esc(fmt.short(h.date))}</span></button>`;
    }).join('') + '</div>';
  }

  function historyHtml(hist) {
    if (!hist.length) return '';
    return `<div class="lbl pl-gap">Matches <b class="n">${hist.length}</b></div>` + UI.rows(hist.map(h => UI.row({
      tap: 'match', data: { sid: h.sid }, left: UI.resultMark(h.result),
      title: fmt.date(h.date), meta: [shortTally(h), resultLine(h)].filter(Boolean).join(' · ') || 'Played',
      pts: h.pts, chevron: true,
    })), { cls: 'pl-hist' });
  }

  function settingsRows(ctx, pid) {
    return UI.rows([
      pid ? UI.row({ tap: 'share', data: { pid }, title: 'Share card', chevron: true }) : '',
      UI.row({ tap: 'appearance', title: 'Appearance', chevron: true }),
      ctx.isReferee ? UI.row({ tap: 'refmode', title: 'Referee mode', chevron: true }) : UI.row({ tap: 'signin', title: 'Referee sign-in', chevron: true }),
      ctx.isReferee ? UI.row({ tap: 'signout', title: 'Sign out' }) : '',
      pid ? UI.row({ tap: 'who', title: 'Not you?', chevron: true }) : '',
    ].filter(Boolean), { cls: 'pl-settings' });
  }

  // o = { own: Me (Subs + settings), ctx }
  function profileHtml(pid, o) {
    const p = Store.player(pid);
    if (!p) return UI.empty('Player not found', '');
    const rows = rowsOf(), me = rankOf(rows, pid);
    const st = Scoring.seasonStats(pid, db());
    const hist = Scoring.playerHistory(pid, db());
    const carry = (p.carryover && p.carryover.pts) || 0;
    const head = `<div class="pl-ph">${UI.avatar(p.name, p.defaultTeam).replace('class="av', 'class="av pl-av-lg')}` +
      `<div class="grow"><h1 class="pl-name">${esc(p.name)}</h1><div class="pl-tm">${UI.pos(p.defaultPosition)}${UI.teamMark(p.defaultTeam)}` +
      `${me && st.apps ? `<span class="meta">#${me.rank} of ${rows.length}</span>` : ''}</div></div></div>`;
    const pts = `<div class="card pl-pcard"><div class="pl-ptop"><span class="n pl-hero">${esc(st.pts)}</span><span class="faint">pts</span>` +
      (carry ? `<button type="button" class="pl-info" data-tap="carry" data-pid="${esc(pid)}" aria-label="Where the points come from">(i)</button>` : '') +
      `</div><div class="hr pl-hr"></div><div class="grid4 pl-stats">${statCells(st, p.defaultPosition)}</div></div>`;
    let subs = '';
    if (o.own) {
      const s = subsFor(pid);
      const right = s.unpaid.length === 1 ? `<span class="warnchip">${esc(fmt.short(s.unpaid[0].date))} not paid</span>`
        : s.unpaid.length > 1 ? `<span class="warnchip">${s.unpaid.length} dates not paid</span>`
        : `<span class="meta">${s.dates.length ? 'All paid' : 'Nothing due'}</span>`;
      subs = `<button type="button" class="card pl-subs" data-tap="subs" data-pid="${esc(pid)}"><span class="grow">Subs</span>${right}<span class="chev">›</span></button>`;
    }
    const a = head + pts + subs + barsHtml(hist.slice(0, 5));
    const b = historyHtml(hist) || (o.own ? '' : `<div class="pl-gap">${UI.empty('No games yet', '')}</div>`);
    const set = o.own ? `<div class="pl-gap">${settingsRows(o.ctx, pid)}</div>` : '';
    const wideSet = o.ctx && o.ctx.wide;
    return `<div class="pl-prof"><div class="pl-prof-a">${a}${wideSet ? set : ''}</div><div class="pl-prof-b">${b}${wideSet ? '' : set}</div></div>`;
  }

  function openCarry(pid) {
    const p = Store.player(pid); if (!p) return;
    const st = Scoring.seasonStats(pid, db());
    const carry = (p.carryover && p.carryover.pts) || 0;
    const first = Scoring.completedSessions(db()).filter(x => (x.sess.mode || 'live') !== 'history').pop();
    UI.sheet.open({
      title: `${p.name} · ${st.pts} pts`, cls: 'sh-player-carry', cancel: 'Close',
      body: UI.rows([
        UI.row({ title: 'Carried over', meta: 'Jan–May', pts: carry }),
        UI.row({ title: 'Since', meta: first ? fmt.date(first.sess.date) : '', pts: st.pts - carry }),
      ]),
    });
  }

  function openSubs(pid, ctx) {
    const p = Store.player(pid); if (!p) return;
    const s = subsFor(pid);
    const body = s.dates.length ? UI.rows(s.dates.map(x => UI.row({
      tap: ctx.isReferee ? 'money-day' : null, data: { date: x.date },
      title: fmt.date(x.date), meta: x.played ? 'Played' : null,
      right: x.amount ? `<span class="n pl-paid">${esc(fmt.money(x.amount))}</span>` : `<span class="warnchip">Not paid</span>`,
      chevron: ctx.isReferee,
    }))) : UI.empty('Nothing due', '');
    const h = UI.sheet.open({ title: 'Subs', titleEnd: s.unpaid.length ? `${s.unpaid.length} not paid` : '', cls: 'sh-player-subs', body, cancel: 'Close' });
    UI.on(h.el, 'money-day', b => { h.close(); App.setMode('referee'); App.go('ref.moneyDay', { date: b.dataset.date }); });
  }

  function bindProfile(el, ctx) {
    UI.on(el, 'match', b => App.go('player.match', { sid: b.dataset.sid }));
    UI.on(el, 'carry', b => openCarry(b.dataset.pid));
    UI.on(el, 'subs', b => openSubs(b.dataset.pid, ctx));
    UI.on(el, 'share', b => App.action('player.shareCard', { pid: b.dataset.pid }));
    UI.on(el, 'appearance', () => App.openAppearance());
    UI.on(el, 'who', () => App.go('welcome'));
    UI.on(el, 'signin', () => App.openSignIn());
    UI.on(el, 'signout', () => App.signOut());
    UI.on(el, 'refmode', () => { App.setMode('referee'); App.goTab('match'); });
  }
  // header "Share card" buttons live outside the screen element
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pl-share]');
    if (b) App.action('player.shareCard', { pid: b.dataset.plShare });
  });

  // ======================================================================== player.live
  const LIVE = { youOpen: false };
  const KIND = { goal: 'Goal', ownGoal: 'Own goal', save: 'Save', penaltySave: 'Penalty save', block: 'Block',
    clearance: 'Clearance', yellowCard: 'Yellow card', redCard: 'Red card', halfTime: 'Half time' };

  function feedRow(sess, e) {
    const d = db().players || {};
    const pid = e.scorerId || e.playerId;
    let kind = KIND[e.type];
    if (!kind && /pole/i.test(e.type || '')) kind = 'Big poles';
    if (!kind) return '';
    const team = e.type === 'goal' || e.type === 'ownGoal' ? e.team : pid ? teamOfIn(sess, pid) : null;
    const glyph = e.type === 'yellowCard' ? UI.cardGlyph('yellow') + ' ' : e.type === 'redCard' ? UI.cardGlyph('red') + ' ' : '';
    const who = pid ? `<span class="nm">${esc((d[pid] || {}).name || '?')}</span> <span class="kind">${glyph}${esc(kind)}</span>`
      : `<span class="nm">${esc(kind)}</span>`;
    return `<div class="r"><span class="min">${esc(fmt.minute(e))}</span><span class="grow">${who}</span>${team ? UI.teamMark(team) : ''}</div>`;
  }
  function feedList(sess) {
    return Scoring.sessEvents(sess).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).map(e => feedRow(sess, e)).filter(Boolean);
  }

  function youCard(mp) {
    const p = Store.player(mp.pid) || { name: mp.name };
    const what = shortTally(mp) || 'Playing';
    return `<div class="card pl-you" role="button" tabindex="0" data-tap="you" aria-expanded="${LIVE.youOpen}">` +
      `<div class="pl-you-top">${UI.avatar(p.name, mp.team).replace('class="av', 'class="av pl-av-md')}` +
      `<span class="grow pl-you-w">You · ${esc(what)}</span>` +
      `<span class="pl-you-p"><span class="n pl-big">${esc(mp.total)}</span><span class="meta">pts live</span></span>` +
      `<span class="chev">${LIVE.youOpen ? '⌄' : '›'}</span></div>${LIVE.youOpen ? bdHtml(mp.breakdown) : ''}</div>`;
  }

  function liveHtml(ctx, sid, sess) {
    const L = liveLabel(sess);
    const label = L.live ? `<span class="live">LIVE</span><b class="n" data-livemin>${esc(L.text)}</b>`
      : `<span>${esc(L.text === 'Not started' ? 'Tonight · ' + fmt.date(sess.date) : 'Full time')}</span><b class="n">${L.text === 'Not started' ? 'Not started' : 'FT'}</b>`;
    const ended = Clock.status(sess) === 'ended';
    const card = scoreCard(sess, { label, sid, mid: ended ? '<span class="clock-s">FT</span>' : '<span class="pl-dash">–</span>' });
    const all = Scoring.livePoints(sess, db());
    const v = ctx.viewer, mi = v ? all.findIndex(p => p.pid === v) : -1;
    const you = mi >= 0 ? youCard(all[mi]) : '';
    const top = all.slice(0, 5).map((p, i) => rankRow({ rank: i + 1, name: p.name, team: p.team, pts: p.total, pid: p.pid, you: p.pid === v }));
    if (mi >= 5) top.push(rankRow({ rank: mi + 1, name: all[mi].name, team: all[mi].team, pts: all[mi].total, pid: v, you: true }));
    const lp = all.length ? `<div class="lbl pl-gap">Live points <button type="button" class="pl-more" data-tap="all-live">All ${all.length} ›</button></div>` + UI.rows(top) : '';
    const feed = feedList(sess);
    const fd = feed.length ? `<div class="lbl pl-gap">Latest ${feed.length > 4 ? `<button type="button" class="pl-more" data-tap="all-feed">All ${feed.length} ›</button>` : ''}</div>` +
      UI.rows(feed.slice(0, 4), { cls: 'feed' }) : '';
    return `<div class="pl-2col"><div>${card}${you}${lp}</div><div>${fd}</div></div>`;
  }

  function noGameHtml(ctx) {
    const d = db();
    const today = fmt.iso(Store.now());
    const last = Scoring.lastGame(d);
    const isToday = !!(last && last.sess.date === today);
    let html = `<div class="lbl">Tonight · ${esc(fmt.date(today))}</div><h1 class="head pl-h1">${isToday ? 'Full time' : 'No game yet'}</h1>`;
    if (!last) return html + UI.empty('No games yet', '');
    const left = scoreCard(last.sess, { sid: last.sid, mid: '<span class="clock-s">FT</span>',
      label: `<span>${isToday ? 'Tonight' : 'Last game · ' + esc(fmt.date(last.sess.date))}</span><span class="chev">›</span>` });
    let you = '';
    const rows = rowsOf();
    const v = ctx.viewer;
    const h = v ? Scoring.playerHistory(v, d, 1)[0] : null;
    if (h) {
      const r = rankOf(rows, v);
      you = `<div class="card pl-ylast" role="link" tabindex="0" data-tap="match" data-sid="${esc(h.sid)}"><div class="grow">` +
        `<div class="lbl">${h.sid === last.sid ? 'You, last game' : 'You, last game · ' + esc(fmt.short(h.date))}</div>` +
        `<div><span class="n pl-big">${esc(h.pts)}</span> <span class="faint">pts</span></div>` +
        `<div class="meta">${esc([shortTally(h), resultLine(h)].filter(Boolean).join(' · '))}</div></div>` +
        (r ? `<div class="pl-rank"><div class="n">#${r.rank}</div><div class="meta">of ${rows.length}</div></div>` : '') + `<span class="chev">›</span></div>`;
    }
    const top = rows.slice(0, 3).map(r => rankRow({ rank: r.rank, name: r.name, team: r.team, pts: r.pts, pid: r.pid, you: r.pid === v }));
    const tbl = `<div class="lbl pl-gap"><button type="button" class="pl-more pl-more-l" data-tap="table">Table</button><button type="button" class="pl-more" data-tap="table" aria-label="Open the table">›</button></div>` + UI.rows(top);
    return html + `<div class="pl-2col"><div>${left}${you}</div><div>${tbl}</div></div>`;
  }

  function openAllLive() {
    const sid = Store.activeSessionId(); const sess = sid && Store.session(sid); if (!sess) return;
    const v = App.viewer();
    const all = Scoring.livePoints(sess, db());
    const h = UI.sheet.open({ title: 'Live points', titleEnd: String(all.length), cls: 'sh-player-live', cancel: 'Close',
      body: UI.rows(all.map((p, i) => rankRow({ rank: i + 1, name: p.name, team: p.team, pts: p.total, pid: p.pid, you: p.pid === v }))) });
    UI.on(h.el, 'profile', b => { h.close(); App.go('player.profile', { pid: b.dataset.pid }); });
  }
  function openAllFeed() {
    const sid = Store.activeSessionId(); const sess = sid && Store.session(sid); if (!sess) return;
    const feed = feedList(sess);
    UI.sheet.open({ title: 'All events', titleEnd: String(feed.length), cls: 'sh-player-feed', cancel: 'Close', body: UI.rows(feed, { cls: 'feed' }) });
  }

  App.registerScreen('player.live', {
    tab: 'live',
    mount(el, ctx) {
      keyTaps(el);
      UI.on(el, 'match', b => App.go('player.match', { sid: b.dataset.sid }));
      UI.on(el, 'profile', b => App.go('player.profile', { pid: b.dataset.pid }));
      UI.on(el, 'table', () => App.goTab('table'));
      UI.on(el, 'you', b => { LIVE.youOpen = !LIVE.youOpen; App.screens['player.live'].render(el, ctx); });
      UI.on(el, 'all-live', openAllLive);
      UI.on(el, 'all-feed', openAllFeed);
      ctx.every(1000, () => {           // the minute ticks without a re-render
        const m = el.querySelector('[data-livemin]'); const s = Store.activeSession();
        if (m && s) { const t = liveLabel(s).text; if (m.textContent !== t) m.textContent = t; }
      });
    },
    render(el, ctx) {
      if (!Store.hasData()) { el.innerHTML = LOADING; return; }
      const sid = Store.activeSessionId();
      el.innerHTML = sid ? liveHtml(ctx, sid, Store.session(sid)) : noGameHtml(ctx);
    },
  });

  // ======================================================================== player.table (+ profile on laptops)
  const TBL = { view: 'season', pos: 'all', sel: null };

  function tableHtml(ctx, selPid) {
    const rows = rowsOf();
    const v = ctx.viewer;
    const lastDate = rows.lastGame ? fmt.short(rows.lastGame.date) : 'Last';
    const count = {}; rows.forEach(r => { count[r.pos] = (count[r.pos] || 0) + 1; });
    const chips = UI.chips('tpos', [{ value: 'all', label: `All ${rows.length}`, on: TBL.pos === 'all' }]
      .concat(POSITIONS.filter(p => count[p]).map(p => ({ value: p, label: p, on: TBL.pos === p }))));
    let list = TBL.pos === 'all' ? rows : rows.filter(r => r.pos === TBL.pos);
    const last = TBL.view === 'last';
    if (last) list = list.filter(r => r.lastPts != null).sort((a, b) => b.lastPts - a.lastPts || b.pts - a.pts || a.name.localeCompare(b.name));
    const head = `<div class="pl-thead"><h1 class="head">Table</h1>${UI.seg('tview', [{ value: 'season', label: 'Season' }, { value: 'last', label: 'Last game' }], TBL.view)}</div>`;
    const body = list.map((r, i) => {
      const you = r.pid === v, sel = ctx.wide && r.pid === selPid;
      const rank = last ? i + 1 : r.rank;
      return `<tr class="${you ? 'you' : ''}${sel ? ' sel' : ''}" data-tap="open" data-pid="${esc(r.pid)}" tabindex="0" role="button">` +
        `<td class="l n pl-rk">${rank}${last ? '' : UI.move(r.move)}</td>` +
        `<td class="l"><div class="pl-tn">${esc(r.name)}${you ? ' <span class="pl-youtag">you</span>' : ''}</div><div class="pl-tm">${UI.pos(r.pos)}${UI.teamMark(r.team)}</div></td>` +
        `<td class="pl-c2">${last ? r.pts : (r.lastPts == null ? '–' : r.lastPts)}</td><td class="bk">${last ? r.lastPts : r.pts}</td></tr>`;
    }).join('');
    const table = list.length ? `<table class="tbl pl-tbl"><thead><tr><th class="l pl-rk">#</th><th class="l">Player</th>` +
      `<th class="pl-c2">${last ? 'Season' : esc(lastDate)}</th><th>${last ? esc(lastDate) : 'Pts'}</th></tr></thead><tbody>${body}</tbody></table>`
      : UI.empty(last ? 'No one in this position last game' : 'No one in this position', '');
    return head + chips + table;
  }

  function tableScreenHtml(ctx, selPid) {
    if (!ctx.wide) return tableHtml(ctx, null);
    const rows = rowsOf();
    const pid = selPid || ctx.viewer || (rows[0] && rows[0].pid);
    return `<div class="split"><div>${tableHtml(ctx, pid)}</div><div class="split-side" data-side>${pid ? profileHtml(pid, { own: false, ctx }) : ''}</div></div>`;
  }

  function mountTable(el, ctx, draw) {
    keyTaps(el);
    bindProfile(el, ctx);
    UI.onSeg(el, 'tview', val => { TBL.view = val; draw(); });
    UI.onChip(el, 'tpos', val => { TBL.pos = val; draw(); });
    UI.on(el, 'open', b => {
      const pid = b.dataset.pid;
      if (!ctx.wide) { App.go('player.profile', { pid }); return; }
      TBL.sel = pid;
      el.querySelectorAll('.pl-tbl tr.sel').forEach(r => r.classList.remove('sel'));
      b.classList.add('sel');
      const side = el.querySelector('[data-side]');
      if (side) { side.innerHTML = profileHtml(pid, { own: false, ctx }); side.scrollTop = 0; }
    });
  }

  App.registerScreen('player.table', {
    tab: 'table',
    mount(el, ctx) { mountTable(el, ctx, () => this.render(el, ctx)); },
    render(el, ctx) {
      if (!Store.hasData()) { el.innerHTML = LOADING; return; }
      el.innerHTML = tableScreenHtml(ctx, TBL.sel);
    },
  });

  App.registerScreen('player.profile', {
    tab: 'table',
    header: ctx => ({ left: backBtn('Table'), right: Store.player(ctx.params.pid) ? shareBtn(ctx.params.pid) : '' }),
    mount(el, ctx) { TBL.sel = ctx.params.pid; mountTable(el, ctx, () => this.render(el, ctx)); },
    render(el, ctx) {
      if (!Store.hasData()) { el.innerHTML = LOADING; return; }
      el.innerHTML = ctx.wide ? tableScreenHtml(ctx, TBL.sel || ctx.params.pid) : profileHtml(ctx.params.pid, { own: false, ctx });
    },
  });

  // ======================================================================== player.me
  App.registerScreen('player.me', {
    tab: 'me',
    header: ctx => ({ left: '<span class="wm">ME</span>', center: '', right: ctx.viewer && Store.player(ctx.viewer) ? shareBtn(ctx.viewer) : '' }),
    mount(el, ctx) { keyTaps(el); bindProfile(el, ctx); },
    render(el, ctx) {
      if (!Store.hasData()) { el.innerHTML = LOADING; return; }
      const p = ctx.viewer ? Store.player(ctx.viewer) : null;
      if (p) { el.innerHTML = profileHtml(ctx.viewer, { own: true, ctx }); return; }
      el.innerHTML = `<h1 class="head pl-h1">Me</h1>` + UI.rows([UI.row({ tap: 'who', title: 'Pick your name', meta: 'Your points show first', chevron: true })]) +
        `<div class="pl-gap">${settingsRows(ctx, null)}</div>`;
    },
  });

  // ======================================================================== player.season
  function seasonNumbers(d) {
    const games = [], draws = [];
    Scoring.completedSessions(d).forEach(x => {
      const res = Scoring.result(x.sess);
      if (!res.valid) return;
      games.push(x); if (res.draw) draws.push(x);
    });
    return { games: games.length, draws: draws.length };
  }

  function seasonHtml(ctx) {
    const d = db();
    const T = Scoring.teamStandings(d);
    const teams = Scoring.orderTeams(Object.keys(T).filter(t => T[t].played));
    const n = seasonNumbers(d);
    let html = `<div class="lbl">${esc(BF_CONFIG.seasonLabel)} <b><span class="n">${n.games}</span> ${n.games === 1 ? 'game' : 'games'}</b></div>`;
    if (!teams.length) return html + UI.empty('No games yet', '');
    const segs = teams.map(t => `<i class="t-${esc(t)}" style="flex:${T[t].w || 0}"></i>`);
    if (n.draws) segs.splice(Math.min(1, segs.length), 0, `<i class="pl-drawn" style="flex:${n.draws}"></i>`);
    const under = teams.length === 2
      ? `<div class="pl-wdl"><span>${T[teams[0]].w} won</span><span>${n.draws} drawn</span><span>${T[teams[1]].w} won</span></div>`
      : `<div class="pl-wdl">${teams.map(t => `<span>${UI.teamMark(t)} ${T[t].w}</span>`).join('')}<span>${n.draws} drawn</span></div>`;
    const race = `<div class="card pl-race">${UI.score({ teams: teams.map(t => ({ team: t, goals: T[t].pts })), mid: '<span class="clock-s">pts</span>' })}` +
      `<div class="pl-wbar" aria-hidden="true">${segs.join('')}</div>${under}</div>` +
      UI.rows([UI.row({ tap: 'full', title: 'Full table', chevron: true })], { cls: 'mt-3' });
    const F = Scoring.teamForm(d);
    const form = `<div class="lbl pl-gap">Form</div>` + UI.rows(teams.map(t => `<div class="r"><span class="grow">${UI.teamMark(t)}</span><span class="pl-form">${(F[t] || []).slice(-5).map(UI.resultMark).join('')}</span></div>`));
    const L = Scoring.leaders(d);
    const lead = (label, x) => {
      const names = x.players.map(p => p.name).join(', ');
      return `<button type="button" class="card pl-lead" ${x.players[0] ? `data-tap="profile" data-pid="${esc(x.players[0].pid)}"` : 'disabled'}>` +
        `<span class="meta">${esc(label)}</span><span class="n pl-stat">${esc(x.value)}</span><span class="pl-lead-n">${esc(names || '–')}</span></button>`;
    };
    const leaders = `<div class="lbl pl-gap">Leaders</div><div class="grid3 pl-leads">${lead('Goals', L.goals)}${lead('Assists', L.assists)}${lead('Saves', L.saves)}</div>`;
    const results = Scoring.completedSessions(d).map(({ sid, sess }) => {
      const res = Scoring.result(sess);
      if (!res.valid) return '';
      const ts = teamsScore(sess);
      const meta = res.draw ? 'Draw' : `${fmt.team(res.winner)} won`;
      const score = `<span class="pl-res">${ts.map((t, i) => (i ? '<span class="pl-res-d">–</span>' : '') + `<i class="pl-sq t-${esc(t.team)}"></i><span class="n">${esc(t.goals)}</span>`).join('')}</span>`;
      return UI.row({ tap: 'match', data: { sid }, title: fmt.date(sess.date), meta, right: score, chevron: true });
    }).filter(Boolean);
    const res = `<div class="lbl pl-gap">Results <b class="n">${results.length}</b></div>` + UI.rows(results);
    return `<div class="pl-2col"><div>${html}${race}${form}${leaders}</div><div>${res}</div></div>`;
  }

  function openFullTable() {
    const T = Scoring.teamStandings(db());
    const teams = Scoring.orderTeams(Object.keys(T).filter(t => T[t].played));
    const gd = x => fmt.signed(x.gf - x.ga);
    const body = `<table class="tbl pl-ftbl"><thead><tr><th class="l">Team</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead><tbody>` +
      teams.map(t => { const x = T[t]; return `<tr><td class="l">${UI.teamMark(t)}</td><td>${x.w}</td><td>${x.d}</td><td>${x.l}</td><td>${x.gf}</td><td>${x.ga}</td><td>${gd(x)}</td><td class="bk">${x.pts}</td></tr>`; }).join('') +
      `</tbody></table>`;
    UI.sheet.open({ title: 'Full table', titleEnd: esc(BF_CONFIG.seasonLabel), cls: 'sh-player-full', cancel: 'Close', body });
  }

  App.registerScreen('player.season', {
    tab: 'season',
    mount(el) {
      keyTaps(el);
      UI.on(el, 'full', openFullTable);
      UI.on(el, 'match', b => App.go('player.match', { sid: b.dataset.sid }));
      UI.on(el, 'profile', b => App.go('player.profile', { pid: b.dataset.pid }));
    },
    render(el, ctx) {
      if (!Store.hasData()) { el.innerHTML = LOADING; return; }
      el.innerHTML = seasonHtml(ctx);
    },
  });

  // ======================================================================== player.match
  const MATCH = { team: {}, open: new Set() };

  function matchHtml(ctx, sid, sess) {
    const d = db();
    const mb = Scoring.matchBreakdown(sess, d);
    const active = sess.status === 'active';
    const L = liveLabel(sess);
    const mid = active && L.live ? `<span class="live">LIVE</span><span class="clock-s n" data-livemin>${esc(L.text)}</span>` : '<span class="clock-s">FT</span>';
    const card = scoreCard(sess, { mid });
    const cols = mb.columns.filter(c => c.players.length);
    if (!cols.length) return `<div class="pl-2col"><div>${card}</div><div>${UI.empty('No player points for this match', '')}</div></div>`;
    const top = mb.top ? `<div class="card pl-top"><span class="meta">Top points</span><span class="grow pl-top-n">${esc(mb.top.players.map(p => p.name).join(', '))}</span><span class="n pl-top-p">${esc(mb.top.pts)}</span></div>` : '';
    const vTeam = ctx.viewer && cols.find(c => c.players.some(p => p.pid === ctx.viewer));
    let team = MATCH.team[sid];
    if (!cols.some(c => c.team === team)) team = (vTeam || cols[0]).team;
    MATCH.team[sid] = team;
    const sw = `<div class="seg pl-tsw" role="tablist" data-seg="mteam">` + cols.map(c =>
      `<button type="button" role="tab" aria-selected="${c.team === team}" class="team t-${esc(c.team)}${c.team === team ? ' on' : ''}" data-value="${esc(c.team)}">` +
      `<span>${esc(fmt.team(c.team))} <span class="n">${esc(c.points)}</span></span></button>`).join('') + `</div>`;
    const col = cols.find(c => c.team === team);
    const rows = col.players.map(p => {
      const key = sid + '|' + p.pid, open = MATCH.open.has(key);
      return `<div class="pl-x${open ? ' open' : ''}${p.pid === ctx.viewer ? ' pl-me' : ''}">` +
        `<button type="button" class="r" data-tap="expand" data-key="${esc(key)}" aria-expanded="${open}">` +
        `<span class="grow"><span class="nm">${esc(p.name)}</span><span class="meta" style="display:block">${UI.pos(p.pos)}</span></span>` +
        `<span class="end"><span class="pts">${esc(p.total)}</span><span class="chev">${open ? '⌄' : '›'}</span></span></button>` +
        (open ? bdHtml(p.breakdown) : '') + `</div>`;
    }).join('');
    return `<div class="pl-2col"><div>${card}${top}</div><div>${sw}<div class="rows pl-xrows">${rows}</div></div></div>`;
  }

  App.registerScreen('player.match', {
    tab: 'season',
    header: ctx => {
      const s = Store.session(ctx.params.sid);
      const right = s && s.status === 'active' ? '<span class="live">LIVE</span>' : s ? '<span class="n pl-ft">FT</span>' : '';
      return { left: backBtn(s ? fmt.date(s.date) : 'Back'), center: '', right };
    },
    mount(el, ctx) {
      keyTaps(el);
      UI.onSeg(el, 'mteam', val => { MATCH.team[ctx.params.sid] = val; this.render(el, ctx); });
      UI.on(el, 'expand', b => {
        const k = b.dataset.key;
        if (MATCH.open.has(k)) MATCH.open.delete(k); else MATCH.open.add(k);
        this.render(el, ctx);
      });
      ctx.every(1000, () => {
        const m = el.querySelector('[data-livemin]'); const s = Store.session(ctx.params.sid);
        if (m && s) { const t = liveLabel(s).text; if (m.textContent !== t) m.textContent = t; }
      });
    },
    render(el, ctx) {
      if (!Store.hasData()) { el.innerHTML = LOADING; return; }
      const s = Store.session(ctx.params.sid);
      el.innerHTML = s ? matchHtml(ctx, ctx.params.sid, s) : UI.empty('Match not found', '');
    },
  });

  // ======================================================================== player.shareCard
  const CARD_W = 300, CARD_H = 375, CARD_SCALE = 3;

  function tokens(theme) {
    const probe = document.createElement('div');
    probe.setAttribute('data-theme', theme); probe.style.display = 'none';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const v = n => cs.getPropertyValue(n).trim();
    const out = { bg: theme === 'light' ? v('--s1') : v('--bg'), line: v('--line'), ink: v('--ink'), ink2: v('--ink2'), ink3: v('--ink3'),
      team: { green: v('--green'), red: v('--red'), blue: v('--blue'), gold: v('--gold') } };
    probe.remove();
    return out;
  }

  function cardData(pid, view) {
    const p = Store.player(pid);
    const rows = rowsOf(), r = rankOf(rows, pid);
    const st = Scoring.seasonStats(pid, db());
    const last = rows.lastGame;
    if (view === 'last') {
      const h = Scoring.playerHistory(pid, db(), 1)[0];
      if (!h) return null;
      const stats = h.pos === 'GK' ? [['Saves', h.tally.saves], ['Conceded', h.tally.conceded], ['Season', st.pts]]
        : [['Goals', h.tally.goals], ['Assists', h.tally.assists], ['Season', st.pts]];
      return { name: p.name, pos: h.pos, team: h.team, corner: fmt.date(h.date).toUpperCase(), big: h.pts,
        sub: 'points · ' + (resultLine(h) || 'played'), stats, foot: BF_CONFIG.seasonLabel };
    }
    const stats = p.defaultPosition === 'GK' ? [['Saves', st.sv], ['Goals', st.g], ['Apps', st.apps]]
      : [['Goals', st.g], ['Assists', st.a], ['Apps', st.apps]];
    return { name: p.name, pos: p.defaultPosition, team: p.defaultTeam, corner: BF_CONFIG.seasonLabel.toUpperCase(), big: st.pts,
      sub: 'points' + (r && st.apps ? ` · ${fmt.ordinal(r.rank)} of ${rows.length}` : ''), stats,
      foot: last ? 'Updated ' + fmt.date(last.date) : '' };
  }

  function spaced(ctx, text, x, y, spacing, align) {
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = spacing + 'px'; ctx.textAlign = align || 'left';
      // trailing spacing is added after the last letter; nudge right-aligned text back
      ctx.fillText(text, align === 'right' ? x + spacing : x, y); ctx.letterSpacing = '0px'; return;
    }
    let w = 0; for (const ch of text) w += ctx.measureText(ch).width + spacing; w -= spacing;
    let cx = align === 'right' ? x - w : x; ctx.textAlign = 'left';
    for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
  }

  // Name: shrink 32 → 24 px to fit one line, else wrap to two lines (never cut)
  function nameLines(ctx, name, maxW) {
    for (let size = 32; size >= 24; size -= 2) {
      ctx.font = `650 ${size}px Geist, system-ui, sans-serif`;
      if (ctx.measureText(name).width <= maxW) return { size, lines: [name] };
    }
    const size = 24; ctx.font = `650 ${size}px Geist, system-ui, sans-serif`;
    const words = name.split(/\s+/); const lines = [''];
    words.forEach(w => {
      const tryL = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + w : w;
      if (ctx.measureText(tryL).width <= maxW || !lines[lines.length - 1]) lines[lines.length - 1] = tryL; else lines.push(w);
    });
    // a single word wider than the card: break it by letters
    const out = [];
    lines.forEach(l => {
      let cur = '';
      for (const ch of l) { if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch; } else cur += ch; }
      out.push(cur);
    });
    return { size, lines: out };
  }

  function drawCard(canvas, data, theme) {
    const C = tokens(theme);
    canvas.width = CARD_W * CARD_SCALE; canvas.height = CARD_H * CARD_SCALE;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(CARD_SCALE, 0, 0, CARD_SCALE, 0, 0);
    ctx.clearRect(0, 0, CARD_W, CARD_H);
    const rr = (x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
    ctx.save(); rr(0, 0, CARD_W, CARD_H, 14); ctx.clip();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.fillStyle = C.team[data.team] || C.ink3; ctx.fillRect(0, 0, CARD_W, 4);          // the one 4 px team stripe
    ctx.restore();
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; rr(0.5, 0.5, CARD_W - 1, CARD_H - 1, 14); ctx.stroke();
    const X = 20, R = CARD_W - 20, maxW = R - X;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.ink3; ctx.font = '600 12px Geist, system-ui, sans-serif';
    spaced(ctx, 'BE FIT CLUB', X, 38, 2.16, 'left');
    spaced(ctx, data.corner, R, 38, 2.16, 'right');
    const nm = nameLines(ctx, data.name, maxW);
    ctx.fillStyle = C.ink; ctx.textAlign = 'left';
    let y = 38 + 22 + nm.size * 0.8;
    nm.lines.forEach((l, i) => { if (i) y += nm.size * 1.05; ctx.fillText(l, X, y); });
    y += 22;
    ctx.font = '500 12px "Geist Mono", ui-monospace, monospace'; ctx.fillStyle = C.ink3;
    const posTxt = data.pos || ''; ctx.fillText(posTxt, X, y);
    let tx = X + (posTxt ? ctx.measureText(posTxt).width + 9 : 0);
    if (data.team) {
      ctx.fillStyle = C.team[data.team] || C.ink3; rr(tx, y - 9, 8, 8, 2); ctx.fill();
      ctx.font = '400 12px Geist, system-ui, sans-serif'; ctx.fillStyle = C.ink2;
      ctx.fillText(fmt.team(data.team), tx + 13, y);
    }
    const bigY = Math.min(y + 22 + 77, 240);
    ctx.fillStyle = C.ink; ctx.font = `600 ${nm.lines.length > 1 ? 74 : 86}px "Geist Mono", ui-monospace, monospace`;
    spaced(ctx, String(data.big), X - 2, bigY, -4.3, 'left');
    ctx.font = '400 13px Geist, system-ui, sans-serif'; ctx.fillStyle = C.ink2;
    ctx.fillText(data.sub, X, bigY + 22);
    const lineY = 280;
    ctx.fillStyle = C.line; ctx.fillRect(X, lineY, maxW, 1);
    const colW = maxW / 3;
    data.stats.forEach(([k, val], i) => {
      ctx.fillStyle = C.ink; ctx.font = '600 20px "Geist Mono", ui-monospace, monospace'; ctx.fillText(String(val), X + i * colW, lineY + 28);
      ctx.fillStyle = C.ink3; ctx.font = '400 12px Geist, system-ui, sans-serif'; ctx.fillText(k, X + i * colW, lineY + 44);
    });
    if (data.foot) { ctx.fillStyle = C.ink3; ctx.font = '400 12px Geist, system-ui, sans-serif'; ctx.fillText(data.foot, X, CARD_H - 16); }
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function openShareCard(args) {
    const pid = (args && args.pid) || App.viewer();
    const p = pid && Store.player(pid);
    if (!p) { UI.toast('Pick your name first'); return null; }
    const hasLast = Scoring.playerHistory(pid, db(), 1).length > 0;
    const st = { view: 'season', theme: App.theme.resolved(), blob: null };
    const fileName = () => `befit-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player'}-${st.view === 'last' ? 'last-game' : 'season'}.png`;
    const h = UI.sheet.open({
      title: 'Share card', cls: 'sh-player-share',
      titleEnd: '<button type="button" class="pl-close" data-tap="sheet-cancel">Close</button>',
      body: `<div class="pl-cardwrap"><canvas class="pl-card" width="${CARD_W * CARD_SCALE}" height="${CARD_H * CARD_SCALE}" role="img" aria-label="Share card for ${esc(p.name)}"></canvas></div>` +
        `<div class="pl-cardctl">${UI.seg('cview', [{ value: 'season', label: 'Season' }, { value: 'last', label: 'Last game' }], st.view)}` +
        `${UI.seg('ctheme', [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }], st.theme)}</div>`,
      footer: `<div class="grid2">${UI.btn('Share', { kind: 'w', tap: 'share-img' })}${UI.btn('Save image', { kind: 'g', tap: 'save-img' })}</div>`,
    });
    const canvas = h.el.querySelector('canvas');
    if (!hasLast) { const b = h.el.querySelector('[data-seg="cview"] [data-value="last"]'); if (b) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); } }
    const draw = () => {
      const data = cardData(pid, st.view) || cardData(pid, 'season');
      drawCard(canvas, data, st.theme);
      st.blob = null;
      canvas.toBlob(b => { st.blob = b; }, 'image/png');
    };
    draw();
    if (document.fonts && document.fonts.load) {
      Promise.all(['650 32px Geist', '600 86px "Geist Mono"', '500 12px "Geist Mono"', '400 13px Geist', '600 12px Geist']
        .map(f => document.fonts.load(f).catch(() => null))).then(() => { if (!h.closed) draw(); });
    }
    UI.onSeg(h.el, 'cview', v => { st.view = v; draw(); });
    UI.onSeg(h.el, 'ctheme', v => { st.theme = v; draw(); });
    const withBlob = fn => { if (st.blob) fn(st.blob); else canvas.toBlob(b => b && fn(b), 'image/png'); };
    UI.on(h.el, 'save-img', () => withBlob(b => { download(b, fileName()); UI.toast('Image saved'); }));
    UI.on(h.el, 'share-img', () => withBlob(b => {
      let file = null;
      try { file = new File([b], fileName(), { type: 'image/png' }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        navigator.share({ files: [file], title: `${p.name} · BE Fit Club` }).catch(() => {});
      } else { download(b, fileName()); UI.toast('Image saved'); }
    }));
    return h;
  }
  App.registerAction('player.shareCard', openShareCard);

  // ======================================================================== GoalMoment (viewers only)
  // 2 s full screen on every phone except the referee's: team word, "Goal", scorer + minute, new score.
  // Tap to dismiss. Only for goals that arrive while the app is open and the match clock is on.
  const GM = { seen: null, sid: null, el: null, timer: null, eid: null };
  const isGoal = e => e.type === 'goal' || e.type === 'ownGoal';

  function hideMoment() {
    clearTimeout(GM.timer); GM.timer = null; GM.eid = null;
    if (GM.el) { GM.el.remove(); GM.el = null; }
  }
  function showMoment(sess, ev) {
    hideMoment();
    const team = ev.type === 'goal' ? ev.team : ev.benefitTeam;
    const who = (Store.player(ev.scorerId) || {}).name || '';
    const el = document.createElement('div');
    el.className = 'pl-gm t-' + team;
    el.setAttribute('role', 'alert');
    el.innerHTML = `<div class="pl-gm-in"><span class="pl-gm-team">${esc(fmt.team(team))}</span><div class="pl-gm-word">Goal</div>` +
      `<div class="pl-gm-who">${esc(who)}${ev.type === 'ownGoal' ? ' <span class="pl-og">own goal</span>' : ''} <span class="n">${esc(fmt.minute(ev))}</span></div>` +
      `<div class="pl-gm-score">${UI.score({ teams: teamsScore(sess), mid: '<span class="pl-dash">–</span>' })}</div></div>`;
    el.addEventListener('click', hideMoment);
    document.body.appendChild(el);
    GM.el = el; GM.eid = ev.id;
    GM.timer = setTimeout(hideMoment, 2000);
  }
  function goalWatch() {
    const sid = Store.activeSessionId();
    const sess = sid ? Store.session(sid) : null;
    const goals = sess ? Scoring.sessEvents(sess).filter(isGoal) : [];
    if (GM.seen === null || GM.sid !== sid) { GM.seen = new Set(goals.map(e => e.id)); GM.sid = sid; return; }
    if (GM.eid && !goals.some(e => e.id === GM.eid)) hideMoment();         // the referee pressed Undo
    const fresh = goals.filter(e => !GM.seen.has(e.id));
    fresh.forEach(e => GM.seen.add(e.id));
    if (!fresh.length || !sess) return;
    if (Auth.isReferee()) return;                                          // never on the referee's phone
    if (!Clock.isActive(sess)) return;                                     // fixes after full time don't celebrate
    if (document.visibilityState === 'hidden') return;
    const ev = fresh.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).pop();
    if (ev.timestamp && Math.abs(Store.now() - ev.timestamp) > 5 * 60000) return;   // old news (e.g. arrived late)
    showMoment(sess, ev);
  }
  Store.on(goalWatch);
})();
