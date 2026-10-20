/* ============================================================================
   BE Fit Club · js/core/store.js · the app's data
   ----------------------------------------------------------------------------
   One copy of the database in memory, kept live from Firebase (CDN modular SDK,
   same as classic), cached on the phone for "Can't connect", or loaded from
   window.__BEFIT_TEST__ in test mode (no Firebase at all; writes stay in memory).

   READ
     Store.state                    → { players, sessions, paymentDays } (replaced on every change; never mutate it)
     Store.version                  → increments on every change
     Store.get('sessions/abc/events')
     Store.players() / sessions() / paymentDays()
     Store.player(pid) / session(sid)
     Store.activeSessionId() / activeSession()      first session with status 'active'
     Store.now()                    → ms; honours __BEFIT_TEST__.now in test mode
     Store.ready                    → Promise, resolves when any data (test, cache or live) is in

   LISTEN
     Store.on(fn)        fn({ version, paths })               → returns unsubscribe
     Store.onStatus(fn)  fn({ status, source, savedAt, pending }) → returns unsubscribe
       status:  'connecting' | 'online' | 'offline'
       source:  'none' | 'cache' (the phone's saved copy) | 'live' | 'test'
       savedAt: ms of the data being shown (last live sync, or the cache's time)
       pending: writes not yet confirmed by the database ("Waiting to send (n)")
     Store.status() → that same object

   WRITE (all return Promises; local data updates at once, like Firebase)
     Store.set(path, value)          replace (null removes)
     Store.update(path, {k: v})      set each child k (keys may be 'a/b' paths; null removes)
     Store.remove(path)
     Store.push(path, value)         → Promise<key>  (key made on the phone, so retries never duplicate)
     Store.multi({ 'a/b': v, ... })  several paths in one atomic write (never mix a path and its parent)
     Store.newKey()                  → a Firebase-style push id, for writes you may need to undo or retry
     Store.retry()                   reconnect now (also automatic every 10 s while offline)

   TEST MODE (window.__BEFIT_TEST__ = { data, now?, status?, latency?, failWrites?, referee? })
     Store.test.active, .writes (log), .setStatus('offline'|'online'), .failNext(n), .setLatency(ms), .reset(data)
   ========================================================================== */
