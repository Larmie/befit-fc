// Phase 3 · Congestion sweep (checklist item 22) over EVERY screen and sheet. TEST MODE ONLY (harness).
// For each group of screens and each variant (390 / 1280 × dark / light; console groups also "light app + console
// forced dark" and "light, console = app"), it opens each screen, audits it, then clicks every distinct button on the
// screen one by one (data reset between clicks) and audits any sheet that opens. Plus explicit deep sheets.
// Rules checked: no sideways scroll · no clipped / ellipsised text · no text under 12 px · targets ≥ 48 (referee) /
// ≥ 44 (player) · 34 px under a sheet's last action · chips on one row · toasts one line, Undo ≤ 2 lines uncut ·
// no emoji · long explanatory sentences listed for review.
// ROUND 5 light rules (befit-round5.html "Screen-check rules"): gradients and coloured glows are allowed ONLY inside
// .hero or the listed components (.lit, .wash, .you-row); a neutral white sheen (--sheen) is fine on cards;
// at most ONE .hero per screen; no Geist Mono above 24 px (hero numerals are Geist 700).
// Usage: node sweep.js <variant|all> [group]      variants: 390-dark 390-light 1280-dark 1280-light 390-light-console-app 1280-light-console-app
const path = require('path');
const fs = require('fs');
const H = require('../harness.js');
const OUT = H.out(__dirname, 'sweep');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const NOW = new Date('2026-10-19T19:30:00').getTime();
const M12 = '-P3lenQyxWIniPyrtFAn', LIVE19 = '-P4KcMogcPM8_RRG9wAQ', SID20 = '-Oy-xrzTcJG36b_J29aK';
const JASON = '-Ou48vI1AasjuLzZFYwF', DANNY = '-Oy0N--T6eH5HHWJei3j';

// ---------------------------------------------------------------- data variants
function snap() { return H.snapshot(); }
function playerLive() {   // the 19 Oct match frozen at 72' (as player/test.js)
  const d = snap(); const s = d.sessions[LIVE19];
  s.status = 'active';
  for (const [k, e] of Object.entries(s.events)) if (e.min == null || e.min > 72 || e.stoppageMin != null) delete s.events[k];
  s.timer = { status: 'running', startedAt: NOW - 72 * 60000 + 20000, pausedAt: null, pausedTotal: 0, htLogged: true, endedAt: null, stoppageStartedAt: null, stoppageTotal: 0, stoppageBaseTotalMs: null };
  Object.values(s.events).forEach(e => { e.timestamp = NOW - (72 - e.min) * 60000; });
  delete s.goals; delete s.cleanSheets;
  return d;
}
function consoleLive(big) {  // 27 Jul's 26 players, running at 30', plus the two longest names
  const { liveData } = require(path.join(__dirname, '..', 'console', 'data.js'));
  const d = liveData({ format: big ? { start: 'small', switchedAt: 20, keepers: {} } : { start: 'small' } });
  const s = d.sessions.test_live;
  s.teams.green.players[JASON] = { position: 'MID' };
  s.teams.red.players[DANNY] = { position: 'MID' };
  if (big) {
    const gk = t => Object.keys(s.teams[t].players).find(pid => s.teams[t].players[pid].position === 'GK');
    s.format.keepers = { green: gk('green'), red: gk('red') };
  }
  s.timer = { status: 'running', startedAt: NOW - 30 * 60000, pausedAt: null, pausedTotal: 0, htLogged: false, endedAt: null, stoppageStartedAt: null, stoppageTotal: 0 };
  s.events = {
    a1: { type: 'goal', team: 'green', scorerId: JASON, min: 4, timestamp: NOW - 26 * 60000, by: 'referee' },
    a2: { type: 'goal', team: 'red', scorerId: DANNY, min: 9, timestamp: NOW - 21 * 60000, by: 'referee' },
    a3: { type: 'block', playerId: JASON, min: 12, timestamp: NOW - 18 * 60000, by: 'referee' },
    a4: { type: 'yellowCard', playerId: DANNY, min: 20, timestamp: NOW - 10 * 60000, by: 'referee' },
  };
  return d;
}
function ftData() {   // 20 Jul as if End game just happened, with a re-injected double tap
  const d = snap(); const s = d.sessions[SID20];
  const evs = Object.values(s.events); const ts = evs.map(e => e.timestamp);
  s.status = 'active';
  s.timer = { status: 'ended', startedAt: Math.min(...ts) - 60000, endedAt: Math.max(...ts) + 60000, pausedTotal: 0, htLogged: false };
  s.ftCheck = { status: 'checking' };
  delete s.goals; delete s.cleanSheets;
  const andrew = Object.keys(d.players).find(k => d.players[k].name === 'Andrew');
  const b = Object.values(s.events).find(e => e.type === 'block' && e.playerId === andrew);
  s.events.zz_dup = { type: 'block', playerId: andrew, timestamp: b.timestamp + 680, by: 'referee' };
  return d;
}
function adminData() {   // two name-only new people + a published result, so the admin card has content
  const d = snap();
  d.players['-zzNew1'] = { name: 'Kwesi Monday', defaultPosition: 'MID', defaultTeam: 'red', needsDetails: true, createdBy: 'referee@test', createdAt: NOW - 3600000 };
  d.sessions[M12].ftCheck = { status: 'published', publishedAt: NOW - 1800000, by: 'referee@test', fixes: { e1: { text: 'Andrew · duplicate block removed', pid: 'x', delta: -2, at: NOW - 1900000, by: 'referee@test' } } };
  return d;
}

