// Pay ahead (5 Nov 2026) + "Payment history" (was "Subs"). TEST MODE ONLY (the harness: no Firebase, writes in memory).
// Admin: the entry on Money (landing + All dates) and on a player's page, the one sheet (who → weeks → ₵ a week →
// the real dates and the sum), a date already paid is skipped, one write with Undo, then how it reads everywhere:
// All dates "1 person paid ahead", the admin's Payment history "Paid ahead", the rule (the night stays "not entered").
// The player's own Me shows a status only (6 Nov): paying ahead doesn't clear dates already owed.
'use strict';
const path = require('path');
const H = require('../harness.js');
const OUT = H.out(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const check = (label, ok, extra) => { ok ? passes++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + label + (!ok && extra !== undefined ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); };
const step = async (label, fn) => { try { await fn(); } catch (e) { check(`${label} (crashed: ${String(e.message || e).split('\n')[0]})`, false); } };
const NOW = '2026-11-05T12:00';      // Thu 5 Nov → the next game is Mon 9 Nov
const click = async (p, sel, wait = 220) => {
  await p.waitForSelector(sel, { visible: true, timeout: 4000 });
  await p.$eval(sel, e => e.scrollIntoView({ block: 'center' }));
  await p.click(sel); await sleep(wait);
};
const txt = (p, sel) => p.$eval(sel, e => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
const waitSaved = p => p.waitForFunction(() => { const u = document.querySelector('#app-undo .undo'); return u && !u.classList.contains('saving') && !document.querySelector('.is-saving'); }, { timeout: 5000 });

(async () => {
  const data = H.snapshot();
  const a = await H.open({ referee: 'admin', width: 390, height: 844, theme: 'dark', now: NOW, data, route: '#/ref.money', latency: 40 });
  const p = a.page;
  // someone who owes 2 dates (for the card width check), and a date they already paid (16 Nov, entered the old way)
  const who = await p.evaluate(() => { const pid = Object.keys(Store.players()).sort().find(k => BF_PAY.owed(k).length === 2); return { pid, name: Store.player(pid).name }; });
  await p.evaluate(pid => Store.multi({ 'paymentDays/2026-11-16/date': '2026-11-16', [`paymentDays/2026-11-16/payments/${pid}`]: { amount: 60, updatedAt: 1, by: 'referee' } }), who.pid);
  await sleep(300);
  console.log('player with 2 dates owed:', who.name);

  // ---------------------------------------------------------------- the entry on Money
  await step('entry', async () => {
    check('Money landing: "Pay ahead" is there, under the switch', !!(await p.$('.scr-ref-money > .adm-ahead [data-tap="pay-ahead"]')));
    await p.evaluate(() => App.go('ref.money', { all: 1 }, { replace: true })); await sleep(400);
    check('Money › All dates: "Pay ahead" is there too', !!(await p.$('.scr-ref-money > .adm-ahead [data-tap="pay-ahead"]')));
    const tgt = await p.$eval('[data-tap="pay-ahead"]', e => e.getBoundingClientRect().height).catch(() => 0);
    check('the entry is a full row, at least 48 px tall', tgt >= 48, tgt);
  });

  // ---------------------------------------------------------------- the sheet
  let w0 = 0;
  await step('sheet', async () => {
    await click(p, '[data-tap="pay-ahead"]');
    check('opens on "who?" with a search and every player', (await txt(p, '.sheet .sheet-title')) === 'Pay ahead · who?' && (await p.$$eval('.sheet [data-tap="ah-pick"]', l => l.length)) === Object.keys(data.players).length);
    await p.type('.sheet [data-search="ah-q"]', who.name.slice(0, 5));
    const shown = await p.$$eval('.sheet [data-tap="ah-pick"]', l => l.filter(r => !r.hidden).map(r => r.innerText.trim()));
    check(`search "${who.name.slice(0, 5)}" narrows the list`, shown.length >= 1 && shown.length < 10 && shown.some(x => x.includes(who.name)), shown);
    await click(p, `.sheet [data-tap="ah-pick"][data-pid="${who.pid}"]`);
    const m = { title: await txt(p, '.sheet .sheet-title'), weeks: await txt(p, '.sheet [data-ah-weeks]'), amt: await p.$eval('.sheet [data-ah-amt]', e => e.value),
      dates: await txt(p, '.sheet [data-ah-dates]'), skip: await txt(p, '.sheet .adm-ah-skip'), sum: await txt(p, '.sheet [data-ah-sum]'), total: await txt(p, '.sheet [data-ah-total]'), btn: await txt(p, '.sheet [data-tap="ah-save"]') };
    check('defaults: 3 weeks, ₵60 a week (the club fee)', m.weeks === '3' && m.amt === '60', m);
    check('the actual dates, from the next game, weekly, 16 Nov skipped: "Mon 9 Nov · 23 Nov · 30 Nov"', m.dates === 'Mon 9 Nov · 23 Nov · 30 Nov', m.dates);
    check('says so on screen: "Skipped 16 Nov: already paid …"', /^Skipped 16 Nov: already paid/.test(m.skip || ''), m.skip);
    check('the sum: "3 × ₵60 = ₵180"', m.sum === '3 × ₵60' && m.total === '= ₵180', m);
    check('the button: "Save 3 weeks · ₵180"', m.btn === 'Save 3 weeks · ₵180', m.btn);
    await a.shot(path.join(OUT, 'payahead-sheet-390-dark.png'));
    await click(p, '.sheet [data-tap="ah-up"]');
    check('+ → 4 weeks: adds 7 Dec, 4 × ₵60 = ₵240', (await txt(p, '.sheet [data-ah-dates]')) === 'Mon 9 Nov · 23 Nov · 30 Nov · 7 Dec' && (await txt(p, '.sheet [data-ah-total]')) === '= ₵240');
    for (let i = 0; i < 4; i++) await click(p, '.sheet [data-tap="ah-dn"]', 80);
    check('− stops at 1 week (button off)', (await txt(p, '.sheet [data-ah-weeks]')) === '1' && await p.$eval('.sheet [data-tap="ah-dn"]', e => e.disabled));
    for (let i = 0; i < 13; i++) await p.$eval('.sheet [data-tap="ah-up"]', e => e.click());
    await sleep(150);
    check('+ stops at 12 weeks (button off), 12 dates listed', (await txt(p, '.sheet [data-ah-weeks]')) === '12' && await p.$eval('.sheet [data-tap="ah-up"]', e => e.disabled) && (await txt(p, '.sheet [data-ah-dates]')).split(' · ').length === 12);
    for (let i = 0; i < 9; i++) await p.$eval('.sheet [data-tap="ah-dn"]', e => e.click());
    await sleep(150);
    await p.click('.sheet [data-ah-amt]', { clickCount: 3 }); await p.keyboard.type('50'); await sleep(120);
    check('amount can be changed: ₵50 → "3 × ₵50 = ₵150", "Save 3 weeks · ₵150"', (await txt(p, '.sheet [data-ah-sum]')) === '3 × ₵50' && (await txt(p, '.sheet [data-ah-total]')) === '= ₵150' && (await txt(p, '.sheet [data-tap="ah-save"]')) === 'Save 3 weeks · ₵150');
    await p.click('.sheet [data-ah-amt]', { clickCount: 3 }); await p.keyboard.press('Backspace'); await sleep(120);
    check('no amount: Save is off ("Type an amount")', await p.$eval('.sheet [data-tap="ah-save"]', e => e.disabled && e.textContent === 'Type an amount'));
    await p.keyboard.type('60'); await sleep(120);
    await a.shot(path.join(OUT, 'payahead-sheet-390-dark-2.png'));
    w0 = await p.evaluate(() => Store.test.writes.length);
    await click(p, '.sheet [data-tap="ah-save"]', 50); await waitSaved(p); await sleep(250);
  });

  // ---------------------------------------------------------------- what was written
  await step('write', async () => {
    const ws = await p.evaluate(n => Store.test.writes.slice(n).map(w => w.updates), w0);
    const u = ws[0] || {};
    const want = ['2026-11-09', '2026-11-23', '2026-11-30'];
    const recs = want.map(d => u[`paymentDays/${d}/payments/${who.pid}`]);
    check('Save: ONE write for all 3 dates', ws.length === 1, ws.length);
    check('each date: { amount 60, ahead: true, updatedAt, by } for that person', recs.every(r => r && r.amount === 60 && r.ahead === true && r.updatedAt && r.by), recs);
    const keys = Object.keys(u).sort();
    const allowed = want.flatMap(d => [`paymentDays/${d}/payments/${who.pid}`, `paymentDays/${d}/date`, `paymentDays/${d}/updatedAt`, `paymentDays/${d}/createdAt`]).sort();
    check('nothing else is touched (16 Nov, other people, sessions)', JSON.stringify(keys) === JSON.stringify(allowed), keys);
    check('the sheet closes, Undo bar: "… paid ahead 3 weeks · ₵180"', !(await p.$('.sheet.sh-admin-ahead')) && /paid ahead 3 weeks · ₵180/.test(await txt(p, '#app-undo .undo') || ''), await txt(p, '#app-undo .undo'));
    const rule = await p.evaluate(pid => ({ st: BF_PAY.status(pid, '2026-11-09'), rec: BF_PAY.hasRecord('2026-11-09'), amt: BF_PAY.amount(pid, '2026-11-23') }), who.pid);
    check('the rule: paid on 9 Nov; 9 Nov is still not "entered" (nobody else is owed yet)', rule.st === 'paid' && rule.rec === false && rule.amt === 60, rule);
    await sleep(5300);   // the Undo bar goes
    const row = await p.evaluate(() => { const r = document.querySelector('[data-tap="day"][data-date="2026-11-09"]'); return r ? r.innerText.replace(/\s+/g, ' ').trim() : null; });
    check('All dates: "Mon 9 Nov · 1 person paid ahead · ₵60"', row === 'Mon 9 Nov 1 person paid ahead ₵60 ›', row);
    await a.shot(path.join(OUT, 'payahead-alldates-390-dark.png'));
  });

  // ---------------------------------------------------------------- the player's page (admin): Payment history + Pay ahead
  await step('player page', async () => {
    await p.evaluate(pid => App.go('ref.player', { pid }), who.pid); await sleep(500);
    check('player page: the row reads "Payment history" (was "Subs")', /^Payment history/.test(await txt(p, '[data-tap="ed-subs"]') || ''), await txt(p, '[data-tap="ed-subs"]'));
    await click(p, '[data-tap="ed-subs"]');
    const rows = await p.$$eval('.sh-admin-subs .r', l => l.map(r => r.innerText.replace(/\s+/g, ' ').trim()));
    check('admin Payment history title + "Mon 9 Nov Paid ahead ₵60"', (await txt(p, '.sh-admin-subs .sheet-title')) === `Payment history · ${who.name}` && rows.some(x => x.startsWith('Mon 9 Nov Paid ahead ₵60')), rows.slice(0, 5));
    check('… and older paid dates keep their words (no "Paid ahead" before today)', rows.filter(x => /Paid ahead/.test(x)).length === 4, rows.filter(x => /Paid ahead/.test(x)));
    await p.evaluate(() => UI.sheet.closeAll()); await sleep(200);
    await click(p, '[data-tap="ed-ahead"]');
    check('Pay ahead from their page skips "who?" (straight to weeks)', (await txt(p, '.sheet .sheet-title')) === 'Pay ahead' && !(await p.$('.sheet [data-tap="ah-pick"]')) && (await txt(p, '.sheet .adm-ah-row .nm')) === 'Weeks');
    for (let i = 0; i < 2; i++) await click(p, '.sheet [data-tap="ah-dn"]', 80);
    check('1 week: 9, 16, 23, 30 Nov are paid, so it is Mon 7 Dec, and it says what was skipped', (await txt(p, '.sheet [data-ah-dates]')) === 'Mon 7 Dec' && /^Skipped 9 Nov, 16 Nov, 23 Nov, 30 Nov/.test(await txt(p, '.sheet .adm-ah-skip') || ''), await txt(p, '.sheet .adm-ah-skip'));
    await click(p, '.sheet [data-tap="ah-save"]', 50); await waitSaved(p); await sleep(200);
    check('saved 7 Dec', await p.evaluate(pid => BF_PAY.amount(pid, '2026-12-07') === 60, who.pid));
    await p.click('#app-undo [data-act="undo"]'); await sleep(600);
    check('Undo takes it all back (7 Dec gone, nothing left behind)', await p.evaluate(() => !(Store.state.paymentDays || {})['2026-12-07']));
  });

  // ---------------------------------------------------------------- 1280 wide: the entry and the sheet
  const state = await p.evaluate(() => JSON.parse(JSON.stringify(Store.state)));
  check('admin: no console errors', !a.errors.length, a.errors.join(' | '));
  await a.close();
  await step('1280', async () => {
    const w = await H.open({ referee: 'admin', width: 1280, theme: 'light', now: NOW, data: state, route: '#/ref.money?all=1', latency: 40 });
    await click(w.page, '[data-tap="pay-ahead"]');
    await click(w.page, `.sheet [data-tap="ah-pick"][data-pid="${who.pid}"]`);
    check('1280: the sheet shows the next free dates (7, 14, 21 Dec) and the sum', (await txt(w.page, '.sheet [data-ah-dates]')) === 'Mon 7 Dec · 14 Dec · 21 Dec' && (await txt(w.page, '.sheet [data-ah-total]')) === '= ₵180');
    await w.shot(path.join(OUT, 'payahead-sheet-1280-light.png'));
    check('1280: no console errors', !w.errors.length, w.errors.join(' | '));
    await w.close();
  });

  // ---------------------------------------------------------------- the player's own Me › Payments (a status), 390 and 320 wide
  for (const width of [390, 320]) {
    await step(`me ${width}`, async () => {
      const m = await H.open({ viewer: who.pid, width, theme: 'dark', now: NOW, data: state, route: '#/player.me', latency: 40 });
      const card = await m.page.$eval('.pl-subs', b => {
        const g = b.querySelector('.grow'), o = b.querySelector('.pl-owe'), r = b.getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(g).lineHeight) || 20;
        return { t: b.innerText.replace(/\s+/g, ' ').trim(), wide: b.scrollWidth > b.clientWidth + 1, oneLine: g.getBoundingClientRect().height <= lh * 1.5,
          inside: o ? o.getBoundingClientRect().right <= r.right && o.getBoundingClientRect().left >= g.getBoundingClientRect().right - 1 : false, page: document.documentElement.scrollWidth <= innerWidth };
      });
      check(`[${width}] Me card: "Payments · Owes · see the admin" (paid ahead, but 2 dates still owed) fits on one line, nothing spills`, card.t === 'Payments Owes · see the admin' && !card.wide && card.oneLine && card.inside && card.page, card);
      check(`[${width}] Me: no dates or amounts, and the card opens nothing`, !(await m.page.evaluate(() => /₵|not paid|Paid ahead/i.test(document.getElementById('app-screen').innerText) || !!document.querySelector('.pl-subs[data-tap]'))));
      await m.shot(path.join(OUT, `me-payments-status-${width}-dark.png`));
      check(`[${width}] no console errors`, !m.errors.length, m.errors.join(' | '));
      await m.close();
    });
  }

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
