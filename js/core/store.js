/* ============================================================================
   BE Fit Club · js/core/store.js · the app's data
   ----------------------------------------------------------------------------
   One copy of the database in memory, kept live from Firebase (CDN modular SDK,
   same as classic), cached on the phone for "Can't connect", or loaded from
   window.__BEFIT_TEST__ in test mode (no Firebase at all; the "database" is in memory).

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
     Store.onStatus(fn)  fn({ status, source, savedAt, pending, failed, error }) → returns unsubscribe
       status:  'connecting' | 'online' | 'offline'
       source:  'none' | 'cache' (the phone's saved copy) | 'live' | 'test'
       savedAt: ms of the data being shown (last live sync, or the cache's time)
       pending: saves kept on this phone, not yet confirmed by the database ("Waiting to send (n)")
       failed:  0, or how many saves are stuck because the database refused the oldest one
       error:   null | 'denied' (not signed in / not allowed) | 'invalid' (the data was refused)
     Store.status() → that same object

   WRITE (all return Promises; local data updates at once)
     Store.set(path, value)          replace (null removes)
     Store.update(path, {k: v})      set each child k (keys may be 'a/b' paths; null removes)
     Store.remove(path)
     Store.push(path, value)         → Promise<key>  (key made on the phone, so retries never duplicate)
     Store.multi({ 'a/b': v, ... })  several paths in one atomic write (never mix a path and its parent)
     Store.newKey()                  → a Firebase-style push id, for writes you may need to undo or retry
     Store.retry()                   reconnect and resend now (also automatic: every 10 s while offline)
                                     (if the SDK never loaded, the page reloads once it can, at a quiet moment)

   THE OUTBOX (why a save is safe with no signal)
     Every write is first added to an outbox kept in localStorage (BF_CONFIG.keys.outbox), shown
     on the phone at once, and the Promise resolves: the save is safe even if the app is closed.
     The outbox is then sent to the database strictly in order, one at a time; an entry leaves
     the outbox only when the database confirms it. Sending waits for Firebase to be loaded and
     connected, and for Auth.ready() (so the referee's login goes with it).
       · Database refuses (permission / validation): the entry stays, sending stops, status shows
         failed + error; tried again when the login changes, on Store.retry(), and every 30 s.
       · Anything else: tried again with backoff (1 s → 30 s).
       · On start, and after every database update, unsent entries are applied on top again, so
         they never flicker away. Replays are safe: every path is set-style and keys are made first.
     No localStorage (private mode / blocked): writes go straight to the database (no outbox).
     Store.outbox() → [{ id, at, paths }] (oldest first)

   TEST MODE (window.__BEFIT_TEST__ = { data, now?, status?, latency?, failWrites?, referee? })
     Same outbox (its own key; practice mode keeps it in memory only), with an in-memory "server".
     Store.test.active
     .writes            every write the app made (at the moment it was made, incl. failed ones)
     .received          every write the "server" accepted, in order
     .server            the "server" data
     .setStatus('offline'|'online')   offline = nothing is sent; online = the outbox drains
     .failNext(n)       the next n writes fail on the phone itself ("Not saved" + Retry)
     .rejectNext(n)     the "server" refuses the next n sends (PERMISSION_DENIED)
     .dropNext(n)       the next n sends fail with a network error (retried with backoff)
     .setLatency(ms)    "server" round trip   · .setHoldMs(ms) retry gap after a refusal (default 30 s)
     .remoteChange(u)   another phone writes u; the new "server" copy arrives (unsent saves stay on top)
     .reset(data)       new "server" data, empty outbox
   ========================================================================== */
