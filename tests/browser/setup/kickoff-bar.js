// Setup · the kick-off bar (5 Nov, item 7), TEST MODE ONLY (harness: in-memory data, Firebase blocked).
//   Before both teams have players: no bar, a quiet "Pick both teams to kick off" at the end of the page.
//   6 + 6 ticked on an 844 px phone: a bar pinned above the tabs with Small poles | Big poles, the football + whistle
//   and "Hold to kick off · 12 players", on screen without scrolling; it never covers the last rows or the tabs.
//   Short press = a toast, 1 s = nothing, 1.5 s = kick off (one session, even if the hold fires twice).
//   Big poles: "Pick the keepers · n of 2 ›" scrolls to the keepers (kick-off still allowed without them, as before).
//   Another phone's change while a finger holds does not reset the hold. Laptop 1280: the bar sits in the column, at the bottom.
// Run: node tests/browser/setup/kickoff-bar.js
const path = require('path');
const H = require('../harness.js');
const OUT = H.out(__dirname);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (label, ok, extra) => { if (!ok) fails++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };

const tick = async (p, n) => {
  for (let i = 0; i < n; i++) {
    await p.evaluate(() => { const b = document.querySelector('.scr-ref-setup [data-tap="tick"]:not(.on)'); b.scrollIntoView({ block: 'center' }); b.click(); });
    await sleep(120);
  }
};
const side = async (p, t) => { await p.evaluate(v => document.querySelector(`[data-seg="side"] [data-value="${v}"]`).click(), t); await sleep(200); };
const rect = (p, sel) => p.evaluate(q => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height }; }, sel);
const pinShown = p => p.evaluate(() => { const e = document.querySelector('.scr-ref-setup > .su-pin'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; });
const toast = p => p.evaluate(() => { const t = document.querySelector('#app-toast .toast'); return t ? t.textContent : null; });
const sessions = p => p.evaluate(() => Store.test.writes.filter(w => Object.keys(w.updates).some(k => /^sessions\/[^/]+$/.test(k))).length);
async function press(p, ms, during) {
  const b = await rect(p, '.su-pin [data-hold="kickoff"]');
  await p.mouse.move((b.left + b.right) / 2, (b.top + b.bottom) / 2);
  await p.mouse.down();
  if (during) await during();
  await sleep(ms);
  await p.mouse.up();
  await sleep(350);
}

(async () => {
  // ======================================================================== phone, 390 × 844
  const s = await H.open({ width: 390, height: 844, theme: 'dark', referee: 'referee', route: '#/ref.setup' });
  const p = s.page;
  const vh = 844, NAV = 64;

  check('nothing ticked: no kick-off bar', !(await pinShown(p)) && !(await p.$('[data-hold="kickoff"]')));
  check('nothing ticked: the quiet hint "Pick both teams to kick off" at the end of the page', (await p.$eval('.su-foot .su-hint', e => e.textContent).catch(() => null)) === 'Pick both teams to kick off');
  await tick(p, 6);
  check('one team only (6 Green): still no bar', !(await pinShown(p)));
  await side(p, 'red');
  await tick(p, 6);
  await p.evaluate(() => window.scrollTo(0, 0)); await sleep(250);
  check('6 + 6 ticked: the bar is shown', await pinShown(p));
  const pin = await rect(p, '.scr-ref-setup > .su-pin');
  const btn = await rect(p, '.su-pin [data-hold="kickoff"]');
  check('the bar sits on the tab bar at the top of the page (no scrolling): bottom = 844 − 64', pin && Math.abs(pin.bottom - (vh - NAV)) <= 1, pin);
  check('"Hold to kick off" is fully on screen without scrolling', btn && btn.top >= 56 && btn.bottom <= vh - NAV, btn);
  check('it reads "Hold to kick off · 12 players"', (await p.$eval('.su-pin [data-hold="kickoff"] .hl', e => e.textContent)) === 'Hold to kick off · 12 players');
  check('the bar holds Small poles | Big poles (and the page has no second poles choice)',
    (await p.$$eval('.su-pin [data-seg="poles"] > button', a => a.map(x => x.textContent.trim()).join(' | '))) === 'Small poles | Big poles' && (await p.$$eval('[data-seg="poles"]', a => a.length)) === 1);
  check('…and the football + whistle picture', !!(await p.$('.su-pin .su-pic .ball')) && !!(await p.$('.su-pin .su-pic .wh')));
  check('the old in-page "Kick off" button is gone', !(await p.$('[data-tap="kickoff"]')));
  const nav = await rect(p, '#app-nav');
  check('the tab bar is not covered (bar ends where the tabs start)', nav && pin.bottom <= nav.top + 1, { pin: pin.bottom, nav: nav && nav.top });
  await s.shot(path.join(OUT, 'kickoff-bar-390-top.png'));

  // scroll to the very end: the last rows sit above the bar, nothing hidden under it
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(300);
  const pinEnd = await rect(p, '.scr-ref-setup > .su-pin');
  const lastBottom = await p.evaluate(() => {
    const kids = [...document.querySelectorAll('.scr-ref-setup > :not(.su-pin) *')].filter(e => e.getBoundingClientRect().height > 0);
    return Math.max(...kids.map(e => e.getBoundingClientRect().bottom));
  });
  const lastRow = await p.evaluate(() => { const r = [...document.querySelectorAll('.su-squad .su-sq, .su-more')].pop().getBoundingClientRect(); return r.bottom; });
  check('scrolled to the end: the bar is still on the tab bar', Math.abs(pinEnd.bottom - (vh - NAV)) <= 1, pinEnd);
  check('scrolled to the end: the last squad row and the team sheet sit above the bar (not covered)', lastBottom <= pinEnd.top + 0.5 && lastRow <= pinEnd.top, { lastBottom, lastRow, barTop: pinEnd.top });
  await s.shot(path.join(OUT, 'kickoff-bar-390-end.png'));
  await p.evaluate(() => window.scrollTo(0, 0)); await sleep(200);

  // short press, too short, the toast never covers the button
  await press(p, 200);
  check('a short press: toast "Hold to kick off", no kick-off', (await toast(p)) === 'Hold to kick off' && (await sessions(p)) === 0, await toast(p));
  const t = await rect(p, '#app-toast .toast');
  const b2 = await rect(p, '.su-pin [data-hold="kickoff"]');
  check('the toast floats above the bar, not over "Hold to kick off"', t && t.bottom <= b2.top, { toast: t, btn: b2 });
  await press(p, 1000);
  check('released at 1 s: no kick-off', (await sessions(p)) === 0 && !(await p.evaluate(() => Store.activeSessionId())));
  const fill = await p.evaluate(() => { const b = document.querySelector('.su-pin [data-hold="kickoff"]'); b.classList.add('holding'); const d = getComputedStyle(b.querySelector('.fill')).transitionDuration; b.classList.remove('holding'); return { d, ms: b.dataset.ms }; });
  check('the fill runs 1.5 s (data-ms 1500)', fill.d === '1.5s' && fill.ms === '1500', fill);

  // big poles: keepers stay on the page; the bar offers the way to them; kick-off is not blocked
  await p.evaluate(() => document.querySelector('.su-pin [data-seg="poles"] [data-value="big"]').click()); await sleep(250);
  const kn = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('befit_setup_draft')); return Object.keys(d.keepers || {}).length; });
  const pk = await p.$eval('.su-pin [data-tap="gokeepers"]', e => e.textContent).catch(() => null);
  check(`big poles, ${kn} of 2 keepers known: the bar says "Pick the keepers · ${kn} of 2 ›"`, kn < 2 ? pk === `Pick the keepers · ${kn} of 2 ›` : pk === null, pk);
  check('big poles: the keeper picks are on the page, above the bar', (await p.$$eval('.su-foot .su-kl', a => a.length)) === 2);
  check('big poles: "Hold to kick off" stays available (keepers are not required, as before)', !!(await p.$('.su-pin [data-hold="kickoff"]')));
  await s.shot(path.join(OUT, 'kickoff-bar-390-bigpoles.png'));
  if (pk) {
    await p.evaluate(() => document.querySelector('.su-pin [data-tap="gokeepers"]').click()); await sleep(900);
    const k = await rect(p, '.su-foot .su-kl');
    const pinK = await rect(p, '.scr-ref-setup > .su-pin');
    check('"Pick the keepers" scrolls the keepers into view, clear of the header and the bar', k && k.top >= 56 && k.bottom <= pinK.top, { k, barTop: pinK.top });
    // choose a keeper for every side through "Other ›" → the row goes away
    for (const team of ['green', 'red']) {
      const has = await p.evaluate(tm => !!JSON.parse(localStorage.getItem('befit_setup_draft')).keepers[tm], team);
      if (has) continue;
      await p.evaluate(tm => document.querySelector(`.su-foot [data-tap="kother"][data-team="${tm}"]`).click(), team); await sleep(450);
      await p.evaluate(() => document.querySelector('.sh-setup-kother [data-tap="kpick"]').click()); await sleep(450);
    }
    check('both keepers chosen: the "Pick the keepers" row goes', !(await p.$('.su-pin [data-tap="gokeepers"]')));
    await s.shot(path.join(OUT, 'kickoff-bar-390-bigpoles-keepers.png'));
  }
  await p.evaluate(() => document.querySelector('.su-pin [data-seg="poles"] [data-value="small"]').click()); await sleep(250);
  check('back to small poles: no keeper picks, no "Pick the keepers"', !(await p.$('.su-foot .su-kl')) && !(await p.$('.su-pin [data-tap="gokeepers"]')));

  // another phone changes the data while the finger is holding: the hold is not reset
  await p.evaluate(() => window.scrollTo(0, 0)); await sleep(200);
  const n0 = await sessions(p);
  await press(p, 1700, async () => {
    await sleep(500);
    await p.evaluate(() => { window.__kb = document.querySelector('[data-hold="kickoff"]'); Store.test.remoteChange({ 'settings/club/name': 'BE Fit Club' }); });
    await sleep(300);
    check('a data change during the hold: same button, still holding', await p.evaluate(() => window.__kb === document.querySelector('[data-hold="kickoff"]') && window.__kb.classList.contains('holding')));
    // the hold fires twice (a stuck finger, a second phone event): still one kick-off
    setTimeout(() => p.evaluate(() => { const b = window.__kb; setTimeout(() => b.dispatchEvent(new CustomEvent('ui:hold', { bubbles: true, detail: { name: 'kickoff' } })), 30); }).catch(() => {}), 950);
  });
  await sleep(800);
  const sid = await p.evaluate(() => Store.activeSessionId());
  const sess = sid && await p.evaluate(id => Store.session(id), sid);
  check('held 1.5 s → exactly one session written (no double kick-off)', (await sessions(p)) - n0 === 1, (await sessions(p)) - n0);
  check('…12 players, small poles, clock running, console open', !!sess && Object.values(sess.teams).reduce((n, x) => n + Object.keys(x.players).length, 0) === 12 && sess.format.start === 'small' && sess.timer.status === 'running' &&
    (await p.evaluate(() => document.querySelector('#app-screen section').dataset.screen)) === 'ref.console', sess && sess.format);
  check('phone: no console errors', s.errors.length === 0, s.errors);
  await s.close();

  // ======================================================================== laptop, 1280 wide (left rail, no tabs)
  const L = await H.open({ width: 1280, theme: 'light', referee: 'referee', route: '#/ref.setup' });
  const q = L.page;
  await tick(q, 6); await side(q, 'red'); await tick(q, 6);
  await q.evaluate(() => window.scrollTo(0, 0)); await sleep(250);
  const lp = await rect(q, '.scr-ref-setup > .su-pin');
  const col = await rect(q, '.scr-ref-setup');
  const rail = await rect(q, '#app-rail');
  const lvh = await q.evaluate(() => window.innerHeight);
  check('laptop: the bar is at the bottom edge of the window', lp && Math.abs(lp.bottom - lvh) <= 1, { bar: lp, vh: lvh });
  check('laptop: the bar stays in the page column, clear of the rail', lp && rail && lp.left >= rail.right && lp.right <= col.right + 24, { bar: lp, rail: rail && rail.right, col });
  check('laptop: "Hold to kick off" on screen without scrolling', !!(await rect(q, '.su-pin [data-hold="kickoff"]')) && (await rect(q, '.su-pin [data-hold="kickoff"]')).bottom <= lvh);
  await L.shot(path.join(OUT, 'kickoff-bar-1280-light.png'));
  await q.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(300);
  const lEnd = await rect(q, '.scr-ref-setup > .su-pin');
  const lLast = await q.evaluate(() => Math.max(...[...document.querySelectorAll('.scr-ref-setup > :not(.su-pin) *')].filter(e => e.getBoundingClientRect().height > 0).map(e => e.getBoundingClientRect().bottom)));
  check('laptop, scrolled to the end: nothing under the bar', lLast <= lEnd.top + 0.5, { lLast, barTop: lEnd.top });
  check('laptop: no console errors', L.errors.length === 0, L.errors);
  await L.close();

  console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
