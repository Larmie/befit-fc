// Home area test (Round 5; replaces the Phase 2 player test): guest + player homes, the Match tab, Me, profile,
// the match summary, the live breakdown sheet and the goal moment, at 390 + 1280, dark + light, with no game,
// a live game (72') and full time. Numbers reconciled against Scoring. TEST MODE ONLY (harness).
// Retired with round 5 (now owned by tables.js and its own tests): player.table, player.season, the share card canvas.
const path = require('path');
const fs = require('fs');
const H = require('../harness.js');
const OUT = H.out(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const results = [];
const check = (label, ok, extra) => { ok ? pass++ : fail++; const line = `${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? '  · ' + extra : ''}`; results.push(line); console.log(line); };

const LIVE_SID = '-P4KcMogcPM8_RRG9wAQ';   // Mon 19 Oct
const M12 = '-P3lenQyxWIniPyrtFAn';         // Mon 12 Oct
const NOW = new Date('2026-10-19T19:30:00').getTime();
const TUE = '2026-10-20T12:00';             // the day after: no game on
const ANDREW = 'seed_p011', CHRIS_O = 'seed_p045', EMM = 'seed_p002';

function liveData() {
  const d = H.snapshot();
  const s = d.sessions[LIVE_SID];
  s.status = 'active';
  for (const [k, e] of Object.entries(s.events)) if (e.min == null || e.min > 72 || e.stoppageMin != null) delete s.events[k];
  s.timer = { status: 'running', startedAt: NOW - 72 * 60000 + 20000, pausedAt: null, pausedTotal: 0, htLogged: true, endedAt: null, stoppageStartedAt: null, stoppageTotal: 0, stoppageBaseTotalMs: null };
  Object.values(s.events).forEach(e => { e.timestamp = NOW - (72 - e.min) * 60000; });
  delete s.goals; delete s.cleanSheets;
  return d;
}
function bigPolesData() {
  const d = H.snapshot();
  const s = d.sessions[M12];
  const mike = Object.keys(s.teams.red.players).find(pid => d.players[pid].name === 'Mike');
  s.format = { start: 'small', switchedAt: 46, keepers: { red: mike } };
  return { d, mike };
}

// page health: sideways scroll, 12 px floor, cut-off text, one hero, no Geist Mono above 24 px
async function health(s, tag, scope) {
  const r = await s.page.evaluate(scope => {
    const out = { hscroll: document.documentElement.scrollWidth - window.innerWidth, small: [], cut: [], mono: [], heroes: 0 };
    const vis = el => { const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return cs.visibility !== 'hidden' && cs.display !== 'none' && b.width > 0 && b.height > 0; };
    const sel = scope === 'sheet' ? '.sheet *' : '#app-screen *, #app-header *, .sheet *, .pl-gm *';
    document.querySelectorAll(sel).forEach(el => {
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own || !vis(el)) return;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.fontSize) < 12) out.small.push(el.className + ':' + el.textContent.trim().slice(0, 20) + ':' + cs.fontSize);
      if (/Geist Mono/i.test(cs.fontFamily) && parseFloat(cs.fontSize) > 24.5) out.mono.push(el.className + ':' + cs.fontSize);
      const clips = cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.webkitLineClamp !== 'none';
      if (clips && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) out.cut.push(el.className + ':' + el.textContent.trim().slice(0, 30));
    });
    const root = scope === 'sheet' ? [...document.querySelectorAll('.sheet')].pop() : document.getElementById('app-screen');
    out.heroes = root ? [...root.querySelectorAll('.hero')].filter(h => vis(h) && !h.parentElement.closest('.hero')).length : 0;
    return out;
  }, scope || 'screen');
  check(`[${tag}] no sideways scroll`, r.hscroll <= 0, r.hscroll > 0 ? r.hscroll + 'px' : '');
  check(`[${tag}] nothing under 12 px`, !r.small.length, r.small.slice(0, 3).join(' | '));
  check(`[${tag}] no cut-off text`, !r.cut.length, r.cut.slice(0, 3).join(' | '));
  check(`[${tag}] at most one glowing hero`, r.heroes <= 1, r.heroes + ' heroes');
  check(`[${tag}] no Geist Mono above 24 px`, !r.mono.length, r.mono.slice(0, 3).join(' | '));
}
const screenId = p => p.evaluate(() => document.querySelector('#app-screen section')?.dataset.screen);
const txt = (p, sel) => p.$eval(sel, e => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
const sbScore = (p, root) => p.evaluate(r => [...document.querySelectorAll(`${r} .sb .sb-half .hn`)].map(e => e.textContent).join('-'), root);

// ------------------------------------------------------------------ 1. matrix of screens
async function matrix() {
  const routes = [
    ['guest-home-nogame', '#/guest.home', { viewer: 'guest', now: TUE }],
    ['guest-home-live', '#/guest.home', { viewer: 'guest', data: liveData() }],
    ['guest-home-fulltime', '#/guest.home', { viewer: 'guest' }],
    ['guest-match', '#/player.live', { viewer: 'guest', now: TUE }],
    ['player-home-nogame', '#/player.home', { viewer: ANDREW, now: TUE }],
    ['player-home-live', '#/player.home', { viewer: ANDREW, data: liveData() }],
    ['player-home-fulltime', '#/player.home', { viewer: ANDREW }],
    ['match-tab-live', '#/player.live', { viewer: ANDREW, data: liveData() }],
    ['match-tab-fulltime', '#/player.live', { viewer: ANDREW }],
    ['me', '#/player.me', { viewer: ANDREW }],
    ['me-guest', '#/player.me', { viewer: 'guest' }],
    ['match-12oct', '#/player.match?sid=' + M12, { viewer: ANDREW }],
    ['match-live', '#/player.match?sid=' + LIVE_SID, { viewer: ANDREW, data: liveData() }],
    ['profile-harry', '#/player.profile?pid=seed_p001', { viewer: ANDREW }],
  ];
  for (const width of [390, 1280]) for (const theme of ['dark', 'light']) {
    for (const [name, route, o] of routes) {
      const tag = `${name}-${width}-${theme}`;
      const s = await H.open(Object.assign({ width, theme, route }, o));
      await sleep(250);
      await s.shot(path.join(OUT, `${tag}.png`), { fullPage: width === 390 });
      await health(s, tag);
      check(`[${tag}] no console errors`, !s.errors.length, s.errors.slice(0, 2).join(' | '));
      await s.close();
    }
  }
}

// ------------------------------------------------------------------ 2. numbers vs the engine
async function numbers() {
  // ---- Me (Andrew): 135 = 58 + 77, rank chip, bars in team colour, subs with reasons
  const m = await H.open({ width: 390, theme: 'dark', route: '#/player.me', viewer: ANDREW });
  const me = await m.page.evaluate(pid => {
    const st = Scoring.seasonStats(pid, Store.state);
    const rows = Scoring.seasonTable(Store.state); const r = rows.find(x => x.pid === pid);
    const h5 = Scoring.playerHistory(pid, Store.state, 5).reverse();
    const bars = [...document.querySelectorAll('.pl-bar')].map(b => ({ v: b.querySelector('.pl-bar-v').textContent, r: (b.className.match(/is-([WDL])/) || [])[1] || '',
      team: (b.className.match(/t-(\w+)/) || [])[1], bg: getComputedStyle(b.querySelector('i')).backgroundColor, h: b.querySelector('i').getBoundingClientRect().height }));
    const red = getComputedStyle(document.querySelector('.pl-bar.t-red') || document.body).getPropertyValue('--tc').trim();
    const probe = document.createElement('i'); probe.style.background = red; document.body.appendChild(probe); const redRgb = getComputedStyle(probe).backgroundColor; probe.remove();
    return { st, r, n: rows.length, hero: document.querySelector('.pl-hero').textContent, heroPx: parseFloat(getComputedStyle(document.querySelector('.pl-hero')).fontSize),
      heroCard: document.querySelector('.pl-pcard').className, stats: [...document.querySelectorAll('.pl-stats > div')].map(d => d.innerText.replace(/\s+/g, ' ').trim()),
      rank: document.querySelector('.pl-rank').textContent, bars, want: h5.map(h => ({ v: String(h.pts), r: h.result, team: h.team })), redRgb,
      subs: document.querySelector('.pl-subs').innerText.replace(/\s+/g, ' ') };
  }, ANDREW);
  check(`Me hero = seasonStats.pts (${me.st.pts}), 72 px, the glowing hero in his team colour`, me.hero === String(me.st.pts) && me.heroPx === 72 && /hero/.test(me.heroCard) && /t-red/.test(me.heroCard), me.hero + ' ' + me.heroPx + 'px');
  check('Me apps/goals/assists/yellow = seasonStats', me.stats.join('|') === `${me.st.apps} Apps|${me.st.g} Goals|${me.st.a} Assists|${me.st.y} Yellow`, me.stats.join('|'));
  check(`Me rank chip = "${me.r.rank}th ▲${me.r.move}" (table rank + movement)`, me.rank === `${me.r.rank}th${me.r.move ? (me.r.move > 0 ? ' ▲' : ' ▼') + Math.abs(me.r.move) : ''}`, me.rank);
  check('Me last 5 bars = history, oldest left (value, result, team)', me.bars.length === me.want.length && me.bars.every((b, i) => b.v === me.want[i].v && b.r === me.want[i].r && b.team === me.want[i].team), me.bars.map(b => b.v + b.r).join(' '));
  const won = me.bars.filter(b => b.r === 'W'), lost = me.bars.filter(b => b.r === 'L');
  check('won bars are full team colour; lost bars are faint (the won/brightest bug fixed)', won.length > 0 && won.every(b => b.bg === me.redRgb) && lost.every(b => b.bg !== me.redRgb), `W ${won.map(b => b.bg).join()} · L ${lost[0] && lost[0].bg} · red ${me.redRgb}`);
  check('bar heights follow points (9 tallest)', me.bars.every(b => b.h <= Math.max(...me.bars.map(x => x.h))) && me.bars.find(b => b.v === String(Math.max(...me.want.map(w => +w.v)))).h === Math.max(...me.bars.map(x => x.h)));
  check('Subs card shows the date not paid', /7 Sep not paid/.test(me.subs), me.subs);
  // (i): how 135 adds up, as a sum
  await m.page.click('[data-tap="carry"]'); await sleep(250);
  const carry = await m.page.evaluate(() => {
    const sh = document.querySelector('.sh-player-carry');
    const v = [...sh.querySelectorAll('.sum .sr')].map(r => ({ l: r.querySelector('.sr-l').textContent, v: r.querySelector('.v').textContent, right: r.querySelector('.v').getBoundingClientRect().right }));
    const tot = sh.querySelector('.sum-tot .hn'); return { title: sh.querySelector('.sheet-title').textContent, v, total: tot.textContent, totRight: tot.getBoundingClientRect().right, totPx: parseFloat(getComputedStyle(tot).fontSize) };
  });
  check(`(i) "How 135 adds up": ${carry.v.map(x => x.v).join(' + ')} = ${carry.total}`, carry.title === `How ${me.st.pts} adds up` && carry.v[0].v === '58' && carry.v[0].l === 'Jan – May (carried over)' && Number(carry.v[0].v) + Number(carry.v[1].v) === Number(carry.total) && carry.total === String(me.st.pts), carry.v.map(x => x.l + ' ' + x.v).join(' / '));
  check('(i) since line counts games (27 apps − 10 carried = 17)', /Since \d+ \w+ · 17 games/.test(carry.v[1].l), carry.v[1].l);
  check('(i) sum pattern: values and total share one right edge, total 56 px', carry.v.every(x => Math.abs(x.right - carry.totRight) <= 1.5) && carry.totPx === 56, carry.v.map(x => Math.round(x.right)).join(',') + ' vs ' + Math.round(carry.totRight));
  await health(m, 'carry-sheet', 'sheet');
  await m.shot(path.join(OUT, 'me-carry-sheet-390-dark.png'));
  await m.page.keyboard.press('Escape'); await sleep(150);
  // subs with reasons
  await m.page.click('[data-tap="subs"]'); await sleep(250);
  const subs = await m.page.evaluate(() => [...document.querySelectorAll('.sh-player-subs .r')].map(r => r.innerText.replace(/\s+/g, ' ')));
  const subsEnd = await m.page.evaluate(() => { const e = document.querySelector('.sh-player-subs h4 .end'); return e ? { t: e.innerText, f: getComputedStyle(e.querySelector('*') || e).fontFamily } : null; });
  check('Subs: every line says why (Played / Paid · didn\'t play)', subs.length > 0 && subs.every(x => /Played|Paid · didn't play/.test(x)), subs.slice(0, 5).join(' / '));
  check('Subs: 10 Aug reads "Paid · didn\'t play"', subs.some(x => /Mon 10 Aug Paid · didn't play/.test(x)), subs.find(x => /10 Aug/.test(x)));
  check('Subs: 7 Sep "Played · Not paid", header "1 not paid" not in Mono', subs.some(x => /Mon 7 Sep Played Not paid/.test(x)) && subsEnd && subsEnd.t === '1 not paid' && !/Mono/.test(subsEnd.f), JSON.stringify(subsEnd));
  await health(m, 'subs-sheet', 'sheet');
  await m.shot(path.join(OUT, 'me-subs-sheet-390-dark.png'));
  await m.page.keyboard.press('Escape'); await sleep(150);
  // Share entry calls player.shareCard (owned by tables.js)
  await m.page.evaluate(() => { window.__acts = []; const a = App.action; App.action = (n, x) => { window.__acts.push(n + ':' + (x && x.pid)); return a(n, x); }; });
  await m.page.click('.pl-share'); await sleep(300);
  check('Me › Share calls player.shareCard for him', (await m.page.evaluate(() => window.__acts)).includes('player.shareCard:' + ANDREW));
  await m.page.keyboard.press('Escape'); await sleep(150);
  // history row → match
  const sid0 = await m.page.$eval('.pl-hist [data-tap="match"]', b => b.dataset.sid);
  await m.page.click('.pl-hist [data-tap="match"]'); await sleep(300);
  check('a Matches row opens its match summary', await screenId(m.page) === 'player.match' && await m.page.evaluate(s => location.hash.includes(s), sid0));
  check('[me] no console errors', !m.errors.length, m.errors.slice(0, 2).join(' | '));
  await m.close();

  // ---- profile = engine history
  const pr = await H.open({ width: 390, theme: 'dark', route: '#/player.profile?pid=seed_p001', viewer: ANDREW });
  const ph = await pr.page.evaluate(() => {
    const h = Scoring.playerHistory('seed_p001', Store.state);
    const dom = [...document.querySelectorAll('.pl-hist [data-tap="match"]')].map(b => ({ sid: b.dataset.sid, pts: b.querySelector('.pts').textContent }));
    return { ok: h.length === dom.length && h.every((x, i) => x.sid === dom[i].sid && String(x.pts) === dom[i].pts), n: h.length, subs: !!document.querySelector('.pl-subs'), hero: document.querySelector('.pl-hero').textContent, want: Scoring.seasonStats('seed_p001').pts };
  });
  check('profile: match history = Scoring.playerHistory (every row), hero = season pts, no Subs', ph.ok && !ph.subs && ph.hero === String(ph.want), ph.n + ' rows');
  await pr.close();

  // ---- player home (Andrew, Tuesday): You hero + table near you
  const hm = await H.open({ width: 390, theme: 'dark', route: '#/player.home', viewer: ANDREW, now: TUE });
  const home = await hm.page.evaluate(pid => {
    const rows = Scoring.seasonTable(Store.state); const i = rows.findIndex(r => r.pid === pid); const r = rows[i];
    const h = Scoring.playerHistory(pid, Store.state, 1)[0];
    const near = [...document.querySelectorAll('.pl-near .r')].map(b => ({ pid: b.dataset.pid, rank: b.querySelector('.pl-rn').textContent, pts: b.querySelector('.pts').textContent, you: b.classList.contains('you-row') }));
    return { r, n: rows.length, h, near, want: rows.slice(i - 2, i + 3).map(x => ({ pid: x.pid, rank: String(x.rank), pts: String(x.pts) })),
      you: document.querySelector('.pl-yseason').innerText.replace(/\s+/g, ' '), youHero: document.querySelector('.pl-yseason').classList.contains('hero'),
      num: document.querySelector('.pl-ynum').textContent, numPx: parseFloat(getComputedStyle(document.querySelector('.pl-ynum')).fontSize),
      follow: document.querySelector('.pl-scard').innerText.replace(/\s+/g, ' '), followHero: document.querySelector('.pl-scard').classList.contains('hero') };
  }, ANDREW);
  check(`player home: You = ${home.r.pts} pts (72 px hero), ${home.r.rank}th of ${home.n} ▲${home.r.move}, last game ${home.h.pts} pts`,
    home.num === String(home.r.pts) && home.numPx === 72 && home.youHero && !home.followHero && home.you.includes(`${home.r.rank}th`) && home.you.includes(`of ${home.n} · ▲${home.r.move}`) && home.you.includes(`Last game ${home.h.pts} pts · 2 blocks · 3 clearances`), home.you);
  check('player home: Follow the game shows the last game (FT · 19 Oct)', /Follow the game/i.test(home.follow) && /FT 19 Oct/i.test(home.follow), home.follow);
  check('table near you = rows rank−2 … rank+2 from the engine, his row lit', JSON.stringify(home.near.map(x => ({ pid: x.pid, rank: x.rank, pts: x.pts }))) === JSON.stringify(home.want) && home.near.filter(x => x.you).length === 1 && home.near.find(x => x.you).pid === ANDREW, home.near.map(x => x.rank + ':' + x.pts + (x.you ? '*' : '')).join(' '));
  await hm.page.click('.pl-near .r[data-pid="seed_p001"], .pl-near .r'); await sleep(300);
  check('a Table near you row opens that player\'s page', await screenId(hm.page) === 'player.profile');
  await hm.close();

  // ---- guest home (Tuesday): last game hero, next game, podium, season race
  const g = await H.open({ width: 390, theme: 'dark', route: '#/guest.home', viewer: 'guest', now: TUE });
  const gh = await g.page.evaluate(() => {
    const rows = Scoring.seasonTable(Store.state); const T = Scoring.teamStandings(Store.state);
    const last = Scoring.lastGame(Store.state);
    const pod = [...document.querySelectorAll('.pod .pcol')].map(c => ({ nm: c.querySelector('.nm').textContent, v: c.querySelector('.hn').textContent }));
    const race = [...document.querySelectorAll('.pl-race')].map(r => ({ team: (r.className.match(/t-(\w+)/) || [])[1], pts: r.querySelector('.pl-race-p').textContent }));
    const games = Scoring.completedSessions(Store.state).filter(x => Scoring.result(x.sess).valid).length;
    return { pod, want: [rows[1], rows[0], rows[2]].map(r => ({ nm: r.name, v: String(r.pts) })), race, T: { green: T.green.pts, red: T.red.pts }, games,
      raceLbl: [...document.querySelectorAll('.lbl')].map(l => l.innerText.replace(/\s+/g, ' ')).find(t => /Season race/i.test(t)),
      next: document.querySelector('.pl-next').innerText.replace(/\s+/g, ' '), card: document.querySelector('.pl-scard').innerText.replace(/\s+/g, ' '),
      cardHero: document.querySelector('.pl-scard').className, lastScore: Scoring.orderTeams(Scoring.teamsOf(last.sess)).map(t => Scoring.teamGoals(last.sess, t)).join('-') };
  });
  check('guest home: last game is the hero (Green 6–4 Red, FT 19 Oct), tinted with the winner', /Last game/i.test(gh.card) && (await sbScore(g.page, '.pl-scard')) === gh.lastScore && /hero t-green/.test(gh.cardHero), gh.lastScore + ' · ' + gh.cardHero);
  check('guest home: Next game = Mon 26 Oct', /Next game Mon 26 Oct/.test(gh.next), gh.next);
  check('guest home: podium 2 · 1 · 3 = the season table', JSON.stringify(gh.pod) === JSON.stringify(gh.want), gh.pod.map(x => x.nm + ' ' + x.v).join(', '));
  check(`guest home: Season race = league points (Green ${gh.T.green}, Red ${gh.T.red}), ${gh.games} games`, gh.race.length === 2 && gh.race.every(r => r.pts === String(gh.T[r.team])) && gh.raceLbl.includes(gh.games + ' games'), JSON.stringify(gh.race));
  check('guest home: no Me tab (Home · Match · Tables)', (await g.page.evaluate(() => [...document.querySelectorAll('#app-nav [data-tab]')].map(a => a.dataset.tab).join())) === 'home,match,tables');
  await g.page.click('.pod .pcol.first'); await sleep(300);
  check('guest home: podium #1 opens his page', await screenId(g.page) === 'player.profile');
  check('[guest home] no console errors', !g.errors.length, g.errors.slice(0, 2).join(' | '));
  await g.close();

  // ---- Match tab (no game): last game + every past game with mini scores
  const mt = await H.open({ width: 390, theme: 'dark', route: '#/player.live', viewer: 'guest', now: TUE });
  const mtab = await mt.page.evaluate(() => {
    const all = Scoring.completedSessions(Store.state);
    const rows = [...document.querySelectorAll('.pl-past .r')].map(r => ({ sid: r.dataset.sid, ms: [...r.querySelectorAll('.ms i')].map(i => i.textContent).join('-') }));
    const want = all.slice(1).map(x => ({ sid: x.sid, ms: Scoring.orderTeams(Scoring.teamsOf(x.sess)).map(t => Scoring.teamGoals(x.sess, t)).join('-') }));
    return { n: rows.length, ok: JSON.stringify(rows) === JSON.stringify(want), want: want.length, lbl: [...document.querySelectorAll('.lbl')].map(l => l.innerText.replace(/\s+/g, ' ')).find(t => /Past games/i.test(t)),
      first: rows[0] };
  });
  check(`Match tab: ${mtab.want} past games, mini scores = the engine (newest first)`, mtab.ok && mtab.lbl.endsWith(String(mtab.want)), mtab.lbl + ' · first ' + JSON.stringify(mtab.first));
  await mt.page.click('.pl-scard .sb'); await sleep(300);
  check('Match tab: tapping the score block opens the summary', await screenId(mt.page) === 'player.match');
  await mt.close();

  // ---- match summary (12 Oct): team switch in player pts, sum pattern on expand
  const ma = await H.open({ width: 390, theme: 'dark', route: '#/player.match?sid=' + M12, viewer: 'guest' });
  const mm = await ma.page.evaluate(sid => {
    const mb = Scoring.matchBreakdown(Store.session(sid), Store.state);
    const seg = [...document.querySelectorAll('[data-seg="mteam"] button')].map(b => b.innerText.replace(/\s+/g, ' ').trim());
    const sums = mb.columns.map(c => c.players.reduce((a, p) => a + p.total, 0) === c.points);
    const top = document.querySelector('.pl-top').innerText.replace(/\s+/g, ' ');
    return { seg, cols: mb.columns.map(c => `${c.team} ${c.points}`), sums, top, topE: mb.top };
  }, M12);
  check(`Match switch reads "${mm.seg.join('" | "')}" = engine`, mm.seg[0] === 'Green · 57 player pts' && mm.seg[1] === 'Red · 42' && mm.sums.every(Boolean), mm.cols.join(', '));
  check('Top points = engine', mm.top.includes(String(mm.topE.pts)) && mm.topE.players.every(p => mm.top.includes(p.name)), mm.top);
  await ma.page.click('[data-tap="expand"]'); await sleep(200);
  const ex = await ma.page.evaluate(sid => {
    const first = document.querySelector('.pl-x.open');
    const lines = [...first.querySelectorAll('.sum .sr')].map(r => r.innerText.replace(/\s+/g, ' '));
    const rights = [...first.querySelectorAll('.sum .sr .v')].map(v => v.getBoundingClientRect().right);
    const tot = first.querySelector('.sum-tot .hn');
    const mp = Scoring.matchBreakdown(Store.session(sid), Store.state).columns[0].players[0];
    return { name: first.querySelector('.nm').textContent, lines, want: mp.breakdown.map(b => `${b.label} ${b.pts > 0 ? '+' + b.pts : b.pts < 0 ? '−' + Math.abs(b.pts) : 0}`), total: tot.textContent, wantT: String(mp.total),
      aligned: rights.every(r => Math.abs(r - tot.getBoundingClientRect().right) <= 1.5), lab: first.querySelector('.sum-tot .lab').textContent };
  }, M12);
  check(`Tap-to-expand: ${ex.name} → ${ex.lines.join(' / ')} = ${ex.total} (sum pattern, right edges aligned)`, ex.lines.join('|') === ex.want.join('|') && ex.total === ex.wantT && ex.aligned && /· pts$/i.test(ex.lab), ex.lab);
  await health(ma, 'match-expanded');
  await ma.shot(path.join(OUT, 'match-expanded-390-dark.png'));
  check('[match] no console errors', !ma.errors.length, ma.errors.slice(0, 2).join(' | '));
  await ma.close();
}

// ------------------------------------------------------------------ 3. big poles match (keeper lines)
async function bigPoles() {
  const { d, mike } = bigPolesData();
  for (const theme of ['dark', 'light']) for (const width of [390, 1280]) {
    const s = await H.open({ width, theme, data: d, route: '#/player.match?sid=' + M12, viewer: 'guest' });
    const p = s.page;
    await p.click('[data-seg="mteam"] [data-value="red"]'); await sleep(150);
    await p.click(`[data-tap="expand"][data-key="${M12}|${mike}"]`); await sleep(150);
    const r = await p.evaluate(() => ({ lines: [...document.querySelectorAll('.pl-x.open .sum .sr')].map(x => x.innerText.replace(/\s+/g, ' ')), poles: document.querySelector('.pl-poles')?.textContent }));
    const tag = `bigpoles-${width}-${theme}`;
    check(`[${tag}] poles line says "Big poles from 46'"`, r.poles === "Big poles from 46'", r.poles);
    check(`[${tag}] keeper lines count from 46'`, r.lines.some(l => /saves? from 46'/.test(l)) && r.lines.filter(l => /save|conceded|Clean sheet/.test(l)).every(l => /from 46'/.test(l)), r.lines.join(' / '));
    await s.shot(path.join(OUT, `${tag}.png`));
    await health(s, tag);
    check(`[${tag}] no console errors`, !s.errors.length, s.errors.join(' | '));
    await s.close();
  }
}

// ------------------------------------------------------------------ 4. live match, the live breakdown, the goal moment
async function liveAndGoal() {
  for (const theme of ['dark', 'light']) {
    const s = await H.open({ width: 390, theme, data: liveData(), route: '#/player.live', viewer: EMM });
    const p = s.page;
    const lv = await p.evaluate(pid => {
      const sess = Store.activeSession();
      const all = Scoring.livePoints(sess, Store.state);
      const dom = [...document.querySelectorAll('.pl-lp .pl-rr')].slice(0, 5).map(r => r.querySelector('.nm').textContent + ' ' + r.querySelector('.pts').textContent);
      const me = all.find(x => x.pid === pid);
      return { dom, want: all.slice(0, 5).map(x => x.name + ' ' + x.total), you: document.querySelector('.pl-you .pl-you-n').textContent, meTotal: me.total,
        min: document.querySelector('.pl-scard .sb-mid').innerText.replace(/\s+/g, ' '), live: !!document.querySelector('.pl-scard .live.pulse'),
        want2: Scoring.orderTeams(Scoring.teamsOf(sess)).map(t => Scoring.teamGoals(sess, t)).join('-'), taps: [...document.querySelectorAll('.pl-lp .pl-rr')].every(r => r.dataset.tap === 'lbd') };
    }, EMM);
    check(`[live ${theme}] live points top 5 = engine`, lv.dom.join('|') === lv.want.join('|'), lv.dom.join(', '));
    check(`[live ${theme}] "You tonight · n pts live" = engine (${lv.meTotal})`, lv.you === String(lv.meTotal));
    check(`[live ${theme}] centre reads 72' 2nd half, LIVE pulses`, /^72' 2nd half$/i.test(lv.min) && lv.live, lv.min);
    check(`[live ${theme}] score = events (${lv.want2})`, (await sbScore(p, '.pl-scard')) === lv.want2);
    check(`[live ${theme}] every live points row opens the breakdown (not the profile)`, lv.taps);
    // tap Christopher O → his live breakdown as a sum
    await p.evaluate(pid => { const r = document.querySelector(`.pl-lp .pl-rr[data-pid="${pid}"]`); if (r) r.click(); else App.action('home.liveBreakdown', { sid: Store.activeSessionId(), pid }); }, CHRIS_O); await sleep(300);
    const bd = await p.evaluate(pid => {
      const sh = document.querySelector('.sh-player-bd'); if (!sh) return null;
      const mp = Scoring.matchPoints(Store.activeSession(), pid, Store.state);
      const vals = [...sh.querySelectorAll('.sum .sr .v')].map(v => v.textContent.replace('−', '-'));
      const tot = sh.querySelector('.sum-tot .hn');
      return { head: sh.querySelector('.pl-bdh').innerText.replace(/\s+/g, ' '), vals, want: mp.breakdown.map(b => (b.pts > 0 ? '+' : '') + b.pts), total: tot.textContent, wantT: String(mp.total),
        sum: vals.reduce((a, v) => a + Number(v), 0), aligned: [...sh.querySelectorAll('.sum .sr .v')].every(v => Math.abs(v.getBoundingClientRect().right - tot.getBoundingClientRect().right) <= 1.5),
        teamCls: sh.className, hero: !!sh.querySelector('.sum.hero'), screen: document.querySelector('#app-screen section').dataset.screen };
    }, CHRIS_O);
    check(`[live ${theme}] Christopher O breakdown: ${bd && bd.vals.join(' ')} = ${bd && bd.total} (= engine, values add up)`, bd && bd.vals.join() === bd.want.join() && bd.total === bd.wantT && bd.sum === Number(bd.total), bd && bd.head);
    check(`[live ${theme}] breakdown head "MID · Red · live at 72'", total is the hero, right edges aligned`, bd && /MID · Red · live at 72'/.test(bd.head) && bd.hero && bd.aligned && /t-red/.test(bd.teamCls), bd && bd.head);
    check(`[live ${theme}] breakdown opens over the Match tab (not the profile)`, bd && bd.screen === 'player.live');
    await health(s, `live-breakdown-${theme}`, 'sheet');
    await s.shot(path.join(OUT, `live-breakdown-390-${theme}.png`));
    await p.click('.sh-player-bd [data-tap="season-page"]'); await sleep(300);
    check(`[live ${theme}] "Season page ›" opens his page`, await screenId(p) === 'player.profile' && await p.evaluate(pid => location.hash.includes(pid), CHRIS_O));
    await p.evaluate(() => App.go('player.live')); await sleep(300);
    // You tonight → your own breakdown
    await p.click('.pl-you'); await sleep(250);
    check(`[live ${theme}] tapping You tonight shows your breakdown`, await p.evaluate(() => /Emmanuel/.test(document.querySelector('.sh-player-bd .pl-bdh')?.innerText || '')));
    await p.keyboard.press('Escape'); await sleep(150);
    // All n ›
    await p.click('[data-tap="all-live"]'); await sleep(250);
    const n = await p.evaluate(() => document.querySelectorAll('.sh-player-live .pl-rr').length);
    const want = await p.evaluate(() => Scoring.livePoints(Store.activeSession(), Store.state).length);
    check(`[live ${theme}] All ${want} › lists everyone`, n === want, n + '');
    await health(s, `live-all-sheet-${theme}`, 'sheet');
    await p.click('.sh-player-live .pl-rr'); await sleep(300);
    check(`[live ${theme}] a row in All › opens that player's breakdown`, !!(await p.$('.sh-player-bd')) && !(await p.$('.sh-player-live')));
    await p.keyboard.press('Escape'); await sleep(150);

    // goal moment: a new goal arrives on a watcher's phone
    const ev = await p.evaluate(() => {
      const sid = Store.activeSessionId(); const sess = Store.activeSession();
      const harry = Object.keys(sess.teams.green.players).find(pid => Store.player(pid).name === 'Harry');
      const eid = Store.newKey();
      Store.set(`sessions/${sid}/events/${eid}`, Clock.stamp({ type: 'goal', team: 'green', scorerId: harry, timestamp: Store.now() }, sess, Store.now()));
      return { eid, sid };
    });
    await sleep(120);
    const gm = await p.evaluate(() => { const g = document.querySelector('.pl-gm'); if (!g) return null;
      const w = g.querySelector('.pl-gm-word'); const cs = getComputedStyle(w);
      return { text: g.innerText.replace(/\s+/g, ' '), cls: g.className, px: parseFloat(cs.fontSize), weight: cs.fontWeight, bg: getComputedStyle(g).backgroundImage, sb: !!g.querySelector('.sb .sb-blk'),
        score: [...g.querySelectorAll('.sb .sb-half .hn')].map(x => x.textContent).join('-'), want: Scoring.orderTeams(Scoring.teamsOf(Store.activeSession())).map(t => Scoring.teamGoals(Store.activeSession(), t)).join('-') }; });
    check(`[goal ${theme}] goal moment on a viewer's phone: GOAL, Harry, the minute`, !!gm && /GOAL/.test(gm.text) && /Harry/.test(gm.text) && /73'|72'/.test(gm.text), gm && gm.text);
    check(`[goal ${theme}] team radial, GOAL 92/800, the joined score block with the new score`, gm && /t-green/.test(gm.cls) && /radial-gradient/.test(gm.bg) && gm.px === 92 && gm.weight === '800' && gm.sb && gm.score === gm.want, gm && `${gm.px}/${gm.weight} ${gm.score}`);
    await s.shot(path.join(OUT, `goal-moment-390-${theme}.png`));
    await sleep(2100);
    check(`[goal ${theme}] goal moment closes itself after 2 s`, !(await p.$('.pl-gm')));
    await p.evaluate(({ sid }) => { const sess = Store.activeSession(); const eid = Store.newKey();
      Store.set(`sessions/${sid}/events/${eid}`, Clock.stamp({ type: 'goal', team: 'red', scorerId: Object.keys(sess.teams.red.players)[0], timestamp: Store.now() }, sess, Store.now())); }, ev);
    await sleep(120);
    await p.click('.pl-gm'); await sleep(100);
    check(`[goal ${theme}] tap dismisses it`, !(await p.$('.pl-gm')));
    await p.evaluate(({ sid }) => { const sess = Store.activeSession(); const eid = Store.newKey(); window.__g3 = eid;
      Store.set(`sessions/${sid}/events/${eid}`, Clock.stamp({ type: 'goal', team: 'red', scorerId: Object.keys(sess.teams.red.players)[0], timestamp: Store.now() }, sess, Store.now())); }, ev);
    await sleep(120);
    await p.evaluate(({ sid }) => Store.remove(`sessions/${sid}/events/${window.__g3}`), ev);
    await sleep(150);
    check(`[goal ${theme}] Undo (event removed) hides it`, !(await p.$('.pl-gm')));
    await p.evaluate(({ sid }) => { const sess = Store.activeSession(); Store.set(`sessions/${sid}/events/${Store.newKey()}`, Clock.stamp({ type: 'block', playerId: Object.keys(sess.teams.red.players)[0], timestamp: Store.now() }, sess, Store.now())); }, ev);
    await sleep(120);
    check(`[goal ${theme}] a block doesn't trigger it`, !(await p.$('.pl-gm')));
    check(`[live ${theme}] no console errors`, !s.errors.length, s.errors.join(' | '));
    await s.close();
  }
  // guest home live: rows open the breakdown, not the profile
  const gl = await H.open({ width: 390, theme: 'dark', data: liveData(), route: '#/guest.home', viewer: 'guest' });
  const glv = await gl.page.evaluate(() => ({ score: !!document.querySelector('.pl-scard.hero .live.pulse'), rows: document.querySelectorAll('.pl-lp .pl-rr').length,
    lbl: document.querySelector('.pl-cardlbl').innerText.replace(/\s+/g, ' '), n: Scoring.sessEvents(Store.activeSession()).length }));
  check('guest home live: pulsing LIVE hero, "All n events ›", 5 live points rows', glv.score && glv.rows === 5 && glv.lbl.includes(`All ${glv.n} events`), glv.lbl);
  await gl.page.click('.pl-lp .pl-rr'); await sleep(300);
  check('guest home live: tapping a row opens the breakdown sheet, stays on Home', !!(await gl.page.$('.sh-player-bd')) && await screenId(gl.page) === 'guest.home');
  await gl.page.keyboard.press('Escape'); await sleep(150);
  await gl.page.click('[data-tap="all-feed"]'); await sleep(250);
  check('guest home live: All events sheet lists the feed', await gl.page.evaluate(() => document.querySelectorAll('.sh-player-feed .r').length) > 4);
  check('[guest live] no console errors', !gl.errors.length, gl.errors.join(' | '));
  await gl.close();
  // player home live: follow + You tonight + 3 rows near you
  const pl = await H.open({ width: 390, theme: 'dark', data: liveData(), route: '#/player.home', viewer: ANDREW });
  const plv = await pl.page.evaluate(pid => ({ you: document.querySelector('.pl-you .pl-you-n').textContent, want: Scoring.matchPoints(Store.activeSession(), pid).total,
    near: document.querySelectorAll('.pl-near .r').length, hero: document.querySelector('.pl-scard').classList.contains('hero'), tint: document.querySelector('.pl-you').classList.contains('pl-tint') }), ANDREW);
  check(`player home live: score card is the hero, "You tonight ${plv.want} pts live" tinted, 3 rows near you`, plv.you === String(plv.want) && plv.hero && plv.tint && plv.near === 3, JSON.stringify(plv));
  // the minute ticks without a re-render
  const t0 = await pl.page.evaluate(() => document.querySelector('.pl-scard .sb-mid b').textContent);
  await pl.page.evaluate(() => { const s = Store.activeSession(); s.timer.startedAt -= 60000; });
  await sleep(1200);
  const t1 = await pl.page.evaluate(() => document.querySelector('.pl-scard .sb-mid b').textContent);
  check(`player home live: the minute ticks on its own (${t0} → ${t1})`, t0 === "72'" && t1 === "73'");
  await pl.close();
  // referee's phone: never
  const r = await H.open({ width: 390, theme: 'dark', data: liveData(), route: '#/player.live', referee: true });
  await r.page.evaluate(() => { const sid = Store.activeSessionId(); const sess = Store.activeSession();
    Store.set(`sessions/${sid}/events/${Store.newKey()}`, Clock.stamp({ type: 'goal', team: 'green', scorerId: Object.keys(sess.teams.green.players)[0], timestamp: Store.now() }, sess, Store.now())); });
  await sleep(150);
  check('[goal] never on the referee\'s phone', !(await r.page.$('.pl-gm')));
  await r.close();
  const o = await H.open({ width: 390, theme: 'dark', data: liveData(), route: '#/player.live' });
  await sleep(300);
  check('[goal] no takeover on first load', !(await o.page.$('.pl-gm')));
  await o.close();
}

// ------------------------------------------------------------------ 5. laptop: two columns, score block ≤ 560 px
async function laptop() {
  for (const [route, o] of [['#/guest.home', { viewer: 'guest', now: TUE }], ['#/player.home', { viewer: ANDREW, now: TUE }], ['#/player.me', { viewer: ANDREW }]]) {
    const s = await H.open(Object.assign({ width: 1280, theme: 'dark', route }, o));
    const L = await s.page.evaluate(() => {
      const cols = [...document.querySelectorAll('.pl-2col > div, .pl-prof > div')].map(d => d.getBoundingClientRect());
      const sb = document.querySelector('.sb'); return { cols: cols.map(c => [Math.round(c.left), Math.round(c.top), Math.round(c.width)]), sbw: sb ? sb.getBoundingClientRect().width : 0 };
    });
    check(`laptop ${route}: two columns side by side, score block ≤ 560 px`, L.cols.length === 2 && L.cols[1][0] > L.cols[0][0] + 200 && Math.abs(L.cols[1][1] - L.cols[0][1]) < 4 && L.sbw <= 560, JSON.stringify(L));
    check(`laptop ${route}: no console errors`, !s.errors.length, s.errors.join(' | '));
    await s.close();
  }
}

(async () => {
  const t0 = Date.now();
  const ALL = [['matrix', matrix], ['numbers', numbers], ['bigPoles', bigPoles], ['live', liveAndGoal], ['laptop', laptop]];
  for (const [name, fn] of ALL.filter(([n]) => !process.env.ONLY || process.env.ONLY.split(',').includes(n))) {
    try { await fn(); } catch (e) { check(`${name} ran`, false, e.message.split('\n')[0]); }
  }
  const sum = `\n${pass} passed · ${fail} failed · ${Math.round((Date.now() - t0) / 1000)} s`;
  console.log(sum);
  fs.writeFileSync(path.join(H.out(__dirname), 'test-result.txt'), results.join('\n') + sum + '\n');
  process.exitCode = fail ? 1 : 0;
})();
