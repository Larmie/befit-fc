/* ============================================================================
   BE Fit Club · js/screens/player.js · PLAYER MODE            OWNER: Phase 2 · Player builder
   ----------------------------------------------------------------------------
   STUB from Phase 1: placeholders that already read real data, so the shell runs
   end to end. Replace each render() with the real screen. Keep the ids and params.
   Styles go in css/player.css, scoped under .scr-player-* (one class per screen).

   SCREENS (ids are fixed; other files link to them)
     'player.live'            tab live    Live viewer (score, scorers, "You · n pts live", Live points)
                                          or "No game yet" + last game + you + top 3. GoalMoment (2 s, viewers only).
     'player.table'           tab table   Season table: rank + movement, last game pts, position chips, sticky you-row
     'player.season'          tab season  Points race, form (ResultMark), leaders, results list
     'player.me'              tab me      Your profile + Subs + Share card + Appearance + referee sign-in/out
     'player.match'  {sid}    tab season  Match summary: score, scorers + minutes, Top points, team columns, tap-to-expand maths
     'player.profile' {pid}   tab table   Anyone's page (Me without Subs); laptop: beside the table
   ACTIONS
     'player.shareCard' ({ pid })         open the share card sheet (dark/light, Season / Last game, Save image)
   Design: befit-designer.html › Page by page (Live no game, Live player view, Table, Me, Share card,
   Season, Match summary) + Light theme section. Checklist items 17–20.
   ========================================================================== */
