// Console builder · layout audit, TEST MODE ONLY: 390 dark, 390 light console ("Same as the app"), 1280 dark + light.
// Checks every visible target ≥ 48 px (Goal 92, actions 72), no truncated names, no sideways scroll, 12 px type floor,
// console stays phone-width on a laptop; screenshots each sheet.  Run: node audit.js
const fs = require('fs');
const path = require('path');
const H = require('../harness.js');
const { liveData, SRC } = require('./data.js');
const OUT = H.out(__dirname);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const lines = [];
const check = (label, ok, extra) => { if (!ok) fails++; const l = `${ok ? 'ok  ' : 'FAIL'} ${label}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`; console.log(l); lines.push(l); };

const NOW = new Date('2026-10-19T19:30:00').getTime();
// a big-poles match at 68', using 27 Jul's real events (first 15) so the feed and Recent row are real
function data() {
  const d = H.snapshot();
  const src = d.sessions[SRC];
  const evs = Object.entries(src.events).sort((a, b) => a[1].timestamp - b[1].timestamp).slice(0, 15);
  const shift = NOW - 2 * 60000 - evs[evs.length - 1][1].timestamp;
  const events = {}; evs.forEach(([k, v]) => { events[k] = Object.assign({}, v, { timestamp: v.timestamp + shift }); });
  return liveData({ format: { start: 'big' }, events, timer: { status: 'running', startedAt: NOW - 68 * 60000, pausedTotal: 0, htLogged: true } });
}

async function measure(p, scope) {
  return p.evaluate(sc => {
    const out = { small: [], trunc: [], tinyType: [], hscroll: document.documentElement.scrollWidth > window.innerWidth };
    const roots = Array.from(document.querySelectorAll(sc));
    const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    roots.forEach(root => {
      root.querySelectorAll('button, a, [data-tap], input').forEach(el => {
        if (!vis(el)) return;
        const r = el.getBoundingClientRect();
        const target = el.matches('input') ? el.closest('.inp').getBoundingClientRect() : r;
        if (target.height < 47.5 || (target.width < 47.5 && !el.matches('input'))) out.small.push(`${(el.textContent || el.getAttribute('aria-label') || el.className).trim().slice(0, 24)} ${Math.round(target.width)}x${Math.round(target.height)}`);
      });
      root.querySelectorAll('.nm, .pt-name, .kind, .t, .meta, .tally, .chip, .seg > button, .tx').forEach(el => {
        if (!vis(el)) return;
        if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) out.trunc.push(el.textContent.trim().slice(0, 30));
      });
      root.querySelectorAll('*').forEach(el => {
        if (!vis(el) || !el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
        const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11.9) out.tinyType.push(`${el.textContent.trim().slice(0, 16)} ${fs}`);
      });
    });
    return out;
  }, scope);
}
const SCOPES = '#app-screen section, #app-layer .sheet, #app-header, #app-undo';

