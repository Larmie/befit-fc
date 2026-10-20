const H = require('../harness.js');
(async () => {
  const out = []; const ok = (c, m) => out.push((c ? 'ok   ' : 'FAIL ') + m);
  const snap = H.snapshot();
  const sid19 = Object.entries(snap.sessions).find(([, s]) => s.date === '2026-10-19')[0];
  for (const theme of ['dark', 'light']) {
    const s = await H.open({ width: 390, theme, viewer: 'guest', route: `#/player.match?sid=${sid19}` });
    await new Promise(r => setTimeout(r, 1200));
    const has = await s.page.$('[data-tap="mshare"]');
    ok(!!has, `${theme}: guest sees "Share full-time card" on 19 Oct`);
    const h = await s.page.evaluate(() => { const b = document.querySelector('[data-tap="mshare"] > span'); return b && b.getBoundingClientRect().height; });
    ok(h >= 44, `${theme}: button is ${h}px tall (>= 44)`);
    await s.shot(`${H.out(__dirname)}/match-${theme}.png`);
    await s.page.click('[data-tap="mshare"]');
    await new Promise(r => setTimeout(r, 1500));
    const sheet = await s.page.evaluate(() => { const c = document.querySelector('.sheet canvas, .sh canvas, canvas'); return { canvas: !!c, w: c && c.width, title: (document.querySelector('.sheet-title') || {}).textContent || '' }; });
    ok(sheet.canvas && sheet.w > 0, `${theme}: full-time card drawn (canvas ${sheet.w}px wide), sheet "${sheet.title}"`);
    await s.shot(`${H.out(__dirname)}/sheet-${theme}.png`);
    ok(s.errors.length === 0, `${theme}: no console errors ${JSON.stringify(s.errors)}`);
    await s.close();
  }
  // a live match must NOT offer it
  const live = JSON.parse(JSON.stringify(snap)); live.sessions[sid19].status = 'active';
  live.sessions[sid19].timer = { status: 'running', startedAt: Date.now() - 30 * 60000, pausedTotal: 0 };
  const s2 = await H.open({ width: 390, theme: 'dark', viewer: 'guest', data: live, route: `#/player.match?sid=${sid19}` });
  await new Promise(r => setTimeout(r, 1200));
  ok(!(await s2.page.$('[data-tap="mshare"]')), 'live match: no share button (card is for full time)');
  await s2.close();
  console.log(out.join('\n')); console.log(out.filter(x => x.startsWith('FAIL')).length ? 'SOME FAILED' : 'ALL PASSED');
})().catch(e => { console.error(e); process.exit(1); });
