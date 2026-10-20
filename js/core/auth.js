/* ============================================================================
   BE Fit Club · js/core/auth.js · who is signed in
   ----------------------------------------------------------------------------
   The ONLY file that knows how referee sign-in works. Tomorrow it swaps to
   Firebase Auth; nothing else should need to change.

     Auth.signIn(email, password) → Promise<user>  (rejects with Error('Wrong email or password'))
     Auth.signOut()               → Promise
     Auth.isReferee()             → bool
     Auth.isAdmin()               → bool  (Reuben; for now the same as isReferee)
     Auth.user()                  → { email, name, role, at } | null
     Auth.by()                    → short string for `by` fields on writes ('referee' or the email)
     Auth.onChange(fn)            fn(user|null) → returns unsubscribe
   Remembered per phone (localStorage), so a refresh at the pitch keeps the referee in.
   Test mode: window.__BEFIT_TEST__.referee = true starts signed in.
   ========================================================================== */
(function () {
  'use strict';
  const CFG = window.BF_CONFIG;
  const TEST = window.__BEFIT_TEST__ || null;
  const listeners = new Set();
  let user = null;

  try { const raw = localStorage.getItem(CFG.keys.referee); if (raw) user = JSON.parse(raw); } catch (e) { user = null; }
  if (TEST) user = TEST.referee ? { email: 'referee@test', name: 'Referee', role: 'referee', at: Date.now() } : null;

  function emit() { listeners.forEach(fn => { try { fn(user); } catch (e) { console.error(e); } }); }
  function persist() {
    if (TEST) return;
    try {
      if (user) { localStorage.setItem(CFG.keys.referee, JSON.stringify(user)); sessionStorage.setItem(CFG.keys.adminSession, '1'); }
      else { localStorage.removeItem(CFG.keys.referee); sessionStorage.removeItem(CFG.keys.adminSession); }
    } catch (e) { /* storage blocked: stays signed in for this page only */ }
  }

  async function signIn(email, password) {
    // TODO(auth): replace with Firebase Auth (signInWithEmailAndPassword) and drop ADMIN_PW.
    // For now any email is accepted; only the shared password is checked, on the phone.
    await new Promise(r => setTimeout(r, 250));
    if (String(password || '') !== CFG.ADMIN_PW) throw new Error('Wrong email or password');
    const em = String(email || '').trim();
    user = { email: em || 'referee', name: em ? em.split('@')[0] : 'Referee', role: 'referee', at: Date.now() };
    persist(); emit();
    return user;
  }

  async function signOut() {
    // TODO(auth): Firebase Auth signOut()
    user = null; persist(); emit();
  }

  window.Auth = {
    signIn, signOut,
    isReferee: () => !!user,
    isAdmin: () => !!user,          // TODO(auth): true only for Reuben's account
    user: () => user,
    by: () => (user ? (user.email || 'referee') : 'player'),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
