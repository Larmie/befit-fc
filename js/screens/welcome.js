/* ============================================================================
   BE Fit Club · js/screens/welcome.js · THE FRONT DOOR (round 5, lead)
   ----------------------------------------------------------------------------
   Screen 'welcome' (no nav). First open, "Switch" from the name chip, or data-shell="welcome".
   - A small branded hero: club name, last game's score block, "Next game · Mon 26 Oct"
   - "Find your name" first. No list of names: matches (up to 6) appear only once you type,
     each with position and team chip. While typing, the hero and the options step aside.
   - Then 3 options: Just browsing › (guest) · I'm the referee › (password sheet) · I'm the admin ›
     (email + password sheet). Signed in already: the referee / admin rows go straight in.
   Picking a name stores it on this phone (shared with classic.html) and opens player.home.
   ========================================================================== */
(function () {
  'use strict';
  const esc = UI.esc;

  function brand() {
    const club = Teams.club();
    const last = Scoring.lastGame(Store.state);
    const order = Teams.list();
    const c1 = (order[0] && order[0].colour) || 'green', c2 = (order[1] && order[1].colour) || 'red';
    const score = last ? UI.scoreFor(last.sess, { size: 'compact', names: true }) : '';
    return `<div class="fd-brand hero" style="--c1:var(--${c1});--c2:var(--${c2})">` +
      `<div class="fd-kick">Monday night football</div><h1 class="fd-name">${esc(club.name)}</h1>` +
      (score ? `<div class="fd-score">${score}</div>` : '') +
      `<div class="fd-next">Next game · ${esc(UI.fmt.date(UI.nextGame()))}</div></div>`;
  }

  function option(tap, letter, title, meta) {
    return UI.row({ tap, cls: 'fd-opt', left: `<span class="opt-l">${letter}</span>`, titleHtml: esc(title), meta, chevron: true });
  }

  function personRow(p) {
    return UI.row({ tap: 'pick', data: { pid: p.pid }, left: UI.avatar(p.name, p.defaultTeam), titleHtml: esc(p.name),
      meta: p.defaultPosition || '', right: UI.teamChip(p.defaultTeam) });
  }
  function results(q) {
    const r = App.findPeople(q, 6);
    if (!r.total) return UI.empty(`No one called "${q.trim()}"`, '') + `<button type="button" class="link fd-notyou" data-tap="browse">Just browsing ›</button>`;
    return `<div class="lbl">${r.total === 1 ? '1 match' : r.total + ' matches'}${r.total > r.list.length ? ' <b>keep typing</b>' : ''}</div>` +
      UI.rows(r.list.map(personRow)) + `<button type="button" class="link fd-notyou" data-tap="browse">Not you? Just browsing ›</button>`;
  }

  function paint(el) {
    const input = el.querySelector('[data-search="who"]');
    const q = input ? input.value : '';
    const typing = !!q.trim();
    el.querySelector('[data-fd-brand]').hidden = typing;
    el.querySelector('[data-fd-opts]').hidden = typing;
    el.querySelector('[data-fd-res]').innerHTML = typing ? results(q) : '';
    el.classList.toggle('is-typing', typing);
  }

  App.registerScreen('welcome', {
    mode: 'any',
    nav: false,
    header: () => ({ left: `<span class="wm">BE FIT <em>CLUB</em></span>`, center: '', right: '' }),
    mount(el) {
      UI.on(el, 'pick', b => { App.setViewer(b.dataset.pid); App.go('player.home', {}, { replace: true }); });
      UI.on(el, 'browse', () => { App.setViewer('guest'); App.go('guest.home', {}, { replace: true }); });
      UI.on(el, 'referee', () => {
        if (Auth.isReferee()) { App.setRole('referee'); App.goTab('match'); return; }
        App.openSignIn({ as: 'referee' });
      });
      UI.on(el, 'admin', () => {
        if (Auth.isAdmin()) { App.setRole('admin'); App.go('admin.home', {}, { replace: true }); return; }
        App.openSignIn({ as: 'admin' });
      });
      el.addEventListener('input', e => { if (e.target.matches('[data-search="who"]')) paint(el); });
    },
    render(el) {
      const input = el.querySelector('[data-search="who"]');
      const q = input ? input.value : '';
      if (!Store.hasData()) { el.innerHTML = '<div class="skel" style="height:220px"></div><div class="skel mt-3" style="height:56px"></div>'; return; }
      el.innerHTML = `
        <div data-fd-brand>${brand()}</div>
        <div class="fd-find">${UI.search({ name: 'who', placeholder: 'Find your name', value: q })}</div>
        <div data-fd-res></div>
        <div data-fd-opts>${UI.rows([
          option('browse', 'B', 'Just browsing', 'Scores, tables, the season'),
          option('referee', 'R', 'I’m the referee', 'Run tonight’s game'),
          option('admin', 'A', 'I’m the admin', 'Squad, money, settings'),
        ], { cls: 'fd-opts' })}</div>`;
      paint(el);
    },
  });
})();
