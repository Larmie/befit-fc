// BE Fit Club service worker.
// Rule 1: NETWORK FIRST for every file of ours, so a new release always wins whenever the phone has signal.
// The saved copies are only used when the network fails (offline at the pitch), and each successful
// load refreshes them, so the phone can never get stuck on an old version of the app.
// Rule 2: CACHE FIRST for the Firebase SDK (www.gstatic.com/firebasejs/<version>/...) and Google Fonts.
// Their addresses change with every version, so a saved copy is never stale. This is what lets the app
// open and keep saves on the phone with no signal at all. The SDK and fonts are saved at install.
// Never touches the database or sign-in traffic (firebaseio.com, firebasedatabase.app, identitytoolkit,
// securetoken): those always go straight to the network.
// Bump CACHE when the list of files changes; old caches are deleted on activate.
const CACHE = 'befit-fc-v3';
const EXT = 'befit-ext-v1';                  // Firebase SDK + Google Fonts (versioned addresses)
const SDK_FALLBACK = '10.12.0';              // only if js/core/config.js can't be read at install
const SDK_FILES = ['firebase-app.js', 'firebase-database.js', 'firebase-auth.js'];
const SHELL = [
  '/', '/classic.html', '/manifest.json', '/icon.svg',
  '/css/tokens.css', '/css/base.css', '/css/components.css', '/css/welcome.css', '/css/player.css',
  '/css/setup.css', '/css/console.css', '/css/fix.css', '/css/admin.css',
  '/js/core/config.js', '/js/core/practice.js', '/js/core/store.js', '/js/core/scoring.js', '/js/core/pay.js', '/js/core/clock.js',
  '/js/core/auth.js', '/js/core/save.js', '/js/ui/components.js', '/js/ui/shell.js',
  '/js/screens/welcome.js', '/js/screens/player.js', '/js/screens/setup.js', '/js/screens/console.js',
  '/js/screens/fix.js', '/js/screens/admin.js',
];

const isSdk = url => url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
const isFont = url => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

// The SDK version lives in BF_CONFIG (js/core/config.js); read it from there so it is set in one place.
function sdkVersion() {
  return fetch('/js/core/config.js', { cache: 'no-cache' })
    .then(r => r.text())
    .then(t => (t.match(/sdkVersion:\s*['"]([\w.-]+)['"]/) || [])[1] || SDK_FALLBACK)
    .catch(() => SDK_FALLBACK);
}
// Save one outside file (CORS, so it can be read back); skip it if it is already saved.
function keep(c, url) {
  return c.match(url, { ignoreVary: true }).then(hit => hit || fetch(url, { mode: 'cors', credentials: 'omit' })
    .then(r => (r.ok ? c.put(url, r.clone()).then(() => r) : null))).catch(() => null);
}
function precacheSdk(c) {
  return sdkVersion().then(v => Promise.all(SDK_FILES.map(f => keep(c, `https://www.gstatic.com/firebasejs/${v}/${f}`))));
}
// The fonts stylesheet named in index.html, and every font file it points to.
function precacheFonts(c) {
  return fetch('/', { cache: 'no-cache' }).then(r => r.text()).then(html => {
    const m = html.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"'\s>]+/);
    if (!m) return null;
    return keep(c, m[0].replace(/&amp;/g, '&')).then(res => (res ? res.text() : ''))
      .then(css => Promise.all(((css || '').match(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g) || []).map(u => keep(c, u))));
  }).catch(() => null);
}

self.addEventListener('install', e => {
  self.skipWaiting();
  // One file failing (e.g. a rename, or no signal for the fonts) must not stop the new worker installing.
  e.waitUntil(Promise.all([
    caches.open(CACHE).then(c => Promise.all(
      SHELL.map(u => fetch(u, { cache: 'no-cache' }).then(r => (r.ok ? c.put(u, r) : null)).catch(() => null))
    )),
    caches.open(EXT).then(c => Promise.all([precacheSdk(c), precacheFonts(c)])),
  ]));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== EXT).map(k => caches.delete(k))))
      .then(() => sdkVersion())
      // Drop SDK files of older versions (after an sdkVersion bump).
      .then(v => caches.open(EXT).then(c => c.keys().then(reqs => Promise.all(reqs
        .filter(r => { const u = new URL(r.url); return isSdk(u) && !u.pathname.startsWith(`/firebasejs/${v}/`); })
        .map(r => c.delete(r))))))
      .catch(() => null)
      .then(() => self.clients.claim())
  );
});

function cacheFirst(req) {
  return caches.open(EXT).then(c => c.match(req, { ignoreVary: true }).then(hit => hit || fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()).catch(() => {});
    return res;
  })));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isSdk(url) || isFont(url)) { e.respondWith(cacheFirst(req)); return; }
  if (url.origin !== self.location.origin) return;          // database, sign-in, anything else: never cached here
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          const key = req.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html') ? '/' : url.pathname;
          caches.open(CACHE).then(c => c.put(key, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.open(CACHE).then(c =>
        c.match(url.pathname, { ignoreSearch: true })
          .then(hit => hit || (req.mode === 'navigate' ? c.match('/') : undefined))
          .then(hit => hit || Response.error())
      ))
  );
});
