/* ============================================================================
   BE Fit Club · js/screens/fix.js · FIXING                    OWNER: Phase 2 · Fix builder
   ----------------------------------------------------------------------------
   STUB from Phase 1. Replace the placeholders; keep the ids, params and action names.
   Styles in css/fix.css, scoped under .scr-ref-ftcheck / .scr-ref-edit / .sh-fix-*.

   SCREENS
     'ref.ftcheck' {sid}  tab match · layout phone · console   Full-time check: score card (+ one muted line,
                          e.g. "No minutes logged"), flags from Scoring.checks(sess) (double tap: "Remove one" +
                          its effect / "Keep both"; no-minute events), "+ Add a missed event", then
                          "Publish results" → status 'completed', Scoring.storedFields(sess) (goals, cleanSheets),
                          ftCheck:{ status:'published', publishedAt, by }, then the Published screen.
     'ref.edit' {sid}     tab match   Edit match: Players tab (default; Green · 57 | Red · 42) and Timeline tab
                          (filters, grouped by half, "Added after full time"). No score boxes for live matches.
                          History matches: tick who played + stats → upgrades to mode 'post' (classic behaviour).
                          Post matches: per-player stat steppers. Add / remove a player from the match.
                          Delete the match lives here behind UI.hold.
   ACTIONS
     'fix.eventSheet'  ({ sid, eid })        Event sheet: Scorer/Player, Assist, Team (read-only), Minute (− / +,
                                             or "Not sure"), own goal toggle, Move to another player, Remove.
                                             PointsDelta from Scoring.previewChange() before Save.
     'fix.addMissed'   ({ sid, pid? })       Add a missed event (4 + 3 type grid, Who, Minute "Not sure" default)
     'fix.playerSheet' ({ sid, pid })        one player's night: points maths, events, Add a missed one, Move all
   After ANY event change on a completed match also write Scoring.storedFields(nextSess) (goals + cleanSheets),
   and `editedBy` / `editedAt` on the event, so the classic app and the table stay right.
   Design: section 03 flows 5, 6, 8; "Edit a finished match"; Build spec › Fixing components. Checklist 12, 14, 16.
   ========================================================================== */
(function () {
  'use strict';
  const ph = (title, what) => `<div class="placeholder"><b>${UI.esc(title)}</b> · ${UI.esc(what)}</div>`;

  App.registerScreen('ref.ftcheck', {
    tab: 'match', layout: 'phone', console: true,
    header: ctx => { const s = Store.session(ctx.params.sid); return { center: 'Full time' + (s ? ' · ' + UI.esc(UI.fmt.date(s.date)) : '') }; },
    render(el) { el.innerHTML = ph('Full-time check', 'Phase 2 · fix.js'); },
  });

  App.registerScreen('ref.edit', {
    tab: 'match',
    header: ctx => { const s = Store.session(ctx.params.sid); return { left: `<button type="button" class="hd-btn" data-shell="back">‹ Back</button>`, center: 'Edit' + (s ? ' · ' + UI.esc(UI.fmt.date(s.date)) : '') }; },
    render(el) { el.innerHTML = ph('Edit match', 'Phase 2 · fix.js'); },
  });

  const stubSheet = title => () => UI.sheet.open({ title, body: ph(title, 'Phase 2 · fix.js'), cancel: 'Close' });
  App.registerAction('fix.eventSheet', stubSheet('Event'));
  App.registerAction('fix.addMissed', stubSheet('Add a missed event'));
  App.registerAction('fix.playerSheet', stubSheet('Player'));
})();
