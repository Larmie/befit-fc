const H = require('../harness.js');
(async () => {
  const out = []; const ok = (c, m) => out.push((c ? 'ok   ' : 'FAIL ') + m);
  const snap = H.snapshot();
  const [sid19, s19] = Object.entries(snap.sessions).find(([, s]) => s.date === '2026-10-19');
  // pretend the referee published 19 Oct through the new app, so it shows in Needs you
  const data = JSON.parse(JSON.stringify(snap));
  data.sessions[sid19].ftCheck = { status: 'published', publishedAt: Date.now() - 3600e3, by: 'referee' };
  for (const theme of ['dark', 'light']) {
    const s = await H.open({ width: 390, theme, role: 'admin', referee: 'admin', data, route: '#/admin.home' });
    await new Promise(r => setTimeout(r, 1500));
    const row = await s.page.$(`.adm-need[data-sid="${sid19}"]`);
    ok(!!row, `${theme}: Needs you shows "Published · Mon 19 Oct"`);
    if (row) { await row.click(); await new Promise(r => setTimeout(r, 1200)); }
    const onEdit = await s.page.evaluate(() => location.hash);
    ok(/ref\.edit/.test(onEdit), `${theme}: tapping it opens Edit match (${onEdit})`);
    const btn = await s.page.$('[data-tap="ftshare"]');
    ok(!!btn, `${theme}: Edit match shows "Share full-time card"`);
    const h = await s.page.evaluate(() => { const b = document.querySelector('[data-tap="ftshare"]'); return b && Math.round(b.getBoundingClientRect().height); });
    ok(h >= 48, `${theme}: button ${h}px tall (>= 48, admin target)`);
    await s.shot(`${H.out(__dirname)}/edit-${theme}.png`);
    await btn.click(); await new Promise(r => setTimeout(r, 1500));
    const sh = await s.page.evaluate(() => ({ title: (document.querySelector('.sheet-title') || {}).textContent || '', pages: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /Page [12]/.test(t)) }));
    ok(/Full-time card/.test(sh.title) && sh.pages.length === 2, `${theme}: sheet "${sh.title}" with ${JSON.stringify(sh.pages)}`);
    await s.shot(`${H.out(__dirname)}/sheet-${theme}.png`);
    ok(s.errors.length === 0, `${theme}: no console errors ${JSON.stringify(s.errors)}`);
    await s.close();
  }
  // live (active) match in Edit: no share button
  const live = JSON.parse(JSON.stringify(snap)); live.sessions[sid19].status = 'active';
  live.sessions[sid19].timer = { status: 'running', startedAt: Date.now() - 30 * 60000, pausedTotal: 0 };
  const s2 = await H.open({ width: 390, theme: 'dark', role: 'admin', referee: 'admin', data: live, route: `#/ref.edit?sid=${sid19}` });
  await new Promise(r => setTimeout(r, 1200));
  ok(!(await s2.page.$('[data-tap="ftshare"]')), 'active match: no share button in Edit');
  await s2.close();
  console.log(out.join('\n')); console.log(out.filter(x => x.startsWith('FAIL')).length ? 'SOME FAILED' : 'ALL PASSED');
})().catch(e => { console.error(e); process.exit(1); });