// ---------------------------------------------------------------- groups: [name, opts, states]
// state: { id, route?, eval? (JS run after route; may open a sheet), noExplore?, shot? }
const GROUPS = {
  player: { opts: { viewer: 'seed_p002', data: snap }, states: [
    { id: 'welcome', route: '#/welcome' },
    { id: 'welcome-find', route: '#/welcome', eval: "(() => { const m = document.querySelector('#app-screen [data-tap=\"menu\"]'); if (m) m.click(); document.querySelector('#app-screen [data-tap=\"find\"]').click(); })()", noExplore: true },
    { id: 'welcome-typing', route: '#/welcome', eval: "(() => { const m = document.querySelector('#app-screen [data-tap=\"menu\"]'); if (m) m.click(); document.querySelector('#app-screen [data-tap=\"find\"]').click(); const i = document.querySelector('[data-search=\"who\"]'); i.value = 'Da'; i.dispatchEvent(new Event('input', { bubbles: true })); })()", noExplore: true },
    { id: 'player-home', route: '#/player.home' },
    { id: 'tables-teams', route: '#/tables.teams' },
    { id: 'tables-players', route: '#/tables.players' },
    { id: 'tables-stats', route: '#/tables.stats' },
    { id: 'pill-player', route: '#/player.home', eval: 'App.openPill()', noExplore: true },
    { id: 'signin-admin', route: '#/player.home', eval: "App.openSignIn({ as: 'admin' })", noExplore: true },
    { id: 'live-fulltime', route: '#/player.live' },
    { id: 'table', route: '#/player.table' },
    { id: 'season', route: '#/player.season' },
    { id: 'me', route: '#/player.me' },
    { id: 'match-12oct', route: '#/player.match?sid=' + M12 },
    { id: 'profile-harry', route: '#/player.profile?pid=seed_p001' },
    { id: 'profile-jason', route: '#/player.profile?pid=' + JASON },
    { id: 'appearance', route: '#/player.me', eval: 'App.openAppearance()', noExplore: true },
    { id: 'signin', route: '#/player.me', eval: 'App.openSignIn()', noExplore: true },
    { id: 'share', route: '#/player.me', eval: "App.action('player.shareCard', { pid: 'seed_p002' })", noExplore: true },
  ] },
  playerlive: { opts: { viewer: JASON, data: playerLive }, states: [
    { id: 'live-match', route: '#/player.live' },
    { id: 'match-live', route: '#/player.match?sid=' + LIVE19 },
    // round 5 home builder: live homes and the live breakdown sheet
    { id: 'player-home-live', route: '#/player.home' },
    { id: 'guest-home-live', route: '#/guest.home', eval: "App.setViewer('guest')" },
    { id: 'live-breakdown', route: '#/player.live', eval: "App.action('home.liveBreakdown', { sid: Store.activeSessionId(), pid: Scoring.livePoints(Store.activeSession())[0].pid })", noExplore: true },
  ] },
  guest: { opts: { viewer: 'guest', data: snap }, states: [
    { id: 'guest-home', route: '#/guest.home' },
    { id: 'welcome-first', route: '#/welcome' },   // nobody remembered on this phone: My stats · Browse as guest · Referee · Admin
    { id: 'pill-guest', route: '#/guest.home', eval: 'App.openPill()', noExplore: true },
    { id: 'guest-match', route: '#/player.live' },
    { id: 'guest-match-12oct', route: '#/player.match?sid=' + M12 },
    { id: 'signin-referee', route: '#/guest.home', eval: "App.openSignIn({ as: 'referee' })", noExplore: true },
  ] },
  referee: { opts: { referee: 'referee', viewer: 'guest', data: snap }, states: [
    { id: 'referee-setup', route: '#/ref.setup' },
    { id: 'referee-money', route: '#/ref.money' },
    { id: 'pill-referee', route: '#/ref.money', eval: 'App.openPill()', noExplore: true },
  ] },
  playernogame: { opts: { viewer: 'seed_p002', data: snap, now: '2026-10-21T12:00' }, states: [
    { id: 'live-nogame', route: '#/player.live' },
    { id: 'me-guest', route: '#/player.me', eval: "App.setViewer('guest')" },
    // round 5 home builder: homes and the Match tab on a day with no game
    { id: 'player-home-nogame', route: '#/player.home' },
    { id: 'me-andrew-carry', route: '#/player.me', eval: "App.setViewer('seed_p011'); setTimeout(() => document.querySelector('[data-tap=\"carry\"]').click(), 300)", noExplore: true },
    { id: 'guest-home-nogame', route: '#/guest.home', eval: "App.setViewer('guest')" },
    { id: 'guest-match-nogame', route: '#/player.live', eval: "App.setViewer('guest')" },
  ] },
  admin: { opts: { referee: true, data: adminData }, states: [
    { id: 'ref-home', route: '#/ref.home' },
    { id: 'admin-home', route: '#/admin.home' },
    { id: 'admin-settings', route: '#/admin.settings' },
    { id: 'pill-admin', route: '#/admin.home', eval: 'App.openPill()', noExplore: true },
    { id: 'ref-pastgame', route: '#/ref.pastGame' },
    { id: 'ref-squad', route: '#/ref.squad' },
    { id: 'ref-player', route: '#/ref.player?pid=' + DANNY },
    { id: 'ref-player-new', route: '#/ref.player?pid=-zzNew1' },
    { id: 'money-tonight', route: '#/ref.money' },
    { id: 'money-all', route: '#/ref.money?all=1' },
    { id: 'money-day', route: '#/ref.moneyDay?date=2026-09-07' },
    // round 5 admin builder: inline 60 · 120 · Other (a row tapped, then Other), Squad › Twice, Add a team, a live match on Home
    { id: 'money-amount', route: '#/ref.moneyDay?date=2026-09-07', eval: "(r => { if (r.getAttribute('aria-expanded') !== 'true') r.click(); })(document.querySelector('[data-tap=\"row\"]')); setTimeout(() => document.querySelector('.adm-quick [data-tap=\"set\"]').click(), 100)", noExplore: true },
    { id: 'money-other', route: '#/ref.money', eval: "(r => { if (r.getAttribute('aria-expanded') !== 'true') r.click(); })(document.querySelector('[data-tap=\"row\"]')); setTimeout(() => document.querySelector('.adm-quick [data-tap=\"other\"]').click(), 100)", noExplore: true },
    { id: 'squad-twice', route: '#/ref.squad?f=twice' },
    { id: 'settings-addteam', route: '#/admin.settings', eval: "App.action('admin.addTeam', {})", noExplore: true },
    { id: 'admin-home-live', route: '#/admin.home', eval: "(() => { const sid = Object.keys(Store.state.sessions).find(k => Store.state.sessions[k].date === '2026-10-19'); Store.update('sessions/' + sid, { status: 'active', timer: { status: 'running', startedAt: Store.now() - 30 * 60000, pausedTotal: 0, htLogged: false } }); })()", noExplore: true },
    { id: 'offline', route: '#/ref.home', eval: "Store.test.setStatus('offline')", noExplore: true },
    { id: 'setup', route: '#/ref.setup' },
    { id: 'setup-new-person', route: '#/ref.setup', eval: "App.action('setup.newPerson', { name: 'Kofi' })", noExplore: true },
    { id: 'edit-12oct', route: '#/ref.edit?sid=' + M12 },
    { id: 'edit-12oct-timeline', route: '#/ref.edit?sid=' + M12, eval: "(b => b && b.click())(document.querySelector('[data-tap=\"tab\"][data-value=\"timeline\"]'))" },   // laptop: both columns show, no tab
    { id: 'edit-event-sheet', route: '#/ref.edit?sid=' + M12, eval: `App.action('fix.eventSheet', { sid: '${M12}', eid: Object.keys(Store.session('${M12}').events).find(k => Store.session('${M12}').events[k].type === 'goal') })` },
    { id: 'edit-add-missed', route: '#/ref.edit?sid=' + M12, eval: `App.action('fix.addMissed', { sid: '${M12}' })` },
    { id: 'edit-player-sheet', route: '#/ref.edit?sid=' + M12, eval: `App.action('fix.playerSheet', { sid: '${M12}', pid: Object.keys(Store.session('${M12}').teams.red.players)[0] })` },
  ] },
  console: { opts: { referee: true, data: () => consoleLive(false) }, console: true, states: [
    { id: 'console-small', route: '#/ref.console' },
    // round 5 console builder: no ⋯ menu (console.menu now opens nothing); the deck's new sheets and states
    { id: 'console-adjust', route: '#/ref.console', eval: "App.action('console.adjustClock', { sid: 'test_live' })", noExplore: true },
    { id: 'console-sync', route: '#/ref.console', eval: "Store.test.setStatus('offline'); document.querySelector('.cn-act[data-kind=\"block\"]')?.click(); setTimeout(() => { document.querySelector('.sheet [data-tap=\"pick\"]')?.click(); setTimeout(() => { UI.undoBar.hide(); App.action('console.syncSheet', {}); }, 700); }, 800)", noExplore: true, wait: 2400 },
    { id: 'console-stoppage-esc', route: '#/ref.console', eval: "Store.set('sessions/test_live/timer', Clock.startStoppage(Store.session('test_live'), Store.now() - 300000))", noExplore: true, wait: 1600 },
    { id: 'console-card', route: '#/ref.console', eval: "document.querySelector('.cn-card[data-ctype=\"redCard\"]')?.click()", noExplore: true },
    { id: 'console-save', route: '#/ref.console', eval: "Store.update('sessions/test_live/format', { start: 'big' }); setTimeout(() => document.querySelector('.cn-save[data-team=\"green\"]')?.click(), 500)", noExplore: true, wait: 1400 },
    // round 6 console builder: team-locked sheets with "Wrong team? ›"
    { id: 'console-block-green', route: '#/ref.console', eval: "document.querySelector('.cn-act[data-kind=\"block\"][data-team=\"green\"]')?.click()", noExplore: true },
    { id: 'console-yellow-red', route: '#/ref.console', eval: "document.querySelector('.cn-card[data-ctype=\"yellowCard\"][data-team=\"red\"]')?.click()", noExplore: true },
    { id: 'console-arrivals', route: '#/ref.console', eval: "App.action('setup.addArrival', { sid: 'test_live' })", noExplore: true },
    { id: 'console-teams', route: '#/ref.console', eval: "App.action('setup.teamsTonight', { sid: 'test_live' })", noExplore: true },
    { id: 'console-bigpoles', route: '#/ref.console', eval: "App.action('setup.bigPoles', { sid: 'test_live' })", noExplore: true },
    { id: 'console-goal-assist', route: '#/ref.console', eval: `document.querySelector('.cn-goal[data-team="green"]').click(); setTimeout(() => document.querySelector('.sheet [data-tap="scorer"][data-pid="${JASON}"]')?.click(), 800)`, noExplore: true, wait: 1300 },   // wait past the 800 ms step so deep replays never race it
    { id: 'console-og', route: '#/ref.console', eval: `document.querySelector('.cn-goal[data-team="green"]').click(); setTimeout(() => document.querySelector('.sheet [data-tap="og"]')?.click(), 800)`, noExplore: true, wait: 1300 },
    { id: 'events', route: '#/ref.events?sid=test_live' },
    // Phase C: the other console states (half time, paused, offline with saves waiting, full time)
    { id: 'console-halftime', route: '#/ref.console', eval: "Store.set('sessions/test_live/timer', Clock.halfTime(Store.session('test_live'), Store.now()))", noExplore: true, wait: 900 },
    { id: 'console-paused', route: '#/ref.console', eval: "Store.set('sessions/test_live/timer', Clock.pause(Store.session('test_live'), Store.now()))", noExplore: true, wait: 900 },
    { id: 'console-offline-waiting', route: '#/ref.console', eval: "Store.test.setStatus('offline'); setTimeout(() => { Store.set('sessions/test_live/events/zz_w1', { type: 'block', playerId: '" + JASON + "', min: 30, timestamp: Store.now(), by: 'referee' }); Store.set('sessions/test_live/events/zz_w2', { type: 'clearance', playerId: '" + DANNY + "', min: 30, timestamp: Store.now() + 1, by: 'referee' }); }, 300)", noExplore: true, wait: 1500 },
    { id: 'console-ended', route: '#/ref.console', eval: "Store.set('sessions/test_live/timer', Clock.end(Store.session('test_live'), Store.now()))", noExplore: true, wait: 900 },
    { id: 'undo-long', route: '#/ref.console', eval: `document.querySelector('.cn-act[data-kind="block"]').click(); setTimeout(() => { const t = document.querySelector('.sheet [data-seg="team"] > button[data-value="green"]'); t && t.click(); setTimeout(() => document.querySelector('.sheet [data-tap="pick"][data-pid="${JASON}"]').click(), 500); }, 800)`, noExplore: true, wait: 2200 },
    { id: 'undo-long-goal', route: '#/ref.console', eval: `document.querySelector('.cn-goal[data-team="red"]').click(); setTimeout(() => { document.querySelector('.sheet [data-tap="scorer"][data-pid="${DANNY}"]').click(); setTimeout(() => document.querySelector('.sheet .cn-noassist').click(), 800); }, 800)`, noExplore: true, wait: 2600 },
    { id: 'undo-error', route: '#/ref.console', eval: `Store.test.failNext(1); document.querySelector('.cn-card[data-ctype="yellowCard"][data-team="red"]').click(); setTimeout(() => { const t = document.querySelector('.sheet [data-seg="team"] > button[data-value="red"]'); t && t.click(); setTimeout(() => document.querySelector('.sheet [data-tap="pick"][data-pid="${DANNY}"]').click(), 500); }, 800)`, noExplore: true, wait: 2600 },
  ] },
  consolebig: { opts: { referee: true, data: () => consoleLive(true) }, console: true, states: [
    { id: 'console-big', route: '#/ref.console' },
    // round 6: Save in 1 tap (one keeper per side); the toast offers Penalty
    { id: 'console-save-toast', route: '#/ref.console', eval: "document.querySelector('.cn-save[data-team=\"red\"]')?.click()", noExplore: true, wait: 900 },
  ] },
  // round 6 console builder: the lineup picker (empty, picking, + From Red, ready team sheet)
  setup: { opts: { referee: 'referee', data: snap }, console: true, states: [
    { id: 'lineup-empty', route: '#/ref.setup' },
    { id: 'lineup-picking', route: '#/ref.setup', eval: "[...document.querySelectorAll('.scr-ref-setup [data-tap=\"tick\"]')].slice(0, 4).forEach(b => b.click())", noExplore: true },
    { id: 'lineup-from-red', route: '#/ref.setup', eval: "document.querySelector('[data-tap=\"from\"]')?.click(); setTimeout(() => document.querySelector('.sh-setup-from [data-tap=\"tick\"]')?.click(), 500)", noExplore: true, wait: 1200 },
    { id: 'lineup-ready', route: '#/ref.setup', eval: "const t = () => [...document.querySelectorAll('.scr-ref-setup [data-tap=\"tick\"]:not(.on)')].slice(0, 1).forEach(b => b.click()); for (let i = 0; i < 9; i++) t(); document.querySelector('[data-seg=\"side\"] > button:nth-child(2)').click(); setTimeout(() => { for (let i = 0; i < 9; i++) t(); document.querySelector('[data-seg=\"poles\"] > button[data-value=\"big\"]').click(); }, 300)", noExplore: true, wait: 1400 },
  ] },
  ft: { opts: { referee: true, data: ftData }, console: true, states: [
    { id: 'ftcheck', route: '#/ref.ftcheck?sid=' + SID20 },
    { id: 'published', route: '#/ref.ftcheck?sid=' + SID20, eval: `document.querySelector('[data-tap="rm1"]').click(); setTimeout(() => { UI.undoBar.hide(); document.querySelector('[data-tap="publish"]').click(); setTimeout(() => UI.undoBar.hide(), 900); }, 900)`, wait: 2400 },
  ] },
  // round 5 fulltime builder: 19 Oct re-created (round 5 timer, labels restarting each half), the stoppage left running
  // round 5 tables builder (r5-tables/sweep-tables.js): tables + share cards, a guest, and the design's Blue night
  tables: { opts: { viewer: 'seed_p011', data: snap }, states: [
    { id: 'tables-teams-andrew', route: '#/tables.teams' },
    { id: 'tables-players-andrew', route: '#/tables.players' },
    { id: 'tables-stats-andrew', route: '#/tables.stats' },
    { id: 'share-season', route: '#/tables.teams', eval: "App.action('player.shareCard', { pid: 'seed_p011', kind: 'season' })" },
    { id: 'share-ft', route: '#/tables.teams', eval: "App.action('share.fullTime', { sid: '' })", noExplore: true },
  ] },
  tablesguest: { opts: { viewer: 'guest', data: snap }, states: [
    { id: 'tables-players-guest', route: '#/tables.players' },
  ] },
  tablesblue: { opts: { viewer: 'guest', data: () => require('../r5-tables/data.js').blue(), now: '2026-11-10T12:00' }, states: [
    { id: 'blue-teams', route: '#/tables.teams' },
    { id: 'blue-players', route: '#/tables.players' },
    { id: 'blue-stats', route: '#/tables.stats' },
    { id: 'blue-share-ft', route: '#/tables.teams', eval: "App.action('share.fullTime', { sid: 'test_blue_2nov' })", noExplore: true },
    { id: 'blue-guest-home', route: '#/guest.home' },
    { id: 'blue-match', route: '#/player.match?sid=test_blue_2nov' },
  ] },
  // Phase C: the admin side of a Blue night (Settings with 4 teams, Who's here with Blue, Squad chips)
  blueadmin: { opts: { referee: true, data: () => require('../r5-tables/data.js').blue(), now: '2026-11-10T12:00' }, states: [
    { id: 'blue-settings', route: '#/admin.settings' },
    { id: 'blue-admin-home', route: '#/admin.home' },
    { id: 'blue-squad', route: '#/ref.squad' },
    { id: 'blue-setup', route: '#/ref.setup', eval: "App.setRole('referee')" },
  ] },
  ftstop: { opts: { referee: 'referee', data: () => require('../r5-fulltime/data.js').copy19('r5'), now: '2026-10-19T21:30' }, console: true, states: [
    { id: 'ftcheck-stoppage', route: '#/ref.ftcheck?sid=zz_r5_copy_19oct' },
    { id: 'stoppage-ok', route: '#/ref.ftcheck?sid=zz_r5_copy_19oct', eval: `document.querySelector('[data-tap="stopkeep"]').click(); setTimeout(() => UI.undoBar.hide(), 900)`, wait: 1400, noExplore: true },
    { id: 'publish-offline', route: '#/ref.ftcheck?sid=zz_r5_copy_19oct', eval: `Store.test.setStatus('offline')`, noExplore: true },
    { id: 'published-waiting', route: '#/ref.ftcheck?sid=zz_r5_copy_19oct', eval: `Store.test.setStatus('offline'); setTimeout(() => { document.querySelector('[data-tap="publish"]').click(); setTimeout(() => UI.undoBar.hide(), 900); }, 300)`, wait: 1800, noExplore: true },
    { id: 'published-card', route: '#/ref.ftcheck?sid=zz_r5_copy_19oct', eval: `document.querySelector('[data-tap="publish"]').click(); setTimeout(() => UI.undoBar.hide(), 900)`, wait: 1800 },
  ] },
};