(function () {
  'use strict';
  const esc = UI.esc;
  const ph = (title, what) => `<div class="placeholder"><b>${esc(title)}</b> · ${esc(what)}</div>`;

  function lastOrLive() {
    const sid = Store.activeSessionId();
    if (sid) return { sid, sess: Store.session(sid), live: true };
    const l = Scoring.lastGame(Store.state);
    return l ? Object.assign({ live: false }, l) : null;
  }

  App.registerScreen('player.live', {
    tab: 'live',
    render(el) {
      const g = lastOrLive();
      const score = g ? UI.score({ teams: Scoring.orderTeams(Scoring.teamsOf(g.sess)).map(t => ({ team: t, goals: Scoring.teamGoals(g.sess, t) })),
        mid: g.live ? `<span class="live">LIVE</span>` : `<span class="clock-s">FT</span>` }) : '';
      el.innerHTML = `<div class="lbl">${g ? (g.live ? 'Tonight' : 'Last game · ' + esc(UI.fmt.date(g.sess.date))) : 'No game yet'}</div>
        ${g ? `<a class="card" style="display:block" href="#/player.match?sid=${esc(g.sid)}">${score}</a>` : ''}
        <div class="mt-4">${ph('Live', 'Phase 2 · player.js')}</div>`;
    },
  });

  App.registerScreen('player.table', {
    tab: 'table',
    render(el) {
      const rows = Scoring.seasonTable(Store.state).slice(0, 10);
      el.innerHTML = `<div class="lbl">Table <b class="n">top 10</b></div>` + UI.rows(rows.map(r => UI.row({
        tap: 'open', data: { pid: r.pid }, left: `<span class="min">${r.rank}${UI.move(r.move)}</span>`,
        title: r.name, metaHtml: `${UI.pos(r.pos)} ${UI.teamMark(r.team)}`, pts: r.pts,
      }))) + `<div class="mt-4">${ph('Table', 'Phase 2 · player.js')}</div>`;
    },
    mount(el) { UI.on(el, 'open', b => App.go('player.profile', { pid: b.dataset.pid })); },
  });

  App.registerScreen('player.season', {
    tab: 'season',
    render(el) {
      const T = Scoring.teamStandings(Store.state);
      const teams = Scoring.orderTeams(Object.keys(T).filter(t => T[t].played));
      el.innerHTML = `<div class="lbl">${esc(BF_CONFIG.seasonLabel)}</div>` +
        UI.rows(teams.map(t => UI.row({ titleHtml: UI.teamMark(t), meta: `${T[t].w} won · ${T[t].d} drawn · ${T[t].l} lost`, pts: T[t].pts }))) +
        `<div class="mt-4">${ph('Season', 'Phase 2 · player.js')}</div>`;
    },
  });

  App.registerScreen('player.me', {
    tab: 'me',
    render(el, ctx) {
      const p = ctx.viewer ? Store.player(ctx.viewer) : null;
      const st = p ? Scoring.seasonStats(ctx.viewer) : null;
      el.innerHTML = (p ? `<div class="head">${esc(p.name)}</div><p class="sub">${UI.pos(p.defaultPosition)} ${UI.teamMark(p.defaultTeam)} · <span class="n">${st.pts}</span> pts</p>`
                        : `<div class="head">Me</div>`) +
        `<div class="lbl mt-6">Settings</div>` + UI.rows([
          UI.row({ tap: 'appearance', title: 'Appearance', chevron: true }),
          p ? UI.row({ tap: 'who', title: 'Not you?', meta: 'Pick your name again', chevron: true }) : UI.row({ tap: 'who', title: 'Pick your name', chevron: true }),
          ctx.isReferee ? UI.row({ tap: 'refmode', title: 'Referee mode', chevron: true }) : UI.row({ tap: 'signin', title: 'Referee sign-in', chevron: true }),
          ctx.isReferee ? UI.row({ tap: 'signout', title: 'Sign out' }) : '',
        ]) + `<div class="mt-4">${ph('Me, Subs, Share card', 'Phase 2 · player.js')}</div>`;
    },
    mount(el) {
      UI.on(el, 'appearance', () => App.openAppearance());
      UI.on(el, 'who', () => App.go('welcome'));
      UI.on(el, 'signin', () => App.openSignIn());
      UI.on(el, 'signout', () => App.signOut());
      UI.on(el, 'refmode', () => { App.setMode('referee'); App.goTab('match'); });
    },
  });

  App.registerScreen('player.match', {
    tab: 'season',
    header: ctx => {
      const s = Store.session(ctx.params.sid);
      return { left: `<button type="button" class="hd-btn" data-shell="back">‹ ${esc(s ? UI.fmt.date(s.date) : 'Back')}</button>` };
    },
    render(el, ctx) {
      const s = Store.session(ctx.params.sid);
      if (!s) { el.innerHTML = UI.empty('Match not found', ''); return; }
      const mb = Scoring.matchBreakdown(s, Store.state);
      el.innerHTML = `<div class="lbl">${esc(UI.fmt.date(s.date))}</div>` +
        `<div class="card">${UI.score({ teams: mb.columns.map(c => ({ team: c.team, goals: c.goals })), mid: '<span class="clock-s">FT</span>' })}</div>` +
        mb.columns.map(c => `<div class="lbl mt-6">${UI.teamMark(c.team)} <b class="n">${c.points}</b></div>` +
          UI.rows(c.players.map(p => UI.row({ title: p.name, meta: p.breakdown.map(b => `${b.label} ${UI.fmt.signed(b.pts)}`).join(' · '), pts: p.total })))).join('') +
        `<div class="mt-4">${ph('Match summary', 'Phase 2 · player.js')}</div>`;
    },
  });

  App.registerScreen('player.profile', {
    tab: 'table',
    render(el, ctx) {
      const p = Store.player(ctx.params.pid);
      if (!p) { el.innerHTML = UI.empty('Player not found', ''); return; }
      const st = Scoring.seasonStats(ctx.params.pid);
      const hist = Scoring.playerHistory(ctx.params.pid, Store.state, 5);
      el.innerHTML = `<div class="head">${esc(p.name)}</div><p class="sub">${UI.pos(p.defaultPosition)} ${UI.teamMark(p.defaultTeam)} · <span class="n">${st.pts}</span> pts</p>` +
        `<div class="lbl mt-6">Last 5 games</div>` + UI.rows(hist.map(h => UI.row({ left: UI.resultMark(h.result), title: UI.fmt.date(h.date), pts: h.pts }))) +
        `<div class="mt-4">${ph('Player page', 'Phase 2 · player.js')}</div>`;
    },
  });

  App.registerAction('player.shareCard', () => UI.sheet.open({ title: 'Share card', body: ph('Share card', 'Phase 2 · player.js'), cancel: 'Close' }));
})();
