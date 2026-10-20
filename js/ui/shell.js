/* ============================================================================
   BE Fit Club · js/ui/shell.js · the app frame (window.App)
   ----------------------------------------------------------------------------
   Two modes: Player (Live · Table · Season · Me) and Referee, after sign-in
   (Match · Squad · Money). Phone: header + bottom nav. Laptop (>= 960 px): left
   rail, content max 1040 px; screens with layout:'phone' (the console) stay
   phone-width and centred.

   SCREENS
     App.registerScreen(id, {
       mode:    'player' | 'referee' | 'any'   (referee screens need sign-in; default from the id prefix)
       tab:     which nav tab lights up, e.g. 'table' (sub-screens set the tab they belong to)
       layout:  'wide' (default) | 'phone'     ('phone' = stays phone-width on a laptop)
       console: true                           (follows "Referee console: Always dark")
       nav:     false                          (hide the bottom nav / rail, e.g. Welcome)
       flush:   true                           (no page padding)
       header(ctx) → { left, center, right } HTML, or false for no header (default per mode)
       mount(el, ctx)   once per visit: attach listeners here (UI.on(el, ...)); el survives re-renders
       render(el, ctx)  draw; called on show and after every data change (set el.innerHTML)
       onData(el, ctx)  optional: called on data changes INSTEAD of render (keep inputs alive)
       onHide(el, ctx)  optional cleanup
     })
     ctx = { id, params, mode, wide, viewer, viewerState, isReferee, store:Store, scoring:Scoring,
             go, back, rerender, openSheet, every(ms, fn), onCleanup(fn) }
       ctx.every / ctx.onCleanup are cleared automatically when the screen is left.
     A data change re-renders the open screen once per frame, but never while one of
     its inputs has focus (it waits for blur), so typing is never interrupted.

   NAVIGATION (hash routes: #/player.table, #/player.match?sid=abc)
     App.go(id, params?, { replace }) · App.back() · App.current() → { id, params }
     App.tabs(mode) · App.goTab(tabId)
   ACTIONS (cross-screen calls between Phase 2 files; names are fixed in PHASE2-CONTRACT.md)
     App.registerAction(name, fn) · App.action(name, args) → whatever fn returns
   MODE, VIEWER, SIGN-IN
     App.mode() · App.setMode('player'|'referee')
     App.viewer() → pid | null · App.viewerState() → pid | 'guest' | null (never chose) · App.setViewer(pid | 'guest')
     App.openSignIn() · App.signOut()
   THEME
     App.theme.get() / set('auto'|'light'|'dark') · App.theme.getConsole() / setConsole('dark'|'app')
     App.theme.effective() → 'light' | 'dark' · App.openAppearance()   (the Me › Appearance sheet)
   LAYERS
     App.openSheet(opts) = UI.sheet.open(opts)
   SHELL BUTTONS (work anywhere, incl. headers): data-shell="back" | "player-view" | "ref-mode"
     | "sign-in" | "sign-out" | "welcome" | "appearance"
     e.g. header: () => ({ left: `<button type="button" class="hd-btn" data-shell="back">‹ Mon 12 Oct</button>` })
   ========================================================================== */
