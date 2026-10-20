// Admin Home "Needs you" (round 5) with published results in fix.js's shape. TEST MODE ONLY.
// Round 4's "New since you last looked" card became the Needs you stack on admin.home (the design's Admin 1 frame).
const path = require('path');
const H = require('../harness.js');
const OUT = H.out(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const check = (l, ok, x) => { ok ? passes++ : fails++; console.log(ok ? 'ok  ' : 'FAIL', l, !ok && x !== undefined ? JSON.stringify(x) : ''); };

(async () => {
  const data = H.snapshot();
  const NOW = new Date('2026-10-19T19:30:00').getTime();
  const sid12 = Object.entries(data.sessions).find(([, s]) => s.date === '2026-10-12')[0];
  const sid05 = Object.entries(data.sessions).find(([, s]) => s.date === '2026-10-05')[0];
  data.sessions[sid12].ftCheck = { status: 'published', publishedAt: NOW - 30 * 60000, by: 'ref@befit.club',
    fixes: { e1: { text: 'Andrew · duplicate block removed −2', pid: 'x', delta: -2, at: NOW - 31 * 60000, by: 'ref@befit.club' } }, keep: { e9: true } };
  data.sessions[sid12].publishedBy = 'ref@befit.club';
  const ids = Object.keys(data.players);
  data.players[ids[3]].needsDetails = true; data.players[ids[7]].needsDetails = true;

  for (const [width, theme] of [[390, 'dark'], [390, 'light'], [1280, 'dark'], [1280, 'light']]) {
    const s = await H.open({ width, theme, referee: true, route: '#/ref.home', data });
    const p = s.page, tag = `${width}-${theme}`;
    const txt = () => p.evaluate(() => (document.querySelector('.adm-home-a') || {}).textContent.replace(/\s+/g, ' ').trim());
    const items = () => p.$$eval('.adm-need .nm', e => e.map(x => x.textContent));
    check(`[${tag}] ref.home (retired) lands on admin.home`, (await p.evaluate(() => document.querySelector('#app-screen section').dataset.screen)) === 'admin.home');
    const t1 = await txt();
    const it1 = await items();
    check(`[${tag}] Needs you · 6 things, in order`, t1.startsWith('Needs you 6 things') &&
      JSON.stringify(it1) === JSON.stringify(['Money not entered', 'Money tonight', 'Subs owed', 'Names used twice', '2 new players to finish', 'Published · Mon 12 Oct']), [t1.slice(0, 30), it1]);
    check(`[${tag}] money not entered: 5 match days · 14 Sep – 12 Oct (tonight has its own line)`, t1.includes('5 match days · 14 Sep – 12 Oct'), t1);
    check(`[${tag}] money tonight: 0 of 18 paid · 18 to collect`, t1.includes('0 of 18 paid · 18 to collect'), t1);
    check(`[${tag}] subs owed: 24 players · ₵2,400 for 40 nights (= BF_PAY.owed × ₵60)`, t1.includes('24 players · ₵2,400 for 40 nights'), t1);
    check(`[${tag}] names used twice: Chris, Frankie, Fred, New francis guy`, t1.includes('Chris, Frankie, Fred, New francis guy'), t1);
    check(`[${tag}] 12 Oct published, by ref, 1 fix + 1 flag kept + the fix's text`, t1.includes('Published · Mon 12 Oct') && t1.includes('By ref · 1 fix at full time · 1 flag kept') && t1.includes('Andrew · duplicate block removed −2'), t1);
    check(`[${tag}] old matches without ftCheck are not listed as new`, (t1.match(/Published/g) || []).length === 1, t1);
    check(`[${tag}] matches list: 37 with mini scores`, await p.evaluate(() => document.querySelectorAll('.adm-home-b .r .ms').length === 37 && document.querySelector('.adm-home-b .lbl').textContent.includes('37')));
    await s.shot(path.join(OUT, `home-needsyou-${tag}.png`));
    if (width === 390 && theme === 'dark') {
      await p.$eval('.adm-need[data-tap="edit"]', e => e.click()); await sleep(300);
      check('Published › opens ref.edit for that match', await p.evaluate(sid => document.querySelector('#app-screen section').dataset.screen === 'ref.edit' && location.hash.includes(sid), sid12));
      await p.evaluate(() => history.back()); await sleep(300);
      await p.$eval('[data-tap="finish"]', e => e.click()); await sleep(250);
      check('"to finish" lists the 2 players', (await p.$$eval('.sh-admin-finish [data-tap="pick"]', e => e.length)) === 2);
      await s.shot(path.join(OUT, 'finish-sheet-390-dark.png'));
      await p.$eval('.sh-admin-finish [data-tap="pick"]', e => e.click()); await sleep(300);
      check('picking one opens their page', (await p.evaluate(() => document.querySelector('#app-screen section').dataset.screen)) === 'ref.player');
      for (const [tap, want, extra] of [['need-money', 'ref.money', 'all=1'], ['need-tonight', 'ref.money', 'view=tonight'], ['need-twice', 'ref.squad', 'f=twice'], ['need-owes', 'ref.squad', 'f=owes']]) {
        await p.evaluate(() => { location.hash = '#/admin.home'; }); await sleep(300);
        await p.$eval(`[data-tap="${tap}"]`, e => e.click()); await sleep(300);
        check(`${tap} → ${want} (${extra})`, await p.evaluate((w, x) => document.querySelector('#app-screen section').dataset.screen === w && location.hash.includes(x), want, extra));
      }
      check('Owes filter is on after "Subs owed": 24 rows', await p.evaluate(() => document.querySelector('[data-chips="sq-f"] .on').dataset.value === 'owes' && document.querySelectorAll('[data-part="list"] .adm-sq').length === 24));
      // reload: the 12 Oct result has now been seen
      await p.evaluate(() => { location.hash = '#/admin.home'; }); await sleep(200); await p.reload({ waitUntil: 'networkidle0' }); await sleep(600);
      const t2 = await txt();
      check('after looking once, the 12 Oct result is no longer "new"', !t2.includes('Published'), t2);
      // a result published now shows up straight away
      await p.evaluate(sid => Store.update('sessions/' + sid, { ftCheck: { status: 'published', publishedAt: Store.now() + 1000, by: 'referee@test', fixes: {} }, publishedBy: 'referee@test' }), sid05);
      await sleep(400);
      const t3 = await txt();
      check('a newly published result (5 Oct) appears at once, no fixes line', t3.includes('Published · Mon 5 Oct') && t3.includes('By referee') && !t3.includes('fix'), t3);
      // published with a flag still open (fix.js: ftCheck.flags counts) and the stoppage fix → amber, Review
      const sid28 = await p.evaluate(() => Object.keys(Store.state.sessions).find(k => Store.state.sessions[k].date === '2026-09-28'));
      await p.evaluate(sid => Store.update('sessions/' + sid, { ftCheck: { status: 'published', publishedAt: Store.now() + 2000, by: 'referee', flags: { longStoppage: 1 }, fixes: { stoppage_2_46: { text: 'Minutes fixed · stoppage after half time', pid: null, delta: 0, at: Store.now(), by: 'referee' } } }, publishedBy: 'referee' }), sid28);
      await sleep(400);
      const fl = await p.evaluate(sid => { const b = document.querySelector('.adm-need[data-sid="' + sid + '"]'); return b ? { t: b.innerText.replace(/\s+/g, ' ').trim(), warn: b.classList.contains('is-warn') } : null; }, sid28);
      check('flag open at publish: "By the referee · 1 fix at full time · 1 flag: long stoppage", the fix text, amber, Review', !!fl && fl.warn && fl.t.includes('By the referee · 1 fix at full time · 1 flag: long stoppage') && fl.t.includes('Minutes fixed · stoppage after half time') && fl.t.includes('Review'), fl);
      await s.shot(path.join(OUT, 'home-flag-390-dark.png'));
      // a live match: the banner with the joined score block, Open console
      await p.evaluate(() => { const sid = Object.keys(Store.state.sessions).find(k => Store.state.sessions[k].date === '2026-10-19'); return Store.update('sessions/' + sid, { status: 'active', timer: { status: 'running', startedAt: Store.now() - 30 * 60000, pausedTotal: 0, htLogged: false } }); });
      await sleep(400);
      check('live match: banner with LIVE, the score block (the one hero) and Open console', await p.evaluate(() => { const b = document.querySelector('.adm-live'); return !!b && b.classList.contains('hero') && !!b.querySelector('.sb .sb-half .hn') && b.textContent.includes('LIVE') && b.textContent.includes('Open console') && document.querySelectorAll('#app-screen .hero').length === 1; }));
      await s.shot(path.join(OUT, 'home-live-390-dark.png'));
      await p.$eval('.adm-live [data-tap="console"]', e => e.click()); await sleep(400);
      check('Open console → the referee console', (await p.evaluate(() => document.querySelector('#app-screen section').dataset.screen)) === 'ref.console');
    }
    check(`[${tag}] no console errors`, s.errors.length === 0, s.errors);
    await s.close();
  }
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
