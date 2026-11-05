// Minutes when adding or editing an event (5 Nov 2026). TEST MODE ONLY (the harness: no Firebase, writes in memory).
//   (a) tap the minute to type it (number keyboard, 1 to 150, − and + kept), in Add a missed event and Change one entry;
//       a stoppage minute (46+12') can't be typed (never re-stamped into plain minutes);
//   (b) after adding an event at a minute on a finished game, the next add on that game opens with Set on, at that
//       minute (memory only); a live game keeps starting at the live minute.
'use strict';
const path = require('path');
const H = require('../harness.js');
const OUT = H.out(__dirname);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const check = (label, ok, extra) => { ok ? passes++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + label + (!ok && extra !== undefined ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); };
const step = async (label, fn) => { try { await fn(); } catch (e) { check(`${label} (crashed: ${String(e.message || e).split('\n')[0]})`, false); } };

const SID12 = '-P3lenQyxWIniPyrtFAn', SID19 = '-P4KcMogcPM8_RRG9wAQ';
const NOW = H.DEFAULT_NOW;   // Mon 19 Oct 19:30
const click = async (p, sel, wait = 200) => {
  await p.waitForSelector(sel, { visible: true, timeout: 5000 });
  await p.$eval(sel, e => e.scrollIntoView({ block: 'center' }));
  await p.click(sel); await sleep(wait);
};
const waitSaved = p => p.waitForFunction(() => { const u = document.querySelector('#app-undo .undo'); return u && !u.classList.contains('saving') && !document.querySelector('.is-saving'); }, { timeout: 5000 });
const minText = p => p.$eval('.sheet [data-min]', e => e.textContent).catch(() => null);
const segOn = p => p.$eval('.sheet [data-seg="minmode"] .on', e => e.dataset.value).catch(() => null);
const typeMinute = async (p, text, how) => {
  await click(p, '.sheet [data-tap="min-type"]', 80);
  await p.waitForSelector('.sheet [data-min-input]', { timeout: 2000 });
  await p.evaluate(() => { const i = document.querySelector('.sheet [data-min-input]'); i.select(); });
  await p.keyboard.type(text);
  if (how === 'enter') { await p.keyboard.press('Enter'); await sleep(120); }
};
const lastAdded = (p, sid) => p.evaluate(sid => {
  const evs = Object.entries(Store.session(sid).events || {}).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
  const [id, e] = evs[0]; return { id, min: e.min, type: e.type, by: e.by, ts: e.timestamp, stop: e.stoppageMin };
}, sid);

