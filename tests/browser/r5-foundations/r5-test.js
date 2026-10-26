// Round 5 Phase A · browser test (TEST MODE ONLY, via the harness): front door, roles and tabs, header pills,
// sign-in sheets, nav hidden while live, search box fix, Teams with Blue (chips + score block colours).
// Run: MSYS_NO_PATHCONV=1 node r5-test.js
'use strict';
const path = require('path');
const H = require('../harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (name, cond, extra) => { if (cond) { oks++; console.log('ok   ' + name); } else { fails++; console.log('FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } };
const screenId = p => p.evaluate(() => (document.querySelector('#app-screen section') || {}).dataset?.screen || null);
const navLabels = p => p.evaluate(() => document.getElementById('app-nav').hidden ? '(hidden)' : [...document.querySelectorAll('#app-nav .nav-a')].map(a => a.textContent.trim()).join(' · '));
const pillText = p => p.evaluate(() => { const b = document.querySelector('#app-header [data-shell="pill"]'); if (!b) return null; const c = b.cloneNode(true); c.querySelectorAll('.av, .car').forEach(x => x.remove()); return c.innerText.trim(); });
const sheetText = p => p.evaluate(() => { const s = [...document.querySelectorAll('#app-layer .sheet')].pop(); return s ? s.innerText : ''; });
const tap = async (p, sel) => { await p.evaluate(s => { const el = document.querySelector(s); if (!el) throw new Error('no ' + s); el.click(); }, sel); await sleep(350); };
const tapText = async (p, text) => { await p.evaluate(t => { const el = [...document.querySelectorAll('#app-layer .sheet [data-tap], #app-screen [data-tap]')].reverse().find(x => x.innerText.trim().startsWith(t)); if (!el) throw new Error('no ' + t); el.click(); }, text); await sleep(350); };
async function typeInto(p, sel, text) { await p.focus(sel); await p.keyboard.type(text, { delay: 20 }); await sleep(300); }

const NOW = new Date('2026-10-19T19:30:00').getTime();
function blueData() {
  const d = H.snapshot();
  d.settings = { club: { name: 'BE Fit Club', seasonLabel: 'Season 2026', fee: 60, quickAmounts: [60, 120] }, teams: {
    blue: { name: 'Blue', colour: 'blue', order: 1, active: true }, green: { name: 'Green', colour: 'green', order: 2, active: true },
    red: { name: 'Red', colour: 'red', order: 3, active: true }, sky: { name: 'Sky', colour: 'blue', order: 9, active: false } } };
  const pids = Object.keys(d.players);
  const blue = {}, green = {};
  pids.slice(0, 6).forEach(p => { blue[p] = { position: d.players[p].defaultPosition || 'MID' }; });
  pids.slice(6, 12).forEach(p => { green[p] = { position: d.players[p].defaultPosition || 'MID' }; });
  const ev = {};
  [[pids[0], 'blue', 12], [pids[1], 'blue', 40], [pids[0], 'blue', 77], [pids[6], 'green', 20], [pids[7], 'green', 51]].forEach(([pid, team, min], i) => {
    ev['g' + i] = { type: 'goal', team, scorerId: pid, min, timestamp: NOW + 7 * 864e5 + min * 60000 };
  });
  d.sessions.blue_night = { date: '2026-10-26', status: 'completed', mode: 'live', teams: { blue: { players: blue }, green: { players: green } },
    events: ev, goals: { blue: 3, green: 2 }, cleanSheets: { blue: false, green: false }, format: { start: 'big' } };
  return d;
}
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

