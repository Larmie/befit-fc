// Round 5 admin checks: Settings (Add Blue, fee 70, quick amounts, teams), inline money Cancel/Save, referee gates, CSV.
// TEST MODE ONLY (harness: in-memory copy of the snapshot, Firebase blocked).
const path = require('path');
const fs = require('fs');
const H = require('../harness.js');
const OUT = H.out(__dirname, 'shots');
const DL = H.out(__dirname, 'dl');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const check = (l, ok, x) => { ok ? passes++ : fails++; console.log(ok ? 'ok  ' : 'FAIL', l, !ok && x !== undefined ? JSON.stringify(x) : ''); };
const click = async (p, sel, ms = 300) => { await p.$eval(sel, e => { e.scrollIntoView({ block: 'center' }); e.click(); }); await sleep(ms); };
const screenId = p => p.evaluate(() => document.querySelector('#app-screen section').dataset.screen);
const writesSince = (p, n) => p.evaluate(k => Store.test.writes.slice(k).map(w => w.updates), n);
const nW = p => p.evaluate(() => Store.test.writes.length);
const typeInto = async (p, sel, text) => { await p.$eval(sel, e => { e.value = ''; e.focus(); }); await p.keyboard.type(text, { delay: 30 }); await sleep(150); };
const text = (p, sel) => p.evaluate(s => (document.querySelector(s) || {}).textContent ? document.querySelector(s).textContent.replace(/\s+/g, ' ').trim() : '', sel);