(async () => {
  const data = H.snapshot();
  // a live game today (clock running, 30:30 on it → minute 31) to prove live keeps the live minute
  const live = JSON.parse(JSON.stringify(data.sessions[SID12]));
  Object.assign(live, { date: '2026-10-19', status: 'active', timer: { startedAt: NOW - 30.5 * 60000, status: 'running', pausedTotal: 0, stoppageTotal: 0, htLogged: false } });
  delete live.ftCheck; delete live.goals; delete live.cleanSheets;
  data.sessions['live-test'] = live;

  const s = await H.open({ referee: true, width: 390, theme: 'dark', latency: 40, data, route: `#/ref.edit?sid=${SID12}` });
  const p = s.page;
  const reuel = await p.evaluate(() => Object.keys(Store.players()).find(k => Store.player(k).name === 'Reuel'));
  const pickWho = async pid => { await click(p, '.sheet [data-tap="a-who"]'); await click(p, `.sheet [data-tap="pk"][data-pid="${pid}"]`); };
  const openAdd = async sid => { await p.evaluate(sid => App.action('fix.addMissed', { sid }), sid); await sleep(250); };
  const closeSheets = async () => { await p.evaluate(() => UI.sheet.closeAll()); await sleep(200); };

  // ---------------------------------------------------------------- (a) typing in Add a missed event (finished 12 Oct)
  await step('add: type the minute', async () => {
    await openAdd(SID12);
    check('12 Oct, first add: minute starts on "Not sure"', (await segOn(p)) === 'none', await segOn(p));
    await click(p, '.sheet [data-seg="minmode"] [data-value="set"]');
    check('Set starts at the last minute logged live: 73\'', (await minText(p)) === "73'", await minText(p));
    const tag = await p.$eval('.sheet [data-min]', e => ({ tag: e.tagName, tap: e.dataset.tap || '', h: e.getBoundingClientRect().height }));
    check('the minute is a button you can tap (≥ 44 px tall)', tag.tag === 'BUTTON' && tag.tap === 'min-type' && tag.h >= 44, tag);
    await click(p, '.sheet [data-tap="min-type"]', 80);
    const box = await p.$eval('.sheet [data-min-input]', e => ({ mode: e.inputMode, focused: document.activeElement === e, v: e.value, fs: parseFloat(getComputedStyle(e).fontSize) })).catch(() => null);
    check('tapping it opens a number box (number keyboard), focused, holding 73', !!box && box.mode === 'numeric' && box.focused && box.v === '73', box);
    check('the number box text is 16 px (no zoom on iPhone)', !!box && box.fs >= 16, box);
    await s.shot(path.join(OUT, 'minute-typing-390-dark.png'));
    await p.evaluate(() => document.querySelector('.sheet [data-min-input]').select());
    await p.keyboard.type('83'); await p.keyboard.press('Enter'); await sleep(150);
    check('type 83 + Enter → 83\'', (await minText(p)) === "83'", await minText(p));
    await click(p, '.sheet [data-tap="min-up"]');
    check('+ still steps one minute: 84\'', (await minText(p)) === "84'", await minText(p));
    await click(p, '.sheet [data-tap="min-dn"]');
    check('− still steps one minute: 83\'', (await minText(p)) === "83'", await minText(p));
    await typeMinute(p, '200', 'enter');
    check('type 200 → 150\' (the stepper\'s top limit)', (await minText(p)) === "150'", await minText(p));
    await typeMinute(p, '0', 'enter');
    check('type 0 → 1\' (the stepper\'s bottom limit)', (await minText(p)) === "1'", await minText(p));
    await typeMinute(p, '', 'enter');
    check('an empty box leaves the minute as it was (1\')', (await minText(p)) === "1'", await minText(p));
    await typeMinute(p, '60');
    await click(p, '.sheet [data-tap="min-up"]');
    check('typed 60 then tapped + straight away (box still open) → 61\' (the tap is not lost)', (await minText(p)) === "61'", await minText(p));
    await typeMinute(p, '83', 'enter');
    await click(p, '.sheet [data-tap="a-type"][data-value="clearance"]');
    await pickWho(reuel);
    const w0 = await p.evaluate(() => Store.test.writes.length);
    await click(p, '.sheet [data-tap="a-save"]', 50); await waitSaved(p); await sleep(200);
    const ev = await lastAdded(p, SID12);
    check('Add clearance at 83\': one write, the event has min 83, a timestamp and by', (await p.evaluate(() => Store.test.writes.length)) === w0 + 1 && ev.type === 'clearance' && ev.min === 83 && !!ev.ts && !!ev.by, ev);
  });

  // ---------------------------------------------------------------- (b) the next add remembers 83'
  await step('add: remembers the minute', async () => {
    await sleep(300);
    await openAdd(SID12);
    check('next add on 12 Oct opens with Set already on', (await segOn(p)) === 'set', await segOn(p));
    check('… at the minute just used: 83\' (not 73\')', (await minText(p)) === "83'", await minText(p));
    // type, then tap Add straight away with the box still open: the typed minute is used
    await click(p, '.sheet [data-tap="a-type"][data-value="block"]');
    await pickWho(reuel);
    await typeMinute(p, '77');
    await click(p, '.sheet [data-tap="a-save"]', 50); await waitSaved(p); await sleep(200);
    const ev = await lastAdded(p, SID12);
    check('typed 77 then tapped "Add block" with the box still open → saved at 77\'', ev.type === 'block' && ev.min === 77, ev);
    await openAdd(SID12);
    check('then the next add starts at 77\'', (await segOn(p)) === 'set' && (await minText(p)) === "77'", await minText(p));
    await click(p, '.sheet [data-seg="minmode"] [data-value="none"]');
    await click(p, '.sheet [data-seg="minmode"] [data-value="set"]');
    check('"Not sure" then Set again → back at 77\'', (await minText(p)) === "77'", await minText(p));
    await closeSheets();
    await openAdd(SID19);
    check('another finished game (19 Oct) is not affected: "Not sure"', (await segOn(p)) === 'none', await segOn(p));
    await closeSheets();
    const nothing = await p.evaluate(() => JSON.stringify(Store.test.writes).includes('lastAdd') || Object.keys(localStorage).some(k => /min/i.test(k) && /add/i.test(k)));
    check('the remembered minute is never saved (no write, nothing in the phone\'s storage)', !nothing);
  });

  // ---------------------------------------------------------------- live game: the live minute wins
  await step('live game', async () => {
    await openAdd('live-test');
    check('a live game opens on Set at the live minute: 31\'', (await segOn(p)) === 'set' && (await minText(p)) === "31'", await minText(p));
    await typeMinute(p, '20', 'enter');
    await click(p, '.sheet [data-tap="a-type"][data-value="clearance"]');
    await pickWho(reuel);
    await click(p, '.sheet [data-tap="a-save"]', 50); await waitSaved(p); await sleep(200);
    check('added at 20\' on the live game', (await lastAdded(p, 'live-test')).min === 20, await lastAdded(p, 'live-test'));
    await openAdd('live-test');
    check('the next add on the live game is still the live minute (31\'), not 20\'', (await minText(p)) === "31'", await minText(p));
    await closeSheets();
  });

  // ---------------------------------------------------------------- Change one entry: typing keeps timestamp + by
  await step('event sheet', async () => {
    const e = await p.evaluate(sid => { const [id, ev] = Object.entries(Store.session(sid).events).find(([, x]) => x.type === 'goal' && x.min === 56); return { id, ts: ev.timestamp, by: ev.by || null }; }, SID12);
    await p.evaluate((sid, eid) => App.action('fix.eventSheet', { sid, eid }), SID12, e.id); await sleep(250);
    await typeMinute(p, '50', 'enter');
    check('Change one entry: type 50 → 50\'', (await minText(p)) === "50'", await minText(p));
    await click(p, '.sheet [data-tap="f-save"]', 50); await waitSaved(p); await sleep(200);
    const after = await p.evaluate((sid, eid) => Store.session(sid).events[eid], SID12, e.id);
    check('saved at 50\', same timestamp and by, plus editedBy / editedAt', after.min === 50 && after.timestamp === e.ts && (after.by || null) === e.by && !!after.editedBy && !!after.editedAt, { after, e });
  });

  // ---------------------------------------------------------------- a stoppage minute can't be typed
  await step('stoppage', async () => {
    const st = await p.evaluate(sid => { const [id, ev] = Object.entries(Store.session(sid).events).find(([, x]) => x.stoppageMin != null && x.stoppageMin > 1); return { id, text: Scoring.minuteText(ev) }; }, SID19);
    await p.evaluate((sid, eid) => App.action('fix.eventSheet', { sid, eid }), SID19, st.id); await sleep(250);
    const el = await p.$eval('.sheet [data-min]', e => ({ tag: e.tagName, tap: e.dataset.tap || '', t: e.textContent }));
    check(`a stoppage minute (${st.text}) is a label, not a tap-to-type button`, el.tag === 'SPAN' && !el.tap && el.t === st.text, el);
    check('… and there is no number box to open', !(await p.$('.sheet [data-tap="min-type"]')));
    await click(p, '.sheet [data-tap="min-up"]');
    const up = await minText(p);
    check(`… − / + still step the stoppage label (${st.text} → ${up})`, /^\d+\+\d+'$/.test(up || '') && up !== st.text, up);
    await closeSheets();
  });

  check('no console errors', !s.errors.length, s.errors.join(' | '));
  await s.close();
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
