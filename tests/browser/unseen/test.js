// UNSEEN HEROES (full-time card page 2) tests. TEST MODE ONLY via the harness; never the real database.
// node test.js [section]   sections: real bigpoles fallback blue longest sheet entry shots
const path = require('path'), fs = require('fs');
const H = require('../harness.js');
const TDATA = require('../r5-tables/data.js');
const OUT = H.out(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, info) => { if (ok) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (info !== undefined ? '  → ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); } };
const L19 = '-P4KcMogcPM8_RRG9wAQ', TOBY = 'seed_p039', MIKE = 'seed_p047', DANNY = '-Oy0N--T6eH5HHWJei3j', JASON = '-Ou48vI1AasjuLzZFYwF', ANDREW = 'seed_p011';
async function done(s, tag) { check(`[${tag}] no console errors`, !s.errors.length, s.errors.slice(0, 3).join(' | ')); await s.close(); }

// Draw a page into a test canvas and read back every string drawn, plus the widest right / left edges (overflow check)
const READ = async (p, sid, page, theme) => p.evaluate(({ sid, page, theme }) => {
  const rec = [];
  const f = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...a) {
    const w = this.measureText(String(t)).width - (parseFloat(this.letterSpacing) || 0), al = this.textAlign;
    const l = al === 'right' || al === 'end' ? x - w : al === 'center' ? x - w / 2 : x;
    rec.push({ t: String(t), l, r: l + w, y });
    return f.call(this, t, x, y, ...a);
  };
  const c = document.createElement('canvas'); document.body.appendChild(c);
  App.action('share.fullTime', { sid, canvas: c, theme, page });
  CanvasRenderingContext2D.prototype.fillText = f;
  const px = (x, y) => Array.from(c.getContext('2d').getImageData(Math.round(x * 3.6), Math.round(y * 3.6), 1, 1).data).slice(0, 3);
  const out = { texts: rec.map(r => r.t), maxR: Math.max(...rec.map(r => r.r)), minL: Math.min(...rec.map(r => r.l)), w: c.width, h: c.height, heroEdge: px(150, 74.8), heroFill: px(250, 120) };
  c.remove(); return out;
}, { sid, page, theme: theme || 'dark' });
// Drawing order on page 2: header, title, hero, the team strip (BLOCKS CLEARANCES SAVES, then TEAM n n n), the category rows.
function parse(texts) {
  let i = texts.findIndex((t, k) => t === 'BLOCKS' && texts[k + 1] === 'CLEARANCES' && texts[k + 2] === 'SAVES');
  const S = {}; let k = i + 3;
  while (k + 3 < texts.length + 1 && /^[A-Z ]+$/.test(texts[k] || '') && /^\d+$/.test(texts[k + 1] || '')) { S[texts[k]] = texts.slice(k + 1, k + 4).join(' · '); k += 4; }
  const R = {}; let cur = null;
  texts.slice(k).forEach(t => { if (['SAVES', 'BLOCKS', 'CLEARANCES', 'ASSISTS'].includes(t)) { cur = t; R[t] = ''; } else if (cur) R[cur] += t; });
  Object.keys(R).forEach(x => { R[x] = R[x].trim(); });
  return { S, R };
}
const rows = texts => parse(texts).R;
const strip = texts => parse(texts).S;
const inBounds = r => r.maxR <= 280.5 && r.minL >= 19.5;

// ------------------------------------------------------------------ 1. 19 Oct real values
async function real() {
  console.log('\n# 19 Oct (real data): page 2 = Scoring tallies');
  const s = await H.open({ width: 390, theme: 'dark', route: '#/tables.teams', viewer: 'guest' });
  const r = await READ(s.page, L19, 2);
  const R = rows(r.texts), S = strip(r.texts), T = r.texts.join('|');
  check('header: BE FIT CLUB · MON 19 OCT · UNSEEN HEROES', T.startsWith('BE FIT CLUB|MON 19 OCT|UNSEEN HEROES'), r.texts.slice(0, 3));
  check('hero: Doku, 4 blocks · 1 clearance (9 credits; ties with Joshua 3 + 3 = 9, wins on blocks), Green chip; no "Hero of the night" label (UNSEEN HEROES is the only title)', T.includes('UNSEEN HEROES|Doku|GREEN|4 blocks · 1 clearance') && !/HERO OF THE NIGHT/i.test(T), r.texts.slice(3, 8));
  check('hero lit in Green (top edge + panel tint are green)', r.heroEdge[1] > r.heroEdge[0] + 60 && r.heroFill[1] > r.heroFill[0], [r.heroEdge, r.heroFill]);
  check('Saves: Mike 9 · Toby 9', R.SAVES === 'Mike 9 · Toby 9', R);
  check('Blocks: Doku 4 · Joshua 3', R.BLOCKS === 'Doku 4 · Joshua 3', R);
  check('Clearances: Joshua 3 · Andrew 3 (tie, both shown; by name)', R.CLEARANCES === 'Andrew 3 · Joshua 3', R);
  const A = R.ASSISTS || '';
  check('Assists: Mike, Emmanuel, Danny red dark short, Theophilus (all 4 shown, no "+ more")', ['Mike', 'Emmanuel', 'Danny red dark short', 'Theophilus'].every(n => A.includes(n)) && !A.includes('more') && A.replace(/Danny red dark short|Emmanuel|Mike|Theophilus| · /g, '') === '', A);
  check('Team strip: Green 10 blocks · 6 clearances · 9 saves; Red 3 · 5 · 9', S.GREEN === '10 · 6 · 9' && S.RED === '3 · 5 · 9', S);
  const eng = await s.page.evaluate(sid => { const x = Store.session(sid); const t = { green: [0, 0, 0], red: [0, 0, 0] };
    Scoring.sessPlayers(x).forEach(p => { const m = Scoring.matchPoints(x, p.pid); t[m.team][0] += m.tally.blocks; t[m.team][1] += m.tally.clearances; if (m.pos === 'GK') t[m.team][2] += m.tally.saves + m.tally.penSaves; }); return t; }, L19);
  check('…= Scoring.matchPoints tallies (10+6+9, 3+5+9)', eng.green.join() === '10,6,9' && eng.red.join() === '3,5,9', eng);
  check('1080 × 1350, every word inside the 20 px margins', r.w === 1080 && r.h === 1350 && inBounds(r), [r.minL, r.maxR]);
  const p1 = await READ(s.page, L19, undefined);
  check('page 1 unchanged: FULL TIME, 6 – 4, Harry · 14 pts', p1.texts.includes('FULL TIME') && p1.texts.includes('Harry · 14 pts') && !p1.texts.includes('UNSEEN HEROES'));
  await done(s, 'real');
}

// ------------------------------------------------------------------ 2. big poles from 46': saves before the switch don't count
async function bigpoles() {
  console.log('\n# Big poles from 46\': saves before the switch are not counted; penalty saves included and noted');
  const d = H.snapshot(); const x = d.sessions[L19];
  x.format = { start: 'small', switchedAt: 46, keepers: { green: TOBY, red: MIKE } };
  x.events.zz_pen = { type: 'penaltySave', playerId: MIKE, min: 70, timestamp: Object.values(x.events)[0].timestamp + 70 * 60000 };
  const s = await H.open({ width: 390, theme: 'dark', route: '#/tables.teams', viewer: 'guest', data: d });
  const e = await s.page.evaluate(sid => { const x = Store.session(sid); const raw = { seed_p047: 0, seed_p039: 0 };
    Object.values(x.events).forEach(ev => { if (ev.type === 'save' && raw[ev.playerId] != null) raw[ev.playerId]++; });
    const m = Scoring.matchPoints(x, 'seed_p047'), t = Scoring.matchPoints(x, 'seed_p039');
    return { raw, mike: m.tally.saves + m.tally.penSaves, pens: m.tally.penSaves, toby: t.tally.saves }; }, L19);
  const r = await READ(s.page, L19, 2);
  const R = rows(r.texts), S = strip(r.texts);
  check(`Scoring counts saves from 46' only (Mike ${e.mike} incl. ${e.pens} pen, Toby ${e.toby}) vs ${e.raw.seed_p047} + ${e.raw.seed_p039} logged all night`, e.mike < e.raw.seed_p047 + 1 && e.toby < e.raw.seed_p039 && e.pens === 1, e);
  const want = [e.mike >= e.toby ? `Mike ${e.mike} incl. 1 pen` : null, `Toby ${e.toby}`];
  check(`Saves row = Scoring: "${R.SAVES}"`, R.SAVES && R.SAVES.includes(`Mike ${e.mike}`) && R.SAVES.includes('incl. 1 pen') && R.SAVES.includes(`Toby ${e.toby}`), [R.SAVES, want]);
  const tSaves = await s.page.evaluate(sid => { const x = Store.session(sid); const o = {}; Scoring.sessPlayers(x).forEach(p => { const m = Scoring.matchPoints(x, p.pid); if (m.pos === 'GK') o[m.team] = (o[m.team] || 0) + m.tally.saves + m.tally.penSaves; }); return o; }, L19);
  check(`team strip saves follow the same rule (Green ${tSaves.green}, Red ${tSaves.red})`, S.GREEN.endsWith('· ' + tSaves.green) && S.RED.endsWith('· ' + tSaves.red), S);
  check('everything fits', inBounds(r), [r.minL, r.maxR]);
  await s.page.evaluate(sid => App.action('share.fullTime', { sid, page: 2 }), L19); await sleep(800);
  await (await s.page.$('.sh-tables-share .tb-cardwrap')).screenshot({ path: path.join(OUT, 'page2-bigpoles-dark.png') });
  await done(s, 'bigpoles');
}

// ------------------------------------------------------------------ 3. no defensive actions: fallback
async function fallback() {
  console.log('\n# No blocks or clearances: hero falls back to the top assister, then the keeper with most saves');
  const mk = strip => { const d = H.snapshot(); const x = d.sessions[L19];
    Object.keys(x.events).forEach(k => { const e = x.events[k]; if (strip.includes(e.type)) delete x.events[k]; if (strip.includes('assist') && e.assistId) delete e.assistId; }); return d; };
  let s = await H.open({ width: 390, theme: 'dark', route: '#/tables.teams', viewer: 'guest', data: mk(['block', 'clearance']) });
  let r = await READ(s.page, L19, 2), T = r.texts.join('|'), R = rows(r.texts);
  check('no blocks/clearances → hero = top assister (4 tied on 1: first by name, Danny red dark short · 1 assist)', T.includes('UNSEEN HEROES|Danny red dark short|GREEN|1 assist'), r.texts.slice(3, 8));
  check('Blocks and Clearances rows hidden; Saves and Assists kept', !R.BLOCKS && !R.CLEARANCES && R.SAVES === 'Mike 9 · Toby 9' && !!R.ASSISTS, R);
  check('strip shows zeros, fits', strip(r.texts).GREEN === '0 · 0 · 9' && inBounds(r), strip(r.texts));
  await s.page.evaluate(sid => App.action('share.fullTime', { sid, page: 2 }), L19); await sleep(800);
  await (await s.page.$('.sh-tables-share .tb-cardwrap')).screenshot({ path: path.join(OUT, 'page2-fallback-assists-dark.png') });
  await done(s, 'fallback assists');
  s = await H.open({ width: 390, theme: 'light', route: '#/tables.teams', viewer: 'guest', data: mk(['block', 'clearance', 'assist']) });
  r = await READ(s.page, L19, 2, 'light'); T = r.texts.join('|');
  check('no assists either → keeper with most saves (Mike 9 = Toby 9: Mike by name) · 9 saves', T.includes('UNSEEN HEROES|Mike|RED|9 saves'), r.texts.slice(3, 8));
  await s.page.evaluate(sid => App.action('share.fullTime', { sid, page: 2 }), L19); await sleep(800);
  await (await s.page.$('.sh-tables-share .tb-cardwrap')).screenshot({ path: path.join(OUT, 'page2-fallback-saves-light.png') });
  await done(s, 'fallback saves');
  s = await H.open({ width: 390, theme: 'dark', route: '#/tables.teams', viewer: 'guest', data: mk(['block', 'clearance', 'assist', 'save']) });
  r = await READ(s.page, L19, 2); T = r.texts.join('|');
  check('nothing at all → no hero, "Nothing logged beyond the goals", no error', T.includes('UNSEEN HEROES|BLOCKS|CLEARANCES|SAVES') && T.includes('Nothing logged beyond the goals'), r.texts);
  await done(s, 'fallback empty');
}

// ------------------------------------------------------------------ 4. Blue v Green
function blueData() {
  const d = TDATA.blue(); const x = d.sessions.test_blue_2nov; const t0 = x.timer.startedAt;
  [['block', 'seed_p010', 22], ['block', 'seed_p010', 35], ['block', 'seed_p010', 61], ['clearance', 'seed_p002', 44], ['clearance', 'seed_p016', 30], ['save', 'seed_p047', 50], ['save', 'seed_p039', 52]]
    .forEach(([type, pid, min], i) => { x.events['zb' + i] = { type, playerId: pid, min, timestamp: t0 + min * 60000 }; });
  return d;
}
async function blue() {
  console.log('\n# Blue v Green (Teams API): hero lit in blue, strip per team');
  const s = await H.open({ width: 390, theme: 'dark', route: '#/tables.teams', viewer: 'guest', data: blueData(), now: TDATA.NOW_BLUE });
  const r = await READ(s.page, 'test_blue_2nov', 2), T = r.texts.join('|'), S = strip(r.texts);
  check('hero Keith (Blue), 3 blocks, Blue chip', T.includes('UNSEEN HEROES|Keith|BLUE|3 blocks') && !/HERO OF THE NIGHT/i.test(T), r.texts.slice(3, 8));
  check('hero lit in blue (#5B8DEF edge)', r.heroEdge[2] > r.heroEdge[0] + 60 && r.heroEdge[2] > r.heroEdge[1], r.heroEdge);
  check('strip: Green 0 · 1 · 1, Blue 3 · 1 · 1 (Settings order: Green left)', S.GREEN === '0 · 1 · 1' && S.BLUE === '3 · 1 · 1', S);
  for (const theme of ['dark', 'light']) {
    await s.page.evaluate(() => UI.sheet.closeAll());
    await s.page.evaluate(t => App.theme.set(t), theme); await sleep(300);
    for (const page of [1, 2]) {
      await s.page.evaluate(({ page }) => { UI.sheet.closeAll(); App.action('share.fullTime', { sid: 'test_blue_2nov', page }); }, { page }); await sleep(800);
      await (await s.page.$('.sh-tables-share .tb-cardwrap')).screenshot({ path: path.join(OUT, `blue-2nov-page${page}-${theme}.png`) });
    }
  }
  await done(s, 'blue');
}

// ------------------------------------------------------------------ 5. longest names
async function longest() {
  console.log('\n# Longest names everywhere on page 2');
  const d = H.snapshot(); const x = d.sessions[L19]; const t0 = Object.values(x.events)[0].timestamp;
  for (let i = 0; i < 6; i++) x.events['zl' + i] = { type: 'block', playerId: DANNY, min: 50 + i, timestamp: t0 + (50 + i) * 60000 };
  for (let i = 0; i < 4; i++) x.events['zc' + i] = { type: 'clearance', playerId: JASON, min: 60 + i, timestamp: t0 + (60 + i) * 60000 };
  x.events.zpen = { type: 'penaltySave', playerId: TOBY, min: 80, timestamp: t0 + 80 * 60000 };
  const s = await H.open({ width: 390, theme: 'dark', route: '#/tables.teams', viewer: 'guest', data: d });
  for (const theme of ['dark', 'light']) {
    const r = await READ(s.page, L19, 2, theme), T = r.texts.join('|'), R = rows(r.texts);
    check(`[${theme}] hero "Danny red dark short", 6 blocks; Clearances led by "Jason tall fair guy"; Toby's pen noted`, T.includes('Danny red dark short|GREEN|6 blocks') && R.CLEARANCES.startsWith('Jason tall fair guy 6') && /Toby 10 incl\. 1 pen/.test(R.SAVES), [r.texts.slice(5, 7), R]);
    check(`[${theme}] every word inside the margins (left ${r.minL.toFixed(1)}, right ${r.maxR.toFixed(1)})`, inBounds(r));
    await s.page.evaluate(t => { UI.sheet.closeAll(); App.theme.set(t); }, theme); await sleep(250);
    await s.page.evaluate(sid => App.action('share.fullTime', { sid, page: 2 }), L19); await sleep(800);
    await (await s.page.$('.sh-tables-share .tb-cardwrap')).screenshot({ path: path.join(OUT, `page2-longest-names-${theme}.png`) });
  }
  await done(s, 'longest');
}

// ------------------------------------------------------------------ 6. the sheet: switch, Share both, Save both
async function sheet() {
  console.log('\n# The sheet: Page 1 | Page 2 switch, Share posts both, Save downloads both');
  const s = await H.open({ width: 390, theme: 'dark', route: '#/tables.teams', viewer: ANDREW });
  const p = s.page;
  await p.evaluate(() => { window.__dl = []; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push(this.download); return; } return o.call(this); }; });
  await p.evaluate(sid => App.action('share.fullTime', { sid }), L19); await sleep(900);
  const sw = await p.evaluate(() => [...document.querySelectorAll('.sh-tables-share [data-seg="cpage"] button')].map(b => [b.textContent.trim(), Math.round(b.getBoundingClientRect().height), b.classList.contains('on')]));
  check('switch "Page 1 · Full time | Page 2 · Unseen heroes", 48 px, page 1 on', JSON.stringify(sw) === JSON.stringify([['Page 1 · Full time', 48, true], ['Page 2 · Unseen heroes', 48, false]]), sw);
  const lab1 = await p.$eval('.sh-tables-share canvas', c => c.getAttribute('aria-label'));
  await s.shot(path.join(OUT, 'sheet-page1-390-dark.png'));
  await p.click('[data-seg="cpage"] [data-value="2"]'); await sleep(400);
  const lab2 = await p.$eval('.sh-tables-share canvas', c => c.getAttribute('aria-label'));
  check('switch previews page 2 (Doku, 4 blocks · 1 clearance)', /^Full-time card, page 1/.test(lab1) && lab2 === 'Full-time card, page 2, unseen heroes: Doku, 4 blocks · 1 clearance', [lab1, lab2]);
  await s.shot(path.join(OUT, 'sheet-page2-390-dark.png'));
  const tg = await p.evaluate(() => [...document.querySelectorAll('.sh-tables-share button')].filter(b => b.getBoundingClientRect().width).map(b => Math.round(b.getBoundingClientRect().height)));
  check('every sheet control ≥ 48 px', tg.every(h => h >= 48), tg);
  // Save image: both files
  await p.click('.sh-tables-share [data-tap="save-img"]'); await sleep(600);
  let dl = await p.evaluate(() => window.__dl.splice(0));
  check('Save image downloads both: befit-full-time-2026-10-19.png + befit-unseen-heroes-2026-10-19.png', dl.join() === 'befit-full-time-2026-10-19.png,befit-unseen-heroes-2026-10-19.png', dl);
  // Share, multi-file Web Share
  await p.evaluate(() => { window.__shared = null; navigator.canShare = o => !!(o && o.files); navigator.share = o => { window.__shared = o.files.map(f => f.name + ':' + f.type + ':' + f.size); return Promise.resolve(); }; });
  await p.click('.sh-tables-share [data-tap="share-img"]'); await sleep(600);
  let sh = await p.evaluate(() => window.__shared);
  check('Share posts BOTH PNGs together through navigator.share', sh && sh.length === 2 && /^befit-full-time-2026-10-19\.png:image\/png:\d{5,}$/.test(sh[0]) && /^befit-unseen-heroes-2026-10-19\.png:image\/png:\d{5,}$/.test(sh[1]), sh);
  dl = await p.evaluate(() => window.__dl.splice(0));
  check('…and downloads nothing', dl.length === 0, dl);
  // one file at a time only
  await p.evaluate(() => { window.__shared = null; navigator.canShare = o => !!(o && o.files && o.files.length === 1); });
  await p.click('.sh-tables-share [data-tap="share-img"]'); await sleep(600);
  sh = await p.evaluate(() => window.__shared); dl = await p.evaluate(() => window.__dl.splice(0));
  check('single-file share only: shares page 1, downloads page 2', sh && sh.length === 1 && /^befit-full-time/.test(sh[0]) && dl.join() === 'befit-unseen-heroes-2026-10-19.png', [sh, dl]);
  // no Web Share
  await p.evaluate(() => { navigator.share = undefined; navigator.canShare = undefined; });
  await p.click('.sh-tables-share [data-tap="share-img"]'); await sleep(600);
  dl = await p.evaluate(() => window.__dl.splice(0));
  check('no Web Share: downloads both', dl.length === 2, dl);
  // a share that fails (not a cancel) falls back to saving both
  await p.evaluate(() => { navigator.canShare = () => true; navigator.share = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); });
  await p.click('.sh-tables-share [data-tap="share-img"]'); await sleep(600);
  dl = await p.evaluate(() => window.__dl.splice(0));
  check('a failed share saves both instead', dl.length === 2, dl);
  await p.evaluate(() => { navigator.share = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })); });
  await p.click('.sh-tables-share [data-tap="share-img"]'); await sleep(600);
  dl = await p.evaluate(() => window.__dl.splice(0));
  check('a cancelled share saves nothing', dl.length === 0, dl);
  // { sid, save: true }
  await p.evaluate(() => UI.sheet.closeAll());
  const sv = await p.evaluate(sid => App.action('share.fullTime', { sid, save: true }).then(ok => ({ ok, dl: window.__dl.splice(0), sheet: !!document.querySelector('.sh-tables-share') })), L19);
  check('{ sid, save: true } downloads both, no sheet', sv.ok && sv.dl.length === 2 && /unseen-heroes/.test(sv.dl[1]) && !sv.sheet, sv);
  // preview canvas: page 1 by default, page: 2 on request
  const pv = await p.evaluate(sid => { const c = document.createElement('canvas'); document.body.appendChild(c); const a = App.action('share.fullTime', { sid, canvas: c }) === c; const b = App.action('share.fullTime', { sid, canvas: c, page: 2 }) === c; c.remove(); return a && b; }, L19);
  check('{ sid, canvas } still draws page 1; { page: 2 } draws page 2', pv);
  // Season / Last game stay single-page
  await p.evaluate(() => App.action('player.shareCard', { pid: 'seed_p011', kind: 'season' })); await sleep(800);
  const single = await p.evaluate(() => ({ hidden: document.querySelector('.sh-tables-share .tb-pages').hidden }));
  await p.click('.sh-tables-share [data-tap="save-img"]'); await sleep(500);
  dl = await p.evaluate(() => window.__dl.splice(0));
  check('Season card: no page switch, Save downloads 1 file', single.hidden && dl.join() === 'befit-andrew-season.png', [single, dl]);
  await p.click('[data-seg="cview"] [data-value="last"]'); await sleep(400);
  check('Last game: no page switch', await p.$eval('.sh-tables-share .tb-pages', e => e.hidden));
  await p.click('[data-seg="cview"] [data-value="ft"]'); await sleep(500);
  const ftOn = await p.evaluate(() => ({ hidden: document.querySelector('.sh-tables-share .tb-pages').hidden }));
  await p.click('[data-seg="cpage"] [data-value="2"]'); await sleep(400);
  const lab = await p.$eval('.sh-tables-share canvas', c => c.getAttribute('aria-label'));
  check('player.shareCard › Full time: the switch appears and page 2 previews', !ftOn.hidden && /unseen heroes: Andrew|unseen heroes: Doku/.test(lab), [ftOn, lab]);
  await done(s, 'sheet');
}

