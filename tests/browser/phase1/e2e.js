// Phase 1 end-to-end check: shell, Welcome, modes, sign-in, theme, save pattern, offline bar, laptop layout.
// Test mode only (harness). Screenshots → this folder.
const path = require('path');
const H = require('../harness.js');
const OUT = H.out(__dirname);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (label, ok, extra) => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', label, extra || ''); };
const screenId = page => page.evaluate(() => document.querySelector('#app-screen section')?.dataset.screen);
const theme = page => page.evaluate(() => document.documentElement.dataset.theme);
const tap = async (page, sel) => { await page.click(sel); await sleep(250); };

async function phoneFlow(themeName) {
  const W = 390;
  const s = await H.open({ width: W, theme: themeName, viewer: 'none' });
  const p = s.page, t = `${W}-${themeName}`;
  check(`[${t}] first open shows Welcome`, await screenId(p) === 'welcome');
  check(`[${t}] html data-theme = ${themeName}`, await theme(p) === themeName);
  check(`[${t}] Firebase never loaded`, await p.evaluate(() => !document.querySelector('script[src*="firebase"]') && Store.status().source === 'test'));
  await s.shot(path.join(OUT, `welcome-${t}.png`));

  // Round 7 front door: My stats → Find your name, no names until you type, then pick → Me (stats + match history)
  check(`[${t}] no names listed before typing`, await p.evaluate(() => !document.querySelector('#app-screen [data-tap="pick"]')));
  await tap(p, '#app-screen [data-tap="stats"]');
  check(`[${t}] My stats opens Find your name, still no names`, await p.evaluate(() => !!document.querySelector('[data-search="who"]') && !document.querySelector('#app-screen [data-tap="pick"]')));
  await p.type('[data-search="who"]', 'emm');
  await sleep(200);
  const hits = await p.$$eval('[data-fd-res] [data-tap="pick"] .nm', els => els.map(e => e.textContent));
  check(`[${t}] search "emm" filters`, hits.length >= 1 && hits.every(h => /emm/i.test(h)), hits.length + ' hits');
  check(`[${t}] search keeps focus`, await p.evaluate(() => document.activeElement && document.activeElement.dataset.search === 'who'));

  // pick Emmanuel → Me
  await tap(p, '[data-tap="pick"][data-pid="seed_p002"]');
  check(`[${t}] picking a name opens Me`, await screenId(p) === 'player.me');
  check(`[${t}] viewer remembered`, await p.evaluate(() => JSON.parse(localStorage.getItem('befit_viewer')).pid === 'seed_p002'));
  check(`[${t}] header shows the viewer`, (await p.$eval('#app-header', e => e.textContent)).includes('Emmanuel'));
  await s.shot(path.join(OUT, `player-live-${t}.png`));

  for (const [tab, want] of [['match', 'player.live'], ['tables', 'tables.teams'], ['me', 'player.me']]) {
    await tap(p, `#app-nav [data-tab="${tab}"]`);
    check(`[${t}] tab ${tab}`, await screenId(p) === want);
    if (tab !== 'tables') await s.shot(path.join(OUT, `player-${tab}-${t}.png`));
  }

  // theme switch from the name chip › Appearance (round 5: Me has no settings rows; they live in the header pill)
  await tap(p, '#app-header [data-shell="pill"]');
  await tap(p, '.sheet [data-tap="appearance"]');
  await s.shot(path.join(OUT, `appearance-sheet-${t}.png`));
  const other = themeName === 'dark' ? 'light' : 'dark';
  await tap(p, `.sheet [data-tap="theme"][data-value="${other}"]`);
  check(`[${t}] Appearance → ${other} switches the theme`, await theme(p) === other);
  check(`[${t}] theme remembered`, await p.evaluate(v => localStorage.getItem('befit_theme') === v, other));
  await tap(p, `.sheet [data-tap="theme"][data-value="auto"]`);
  check(`[${t}] Auto follows the phone (${themeName})`, await theme(p) === themeName);
  await p.keyboard.press('Escape'); await sleep(150);

  // admin sign-in (its own sheet: email + password): wrong then right
  await p.evaluate(() => App.openSignIn({ as: 'admin' })); await sleep(250);
  await p.type('.sheet input[name=email]', 'ref@befit.club');
  await p.type('.sheet input[name=password]', 'nope');
  await tap(p, '.sheet button[type=submit]'); await sleep(400);
  check(`[${t}] wrong password says so`, (await p.$eval('.sheet [data-err]', e => e.textContent)) === 'Wrong email or password');
  await p.click('.sheet input[name=password]', { clickCount: 3 });
  await p.type('.sheet input[name=password]', 'befit2024');
  await tap(p, '.sheet button[type=submit]'); await sleep(500);
  check(`[${t}] admin sign-in opens admin Home`, await screenId(p) === 'admin.home');
  check(`[${t}] admin nav = Home · Squad · Money · Settings`, (await p.$$eval('#app-nav .nav-a', a => a.map(x => x.textContent.trim()).join(' · '))) === 'Home · Squad · Money · Settings');
  await s.shot(path.join(OUT, `ref-home-${t}.png`));
  await tap(p, '#app-nav [data-tab="squad"]'); check(`[${t}] Squad tab`, await screenId(p) === 'ref.squad');
  await tap(p, '#app-nav [data-tab="money"]'); check(`[${t}] Money tab`, await screenId(p) === 'ref.money');
  await tap(p, '#app-nav [data-tab="home"]');
  // "Admin ▾" pill → Player view → back to the player's Home; the name chip → "Back to admin"
  await tap(p, '#app-header [data-shell="pill"]');
  await p.evaluate(() => [...document.querySelectorAll('.sheet [data-tap]')].find(x => /Player view/.test(x.innerText)).click()); await sleep(300);
  check(`[${t}] "Player view" back to the player tabs (Home)`, (await screenId(p)) === 'player.home');
  await tap(p, '#app-header [data-shell="pill"]');
  await p.evaluate(() => [...document.querySelectorAll('.sheet [data-tap]')].find(x => /Back to admin/.test(x.innerText)).click()); await sleep(300);
  check(`[${t}] name chip › Back to admin returns to admin Home`, (await screenId(p)) === 'admin.home');

  // match row → edit (stub) → back
  await tap(p, '[data-tap="edit"]');
  check(`[${t}] match row opens Edit match`, await screenId(p) === 'ref.edit');
  await tap(p, '#app-header [data-shell="back"]'); await sleep(200);
  check(`[${t}] Back returns`, await screenId(p) === 'admin.home');

  // save pattern: success → Undo bar; undo; failure → Not saved + Retry
  await p.evaluate(() => {
    const key = Store.newKey();
    window.__h = Save.run({ label: "Goal · Barnabas 72'", write: () => Store.set('sessions/__t/events/' + key, { type: 'goal', min: 72 }), undo: () => Store.remove('sessions/__t/events/' + key) });
    window.__key = key;
  });
  await sleep(400);
  check(`[${t}] save → Undo bar`, await p.evaluate(() => !!document.querySelector('.undo:not(.err) [data-act="undo"]') && __h.state === 'saved'));
  check(`[${t}] write landed in memory`, await p.evaluate(() => !!Store.get('sessions/__t/events/' + __key)));
  await s.shot(path.join(OUT, `undo-bar-${t}.png`));
  await tap(p, '.undo [data-act="undo"]'); await sleep(400);
  check(`[${t}] Undo removes it`, await p.evaluate(() => !Store.get('sessions/__t') && __h.state === 'undone'));
  await p.evaluate(() => { Store.test.failNext(1); window.__h2 = Save.run({ label: 'Block · Andrew 34\'', write: () => Store.set('sessions/__t/x', 1) }); });
  await sleep(500);
  check(`[${t}] failed save → orange "Not saved" + Retry`, await p.evaluate(() => !!document.querySelector('.undo.err [data-act="retry"]') && __h2.state === 'error'));
  await s.shot(path.join(OUT, `undo-error-${t}.png`));
  await tap(p, '.undo.err [data-act="retry"]'); await sleep(500);
  check(`[${t}] Retry saves`, await p.evaluate(() => __h2.state === 'saved' && Store.get('sessions/__t/x') === 1));
  await p.evaluate(() => Store.remove('sessions/__t'));

  // double tap guard on a button
  const count = await p.evaluate(async () => {
    const b = document.createElement('button'); document.body.appendChild(b);
    let n = 0;
    const run = () => Save.run({ label: 'x', button: b, bar: false, write: () => { n++; return new Promise(r => setTimeout(r, 200)); } });
    run(); run(); run();
    await new Promise(r => setTimeout(r, 400)); b.remove(); return n;
  });
  check(`[${t}] three fast taps = one write`, count === 1, `writes: ${count}`);

  // hold-to-confirm: short press cancels, 2 s hold completes
  await p.evaluate(() => {
    const h = UI.sheet.open({ title: 'Match', body: UI.hold('Hold to end the game', { name: 'end' }) });
    window.__held = 0; UI.onHold(h.el, 'end', () => { window.__held++; });
  });
  await sleep(450);
  const box = await p.$eval('.sheet .hold', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.move(box.x, box.y); await p.mouse.down(); await sleep(600); await p.mouse.up(); await sleep(100);
  check(`[${t}] hold released early does nothing`, await p.evaluate(() => window.__held === 0));
  await p.mouse.down(); await sleep(2200); await p.mouse.up(); await sleep(100);  // (a screenshot mid-hold would cancel it: Chrome sends pointerleave)
  check(`[${t}] hold 2 s confirms once`, await p.evaluate(() => window.__held === 1 && document.querySelector('.sheet .hold .hl').textContent === 'Ending…'));
  await s.shot(path.join(OUT, `hold-done-${t}.png`));
  await p.keyboard.press('Escape'); await sleep(150);

  // offline bar
  await p.evaluate(() => Store.test.setStatus('offline')); await sleep(200);
  check(`[${t}] offline bar shows`, await p.evaluate(() => !!document.querySelector('#app-status .offline')));
  await s.shot(path.join(OUT, `offline-${t}.png`));
  await p.evaluate(() => Store.test.setStatus('online')); await sleep(200);
  check(`[${t}] offline bar clears when back`, await p.evaluate(() => !document.querySelector('#app-status .offline')));

  // console stays dark in light theme (Always dark), and follows the app when switched
  if (themeName === 'light') {
    await p.evaluate(() => App.go('ref.console')); await sleep(300);
    check(`[${t}] console screen forced dark`, await theme(p) === 'dark');
    await p.evaluate(() => App.theme.setConsole('app')); await sleep(100);
    check(`[${t}] console "Same as the app" → light`, await theme(p) === 'light');
    // round 5: ref.home now routes the referee to the Match tab (ref.setup, a console screen), so leave to Money tonight
    await p.evaluate(() => { App.theme.setConsole('dark'); App.go('ref.money', {}, { replace: true }); }); await sleep(300);
    check(`[${t}] leaving the console restores light`, await theme(p) === 'light');
  }

  // sign out
  await p.evaluate(() => App.signOut()); await sleep(300);
  check(`[${t}] sign out → Player mode`, (await screenId(p)).startsWith('player.') && await p.evaluate(() => !Auth.isReferee()));
  check(`[${t}] no errors`, s.errors.length === 0, s.errors.join(' | '));
  await s.close();
}

async function components(themeName) {
  // A sheet that shows the shared pieces with real names: team switch, Recent chips, 64 px tiles, rows with marks.
  const s = await H.open({ width: 390, theme: themeName, viewer: 'seed_p002', referee: true, route: '#/ref.home' });
  const p = s.page;
  await p.evaluate(() => {
    const db = Store.state;
    const last = Scoring.lastGame(db);
    const sp = Scoring.sessPlayers(last.sess, db);
    const order = { DEF: 0, MID: 1, FWD: 2, GK: 3 };
    const red = sp.filter(x => x.team === 'red').sort((a, b) => order[a.pos] - order[b.pos] || a.name.localeCompare(b.name));
    const counts = Scoring.orderTeams(Scoring.teamsOf(last.sess)).map(t => ({ team: t, count: sp.filter(x => x.team === t).length }));
    UI.sheet.open({ title: 'Block', titleEnd: "34'", cancel: true, body:
      UI.teamSwitch('side', counts, 'red', { ref: true }) +
      `<div class="lbl mt-3">Recent tonight</div>` + UI.chips('recent', red.slice(0, 3).map(x => ({ value: x.pid, label: x.name })), { ref: true }) +
      `<div class="mt-3">${UI.tiles(red.map(x => UI.tile({ name: x.name, pos: x.pos, tap: 'pick', data: { pid: x.pid } })))}</div>` });
  });
  await sleep(300);
  await s.shot(path.join(OUT, `components-sheet-390-${themeName}.png`));
  const tileH = await p.$$eval('.sheet .ptile', els => els.map(e => Math.round(e.getBoundingClientRect().height)));
  check(`[components ${themeName}] tiles are 64 px`, tileH.length > 0 && tileH.every(h => h === 64), tileH.join(','));
  const pad = await p.$eval('.sheet', e => getComputedStyle(e).paddingBottom);
  check(`[components ${themeName}] sheet keeps 34 px under the last action`, pad === '34px', pad);
  const small = await p.evaluate(() => Array.from(document.querySelectorAll('#app *, .sheet *')).filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.className + ':' + getComputedStyle(e).fontSize));
  check(`[components ${themeName}] no text under 12 px`, small.length === 0, small.slice(0, 5).join(' '));
  const sideways = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(`[components ${themeName}] no sideways scroll`, !sideways);
  await p.keyboard.press('Escape'); await sleep(150);
  await s.close();
}

