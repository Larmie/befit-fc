// Round 5 Phase C · A whole Monday night, end to end, across EVERY role, in one scripted run. TEST MODE ONLY (harness:
// in-memory copy of the snapshot, Firebase blocked). The night is Mon 26 Oct 2026 (after the snapshot's last match,
// 19 Oct). Every number is checked against Scoring. Write logs → monday-writes.json (+ monday-admin-writes.json).
//   1 front door → a player finds his name → Home          2 guest browsing (Home · Match · Tables, no Me)
//   3 referee signs in (password only) → Who's here → small poles kick-off → goals / blocks (double tap = 1), a card
//     and the "Booked" marker, GK plays as MID on small poles
//   4 a stoppage left running past 4 min (escalation), then ended      5 Adjust clock (hold + sheet)
//   6 late arrivals, Keith moved · big poles with keepers, keeper saves · a guest + a player watch live (breakdown sums)
//   7 a wrong scorer fixed via Edit events · a 2nd-half stoppage goal (labels restart each half)
//   8 1.5 s hold to end → full-time check: long-stoppage heads-up → OK · a double tap → Remove one · Publish OFFLINE
//     (waits) → signal back → published → the full-time card is offered
//   9 admin signs in (email + password) → Needs you shows the result → Money tonight inline 60 · 120 · Other →
//     Settings: Add Blue → Blue in the chips, Who's here and the tables
//  10 player view: Home, Me "How it adds up", Match summary, Tables players + podium      11 Edit match afterwards
// Run (Git Bash): MSYS_NO_PATHCONV=1 node monday.js
const path = require('path');
const fs = require('fs');
const H = require('../harness.js');
const OUT = H.out(__dirname);
const SHOTS = path.join(OUT, 'monday');
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const log = [];
const check = (label, ok, extra) => { ok ? passes++ : fails++; const line = (ok ? 'ok   ' : 'FAIL ') + label + (extra !== undefined ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''); console.log(line); log.push(line); };
const note = t => { const l = '\n# ' + t; console.log(l); log.push(l); };
const keyNums = {};

