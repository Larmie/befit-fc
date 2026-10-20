// BE Fit Club service worker.
// Rule: NETWORK FIRST for every file of ours, so a new release always wins whenever the phone has signal.
// The saved copies are only used when the network fails (offline at the pitch), and each successful
// load refreshes them, so the phone can never get stuck on an old version of the app.
// Never touches Firebase, Google Fonts or any other site (those requests pass straight through).
// Bump CACHE when the list of files changes; the old cache (v1 = the single-file app) is deleted on activate.
const CACHE = 'befit-fc-v2';
const SHELL = [
  '/', '/classic.html', '/manifest.json', '/icon.svg',
  '/css/tokens.css', '/css/base.css', '/css/components.css', '/css/welcome.css', '/css/player.css',
  '/css/setup.css', '/css/console.css', '/css/fix.css', '/css/admin.css',
  '/js/core/config.js', '/js/core/store.js', '/js/core/scoring.js', '/js/core/pay.js', '/js/core/clock.js',
  '/js/core/auth.js', '/js/core/save.js', '/js/ui/components.js', '/js/ui/shell.js',
  '/js/screens/welcome.js', '/js/screens/player.js', '/js/screens/setup.js', '/js/screens/console.js',
  '/js/screens/fix.js', '/js/screens/admin.js',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  // One file failing (e.g. a rename) must not stop the new worker installing.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(
    SHELL.map(u => fetch(u, { cache: 'no-cache' }).then(r => (r.ok ? c.put(u, r) : null)).catch(() => null))
  )));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Firebase, fonts, CDNs: not ours, never cached here
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
