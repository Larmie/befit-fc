// Money on the night (flow 7), round 5 inline amounts: late arrivals + keepers tagged, Everyone's paid with before/after kick-off. TEST MODE ONLY.
const path = require('path');
const H = require('../harness.js');
const OUT = H.out(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const check = (l, ok, x) => { ok ? passes++ : fails++; console.log(ok ? 'ok  ' : 'FAIL', l, !ok && x !== undefined ? JSON.stringify(x) : ''); };

(async () => {
  const data = H.snapshot();
  const [sid, sess] = Object.entries(data.sessions).find(([, s]) => s.date === '2026-10-19');
  const green = Object.keys(sess.teams.green.players), red = Object.keys(sess.teams.red.players);
  const name = pid => data.players[pid].name;
  sess.teams.green.players[green[0]].arrived = { at: 23 };
  sess.teams.red.players[red[0]].arrived = { at: 25 };
  sess.teams.red.players[red[1]].moved = { from: 'green', at: 27 };
  sess.format = { start: 'small', switchedAt: 46, keepers: { green: green[1], red: red[2] } };
  const kick = sess.timer && sess.timer.startedAt;
  console.log('19 Oct kick-off', kick ? new Date(kick).toISOString() : 'none');

  for (const [width, theme] of [[390, 'dark'], [390, 'light'], [1280, 'dark']]) {
    const s = await H.open({ width, theme, referee: true, route: '#/ref.money', data });
    const p = s.page, tag = `${width}-${theme}`;
    const tagOf = pid => p.evaluate(id => { const b = document.querySelector(`[data-tap="row"][data-pid="${id}"]`); return b ? b.querySelector('.adm-sub').textContent.replace(/\s+/g, ' ').trim() : null; }, pid);
    check(`[${tag}] ${name(green[0])}: "Green arrived 23'"`, (await tagOf(green[0])) === "Greenarrived 23'", await tagOf(green[0]));
    check(`[${tag}] ${name(red[0])}: "Red arrived 25'"`, (await tagOf(red[0])) === "Redarrived 25'", await tagOf(red[0]));
    check(`[${tag}] ${name(green[1])}: "Green keeper · 46'"`, (await tagOf(green[1])) === "Greenkeeper · 46'", await tagOf(green[1]));
    check(`[${tag}] moved player shows tonight's side (Red)`, (await tagOf(red[1])) === 'Red', await tagOf(red[1]));
    await s.shot(path.join(OUT, `money-tonight-tags-${tag}.png`));
    if (tag === '390-dark') {
      // 10 pay before kick-off, the rest after: set the clock, then pay
      const all = [...green, ...red];
      const before = all.slice(0, 10), after = all.slice(10);
      await p.evaluate((k, ids) => {
        const now = k - 15 * 60000, u = {};
        ids.forEach(id => { u[`paymentDays/2026-10-19/payments/${id}`] = { amount: 60, updatedAt: now, by: 'reuben@befit.club' }; });
        u['paymentDays/2026-10-19/date'] = '2026-10-19';
        return Store.multi(u);
      }, kick, before);
      await sleep(300);
      check('10 of 18 paid, 8 to collect', await p.evaluate(() => { const t = document.querySelector('[data-part="top"]').textContent; return t.includes('10 of 18 paid') && t.includes('8 to collect'); }));
      for (const id of after) { await p.$eval(`[data-tap="row"][data-pid="${id}"]`, e => e.click()); await sleep(60); await p.$eval(`.adm-quick [data-tap="set"][data-v="60"]`, e => e.click()); await sleep(60); }
      await sleep(150);
      check('save bar: Save 8 · +₵480', await p.evaluate(() => document.querySelector('.adm-savebar').textContent.replace(/\s+/g, ' ').includes('Save 8 · +₵480')));
      await p.$eval('[data-tap="pay-save"]', e => e.click()); await sleep(700);
      const top = await p.evaluate(() => document.querySelector('[data-part="top"]').textContent.replace(/\s+/g, ' '));
      check('Everyone’s paid: ₵1,080 · 18 paid = 10 before (₵600) + 8 after (₵480)', top.includes('Everyone’s paid') && top.includes('₵1,080 · 18 paid') && top.replace(/ /g,'').includes('Beforekick-off10·₵600') && top.replace(/ /g,'').includes('Afterthegame8·₵480'), top);
      check('Recorded by: reuben, referee', top.includes('Recorded by') && top.includes('reuben') && top.includes('referee'), top);
      await p.evaluate(() => document.getElementById('app-undo').innerHTML = '');
      await s.shot(path.join(OUT, 'money-tonight-everyonepaid-390-dark.png'));
    }
    check(`[${tag}] no console errors`, s.errors.length === 0, s.errors);
    await s.close();
  }
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
