// BE Fit Club · Floodlight test harness (headless Chrome, TEST MODE ONLY).
// Serves the repo, injects the real snapshot as window.__BEFIT_TEST__ (no Firebase, writes stay in memory),
// blocks every request to Firebase as a second safety net, and takes screenshots.
//
// CLI:
//   node tests/browser/harness.js --route "#/player.table" --width 390 --theme dark --out shot.png   (default tests/.out/shot.png)
//     [--viewer seed_p002 | --viewer guest | --viewer none]   who picked their name (none = first open → Welcome)
//     [--referee]                     start signed in (as the admin, who can also referee)
//     [--role referee|admin]          round 5: start signed in as the shared referee login, or the admin
//     [--now 2026-10-19T19:30]        the app's clock (default Mon 19 Oct 2026, 19:30)
//     [--height 844] [--full]         viewport height; --full = whole page
//     [--console-theme app|dark]      Me › Appearance › Referee console
//     [--status offline]              start as if the database can't be reached
//     [--eval "App.openAppearance()"] run JS in the page before the shot (after load)
//     [--wait 400]                    extra ms before the shot
//   Prints console errors / page errors; exit code 1 if there were any.
//
// MODULE:
//   const H = require('./harness.js');
//   const s = await H.open({ width: 390, theme: 'dark', viewer: 'seed_p002', referee: false, route: '#/player.live' });
//   await s.page.click('[data-tap="browse"]');   // drive it with puppeteer
//   await s.shot('C:/.../a.png');                 // or s.shot(path, { fullPage: true })
//   console.log(s.errors);                        // console + page errors so far
//   await s.close();
//   H.snapshot()  → the snapshot object (fresh copy)   ·   H.REPO, H.SNAPSHOT paths
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const P = require('../paths.js');
const puppeteer = require('puppeteer-core');

const REPO = P.REPO;
const SNAPSHOT = P.SNAPSHOT;
const CHROME = P.chrome();
const DEFAULT_NOW = new Date('2026-10-19T19:30:00').getTime();
const BLOCK = /firebaseio\.com|firebasedatabase\.app|gstatic\.com\/firebasejs|identitytoolkit|securetoken/i;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

const FONTS = new RegExp('^https://fonts[.](googleapis|gstatic)[.]com/');
const fontKey = u => (FONTS.test(u) ? path.join(P.CACHE, 'fonts', require('crypto').createHash('sha1').update(u).digest('hex')) : null);
const snapshot = () => P.snapshot();

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.join(REPO, p);
      if (!file.startsWith(path.resolve(REPO)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function open(o = {}) {
  const opts = Object.assign({ width: 390, height: null, theme: 'dark', viewer: 'seed_p002', referee: false, route: '',
    now: DEFAULT_NOW, consoleTheme: null, status: null, data: null, latency: 120, scale: 2 }, o);
  const server = await serve();
  const port = server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => { if (!BLOCK.test(r.url())) errors.push('FAILED ' + r.url() + ' ' + (r.failure() && r.failure().errorText)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.setRequestInterception(true);
  // Google Fonts from a local copy (the font hosts were slow / dropping on 20 Oct and stalled 'networkidle0'):
  // the first good download is saved under tests/.cache/fonts and replayed after that. Fonts only; never data.
  page.on('request', r => {
    if (BLOCK.test(r.url())) { errors.push('BLOCKED network: ' + r.url()); return r.abort(); }
    const fk = fontKey(r.url());
    if (fk && fs.existsSync(fk)) { const c = JSON.parse(fs.readFileSync(fk + '.json', 'utf8')); return r.respond({ status: 200, contentType: c.type, headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(fk) }); }
    r.continue();
  });
  page.on('response', async r => { const fk = fontKey(r.url()); if (!fk || r.status() !== 200 || fs.existsSync(fk)) return; try { const b = await r.buffer(); fs.mkdirSync(path.dirname(fk), { recursive: true }); fs.writeFileSync(fk, b); fs.writeFileSync(fk + '.json', JSON.stringify({ type: r.headers()['content-type'] || 'application/octet-stream' })); } catch (e) { /* ignore */ } });
  const height = opts.height || (opts.width >= 960 ? 820 : 844);
  await page.setViewport({ width: opts.width, height, deviceScaleFactor: opts.scale, isMobile: opts.width < 960, hasTouch: opts.width < 960 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opts.theme === 'light' ? 'light' : 'dark' }]);
  const test = { data: opts.data || snapshot(), now: typeof opts.now === 'string' ? new Date(opts.now).getTime() : opts.now,
    referee: opts.referee === 'referee' || opts.referee === 'admin' ? opts.referee : !!opts.referee, latency: opts.latency };
  if (opts.status) test.status = opts.status;
  if (opts.viewer !== undefined) test.viewer = opts.viewer === 'none' ? null : opts.viewer;
  await page.evaluateOnNewDocument((test, theme, consoleTheme) => {
    window.__BEFIT_TEST__ = test;
    try {
      if (!sessionStorage.getItem('__harness')) {          // first load only, so reloads keep what the app saved
        sessionStorage.setItem('__harness', '1');
        localStorage.clear();
        localStorage.setItem('befit_theme', theme);
        if (consoleTheme) localStorage.setItem('befit_console_theme', consoleTheme);
      }
    } catch (e) { /* ignore */ }
  }, test, opts.theme, opts.consoleTheme);
  await page.goto(`http://127.0.0.1:${port}/${opts.route || ''}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.Store && window.Store.test && window.Store.test.active && document.querySelector('#app-screen section'), { timeout: 20000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await new Promise(r => setTimeout(r, 150));
  const ok = await page.evaluate(() => !!(window.__BEFIT_TEST__ && window.Store.test.active));
  if (!ok) throw new Error('Not in test mode: refusing to continue');
  return {
    page, browser, server, port, errors,
    url: `http://127.0.0.1:${port}/`,
    async go(route) { await page.evaluate(r => { location.hash = r; }, route); await new Promise(r => setTimeout(r, 250)); },
    async shot(file, so) { fs.mkdirSync(path.dirname(file), { recursive: true }); so = so || {}; await page.screenshot(Object.assign({ path: file, captureBeyondViewport: !!so.fullPage }, so)); return file; },
    async close() { await browser.close(); server.close(); },
  };
}

module.exports = { open, snapshot, REPO, SNAPSHOT, DEFAULT_NOW, CHROME, puppeteer, out: P.out, FIXTURES: P.FIXTURES };

if (require.main === module) {
  const a = process.argv.slice(2);
  const arg = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : (a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true); };
  (async () => {
    const s = await open({ route: arg('route', ''), width: Number(arg('width', 390)), height: arg('height') ? Number(arg('height')) : null,
      theme: arg('theme', 'dark'), viewer: arg('viewer', 'seed_p002'), referee: arg('role', null) || !!arg('referee', false), now: arg('now', DEFAULT_NOW),
      consoleTheme: arg('console-theme', null), status: arg('status', null) });
    if (arg('eval')) { await s.page.evaluate(arg('eval')); }
    await new Promise(r => setTimeout(r, Number(arg('wait', 300))));
    const out = arg('out', path.join(P.out(__dirname), 'shot.png'));
    await s.shot(out, { fullPage: !!arg('full', false) });
    console.log('saved', out);
    if (s.errors.length) { console.log(s.errors.join('\n')); process.exitCode = 1; }
    await s.close();
  })().catch(e => { console.error(e); process.exit(1); });
}