const NIGHT = '2026-10-26';
const NOW = new Date(NIGHT + 'T19:00:00').getTime();
const snap = H.snapshot();
const pidOf = name => Object.keys(snap.players).find(k => snap.players[k].name === name);
const EMM = pidOf('Emmanuel'), KEITH = pidOf('Keith'), SHAMO = pidOf('Shamo'), BONA = pidOf('Bona');
const HOLD = new Set([EMM, KEITH, SHAMO, pidOf('Toby'), pidOf('Mike'), pidOf('Bona'), pidOf('Joel')]);
const txt = (page, sel) => page.evaluate(q => { const e = document.querySelector(q); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const itxt = (page, sel) => page.evaluate(q => { const e = document.querySelector(q); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);
const screenOf = page => page.evaluate(() => document.querySelector('#app-screen section')?.dataset.screen);
const navLabels = page => page.evaluate(() => [...document.querySelectorAll('#app-nav [data-tab], #app-nav button, #app-nav a')].filter(b => b.offsetParent !== null || !document.getElementById('app-nav').hidden).map(b => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
// sign in through the real sheet; the test password comes from the app's own test config, typed in the page
async function signIn(page, who) {
  await page.waitForSelector('.sh-shell-signin input[type=password]', { visible: true, timeout: 5000 });
  const fields = await page.$$eval('.sh-shell-signin input', a => a.map(i => i.type));
  if (who === 'admin') await page.type('.sh-shell-signin input[type=email]', 'admin@test');
  await page.$eval('.sh-shell-signin input[type=password]', i => { i.value = window.BF_CONFIG.ADMIN_PW; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('.sh-shell-signin button[type=submit]'); await sleep(900);
  return fields;
}

(async () => {
  // =========================================================================== 1 · front door → a player → Home
  note('1 · Front door: Find your name → Emmanuel → Home');
  const w = await H.open({ width: 390, theme: 'dark', viewer: 'none', now: NOW });
  const wp = w.page;
  check('first open shows the front door (welcome)', await screenOf(wp) === 'welcome');
  check('front door: no list until typing; 3 options Just browsing · I’m the referee · I’m the admin', (await wp.$$('[data-fd-res] [data-tap="pick"]')).length === 0 &&
    (await wp.$$eval('[data-fd-opts] [data-tap]', a => a.map(x => x.dataset.tap).join())) === 'browse,referee,admin');
  await wp.type('[data-search="who"]', 'emm'); await sleep(250);
  await wp.click(`[data-tap="pick"][data-pid="${EMM}"]`); await sleep(500);
  check('picking Emmanuel opens player.home; header name chip "Emmanuel ▾"', await screenOf(wp) === 'player.home' && (await txt(wp, '#app-header')).includes('Emmanuel'));
  check('player tabs: Home · Match · Tables · Me', (await navLabels(wp)).join(' · ') === 'Home · Match · Tables · Me', await navLabels(wp));
  const before = await wp.evaluate(pid => { const rows = Scoring.seasonTable(); const r = rows.find(x => x.pid === pid); return { pts: r.pts, rank: r.rank, last: rows.lastGame && rows.lastGame.date }; }, EMM);
  check(`before tonight: Emmanuel ${before.pts} pts (#${before.rank}), last game ${before.last}`, before.pts === 484 && before.last === '2026-10-19', before);
  check('player Home: one glowing hero', await wp.evaluate(() => document.querySelectorAll('#app-screen .hero').length === 1));
  await w.shot(path.join(SHOTS, '01-player-home.png'));
  check('player phone: no console errors', !w.errors.length, w.errors);
  await w.close();

  // =========================================================================== 2 · guest browsing
  note('2 · Guest: Just browsing → Home · Match · Tables (no Me)');
  const g = await H.open({ width: 390, theme: 'light', viewer: 'none', now: NOW });
  const gp = g.page;
  await gp.click('[data-tap="browse"]'); await sleep(500);
  check('Just browsing → guest.home, header "Browsing ▾"', await screenOf(gp) === 'guest.home' && /Browsing/.test(await txt(gp, '#app-header')));
  check('guest tabs: Home · Match · Tables (no Me)', (await navLabels(gp)).join(' · ') === 'Home · Match · Tables', await navLabels(gp));
  const gHome = await gp.evaluate(() => document.getElementById('app-screen').innerText.replace(/\s+/g, ' '));
  check('guest Home: last game 6–4 (19 Oct) in the score block, one hero', await gp.evaluate(() => [...document.querySelectorAll('#app-screen .sb .sb-half .hn')].slice(0, 2).map(e => e.textContent).join('–') === '6–4' && document.querySelectorAll('#app-screen .hero').length === 1), gHome.slice(0, 160));
  await gp.evaluate(() => App.goTab('tables')); await sleep(500);
  check('guest Tables opens (tables.*)', /^tables\./.test(await screenOf(gp)), await screenOf(gp));
  await gp.evaluate(() => App.goTab('match')); await sleep(500);
  check('guest Match tab = player.live', await screenOf(gp) === 'player.live');
  await g.shot(path.join(SHOTS, '02-guest-match-light.png'));
  check('guest phone: no console errors', !g.errors.length, g.errors);
  await g.close();

  // =========================================================================== 3 · referee
  note('3 · Referee signs in (password only) → Who’s here (13, a new person) → small poles kick-off');
  const s = await H.open({ width: 390, theme: 'dark', viewer: 'none', now: NOW });
  const p = s.page;
  const screenId = () => screenOf(p);
  const tap = async (sel, wait = 420) => { await p.waitForSelector(sel, { visible: true, timeout: 5000 }); await p.$eval(sel, e => e.scrollIntoView({ block: 'center' })); await p.click(sel); await sleep(wait); };
  const rapid = async (sel, n = 2) => { const el = await p.waitForSelector(sel, { visible: true, timeout: 5000 }); await p.$eval(sel, e => e.scrollIntoView({ block: 'center' })); await sleep(60); const b = await el.boundingBox(); for (let i = 0; i < n; i++) await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
  const hold = async (sel, ms) => { await p.evaluate(q => document.querySelector(q).scrollIntoView({ block: 'center' }), sel); await sleep(200); const b = await (await p.$(sel)).boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await sleep(ms); await p.mouse.up(); await sleep(600); };
  const adv = min => p.evaluate(ms => { window.__BEFIT_TEST__.now += ms; }, min * 60000);
  const waitBarGone = () => p.waitForFunction(() => !document.querySelector('#app-undo .undo'), { timeout: 9000 }).catch(() => {});
  const waitSaved = () => p.waitForFunction(() => { const u = document.querySelector('#app-undo .undo'); return u && !u.classList.contains('saving') && !u.classList.contains('err'); }, { timeout: 6000 }).then(() => sleep(120));
  const esc = () => p.keyboard.press('Escape').then(() => sleep(250));
  let SID = null;
  const S = () => p.evaluate(id => Store.session(id), SID);
  const events = () => p.evaluate(id => Scoring.sessEvents(Store.session(id)), SID);
  const score = () => p.evaluate(id => { const x = Store.session(id); return Scoring.orderTeams(Scoring.teamsOf(x)).map(t => Scoring.teamGoals(x, t)).join('–'); }, SID);
  const shownScore = () => p.evaluate(() => Array.from(document.querySelectorAll('.cn-score .sb .sb-half .hn')).map(e => e.textContent).join('–'));
  const pts = pid => p.evaluate((id, q) => { const m = Scoring.matchPoints(Store.session(id), q); return m ? m.total : null; }, SID, pid);
  const minute = () => p.evaluate(id => Clock.minute(Store.session(id)), SID);
  const label = e => (e ? (e.stoppageMin != null ? `${e.stoppageBaseMin}+${e.stoppageMin}'` : `${e.min}'`) : null);
  const name = pid => (snap.players[pid] || {}).name || pid;
  const nWrites = () => p.evaluate(() => Store.test.writes.length);

  check('referee phone starts on the front door', await screenId() === 'welcome');
  await tap('[data-tap="referee"]', 400);
  const fields = await signIn(p, 'referee');
  check('referee sheet = password only (no email box)', fields.join() === 'password', fields);
  const REF = await p.evaluate(() => ({ role: App.role(), auth: Auth.role(), email: (Auth.user() || {}).email }));
  check('signed in as the shared referee login (role referee)', REF.role === 'referee' && REF.auth === 'referee', REF);
  check('referee lands on the Match tab = Who’s here (no game yet)', await screenId() === 'ref.setup', await screenId());
  check('referee tabs: Match · Money tonight (no Squad)', (await navLabels(p)).join(' · ') === 'Match · Money tonight', await navLabels(p));
  const BY = await p.evaluate(() => Auth.by());
  // round 6 lineup picker: Emmanuel (usually Red) → Green through "+ From Red"
  await tap('.scr-ref-setup [data-tap="from"]', 500);
  check('"+ From Red" opens "Add to Green tonight" with Red\'s usual squad', (await txt(p, '.sh-setup-from .sheet-title')) === 'Add to Green tonight' && !!(await p.$(`.sh-setup-from [data-tap="tick"][data-pid="${EMM}"]`)));
  await tap(`.sh-setup-from [data-tap="tick"][data-pid="${EMM}"]`, 300);
  await tap('.sh-setup-from [data-tap="done"]', 300);
  const addChips = async n => { for (let i = 0; i < n; i++) { const pid = await p.$$eval('.scr-ref-setup [data-tap="tick"]:not(.on)', (els, hold) => (els.find(e => !hold.includes(e.dataset.pid)) || {}).dataset?.pid, [...HOLD]); await tap(`.scr-ref-setup [data-tap="tick"][data-pid="${pid}"]`, 150); } };
  await addChips(5);
  // Bona is listed GK: on small poles there are no keepers, so he plays (and scores) as a MID. Found with the search.
  await tap('.scr-ref-setup [data-tap="find"][data-kind="find"]', 500);
  await p.type('.sh-setup-new [data-search="q"]', 'Bona'); await sleep(300);
  await tap(`.sh-setup-new [data-tap="pick"][data-pid="${BONA}"]`, 400);
  await tap('[data-seg="side"] [data-value="red"]', 250);
  await addChips(5);
  await tap('.scr-ref-setup [data-tap="find"][data-kind="new"]', 500);
  await p.type('.sh-setup-new [data-search="q"]', 'Francis'); await sleep(300);
  const dup = await p.$$eval('.sh-setup-new .rows .r .nm', els => els.map(e => e.textContent));
  check('"+ New person": typing "Francis" shows the existing Francis first (duplicate check)', dup[0] === 'Francis', dup);
  await p.click('.sh-setup-new [data-search="q"]', { clickCount: 3 }); await p.keyboard.press('Backspace');
  await p.type('.sh-setup-new [data-search="q"]', 'Kwesi Monday'); await sleep(300);
  await tap('.sh-setup-new [data-tap="new"][data-team="red"]', 600);
  const KW = await p.evaluate(() => (Object.entries(Store.players()).find(([, v]) => v.name === 'Kwesi Monday') || [])[0]);
  check('new person "Kwesi Monday" written by name only (needsDetails, MID, Red)', !!KW && await p.evaluate(k => { const v = Store.player(k); return v.needsDetails === true && v.defaultTeam === 'red' && v.defaultPosition === 'MID'; }, KW));
  const sideN = t => p.$eval(`[data-seg="side"] [data-value="${t}"] .n`, e => Number((e.textContent.match(/\d+/) || [0])[0]));
  check('13 people: tabs read "Green 7 of 10" · "Red 6 of 10"', (await sideN('green')) === 7 && (await sideN('red')) === 6 && /7 of 10/.test(await txt(p, '[data-seg="side"] [data-value="green"]')), [await sideN('green'), await sideN('red')]);
  check('ready: the team sheet card (Green 7 · Red 6), no score-like VS block', (await p.$$eval('.su-tsh b', a => a.map(x => x.textContent).join(' · '))) === '7 · 6' && !(await p.$('.su-vs, .su-hero')));
  check('Who’s here offers exactly the Settings teams (no settings saved yet → Green, Red)', (await p.$$eval('[data-seg="side"] button', a => a.map(x => x.dataset.value).join())) === 'green,red');
  check('poles: small by default', (await p.$eval('[data-seg="poles"] .on', e => e.dataset.value)) === 'small');
  await s.shot(path.join(SHOTS, '03-whos-here.png'));
  await adv(5);   // 19:05
  await tap('[data-tap="kickoff"]', 800);
  SID = await p.evaluate(() => Store.activeSessionId());
  let sess = await S();
  check('kick-off: session for Mon 26 Oct, active, live, small poles, 13 players, clock running', sess && sess.date === NIGHT && sess.status === 'active' && sess.mode === 'live' && sess.format.start === 'small' &&
    Object.values(sess.teams).reduce((n, t) => n + Object.keys(t.players).length, 0) === 13 && sess.timer.status === 'running', { date: sess && sess.date, format: sess && sess.format });
  check('console open; bottom nav hidden while live', await screenId() === 'ref.console' && await p.evaluate(() => document.body.classList.contains('nav-hidden')));
  check('header: "Referee ▾" · date · sync chip "✓ All sent" (no ⋯)', /^Referee/.test(await txt(p, '#app-header .hd-l')) && (await txt(p, '#app-header [data-sync]')) === '✓ All sent' && !(await p.$('#app-header [data-cn-more]')));
  const G = Object.keys(sess.teams.green.players), R = Object.keys(sess.teams.red.players);
  const GO = G.filter(x => x !== EMM), RO = R.filter(x => x !== KW);
  // GK-position players on small poles score as MID (no keepers on small poles)
  const gkSmall = await p.evaluate(id => { const x = Store.session(id); return Scoring.sessPlayers(x).filter(q => q.position === 'GK').map(q => ({ pid: q.pid, pos: Scoring.matchPoints(x, q.pid).pos, plays: Scoring.playsAs(x, q.pid) })); }, SID);
  const bona = await p.evaluate((id, q) => { const x = Store.session(id); return { stored: x.teams.green.players[q].position, usual: Store.player(q).defaultPosition, pos: Scoring.matchPoints(x, q).pos, plays: Scoring.playsAs(x, q) }; }, SID, BONA);
  check(`small poles: Bona (usually GK) goes on the sheet as ${bona.stored} and scores as ${bona.pos}; no GK on the team sheet (${gkSmall.length})`, bona.usual === 'GK' && bona.stored === 'MID' && bona.pos === 'MID' && bona.plays === 'MID' && gkSmall.length === 0, { bona, gkSmall });

  // ---------------------------------------------------------------- first half logging
  note('3b · Goals (team first, 3 taps), a double-tapped block and assist (= 1 each), a card + "Booked"');
  await adv(3.2);
  await tap('.cn-goal[data-team="green"]'); await tap(`.sheet [data-tap="scorer"][data-pid="${EMM}"]`); await tap(`.sheet [data-tap="assist"][data-pid="${GO[0]}"]`, 700);
  let ev = await events();
  const g1 = ev.find(e => e.type === 'goal');
  check(`Goal 4': Emmanuel, assist ${name(GO[0])}; by + minute stored`, g1 && g1.scorerId === EMM && g1.assistId === GO[0] && g1.min === 4 && g1.by === BY, g1);
  check('score 1–0 on screen (score block) and in the engine', (await score()) === '1–0' && (await shownScore()) === '1–0');
  const emmPos = sess.teams.green.players[EMM].position;
  check(`Emmanuel ${await pts(EMM)} = 2 (played) + ${({ GK: 5, DEF: 6, MID: 5, FWD: 4 })[emmPos]} (${emmPos === 'GK' ? 'GK as MID' : emmPos} goal)`, (await pts(EMM)) === 2 + ({ GK: 5, DEF: 6, MID: 5, FWD: 4 })[emmPos], await pts(EMM));
  await waitBarGone();
  await adv(6);
  const wG = await nWrites();
  await tap('.cn-goal[data-team="red"]'); await tap(`.sheet [data-tap="scorer"][data-pid="${RO[0]}"]`); await rapid(`.sheet [data-tap="assist"][data-pid="${KW}"]`, 2); await sleep(800);
  const redGoals = (await events()).filter(e => e.type === 'goal' && e.team === 'red');
  check(`Goal 10': ${name(RO[0])} for Red, assist the new person, the assist double tapped → 1 goal, 1 write`, redGoals.length === 1 && redGoals[0].scorerId === RO[0] && redGoals[0].assistId === KW && redGoals[0].min === 10 && (await nWrites()) === wG + 1, { n: redGoals.length, writes: (await nWrites()) - wG });
  check('score 1–1, new person has 2 + 3 = 5', (await score()) === '1–1' && (await pts(KW)) === 5, await pts(KW));
  await waitBarGone();
  await adv(3);
  const wB = await nWrites();
  await tap('.cn-act[data-kind="block"][data-team="green"]');
  check('Block sheet lists Bona (GK-listed, plays outfield on small poles)', !!(await p.$(`.sheet [data-tap="pick"][data-pid="${BONA}"]`)));
  await rapid(`.sheet [data-tap="pick"][data-pid="${GO[1]}"]`, 2); await sleep(700);
  const blocks = (await events()).filter(e => e.type === 'block');
  check(`deliberate double tap on ${name(GO[1])}'s Block → exactly 1 event, 1 write`, blocks.length === 1 && (await nWrites()) === wB + 1, blocks.length);
  const BLOCK1 = blocks[0];
  await waitBarGone();
  await adv(1);
  await tap('.cn-card[data-ctype="yellowCard"][data-team="red"]');
  await tap(`.sheet [data-tap="pick"][data-pid="${RO[2]}"]`, 700);
  const yc = (await events()).find(e => e.type === 'yellowCard');
  check(`yellow card ${yc && yc.min}' for ${name(RO[2])} → 2 − 1 = 1`, yc && yc.playerId === RO[2] && (await pts(RO[2])) === 1, await pts(RO[2]));
  await waitBarGone();
  check('Red\'s Yellow tile shows the count "Yellow · 1" (per team)', /Yellow\s*·\s*1/.test(await txt(p, '.cn-card[data-ctype="yellowCard"][data-team="red"]')) && !/·/.test(await txt(p, '.cn-card[data-ctype="yellowCard"][data-team="green"]')), await txt(p, '.cn-card[data-ctype="yellowCard"][data-team="red"]'));
  await tap('.cn-card[data-ctype="redCard"][data-team="red"]');
  const booked = await txt(p, `.sheet [data-pid="${RO[2]}"] .cn-booked`);
  check(`Card sheet marks ${name(RO[2])} "Booked ${yc.min}'"`, booked === `Booked ${yc.min}'`, booked);
  await s.shot(path.join(SHOTS, '04-card-sheet-booked.png'));
  await esc();
  const acts = await p.$$eval('.cn-act', a => a.map(x => x.dataset.kind + '/' + x.dataset.team).join(','));
  check('small poles: team columns with Block · Clear each, no Save tile (round 6)', acts === 'block/green,clearance/green,block/red,clearance/red' && !(await p.$('.cn-save')), acts);
  await s.shot(path.join(SHOTS, '05-console-first-half.png'));

  // =========================================================================== 4 · a long stoppage (escalates)
  note('4 · Stoppage left running past 4 min (escalation), 2 events in it, then ended');
  await adv(0.5);
  const preStopMin = await minute();
  await tap('.cn-row1 [data-act="stoppage"]', 800);
  check('stoppage on; the score centre turns amber "+0:0x · Stoppage"; Pause disabled', (await S()).timer.status === 'stoppage' && await p.evaluate(() => document.querySelector('.cn-score .sb-mid').classList.contains('is-stoppage')) && await p.$eval('.cn-pause', e => e.disabled));
  await adv(3.6); await sleep(1200);
  check('3:3x in: "End stoppage · +3:3x", not escalated', !(await p.$('.cn-stop.is-esc')) && /^End stoppage · \+3:\d\d$/.test(await txt(p, '.cn-stop')), await txt(p, '.cn-stop'));
  await tap('.cn-act[data-kind="clearance"][data-team="red"]'); await tap(`.sheet [data-tap="pick"][data-pid="${RO[3]}"]`, 700); await waitBarGone();
  await adv(0.6); await sleep(1300);
  const escTxt = await txt(p, '.cn-stop');
  check('past 4 min: the same control escalates "Still in stoppage? End · +4:xx" (lit, no banner)', !!(await p.$('.cn-stop.is-esc.lit')) && /^Still in stoppage\?\s*End · \+4:\d\d$/.test(escTxt) &&
    (await p.$$eval('.scr-ref-console [data-act="endStoppage"], .scr-ref-console .banner, #app-status .offline', a => a.length)) === 1, escTxt);
  await s.shot(path.join(SHOTS, '06-stoppage-escalated.png'));
  await adv(3.7);
  await tap('.cn-act[data-kind="clearance"][data-team="green"]'); await tap(`.sheet [data-tap="pick"][data-pid="${GO[2]}"]`, 700); await waitBarGone();
  const stopEvs = (await events()).filter(e => e.type === 'clearance');
  check(`2 clearances stamped in the stoppage: ${stopEvs.map(label).join(', ')} (base ${preStopMin}')`, stopEvs.length === 2 && stopEvs.every(e => e.stoppageBaseMin === preStopMin) && stopEvs[1].stoppageMin >= 8, stopEvs.map(label));
  await adv(0.5);
  await tap('.cn-stop', 800);
  let t = (await S()).timer;
  check(`End stoppage → running again, about ${Math.round(t.stoppageTotal / 60000 * 10) / 10} min of stoppage`, t.status === 'running' && t.stoppageTotal >= 8 * 60000 && t.stoppageTotal < 9.5 * 60000, t.stoppageTotal);
  check('"Total tonight +8:xx" beside Match controls', /^Total tonight \+8:\d\d$/.test(await txt(p, '[data-total]')), await txt(p, '[data-total]'));
  keyNums.stoppage1 = `${Math.round(t.stoppageTotal / 1000)} s from ${preStopMin}'`;

  // =========================================================================== 5 · Adjust clock
  note('5 · Adjust clock: a short press does nothing; hold 1.5 s → sheet → +2 → saved; logged minutes stay');
  const evBefore = JSON.stringify((await events()).map(e => [e.id, e.min, e.stoppageMin || null]));
  await hold('.cn-adjust', 300);
  check('a short press on Adjust clock opens nothing', await p.evaluate(() => document.querySelectorAll('#app-layer .sheet').length) === 0);
  await hold('.cn-adjust', 1800);
  const m0 = Math.floor((await p.evaluate(id => Clock.elapsedMs(Store.session(id)), SID)) / 60000);
  check(`held 1.5 s → "Adjust clock" sheet starting on ${m0}'`, (await txt(p, '.sheet .sheet-title')) === 'Adjust clock' && (await txt(p, '.sheet [data-amin]')) === `${m0}'`, [await txt(p, '.sheet .sheet-title'), await txt(p, '.sheet [data-amin]')]);
  await tap('.sheet [data-tap="plus"]', 150); await tap('.sheet [data-tap="plus"]', 150);
  check(`+ + → "Set clock to ${m0 + 2}:00"`, (await txt(p, '.sheet .cn-adjsave')) === `Set clock to ${m0 + 2}:00`);
  await s.shot(path.join(SHOTS, '07-adjust-clock.png'));
  const wA = await nWrites();
  await tap('.sheet .cn-adjsave', 800);
  const el = await p.evaluate(id => Clock.elapsedMs(Store.session(id)), SID);
  check(`saved: the clock reads ${m0 + 2}:00 (± 2 s), still running; one timer write`, Math.abs(el - (m0 + 2) * 60000) < 2500 && (await S()).timer.status === 'running' && (await nWrites()) === wA + 1 &&
    await p.evaluate(id => Object.keys(Store.test.writes[Store.test.writes.length - 1].updates).join() === `sessions/${id}/timer`, SID), el);
  check('events already logged keep their minutes', JSON.stringify((await events()).map(e => [e.id, e.min, e.stoppageMin || null])) === evBefore);
  await waitBarGone();

  // =========================================================================== 6 · arrivals, a move, big poles
  note('6 · 2 late arrivals, Keith moved to Green, half time, big poles at 46\' with keepers, keeper saves');
  await adv(1);
  const mArr = await minute();
  await tap('.cn-grid [data-tap="player"]', 500);
  await tap(`.sh-setup-arrival [data-tap="add"][data-pid="${KEITH}"][data-team="red"]`, 700);
  await p.click('.sh-setup-arrival [data-search="q"]'); await p.type('.sh-setup-arrival [data-search="q"]', 'sham'); await sleep(300);
  await tap(`.sh-setup-arrival [data-tap="add"][data-pid="${SHAMO}"][data-team="green"]`, 700);
  await esc();
  sess = await S();
  check(`Keith (Red) and Shamo (Green) arrived at ${mArr}'`, sess.teams.red.players[KEITH] && sess.teams.red.players[KEITH].arrived.at === mArr && sess.teams.green.players[SHAMO] && sess.teams.green.players[SHAMO].arrived.at === mArr,
    { k: sess.teams.red.players[KEITH], s: sess.teams.green.players[SHAMO] });
  await adv(3);
  const mMove = await minute();
  await tap('.cn-grid [data-tap="teams"]', 500);
  await tap('.sh-setup-teams [data-seg="tt"] [data-value="red"]', 300);
  await tap(`.sh-setup-teams [data-tap="move"][data-pid="${KEITH}"][data-to="green"]`, 700);
  sess = await S();
  check(`Keith moved to Green at ${mMove}' (marker kept, Red no longer has him)`, !sess.teams.red.players[KEITH] && sess.teams.green.players[KEITH] && sess.teams.green.players[KEITH].moved.from === 'red' && sess.teams.green.players[KEITH].moved.at === mMove, sess.teams.green.players[KEITH]);
  const tt = await p.$$eval('.sh-setup-teams [data-seg="tt"] button', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check('Teams tonight: Green · 9 | Red · 6', tt.join(' | ') === 'Green · 9 | Red · 6', tt);
  await tap('.sh-setup-teams [data-tap="done"]', 300);
  await waitBarGone();
  await adv(4);
  await tap('.cn-goal[data-team="red"]'); await tap(`.sheet [data-tap="scorer"][data-pid="${RO[1]}"]`); await tap('.sheet .cn-noassist', 700);
  await waitBarGone();
  await adv(4);
  await tap('.cn-goal[data-team="green"]'); await tap(`.sheet [data-tap="scorer"][data-pid="${KEITH}"]`); await tap(`.sheet [data-tap="assist"][data-pid="${EMM}"]`, 700);
  check('Keith scores for Green after the move (goal team = green)', (await events()).some(e => e.type === 'goal' && e.scorerId === KEITH && e.team === 'green'));
  check('score 2–2 at the break', (await score()) === '2–2', await score());
  await waitBarGone();
  const elapsed = await p.evaluate(id => Clock.elapsedMs(Store.session(id)), SID);
  await adv((45 * 60000 + 10000 - elapsed) / 60000);
  await tap('.cn-grid [data-tap="halftime"]', 800);
  const ht = (await events()).find(e => e.type === 'halfTime');
  t = (await S()).timer;
  check("half time at 45:10 (stamped 46', same rule as classic); the 1st half's stoppage is kept per half (stoppageAtHalf)", ht && ht.min === 46 && t.pauseReason === 'halftime' && t.stoppageAtHalf === t.stoppageTotal && t.stoppageAtHalf > 8 * 60000, { ht, atHalf: t.stoppageAtHalf });
  check('at half time the primary control is "Resume second half"', (await txt(p, '.cn-row1 .btn')) === 'Resume second half');
  await waitBarGone();
  check('small poles: "Switch to big poles ›" is on the deck, visible without scrolling', await p.evaluate(() => { const b = document.querySelector('.cn-poles.is-small'); return !!b && b.getBoundingClientRect().bottom <= innerHeight; }));
  await tap('.cn-poles[data-tap="poles"]', 500);
  check('sheet "Big poles from 46\'" + "Score carries over: 2–2"', (await txt(p, '.sh-setup-poles h4')) === "Big poles from 46'" && (await txt(p, '.sh-setup-poles .sh-s')).startsWith('Score carries over: 2–2'));
  // 25 Oct keeper picker: known keepers on that side tonight first, then "Other ›" = tonight's players on that side.
  // Pick each side's keeper through "Other ›": a MID who is not a usual keeper.
  const kp = [];
  for (const side of ['green', 'red']) {
    await tap(`.sh-setup-poles [data-tap="kother"][data-team="${side}"]`, 450);
    const rows = await p.$$eval('.sh-setup-kother [data-tap="kpick"]', a => a.map(x => ({ pid: x.dataset.pid, meta: x.querySelector('.meta').textContent })));
    const sessNow = await S();
    check(`"Other ›" for ${side}: tonight's ${side} players only (${rows.length})`, rows.length === Object.keys(sessNow.teams[side].players).length && rows.every(r => sessNow.teams[side].players[r.pid]));
    // the night's keepers (Toby, Mike) arrive at the switch: "+ Someone not here yet" (15 + 2 = 17 players tonight)
    const kname = side === 'green' ? 'Toby' : 'Mike';
    const pick = pidOf(kname);
    check(`${kname} is not here yet, so not in the "Other ›" list`, !rows.some(r => r.pid === pick));
    await tap('.sh-setup-kother [data-tap="ksome"]', 450);
    await p.type('.sh-setup-new [data-search="q"]', kname); await sleep(300);
    await tap(`.sh-setup-new [data-tap="pick"][data-pid="${pick}"]`, 400);
    kp.push(pick);
  }
  check('both keepers picked, shown first and selected on their side', (await p.$$eval('.sh-setup-poles .su-k [data-tap="keeper"].sel', a => a.map(x => x.dataset.pid).join())) === kp.join());
  await s.shot(path.join(SHOTS, '08-big-poles-sheet.png'));
  await tap('.sh-setup-poles [data-tap="switch"]', 800);
  sess = await S();
  const KG = sess.format.keepers.green, KR = sess.format.keepers.red;
  check(`format: small → switchedAt 46, keepers ${name(KG)} (Green) + ${name(KR)} (Red), both GK`, sess.format.switchedAt === 46 && KG && KR && sess.teams.green.players[KG].position === 'GK' && sess.teams.red.players[KR].position === 'GK', sess.format);
  await waitBarGone();
  await tap('.cn-row1 [data-act="resume"]', 800);
  check('second half running', (await S()).timer.status === 'running');
  check('big poles now: the slot offers the way back, "Switch to small poles ›" (with "Change keepers" beside it)', (await txt(p, '.cn-poles .cn-pt')) === 'Switch to small poles ›' && (await txt(p, '.cn-keeplink')) === 'Change keepers');
  check('big poles: a Save tile in each column naming tonight’s keeper', (await p.$$eval('.cn-save', a => a.map(x => x.dataset.team + ':' + x.querySelector('.cn-sk').textContent.split(' · ')[0]).join(','))) === `green:${name(KG)},red:${name(KR)}`);
  // round 6: one keeper per side → Save · Team logs in 1 tap
  for (let i = 0; i < 4; i++) {
    await adv(1.5);
    await tap('.cn-save[data-team="green"]', 700); await waitBarGone();
  }
  await adv(1);
  await tap('.cn-save[data-team="red"]', 700); await waitBarGone();
  check(`keeper saves: ${name(KG)} 4, ${name(KR)} 1 (all from 46')`, (await events()).filter(e => e.type === 'save' && e.playerId === KG).length === 4 && (await events()).filter(e => e.type === 'save' && e.playerId === KR).length === 1);
  const kgB = await p.evaluate((id, q) => Scoring.matchPoints(Store.session(id), q), SID, KG), krB = await p.evaluate((id, q) => Scoring.matchPoints(Store.session(id), q), SID, KR);
  check(`${name(KG)} = 2 + 1 (4 saves) + 8 (clean sheet from 46') = 11 · ${name(KR)} = 2 + 0 + 8 = 10 (= Scoring)`, kgB.total === 11 && krB.total === 10 && kgB.pos === 'GK', [kgB.total, krB.total, kgB.breakdown]);
  await s.shot(path.join(SHOTS, '09-console-big-poles.png'));

  // ---------------------------------------------------------------- a guest and a player watch it live
  note('6b · Watching live: a guest and Emmanuel’s phone; the live breakdown sums = Scoring');
  const liveState = await p.evaluate(() => JSON.parse(JSON.stringify(Store.state)));
  const liveNow = await p.evaluate(() => Store.now());
  const lv = await H.open({ width: 390, theme: 'dark', viewer: EMM, route: '#/player.live', data: liveState, now: liveNow });
  const lp = lv.page;
  check('player Match tab during the game: LIVE, score 2–2 in the score block', await lp.evaluate(() => /LIVE/.test(document.getElementById('app-screen').innerText)) && (await lp.evaluate(() => [...document.querySelectorAll('#app-screen .sb .sb-half .hn')].slice(0, 2).map(e => e.textContent).join('–'))) === '2–2');
  const rowsLbd = await lp.$$eval('#app-screen [data-tap="lbd"]', a => a.slice(0, 3).map(x => x.dataset.pid));
  let sumsOk = 0;
  for (const pid of rowsLbd) {
    await lp.$eval(`#app-screen [data-tap="lbd"][data-pid="${pid}"]`, e => e.click()); await sleep(500);
    const sh = await lp.evaluate((sid, q) => {
      const sh = document.querySelector('.sh-player-bd'); if (!sh) return null;
      const vals = [...sh.querySelectorAll('.sum .sr .v')].map(v => Number(v.textContent.replace('−', '-').replace('+', '')));
      return { vals, total: Number(sh.querySelector('.sum-tot .hn').textContent), engine: Scoring.matchPoints(Store.session(sid), q).total, profile: location.hash };
    }, SID, pid);
    if (sh && sh.vals.reduce((a, b) => a + b, 0) === sh.total && sh.total === sh.engine && !/profile/.test(sh.profile)) sumsOk++;
    else check(`live breakdown for ${name(pid)}`, false, sh);
    await lp.keyboard.press('Escape'); await sleep(300);
  }
  check(`live breakdown (tap a live points row → sum sheet, not the profile): ${sumsOk} of ${rowsLbd.length} rows add up and = Scoring`, rowsLbd.length >= 3 && sumsOk === rowsLbd.length);
  await lp.$eval(`#app-screen [data-tap="lbd"][data-pid="${rowsLbd[0]}"]`, e => e.click()); await sleep(500);
  await lv.shot(path.join(SHOTS, '10-live-breakdown.png'));
  check('player phone (live): no console errors', !lv.errors.length, lv.errors);
  await lv.close();
  const gl = await H.open({ width: 390, theme: 'light', viewer: 'guest', route: '#/guest.home', data: liveState, now: liveNow });
  check('guest Home during the game: live hero 2–2, one hero', await gl.page.evaluate(() => [...document.querySelectorAll('#app-screen .sb .sb-half .hn')].slice(0, 2).map(e => e.textContent).join('–') === '2–2' && document.querySelectorAll('#app-screen .hero').length === 1));
  await gl.shot(path.join(SHOTS, '11-guest-live-light.png'));
  check('guest phone (live): no console errors', !gl.errors.length, gl.errors);
  await gl.close();

  // =========================================================================== 7 · wrong scorer via Edit events
  note('7 · Wrong scorer, fixed 10 minutes later via Edit events → Event sheet');
  await adv(1);
  const wrongPid = GO[3], rightPid = GO[4];
  await tap('.cn-goal[data-team="green"]'); await tap(`.sheet [data-tap="scorer"][data-pid="${wrongPid}"]`); await tap('.sheet .cn-noassist', 700);
  const wrongEv = (await events()).find(e => e.type === 'goal' && e.scorerId === wrongPid);
  check(`goal at ${wrongEv && wrongEv.min}' logged to ${name(wrongPid)} (the wrong player)`, !!wrongEv);
  check(`score 3–2, ${name(KR)} loses his clean sheet → 2`, (await score()) === '3–2' && (await pts(KR)) === 2, [await score(), await pts(KR)]);
  await waitBarGone();
  await adv(10);
  const ptsBefore = await p.evaluate(id => { const x = Store.session(id); const o = {}; Scoring.sessPlayers(x).forEach(q => { o[q.pid] = Scoring.matchPoints(x, q.pid).total; }); return o; }, SID);
  await tap('.cn-grid [data-tap="events"]', 600);
  check('Edit events opens All events', await screenId() === 'ref.events');
  await tap(`[data-evlist] [data-tap="ev"][data-eid="${wrongEv.id}"]`, 500);
  check(`Event sheet "Goal · ${wrongEv.min}'"`, (await txt(p, '.sheet .sheet-title')) === `Goal · ${wrongEv.min}'`);
  await tap('.sheet [data-tap="f-who"]', 400);
  await tap(`.sheet [data-tap="pk"][data-pid="${rightPid}"]`, 400);
  const pv = await p.evaluate(() => { const sh = [...document.querySelectorAll('.sheet')].pop(); const rows = {}; sh.querySelectorAll('[data-delta] .dr[data-pid]').forEach(r => { rows[r.dataset.pid] = [Number(r.dataset.from), Number(r.dataset.to)]; }); return rows; });
  await s.shot(path.join(SHOTS, '12-event-sheet-preview.png'));
  await tap('.sheet [data-tap="f-save"]', 60); await waitSaved();
  const ptsAfter = await p.evaluate(id => { const x = Store.session(id); const o = {}; Scoring.sessPlayers(x).forEach(q => { o[q.pid] = Scoring.matchPoints(x, q.pid).total; }); return o; }, SID);
  const wrong = Object.keys(ptsAfter).filter(k => { const want = pv[k] || [ptsBefore[k], ptsBefore[k]]; return want[0] !== ptsBefore[k] || want[1] !== ptsAfter[k]; });
  check(`preview = real result for all ${Object.keys(ptsAfter).length} players (${name(wrongPid)} ${pv[wrongPid]} · ${name(rightPid)} ${pv[rightPid]})`, !wrong.length && pv[wrongPid] && pv[rightPid], wrong.map(name));
  const fixed = (await events()).find(e => e.id === wrongEv.id);
  check('event keeps its minute + timestamp, gets editedBy/editedAt, scorer corrected', fixed.scorerId === rightPid && fixed.min === wrongEv.min && fixed.timestamp === wrongEv.timestamp && fixed.editedBy === BY && fixed.editedAt > 0, fixed);
  await waitBarGone();
  await p.evaluate(() => { location.hash = '#/ref.console'; }); await sleep(500);
  check('back on the console, score still 3–2', await screenId() === 'ref.console' && (await shownScore()) === '3–2');

  // ---------------------------------------------------------------- 2nd-half stoppage
  note('7b · A 2nd-half stoppage goal: the label restarts this half (90+n, not 90+8+n)');
  await adv((90 * 60000 + 10000 - (await p.evaluate(id => Clock.elapsedMs(Store.session(id)), SID))) / 60000);
  await tap('.cn-row1 [data-act="stoppage"]', 700);
  check('stoppage on', (await S()).timer.status === 'stoppage');
  await adv(1.2); await sleep(1100);
  check('score centre shows this half’s stoppage "+1:xx"', /^\+1:\d\d$/.test(await txt(p, '.cn-score .sb-mid b')), await txt(p, '.cn-score .sb-mid b'));
  await tap('.cn-goal[data-team="red"]'); await tap(`.sheet [data-tap="scorer"][data-pid="${RO[3]}"]`); await tap('.sheet .cn-noassist', 700);
  const stopGoal = (await events()).find(e => e.type === 'goal' && e.scorerId === RO[3]);
  check(`stoppage goal stamped ${label(stopGoal)} (restarts each half: ≤ 3, though the 1st half had 8+ min)`, stopGoal && stopGoal.stoppageBaseMin >= 90 && stopGoal.stoppageMin >= 1 && stopGoal.stoppageMin <= 3, stopGoal);
  keyNums.stoppageGoal = label(stopGoal);
  await waitBarGone();
  await adv(1);
  await tap('.cn-stop', 700);
  t = (await S()).timer;
  check('2nd-half stoppage ≈ 2 min; total tonight = both halves', t.stoppageTotal - t.stoppageAtHalf >= 120000 && t.stoppageTotal - t.stoppageAtHalf < 180000, (t.stoppageTotal - t.stoppageAtHalf) / 1000);

  // =========================================================================== 8 · end, full-time check, publish
  note('8 · 1.5 s hold to end → full-time check: long-stoppage heads-up → OK; a double tap → Remove one; Publish offline');
  await hold('.cn-endw .hold', 500);
  check('a 0.5 s press on "Hold to end the game" does nothing', (await S()).timer.status === 'running');
  await hold('.cn-endw .hold', 2300);
  sess = await S();
  check('held (> 1.5 s) → full time: timer ended, still active (checking), full-time check open', sess.timer.status === 'ended' && sess.status === 'active' && await screenId() === 'ref.ftcheck');
  const finalScore = await score();
  check('final score 3–3', finalScore === '3–3', finalScore);
  const flag = await itxt(p, '[data-stoppage]');
  check(`long-stoppage heads-up: "${flag}"`, /^Stoppage ran about (8|9|10) min from \d+' 2 events in stoppage \(\d+\+\d+' to \d+\+\d+'\) OK$/.test(flag || ''), flag);
  check('the heads-up has one action: OK (no Fix minutes)', (await p.$$('[data-stoppage] button')).length === 1 && !(await p.$('[data-tap="stopfix"]')));
  await p.evaluate((id, b) => Store.set(`sessions/${id}/events/zz_dup_block`, { type: 'block', playerId: b.playerId, timestamp: b.timestamp + 700, min: b.min, by: b.by }), SID, BLOCK1);
  await sleep(500);
  const ftText = await p.$eval('.scr-ref-ftcheck', e => e.innerText.replace(/\s+/g, ' '));
  check(`flags "${name(BLOCK1.playerId)} · Block twice, 0.7 s apart"`, ftText.includes(`${name(BLOCK1.playerId)} · Block twice, 0.7 s apart`), ftText.slice(0, 220));
  check('engine agrees: 1 double tap, 0 missing minutes', await p.evaluate(id => { const c = Scoring.checks(Store.session(id)); return c.doubleTaps.length === 1 && c.noMinute.length === 0; }, SID));
  await s.shot(path.join(SHOTS, '13-ftcheck-flags.png'));
  const evMin0 = JSON.stringify((await events()).filter(e => e.id !== 'zz_dup_block').map(e => [e.id, e.min, e.stoppageMin || null]));
  await tap('[data-tap="stopkeep"]', 60); await waitSaved();
  check('OK → heads-up hidden, ftCheck.keep set, no minute changed', !(await p.$('[data-stoppage]')) && await p.evaluate(id => Object.keys((Store.session(id).ftCheck || {}).keep || {}).some(k => k.startsWith('stoppage_1_')), SID) &&
    JSON.stringify((await events()).filter(e => e.id !== 'zz_dup_block').map(e => [e.id, e.min, e.stoppageMin || null])) === evMin0);
  await waitBarGone();
  const dupPtsBefore = await pts(BLOCK1.playerId);
  await tap('[data-tap="rm1"][data-eid="zz_dup_block"]', 60); await waitSaved();
  check(`Remove one: duplicate gone, ${name(BLOCK1.playerId)} ${dupPtsBefore} → ${await pts(BLOCK1.playerId)}`, !(await events()).some(e => e.id === 'zz_dup_block') && (await events()).filter(e => e.type === 'block').length === 1);
  await waitBarGone();
  // offline at the pitch: Publish waits on the phone, then sends itself
  await p.evaluate(() => Store.test.setStatus('offline')); await sleep(500);
  check('offline: "Publish · sends when signal returns"', (await txt(p, '[data-tap="publish"]')) === 'Publish · sends when signal returns', await txt(p, '[data-tap="publish"]'));
  await tap('[data-tap="publish"]', 60); await waitSaved(); await sleep(300);
  const local = await p.evaluate(id => Store.session(id).status, SID);
  const server = await p.evaluate(id => (Store.test.server.sessions[id] || {}).status, SID);
  const pend = await p.evaluate(() => Store.status().pending);
  check(`Publish offline: completed on the phone, the server still "active", ${pend} waiting`, local === 'completed' && server === 'active' && pend >= 1, { local, server, pend });
  check('page: "Waiting for signal · Publishes by itself"', /^Waiting for signal Publishes by itself/.test(await itxt(p, '.fx-pubhead') || ''), await itxt(p, '.fx-pubhead'));
  check('header sync chip: amber "On phone · n waiting" / "No signal · n saved on phone"', /waiting|saved on phone/.test(await txt(p, '#app-header [data-sync]')), await txt(p, '#app-header [data-sync]'));
  await s.shot(path.join(SHOTS, '14-publish-waiting-offline.png'));
  await p.evaluate(() => Store.test.setStatus('online'));
  await p.waitForFunction(() => Store.status().pending === 0, { timeout: 12000 }).catch(() => {});
  await sleep(600);
  const srv = await p.evaluate(id => { const x = Store.test.server.sessions[id]; return { status: x.status, ft: x.ftCheck && x.ftCheck.status }; }, SID);
  check('signal back: outbox drained, the server has it completed + published', srv.status === 'completed' && srv.ft === 'published', srv);
  check('page turned into "✓ Published · Reuben has been told" by itself', (await itxt(p, '.fx-pubhead')) === '✓ Published Reuben has been told', await itxt(p, '.fx-pubhead'));
  sess = await S();
  const stored = await p.evaluate(id => Scoring.storedFields(Store.session(id)), SID);
  check('Publish: completed, goals + cleanSheets = Scoring.storedFields, ftCheck published by the referee, flag kept (no open flags)', sess.status === 'completed' && JSON.stringify(sess.goals) === JSON.stringify(stored.goals) &&
    JSON.stringify(sess.cleanSheets) === JSON.stringify(stored.cleanSheets) && sess.ftCheck.status === 'published' && sess.ftCheck.by === BY && !sess.ftCheck.flags, { goals: sess.goals, cs: sess.cleanSheets, ft: sess.ftCheck });
  const mb = await p.evaluate(id => { const m = Scoring.matchBreakdown(Store.session(id)); return { cols: m.columns.map(c => ({ team: c.team, points: c.points, n: c.players.length, sum: c.players.reduce((a, x) => a + x.total, 0) })), total: m.total }; }, SID);
  const sumT = await itxt(p, '.scr-ref-ftcheck .sum');
  const colTxt = mb.cols.map(c => `${c.team[0].toUpperCase() + c.team.slice(1)} ${c.n} players ${c.points}`);
  check(`Published screen: Player points as a sum ${mb.cols.map(c => c.points).join(' + ')} = ${mb.total} (each = its players' sum)`, colTxt.every(x => sumT.includes(x)) && sumT.toUpperCase().endsWith('PLAYER PTS ' + mb.total) &&
    mb.cols.every(c => c.points === c.sum) && mb.cols.reduce((a, c) => a + c.points, 0) === mb.total, sumT);
  keyNums.playerPts = `${mb.cols.map(c => `${c.team} ${c.points}`).join(' + ')} = ${mb.total}`;
  check('the full-time card is offered: the hero card + Share + Save image', !!(await p.$('.fx-ftcv.hero canvas')) && (await txt(p, '[data-tap="share"]')) === 'Share' && (await txt(p, '[data-tap="saveimg"]')) === 'Save image');
  const cardLabel = await p.$eval('.fx-ftcv.hero canvas', c => c.getAttribute('aria-label') || '');
  check(`full-time card says "${cardLabel.slice(0, 60)}…"`, /^Full time, Mon 26 Oct: Green 3, Red 3\./.test(cardLabel), cardLabel);
  await sleep(5300);
  await s.shot(path.join(SHOTS, '15-published-card.png'));
  check('referee phone: no console errors', !s.errors.length, s.errors);

  // =========================================================================== 9 · admin
  note('9 · Admin signs in (email + password) → Needs you → Money tonight inline → Settings: Add Blue');
  const afterPublish = await p.evaluate(() => JSON.parse(JSON.stringify(Store.state)));
  const a = await H.open({ width: 390, theme: 'light', viewer: 'none', data: afterPublish, now: NOW + 3 * 3600000 });
  const ap = a.page;
  const atap = async (sel, wait = 400) => { await ap.waitForSelector(sel, { timeout: 5000 }); await ap.$eval(sel, e => { e.scrollIntoView({ block: 'center' }); e.click(); }); await sleep(wait); };
  await atap('[data-tap="admin"]');
  const afields = await signIn(ap, 'admin');
  check('admin sheet = email + password', afields.join() === 'email,password', afields);
  check('admin lands on admin.home; tabs Home · Squad · Money · Settings', await screenOf(ap) === 'admin.home' && (await navLabels(ap)).join(' · ') === 'Home · Squad · Money · Settings', [await screenOf(ap), await navLabels(ap)]);
  const card = await txt(ap, '.adm-home-a');
  check('Needs you: Published · Mon 26 Oct · By Referee · 1 fix at full time · 1 flag kept · Money tonight 0 of 17 · 1 new player to finish', /Needs you/.test(card) && card.includes('Published · Mon 26 Oct') && card.includes('1 fix at full time') && card.includes('1 flag kept') &&
    card.includes('Money tonight') && card.includes('0 of 17 paid · 17 to collect') && card.includes('1 new player to finish'), card);
  await a.shot(path.join(SHOTS, '16-admin-needs-you-light.png'));
  await atap('[data-tap="need-tonight"]', 600);
  const topText = () => ap.evaluate(() => (document.querySelector('[data-part="top"]') || {}).textContent.replace(/\s+/g, ' ').trim());
  check('Money opens on tonight: 0 of 17 played paid', await screenOf(ap) === 'ref.money' && /0 of 17 paid/.test(await topText()), await topText());
  const all = [...G, KEITH, SHAMO, ...R].filter((x, i, l) => l.indexOf(x) === i);
  const payers = all.slice(0, 13);
  const quick = await ap.evaluate(() => Teams.club().quickAmounts);
  check('quick amounts from Settings fall back to 60 · 120', quick.join() === '60,120', quick);
  for (const id of payers) {
    await ap.$eval(`[data-tap="row"][data-pid="${id}"]`, e => e.click()); await sleep(90);
    if (id === payers[0]) {
      const opts = await ap.$$eval('.adm-quick button', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      check('tapping a row opens 60 · 120 · Other inline', opts.slice(0, 3).join(' · ').replace(/₵/g, '') === '60 · 120 · Other', opts);
      await ap.$eval('.adm-quick [data-tap="set"][data-v="120"]', e => e.click());
    } else if (id === payers[1]) {
      await ap.$eval('.adm-quick [data-tap="other"]', e => e.click()); await sleep(150);
      await ap.$eval('[data-other]', i => { i.value = ''; i.focus(); }); await ap.keyboard.type('30'); await sleep(80);
      await ap.$eval('[data-tap="use"]', e => e.click());
    } else await ap.$eval('.adm-quick [data-tap="set"][data-v="60"]', e => e.click());
    await sleep(90);
  }
  await sleep(300);
  const sb = await itxt(ap, '.adm-savebar');
  check('save bar: Save 13 · +₵810 (11 × 60 + 120 + 30 Other = 660 + 120 + 30) with Cancel', sb.includes('Save 13 · +₵810') && /Cancel/.test(sb), sb);
  await a.shot(path.join(SHOTS, '17-money-savebar-light.png'));
  await ap.$eval('[data-tap="pay-save"]', e => e.click()); await sleep(900);
  const pay = await ap.evaluate(d => { const day = Store.state.paymentDays[d]; const amts = Object.values(day.payments).map(x => x.amount); return { n: amts.length, total: amts.reduce((a, b) => a + b, 0), owe: Object.keys(Store.players()).filter(pid => BF_PAY.status(pid, d) === 'not paid').length, part: Object.keys(Store.players()).filter(pid => BF_PAY.status(pid, d) === 'part paid').length }; }, NIGHT);
  check(`paymentDays/2026-10-26: 13 records, ₵810; BF_PAY: ${pay.owe} not paid + ${pay.part} part paid`, pay.n === 13 && pay.total === 810 && pay.owe === 4, pay);
  check('Money top: 13 of 17 paid · 4 to collect', /1[23] of 17 paid/.test(await topText()) && /to collect/.test(await topText()), await topText());
  keyNums.money = `${pay.n} paid, ₵${pay.total}, ${pay.owe} not paid${pay.part ? ', ' + pay.part + ' part paid' : ''}`;
  // Settings: Add Blue
  await ap.evaluate(() => App.goTab('settings')); await sleep(500);
  check('Settings tab → admin.settings', await screenOf(ap) === 'admin.settings');
  await atap('[data-tap="add-team"]');
  await ap.$eval('.sh-admin-team [data-team-name]', e => { e.value = ''; e.focus(); }); await ap.keyboard.type('Blue', { delay: 20 }); await sleep(150);
  check('Add a team: Blue picked (the next free colour), preview "Blue VS Green"', (await ap.$$eval('.sh-admin-team .sb .sb-nm', a => a.map(x => x.textContent).join())) === 'Blue,Green' && await ap.evaluate(() => document.querySelector('.sh-admin-team [data-tap="colour"].on').dataset.colour === 'blue'));
  await a.shot(path.join(SHOTS, '18-add-team-blue-light.png'));
  await atap('.sh-admin-team [data-tap="team-save"]', 800);
  check('Teams now Green · Red · Blue (settings/teams written)', await ap.evaluate(() => Teams.ids().join() === 'green,red,blue' && !!Store.state.settings.teams.blue));
  await ap.evaluate(() => App.goTab('squad')); await sleep(500);
  check('Blue in the Squad filter chips', await ap.evaluate(() => [...document.querySelectorAll('[data-chips="sq-f"] button')].some(b => b.dataset.value === 'team:blue')));
  await ap.evaluate(() => App.go('tables.teams')); await sleep(600);
  check('Blue in Tables › Teams (a row, 0 played)', await ap.evaluate(() => !!document.querySelector('#app-screen .tb-trow.t-blue') && /Blue/.test(document.querySelector('#app-screen .tb-trow.t-blue').textContent)));
  await a.shot(path.join(SHOTS, '19-tables-teams-blue-light.png'));
  await ap.evaluate(() => { App.setRole('referee'); App.go('ref.setup'); }); await sleep(600);
  // round 6: the lineup picker has one tab per active team, so Blue gets its own third tab
  const tpick = await ap.$$eval('.scr-ref-setup [data-seg="side"] > button', x => x.map(b => b.dataset.value).join());
  check('Blue in Who’s here for next week: a third tab, Green · Red · Blue', tpick === 'green,red,blue', tpick);
  check('admin phone: no console errors', !a.errors.length, a.errors);
  const adminWrites = await ap.evaluate(() => Store.test.writes);
  const adminPaths = [...new Set(adminWrites.flatMap(w => Object.keys(w.updates).map(k => k.split('/').slice(0, 2).join('/'))))];
  check('admin writes touched only tonight’s payments and settings/teams', adminPaths.every(x => x === `paymentDays/${NIGHT}` || x === 'settings/teams'), adminPaths);
  fs.writeFileSync(path.join(OUT, 'monday-admin-writes.json'), JSON.stringify(adminWrites, null, 1));
  const night = await ap.evaluate(() => JSON.parse(JSON.stringify(Store.state)));
  await a.close();

  // =========================================================================== 10 · player view
  note('10 · Player view (Emmanuel): Home, Match, Me “How it adds up”, Match summary, Tables players + podium');
  const v = await H.open({ width: 390, theme: 'dark', viewer: EMM, route: '#/player.home', data: night, now: NOW + 3 * 3600000 });
  const vp = v.page;
  const tbl = await vp.evaluate((pid, sid) => { const rows = Scoring.seasonTable(); const r = rows.find(x => x.pid === pid); return { lastGame: rows.lastGame, pts: r.pts, rank: r.rank, lastPts: r.lastPts, moved: rows.filter(x => x.move !== 0).length, top3: rows.slice(0, 3).map(x => [x.name, x.pts]) }; }, EMM, SID);
  const emmNight = await vp.evaluate((sid, pid) => Scoring.matchPoints(Store.session(sid), pid).total, SID, EMM);
  check(`Season: last game = Mon 26 Oct, Emmanuel ${before.pts} + ${emmNight} = ${tbl.pts}, ${tbl.moved} rows moved`, tbl.lastGame.sid === SID && tbl.pts === before.pts + emmNight && tbl.lastPts === emmNight && tbl.moved > 0, tbl);
  keyNums.emmanuel = `${before.pts} + ${emmNight} = ${tbl.pts} (#${tbl.rank})`;
  const home = await vp.$eval('#app-screen', e => e.innerText.replace(/\s+/g, ' '));
  check(`Home: tonight's game at full time 3–3 and his ${tbl.pts} pts; one hero`, await vp.evaluate(() => [...document.querySelectorAll('#app-screen .sb .sb-half .hn')].slice(0, 2).map(e => e.textContent).join('–') === '3–3') && home.includes(String(tbl.pts)) && await vp.evaluate(() => document.querySelectorAll('#app-screen .hero').length === 1), home.slice(0, 200));
  await v.shot(path.join(SHOTS, '20-player-home-after.png'));
  await vp.evaluate(() => App.goTab('match')); await sleep(500);
  check('Match tab: score block 3 · FT · 3, then past games with mini scores', (await vp.evaluate(() => [...document.querySelectorAll('#app-screen .sb .sb-half .hn')].slice(0, 2).map(e => e.textContent).join('–'))) === '3–3' && /^FT/.test(await txt(vp, '#app-screen .sb .sb-mid')) && (await vp.$$('#app-screen .mini, #app-screen .ms')).length > 0, await txt(vp, '#app-screen .sb .sb-mid'));
  await vp.evaluate(() => App.goTab('me')); await sleep(500);
  check(`Me: hero ${tbl.pts} pts and the newest bar (26 Oct, on the right) = ${emmNight}`, (await txt(vp, '.pl-hero')) === String(tbl.pts) && (await vp.$$eval('.pl-bar-v', a => a.map(x => x.textContent))).pop() === String(emmNight));
  await vp.$eval('[data-tap="carry"]', e => e.click()); await sleep(500);
  const carry = await vp.evaluate(() => { const sh = document.querySelector('.sh-player-carry'); if (!sh) return null; return { title: sh.querySelector('.sheet-title, h4').textContent, vals: [...sh.querySelectorAll('.sum .sr .v')].map(v => Number(v.textContent.replace(/[^\d-]/g, ''))), total: Number(sh.querySelector('.sum-tot .hn').textContent) }; });
  check(`Me › How ${tbl.pts} adds up: ${carry && carry.vals.join(' + ')} = ${carry && carry.total} (carried 286 + since May)`, carry && carry.title === `How ${tbl.pts} adds up` && carry.vals[0] === 286 && carry.vals.reduce((x, y) => x + y, 0) === carry.total && carry.total === tbl.pts, carry);
  await v.shot(path.join(SHOTS, '21-me-how-it-adds-up.png'));
  await vp.keyboard.press('Escape'); await sleep(300);
  await vp.evaluate(sid => App.go('player.match', { sid }), SID); await sleep(500);
  const sum = await vp.evaluate(sid => {
    const m = Scoring.matchBreakdown(Store.session(sid));
    const shown = {}; document.querySelectorAll('[data-seg="mteam"] button').forEach(b => { shown[b.dataset.value] = Number(b.querySelector('.n').textContent); });
    const rows = [...document.querySelectorAll('.pl-xrows .pts')].map(x => Number(x.textContent));
    return { cols: m.columns.map(c => ({ team: c.team, points: c.points, sum: c.players.reduce((a, x) => a + x.total, 0) })), shown, rowsSum: rows.reduce((a, b) => a + b, 0), team: document.querySelector('[data-seg="mteam"] .on').dataset.value, label: document.querySelector('[data-seg="mteam"] .on').textContent.replace(/\s+/g, ' ').trim() };
  }, SID);
  const recon = sum.cols.every(c => c.points === c.sum && sum.shown[c.team] === c.points) && sum.rowsSum === sum.shown[sum.team];
  check(`Match summary reconciles: ${sum.cols.map(c => `${c.team} ${c.points} = sum of players ${c.sum}`).join(', ')}; shown rows add to ${sum.rowsSum}; label "${sum.label}"`, recon && /player pts$/.test(sum.label), sum);
  await v.shot(path.join(SHOTS, '22-match-summary.png'));
  await vp.evaluate(() => App.go('tables.players')); await sleep(500);
  const domRow = await vp.evaluate(pid => { const tr = document.querySelector(`.tb-ptbl tbody tr[data-pid="${pid}"]`); return tr ? [...tr.cells].map(c => c.innerText.trim()) : null; }, EMM);
  check(`Tables › Players: Emmanuel's "you" row: ${emmNight} last game, ${tbl.pts} pts`, domRow && domRow[domRow.length - 2] === String(emmNight) && domRow[domRow.length - 1] === String(tbl.pts) && await vp.evaluate(pid => document.querySelector(`.tb-ptbl tr[data-pid="${pid}"]`).classList.contains('you-row'), EMM), domRow);
  await vp.evaluate(() => App.go('tables.stats')); await sleep(600);
  const pod = await vp.evaluate(() => [...document.querySelectorAll('#app-screen .pod .pcol')].map(c => ({ r: [...c.classList].find(x => /^r\d$/.test(x)), nm: (c.querySelector('.nm') || {}).textContent, v: (c.querySelector('.hn') || {}).textContent, hero: c.classList.contains('hero') })));
  const want = tbl.top3;
  check(`Tables › Stats podium (2 · 1 · 3): ${want.map(x => x.join(' ')).join(' · ')}; #1 is the screen's one hero`, pod.length === 3 && pod[1].r === 'r1' && pod[1].nm === want[0][0] && pod[1].v === String(want[0][1]) && pod[0].nm === want[1][0] && pod[2].nm === want[2][0] && pod[1].hero && !pod[0].hero && !pod[2].hero &&
    await vp.evaluate(() => document.querySelectorAll('#app-screen .hero').length === 1), pod);
  await v.shot(path.join(SHOTS, '23-tables-podium.png'));
  await vp.evaluate(() => App.go('tables.teams')); await sleep(500);
  const teamsRows = await vp.$$eval('#app-screen .tb-trow .tb-tn', a => a.map(x => x.textContent));
  check('Tables › Teams on his phone shows the new Blue row too (Settings are data)', teamsRows.includes('Blue') && teamsRows.includes('Green') && teamsRows.includes('Red'), teamsRows);
  check('player phone: no console errors', !v.errors.length, v.errors);
  await v.close();

  // =========================================================================== 11 · edit match afterwards
  note('11 · Edit match after: add a missed assist, see the preview, save');
  await p.evaluate(sid => App.go('ref.edit', { sid }), SID); await sleep(500);
  await tap('[data-tap="tab"][data-value="timeline"]', 400);
  const noAssist = (await events()).find(e => e.type === 'goal' && e.team === 'red' && !e.assistId && e.scorerId === RO[1]);
  const helper = RO.find(x => x !== RO[1] && x !== noAssist.scorerId);
  const before11 = await p.evaluate(id => { const x = Store.session(id); const o = {}; Scoring.sessPlayers(x).forEach(q => { o[q.pid] = Scoring.matchPoints(x, q.pid).total; }); return o; }, SID);
  const season11 = await p.evaluate(pid => Scoring.seasonStats(pid).pts, helper);
  await tap(`[data-tap="ev"][data-eid="${noAssist.id}"]`, 500);
  await tap('.sheet [data-tap="f-assist"]', 400);
  await tap(`.sheet [data-tap="pk"][data-pid="${helper}"]`, 400);
  const pv11 = await p.evaluate(() => { const sh = [...document.querySelectorAll('.sheet')].pop(); const rows = {}; sh.querySelectorAll('[data-delta] .dr[data-pid]').forEach(r => { rows[r.dataset.pid] = [Number(r.dataset.from), Number(r.dataset.to)]; }); return rows; });
  check(`preview: ${name(helper)} ${before11[helper]} → ${before11[helper] + 3} (only him)`, JSON.stringify(pv11[helper]) === JSON.stringify([before11[helper], before11[helper] + 3]) && Object.keys(pv11).length === 1, pv11);
  await s.shot(path.join(SHOTS, '24-edit-assist-preview.png'));
  await tap('.sheet [data-tap="f-save"]', 60); await waitSaved();
  const after11 = await p.evaluate(id => { const x = Store.session(id); const o = {}; Scoring.sessPlayers(x).forEach(q => { o[q.pid] = Scoring.matchPoints(x, q.pid).total; }); return o; }, SID);
  const moved11 = Object.keys(after11).filter(k => after11[k] !== before11[k]);
  check('saved: exactly that player moved, +3', moved11.length === 1 && moved11[0] === helper && after11[helper] === before11[helper] + 3, moved11.map(name));
  check(`season: ${name(helper)} ${season11} → ${season11 + 3}`, (await p.evaluate(pid => Scoring.seasonStats(pid).pts, helper)) === season11 + 3);
  sess = await S();
  const st2 = await p.evaluate(id => Scoring.storedFields(Store.session(id)), SID);
  check('stored goals + cleanSheets still = Scoring.storedFields after the edit', JSON.stringify(sess.goals) === JSON.stringify(st2.goals) && JSON.stringify(sess.cleanSheets) === JSON.stringify(st2.cleanSheets), { goals: sess.goals, cs: sess.cleanSheets });

  // =========================================================================== audit
  note('Data audit (whole night)');
  const audit = await p.evaluate(id => {
    const x = Store.session(id);
    const evs = Scoring.sessEvents(x);
    const db = Store.state;
    let reAdd = 0;
    for (const pid of Object.keys(db.players)) {
      const co = db.players[pid].carryover || {};
      let s = co.pts || 0;
      for (const { sess } of Scoring.completedSessions(db)) { if (sess.mode === 'history') continue; const m = Scoring.matchPoints(sess, pid, db); if (m) s += m.total; }
      if (s !== Scoring.seasonStats(pid, db).pts) reAdd++;
    }
    return { n: evs.length, allBy: evs.every(e => e.by), allMin: evs.every(e => e.min != null), checks: Scoring.checks(x), reAdd,
      writes: Store.test.writes.length, failed: Store.test.writes.filter(w => w.failed).length,
      paths: [...new Set(Store.test.writes.flatMap(w => Object.keys(w.updates).map(k => k.split('/').slice(0, 2).join('/'))))] };
  }, SID);
  check(`${audit.n} events, every one has "by" and a minute; checks clean`, audit.allBy && audit.allMin && !audit.checks.doubleTaps.length && !audit.checks.noMinute.length, audit.checks);
  check('every season total still re-adds (carry-over + match points)', audit.reAdd === 0, audit.reAdd);
  check(`${audit.writes} referee writes, all in memory; only tonight's session and the new player touched`, audit.paths.every(x => x === `sessions/${SID}` || x === `players/${KW}`), audit.paths);
  const finalState = await p.evaluate(() => JSON.parse(JSON.stringify(Store.state)));
  finalState.paymentDays = night.paymentDays; finalState.settings = night.settings;   // the admin phone's writes (payments, Blue)
  fs.writeFileSync(path.join(OUT, 'monday-writes.json'), JSON.stringify(await p.evaluate(() => Store.test.writes), null, 1));
  fs.writeFileSync(path.join(OUT, 'monday-session.json'), JSON.stringify(await S(), null, 1));
  fs.writeFileSync(path.join(OUT, 'monday-state.json'), JSON.stringify(finalState));
  fs.writeFileSync(path.join(OUT, 'monday-ids.json'), JSON.stringify({ SID, KW, KG, KR, EMM }));
  const final = await p.evaluate(id => Scoring.livePoints(Store.session(id)).map(x => `${x.name} ${x.total}`), SID);
  const line = `\nFinal 3–3 · key numbers: ${JSON.stringify(keyNums)}\npoints: ${final.join(' · ')}`; console.log(line); log.push(line);
  check('referee phone: no console errors (whole night)', !s.errors.length, s.errors);
  await s.close();

  const sumLine = `\n${passes} passed, ${fails} failed`;
  console.log(sumLine); log.push(sumLine);
  fs.writeFileSync(path.join(OUT, 'monday-result.txt'), log.join('\n') + '\n');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); log.push('CRASH ' + e.stack); fs.writeFileSync(path.join(OUT, 'monday-result.txt'), log.join('\n') + '\n'); process.exit(2); });
