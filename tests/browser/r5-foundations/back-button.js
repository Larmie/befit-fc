// Round 8, "the flow" (Reuben's screen map walkthrough, 5 Nov 2026): the phone's Back button, the one back arrow,
// the name box on the menu, the password eye, and the popups you type into sitting in the upper middle.
//   Back: a popup closes · an inner page → the page before (or its tab) · another tab → the first tab
//         · Home or the menu → "Press back again to exit", then the next Back leaves.
// TEST MODE ONLY, via the harness (in-memory data, no Firebase). history.back() stands in for the phone's button.
// Chrome on a phone SKIPS, on Back, any history entry a page added without a tap, and a test's history.back() can't
// show that. So the spy below fails the suite if the app adds an entry while handling Back (6 Nov: on Reuben's phone
// the old guard was re-added on Back, Chrome skipped it, and the app closed with no "Press back again to exit").
// Run: node tests/browser/r5-foundations/back-button.js
'use strict';
const path = require('path');
const H = require('../harness.js');
const P = require('../../paths.js');
const OUT = P.out(__dirname);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('ok   ' + n); } else { bad++; console.log('FAIL ' + n + (x !== undefined ? ' → ' + JSON.stringify(x) : '')); } };
const NOW = new Date('2026-10-26T19:00:00').getTime();
const scr = p => p.evaluate(() => { try { return (document.querySelector('#app-screen section') || {}).dataset?.screen || null; } catch (e) { return 'GONE'; } });
const where = p => p.evaluate(() => (typeof App === 'undefined' ? 'LEFT:' + location.href : (document.querySelector('#app-screen section') || {}).dataset?.screen));
const realClick = async (p, sel, w = 450) => { const el = await p.waitForSelector(sel, { visible: true, timeout: 5000 }); await el.click(); await sleep(w); };
const back = async (p, w = 450) => { try { await p.evaluate(() => history.back()); } catch (e) { /* the page left */ } await sleep(w); };
const toast = p => p.evaluate(() => { const t = document.querySelector('#app-toast .toast, .toast'); return t ? t.innerText : ''; });
const sheetOpen = p => p.evaluate(() => !!document.querySelector('#app-layer .sheet'));
// counts history entries the app adds while it handles Back (popstate) or a hash change, i.e. not from a tap
const spy = p => p.evaluate(() => {
  window.__untrusted = [];
  const push = history.pushState.bind(history);
  history.pushState = function (st, t, u) { const ev = window.event; if (ev && (ev.type === 'popstate' || ev.type === 'hashchange')) window.__untrusted.push((st && st.bf) + ' in ' + ev.type); return push(st, t, u); };
});
const untrusted = p => p.evaluate(() => window.__untrusted || []).catch(() => ['(page gone)']);

