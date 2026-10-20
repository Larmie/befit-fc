/* ============================================================================
   BE Fit Club · js/screens/admin.js · REFEREE HOME, SQUAD, MONEY, CAN'T CONNECT
                                                              OWNER: Phase 2 · Admin builder
   ----------------------------------------------------------------------------
   STUB from Phase 1. Replace the placeholders; keep the ids, params and action names.
   Styles in css/admin.css, scoped under .scr-ref-home / .scr-ref-squad / .scr-ref-money ... / .offline-*.

   SCREENS
     'ref.home'             tab match   Referee home (Match tab when no game is active):
                            admin card "New since you last looked" (published results with who/fixes,
                            new players to finish = players with needsDetails, money to check; seen-time in
                            localStorage BF_CONFIG.keys.lastSeen), Start tonight's game (→ 'ref.setup'),
                            Log a past game (→ 'ref.pastGame'), every match as a row (→ 'ref.edit').
     'ref.pastGame'         tab match   Log a past game (date, who played + stats; writes mode 'post', as classic)
     'ref.squad'            tab squad   Search, A–Z rows (position · team · apps, points), duplicate-name warning, + Add
     'ref.player' {pid}     tab squad   Edit a player: name, position, usual team; delete behind UI.hold
     'ref.money'            tab money   Opens on tonight (who played, late arrivals / keepers tagged, 60 buttons,
                            save bar); "All dates" list counted against who played; + Date
     'ref.moneyDay' {date}  tab money   One payment date (register); "Clear payment record" behind UI.hold
     'app.offline'          (not a page) renders the OfflineBar into the shell's status slot. render(el, info)
                            gets { status, source, savedAt, pending, store } on every connection change.
   ACTIONS
     'admin.editPlayer' ({ pid })   open the player's details (used by the admin card and Squad)
   Payments: paths paymentDays/{date}/payments/{pid} = { amount, updatedAt } (+ legacy sessions/{sid}/payments),
   exactly as classic. Never write zeros for people you didn't touch (fixes review #15).
   Design: "Referee home and matches", "Squad: players", "Payments list", "Payment register", flow 6
   ("What Reuben sees"), flow 7, "Can't connect". Checklist items 15, 21, 23, 24.
   ========================================================================== */
(function () {
  'use strict';
  const esc = UI.esc;
  const ph = (title, what) => `<div class="placeholder"><b>${esc(title)}</b> · ${esc(what)}</div>`;

  App.registerScreen('ref.home', {
    tab: 'match',
    render(el) {
      const list = Scoring.completedSessions(Store.state).slice(0, 8);
      el.innerHTML = `<div class="stack">${UI.btn('Start tonight’s game', { tap: 'start' })}${UI.btn('Log a past game', { kind: 'g', tap: 'past' })}</div>` +
        `<div class="lbl mt-6">Matches <b class="n">${Scoring.completedSessions(Store.state).length}</b></div>` +
        UI.rows(list.map(({ sid, sess }) => {
          const r = Scoring.result(sess);
          return UI.row({ tap: 'edit', data: { sid }, title: UI.fmt.date(sess.date),
            meta: `${Scoring.sessPlayers(sess).length} players`, right: `<span class="n">${r.teams.map(t => t.goals).join('–')}</span>`, chevron: true });
        })) + `<div class="mt-4">${ph('Referee home + admin card', 'Phase 2 · admin.js')}</div>`;
    },
    mount(el) {
      UI.on(el, 'start', () => App.go('ref.setup'));
      UI.on(el, 'past', () => App.go('ref.pastGame'));
      UI.on(el, 'edit', b => App.go('ref.edit', { sid: b.dataset.sid }));
    },
  });

  App.registerScreen('ref.pastGame', { tab: 'match', render(el) { el.innerHTML = ph('Log a past game', 'Phase 2 · admin.js'); } });
  App.registerScreen('ref.squad', { tab: 'squad', render(el) { el.innerHTML = `<div class="lbl">Squad <b class="n">${Object.keys(Store.players()).length}</b></div>` + ph('Squad', 'Phase 2 · admin.js'); } });
  App.registerScreen('ref.player', { tab: 'squad', render(el) { el.innerHTML = ph('Edit player', 'Phase 2 · admin.js'); } });
  App.registerScreen('ref.money', { tab: 'money', render(el) { el.innerHTML = ph('Money', 'Phase 2 · admin.js'); } });
  App.registerScreen('ref.moneyDay', { tab: 'money', render(el) { el.innerHTML = ph('Payment date', 'Phase 2 · admin.js'); } });

  // Offline bar (working minimum; the Admin builder owns the final look and the "Waiting to send (n)" line).
  App.registerScreen('app.offline', {
    mode: 'any',
    render(el, info) {
      if (info.status !== 'offline') { el.innerHTML = ''; return; }
      const when = info.savedAt ? `${UI.fmt.date(UI.fmt.iso(info.savedAt))} ${UI.fmt.time(info.savedAt)}` : '';
      el.innerHTML = `<div class="offline" role="status">${UI.icon('wifi-off')}<span class="grow"><b>Can’t connect</b><br>` +
        `${info.source === 'none' ? 'Nothing saved on this phone yet' : 'Showing what this phone saved' + (when ? ', ' + esc(when) : '')}` +
        `${info.pending ? ` · Waiting to send (${info.pending})` : ''}</span><button type="button" class="ub" data-offline-retry>Retry</button></div>`;
      el.querySelector('[data-offline-retry]').onclick = () => info.store.retry();
    },
  });

  App.registerAction('admin.editPlayer', ({ pid }) => App.go('ref.player', { pid }));
})();
