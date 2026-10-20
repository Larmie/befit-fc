/* ============================================================================
   BE Fit Club · js/screens/console.js · REFEREE CONSOLE       OWNER: Phase 2 · Console builder
   ----------------------------------------------------------------------------
   STUB from Phase 1. Replace the placeholders; keep the ids, params and action names.
   Styles in css/console.css, scoped under .scr-ref-console / .scr-ref-events / .sh-console-*.

   SCREENS
     'ref.console'        tab match · layout phone · console   The live match (Match tab shows it whenever a
                          session is 'active'): score + clock (Clock.*), Pause · + Stoppage · + Player,
                          Goal · Green / Goal · Red tiles (92 px; a third team adds a third tile),
                          Save (big poles only) · Block · Clear · Card (72 px), Latest feed + "All n ›",
                          GoalSheet / ActionSheet logging with Save.run (lock → Undo 5 s → Retry), "+1 again".
                          Kick off when the timer is idle.
     'ref.events' {sid}   tab match · layout phone · console   All events, filters (All · Goals · Saves · Defence · Cards),
                          every row opens App.action('fix.eventSheet', { sid, eid }).
   ACTIONS
     'console.menu'       ({ sid })   the ⋯ sheet: kick-off/half-time info, Switch to big poles (small poles only),
                          Add a player, Teams tonight, Edit events, stoppage total, Hold to end the game
                          (UI.hold, 2 s) → timer ended (Clock.end) → App.go('ref.ftcheck', { sid }).
   Every new event: key from Store.newKey(), Clock.stamp(), timestamp: Store.now(), by: Auth.by().
   Design: "Live match: referee console", "Log a goal", "Log a block or clearance", "Log a card",
   "Saving: lock, Undo, Retry", "Match controls", flow 4. Checklist items 9–11, 13.
   ========================================================================== */
(function () {
  'use strict';
  const ph = (title, what) => `<div class="placeholder"><b>${UI.esc(title)}</b> · ${UI.esc(what)}</div>`;

  App.registerScreen('ref.console', {
    tab: 'match', layout: 'phone', console: true,
    render(el) {
      const sid = Store.activeSessionId();
      const s = sid && Store.session(sid);
      if (!s) { el.innerHTML = UI.empty('No game on', '') + UI.btn('Back to Match', { kind: 'g', tap: 'home' }); return; }
      const teams = Scoring.orderTeams(Scoring.teamsOf(s));
      el.innerHTML = `<div class="card">${UI.score({ teams: teams.map(t => ({ team: t, goals: Scoring.teamGoals(s, t) })),
          mid: `<div class="clock">${Clock.fmtClock(Clock.elapsedMs(s) || 0)}</div><div class="clock-s">${UI.esc(Clock.phase(s))}</div>` })}</div>
        <div class="mt-4">${ph('Referee console', 'Phase 2 · console.js')}</div>
        <div class="grid2 mt-4">${UI.btn('All events', { kind: 'g', sm: true, tap: 'events' })}${UI.btn('⋯ Match menu', { kind: 'g', sm: true, tap: 'menu' })}</div>`;
    },
    mount(el) {
      UI.on(el, 'home', () => App.go('ref.home', {}, { replace: true }));
      UI.on(el, 'events', () => App.go('ref.events', { sid: Store.activeSessionId() }));
      UI.on(el, 'menu', () => App.action('console.menu', { sid: Store.activeSessionId() }));
    },
  });

  App.registerScreen('ref.events', {
    tab: 'match', layout: 'phone', console: true,
    header: () => ({ left: `<button type="button" class="hd-btn" data-shell="back">‹ Match</button>`, center: 'Events', right: '' }),
    render(el) { el.innerHTML = ph('All events', 'Phase 2 · console.js'); },
  });

  App.registerAction('console.menu', () => UI.sheet.open({ title: 'Match', body: ph('Match menu', 'Phase 2 · console.js'), cancel: 'Close' }));
})();
