/* ============================================================================
   BE Fit Club · js/screens/tables.js · TABLES, PODIUM, LEADERS, SHARE CARDS
                                                              OWNER: Round 5 · Tables builder
   ----------------------------------------------------------------------------
   Styles in css/tables.css, scoped under .scr-tables-* (sheets: .sh-tables-*).
   Contract: ...\scratchpad\build\R5-CONTRACT.md (screen ids, components, Teams API).

   SCREENS (the shell registers working placeholders until these are registered here)
     'tables.teams'    tab tables   Teams · Players · Stats segment on top. Team rows washed in their colour
                                    (UI.teamChip / .wash), form W/D/L in colour (UI.resultMark(r, team)),
                                    league pts, the full W·D·L·GF·GA·GD·Pts table. Blue-ready (Teams.list()).
     'tables.players'  tab tables   the season table (from player.table): team chips, the "you" row (.you-row),
                                    Season | Last game, position chips, movement, sticky you.
     'tables.stats'    tab tables   stepped podium (UI.podium) for points, leader rows (UI.leaderRow), Top 5 ›.
   ACTIONS
     'player.shareCard'  ({ pid })     Season / Last game (position-aware) broadcast cards (moves here from player.js)
     'share.fullTime'    ({ sid })     the Full-time match card (offered after Publish)
   ========================================================================== */
(function () {
  'use strict';
  // Placeholders live in js/ui/shell.js (PLACEHOLDERS) until this file registers the real screens.
})();
