/* ============================================================================
   BE Fit Club · js/core/config.js
   Settings shared by every file. Moved here from the classic index.html.
   window.BF_CONFIG = { firebase, sdkVersion, ADMIN_PW, seasonLabel, fee, teams, keys }
   ========================================================================== */
window.BF_CONFIG = Object.freeze({
  firebase: Object.freeze({
    apiKey:            "AIzaSyBkPZvxhklkDsl7RVL8gn3Oh9Wq2bRxF2Q",
    authDomain:        "befit-fc.firebaseapp.com",
    databaseURL:       "https://befit-fc-default-rtdb.firebaseio.com",
    projectId:         "befit-fc",
    storageBucket:     "befit-fc.firebasestorage.app",
    messagingSenderId: "695548034802",
    appId:             "1:695548034802:web:9bf35fe55f8d55ebcb5a6b",
  }),
  sdkVersion: '10.12.0',

  // Shared referee login (Firebase Auth). The referee only types the password.
  refereeEmail: "referee@befitclub.app",
  // Test mode only (the harness signs in with it). Real sign-in uses Firebase Auth.
  ADMIN_PW: "befit2024",

  seasonLabel: 'Season 2026',
  fee: 60,                                   // the usual subs, in cedis
  currency: '₵',
  teams: Object.freeze(['green', 'red', 'blue', 'gold']),   // display order
  maxOutfield: 9,                            // per side, plus 1 keeper

  // localStorage / sessionStorage keys (shared with classic.html where marked)
  keys: Object.freeze({
    viewer: 'befit_viewer',                  // shared with classic: {pid} or {pid:'guest'}
    adminSession: 'befit_admin',             // shared with classic (sessionStorage '1')
    referee: 'befit_referee',                // {email, at}
    mode: 'befit_mode',                      // 'player' | 'referee'
    theme: 'befit_theme',                    // 'auto' | 'light' | 'dark'
    consoleTheme: 'befit_console_theme',     // 'dark' | 'app'
    cache: 'befit_cache_v1',                 // last data seen, for "Can't connect"
    outbox: 'befit_outbox_v1',               // saves not yet confirmed by the database, oldest first (store.js)
    lastSeen: 'befit_admin_last_seen',       // admin card "New since you last looked"
  }),
});

// Set the theme before the first paint (config.js is the one script loaded in <head>).
// The shell (js/ui/shell.js) owns the setting after this.
(function () {
  try {
    const pref = localStorage.getItem(window.BF_CONFIG.keys.theme) || 'auto';
    const consoleDark = /^#\/ref\.console/.test(location.hash) && localStorage.getItem(window.BF_CONFIG.keys.consoleTheme) !== 'app';
    const light = !consoleDark && (pref === 'light' || (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches));
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
  } catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }
})();
