// Setup builder · 390 / 1280 × dark / light sweep (TEST MODE ONLY). Screenshots + layout checks on every state:
// no truncated text, targets >= 48 px, no sideways scroll, 12 px type floor, no console errors.
// Light runs set "Referee console: Same as the app" (the console area is forced dark otherwise).
// Run (Git Bash): MSYS_NO_PATHCONV=1 node visual.js
const path = require('path');
const fs = require('fs');
const H = require('../harness.js');
const OUT = H.out(__dirname);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const log = [];
const check = (label, ok, extra) => { if (!ok) fails++; const l = (ok ? 'ok  ' : 'FAIL') + ' ' + label + (extra !== undefined && !ok ? '  ' + JSON.stringify(extra) : ''); log.push(l); console.log(l); };
const snap = H.snapshot();
const pidOf = name => Object.keys(snap.players).find(k => snap.players[k].name === name);
const tap = async (p, sel, ms) => { await p.evaluate(sel => { const e = document.querySelector(sel); if (e) e.scrollIntoView({ block: 'center' }); }, sel); await p.click(sel); await sleep(ms || 300); };

async function layout(p, label) {
  const r = await p.evaluate(() => {
    const vis = e => e.offsetParent && e.getBoundingClientRect().width > 0;
    const trunc = Array.from(document.querySelectorAll('.scr-ref-setup *, .sh-setup *')).filter(e => vis(e) && e.children.length === 0 && e.textContent.trim() &&
      (e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth) && getComputedStyle(e).overflowX !== 'auto').map(e => e.textContent.trim().slice(0, 30));
    const clamp = Array.from(document.querySelectorAll('.scr-ref-setup .pt-name, .sh-setup .pt-name')).filter(e => vis(e) && e.scrollHeight > e.clientHeight + 1).map(e => e.textContent);
    const small = Array.from(document.querySelectorAll('.scr-ref-setup button, .sh-setup button')).filter(e => vis(e) && !e.disabled && e.getBoundingClientRect().height < 47.5).map(e => e.textContent.trim().slice(0, 20) + ':' + Math.round(e.getBoundingClientRect().height));
    const tiny = Array.from(document.querySelectorAll('.scr-ref-setup *, .sh-setup *')).filter(e => vis(e) && Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.className);
    return { trunc: trunc.concat(clamp), small, tiny, wide: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  check(`${label}: no truncated names`, r.trunc.length === 0, r.trunc);
  check(`${label}: targets >= 48 px`, r.small.length === 0, r.small);
  check(`${label}: 12 px floor`, r.tiny.length === 0, r.tiny);
  check(`${label}: no sideways scroll`, !r.wide);
}

function liveData() {
  const d = H.snapshot();
  const now = H.DEFAULT_NOW;
  const ids = ['Harry', 'Theophilus', 'Christopher O', 'Joshua', 'Doku', 'Emmanuel', 'Reuel', 'David S', 'Samuel A', 'Reuben', 'Andrew', 'Barnabas', 'Papa Yaw'].map(pidOf);
  const teams = { green: { players: {} }, red: { players: {} } };
  ids.forEach((pid, i) => { teams[i < 7 ? 'green' : 'red'].players[pid] = { position: d.players[pid].defaultPosition === 'GK' ? 'MID' : d.players[pid].defaultPosition }; });
  teams.green.players[pidOf('Keith')] = { position: 'FWD', moved: { from: 'red', at: 27 } };
  d.sessions.LIVE = { date: '2026-10-19', status: 'active', mode: 'live', teams, format: { start: 'small' },
    timer: { status: 'paused', startedAt: now - 50 * 60000, pausedAt: now - 5 * 60000, pausedTotal: 0, htLogged: true, pauseReason: 'halftime', stoppageTotal: 0 },
    events: { a: { type: 'goal', team: 'green', scorerId: ids[0], min: 9, timestamp: 1 }, b: { type: 'goal', team: 'red', scorerId: ids[8], min: 38, timestamp: 2 } } };
  return d;
}

(async () => {
  for (const width of [390, 1280]) for (const theme of ['dark', 'light']) {
    const t = `${width}-${theme}`;
    const ct = theme === 'light' ? 'app' : null;
    // --- Who's here (no game on)
    const s = await H.open({ width, theme, referee: true, route: '#/ref.setup', consoleTheme: ct });
    const p = s.page;
    check(`[${t}] theme`, await p.evaluate(() => document.documentElement.dataset.theme) === theme);
    for (let i = 0; i < 5; i++) await tap(p, '.scr-ref-setup [data-tap="usual"]', 120);
    await tap(p, '[data-seg="side"] [data-value="red"]');
    for (let i = 0; i < 5; i++) await tap(p, '.scr-ref-setup [data-tap="usual"]', 120);
    await p.evaluate(() => window.scrollTo(0, 0));
    await layout(p, `[${t}] who's here`);
    await s.shot(path.join(OUT, `whos-here-${t}.png`));
    await p.type('[data-search="who"]', 'Francis'); await sleep(250);
    await layout(p, `[${t}] duplicate check`);
    await s.shot(path.join(OUT, `dupcheck-${t}.png`));
    await p.click('[data-search="who"]', { clickCount: 3 }); await p.keyboard.press('Backspace'); await sleep(150);
    await tap(p, '[data-seg="poles"] [data-value="big"]');
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await layout(p, `[${t}] big poles at kick-off`);
    await s.shot(path.join(OUT, `whos-here-big-${t}.png`));
    await tap(p, '.scr-ref-setup [data-tap="pl"]');
    await layout(p, `[${t}] player options sheet`);
    await s.shot(path.join(OUT, `player-options-${t}.png`));
    await p.keyboard.press('Escape'); await sleep(150);
    await tap(p, '.scr-ref-setup [data-tap="someone"]');
    await p.type('.sh-setup-new [data-search="q"]', 'bon'); await sleep(250);
    await layout(p, `[${t}] + Someone (keeper picker)`);
    await s.shot(path.join(OUT, `keeper-someone-${t}.png`));
    check(`[${t}] no console errors (setup)`, s.errors.length === 0, s.errors);
    await s.close();

    // --- mid-match sheets (half time 45:00, small poles)
    const m = await H.open({ width, theme, referee: true, route: '#/ref.console', consoleTheme: ct, data: liveData() });
    const q = m.page;
    for (const [name, file] of [['setup.addArrival', 'arrivals'], ['setup.teamsTonight', 'teams-tonight'], ['setup.bigPoles', 'big-poles'], ['setup.newPerson', 'new-person']]) {
      await q.evaluate(n => App.action(n, { sid: 'LIVE' }), name); await sleep(350);
      if (file === 'new-person') { await q.type('.sh-setup-new [data-search="q"]', 'Francis'); await sleep(250); }
      if (file === 'big-poles') { await tap(q, `.sh-setup-poles [data-tap="keeper"][data-pid="${pidOf('Toby')}"]`); }
      await layout(q, `[${t}] ${file} sheet`);
      await m.shot(path.join(OUT, `${file}-${t}.png`));
      await q.keyboard.press('Escape'); await sleep(200);
    }
    check(`[${t}] no console errors (sheets)`, m.errors.length === 0, m.errors);
    await m.close();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  fs.writeFileSync(path.join(OUT, 'visual-result.txt'), log.join('\n') + (fails ? `\n\n${fails} FAILED` : '\n\nALL PASSED') + '\n');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
