// Practice mode (?practice) check. Practice READS the real data once (GET only, read-only by design) and then runs
// in test mode, so every tap stays on the phone. This test ABORTS any Firebase request that is not a plain GET of
// players / sessions / paymentDays / settings, so nothing can be written even if the app tried.
// Round 5 Phase C: settings is optional: run 1 = settings readable (as today: empty), run 2 = settings refused (401),
// run 3 = settings with Blue (answered from a stub). Every run: 0 writes reach the network and the app works.
// Round 7: the violet look (tokens, frame, bar, front door pill) and the practice password gate (run 4 = settings
// with a practice password: the sheet, wrong and right passwords, the visit remembered, Cancel).
const puppeteer = require('puppeteer-core'); const http = require('http'), fs = require('fs'), path = require('path');
const P = require('../../paths.js');
const REPO = P.REPO;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(REPO, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, '127.0.0.1');
let fails = 0;
const check = (l, ok, x) => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', l, !ok && x !== undefined ? JSON.stringify(x) : ''); };
const READ_OK = /^https:\/\/[^/]+(firebaseio\.com|firebasedatabase\.app)\/(players|sessions|paymentDays|settings)\.json$/;
async function run(b, port, mode) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  const fb = [], blocked = [], errs = [];
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = r.url().replace(/\?.*/, '');
    if (!/firebaseio|firebasedatabase|gstatic\.com\/firebasejs|identitytoolkit|securetoken/.test(u)) return r.continue();
    fb.push(r.method() + ' ' + u);
    if (r.method() !== 'GET' || !READ_OK.test(u)) { blocked.push(r.method() + ' ' + u); return r.abort(); }
    if (/settings\.json$/.test(u) && mode === 'refused') return r.respond({ status: 401, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"error":"Permission denied"}' });
    if (/settings\.json$/.test(u) && mode === 'blue') return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ teams: { green: { name: 'Green', colour: 'green', order: 1, active: true }, red: { name: 'Red', colour: 'red', order: 2, active: true }, blue: { name: 'Blue', colour: 'blue', order: 3, active: true } } }) });
    r.continue();
  });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/?practice`, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  const look = mode === 'readable' ? await p.evaluate(() => {
    const cs = (el, k) => getComputedStyle(el).getPropertyValue(k).trim().toLowerCase();
    const bar = document.querySelector('.practice-bar'), scr = document.querySelector('#app-screen section'), pill = document.querySelector('.fd-practice');
    return { gate: !!document.querySelector('.pg'), practice: cs(document.documentElement, '--practice'), onPractice: cs(document.documentElement, '--on-practice'), bg: cs(document.documentElement, '--bg'), s1: cs(document.documentElement, '--s1'),
      frame: getComputedStyle(document.body, '::after').boxShadow, texture: getComputedStyle(document.body).backgroundImage.slice(0, 30), barBg: getComputedStyle(bar).backgroundColor, barFg: getComputedStyle(bar).color, barH: Math.round(bar.getBoundingClientRect().height),
      barGlyph: !!bar.querySelector('svg'), door: scr && scr.dataset.theme, doorBg: scr && cs(scr, '--bg'), pill: pill && pill.innerText.trim(), pillHref: pill && pill.getAttribute('href'), pillLock: pill && !!pill.querySelector('svg + em + svg') };
  }) : null;
  const lt = look ? await p.evaluate(() => { App.theme.set('light'); const cs = (el, k) => getComputedStyle(el).getPropertyValue(k).trim().toLowerCase(); const o = { bg: cs(document.documentElement, '--bg'), s1: cs(document.documentElement, '--s1'), practice: cs(document.documentElement, '--practice'), on: cs(document.documentElement, '--on-practice'), door: cs(document.querySelector('#app-screen section'), '--bg'), barFg: getComputedStyle(document.querySelector('.practice-bar')).color }; App.theme.set('auto'); return o; }) : null;
  const st = await p.evaluate(() => ({ test: Store.test.active, practice: !!(window.__BEFIT_TEST__ || {}).practice, players: Object.keys(Store.players()).length, sessions: Object.keys(Store.sessions()).length, banner: document.querySelector('.practice-bar')?.textContent, teams: Teams.ids().join(), screen: document.querySelector('#app-screen section')?.dataset.screen }));
  if (mode === 'readable') await p.screenshot({ path: path.join(P.out(__dirname), 'welcome.png') });
  // sign in as referee and write things (in memory only): a new player, the admin's Add a team, then the Match tab
  const r = await p.evaluate(async () => {
    await Auth.signIn('', BF_CONFIG.ADMIN_PW);
    const k = Store.newKey();
    await Store.set('players/' + k, { name: 'Practice Person', defaultPosition: 'MID', defaultTeam: 'green' });
    await Store.multi(Teams.writeFor({ id: 'gold', name: 'Gold', colour: 'gold', order: 9 }));
    App.setRole('referee'); App.goTab('match');
    await new Promise(res => setTimeout(res, 600));
    return { referee: Auth.isReferee(), added: !!Store.player(k), gold: Teams.ids().includes('gold'), writesInMemory: Store.test.writes.length, screen: document.querySelector('#app-screen section')?.dataset.screen };
  });
  await new Promise(res => setTimeout(res, 1500));
  console.log(`\n# practice · settings ${mode}`, JSON.stringify({ ...st, ...r, firebaseRequests: fb }));
  check(`[${mode}] practice runs in test mode on the real data, read once (players ${st.players}, sessions ${st.sessions})`, st.test && st.practice && st.players > 0 && st.sessions > 0, st);
  check(`[${mode}] banner "Practice · nothing is saved · Exit ›"`, st.banner === 'Practice · nothing is saved · Exit ›', st.banner);
  if (look) {
    check('[readable] no password set yet → practice opens with no question', !look.gate, look);
    check('[readable] violet tokens: --practice #a47cff, --on-practice #1a0b33 (dark)', look.practice === '#a47cff' && look.onPractice === '#1a0b33', look);
    check('[readable] practice surfaces: --bg #110e18, --s1 #1a1625', look.bg === '#110e18' && look.s1 === '#1a1625', look);
    check('[readable] 3 px violet frame on the page and the diagonal texture on the body', /0px 0px 0px 3px/.test(look.frame) && /164, 124, 255/.test(look.frame) && /repeating-linear-gradient/.test(look.texture), look);
    check('[readable] the bar is violet (was amber), dark violet text, 28 px tall, with the ring glyph', look.barBg === 'rgb(164, 124, 255)' && look.barFg === 'rgb(26, 11, 51)' && look.barH === 28 && look.barGlyph, look);
    check('[readable] the front door stays dark and takes the practice surface; its one link reads "Exit practice ›" and goes to the normal address', look.door === 'dark' && look.doorBg === '#110e18' && look.pill === 'Exit practice ›' && look.pillHref === '/' && !look.pillLock, look);
    check('[readable] light app: --bg #f1eefa, --practice #6d4ae0 with white text; the front door still dark', lt.bg === '#f1eefa' && lt.s1 === '#ffffff' && lt.practice === '#6d4ae0' && lt.barFg === 'rgb(255, 255, 255)' && lt.door === '#110e18', lt);
  }
  check(`[${mode}] teams: ${st.teams}`, st.teams === (mode === 'blue' ? 'green,red,blue' : 'green,red'), st.teams);
  check(`[${mode}] taps work: referee sign-in, a new player, Add a team, the Match tab (${r.screen})`, r.referee && r.added && r.gold && r.writesInMemory === 2 && r.screen === 'ref.setup', r);
  check(`[${mode}] 0 writes reach the network (only ${fb.length} GET reads: players, sessions, paymentDays, settings)`, blocked.length === 0 && fb.every(x => /^GET /.test(x)) && fb.length === 4, { fb, blocked });
  check(`[${mode}] no page errors`, errs.length === 0, errs);
  await p.close();
}
// Run 4: a practice password is set (a record made by the same helper Admin uses). Same safety net as above:
// only plain GETs of the four public parts are allowed through, everything else is aborted and counted.
const PW = require('../../../js/core/practice.js');
async function gate(b, port) {
  const rec = await PW.make('goal2026');
  const newPage = async () => {
    const p = await b.newPage();
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const fb = [], blocked = [], errs = [];
    await p.setRequestInterception(true);
    p.on('request', r => {
      const u = r.url().replace(/\?.*/, '');
      if (!/firebaseio|firebasedatabase|gstatic\.com\/firebasejs|identitytoolkit|securetoken/.test(u)) return r.continue();
      fb.push(r.method() + ' ' + u);
      if (r.method() !== 'GET' || !READ_OK.test(u)) { blocked.push(r.method() + ' ' + u); return r.abort(); }
      if (/settings\.json$/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ practice: rec }) });
      r.continue();
    });
    p.on('pageerror', e => errs.push(e.message));
    return { p, fb, blocked, errs };
  };
  const g = await newPage(), p = g.p;
  await p.goto(`http://127.0.0.1:${port}/?practice`, { waitUntil: 'networkidle0', timeout: 60000 });
  const sheet = await p.evaluate(() => { const s = document.querySelector('.pg'); return s && { title: s.querySelector('h2').innerText.trim(), hint: s.querySelector('.pg-hint').innerText.trim(), type: s.querySelector('input').type, go: s.querySelector('.pg-go').innerText.trim(), cancel: s.querySelector('.pg-cx').innerText.trim(),
    goBg: getComputedStyle(s.querySelector('.pg-go')).backgroundColor, goFg: getComputedStyle(s.querySelector('.pg-go')).color, focus: document.activeElement === s.querySelector('input'), players: Object.keys(Store.players()).length, bar: !!document.querySelector('.practice-bar'), gated: !!(window.__BEFIT_TEST__ || {}).gated }; });
  await p.screenshot({ path: path.join(P.out(__dirname), 'practice-gate.png') });
  check('[gated] a password is set → the sheet shows before practice: "Practice mode", the hint, one password field (focused), "Start practice ›" in violet, "Cancel"',
    sheet && sheet.title === 'Practice mode' && sheet.hint === 'Ask Reuben for the practice password · nothing is saved' && sheet.type === 'password' && sheet.go === 'Start practice ›' && sheet.cancel === 'Cancel' && sheet.goBg === 'rgb(164, 124, 255)' && sheet.goFg === 'rgb(26, 11, 51)' && sheet.focus, sheet);
  check('[gated] while the sheet is up the app holds no real data (0 players) and shows no practice bar', sheet && sheet.players === 0 && !sheet.bar && sheet.gated, sheet);
  check('[gated] the hash is read from settings but the password is nowhere in the page or the request log', !(await p.content()).includes('goal2026') && !g.fb.join().includes('goal2026'));
  // wrong password → "Wrong password", no lock-out, nothing remembered
  await p.type('.pg input', 'goal2027'); await p.click('.pg-go'); await new Promise(r => setTimeout(r, 500));
  const wrong = await p.evaluate(() => ({ err: document.querySelector('.pg-err').innerText.trim(), still: !!document.querySelector('.pg'), key: sessionStorage.getItem(BF_CONFIG.keys.practiceOk) }));
  check('[gated] wrong password → "Wrong password", the sheet stays, nothing remembered', wrong.err === 'Wrong password' && wrong.still && wrong.key === null, wrong);
  await p.click('.pg input', { clickCount: 3 }); await p.keyboard.press('Backspace');
  await p.type('.pg input', 'goal2026');
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }), p.click('.pg-go')]);
  await new Promise(r => setTimeout(r, 800));
  const ok = await p.evaluate(() => ({ gate: !!document.querySelector('.pg'), bar: (document.querySelector('.practice-bar') || {}).textContent, players: Object.keys(Store.players()).length, key: sessionStorage.getItem(BF_CONFIG.keys.practiceOk), screen: document.querySelector('#app-screen section')?.dataset.screen }));
  check('[gated] right password → practice starts on the real data (read again), the visit is remembered', !ok.gate && ok.bar === 'Practice · nothing is saved · Exit ›' && ok.players > 0 && ok.key === '1' && ok.screen === 'welcome', ok);
  await p.reload({ waitUntil: 'networkidle0', timeout: 60000 });
  check('[gated] a reload in the same visit does not ask again', await p.evaluate(() => !document.querySelector('.pg') && !!document.querySelector('.practice-bar')));
  check('[gated] 0 writes reach the network and no page errors', g.blocked.length === 0 && g.fb.every(x => /^GET /.test(x)) && g.errs.length === 0, { blocked: g.blocked, errs: g.errs });
  await p.close();
  // Cancel goes back to the normal app (no ?practice), and nothing was started
  const c = await newPage();
  await c.p.goto(`http://127.0.0.1:${port}/?practice`, { waitUntil: 'networkidle0', timeout: 60000 });
  await Promise.all([c.p.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }), c.p.click('.pg-cx')]);
  const cx = await c.p.evaluate(() => ({ search: location.search, practice: document.documentElement.classList.contains('practice'), gate: !!document.querySelector('.pg') }));
  check('[gated] Cancel → the normal address, not practice', cx.search === '' && !cx.practice && !cx.gate, cx);
  check('[gated] Cancel made no writes (the normal app only asks for its Firebase library, a GET)', c.fb.every(x => /^GET /.test(x)), c.fb);
  await c.p.close();
}
(async () => {
  await new Promise(r => srv.listening ? r() : srv.on('listening', r)); const port = srv.address().port;
  const b = await puppeteer.launch({ executablePath: P.chrome(), headless: true, args: ['--no-sandbox'] });
  for (const mode of ['readable', 'refused', 'blue']) await run(b, port, mode);
  await gate(b, port);
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
