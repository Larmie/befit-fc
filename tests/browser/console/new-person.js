// Console · "+ New person" in every "who" list (5 Nov, item 9), TEST MODE ONLY (harness: in-memory data, Firebase blocked).
//   Block · Green → + New person → "Kwabena" → + Green: he joins Green at the minute (9 + 1 check: a second tap), the block
//   is logged for him in the same go. Undo removes the block only. Goal · Red → + New person → an existing club member →
//   he joins Red, the sheet moves on to the assist → No assist → goal. Assist step → + New person → logs the assist.
//   Someone already on Red is tapped straight through (no second entry); someone on Green is not offered for Red.
//   Cancel = back to the list, nothing logged. Yellow lists show it too.
// Run: node tests/browser/console/new-person.js
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
  const sess = () => p.evaluate(sid => Store.session(sid), SID);
  const events = () => p.evaluate(sid => Object.entries(Store.session(sid).events || {}).map(([id, v]) => Object.assign({ id }, v)), SID);
  const teamOf = (se, pid) => Object.keys(se.teams).find(t => se.teams[t].players && se.teams[t].players[pid]) || null;
  const sheets = () => p.evaluate(() => document.querySelectorAll('#app-layer .sheet').length);
  const title = () => p.evaluate(() => { const a = document.querySelectorAll('#app-layer .sheet .sheet-title'); return a.length ? a[a.length - 1].textContent.trim() : null; });
  const bar = () => p.evaluate(() => { const b = document.querySelector('#app-undo .undo'); return b ? b.innerText.replace(/\s+/g, ' ').trim() : null; });
  const toast = () => p.evaluate(() => { const t = document.querySelector('#app-toast .toast'); return t ? t.textContent : null; });
  const click = async (sel, wait = 450) => { await p.waitForSelector(sel, { timeout: 4000 }); await p.evaluate(q => { const e = [...document.querySelectorAll(q)].pop(); e.scrollIntoView({ block: 'center' }); e.click(); }, sel); await sleep(wait); };
  const type = async text => { await p.type('.sh-setup-new [data-search="q"]', text); await sleep(300); };
  const closeTop = async () => { await p.keyboard.press('Escape'); await sleep(350); };
  const adv = min => p.evaluate(ms => { window.__BEFIT_TEST__.now += ms; }, min * 60000);
  const waitBarGone = () => p.waitForFunction(() => !document.querySelector('#app-undo .undo'), { timeout: 9000 }).catch(() => {});

  await click('[data-tap="ctl"][data-act="kick"]', 900);
  await adv(23); await sleep(1200);
  const s0 = await sess();
  const outG = Object.values(s0.teams.green.players).filter(e => e.position !== 'GK').length;

  // ---------------------------------------------------------------- Block · Green → a brand-new person
  await click('.cn-col[data-col="green"] [data-kind="block"]', 600);
  const rows = await p.$$eval('.sh-console-act .cn-list .rows > *', a => a.map(x => x.textContent.trim()));
  check('Block · Green: "+ New person" is the last row of the list', rows[rows.length - 1] === '+ New person', rows.slice(-2));
  await click('.sh-console-act [data-tap="newp"]', 600);
  check('it opens name entry for Green: "New person · Green"', (await title()) === 'New person · Green' && (await sheets()) === 2, await title());
  await type('Kwabena');
  check('…a new name offers only "+ Green" (that team)', (await p.$$eval('.sh-setup-new [data-tap="new"]', a => a.map(x => x.textContent).join(','))) === '+ Green');
  await click('.sh-setup-new [data-tap="new"][data-team="green"]', 700);
  if (outG >= 9) {
    check(`Green already has ${outG} outfield: the first tap asks again (9 + 1 per side)`, /tap again to add/.test((await toast()) || '') && (await sheets()) === 2, await toast());
    await click('.sh-setup-new [data-tap="new"][data-team="green"]', 1200);
  }
  const kw = await p.evaluate(() => (Object.entries(Store.players()).find(([, v]) => v.name === 'Kwabena') || [])[0]);
  let se = await sess();
  let evs = await events();
  const kb = evs.filter(e => e.type === 'block' && e.playerId === kw);
  check('Kwabena is a new club member (name only, needs details)', !!kw && await p.evaluate(k => Store.player(k).needsDetails === true, kw));
  const nowMin = await p.evaluate(sid => Clock.minute(Store.session(sid)), SID);
  check(`…on Green tonight, arrival minute recorded (${nowMin}', the minute of the block)`, !!kw && teamOf(se, kw) === 'green' && se.teams.green.players[kw].arrived &&
    se.teams.green.players[kw].arrived.at === nowMin && kb[0] && kb[0].min === nowMin && nowMin >= 23, kw && se.teams.green.players[kw]);
  check('…and the block is logged for him straight away (one block, both sheets closed)', kb.length === 1 && (await sheets()) === 0, { blocks: kb.length, sheets: await sheets() });
  check('the Undo bar is the block: "Block · Kwabena"', /Block · Kwabena/.test((await bar()) || ''), await bar());
  await s.shot(path.join(OUT, 'new-person-block-done-390-dark.png'));
  await click('#app-undo [data-act="undo"]', 900);
  evs = await events(); se = await sess();
  check('Undo removes the block only; Kwabena stays on Green tonight', !evs.some(e => e.type === 'block' && e.playerId === kw) && teamOf(se, kw) === 'green', { blocks: evs.filter(e => e.playerId === kw).length });
  await waitBarGone();

  // ---------------------------------------------------------------- Goal · Red → an existing club member not here tonight
  const outsider = await p.evaluate(sid => {
    const se = Store.session(sid); const on = new Set(Scoring.sessPlayers(se).map(x => x.pid));
    const names = {}; Object.values(Store.players()).forEach(v => { if (v && v.name) names[v.name.toLowerCase()] = (names[v.name.toLowerCase()] || 0) + 1; });
    const e = Object.entries(Store.players()).find(([pid, v]) => v && v.name && v.name.length > 4 && !on.has(pid) && names[v.name.toLowerCase()] === 1 && v.defaultPosition !== 'GK' &&
      !Object.values(Store.players()).some(o => o !== v && o && o.name && o.name.toLowerCase().includes(v.name.toLowerCase())));
    return e ? { pid: e[0], name: e[1].name } : null;
  }, SID);
  await click('.cn-goal[data-team="red"]', 600);
  const tiles = await p.$$eval('.sh-console-goal .tiles > *', a => a.map(x => x.textContent.trim()));
  check('Goal · Red: "+ New person" is the last scorer tile', tiles[tiles.length - 1] === '+ New person', tiles.slice(-2));
  await click('.sh-console-goal [data-tap="newp"]', 600);
  check('it opens "New person · Red"', (await title()) === 'New person · Red');
  await type(outsider.name);
  check(`typing "${outsider.name}" finds the club member, with a Red button`, !!(await p.$(`.sh-setup-new [data-tap="add"][data-pid="${outsider.pid}"][data-team="red"]`)));
  await click(`.sh-setup-new [data-tap="add"][data-pid="${outsider.pid}"]`, 900);
  if (await p.$('.sh-setup-new')) await click(`.sh-setup-new [data-tap="add"][data-pid="${outsider.pid}"]`, 900);   // 9 + 1: second tap
  se = await sess();
  check(`${outsider.name} is on Red tonight (no new club entry)`, teamOf(se, outsider.pid) === 'red' && (await p.evaluate(n => Object.values(Store.players()).filter(v => v.name === n).length, outsider.name)) === 1);
  check('…and the goal sheet carries on to "Who assisted?" with him as the scorer', (await sheets()) === 1 &&
    (await p.$eval('.sh-console-goal .cn-scorer .nm', e => e.textContent).catch(() => null)) === outsider.name && /assisted/.test(await p.$eval('.sh-console-goal .sh-s', e => e.textContent)));
  const aTiles = await p.$$eval('.sh-console-goal .tiles > *', a => a.map(x => x.textContent.trim()));
  check('the assist step has "+ New person" too', aTiles[aTiles.length - 1] === '+ New person');
  await s.shot(path.join(OUT, 'new-person-goal-assist-step-390-dark.png'));
  // assist: a Red player already on tonight, through "+ New person" (tapped straight through, no second entry)
  const redMate = Object.keys(se.teams.red.players).find(pid => pid !== outsider.pid);
  const redName = await p.evaluate(pid => Store.player(pid).name, redMate);
  const greenOne = Object.keys(se.teams.green.players)[0];
  const greenName = await p.evaluate(pid => Store.player(pid).name, greenOne);
  await click('.sh-console-goal [data-tap="newp"]', 600);
  await type(greenName);
  check(`${greenName} (on Green tonight) is shown but not offered for Red`, !(await p.$(`.sh-setup-new button[data-pid="${greenOne}"]`)));
  await p.click('.sh-setup-new [data-search="q"]', { clickCount: 3 }); await p.keyboard.press('Backspace');
  await type(redName);
  const writes0 = await p.evaluate(() => Store.test.writes.length);
  await click(`.sh-setup-new [data-tap="pick"][data-pid="${redMate}"]`, 1000);
  evs = await events();
  const g = evs.find(e => e.type === 'goal' && e.scorerId === outsider.pid);
  check(`${redName} (already on Red) is tapped straight through: goal ${outsider.name}, assist ${redName}`, !!g && g.team === 'red' && g.assistId === redMate && (await sheets()) === 0, g);
  const seA = await sess();
  check('…with one write (the goal), no second team entry', (await p.evaluate(() => Store.test.writes.length)) - writes0 === 1 &&
    Object.keys(seA.teams).filter(t => ((seA.teams[t] || {}).players || {})[redMate]).length === 1, (await p.evaluate(() => Store.test.writes.length)) - writes0);
  await waitBarGone();

  // ---------------------------------------------------------------- cancel = back to the list, nothing logged
  const n0 = (await events()).length;
  await click('.cn-col[data-col="green"] [data-kind="card"][data-ctype="yellowCard"]', 600);
  const yrows = await p.$$eval('.sh-console-card .cn-list .rows > *', a => a.map(x => x.textContent.trim()));
  check('Yellow · Green has "+ New person" as the last row', yrows[yrows.length - 1] === '+ New person');
  await click('.sh-console-card [data-tap="newp"]', 600);
  await type('Somebody');
  await closeTop();
  check('Cancel: back on the Yellow list (one sheet), nothing logged, nobody added', (await sheets()) === 1 && (await title()).includes('Yellow') && (await events()).length === n0 &&
    !(await p.evaluate(() => Object.values(Store.players()).some(v => v.name === 'Somebody'))), await title());
  await closeTop();
  check('no console errors', s.errors.length === 0, s.errors);
  await s.close();

  console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