async function run(width, theme, consoleTheme) {
  const tag = `${width}-${consoleTheme === 'app' ? theme + '-console-app' : 'dark'}`;
  const s = await H.open({ width, theme, consoleTheme, referee: true, route: '#/ref.console', data: data() });
  const p = s.page;
  const shot = n => s.shot(path.join(OUT, `audit-${n}-${tag}.png`));
  const expectTheme = consoleTheme === 'app' ? theme : 'dark';
  check(`[${tag}] console theme = ${expectTheme}`, (await p.evaluate(() => document.documentElement.dataset.theme)) === expectTheme);
  const sizes = await p.evaluate(() => ({
    goal: Array.from(document.querySelectorAll('.cn-goal')).map(e => Math.round(e.getBoundingClientRect().height)),
    act: Array.from(document.querySelectorAll('.cn-act')).map(e => Math.round(e.getBoundingClientRect().height)),
    card: Array.from(document.querySelectorAll('.cn-card')).map(e => Math.round(e.getBoundingClientRect().height)),
    ctl: Array.from(document.querySelectorAll('.cn-ctile')).map(e => Math.round(e.getBoundingClientRect().height)),
    save: Array.from(document.querySelectorAll('.cn-save')).map(e => Math.round(e.getBoundingClientRect().height)),
    cols: document.querySelectorAll('.cn-col').length,
    ctlTop: Math.round(document.querySelector('.cn-sec-ctl').getBoundingClientRect().top),
    screenW: Math.round(document.querySelector('#app-screen section').getBoundingClientRect().width),
  }));
  check(`[${tag}] round 6 deck: 2 team columns, Goal 88, Save 56, Block/Clear and Yellow/Red 60, controls 52, actions above Match controls in the first screen`, sizes.cols === 2 && sizes.goal.every(h => h === 88) && sizes.save.length === 2 && sizes.save.every(h => h === 56) && sizes.act.length === 4 && sizes.act.every(h => h === 60) && sizes.card.length === 4 && sizes.card.every(h => h === 60) && sizes.ctlTop < (width < 960 ? 844 : 820) && sizes.ctl.length === 5 && sizes.ctl.every(h => h === 52), sizes);
  if (width >= 960) check(`[${tag}] console stays phone-width on a laptop`, sizes.screenW <= 448, sizes.screenW);
  let m = await measure(p, SCOPES);
  check(`[${tag}] console: targets ≥ 48, no truncation, no sideways scroll, type ≥ 12`, !m.small.length && !m.trunc.length && !m.hscroll && !m.tinyType.length, m);
  await shot('console');

  const sheet = async (name, open, after) => {
    await open(); await sleep(450);
    if (after) { await after(); await sleep(250); }
    const mm = await measure(p, SCOPES);
    check(`[${tag}] ${name}: targets ≥ 48, no truncation, no sideways scroll, type ≥ 12`, !mm.small.length && !mm.trunc.length && !mm.hscroll && !mm.tinyType.length, mm);
    await shot(name);
    await p.keyboard.press('Escape'); await sleep(250);
  };
  await sheet('goal', () => p.click('.cn-goal[data-team="green"]'));
  await sheet('goal-assist', () => p.click('.cn-goal[data-team="red"]'), async () => { await p.click('.sheet [data-tap="scorer"]'); });
  await sheet('block', () => p.click('.cn-act[data-kind="block"][data-team="green"]'));
  await sheet('card', () => p.click('.cn-card[data-ctype="yellowCard"][data-team="red"]'));
  await sheet('save-picker', () => p.evaluate(() => App.actions && 0) || p.evaluate(() => { const b = document.querySelector('.cn-save[data-team="green"]'); b.click(); }));   // round 6: 1 tap logs (one keeper) or opens the 2-tile picker
  await sleep(5600);
  await sheet('adjust', () => p.evaluate(() => App.action('console.adjustClock', { sid: 'test_live' })));   // round 5: no ⋯ menu; Adjust clock sheet instead
  await sheet('sync', () => p.click('#app-header [data-sync]'));
  // Undo bar with +1 again (long name)
  await p.click('.cn-act[data-kind="block"][data-team="green"]'); await sleep(450);
  const longName = await p.evaluate(() => { const b = Array.from(document.querySelectorAll('.sheet .cn-prow')).find(x => /Jason/.test(x.textContent)); b.click(); return b.dataset.name; });
  await sleep(500);
  const ub = await measure(p, '#app-undo');
  check(`[${tag}] Undo bar "Block · ${longName}" + "+1 again" fits on one line`, !ub.trunc.length && !ub.small.length, ub);
  await shot('undo-again');
  await sleep(5500);
  await s.go('#/ref.events'); await sleep(300);
  m = await measure(p, SCOPES);
  check(`[${tag}] All events: targets ≥ 48, no truncation, no sideways scroll`, !m.small.length && !m.trunc.length && !m.hscroll && !m.tinyType.length, m);
  await shot('events');
  check(`[${tag}] no console errors`, s.errors.length === 0, s.errors);
  await s.close();
}

(async () => {
  await run(390, 'dark', null);
  await run(390, 'light', 'app');
  await run(1280, 'dark', null);
  await run(1280, 'light', 'app');
  lines.push(`\n${fails ? fails + ' FAILED' : 'ALL PASSED'}`);
  fs.writeFileSync(path.join(OUT, 'audit-result.txt'), lines.join('\n'));
  console.log(`\n${fails ? fails + ' FAILED' : 'ALL PASSED'}`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
