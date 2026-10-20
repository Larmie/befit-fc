/* ============================================================================
   BE Fit Club · js/screens/player.js · HOMES, MATCH, ME            OWNER: Round 5 · Home builder
   ----------------------------------------------------------------------------
   Every screen a guest or player sees outside Tables. All points come from Scoring
   (never our own maths); every name goes through UI.esc. Styles: css/player.css,
   scoped under the screen classes (.scr-guest-home, .scr-player-*); sheets .sh-player-*;
   the goal moment (.pl-gm) sits on <body>, above everything.
   Light: ONE .hero per screen (the score card, or your points); team colour on chips,
   row washes and the "you" row. Hero numerals Geist 700 (.hn), never Mono.

   SCREENS (ids are fixed; other files link to them)
     'guest.home'             tab home   Live: score hero (pulsing LIVE, All n events ›) + live points (tap = breakdown).
                                         No game: last game hero, Next game, Season leaders podium, Season race.
     'player.home'            tab home   Follow the game (live hero, or last game), You (season hero, or "You tonight"),
                                         Table near you (your row lit in your team colour).
     'player.live'            tab match  The Match tab: the live or last game, You tonight, live points, Latest,
                                         then every past game with UI.miniScore.
     'player.match'  {sid}    tab match  Summary: score hero, Top points, team switch "Green · 64 player pts",
                                         tap a player = his points as a sum (UI.sum).
     'player.me'              tab me     Me: 72 px hero, rank chip, How it adds up (i), Subs (with reasons),
                                         last 5 bars in team colour (W full · D half · L faint), every match.
     'player.profile' {pid}   tab tables Anyone's page (Me without Subs).
   ACTIONS
     'home.liveBreakdown' ({ sid, pid })  that player's points tonight as a sum, "Season page ›". Live points rows
                                          everywhere call this (never the profile).
     (Share card buttons call 'player.shareCard', owned by tables.js.)
   GLOBAL
     GoalMoment: 2 s full screen on every phone except the referee's (Auth.isReferee()): team radial,
     GOAL 92/800, scorer + minute, the joined score block. Tap to dismiss.
   RETIRED here in round 5: 'player.table' (→ tables.players), 'player.season' (→ tables.teams), the share card code.
   ========================================================================== */
