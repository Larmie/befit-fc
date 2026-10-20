// Round 5 · fulltime area test (TEST MODE ONLY, via the harness: no Firebase, writes stay in memory).
//   A  long stoppage (19 Oct re-created on a copy, round 5 timer): heads-up flag text, OK hides it (ftCheck/keep),
//      no event minute changes anywhere, Publish with the flag open writes ftCheck.flags.longStoppage
//   B  the same match as recorded (old timer, cumulative 46+7' … 46+18'): the flag quotes per-half minutes, OK
//   C  dry run on every real match: only 19 Oct is flagged
//   D  Publish with no signal: the label, waits in the outbox behind an earlier save, completes when back online
//   E  the full-time card: preview drawn by tables.js into our canvas, offered after Publish (Share / Save image)
//   F  screenshots at 390 and 1280, dark and light (light = Referee console "Same as the app"), layout checks
// Usage: node ft-test.js [A|B|C|D|E|F]
'use strict';
const path = require('path');
const fs = require('fs');
const H = require('../harness.js');
const D = require('./data.js');
const OUT = H.out(__dirname), SHOTS = H.out(__dirname, 'shots');
const NOW = '2026-10-19T21:30';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const log = [];
const check = (label, ok, extra) => { if (ok) passes++; else fails++; const line = (ok ? 'ok   ' : 'FAIL ') + label + (extra !== undefined ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''); console.log(line); log.push(line); };

