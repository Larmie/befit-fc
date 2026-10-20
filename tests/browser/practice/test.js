// Practice mode (?practice) check. Practice READS the real data once (GET only, read-only by design) and then runs
// in test mode, so every tap stays on the phone. This test ABORTS any Firebase request that is not a plain GET of
// players / sessions / paymentDays / settings, so nothing can be written even if the app tried.
// Round 5 Phase C: settings is optional: run 1 = settings readable (as today: empty), run 2 = settings refused (401),
// run 3 = settings with Blue (answered from a stub). Every run: 0 writes reach the network and the app works.
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
  check(`[${mode}] teams: ${st.teams}`, st.teams === (mode === 'blue' ? 'green,red,blue' : 'green,red'), st.teams);
  check(`[${mode}] taps work: referee sign-in, a new player, Add a team, the Match tab (${r.screen})`, r.referee && r.added && r.gold && r.writesInMemory === 2 && r.screen === 'ref.setup', r);
  check(`[${mode}] 0 writes reach the network (only ${fb.length} GET reads: players, sessions, paymentDays, settings)`, blocked.length === 0 && fb.every(x => /^GET /.test(x)) && fb.length === 4, { fb, blocked });
  check(`[${mode}] no page errors`, errs.length === 0, errs);
  await p.close();
}
(async () => {
  await new Promise(r => srv.listening ? r() : srv.on('listening', r)); const port = srv.address().port;
  const b = await puppeteer.launch({ executablePath: P.chrome(), headless: true, args: ['--no-sandbox'] });
  for (const mode of ['readable', 'refused', 'blue']) await run(b, port, mode);
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