// ------------------------------------------------------------------ 7. every entry point
async function entry() {
  console.log('\n# Entry points: match summary (guest), Published page (referee), Me (player)');
  let s = await H.open({ width: 390, theme: 'dark', route: '#/player.match?sid=' + L19, viewer: 'guest' });
  await sleep(600);
  const b = await s.page.$('[data-tap="mshare"]');
  check('guest match summary has "Share full-time card"', !!b);
  if (b) { await s.page.evaluate(() => document.querySelector('[data-tap="mshare"]').scrollIntoView({ block: 'center' })); await s.page.click('[data-tap="mshare"]'); await sleep(900); }
  check('…it opens the 2-page sheet', await s.page.evaluate(() => !!document.querySelector('.sh-tables-share [data-seg="cpage"]') && !document.querySelector('.sh-tables-share .tb-pages').hidden));
  await s.shot(path.join(OUT, 'entry-guest-match-summary.png'));
  await done(s, 'entry guest');
  s = await H.open({ width: 390, theme: 'dark', route: '#/player.me', viewer: ANDREW });
  await sleep(500);
  const meBtn = await s.page.$('.pl-share[data-tap="share"]');
  check('Me has Share', !!meBtn);
  if (meBtn) { await meBtn.click(); await sleep(900); }
  check('…Me › Share opens the share card; Full time shows the page switch', await s.page.evaluate(async () => { const sh = document.querySelector('.sh-tables-share'); if (!sh) return false;
    sh.querySelector('[data-seg="cview"] [data-value="ft"]').click(); await new Promise(r => setTimeout(r, 400)); return !sh.querySelector('.tb-pages').hidden; }));
  await s.shot(path.join(OUT, 'entry-player-me.png'));
  await done(s, 'entry me');
  // Published page (referee): the fulltime screen's Share and Save image after Publish (a copy of 19 Oct, ended, not yet published)
  const d = H.snapshot(); const x = d.sessions[L19];
  x.status = 'active'; x.timer = Object.assign({}, x.timer, { status: 'ended' }); x.ftCheck = { status: 'checking' };
  s = await H.open({ width: 390, theme: 'dark', route: '#/ref.ftcheck?sid=' + L19, referee: 'referee', viewer: 'guest', data: d, now: '2026-10-19T21:30' });
  await sleep(800);
  await s.page.evaluate(() => { window.__dl = []; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push(this.download); return; } return o.call(this); }; });
  const pub = await s.page.$('[data-tap="publish"]');
  check('referee full-time check has Publish', !!pub);
  if (pub) { await pub.click(); await sleep(2500); await s.page.evaluate(() => UI.undoBar.hide()); }
  const hasBtns = await s.page.evaluate(() => !!document.querySelector('[data-tap="share"]') && !!document.querySelector('[data-tap="saveimg"]'));
  check('Published page shows Share and Save image', hasBtns);
  if (hasBtns) {
    await s.page.evaluate(() => document.querySelector('[data-tap="saveimg"]').click()); await sleep(1200);
    const dl = await s.page.evaluate(() => window.__dl.splice(0));
    check('Published › Save image downloads both pages', dl.length === 2 && /full-time/.test(dl[0]) && /unseen-heroes/.test(dl[1]), dl);
    await s.page.evaluate(() => document.querySelector('[data-tap="share"]').click()); await sleep(900);
    const sw = await s.page.evaluate(() => [...document.querySelectorAll('.sh-tables-share [data-seg="cpage"] button')].map(b => Math.round(b.getBoundingClientRect().height)));
    check('Published › Share opens the 2-page sheet, switch 48 px', sw.length === 2 && sw.every(h => h >= 48), sw);
    await s.shot(path.join(OUT, 'entry-referee-published.png'));
  }
  await done(s, 'entry referee');
}