const HELPERS = () => {
  window.__t = {
    totals(sid) { const s = Store.session(sid); const o = {}; Scoring.sessPlayers(s).forEach(p => { const m = Scoring.matchPoints(s, p.pid); o[p.pid] = m ? m.total : 0; }); return o; },
    minutes(sid) { const o = {}; Object.entries(Store.session(sid).events).forEach(([k, e]) => { o[k] = Scoring.minuteText(e); }); return o; },
    stamps(sid) { const o = {}; Object.entries(Store.session(sid).events).forEach(([k, e]) => { o[k] = e.timestamp; }); return o; },
    text(sel) { const e = document.querySelector(sel); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; },
    undoText() { const u = document.querySelector('#app-undo .undo'); return u ? u.innerText.replace(/\s+/g, ' ').trim() : ''; },
    canvasInk(sel) {   // is the canvas drawn? (any opaque pixel)
      const c = document.querySelector(sel); if (!c) return null;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n++;
      return n;
    },
    noOverflow() {
      const bad = [];
      if (document.documentElement.scrollWidth > window.innerWidth + 1) bad.push('page scrolls sideways ' + document.documentElement.scrollWidth);
      document.querySelectorAll('.nm, .fx-v, .fx-dn, .fx-dv, .fx-ft-s, .fx-ft-t, .tc, .fx-evm, .meta, .btn, .lbl, .hd-c, .fx-eff, .link, .sheet h4, .sr-l, .fx-rng').forEach(el => {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
        const r = el.getBoundingClientRect(); if (!r.width) return;
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto') bad.push('wide: ' + el.className + ' "' + el.textContent.trim().slice(0, 40) + '"');
        if (r.right > window.innerWidth + 1 && !el.closest('.chips')) bad.push('off-screen: ' + el.className + ' "' + el.textContent.trim().slice(0, 40) + '"');
      });
      const small = []; document.querySelectorAll('.sheet button, .screen button, #app-screen button').forEach(b => { const r = b.getBoundingClientRect(); if (r.height && r.height < 44 && !b.closest('.chips') && b.offsetParent) small.push(b.textContent.trim().slice(0, 20) + ':' + Math.round(r.height)); });
      // round 5 light rules on this screen: one hero; light only on .hero / .lit; no Geist Mono above 24 px
      const LIT = '.hero, .lit, .wash, .you-row';
      const heroes = [...document.querySelectorAll('#app-screen .hero')].filter(h => h.offsetParent && !h.parentElement.closest('.hero')).length;
      const unlit = []; const mono = [];
      document.querySelectorAll('#app-screen *, .sheet *').forEach(el => {
        if (!el.offsetParent) return;
        const cs = getComputedStyle(el);
        if (/gradient/.test(cs.backgroundImage) && !el.closest(LIT) && !/255, 255, 255/.test(cs.backgroundImage) && !/rgb\(255/.test(cs.backgroundImage)) unlit.push(el.className);
        const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (own && /Geist Mono/i.test(cs.fontFamily) && parseFloat(cs.fontSize) > 24.5) mono.push(el.className);
        if (own && parseFloat(cs.fontSize) < 12) bad.push('tiny ' + cs.fontSize + ' ' + el.className + ' "' + el.textContent.trim().slice(0, 20) + '"');
      });
      return { bad, small, heroes, unlit, mono };
    },
  };
};
async function openApp(o) {
  const s = await H.open(Object.assign({ referee: 'referee', width: 390, theme: 'dark', latency: 60, now: NOW }, o));
  await s.page.evaluate(HELPERS);
  await sleep(300);
  return s;
}
const T = (p, fn, ...a) => p.evaluate((fn, a) => window.__t[fn](...a), fn, a);
const click = async (p, sel, wait = 250) => {
  await p.waitForSelector(sel, { visible: true, timeout: 5000 });
  await p.$eval(sel, e => e.scrollIntoView({ block: 'center' }));
  await p.click(sel); await sleep(wait);
};
const waitSaved = async p => { await p.waitForFunction(() => { const u = document.querySelector('#app-undo .undo'); return u && !u.classList.contains('saving') && !u.classList.contains('err') && !document.querySelector('.is-saving'); }, { timeout: 6000 }); await sleep(150); };
async function layout(p, label, o) {
  const r = await T(p, 'noOverflow');
  check(`${label}: no sideways scroll, no clipped or tiny text`, !r.bad.length, r.bad.slice(0, 5).join(' | '));
  check(`${label}: tap targets ≥ 44 px`, !r.small.length, r.small.slice(0, 6).join(', '));
  check(`${label}: ${o && o.heroes != null ? o.heroes : 'at most one'} hero, light only on .hero/.lit, no Mono > 24 px`,
    (o && o.heroes != null ? r.heroes === o.heroes : r.heroes <= 1) && !r.unlit.length && !r.mono.length, { heroes: r.heroes, unlit: r.unlit.slice(0, 3), mono: r.mono.slice(0, 3) });
}
const C = D.COPY;
const sameExcept = (a, b, keys) => { const x = Object.assign({}, a), y = Object.assign({}, b); keys.forEach(k => { delete x[k]; delete y[k]; }); return JSON.stringify(x) === JSON.stringify(y); };

// =================================================================================================
// every event of every match: "no event minute changes anywhere"
const allEvents = p => p.evaluate(() => JSON.stringify(Object.entries(Store.sessions()).map(([sid, x]) => [sid, Object.entries((x && x.events) || {}).map(([k, e]) => [k, e.min, e.stoppageBaseMin, e.stoppageMin, e.timestamp])])));
async function A() {
  const s = await openApp({ data: D.copy19('r5'), route: '#/ref.ftcheck?sid=' + C });
  const p = s.page;
  const ev0 = await allEvents(p);
  const flag = await T(p, 'text', '[data-stoppage]');
  check("A flag: \"Stoppage ran about 13 min after half time · 6 events in stoppage (46+1' to 46+12') · OK\"",
    flag === "Stoppage ran about 13 min after half time 6 events in stoppage (46+1' to 46+12') OK", flag);
  check('A the flag has one action, OK (no Fix minutes, no preview sheet)', (await p.$$('[data-stoppage] button')).length === 1 && !(await p.$('[data-tap="stopfix"]')));
  check("A only one flag on the check (the 1st half's 4-5 min stoppage is normal)", (await p.$$('.fx-flag')).length === 1);
  check('A pinned button reads "Publish & share" (online, nothing waiting)', (await T(p, 'text', '[data-tap="publish"]')) === 'Publish & share');
  await s.shot(path.join(SHOTS, 'ftcheck-stoppage-390-dark.png'));
  await layout(p, 'A FT check with the flag', { heroes: 1 });
  const nw = await p.evaluate(() => Store.test.writes.length);
  await click(p, '[data-tap="stopkeep"]', 60); await waitSaved(p);
  check('A OK: no sheet, Undo bar "OK · long stoppage noted", flag hidden', !(await p.$('.sheet')) && /OK · long stoppage noted/.test(await T(p, 'undoText')) && !(await p.$('[data-stoppage]')), await T(p, 'undoText'));
  const writes = await p.evaluate(n => Store.test.writes.slice(n), nw);
  check('A OK writes only ftCheck/keep (stoppage_2_46 = true), one write', writes.length === 1 && JSON.stringify(Object.keys(writes[0].updates)) === JSON.stringify([`sessions/${C}/ftCheck/keep`]) && writes[0].updates[`sessions/${C}/ftCheck/keep`].stoppage_2_46 === true, writes.map(w => w.updates));
  fs.writeFileSync(path.join(OUT, 'write-ok.json'), JSON.stringify(writes[0], null, 1));
  check('A after OK: no event minute changed anywhere', (await allEvents(p)) === ev0);
  await sleep(5300);
  await s.shot(path.join(SHOTS, 'ftcheck-ok-390-dark.png'));
  await click(p, '[data-tap="publish"]', 60); await waitSaved(p); await sleep(300);
  const pub = await p.evaluate(sid => Store.session(sid), C);
  check('A Publish after OK: completed, goals {green 6, red 4}, published, no ftCheck.flags', pub.status === 'completed' && JSON.stringify(pub.goals) === '{"green":6,"red":4}' && pub.ftCheck.status === 'published' && !pub.ftCheck.flags, pub.ftCheck);
  check('A after Publish: no event minute changed anywhere', (await allEvents(p)) === ev0);
  const sc = await p.evaluate(sid => Object.values(Scoring.scorers(Store.session(sid))).flat().map(r => r.name + ' ' + r.mins.map(e => Scoring.minuteText(e)).join(' ')), C);
  check("A scorers keep the stoppage: Theophilus 46+12' 68', Reuel 83'", sc.includes("Theophilus 46+12' 68'") && sc.includes("Reuel 83'"), sc);
  check('A no console errors', !s.errors.length, s.errors.join(' | '));
  await s.close();
  // Publish with the flag still open: ftCheck.flags.longStoppage = 1 (the admin's Needs you)
  const s2 = await openApp({ data: D.copy19('r5'), route: '#/ref.ftcheck?sid=' + C });
  const ev2 = await allEvents(s2.page);
  await click(s2.page, '[data-tap="publish"]', 60); await waitSaved(s2.page); await sleep(300);
  const ft2 = await s2.page.evaluate(sid => Store.session(sid).ftCheck, C);
  check('A Publish with the flag open: ftCheck.flags = { longStoppage: 1 }', JSON.stringify(ft2.flags) === '{"longStoppage":1}' && ft2.status === 'published', ft2);
  check('A Publish with the flag open: no event minute changed anywhere', (await allEvents(s2.page)) === ev2);
  const pubW = await s2.page.evaluate(sid => Store.test.writes.filter(w => Object.keys(w.updates).includes(`sessions/${sid}/status`)), C);
  fs.writeFileSync(path.join(OUT, 'write-publish-flag-open.json'), JSON.stringify(pubW[0], null, 1));
  check('A no console errors (flag open)', !s2.errors.length, s2.errors.join(' | '));
  await s2.close();
}

// =================================================================================================
async function B() {
  const s = await openApp({ data: D.copy19('old'), route: '#/ref.ftcheck?sid=' + C });
  const p = s.page;
  const ev0 = await allEvents(p);
  const flag = await T(p, 'text', '[data-stoppage]');
  check("B as recorded (old timer, cumulative 46+7' … 46+18'): quoted per half \"about 14 min · 6 events in stoppage (46+3' to 46+14')\"",
    flag === "Stoppage ran about 14 min after half time 6 events in stoppage (46+3' to 46+14') OK", flag);
  await click(p, '[data-tap="stopkeep"]', 60); await waitSaved(p);
  const keep = await p.evaluate(sid => Store.session(sid).ftCheck.keep, C);
  check('B OK: ftCheck.keep.stoppage_2_46 = true, flag gone', keep && keep.stoppage_2_46 === true && !(await p.$('[data-stoppage]')), keep);
  check("B no event minute changed anywhere (stored 46+18' stays)", (await allEvents(p)) === ev0 && (await T(p, 'minutes', C))['-P4Ksa4ZzCgxA7ZHe4YN'] === "46+18'");
  check('B no console errors', !s.errors.length, s.errors.join(' | '));
  await s.close();
}

// =================================================================================================
async function Cpoles() {
  // dry run on every real match: only 19 Oct has logged stoppages; one is long (the 2nd half; the refreshed snapshot's labels 46+1' … 46+12' read 12 min)
  const s = await openApp({ referee: true, route: '#/ref.edit?sid=' + D.SID12 });
  const r = await s.page.evaluate(() => Object.values(Store.sessions()).map(x => ({ d: x.date, all: Fix.stoppages(x).length, long: Fix.longStoppages(x).map(g => g.key + ' ' + g.mins + ' min') })).filter(x => x.all));
  check('C real data: 1 match with logged stoppages (19 Oct), 1 long one: stoppage_2_46 12 min (refreshed labels)', r.length === 1 && r[0].d === '2026-10-19' && r[0].all === 2 && JSON.stringify(r[0].long) === '["stoppage_2_46 12 min"]', r);
  check('C no console errors', !s.errors.length, s.errors.join(' | '));
  await s.close();
}

// =================================================================================================
async function Dsignal() {
  const s = await openApp({ data: D.copy19('r5'), route: '#/ref.ftcheck?sid=' + C });
  const p = s.page;
  await p.evaluate(() => Store.test.setStatus('offline')); await sleep(400);
  check('D offline: the button reads "Publish · sends when signal returns"', (await T(p, 'text', '[data-tap="publish"]')) === 'Publish · sends when signal returns');
  // an earlier save waits on the phone first (Keep the stoppage minutes, offline)
  await click(p, '[data-tap="stopkeep"]', 60); await waitSaved(p);
  const st1 = await p.evaluate(() => Store.status());
  check('D offline Keep: saved on the phone, 1 waiting', st1.pending === 1, st1);
  await sleep(5300);
  await s.shot(path.join(SHOTS, 'publish-offline-390-dark.png'));
  await layout(p, 'D offline FT check');
  await click(p, '[data-tap="publish"]', 60); await waitSaved(p);
  const local = await p.evaluate(sid => Store.session(sid).status, C);
  const server = await p.evaluate(sid => (Store.test.server.sessions[sid] || {}).status, C);
  const st2 = await p.evaluate(() => Store.status());
  check('D Publish offline: completed on the phone, the "server" still has it active, 2 waiting', local === 'completed' && server === 'active' && st2.pending === 2, { local, server, pending: st2.pending });
  const head = await T(p, 'text', '.fx-pubhead');
  check('D page: "Waiting for signal · Publishes by itself · 2 waiting"', head === 'Waiting for signal Publishes by itself · 2 waiting', head);
  check('D Undo bar: "Published · Mon 19 Oct" + "Sends when signal returns"', /Published · Mon 19 Oct/.test(await T(p, 'undoText')) && /Sends when signal returns/.test(await T(p, 'undoText')), await T(p, 'undoText'));
  await sleep(5300);
  await s.shot(path.join(SHOTS, 'published-waiting-390-dark.png'));
  await layout(p, 'D waiting for signal', { heroes: 1 });
  // signal returns: the outbox drains in order, the page turns into Published by itself
  await p.evaluate(() => Store.test.setStatus('online'));
  await p.waitForFunction(() => Store.status().pending === 0, { timeout: 8000 });
  await sleep(500);
  const rec = await p.evaluate(sid => Store.test.received.map(w => Object.keys(w.updates || w).join(',')).filter(k => k.includes(sid)), C);
  const serverNow = await p.evaluate(sid => { const x = Store.test.server.sessions[sid]; return { status: x.status, ft: x.ftCheck && x.ftCheck.status, keep: x.ftCheck && x.ftCheck.keep, goals: x.goals, cleanSheets: x.cleanSheets, publishedBy: x.publishedBy }; }, C);
  check('D back online: Keep sent first, then Publish (outbox order)', rec.length === 2 && /ftCheck\/keep/.test(rec[0]) && /status/.test(rec[1]), rec);
  check('D server now: completed, ftCheck published, goals {green 6, red 4}, keep kept', serverNow.status === 'completed' && serverNow.ft === 'published' && JSON.stringify(serverNow.goals) === '{"green":6,"red":4}' && serverNow.keep && serverNow.keep.stoppage_2_46, serverNow);
  const head2 = await T(p, 'text', '.fx-pubhead');
  check('D page turned into "Published · Reuben has been told" by itself', head2 === '✓ Published Reuben has been told', head2);
  const pubW = await p.evaluate(sid => Store.test.writes.filter(w => Object.keys(w.updates).some(k => k === `sessions/${sid}/status`)), C);
  fs.writeFileSync(path.join(OUT, 'write-publish.json'), JSON.stringify(pubW[0], null, 1));
  check('D Publish write: status, ftCheck/{status,publishedAt,by,flags?}, publishedBy, goals, cleanSheets (one atomic write)', pubW.length === 1 &&
    ['status', 'ftCheck/status', 'ftCheck/publishedAt', 'ftCheck/by', 'publishedBy', 'goals', 'cleanSheets'].every(k => Object.prototype.hasOwnProperty.call(pubW[0].updates, `sessions/${C}/${k}`)), pubW[0] && Object.keys(pubW[0].updates));
  await s.shot(path.join(SHOTS, 'published-390-dark.png'));
  check('D no console errors', !s.errors.length, s.errors.join(' | '));
  await s.close();
}

// =================================================================================================
async function E() {
  const s = await openApp({ data: D.copy19('r5'), route: '#/ref.ftcheck?sid=' + C });
  const p = s.page;
  check('E preview: the card is drawn by tables.js share.fullTime into our canvas', (await p.evaluate(() => !!App.actions['share.fullTime'])) && (await T(p, 'canvasInk', '.scr-ref-ftcheck canvas[data-ftcanvas]')) > 50);
  const lab = await p.$eval('canvas[data-ftcanvas]', c => c.getAttribute('aria-label'));
  check('E preview label: "Full time, Mon 19 Oct: Green 6, Red 4. Top points …"', /^Full time, Mon 19 Oct: Green 6, Red 4\. Top points .+ pts$/.test(lab), lab);
  await click(p, '[data-tap="publish"]', 60); await waitSaved(p); await sleep(400);
  const head = await T(p, 'text', '.fx-pubhead');
  check('E after Publish: "Published · Reuben has been told"', head === '✓ Published Reuben has been told', head);
  check('E after Publish: the full-time card (the hero) with Share and Save image', !!(await p.$('.fx-ftcv.hero canvas')) && (await T(p, 'canvasInk', '.fx-ftcv.hero canvas')) > 50 &&
    (await T(p, 'text', '[data-tap="share"]')) === 'Share' && (await T(p, 'text', '[data-tap="saveimg"]')) === 'Save image');
  const sumT = await T(p, 'text', '.scr-ref-ftcheck .sum');
  const tp = await p.evaluate(sid => { const o = {}; Scoring.matchBreakdown(Store.session(sid)).columns.forEach(c => { o[c.team] = c.points; }); return o; }, C);
  check(`E Player points as a sum: Green ${tp.green} + Red ${tp.red} = ${tp.green + tp.red}`, sumT.includes(`Green 9 players ${tp.green}`) && sumT.includes(`Red 9 players ${tp.red}`) && sumT.toUpperCase().endsWith('PLAYER PTS ' + (tp.green + tp.red)), sumT);
  await sleep(5300);
  await s.shot(path.join(SHOTS, 'published-card-390-dark.png'));
  await s.shot(path.join(SHOTS, 'published-card-390-dark-full.png'), { fullPage: true });
  await layout(p, 'E Published', { heroes: 1 });
  await click(p, '[data-tap="share"]', 700);
  const sh = await T(p, 'text', '.sheet');
  check('E Share opens the tables full-time card sheet (Share / Save image)', !!sh && /Full-time card/.test(sh) && /Save image/.test(sh), sh && sh.slice(0, 80));
  await s.shot(path.join(SHOTS, 'share-sheet-390-dark.png'));
  check('E no console errors', !s.errors.length, s.errors.join(' | '));
  await s.close();
}

// =================================================================================================
async function F() {
  for (const theme of ['dark', 'light']) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${theme}`;
      const ct = theme === 'light' ? 'app' : null;
      let s = await openApp({ theme, width, consoleTheme: ct, data: D.copy19('r5'), route: '#/ref.ftcheck?sid=' + C });
      check(`[${tag}] FT check theme ${theme}`, (await s.page.evaluate(() => document.documentElement.dataset.theme)) === theme);
      await s.shot(path.join(SHOTS, `ftcheck-${tag}.png`));
      await layout(s.page, `[${tag}] FT check`, { heroes: 1 });
      // fits one phone screen: the card preview ends above the pinned Publish
      if (width === 390) {
        const fit = await s.page.evaluate(() => { const c = document.querySelector('[data-ftcard]').getBoundingClientRect(); const b = document.querySelector('.fx-pub .btn').getBoundingClientRect(); return { cardBottom: Math.round(c.bottom), pubTop: Math.round(b.top), vh: innerHeight }; });
        check(`[${tag}] score, flag, card preview and Publish fit one screen (no empty black)`, fit.cardBottom <= fit.pubTop, fit);
      }
      const ev0 = await allEvents(s.page);
      await s.page.click('[data-tap="stopkeep"]'); await waitSaved(s.page); await sleep(300);
      check(`[${tag}] OK hides the flag`, !(await s.page.$('[data-stoppage]')));
      await s.page.click('[data-tap="publish"]'); await waitSaved(s.page); await sleep(5400);
      await s.shot(path.join(SHOTS, `published-${tag}.png`));
      await layout(s.page, `[${tag}] Published`, { heroes: 1 });
      check(`[${tag}] OK + Publish: no event minute changed anywhere`, (await allEvents(s.page)) === ev0);
      check(`[${tag}] no console errors`, !s.errors.length, s.errors.join(' | '));
      await s.close();
      // Edit match (follows the app theme), with its sheets
      s = await openApp({ theme, width, referee: true, route: '#/ref.edit?sid=' + D.SID12 });
      await s.shot(path.join(SHOTS, `edit-${tag}.png`));
      await layout(s.page, `[${tag}] Edit match`, { heroes: 1 });
      const sb = await s.page.evaluate(() => { const b = document.querySelector('.scr-ref-edit .fx-hero .sb'); return b ? b.querySelector('.sb-mid').innerText.replace(/\s+/g, ' ') + ' | ' + [...b.querySelectorAll('.sb-half .hn')].map(x => x.textContent).join('-') : null; });
      check(`[${tag}] Edit: the joined score block "FT 12 OCT | 7-4"`, sb === 'FT 12 OCT | 7-4', sb);
      const red = await s.page.evaluate(() => Object.keys(Store.session('-P3lenQyxWIniPyrtFAn').teams.red.players).find(pid => Store.player(pid).name === 'Andrew'));
      await s.page.evaluate((pid) => App.action('fix.playerSheet', { sid: '-P3lenQyxWIniPyrtFAn', pid }), red); await sleep(500);
      await s.shot(path.join(SHOTS, `player-sheet-${tag}.png`));
      await layout(s.page, `[${tag}] player sheet`);
      await s.page.keyboard.press('Escape'); await sleep(300);
      const g = await s.page.evaluate(() => { const ev = Store.session('-P3lenQyxWIniPyrtFAn').events; return Object.keys(ev).find(k => ev[k].type === 'goal' && ev[k].min === 33); });
      await s.page.evaluate(g => App.action('fix.eventSheet', { sid: '-P3lenQyxWIniPyrtFAn', eid: g }), g); await sleep(400);
      await s.page.click('.sheet [data-tap="f-who"]'); await sleep(300);
      await s.page.evaluate(() => { const b = [...document.querySelectorAll('.sheet [data-tap="pk"]')].find(x => x.innerText.includes('Joshua')); b.click(); }); await sleep(400);
      await s.shot(path.join(SHOTS, `event-preview-${tag}.png`));
      await layout(s.page, `[${tag}] event sheet preview`);
      await s.page.keyboard.press('Escape'); await sleep(300);
      await s.page.evaluate(() => App.action('fix.addMissed', { sid: '-P3lenQyxWIniPyrtFAn' })); await sleep(400);
      await s.shot(path.join(SHOTS, `add-missed-${tag}.png`));
      await layout(s.page, `[${tag}] add missed`);
      check(`[${tag}] edit no console errors`, !s.errors.length, s.errors.join(' | '));
      await s.close();
    }
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const only = process.argv[2];
  if (!only || only === 'A') await A();
  if (!only || only === 'B') await B();
  if (!only || only === 'C') await Cpoles();
  if (!only || only === 'D') await Dsignal();
  if (!only || only === 'E') await E();
  if (!only || only === 'F') await F();
  const sum = `\n${passes} passed, ${fails} failed`;
  console.log(sum); log.push(sum);
  fs.writeFileSync(path.join(OUT, `ft-test-result${only ? '-' + only : ''}.txt`), log.join('\n') + '\n');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