(async () => {
  // ------------------------------------------------------------ 1. front door → find your name
  {
    const s = await H.open({ viewer: 'none', width: 390 });
    const p = s.page;
    check('1.1 first open shows the front door', await screenId(p) === 'welcome');
    check('1.2 no list of names before typing', await p.evaluate(() => document.querySelectorAll('#app-screen [data-tap="pick"]').length === 0));
    const doors = await p.evaluate(() => [...document.querySelectorAll('#app-screen .fd-door')].map(d => ({ name: d.querySelector('.tx b').textContent, sub: d.querySelector('.tx .sub').textContent, tap: d.dataset.tap, h: Math.round(d.getBoundingClientRect().height), cls: d.className })));
    check('1.3 four doors in one list: My stats · Browse as guest · Referee · Admin (no Staff heading)', doors.map(d => d.name).join(' · ') === 'My stats · Browse as guest · Referee · Admin' && doors.map(d => d.tap).join() === 'stats,browse,referee,admin' &&
      await p.evaluate(() => document.querySelectorAll('#app-screen .fd-doors').length === 1 && !/staff/i.test(document.getElementById('app-screen').innerText)), doors);
    check('1.3b the door words are the designed ones', doors.map(d => d.sub).join(' | ') === 'Your points and every match you played | Scores, tables, the season | Tonight’s match | Run the club', doors.map(d => d.sub));
    check('1.3c door heights step down 84 → 70 → 58 → 58, My stats is the lit one', doors.map(d => d.h).join() === '84,70,58,58' && /is-primary/.test(doors[0].cls) && doors.slice(2).every(d => /is-staff/.test(d.cls)), doors.map(d => d.h));
    check('1.3d no header, no bottom nav on the front door', await p.evaluate(() => document.getElementById('app-header').hidden && document.getElementById('app-nav').hidden));
    check('1.3e the lockup, BE FIT CLUB and the slogan are there, and the footer holds one link (practice pill)', await p.evaluate(() => {
      const s = document.getElementById('app-screen'); const foot = s.querySelectorAll('.fd-foot a, .fd-foot button');
      return !!s.querySelector('svg.fd-lk') && /BE FIT CLUB/.test(s.querySelector('.fd-wm').innerText) && /BE FIT OR BE FINISHED/.test(s.querySelector('.fd-slogan').innerText) &&
        foot.length === 1 && /Try practice mode/.test(foot[0].innerText) && /nothing is saved/.test(foot[0].innerText) && foot[0].getAttribute('href').endsWith('?practice') && !/Appearance/i.test(s.innerText); }));
    check('1.4 Tonight strip: next game Mon 26 Oct and the last score as two mini squares (Green 6, Red 4)',
      await p.evaluate(() => { const t = document.querySelector('.fd-tonight'); const sq = [...t.querySelectorAll('.ms i')]; return !!t && /Next game/i.test(t.innerText) && /Mon 26 Oct/.test(t.innerText) && sq.length === 2 && sq[0].textContent === '6' && sq[0].classList.contains('t-green') && sq[1].textContent === '4' && sq[1].classList.contains('t-red'); }));
    check('1.4b every door has its own picture on the right, behind the words', await p.evaluate(() => [...document.querySelectorAll('#app-screen .fd-door')].every(d => { const a = d.querySelector('.fd-art svg'); return a && getComputedStyle(d.querySelector('.fd-art')).position === 'absolute' && /mask|linear-gradient/.test(getComputedStyle(d.querySelector('.fd-art')).maskImage || getComputedStyle(d.querySelector('.fd-art')).webkitMaskImage || ''); })));
    // "My stats" → the Find your name state on the same screen
    await tap(p, '#app-screen [data-tap="stats"]');
    check('1.4c My stats → Find your name on the same screen: "‹ Menu", the heading, the hint, no list yet', await p.evaluate(() => { const s = document.getElementById('app-screen'); return s.querySelector('section').dataset.screen === 'welcome' && /‹ Menu/.test(s.querySelector('.fd-back').innerText) && s.querySelector('.fd-sub h2').innerText === 'Find your name' && /Your name stays on this phone\./.test(s.querySelector('.fd-hint').innerText) && !s.querySelector('[data-tap="pick"]') && !s.querySelector('.fd-door'); }));
    check('1.4d the search box has the cursor already (auto-focus)', await p.evaluate(() => document.activeElement && document.activeElement.dataset.search === 'who'));
    // search box fix: no outline on the inner input, no browser clear button, one ink2 ring on the box
    await p.focus('[data-search="who"]');
    const sb = await p.evaluate(() => { const i = document.querySelector('[data-search="who"]'); const cs = getComputedStyle(i); const x = getComputedStyle(i, '::-webkit-search-cancel-button'); return { outline: cs.outlineStyle, cancel: x.display, appearance: x.webkitAppearance || x.appearance, ring: getComputedStyle(i.closest('.inp')).boxShadow }; });
    check('1.5 search box: no white focus line on the input', sb.outline === 'none', sb);
    check('1.6 search box: browser clear button hidden', sb.cancel === 'none' || sb.appearance === 'none', sb);
    check('1.7 search box: focus shows as one 1.5 px ring on the box', /1\.5px/.test(sb.ring), sb);
    await p.keyboard.type('Da', { delay: 30 }); await sleep(300);
    const res = await p.evaluate(() => ({ names: [...document.querySelectorAll('#app-screen [data-tap="pick"] .nm')].map(x => x.textContent), label: document.querySelector('[data-fd-res] .lbl')?.innerText, brandHidden: !document.querySelector('.fd-title'), optsHidden: !document.querySelector('.fd-doors'), chips: document.querySelectorAll('[data-fd-res] .tc').length }));
    check('1.8 typing "Da" shows 4 matches, each with a team chip', res.names.length === 4 && /4 MATCHES/i.test(res.label) && res.chips === 4, res);
    check('1.9 the 4 are Daniel fair guy, Danny red dark short, David O, David S', res.names.join('|') === 'Daniel fair guy|Danny red dark short|David O|David S', res.names);
    check('1.10 in Find your name the logo and the doors step aside', res.brandHidden && res.optsHidden, res);
    await s.shot(path.join(H.out(__dirname, 'shots'), 'test-door-typing.png'));
    await tap(p, '#app-screen [data-tap="pick"]');
    check('1.11 picking a name opens Me (stats + match history), not Home', await screenId(p) === 'player.me');
    check('1.12 player tabs: Home · Match · Tables · Me', await navLabels(p) === 'Home · Match · Tables · Me', await navLabels(p));
    check('1.13 header name chip shows "Daniel fair guy"', (await pillText(p)) === 'Daniel fair guy', await pillText(p));
    check('1.14 the name chip is team-tinted (pill.me with a team class)', await p.evaluate(() => !!document.querySelector('#app-header .pill.me.t-red')));
    // player pill sheet
    await tap(p, '#app-header [data-shell="pill"]');
    const t = await sheetText(p);
    check('1.15 name chip menu: My page · Share card · Appearance · Not Daniel? Switch · Referee or admin sign-in',
      ['My page', 'Share card', 'Appearance', 'Not Daniel? Switch', 'Referee or admin sign-in'].every(x => t.includes(x)), t);
    await tapText(p, 'Not Daniel? Switch');
    check('1.16 "Switch" goes back to the front door', await screenId(p) === 'welcome');
    const ret = await p.evaluate(() => ({ doors: [...document.querySelectorAll('#app-screen .fd-door')].map(d => ({ kk: (d.querySelector('.kk') || {}).textContent || '', name: d.querySelector('.tx b').textContent, sub: d.querySelector('.tx .sub').textContent, h: Math.round(d.getBoundingClientRect().height), cls: d.className, bars: d.querySelectorAll('.fd-art rect').length })),
      notyou: (document.querySelector('.fd-notyou') || {}).textContent }));
    check('1.16b a phone that remembers a name shows "Continue as Daniel fair guy" first, then Browse as guest · Referee · Admin',
      ret.doors.map(d => d.name).join(' · ') === 'Daniel fair guy · Browse as guest · Referee · Admin' && /continue as/i.test(ret.doors[0].kk) && /is-continue/.test(ret.doors[0].cls) && /t-red/.test(ret.doors[0].cls), ret);
    check('1.16c … its line reads rank · pts · move (e.g. "5th · 280 pts"), its picture is his real last games as bars, heights 92 → 70 → 58 → 58',
      /^\d+(st|nd|rd|th) · \d+ pts( · [▲▼]\d+)?$/.test(ret.doors[0].sub) && ret.doors[0].bars >= 1 && ret.doors[0].bars <= 5 && ret.doors.map(d => d.h).join() === '92,70,58,58', ret);
    check('1.16d … and "Not Daniel? Find your name ›" sits under it', ret.notyou === 'Not Daniel? Find your name ›', ret.notyou);
    await tap(p, '#app-screen [data-tap="continue"]');
    check('1.16e Continue as opens Me', await screenId(p) === 'player.me');
    await p.evaluate(() => App.go('welcome')); await sleep(300);
    await tap(p, '#app-screen [data-tap="find"]');
    check('1.16f "Not Daniel? Find your name ›" opens the find state', await p.evaluate(() => !!document.querySelector('#app-screen .fd-sub [data-search="who"]')));
    await tap(p, '#app-screen [data-tap="menu"]');
    check('1.16g "‹ Menu" goes back to the doors', await p.evaluate(() => document.querySelectorAll('#app-screen .fd-door').length === 4));
    console.log(s.errors.length ? 'errors: ' + s.errors.join(' | ') : '');
    check('1.17 no console errors', !s.errors.length, s.errors);
    await s.close();
  }
  // ------------------------------------------------------------ 2. just browsing → guest
  {
    const s = await H.open({ viewer: 'none', width: 390 });
    const p = s.page;
    await tap(p, '#app-screen [data-tap="browse"]');
    check('2.1 Browse as guest opens the guest Home', await screenId(p) === 'guest.home');
    check('2.2 guest tabs: Home · Match · Tables (no Me)', await navLabels(p) === 'Home · Match · Tables', await navLabels(p));
    check('2.3 header pill reads "Browsing"', await pillText(p) === 'Browsing');
    await tap(p, '#app-nav [data-tab="match"]'); check('2.4 Match tab → player.live (the Match screen)', await screenId(p) === 'player.live');
    await tap(p, '#app-nav [data-tab="tables"]'); check('2.5 Tables tab → tables.teams', await screenId(p) === 'tables.teams');
    await p.evaluate(() => App.go('tables.stats')); await sleep(300);
    check('2.6 Tables · Stats placeholder shows the stepped podium (Emmanuel #1 in the middle)', await p.evaluate(() => { const c = [...document.querySelectorAll('.pod .pcol')]; return c.length === 3 && c[1].classList.contains('first') && /Emmanuel/.test(c[1].innerText) && /484/.test(c[1].innerText); }));
    await tap(p, '#app-header [data-shell="pill"]');
    const t = await sheetText(p);
    check('2.7 Browsing ▾ opens "You’re browsing": Find your name · I’m the referee · I’m the admin · Appearance', ['You’re browsing', 'I’m the referee', 'I’m the admin', 'Appearance'].every(x => t.includes(x)) && await p.evaluate(() => !!document.querySelector('.sheet [data-search="pill-find"]')), t);
    await typeInto(p, '.sheet [data-search="pill-find"]', 'Emm');
    check('2.8 typing in the pill sheet finds Emmanuel', await p.evaluate(() => [...document.querySelectorAll('.sheet [data-tap="pick"] .nm')].map(x => x.textContent).includes('Emmanuel')));
    await tap(p, '.sheet [data-tap="pick"]');
    check('2.9 picking from the pill opens player Home as Emmanuel', await screenId(p) === 'player.home' && await pillText(p) === 'Emmanuel');
    check('2.10 no console errors', !s.errors.length, s.errors);
    await s.close();
  }
  // ------------------------------------------------------------ 3. I'm the referee → password only
  {
    const s = await H.open({ viewer: 'none', width: 390 });
    const p = s.page;
    await tap(p, '#app-screen [data-tap="referee"]');
    const f = await p.evaluate(() => ({ title: document.querySelector('.sheet .sheet-title')?.textContent, email: !!document.querySelector('.sheet input[type=email]'), pw: !!document.querySelector('.sheet input[type=password]'), admLink: /admin/i.test(document.querySelector('.sheet').innerText) }));
    check('3.1 referee sheet: title "Referee", password only, no admin link inside', f.title === 'Referee' && !f.email && f.pw && !f.admLink, f);
    await typeInto(p, '.sheet input[type=password]', 'nope'); await p.keyboard.press('Enter'); await sleep(600);
    check('3.2 wrong password → "Wrong email or password", sheet stays', /Wrong/.test(await sheetText(p)));
    await p.evaluate(() => { document.querySelector('.sheet input[type=password]').value = ''; });
    await typeInto(p, '.sheet input[type=password]', 'befit2024'); await p.keyboard.press('Enter'); await sleep(800);
    check('3.3 signed in as the referee: role referee', await p.evaluate(() => Auth.role() === 'referee' && App.role() === 'referee'));
    check('3.4 lands on the Match tab (Tonight: ref.setup, no game on)', await screenId(p) === 'ref.setup', await screenId(p));
    check('3.5 referee tabs: Match · Money tonight (no Squad)', await navLabels(p) === 'Match · Money tonight', await navLabels(p));
    check('3.6 header: "Referee ▾" pill', await pillText(p) === 'Referee');
    await p.evaluate(() => App.go('ref.squad')); await sleep(300);
    check('3.7 the referee cannot open Squad (sent back to Match)', await screenId(p) !== 'ref.squad', await screenId(p));
    await p.evaluate(() => App.go('admin.settings')); await sleep(300);
    check('3.8 … nor Settings', await screenId(p) !== 'admin.settings');
    await tap(p, '#app-nav [data-tab="money"]');
    check('3.9 Money tonight tab → ref.money', await screenId(p) === 'ref.money');
    await p.evaluate(() => App.go('ref.money')); await sleep(250);
    await tap(p, '#app-header [data-shell="pill"]');
    const t = await sheetText(p);
    check('3.10 Referee ▾ opens: Player view · Sign out', t.includes('Player view') && t.includes('Sign out') && !t.includes('Admin home'), t);
    await tapText(p, 'Player view');
    check('3.11 Player view → guest tabs (no name picked yet)', await navLabels(p) === 'Home · Match · Tables', await navLabels(p));
    check('3.12 no console errors', !s.errors.length, s.errors);
    await s.close();
  }
  // ------------------------------------------------------------ 4. I'm the admin → email + password
  {
    const s = await H.open({ viewer: 'none', width: 390 });
    const p = s.page;
    await tap(p, '#app-screen [data-tap="admin"]');
    const f = await p.evaluate(() => ({ title: document.querySelector('.sheet .sheet-title')?.textContent, email: !!document.querySelector('.sheet input[type=email]'), pw: !!document.querySelector('.sheet input[type=password]') }));
    check('4.1 admin sheet: title "Admin", email + password', f.title === 'Admin' && f.email && f.pw, f);
    await typeInto(p, '.sheet input[type=email]', 'reuben@example.com');
    await typeInto(p, '.sheet input[type=password]', 'befit2024'); await p.keyboard.press('Enter'); await sleep(800);
    check('4.2 signed in as admin → admin Home', await screenId(p) === 'admin.home' && await p.evaluate(() => Auth.isAdmin()), await screenId(p));
    check('4.3 admin tabs: Home · Squad · Money · Settings', await navLabels(p) === 'Home · Squad · Money · Settings', await navLabels(p));
    check('4.4 header: "Admin ▾" pill', await pillText(p) === 'Admin');
    await tap(p, '#app-nav [data-tab="squad"]'); check('4.5 Squad tab → ref.squad', await screenId(p) === 'ref.squad');
    await tap(p, '#app-nav [data-tab="settings"]'); check('4.6 Settings tab → admin.settings (Teams listed from Settings data)', await screenId(p) === 'admin.settings' && /Green[\s\S]*Red/.test(await p.evaluate(() => document.querySelector('#app-screen').innerText)));
    await tap(p, '#app-header [data-shell="pill"]');
    const t = await sheetText(p);
    check('4.7 Admin ▾ opens: Referee console · Player view · Sign out', ['Referee console', 'Player view', 'Sign out'].every(x => t.includes(x)), t);
    await tapText(p, 'Referee console');
    check('4.8 Referee console → the admin referees with Match · Money tonight', await navLabels(p) === 'Match · Money tonight' && await screenId(p) === 'ref.setup', [await navLabels(p), await screenId(p)]);
    await tap(p, '#app-header [data-shell="pill"]');
    check('4.9 … and the pill offers Admin home to go back', (await sheetText(p)).includes('Admin home'));
    await tapText(p, 'Admin home');
    check('4.10 Admin home → admin tabs again', await navLabels(p) === 'Home · Squad · Money · Settings' && await screenId(p) === 'admin.home');
    await tap(p, '#app-header [data-shell="pill"]'); await tapText(p, 'Sign out'); await sleep(400);
    check('4.11 Sign out → back to the front door (no name picked)', await screenId(p) === 'welcome' && await p.evaluate(() => !Auth.isReferee()));
    check('4.12 no console errors', !s.errors.length, s.errors);
    await s.close();
  }
  // ------------------------------------------------------------ 5. nav hidden while a match is live (referee)
  {
    const s = await H.open({ viewer: 'guest', referee: 'referee', width: 390, data: liveData(), route: '#/ref.console' });
    const p = s.page;
    const n = await p.evaluate(() => ({ id: document.querySelector('#app-screen section').dataset.screen, hidden: document.getElementById('app-nav').hidden, cls: document.body.classList.contains('nav-hidden'), live: App.isLiveMatch() }));
    check('5.1 referee console during a live match: bottom nav hidden', n.id === 'ref.console' && n.hidden && n.cls && n.live, n);
    check('5.2 referee header keeps the pill and the sync chip ("✓ All sent")', await p.evaluate(() => /All sent/.test(document.querySelector('#app-header').innerText) || !!document.querySelector('#app-header [data-shell="pill"]')));
    await p.evaluate(() => Store.test.setStatus('offline'));
    await p.evaluate(async () => { const k = Store.newKey(); await Store.set('sessions/' + Store.activeSessionId() + '/events/' + k, { type: 'block', playerId: 'x', min: 30, timestamp: Store.now() }); });
    await sleep(300);
    const chip = await p.evaluate(() => UI.syncChip(Store.status()));
    check('5.3 sync chip offline with a save waiting: "On phone · 1 waiting" (amber)', /On phone · 1 waiting/.test(chip) && /sync wait/.test(chip), chip);
    await p.evaluate(() => Store.test.setStatus('online')); await sleep(500);
    check('5.4 back online: "✓ All sent"', /All sent/.test(await p.evaluate(() => UI.syncChip(Store.status()))));
    check('5.5 no console errors', !s.errors.length, s.errors);
    await s.close();
  }
  // ------------------------------------------------------------ 6. Teams with Blue added (chips and score block colours)
  for (const theme of ['dark', 'light']) {
    const s = await H.open({ viewer: 'guest', width: 390, theme, data: blueData(), route: '#/guest.home' });
    const p = s.page;
    const r = await p.evaluate(() => {
      const probe = html => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); return d.firstElementChild; };
      const tc = el => getComputedStyle(el).getPropertyValue('--tc').trim();
      const tok = n => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim();
      const chip = probe(UI.teamChip('blue'));
      const sky = probe(UI.teamChip('sky'));
      const brand = document.querySelector('#app-screen .sb');
      const halves = [...brand.querySelectorAll('.sb-half')];
      const names = [...brand.querySelectorAll('.sb-nm')].map(x => x.innerText.trim());
      const num = halves[0].querySelector('.hn');
      return { blueTok: tok('blue'), chipTc: tc(chip), chipBg: getComputedStyle(chip).backgroundColor, chipText: chip.innerText, skyTc: tc(sky), skyName: sky.innerText,
        left: halves[0].className, right: halves[1].className, names, leftNum: num.innerText, numColour: getComputedStyle(num).color, halfBg: getComputedStyle(halves[0]).backgroundImage,
        css: (document.getElementById('bf-team-css') || {}).textContent || '', list: Teams.list().map(t => t.id).join(), fmt: UI.fmt.team('blue'),
        wdl: getComputedStyle(probe(UI.resultMark('W', 'blue'))).backgroundColor, standings: Scoring.teamStandings().blue };
    });
    const rgbBlue = theme === 'dark' ? 'rgb(91, 141, 239)' : 'rgb(47, 111, 219)';
    check(`6.1 [${theme}] Settings with Blue: active teams = Blue, Green, Red (Sky inactive)`, r.list === 'blue,green,red', r.list);
    check(`6.2 [${theme}] team chip for Blue reads "Blue" and its colour is the blue token`, r.chipText === 'Blue' && r.chipTc.toLowerCase() === r.blueTok.toLowerCase(), r);
    check(`6.3 [${theme}] chip fill is a soft blue tint (not grey)`, /color\(srgb|rgba?\(/.test(r.chipBg) && r.chipBg !== 'rgba(0, 0, 0, 0)', r.chipBg);
    check(`6.4 [${theme}] a team whose id differs from its colour (Sky → blue) gets its colour from Settings`, r.skyTc.toLowerCase() === r.blueTok.toLowerCase() && r.skyName === 'Sky' && /\.t-sky\{--tc:var\(--blue\)\}/.test(r.css), r);
    check(`6.5 [${theme}] last game Blue 3 – 2 Green: Blue on the LEFT (order 1)`, /t-blue/.test(r.left) && /t-green/.test(r.right) && r.names.join().toLowerCase() === 'blue,green' && r.leftNum === '3', r);
    check(`6.6 [${theme}] the Blue half is tinted and lit in blue`, /gradient/.test(r.halfBg), r.halfBg.slice(0, 80));
    check(`6.7 [${theme}] Blue numeral is team blue${theme === 'light' ? ' darkened 15% for contrast' : ''}`, theme === 'dark' ? r.numColour === rgbBlue : r.numColour !== rgbBlue && /color|rgb/.test(r.numColour), r.numColour);
    check(`6.8 [${theme}] W in Blue's colour is a blue fill`, r.wdl === rgbBlue, r.wdl);
    check(`6.9 [${theme}] UI.fmt.team + standings know Blue (1 W)`, r.fmt === 'Blue' && r.standings && r.standings.w === 1, r.standings);
    await s.shot(path.join(H.out(__dirname, 'shots'), `test-blue-door-${theme}.png`));
    check(`6.10 [${theme}] no console errors`, !s.errors.length, s.errors);
    await s.close();
  }
  // ------------------------------------------------------------ 7. the front door is always dark; the live state; practice pill
  {
    const s = await H.open({ viewer: 'none', width: 390, theme: 'light' });
    const p = s.page;
    const dk = await p.evaluate(() => { const sc = document.querySelector('#app-screen section'); const cs = k => getComputedStyle(sc).getPropertyValue(k).trim().toLowerCase();
      const sq = sc.querySelector('.fd-tonight .ms i'); return { app: document.documentElement.dataset.theme, screen: sc.dataset.theme, bg: cs('--bg'), ink: cs('--ink'), body: getComputedStyle(sc).backgroundColor, sq: getComputedStyle(sq).color, tc: getComputedStyle(sq).getPropertyValue('--tc').trim().toLowerCase(), green: cs('--green') }; });
    check('7.1 the app is light but the front door is always dark (screen data-theme=dark, --bg #0b0d10, ink #f2f3f5)', dk.app === 'light' && dk.screen === 'dark' && dk.bg === '#0b0d10' && dk.ink === '#f2f3f5', dk);
    check('7.2 … and the light theme does not darken the mini score numerals on it (Green 6 stays the bright dark-theme green)', dk.green === '#3dd68c' && dk.sq === 'rgb(61, 214, 140)', dk);
    await s.shot(path.join(H.out(__dirname, 'shots'), 'test-door-light-app.png'));
    check('7.3 first-time doors in light too: My stats is the lit one', await p.evaluate(() => !!document.querySelector('.fd-door.is-primary')));
    check('7.4 no console errors', !s.errors.length, s.errors);
    await s.close();
  }
  {
    const s = await H.open({ viewer: 'none', width: 390, theme: 'dark', data: liveData(), now: NOW });
    const p = s.page;
    const lv = await p.evaluate(() => { const l = document.querySelector('.fd-live'); return l && { live: /LIVE/.test(l.innerText), block: !!l.querySelector('.sb .sb-half'), mid: l.querySelector('.sb-mid').innerText.replace(/\s+/g, ' '), strip: !!document.querySelector('.fd-tonight'), tap: l.querySelector('.sb').dataset.tap }; });
    check('7.5 while a match is live the Tonight strip becomes the live score block with a LIVE dot and the minute', lv && lv.live && lv.block && /\d+'/.test(lv.mid) && !lv.strip && lv.tap === 'live', lv);
    await tap(p, '#app-screen [data-tap="live"]');
    check('7.6 tapping it opens Match', await screenId(p) === 'player.live');
    await s.close();
  }
  console.log(`\n${oks} ok, ${fails} FAIL`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(2); });
