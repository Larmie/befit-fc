/* ============================================================================
   BE Fit Club · js/screens/welcome.js · "Who are you?" (Phase 1, lead)
   ----------------------------------------------------------------------------
   Screen 'welcome' (no nav). First open, or the header's "Who are you?".
   - Two big exits on top: Just browsing › and I'm the referee ›
   - Search all players, then the last game's players first (A–Z), then everyone else.
   - Position and usual team sit beside each name (tells the two Freds apart).
   Picking a name stores it on this phone (shared with classic.html) and opens Live.
   ========================================================================== */
(function () {
  'use strict';
  const esc = UI.esc;

  function personRow(p) {
    return UI.row({ tap: 'pick', data: { pid: p.pid }, title: p.name,
      right: `${UI.pos(p.defaultPosition)}${UI.teamMark(p.defaultTeam)}` });
  }

  function lists(q) {
    const db = Store.state;
    const all = Object.entries(db.players || {}).map(([pid, p]) => Object.assign({ pid }, p))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (q) {
      const s = q.trim().toLowerCase();
      const hits = all.filter(p => String(p.name).toLowerCase().includes(s));
      return hits.length
        ? `<div class="lbl">Results <b class="n">${hits.length}</b></div>` + UI.rows(hits.map(personRow))
        : UI.empty(`No one called "${q.trim()}"`, '');
    }
    const last = Scoring.lastGame(db);
    const played = new Set(last ? Scoring.sessPlayers(last.sess, db).map(p => p.pid) : []);
    const first = all.filter(p => played.has(p.pid));
    const rest = all.filter(p => !played.has(p.pid));
    let html = '';
    if (first.length) html += `<div class="lbl">Played on ${esc(UI.fmt.date(last.sess.date))} <b class="n">${first.length}</b></div>` + UI.rows(first.map(personRow));
    if (rest.length) html += `<div class="lbl">${first.length ? 'Everyone else' : 'Everyone'} <b class="n">${rest.length}</b></div>` + UI.rows(rest.map(personRow));
    if (!all.length) html = Store.hasData() ? UI.empty('No players yet', '') : `<div class="skel" style="height:240px"></div>`;
    return html;
  }

  App.registerScreen('welcome', {
    mode: 'any',
    nav: false,
    header: () => ({ left: `<span class="wm">BE FIT <em>CLUB</em></span>`, center: '', right: '' }),
    mount(el) {
      UI.on(el, 'pick', b => { App.setViewer(b.dataset.pid); App.go('player.live', {}, { replace: true }); });
      UI.on(el, 'browse', () => { App.setViewer('guest'); App.go('player.live', {}, { replace: true }); });
      UI.on(el, 'referee', () => App.openSignIn());
      el.addEventListener('input', e => {
        if (e.target.matches('[data-search="who"]')) el.querySelector('[data-list]').innerHTML = lists(e.target.value);
      });
    },
    render(el) {
      const count = Object.keys(Store.players()).length;
      const input = el.querySelector('[data-search="who"]');
      const q = input ? input.value : '';
      el.innerHTML = `
        <h1 class="wl-title">Who are you?</h1>
        <p class="wl-sub">Pick your name once. Your points show first.</p>
        <div class="grid2 wl-exits">
          ${UI.btn('Just browsing ›', { kind: 'g', big: true, tap: 'browse' })}
          ${UI.btn('I’m the referee ›', { kind: 'o', big: true, tap: 'referee' })}
        </div>
        <div class="wl-search">${UI.search({ name: 'who', placeholder: count ? `Search ${count} players` : 'Search players', value: q })}</div>
        <div class="wl-lists" data-list>${lists(q)}</div>`;
    },
  });
})();
