// Phase 3 · one payments rule (js/core/pay.js) for Money AND Me › Subs. TEST MODE ONLY.
// Proves: 24 players owe, 40 dates in all (same as before the move), and every player's Me › Subs card and sheet
// show exactly BF_PAY.owed(pid) — for all players, not a sample.
const H = require('../harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const out = [];
const check = (l, ok, x) => { ok ? passes++ : fails++; const line = (ok ? 'ok   ' : 'FAIL ') + l + (x !== undefined ? '  ' + JSON.stringify(x) : ''); console.log(line); out.push(line); };
(async () => {
  const s = await H.open({ width: 390, theme: 'dark', viewer: 'seed_p002', route: '#/player.me' });
  const p = s.page;
  const r = await p.evaluate(() => {
    const owe = {}; for (const pid of Object.keys(Store.players())) { const l = BF_PAY.owed(pid); if (l.length) owe[pid] = l; }
    return { players: Object.keys(owe).length, dates: Object.values(owe).reduce((a, l) => a + l.length, 0), core: typeof BF_PAY.overview === 'function', where: [...document.scripts].map(x => x.getAttribute('src')).filter(Boolean) };
  });
  check('BF_PAY comes from js/core/pay.js, loaded before the screens', r.where.indexOf('js/core/pay.js') > -1 && r.where.indexOf('js/core/pay.js') < r.where.indexOf('js/screens/admin.js') && r.where.indexOf('js/core/pay.js') < r.where.indexOf('js/screens/player.js'), r.where);
  check('24 players owe at least one date', r.players === 24, r.players);
  check('40 owed dates in all', r.dates === 40, r.dates);
  // every player's Me › Subs (card + sheet) against the shared rule
  const res = await p.evaluate(async () => {
    const bad = []; let shown = 0, sheetDates = 0;
    for (const pid of Object.keys(Store.players())) {
      App.setViewer(pid); await new Promise(r => setTimeout(r, 40));
      const owed = BF_PAY.owed(pid);
      const card = (document.querySelector('.pl-subs') || {}).innerText || '';
      const t = card.replace(/\s+/g, ' ');
      const n = /(\d+) dates not paid/.test(t) ? Number(t.match(/(\d+) dates not paid/)[1]) : / not paid/.test(t) ? 1 : 0;
      if (n !== owed.length) bad.push(`${Store.player(pid).name}: card ${n}, rule ${owed.length}`);
      if (n) shown++;
      if (owed.length) {
        document.querySelector('.pl-subs').click(); await new Promise(r => setTimeout(r, 120));
        const rows = [...document.querySelectorAll('.sh-player-subs .r .pl-owe')].length;
        if (rows !== owed.length) bad.push(`${Store.player(pid).name}: sheet ${rows} "Not paid" rows, rule ${owed.length}`);
        sheetDates += rows;
        UI.sheet.closeAll(); await new Promise(r => setTimeout(r, 60));
      }
    }
    return { bad, shown, sheetDates };
  });
  check(`Me › Subs card agrees with the rule for every player (${res.shown} players flagged)`, res.bad.length === 0 && res.shown === 24, res.bad.slice(0, 5));
  check(`Me › Subs sheets list 40 "Not paid" dates in all`, res.sheetDates === 40, res.sheetDates);
  // Money's all-dates list agrees too
  const money = await p.evaluate(() => BF_PAY.overview().rows.reduce((a, d) => a + d.notPaid, 0));
  check('Money list "not paid" across all days = 40', money === 40, money);
  check('no console errors', !s.errors.length, s.errors);
  await s.close();
  // Phase C: the admin side reads the same rule: Needs you "Subs owed", and Squad › Owes
  const a = await H.open({ width: 390, theme: 'dark', referee: true, route: '#/admin.home' });
  const need = await a.page.evaluate(() => { const b = document.querySelector('[data-tap="need-owes"]'); return b ? b.innerText.replace(/\s+/g, ' ') : null; });
  check(`admin Needs you › Subs owed: "${need}" = ${r.players} players, ${r.dates} nights`, !!need && need.includes(`${r.players} players`) && need.includes(`for ${r.dates} nights`), need);
  await a.page.evaluate(() => App.go('ref.squad', { f: 'owes' })); await sleep(600);
  const sq = await a.page.evaluate(() => document.querySelectorAll('[data-part="list"] .adm-sq').length);
  check(`Squad › Owes lists the same ${r.players} players`, sq === r.players, sq);
  check('admin: no console errors', !a.errors.length, a.errors);
  await a.close();
  console.log(`\n${passes} passed, ${fails} failed`);
  require('fs').writeFileSync(require('path').join(H.out(__dirname), 'paycheck-result.txt'), out.join('\n') + `\n\n${passes} passed, ${fails} failed\n`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