async function laptop(themeName) {
  const s = await H.open({ width: 1280, theme: themeName, viewer: 'seed_p002' });
  const p = s.page, t = `1280-${themeName}`;
  check(`[${t}] rail visible, bottom nav hidden`, await p.evaluate(() => getComputedStyle(document.getElementById('app-rail')).display !== 'none' && getComputedStyle(document.getElementById('app-nav')).display === 'none'));
  await s.shot(path.join(OUT, `player-live-${t}.png`));
  await p.evaluate(() => App.goTab('table')); await sleep(300);
  await s.shot(path.join(OUT, `player-table-${t}.png`));
  const w = await p.$eval('#app-screen', e => e.getBoundingClientRect().width);
  check(`[${t}] content max 1040 (+gutters)`, w <= 1040 + 48 + 1, Math.round(w) + ' px');
  await p.evaluate(() => App.go('welcome')); await sleep(300);
  await s.shot(path.join(OUT, `welcome-${t}.png`));
  const fd = await p.evaluate(() => {
    const s = document.querySelector('#app-screen section'), l = s.querySelector('.fd-l'), r = s.querySelector('.fd-r');
    const lk = s.querySelector('.fd-lk').getBoundingClientRect(), dr = s.querySelector('.fd-doors').getBoundingClientRect(), lr = l.getBoundingClientRect(), rr = r.getBoundingClientRect();
    return { section: s.dataset.theme, app: document.documentElement.dataset.theme, bg: getComputedStyle(s).getPropertyValue('--bg').trim().toLowerCase(), cols: lr.right <= rr.left + 1 && Math.abs(lr.top - rr.top) < 2,
      lk: Math.round(lk.width) + '×' + Math.round(lk.height), doors: Math.round(dr.width), block: !!l.querySelector('.sb') && /6/.test((l.querySelector('.sb-half.t-green') || {}).innerText || '') && /4/.test((l.querySelector('.sb-half.t-red') || {}).innerText || ''),
      noHeader: document.getElementById('app-header').hidden && getComputedStyle(document.getElementById('app-rail')).display === 'none', name: getComputedStyle(s.querySelector('.fd-wm')).fontSize };
  });
  check(`[${t}] front door on a laptop: two columns, lockup 320×160, name 44 px, doors ≤ 440 wide, last game as the joined score block on the left, no header or rail`,
    fd.cols && fd.lk === '320×160' && fd.name === '44px' && fd.doors <= 440 && fd.block && fd.noHeader, fd);
  check(`[${t}] front door is always dark (screen data-theme=dark, --bg #0b0d10) even when the app is ${themeName}`, fd.section === 'dark' && fd.bg === '#0b0d10' && fd.app === themeName, fd);
  await p.evaluate(() => Auth.signIn('ref@befit.club', 'befit2024')); await sleep(400);
  await p.evaluate(() => { App.setMode('referee'); App.goTab('match'); }); await sleep(300);
  await s.shot(path.join(OUT, `ref-home-${t}.png`));
  await p.evaluate(() => App.go('ref.console')); await sleep(300);
  const cw = await p.$eval('#app-screen', e => e.getBoundingClientRect().width);
  check(`[${t}] console stays phone-width (${Math.round(cw)} px)`, cw <= 480);
  await s.shot(path.join(OUT, `ref-console-${t}.png`));
  check(`[${t}] no errors`, s.errors.length === 0, s.errors.join(' | '));
  await s.close();
}

(async () => {
  for (const th of ['dark', 'light']) await phoneFlow(th);
  for (const th of ['dark', 'light']) await components(th);
  for (const th of ['dark', 'light']) await laptop(th);
  console.log(fails ? `\n${fails} FAILED` : '\nAll Phase 1 end-to-end checks passed');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
