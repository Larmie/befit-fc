// Front door, "the way back": the brand button in every header, "Back to menu" + "Sign out" in the pill sheets and the
// laptop rail, the guest "Referee or admin only · Sign in ›" toast, and the wording sweep (Referee / Admin, no "I’m the …").
// TEST MODE ONLY, via the harness (in-memory data, no Firebase).
// Run: node tests/browser/r5-foundations/way-back.js
'use strict';
const path = require('path');
const H = require('../harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (name, cond, extra) => { if (cond) { oks++; console.log('ok   ' + name); } else { fails++; console.log('FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } };
const screenId = p => p.evaluate(() => (document.querySelector('#app-screen section') || {}).dataset?.screen || null);
const click = async (p, sel) => { await p.evaluate(s => { const el = document.querySelector(s); if (!el) throw new Error('no ' + s); el.click(); }, sel); await sleep(400); };
const openPill = async p => { await click(p, '#app-header [data-shell="pill"]'); await sleep(200); };
const sheetBtns = p => p.evaluate(() => [...document.querySelectorAll('#app-layer .sheet .sh-end .btn')].map(b => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width), tap: b.dataset.tap, cls: b.className, colour: getComputedStyle(b).color })));
const sheetText = p => p.evaluate(() => { const s = [...document.querySelectorAll('#app-layer .sheet')].pop(); return s ? s.innerText : ''; });
const redToken = p => p.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--red)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
const NOW = new Date('2026-10-19T19:30:00').getTime();
function liveData() {   // the 19 Oct match frozen at 30', running
  const d = H.snapshot();
  const sid = Object.keys(d.sessions).find(k => d.sessions[k].date === '2026-10-19');
  const s = d.sessions[sid];
  s.status = 'active';
  for (const [k, e] of Object.entries(s.events)) if (e.min == null || e.min > 30 || e.stoppageMin != null) delete s.events[k];
  s.timer = { status: 'running', startedAt: NOW - 30 * 60000, pausedAt: null, pausedTotal: 0, htLogged: false, endedAt: null, stoppageStartedAt: null, stoppageTotal: 0 };
  delete s.goals; delete s.cleanSheets;
  return d;
}
const MARK_PATH = 'M6 64H22L28 55L35 73L43 30L50 64H58V40H94V64';

const ROLES = [
  { name: 'guest', open: { viewer: 'guest', route: '#/guest.home' }, brandText: 'BE FIT', h: 44, sheet: ['Back to menu'], staff: false },
  { name: 'player', open: { viewer: 'seed_p002', route: '#/player.home' }, brandText: 'BE FIT', h: 44, sheet: ['Back to menu'], staff: false },
  { name: 'referee', open: { viewer: 'guest', referee: 'referee', route: '#/ref.setup' }, brandText: '', h: 48, sheet: ['Back to menu', 'Sign out'], staff: true },
  { name: 'admin', open: { viewer: 'guest', referee: 'admin', route: '#/admin.home' }, brandText: 'BE FIT', h: 48, sheet: ['Referee console', 'Back to menu', 'Sign out'], staff: true },
];

