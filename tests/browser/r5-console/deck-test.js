// Round 5 · console builder · the deck's new behaviour, TEST MODE ONLY (harness: in-memory data, Firebase blocked).
// Stoppage escalation at 4 min · labels restart each half · Adjust clock (hold + sheet) keeps logged minutes ·
// the 1.5 s holds (short press does nothing) · sync chip offline states + waiting dots · Blue v Green Goal tiles ·
// double / triple taps = 1 event · Card sheet "Booked" · Save = tonight's keepers · GK plays as MID on small poles ·
// nav hidden live · retired ⋯ menu harmless.  Screens at 390 dark, 390 light (console = app), 1280 dark.
// Run: node deck-test.js
const fs = require('fs');
const path = require('path');
const H = require('../harness.js');
const { liveData } = require('../console/data.js');
const OUT = H.out(__dirname, 'shots');
const SID = 'test_live';
const NOW = new Date('2026-10-19T19:30:00').getTime();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const lines = [];
const check = (label, ok, extra) => { if (!ok) fails++; const l = `${ok ? 'ok  ' : 'FAIL'} ${label}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`; console.log(l); lines.push(l); };
const note = t => { console.log('\n# ' + t); lines.push('\n# ' + t); };

const running = min => ({ status: 'running', startedAt: NOW - min * 60000, pausedTotal: 0, htLogged: false, stoppageTotal: 0, endedAt: null, stoppageStartedAt: null, stoppageBaseTotalMs: null });

function helpers(s) {
  const p = s.page;
  // freeze the app clock at NOW (it only moves when the test says so)
  s.freeze = () => p.evaluate(n => { window.__F = n; Store.now = () => window.__F; }, NOW);
  const h = {
    p,
    events: () => p.evaluate(sid => Object.entries(Store.session(sid).events || {}).map(([id, v]) => Object.assign({ id }, v)), SID),
    timer: () => p.evaluate(sid => Store.session(sid).timer || {}, SID),
    adv: min => p.evaluate(ms => { window.__F += ms; }, min * 60000),
    pid: name => p.evaluate((sid, n) => Scoring.sessPlayers(Store.session(sid)).find(x => x.name === n).pid, SID, name),
    sheets: () => p.evaluate(() => document.querySelectorAll('#app-layer .sheet').length),
    toast: () => p.evaluate(() => { const t = document.querySelector('#app-toast .toast'); return t ? t.textContent : null; }),
    text: sel => p.evaluate(q => { const e = document.querySelector(q); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel),
    tap: async (sel, wait = 420) => { await p.waitForSelector(sel, { visible: true, timeout: 4000 }); await p.click(sel); await sleep(wait); },
    rapid: async (sel, n = 2) => { const el = await p.waitForSelector(sel, { visible: true, timeout: 4000 }); await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await sleep(80); const b = await el.boundingBox(); for (let i = 0; i < n; i++) await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2); },
    hold: async (sel, ms) => {
      await p.evaluate(q => document.querySelector(q).scrollIntoView({ block: 'center' }), sel); await sleep(150);
      const b = await (await p.$(sel)).boundingBox();
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await sleep(ms); await p.mouse.up(); await sleep(450);
    },
    esc: async () => { await p.keyboard.press('Escape'); await sleep(200); await p.keyboard.press('Escape'); await sleep(250); },
    barGone: () => p.waitForFunction(() => !document.querySelector('#app-undo .undo'), { timeout: 9000 }).catch(() => {}),
    shot: name => s.shot(path.join(OUT, name)),
    evWrites: () => p.evaluate(() => Store.test.writes.filter(w => Object.keys(w.updates).some(k => k.includes('/events/'))).length),
  };
  return h;
}

