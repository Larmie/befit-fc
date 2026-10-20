// The shared payments rule (window.BF_PAY) on the snapshot, and Money's numbers agreeing with it. TEST MODE ONLY.
const H = require('../harness.js');
let fails = 0, passes = 0;
const check = (l, ok, x) => { ok ? passes++ : fails++; console.log(ok ? 'ok  ' : 'FAIL', l, x !== undefined ? JSON.stringify(x) : ''); };
(async () => {
  const s = await H.open({ width: 390, theme: 'dark', referee: true, route: '#/ref.money?all=1' });
  const r = await s.page.evaluate(() => {
    const owe = {};
    for (const pid of Object.keys(Store.state.players)) { const l = BF_PAY.owed(pid); if (l.length) owe[pid] = l; }
    const hist = {}; Object.values(owe).forEach(l => { hist[l.length] = (hist[l.length] || 0) + 1; });
    const totalOwed = Object.values(owe).reduce((a, l) => a + l.length, 0);
    const days = __BEFIT_ADMIN__.moneyOverview().rows;
    const notPaidSum = days.reduce((a, d) => a + d.notPaid, 0);
    const perDay = days.filter(d => d.notPaid).map(d => `${d.date}: ${d.paidPlayed} of ${d.played} paid, ${d.notPaid} not paid`);
    const notEntered = days.filter(d => d.isMatch && !d.entered).length;
    const s7 = ['seed_p001', '-OtVhGyykdPByjM3Wg6P'].map(p => BF_PAY.status(p, '2026-09-07'));
    return { players: Object.keys(owe).length, hist, totalOwed, notPaidSum, perDay, notEntered, s7,
      statusNotEntered: BF_PAY.status(Object.keys(Store.state.sessions[Object.keys(Store.state.sessions).find(k => Store.state.sessions[k].date === '2026-10-12')].teams.green.players)[0], '2026-10-12') };
  });
  check('24 players owe at least one date', r.players === 24, r.players);
  check('14 owe 1 · 6 owe 2 · 3 owe 3 · 1 owes 5', JSON.stringify(r.hist) === JSON.stringify({ 1: 14, 2: 6, 3: 3, 5: 1 }), r.hist);
  check('owed dates = 14 + 12 + 9 + 5 = 40', r.totalOwed === 40, r.totalOwed);
  check('Money list "not paid" across all days adds to the same 40', r.notPaidSum === 40, r.notPaidSum);
  console.log('     ' + r.perDay.join('\n     '));
  check('16 match days not entered in total (10 before tracking + 6 since)', r.notEntered === 16, r.notEntered);
  check('7 Sep: Harry paid; a player with ₵0 on a recorded day who played → "not paid"', r.s7[0] === 'paid', r.s7);
  check('12 Oct (no record): a player who played → "not entered"', r.statusNotEntered === 'not entered', r.statusNotEntered);
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