(function () {
  'use strict';
  const esc = UI.esc, fmt = UI.fmt;
  const db = () => Store.state;
  const LOADING = '<div class="skel" style="height:190px"></div><div class="skel mt-3" style="height:260px"></div>';
  const tcls = t => (t ? (window.Teams ? Teams.cls(t) : 't-' + t) : '');

  // ======================================================================== shared helpers
  const teamsScore = sess => Scoring.orderTeams(Scoring.teamsOf(sess)).map(team => ({ team, goals: Scoring.teamGoals(sess, team) }));
  // The team ahead (for the hero tint); null on a draw.
  function leaderOf(sess) {
    const ts = teamsScore(sess);
    if (!ts.length) return null;
    const max = Math.max(...ts.map(t => t.goals));
    const top = ts.filter(t => t.goals === max);
    return top.length === 1 ? top[0].team : null;
  }
  function teamOfIn(sess, pid) {
    for (const [t, td] of Object.entries((sess && sess.teams) || {})) if (td && td.players && td.players[pid]) return t;
    return null;
  }
  const rowsOf = () => Scoring.seasonTable(db());
  const rankOf = (rows, pid) => rows.find(r => r.pid === pid) || null;
  const backBtn = label => `<button type="button" class="hd-btn" data-shell="back">‹ ${esc(label)}</button>`;
  const isLive = sess => !!sess && sess.status === 'active';

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

  // "2 goals · 1 assist": the things that earned or cost points
  function shortTally(m, max) {
    const t = m.tally || {}, out = [];
    const cs = (m.breakdown || []).some(b => b.key === 'cleanSheet');
    if (t.goals) out.push(fmt.plural(t.goals, 'goal'));
    if (t.assists) out.push(fmt.plural(t.assists, 'assist'));
    if (m.pos === 'GK' && t.saves) out.push(fmt.plural(t.saves, 'save'));
    if (t.penSaves) out.push(fmt.plural(t.penSaves, 'penalty save'));
    if (cs) out.push('clean sheet');
    if (m.pos !== 'GK' && t.blocks) out.push(fmt.plural(t.blocks, 'block'));
    if (m.pos !== 'GK' && t.clearances) out.push(fmt.plural(t.clearances, 'clearance'));
    if (t.ogs) out.push(fmt.plural(t.ogs, 'own goal'));
    if (t.yellow) out.push(fmt.plural(t.yellow, 'yellow card'));
    if (t.red) out.push(fmt.plural(t.red, 'red card'));
    return out.slice(0, max || 2).join(' · ');
  }

  // Section label: caps text left, a quiet link or note right.
  const label = (text, right) => `<div class="lbl pl-sl"><span>${text}</span>${right || ''}</div>`;
  const more = (tap, text, data) => `<button type="button" class="pl-more" data-tap="${esc(tap)}"${Object.entries(data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}>${esc(text)} ›</button>`;

  // The live label: pulsing LIVE while the clock runs; otherwise what the game is doing.
  function liveLead(sess) {
    const st = Clock.status(sess);
    if (Clock.isActive(sess)) return UI.liveDot('LIVE');
    if (st === 'ended') return 'Full time';
    return 'Tonight · ' + esc(fmt.short(sess.date));
  }

  // Score card: the joined block inside a card. o = { sid, lead (html), right (html), hero, size, scorers, tap }
  // The card is the screen's one glowing hero when o.hero (tinted with the team ahead).
  function scoreCard(sess, o) {
    const poles = o.poles === false ? '' : polesText(sess);
    const team = leaderOf(sess);
    const cls = 'card pl-scard' + (o.hero ? ' hero ' + tcls(team) : '');
    const sb = UI.scoreFor(sess, { size: o.size || 'full', scorers: o.scorers !== false, tap: o.sid ? 'match' : null, data: o.sid ? { sid: o.sid } : null, cls: 'pl-sb' });
    return `<div class="${cls}"${isLive(sess) ? ` data-live-sid="${esc(o.liveSid || '')}"` : ''}>` +
      (o.lead || o.right ? `<div class="lbl pl-cardlbl"><span class="pl-lead">${o.lead || ''}</span>${o.right || ''}</div>` : '') +
      sb + (poles ? `<div class="pl-poles">${esc(poles)}</div>` : '') + `</div>`;
  }

  // Keep the live centre ("72' · 2nd half") ticking without re-rendering the screen.
  function tickCentres(el) {
    el.querySelectorAll('[data-live-sid]').forEach(card => {
      const sess = Store.session(card.dataset.liveSid);
      const mid = card.querySelector('.sb-mid');
      if (!sess || !mid) return;
      const c = UI.scoreCentre(sess);
      const cls = 'sb-mid' + (c.state ? ' is-' + c.state : '');
      if (mid.textContent !== (c.top || '') + (c.sub || '')) mid.innerHTML = `<b>${esc(c.top || '')}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}`;
      if (mid.className !== cls) mid.className = cls;
    });
  }

  // A ranked row: rank · name · team chip · points. tap = 'lbd' (live breakdown) or 'profile'.
  function rankRow(o) {
    const data = o.tap === 'lbd' ? ` data-sid="${esc(o.sid)}" data-pid="${esc(o.pid)}"` : ` data-pid="${esc(o.pid)}"`;
    return `<button type="button" class="r pl-rr${o.you ? ' you-row ' + tcls(o.team) : ''}" data-tap="${o.tap}"${data}>` +
      `<span class="n pl-rn">${esc(o.rank)}</span><span class="grow"><span class="nm">${esc(o.name)}</span></span>` +
      `<span class="end">${UI.teamChip(o.team)}<span class="pts pl-pts">${esc(o.pts)}</span><span class="chev">›</span></span></button>`;
  }

  // Live points list (top n + you). o = { max, all ›, hint }
  function livePointsHtml(sess, sid, viewer, o) {
    const all = Scoring.livePoints(sess, db());
    if (!all.length) return '';
    const max = o.max || 5;
    const mi = viewer ? all.findIndex(p => p.pid === viewer) : -1;
    const row = (p, i) => rankRow({ tap: 'lbd', sid, pid: p.pid, rank: i + 1, name: p.name, team: p.team, pts: p.total, you: p.pid === viewer });
    const top = all.slice(0, max).map(row);
    if (mi >= max) top.push(row(all[mi], mi));
    const right = all.length > max ? more('all-live', `All ${all.length}`) : `<span class="pl-hint">Tap a player</span>`;
    return label('Live points', right) + UI.rows(top, { cls: 'pl-lp' });
  }

  // Latest events feed
  const KIND = { goal: 'Goal', ownGoal: 'Own goal', save: 'Save', penaltySave: 'Penalty save', block: 'Block',
    clearance: 'Clearance', yellowCard: 'Yellow card', redCard: 'Red card', halfTime: 'Half time' };
  function feedRow(sess, e) {
    const d = db().players || {};
    const pid = e.scorerId || e.playerId;
    let kind = KIND[e.type];
    if (!kind && /pole/i.test(e.type || '')) kind = 'Big poles';
    if (!kind) return '';
    const team = e.type === 'goal' ? e.team : e.type === 'ownGoal' ? e.benefitTeam : pid ? teamOfIn(sess, pid) : null;
    const glyph = e.type === 'yellowCard' ? UI.cardGlyph('yellow') + ' ' : e.type === 'redCard' ? UI.cardGlyph('red') + ' ' : '';
    const who = pid ? `<span class="nm">${esc((d[pid] || {}).name || '?')}</span> <span class="kind">${glyph}${esc(kind)}</span>`
      : `<span class="nm">${esc(kind)}</span>`;
    return `<div class="r"><span class="min">${esc(fmt.minute(e))}</span><span class="grow">${who}</span>${team ? UI.teamChip(team) : ''}</div>`;
  }
  const feedList = sess => Scoring.sessEvents(sess).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).map(e => feedRow(sess, e)).filter(Boolean);

  // "You tonight · 1 block · 3 clearances · 7 pts live": tinted (not glowing), tap = your breakdown
  function youTonight(sess, sid, viewer) {
    const mp = viewer ? Scoring.matchPoints(sess, viewer, db()) : null;
    if (!mp) return '';
    const p = Store.player(viewer) || { name: mp.name };
    return `<button type="button" class="card pl-tint pl-you ${tcls(mp.team)}" data-tap="lbd" data-sid="${esc(sid)}" data-pid="${esc(viewer)}">` +
      `${UI.avatar(p.name, mp.team, { size: 44 })}<span class="grow"><span class="pl-you-t">You tonight</span>` +
      `<span class="meta">${esc(shortTally(mp, 3) || 'Playing')}</span></span>` +
      `<span class="pl-you-p"><b class="hn pl-you-n">${esc(mp.total)}</b><span class="meta">pts live</span></span></button>`;
  }

  // Next match day strip
  function nextGameHtml() {
    const iso = UI.nextGame();
    const today = iso === fmt.iso(Store.now());
    return `<div class="card pl-next"><div><div class="meta">Next game</div><div class="pl-next-d">${esc(today ? 'Tonight · ' + fmt.date(iso) : fmt.date(iso))}</div></div>` +
      `<div class="pl-next-r">Kick-off when the referee starts</div></div>`;
  }

  // Season leaders: the stepped podium (top 3 by points)
  function podiumHtml() {
    const rows = rowsOf();
    const last = rows.lastGame;
    const top = rows.slice(0, 3).map(r => ({ pid: r.pid, name: r.name, team: r.team, value: r.pts,
      stat: `${fmt.plural(r.g, 'goal')} · ${fmt.plural(r.a, 'assist')}`,
      note: r.lastPts != null && last ? `${fmt.signed(r.lastPts)} on ${fmt.short(last.date)}` : '' }));
    if (!top.length) return '';
    return label('Season leaders', more('stats', 'Tables')) + `<div class="pl-pod">${UI.podium(top, { tap: 'profile' })}</div>`;
  }

  // Season race (league points): washed team rows, form in team colour. Tap = Tables · Teams.
  function raceHtml() {
    const d = db();
    const T = Scoring.teamStandings(d);
    const F = Scoring.teamForm(d);
    const teams = Scoring.orderTeams(Object.keys(T).filter(t => T[t].played)).sort((a, b) => T[b].pts - T[a].pts);
    if (!teams.length) return '';
    const games = Scoring.completedSessions(d).filter(x => Scoring.result(x.sess).valid).length;
    const rows = teams.map(t => `<button type="button" class="r pl-race wash ${tcls(t)}" data-tap="teams">` +
      `<i class="pl-tbar" aria-hidden="true"></i><span class="grow"><span class="nm">${esc(fmt.team(t))}</span></span>` +
      `<span class="pl-form">${(F[t] || []).slice(-5).map(r => UI.resultMark(r, t)).join('')}</span>` +
      `<b class="hn pl-race-p">${esc(T[t].pts)}</b></button>`);
    return label('Season race', `<span class="pl-hint">${esc(fmt.plural(games, 'game'))}</span>`) + UI.rows(rows) +
      `<div class="meta pl-note">League pts · win 3, draw 1</div>`;
  }

  // Past games with mini scores (Match tab). skip = the sid already shown as the hero.
  function pastGamesHtml(skip) {
    const d = db();
    const list = Scoring.completedSessions(d).filter(x => x.sid !== skip);
    if (!list.length) return '';
    const rows = list.map(({ sid, sess }) => {
      const n = Scoring.sessPlayers(sess, d).length;
      const res = Scoring.result(sess);
      return UI.row({ tap: 'match', data: { sid }, title: fmt.date(sess.date), meta: n ? fmt.plural(n, 'player') : 'Score only',
        right: res.valid ? UI.miniScore(sess) : '', chevron: true, cls: 'pl-pg' });
    });
    return label('Past games', `<span class="pl-hint n">${list.length}</span>`) + UI.rows(rows, { cls: 'pl-past' });
  }

  // "Table near you": two above, two below (one each while live), your row lit.
  function nearHtml(viewer, span) {
    const rows = rowsOf();
    const i = rows.findIndex(r => r.pid === viewer);
    if (i < 0) return '';
    const n = span * 2 + 1;
    const start = Math.max(0, Math.min(i - span, rows.length - n));
    const list = rows.slice(start, start + n).map(r => rankRow({ tap: 'profile', pid: r.pid, rank: r.rank, name: r.name, team: r.team, pts: r.pts, you: r.pid === viewer }));
    return label('Table near you', more('players', 'Tables')) + UI.rows(list, { cls: 'pl-near' });
  }

  // "YOU · SEASON 135 pts · 12th of 76 ▲1 · Last game 9 pts · 2 blocks · 3 clearances". hero = the one glow.
  function youSeason(viewer, o) {
    const p = Store.player(viewer); if (!p) return '';
    const rows = rowsOf(), r = rankOf(rows, viewer);
    const st = Scoring.seasonStats(viewer, db());
    const h = Scoring.playerHistory(viewer, db(), 1)[0];
    const mv = r && r.move ? `${r.move > 0 ? '▲' : '▼'}${Math.abs(r.move)}` : '';
    const rank = r && st.apps ? `<span class="pl-yr"><b class="hn">${esc(fmt.ordinal(r.rank))}</b><span class="meta">of ${rows.length}${mv ? ' · ' + mv : ''}</span></span>` : '';
    const lastLine = h ? `<div class="pl-ylast">Last game <b>${esc(fmt.plural(h.pts, 'pt'))}</b>${shortTally(h, 3) ? ' · ' + esc(shortTally(h, 3)) : ''}</div>` : '';
    const cls = o.hero ? 'card hero' : 'card pl-tint';
    return `<button type="button" class="${cls} pl-yseason ${tcls(p.defaultTeam)}" data-tap="me">` +
      `<span class="pl-ytop"><span class="lbl">You · season</span>${rank}</span>` +
      `<span class="pl-ybig"><b class="hn pl-ynum">${esc(st.pts)}</b><span class="pl-unit">pts</span></span>${lastLine}</button>`;
  }

  const twoCol = (a, b) => `<div class="pl-2col"><div>${a}</div><div>${b}</div></div>`;

  // ======================================================================== guest.home
  function guestHomeHtml(ctx) {
    const d = db();
    const sid = Store.activeSessionId(), sess = sid && Store.session(sid);
    if (sess) {
      const n = Scoring.sessEvents(sess).length;
      const card = scoreCard(sess, { sid, liveSid: sid, hero: true, lead: liveLead(sess), right: n ? more('all-feed', `All ${n} events`) : '' });
      return twoCol(card, livePointsHtml(sess, sid, ctx.viewer, { max: 5 }));
    }
    const last = Scoring.lastGame(d);
    if (!last) return twoCol(nextGameHtml(), UI.empty('No games yet', ''));
    const today = last.sess.date === fmt.iso(Store.now());
    const card = scoreCard(last.sess, { sid: last.sid, hero: true, lead: today ? 'Full time · tonight' : 'Last game', right: more('match', 'Match', { sid: last.sid }) });
    return twoCol(card + nextGameHtml(), `<div class="pl-col2">${podiumHtml()}${raceHtml()}</div>`);
  }

  // ======================================================================== player.home
  function playerHomeHtml(ctx) {
    const v = ctx.viewer;
    if (!v || !Store.player(v)) return guestHomeHtml(ctx);
    const d = db();
    const sid = Store.activeSessionId(), sess = sid && Store.session(sid);
    if (sess) {
      const card = scoreCard(sess, { sid, liveSid: sid, hero: true, lead: liveLead(sess), right: more('match-tab', 'Match') });
      const you = youTonight(sess, sid, v) || youSeason(v, { hero: false });
      return twoCol(card + you, nearHtml(v, ctx.wide ? 2 : 1));
    }
    const last = Scoring.lastGame(d);
    const follow = last ? scoreCard(last.sess, { sid: last.sid, size: 'compact', scorers: false, poles: false,
      lead: 'Follow the game', right: more('match-tab', 'Match') }) : '';
    return twoCol(follow + youSeason(v, { hero: true }), nearHtml(v, 2));
  }

  // ======================================================================== player.live (the Match tab)
  function matchTabHtml(ctx) {
    const d = db();
    const sid = Store.activeSessionId(), sess = sid && Store.session(sid);
    if (sess) {
      const n = Scoring.sessEvents(sess).length;
      const card = scoreCard(sess, { sid, liveSid: sid, hero: true, lead: liveLead(sess), right: more('match', 'Summary', { sid }) });
      const feed = feedList(sess);
      const fd = feed.length ? label('Latest', feed.length > 4 ? more('all-feed', `All ${n}`) : '') + UI.rows(feed.slice(0, 4), { cls: 'feed pl-feed' }) : '';
      return twoCol(card + youTonight(sess, sid, ctx.viewer) + livePointsHtml(sess, sid, ctx.viewer, { max: 5 }), `<div class="pl-col2">${fd}${pastGamesHtml(sid)}</div>`);
    }
    const last = Scoring.lastGame(d);
    if (!last) return UI.empty('No games yet', '');
    const today = last.sess.date === fmt.iso(Store.now());
    const card = scoreCard(last.sess, { sid: last.sid, hero: true, lead: esc(today ? 'Tonight · Full time' : fmt.date(last.sess.date)), right: more('match', 'Summary', { sid: last.sid }) });
    return twoCol(card, `<div class="pl-col2">${pastGamesHtml(last.sid)}</div>`);
  }

  function openAllLive() {
    const sid = Store.activeSessionId(); const sess = sid && Store.session(sid); if (!sess) return;
    const v = App.viewer();
    const all = Scoring.livePoints(sess, db());
    const h = UI.sheet.open({ title: 'Live points', titleEnd: `<span class="pl-te">${all.length}</span>`, cls: 'sh-player-live', cancel: 'Close',
      body: UI.rows(all.map((p, i) => rankRow({ tap: 'lbd', sid, pid: p.pid, rank: i + 1, name: p.name, team: p.team, pts: p.total, you: p.pid === v }))) });
    UI.on(h.el, 'lbd', b => { h.close(); openBreakdown({ sid: b.dataset.sid, pid: b.dataset.pid }); });
  }
  function openAllFeed() {
    const sid = Store.activeSessionId(); const sess = sid && Store.session(sid); if (!sess) return;
    const feed = feedList(sess);
    UI.sheet.open({ title: 'All events', titleEnd: `<span class="pl-te">${feed.length}</span>`, cls: 'sh-player-feed', cancel: 'Close', body: UI.rows(feed, { cls: 'feed' }) });
  }

  // ======================================================================== home.liveBreakdown (sheet)
  // That player's points tonight as a sum: values in one column, the total as the hero under it.
  function whenText(sess) {
    if (!isLive(sess)) return fmt.date(sess.date);
    const st = Clock.status(sess);
    if (st === 'ended') return 'full time';
    if (st === 'idle') return 'not started';
    if (st === 'paused' && (sess.timer || {}).pauseReason === 'halftime') return 'live at half time';
    const m = Clock.minuteParts(sess);
    return m ? 'live at ' + Scoring.minuteText(m) : 'live';
  }
  function breakdownBody(sess, pid) {
    const mp = Scoring.matchPoints(sess, pid, db());
    if (!mp) return null;
    const p = Store.player(pid) || { name: mp.name };
    const pos = mp.listedPos && mp.listedPos !== mp.pos ? `${mp.listedPos}, plays as ${mp.pos}` : mp.pos;
    const head = `<div class="pl-bdh">${UI.avatar(p.name, mp.team, { size: 36 })}<div class="grow"><div class="pl-bdn">${esc(p.name)}</div>` +
      `<div class="meta">${esc([pos, fmt.team(mp.team), whenText(sess)].filter(Boolean).join(' · '))}</div></div></div>`;
    return { mp, html: head + UI.sum({ rows: mp.breakdown.map(b => ({ label: b.label, value: b.pts })), total: mp.total,
      label: isLive(sess) ? 'Pts live' : 'Pts', team: mp.team, hero: true }) };
  }
  function openBreakdown(args) {
    const sid = (args && args.sid) || Store.activeSessionId();
    const pid = args && args.pid;
    const sess = sid && Store.session(sid);
    const b = sess && pid ? breakdownBody(sess, pid) : null;
    if (!b) { UI.toast('No points for this player tonight'); return null; }
    let off = null;
    const h = UI.sheet.open({ cls: 'sh-player-bd lit ' + tcls(b.mp.team), body: b.html,
      footer: UI.btn('Season page ›', { kind: 'g', tap: 'season-page', cls: 'pl-season-btn' }),
      onClose: () => { if (off) off(); } });
    UI.on(h.el, 'season-page', () => { h.close(); App.go('player.profile', { pid }); });
    off = Store.on(() => {                       // a goal while the sheet is open: the sum follows
      const s = Store.session(sid); const nb = s ? breakdownBody(s, pid) : null;
      if (nb && nb.html !== b.html) { b.html = nb.html; h.setBody(nb.html); }
    });
    return h;
  }
  App.registerAction('home.liveBreakdown', openBreakdown);

  // ======================================================================== shared mount for the home / match screens
  function bindCommon(el, ctx) {
    keyTaps(el);
    UI.on(el, 'match', b => App.go('player.match', { sid: b.dataset.sid }));
    UI.on(el, 'match-tab', () => App.goTab('match'));
    UI.on(el, 'profile', b => App.go('player.profile', { pid: b.dataset.pid }));
    UI.on(el, 'lbd', b => openBreakdown({ sid: b.dataset.sid, pid: b.dataset.pid }));
    UI.on(el, 'all-live', openAllLive);
    UI.on(el, 'all-feed', openAllFeed);
    UI.on(el, 'players', () => App.go('tables.players'));
    UI.on(el, 'stats', () => App.go('tables.stats'));
    UI.on(el, 'teams', () => App.go('tables.teams'));
    UI.on(el, 'me', () => App.goTab('me'));
    ctx.every(1000, () => tickCentres(el));
  }
  function keyTaps(el) {
    el.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-tap]:not(button)')) { e.preventDefault(); e.target.click(); }
    });
  }
  const screen = (tab, html) => ({
    tab,
    mount(el, ctx) { bindCommon(el, ctx); },
    render(el, ctx) {
      if (!Store.hasData()) { el.innerHTML = LOADING; return; }
      el.innerHTML = html(ctx);
    },
  });
  App.registerScreen('guest.home', screen('home', guestHomeHtml));
  App.registerScreen('player.home', screen('home', playerHomeHtml));
  App.registerScreen('player.live', screen('match', matchTabHtml));

  // ======================================================================== player.match (summary)
  const MATCH = { team: {}, open: new Set() };

  function matchHtml(ctx, sid, sess) {
    const d = db();
    const mb = Scoring.matchBreakdown(sess, d);
    const live = isLive(sess);
    const card = scoreCard(sess, { liveSid: sid, hero: true, lead: live ? liveLead(sess) : esc(fmt.date(sess.date) + ' · Summary') });
    // Anyone (guests too) can post the full-time card of a finished match from here.
    const share = !live && sess.status === 'completed'
      ? `<button type="button" class="pl-share pl-mshare" data-tap="mshare" data-sid="${esc(sid)}"><span>Share full-time card</span></button>` : '';
    const cols = mb.columns.filter(c => c.players.length);
    if (!cols.length) return twoCol(card + share, UI.empty('No player points for this match', ''));
    const top = mb.top ? `<div class="card pl-top"><span class="meta">Top points</span><span class="grow pl-top-n">${esc(mb.top.players.map(p => p.name).join(', '))}</span><b class="hn pl-top-p">${esc(mb.top.pts)}</b></div>` : '';
    const vTeam = ctx.viewer && cols.find(c => c.players.some(p => p.pid === ctx.viewer));
    let team = MATCH.team[sid];
    if (!cols.some(c => c.team === team)) team = (vTeam || cols[0]).team;
    MATCH.team[sid] = team;
    const sw = `<div class="seg pl-tsw" role="tablist" data-seg="mteam">` + cols.map(c => {
      const on = c.team === team;
      return `<button type="button" role="tab" aria-selected="${on}" class="team ${tcls(c.team)}${on ? ' on' : ''}" data-value="${esc(c.team)}">` +
        `<span>${esc(fmt.team(c.team))} · <span class="n">${esc(c.points)}</span>${on && cols.length <= 2 ? ' player pts' : ''}</span></button>`;
    }).join('') + `</div>`;
    const col = cols.find(c => c.team === team);
    const rows = col.players.map(p => {
      const key = sid + '|' + p.pid, open = MATCH.open.has(key);
      const first = String(p.name).split(/\s+/)[0];
      return `<div class="pl-x${open ? ' open' : ''}${p.pid === ctx.viewer ? ' you-row ' + tcls(p.team) : ''}">` +
        `<button type="button" class="r" data-tap="expand" data-key="${esc(key)}" aria-expanded="${open}">` +
        `${UI.avatar(p.name, p.team)}<span class="grow"><span class="nm">${esc(p.name)}</span> ${UI.pos(p.pos)}</span>` +
        `<span class="end"><span class="pts pl-pts">${esc(p.total)}</span><span class="chev">${open ? '⌄' : '›'}</span></span></button>` +
        (open ? `<div class="pl-xsum">${UI.sum({ rows: p.breakdown.map(b => ({ label: b.label, value: b.pts })), total: p.total, label: first + ' · pts', team: p.team })}</div>` : '') + `</div>`;
    }).join('');
    return twoCol(card + share + top, `${sw}<div class="rows pl-xrows">${rows}</div>`);
  }

  App.registerScreen('player.match', {
    tab: 'match',
    header: ctx => {
      const s = Store.session(ctx.params.sid);
      return { left: backBtn(s ? fmt.date(s.date) : 'Back') };
    },
    mount(el, ctx) {
      keyTaps(el);
      UI.onSeg(el, 'mteam', val => { MATCH.team[ctx.params.sid] = val; this.render(el, ctx); });
      UI.on(el, 'expand', b => {
        const k = b.dataset.key;
        if (MATCH.open.has(k)) MATCH.open.delete(k); else MATCH.open.add(k);
        this.render(el, ctx);
      });
      UI.on(el, 'mshare', b => App.action('share.fullTime', { sid: b.dataset.sid }));
      ctx.every(1000, () => tickCentres(el));
    },
    render(el, ctx) {
      if (!Store.hasData()) { el.innerHTML = LOADING; return; }
      const s = Store.session(ctx.params.sid);
      el.innerHTML = s ? matchHtml(ctx, ctx.params.sid, s) : UI.empty('Match not found', '');
    },
  });

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
  // Why each line is there: "Played", or "Paid · didn't play"
  const subsReason = x => (x.played ? 'Played' : x.amount ? 'Paid · didn\'t play' : 'Didn\'t play');

  function statCells(st, pos) {
    const cells = pos === 'GK'
      ? [['Apps', st.apps], ['Saves', st.sv], ['Goals', st.g]]
      : [['Apps', st.apps], ['Goals', st.g], ['Assists', st.a]];
    cells.push(st.r ? ['Cards', st.y + st.r] : ['Yellow', st.y]);
    return cells.map(([k, v]) => `<div><div class="hn pl-stat">${esc(v)}</div><div class="meta">${esc(k)}</div></div>`).join('');
  }

  // Last 5 in team colour: height = points, W = full colour, D = half, L = faint. Value on top, W/D/L under.
  function barsHtml(hist) {
    if (!hist.length) return '';
    const list = hist.slice().reverse();          // oldest left, newest right
    const max = Math.max(1, ...list.map(h => h.pts));
    const word = { W: 'won', D: 'drew', L: 'lost' };
    return label(`Last ${list.length === 1 ? 'game' : list.length + ' games'}`, '<span class="pl-hint">pts</span>') + `<div class="pl-bars">` + list.map(h => {
      const ht = Math.max(6, Math.round(64 * Math.max(0, h.pts) / max));
      const r = h.result || '';
      return `<button type="button" class="pl-bar ${tcls(h.team)}${r ? ' is-' + r : ''}" data-tap="match" data-sid="${esc(h.sid)}" aria-label="${esc(fmt.date(h.date))}: ${esc(h.pts)} points${r ? ', ' + word[r] : ''}">` +
        `<span class="pl-bar-v">${esc(h.pts)}</span><i style="height:${ht}px"></i><span class="pl-bar-d">${esc(fmt.short(h.date))}</span>` +
        `<span class="pl-bar-r">${UI.resultMark(r, h.team)}</span></button>`;
    }).join('') + '</div>';
  }

  function historyHtml(hist) {
    if (!hist.length) return '';
    return label('Matches', `<span class="pl-hint n">${hist.length}</span>`) + UI.rows(hist.map(h => UI.row({
      tap: 'match', data: { sid: h.sid }, left: UI.resultMark(h.result, h.team),
      title: fmt.date(h.date), meta: [shortTally(h), resultLine(h)].filter(Boolean).join(' · ') || 'Played',
      pts: h.pts, chevron: true,
    })), { cls: 'pl-hist' });
  }

  // o = { own: Me (Subs), ctx }
  function profileHtml(pid, o) {
    const p = Store.player(pid);
    if (!p) return UI.empty('Player not found', '');
    const rows = rowsOf(), me = rankOf(rows, pid);
    const st = Scoring.seasonStats(pid, db());
    const hist = Scoring.playerHistory(pid, db());
    const carry = (p.carryover && p.carryover.pts) || 0;
    const head = `<div class="pl-ph">${UI.avatar(p.name, p.defaultTeam, { size: 56 })}` +
      `<div class="grow"><h1 class="pl-name">${esc(p.name)}</h1><div class="pl-tm">${UI.pos(p.defaultPosition)}${UI.teamChip(p.defaultTeam)}</div></div>` +
      `<button type="button" class="pl-share" data-tap="share" data-pid="${esc(pid)}"><span>Share</span></button></div>`;
    const mv = me && me.move ? ` ${me.move > 0 ? '▲' : '▼'}${Math.abs(me.move)}` : '';
    const rank = me && st.apps ? `<span class="tc pl-rank ${tcls(p.defaultTeam)}" aria-label="Rank ${me.rank} of ${rows.length}">${esc(fmt.ordinal(me.rank) + mv)}</span>` : '';
    const info = carry ? `<button type="button" class="pl-info" data-tap="carry" data-pid="${esc(pid)}" aria-label="How ${esc(st.pts)} adds up"><i>i</i></button>` : '';
    const pts = `<div class="card hero pl-pcard ${tcls(p.defaultTeam)}"><div class="pl-ptop"><b class="hn pl-hero">${esc(st.pts)}</b><span class="pl-unit">pts</span>${info}${rank}</div>` +
      `<div class="grid4 pl-stats">${statCells(st, p.defaultPosition)}</div></div>`;
    let subs = '';
    if (o.own) {
      const s = subsFor(pid);
      const right = s.unpaid.length === 1 ? `<span class="pl-owe">${esc(fmt.short(s.unpaid[0].date))} not paid</span>`
        : s.unpaid.length > 1 ? `<span class="pl-owe">${s.unpaid.length} dates not paid</span>`
        : `<span class="pl-ok">${s.dates.length ? '✓ All paid' : 'Nothing due'}</span>`;
      subs = `<button type="button" class="card pl-subs" data-tap="subs" data-pid="${esc(pid)}"><span class="grow">Subs</span>${right}<span class="chev">›</span></button>`;
    }
    const a = head + pts + subs + barsHtml(hist.slice(0, 5));
    const b = historyHtml(hist) || `<div class="pl-gap">${UI.empty('No games yet', '')}</div>`;
    return `<div class="pl-prof"><div class="pl-prof-a">${a}</div><div class="pl-prof-b">${b}</div></div>`;
  }

  function openCarry(pid) {
    const p = Store.player(pid); if (!p) return;
    const st = Scoring.seasonStats(pid, db());
    const co = p.carryover || {};
    const carry = co.pts || 0;
    const first = Scoring.completedSessions(db()).filter(x => (x.sess.mode || 'live') !== 'history').pop();
    const games = Math.max(0, st.apps - (co.apps || 0));
    const since = `Since ${first ? fmt.short(first.sess.date) : 'May'} · ${fmt.plural(games, 'game')}`;
    UI.sheet.open({
      title: `How ${st.pts} adds up`, cls: 'sh-player-carry', cancel: 'Close',
      body: UI.sum({ rows: [{ label: 'Jan – May (carried over)', value: carry }, { label: since, value: st.pts - carry }],
        total: st.pts, label: 'Season pts', team: p.defaultTeam, hero: true, signed: false }),
    });
  }

  function openSubs(pid, ctx) {
    const p = Store.player(pid); if (!p) return;
    const s = subsFor(pid);
    const body = s.dates.length ? UI.rows(s.dates.map(x => UI.row({
      tap: ctx.isReferee ? 'money-day' : null, data: { date: x.date },
      title: fmt.date(x.date), meta: subsReason(x),
      right: x.amount ? `<span class="pl-paid">${esc(fmt.money(x.amount))}</span>` : `<span class="pl-owe">Not paid</span>`,
      chevron: ctx.isReferee,
    }))) : UI.empty('Nothing due', '');
    const h = UI.sheet.open({ title: 'Subs', titleEnd: s.unpaid.length ? `<span class="pl-owe">${s.unpaid.length} not paid</span>` : '', cls: 'sh-player-subs', body, cancel: 'Close' });
    UI.on(h.el, 'money-day', b => { h.close(); App.go('ref.moneyDay', { date: b.dataset.date }); });
  }

  function bindProfile(el, ctx) {
    keyTaps(el);
    UI.on(el, 'match', b => App.go('player.match', { sid: b.dataset.sid }));
    UI.on(el, 'carry', b => openCarry(b.dataset.pid));
    UI.on(el, 'subs', b => openSubs(b.dataset.pid, ctx));
    UI.on(el, 'share', b => App.action('player.shareCard', { pid: b.dataset.pid }));
    UI.on(el, 'who', () => App.go('welcome'));
    UI.on(el, 'appearance', () => App.openAppearance());
  }

  App.registerScreen('player.profile', {
    tab: 'tables',
    header: () => ({ left: backBtn('Back') }),
    mount(el, ctx) { bindProfile(el, ctx); },
    render(el, ctx) {
      if (!Store.hasData()) { el.innerHTML = LOADING; return; }
      el.innerHTML = profileHtml(ctx.params.pid, { own: false, ctx });
    },
  });

  App.registerScreen('player.me', {
    tab: 'me',
    mount(el, ctx) { bindProfile(el, ctx); },
    render(el, ctx) {
      if (!Store.hasData()) { el.innerHTML = LOADING; return; }
      const p = ctx.viewer ? Store.player(ctx.viewer) : null;
      if (p) { el.innerHTML = profileHtml(ctx.viewer, { own: true, ctx }); return; }
      el.innerHTML = `<h1 class="head pl-h1">Me</h1>` + UI.rows([
        UI.row({ tap: 'who', title: 'Pick your name', meta: 'Your points show first', chevron: true }),
        UI.row({ tap: 'appearance', title: 'Appearance', chevron: true }),
      ]);
    },
  });

  // ======================================================================== GoalMoment (viewers only)
  // 2 s full screen on every phone except the referee's: team radial, GOAL, scorer + minute, the new score.
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
    el.className = 'pl-gm lit ' + tcls(team);
    el.setAttribute('role', 'alert');
    el.innerHTML = `<div class="pl-gm-in"><span class="pl-gm-team">${esc(fmt.team(team))}</span><div class="pl-gm-word">Goal</div>` +
      `<div class="pl-gm-who">${esc(who)}${ev.type === 'ownGoal' ? ' <span class="pl-og">own goal</span>' : ''} <span class="n">${esc(fmt.minute(ev))}</span></div>` +
      `<div class="pl-gm-score">${UI.scoreFor(sess, { size: 'full' })}</div></div>`;
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