const VARIANTS = {
  '390-dark': { width: 390, theme: 'dark' }, '390-light': { width: 390, theme: 'light' },
  '1280-dark': { width: 1280, theme: 'dark' }, '1280-light': { width: 1280, theme: 'light' },
  '390-light-console-app': { width: 390, theme: 'light', consoleTheme: 'app', consoleOnly: true },
  '1280-light-console-app': { width: 1280, theme: 'light', consoleTheme: 'app', consoleOnly: true },
};
// taps never clicked by the explorer (downloads, sign-out, holds, things that leave the app)
const SKIP = /^(save-img|share-img|signout|sign-out)$/;

// ---------------------------------------------------------------- the in-page audit
function AUDIT() {
  window.__audit = function (scope) {
    const ref = document.body.dataset.mode === 'referee';
    const minT = ref ? 48 : 44;
    const roots = scope === 'sheet' ? [...document.querySelectorAll('#app-layer .sheet')].slice(-1)
      : [document.getElementById('app-header'), document.getElementById('app-status'), document.getElementById('app-screen'), document.getElementById('app-nav'), document.getElementById('app-rail')].filter(Boolean);
    roots.push(document.getElementById('app-undo'), document.getElementById('app-toast'));
    const out = { hscroll: Math.max(0, document.documentElement.scrollWidth - window.innerWidth), tiny: [], clipped: [], small: [], emoji: [], gradient: [], glow: [], chipsWrap: [], sheetGap: null, toast: [], undo: null, sentences: [], heroes: 0, mono: [], monoCount: [], wideScore: [], overlap: [] };
    const LIT = '.hero, .lit, .wash, .you-row';
    // colours inside a computed gradient: rgb(a)(…) or color(srgb r g b / a)
    const colours = v => [...String(v).matchAll(/rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/g)].map(m => {
      if (m[1]) { const p = m[1].split(',').map(x => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
      const q = m[2].split('/'); const c = q[0].trim().split(/\s+/).map(x => parseFloat(x) * 255); return { r: c[0], g: c[1], b: c[2], a: q[1] ? parseFloat(q[1]) : 1 };
    });
    const neutral = c => c.a === 0 || (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 12);
    const isSheen = v => { const cs = colours(v); return cs.length > 0 && cs.every(neutral); };
    const vis = el => { if (!el || !el.getBoundingClientRect) return false; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return false; for (let e = el; e; e = e.parentElement) { if (getComputedStyle(e).opacity === '0' || e.hidden) return false; } return true; };
    const label = el => (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase()) + ' "' + (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 28) + '"';
    const EMO = /\p{Extended_Pictographic}/u;
    const all = []; roots.forEach(r => r && r.querySelectorAll('*').forEach(e => all.push(e))); roots.forEach(r => r && all.push(r));
    for (const el of all) {
      if (!vis(el)) continue;
      const cs = getComputedStyle(el);
      const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ');
      if (own) {
        if (parseFloat(cs.fontSize) < 12) out.tiny.push(label(el) + ' ' + cs.fontSize);
        const clips = cs.textOverflow === 'ellipsis' || /hidden|clip/.test(cs.overflowX) || /hidden|clip/.test(cs.overflowY) || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none');
        if (clips && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) out.clipped.push(label(el));
        if (EMO.test(own)) out.emoji.push(label(el));
        const words = own.split(/\s+/).length;
        if (words >= 9 && !el.closest('input,textarea')) out.sentences.push(own.slice(0, 80));
      }
      // a text node inside a clipping ancestor that overflows sideways
      const lit = !!el.closest(LIT);
      if (/gradient/.test(cs.backgroundImage) && !lit && !isSheen(cs.backgroundImage)) out.gradient.push(label(el) + ' ' + cs.backgroundImage.slice(0, 40));
      if (own && /Geist Mono/i.test(cs.fontFamily) && parseFloat(cs.fontSize) > 24.5) out.mono.push(label(el) + ' ' + cs.fontSize);
      // Phase C (checklist 24): no Mono slashed zeros in big or COUNT numerals. Mono stays for minutes, clocks,
      // table columns, positions and money in lists; a count beside a word (chips, segments, labels, titles, buttons,
      // save bars, header) or any Mono numeral of 17 px and up fails.
      if (own && /\d/.test(own) && /Geist Mono/i.test(cs.fontFamily)) {
        const minuteLike = /^[+−-]?\d{1,3}(\+\d{1,2})?['’]?$|^\+?\d{1,3}:\d\d$|^\d{1,2}:\d\d$/.test(own.trim());
        const okPlace = el.closest('.tbl, .min, .pos, .mv, .sb-scorers, .scorers, input, .tally, .fx-ftc-m, .cn-evr, .amt, .delta');
        if (parseFloat(cs.fontSize) >= 17 && !minuteLike) out.monoCount.push(label(el) + ' ' + cs.fontSize);
        else if (!okPlace && !minuteLike && el.closest('.chip, .seg, .lbl, .sheet-title, .sheet h4, .hd, .adm-savebar, .btn, .ub, .head, .sub')) out.monoCount.push(label(el));
      }
      const glowOf = v => v && v !== 'none' && /(\d+(\.\d+)?)px\s+(\d+(\.\d+)?)px\s+(\d+(\.\d+)?)px/.test(v) && v.split(/,(?![^(]*\))/).some(s => { const m = s.match(/(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px/); const c = s.match(/rgba?\(([^)]+)\)/); const rgb = c ? c[1].split(",").slice(0, 3).map(Number) : [0, 0, 0]; const neutral = rgb.every(x => x < 40); return m && Number(m[3]) >= 6 && !/inset/.test(s) && !neutral; });
      if (!lit && (glowOf(cs.boxShadow) || glowOf(cs.textShadow) || /drop-shadow/.test(cs.filter))) out.glow.push(label(el) + ' ' + (cs.boxShadow !== 'none' ? cs.boxShadow : cs.textShadow).slice(0, 60));
      const isTarget = el.matches('button, a[href], [data-tap], [role="tab"], input:not([type=hidden]), select, textarea') && !el.disabled;
      if (isTarget && !el.parentElement.closest('button, a[href], [data-tap]')) {
        const r = el.getBoundingClientRect();
        const inChips = !!el.closest('.chips');
        if (!inChips && r.height < minT - 0.5) out.small.push(label(el) + ' ' + Math.round(r.height) + 'px');
      }
    }
    // Phase C (checklist 24, laptop width): the two score numerals of a score block sit close (block ≤ 560 px)
    if (window.innerWidth >= 960) roots.forEach(r => r && r.querySelectorAll('.sb').forEach(sb => {
      if (!vis(sb)) return;
      const n = [...sb.querySelectorAll('.sb-half .hn')].filter(vis).map(x => x.getBoundingClientRect());
      const w = sb.getBoundingClientRect().width;
      if (w > 562 || (n.length >= 2 && Math.abs((n[n.length - 1].left + n[n.length - 1].right) / 2 - (n[0].left + n[0].right) / 2) > 520)) out.wideScore.push(label(sb) + ' ' + Math.round(w) + 'px');
    }));
    // Phase C: header parts never touch or overlap (date vs a long sync chip on a phone)
    const hdParts = [...document.querySelectorAll('#app-header .hd-l, #app-header .hd-c, #app-header .hd-r')].filter(vis)
      .map(e => { const kids = [...e.querySelectorAll('*')].filter(vis).map(k => k.getBoundingClientRect()).filter(r => r.width > 1); return kids.length ? { l: Math.min(...kids.map(r => r.left)), r: Math.max(...kids.map(r => r.right)), t: label(e) } : null; }).filter(Boolean);
    for (let i = 1; i < hdParts.length; i++) if (hdParts[i].l < hdParts[i - 1].r + 4) out.overlap.push(hdParts[i - 1].t + ' / ' + hdParts[i].t);
    out.heroes = roots.filter(Boolean).reduce((n, r) => n + [...r.querySelectorAll('.hero')].filter(h => vis(h) && !h.parentElement.closest('.hero')).length, 0);
    document.querySelectorAll('.chips').forEach(c => { if (!vis(c) || !roots.some(r => r && r.contains(c))) return; const tops = new Set([...c.children].filter(vis).map(x => Math.round(x.getBoundingClientRect().top))); if (tops.size > 1) out.chipsWrap.push(label(c)); });
    const lines = el => { const rg = document.createRange(); rg.selectNodeContents(el); return new Set([...rg.getClientRects()].filter(r => r.width > 1).map(r => Math.round(r.top))).size; };
    document.querySelectorAll('#app-toast .toast').forEach(t => { if (vis(t)) { const n = lines(t); if (n > 1) out.toast.push(`${n} lines: ${t.innerText.slice(0, 50)}`); } });
    const u = document.querySelector('#app-undo .undo');
    if (u && vis(u)) {
      const tx = u.querySelector('.tx');
      const main = tx ? [...tx.childNodes].filter(n => !(n.nodeType === 1 && n.tagName === 'SMALL')) : [];
      const rg = document.createRange(); if (tx) { rg.setStartBefore(tx.firstChild); const sm = tx.querySelector('small'); if (sm) rg.setEndBefore(sm); else rg.setEndAfter(tx.lastChild); }
      const mainLines = tx ? new Set([...rg.getClientRects()].filter(r => r.width > 1).map(r => Math.round(r.top))).size : 0;
      const sm = tx && tx.querySelector('small');
      out.undo = { text: u.innerText.replace(/\s+/g, ' ').trim(), mainLines, cut: tx ? tx.scrollHeight > tx.clientHeight + 1 : false,
        small: sm ? { text: sm.textContent, shown: vis(sm) && sm.getBoundingClientRect().bottom <= tx.getBoundingClientRect().bottom + 1, cut: sm.scrollWidth > sm.clientWidth + 1 } : null, height: Math.round(u.getBoundingClientRect().height) };
    }
    if (scope === 'sheet') {
      const sh = roots[0];
      if (sh) {
        [sh, ...sh.querySelectorAll('*')].forEach(e => { if (e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight; });
        const sr = sh.getBoundingClientRect();
        const acts = [...sh.querySelectorAll('button, a[href], [data-tap], input')].filter(vis).map(b => b.getBoundingClientRect()).filter(r => r.bottom <= sr.bottom + 1);
        const last = acts.length ? Math.max(...acts.map(r => r.bottom)) : null;
        const bottomEdge = Math.min(sr.bottom, window.innerHeight);
        out.sheetGap = last == null ? null : Math.round(bottomEdge - last);
        out.sheetTitle = (sh.querySelector('h4, .sheet-title') || {}).textContent || '';
      }
    }
    return out;
  };
}

function problems(a, scope) {
  const p = [];
  if (a.hscroll > 0) p.push(`sideways scroll ${a.hscroll}px`);
  if (a.tiny.length) p.push('under 12px: ' + [...new Set(a.tiny)].slice(0, 4).join(' | '));
  if (a.clipped.length) p.push('clipped: ' + [...new Set(a.clipped)].slice(0, 4).join(' | '));
  if (a.small.length) p.push('small targets: ' + [...new Set(a.small)].slice(0, 6).join(' | '));
  if (a.emoji.length) p.push('emoji: ' + a.emoji.slice(0, 3).join(' | '));
  if (a.gradient.length) p.push('gradient: ' + [...new Set(a.gradient)].slice(0, 3).join(' | '));
  if (a.glow.length) p.push('glow: ' + [...new Set(a.glow)].slice(0, 3).join(' | '));
  if (a.heroes > 1) p.push(`${a.heroes} glowing heroes (one per screen)`);
  if (a.mono.length) p.push('Geist Mono above 24px: ' + [...new Set(a.mono)].slice(0, 3).join(' | '));
  if (a.overlap && a.overlap.length) p.push('header parts touch or overlap: ' + a.overlap.join(' | '));
  if (a.monoCount && a.monoCount.length) p.push('Mono (slashed zero) count/big numeral: ' + [...new Set(a.monoCount)].slice(0, 4).join(' | '));
  if (a.wideScore && a.wideScore.length) p.push('score block too wide on a laptop: ' + [...new Set(a.wideScore)].slice(0, 2).join(' | '));
  if (a.chipsWrap.length) p.push('chips wrap: ' + a.chipsWrap.join(' | '));
  if (a.toast.length) p.push('toast: ' + a.toast.join(' | '));
  if (a.undo && (a.undo.mainLines > 2 || a.undo.cut || (a.undo.small && (!a.undo.small.shown || a.undo.small.cut)))) p.push('undo bar: ' + JSON.stringify(a.undo));
  if (scope === 'sheet' && a.sheetGap != null && a.sheetGap < 34) p.push(`only ${a.sheetGap}px under the last action`);
  return p;
}

async function runGroup(gname, vname) {
  const g = GROUPS[gname], v = VARIANTS[vname];
  if (v.consoleOnly && !g.console) return [];
  const results = [];
  const data = g.opts.data();
  const s = await H.open(Object.assign({}, g.opts, { data, width: v.width, theme: v.theme, consoleTheme: v.consoleTheme || null, route: g.states[0].route }));
  const p = s.page;
  await p.evaluate(AUDIT);
  await p.evaluate((d, t, ct, vw) => { window.__SWEEP_DATA__ = d; window.__SWEEP_THEME__ = [t, ct]; window.__SWEEP_VIEWER__ = vw; }, data, v.theme, v.consoleTheme || 'dark', g.opts.viewer || 'seed_p002');
  const reset = async route => {
    await p.evaluate(() => { try { UI.sheet.closeAll(); UI.undoBar.hide(); document.getElementById('app-toast').innerHTML = ''; Store.test.setStatus('online'); Store.test.reset(window.__SWEEP_DATA__); App.theme.set(window.__SWEEP_THEME__[0]); App.theme.setConsole(window.__SWEEP_THEME__[1]); if (window.__SWEEP_VIEWER__ !== undefined && App.viewerState() !== window.__SWEEP_VIEWER__ && window.__SWEEP_VIEWER__) App.setViewer(window.__SWEEP_VIEWER__); } catch (e) {} });
    await p.evaluate(r => { location.hash = r.replace(/^#/, ''); }, route); await sleep(350);
    await p.evaluate(() => window.scrollTo(0, 0));
  };
  const record = async (state, scope, extra) => {
    const a = await p.evaluate(sc => window.__audit(sc), scope);
    const tag = `${gname}/${state}${extra ? ' › ' + extra : ''}`;
    const pr = problems(a, scope);
    results.push({ variant: vname, where: tag, scope, problems: pr, sentences: a.sentences, sheetGap: a.sheetGap, undo: a.undo, title: a.sheetTitle });
    return a;
  };
  const DEEP = v.width === 390 && process.env.DEEP !== '0';
  const SHEET_TAPS = skip => {
    const sh = [...document.querySelectorAll('#app-layer .sheet')].pop(); if (!sh) return [];
    const seen = new Set(), list = [];
    const all = [...sh.querySelectorAll('[data-tap], .seg > button, [data-act]')];
    all.forEach((el, i) => {
      if (el.disabled || !el.getBoundingClientRect().width) return;
      const key = el.dataset.tap || (el.closest('[data-seg]') ? 'seg:' + el.closest('[data-seg]').dataset.seg + ':' + el.dataset.value : 'act:' + el.dataset.act);
      if (new RegExp(skip).test(key) || /sheet-cancel|^cancel$|close/.test(key) || seen.has(key)) return;
      seen.add(key); list.push({ key, idx: i });
    });
    return list;
  };
  const deep = async (st, replay, label) => {
    if (!DEEP) return;
    const inner = await p.evaluate(SHEET_TAPS, SKIP.source);
    for (const t of inner.slice(0, 10)) {
      await replay();
      const before = await p.evaluate(() => { const sh = [...document.querySelectorAll('#app-layer .sheet')].pop(); return sh ? sh.innerText.length + '|' + document.querySelectorAll('#app-layer .sheet').length : ''; });
      await p.evaluate(i => { const sh = [...document.querySelectorAll('#app-layer .sheet')].pop(); if (!sh) return; const el = [...sh.querySelectorAll('[data-tap], .seg > button, [data-act]')][i]; if (el) { el.scrollIntoView({ block: 'center' }); el.click(); } }, t.idx);
      await sleep(650);
      const now = await p.evaluate(() => { const sh = [...document.querySelectorAll('#app-layer .sheet')].pop(); return sh ? sh.innerText.length + '|' + document.querySelectorAll('#app-layer .sheet').length : ''; });
      if (now && now !== before) await record(st.id, 'sheet', label + ' › ' + t.key);
      else if (!now) await record(st.id, 'screen', label + ' › ' + t.key + ' (closed)');
    }
  };
  for (const st of g.states) {
    const errBefore = s.errors.length;
    try {
      await reset(st.route);
      const evalIt = async () => { if (st.eval) { await p.evaluate(st.eval); await sleep(st.wait || 700); } };
      await evalIt();
      const sheetOpen = await p.evaluate(() => document.querySelectorAll('#app-layer .sheet').length > 0);
      await record(st.id, sheetOpen ? 'sheet' : 'screen');
      if (v.width === 390 || st.id.startsWith('console') || st.id === 'events') await s.shot(path.join(OUT, `${vname}--${gname}--${st.id}.png`));
      if (sheetOpen) await deep(st, async () => { await reset(st.route); await evalIt(); }, 'sheet');
      if (st.noExplore || sheetOpen) continue;
      // full page for long screens (shot only at 390)
      // explore: every distinct tap on the screen + header
      const taps = await p.evaluate(skip => {
        const seen = new Set(), list = [];
        document.querySelectorAll('#app-screen [data-tap], #app-header [data-hd], #app-header [data-cn-more], #app-header [data-pl-share], #app-header [data-shell="appearance"]').forEach(el => {
          if (el.disabled || !el.getBoundingClientRect().width) return;
          const key = el.dataset.tap || el.dataset.hd || (el.hasAttribute('data-cn-more') ? 'cn-more' : el.hasAttribute('data-pl-share') ? 'pl-share' : 'appearance');
          if (new RegExp(skip).test(key) || seen.has(key)) return;
          seen.add(key);
          const all = [...document.querySelectorAll('#app-screen [data-tap], #app-header [data-hd], #app-header [data-cn-more], #app-header [data-pl-share], #app-header [data-shell="appearance"]')];
          list.push({ key, idx: all.indexOf(el) });
        });
        return list;
      }, SKIP.source);
      for (const t of taps.slice(0, 18)) {
        await reset(st.route);
        await evalIt();
        const before = await p.evaluate(() => location.hash);
        await p.evaluate(i => { const all = [...document.querySelectorAll('#app-screen [data-tap], #app-header [data-hd], #app-header [data-cn-more], #app-header [data-pl-share], #app-header [data-shell="appearance"]')]; const el = all[i]; if (el) { el.scrollIntoView({ block: 'center' }); el.click(); } }, t.idx);
        await sleep(700);
        const opened = await p.evaluate(() => document.querySelectorAll('#app-layer .sheet').length > 0);
        if (opened) {
          await record(st.id, 'sheet', 'tap ' + t.key);
          if (v.width === 390) await s.shot(path.join(OUT, `${vname}--${gname}--${st.id}--${t.key}.png`));
          await deep(st, async () => { await reset(st.route); await evalIt(); await p.evaluate(i => { const all = [...document.querySelectorAll('#app-screen [data-tap], #app-header [data-hd], #app-header [data-cn-more], #app-header [data-pl-share], #app-header [data-shell="appearance"]')]; const el = all[i]; if (el) { el.scrollIntoView({ block: 'center' }); el.click(); } }, t.idx); await sleep(550); }, 'tap ' + t.key);
        } else if ((await p.evaluate(() => location.hash)) === before) {
          // in-place change (seg, chips, expand, draft): audit the screen again (toasts, undo bars, wraps)
          await record(st.id, 'screen', 'tap ' + t.key);
        }
      }
    } catch (e) { results.push({ variant: vname, where: `${gname}/${st.id}`, problems: ['SCRIPT: ' + e.message.split('\n')[0]] }); }
    if (s.errors.length > errBefore) results.push({ variant: vname, where: `${gname}/${st.id} (console errors on this state)`, problems: ['console errors: ' + s.errors.slice(errBefore, errBefore + 3).join(' | ')] });
  }
  results.push({ variant: vname, where: `${gname} (whole run)`, problems: s.errors.length ? ['console errors: ' + s.errors.slice(0, 3).join(' | ')] : [] });
  await s.close();
  return results;
}

(async () => {
  const want = process.argv[2] || 'all', only = process.argv[3];
  const vnames = want === 'all' ? Object.keys(VARIANTS) : want.split(',');
  const all = [];
  for (const vn of vnames) for (const gn of Object.keys(GROUPS)) { if (only && gn !== only) continue; const r = await runGroup(gn, vn); all.push(...r); console.log(`${vn} ${gn}: ${r.length} checks, ${r.filter(x => x.problems.length).length} with problems`); }
  const file = path.join(H.out(__dirname), `sweep-${want.replace(/,/g, '+')}${only ? '-' + only : ''}.json`);
  fs.writeFileSync(file, JSON.stringify(all, null, 1));
  const bad = all.filter(x => x.problems.length);
  console.log(`\n${all.length} screen/sheet checks, ${bad.length} with problems`);
  bad.forEach(b => console.log(`- [${b.variant}] ${b.where}: ${b.problems.join(' ;; ')}`));
})().catch(e => { console.error(e); process.exit(2); });