// ------------------------------------------------------------------ 8. shots: 19 Oct both pages, dark and light
async function shots() {
  console.log('\n# Shots: 19 Oct, both pages, dark and light');
  for (const theme of ['dark', 'light']) {
    const s = await H.open({ width: 390, theme, route: '#/tables.teams', viewer: 'guest' });
    for (const page of [1, 2]) {
      await s.page.evaluate(({ page, sid }) => { UI.sheet.closeAll(); App.action('share.fullTime', { sid, page }); }, { page, sid: L19 }); await sleep(900);
      await (await s.page.$('.sh-tables-share .tb-cardwrap')).screenshot({ path: path.join(OUT, `19oct-page${page}-${theme}.png`) });
    }
    await s.shot(path.join(OUT, `19oct-sheet-page2-390-${theme}.png`));
    await done(s, 'shots ' + theme);
  }
  const w = await H.open({ width: 1280, theme: 'light', route: '#/tables.teams', viewer: 'guest' });
  await w.page.evaluate(sid => App.action('share.fullTime', { sid, page: 2 }), L19); await sleep(900);
  await w.shot(path.join(OUT, '19oct-sheet-page2-1280-light.png'));
  await done(w, 'shots 1280');
}

(async () => {
  const want = process.argv[2];
  const ALL = { real, bigpoles, fallback, blue, longest, sheet, entry, shots };
  for (const [k, fn] of Object.entries(ALL)) { if (want && want !== k) continue; try { await fn(); } catch (e) { fail++; console.log('  FAIL ' + k + ' threw: ' + e.message.split('\n')[0]); } }
  console.log(`\n${pass} ok, ${fail} FAIL`);
  process.exitCode = fail ? 1 : 0;
})();