(function () {
  'use strict';
  const CFG = window.BF_CONFIG;
  const TEST = window.__BEFIT_TEST__ || null;
  const ROOTS = ['players', 'sessions', 'paymentDays'];
  const T0 = Date.now();

  let state = { players: {}, sessions: {}, paymentDays: {} };
  let version = 0;
  let status = 'connecting', source = 'none', savedAt = 0, inflight = 0;
  let fb = null, connecting = false, connected = false, everConnected = false;
  let retryTimer = null, cacheTimer = null, started = false;
  const dataListeners = new Set(), statusListeners = new Set();
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });

  // ---------------------------------------------------------------- paths
  const keysOf = p => String(p || '').split('/').filter(Boolean);
  const isEmptyObj = v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0;
  const clone = v => JSON.parse(JSON.stringify(v));

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
  function applyTo(base, updates) {
    let next = base;
    for (const [path, value] of Object.entries(updates)) next = assocIn(next, keysOf(path), normalize(value));
    return withRoots(next);
  }

  // ---------------------------------------------------------------- emit
  function emitData(paths) {
    version++;
    const info = { version, paths };
    dataListeners.forEach(fn => { try { fn(info); } catch (e) { console.error(e); } });
  }
  function statusInfo() {
    return { status, source, savedAt, pending: outbox.length + inflight, failed: hold ? outbox.length : 0, error: hold ? hold.reason : null };
  }
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
    state = applyTo(state, updates);
    emitData(Object.keys(updates));
  }
  // A fresh copy of one root from the database: unsent outbox entries go back on top.
  function replaceRoot(root, value) {
    state = withOutbox(withRoots(Object.assign({}, state, { [root]: value || {} })));
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

  // ---------------------------------------------------------------- outbox
  // Test mode keeps its own key so a test can never leave saves for the real app; practice keeps none.
  const OUTBOX_KEY = TEST ? (TEST.practice ? null : CFG.keys.outbox + '_test') : CFG.keys.outbox;
  const BACKOFF_MAX = 30000;
  let outbox = [];            // [{ id, updates, at }] oldest first
  let useOutbox = false;      // false = no phone storage: writes go straight to the database (no outbox)
  let durable = false;        // true = the outbox is in localStorage (survives closing the app)
  let storageFull = false;    // the last save to localStorage failed: trust memory, not storage
  let authReady = false, flushing = false, flushTimer = null, backoffMs = 0;
  let hold = null, holdTimer = null, holdMs = (TEST && TEST.holdMs) || 30000;   // hold = { reason, message, at }

  function storageWorks() {
    try { const k = '__befit_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; }
  }
  function validEntry(e) { return e && typeof e.id === 'string' && e.updates && typeof e.updates === 'object'; }
  function readStored() {
    if (!durable || storageFull) return null;
    try {
      const raw = localStorage.getItem(OUTBOX_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(validEntry) : [];
    } catch (e) { return null; }
  }
  function writeStored(list) {
    if (!durable) return true;
    const raw = JSON.stringify(list);
    try { localStorage.setItem(OUTBOX_KEY, raw); storageFull = false; return true; } catch (e) { /* full: make room below */ }
    // Unsent saves matter more than the "Can't connect" copy of the data: drop that and try again.
    try { localStorage.removeItem(CFG.keys.cache); localStorage.setItem(OUTBOX_KEY, raw); storageFull = false; return true; } catch (e) { /* still full */ }
    storageFull = true;
    console.warn('BE Fit: phone storage is full; unsent saves are kept until the app closes');
    return false;
  }
  function initOutbox() {
    if (!OUTBOX_KEY) { useOutbox = true; durable = false; return; }      // practice: in memory only
    useOutbox = durable = storageWorks();
    outbox = readStored() || [];
  }
  // Change the outbox from its saved copy (another tab of the app may have changed it).
  function mutateOutbox(fn) {
    const saved = readStored();
    if (saved) outbox = saved;
    outbox = fn(outbox.slice());
    writeStored(outbox);
    emitStatus();
  }
  function withOutbox(s) {
    let next = s;
    for (const e of outbox) next = applyTo(next, e.updates);
    return next;
  }

  function canSend() {
    if (!useOutbox || !outbox.length || hold || !authReady) return false;
    if (TEST) return status !== 'offline';
    return !!fb && connected;
  }
  function kick(ms) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { flushTimer = null; flush(); }, ms || 0);
  }
  // Send the outbox in order, one entry at a time; only one tab of the app sends at once.
  function flush() {
    if (flushing || !canSend()) return Promise.resolve();
    flushing = true;
    const run = () => drain().catch(e => console.error(e)).then(() => { flushing = false; });
    const locks = navigator.locks;
    const p = locks && locks.request ? locks.request('befit-outbox', run).catch(() => run()) : run();
    return p.then(() => { if (canSend() && !flushTimer) kick(0); });
  }
  async function drain() {
    while (canSend()) {
      const saved = readStored();
      if (saved) outbox = saved;
      const e = outbox[0];
      if (!e) break;
      try { await send(e.updates); }
      catch (err) { sendFailed(err); return; }
      backoffMs = 0;
      mutateOutbox(list => list.filter(x => x.id !== e.id));
    }
  }
  function send(updates) {
    if (TEST) return testSend(updates);
    return Promise.resolve().then(() => fb.update(fb.ref(fb.db), updates));
  }
  // 'denied' / 'invalid' = the database said no (waiting will not help); null = try again soon.
  function refusal(err) {
    const s = (String((err && err.code) || '') + ' ' + String((err && err.message) || '')).toLowerCase();
    if (/permission[_ ]denied|invalid_token|expired_token|unauthori[sz]ed/.test(s)) return 'denied';
    if (/invalid|validat|contains undefined|too_big|too big/.test(s)) return 'invalid';
    return null;
  }
  function sendFailed(err) {
    const reason = refusal(err);
    if (!reason) {
      backoffMs = Math.min(BACKOFF_MAX, backoffMs ? backoffMs * 2 : 1000);
      kick(backoffMs);
      return;
    }
    console.warn('BE Fit: the database refused a save; it stays on this phone', err && err.message);
    hold = { reason, message: (err && err.message) || '', at: Date.now() };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => releaseHold(), holdMs);
    emitStatus();
  }
  function releaseHold() {
    clearTimeout(holdTimer); holdTimer = null;
    if (hold) { hold = null; emitStatus(); }
    backoffMs = 0;
    flush();
  }

  // Wait for the login before sending, and try again whenever it changes.
  function watchAuth() {
    const A = window.Auth;
    const waitFor = A && typeof A.ready === 'function' ? A.ready() : null;
    Promise.resolve(waitFor).catch(() => {}).then(() => { authReady = true; flush(); });
    if (A && typeof A.onChange === 'function') A.onChange(() => releaseHold());
  }
  // Another tab of the app on this phone changed the outbox.
  function watchOtherTabs() {
    if (!durable) return;
    window.addEventListener('storage', ev => {
      if (ev.key !== OUTBOX_KEY) return;
      const saved = readStored();
      if (!saved) return;
      const known = new Set(outbox.map(x => x.id));
      const fresh = saved.filter(x => !known.has(x.id));
      outbox = saved;
      if (fresh.length) { let next = state; fresh.forEach(x => { next = applyTo(next, x.updates); }); state = next; emitData(ROOTS); }
      emitStatus();
      flush();
    });
  }

  // ---------------------------------------------------------------- writes
  const testCfg = { failNext: 0, rejectNext: 0, dropNext: 0, latency: (TEST && TEST.latency) || 120, queue: [], writes: [], received: [] };
  let server = null;   // test mode: the in-memory "database"

  // Firebase refuses `undefined` anywhere; the outbox is JSON. Both want plain JSON values.
  const plain = updates => JSON.parse(JSON.stringify(updates, (k, v) => (v === undefined ? null : v)));

  function write(updates) {
    updates = plain(updates);
    if (TEST) {
      const fail = testCfg.failNext > 0 ? (testCfg.failNext--, true) : !!TEST.failWrites;
      testCfg.writes.push({ at: now(), updates: clone(updates), failed: fail });
      if (fail) return new Promise((_, reject) => setTimeout(() => reject(new Error('Not saved')), testCfg.latency));
    }
    if (!useOutbox) return direct(updates);
    const entry = { id: newKey(), updates, at: Date.now() };
    mutateOutbox(list => list.concat([entry]));
    applyLocal(updates);
    kick(0);
    return Promise.resolve();
  }

  // No phone storage: today's behaviour (straight to the database; Firebase keeps it in memory).
  function track(promise) {
    inflight++; emitStatus();
    const done = () => { inflight = Math.max(0, inflight - 1); emitStatus(); };
    promise.then(done, done);
    return promise;
  }
  function direct(updates) {
    if (TEST) {
      applyLocal(updates);
      return track(testSend(updates));
    }
    if (!fb) return Promise.reject(new Error('Not connected'));
    return track(Promise.resolve().then(() => fb.update(fb.ref(fb.db), updates)));
  }

  // The test "server": one round trip, then it accepts (or refuses) the write.
  function testSend(updates) {
    return new Promise((resolve, reject) => {
      const arrive = () => {
        if (testCfg.rejectNext > 0) {
          testCfg.rejectNext--;
          const err = new Error('PERMISSION_DENIED: Permission denied'); err.code = 'PERMISSION_DENIED';
          reject(err); return;
        }
        if (testCfg.dropNext > 0) { testCfg.dropNext--; reject(new Error('Network error')); return; }
        server = applyTo(server, updates);
        testCfg.received.push({ at: now(), updates: clone(updates) });
        resolve();
      };
      setTimeout(() => { if (status === 'offline') testCfg.queue.push(arrive); else arrive(); }, testCfg.latency);
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
    if (fb || connecting) return;
    connecting = true;
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
        connected = snap.val() === true;
        if (connected) { everConnected = true; if (source === 'live') setStatus('online'); flush(); }
        else if (everConnected) setStatus('offline');
      });
    } catch (e) {
      // No SDK (no signal and not saved on the phone yet): saves stay in the outbox; retried every 10 s.
      console.warn('BE Fit: could not load Firebase', e && e.message);
      fb = null; sdkFailed = true; setStatus('offline'); scheduleRetry();
    } finally { connecting = false; }
  }
  // The browser remembers a failed module import for the life of the page, so importing again can
  // never work. Once the SDK can be fetched again, reload at a quiet moment (no sheet, no Undo bar,
  // no typing). Safe: unsent saves are in the outbox and the data is in the phone's cache.
  let sdkFailed = false;
  const RELOAD_KEY = 'befit_sdk_reload_at';
  function quietMoment() {
    try {
      const a = document.activeElement;
      return !document.querySelector('.sheet, #app-undo .undo') && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
    } catch (e) { return false; }
  }
  function reloadForSdk() {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last < 5 * 60000) return;            // at most once every 5 minutes: never a reload loop
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch (e) { return; }
    location.reload();
  }
  function retrySdk() {
    if (connecting) return;
    connecting = true;
    fetch(`https://www.gstatic.com/firebasejs/${CFG.sdkVersion}/firebase-app.js`, { mode: 'cors', cache: 'no-store' })
      .then(r => r.ok, () => false)
      .then(ok => { connecting = false; if (ok && quietMoment()) reloadForSdk(); });
  }
  function scheduleRetry() {
    if (retryTimer || TEST) return;
    retryTimer = setInterval(() => retry(), 10000);
  }
  function clearRetry() { if (retryTimer) { clearInterval(retryTimer); retryTimer = null; } }
  function retry() {
    if (hold) { clearTimeout(holdTimer); holdTimer = null; hold = null; }
    backoffMs = 0;
    if (!TEST) {
      if (!fb) { if (sdkFailed) retrySdk(); else connectFirebase(); }
      else { try { fb.goOffline(fb.db); fb.goOnline(fb.db); } catch (e) { /* ignore */ } }
    }
    emitStatus();
    flush();
  }

  // ---------------------------------------------------------------- start
  function start() {
    if (started) return ready;
    started = true;
    initOutbox();
    if (TEST) {
      server = withRoots(clone(TEST.data || {}));
      state = withOutbox(server);
      source = 'test'; savedAt = now(); status = TEST.status || 'online';
      emitData(ROOTS); markReady(); emitStatus();
      watchAuth();
      return ready;
    }
    const cached = loadCache();
    if (outbox.length) state = withOutbox(state);     // unsent saves from last time go back on top
    if (cached) { emitData(ROOTS); markReady(); }
    if (navigator.onLine === false) setStatus('offline');    // the phone already knows: say so now, not after 8 s
    emitStatus();
    watchAuth();
    watchOtherTabs();
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
    outbox: () => outbox.map(e => ({ id: e.id, at: e.at, paths: Object.keys(e.updates) })),
    // For checks only: is the SDK loaded, is the database connected, is sending waiting on anything.
    link: () => ({ sdk: !!fb, connected: TEST ? status !== 'offline' : connected, authReady, durable, flushing, hold: hold ? hold.reason : null }),
    on(fn) { dataListeners.add(fn); return () => dataListeners.delete(fn); },
    onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); },
    set, update, remove, push, multi,
    test: TEST ? {
      active: true,
      get writes() { return testCfg.writes; },
      get received() { return testCfg.received; },
      get server() { return server; },
      setStatus(s) {
        status = s; emitStatus();
        if (s === 'online') { const q = testCfg.queue.splice(0); q.forEach(f => f()); flush(); }
      },
      failNext(n) { testCfg.failNext = n == null ? 1 : n; },
      rejectNext(n) { testCfg.rejectNext = n == null ? 1 : n; },
      dropNext(n) { testCfg.dropNext = n == null ? 1 : n; },
      setLatency(ms) { testCfg.latency = ms; },
      setHoldMs(ms) { holdMs = ms; },
      // Another phone writes to the "server", and its new copy arrives here (like a live update).
      remoteChange(updates) {
        server = applyTo(server, plain(updates));
        state = withOutbox(server);
        emitData(Object.keys(updates));
      },
      reset(data) {
        server = withRoots(clone(data || {}));
        clearTimeout(holdTimer); hold = null;
        mutateOutbox(() => []);
        state = server; emitData(ROOTS);
      },
    } : { active: false },
  };
  window.Store = Store;
})();