(function () {
  'use strict';
  const CFG = window.BF_CONFIG;
  const TEST = window.__BEFIT_TEST__ || null;
  const ROOTS = ['players', 'sessions', 'paymentDays'];
  const T0 = Date.now();

  let state = { players: {}, sessions: {}, paymentDays: {} };
  let version = 0;
  let status = 'connecting', source = 'none', savedAt = 0, pending = 0;
  let fb = null, everConnected = false, retryTimer = null, cacheTimer = null, started = false;
  const dataListeners = new Set(), statusListeners = new Set();
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });

  // ---------------------------------------------------------------- paths
  const keysOf = p => String(p || '').split('/').filter(Boolean);
  const isEmptyObj = v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0;

  function getIn(obj, keys) {
    return keys.reduce((o, k) => (o != null && typeof o === 'object' ? o[k] : undefined), obj);
  }
  // Firebase semantics: null / undefined / {} are "nothing".
  function normalize(v) {
    if (v === undefined || v === null) return null;
    if (Array.isArray(v)) return v.map(normalize);
    if (typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v)) { const n = normalize(v[k]); if (n !== null) out[k] = n; }
      return Object.keys(out).length ? out : null;
    }
    return v;
  }
  // Copy-on-write set; prunes empty parents like Firebase does.
  function assocIn(obj, keys, val) {
    if (!keys.length) return val;
    const [k, ...rest] = keys;
    const base = obj && typeof obj === 'object' ? obj : {};
    const child = rest.length ? assocIn(base[k], rest, val) : val;
    const out = Object.assign({}, base);
    if (child === null || child === undefined || isEmptyObj(child)) delete out[k]; else out[k] = child;
    return out;
  }
  function withRoots(s) {
    const out = Object.assign({}, s);
    ROOTS.forEach(r => { if (!out[r] || typeof out[r] !== 'object') out[r] = {}; });
    return out;
  }

  // ---------------------------------------------------------------- emit
  function emitData(paths) {
    version++;
    const info = { version, paths };
    dataListeners.forEach(fn => { try { fn(info); } catch (e) { console.error(e); } });
  }
  function statusInfo() { return { status, source, savedAt, pending }; }
  function emitStatus() {
    const info = statusInfo();
    statusListeners.forEach(fn => { try { fn(info); } catch (e) { console.error(e); } });
  }
  function setStatus(s) {
    if (s === status) return;
    status = s;
    if (s === 'offline') scheduleRetry(); else clearRetry();
    emitStatus();
  }

  function applyLocal(updates) {
    let next = state;
    for (const [path, value] of Object.entries(updates)) next = assocIn(next, keysOf(path), normalize(value));
    state = withRoots(next);
    emitData(Object.keys(updates));
  }
  function replaceRoot(root, value) {
    state = withRoots(Object.assign({}, state, { [root]: value || {} }));
    emitData([root]);
  }
  function markReady() { if (resolveReady) { resolveReady(state); resolveReady = null; } }

  // ---------------------------------------------------------------- push ids
  const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
  let lastPushTime = 0; const lastRand = [];
  function newKey() {
    let t = Date.now();
    const dup = t === lastPushTime; lastPushTime = t;
    const ts = new Array(8);
    for (let i = 7; i >= 0; i--) { ts[i] = PUSH_CHARS.charAt(t % 64); t = Math.floor(t / 64); }
    let id = ts.join('');
    if (!dup) { for (let i = 0; i < 12; i++) lastRand[i] = Math.floor(Math.random() * 64); }
    else { let i = 11; for (; i >= 0 && lastRand[i] === 63; i--) lastRand[i] = 0; if (i >= 0) lastRand[i]++; }
    for (let i = 0; i < 12; i++) id += PUSH_CHARS.charAt(lastRand[i]);
    return id;
  }

  // ---------------------------------------------------------------- writes
  const testCfg = { failNext: 0, latency: (TEST && TEST.latency) || 120, queue: [], writes: [] };

  function track(promise) {
    pending++; emitStatus();
    const done = () => { pending = Math.max(0, pending - 1); emitStatus(); };
    promise.then(done, done);
    return promise;
  }

  function write(updates) {
    if (TEST) return track(testWrite(updates));
    if (!fb) return Promise.reject(new Error('Not connected'));
    return track(fb.update(fb.ref(fb.db), updates));
  }

  function testWrite(updates) {
    return new Promise((resolve, reject) => {
      const fail = testCfg.failNext > 0 ? (testCfg.failNext--, true) : !!TEST.failWrites;
      testCfg.writes.push({ at: now(), updates: JSON.parse(JSON.stringify(updates)), failed: fail });
      if (fail) { setTimeout(() => reject(new Error('Not saved')), testCfg.latency); return; }
      applyLocal(updates);                       // shows at once, like Firebase
      const finish = () => setTimeout(resolve, testCfg.latency);
      if (status === 'offline') testCfg.queue.push(finish); else finish();
    });
  }

  function set(path, value) { return write({ [keysOf(path).join('/')]: value === undefined ? null : value }); }
  function update(path, obj) {
    const base = keysOf(path).join('/');
    const u = {};
    for (const [k, v] of Object.entries(obj || {})) u[base ? base + '/' + k : k] = v === undefined ? null : v;
    return write(u);
  }
  function remove(path) { return set(path, null); }
  function push(path, value) { const key = newKey(); return set(keysOf(path).concat(key).join('/'), value).then(() => key); }
  function multi(updates) { return write(updates); }

  // ---------------------------------------------------------------- cache
  function loadCache() {
    try {
      const raw = localStorage.getItem(CFG.keys.cache);
      if (!raw) return false;
      const c = JSON.parse(raw);
      if (!c || !c.data) return false;
      state = withRoots(c.data); savedAt = c.savedAt || 0; source = 'cache';
      emitData(ROOTS); markReady(); emitStatus();
      return true;
    } catch (e) { return false; }
  }
  function saveCacheSoon() {
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => {
      try { localStorage.setItem(CFG.keys.cache, JSON.stringify({ savedAt: Date.now(), data: state })); } catch (e) { /* full: ignore */ }
    }, 1500);
  }

  // ---------------------------------------------------------------- firebase
  async function connectFirebase() {
    try {
      const v = CFG.sdkVersion;
      const appMod = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`);
      const dbMod = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-database.js`);
      const app = appMod.getApps && appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(CFG.firebase);
      const db = dbMod.getDatabase(app);
      fb = Object.assign({ db }, dbMod);
      const arrived = new Set();
      ROOTS.forEach(root => {
        dbMod.onValue(dbMod.ref(db, root), snap => {
          arrived.add(root);
          replaceRoot(root, snap.val() || {});
          if (arrived.size === ROOTS.length) {
            source = 'live'; savedAt = Date.now(); markReady(); saveCacheSoon();
            if (status !== 'online') { status = 'online'; clearRetry(); }
            emitStatus();
          }
        }, err => { console.warn('BE Fit: read refused', root, err && err.message); setStatus('offline'); });
      });
      dbMod.onValue(dbMod.ref(db, '.info/connected'), snap => {
        if (snap.val() === true) { everConnected = true; if (source === 'live') setStatus('online'); }
        else if (everConnected) setStatus('offline');
      });
    } catch (e) {
      console.warn('BE Fit: could not load Firebase', e && e.message);
      fb = null; setStatus('offline');
    }
  }
  function scheduleRetry() {
    if (retryTimer || TEST) return;
    retryTimer = setInterval(() => retry(), 10000);
  }
  function clearRetry() { if (retryTimer) { clearInterval(retryTimer); retryTimer = null; } }
  function retry() {
    if (TEST) { emitStatus(); return; }
    if (!fb) { connectFirebase(); return; }
    try { fb.goOffline(fb.db); fb.goOnline(fb.db); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- start
  function start() {
    if (started) return ready;
    started = true;
    if (TEST) {
      state = withRoots(JSON.parse(JSON.stringify(TEST.data || {})));
      source = 'test'; savedAt = now(); status = TEST.status || 'online';
      emitData(ROOTS); markReady(); emitStatus();
      return ready;
    }
    loadCache();
    connectFirebase();
    setTimeout(() => { if (source !== 'live') setStatus('offline'); }, 8000);
    return ready;
  }

  function now() { return TEST && TEST.now ? TEST.now + (Date.now() - T0) : Date.now(); }

  function activeSessionId() {
    for (const [id, s] of Object.entries(state.sessions || {})) if (s && s.status === 'active') return id;
    return null;
  }

  const Store = {
    get state() { return state; },
    get version() { return version; },
    get: path => getIn(state, keysOf(path)),
    players: () => state.players || {},
    sessions: () => state.sessions || {},
    paymentDays: () => state.paymentDays || {},
    player: pid => (state.players || {})[pid] || null,
    session: sid => (state.sessions || {})[sid] || null,
    activeSessionId,
    activeSession: () => { const id = activeSessionId(); return id ? state.sessions[id] : null; },
    now, ready, start, retry, newKey,
    status: statusInfo,
    hasData: () => source !== 'none',
    on(fn) { dataListeners.add(fn); return () => dataListeners.delete(fn); },
    onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); },
    set, update, remove, push, multi,
    test: TEST ? {
      active: true,
      get writes() { return testCfg.writes; },
      setStatus(s) {
        status = s; emitStatus();
        if (s === 'online') { const q = testCfg.queue.splice(0); q.forEach(f => f()); }
      },
      failNext(n) { testCfg.failNext = n == null ? 1 : n; },
      setLatency(ms) { testCfg.latency = ms; },
      reset(data) { state = withRoots(JSON.parse(JSON.stringify(data || {}))); emitData(ROOTS); },
    } : { active: false },
  };
  window.Store = Store;
})();
