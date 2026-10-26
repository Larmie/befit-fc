/* ============================================================================
   Practice mode: open the app with ?practice to try every screen safely.
   Reads the real data once (read-only), then runs in test mode, so every
   tap stays on this phone and nothing is written to the database.
   Must load right after config.js and before store.js.

   PRACTICE PASSWORD (round 7). Admin › Settings › Access sets `settings/practice = { hash, salt, updatedAt }`,
   hash = hex SHA-256 of (salt + password). Until it is set, practice opens as before. Once it is set, ?practice
   shows a small sheet ("Practice mode … Start practice ›") before anything starts; the right password stores
   sessionStorage[BF_CONFIG.keys.practiceOk] = '1' (skips the question for the rest of this visit) and reloads.
   While the sheet is up the app underneath runs on EMPTY data in test mode, so nothing real shows and nothing can
   be written. A signed-in admin who taps the practice link from the app skips the question (a 60-second stamp).
   The helpers below (window.PracticePw) also load in Node for tests/unit/practicegate.test.js.
   ========================================================================== */
(function (root) {
  'use strict';

  // ---- password helpers (browser + Node) ---------------------------------------------------------------------
  const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  const subtle = () => (root.crypto && root.crypto.subtle) || null;
  function newSalt() {
    const a = new Uint8Array(16);
    root.crypto.getRandomValues(a);
    return hex(a);
  }
  async function hashOf(salt, password) {
    const s = subtle();
    if (!s) throw new Error('No secure connection');
    return hex(await s.digest('SHA-256', new TextEncoder().encode(String(salt) + String(password))));
  }
  const isSet = settings => !!(settings && settings.practice && typeof settings.practice.hash === 'string' && settings.practice.hash && settings.practice.salt);
  // { hash, salt } for a new password (a fresh 16-byte salt every time)
  async function make(password) {
    const salt = newSalt();
    return { hash: await hashOf(salt, password), salt };
  }
  async function verify(password, rec) {
    if (!rec || !rec.hash || !rec.salt) return false;
    const h = await hashOf(rec.salt, password);
    let diff = h.length ^ String(rec.hash).length;
    for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ String(rec.hash).charCodeAt(i);
    return diff === 0;
  }
  const ADMIN_STAMP = 'befit_practice_admin';
  function adminPass() { try { localStorage.setItem(ADMIN_STAMP, String(Date.now())); } catch (e) { /* ignore */ } }
  function adminPassFresh() {
    try { const t = Number(localStorage.getItem(ADMIN_STAMP)); localStorage.removeItem(ADMIN_STAMP); return t > 0 && Date.now() - t < 60000; } catch (e) { return false; }
  }
  // The question is asked only when the data loaded, a password is set, and it hasn't been answered this visit.
  const needsGate = (loaded, settings, passed) => !!loaded && isSet(settings) && !passed;
  const api = { hashOf, newSalt, make, verify, isSet, needsGate, adminPass, MIN_LENGTH: 4 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;
  root.PracticePw = api;

  // ---- practice mode itself ----------------------------------------------------------------------------------
  if (!/[?&]practice\b/.test(location.search) || window.__BEFIT_TEST__) return;

  let data = { players: {}, sessions: {}, paymentDays: {}, settings: {} };
  let loaded = false;
  const read = path => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', window.BF_CONFIG.firebase.databaseURL + '/' + path + '.json', false);
    xhr.send();
    if (xhr.status !== 200) return false;
    data[path] = JSON.parse(xhr.responseText) || {};
    return true;
  };
  try {
    // Synchronous on purpose: Store.start() must see the data on its first read.
    // One read per area: the locked rules allow these, not a read of the whole database.
    loaded = ['players', 'sessions', 'paymentDays'].every(read);
    // Round 5 settings (club + teams) are optional: missing or not readable = today's Red/Green defaults.
    if (loaded) { try { read('settings'); } catch (e) { /* defaults */ } }
  } catch (e) { /* stay on empty data; the banner says so */ }

  const okKey = window.BF_CONFIG.keys.practiceOk;
  let passed = false;
  try { passed = sessionStorage.getItem(okKey) === '1'; } catch (e) { /* private window: ask every time */ }
  const record = data.settings && data.settings.practice;
  if (!passed && needsGate(loaded, data.settings, passed) && adminPassFresh()) {                // a signed-in admin opened practice from the app
    passed = true;
    try { sessionStorage.setItem(okKey, '1'); } catch (e) { /* ignore */ }
  }
  const gated = needsGate(loaded, data.settings, passed);

  document.documentElement.classList.add('practice');
  // Gated: the app starts on empty data (still test mode: no Firebase, no saves) behind the sheet.
  window.__BEFIT_TEST__ = gated ? { data: { players: {}, sessions: {}, paymentDays: {}, settings: {} }, practice: true, gated: true } : { data, practice: true };

  const RING = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" stroke-dasharray="2.3 2.1"/></svg>';

  document.addEventListener('DOMContentLoaded', () => {
    if (gated) { openGate(); return; }
    const bar = document.createElement('a');
    bar.className = 'practice-bar';
    bar.href = location.pathname;
    bar.innerHTML = RING + (loaded ? 'Practice · nothing is saved · <b>Exit ›</b>' : "Practice · couldn't load data · <b>Exit ›</b>");
    document.body.insertBefore(bar, document.body.firstChild);
  });

  function openGate() {
    const g = document.createElement('div');
    g.className = 'pg';
    g.setAttribute('data-theme', 'dark');
    g.innerHTML = '<form class="pg-sheet" role="dialog" aria-modal="true" aria-labelledby="pg-t" novalidate><span class="pg-hdl"></span>' +
      '<h2 id="pg-t">' + RING + 'Practice mode</h2>' +
      '<div class="pg-hint">Ask Reuben for the practice password · nothing is saved</div>' +
      '<label class="pg-inp"><input type="password" name="pw" autocomplete="off" placeholder="Practice password" aria-label="Practice password"></label>' +
      '<div class="pg-err field-err" data-err role="alert"></div>' +
      '<button type="submit" class="pg-go">Start practice ›</button>' +
      '<a class="pg-cx" href="' + location.pathname.replace(/"/g, '') + '">Cancel</a></form>';
    document.body.appendChild(g);
    const form = g.querySelector('form'), input = g.querySelector('input'), err = g.querySelector('[data-err]'), go = g.querySelector('.pg-go');
    input.focus();
    g.addEventListener('keydown', e => { if (e.key === 'Escape') location.href = location.pathname; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.textContent = '';
      if (!input.value) { err.textContent = 'Type the practice password'; return; }
      go.disabled = true;
      let ok = false;
      try { ok = await verify(input.value, record); } catch (x) { err.textContent = 'Open the secure address (https) to use practice'; go.disabled = false; return; }
      go.disabled = false;
      if (!ok) { err.textContent = 'Wrong password'; input.select(); return; }
      try { sessionStorage.setItem(okKey, '1'); } catch (x) { err.textContent = 'This browser won’t remember it. Use a normal window'; return; }
      location.reload();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
