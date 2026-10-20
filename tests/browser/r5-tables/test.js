// Tables builder tests (round 5). TEST MODE ONLY via the harness; nothing touches the real database.
// node test.js [section]   sections: numbers players stats blue share shots
const path = require('path'), fs = require('fs');
const H = require('../harness.js');
const DATA = require('./data.js');
const OUT = H.out(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, info) => { if (ok) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (info !== undefined ? '  → ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); } };
const screenId = p => p.evaluate(() => App.current().id);
const ANDREW = 'seed_p011', HARRY = 'seed_p001', EMM = 'seed_p002', MIKE = 'seed_p047', REUEL = 'seed_p003', LIVE19 = '-P4KcMogcPM8_RRG9wAQ';
async function done(s, tag) { check(`[${tag}] no console errors`, !s.errors.length, s.errors.slice(0, 3).join(' | ')); await s.close(); }

// in-page audit: sideways scroll, text < 12 px, Mono > 24 px, heroes, clipped text
const AUDIT = () => {
  const out = { hscroll: document.documentElement.scrollWidth - innerWidth, tiny: [], mono: [], heroes: 0, clipped: [] };
  const roots = [document.getElementById('app-screen'), ...document.querySelectorAll('#app-layer .sheet')].filter(Boolean);
  roots.forEach(r => r.querySelectorAll('*').forEach(el => {
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
    if (!own || b.width < 1 || cs.visibility === 'hidden') return;
    if (parseFloat(cs.fontSize) < 11.9) out.tiny.push(own.slice(0, 20) + ' ' + cs.fontSize);
    if (/Geist Mono/i.test(cs.fontFamily) && parseFloat(cs.fontSize) > 24.5) out.mono.push(own.slice(0, 20));
    if ((cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden') && el.scrollWidth > el.clientWidth + 1 && cs.display !== 'grid') out.clipped.push(own.slice(0, 20));
  }));
  out.heroes = roots.reduce((n, r) => n + [...r.querySelectorAll('.hero')].filter(h => h.getBoundingClientRect().width && !h.parentElement.closest('.hero')).length, 0);
  return out;
};
async function audit(p, tag) {
  const a = await p.evaluate(AUDIT);
  check(`[${tag}] no sideways scroll, no text < 12 px, no Mono > 24 px, ≤ 1 hero, nothing clipped`,
    a.hscroll <= 0 && !a.tiny.length && !a.mono.length && a.heroes <= 1 && !a.clipped.length, a);
}

// ------------------------------------------------------------------ numbers: Teams = Scoring
async function numbers() {
  console.log('\n# Teams numbers = Scoring (real data to 19 Oct)');
  const s = await H.open({ width: 390, theme: 'dark', route: '#/tables.teams' });
  const p = s.page;
  const r = await p.evaluate(() => {
    const T = Scoring.teamStandings(Store.state), F = Scoring.teamForm(Store.state);
    const rows = [...document.querySelectorAll('.tb-trow')].map(e => { const team = e.className.match(/t-(\w+)/)[1]; return { team, pts: e.querySelector('.tb-tp').textContent,
      form: [...e.querySelectorAll('.wdl')].map(x => x.textContent).join(''), wcls: [...e.querySelectorAll('.wdl')].every(x => x.classList.contains('tcol') && x.classList.contains('t-' + team)) }; });
    const full = [...document.querySelectorAll('.tb-ftbl tbody tr')].map(tr => [...tr.cells].map(c => c.innerText.trim()));
    const lbl = document.querySelector('.tb-lbl').innerText.replace(/\s+/g, ' ');
    return { rows, full, lbl, games: Scoring.completedSessions(Store.state).length, T: { green: T.green, red: T.red },
      F: { green: F.green.slice(-5).join(''), red: F.red.slice(-5).join('') }, text: document.querySelector('#app-screen').innerText };
  });
  check('two team rows, Green 60 then Red 48', r.rows.length === 2 && r.rows[0].team === 'green' && r.rows[0].pts === '60' && r.rows[1].pts === '48', r.rows);
  check(`form = Scoring.teamForm last 5 (Green ${r.F.green}, Red ${r.F.red}), in each team's own colour`, r.rows[0].form === r.F.green && r.rows[1].form === r.F.red && r.rows.every(x => x.wcls), r.rows);
  check('Green WLDWW · Red LWDLL (as the design)', r.F.green === 'WLDWW' && r.F.red === 'LWDLL');
  const g = r.T.green, rd = r.T.red;
  check(`19 + 3 + 15 = ${g.w + g.d + g.l} games; 19 × 3 + 3 = ${g.w * 3 + g.d}; 15 × 3 + 3 = ${rd.w * 3 + rd.d}`, g.w === 19 && g.d === 3 && g.l === 15 && g.w + g.d + g.l === 37 && g.w * 3 + g.d === 60 && rd.w * 3 + rd.d === 48);
  check('full table: Green 19 3 15 +29 60 · Red 15 3 19 −29 48', JSON.stringify(r.full.map(x => x.slice(1))) === JSON.stringify([['19', '3', '15', '+29', '60'], ['15', '3', '19', '−29', '48']]), r.full);
  check('"Season 2026 · 37 games"', /SEASON 2026/i.test(r.lbl) && r.lbl.includes('37 games') && r.games === 37, r.lbl);
  check('league pts labelled ("league pts (win 3, draw 1)", "League pts")', /league pts \(win 3, draw 1\)/.test(r.text) && /League pts/.test(r.text));
  await audit(p, 'teams 390 dark');
  await p.click('[data-seg="tbtab"] [data-value="players"]'); await sleep(350);
  check('switch → Players', await screenId(p) === 'tables.players');
  await p.click('[data-seg="tbtab"] [data-value="stats"]'); await sleep(350);
  check('switch → Stats', await screenId(p) === 'tables.stats');
  await p.click('#app-nav [data-tab="home"]'); await sleep(300);
  await p.click('#app-nav [data-tab="tables"]'); await sleep(300);
  check('Tables tab remembers the last view (Stats)', await screenId(p) === 'tables.stats');
  await done(s, 'numbers');
}

// ------------------------------------------------------------------ players
async function players() {
  console.log('\n# Players: chips, movement, last game, you row, tap → profile');
  const s = await H.open({ width: 390, theme: 'dark', route: '#/tables.players', viewer: ANDREW });
  const p = s.page;
  const t = await p.evaluate(() => {
    const rows = Scoring.seasonTable(Store.state);
    const dom = [...document.querySelectorAll('.pl-tbl tbody tr')].map(tr => ({ pid: tr.dataset.pid, cells: [...tr.cells].map(c => c.innerText.trim()), chip: !!tr.querySelector('.tc.t-' + Store.player(tr.dataset.pid).defaultTeam) }));
    return { engine: rows.map(r => ({ pid: r.pid, pts: r.pts, last: r.lastPts, rank: r.rank, move: r.move })), dom, chips: [...document.querySelectorAll('[data-chips="tpos"] .chip')].map(c => c.textContent),
      lastHead: document.querySelectorAll('.pl-tbl thead th')[2].innerText, plabel: document.querySelector('.tb-pbar .lbl').innerText };
  });
  const same = t.engine.every((e, i) => { const d = t.dom[i]; return d && d.pid === e.pid && d.cells[3] === String(e.pts) && d.cells[2] === (e.last == null ? '–' : String(e.last)) && d.cells[0] === String(e.rank); });
  check(`all ${t.dom.length} rows = Scoring.seasonTable (rank, last game, pts)`, same && t.dom.length === t.engine.length && t.dom.length === 76);
  check('every row has its team chip', t.dom.every(d => d.chip));
  check('top 3: Emmanuel 484 · Harry 416 · Reuel 247', t.dom.slice(0, 3).map(d => d.cells[1].split('\n')[0] + ' ' + d.cells[3]).join(' · ') === 'Emmanuel 484 · Harry 416 · Reuel 247', t.dom.slice(0, 3).map(d => d.cells));
  check('position chips on one row: All 76 · GK · DEF · MID · FWD', t.chips.join(' · ') === 'All 76 · GK · DEF · MID · FWD', t.chips);
  check('"Player pts" label, last game column "19 Oct"', /PLAYER PTS/i.test(t.plabel) && t.lastHead === '19 Oct', [t.plabel, t.lastHead]);
  const mv = t.engine.filter(e => e.move).length;
  const mvDom = await p.evaluate(() => document.querySelectorAll('.pl-tbl tbody .mv').length);
  check(`movement shown on every mover (${mv})`, mv === mvDom, `${mvDom} of ${mv}`);
  const you = await p.evaluate(() => { const tr = document.querySelector('.pl-tbl tr.you'); if (!tr) return null; const b = tr.cells[1].getBoundingClientRect(); const nav = document.getElementById('app-nav').getBoundingClientRect();
    return { pid: tr.dataset.pid, cls: tr.className, rank: tr.cells[0].innerText, top: b.top, bottom: b.bottom, navTop: nav.top }; });
  check('"you" row = Andrew 12th, you-row t-red', you && you.pid === ANDREW && you.rank === '12' && /you-row/.test(you.cls) && /t-red/.test(you.cls), you);
  check('"you" row pinned above the nav before scrolling', you && you.bottom <= you.navTop + 1 && you.top > 0, you);
  await s.shot(path.join(OUT, 'players-you-pinned-390-dark.png'));
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(250);
  const you2 = await p.evaluate(() => { const b = document.querySelector('.pl-tbl tr.you td:nth-child(2)').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, vh: innerHeight }; });
  check('…and pinned under the header after scrolling past it', you2.top >= 55 && you2.bottom <= you2.vh, you2);
  await s.shot(path.join(OUT, 'players-you-scrolled-390-dark.png'));
  await p.evaluate(() => window.scrollTo(0, 0)); await sleep(150);
  await p.click('[data-chips="tpos"] [data-value="GK"]'); await sleep(200);
  const gk = await p.evaluate(() => [...document.querySelectorAll('.pl-tbl tbody tr .pos')].map(e => e.textContent));
  check(`GK chip shows only keepers (${gk.length})`, gk.length > 0 && gk.every(x => x === 'GK'));
  await p.click('[data-chips="tpos"] [data-value="all"]'); await sleep(200);
  await p.click('[data-seg="tview"] [data-value="last"]'); await sleep(200);
  const lg = await p.evaluate(() => { const rows = Scoring.seasonTable(Store.state).filter(r => r.lastPts != null);
    const dom = [...document.querySelectorAll('.pl-tbl tbody tr')].map(tr => Number(tr.cells[3].innerText));
    return { n: rows.length, dom, max: Math.max(...rows.map(r => r.lastPts)), first: document.querySelector('.pl-tbl tbody tr').cells[1].innerText.split('\n')[0] }; });
  check(`Last game view = the 18 players of 19 Oct, best first (${lg.first} ${lg.max})`, lg.dom.length === lg.n && lg.n === 18 && lg.dom[0] === lg.max && lg.first === 'Harry' && lg.dom.every((v, i) => !i || v <= lg.dom[i - 1]), lg);
  await s.shot(path.join(OUT, 'players-lastgame-390-dark.png'));
  await audit(p, 'players last game');
  await p.click('[data-seg="tview"] [data-value="season"]'); await sleep(200);
  await p.click('.pl-tbl tbody tr[data-pid="seed_p001"]'); await sleep(350);
  const cur = await p.evaluate(() => App.current());
  check('tap a row → player.profile (Harry)', cur.id === 'player.profile' && cur.params.pid === 'seed_p001', cur);
  await done(s, 'players');
  const w = await H.open({ width: 1280, theme: 'light', route: '#/tables.players', viewer: ANDREW });
  const head = await w.page.evaluate(() => [...document.querySelectorAll('.pl-tbl thead th')].map(x => x.innerText.trim()).join(' '));
  check('laptop adds Apps · G · A', head === '# Player Apps G A 19 Oct Pts', head);
  await audit(w.page, 'players 1280 light');
  await done(w, 'players laptop');
}

// ------------------------------------------------------------------ stats
async function stats() {
  console.log('\n# Stats: podium + leaders = Scoring');
  const s = await H.open({ width: 390, theme: 'dark', route: '#/tables.stats', viewer: 'guest' });
  const p = s.page;
  const r = await p.evaluate(() => {
    const rows = Scoring.seasonTable(Store.state); const L = Scoring.leaders(Store.state);
    const pod = [...document.querySelectorAll('.pod .pcol')].map(c => ({ name: c.querySelector('.nm').textContent, v: c.querySelector('.hn').textContent, rank: c.querySelector('.step b').textContent,
      st: [...c.querySelectorAll('.st')].map(x => x.textContent), team: (c.className.match(/t-(\w+)/) || [])[1], hero: c.classList.contains('hero') }));
    const ldr = [...document.querySelectorAll('.ldr')].map(e => ({ k: e.querySelector('.k').textContent, w: e.querySelector('.w').textContent, v: e.querySelector('.hn').textContent, nx: e.querySelector('.nx').textContent, team: (e.className.match(/t-(\w+)/) || [])[1] }));
    return { pod, ldr, L: { g: L.goals.value, a: L.assists.value, sv: L.saves.value, gn: L.goals.players[0].name, an: L.assists.players[0].name, svn: L.saves.players[0].name },
      top3: rows.slice(0, 3).map(x => x.name + ' ' + x.pts), medal: !!document.querySelector('#app-screen [class*="medal"], #app-screen [class*="silver"], #app-screen [class*="bronze"]'), text: document.querySelector('#app-screen').innerText };
  });
  check('podium shown 2 · 1 · 3 = Harry 416 · Emmanuel 484 · Reuel 247 (= seasonTable top 3)', r.pod.map(x => x.name + ' ' + x.v).join(' · ') === 'Harry 416 · Emmanuel 484 · Reuel 247' && r.pod.map(x => x.rank).join('') === '213' && r.top3.join() === 'Emmanuel 484,Harry 416,Reuel 247', r.pod);
  check('podium key stats + last game: "63 goals · 36 assists", "+5 on 19 Oct", "+14", "+7"', r.pod[1].st.join(' | ') === '63 goals · 36 assists | +5 on 19 Oct' && r.pod[0].st[1] === '+14 on 19 Oct' && r.pod[2].st[1] === '+7 on 19 Oct', r.pod.map(x => x.st));
  check("podium steps in each player's team colour (green · red · green); #1 is the one hero", r.pod.map(x => x.team).join() === 'green,red,green' && r.pod.filter(x => x.hero).length === 1 && r.pod[1].hero);
  check('leaders: Goals Emmanuel 63 · Assists Emmanuel 36 · Saves Mike 185 (= Scoring.leaders)', r.ldr.map(x => `${x.k} ${x.w} ${x.v}`).join(' · ').toLowerCase() === `goals ${r.L.gn} ${r.L.g} · assists ${r.L.an} ${r.L.a} · saves ${r.L.svn} ${r.L.sv}`.toLowerCase() && r.L.g === 63 && r.L.sv === 185, r.ldr);
  check('runner-up: "Next: Harry 55", "Next: Harry 31", "Next: Toby 153"', r.ldr.map(x => x.nx).join(' | ') === 'Next: Harry 55 · Top 5 › | Next: Harry 31 · Top 5 › | Next: Toby 153 · Top 5 ›', r.ldr.map(x => x.nx));
  check('no medal colours, no emoji', !r.medal && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(r.text));
  await audit(p, 'stats 390 dark');
  await p.click('[data-tap="top"][data-k="pts"]'); await sleep(400);
  const top = await p.evaluate(() => ({ t: document.querySelector('.sh-tables-top .sheet-title').textContent, rows: [...document.querySelectorAll('.sh-tables-top .r')].map(x => x.querySelector('.nm').textContent + ' ' + x.querySelector('.pts').textContent),
    eng: Scoring.seasonTable(Store.state).slice(0, 10).map(x => x.name + ' ' + x.pts) }));
  check('Top 10 › sheet = seasonTable top 10', top.t === 'Top 10 · Points' && JSON.stringify(top.rows) === JSON.stringify(top.eng), top);
  await s.shot(path.join(OUT, 'stats-top10-390-dark.png'));
  await audit(p, 'top 10 sheet');
  await p.click('.sh-tables-top .r'); await sleep(400);
  check('Top 10 row → player.profile', await screenId(p) === 'player.profile');
  await p.evaluate(() => App.go('tables.stats')); await sleep(400);
  await p.evaluate(() => document.querySelector('.ldr[data-k="sv"]').scrollIntoView({ block: 'center' })); await sleep(150);
  await p.click('.ldr[data-k="sv"]'); await sleep(400);
  const sv = await p.evaluate(() => [...document.querySelectorAll('.sh-tables-top .r')].map(x => x.querySelector('.nm').textContent + ' ' + x.querySelector('.pts').textContent));
  check('Saves › Top 5: Mike 185, Toby 153 first', sv.length >= 2 && sv[0] === 'Mike 185' && sv[1] === 'Toby 153', sv);
  await s.shot(path.join(OUT, 'stats-top5-saves-390-dark.png'));
  await done(s, 'stats');
}

// ------------------------------------------------------------------ Blue (and Gold) via the Teams API
async function blue() {
  console.log('\n# Blue + Gold added through settings/teams (Teams API)');
  const s = await H.open({ width: 390, theme: 'dark', route: '#/tables.teams', viewer: 'guest', data: DATA.blue(), now: DATA.NOW_BLUE });
  const p = s.page;
  const r = await p.evaluate(() => ({ list: Teams.list().map(t => t.id).join(), rows: [...document.querySelectorAll('.tb-trow')].map(e => e.querySelector('.tb-tn').textContent + ' ' + e.querySelector('.tb-tp').textContent + ' ' + [...e.querySelectorAll('.wdl')].map(x => x.textContent).join('')),
    lbl: document.querySelector('.tb-lbl').innerText.replace(/\s+/g, ' '), blueCol: getComputedStyle(document.querySelector('.tb-trow.t-blue .tb-bar')).backgroundColor,
    full: [...document.querySelectorAll('.tb-ftbl tbody tr')].map(tr => [...tr.cells].map(c => c.innerText.trim()).join(' ')) }));
  check('Teams.list() = green, red, blue, gold', r.list === 'green,red,blue,gold', r.list);
  check('Blue row lit in blue (#5B8DEF)', /91, 141, 239/.test(r.blueCol), r.blueCol);
  check('Green 60 (the 2 Nov loss is its last L) · Red 48 · Blue 4 (W, D) · Gold 1 (D)', r.rows.join(' | ') === 'Green 60 LDWWL | Red 48 LWDLL | Blue 4 WD | Gold 1 D', r.rows);
  check('full table has a Blue and a Gold row', r.full.length === 4 && r.full.some(x => /^Blue 1 1 0/.test(x)) && r.full.some(x => /^Gold 0 1 0/.test(x)), r.full);
  check('"4 teams · 39 games"', r.lbl.includes('4 teams · 39 games'), r.lbl);
  await s.shot(path.join(OUT, 'blue-teams-390-dark.png'));
  await audit(p, 'blue teams');
  await p.evaluate(() => App.go('tables.stats')); await sleep(400);
  const st = await p.evaluate(() => ({ pod: [...document.querySelectorAll('.pod .pcol')].map(c => c.querySelector('.nm').textContent + ':' + (c.className.match(/t-(\w+)/) || [])[1]), ldr: [...document.querySelectorAll('.ldr')].map(e => (e.className.match(/t-(\w+)/) || [])[1]) }));
  check('Emmanuel (now Blue) heads the podium in blue; Reuel in gold', st.pod.includes('Emmanuel:blue') && st.pod.includes('Reuel:gold'), st);
  check('goal and assist leader rows in blue', st.ldr[0] === 'blue' && st.ldr[1] === 'blue', st.ldr);
  await s.shot(path.join(OUT, 'blue-stats-390-dark.png'));
  await p.evaluate(() => App.go('tables.players')); await sleep(400);
  const chips = await p.evaluate(() => [...new Set([...document.querySelectorAll('.pl-tbl .tc')].map(c => c.textContent))].sort().join());
  check('Players shows Blue and Gold chips', chips === 'Blue,Gold,Green,Red', chips);
  await s.shot(path.join(OUT, 'blue-players-390-dark.png'));
  await done(s, 'blue');
}

// ------------------------------------------------------------------ share cards
async function share() {
  console.log('\n# Share cards: Season, Last game (position-aware), Full time; Share / Save; every team colour');
  const s = await H.open({ width: 390, theme: 'dark', route: '#/tables.teams', viewer: ANDREW });
  const p = s.page;
  await p.evaluate(() => { const f = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { (window.__txt = window.__txt || []).push(String(t)); return f.call(this, t, ...a); }; });
  const texts = async (pid, kind) => { await p.evaluate(() => { UI.sheet.closeAll(); window.__txt = []; }); await p.evaluate((pid, kind) => App.action('player.shareCard', { pid, kind }), pid, kind); await sleep(900);
    return p.evaluate(() => { const c = document.querySelector('.sh-tables-share canvas'); c.getContext('2d'); window.__txt = []; return null; }).then(() => p.evaluate(() => { document.querySelector('[data-seg="ctheme"] .on').click(); return new Promise(r => setTimeout(() => r(window.__txt.slice()), 300)); })); };
  let t = await texts(ANDREW, 'last');
  check('Andrew (DEF) last game: 9 · BLOCKS 2 · CLEARANCES 3 · 4–6 RED LOST; no goals / assists', ['9', '2', '3', 'BLOCKS', 'CLEARANCES', '4–6', 'RED LOST', 'Defender · Red', 'MON 19 OCT', 'POINTS LAST GAME'].every(x => t.includes(x)) && !t.includes('GOALS') && !t.includes('ASSISTS'), t);
  await s.shot(path.join(OUT, 'share-sheet-last-andrew-390-dark.png'));
  t = await texts(MIKE, 'last');
  check('Mike (GK) last game: SAVES 9 · CONCEDED 6', t.includes('SAVES') && t.includes('CONCEDED') && t.includes('Goalkeeper · Red'), t);
  t = await texts(HARRY, 'last');
  check('Harry (FWD) last game: 14 · GOALS 3 · BLOCKS 2 (0 assists skipped) · 6–4 GREEN WON', ['14', 'GOALS', 'BLOCKS', 'GREEN WON', '6–4'].every(x => t.includes(x)) && !t.includes('ASSISTS'), t);
  t = await texts(ANDREW, 'season');
  check('Andrew season: 135 · 12th OF 76 · APPS 27 · GOALS 6 · ASSISTS 5 · DEF · RED', ['135', '12th', 'OF 76', '27', '6', '5', 'APPS', 'GOALS', 'ASSISTS', 'DEF · RED', 'SEASON POINTS'].every(x => t.includes(x)), t);
  const eng = await p.evaluate(() => { const r = Scoring.seasonTable().find(x => x.pid === 'seed_p011'); const st = Scoring.seasonStats('seed_p011'); return [r.rank, st.pts, st.apps, st.g, st.a]; });
  check('…= Scoring (rank 12, 135 pts, 27 apps, 6 goals, 5 assists)', eng.join() === '12,135,27,6,5', eng);
  await s.shot(path.join(OUT, 'share-sheet-season-andrew-390-dark.png'));
  t = await texts(ANDREW, 'ft');
  check("Full time (19 Oct): 6 – 4, GREEN / RED, scorers with minutes, Harry · 14 pts", ['FULL TIME', '6', '4', 'GREEN', 'RED', 'Harry', "10' 24' 45'", 'Keith', "12' 30'", 'Christopher O', "62'", 'Harry · 14 pts'].every(x => t.includes(x)), t);
  await p.evaluate(() => { document.querySelector('[data-seg="ctheme"] [data-value="dark"]').click(); });
  await sleep(300);
  await s.shot(path.join(OUT, 'share-sheet-ft-390-dark.png'));
  await audit(p, 'share sheet');
  await p.evaluate(() => { window.__dl = []; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push(this.download); return; } return o.call(this); }; });
  await p.click('.sh-tables-share [data-tap="save-img"]'); await sleep(500);
  let dl = await p.evaluate(() => window.__dl);
  check('Save image downloads both full-time pages (unseen heroes, feature/unseen-heroes)', dl.join() === 'befit-full-time-2026-10-19.png,befit-unseen-heroes-2026-10-19.png', dl);
  await p.evaluate(() => { navigator.share = undefined; navigator.canShare = undefined; });
  await p.click('.sh-tables-share [data-tap="share-img"]'); await sleep(500);
  dl = await p.evaluate(() => window.__dl);
  check('Share with no Web Share falls back to downloading both pages', dl.length === 4, dl);
  await p.evaluate(() => { window.__shared = null; navigator.canShare = o => !!(o && o.files); navigator.share = o => { window.__shared = o.files.map(f => f.name + ':' + f.type + ':' + f.size); return Promise.resolve(); }; });
  await p.click('.sh-tables-share [data-tap="share-img"]'); await sleep(500);
  const sh = await p.evaluate(() => window.__shared);
  check('Share sends the PNG through Web Share', sh && /image\/png:\d{5,}/.test(sh[0]), sh);
  const dims = await p.evaluate(() => { const c = document.querySelector('.sh-tables-share canvas'); return [c.width, c.height]; });
  check('the card is 1080 × 1350', dims.join() === '1080,1350', dims);
  await p.evaluate(() => UI.sheet.closeAll());
  await p.evaluate(sid => App.action('share.fullTime', { sid }), LIVE19); await sleep(700);
  const ftSheet = await p.evaluate(() => ({ t: document.querySelector('.sh-tables-share .sheet-title').textContent, seg: !!document.querySelector('.sh-tables-share [data-seg="cview"]') }));
  check('share.fullTime opens the Full-time card sheet', ftSheet.t === 'Full-time card' && !ftSheet.seg, ftSheet);
  const prev = await p.evaluate(sid => { const c = document.createElement('canvas'); document.body.appendChild(c); const r = App.action('share.fullTime', { sid, canvas: c, theme: 'dark' }); const ok = r === c && c.width === 1080; c.remove(); return ok; }, LIVE19);
  check("share.fullTime({ sid, canvas }) draws the preview into the caller's canvas", prev);
  await p.evaluate(() => { UI.sheet.closeAll(); window.__dl = []; });
  const saved = await p.evaluate(sid => App.action('share.fullTime', { sid, save: true }).then(ok => ({ ok, dl: window.__dl.slice(), sheet: !!document.querySelector('.sh-tables-share') })), LIVE19);
  check('share.fullTime({ sid, save: true }) downloads the PNG, no sheet', saved.ok && saved.dl[0] === 'befit-full-time-2026-10-19.png' && !saved.sheet, saved);
  await p.evaluate(sid => App.action('share.fullTime', { sid }), LIVE19); await sleep(600);
  const tg = await p.evaluate(() => [...document.querySelectorAll('.sh-tables-share button')].filter(b => b.getBoundingClientRect().width).map(b => [b.textContent.trim(), Math.round(b.getBoundingClientRect().height)]));
  check('every share-sheet control is ≥ 48 px (referee screens open it too)', tg.length >= 5 && tg.every(([, h]) => h >= 48), tg);
  await done(s, 'share');

  // every team colour × dark / light × Season / Last game / Full time; the top edge is the team colour
  const cases = [['green', HARRY], ['red', ANDREW], ['blue', EMM], ['gold', REUEL]];
  const ft = { green: LIVE19, red: LIVE19, blue: 'test_blue_2nov', gold: 'test_gold_9nov' };
  for (const theme of ['dark', 'light']) {
    const s2 = await H.open({ width: 390, theme, route: '#/tables.teams', viewer: 'guest', data: DATA.blue(), now: DATA.NOW_BLUE });
    const p2 = s2.page;
    for (const [team, pid] of cases) for (const kind of ['season', 'last', 'ft']) {
      await p2.evaluate(() => UI.sheet.closeAll());
      if (kind === 'ft') await p2.evaluate(sid => App.action('share.fullTime', { sid }), ft[team]);
      else await p2.evaluate((pid, kind) => App.action('player.shareCard', { pid, kind }), pid, kind);
      await sleep(700);
      // ft: sample the right half (19 Oct: Red; 2 Nov: Blue, right of Green by Settings order; 9 Nov: Gold right of Blue). last: the team he played for.
      const edgeTeam = kind === 'ft' ? { green: 'red', red: 'red', blue: 'blue', gold: 'gold' }[team] : kind === 'last' ? await p2.evaluate(pid => Scoring.playerHistory(pid, Store.state, 1)[0].team, pid) : team;
      const info = await p2.evaluate(({ edgeTeam, theme }) => {
        const c = document.querySelector('.sh-tables-share canvas'); const x = c.getContext('2d').getImageData(Math.round(c.width * 3 / 4), 4, 1, 1).data;
        const pr = document.createElement('div'); pr.dataset.theme = theme; document.body.appendChild(pr); const v = getComputedStyle(pr).getPropertyValue('--' + edgeTeam).trim(); pr.remove();
        return { got: '#' + [x[0], x[1], x[2]].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase(), want: v.toUpperCase(), on: document.querySelector('[data-seg="ctheme"] .on').dataset.value };
      }, { edgeTeam, theme });
      check(`[${team} ${theme} ${kind}] team edge = ${edgeTeam}, card follows the app theme`, info.got === info.want && info.on === theme, info);
      await (await p2.$('.sh-tables-share .tb-cardwrap')).screenshot({ path: path.join(OUT, `card-${kind}-${team}-${theme}.png`) });
    }
    const longest = await p2.evaluate(() => Object.entries(Store.players()).sort((a, b) => b[1].name.length - a[1].name.length)[0][0]);
    await p2.evaluate(() => UI.sheet.closeAll()); await p2.evaluate(pid => App.action('player.shareCard', { pid, kind: 'season' }), longest); await sleep(700);
    await (await p2.$('.sh-tables-share .tb-cardwrap')).screenshot({ path: path.join(OUT, `card-season-longest-name-${theme}.png`) });
    await p2.evaluate(() => UI.sheet.closeAll()); await p2.evaluate(() => App.action('share.fullTime', { sid: '-P0OIJNXz07vIXtXLfSD' })); await sleep(700);
    await (await p2.$('.sh-tables-share .tb-cardwrap')).screenshot({ path: path.join(OUT, `card-ft-6-scorers-${theme}.png`) });
    await done(s2, 'cards ' + theme);
  }
  const w = await H.open({ width: 1280, theme: 'light', route: '#/tables.stats', viewer: ANDREW });
  await w.page.evaluate(() => App.action('player.shareCard', { pid: 'seed_p011' })); await sleep(800);
  await w.shot(path.join(OUT, 'share-sheet-1280-light.png')); await audit(w.page, 'share 1280 light');
  await done(w, 'share laptop');
}

// ------------------------------------------------------------------ screens at 390 / 1280 × dark / light
async function shots() {
  console.log('\n# Screens 390 / 1280 × dark / light (real data and Blue night)');
  for (const width of [390, 1280]) for (const theme of ['dark', 'light']) {
    const s = await H.open({ width, theme, route: '#/tables.teams', viewer: ANDREW });
    for (const id of ['teams', 'players', 'stats']) {
      await s.page.evaluate(id => App.go('tables.' + id), id); await sleep(400);
      await s.page.evaluate(() => window.scrollTo(0, 0)); await sleep(100);
      await s.shot(path.join(OUT, `${id}-${width}-${theme}.png`));
      await audit(s.page, `${id} ${width} ${theme}`);
    }
    await done(s, `shots ${width} ${theme}`);
    const b = await H.open({ width, theme, route: '#/tables.teams', viewer: 'guest', data: DATA.blue(), now: DATA.NOW_BLUE });
    for (const id of ['teams', 'players', 'stats']) { await b.page.evaluate(id => App.go('tables.' + id), id); await sleep(400); await b.shot(path.join(OUT, `blue-${id}-${width}-${theme}.png`)); await audit(b.page, `blue ${id} ${width} ${theme}`); }
    await done(b, `blue shots ${width} ${theme}`);
  }
}

(async () => {
  const want = process.argv[2];
  const ALL = { numbers, players, stats, blue, share, shots };
  for (const [k, fn] of Object.entries(ALL)) { if (want && want !== k) continue; try { await fn(); } catch (e) { fail++; console.log('  FAIL ' + k + ' threw: ' + e.message.split('\n')[0]); } }
  console.log(`\n${pass} ok, ${fail} FAIL`);
  process.exitCode = fail ? 1 : 0;
})();
