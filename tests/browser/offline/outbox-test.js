// Offline outbox: log a match with no signal, reload, come back online, forced refusals, double taps.
// TEST MODE ONLY (harness: in-memory "server", Firebase blocked).  Run: node outbox-test.js
const fs = require('fs');
const path = require('path');
const H = require('../harness.js');
const { liveData } = require('../console/data.js');
const OUT = H.out(__dirname);
const SID = 'test_live';
const OUTBOX_KEY = 'befit_outbox_v1_test';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const check = (label, ok, extra) => {
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
};
const note = t => console.log('\n# ' + t);

(async () => {
  const s = await H.open({ width: 390, referee: true, route: '#/ref.console', data: liveData(), status: 'offline', latency: 80 });
  const p = s.page;

  // ---------------- helpers
  const events = () => p.evaluate(sid => Object.entries((Store.session(sid) || {}).events || {}).map(([id, v]) => Object.assign({ id }, v)), SID);
  const pid = name => p.evaluate((sid, n) => Scoring.sessPlayers(Store.session(sid)).find(x => x.name === n).pid, SID, name);
  const adv = min => p.evaluate(ms => { window.__BEFIT_TEST__.now += ms; }, min * 60000);
  const allPts = () => p.evaluate(sid => { const se = Store.session(sid); const o = {}; Scoring.sessPlayers(se).forEach(x => { o[x.name] = Scoring.matchPoints(se, x.pid).total; }); return o; }, SID);
  const score = () => p.evaluate(sid => { const se = Store.session(sid); return ['green', 'red'].map(t => Scoring.teamGoals(se, t)).join('-'); }, SID);
  const shownScore = () => p.evaluate(() => Array.from(document.querySelectorAll('.cn-score .sb .sb-half .hn')).map(e => e.textContent).join('-'));
  const st = () => p.evaluate(() => Store.status());
  const bar = () => p.evaluate(() => { const b = document.querySelector('#app-undo .undo'); return b ? { cls: b.className, text: b.innerText.replace(/\s+/g, ' ').trim() } : null; });
  const syncChip = () => p.evaluate(() => ((document.querySelector('#app-header .sync') || {}).textContent || '').trim());
  const statusBar = () => p.evaluate(() => document.querySelector('#app-status').textContent.replace(/\s+/g, ' ').trim());
  const sheets = () => p.evaluate(() => document.querySelectorAll('#app-layer .sheet').length);
  const received = () => p.evaluate(() => Store.test.received.map(r => r.updates));
  const stored = () => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), OUTBOX_KEY);
  const tap = async (sel, wait = 420) => { await p.waitForSelector(sel, { visible: true, timeout: 4000 }); await p.click(sel); await sleep(wait); };
  const rapid = async (sel, n = 2) => {
    const el = await p.waitForSelector(sel, { visible: true, timeout: 4000 }); const b = await el.boundingBox();
    for (let i = 0; i < n; i++) await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  };
  const waitFor = (fn, arg, ms = 8000) => p.waitForFunction(fn, { timeout: ms }, arg).then(() => true, () => false);
  const waitBarGone = () => p.waitForFunction(() => !document.querySelector('#app-undo .undo'), { timeout: 9000 }).catch(() => {});
  const evOf = (list, type, who) => list.filter(e => e.type === type && (e.playerId === who || e.scorerId === who));
  const P = {};
  for (const n of ['Harry', 'Theophilus', 'Emmanuel', 'Keith', 'Joshua', 'Dennis', 'Doku', 'Reuel', 'Solomon', 'Barnabas']) P[n] = await pid(n);

  // =================================================================== 1. a match with no signal
  note('1 · Log 6 events offline (2 goals with assists, 2 blocks, a card, a clearance) + an Undo');
  check('starts offline, nothing waiting', (await st()).status === 'offline' && (await st()).pending === 0);
  check('outbox is durable (localStorage)', await p.evaluate(() => Store.link().durable === true));
  await rapid('[data-tap="ctl"][data-act="kick"]', 2); await sleep(500);
  check('Kick off (double tapped) offline → running, 1 write waiting', (await p.evaluate(sid => (Store.session(sid).timer || {}).status, SID)) === 'running' && (await st()).pending === 1, await st());

  await adv(3);
  await tap('.cn-goal[data-team="green"]');
  await tap(`.sheet [data-tap="scorer"][data-pid="${P.Harry}"]`);
  await tap(`.sheet [data-tap="assist"][data-pid="${P.Theophilus}"]`, 600);
  const b1 = await bar();
  check('goal offline → Saved + Undo bar (not "Not saved"), sheet closed', b1 && !/err/.test(b1.cls) && /Goal · Harry/.test(b1.text) && /Undo/.test(b1.text) && (await sheets()) === 0, b1);
  await s.shot(path.join(OUT, 'offline-goal-saved-390.png'));

  await adv(4);
  await tap('.cn-goal[data-team="red"]');
  await tap(`.sheet [data-tap="scorer"][data-pid="${P.Emmanuel}"]`);
  await tap(`.sheet [data-tap="assist"][data-pid="${P.Keith}"]`, 600);

  await adv(2);
  await tap('.cn-act[data-kind="block"][data-team="green"]');
  await tap(`.sheet [data-tap="pick"][data-pid="${P.Joshua}"]`, 600);
  await waitBarGone();

  await adv(1);
  await tap('.cn-act[data-kind="block"][data-team="red"]');
  await tap(`.sheet [data-tap="pick"][data-pid="${P.Solomon}"]`, 600);
  const undoneId = evOf(await events(), 'block', P.Solomon)[0] && evOf(await events(), 'block', P.Solomon)[0].id;
  await tap('#app-undo [data-act="undo"]', 600);
  check('Undo of an unsent block (offline) → gone, "Removed"', evOf(await events(), 'block', P.Solomon).length === 0 && /Removed/.test(((await bar()) || {}).text || ''));
  await waitBarGone();

  await adv(2);
  await tap('.cn-card[data-ctype="yellowCard"][data-team="green"]');
  await tap(`.sheet [data-tap="pick"][data-pid="${P.Reuel}"]`, 600);

  await adv(1);
  await tap('.cn-act[data-kind="clearance"][data-team="green"]');
  await tap(`.sheet [data-tap="pick"][data-pid="${P.Doku}"]`, 600);
  await waitBarGone();

  const evA = await events();
  const ptsA = await allPts();
  const writesA = await p.evaluate(() => Store.test.writes.map(w => w.updates));
  const obA = await p.evaluate(() => Store.outbox());
  check('5 events on the phone (6 logged, 1 undone)', evA.length === 5, evA.map(e => e.type));
  check('8 writes waiting: kick off + 6 logs + 1 undo', (await st()).pending === 8 && obA.length === 8 && writesA.length === 8, { pending: (await st()).pending, writes: writesA.length });
  check('nothing reached the "server"', (await received()).length === 0 && !(await p.evaluate(sid => (Store.test.server.sessions[sid] || {}).events, SID)));
  check('outbox saved on the phone (localStorage), same 8 in order', JSON.stringify((await stored() || []).map(e => e.id)) === JSON.stringify(obA.map(e => e.id)));
  check('offline (round 5): no status bar on the console; the sync chip says 8 are on the phone', (await statusBar()) === '' && /8 (waiting|saved on phone)/.test(await syncChip()), [await statusBar(), await syncChip()]);
  check('score 1-1 via Scoring and on screen', (await score()) === '1-1' && (await shownScore()) === '1-1', [await score(), await shownScore()]);
  check('points via Scoring: Harry 6, Theophilus 5, Emmanuel 7, Keith 5, Reuel 1', ptsA.Harry === 6 && ptsA.Theophilus === 5 && ptsA.Emmanuel === 7 && ptsA.Keith === 5 && ptsA.Reuel === 1,
    { Harry: ptsA.Harry, Theophilus: ptsA.Theophilus, Emmanuel: ptsA.Emmanuel, Keith: ptsA.Keith, Reuel: ptsA.Reuel, Joshua: ptsA.Joshua, Doku: ptsA.Doku });
  await s.shot(path.join(OUT, 'offline-8-waiting-390.png'));

  // =================================================================== 2. close / refresh with no signal
  note('2 · Reload the page (same phone storage, still offline)');
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.Store && Store.test && Store.test.active && document.querySelector('#app-screen section'), { timeout: 20000 });
  await sleep(500);
  const evB = await events();
  const ptsB = await allPts();
  const sortJ = list => JSON.stringify(list.slice().sort((a, b) => a.id < b.id ? -1 : 1));
  check('after reload: still offline, "server" is the old data (no events for this match)', (await st()).status === 'offline' && !(await p.evaluate(sid => (Store.test.server.sessions[sid] || {}).events, SID)));
  check('after reload: all 5 events still shown, identical', sortJ(evB) === sortJ(evA), evB.length);
  check('after reload: the undone block stays gone', !evB.some(e => e.id === undoneId));
  check('after reload: pending = 8, same entries in the same order', (await st()).pending === 8 && JSON.stringify((await p.evaluate(() => Store.outbox())).map(e => e.id)) === JSON.stringify(obA.map(e => e.id)));
  check('after reload: timer still running (kick off kept)', (await p.evaluate(sid => (Store.session(sid).timer || {}).status, SID)) === 'running');
  check('after reload: score 1-1 via Scoring and on screen', (await score()) === '1-1' && (await shownScore()) === '1-1', [await score(), await shownScore()]);
  check('after reload: every player\'s points identical via Scoring', JSON.stringify(ptsB) === JSON.stringify(ptsA));
  check('after reload (round 5): no status bar; sync chip still says 8 on the phone', (await statusBar()) === '' && /8 (waiting|saved on phone)/.test(await syncChip()), [await statusBar(), await syncChip()]);
  await s.shot(path.join(OUT, 'offline-after-reload-390.png'));

  // =================================================================== 3. signal comes back
  note('3 · Go online: everything reaches the "server" once, in order');
  await p.evaluate(() => Store.test.setStatus('online'));
  const drained = await waitFor(() => Store.status().pending === 0, null, 8000);
  const rcv = await received();
  check('outbox empties', drained && (await st()).pending === 0 && (await p.evaluate(() => Store.outbox().length)) === 0);
  check('phone storage outbox is empty', JSON.stringify(await stored()) === '[]');
  check('server received exactly 8 writes', rcv.length === 8, rcv.length);
  check('…exactly the 8 writes made, in the order made (each once)', JSON.stringify(rcv) === JSON.stringify(writesA));
  const srvEv = await p.evaluate(sid => Store.test.server.sessions[sid].events, SID);
  check('server events = the 5 on the phone (undone block absent)', sortJ(Object.entries(srvEv).map(([id, v]) => Object.assign({ id }, v))) === sortJ(evA) && !srvEv[undoneId]);
  check('server timer running', await p.evaluate(sid => Store.test.server.sessions[sid].timer.status === 'running', SID));
  check('phone and server agree on the whole session', await p.evaluate(sid => JSON.stringify(Store.session(sid)) === JSON.stringify(Store.test.server.sessions[sid]), SID));
  check('points unchanged after sending', JSON.stringify(await allPts()) === JSON.stringify(ptsA));
  check('bar gone once online', (await statusBar()) === '', await statusBar());

  // =================================================================== 4. the database refuses a save
  note('4 · Forced refusal: kept, error shown, Retry sends it');
  await p.evaluate(() => { Store.test.setHoldMs(60000); Store.test.rejectNext(1); });
  let r0 = (await received()).length;
  await adv(1);
  await tap('.cn-act[data-kind="block"][data-team="red"]');
  await tap(`.sheet [data-tap="pick"][data-pid="${P.Solomon}"]`, 400);
  await waitFor(() => Store.status().failed > 0, null, 3000);
  let s4 = await st();
  check('refused: entry kept, status failed 1 / error denied', s4.pending === 1 && s4.failed === 1 && s4.error === 'denied' && (await received()).length === r0, s4);
  check('refused: the block still shows on the phone', evOf(await events(), 'block', P.Solomon).length === 1);
  check('refused: bar "Not sent (1) · sign in again" + Retry', /Not sent \(1\) · sign in again/.test(await statusBar()) && !!(await p.$('#app-status [data-offline-retry]')), await statusBar());
  await s.shot(path.join(OUT, 'refused-not-sent-390.png'));
  // a second log while held waits behind it (strict order)
  await waitBarGone();
  await tap('.cn-act[data-kind="clearance"][data-team="red"]');
  await tap(`.sheet [data-tap="pick"][data-pid="${P.Barnabas}"]`, 500);
  check('held: next save waits behind it (pending 2, nothing sent)', (await st()).pending === 2 && (await st()).failed === 2 && (await received()).length === r0, await st());
  const heldOrder = await p.evaluate(() => Store.outbox().map(e => e.paths[0]));
  await p.click('#app-status [data-offline-retry]');
  await waitFor(() => Store.status().pending === 0, null, 4000);
  const rcv4 = (await received()).slice(r0);
  check('Retry: both sent, in order, once each; error cleared', rcv4.length === 2 && JSON.stringify(rcv4.map(u => Object.keys(u)[0])) === JSON.stringify(heldOrder) && (await st()).failed === 0 && (await st()).error === null, rcv4.map(u => Object.keys(u)[0]));
  await sleep(1700);
  check('bar clears after Retry', (await statusBar()) === '', await statusBar());

  note('4b · Refused, then sent by the timed retry (no tap)');
  await waitBarGone();
  r0 = (await received()).length;
  await p.evaluate(() => { Store.test.setHoldMs(2500); Store.test.rejectNext(1); window.__k4 = Store.newKey(); Store.set('sessions/test_live/events/' + __k4, { type: 'block', playerId: 'x', timestamp: 1, min: 20 }); });
  await waitFor(() => Store.status().failed === 1, null, 3000);
  check('held after refusal', (await st()).failed === 1 && (await received()).length === r0);
  const auto = await waitFor(() => Store.status().pending === 0, null, 6000);
  check('timed retry sends it (exactly once)', auto && (await received()).length === r0 + 1);

  note('4c · Refused, then sent when the login changes');
  r0 = (await received()).length;
  await p.evaluate(() => { Store.test.setHoldMs(60000); Store.test.rejectNext(1); Store.remove('sessions/test_live/events/' + __k4); });
  await waitFor(() => Store.status().failed === 1, null, 3000);
  check('held after refusal (long retry gap)', (await st()).failed === 1);
  await p.evaluate(() => Auth.signIn('', BF_CONFIG.ADMIN_PW));
  const viaLogin = await waitFor(() => Store.status().pending === 0, null, 3000);
  check('signing in again sends it at once', viaLogin && (await received()).length === r0 + 1 && !(await p.evaluate(() => Store.test.server.sessions.test_live.events[__k4])));

  note('4d · Network error (not a refusal) → retried with backoff, no error shown');
  r0 = (await received()).length;
  await p.evaluate(() => { Store.test.dropNext(1); Store.set('sessions/test_live/__probe', 1); });
  await sleep(300);
  check('network error: not marked failed', (await st()).failed === 0 && (await st()).pending === 1);
  const back = await waitFor(() => Store.status().pending === 0, null, 4000);
  check('sent after backoff, once', back && (await received()).length === r0 + 1);
  await p.evaluate(() => Store.remove('sessions/test_live/__probe'));
  await waitFor(() => Store.status().pending === 0, null, 3000);

  // =================================================================== 5. double taps
  note('5 · Double taps still give 1 event (offline and online)');
  await waitBarGone();
  for (const mode of ['offline', 'online']) {
    await p.evaluate(m => Store.test.setStatus(m), mode);
    const before = (await events()).length;
    const w0 = await p.evaluate(() => Store.test.writes.length);
    await adv(1);
    await tap('.cn-goal[data-team="green"]');
    await tap(`.sheet [data-tap="scorer"][data-pid="${P.Harry}"]`);
    await rapid(`.sheet [data-tap="assist"][data-pid="${P.Theophilus}"]`, 2); await sleep(700);
    check(`[${mode}] double tap on assist → exactly 1 goal, 1 write`, (await events()).length === before + 1 && (await p.evaluate(() => Store.test.writes.length)) === w0 + 1, [(await events()).length - before]);
    await waitBarGone();
    await tap('.cn-act[data-kind="block"][data-team="green"]');
    await rapid(`.sheet [data-tap="pick"][data-pid="${P.Joshua}"]`, 3); await sleep(700);
    check(`[${mode}] triple tap on a Block player → exactly 1 block, 1 write`, (await events()).length === before + 2 && (await p.evaluate(() => Store.test.writes.length)) === w0 + 2);
    await waitBarGone();
  }
  const btnWrites = await p.evaluate(async () => {
    const b = document.createElement('button'); document.body.appendChild(b);
    let n = 0;
    const run = () => Save.run({ label: 'x', button: b, bar: false, write: () => { n++; return Store.set('sessions/test_live/__dbl', n); } });
    run(); await new Promise(r => setTimeout(r, 180)); run();
    await new Promise(r => setTimeout(r, 400)); b.remove(); return n;
  });
  check('Save.run: double tap 180 ms apart on one button → 1 write (instant phone save still locks)', btnWrites === 1, btnWrites);
  await p.evaluate(() => Store.remove('sessions/test_live/__dbl'));
  await waitFor(() => Store.status().pending === 0, null, 3000);
  check('end: nothing waiting, phone = server', (await st()).pending === 0 && await p.evaluate(() => JSON.stringify(Store.state) === JSON.stringify(Store.test.server)));

  // =================================================================== 7. live updates while saves are unsent
  note('7 · Another phone\'s change arrives while ours is unsent: ours never flickers away');
  const r7 = await p.evaluate(async () => {
    const base = 'sessions/test_live/events/';
    Store.test.setStatus('offline');
    const mine = Store.newKey(), shared = Store.newKey(), theirs = Store.newKey();
    await Store.set(base + mine, { type: 'block', playerId: 'me', timestamp: 1, min: 30 });
    await Store.set(base + shared + '/min', 31);                       // we edit a minute…
    let flicker = false;
    const off = Store.on(() => { if (!Store.get(base + mine)) flicker = true; });
    Store.test.remoteChange({ [base + theirs]: { type: 'save', playerId: 'them', timestamp: 2, min: 30 }, [base + shared]: { type: 'block', playerId: 'x', timestamp: 3, min: 99 } });
    const during = { mine: !!Store.get(base + mine), theirs: !!Store.get(base + theirs), sharedMin: Store.get(base + shared + '/min') };
    Store.test.setStatus('online');
    await new Promise(r => { const t = setInterval(() => { if (!Store.status().pending) { clearInterval(t); r(); } }, 50); });
    off();
    const srv = Store.test.server.sessions.test_live.events;
    const after = { mine: !!srv[mine], theirs: !!srv[theirs], sharedMin: srv[shared].min, sharedType: srv[shared].type, same: JSON.stringify(Store.state) === JSON.stringify(Store.test.server) };
    [mine, shared, theirs].forEach(k => Store.remove(base + k));
    return { during, after, flicker };
  });
  check('live update arrives: their event shows, ours stays (no flicker), our unsent minute wins on the phone', r7.during.mine && r7.during.theirs && r7.during.sharedMin === 31 && !r7.flicker, r7.during);
  check('after sending: server has both events; same field → our later write wins (last writer wins)', r7.after.mine && r7.after.theirs && r7.after.sharedMin === 31 && r7.after.sharedType === 'block' && r7.after.same, r7.after);
  await waitFor(() => Store.status().pending === 0, null, 3000);
  check('no page errors', s.errors.filter(e => !/BLOCKED network/.test(e)).length === 0, s.errors);
  await s.close();

  // =================================================================== 6. practice mode never keeps an outbox on the phone
  note('6 · Practice mode keeps its outbox in memory only');
  const s2 = await H.open({ width: 390, referee: true, route: '#/ref.home', status: 'offline' });
  await s2.page.evaluateOnNewDocument(() => { window.__BEFIT_TEST__.practice = true; });
  await s2.page.reload({ waitUntil: 'networkidle0' });
  await s2.page.waitForFunction(() => window.Store && Store.test && Store.test.active, { timeout: 20000 });
  const pr = await s2.page.evaluate(async () => {
    await Store.set('players/__pr', { name: 'Practice' });
    return { durable: Store.link().durable, pending: Store.status().pending, keys: Object.keys(localStorage).filter(k => /outbox/.test(k)), shows: !!Store.player('__pr') };
  });
  check('practice: write shows and waits, nothing in localStorage', pr.durable === false && pr.pending === 1 && pr.keys.length === 0 && pr.shows, pr);
  await s2.close();

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