(async () => {
  // ---- 1 · the menu, the name box, state find
  {
    const s = await H.open({ width: 390, height: 844, viewer: 'none', now: NOW, scale: 1 }); const p = s.page;
    await spy(p);
    await sleep(400);
    await p.screenshot({ path: path.join(OUT, 'menu.jpg'), type: 'jpeg', quality: 75 });
    const m = await p.evaluate(() => ({ box: !!document.querySelector('.fd-find:not(.is-quiet) [data-search="who"]'), label: (document.querySelector('.fd-find-l') || {}).innerText, stats: !!document.querySelector('[data-tap="stats"]'), h: document.scrollingElement.scrollHeight, ph: (document.querySelector('[data-search="who"]') || {}).placeholder }));
    check('menu: the name box is the first door, "Find your name to view your stats", placeholder "Type your name"', m.box && m.label === 'Find your name to view your stats' && m.ph === 'Type your name', m);
    check('menu: no "My stats" door any more', !m.stats);
    check('menu fits one 844 px phone screen', m.h <= 844, m.h);
    await realClick(p, '[data-search="who"]', 200);
    await p.keyboard.type('Emm'); await sleep(450);
    await p.screenshot({ path: path.join(OUT, 'menu-find.jpg'), type: 'jpeg', quality: 75 });
    const f = await p.evaluate(() => { const vis = q => { const e = document.querySelector(q); return !!e && e.getBoundingClientRect().height > 0; }; return { find: document.querySelector('.scr-welcome').classList.contains('is-find'), title: vis('.fd-title'), doors: [...document.querySelectorAll('.fd-door')].some(e => e.getBoundingClientRect().height > 0), back: vis('.fd-back'), res: document.querySelectorAll('[data-fd-res] [data-tap="pick"]').length, focus: document.activeElement && document.activeElement.matches('[data-search="who"]'), top: Math.round(document.querySelector('[data-search="who"]').getBoundingClientRect().top) }; });
    check('typing fades the rest out: only the name box, its back arrow and the results are left', f.find && !f.title && !f.doors && f.back && f.res > 0, f);
    check('… the box keeps focus (the keyboard stays up) and moves to the top', f.focus && f.top < 200, f);
    await back(p);
    const b1 = await p.evaluate(() => ({ find: document.querySelector('.scr-welcome').classList.contains('is-find'), doors: document.querySelectorAll('.fd-door').length, app: typeof App !== 'undefined' }));
    check("phone Back in state find → the menu, not out of the app", b1.app && !b1.find && b1.doors >= 3, b1);
    await realClick(p, '[data-search="who"]', 200); await p.keyboard.type('Emm'); await sleep(450);
    await realClick(p, '.fd-back', 400);
    check('the back arrow in state find → the menu', await p.evaluate(() => !document.querySelector('.scr-welcome').classList.contains('is-find')));
    // pick a name → Me, then the phone Back
    await realClick(p, '[data-search="who"]', 200); await p.keyboard.type('Emmanuel O'); await sleep(450);
    await realClick(p, '[data-fd-res] [data-tap="pick"]', 700);
    check('tap a name → Me', await scr(p) === 'player.me');
    await p.screenshot({ path: path.join(OUT, 'me.jpg'), type: 'jpeg', quality: 75 });
    const hb = await p.evaluate(() => { const b = document.querySelector('#app-header .hd-l .hd-back'); const r = b && b.getBoundingClientRect(); return b ? { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), t: b.innerText.trim(), brand: !!document.querySelector('#app-header .hd-l .brandbtn') } : null; });
    check('Me has the back arrow top left (44 px or more), the BE FIT mark beside it', hb && hb.x <= 20 && hb.h >= 44 && hb.w >= 44 && hb.brand, hb);
    await back(p);
    check('phone Back on Me → Home', await where(p) === 'player.home', await where(p));
    await back(p);
    check('phone Back on Home → still Home, "Press back again to exit"', await where(p) === 'player.home' && /Press back again to exit/.test(await toast(p)), [await where(p), await toast(p)]);
    const u1 = await untrusted(p);
    check('Back never adds a history entry by itself (Chrome would skip it, and the next Back would leave)', u1.length === 0, u1);
    await back(p, 700);
    const gone = await p.evaluate(() => (typeof App === 'undefined' ? 'LEFT:' + location.href : 'still in')).catch(() => 'LEFT');
    check('the next Back leaves the app', /^LEFT:/.test(String(gone)), gone);
    await s.close();
  }
  // ---- 2 · tabs and inner pages, popups
  {
    const s = await H.open({ width: 390, height: 844, viewer: 'seed_p002', route: '#/player.home', now: NOW, scale: 1 }); const p = s.page;
    await spy(p);
    await sleep(300);
    check('Home has no back arrow (it is the first tab)', !(await p.$('#app-header .hd-back')));
    await realClick(p, '#app-nav [data-tab="tables"]'); await realClick(p, '#app-nav [data-tab="match"]');
    await realClick(p, '#app-screen [data-tap="match"]', 600);
    const g = await scr(p);
    check('Home → Tables → Match → a game', g === 'player.match', g);
    await back(p); check('Back from the game → the Match tab', await scr(p) === 'player.live', await scr(p));
    await back(p); check('Back from the Match tab → Home (the tabs in between are skipped)', await where(p) === 'player.home', await where(p));
    await realClick(p, '#app-nav [data-tab="tables"]');
    await realClick(p, '#app-header [data-shell="pill"]', 400);
    check('the name button opens its popup', await sheetOpen(p));
    await back(p);
    check('Back with a popup open closes the popup and stays on Tables', !(await sheetOpen(p)) && /^tables\./.test(await scr(p)), await scr(p));
    await realClick(p, '#app-header .hd-back', 500);
    check('the back arrow on the Tables tab → Home', await scr(p) === 'player.home', await scr(p));
    const u2 = await untrusted(p);
    check('… and closing a popup with Back adds no history entry either', u2.length === 0, u2);
    // the real-phone case (6 Nov): a tab, Back up to Home, then straight Back again with no tap in between: it must warn
    await realClick(p, '#app-nav [data-tab="tables"]');
    await back(p); check('Tables → Back → Home', await where(p) === 'player.home', await where(p));
    await back(p);
    check('… straight Back again (no tap): still Home, "Press back again to exit"', await where(p) === 'player.home' && /Press back again to exit/.test(await toast(p)), [await where(p), await toast(p)]);
    const u3 = await untrusted(p);
    check('… with no history entry added on Back', u3.length === 0, u3);
    await realClick(p, '#app-nav [data-tab="match"]');
    check('a tap after the warning: the app carries on (Match)', await scr(p) === 'player.live', await scr(p));
    await back(p); check('… and Back is guarded again (Home)', await where(p) === 'player.home', await where(p));
    // inner page reached straight from a link, no history: the arrow goes to its tab
    await p.evaluate(() => App.go('player.profile', { pid: 'seed_p044' }, { replace: true })); await sleep(400);
    await p.evaluate(() => { document.querySelector('#app-header .hd-back').click(); }); await sleep(500);
    const up = await scr(p);
    check('someone else\'s page with nothing behind it: the arrow → its tab (Tables), not out', /^tables\./.test(up), up);
    // 360 px: the header fits with a long name
    await p.setViewport({ width: 360, height: 780 }); await sleep(300);
    await p.evaluate(() => App.go('player.profile', { pid: 'seed_p044' })); await sleep(400);
    const fit = await p.evaluate(() => { const hd = document.querySelector('#app-header'); const els = [...hd.querySelectorAll('.hd-l > *, .hd-r > *')].map(e => e.getBoundingClientRect()); return { over: els.some((r, i) => els.some((q, j) => i < j && r.right > q.left + 1 && q.right > r.left + 1)), right: Math.max(...els.map(r => r.right)), w: innerWidth }; });
    check('360 px: the arrow, the mark and the name button don\'t overlap or spill', !fit.over && fit.right <= fit.w, fit);
    await p.screenshot({ path: path.join(OUT, 'profile-360.jpg'), type: 'jpeg', quality: 75 });
    check('no page errors (player)', !s.errors.length, s.errors);
    await s.close();
  }
  // ---- 3 · referee: sign-in in the middle, the eye, Find a player in the middle
  {
    const s = await H.open({ width: 390, height: 844, viewer: 'none', now: NOW, scale: 1 }); const p = s.page;
    await realClick(p, '[data-tap="referee"]', 500);
    const box = await p.evaluate(() => { const r = document.querySelector('.sh-shell-signin').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), dim: !!document.querySelector('.dim') }; });
    check('referee sign-in sits in the upper middle (top 12% of the screen, clear of a keyboard), page dimmed', box.top >= 90 && box.top <= 120 && box.bottom < 470 && box.left >= 12 && box.dim, box);
    await p.screenshot({ path: path.join(OUT, 'ref-signin.jpg'), type: 'jpeg', quality: 75 });
    await realClick(p, '.sh-shell-signin input[type=password]', 100); await p.keyboard.type('abc');
    await realClick(p, '.sh-shell-signin [data-eye]', 200);
    const e1 = await p.evaluate(() => { const i = document.querySelector('.sh-shell-signin input[name=password]'); const b = document.querySelector('.sh-shell-signin [data-eye]'); const r = b.getBoundingClientRect(); return { type: i.type, val: i.value, label: b.getAttribute('aria-label'), focus: document.activeElement === i, w: Math.round(r.width), h: Math.round(r.height) }; });
    check('the eye shows the password, keeps the keyboard (focus) and is 44 px', e1.type === 'text' && e1.val === 'abc' && e1.label === 'Hide password' && e1.focus && e1.w >= 44 && e1.h >= 44, e1);
    await p.screenshot({ path: path.join(OUT, 'ref-signin-eye.jpg'), type: 'jpeg', quality: 75 });
    await realClick(p, '.sh-shell-signin [data-eye]', 200);
    check('tap again hides it', await p.$eval('.sh-shell-signin input[name=password]', i => i.type) === 'password');
    await back(p);
    check('Back closes the sign-in popup and stays on the menu', !(await sheetOpen(p)) && await where(p) === 'welcome', await where(p));
    await realClick(p, '[data-tap="referee"]', 500);
    await p.$eval('.sh-shell-signin input[type=password]', i => { i.value = window.BF_CONFIG.ADMIN_PW; });
    await realClick(p, '.sh-shell-signin button[type=submit]', 900);
    check('signed in → Who\'s here, no back arrow (first tab)', await scr(p) === 'ref.setup' && !(await p.$('#app-header .hd-back')), await scr(p));
    await realClick(p, '.scr-ref-setup [data-tap="find"][data-kind="find"]', 500);
    const fb = await p.evaluate(() => { const r = document.querySelector('.sh-setup-new').getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; });
    check('Find a player sits in the upper middle too', fb.top >= 90 && fb.top <= 120, fb);
    await p.screenshot({ path: path.join(OUT, 'ref-find.jpg'), type: 'jpeg', quality: 75 });
    await back(p);
    check('Back closes it', !(await sheetOpen(p)) && await scr(p) === 'ref.setup');
    await realClick(p, '#app-nav [data-tab="money"]', 500);
    check('Money tonight has the back arrow', !!(await p.$('#app-header .hd-back')));
    await back(p);
    check('Back on Money tonight → the Match tab', await where(p) === 'ref.setup', await where(p));
    check('no page errors (referee)', !s.errors.length, s.errors);
    await s.close();
  }
  // ---- 4 · admin
  {
    const s = await H.open({ width: 390, height: 844, viewer: 'none', now: NOW, scale: 1 }); const p = s.page;
    await realClick(p, '[data-tap="admin"]', 500);
    await p.type('.sh-shell-signin input[type=email]', 'admin@test');
    await p.$eval('.sh-shell-signin input[type=password]', i => { i.value = window.BF_CONFIG.ADMIN_PW; });
    await p.screenshot({ path: path.join(OUT, 'adm-signin.jpg'), type: 'jpeg', quality: 75 });
    await realClick(p, '.sh-shell-signin button[type=submit]', 900);
    check('admin Home, no back arrow', await scr(p) === 'admin.home' && !(await p.$('#app-header .hd-back')));
    await realClick(p, '#app-nav [data-tab="squad"]', 500);
    await realClick(p, '#app-screen [data-tap="open"]', 600);
    check('Squad → a player (Edit a player) has the back arrow', await scr(p) === 'ref.player' && !!(await p.$('#app-header .hd-back')), await scr(p));
    await p.screenshot({ path: path.join(OUT, 'adm-player.jpg'), type: 'jpeg', quality: 75 });
    await back(p); check('Back → Squad', await scr(p) === 'ref.squad', await scr(p));
    await back(p); check('Back → Home', await where(p) === 'admin.home', await where(p));
    await p.evaluate(sid => App.go('ref.edit', { sid }), '-P3lenQyxWIniPyrtFAn'); await sleep(500);
    const ed = await p.evaluate(() => ({ arrow: !!document.querySelector('#app-header .hd-back'), done: [...document.querySelectorAll('#app-header button')].some(b => b.innerText.trim() === 'Done') }));
    check('Edit a game: the back arrow, no "Done"', ed.arrow && !ed.done, ed);
    await p.evaluate(() => App.go('ref.pastGame')); await sleep(500);
    const pg = await p.evaluate(() => ({ arrow: !!document.querySelector('#app-header .hd-back'), close: [...document.querySelectorAll('#app-header button')].some(b => b.innerText.trim() === 'Close') }));
    check('Log a past game: the back arrow, no "Close"', pg.arrow && !pg.close, pg);
    check('no page errors (admin)', !s.errors.length, s.errors);
    await s.close();
  }
  // ---- 5 · laptop
  {
    const s = await H.open({ width: 1280, height: 800, viewer: 'none', now: NOW, scale: 1 }); const p = s.page;
    await sleep(300);
    await p.screenshot({ path: path.join(OUT, 'laptop-menu.jpg'), type: 'jpeg', quality: 72 });
    await realClick(p, '[data-search="who"]', 200); await p.keyboard.type('Emm'); await sleep(450);
    await p.screenshot({ path: path.join(OUT, 'laptop-find.jpg'), type: 'jpeg', quality: 72 });
    check('laptop: find keeps the left column (its title too), hides the other doors', await p.evaluate(() => document.querySelector('.fd-l .fd-title').getBoundingClientRect().height > 0 && ![...document.querySelectorAll('.fd-door')].some(e => e.getBoundingClientRect().height > 0)));
    check('no page errors (laptop)', !s.errors.length, s.errors);
    await s.close();
  }
  console.log(`\n${ok} ok, ${bad} FAIL`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