(function () {
  'use strict';
  const CFG = window.BF_CONFIG;
  const K = CFG.keys;
  const TEST = window.__BEFIT_TEST__ || null;
  const esc = UI.esc;

  const screens = {}, actions = {};
  const TABS = {
    player: [
      { id: 'live', label: 'Live', icon: 'live', screen: 'player.live' },
      { id: 'table', label: 'Table', icon: 'table', screen: 'player.table' },
      { id: 'season', label: 'Season', icon: 'season', screen: 'player.season' },
      { id: 'me', label: 'Me', icon: 'me', screen: 'player.me' },
    ],
    referee: [
      { id: 'match', label: 'Match', icon: 'match', screen: () => (Store.activeSessionId() ? 'ref.console' : 'ref.home') },
      { id: 'squad', label: 'Squad', icon: 'squad', screen: 'ref.squad' },
      { id: 'money', label: 'Money', icon: 'money', screen: 'ref.money' },
    ],
  };

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  let route = { id: null, params: {} };
  let cur = null;                    // { id, def, el, cleanups:[], key }
  let lastTab = { player: 'live', referee: 'match' };
  let renderQueued = false, deferredWhileTyping = false, started = false;
  const wideMQ = window.matchMedia('(min-width: 960px)');
  const lightMQ = window.matchMedia('(prefers-color-scheme: light)');

  // ---------------------------------------------------------------- registry
  function registerScreen(id, def) {
    if (screens[id]) console.warn('BE Fit: screen registered twice:', id);
    screens[id] = Object.assign({ mode: id.startsWith('ref.') ? 'referee' : id.startsWith('player.') ? 'player' : 'any', layout: 'wide' }, def);
    if (started && route.id === id) scheduleRender(true);
  }
  function registerAction(name, fn) { actions[name] = fn; }
  function action(name, args) {
    const fn = actions[name];
    if (!fn) { console.warn('BE Fit: no action', name); UI.toast('Not built yet'); return null; }
    return fn(args || {});
  }

  // ---------------------------------------------------------------- mode, viewer
  function mode() {
    const m = ls.get(K.mode);
    return m === 'referee' && Auth.isReferee() ? 'referee' : 'player';
  }
  function setMode(m) { ls.set(K.mode, m === 'referee' ? 'referee' : 'player'); }

  function viewerState() {
    if (TEST && TEST.viewer !== undefined && !viewerState._set) return TEST.viewer;
    try {
      const v = JSON.parse(ls.get(K.viewer) || 'null');
      if (!v || !v.pid) return null;
      if (v.pid === 'guest') return 'guest';
      return Store.hasData() && !Store.player(v.pid) ? 'guest' : v.pid;
    } catch (e) { return null; }
  }
  const viewer = () => { const v = viewerState(); return v && v !== 'guest' ? v : null; };
  function setViewer(pid) {
    viewerState._set = true;
    ls.set(K.viewer, JSON.stringify({ pid: pid || 'guest' }));
    if (TEST) TEST.viewer = pid || 'guest';
    scheduleRender(true);
  }

  // ---------------------------------------------------------------- theme
  const theme = {
    get: () => { const t = ls.get(K.theme); return t === 'light' || t === 'dark' ? t : 'auto'; },
    set(v) { ls.set(K.theme, v === 'light' || v === 'dark' ? v : 'auto'); applyTheme(); },
    getConsole: () => (ls.get(K.consoleTheme) === 'app' ? 'app' : 'dark'),
    setConsole(v) { ls.set(K.consoleTheme, v === 'app' ? 'app' : 'dark'); applyTheme(); },
    resolved() { const t = theme.get(); return t === 'auto' ? (lightMQ.matches ? 'light' : 'dark') : t; },
    effective() { return cur && cur.def.console && theme.getConsole() === 'dark' ? 'dark' : theme.resolved(); },
  };
  function applyTheme() {
    const eff = theme.effective();
    document.documentElement.setAttribute('data-theme', eff);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', eff === 'light' ? '#F3F4F6' : '#0B0D10');
  }
  lightMQ.addEventListener && lightMQ.addEventListener('change', applyTheme);

  // ---------------------------------------------------------------- routing
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    if (!h) return { id: null, params: {} };
    const [id, qs] = h.split('?');
    const params = {};
    new URLSearchParams(qs || '').forEach((v, k) => { params[k] = v; });
    return { id: decodeURIComponent(id), params };
  }
  function hashFor(id, params) {
    const qs = new URLSearchParams(params || {}).toString();
    return '#/' + id + (qs ? '?' + qs : '');
  }
  function tabScreen(t) { return typeof t.screen === 'function' ? t.screen() : t.screen; }
  function tabs(m) { return TABS[m || mode()]; }
  function homeFor(m) {
    const list = TABS[m];
    const t = list.find(x => x.id === lastTab[m]) || list[0];
    return tabScreen(t);
  }
  function needsWelcome() { return viewerState() === null && !Auth.isReferee(); }

  function resolve(r) {
    let { id, params } = r;
    if (!id) id = needsWelcome() ? 'welcome' : homeFor(mode());
    const def = screens[id];
    if (!def) return { id, params, def: null };
    if (def.mode === 'referee' && !Auth.isReferee()) return resolve({ id: homeFor('player'), params: {} });
    return { id, params, def };
  }

  // In-app history: our own stack of hashes, so Back knows whether there is a page to go back to.
  const trail = [];
  function go(id, params, opts) {
    const h = hashFor(id, params);
    if (opts && opts.replace) {
      history.replaceState(null, '', h);
      if (trail.length) trail[trail.length - 1] = h; else trail.push(h);
      route = parseHash(); scheduleRender(true); return;
    }
    if (location.hash === h) { scheduleRender(true); return; }
    location.hash = h;
  }
  function back() {
    if (trail.length > 1) { history.back(); return; }
    const d = cur && cur.def;
    const m = d && d.mode === 'referee' ? 'referee' : 'player';
    go(homeFor(m), {}, { replace: true });
  }
  function goTab(tabId) {
    const m = mode();
    const t = TABS[m].find(x => x.id === tabId) || TABS[m][0];
    lastTab[m] = t.id;
    go(tabScreen(t), {}, { replace: true });
  }
  function onHash() {
    const h = location.hash;
    if (trail.length > 1 && trail[trail.length - 2] === h) trail.pop(); else if (trail[trail.length - 1] !== h) trail.push(h);
    route = parseHash(); scheduleRender(true);
  }

  // ---------------------------------------------------------------- render
  // Navigation renders right away (next microtask); data renders are batched per frame,
  // with a timer fallback because frames pause in background tabs and headless runs.
  function scheduleRender(nav) {
    if (nav) { renderQueued = 'nav'; queueMicrotask(flush); return; }
    if (renderQueued) return;
    renderQueued = 'data';
    requestAnimationFrame(flush);
    setTimeout(flush, 60);
  }
  function flush() {
    if (!renderQueued) return;
    const kind = renderQueued; renderQueued = false;
    render(kind === 'nav');
  }

  function makeCtx(r, el, cleanups) {
    return {
      id: r.id, params: r.params, mode: (r.def && r.def.mode === 'referee') ? 'referee' : 'player',
      wide: wideMQ.matches, viewer: viewer(), viewerState: viewerState(), isReferee: Auth.isReferee(),
      store: Store, scoring: Scoring, go, back, openSheet: UI.sheet.open,
      rerender: () => scheduleRender(false),
      every(ms, fn) { const t = setInterval(fn, ms); cleanups.push(() => clearInterval(t)); return t; },
      onCleanup(fn) { cleanups.push(fn); },
    };
  }

  function typingIn(el) {
    const a = document.activeElement;
    return a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }

  function render(isNav) {
    const r = resolve(route);
    const host = document.getElementById('app-screen');
    if (!r.def) {
      host.innerHTML = UI.empty('Not found', '');
      return;
    }
    const m = r.def.mode === 'referee' ? 'referee' : r.def.mode === 'player' ? 'player' : mode();
    if (r.def.mode === 'referee' || r.def.mode === 'player') { setMode(m); }
    const key = r.id + '?' + JSON.stringify(r.params);
    const same = cur && cur.key === key && !isNav;
    const sameScreen = cur && cur.key === key;

    if (!sameScreen) {
      if (cur) { cur.cleanups.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); if (cur.def.onHide) cur.def.onHide(cur.el, cur.ctx); }
      const el = document.createElement('section');
      el.className = 'screen scr-' + r.id.replace(/\./g, '-');
      el.dataset.screen = r.id;
      const cleanups = [];
      cur = { id: r.id, def: r.def, el, key, cleanups };
      cur.ctx = makeCtx(r, el, cleanups);
      host.replaceChildren(el);
      host.className = 'screen-host' + (r.def.layout === 'phone' ? ' is-phone' : '') + (r.def.flush ? ' is-flush' : '');
      window.scrollTo(0, 0);
      UI.sheet.closeAll();
      const t = r.def.tab || (TABS[m].find(x => tabScreen(x) === r.id) || {}).id;
      if (t) lastTab[m] = t;
      cur.tab = t || lastTab[m];
      applyTheme();
      frame(m);
      try { if (r.def.mount) r.def.mount(el, cur.ctx); r.def.render(el, cur.ctx); }
      catch (e) { console.error(e); el.innerHTML = UI.empty('Something went wrong', 'Pull down to refresh.'); }
      el.addEventListener('focusout', () => { if (deferredWhileTyping) setTimeout(() => { if (!typingIn(el)) { deferredWhileTyping = false; scheduleRender(false); } }, 0); });
      return;
    }
    // same screen: data changed (or re-entered)
    cur.ctx = Object.assign(cur.ctx, makeCtx(r, cur.el, cur.cleanups), { every: cur.ctx.every, onCleanup: cur.ctx.onCleanup });
    frame(m);
    if (typingIn(cur.el)) { deferredWhileTyping = true; return; }
    try {
      if (same && r.def.onData) r.def.onData(cur.el, cur.ctx); else r.def.render(cur.el, cur.ctx);
    } catch (e) { console.error(e); }
  }

  // header, nav, rail
  function frame(m) {
    const d = cur.def, ctx = cur.ctx;
    document.body.classList.toggle('no-nav', d.nav === false);
    document.body.dataset.mode = m;
    const hd = document.getElementById('app-header');
    let parts = d.header ? d.header(ctx) : null;
    if (parts === false) { hd.hidden = true; }
    else {
      hd.hidden = false;
      parts = Object.assign(m === 'referee' ? refHeader() : playerHeader(), parts || {});
      hd.innerHTML = `<div class="hd-l">${parts.left || ''}</div><div class="hd-c">${parts.center || ''}</div><div class="hd-r">${parts.right || ''}</div>`;
    }
    const nav = document.getElementById('app-nav');
    const rail = document.getElementById('app-rail');
    if (d.nav === false) { nav.hidden = true; rail.hidden = true; return; }
    nav.hidden = false; rail.hidden = false;
    const list = TABS[m];
    const link = (t, cls) => `<a class="${cls}${t.id === cur.tab ? ' on' : ''}" href="${hashFor(tabScreen(t))}" data-tab="${t.id}"${t.id === cur.tab ? ' aria-current="page"' : ''}>${UI.icon(t.icon)}<span>${esc(t.label)}</span></a>`;
    nav.className = 'nav' + (m === 'referee' ? ' ref' : '');
    nav.innerHTML = list.map(t => link(t, 'nav-a')).join('');
    rail.className = 'rail' + (m === 'referee' ? ' ref' : '');
    const v = viewer() ? Store.player(viewer()) : null;
    const foot = m === 'referee'
      ? `<button type="button" class="rail-a" data-shell="player-view">${UI.icon('live')}<span>Player view</span></button>` +
        `<button type="button" class="rail-a" data-shell="sign-out">${UI.icon('close')}<span>Sign out</span></button>`
      : (Auth.isReferee() ? `<button type="button" class="rail-a" data-shell="ref-mode">${UI.icon('match')}<span>Referee</span></button>` : '') +
        (v ? `<a class="rail-a" href="${hashFor('player.me')}">${UI.avatar(v.name, v.defaultTeam)}<span>${esc(v.name)}</span></a>` : '');
    rail.innerHTML = `<span class="wm">BE FIT <em>CLUB</em></span>` + list.map(t => link(t, 'rail-a')).join('') +
      `<span class="rail-sp"></span><div class="rail-foot">${foot}</div>`;
  }

  function playerHeader() {
    const v = viewer() ? Store.player(viewer()) : null;
    const ref = Auth.isReferee() ? `<button type="button" class="ref-pill hd-pill" data-shell="ref-mode">Referee</button>` : '';
    const me = v ? `<a class="hd-btn" href="${hashFor('player.me')}" aria-label="Me">${esc(v.name)} ${UI.avatar(v.name, v.defaultTeam)}</a>`
      : `<button type="button" class="hd-btn" data-shell="welcome">Who are you?</button>`;
    return { left: `<span class="wm hd-mark">BE FIT <em>CLUB</em></span>`, center: '', right: ref + me };
  }
  function refHeader() {
    const s = Store.activeSession();
    const date = s ? UI.fmt.date(s.date) : UI.fmt.date(UI.fmt.iso(Store.now()));
    return { left: `<span class="ref-pill">Referee</span>`, center: esc(date), right: `<button type="button" class="hd-btn" data-shell="player-view">Player view</button>` };
  }

  // shell buttons (header, rail)
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-shell]');
    if (b) {
      const a = b.dataset.shell;
      if (a === 'player-view') { setMode('player'); go(homeFor('player'), {}, { replace: true }); }
      if (a === 'ref-mode') { setMode('referee'); go(homeFor('referee'), {}, { replace: true }); }
      if (a === 'sign-out') signOut();
      if (a === 'welcome') go('welcome');
      if (a === 'back') back();
      if (a === 'appearance') openAppearance();
      if (a === 'sign-in') openSignIn();
      return;
    }
    const t = e.target.closest('[data-tab]');
    if (t && !e.metaKey && !e.ctrlKey) { e.preventDefault(); goTab(t.dataset.tab); }
  });

  // ---------------------------------------------------------------- sign-in & appearance sheets
  function openSignIn(opts) {
    opts = opts || {};
    const h = UI.sheet.open({
      title: 'Referee sign-in',
      body: `<form class="stack" data-signin novalidate style="padding-top:8px">
          <label class="inp"><input type="email" name="email" autocomplete="username" placeholder="Email" aria-label="Email"></label>
          <label class="inp"><input type="password" name="password" autocomplete="current-password" placeholder="Password" aria-label="Password"></label>
          <div class="field-err" data-err></div>
          <button type="submit" class="btn w">Sign in</button>
        </form>`,
    });
    const form = h.el.querySelector('[data-signin]');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      const err = form.querySelector('[data-err]');
      btn.classList.add('is-saving'); btn.textContent = 'Signing in…'; err.textContent = '';
      try {
        await Auth.signIn(form.email.value, form.password.value);
        h.close();
        setMode('referee');
        if (opts.onSignedIn) opts.onSignedIn(); else go(homeFor('referee'), {}, { replace: true });
      } catch (x) {
        err.textContent = x.message || 'Wrong email or password';
        btn.classList.remove('is-saving'); btn.textContent = 'Sign in';
        form.password.select();
      }
    });
    return h;
  }
  async function signOut() {
    await Auth.signOut();
    setMode('player');
    go(homeFor('player'), {}, { replace: true });
  }

  function openAppearance() {
    const tick = on => on ? `<span class="tick-on" aria-label="Selected">✓</span>` : '';
    const opt = (tap, value, title, meta, on) => UI.row({ tap, data: { value }, titleHtml: esc(title), meta, right: tick(on) });
    const draw = h => {
      const t = theme.get(), c = theme.getConsole();
      h.setBody(`<div class="sh-s">The app</div>` + UI.rows([
        opt('theme', 'auto', 'Auto', 'Follows your phone', t === 'auto'),
        opt('theme', 'light', 'Light', null, t === 'light'),
        opt('theme', 'dark', 'Dark', null, t === 'dark'),
      ]) + `<div class="sh-s" style="margin-top:14px">Referee console</div>` + UI.rows([
        opt('console', 'dark', 'Always dark', 'Best under floodlights', c === 'dark'),
        opt('console', 'app', 'Same as the app', 'For daytime games', c === 'app'),
      ]));
    };
    const h = UI.sheet.open({ title: 'Appearance', body: '' });
    draw(h);
    UI.on(h.el, 'theme', (el) => { theme.set(el.dataset.value); draw(h); });
    UI.on(h.el, 'console', (el) => { theme.setConsole(el.dataset.value); draw(h); });
    return h;
  }

  // ---------------------------------------------------------------- start
  function start() {
    if (started) return; started = true;
    route = parseHash(); trail.push(location.hash);
    window.addEventListener('hashchange', () => { onHash(); });
    wideMQ.addEventListener && wideMQ.addEventListener('change', () => scheduleRender(false));
    Store.on(() => scheduleRender(false));
    Store.onStatus(renderStatus);
    Auth.onChange(() => scheduleRender(true));
    Store.start();
    renderStatus(Store.status());
    applyTheme();
    render(true);
    if (!TEST && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
    }
  }
  function renderStatus(info) {
    const el = document.getElementById('app-status');
    const def = screens['app.offline'];
    if (!el || !def) return;
    try { def.render(el, Object.assign({ store: Store }, info)); } catch (e) { console.error(e); }
  }

  window.App = {
    registerScreen, registerAction, action, screens, actions,
    go, back, goTab, tabs, current: () => ({ id: route.id || (cur && cur.id), params: route.params }),
    mode, setMode, viewer, viewerState, setViewer,
    openSignIn, signOut, openAppearance, openSheet: o => UI.sheet.open(o),
    theme, rerender: () => scheduleRender(false), start,
  };
  document.addEventListener('DOMContentLoaded', start);
})();
