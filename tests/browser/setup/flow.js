// Setup builder · end-to-end flows (TEST MODE ONLY, via ../harness.js; never the real database).
//   A new night with 13 people → new person with the duplicate check → kick off (small poles)
//   → 2 late arrivals at 23' → move Keith to Green at 27' → half time 45:00 → big poles from 46' (Toby, Mike)
//   → Scoring proof: saves / conceded / clean sheets before 46' don't count; a big-poles start counts everything.
//   Also: 9 + 1 per side, Not saved + Retry, Undo of the switch.
// Run (Git Bash): MSYS_NO_PATHCONV=1 node flow.js
const path = require('path');
const fs = require('fs');
const H = require('../harness.js');
const OUT = H.out(__dirname);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const log = [];
const check = (label, ok, extra) => { if (!ok) fails++; const line = (ok ? 'ok  ' : 'FAIL') + ' ' + label + (extra !== undefined ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''); log.push(line); console.log(line); };
const snap = H.snapshot();
const pidOf = name => Object.keys(snap.players).find(k => snap.players[k].name === name);
const KEITH = pidOf('Keith'), SHAMO = pidOf('Shamo'), TOBY = pidOf('Toby'), MIKE = pidOf('Mike'), FRANCIS = pidOf('Francis');
const HOLD = new Set([KEITH, SHAMO, TOBY, MIKE, pidOf('Bona'), pidOf('Joel')]);
const tap = async (p, sel, ms) => { await p.evaluate(sel => { const e = document.querySelector(sel); if (e) e.scrollIntoView({ block: "center" }); }, sel); await p.click(sel); await sleep(ms || 350); };
const screenId = p => p.evaluate(() => document.querySelector('#app-screen section')?.dataset.screen);

// round 6: tick the first n unticked rows of the open team's usual squad (not the held-back players)
const nextRow = p => p.$$eval('.scr-ref-setup [data-tap="tick"]:not(.on)', (els, hold) => (els.find(e => !hold.includes(e.dataset.pid)) || {}).dataset?.pid, [...HOLD]);
async function addFromChips(p, n) {
  for (let i = 0; i < n; i++) {
    const pid = await nextRow(p);
    await tap(p, `.scr-ref-setup [data-tap="tick"][data-pid="${pid}"]`, 150);
  }
}
// tabs read "Green · 7 of 10": the first number
const sideCount = (p, team) => p.$eval(`[data-seg="side"] [data-value="${team}"] .n`, e => Number((e.textContent.match(/\d+/) || [0])[0]));
async function noTruncation(p, label) {
  const bad = await p.evaluate(() => Array.from(document.querySelectorAll('.nm, .pt-name, .tb, .su-tb, .su-new, .mv2, .chip, .btn, .seg button, .tagm')).filter(e => e.offsetParent && (e.scrollWidth > e.clientWidth + 1) && getComputedStyle(e).overflowX !== 'auto').map(e => e.className + ':' + e.textContent.trim().slice(0, 30)));
  check(`${label}: no truncated text`, bad.length === 0, bad.slice(0, 5));
  const small = await p.evaluate(() => Array.from(document.querySelectorAll('.scr-ref-setup button, .sh-setup button')).filter(e => e.offsetParent && !e.disabled && e.getBoundingClientRect().height < 47.5 && !e.closest('.hd')).map(e => e.className + ':' + e.textContent.trim().slice(0, 20) + ':' + Math.round(e.getBoundingClientRect().height)));
  check(`${label}: tap targets >= 48 px`, small.length === 0, small.slice(0, 5));
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(`${label}: no sideways scroll`, !wide);
  const tiny = await p.evaluate(() => Array.from(document.querySelectorAll('.scr-ref-setup *, .sh-setup *')).filter(e => e.offsetParent && e.childNodes.length && Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.tagName + '.' + e.className));
  check(`${label}: 12 px type floor`, tiny.length === 0, tiny.slice(0, 5));
}