(async () => {
  const RED = await (async () => { const s = await H.open({ viewer: 'guest', width: 390 }); const r = await redToken(s.page); await s.close(); return r; })();

  for (const R of ROLES) {
    // ---------------------------------------------------------- the brand button + the pill sheet, phone width
    {
      const s = await H.open(Object.assign({ width: 390 }, R.open));
      const p = s.page;
      const b = await p.evaluate(() => {
        const el = document.querySelector('#app-header .hd-l .brandbtn');
        if (!el) return null;
        const r = el.getBoundingClientRect(), svg = el.querySelector('svg'), sr = svg && svg.getBoundingClientRect();
        const club = el.querySelector('.wmk-club');
        return { tag: el.tagName, shell: el.dataset.shell, label: el.getAttribute('aria-label'), h: Math.round(r.height), w: Math.round(r.width), mark: sr && [Math.round(sr.width), Math.round(sr.height)],
          markPath: [...el.querySelectorAll('svg path')].some(x => x.getAttribute('d') === 'M6 64H22L28 55L35 73L43 30L50 64H58V40H94V64'),
          text: (el.querySelector('.wmk') || { textContent: '' }).textContent.replace(/\s*CLUB$/, '').trim(), clubShown: club ? getComputedStyle(club).display !== 'none' : false,
          fs: el.querySelector('.wmk') ? getComputedStyle(el.querySelector('.wmk')).fontSize + '/' + getComputedStyle(el.querySelector('.wmk')).fontWeight : '', plainWm: !!document.querySelector('#app-header .wm') };
      });
      check(`[${R.name}] header left is a "Back to menu" button (data-shell="welcome"), ${R.h} px tall`, !!b && b.tag === 'BUTTON' && b.shell === 'welcome' && b.label === 'Back to menu' && b.h >= R.h, b);
      check(`[${R.name}] it shows the 24 px square mark (the Goal Pulse path) and ${R.brandText ? '"BE FIT"' : 'no words (the mark alone)'}; "CLUB" is dropped on phones`, !!b && b.mark[0] === 24 && b.mark[1] === 24 && b.markPath && b.text === R.brandText && !b.clubShown && !b.plainWm, b);
      if (R.brandText) check(`[${R.name}] "BE FIT" is 12.5 px / 750`, b.fs === '12.5px/750', b.fs);
      const clash = await p.evaluate(() => {
        const hd = document.querySelector('#app-header'), vis = e => e && e.getBoundingClientRect().width > 0;
        const kids = [...hd.querySelectorAll('.hd-l, .hd-c, .hd-r')].filter(vis).map(e => { const k = [...e.children].filter(vis); return k.length ? [Math.min(...k.map(x => x.getBoundingClientRect().left)), Math.max(...k.map(x => x.getBoundingClientRect().right))] : null; }).filter(Boolean).sort((a, c) => a[0] - c[0]);
        let overlap = false; for (let i = 1; i < kids.length; i++) if (kids[i][0] < kids[i - 1][1] - 0.5) overlap = true;
        return { overlap, hs: document.documentElement.scrollWidth - innerWidth, pillRight: Math.round(document.querySelector('#app-header [data-shell="pill"]').getBoundingClientRect().right), innerWidth };
      });
      check(`[${R.name}] header parts don't overlap, the pill stays inside the screen, no sideways scroll`, !clash.overlap && clash.hs <= 0 && clash.pillRight <= clash.innerWidth - 12, clash);
      await s.shot(path.join(H.out(__dirname, 'shots'), `way-back-header-${R.name}-390.png`), { clip: { x: 0, y: 0, width: 390, height: 60 } });

      await openPill(p);
      const btns = await sheetBtns(p);
      check(`[${R.name}] the pill sheet ends with full-width 48 px buttons: ${R.sheet.join(' · ')}`, JSON.stringify(btns.map(x => x.t)) === JSON.stringify(R.sheet) && btns.every(x => x.h === 48 && x.w >= 330), btns);
      const bm = btns.find(x => x.t === 'Back to menu');
      check(`[${R.name}] Back to menu is the grey button (.btn.g)`, !!bm && / g( |$)/.test(bm.cls), bm);
      const so = btns.find(x => x.t === 'Sign out');
      check(`[${R.name}] ${R.staff ? 'Sign out is outlined with red text' : 'no Sign out (nobody is signed in)'}`, R.staff ? !!so && / o( |$)/.test(so.cls) && so.colour === RED : !so, [so, RED]);
      const st = await sheetText(p);
      check(`[${R.name}] no "Not <name>? Switch" row and no "I’m the …" wording`, !/Not .+\? Switch/.test(st) && !/I’m the|I'm the|Just browsing/.test(st), st);
      await s.shot(path.join(H.out(__dirname, 'shots'), `way-back-pill-${R.name}-390.png`));
      // Back to menu from the sheet
      await click(p, '#app-layer .sheet [data-tap="menu"]');
      check(`[${R.name}] sheet › Back to menu opens the front door and closes the sheet`, await screenId(p) === 'welcome' && await p.evaluate(() => !document.querySelector('#app-layer .sheet')), await screenId(p));
      const keep = await p.evaluate(() => ({ ref: Auth.isReferee(), admin: Auth.isAdmin(), viewer: App.viewer() }));
      check(`[${R.name}] …and ${R.staff ? 'stays signed in' : 'still remembers who you are'}`, R.name === 'referee' ? keep.ref && !keep.admin : R.name === 'admin' ? keep.admin : R.name === 'player' ? !!keep.viewer : !keep.ref, keep);
      check(`[${R.name}] no console errors`, !s.errors.length, s.errors);
      await s.close();
    }
    // ---------------------------------------------------------- tapping the brand button itself
    {
      const s = await H.open(Object.assign({ width: 390 }, R.open));
      const p = s.page;
      await click(p, '#app-header .hd-l .brandbtn');
      const k = await p.evaluate(() => ({ ref: Auth.isReferee(), admin: Auth.isAdmin() }));
      check(`[${R.name}] tapping the brand button goes to the front door${R.staff ? ' and keeps the staff signed in' : ''}`, await screenId(p) === 'welcome' && (R.staff ? k.ref : !k.ref) && (R.name === 'admin' ? k.admin : true), [await screenId(p), k]);
      await s.close();
    }
    // ---------------------------------------------------------- Sign out (staff)
    if (R.staff) {
      const s = await H.open(Object.assign({ width: 390 }, R.open, { viewer: 'none' }));
      const p = s.page;
      await openPill(p);
      await click(p, '#app-layer .sheet [data-tap="signout"]');
      check(`[${R.name}] sheet › Sign out signs out and lands on the front door`, await screenId(p) === 'welcome' && await p.evaluate(() => !Auth.isReferee()), await screenId(p));
      await s.close();
    }
  }

  // ---------------------------------------------------------- admin sheet: Referee console works from the last group
  {
    const s = await H.open(Object.assign({ width: 390 }, ROLES[3].open));
    const p = s.page;
    await openPill(p); await click(p, '#app-layer .sheet [data-tap="to-ref"]');
    check('[admin] sheet › Referee console switches to the referee tabs, still signed in as admin', await p.evaluate(() => App.role() === 'referee' && Auth.isAdmin()), await screenId(p));
    await openPill(p);
    const btns = await sheetBtns(p);
    check('[admin as referee] sheet: Admin home · Back to menu · Sign out', JSON.stringify(btns.map(x => x.t)) === JSON.stringify(['Admin home', 'Back to menu', 'Sign out']), btns);
    await s.close();
  }
  // ---------------------------------------------------------- a staff member looking at the player side keeps both buttons
  {
    const s = await H.open({ viewer: 'seed_p002', referee: 'referee', width: 390, route: '#/player.home' });
    const p = s.page;
    await p.evaluate(() => App.setRole('player')); await sleep(200);
    await openPill(p);
    const btns = await sheetBtns(p);
    check('[referee in player view] sheet ends with Back to menu · Sign out', JSON.stringify(btns.map(x => x.t)) === JSON.stringify(['Back to menu', 'Sign out']), btns);
    await s.close();
  }

  // ---------------------------------------------------------- hidden on the live console
  {
    const s = await H.open({ viewer: 'guest', referee: 'referee', width: 390, data: liveData(), route: '#/ref.console' });
    const p = s.page;
    const n = await p.evaluate(() => ({ live: App.isLiveMatch(), id: document.querySelector('#app-screen section').dataset.screen, brand: !!document.querySelector('#app-header .brandbtn'), railBrand: !!document.querySelector('#app-rail .brandbtn'),
      railHidden: document.getElementById('app-rail').hidden || getComputedStyle(document.getElementById('app-rail')).display === 'none', pill: !!document.querySelector('#app-header [data-shell="pill"]') }));
    check('the brand button is hidden on the live console (no way to tap it by accident); the pill is still there', n.live && n.id === 'ref.console' && !n.brand && !n.railBrand && n.railHidden && n.pill, n);
    await openPill(p);
    check('…but the pill sheet still has Back to menu · Sign out during a live match', JSON.stringify((await sheetBtns(p)).map(x => x.t)) === JSON.stringify(['Back to menu', 'Sign out']));
    await s.shot(path.join(H.out(__dirname, 'shots'), 'way-back-live-console-390.png'));
    check('no console errors (live console)', !s.errors.length, s.errors);
    await s.close();
  }
  // …and an admin on a live match: the referee side hides it, the admin's own tabs keep it
  {
    const s = await H.open({ viewer: 'guest', referee: 'admin', width: 390, data: liveData(), route: '#/ref.console' });
    const p = s.page;
    await sleep(200);
    check('admin refereeing a live match: no brand button on the console', await p.evaluate(() => App.isLiveMatch() && !document.querySelector('#app-header .brandbtn')));
    await s.close();
  }

  // ---------------------------------------------------------- laptop rail
  for (const R of ROLES) {
    const s = await H.open(Object.assign({ width: 1280, theme: 'light' }, R.open));
    const p = s.page;
    const r = await p.evaluate(() => {
      const rail = document.getElementById('app-rail');
      const foot = [...rail.querySelectorAll('.rail-foot .rail-a')].map(x => ({ t: x.textContent.trim(), shell: x.dataset.shell, h: Math.round(x.getBoundingClientRect().height), colour: getComputedStyle(x).color }));
      const br = rail.querySelector('.brandbtn');
      return { shown: getComputedStyle(rail).display !== 'none', foot, brand: br ? br.innerText.replace(/\s+/g, ' ').trim() : null, headerBrandVisible: getComputedStyle(document.querySelector('#app-header .brandbtn')).visibility !== 'hidden' };
    });
    check(`[${R.name}, laptop] rail foot: ${R.staff ? 'Back to menu + Sign out rows' : 'a Back to menu row'}; the rail brand reads the full "BE FIT CLUB"`,
      r.shown && JSON.stringify(r.foot.map(x => x.t)) === JSON.stringify(R.staff ? ['Back to menu', 'Sign out'] : ['Back to menu']) && r.foot.every(x => x.h >= 40) && /BE FIT\s*CLUB/.test(r.brand || '') && !r.headerBrandVisible, r);
    if (R.staff) check(`[${R.name}, laptop] rail Sign out is red`, r.foot[1].colour.startsWith('rgb(') && r.foot[1].colour !== r.foot[0].colour, r.foot);
    if (R.name === 'guest') await s.shot(path.join(H.out(__dirname, 'shots'), 'way-back-rail-guest-1280.png'));
    await click(p, '#app-rail .rail-foot [data-shell="welcome"]');
    check(`[${R.name}, laptop] rail › Back to menu opens the front door`, await screenId(p) === 'welcome', await screenId(p));
    if (R.staff) {
      const s2 = await H.open(Object.assign({ width: 1280, theme: 'light' }, R.open, { viewer: 'none' }));
      await click(s2.page, '#app-rail .rail-foot [data-shell="sign-out"]');
      check(`[${R.name}, laptop] rail › Sign out signs out`, await s2.page.evaluate(() => !Auth.isReferee()) && await screenId(s2.page) === 'welcome');
      await s2.close();
    }
    check(`[${R.name}, laptop] no console errors`, !s.errors.length, s.errors);
    await s.close();
  }

  // ---------------------------------------------------------- the guest toast
  for (const [who, o] of [['guest', { viewer: 'guest' }], ['player', { viewer: 'seed_p002' }]]) {
    const s = await H.open(Object.assign({ width: 390 }, o));
    const p = s.page;
    const toast = () => p.evaluate(() => { const t = document.querySelector('#app-toast .toast'); return t ? { text: t.textContent, act: t.querySelector('button') && t.querySelector('button').textContent, lines: Math.round(t.getBoundingClientRect().height) } : null; });
    check(`[${who}] normal navigation shows no toast`, (await toast()) === null);
    await p.evaluate(() => App.go('ref.squad')); await sleep(400);
    const t1 = await toast();
    check(`[${who}] opening a staff-only screen: the toast "Referee or admin only · Sign in ›" and they stay on their own Home`, !!t1 && t1.text === 'Referee or admin only · Sign in ›' && t1.act === 'Sign in ›' && /^(guest|player)\.home$/.test(await screenId(p)), [t1, await screenId(p)]);
    await s.shot(path.join(H.out(__dirname, 'shots'), `way-back-toast-${who}-390.png`));
    const tg = await p.evaluate(() => { const b = document.querySelector('#app-toast .toast button'); const r = b.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), pe: getComputedStyle(b).pointerEvents, oneLine: document.querySelector('#app-toast .toast').getBoundingClientRect().height <= 48 }; });
    check(`[${who}] the "Sign in ›" link is tappable (≥ 44 px) and the toast stays one line`, tg.h >= 44 && tg.w >= 44 && tg.pe === 'auto' && tg.oneLine, tg);
    await sleep(300);
    await p.evaluate(() => { document.getElementById('app-toast').innerHTML = ''; App.rerender(); }); await sleep(300);
    check(`[${who}] a redraw does not toast again for the same address`, (await toast()) === null);
    await p.evaluate(() => { App.go('ref.squad', { x: 1 }); }); await sleep(400);
    check(`[${who}] …but a fresh tap on another staff-only address does`, !!(await toast()));
    await click(p, '#app-toast .toast button');
    check(`[${who}] tapping "Sign in ›" opens the front door and clears the toast`, await screenId(p) === 'welcome' && (await toast()) === null, [await screenId(p), await toast()]);
    await p.evaluate(() => App.go('admin.settings')); await sleep(400);
    check(`[${who}] an admin-only screen gets the same toast`, ((await toast()) || {}).text === 'Referee or admin only · Sign in ›', await toast());
    check(`[${who}] no console errors`, !s.errors.length, s.errors);
    await s.close();
  }
  {   // the referee who opens an admin screen is just sent back: no "sign in" toast for someone already signed in
    const s = await H.open({ viewer: 'guest', referee: 'referee', width: 390, route: '#/ref.money' });
    const p = s.page;
    await p.evaluate(() => App.go('admin.settings')); await sleep(400);
    check('[referee] opening an admin screen: sent back, no "Sign in" toast', await p.evaluate(() => !document.querySelector('#app-toast .toast')) && await screenId(p) !== 'admin.settings');
    await s.close();
  }

  // ---------------------------------------------------------- wording: the guest sheet and the staff chooser
  {
    const s = await H.open({ viewer: 'guest', width: 390, route: '#/guest.home' });
    const p = s.page;
    await openPill(p);
    const rows = await p.evaluate(() => [...document.querySelectorAll('#app-layer .sheet [data-pill-opts] .r .nm')].map(x => x.textContent.trim()));
    check('[guest] sheet rows: Referee · Admin · Appearance', JSON.stringify(rows) === JSON.stringify(['Referee', 'Admin', 'Appearance']), rows);
    await click(p, '#app-layer .sheet [data-tap="as-ref"]');
    check('[guest] the Referee sign-in sheet is titled "Referee"', await p.evaluate(() => document.querySelector('.sheet .sheet-title').textContent) === 'Referee');
    await s.close();
  }
  {
    const s = await H.open({ viewer: 'seed_p002', width: 390, route: '#/player.home' });
    const p = s.page;
    await openPill(p); await click(p, '#app-layer .sheet [data-tap="signin"]');
    const t = await sheetText(p);
    check('[player] "Referee or admin sign-in" opens a chooser with Referee · Admin (no "I’m the …")', /Sign in/.test(t) && /Referee/.test(t) && /Admin/.test(t) && !/I’m the/.test(t), t);
    await click(p, '#app-layer .sheet [data-tap="as-admin"]');
    check('[player] choosing Admin opens the sheet titled "Admin" (email + password)', await p.evaluate(() => document.querySelector('.sheet .sheet-title').textContent === 'Admin' && !!document.querySelector('.sheet input[type=email]')));
    await s.close();
  }

  console.log(`\n${oks} ok, ${fails} FAIL`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(2); });