async function main() {
  // ======================================================================== 1. stoppage, escalation, labels per half
  note('Stoppage: one amber control, escalates after 4 min, labels restart each half');
  let s = await H.open({ width: 390, referee: 'referee', route: '#/ref.console', data: liveData({ format: { start: 'small' }, timer: running(44) }) });
  let h = helpers(s), p = h.p; await s.freeze(); await sleep(1100);
  check('nav hidden while the match is live (referee)', await p.evaluate(() => document.body.classList.contains('nav-hidden') && document.getElementById('app-nav').hidden));
  check('header: Referee ▾ · date · sync chip "✓ All sent", no ⋯', (await h.text('#app-header .hd-l')).startsWith('Referee') && (await h.text('#app-header [data-sync]')) === '✓ All sent' && !(await p.$('#app-header [data-cn-more]')));
  const w0 = await p.evaluate(() => Store.test.writes.length);
  await h.rapid('.cn-row1 [data-act="stoppage"]', 2); await sleep(500);
  let t = await h.timer();
  check('+ Stoppage (double tapped) → stoppage, 1 timer write', t.status === 'stoppage' && (await p.evaluate(() => Store.test.writes.length)) === w0 + 1, t.status);
  check('score centre turns amber: "+0:00 · Stoppage"', await p.evaluate(() => { const m = document.querySelector('.cn-score .sb-mid'); return m.classList.contains('is-stoppage') && m.querySelector('small').textContent === 'Stoppage'; }));
  check('the stoppage button is amber "End stoppage · +0:00", Pause disabled', (await h.text('.cn-stop')) === 'End stoppage · +0:00' && await p.$eval('.cn-pause', e => e.disabled));
  check('line under the score: "Clock held at 44:00 · 1st half"', (await h.text('.cn-line')) === 'Clock held at 44:00 · 1st half', await h.text('.cn-line'));
  await h.adv(3.9); await sleep(1200);
  check('3:54 in: not escalated yet', !(await p.$('.cn-stop.is-esc')) && /^End stoppage · \+3:5\d$/.test(await h.text('.cn-stop')), await h.text('.cn-stop'));
  await h.adv(0.2); await sleep(1200);
  check('4:06 in: the same control escalates "Still in stoppage? End · +4:06"', !!(await p.$('.cn-stop.is-esc.lit')) && /^Still in stoppage\?\s*End · \+4:06$/.test(await h.text('.cn-stop')), await h.text('.cn-stop'));
  check('no banner: exactly one stoppage control on screen', (await p.$$eval('.scr-ref-console [data-act="endStoppage"], .scr-ref-console .banner, #app-status .offline', a => a.length)) === 1);
  check('score centre "+4:06" (this half)', (await h.text('.cn-score .sb-mid b')) === '+4:06');
  await h.shot('deck-stoppage-escalated-390-dark.png');
  const blk = await h.pid('Joshua');
  await h.tap(`.cn-act[data-kind="block"][data-team="green"]`); await h.tap(`.sheet [data-tap="pick"][data-pid="${blk}"]`, 600);
  let ev = (await h.events()).find(e => e.type === 'block');
  check("block in 1st-half stoppage stamped 44+5'", ev && ev.min === 44 && ev.stoppageBaseMin === 44 && ev.stoppageMin === 5, ev);
  await h.barGone();
  await h.tap('.cn-stop', 800);
  t = await h.timer();
  check('End → running, stoppage total ≈ 4:06', t.status === 'running' && Math.round(t.stoppageTotal / 1000) === 246, t.stoppageTotal);
  check('"Total tonight +4:06" beside Match controls', (await h.text('[data-total]')) === 'Total tonight +4:06', await h.text('[data-total]'));
  await h.adv(1); await sleep(300);
  await h.tap('.cn-grid [data-tap="halftime"]', 700); await h.barGone();
  await h.tap('.cn-row1 [data-act="resume"]', 900);
  await h.adv(0.5); await sleep(300);
  await h.tap('.cn-row1 [data-act="stoppage"]', 900);
  await h.adv(2.5); await sleep(1100);
  check('2nd half stoppage: centre "+2:30" (restarts each half), total tonight +6:36', (await h.text('.cn-score .sb-mid b')) === '+2:30' && (await h.text('[data-total]')) === 'Total tonight +6:36', [await h.text('.cn-score .sb-mid b'), await h.text('[data-total]')]);
  await h.tap(`.cn-act[data-kind="clearance"][data-team="green"]`); await h.tap(`.sheet [data-tap="pick"][data-pid="${blk}"]`, 600);
  ev = (await h.events()).find(e => e.type === 'clearance');
  check("clearance in 2nd-half stoppage stamped 46+3' (not 46+8')", ev && ev.stoppageBaseMin === 46 && ev.stoppageMin === 3 && Scoringish(ev) === "46+3'", ev);
  check('Latest shows the same label', (await p.$$eval('.cn-feed .cn-evr .min', a => a.map(x => x.textContent))).includes("46+3'"));
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();

  // ======================================================================== 2. Adjust clock
  note('Adjust clock: hold 1.5 s, then a sheet; logged minutes stay');
  s = await H.open({ width: 390, referee: 'referee', route: '#/ref.console', data: liveData({ format: { start: 'small' }, timer: running(20) }) });
  h = helpers(s); p = h.p; await s.freeze(); await sleep(1100);
  const harry = await h.pid('Harry');
  await h.tap('.cn-goal[data-team="green"]'); await h.tap(`.sheet [data-tap="scorer"][data-pid="${harry}"]`); await h.tap('.sheet .cn-noassist', 700); await h.barGone();
  await h.adv(3);
  await h.tap(`.cn-act[data-kind="block"][data-team="green"]`); await h.tap(`.sheet [data-tap="pick"][data-pid="${harry}"]`, 700); await h.barGone();
  const before = JSON.stringify((await h.events()).map(e => [e.id, e.min, e.stoppageMin || null]).sort());
  await h.hold('.cn-adjust', 250);
  check('a short press on Adjust clock opens nothing (toast explains)', (await h.sheets()) === 0 && (await h.toast()) === 'Hold to adjust the clock', await h.toast());
  await h.hold('.cn-adjust', 1000);
  check('releasing at 1.0 s opens nothing', (await h.sheets()) === 0);
  await p.evaluate(() => document.querySelector('.cn-adjust').classList.add('holding')); await sleep(700);
  await h.shot('deck-adjust-hold-390-dark.png');
  await p.evaluate(() => document.querySelector('.cn-adjust').classList.remove('holding'));
  await h.hold('.cn-adjust', 1700);
  check('held 1.5 s → the Adjust clock sheet', (await h.sheets()) === 1 && (await h.text('.sheet .sheet-title')) === 'Adjust clock');
  check('it starts on the current minute: 23\', "Now 23:00"', (await h.text('.sheet [data-amin]')) === "23'" && (await h.text('.sheet .sh-s')) === 'Now 23:00', [await h.text('.sheet [data-amin]'), await h.text('.sheet .sh-s')]);
  await h.tap('.sheet [data-tap="plus"]', 120); await h.tap('.sheet [data-tap="plus"]', 120);
  check('+ + → "Set clock to 25:00"', (await h.text('.sheet .cn-adjsave')) === 'Set clock to 25:00');
  await h.shot('adjust-sheet-390-dark.png');
  await h.rapid('.sheet .cn-adjsave', 2); await sleep(700);
  t = await h.timer();
  const el25 = await p.evaluate(sid => Clock.elapsedMs(Store.session(sid)), SID);
  check('saved (double tapped): clock reads 25:00, still running, sheet closed', el25 === 25 * 60000 && t.status === 'running' && (await h.sheets()) === 0, el25);
  check('events already logged keep their minutes', JSON.stringify((await h.events()).map(e => [e.id, e.min, e.stoppageMin || null]).sort()) === before);
  check('only the timer was written (1 write)', await p.evaluate(() => Object.keys(Store.test.writes[Store.test.writes.length - 1].updates).join() === 'sessions/test_live/timer'));
  await h.barGone();
  // from stoppage: the sheet offers "End stoppage and set the clock", the guess includes the running stoppage
  await h.tap('.cn-row1 [data-act="stoppage"]', 900); await h.adv(7 + 10 / 60); await sleep(1100);
  await h.hold('.cn-adjust', 1700);
  check('in stoppage: "Now 25:00 + 7:10 stoppage", guess 32\', "End stoppage and set the clock" ✓', (await h.text('.sheet .sh-s')) === 'Now 25:00 + 7:10 stoppage' && (await h.text('.sheet [data-amin]')) === "32'" && /End stoppage and set the clock\s*✓/.test(await h.text('.sheet .cn-adj')), [await h.text('.sheet .sh-s'), await h.text('.sheet [data-amin]')]);
  await h.shot('adjust-sheet-stoppage-390-dark.png');
  await h.tap('.sheet .cn-adjsave', 800);
  t = await h.timer();
  check('saved from stoppage → running at 32:00, stoppage ended', t.status === 'running' && (await p.evaluate(sid => Clock.elapsedMs(Store.session(sid)), SID)) === 32 * 60000 && !t.stoppageStartedAt);
  await h.barGone();
  await h.hold('.cn-adjust', 1700);
  await h.tap('.sheet [data-tap="reset"]', 150);
  check('Reset to 0:00 → button "Reset clock to 0:00"', (await h.text('.sheet .cn-adjsave')) === 'Reset clock to 0:00');
  await h.tap('.sheet .cn-adjsave', 800);
  t = await h.timer();
  check('reset: clock 0:00, stoppage 0, events keep minutes', (await p.evaluate(sid => Clock.elapsedMs(Store.session(sid)), SID)) === 0 && t.stoppageTotal === 0 && JSON.stringify((await h.events()).map(e => [e.id, e.min, e.stoppageMin || null]).sort()) === before);
  await h.tap('#app-undo [data-act="undo"]', 700);
  check('Undo puts the clock back (32:00)', (await p.evaluate(sid => Math.round(Clock.elapsedMs(Store.session(sid)) / 1000), SID)) === 32 * 60);
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();

  // ======================================================================== 3. offline: sync chip + waiting dots
  note('Offline: sync chip states, waiting dots, the waiting list');
  s = await H.open({ width: 390, referee: 'referee', route: '#/ref.console', data: liveData({ format: { start: 'small' }, timer: running(70) }) });
  h = helpers(s); p = h.p; await s.freeze(); await sleep(1100);
  await p.evaluate(() => Store.test.setStatus('offline')); await sleep(300);
  check('offline, nothing waiting: "No signal"', (await h.text('#app-header [data-sync]')) === 'No signal', await h.text('#app-header [data-sync]'));
  const names = ['Andrew', 'Joshua', 'Keith'];
  const kinds = ['block', 'clearance', 'block'];
  for (let i = 0; i < 3; i++) {
    const pid = await p.evaluate((sid, n) => { const x = Scoring.sessPlayers(Store.session(sid)).find(q => q.name === n) || Scoring.sessPlayers(Store.session(sid))[0]; return x.pid; }, SID, names[i]);
    const team = await p.evaluate((sid, id) => Object.keys(Store.session(sid).teams).find(t => Store.session(sid).teams[t].players[id]), SID, pid);
    await h.tap(`.cn-act[data-kind="${kinds[i]}"][data-team="${team}"]`); await h.tap(`.sheet [data-tap="pick"][data-pid="${pid}"]`, 600);
    await p.evaluate(() => UI.undoBar.hide());
  }
  await sleep(300);
  check('3 saved on the phone: chip "On phone · 3 waiting" (amber)', (await h.text('#app-header [data-sync]')) === 'On phone · 3 waiting' && !!(await p.$('#app-header .sync.wait')), await h.text('#app-header [data-sync]'));
  check('each waiting row in Latest has an amber dot (3)', (await p.$$eval('.cn-feed .cn-evr.is-waiting .cn-wait', a => a.length)) === 3);
  const bar = await p.evaluate(() => { const o = document.querySelector('#app-status .offline'); return o && o.getBoundingClientRect().height > 0 ? o.textContent.replace(/\s+/g, ' ').trim() : null; });
  lines.push(`info  old orange offline bar on the console (admin builder's app.offline): ${bar ? 'STILL SHOWN: ' + bar : 'not shown'}`); console.log('info  orange bar:', bar);
  await h.shot('deck-offline-waiting-390-dark.png');
  await h.tap('#app-header [data-sync]', 500);
  check('tap the chip → "3 waiting to send" list in plain words', (await h.text('.sheet .sheet-title')) === '3 waiting to send' && (await p.$$eval('.sheet .cn-synclist .r', a => a.length)) === 3 && /Block|Clearance/.test(await h.text('.sheet .cn-synclist')), await h.text('.sheet .cn-synclist'));
  await h.shot('sync-sheet-390-dark.png');
  await p.evaluate(() => Store.test.setStatus('online')); await sleep(900);
  check('signal back: the open list turns "All sent"', (await h.text('.sheet .sheet-title')) === 'All sent');
  await h.esc();
  check('chip "✓ All sent", no dots', (await h.text('#app-header [data-sync]')) === '✓ All sent' && (await p.$$eval('.cn-wait', a => a.length)) === 0);
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();

  // ======================================================================== 4. Blue v Green, double / triple taps, sheets
  note('Blue v Green: tiles, score, sheets; double and triple taps = 1 event');
  const d = liveData({ format: { start: 'big', keepers: {} }, timer: running(30) });
  d.settings = { teams: { green: { name: 'Green', colour: 'green', order: 2, active: true }, red: { name: 'Red', colour: 'red', order: 3, active: true }, blue: { name: 'Blue', colour: 'blue', order: 1, active: true } } };
  const ss = d.sessions[SID]; ss.teams.blue = ss.teams.red; delete ss.teams.red;
  const gk = t => Object.keys(ss.teams[t].players).find(k => ss.teams[t].players[k].position === 'GK');
  ss.format.keepers = { blue: gk('blue'), green: gk('green') };
  s = await H.open({ width: 390, referee: 'referee', route: '#/ref.console', data: d });
  h = helpers(s); p = h.p; await s.freeze(); await sleep(1100);
  check('Blue v Green: two team columns in Settings order (Blue | Green), each tile carries its team', (await p.$$eval('.cn-col', a => a.map(x => x.dataset.col).join(','))) === 'blue,green' && (await p.$$eval('.cn-col[data-col="blue"] [data-team]', a => a.every(x => x.dataset.team === 'blue'))) && (await p.$$eval('.cn-col[data-col="green"] [data-team]', a => a.every(x => x.dataset.team === 'green'))));
  check('Goal tiles in Settings order: Blue, Green', (await p.$$eval('.cn-goal', a => a.map(x => x.dataset.team).join(','))) === 'blue,green');
  const tint = await p.$$eval('.cn-goal', a => a.map(x => getComputedStyle(x).getPropertyValue('--tc').trim()));
  check('each tile tinted in its own team colour', tint[0] !== tint[1] && tint.every(Boolean), tint);
  check('score block: BLUE left, GREEN right', (await p.$$eval('.cn-score .sb-nm', a => a.map(x => x.textContent).join(','))) === 'Blue,Green');
  await h.rapid('.cn-goal[data-team="blue"]', 3); await sleep(450);
  check('triple tap on Goal · Blue → one sheet', (await h.sheets()) === 1);
  check('Goal sheet: team-tinted title bar "Goal · Blue", "Who scored?"', await p.evaluate(() => { const hd = document.querySelector('.sheet .sheet-h'); return hd.classList.contains('lit') && hd.classList.contains('t-blue') && hd.querySelector('.sheet-title').textContent === 'Goal · Blue' && hd.querySelector('.sh-s').textContent === 'Who scored?'; }));
  await h.shot('goal-sheet-blue-390-dark.png');
  const scorer = await p.$eval('.sheet [data-tap="scorer"]', e => e.dataset.pid);
  await h.rapid(`.sheet [data-tap="scorer"][data-pid="${scorer}"]`, 3); await sleep(450);
  const w1 = await h.evWrites();
  await h.rapid('.sheet .cn-noassist', 3); await sleep(800);
  ev = await h.events();
  check('Goal in 3 taps; triple taps at each step → exactly 1 goal (team blue), 1 write', ev.filter(e => e.type === 'goal').length === 1 && ev[0].team === 'blue' && (await h.evWrites()) === w1 + 1);
  check('score 1–0 shown for Blue, Blue tile count 1', (await p.$$eval('.cn-score .sb-half .hn', a => a.map(x => x.textContent).join('-'))) === '1-0' && (await h.text('.cn-goal[data-team="blue"] .cn-gc')) === '1');
  await h.barGone();
  await h.shot('deck-blue-green-390-dark.png');
  // Save sheet: only tonight's keepers, Save | Penalty save first, triple tap = 1
  check('Save tiles name each side\'s keeper (Blue column first)', (await p.$$eval('.cn-save', a => a.map(x => x.dataset.team).join(','))) === 'blue,green' && (await h.text('.cn-save[data-team="blue"] .cn-sk')).startsWith(Store_name(ss, gk('blue'))));
  const wS = await h.evWrites();
  await h.rapid('.cn-save[data-team="green"]', 3); await sleep(700);
  check('1-tap Save · Green, TRIPLE tapped → exactly 1 save (the Green keeper), 1 write, no sheet', (await h.events()).filter(e => e.type === 'save' && e.playerId === gk('green')).length === 1 && (await h.events()).filter(e => e.type === 'save').length === 1 && (await h.evWrites()) === wS + 1 && (await h.sheets()) === 0);
  await h.shot('save-1-tap-toast-390-dark.png');
  await h.barGone();
  // Card: booked marker
  const yp = Object.keys(ss.teams.green.players).find(k => ss.teams.green.players[k].position !== 'GK');
  await h.tap(`.cn-card[data-ctype="yellowCard"][data-team="green"]`);
  await h.rapid(`.sheet [data-tap="pick"][data-pid="${yp}"]`, 3); await sleep(700);
  check('triple tap on a Card row → exactly 1 yellow', (await h.events()).filter(e => e.type === 'yellowCard').length === 1);
  await h.barGone();
  check('Green\'s Yellow tile now reads "Yellow · 1"; Blue\'s still "Yellow"', (await h.text('.cn-card[data-ctype="yellowCard"][data-team="green"] b')) === 'Yellow · 1' && (await h.text('.cn-card[data-ctype="yellowCard"][data-team="blue"] b')) === 'Yellow');
  await h.tap(`.cn-card[data-ctype="yellowCard"][data-team="green"]`);
  check('Card sheet marks him "Booked 30\'"', (await h.text(`.sheet [data-pid="${yp}"] .cn-booked`)) === "Booked 30'", await h.text(`.sheet [data-pid="${yp}"] .cn-booked`));
  await h.shot('card-sheet-booked-390-dark.png');
  await h.esc();
  // stoppage double tap, + Player double tap
  await h.rapid('.cn-row1 [data-act="stoppage"]', 3); await sleep(800);
  check('triple tap on + Stoppage → stoppage (not straight back to running)', (await h.timer()).status === 'stoppage');
  await sleep(300);
  await h.rapid('.cn-stop', 2); await sleep(800);
  check('double tap on End stoppage → running', (await h.timer()).status === 'running');
  await h.rapid('.cn-grid [data-tap="player"]', 2); await sleep(500);
  check('double tap on + Player → one sheet', (await h.sheets()) === 1);
  await h.esc();
  await p.evaluate(() => App.action('console.menu', { sid: 'test_live' })); await sleep(300);
  check('retired console.menu opens nothing', (await h.sheets()) === 0);
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();

  // ======================================================================== 5. small poles: GK plays as MID
  note('Small poles: a GK-position player is offered as an outfielder');
  s = await H.open({ width: 390, referee: 'referee', route: '#/ref.console', data: liveData({ format: { start: 'small' }, timer: running(12) }) });
  h = helpers(s); p = h.p; await s.freeze(); await sleep(1100);
  const bona = await h.pid('Bona');
  const bteam = await p.evaluate((sid, id) => Object.keys(Store.session(sid).teams).find(t => Store.session(sid).teams[t].players[id]), SID, bona);
  check('no Save tile (no keepers on small poles)', !(await p.$('.cn-save')));
  await h.tap(`.cn-act[data-kind="block"][data-team="${bteam}"]`);
  check('Bona (GK on the team sheet) is on Block, shown as MID', (await h.text(`.sheet [data-tap="pick"][data-pid="${bona}"] .tally`)) === 'MID');
  await h.tap(`.sheet [data-tap="pick"][data-pid="${bona}"]`, 700);
  check('his block counts as a MID (Scoring.playsAs = MID)', (await p.evaluate((sid, id) => Scoring.playsAs(Store.session(sid), id), SID, bona)) === 'MID' && (await h.events()).some(e => e.type === 'block' && e.playerId === bona));
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();

  // ======================================================================== 5b. setup: Tonight hero, Blue-ready from Settings › Teams
  note('Setup: Tonight hero, who plays tonight from Settings › Teams (Blue v Green), poles labels');
  const ds = H.snapshot();
  ds.settings = { teams: { green: { name: 'Green', colour: 'green', order: 1, active: true }, red: { name: 'Red', colour: 'red', order: 2, active: true }, blue: { name: 'Blue', colour: 'blue', order: 3, active: true } } };
  s = await H.open({ width: 390, referee: 'referee', route: '#/ref.setup', data: ds });
  h = helpers(s); p = h.p;
  check('header: date + sync chip (no Cancel)', !!(await p.$('#app-header [data-sync]')) && !(await p.$('#app-header [data-shell="back"]')));
  check('3 active teams → 3 lineup tabs (Green | Red | Blue), "0 of 10" each', (await p.$$eval('[data-seg="side"] > button', a => a.map(x => x.dataset.value + ':' + x.querySelector('.n').textContent).join(','))) === 'green:0 of 10,red:0 of 10,blue:0 of 10');
  check('no score-like TONIGHT / VS block', !(await p.$('.su-hero, .su-vs, .scr-ref-setup .sb')));
  const tickN = async n => { for (let i = 0; i < n; i++) { const id = await p.$$eval('.scr-ref-setup [data-tap="tick"]:not(.on)', a => a[0].dataset.pid); await h.tap(`.scr-ref-setup [data-tap="tick"][data-pid="${id}"]`, 150); } };
  await tickN(3);
  check('ticked rows fill with the team (wash + filled tick), tab "3 of 10"', (await p.$$eval('.scr-ref-setup .su-sq.on .su-tick.on', a => a.length)) === 3 && (await h.text('[data-seg="side"] > button[data-value="green"] .n')) === '3 of 10');
  await h.tap('[data-seg="side"] > button[data-value="blue"]', 200);
  check('Blue has no usual squad yet: the empty note points to "+ From"', /No usual Blue players yet/.test(await h.text('.su-none')) && (await h.text('[data-tap="from"]')) === '+ From other teams');
  await h.tap('[data-tap="from"]', 500);
  check('"+ From" sheet: "Add to Blue tonight", a tab per other team', (await h.text('.sh-setup-from .sheet-title')) === 'Add to Blue tonight' && (await p.$$eval('.sh-setup-from [data-seg="from"] > button', a => a.map(x => x.dataset.value).join(','))) === 'green,red');
  await h.tap('.sh-setup-from [data-seg="from"] > button[data-value="red"]', 200);
  const reds = await p.$$eval('.sh-setup-from [data-tap="tick"]', a => a.slice(0, 2).map(x => x.dataset.pid));
  for (const id of reds) await h.tap(`.sh-setup-from [data-tap="tick"][data-pid="${id}"]`, 200);
  await h.tap('.sh-setup-from [data-tap="done"]', 300);
  check('2 usual Reds ticked for Blue tonight: "2 of 10", rows say "usually Red"', (await h.text('[data-seg="side"] > button[data-value="blue"] .n')) === '2 of 10' && (await p.$$eval('.scr-ref-setup .su-sq.on .meta', a => a.every(x => /usually Red/.test(x.textContent)))));
  check('ready: the team sheet card, Green 3 · Blue 2', (await p.$$eval('.su-tsh', a => a.map(x => x.querySelector('span').textContent + ' ' + x.querySelector('b').textContent).join(' | '))) === 'Green 3 | Blue 2');
  check('poles: "Small poles" | "Big poles"', (await p.$$eval('[data-seg="poles"] > button', a => a.map(x => x.textContent.trim()).join(' | '))) === 'Small poles | Big poles');
  await h.shot('setup-blue-390-dark.png');
  await p.evaluate(() => document.querySelector('[data-tap="kickoff"]').scrollIntoView({ block: 'center' })); await sleep(200);   // clear of the fixed bottom nav
  await h.tap('[data-tap="kickoff"]', 1800);
  const ns = await p.evaluate(() => { const s = Store.activeSession(); return s ? Object.keys(s.teams).sort().join(',') : null; });
  const shape = await p.evaluate(() => { const x = Store.activeSession(); return { keys: Object.keys(x).sort().join(','), entry: [...new Set(Object.values(x.teams).flatMap(t => Object.values(t.players).map(e => Object.keys(e).sort().join(','))))].join('|'), format: JSON.stringify(x.format), status: x.status, mode: x.mode, timer: x.timer.status }; });
  check('the lineup writes the same session shape as before: {date, format, mode, status, teams{players{pid:{position}}}, timer}', shape.keys === 'date,format,mode,status,teams,timer' && shape.entry === 'position' && shape.format === '{"start":"small"}' && shape.status === 'active' && shape.mode === 'live' && shape.timer === 'running', shape);
  check('Kick off → a Blue v Green session (Red, with nobody ticked, is left out), console open', ns === 'blue,green' && (await p.evaluate(() => document.querySelector('#app-screen section').dataset.screen)) === 'ref.console', ns);
  check('console Goal tiles Green · Blue', (await p.$$eval('.cn-goal', a => a.map(x => x.dataset.team).join(','))) === 'green,blue');
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();

  // ======================================================================== 7. ROUND 6 · tap counts per log type (the mock-up's table)
  note('Round 6 tap counts: Block 2 · Clear 2 · Yellow 2 · Red 2 · Save 1 · Penalty save 2 · Goal 3; Wrong team; 2-keeper picker');
  const d7 = liveData({ format: { start: 'big', keepers: {} }, timer: running(40) });
  const t7 = d7.sessions[SID].teams;
  const gk7 = t => Object.keys(t7[t].players).find(k => t7[t].players[k].position === 'GK');
  d7.sessions[SID].format.keepers = { green: gk7('green'), red: gk7('red') };
  s = await H.open({ width: 390, referee: 'referee', route: '#/ref.console', data: d7 });
  h = helpers(s); p = h.p; await s.freeze(); await sleep(1100);
  const outfield = t => Object.keys(t7[t].players).find(k => t7[t].players[k].position !== 'GK');
  const G1 = outfield('green'), R1 = outfield('red');
  const taps = async (label, sels, type, extra) => {
    const before = (await h.events()).filter(e => e.type === type).length, w = await h.evWrites();
    for (const sel of sels) await h.tap(sel, 450);
    await sleep(500);
    const after = (await h.events()).filter(e => e.type === type).length;
    const ok = after === before + 1 && (await h.evWrites()) === w + 1 && (!extra || await extra());
    check(`${label}: ${sels.length} taps → exactly 1 ${type}`, ok, { taps: sels.length, before, after });
    await p.evaluate(() => UI.undoBar.hide()); await sleep(1300);
  };
  await taps('Block', ['.cn-act[data-kind="block"][data-team="green"]', `.sheet [data-tap="pick"][data-pid="${G1}"]`], 'block');
  await taps('Clear', ['.cn-act[data-kind="clearance"][data-team="red"]', `.sheet [data-tap="pick"][data-pid="${R1}"]`], 'clearance');
  await taps('Yellow', ['.cn-card[data-ctype="yellowCard"][data-team="green"]', `.sheet [data-tap="pick"][data-pid="${G1}"]`], 'yellowCard');
  await taps('Red', ['.cn-card[data-ctype="redCard"][data-team="red"]', `.sheet [data-tap="pick"][data-pid="${R1}"]`], 'redCard');
  await taps('Save', ['.cn-save[data-team="green"]'], 'save', async () => (await h.events()).some(e => e.type === 'save' && e.playerId === gk7('green')));
  await h.tap('.cn-save[data-team="red"]', 500);
  check('Save toast: "Save · <keeper> 40\'" + Penalty + Undo', /^✓ Save · .+ \d+' Penalty Undo/.test(await p.evaluate(() => document.querySelector('#app-undo .undo').innerText.replace(/\s+/g, ' ').trim())));
  await h.shot('save-toast-penalty-390-dark.png');
  const pBefore = (await h.events()).filter(e => e.type === 'penaltySave').length;
  await h.rapid('#app-undo [data-act="again"]', 2); await sleep(700);
  const evs7 = await h.events();
  check('Penalty save: Save · Red → "Penalty" = 2 taps; the save becomes a penaltySave (double-tapped Penalty: still one event)', evs7.filter(e => e.type === 'penaltySave').length === pBefore + 1 && evs7.filter(e => e.type === 'save' && e.playerId === gk7('red')).length === 0 && evs7.filter(e => e.playerId === gk7('red')).length === 1);
  check('nothing opened behind the toast by the second tap', (await h.sheets()) === 0);
  await p.evaluate(() => UI.undoBar.hide()); await sleep(1300);
  await taps('Goal', ['.cn-goal[data-team="green"]', `.sheet [data-tap="scorer"][data-pid="${G1}"]`, '.sheet .cn-noassist'], 'goal');
  // Wrong team
  await h.tap('.cn-act[data-kind="block"][data-team="green"]');
  check('Block · Green has "Wrong team? Block · Red ›"', (await h.text('.sheet [data-tap="wrong"]')) === 'Wrong team? Block · Red ›' && !(await p.$('.sheet [data-seg="team"]')));
  await h.shot('block-sheet-team-390-dark.png');
  await h.tap('.sheet [data-tap="wrong"][data-team="red"]', 500);
  check('Wrong team → "Block · Red" in one tap, one sheet', (await h.text('.sheet .sheet-title')) === 'Block · Red' && (await h.sheets()) === 1);
  await h.tap(`.sheet [data-tap="pick"][data-pid="${R1}"]`, 600);
  check('…and the block is logged for the Red player', (await h.events()).some(e => e.type === 'block' && e.playerId === R1));
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();
  // two keepers listed on a side (big poles, no keepers chosen: every GK-listed player keeps goal) → 2-tile picker
  const d8 = liveData({ format: { start: 'big' }, timer: running(20) });
  const gks = Object.keys(d8.sessions[SID].teams.green.players).filter(k => d8.sessions[SID].teams.green.players[k].position === 'GK');
  s = await H.open({ width: 390, referee: 'referee', route: '#/ref.console', data: d8 });
  h = helpers(s); p = h.p; await s.freeze(); await sleep(1100);
  await h.rapid('.cn-save[data-team="green"]', 2); await sleep(500);
  check(`two keepers on Green (${gks.length}) → Save opens a 2-tile picker (double tap: one sheet, nothing logged)`, gks.length === 2 && (await h.sheets()) === 1 && (await p.$$eval('.sheet [data-tap="keeper"]', a => a.length)) === 2 && !(await h.events()).some(e => e.type === 'save'));
  await h.shot('save-picker-2-keepers-390-dark.png');
  await h.tap(`.sheet [data-tap="keeper"][data-pid="${gks[1]}"]`, 600);
  check('picker: tap a keeper → 1 save', (await h.events()).filter(e => e.type === 'save' && e.playerId === gks[1]).length === 1);
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();

  // ======================================================================== 7b. lineup: "+ From Red" adds a usual Red to Green
  note('Lineup: "+ From Red" adds a usual-Red player to Green tonight');
  s = await H.open({ width: 390, referee: 'referee', route: '#/ref.setup' });
  h = helpers(s); p = h.p; await s.freeze(); await sleep(400);
  check('"+ From Red" sits at the top, team-tinted, beside "+ New person" and the search', (await h.text('.su-acts')) === '+ From Red+ New person' && (await p.$eval('.su-from', e => e.classList.contains('t-red'))) && !!(await p.$('.su-acts .su-find')));
  await h.tap('[data-tap="from"]', 500);
  const red1 = await p.$eval('.sh-setup-from [data-tap="tick"]', e => e.dataset.pid);
  const usual1 = await p.evaluate(id => Store.player(id).defaultTeam, red1);
  await h.tap(`.sh-setup-from [data-tap="tick"][data-pid="${red1}"]`, 300);
  await h.shot('setup-from-red-390-dark.png');
  await h.tap('.sh-setup-from [data-tap="done"]', 300);
  const draftNow = await p.evaluate(() => JSON.parse(localStorage.getItem('befit_setup_draft')));
  check('the usual Red is ticked for Green tonight (draft + Green list "usually Red", tab "1 of 10")', usual1 === 'red' && draftNow.picks[red1].team === 'green' && (await p.$eval(`.scr-ref-setup [data-tap="tick"][data-pid="${red1}"]`, e => e.classList.contains('on') && /usually Red/.test(e.textContent))) && (await h.text('[data-seg="side"] > button[data-value="green"] .n')) === '1 of 10');
  await h.tap('[data-seg="side"] > button[data-value="red"]', 200);
  check('…and on the Red tab he reads "on Green tonight" (tap would move him back)', /on Green tonight/.test(await h.text(`.scr-ref-setup [data-tap="tick"][data-pid="${red1}"] .meta`)));
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();

  // ======================================================================== 8. 25 Oct · the poles switch + the keeper picker
  note('Poles switch: an obvious "Switch to big poles ›" on small poles, a status card after; known keepers first, then "Other ›"');
  const d9 = liveData({ format: { start: 'small' }, timer: running(30) });
  const t9 = d9.sessions[SID].teams;
  const nm9 = pid => H.snapshot().players[pid].name;
  const gkOf = t => Object.keys(t9[t].players).filter(k => t9[t].players[k].position === 'GK');
  // a usual keeper playing for the other side tonight: move Red's second keeper to Green
  const movedGK = gkOf('red').find(k => k !== gkOf('red')[0]);
  t9.green.players[movedGK] = t9.red.players[movedGK]; delete t9.red.players[movedGK];
  s = await H.open({ width: 390, referee: 'referee', route: '#/ref.console', data: d9 });
  h = helpers(s); p = h.p; await s.freeze(); await sleep(1100);
  const pb = await p.evaluate(() => { const b = document.querySelector('.cn-poles'); const r = b.getBoundingClientRect(); const g = document.querySelector('.cn-grid').getBoundingClientRect();
    return { pt: b.querySelector('.cn-pt').textContent, ps: b.querySelector('.cn-ps').textContent, h: Math.round(r.height), w: Math.round(r.width), bottom: r.bottom, vh: innerHeight, aboveGrid: r.bottom <= g.top, bg: getComputedStyle(b).backgroundColor, warn: getComputedStyle(document.documentElement).getPropertyValue('--warnfill').trim() }; });
  check('small poles: "Switch to big poles ›" / "Now: small poles · no keepers", full width, ≥ 56 px, just above the controls grid, visible without scrolling at 390', pb.pt === 'Switch to big poles ›' && pb.ps === 'Now: small poles · no keepers' && pb.h >= 56 && pb.w >= 350 && pb.aboveGrid && pb.bottom <= pb.vh, pb);
  check('…not amber (amber means stoppage)', !/255, 159, 67|rgb\(255, 166, 84\)/.test(pb.bg), pb.bg);
  check('the grid keeps 5 tiles, no "Poles:" tile', (await p.$$eval('.cn-grid > *', a => a.map(x => x.textContent.trim()).join(' | '))) === 'Half time | Adjust clock | + Player | Teams tonight | Edit events');
  await h.shot('poles-small-390-dark.png');
  await h.tap('.cn-poles', 500);
  const k1 = await p.evaluate(() => [...document.querySelectorAll('.sh-setup-poles .su-k')].map(c => [...c.querySelectorAll('[data-tap]')].map(b => b.dataset.tap === 'kother' ? 'Other' : b.dataset.pid)));
  const appsOf = pid => p.evaluate(id => (Scoring.seasonStats(id) || {}).apps || 0, pid);
  const greenKnown = gkOf('green');   // includes the usual Red keeper moved to Green tonight
  const greenSorted = []; for (const k of greenKnown) greenSorted.push([k, await appsOf(k)]);
  greenSorted.sort((a, b) => b[1] - a[1] || nm9(a[0]).localeCompare(nm9(b[0])));
  check('Green: the known keepers on Green tonight (incl. the usual Red keeper playing Green), most apps first, then "Other ›"', JSON.stringify(k1[0]) === JSON.stringify(greenSorted.map(x => x[0]).concat('Other')), { got: k1[0].map(x => x === 'Other' ? x : nm9(x)), want: greenSorted.map(x => nm9(x[0]) + ' ' + x[1]) });
  check('…and he is NOT offered on Red (only the side he plays for tonight)', !k1[1].includes(movedGK) && k1[1].every(x => x === 'Other' || t9.red.players[x]), k1[1].map(x => x === 'Other' ? x : nm9(x)));
  await h.shot('poles-sheet-390-dark.png');
  await h.tap('.sh-setup-poles [data-tap="kother"][data-team="green"]', 500);
  const otherList = await p.$$eval('.sh-setup-kother [data-tap="kpick"]', a => a.map(x => x.dataset.pid));
  check('"Other ›" lists tonight\'s Green players only (the roster, not the club), with "+ Someone not here yet"', otherList.length === Object.keys(t9.green.players).length && otherList.every(x => t9.green.players[x]) && (await h.text('.sh-setup-kother [data-tap="ksome"]')) === '+ Someone not here yet', otherList.length);
  await h.shot('poles-other-list-390-dark.png');
  const mid = Object.keys(t9.green.players).find(k => t9.green.players[k].position === 'MID');
  check(`before the switch, ${nm9(mid)} (MID) plays as MID`, (await p.evaluate((sid, id) => Scoring.playsAs(Store.session(sid), id), SID, mid)) === 'MID');
  await h.tap(`.sh-setup-kother [data-tap="kpick"][data-pid="${mid}"]`, 400);
  check('picked via Other: he shows first on Green, selected, "MID · in goal"', (await p.$eval('.sh-setup-poles .su-k [data-tap="keeper"]', e => e.dataset.pid + '|' + e.classList.contains('sel') + '|' + e.querySelector('.pos').textContent)) === `${mid}|true|MID · in goal`);
  const swm = await p.evaluate(sid => Clock.minute(Store.session(sid)), SID);
  // Red's usual keeper tonight is pre-selected (he is GK on the team sheet); tap only if not
  if (!(await p.$(`.sh-setup-poles [data-tap="keeper"][data-pid="${gkOf('red')[0]}"].sel`))) await h.tap(`.sh-setup-poles [data-tap="keeper"][data-pid="${gkOf('red')[0]}"]`, 250);
  await h.tap('.sh-setup-poles [data-tap="switch"]', 900);
  const f9 = await p.evaluate(sid => Store.session(sid).format, SID);
  check('switch writes format.switchedAt + format.keepers; he is GK on the team sheet', f9.switchedAt === swm && f9.keepers.green === mid && f9.keepers.red === gkOf('red')[0] && (await p.evaluate((sid, id) => Store.session(sid).teams.green.players[id].position, SID, mid)) === 'GK', f9);
  check(`after the switch, ${nm9(mid)} scores as GK`, (await p.evaluate((sid, id) => [Scoring.playsAs(Store.session(sid), id), Scoring.matchPoints(Store.session(sid), id).pos].join(), SID, mid)) === 'GK,GK');
  await h.barGone();
  check(`status card: "Big poles since ${swm}' · ${nm9(mid)} · ${nm9(gkOf('red')[0])}" / "Tap to change keepers"`, (await h.text('.cn-poles .cn-pt')) === `Big poles since ${swm}' · ${nm9(mid)} · ${nm9(gkOf('red')[0])}` && (await h.text('.cn-poles .cn-ps')) === 'Tap to change keepers' && !!(await p.$('.cn-poles.is-big')), await h.text('.cn-poles'));
  await h.shot('poles-after-switch-390-dark.png');
  await h.tap('.cn-poles', 500);
  check('the status card opens the keepers sheet ("Keepers")', (await h.text('.sh-setup-poles .sheet-title')) === 'Keepers');
  await h.esc();
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();
  // a match that started on big poles
  const d10 = liveData({ format: { start: 'big', keepers: {} }, timer: running(10) });
  const t10 = d10.sessions[SID].teams;
  d10.sessions[SID].format.keepers = { green: Object.keys(t10.green.players).find(k => t10.green.players[k].position === 'GK'), red: Object.keys(t10.red.players).find(k => t10.red.players[k].position === 'GK') };
  s = await H.open({ width: 390, referee: 'referee', route: '#/ref.console', data: d10 });
  h = helpers(s); p = h.p; await s.freeze(); await sleep(900);
  const kk = d10.sessions[SID].format.keepers;
  check('started on big poles: "Big poles from kick-off · <keepers>"', (await h.text('.cn-poles .cn-pt')) === `Big poles from kick-off · ${nm9(kk.green)} · ${nm9(kk.red)}`, await h.text('.cn-poles .cn-pt'));
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();
  // the lineup on big poles: a side with no known keeper tonight → "Other ›" is the main choice
  s = await H.open({ width: 390, referee: 'referee', route: '#/ref.setup' });
  h = helpers(s); p = h.p; await s.freeze(); await sleep(400);
  const gkRow = await p.$$eval('.scr-ref-setup .su-sq', a => { const r = a.find(x => /^GK/.test(x.querySelector('.meta').textContent)); return r ? r.querySelector('.meta').textContent : null; });
  check('lineup on small poles: a usual keeper reads "GK · plays outfield on small poles"', /^GK · plays outfield on small poles/.test(gkRow || ''), gkRow);
  const nonGk = await p.$$eval('.scr-ref-setup .su-sq', a => a.filter(x => !/^GK/.test(x.querySelector('.meta').textContent)).slice(0, 2).map(x => x.dataset.pid));
  for (const id of nonGk) await h.tap(`.scr-ref-setup [data-tap="tick"][data-pid="${id}"]`, 150);
  await h.tap('[data-seg="poles"] > button[data-value="big"]', 300);
  check('big poles, no usual keeper ticked for Green: "Other ›" is the main choice, "Pick tonight\'s keeper"', /Other ›\s*Pick tonight’s keeper/.test(await p.$eval('.scr-ref-setup [data-tap="kother"][data-team="green"]', e => e.innerText)) && !!(await p.$('.scr-ref-setup .su-kother.is-main[data-team="green"]')));
  await h.tap('.scr-ref-setup [data-tap="kother"][data-team="green"]', 500);
  check('…its list = the 2 ticked for Green tonight', JSON.stringify((await p.$$eval('.sh-setup-kother [data-tap="kpick"]', a => a.map(x => x.dataset.pid))).sort()) === JSON.stringify(nonGk.slice().sort()));
  await h.tap(`.sh-setup-kother [data-tap="kpick"][data-pid="${nonGk[0]}"]`, 400);
  check('…picking one makes him Green\'s keeper in the lineup (team sheet "GK · in goal")', /GK · in goal/.test(await h.text(`.su-tsr[data-pid="${nonGk[0]}"]`) || '') || (await p.evaluate(id => JSON.parse(localStorage.getItem('befit_setup_draft')).keepers.green === id, nonGk[0])));
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();

  // ======================================================================== 6. screens: light console option, laptop
  note('390 light (console = app) and 1280 dark');
  for (const v of [{ width: 390, theme: 'light', consoleTheme: 'app', tag: '390-light-app' }, { width: 1280, theme: 'dark', tag: '1280-dark' }, { width: 1280, theme: 'light', consoleTheme: 'app', tag: '1280-light-app' }]) {
    const dd = liveData({ format: { start: 'small' }, timer: Object.assign(running(50), { status: 'stoppage', stoppageStartedAt: NOW - 5 * 60000, stoppageBaseTotalMs: 45 * 60000 }) });
    dd.sessions[SID].timer.startedAt = NOW - 50 * 60000;
    s = await H.open(Object.assign({ referee: 'referee', route: '#/ref.console', data: dd }, v));
    h = helpers(s); p = h.p; await s.freeze(); await sleep(1100);
    const m = await p.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      w: Math.round(document.querySelector('#app-screen section').getBoundingClientRect().width),
      hscroll: document.documentElement.scrollWidth > window.innerWidth,
      goal: Array.from(document.querySelectorAll('.cn-goal')).map(e => Math.round(e.getBoundingClientRect().height)),
      act: Array.from(document.querySelectorAll('.cn-act')).map(e => Math.round(e.getBoundingClientRect().height)),
      card: Array.from(document.querySelectorAll('.cn-card')).map(e => Math.round(e.getBoundingClientRect().height)),
      ctl: Array.from(document.querySelectorAll('.cn-ctile')).map(e => Math.round(e.getBoundingClientRect().height)),
      end: Math.round(document.querySelector('.cn-endw .hold').getBoundingClientRect().height),
      fold: Array.from(document.querySelectorAll('.cn-col [data-tap]')).every(e => e.getBoundingClientRect().bottom <= window.innerHeight),
      small: Array.from(document.querySelectorAll('#app-screen button, #app-header button')).filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 47.5 || r.width < 47.5); }).map(e => e.textContent.trim().slice(0, 20)),
    }));
    check(`[${v.tag}] theme ${v.consoleTheme === 'app' ? v.theme : 'dark'}, Goal 88 · Block/Clear 60 · Yellow/Red 60 · controls 52 · end 56, targets ≥ 48, no sideways scroll, every action tile above the fold`,
      m.theme === (v.consoleTheme === 'app' ? v.theme : 'dark') && m.goal.every(x => x === 88) && m.act.length === 4 && m.act.every(x => x === 60) && m.card.length === 4 && m.card.every(x => x === 60) && m.fold && m.ctl.every(x => x === 52) && m.end === 56 && !m.small.length && !m.hscroll, m);
    if (v.width >= 960) check(`[${v.tag}] the console stays phone-width`, m.w <= 480, m.w);
    await h.shot(`deck-stoppage-escalated-${v.tag}.png`);
    await s.close();
  }
}
function Store_name(d, pid) { return (d && H.snapshot().players[pid] || {}).name || ''; }
function Scoringish(ev) { return ev.stoppageMin != null ? `${ev.stoppageBaseMin}+${ev.stoppageMin}'` : `${ev.min}'`; }

main().then(() => {
  lines.push(`\n${fails ? fails + ' FAILED' : 'ALL PASSED'}`);
  fs.writeFileSync(path.join(H.out(__dirname), 'deck-result.txt'), lines.join('\n'));
  console.log(`\n${fails ? fails + ' FAILED' : 'ALL PASSED'}`);
  process.exit(fails ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
