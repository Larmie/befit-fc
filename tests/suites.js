// The list of browser suites (and the two Node-only data checks that need them), in the order test:full runs them.
//
//   name    what you type: `npm test -- tables fix`
//   file    under tests/browser/
//   args    extra arguments (the sweep is split into one entry per screen group, so a tables change runs only
//           the tables groups)
//   areas   what part of the app the suite exercises. tests/tools/pick.js maps each changed file to areas
//           (css/tables.css → 'tables', js/core/scoring.js → 'scoring', …) and runs the suites that share one.
//   uses    shared test files the suite reads (a change to one of them re-runs the suite)
//   needs   suites whose output this one reads (they are run first)
//   failIf  for the few suites that print a result but always exit 0: output that means "failed"
//
// Area words: welcome player tables setup console fix admin (screens) · ui (shell, shared components, colours)
// scoring pay clock teams store auth config practice offline classic (core rules and plumbing).
'use strict';

const SWEEP = 'integration/sweep.js';
// test:changed and CI check two sizes (phone dark, with the deep sheet checks, and laptop light): about half the
// time of all of them. test:full checks every size and theme, including "light app, console in app colours".
const QUICK = process.env.SWEEP_VARIANTS || '390-dark,1280-light';
const sweep = (group, areas, extra) => Object.assign({ name: 'sweep-' + group, file: SWEEP, args: ['all', group], quickArgs: [QUICK, group], areas: ['sweep', ...areas],
  uses: ['browser/console/data.js', 'browser/r5-tables/data.js', 'browser/r5-fulltime/data.js'],
  failIf: /, [1-9]\d* with problems/ }, extra || {});

module.exports = [
  // ---- front door, shell, sign-in
  { name: 'e2e', file: 'phase1/e2e.js', areas: ['ui', 'welcome', 'auth', 'store', 'offline'] },
  { name: 'r5', file: 'r5-foundations/r5-test.js', areas: ['ui', 'welcome', 'auth', 'teams', 'console'] },
  { name: 'practice', file: 'practice/test.js', areas: ['practice', 'welcome', 'auth', 'store', 'config'],
    note: 'reads the live database once (GET only; any other request is aborted)' },
  // ---- player side
  { name: 'home', file: 'r5-home/home-test.js', areas: ['player', 'scoring'] },
  { name: 'tables', file: 'r5-tables/test.js', areas: ['tables', 'scoring', 'teams'], uses: ['browser/r5-tables/data.js'] },
  { name: 'unseen', file: 'unseen/test.js', areas: ['player', 'tables', 'fix', 'scoring'], uses: ['browser/r5-tables/data.js'] },
  { name: 'share-ms', file: 'share-ms/test.js', areas: ['player'], failIf: /SOME FAILED/ },
  // ---- referee: setup, console, full time
  { name: 'setup-flow', file: 'setup/flow.js', areas: ['setup', 'teams'] },
  { name: 'setup-visual', file: 'setup/visual.js', areas: ['setup', 'console'] },
  { name: 'console-match', file: 'console/match.js', areas: ['console', 'clock', 'store'], uses: ['browser/console/data.js'] },
  { name: 'console-audit', file: 'console/audit.js', areas: ['console'], uses: ['browser/console/data.js'] },
  { name: 'deck', file: 'r5-console/deck-test.js', areas: ['console', 'setup', 'clock'], uses: ['browser/console/data.js'] },
  { name: 'outbox', file: 'offline/outbox-test.js', areas: ['store', 'offline', 'console'], uses: ['browser/console/data.js'] },
  { name: 'fulltime', file: 'r5-fulltime/ft-test.js', areas: ['fix', 'scoring', 'clock'], uses: ['browser/r5-fulltime/data.js', 'fixtures/19oct-stoppage-as-recorded.json'] },
  { name: 'fix', file: 'fix/fix-e2e.js', areas: ['fix', 'scoring'], uses: ['browser/r5-fulltime/data.js', 'fixtures/19oct-stoppage-as-recorded.json'] },
  // ---- admin and money
  { name: 'r5-admin', file: 'r5-admin/r5-admin-test.js', areas: ['admin', 'pay', 'teams'] },
  { name: 'admin', file: 'admin/test.js', areas: ['admin', 'pay'] },
  { name: 'admin-card', file: 'admin/card-test.js', areas: ['admin'] },
  { name: 'admin-tonight', file: 'admin/tonight-test.js', areas: ['admin', 'pay'] },
  { name: 'admin-payrule', file: 'admin/payrule-test.js', areas: ['admin', 'pay'] },
  { name: 'admin-share', file: 'admin-share/test.js', areas: ['admin', 'fix'], failIf: /SOME FAILED/ },
  { name: 'paycheck', file: 'integration/paycheck.js', areas: ['pay', 'admin', 'player'] },
  // ---- the whole Monday night, then classic.html on what the new app wrote
  { name: 'monday', file: 'integration/monday.js', areas: ['scoring', 'pay', 'clock', 'teams', 'store', 'auth', 'config'] },
  { name: 'classic-compat', file: 'integration/classic-compat.js', areas: ['scoring', 'classic'], uses: ['browser/integration/classic-engine.js'],
    needs: ['monday', 'console-match', 'setup-flow'], failIf: /[1-9]\d* crashes/, node: true },
  // ---- the screen-check sweep (no sideways scroll, nothing clipped, tap targets, one hero …), one entry per group
  sweep('player', ['player', 'welcome']),          // it passes through Tables too; the three tables groups cover those screens
  sweep('playerlive', ['player']),
  sweep('guest', ['player']),
  sweep('playernogame', ['player']),
  sweep('referee', ['setup', 'admin']),
  sweep('admin', ['admin', 'setup', 'fix']),
  sweep('blueadmin', ['admin', 'teams']),
  sweep('console', ['console']),
  sweep('consolebig', ['console']),
  sweep('setup', ['setup']),
  sweep('ft', ['fix']),
  sweep('ftstop', ['fix']),
  sweep('tables', ['tables']),
  sweep('tablesguest', ['tables']),
  sweep('tablesblue', ['tables', 'teams']),
];
