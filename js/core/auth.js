/* ============================================================================
   BE Fit Club · js/core/auth.js · who is signed in
   ----------------------------------------------------------------------------
   The ONLY file that knows how sign-in works. Uses Firebase Auth
   (email + password). Roles live in the database at roles/{uid}:
   'admin' (Reuben) or 'referee' (one shared login). The referee only types
   the password; the shared email is filled in here.

     Auth.signIn(email, password) → Promise<user>  (rejects with a plain-English Error)
     Auth.signOut()               → Promise
     Auth.isReferee()             → bool  (admin counts as referee too)
     Auth.isAdmin()               → bool  (Reuben only)
     Auth.user()                  → { email, uid, name, role, at } | null
     Auth.by()                    → short string for `by` fields on writes ('referee' or the admin's email)
     Auth.onChange(fn)            fn(user|null) → returns unsubscribe
     Auth.ready()                 → Promise: resolves once Firebase Auth has answered for a cached
                                    login (so saves go with it); at once in test mode, when nobody
                                    is signed in, or when the sign-in code can't load (no signal)
   The last signed-in user is cached per phone, so a refresh at the pitch with
   no signal keeps the referee in; Firebase Auth re-confirms when it can.
   Test mode (window.__BEFIT_TEST__): no Firebase. Tests sign in with ADMIN_PW
   as an admin; practice mode accepts any password (nothing can be saved there).
   ========================================================================== */
(function () {
  'use strict';
  const CFG = window.BF_CONFIG;
  const TEST = window.__BEFIT_TEST__ || null;
  const listeners = new Set();
  let user = null;
  let fbp = null;   // Promise<{ auth, mod, db, dbMod }>
  let watching = false;
  let resolveReady = null;
  const readyP = new Promise(r => { resolveReady = r; });
  function markReady() { if (resolveReady) { resolveReady(); resolveReady = null; } }

  try { const raw = localStorage.getItem(CFG.keys.referee); if (raw) user = JSON.parse(raw); } catch (e) { user = null; }
  if (TEST) user = TEST.referee ? { email: 'referee@test', name: 'Referee', role: 'admin', at: Date.now() } : null;

  function emit() { listeners.forEach(fn => { try { fn(user); } catch (e) { console.error(e); } }); }
  function persist() {
    if (TEST) return;
    try {
      if (user) { localStorage.setItem(CFG.keys.referee, JSON.stringify(user)); sessionStorage.setItem(CFG.keys.adminSession, '1'); }
      else { localStorage.removeItem(CFG.keys.referee); sessionStorage.removeItem(CFG.keys.adminSession); }
    } catch (e) { /* storage blocked: stays signed in for this page only */ }
  }
  function set(next) { user = next; persist(); emit(); }

  function firebase() {
    if (!fbp) {
      fbp = (async () => {
        const v = CFG.sdkVersion;
        const appMod = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`);
        const mod = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-auth.js`);
        const dbMod = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-database.js`);
        const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(CFG.firebase);
        const auth = mod.getAuth(app);
        await mod.setPersistence(auth, mod.browserLocalPersistence);
        return { auth, mod, db: dbMod.getDatabase(app), dbMod };
      })();
      fbp.catch(() => { fbp = null; });
    }
    return fbp;
  }

  async function roleOf(fb, uid) {
    const snap = await fb.dbMod.get(fb.dbMod.ref(fb.db, 'roles/' + uid));
    return snap.val();
  }
  function shape(fbUser, role) {
    const email = fbUser.email || '';
    return { email, uid: fbUser.uid, name: role === 'referee' ? 'Referee' : email.split('@')[0], role, at: Date.now() };
  }

  // Keep the cached user in step with Firebase once it answers.
  function watch() {
    if (TEST || !user) { markReady(); return; }   // players never load the sign-in code
    watching = true;
    setTimeout(markReady, 15000);   // never hold saves back forever: a refused save is retried when the login changes
    firebase().then(fb => {
      fb.mod.onAuthStateChanged(fb.auth, async fbUser => {
        markReady();
        if (!fbUser) { if (user) set(null); return; }
        let role = user && user.uid === fbUser.uid ? user.role : null;
        try { role = await roleOf(fb, fbUser.uid); } catch (e) { /* offline: keep the cached role */ }
        if (!role) { await fb.mod.signOut(fb.auth); set(null); return; }
        set(shape(fbUser, role));
      });
    }).catch(() => { markReady(); /* no signal: keep the cached user until Firebase loads */ });
  }

  const ERRORS = {
    'auth/invalid-credential': 'Wrong password',
    'auth/wrong-password': 'Wrong password',
    'auth/user-not-found': 'Wrong email or password',
    'auth/invalid-email': 'Check the email',
    'auth/too-many-requests': 'Too many tries. Wait a minute and try again',
    'auth/network-request-failed': 'No signal. Try again when you have signal',
  };

  async function signIn(email, password) {
    const em = String(email || '').trim().toLowerCase();
    const pw = String(password || '');
    if (!pw) throw new Error('Enter the password');

    if (TEST) {
      await new Promise(r => setTimeout(r, 250));
      const isReferee = !em || em === CFG.refereeEmail;
      if (!TEST.practice && pw !== CFG.ADMIN_PW) throw new Error('Wrong email or password');
      set({ email: isReferee ? CFG.refereeEmail : em, name: isReferee ? 'Referee' : em.split('@')[0], role: isReferee && TEST.practice ? 'referee' : 'admin', at: Date.now() });
      return user;
    }

    let fb;
    try { fb = await firebase(); } catch (e) { throw new Error(ERRORS['auth/network-request-failed']); }
    let cred;
    try { cred = await fb.mod.signInWithEmailAndPassword(fb.auth, em || CFG.refereeEmail, pw); }
    catch (e) { throw new Error(ERRORS[e && e.code] || (em ? 'Wrong email or password' : 'Wrong password')); }
    let role = null;
    try { role = await roleOf(fb, cred.user.uid); } catch (e) { /* handled below */ }
    if (!role) { await fb.mod.signOut(fb.auth); throw new Error("This login isn't set up for BE Fit Club"); }
    set(shape(cred.user, role));
    if (!watching) watch();
    return user;
  }

  async function signOut() {
    if (!TEST) { try { const fb = await firebase(); await fb.mod.signOut(fb.auth); } catch (e) { /* offline: forget locally */ } }
    set(null);
  }

  window.Auth = {
    signIn, signOut,
    isReferee: () => !!user,
    isAdmin: () => !!user && user.role === 'admin',
    user: () => user,
    by: () => (user ? (user.role === 'referee' ? 'referee' : (user.email || 'admin')) : 'player'),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    ready: () => readyP,
  };
  watch();
})();
