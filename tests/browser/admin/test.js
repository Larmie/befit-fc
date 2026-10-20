// Admin area test, round 5 design (TEST MODE ONLY via the harness: in-memory copy of the snapshot, Firebase blocked).
const path = require('path');
const H = require('../harness.js');
const OUT = H.out(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const check = (label, ok, extra) => { ok ? passes++ : fails++; console.log(ok ? 'ok  ' : 'FAIL', label, extra !== undefined && !ok ? JSON.stringify(extra) : ''); };
const screenId = p => p.evaluate(() => document.querySelector('#app-screen section')?.dataset.screen);
const click = async (p, sel) => { await p.$eval(sel, e => e.click()); await sleep(250); };
const hold = async (p, sel) => {
  await p.$eval(sel, e => e.scrollIntoView({ block: 'center' })); await sleep(100);
  const b = await (await p.$(sel)).boundingBox();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await sleep(2300); await p.mouse.up(); await sleep(400);
};
// Types one key at a time; after each key the field must still have focus and the full text.
const typeKeepsFocus = async (p, sel, text, midway) => {
  await p.focus(sel); let ok = true;
  for (let i = 0; i < text.length; i++) {
    await p.keyboard.type(text[i]); await sleep(60);
    if (midway && i === 1) { await p.evaluate(midway); await sleep(250); }
    const st = await p.evaluate(s => ({ focus: document.activeElement === document.querySelector(s), val: document.querySelector(s) && document.querySelector(s).value }), sel);
    if (!st.focus || st.val !== text.slice(0, i + 1)) ok = false;
  }
  return ok;
};
const KEYS = ['pts', 'g', 'a', 'sv', 'apps', 'y', 'r'];
const same = (x, y) => KEYS.every(k => x[k] === y[k]);
const canon = v => v && typeof v === 'object' ? (Array.isArray(v) ? v.map(canon) : Object.keys(v).sort().reduce((o, k) => (o[k] = canon(v[k]), o), {})) : v;
const pay = async (p, pid, v) => { if (!(await p.$(`.adm-pi.open [data-tap="row"][data-pid="${pid}"]`))) await click(p, `[data-tap="row"][data-pid="${pid}"]`); await click(p, `.adm-quick [data-tap="set"][data-v="${v}"]`); };
const PING = () => Store.set('sessions/-Oz8393enopc2awvN6-n/zzPing', Math.random());

(async () => {
  const snap = H.snapshot();
  const D = '2026-09-07';
  const orig = Object.entries(snap.paymentDays[D].payments).filter(([, r]) => r.amount > 0).map(([pid, r]) => ({ pid, amount: r.amount, name: snap.players[pid].name }));
  console.log('7 Sep paid in the snapshot:', orig.map(o => `${o.name} ${o.amount}`).join(', '));

  const s = await H.open({ width: 390, theme: 'dark', referee: true, route: '#/ref.moneyDay?date=' + D });
  const p = s.page;

  // ---------------------------------------------------------------- 1. the 7 Sep register as stored
  const sum0 = await p.evaluate(d => __BEFIT_ADMIN__.daySummary(d), D);
  check('7 Sep stored: ₵360, 5 of 21 who played', sum0.total === 360 && sum0.paidPlayed === 5 && sum0.played === 21, sum0);
  check('register opens on "To collect" with 16 rows', await p.evaluate(() => document.querySelector('[data-chips="reg-tab"] .on').dataset.value === 'unpaid' && document.querySelectorAll('[data-part="rows"] .adm-pay').length === 16));
  check('the page has the Tonight · All dates switch (All dates on for 7 Sep)', await p.evaluate(() => document.querySelector('[data-seg="money-view"] .on').dataset.value === 'all'));
  check('hero reads ₵360 of 21 who played · 5 of 21 paid · 16 to collect', await p.evaluate(() => { const t = document.querySelector('[data-part="top"]').textContent; return t.includes('₵360') && t.includes('of 21 who played') && t.includes('5 of 21 paid') && t.includes('16 to collect'); }));
  await s.shot(path.join(OUT, 'register-7sep-390-dark.png'));

  // ---------------------------------------------------------------- 2. clear the record with a hold (in ⋯)
  await p.$eval('.adm-clear .hold', e => e.scrollIntoView({ block: 'center' })); await sleep(150);
  await s.shot(path.join(OUT, 'register-clear-390-dark.png'));
  const w0 = await p.evaluate(() => Store.test.writes.length);
  { const b = await (await p.$('.adm-clear .hold')).boundingBox(); await p.mouse.move(b.x + 20, b.y + 20); await p.mouse.down(); await sleep(600); await p.mouse.up(); await sleep(300); }
  check('a short press does not clear', await p.evaluate(d => !!Store.state.paymentDays[d], D));
  await hold(p, '.adm-clear .hold');
  const clearW = await p.evaluate(n => Store.test.writes.slice(n), w0);
  check('hold clears paymentDays/2026-09-07 (one write)', clearW.length === 1 && JSON.stringify(clearW[0].updates) === JSON.stringify({ ['paymentDays/' + D]: null }), clearW.map(w => w.updates));
  const sum1 = await p.evaluate(d => __BEFIT_ADMIN__.daySummary(d), D);
  check('after clear: ₵0, not entered, still 21 played', sum1.total === 0 && !sum1.entered && sum1.played === 21, sum1);

  // ---------------------------------------------------------------- 3. mark the same 5 paid again (4 × 60 + 1 × 120)
  await sleep(300);
  for (const o of orig) {
    await pay(p, o.pid, o.amount);                                          // tap the row → 60 · 120 · Other inline
    if (o.amount !== 60) await s.shot(path.join(OUT, 'amount-inline-390-dark.png'));
  }
  const bar = await p.evaluate(() => document.querySelector('.adm-savebar') && document.querySelector('.adm-savebar').textContent.replace(/\s+/g, ' ').trim());
  check('save bar: "Save 5 · +₵360" with Cancel and Save', (bar || '') === 'Save 5 · +₵360CancelSave', bar);
  check('rows stay in "To collect" until saved, 5 show an amount', await p.evaluate(() => document.querySelectorAll('[data-part="rows"] .adm-amtv').length === 5 && document.querySelectorAll('[data-part="rows"] .adm-pay').length === 21));
  await s.shot(path.join(OUT, 'register-draft-390-dark.png'));

  // "Other" amount: typing never loses focus, then set it back to 60
  const other = orig[0].pid;
  if (!(await p.$(`.adm-pi.open [data-tap="row"][data-pid="${other}"]`))) await click(p, `[data-tap="row"][data-pid="${other}"]`);
  await click(p, '.adm-quick [data-tap="other"]');
  check('typing an amount keeps focus (even when data changes mid-typing)', await typeKeepsFocus(p, '.adm-panel [data-other]', '45', PING));
  await s.shot(path.join(OUT, 'amount-other-390-dark.png'));
  await click(p, '.adm-panel [data-tap="use"]');
  check('other amount 45 lands in the draft', await p.evaluate(pid => document.querySelector(`[data-tap="row"][data-pid="${pid}"]`).textContent.includes('₵45'), other));
  await pay(p, other, 60);

  const w1 = await p.evaluate(() => Store.test.writes.length);
  await click(p, '[data-tap="pay-save"]'); await sleep(600);
  const payW = await p.evaluate(n => Store.test.writes.slice(n), w1);
  const keys = payW.length === 1 ? Object.keys(payW[0].updates) : [];
  const payKeys = keys.filter(k => k.includes('/payments/'));
  check('one atomic write, only the 5 changed people (no zeros for others)', payW.length === 1 && payKeys.length === 5 && keys.length === 8, keys);
  check('each record = { amount, updatedAt, by }', payKeys.every(k => { const r = payW[0].updates[k]; return r.amount > 0 && r.updatedAt && r.by; }));
  const sum2 = await p.evaluate(d => __BEFIT_ADMIN__.daySummary(d), D);
  check('7 Sep after save: ₵360 = 60+60+60+120+60, 5 of 21 who played', sum2.total === 360 && sum2.paidPlayed === 5 && sum2.played === 21 && sum2.paid === 5, sum2);
  check('register now says 16 to collect', await p.evaluate(() => document.querySelector('[data-part="top"]').textContent.includes('16 to collect')));
  const ov = await p.evaluate(() => { const o = __BEFIT_ADMIN__.moneyOverview(); return { total: o.total, first: o.first, last: o.last, missing: o.missing.length, days: o.tracked.filter(r => r.entered).map(r => r.date + ':' + r.total) }; });
  check('Collected reconciles: ₵3,620 = 360+460+900+580+360+960', ov.total === 3620 && ov.days.length === 6, ov);
  console.log('     collected by day:', ov.days.join('  '));
  // edit an amount to 120 after saving
  await click(p, '[data-chips="reg-tab"] [data-value="paid"]');
  const sixty = orig.find(o => o.amount === 60).pid;
  await pay(p, sixty, 120);
  check('editing 60 → 120 shows "Save 1 · +₵60"', await p.evaluate(() => document.querySelector('.adm-savebar').textContent.replace(/\s+/g, ' ').includes('Save 1 · +₵60')));
  const w2 = await p.evaluate(() => Store.test.writes.length);
  await click(p, '[data-tap="pay-save"]'); await sleep(600);
  const editW = await p.evaluate(n => Store.test.writes.slice(n), w2);
  check('amount edit writes one record with amount 120', editW.length === 1 && editW[0].updates[`paymentDays/${D}/payments/${sixty}`].amount === 120);
  check('7 Sep total now ₵420', (await p.evaluate(d => __BEFIT_ADMIN__.daySummary(d).total, D)) === 420);
  await s.shot(path.join(OUT, 'register-saved-undo-390-dark.png'));
  await click(p, '#app-undo [data-act="undo"]'); await sleep(600);
  check('Undo restores ₵360', (await p.evaluate(d => __BEFIT_ADMIN__.daySummary(d).total, D)) === 360);
  console.log('PAYMENT WRITE', JSON.stringify(payW[0].updates));

  // search on "All" keeps focus while typing (and a data change arrives mid-typing)
  // Cancel: pick an amount, then Cancel → nothing written, bar gone
  const wc = await p.evaluate(() => Store.test.writes.length);
  await pay(p, sixty, 120);
  const hadBar = await p.evaluate(() => !!document.querySelector('.adm-savebar'));
  await click(p, '[data-tap="pay-cancel"]');
  check('Cancel after picking: nothing written, save bar gone, total still ₵360', hadBar && (await p.evaluate(n => Store.test.writes.length === n && !document.querySelector('.adm-savebar'), wc)) && (await p.evaluate(d => __BEFIT_ADMIN__.daySummary(d).total, D)) === 360);
  await click(p, '[data-chips="reg-tab"] [data-value="all"]');
  check('register search keeps focus while typing + data change', await typeKeepsFocus(p, '[data-search="reg"]', 'chri', PING));
  const hits = await p.$$eval('[data-part="rows"] .adm-pay > .grow > .nm', e => e.map(x => x.textContent));
  check('register search filters (chri)', hits.length >= 2 && hits.every(h => /chri/i.test(h)), hits);

  // ---------------------------------------------------------------- 4. Money tab: tonight + list
  await s.go('#/ref.money'); await sleep(300);
  check('Money tab opens on Tonight: ₵0 of ₵1,080 (18 × ₵60), 0 of 18 paid', await p.evaluate(() => { const t = document.querySelector('[data-part="top"]').textContent; return document.querySelector('[data-seg="money-view"] .on').dataset.value === 'tonight' && t.includes('of ₵1,080') && t.includes('0 of 18 paid'); }));
  check('tonight chips: To collect / Paid / Everyone', await p.evaluate(() => [...document.querySelectorAll('[data-chips="reg-tab"] button')].map(b => b.childNodes[0].textContent.trim()).join('|') === 'To collect|Paid|Everyone'));
  const tonightPids = await p.evaluate(() => [...__BEFIT_ADMIN__.playedOn('2026-10-19').keys()]);
  for (const pid of tonightPids) await pay(p, pid, 60);
  await sleep(200);
  check('tonight save bar: Save 18 · +₵1,080 (18 × 60)', await p.evaluate(() => document.querySelector('.adm-savebar').textContent.replace(/\s+/g, ' ').includes('Save 18 · +₵1,080')));
  await click(p, '[data-tap="pay-save"]'); await sleep(700);
  check('"Everyone’s paid" · ₵1,080 · 18 paid', await p.evaluate(() => { const t = document.querySelector('[data-part="top"]').textContent; return t.includes('Everyone’s paid') && t.includes('₵1,080') && t.includes('18 paid'); }));
  await s.shot(path.join(OUT, 'money-tonight-allpaid-390-dark.png'));
  await click(p, '#app-undo [data-act="undo"]'); await sleep(600);
  check('Undo tonight → back to 0 of 18', (await p.evaluate(() => __BEFIT_ADMIN__.daySummary('2026-10-19').paidPlayed)) === 0);
  await click(p, '[data-seg="money-view"] [data-value="all"]');
  check('"All dates" (on the page) shows the list', await p.evaluate(() => !!document.querySelector('.adm-collected')));
  const listTxt = await p.evaluate(() => document.querySelector('#app-screen').textContent);
  check('list: "6 match days not entered", "5 of 21 paid", "not entered", never ₵0.00', listTxt.includes('6 match days not entered') && listTxt.includes('5 of 21 paid') && listTxt.includes('not entered') && !listTxt.includes('₵0.00'));
  await click(p, '[data-tap="add-date"]');
  check('+ Date opens a date sheet', await p.evaluate(() => !!document.querySelector('.sh-admin-date [data-newdate]')));
  await p.keyboard.press('Escape'); await sleep(200);

  // ---------------------------------------------------------------- 5. Squad: search, duplicates, merge (on this in-memory copy)
  await s.go('#/ref.squad'); await sleep(300);
  const chipTxt = await p.$$eval('[data-chips="sq-f"] button', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' · '));
  check('filter chips: All 76 · Green · Red · New 9 · Owes 24 · Twice 4', chipTxt === 'All 76 · Green · Red · New 9 · Owes 24 · Twice 4', chipTxt);
  check('owes tags: one per player who owes (BF_PAY.owed), 24', (await p.$$eval('[data-part="list"] .adm-owes', e => e.length)) === 24 && (await p.evaluate(() => Object.keys(Store.players()).filter(k => BF_PAY.owed(k).length).length)) === 24);
  check('squad search keeps focus while typing + data change', await typeKeepsFocus(p, '[data-search="squad"]', 'fred', PING));
  check('squad search shows the 2 Freds', (await p.$$eval('[data-part="list"] [data-tap="open"]', e => e.length)) === 2);
  await p.$eval('[data-search="squad"]', e => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); e.blur(); });
  await sleep(400);
  await click(p, '[data-chips="sq-f"] [data-value="twice"]');
  const groups = await p.$$eval('.adm-dups .lbl', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  check('Review lists Chris ×2, Frankie ×2, Fred ×2, New francis guy ×3', JSON.stringify(groups) === JSON.stringify(['Chris ×2', 'Frankie ×2', 'Fred ×2', 'New francis guy ×3']), groups);
  await s.shot(path.join(OUT, 'squad-twice-390-dark.png'));

  const before = await p.evaluate(() => {
    const t = {}; for (const pid of Object.keys(Store.state.players)) t[pid] = Scoring.seasonStats(pid);
    return { t, pay: __BEFIT_ADMIN__.moneyOverview().total, standings: JSON.stringify(Scoring.teamStandings()), state: Store.state };
  });
  async function mergeGroup(name) {
    if (!(await p.$('.adm-dups'))) await click(p, '[data-chips="sq-f"] [data-value="twice"]');
    await click(p, `.adm-dups [data-tap="dup-merge"][data-name="${name}"]`);
    const info = await p.evaluate(() => ({ keep: document.querySelector('.sh-admin-merge .tick-on').closest('[data-pid]').dataset.pid, disabled: document.querySelector('[data-tap="do-merge"]').disabled }));
    const wN = await p.evaluate(() => Store.test.writes.length);
    await s.shot(path.join(OUT, `merge-${name.replace(/\s/g, '')}-390-dark.png`));
    await click(p, '.sh-admin-merge [data-tap="do-merge"]'); await sleep(600);
    const w = await p.evaluate(n => Store.test.writes.slice(n), wN);
    return { info, w };
  }
  const sumOf = pids => KEYS.reduce((o, f) => (o[f] = pids.reduce((s2, k) => s2 + before.t[k][f], 0), o), {});
  const fredPids = Object.entries(snap.players).filter(([, x]) => x.name.trim().toLowerCase() === 'fred').map(([k]) => k);
  const m1 = await mergeGroup('Fred');
  const keepF = m1.info.keep, dropF = fredPids.find(x => x !== keepF);
  const afterF = await p.evaluate(k => Scoring.seasonStats(k), keepF);
  check('Fred merge: one atomic write', m1.w.length === 1, m1.w.length);
  check(`Fred merge: totals = Fred A + Fred B via Scoring`, same(afterF, sumOf(fredPids)), { a: before.t[keepF], b: before.t[dropF], after: afterF });
  console.log(`     Fred: ${before.t[keepF].apps} apps ${before.t[keepF].pts} pts + ${before.t[dropF].apps} apps ${before.t[dropF].pts} pts → ${afterF.apps} apps ${afterF.pts} pts`);
  check('Fred merge: duplicate gone, no references left', await p.evaluate(d => !Store.state.players[d] && !JSON.stringify(Store.state.sessions).includes(d) && !JSON.stringify(Store.state.paymentDays).includes(d), dropF));
  const others = await p.evaluate(skip => Object.keys(Store.state.players).filter(pid => !skip.includes(pid)).map(pid => [pid, Scoring.seasonStats(pid)]), fredPids);
  check('every other player’s totals unchanged', others.every(([pid, st]) => JSON.stringify(st) === JSON.stringify(before.t[pid])));
  check('team standings unchanged', (await p.evaluate(() => JSON.stringify(Scoring.teamStandings()))) === before.standings);
  check('collected money unchanged', (await p.evaluate(() => __BEFIT_ADMIN__.moneyOverview().total)) === before.pay);
  console.log('MERGE WRITE (Fred)', JSON.stringify(m1.w[0].updates));
  await click(p, '#app-undo [data-act="undo"]'); await sleep(700);
  check('Undo merge restores the database exactly (every key and value)', JSON.stringify(canon(await p.evaluate(() => Store.state))) === JSON.stringify(canon(before.state)));

  await s.go('#/ref.squad'); await sleep(300);
  const nfg = Object.entries(snap.players).filter(([, x]) => x.name === 'New francis guy').map(([k]) => k);
  const m2 = await mergeGroup('New francis guy');
  const nfgAfter = await p.evaluate(k => Scoring.seasonStats(k), m2.info.keep);
  check('New francis guy ×3 → 1, totals = sum of all three', same(nfgAfter, sumOf(nfg)), { nfgAfter, exp: sumOf(nfg) });
  check('two of them removed', (await p.evaluate(ids => ids.filter(i => Store.state.players[i]).length, nfg)) === 1);
  console.log('MERGE WRITE (New francis guy)', JSON.stringify(m2.w[0].updates));
  await s.go('#/ref.squad'); await sleep(300);
  const chris = Object.entries(snap.players).filter(([, x]) => x.name === 'Chris').map(([k]) => k);
  const m3 = await mergeGroup('Chris');
  const chAfter = await p.evaluate(k => Scoring.seasonStats(k), m3.info.keep);
  check('Chris ×2 (one with carryover) → totals preserved', same(chAfter, sumOf(chris)), { chAfter, exp: sumOf(chris) });
  console.log(`     Chris: ${chris.map(k => before.t[k].pts).join(' + ')} = ${chAfter.pts} pts`);
  console.log('MERGE WRITE (Chris)', JSON.stringify(m3.w[0].updates));
  const allPts = await p.evaluate(() => Object.keys(Store.state.players).reduce((s2, k) => s2 + Scoring.seasonStats(k).pts, 0));
  const allPtsBefore = Object.values(before.t).reduce((s2, x) => s2 + x.pts, 0);
  check('sum of every season total unchanged after 2 merges', allPts === allPtsBefore, { allPts, allPtsBefore });
  await s.go('#/ref.squad'); await sleep(300);
  check('Twice chip now shows 2 (Fred, Frankie left)', await p.evaluate(() => (document.querySelector('[data-chips="sq-f"] [data-value="twice"]') || {}).textContent.replace(/\s+/g, ' ').trim() === 'Twice 2'));
  const conflict = await p.evaluate(() => { const s2 = Object.values(Store.state.sessions).find(x => x.mode === 'live' && x.teams && x.teams.green); const ids = Object.keys(s2.teams.green.players); return __BEFIT_ADMIN__.planMerge([ids[0]], ids[1]).conflicts.length; });
  check('merge refuses two people who played the same match', conflict >= 1);

  // ---------------------------------------------------------------- 6. edit a player, delete with a hold
  await s.go('#/ref.player?pid=seed_p032'); await sleep(300);
  await click(p, '[data-tap="ed-name"]');
  await p.$eval('.sheet [data-ed-name]', e => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
  check('name field (sheet) keeps focus while typing + data change', await typeKeepsFocus(p, '.sheet [data-ed-name]', 'Chris R', PING));
  await click(p, '.sheet [data-tap="ed-save"]'); await sleep(500);
  await click(p, '[data-seg="ed-pos"] [data-value="DEF"]'); await sleep(500);
  const ch = await p.evaluate(() => Store.state.players.seed_p032);
  check('edit player: name + position saved', ch.name === 'Chris R' && ch.defaultPosition === 'DEF', ch);
  await s.shot(path.join(OUT, 'player-edit-390-dark.png'));
  const victim = Object.entries(snap.players).find(([, x]) => x.name === 'Frankie')[0];
  await s.go('#/ref.player?pid=' + victim); await sleep(300);
  await hold(p, '.hold[data-hold="ed-delete"]');
  check('hold deletes the player and returns to Squad', !(await p.evaluate(v => !!Store.state.players[v], victim)) && (await screenId(p)) === 'ref.squad');

  // ---------------------------------------------------------------- 7. Log a past game (post mode)
  await s.go('#/ref.pastGame'); await sleep(300);
  await p.$eval('[data-pg-date]', e => { e.value = '2026-08-10'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(150);
  const pickBy = async name => {
    await p.$eval('[data-search="pg"]', (e, n) => { e.value = n; e.dispatchEvent(new Event('input', { bubbles: true })); }, name); await sleep(100);
    const pid = await p.evaluate(n => { const b = [...document.querySelectorAll('[data-tap="pg-add"]')].find(x => x.querySelector('.nm').textContent === n); return b && b.dataset.pid; }, name);
    await click(p, `[data-tap="pg-add"][data-pid="${pid}"]`); return pid;
  };
  const g1 = await pickBy('Harry'), g2 = await pickBy('Toby'), g3 = await pickBy('Sosa');
  await click(p, '[data-seg="pg-team"] [data-value="red"]');
  const r1 = await pickBy('Emmanuel'), r2 = await pickBy('Mike'), r3 = await pickBy('Barnabas');
  const setStat = async (pid, k, n, pos) => {
    await click(p, `[data-tap="pg-edit"][data-pid="${pid}"]`);
    if (pos) await click(p, `.sh-admin-stats [data-seg="pg-pos"] [data-value="${pos}"]`);
    for (let i = 0; i < n; i++) await click(p, `.sh-admin-stats [data-tap="pg-inc"][data-k="${k}"]`);
    if (pid === g2) await s.shot(path.join(OUT, 'pastgame-stats-sheet-390-dark.png'));
    await click(p, '.sh-admin-stats [data-tap="pg-done"]');
  };
  await setStat(r1, 'goals', 1);
  await click(p, '[data-seg="pg-team"] [data-value="green"]');
  await setStat(g1, 'goals', 2); await setStat(g3, 'assists', 1); await setStat(g2, 'saves', 4, 'GK');
  await p.$eval('[data-search="pg"]', e => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await s.shot(path.join(OUT, 'pastgame-filled-390-dark.png'));
  const ids6 = [g1, g2, g3, r1, r2, r3];
  const ptsBefore = await p.evaluate(ids => ids.map(i => Scoring.seasonStats(i).pts), ids6);
  const wP = await p.evaluate(() => Store.test.writes.length);
  await click(p, '[data-tap="pg-save"]'); await sleep(700);
  const pastW = await p.evaluate(n => Store.test.writes.slice(n), wP);
  const sessPath = Object.keys(pastW[0].updates)[0], sess = pastW[0].updates[sessPath];
  check('past game: one write of a post-mode completed session', pastW.length === 1 && sess.mode === 'post' && sess.status === 'completed' && sess.date === '2026-08-10');
  check('past game: goals Green 2 – Red 1, no clean sheets', sess.goals.green === 2 && sess.goals.red === 1 && sess.cleanSheets.green === false && sess.cleanSheets.red === false, sess.goals);
  check('past game: keeper stats stored like classic', sess.teams.green.players[g2].position === 'GK' && sess.playerStats[g2].saves === 4 && sess.playerStats[g2].conceded === 0);
  const mp = await p.evaluate((sp, ids) => { const se = Store.state.sessions[sp.split('/')[1]]; return ids.map(i => Scoring.matchPoints(se, i).total); }, sessPath, ids6);
  const ptsAfter = await p.evaluate(ids => ids.map(i => Scoring.seasonStats(i).pts), ids6);
  check('past game points via Scoring: Harry FWD 2+8=10, Toby GK 2+1=3, Sosa 2+3=5, Emmanuel MID 2+5=7, Mike 2, Barnabas 2', mp[0] === 10 && mp[1] === 3 && mp[2] === 5 && mp[3] === 7 && mp[4] === 2 && mp[5] === 2, mp);
  console.log('     match points', JSON.stringify(mp));
  check('season totals rise by exactly those points', ptsAfter.every((v, i) => v === ptsBefore[i] + mp[i]), { ptsBefore, ptsAfter });
  check('back on admin Home after saving', (await screenId(p)) === 'admin.home');
  console.log('PAST GAME WRITE', sessPath, JSON.stringify(sess));

  // ---------------------------------------------------------------- 8. offline → queued writes → online
  await s.go('#/ref.moneyDay?date=2026-10-12'); await sleep(300);
  await p.evaluate(() => Store.test.setStatus('offline')); await sleep(200);
  const bar1 = await p.evaluate(() => document.querySelector('#app-status').textContent.replace(/\s+/g, ' ').trim());
  check('offline bar: "Offline · last updated hh:mm" + Retry', /^Offline · last updated \d\d:\d\d\s?Retry$/.test(bar1), bar1);
  await s.shot(path.join(OUT, 'offline-bar-390-dark.png'));
  const firstTwo = await p.evaluate(() => [...__BEFIT_ADMIN__.playedOn('2026-10-12').keys()].slice(0, 2));
  for (const pid of firstTwo) await pay(p, pid, 60);
  await click(p, '[data-tap="pay-save"]'); await sleep(400);
  const bar2 = await p.evaluate(() => document.querySelector('#app-status').textContent.replace(/\s+/g, ' ').trim());
  check('admin sees "Offline · 1 waiting to send"', bar2.includes('Offline · 1 waiting to send'), bar2);
  check('the phone shows the amounts already (₵120)', (await p.evaluate(() => __BEFIT_ADMIN__.daySummary('2026-10-12').total)) === 120);
  await s.shot(path.join(OUT, 'offline-waiting-390-dark.png'));
  await click(p, '#app-status [data-offline-retry]');
  check('Retry while still offline keeps the bar', await p.evaluate(() => document.querySelector('#app-status').textContent.includes('Offline')));
  await sleep(400);
  // Outbox: kept on the phone, so no "Not saved · no signal" any more; it waits in the outbox instead.
  check('offline save: no error bar, still "1 waiting to send"', await p.evaluate(() => !document.querySelector('#app-undo .undo.err') && document.querySelector('#app-status').textContent.includes('1 waiting to send')));
  await s.shot(path.join(OUT, 'offline-notsaved-390-dark.png'));
  await p.evaluate(() => Store.test.setStatus('online')); await sleep(700);
  check('back online: bar gone, nothing waiting', await p.evaluate(() => document.querySelector('#app-status').textContent.trim() === '' && Store.status().pending === 0));
  check('queued save lands (orange bar flips to saved)', await p.evaluate(() => !document.querySelector('#app-undo .undo.err')));
  await p.evaluate(() => App.screens['app.offline'].render(document.getElementById('app-status'), { status: 'offline', source: 'none', savedAt: 0, pending: 0, store: Store }));
  check('first load, no data: full-screen "Can’t connect" + Retry', await p.evaluate(() => !!document.querySelector('.adm-nodata') && document.querySelector('.adm-nodata').textContent.includes('Can’t connect')));
  await s.shot(path.join(OUT, 'cant-connect-390-dark.png'));
  await p.evaluate(() => App.screens['app.offline'].render(document.getElementById('app-status'), Object.assign({ store: Store }, Store.status())));

  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