(async () => {
  const s = await H.open({ width: 390, theme: 'dark', referee: true, route: '#/ref.setup' });
  const p = s.page;
  check('opens Who’s here', await screenId(p) === 'ref.setup');
  check('console theme forced dark', await p.evaluate(() => document.documentElement.dataset.theme) === 'dark');

  // ---------------------------------------------------------------- 1 · a new night with 13 people
  await addFromChips(p, 7);                                   // Green
  await tap(p, '[data-seg="side"] [data-value="red"]');
  await addFromChips(p, 5);                                   // Red
  // one more for Red by search (the magnifier: the duplicate-check sheet; picking a name ticks him for Red)
  const viaSearchPid = await nextRow(p);
  const viaSearch = await p.evaluate(id => Store.player(id).name, viaSearchPid);
  await tap(p, '.scr-ref-setup [data-tap="find"][data-kind="find"]', 500);
  await p.type('.sh-setup-new [data-search="q"]', viaSearch.slice(0, 4));
  await sleep(250);
  const found = await p.$$eval('.sh-setup-new .rows .nm', els => els.map(e => e.textContent));
  check('search filters as you type', found.length >= 1 && found.some(n => n === viaSearch), found);
  await tap(p, `.sh-setup-new [data-tap="pick"][data-pid="${viaSearchPid}"]`, 400);
  check('picking a found name ticks him for the open side (Red) and closes the sheet', !(await p.$('.sh-setup-new')) && (await p.$eval(`.scr-ref-setup [data-tap="tick"][data-pid="${viaSearchPid}"]`, e => e.classList.contains('on'))));
  check('13 people: Green 7 · Red 6', (await sideCount(p, 'green')) === 7 && (await sideCount(p, 'red')) === 6, [await sideCount(p, 'green'), await sideCount(p, 'red')]);
  check('Kick off states the count', (await p.$eval('[data-tap="kickoff"]', e => e.textContent)) === 'Kick off · 13 players');
  await s.shot(path.join(OUT, 'whos-here-390-dark.png'));
  await p.evaluate(() => window.scrollTo(0, 0));

  // ---------------------------------------------------------------- 2 · a new person, with the duplicate check
  await tap(p, '[data-seg="side"] [data-value="green"]');
  await tap(p, '.scr-ref-setup [data-tap="find"][data-kind="new"]', 500);
  check('"+ New person" opens the duplicate-check sheet for Green', (await p.$eval('.sh-setup-new .sheet-title', e => e.textContent)) === 'New person · Green');
  await p.type('.sh-setup-new [data-search="q"]', 'Francis');
  await sleep(300);
  const dup = await p.$$eval('.sh-setup-new .rows .r', els => els.map(e => e.querySelector('.nm').textContent + ' | ' + e.querySelector('.meta').textContent));
  check('typing "Francis" shows Francis (8 apps) first', /^Francis \| DEF · usually Green · 8 apps$/.test(dup[0] || ''), dup[0]);
  check('…and the 3 "New francis guy" entries, grouped', dup.some(d => d === 'New francis guy | 3 entries with this name · 0 apps each'), dup);
  check('"Someone new" offers + Green (the open side)', (await p.$$eval('.sh-setup-new [data-tap="new"]', els => els.map(e => e.textContent))).join(',') === '+ Green');
  await s.shot(path.join(OUT, 'new-person-dupcheck-390-dark.png'));
  await p.click('.sh-setup-new [data-search="q"]', { clickCount: 3 });
  await p.keyboard.press('Backspace');
  await p.type('.sh-setup-new [data-search="q"]', 'kwabena');
  await sleep(250);
  check('an unknown name shows only "Someone new"', (await p.$$eval('.sh-setup-new .rows .r', els => els.length)) === 0);
  await tap(p, '.sh-setup-new [data-tap="new"][data-team="green"]', 600);
  const kw = await p.evaluate(() => Object.entries(Store.players()).find(([, v]) => v.name === 'Kwabena'));
  check('new person written by name only', !!kw && kw[1].defaultPosition === 'MID' && kw[1].defaultTeam === 'green' && kw[1].needsDetails === true && kw[1].createdBy && kw[1].createdAt, kw && kw[1]);
  check('new person is on Green tonight (14)', (await sideCount(p, 'green')) === 8);
  check('Undo bar after the new person', /Kwabena · new · Green/.test(await p.$eval('#app-undo', e => e.textContent)));
  await s.shot(path.join(OUT, 'whos-here-after-new-390-dark.png'));

  // ---------------------------------------------------------------- 3 · kick off (small poles)
  await tap(p, '[data-tap="kickoff"]', 700);
  const sid = await p.evaluate(() => Store.activeSessionId());
  const sess0 = await p.evaluate(id => Store.session(id), sid);
  check('kick off creates the session and opens the console', !!sid && await screenId(p) === 'ref.console');
  check('session like classic + format', sess0.status === 'active' && sess0.mode === 'live' && sess0.date === '2026-10-19' && sess0.format.start === 'small' && !sess0.events, { status: sess0.status, mode: sess0.mode, date: sess0.date, format: sess0.format });
  check('14 players in teams, positions set, no GK on small poles', Object.values(sess0.teams).reduce((n, t) => n + Object.keys(t.players).length, 0) === 14 &&
    Object.values(sess0.teams).every(t => Object.values(t.players).every(e => ['DEF', 'MID', 'FWD'].includes(e.position))));
  check('clock running from kick-off', sess0.timer && sess0.timer.status === 'running');

  // ---------------------------------------------------------------- 4 · 2 late arrivals at 23'
  await p.evaluate(id => Store.set(`sessions/${id}/timer/startedAt`, Store.now() - (22 * 60 + 10) * 1000), sid);  // 22:10 → 23'
  await sleep(150);
  await p.evaluate(id => App.action('setup.addArrival', { sid: id }), sid);
  await sleep(400);
  check('"Who’s arrived?" shows the minute', (await p.$eval('.sh-setup-arrival h4', e => e.textContent)).includes("23'"));
  const usualRows = await p.$$eval('.sh-setup-arrival .su-pr .nm', els => els.map(e => e.textContent));
  check('"Usually here, not on yet" lists regulars not playing', usualRows.length > 0 && usualRows.includes('Keith'), usualRows.slice(0, 6));
  await s.shot(path.join(OUT, 'arrivals-390-dark.png'));
  await p.evaluate(() => Store.test.failNext(1));
  await tap(p, `.sh-setup-arrival [data-tap="add"][data-pid="${KEITH}"][data-team="red"]`, 600);
  check('a failed write shows "Not saved" + Retry', /Not saved/.test(await p.$eval('#app-undo', e => e.textContent)) && !!(await p.$('#app-undo [data-act="retry"]')));
  await s.shot(path.join(OUT, 'arrivals-not-saved-390-dark.png'));
  await tap(p, '#app-undo [data-act="retry"]', 600);
  check('Retry saves Keith on Red at 23\'', await p.evaluate((id, k) => JSON.stringify(Store.get(`sessions/${id}/teams/red/players/${k}`)), sid, KEITH) === JSON.stringify({ arrived: { at: 23 }, position: 'FWD' }) ||
    await p.evaluate((id, k) => { const e = Store.get(`sessions/${id}/teams/red/players/${k}`); return e && e.position === 'FWD' && e.arrived.at === 23; }, sid, KEITH));
  check('Undo bar: "Keith · Red · 23\'"', /Keith · Red · 23'/.test(await p.$eval('#app-undo', e => e.textContent)));
  check('sheet stays open for the next arrival', !!(await p.$('.sh-setup-arrival')));
  await p.type('.sh-setup-arrival [data-search="q"]', 'sham');
  await sleep(250);
  await tap(p, `.sh-setup-arrival [data-tap="add"][data-pid="${SHAMO}"][data-team="green"]`, 600);
  check('Shamo on Green at 23\' (search, one tap)', await p.evaluate((id, k) => { const e = Store.get(`sessions/${id}/teams/green/players/${k}`); return !!e && e.arrived.at === 23; }, sid, SHAMO));
  await p.keyboard.press('Escape'); await sleep(200);

  // ---------------------------------------------------------------- 5 · move Keith to Green at 27'
  await p.evaluate(id => Store.set(`sessions/${id}/timer/startedAt`, Store.now() - (26 * 60 + 40) * 1000), sid);  // 26:40 → 27'
  await sleep(150);
  await p.evaluate(id => App.action('setup.teamsTonight', { sid: id }), sid);
  await sleep(300);
  await tap(p, '.sh-setup-teams [data-seg="tt"] [data-value="red"]');
  await tap(p, `.sh-setup-teams [data-tap="move"][data-pid="${KEITH}"][data-to="green"]`, 250);
  check("Green already has 9 outfield: first tap only warns", /Green has 9 outfield · tap again to add/.test(await p.$eval("#app-toast", e => e.textContent)) && !!(await p.evaluate((id, k) => Store.get(`sessions/${id}/teams/red/players/${k}`), sid, KEITH)));
  await tap(p, `.sh-setup-teams [data-tap="move"][data-pid="${KEITH}"][data-to="green"]`, 600);
  const kE = await p.evaluate((id, k) => ({ g: Store.get(`sessions/${id}/teams/green/players/${k}`), r: Store.get(`sessions/${id}/teams/red/players/${k}`) }), sid, KEITH);
  check('Keith moved to Green with "moved" marker', !kE.r && kE.g && kE.g.moved.from === 'red' && kE.g.moved.at === 27 && kE.g.position === 'FWD', kE);
  await tap(p, '.sh-setup-teams [data-seg="tt"] [data-value="green"]');
  check('Teams tonight shows "Moved 27\'"', (await p.$$eval('.sh-setup-teams .tagm', els => els.map(e => e.textContent))).includes("Moved 27'"));
  const tabs = await p.$$eval('.sh-setup-teams [data-seg="tt"] button', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check('one team per tab with counts', tabs.join(' | ') === 'Green · 10 | Red · 6', tabs);
  await s.shot(path.join(OUT, 'teams-tonight-390-dark.png'));
  await tap(p, '.sh-setup-teams [data-tap="done"]');

  // ---------------------------------------------------------------- 6 · events in the first half (as the console would log them)
  const ev = (type, min, extra) => Object.assign({ type, min, timestamp: 1 + min, by: 'test' }, extra);
  const greenIds = await p.evaluate(id => Object.keys(Store.get(`sessions/${id}/teams/green/players`)), sid);
  const redIds = await p.evaluate(id => Object.keys(Store.get(`sessions/${id}/teams/red/players`)), sid);
  const events = {
    e01: ev('goal', 9, { team: 'green', scorerId: greenIds[0] }),
    e02: ev('goal', 21, { team: 'red', scorerId: redIds[0] }),
    e03: ev('save', 30, { playerId: TOBY }),            // before the switch: must not count
    e04: ev('save', 31, { playerId: TOBY }),
    e05: ev('save', 32, { playerId: TOBY }),
    e06: ev('save', 33, { playerId: TOBY }),
    e07: ev('penaltySave', 34, { playerId: MIKE }),     // before: must not count
    e08: ev('goal', 38, { team: 'red', scorerId: redIds[1] }),
    e09: ev('goal', 44, { team: 'green', scorerId: greenIds[1] }),
  };
  await p.evaluate((id, evs) => Store.update(`sessions/${id}/events`, evs), sid, events);

  // ---------------------------------------------------------------- 7 · half time 45:00 → big poles from 46'
  await p.evaluate(id => {
    const now = Store.now();
    return Store.set(`sessions/${id}/timer`, { status: 'paused', startedAt: now - 50 * 60000, pausedAt: now - 5 * 60000, pausedTotal: 0, htLogged: true, pauseReason: 'halftime', stoppageTotal: 0 });
  }, sid);
  await sleep(150);
  check('clock shows half time at 45:00', await p.evaluate(id => Clock.phase(Store.session(id)) + ' ' + Clock.fmtClock(Clock.elapsedMs(Store.session(id))), sid) === 'Half time 45:00');
  await p.evaluate(id => App.action('setup.bigPoles', { sid: id }), sid);
  await sleep(350);
  check('sheet title "Big poles from 46\'"', (await p.$eval('.sh-setup-poles h4', e => e.textContent)) === "Big poles from 46'");
  check('subtitle "Score carries over: 2–2 · keepers count from 46\'"', (await p.$eval('.sh-setup-poles .sh-s', e => e.textContent)) === "Score carries over: 2–2 · keepers count from 46'");
  const gk = await p.$$eval('.sh-setup-poles .su-k', els => els.map(e => Array.from(e.querySelectorAll('.pt-name')).map(x => x.textContent)));
  check('keeper choices: Toby, Bona, + Someone | Mike, Joel, + Someone', JSON.stringify(gk) === JSON.stringify([['Toby', 'Bona', '+ Someone'], ['Mike', 'Joel', '+ Someone']]), gk);
  check('switch disabled until a keeper is picked', await p.$eval('.sh-setup-poles [data-tap="switch"]', e => e.disabled));
  await tap(p, `.sh-setup-poles [data-tap="keeper"][data-pid="${TOBY}"]`);
  await tap(p, `.sh-setup-poles [data-tap="keeper"][data-pid="${MIKE}"]`);
  await s.shot(path.join(OUT, 'big-poles-390-dark.png'));
  const before = await p.evaluate(id => JSON.stringify(Store.session(id)), sid);
  await tap(p, '.sh-setup-poles [data-tap="switch"]', 700);
  let sess = await p.evaluate(id => Store.session(id), sid);
  check('format.switchedAt = 46, keepers Toby + Mike', sess.format.start === 'small' && sess.format.switchedAt === 46 && sess.format.keepers.green === TOBY && sess.format.keepers.red === MIKE, sess.format);
  check('keepers added as GK this match', sess.teams.green.players[TOBY].position === 'GK' && sess.teams.red.players[MIKE].position === 'GK', [sess.teams.green.players[TOBY], sess.teams.red.players[MIKE]]);
  check('score carries over (2–2), events untouched', await p.evaluate(id => Scoring.result(Store.session(id)).teams.map(t => t.goals).join('–'), sid) === '2–2' && Object.keys(sess.events).length === 9);
  check('Undo bar "Big poles from 46\'"', /Big poles from 46'/.test(await p.$eval('#app-undo', e => e.textContent)));
  await s.shot(path.join(OUT, 'big-poles-saved-390-dark.png'));
  // Undo puts everything back exactly, then switch again
  await tap(p, '#app-undo [data-act="undo"]', 600);
  check('Undo restores the match exactly', await p.evaluate(id => JSON.stringify(Store.session(id)), sid) === before);
  await p.evaluate(id => App.action('setup.bigPoles', { sid: id }), sid);
  await sleep(300);
  await tap(p, `.sh-setup-poles [data-tap="keeper"][data-pid="${TOBY}"]`);
  await tap(p, `.sh-setup-poles [data-tap="keeper"][data-pid="${MIKE}"]`);
  await tap(p, '.sh-setup-poles [data-tap="switch"]', 700);

  // ---------------------------------------------------------------- 8 · second half: resume, keeper events after the switch
  await p.evaluate(id => Store.set(`sessions/${id}/timer`, Clock.resume(Store.session(id), Store.now())), sid);
  const ev2 = {
    e10: ev('save', 47, { playerId: TOBY }), e11: ev('save', 52, { playerId: TOBY }),
    e12: ev('save', 58, { playerId: TOBY }), e13: ev('save', 63, { playerId: TOBY }),
    e14: ev('save', 66, { playerId: MIKE }),
    e15: ev('goal', 70, { team: 'green', scorerId: greenIds[2] }),   // Mike concedes after 46'
    e16: ev('goal', 81, { team: 'green', scorerId: greenIds[0] }),
  };
  await p.evaluate((id, evs) => Store.update(`sessions/${id}/events`, evs), sid, ev2);
  sess = await p.evaluate(id => Store.session(id), sid);
  const proof = await p.evaluate((id, T, M) => {
    const s = Store.session(id);
    const tb = Scoring.matchPoints(s, T), mk = Scoring.matchPoints(s, M);
    return { toby: { total: tb.total, saves: tb.tally.saves, conceded: tb.tally.conceded, cs: tb.cleanSheet, rows: tb.breakdown.map(b => `${b.label} ${b.pts > 0 ? '+' : ''}${b.pts}`) },
      mike: { total: mk.total, saves: mk.tally.saves, pen: mk.tally.penSaves, conceded: mk.tally.conceded, cs: mk.cleanSheet, rows: mk.breakdown.map(b => `${b.label} ${b.pts > 0 ? '+' : ''}${b.pts}`) },
      score: Scoring.result(s).teams.map(t => t.goals).join('–'), stored: Scoring.storedFields(s) };
  }, sid, TOBY, MIKE);
  check('Toby: 4 saves from 46\' count, the 4 before do not', proof.toby.saves === 4, proof.toby);
  check('Toby: 0 conceded from 46\' (2 red goals before don\'t count) → clean sheet +8', proof.toby.conceded === 0 && proof.toby.cs === true && proof.toby.rows.includes("Clean sheet from 46' +8"));
  check('Toby total 2 + 1 + 8 = 11', proof.toby.total === 11, proof.toby.rows);
  check('Mike: 1 save from 46\', penalty save at 34\' does not count', proof.mike.saves === 1 && proof.mike.pen === 0, proof.mike);
  check('Mike: 2 conceded from 46\' (the 9\' and 44\' goals don\'t count), no clean sheet', proof.mike.conceded === 2 && proof.mike.cs === false);
  check('Mike total 2 + 0 − 0 = 2', proof.mike.total === 2, proof.mike.rows);
  check('final score 4–2 (goals before the switch still count)', proof.score === '4–2');
  check('stored clean sheets follow the rule (green yes, red no)', proof.stored.cleanSheets.green === true && proof.stored.cleanSheets.red === false, proof.stored);
  fs.writeFileSync(path.join(OUT, 'data-written.json'), JSON.stringify({ sid, session: sess, newPerson: kw, writes: await p.evaluate(() => Store.test.writes.map(w => ({ failed: w.failed, paths: Object.keys(w.updates) }))) }, null, 2));
  check('no console errors (390 dark flow)', s.errors.length === 0, s.errors);
  await s.close();

  // ---------------------------------------------------------------- 9 · a match started on big poles counts everything
  const s2 = await H.open({ width: 390, theme: 'dark', referee: true, route: '#/ref.setup' });
  const p2 = s2.page;
  await tap(p2, '[data-seg="poles"] [data-value="big"]');
  await addFromChips(p2, 4);
  await tap(p2, `[data-tap="keeper"][data-team="green"][data-pid="${TOBY}"]`);
  await tap(p2, '[data-seg="side"] [data-value="red"]');
  await addFromChips(p2, 4);
  await tap(p2, `[data-tap="keeper"][data-team="red"][data-pid="${MIKE}"]`);
  check('picking a keeper puts him on that side (Green 5 · Red 5)', (await sideCount(p2, 'green')) === 5 && (await sideCount(p2, 'red')) === 5);
  await s2.shot(path.join(OUT, 'whos-here-big-poles-390-dark.png'), { fullPage: true });
  await tap(p2, '[data-tap="kickoff"]', 700);
  const sid2 = await p2.evaluate(() => Store.activeSessionId());
  const s2sess = await p2.evaluate(id => Store.session(id), sid2);
  check('big-poles start: format {start:big, keepers}', s2sess.format.start === 'big' && s2sess.format.keepers.green === TOBY && s2sess.format.keepers.red === MIKE && s2sess.format.switchedAt === undefined, s2sess.format);
  check('keepers are GK, everyone else outfield', s2sess.teams.green.players[TOBY].position === 'GK' && s2sess.teams.red.players[MIKE].position === 'GK');
  const proof2 = await p2.evaluate((id, T) => {
    const evs = { a: { type: 'save', min: 3, playerId: T, timestamp: 1 }, b: { type: 'save', min: 10, playerId: T, timestamp: 2 }, c: { type: 'save', min: 20, playerId: T, timestamp: 3 }, d: { type: 'save', min: 30, playerId: T, timestamp: 4 } };
    const s = Object.assign({}, Store.session(id), { events: evs });
    const m = Scoring.matchPoints(s, T);
    return { saves: m.tally.saves, cs: m.cleanSheet, total: m.total, rows: m.breakdown.map(b => b.label + ' ' + b.pts) };
  }, sid2, TOBY);
  check('big-poles start: saves from 3\' count, clean sheet, labels without "from"', proof2.saves === 4 && proof2.cs === true && proof2.total === 11 && proof2.rows.includes('4 saves 1') && proof2.rows.includes('Clean sheet 8'), proof2);
  check('no console errors (big-poles start)', s2.errors.length === 0, s2.errors);
  await s2.close();

  // ---------------------------------------------------------------- 10 · 9 outfield + 1 keeper per side
  const s3 = await H.open({ width: 390, theme: 'dark', referee: true, route: '#/ref.setup' });
  const p3 = s3.page;
  await addFromChips(p3, 9);
  check('9 outfield on Green', (await sideCount(p3, 'green')) === 9);
  const tenth = await nextRow(p3);
  await tap(p3, `.scr-ref-setup [data-tap="tick"][data-pid="${tenth}"]`, 200);
  check('10th outfield: not added, toast asks for a second tap', (await sideCount(p3, 'green')) === 9 && /Green has 9 outfield · tap again to add/.test(await p3.$eval('#app-toast', e => e.textContent)));
  await s3.shot(path.join(OUT, 'nine-plus-one-390-dark.png'));
  await tap(p3, `.scr-ref-setup [data-tap="tick"][data-pid="${tenth}"]`, 200);
  check('second tap adds the 10th', (await sideCount(p3, 'green')) === 10);
  check('no console errors (9 + 1)', s3.errors.length === 0, s3.errors);
  await s3.close();

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  fs.writeFileSync(path.join(OUT, 'flow-result.txt'), log.join('\n') + (fails ? `\n\n${fails} FAILED` : '\n\nALL PASSED') + '\n');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