(async () => {
  fs.mkdirSync(DL, { recursive: true });
  // =============================================================== A · admin
  const s = await H.open({ width: 390, theme: 'dark', referee: true, route: '#/admin.settings' });
  const p = s.page;
  console.log('— Settings');
  const setTxt = await text(p, '#app-screen');
  check('Settings sections: Club, Teams, Match rules, Access, Appearance, Data', ['CLUB', 'TEAMS', 'MATCH RULES', 'ACCESS', 'APPEARANCE', 'DATA'].every(k => (setTxt.toUpperCase()).includes(k)), setTxt.slice(0, 200));
  check('before any save: settings root is empty, fallback Green · Red, ₵60, 60 · 120', await p.evaluate(() => !Object.keys(Store.state.settings || {}).length && Teams.ids().join() === 'green,red' && Teams.club().fee === 60 && Teams.club().quickAmounts.join() === '60,120'));
  await s.shot(path.join(OUT, 'settings-390-dark.png'), { fullPage: true });

  // ---- Add Blue
  await click(p, '[data-tap="add-team"]', 400);
  check('Add a team: Green and Red "In use", Blue picked, Gold free', await p.evaluate(() => {
    const b = [...document.querySelectorAll('.sh-admin-team [data-tap="colour"]')].map(x => x.dataset.colour + ':' + (x.disabled ? 'used' : x.classList.contains('on') ? 'on' : 'free'));
    return b.join() === 'green:used,red:used,blue:on,gold:free';
  }));
  check('preview: BLUE 0 VS 0 GREEN, Blue half in the blue colour', await p.evaluate(() => {
    const sb = document.querySelector('.sh-admin-team .sb'); const nm = [...sb.querySelectorAll('.sb-nm')].map(x => x.textContent);
    const half = sb.querySelector('.sb-half'); const tc = getComputedStyle(half).getPropertyValue('--tc').trim();
    return nm.join() === 'Blue,Green' && sb.querySelector('.sb-mid').textContent.includes('VS') && /blue|5B8DEF|2F6FDB/i.test(tc + getComputedStyle(document.documentElement).getPropertyValue('--blue')) && getComputedStyle(half.querySelector('.hn')).color === getComputedStyle(document.documentElement).getPropertyValue('--blue').trim().replace(/^#(..)(..)(..)$/, (m, r, g, b2) => `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b2, 16)})`);
  }));
  await typeInto(p, '.sh-admin-team [data-team-name]', 'Navy');
  check('typing a name updates the preview and the button ("Add Navy")', (await text(p, '.sh-admin-team .sb .sb-nm')) === 'Navy' && (await text(p, '.sh-admin-team [data-tap="team-save"]')) === 'Add Navy');
  await typeInto(p, '.sh-admin-team [data-team-name]', 'Blue');
  await s.shot(path.join(OUT, 'addteam-390-dark.png'));
  let w0 = await nW(p);
  await click(p, '.sh-admin-team [data-tap="team-save"]', 700);
  let w = await writesSince(p, w0);
  const expectBlue = { 'settings/teams/green': { name: 'Green', colour: 'green', order: 1, active: true }, 'settings/teams/red': { name: 'Red', colour: 'red', order: 2, active: true }, 'settings/teams/blue': { name: 'Blue', colour: 'blue', order: 3, active: true } };
  check('Add Blue: ONE write = settings/teams/{green, red, blue} (Green and Red written too, so they never vanish)', w.length === 1 && JSON.stringify(w[0]) === JSON.stringify(expectBlue), w);
  console.log('SETTINGS WRITE (Add Blue)', JSON.stringify(w[0]));
  check('Teams.list() = Green, Red, Blue; sheet closed; Teams row added; only Gold left to add', await p.evaluate(() => Teams.ids().join() === 'green,red,blue' && !document.querySelector('.sh-admin-team') && [...document.querySelectorAll('.adm-team .nm')].map(x => x.textContent).join() === 'Green,Red,Blue' && document.querySelectorAll('.adm-addrow .adm-dots i').length === 1));
  await s.shot(path.join(OUT, 'settings-blue-390-dark.png'));
  // Blue shows up everywhere
  await s.go('#/ref.squad'); await sleep(300);
  check('Squad: a Blue filter chip', await p.evaluate(() => [...document.querySelectorAll('[data-chips="sq-f"] button')].some(b => b.dataset.value === 'team:blue' && b.textContent.trim() === 'Blue')));
  const PID = await p.evaluate(() => { const played = BF_PAY.playedOn('2026-09-07'); return Object.keys(Store.players()).find(k => !played.has(k) && Store.player(k).name === 'Andrew') || Object.keys(Store.players()).find(k => !played.has(k)); });
  await s.go('#/ref.player?pid=' + PID); await sleep(300);
  check('player page: swatches Green · Red · Blue (+ Add for Gold)', (await p.$$eval('.adm-sw[data-tap="sw"] span', e => e.map(x => x.textContent).join())) === 'Green,Red,Blue' && !!(await p.$('[data-tap="sw-add"]')));
  w0 = await nW(p);
  await click(p, '.adm-sw[data-team="blue"]', 600);
  w = await writesSince(p, w0);
  check('tap Blue swatch: one write, usual team blue', w.length === 1 && JSON.stringify(w[0]) === JSON.stringify({ [`players/${PID}/defaultTeam`]: 'blue', [`players/${PID}/needsDetails`]: null }), w);
  check('player header card is Blue (the one hero), Blue swatch ticked', await p.evaluate(() => document.querySelector('.adm-ed-hd').classList.contains('t-blue') && document.querySelectorAll('#app-screen .hero').length === 1 && document.querySelector('.adm-sw.on').dataset.team === 'blue'));
  await s.shot(path.join(OUT, 'player-blue-390-dark.png'));
  await s.go('#/ref.squad'); await sleep(300);
  await click(p, '[data-chips="sq-f"] [data-value="team:blue"]');
  check('Squad › Blue filter lists him with a Blue team chip', await p.evaluate(pid => { const r = [...document.querySelectorAll('[data-part="list"] .adm-sq')]; return r.length === 1 && r[0].dataset.pid === pid && r[0].querySelector('.tc').textContent === 'Blue' && r[0].querySelector('.tc').classList.contains('t-blue'); }, PID));
  await s.go('#/ref.moneyDay?date=2026-09-07'); await sleep(300);
  await click(p, '[data-chips="reg-tab"] [data-value="all"]');
  check('Money (7 Sep, Everyone): his row carries the Blue team chip', await p.evaluate(pid => { const b = document.querySelector(`[data-tap="row"][data-pid="${pid}"]`); const c = b && b.querySelector('.tc'); return !!c && c.textContent === 'Blue' && c.classList.contains('t-blue'); }, PID));

  // ---- the fee to 70 flows into quick amounts and Money
  await s.go('#/admin.settings'); await sleep(300);
  await click(p, '[data-tap="club-fee"]', 400);
  await typeInto(p, '.sh-admin-club [data-v]', '70');
  check('fee sheet says "Quick amounts become 70 · 140"', (await text(p, '.sh-admin-club [data-part="note"]')) === 'Quick amounts become 70 · 140');
  await s.shot(path.join(OUT, 'settings-fee-390-dark.png'));
  w0 = await nW(p);
  await click(p, '.sh-admin-club [data-tap="club-save"]', 700);
  w = await writesSince(p, w0);
  check('fee 70: ONE write = { settings/club/fee: 70, settings/club/quickAmounts: [70, 140] }', w.length === 1 && JSON.stringify(w[0]) === JSON.stringify({ 'settings/club/fee': 70, 'settings/club/quickAmounts': [70, 140] }), w);
  console.log('SETTINGS WRITE (fee)', JSON.stringify(w[0]));
  check('Settings shows Fee ₵70 · Quick amounts 70 · 140', await p.evaluate(() => { const t = document.querySelector('#app-screen').innerText; return t.includes('₵70') && t.includes('70 · 140'); }));
  await s.go('#/ref.money'); await sleep(300);
  check('Money tonight: ₵0 of ₵1,260 (18 × ₵70)', (await text(p, '[data-part="top"]')).includes('of ₵1,260'));
  const P1 = await p.evaluate(() => [...BF_PAY.playedOn('2026-10-19').keys()][0]);
  await click(p, `[data-tap="row"][data-pid="${P1}"]`);
  check('tap a row: ₵70 · ₵140 · Other inline (equal thirds, 48 px)', await p.evaluate(() => { const b = [...document.querySelectorAll('.adm-quick button')]; const r = b.map(x => x.getBoundingClientRect()); return b.map(x => x.textContent).join('|') === '₵70|₵140|Other' && r.every(x => Math.abs(x.width - r[0].width) < 1 && x.height >= 48); }));
  // Cancel: nothing written
  w0 = await nW(p);
  await click(p, '.adm-quick [data-tap="set"][data-v="70"]');
  check('pick ₵70: save bar "Save 1 · +₵70" with Cancel and Save', (await p.evaluate(() => document.querySelector('.adm-savebar').innerText.replace(/\s+/g, ' ').trim())) === 'Save 1 · +₵70 Cancel Save');
  await s.shot(path.join(OUT, 'money-inline-70-390-dark.png'));
  await click(p, '[data-tap="pay-cancel"]');
  check('Cancel: nothing written, no save bar, row closed, still ₵0', (await nW(p)) === w0 && await p.evaluate(() => !document.querySelector('.adm-savebar') && !document.querySelector('.adm-pi.open') && __BEFIT_ADMIN__.daySummary('2026-10-19').total === 0));
  // Save: exactly one write
  await click(p, `[data-tap="row"][data-pid="${P1}"]`);
  await click(p, '.adm-quick [data-tap="set"][data-v="140"]');
  await click(p, '[data-tap="pay-save"]', 700);
  w = await writesSince(p, w0);
  const k = `paymentDays/2026-10-19/payments/${P1}`;
  check('Save: ONE write, his record ₵140 (+ the day\'s date/createdAt/updatedAt)', w.length === 1 && w[0][k] && w[0][k].amount === 140 && Object.keys(w[0]).filter(x => x.includes('/payments/')).length === 1, w);
  check('hero now ₵140 of ₵1,260 · 1 of 18 paid · 17 to collect', await p.evaluate(() => { const t = document.querySelector('[data-part="top"]').textContent; return t.includes('₵140') && t.includes('of ₵1,260') && t.includes('1 of 18 paid') && t.includes('17 to collect'); }));
  // keyboard-safe Other
  const P2 = await p.evaluate(() => [...BF_PAY.playedOn('2026-10-19').keys()][1]);
  await click(p, `[data-tap="row"][data-pid="${P2}"]`);
  await click(p, '.adm-quick [data-tap="other"]');
  await p.focus('.adm-panel [data-other]');
  await p.keyboard.type('5'); await p.evaluate(() => Store.set('sessions/-Oz8393enopc2awvN6-n/zzPing', Math.random())); await sleep(250); await p.keyboard.type('5');
  check('Other: typing keeps focus while data changes, Enter uses it (₵55)', await p.evaluate(() => document.activeElement && document.activeElement.matches('[data-other]') && document.activeElement.value === '55'));
  await p.keyboard.press('Enter'); await sleep(300);
  check('… "Save 1 · +₵55"', (await p.evaluate(() => document.querySelector('.adm-savebar').innerText.replace(/\s+/g, ' ').trim())) === 'Save 1 · +₵55 Cancel Save');
  await click(p, '[data-tap="pay-cancel"]');

  // ---- quick amounts, name, season
  await s.go('#/admin.settings'); await sleep(300);
  await click(p, '[data-tap="club-quickAmounts"]', 400);
  await typeInto(p, '.sh-admin-club [data-q="1"]', '100');
  await typeInto(p, '.sh-admin-club [data-q="2"]', '140');
  w0 = await nW(p);
  await click(p, '.sh-admin-club [data-tap="club-save"]', 700);
  w = await writesSince(p, w0);
  check('quick amounts 70 · 100 · 140: one write', w.length === 1 && JSON.stringify(w[0]) === JSON.stringify({ 'settings/club/quickAmounts': [70, 100, 140] }), w);
  await click(p, '[data-tap="club-seasonLabel"]', 400);
  await typeInto(p, '.sh-admin-club [data-v]', 'Season 2027');
  w0 = await nW(p);
  await p.keyboard.press('Enter'); await sleep(700);
  w = await writesSince(p, w0);
  check('season label (Enter saves): one write settings/club/seasonLabel', w.length === 1 && w[0]['settings/club/seasonLabel'] === 'Season 2027', w);
  await s.go('#/ref.money'); await sleep(300);
  await click(p, `[data-tap="row"][data-pid="${P2}"]`);
  check('Money row now offers ₵70 · ₵100 · ₵140 · Other', (await p.$$eval('.adm-quick button', e => e.map(x => x.textContent).join('|'))) === '₵70|₵100|₵140|Other');
  await click(p, `[data-tap="row"][data-pid="${P2}"]`);

  // ---- teams: deactivate, order, guard
  await s.go('#/admin.settings'); await sleep(300);
  await click(p, '.adm-team[data-id="blue"]', 400);
  await click(p, '.sh-admin-team [data-tap="move"][data-d="-1"]', 700);
  check('Blue › Move left: Green, Blue, Red (orders 1, 2, 3)', await p.evaluate(() => Teams.all().map(t => t.id + t.order).join() === 'green1,blue2,red3'));
  check('Scoring.orderTeams follows: green, blue, red', await p.evaluate(() => Scoring.orderTeams(['red', 'blue', 'green']).join() === 'green,blue,red'));
  await click(p, '.adm-team[data-id="blue"]', 400);
  await click(p, '.sh-admin-team [data-tap="active"]');
  w0 = await nW(p);
  await click(p, '.sh-admin-team [data-tap="team-save"]', 700);
  w = await writesSince(p, w0);
  check('Blue not active: one write, active false; kept for old matches (Teams.all), not offered (Teams.list)', w.length === 1 && w[0]['settings/teams/blue'].active === false && await p.evaluate(() => Teams.ids().join() === 'green,red' && Teams.all().length === 3));
  await click(p, '.adm-team[data-id="red"]', 400);
  check('with 2 active, Red can\'t be switched off ("At least two teams play")', await p.evaluate(() => document.querySelector('.sh-admin-team [data-tap="active"]').disabled && document.querySelector('.sh-admin-team').textContent.includes('At least two teams play')));
  await p.keyboard.press('Escape'); await sleep(200);
  await s.go('#/ref.player?pid=' + PID); await sleep(300);
  check('his page still shows Blue (his team) though Blue is not active', (await p.$$eval('.adm-sw[data-tap="sw"] span', e => e.map(x => x.textContent).join())) === 'Green,Red,Blue');

  // ---- Match rules, Access, Appearance, Data
  await s.go('#/admin.settings'); await sleep(300);
  await click(p, '[data-tap="points"]', 400);
  const pts = await p.evaluate(() => [...document.querySelectorAll('.adm-pts-r')].map(r => r.innerText.replace(/\s+/g, ' ').trim()));
  check('Points table (read-only, from Scoring.SCORE): Goal +10 +6 +5 +4 · Clean sheet +8 +3', pts.includes('Goal +10 +6 +5 +4') && pts.includes('Clean sheet +8 +3 – –'), pts);
  await s.shot(path.join(OUT, 'settings-points-390-dark.png'));
  await p.keyboard.press('Escape'); await sleep(200);
  await click(p, '[data-tap="access"]', 400);
  check('Access: plain steps to change the referee password in the Firebase console', await p.evaluate(() => { const t = document.querySelector('.sh-admin-access').textContent; return t.includes('console.firebase.google.com') && t.includes('Authentication') && t.includes('roles') && document.querySelectorAll('.sh-admin-access li').length === 6; }));
  await s.shot(path.join(OUT, 'settings-access-390-dark.png'));
  await p.keyboard.press('Escape'); await sleep(200);
  await click(p, '[data-tap="appearance"]', 400);
  check('Appearance opens the shared Appearance sheet', await p.evaluate(() => !!document.querySelector('.sheet') && document.querySelector('.sheet').textContent.includes('Referee console')));
  await p.keyboard.press('Escape'); await sleep(200);
  check('Practice mode link → ?practice (new tab)', await p.evaluate(() => { const a = document.querySelector('[data-practice]'); return a && a.getAttribute('href').endsWith('?practice') && a.target === '_blank'; }));

  // ---- CSV reconciles with Scoring
  const csvChk = await p.evaluate(() => {
    const csv = __BEFIT_ADMIN__.seasonCsv();
    const lines = csv.trim().split('\r\n');
    const parse = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (q) { if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
    const head = parse(lines[0]); const rows = lines.slice(1).map(parse);
    const tbl = Scoring.seasonTable();
    const bad = [];
    rows.forEach((r, i) => {
      const t = tbl[i], st = Scoring.seasonStats(t.pid);
      const want = [t.rank, t.name, UI.fmt.team(t.team), t.pos || '', st.apps, st.pts, st.g, st.a, st.sv, st.y, st.r, BF_PAY.owed(t.pid).length, BF_PAY.owed(t.pid).length * Teams.club().fee].map(String);
      if (JSON.stringify(r) !== JSON.stringify(want)) bad.push({ r, want });
    });
    const sumPts = rows.reduce((a, r) => a + Number(r[5]), 0), allPts = Object.keys(Store.players()).reduce((a, k) => a + Scoring.seasonStats(k).pts, 0);
    const sumG = rows.reduce((a, r) => a + Number(r[6]), 0), allG = Object.keys(Store.players()).reduce((a, k) => a + Scoring.seasonStats(k).g, 0);
    return { head: head.join('|'), n: rows.length, players: Object.keys(Store.players()).length, bad: bad.slice(0, 2), nbad: bad.length, sumPts, allPts, sumG, allG, csv };
  });
  check('CSV: header + one row per player (76)', csvChk.n === 76 && csvChk.players === 76 && csvChk.head === 'Rank|Name|Usual team|Position|Apps|Points|Goals|Assists|Saves|Yellow cards|Red cards|Nights not paid|Subs owed', csvChk.head);
  check('CSV: every row = Scoring.seasonStats + BF_PAY.owed for that player (0 differences)', csvChk.nbad === 0, csvChk.bad);
  check(`CSV totals reconcile: points ${csvChk.sumPts} = ${csvChk.allPts}, goals ${csvChk.sumG} = ${csvChk.allG}`, csvChk.sumPts === csvChk.allPts && csvChk.sumG === csvChk.allG);
  const cdp = await p.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }).catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }));
  fs.readdirSync(DL).forEach(f => fs.unlinkSync(path.join(DL, f)));
  await click(p, '[data-tap="csv"]', 500);
  for (let i = 0; i < 40 && !fs.readdirSync(DL).some(f => f.endsWith('.csv')); i++) await sleep(250);
  await sleep(300);
  const files = fs.readdirSync(DL).filter(f => f.endsWith('.csv'));
  const file = files[0] ? fs.readFileSync(path.join(DL, files[0]), 'utf8') : '';
  check('Export season › CSV downloads befit-season-2027-2026-10-19.csv with exactly those rows', files[0] === 'befit-season-2027-2026-10-19.csv' && file.replace(/^﻿/, '') === csvChk.csv, files);
  console.log('     CSV first rows:', csvChk.csv.split('\r\n').slice(0, 3).join(' / '));
  const settingsNow = await p.evaluate(() => Store.state.settings);
  console.log('SETTINGS ROOT AFTER THE RUN', JSON.stringify(settingsNow));
  check('admin: no console errors', s.errors.length === 0, s.errors);
  await s.close();

  // =============================================================== B · the referee login (shared, not admin)
  console.log('— Referee');
  const r = await H.open({ width: 390, theme: 'dark', referee: 'referee', route: '#/ref.money' });
  const q = r.page;
  check('referee: tabs Match · Money tonight', (await q.$$eval('#app-nav a span', e => e.map(x => x.textContent).join(' · '))) === 'Match · Money tonight');
  for (const [route, label] of [['#/ref.squad', 'Squad'], ['#/admin.settings', 'Settings'], ['#/admin.home', 'admin Home'], ['#/ref.player?pid=seed_p002', 'a player page'], ['#/ref.pastGame', 'Log a past game']]) {
    await r.go(route); await sleep(400);
    const id = await screenId(q);
    check(`referee is blocked from ${label} (lands on ${id})`, id !== route.slice(2).split('?')[0] && !/^(ref\.squad|ref\.player|admin\.|ref\.pastGame)/.test(id), id);
  }
  await r.go('#/ref.moneyDay?date=2026-09-07'); await sleep(500);
  check('referee: another date redirects to Money tonight', (await screenId(q)) === 'ref.money' && (await text(q, '[data-part="top"]')).includes('of ₵1,080'));
  await r.go('#/ref.money?all=1'); await sleep(400);
  check('referee: Money tonight only, no Tonight · All dates switch, no Clear record', await q.evaluate(() => !document.querySelector('[data-seg="money-view"]') && !document.querySelector('.adm-clear') && !!document.querySelector('[data-part="top"]')));
  await q.evaluate(() => App.action('admin.addTeam', {})); await sleep(300);
  check('referee: admin.addTeam opens nothing', await q.evaluate(() => !document.querySelector('.sh-admin-team')));
  const R1 = await q.evaluate(() => [...BF_PAY.playedOn('2026-10-19').keys()][0]);
  let rw = await nW(q);
  await click(q, `[data-tap="row"][data-pid="${R1}"]`);
  await click(q, '.adm-quick [data-tap="set"][data-v="60"]');
  await r.shot(path.join(OUT, 'referee-money-390-dark.png'));
  await click(q, '[data-tap="pay-save"]', 700);
  check('referee can still collect tonight: one write, by "referee"', await q.evaluate((n, pid) => { const w = Store.test.writes.slice(n); return w.length === 1 && w[0].updates[`paymentDays/2026-10-19/payments/${pid}`].by === 'referee'; }, rw, R1));
  await q.evaluate(() => Store.test.setStatus('offline')); await sleep(300);
  await click(q, `[data-tap="row"][data-pid="${await q.evaluate(() => [...BF_PAY.playedOn('2026-10-19').keys()][1])}"]`);
  await click(q, '.adm-quick [data-tap="set"][data-v="60"]');
  await click(q, '[data-tap="pay-save"]', 500);
  check('referee offline: no orange/ink status bar; the header sync chip says "No signal · 1 saved on phone" or "On phone · 1 waiting"', await q.evaluate(() => document.querySelector('#app-status').textContent.trim() === '' && /1 (waiting|saved on phone)/.test(document.querySelector('#app-header .sync').textContent)), await q.evaluate(() => [document.querySelector('#app-status').textContent, (document.querySelector('#app-header .sync') || {}).textContent]));
  await r.shot(path.join(OUT, 'referee-money-offline-390-dark.png'));
  await q.evaluate(() => Store.test.setStatus('online')); await sleep(600);
  check('referee: no console errors', r.errors.length === 0, r.errors);
  await r.close();

  // =============================================================== C · no match today: record a match day (Monday-ready fix)
  console.log('— No match today');
  const TUE = '2026-10-20T12:00';
  for (const theme of ['dark', 'light']) {
    const a = await H.open({ width: 390, theme, referee: true, route: '#/ref.money', now: TUE });
    const m = a.page;
    const want = await m.evaluate(() => BF_PAY.overview().missing.map(r => ({ date: r.date, played: r.played })));
    const hero = await m.evaluate(() => { const c = document.querySelector('.adm-record'); return c ? { t: c.innerText.replace(/\s+/g, ' ').trim(), date: c.querySelector('[data-tap="record"]').dataset.date, hero: c.classList.contains('hero'), tonight: document.querySelector('[data-seg="money-view"] .on').dataset.value } : null; });
    const latest = want[0];
    check(`[${theme}] Money lands on the latest unrecorded match day: ${latest && latest.date} (${want.length} unrecorded), "${latest && latest.played} players played · not entered"`, !!hero && hero.date === latest.date &&
      hero.t.includes(await m.evaluate(d => UI.fmt.date(d), latest.date)) && hero.t.includes(`${latest.played} played`) && hero.t.includes('not entered') && hero.t.includes('Record money ›') && hero.hero && hero.tonight === 'tonight', { hero, want });
    console.log('     unrecorded match days:', want.map(x => `${x.date} (${x.played})`).join(', '));
    check(`[${theme}] "+ ${want.length - 1} more match days not entered ›"`, hero && hero.t.includes(`+ ${want.length - 1} more match days not entered ›`), hero && hero.t);
    await a.shot(path.join(OUT, `money-record-landing-390-${theme}.png`));
    if (theme === 'dark') {
      const w0 = await nW(m);
      await click(m, '.adm-record [data-tap="record"]', 500);
      const reg = await m.evaluate(() => ({ id: document.querySelector('#app-screen section').dataset.screen, hash: location.hash, tab: document.querySelector('[data-chips="reg-tab"] .on').dataset.value,
        rows: [...document.querySelectorAll('[data-part="rows"] [data-tap="row"]')].map(b => b.dataset.pid).sort() }));
      const played = await m.evaluate(d => [...BF_PAY.playedOn(d).keys()].sort(), latest.date);
      check(`Record money › opens ${latest.date}'s register on "To collect" = exactly the ${played.length} who played, nothing written`, reg.id === 'ref.moneyDay' && reg.hash.includes(latest.date) && reg.tab === 'unpaid' && JSON.stringify(reg.rows) === JSON.stringify(played) && (await nW(m)) === w0, reg);
      // tick one, save: one write, then that day is no longer "not entered"
      await click(m, `[data-tap="row"][data-pid="${played[0]}"]`);
      await click(m, '.adm-quick [data-tap="set"][data-v="60"]');
      await a.shot(path.join(OUT, 'money-record-register-390-dark.png'));
      await click(m, '[data-tap="pay-save"]', 700);
      const ws = await writesSince(m, w0);
      check('… tick ₵60 and Save: one write; that day is now entered', ws.length === 1 && ws[0][`paymentDays/${latest.date}/payments/${played[0]}`].amount === 60 && await m.evaluate(d => BF_PAY.hasRecord(d), latest.date), ws);
      await m.evaluate(() => { location.hash = '#/ref.money'; }); await sleep(400);
      const next = await m.evaluate(() => (document.querySelector('.adm-record [data-tap="record"]') || { dataset: {} }).dataset.date || null);
      check(`… back on Money, the card moves to the next one (${want[1] && want[1].date})`, next === want[1].date, next);
      await click(m, '.adm-record [data-tap="more-days"]', 400);
      check('"+ n more" → All dates with "Needs recording" first', await m.evaluate(() => location.hash.includes('all=1') && document.querySelector('.adm-reg-b > .lbl').textContent.includes('Needs recording')));
      await a.shot(path.join(OUT, 'money-all-needs-recording-390-dark.png'));
      // Needs you › Money not entered → the sheet
      await m.evaluate(() => { location.hash = '#/admin.home'; }); await sleep(400);
      await click(m, '[data-tap="need-money"]', 400);
      check(`Needs you › Money not entered: a sheet with the ${want.length - 1} still unrecorded, each "Record ›"`, await m.evaluate(n => { const r = [...document.querySelectorAll('.sh-admin-missing [data-tap="rec"]')]; return r.length === n && r.every(b => b.innerText.trim().endsWith('Record ›')); }, want.length - 1));
      await a.shot(path.join(OUT, 'needs-money-sheet-390-dark.png'));
    }
    check(`[${theme}] no console errors`, a.errors.length === 0, a.errors);
    await a.close();
  }
  // only one unrecorded day: Needs you goes straight to its register
  {
    const d1 = H.snapshot();
    const keep = '2026-10-12';
    Object.values(d1.sessions).forEach(x => { if (x && x.date !== keep && x.date > '2026-09-07' && x.date <= '2026-10-19') { x.payments = { seed_p001: { amount: 60, updatedAt: 1 } }; } });
    const a = await H.open({ width: 390, theme: 'dark', referee: true, route: '#/admin.home', now: TUE, data: d1 });
    const left = await a.page.evaluate(() => BF_PAY.overview().missing.map(r => r.date));
    await click(a.page, '[data-tap="need-money"]', 400);
    check('only one unrecorded (12 Oct): Money not entered goes straight to its register', left.length === 1 && left[0] === keep && await a.page.evaluate(k => document.querySelector('#app-screen section').dataset.screen === 'ref.moneyDay' && location.hash.includes(k) && !document.querySelector('.sh-admin-missing'), keep), left);
    await a.close();
  }
  // the referee on a day with no match: still just tonight's register (unchanged)
  {
    const rr = await H.open({ width: 390, theme: 'dark', referee: 'referee', route: '#/ref.money', now: TUE });
    check('referee, no match today: no record card, no switch, today\'s register', await rr.page.evaluate(() => !document.querySelector('.adm-record') && !document.querySelector('[data-seg="money-view"]') && !!document.querySelector('[data-part="top"]')));
    await rr.shot(path.join(OUT, 'referee-money-nomatch-390-dark.png'));
    check('referee: no console errors', rr.errors.length === 0, rr.errors);
    await rr.close();
  }

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
