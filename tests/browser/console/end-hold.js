// Console · "Hold to end the game" is 7 s (Reuben, 5 Nov, item 8), TEST MODE ONLY (harness: in-memory data, Firebase blocked).
//   Adjust clock stays 1.5 s. A short press explains ("Hold for 7 s to end the game" / practice). Releasing at 5 s does nothing.
//   The fill runs the full 7 s. During the 7 s: the clock ticks, another phone logs an event, a stoppage starts (the deck's
//   state changes) and the outbox status changes: none of them redraws the button or resets the finger. Held 7 s → full time.
// Run: node tests/browser/console/end-hold.js
const path = require('path');
const H = require('../harness.js');
const { liveData } = require('./data.js');
const OUT = H.out(__dirname);
const SID = 'test_live';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (label, ok, extra) => { if (!ok) fails++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };

(async () => {
  const s = await H.open({ width: 390, referee: 'referee', route: '#/ref.console', data: liveData(), latency: 120 });
  const p = s.page;
  const timer = () => p.evaluate(sid => Store.session(sid).timer || {}, SID);
  const screenId = () => p.evaluate(() => document.querySelector('#app-screen section').dataset.screen);
  const toast = () => p.evaluate(() => { const t = document.querySelector('#app-toast .toast'); return t ? t.textContent : null; });
  const SEL = '.cn-endw .hold';
  const down = async () => {
    await p.evaluate(q => document.querySelector(q).scrollIntoView({ block: 'center' }), SEL); await sleep(200);
    const b = await (await p.$(SEL)).boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down();
  };

  await p.evaluate(() => document.querySelector('[data-tap="ctl"][data-act="kick"]').click()); await sleep(900);
  check('kicked off: clock running', (await timer()).status === 'running');

  const ms = await p.evaluate(() => ({ end: document.querySelector('.cn-endw .hold').dataset.ms, adjust: document.querySelector('.cn-adjust').dataset.ms,
    label: document.querySelector('.cn-endw .hold .hl').textContent }));
  check('"Hold to end the game" holds for 7 s (data-ms 7000)', ms.end === '7000' && ms.label === 'Hold to end the game', ms);
  check('Adjust clock stays 1.5 s (data-ms 1500)', ms.adjust === '1500', ms);
  const fill = await p.evaluate(q => { const b = document.querySelector(q); b.classList.add('holding'); const d = getComputedStyle(b.querySelector('.fill')).transitionDuration; b.classList.remove('holding'); return d; }, SEL);
  check('the amber fill runs the full 7 s', fill === '7s', fill);

  await down(); await sleep(200); await p.mouse.up(); await sleep(300);
  check('a short press explains: "Hold for 7 s to end the game"', (await toast()) === 'Hold for 7 s to end the game', await toast());
  await p.evaluate(() => document.documentElement.classList.add('practice'));
  await down(); await sleep(200); await p.mouse.up(); await sleep(300);
  check('…in practice: "Hold for 7 s to end practice"', (await toast()) === 'Hold for 7 s to end practice', await toast());
  await p.evaluate(() => document.documentElement.classList.remove('practice'));

  await down(); await sleep(2000); await p.mouse.up(); await sleep(300);
  check('released at 2 s (longer than the old 1.5 s): the game goes on', (await timer()).status === 'running' && (await screenId()) === 'ref.console');
  await down(); await sleep(5000); await p.mouse.up(); await sleep(300);
  check('released at 5 s: the game goes on', (await timer()).status === 'running' && (await screenId()) === 'ref.console');

  // the long hold, with everything that redraws the console happening under the finger
  await down();
  await p.evaluate(q => { window.__hb = document.querySelector(q); }, SEL);
  await sleep(1200);
  const someone = await p.evaluate(sid => Scoring.sessPlayers(Store.session(sid))[0].pid, SID);
  await p.evaluate((sid, pid) => Store.test.remoteChange({ [`sessions/${sid}/events/remote_block`]: { type: 'block', playerId: pid, min: 1, timestamp: Store.now(), by: 'other phone' } }), SID, someone);
  await sleep(1300);
  await p.evaluate(sid => { const se = Store.session(sid); Store.test.remoteChange({ [`sessions/${sid}/timer`]: Clock.startStoppage(se, Store.now()) }); }, SID);
  await sleep(1500);
  const mid = await p.evaluate(q => ({ same: window.__hb === document.querySelector(q), holding: window.__hb.classList.contains('holding'), connected: window.__hb.isConnected }), SEL);
  check('4 s into the hold, after a remote event, a stoppage and 4 clock ticks: same button, still filling', mid.same && mid.holding && mid.connected, mid);
  check('…and nothing ended yet', (await timer()).status !== 'ended');
  const w = await p.evaluate(() => { const f = window.__hb.querySelector('.fill'); return Math.round(f.getBoundingClientRect().width / window.__hb.getBoundingClientRect().width * 100); });
  check('…the fill is part-way (about 4/7 = 57%)', w >= 45 && w <= 70, w + '%');
  await sleep(3400);   // 7.4 s in total
  await p.mouse.up(); await sleep(700);
  const tf = await timer();
  check('held 7 s → the clock stops (timer ended, still active: being checked)', tf.status === 'ended' && (await p.evaluate(sid => Store.session(sid).status, SID)) === 'active', tf.status);
  check('…and the full-time check opens', (await screenId()) === 'ref.ftcheck');
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();

  console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
