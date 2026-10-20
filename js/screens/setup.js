/* ============================================================================
   BE Fit Club · js/screens/setup.js · NIGHT SETUP             OWNER: Phase 2 · Setup builder
   ----------------------------------------------------------------------------
   STUB from Phase 1. Replace the placeholders; keep the ids, params and action names.
   Styles in css/setup.css, scoped under .scr-ref-setup and .sh-setup-* (sheets).

   SCREENS
     'ref.setup'          tab match · layout phone · console   "Who's here?" before kick-off:
                          Green · n | Red · n switch, "Usually here" chips, search, add a name,
                          Small poles | Big poles, "Kick off · n players" → creates the session
                          (status 'active', mode 'live', teams, format:{start}) and opens 'ref.console'.
   ACTIONS (others call these with App.action(name, args))
     'setup.newPerson'    ({ name?, team?, onDone(pid) })  "Add someone": existing names first (duplicate
                          check as you type, case-insensitive, also "contains"), else name only + side.
                          New players get defaultPosition 'MID', defaultTeam = side, needsDetails:true.
     'setup.addArrival'   ({ sid })   "Who's arrived?" mid-match sheet (the console's "+ Player")
     'setup.teamsTonight' ({ sid })   move players between sides, "Moved 27'" tag, 9 outfield + 1 keeper per side
     'setup.bigPoles'     ({ sid })   pick one keeper per side → format.switchedAt = first big-poles minute,
                          format.keepers = { team: pid }, and set those players' position to 'GK'.
   Design: section 03 flows 1, 2, 3 and "New game and team picking". Checklist items 5–8.
   ========================================================================== */
(function () {
  'use strict';
  const ph = (title, what) => `<div class="placeholder"><b>${UI.esc(title)}</b> · ${UI.esc(what)}</div>`;

  App.registerScreen('ref.setup', {
    tab: 'match', layout: 'phone', console: true,
    header: () => ({ center: 'Tonight · ' + UI.esc(UI.fmt.date(UI.fmt.iso(Store.now()))), right: `<button type="button" class="hd-btn" data-shell="back">Cancel</button>` }),
    render(el) { el.innerHTML = `<div class="head">Who’s here?</div><div class="mt-4">${ph('Who’s here', 'Phase 2 · setup.js')}</div>`; },
  });

  const stubSheet = title => () => UI.sheet.open({ title, body: ph(title, 'Phase 2 · setup.js'), cancel: true });
  App.registerAction('setup.newPerson', stubSheet('Add someone'));
  App.registerAction('setup.addArrival', stubSheet('Who’s arrived?'));
  App.registerAction('setup.teamsTonight', stubSheet('Teams tonight'));
  App.registerAction('setup.bigPoles', stubSheet('Switch to big poles'));
})();
