/* ==========================================================================
   Practice mode: open the app with ?practice to try every screen safely.
   Reads the real data once (read-only), then runs in test mode, so every
   tap stays on this phone and nothing is written to the database.
   Must load right after config.js and before store.js.
   ========================================================================== */
(function () {
  'use strict';
  if (!/[?&]practice\b/.test(location.search) || window.__BEFIT_TEST__) return;

  let data = { players: {}, sessions: {}, paymentDays: {} };
  let loaded = false;
  try {
    // Synchronous on purpose: Store.start() must see the data on its first read.
    // One read per area: the locked rules allow these, not a read of the whole database.
    loaded = ['players', 'sessions', 'paymentDays'].every(root => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', window.BF_CONFIG.firebase.databaseURL + '/' + root + '.json', false);
      xhr.send();
      if (xhr.status !== 200) return false;
      data[root] = JSON.parse(xhr.responseText) || {};
      return true;
    });
  } catch (e) { /* stay on empty data; the banner says so */ }

  window.__BEFIT_TEST__ = { data, practice: true };
  document.documentElement.classList.add('practice');

  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('a');
    bar.className = 'practice-bar';
    bar.href = location.pathname;
    bar.textContent = loaded ? 'Practice · nothing is saved · Exit ›' : "Practice · couldn't load data · Exit ›";
    document.body.insertBefore(bar, document.body.firstChild);
  });
})();
