/* ============================================================================
   BE Fit Club · js/ui/shell.js · the app frame (window.App)
   ----------------------------------------------------------------------------
   Round 5: FOUR ROLES, each with its own tabs and header pill.
     guest    (just browsing)        Home · Match · Tables                 header: "Browsing ▾" (outlined)
     player   (picked their name)    Home · Match · Tables · Me            header: name chip "Andrew ▾" (team tint)
     referee  (shared login)         Match · Money tonight                 header: mark · date · sync chip · "Referee ▾"
                                     The nav hides while a match is live (clock running, paused or in stoppage).
     admin    (Reuben)               Home · Squad · Money · Settings       header: BE FIT · page title · "Admin ▾"
                                     The admin can also referee: "Admin ▾ › Referee console" switches to the
                                     referee tabs (role 'referee', still signed in as admin).
   THE WAY BACK (every role): the header-left brand button (mark + BE FIT, data-shell="welcome") returns to the
   menu; it is hidden on the referee side while a match is live. Every pill sheet ends with full-width buttons:
   Back to menu (everyone; staff stay signed in) and Sign out (referee, admin). The laptop rail has the same two rows.
   A guest or player who opens a staff-only screen gets the toast "Referee or admin only · Sign in ›" (App.staffOnly()).
   Phone: header + bottom nav. Laptop (>= 960 px): left rail, content max 1040 px; screens with
   layout:'phone' (the console) stay phone-width and centred.

   SCREENS
     App.registerScreen(id, {
       mode:    'player' | 'referee' | 'admin' | 'any'   who may open it (default from the id prefix:
                'player.' 'guest.' 'tables.' → player (anyone; shows guest or player tabs) · 'ref.' → referee
                (referee or admin) · 'admin.' → admin). ref.squad, ref.player, ref.pastGame are admin-only.
       tab:     which nav tab lights up: 'home' | 'match' | 'tables' | 'me' | 'money' | 'squad' | 'settings'
                (old ids still work: live → match, table → tables, season → tables; player.match → match)
       title:   admin header centre text (e.g. 'Squad'); referee header shows the date
       layout:  'wide' (default) | 'phone'     ('phone' = stays phone-width on a laptop)
       console: true                           (follows "Referee console: Always dark")
       nav:     false                          (hide the bottom nav / rail, e.g. Welcome)
       flush:   true                           (no page padding)
       header(ctx) → { left, center, right } HTML, or false for no header (default per role, see above)
       mount(el, ctx) · render(el, ctx) · onData(el, ctx) · onHide(el, ctx)   (unchanged from round 4)
     })
     ctx = { id, params, mode, role, wide, viewer, viewerState, isReferee, isAdmin, store:Store, scoring:Scoring,
             go, back, rerender, openSheet, every(ms, fn), onCleanup(fn) }
       ctx.role = 'guest' | 'player' | 'referee' | 'admin' (the tabs on show) · ctx.mode = 'referee' for
       referee AND admin, 'player' for guest AND player (round 4 meaning, kept).
     PLACEHOLDERS: every new round 5 screen id is registered here with a working stand-in (most wrap the
     round 4 screen they replace) until its owner registers the real one: registerScreen() simply replaces
     it, no warning. App.PLACEHOLDERS lists them with their owners.

   NAVIGATION (hash routes: #/tables.players, #/player.match?sid=abc)
     App.go(id, params?, { replace }) · App.back() · App.current() → { id, params }
     App.tabs(role?) · App.goTab(tabId)   (goTab('table') → Tables · Players, goTab('season') → Tables · Teams)
     'player.table' → 'tables.players' and 'player.season' → 'tables.teams' once player.js stops registering them.
     'ref.home' (round 4) routes to the role's home (admin → admin.home, referee → the Match tab) as soon as the
     real admin.home is registered; until then it still opens the round 4 referee home.
   ACTIONS
     App.registerAction(name, fn) · App.action(name, args) → whatever fn returns ("Not built yet" toast if missing)
   ROLE, VIEWER, SIGN-IN
     App.role() → 'guest'|'player'|'referee'|'admin' · App.setRole(r) (ignored if not signed in for it)
     App.mode() → 'player'|'referee' (round 4) · App.setMode('player'|'referee'|'admin')
     App.viewer() → pid | null · App.viewerState() → pid | 'guest' | null (never chose) · App.setViewer(pid | 'guest')
     App.openSignIn({ as:'referee'|'admin', onSignedIn })   referee = password only; admin = email + password
     App.openPill()     the header pill's sheet for the current role · App.signOut() · App.isLiveMatch()
   THEME
     App.theme.get() / set('auto'|'light'|'dark') · App.theme.getConsole() / setConsole('dark'|'app')
     App.theme.effective() → 'light' | 'dark' · App.openAppearance()
   SHELL BUTTONS (work anywhere, incl. headers): data-shell="back" | "player-view" | "ref-mode" | "admin-mode"
     | "sign-in" | "sign-in-admin" | "sign-out" | "welcome" | "appearance" | "pill" | "sync"
   ========================================================================== */
(function () {
  'use strict';
  const CFG = window.BF_CONFIG;
  const K = CFG.keys;
  const TEST = window.__BEFIT_TEST__ || null;
  const esc = UI.esc;

  const screens = {}, actions = {};
  let lastTables = 'tables.teams';
  const TABS = {
    guest: [
      { id: 'home', label: 'Home', icon: 'home', screen: 'guest.home' },
      { id: 'match', label: 'Match', icon: 'match', screen: 'player.live' },
      { id: 'tables', label: 'Tables', icon: 'tables', screen: () => lastTables },
    ],
    player: [
      { id: 'home', label: 'Home', icon: 'home', screen: 'player.home' },
      { id: 'match', label: 'Match', icon: 'match', screen: 'player.live' },
      { id: 'tables', label: 'Tables', icon: 'tables', screen: () => lastTables },
      { id: 'me', label: 'Me', icon: 'me', screen: 'player.me' },
    ],
    referee: [
      { id: 'match', label: 'Match', icon: 'match', screen: () => (Store.activeSessionId() ? 'ref.console' : 'ref.setup') },
      { id: 'money', label: 'Money tonight', icon: 'money', screen: 'ref.money' },
    ],
    admin: [
      { id: 'home', label: 'Home', icon: 'home', screen: 'admin.home' },
      { id: 'squad', label: 'Squad', icon: 'squad', screen: 'ref.squad' },
      { id: 'money', label: 'Money', icon: 'money', screen: 'ref.money' },
      { id: 'settings', label: 'Settings', icon: 'settings', screen: 'admin.settings' },
    ],
  };
  const ROLES = Object.keys(TABS);
  // Round 4 tab ids still used by some screens / links.
  const TAB_ALIAS = { live: 'match', table: 'tables', season: 'tables' };
  const SCREEN_TAB = { 'player.match': 'match', 'player.live': 'match' };
  const ADMIN_ONLY = new Set(['ref.squad', 'ref.player', 'ref.pastGame']);
  // Round 4 ids that retire in round 5: when nobody registers them any more, links to them land here.
  const RETIRED = { 'player.table': 'tables.players', 'player.season': 'tables.teams' };
  const REFEREE_DESK = new Set(['ref.console', 'ref.setup', 'ref.events']);   // always shown with the referee tabs

  // Stand-ins for the new round 5 screens (owners in R5-CONTRACT.md). Replaced by registerScreen.
  const PLACEHOLDERS = {
    'guest.home':     { owner: 'home',   tab: 'home',     mode: 'player', wrap: 'player.live' },
    'player.home':    { owner: 'home',   tab: 'home',     mode: 'player', wrap: 'player.live' },
    'tables.teams':   { owner: 'tables', tab: 'tables',   mode: 'player', wrap: 'player.season' },
    'tables.players': { owner: 'tables', tab: 'tables',   mode: 'player', wrap: 'player.table' },
    'tables.stats':   { owner: 'tables', tab: 'tables',   mode: 'player', demo: 'stats' },
    'admin.home':     { owner: 'admin',  tab: 'home',     mode: 'admin',  wrap: 'ref.home', title: null },
    'admin.settings': { owner: 'admin',  tab: 'settings', mode: 'admin',  demo: 'settings', title: 'Settings' },
  };

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  let route = { id: null, params: {} };
  let cur = null;                    // { id, def, el, cleanups:[], key, role, tab }
  const lastTab = { guest: 'home', player: 'home', referee: 'match', admin: 'home' };
  let renderQueued = false, deferredWhileTyping = false, started = false;
  const wideMQ = window.matchMedia('(min-width: 960px)');
  const lightMQ = window.matchMedia('(prefers-color-scheme: light)');

  // ---------------------------------------------------------------- registry
  function defaultMode(id) {
    if (id.startsWith('ref.')) return 'referee';
    if (id.startsWith('admin.')) return 'admin';
    if (/^(player|guest|tables)\./.test(id)) return 'player';
    return 'any';
  }
  function registerScreen(id, def) {
    if (screens[id] && !screens[id].placeholder) console.warn('BE Fit: screen registered twice:', id);
    screens[id] = Object.assign({ mode: defaultMode(id), layout: 'wide' }, def);
    if (started && route.id === id) scheduleRender(true);
  }
  function registerAction(name, fn) { actions[name] = fn; }
  function action(name, args) {
    const fn = actions[name];
    if (!fn) { console.warn('BE Fit: no action', name); UI.toast('Not built yet'); return null; }
    return fn(args || {});
  }

  // ---------------------------------------------------------------- role, viewer
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
  const viewerRole = () => (viewer() ? 'player' : 'guest');

  function role() {
    const m = ls.get(K.mode), a = Auth.role();
    if (a === 'admin' && (m === 'admin' || m === 'referee')) return m;
    if (a === 'admin' && m == null) return 'admin';
    if (a && (m === 'referee' || m === 'admin' || m == null)) return 'referee';
    return viewerRole();
  }
  function setRole(r) {
    const a = Auth.role();
    if (r === 'admin' && a !== 'admin') r = a ? 'referee' : viewerRole();
    if (r === 'referee' && !a) r = viewerRole();
    if (r === 'guest' || r === 'player') r = viewerRole();
    ls.set(K.mode, r);
  }
  const mode = () => (role() === 'referee' || role() === 'admin' ? 'referee' : 'player');
  function setMode(m) { setRole(m === 'admin' ? 'admin' : m === 'referee' ? 'referee' : 'player'); }

  function setViewer(pid) {
    viewerState._set = true;
    ls.set(K.viewer, JSON.stringify({ pid: pid || 'guest' }));
    if (TEST) TEST.viewer = pid || 'guest';
    ls.set(K.mode, pid && pid !== 'guest' ? 'player' : 'guest');
    scheduleRender(true);
  }

  // A match is "live" for the referee while its clock runs, is paused or is in stoppage.
  function isLiveMatch() {
    const s = Store.activeSession();
    return !!s && !!window.Clock && Clock.isActive(s);
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
  function tabs(r) { return TABS[r || role()] || TABS.guest; }
  function homeFor(r) {
    const list = tabs(r);
    const t = list.find(x => x.id === lastTab[r]) || list[0];
    return tabScreen(t);
  }
  function needsWelcome() { return viewerState() === null && !Auth.isReferee(); }

  function access(id, def) {
    if (def.mode === 'admin' || ADMIN_ONLY.has(id)) return 'admin';
    if (def.mode === 'referee') return 'referee';
    if (def.mode === 'player') return 'viewer';
    return 'any';
  }
  // Which tabs to show with a screen.
  function roleFor(id, def) {
    const acc = access(id, def), r = role();
    if (acc === 'admin') return 'admin';
    if (acc === 'viewer') return viewerRole();
    if (acc === 'referee') {
      if (REFEREE_DESK.has(id)) return 'referee';
      return r === 'admin' || r === 'referee' ? r : (Auth.isAdmin() ? 'admin' : 'referee');
    }
    return r;
  }

  // Someone not signed in reached something for staff only: say so, with a way in (the menu's staff doors).
  function staffOnly() {
    if (Auth.isReferee()) return;
    UI.toast('Referee or admin only', { action: { label: 'Sign in ›', fn: () => go('welcome') }, ms: 4500 });
  }
  let deniedKey = null;                 // so one blocked address toasts once, not on every redraw
  function resolve(r, denied) {
    let { id, params } = r;
    // Round 4's 'ref.home' becomes the role's home once the admin builder's real admin.home exists.
    if (id === 'ref.home' && screens['admin.home'] && !screens['admin.home'].placeholder) id = Auth.isAdmin() && role() !== 'referee' ? 'admin.home' : homeFor('referee');
    if (!id) id = needsWelcome() ? 'welcome' : homeFor(role());
    if (!screens[id] && RETIRED[id]) id = RETIRED[id];
    const def = screens[id];
    if (!def) return { id, params, def: null };
    const acc = access(id, def);
    if (acc === 'admin' && !Auth.isAdmin()) return resolve({ id: Auth.isReferee() ? homeFor('referee') : homeFor(viewerRole()), params: {} }, !Auth.isReferee());
    if (acc === 'referee' && !Auth.isReferee()) return resolve({ id: homeFor(viewerRole()), params: {} }, true);
    return { id, params, def, denied: !!denied };
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
    go(homeFor(cur ? cur.role : role()), {}, { replace: true });
  }
  function goTab(tabId) {
    if (tabId === 'table') lastTables = 'tables.players';
    if (tabId === 'season') lastTables = 'tables.teams';
    tabId = TAB_ALIAS[tabId] || tabId;
    const r = cur ? cur.role : role();
    const list = tabs(r);
    const t = list.find(x => x.id === tabId) || list[0];
    lastTab[r] = t.id;
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

  function makeCtx(r, el, cleanups, rl) {
    return {
      id: r.id, params: r.params, role: rl, mode: rl === 'referee' || rl === 'admin' ? 'referee' : 'player',
      wide: wideMQ.matches, viewer: viewer(), viewerState: viewerState(), isReferee: Auth.isReferee(), isAdmin: Auth.isAdmin(),
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
  function tabOf(id, def, rl) {
    let t = def.tab ? (TAB_ALIAS[def.tab] || def.tab) : null;
    if (def.tab && SCREEN_TAB[id] && (def.tab === 'season' || def.tab === 'live')) t = SCREEN_TAB[id];
    if (id === 'ref.money' && rl === 'referee') t = 'money';
    const list = tabs(rl);
    if (t && list.some(x => x.id === t)) return t;
    const own = list.find(x => tabScreen(x) === id);
    return own ? own.id : null;
  }

  function render(isNav) {
    const r = resolve(route);
    const host = document.getElementById('app-screen');
    if (!r.def) {
      host.innerHTML = UI.empty('Not found', '');
      return;
    }
    const rl = roleFor(r.id, r.def);
    if (r.denied) { const dk = location.hash; if (isNav && deniedKey !== dk) { deniedKey = dk; staffOnly(); } } else deniedKey = null;
    if (r.def.mode !== 'any') ls.set(K.mode, rl);
    if (r.id.startsWith('tables.')) lastTables = r.id;
    const key = r.id + '?' + JSON.stringify(r.params);
    const same = cur && cur.key === key && !isNav;
    const sameScreen = cur && cur.key === key;

    if (!sameScreen) {
      if (cur) { cur.cleanups.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); if (cur.def.onHide) cur.def.onHide(cur.el, cur.ctx); }
      const el = document.createElement('section');
      el.className = 'screen scr-' + r.id.replace(/\./g, '-');
      el.dataset.screen = r.id;
      const cleanups = [];
      cur = { id: r.id, def: r.def, el, key, cleanups, role: rl };
      cur.ctx = makeCtx(r, el, cleanups, rl);
      host.replaceChildren(el);
      host.className = 'screen-host' + (r.def.layout === 'phone' ? ' is-phone' : '') + (r.def.flush ? ' is-flush' : '');
      window.scrollTo(0, 0);
      UI.sheet.closeAll();
      const t = tabOf(r.id, r.def, rl);
      if (t) lastTab[rl] = t;
      cur.tab = t;
      applyTheme();
      frame(rl);
      try { if (r.def.mount) r.def.mount(el, cur.ctx); r.def.render(el, cur.ctx); }
      catch (e) { console.error(e); el.innerHTML = UI.empty('Something went wrong', 'Pull down to refresh.'); }
      el.addEventListener('focusout', () => { if (deferredWhileTyping) setTimeout(() => { if (!typingIn(el)) { deferredWhileTyping = false; scheduleRender(false); } }, 0); });
      return;
    }
    // same screen: data changed (or re-entered)
    cur.role = rl;
    cur.ctx = Object.assign(cur.ctx, makeCtx(r, cur.el, cur.cleanups, rl), { every: cur.ctx.every, onCleanup: cur.ctx.onCleanup });
    frame(rl);
    if (typingIn(cur.el)) { deferredWhileTyping = true; return; }
    try {
      if (same && r.def.onData) r.def.onData(cur.el, cur.ctx); else r.def.render(cur.el, cur.ctx);
    } catch (e) { console.error(e); }
  }

  // ---------------------------------------------------------------- header, nav, rail
  function frame(rl) {
    const d = cur.def, ctx = cur.ctx;
    const hideLive = rl === 'referee' && isLiveMatch() && d.nav !== false;
    document.body.classList.toggle('no-nav', d.nav === false || hideLive);
    document.body.classList.toggle('nav-hidden', hideLive);
    document.body.dataset.mode = rl === 'referee' || rl === 'admin' ? 'referee' : 'player';
    document.body.dataset.role = rl;
    const hd = document.getElementById('app-header');
    let parts = d.header ? d.header(ctx) : null;
    if (parts === false) { hd.hidden = true; }
    else {
      hd.hidden = false;
      const own = parts || {};
      parts = Object.assign(defaultHeader(rl, d), own);
      // Staff: the brand button takes the left; the role pill moves to the right (after the screen's own right side).
      // A screen that sets its own left (a back button) keeps it, and then has no pill, as before.
      if ((rl === 'referee' || rl === 'admin') && own.left === undefined) parts.right = (parts.right || '') + pillButton(rl);
      hd.className = 'hd hd-' + rl;
      hd.innerHTML = `<div class="hd-l">${parts.left || ''}</div><div class="hd-c">${parts.center || ''}</div><div class="hd-r">${parts.right || ''}</div>`;
    }
    const nav = document.getElementById('app-nav');
    const rail = document.getElementById('app-rail');
    if (d.nav === false || hideLive) { nav.hidden = true; rail.hidden = true; return; }
    nav.hidden = false; rail.hidden = false;
    const list = tabs(rl);
    const link = (t, cls) => `<a class="${cls}${t.id === cur.tab ? ' on' : ''}" href="${hashFor(tabScreen(t))}" data-tab="${t.id}"${t.id === cur.tab ? ' aria-current="page"' : ''}>${UI.icon(t.icon)}<span>${esc(t.label)}</span></a>`;
    const staff = rl === 'referee' || rl === 'admin';
    nav.className = 'nav' + (staff ? ' ref' : '') + ' n' + list.length;
    nav.innerHTML = list.map(t => link(t, 'nav-a')).join('');
    rail.className = 'rail' + (staff ? ' ref' : '');
    rail.innerHTML = brandBtn({ cls: 'rail-brand' }) + list.map(t => link(t, 'rail-a')).join('') +
      `<span class="rail-sp"></span><div class="rail-foot">${pillButton(rl)}` +
      `<button type="button" class="rail-a" data-shell="welcome">${UI.icon('back')}<span>Back to menu</span></button>` +
      (staff ? `<button type="button" class="rail-a rail-out" data-shell="sign-out">${UI.icon('close')}<span>Sign out</span></button>` : '') +
      `</div>`;
  }

  // The square mark (the approved "Goal Pulse", the #mk-g3 geometry) + "BE FIT". It is the way back to the menu.
  // Each copy gets its own clip id so two on one page never share one.
  let markN = 0;
  function markSvg() {
    const id = 'bfm' + (++markN), bx = 'cx="76" cy="54.5" r="9.5"';
    const k = 'style="fill:var(--knock,#0B0D10)"';
    return `<svg class="bb-mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false" style="--knock:var(--bg)">` +
      `<path d="M64 43.5V64M88 43.5V64M61.5 49H90.5" stroke="currentColor" stroke-width="1.6" opacity=".3" fill="none"/>` +
      `<circle ${bx} fill="currentColor"/><clipPath id="${id}"><circle ${bx}/></clipPath><g clip-path="url(#${id})">` +
      `<polygon points="76.00,51.08 79.25,53.44 78.01,57.27 73.99,57.27 72.75,53.44" ${k}/><polygon points="76.00,48.04 73.20,46.00 74.27,42.71 77.73,42.71 78.80,46.00" ${k}/>` +
      `<polygon points="82.14,52.50 83.21,49.21 86.67,49.21 87.74,52.50 84.94,54.54" ${k}/><polygon points="79.80,59.73 83.26,59.73 84.33,63.02 81.53,65.05 78.73,63.02" ${k}/>` +
      `<polygon points="72.20,59.73 73.27,63.02 70.47,65.05 67.67,63.02 68.74,59.73" ${k}/><polygon points="69.86,52.50 67.06,54.54 64.26,52.50 65.33,49.21 68.79,49.21" ${k}/></g>` +
      `<path d="M76.00 51.08L76.00 47.85M79.25 53.44L82.32 52.45M78.01 57.27L79.91 59.88M73.99 57.27L72.09 59.88M72.75 53.44L69.68 52.45" style="stroke:var(--knock,#0B0D10)" stroke-width="0.76" stroke-linecap="round" fill="none"/>` +
      `<path d="M6 64H22L28 55L35 73L43 30L50 64H58V40H94V64" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  // opts.markOnly: the mark alone (referee header) · opts.cls: extra class (rail) · "CLUB" shows on laptops only (CSS)
  function brandBtn(opts) {
    opts = opts || {};
    return `<button type="button" class="brandbtn${opts.cls ? ' ' + opts.cls : ''}" data-shell="welcome" aria-label="Back to menu">${markSvg()}` +
      (opts.markOnly ? '' : `<span class="wmk">BE FIT<span class="wmk-club"> CLUB</span></span>`) + `</button>`;
  }

  // The header pill for a role: Browsing ▾ · name chip ▾ · Referee ▾ · Admin ▾
  function pillButton(rl) {
    const car = '<span class="car" aria-hidden="true">▾</span>';
    if (rl === 'referee' || rl === 'admin') {
      const label = Auth.isAdmin() ? 'Admin' : 'Referee';
      return `<button type="button" class="hd-pillbtn" data-shell="pill" aria-haspopup="dialog"><span class="pill role">${label}${car}</span></button>`;
    }
    const v = viewer() ? Store.player(viewer()) : null;
    if (v) return `<button type="button" class="hd-pillbtn" data-shell="pill" aria-haspopup="dialog"><span class="pill me ${UI.esc(window.Teams ? Teams.cls(v.defaultTeam) : 't-' + v.defaultTeam)}">${UI.avatar(v.name, v.defaultTeam)}${esc(v.name)}${car}</span></button>`;
    return `<button type="button" class="hd-pillbtn" data-shell="pill" aria-haspopup="dialog"><span class="pill out">${UI.icon('person')}Browsing${car}</span></button>`;
  }
  function defaultHeader(rl, d) {
    if (rl === 'referee') {
      const s = Store.activeSession();
      const date = s ? UI.fmt.date(s.date) : UI.fmt.date(UI.fmt.iso(Store.now()));
      // the brand button is the mark alone here, and is hidden while a match is live so it can't be tapped by accident
      return { left: isLiveMatch() ? '' : brandBtn({ markOnly: true }), center: `<span class="hd-title">${esc(date)}</span>`, right: UI.syncChip(Store.status()) };
    }
    if (rl === 'admin') {
      const title = d && d.title ? d.title : UI.fmt.date(UI.fmt.iso(Store.now()));
      return { left: brandBtn(), center: `<span class="hd-title">${esc(title)}</span>`, right: '' };
    }
    return { left: brandBtn(), center: '', right: pillButton(rl) };
  }

  // ---------------------------------------------------------------- shell buttons
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-shell]');
    if (b) {
      const a = b.dataset.shell;
      if (a === 'player-view') toPlayerView();
      if (a === 'ref-mode') { setRole('referee'); go(homeFor('referee'), {}, { replace: true }); }
      if (a === 'admin-mode') { setRole('admin'); go(homeFor('admin'), {}, { replace: true }); }
      if (a === 'sign-out') signOut();
      if (a === 'welcome') go('welcome');
      if (a === 'back') back();
      if (a === 'appearance') openAppearance();
      if (a === 'sign-in') openSignIn({ as: 'referee' });
      if (a === 'sign-in-admin') openSignIn({ as: 'admin' });
      if (a === 'pill') openPill();
      if (a === 'sync') { if (actions['console.syncSheet']) action('console.syncSheet', {}); else openWaiting(); }
      return;
    }
    const t = e.target.closest('[data-tab]');
    if (t && !e.metaKey && !e.ctrlKey) { e.preventDefault(); goTab(t.dataset.tab); }
  });
  function toPlayerView() { setRole(viewerRole()); lastTab[viewerRole()] = 'home'; go(homeFor(viewerRole()), {}, { replace: true }); }

  // ---------------------------------------------------------------- the pill sheets
  const optRow = (tap, title, o) => UI.row(Object.assign({ tap, titleHtml: esc(title), chevron: true }, o || {}));
  function staffRows(h) {
    // Rows for someone already signed in, seen from the player side.
    if (!Auth.isReferee()) return '';
    return UI.rows([
      Auth.isAdmin() ? optRow('to-admin', 'Back to admin') : '',
      optRow('to-ref', 'Referee console'),
    ].filter(Boolean), { cls: 'mt-3' });
  }
  // The last group of every pill sheet: full-width 48 px buttons. Back to menu for everyone (staff stay signed in);
  // Sign out (outlined, red text) for the referee and admin. `first` adds a leading button (Referee console / Admin home).
  function sheetEnd(first) {
    const b = (cls, tap, text) => `<button type="button" class="btn ${cls} sh-act" data-tap="${tap}">${text}</button>`;
    return `<div class="sh-end">` + (first ? b('o', first.tap, esc(first.label)) : '') + b('g', 'menu', 'Back to menu') +
      (Auth.isReferee() ? b('o out', 'signout', 'Sign out') : '') + `</div>`;
  }
  function wireStaff(h) {
    UI.on(h.el, 'to-admin', () => { h.close(); setRole('admin'); lastTab.admin = 'home'; go(homeFor('admin'), {}, { replace: true }); });
    UI.on(h.el, 'to-ref', () => { h.close(); setRole('referee'); go(homeFor('referee'), {}, { replace: true }); });
    UI.on(h.el, 'signout', () => { h.close(); signOut(); });
    UI.on(h.el, 'menu', () => { h.close(); go('welcome'); });
    UI.on(h.el, 'as-ref', () => { h.close(); openSignIn({ as: 'referee' }); });
    UI.on(h.el, 'as-admin', () => { h.close(); openSignIn({ as: 'admin' }); });
    UI.on(h.el, 'appearance', () => { h.close(); openAppearance(); });
  }
  function personRow(p) {
    return UI.row({ tap: 'pick', data: { pid: p.pid }, left: UI.avatar(p.name, p.defaultTeam), titleHtml: esc(p.name), metaHtml: esc(p.defaultPosition || ''), right: UI.teamChip(p.defaultTeam) });
  }
  // Up to 6 matches, only once something is typed (never the whole list of names).
  function findPeople(q, max) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return { list: [], total: 0 };
    const all = Object.entries(Store.players()).map(([pid, p]) => Object.assign({ pid }, p))
      .filter(p => String(p.name || '').toLowerCase().includes(s))
      .sort((a, b) => {
        const as = String(a.name).toLowerCase().startsWith(s), bs = String(b.name).toLowerCase().startsWith(s);
        return (bs - as) || String(a.name).localeCompare(String(b.name));
      });
    return { list: all.slice(0, max || 6), total: all.length };
  }
  function resultsHtml(q, max) {
    const r = findPeople(q, max);
    if (!String(q || '').trim()) return '';
    if (!r.total) return UI.empty(`No one called "${String(q).trim()}"`, '');
    return `<div class="lbl">${r.total === 1 ? '1 match' : r.total + ' matches'}${r.total > r.list.length ? ` <b>keep typing</b>` : ''}</div>` + UI.rows(r.list.map(personRow));
  }
  function pickViewer(pid) { setViewer(pid); go('player.home', {}, { replace: true }); }

  function openPill() {
    const rl = cur ? cur.role : role();
    if (rl === 'referee' || rl === 'admin') {
      const admin = Auth.isAdmin();
      const h = UI.sheet.open({ title: admin ? 'Admin' : 'Referee', cls: 'sh-shell-pill', body: UI.rows([
        optRow('pv', 'Player view'),
      ]) + sheetEnd(admin ? (rl === 'admin' ? { tap: 'to-ref', label: 'Referee console' } : { tap: 'to-admin', label: 'Admin home' }) : null) });
      wireStaff(h);
      UI.on(h.el, 'pv', () => { h.close(); toPlayerView(); });
      return h;
    }
    const v = viewer() ? Store.player(viewer()) : null;
    if (v) {
      const row = (Scoring.seasonTable() || []).find(x => x.pid === viewer());
      const sub = [v.defaultPosition, UI.fmt.team(v.defaultTeam), row ? UI.fmt.ordinal(row.rank) : ''].filter(Boolean).join(' · ');
      const h = UI.sheet.open({ cls: 'sh-shell-pill', body:
        `<div class="pill-who">${UI.avatar(v.name, v.defaultTeam, { size: 44 })}<span class="grow"><b>${esc(v.name)}</b><span class="meta">${esc(sub)}</span></span></div>` +
        UI.rows([optRow('mypage', 'My page'), optRow('share', 'Share card'), optRow('appearance', 'Appearance')]) +
        (Auth.isReferee() ? '' : UI.rows([optRow('signin', 'Referee or admin sign-in', { cls: 'quiet' })], { cls: 'mt-3' })) +
        staffRows() + sheetEnd() });
      wireStaff(h);
      UI.on(h.el, 'mypage', () => { h.close(); go('player.me'); });
      UI.on(h.el, 'share', () => { h.close(); action('player.shareCard', { pid: viewer() }); });
      UI.on(h.el, 'signin', () => { h.close(); openStaffChooser(); });
      return h;
    }
    // guest: "You're browsing"
    const tl = { auto: 'Auto', light: 'Light', dark: 'Dark' }[theme.get()];
    const h = UI.sheet.open({ title: 'You’re browsing', cls: 'sh-shell-pill', body:
      UI.search({ name: 'pill-find', placeholder: 'Find your name' }) + `<div class="mt-3" data-pill-res></div>` +
      `<div data-pill-opts>` + UI.rows([
        Auth.isReferee() ? '' : optRow('as-ref', 'Referee'),
        Auth.isReferee() ? '' : optRow('as-admin', 'Admin'),
        optRow('appearance', 'Appearance', { right: `<span class="meta">${esc(tl)}</span>` }),
      ].filter(Boolean), { cls: 'mt-3' }) + staffRows() + sheetEnd() + `</div>` });
    wireStaff(h);
    UI.on(h.el, 'pick', b => { h.close(); pickViewer(b.dataset.pid); });
    h.el.addEventListener('input', e => {
      if (!e.target.matches('[data-search="pill-find"]')) return;
      h.el.querySelector('[data-pill-res]').innerHTML = resultsHtml(e.target.value);
      h.el.querySelector('[data-pill-opts]').hidden = !!e.target.value.trim();
    });
    return h;
  }
  function openStaffChooser() {
    const h = UI.sheet.open({ title: 'Sign in', cls: 'sh-shell-pill', body: UI.rows([optRow('as-ref', 'Referee', { meta: 'Run tonight’s game' }), optRow('as-admin', 'Admin', { meta: 'Squad, money, settings' })]) });
    wireStaff(h);
    return h;
  }
  function openWaiting() {
    const st = Store.status(), list = Store.outbox();
    UI.sheet.open({ title: list.length ? `${list.length} waiting to send` : 'All sent', cls: 'sh-shell-sync',
      body: list.length ? UI.rows(list.map(x => UI.row({ titleHtml: `Saved ${esc(UI.fmt.time(x.at))}`, metaHtml: esc(x.paths.length === 1 ? '1 change' : x.paths.length + ' changes') })))
        : UI.empty(st.status === 'offline' ? 'No signal' : 'Everything is sent', '') });
  }

  // ---------------------------------------------------------------- sign-in sheets
  // Referee: password only (Auth fills the shared email). Admin: email + password. Each its own sheet.
  function openSignIn(opts) {
    opts = opts || {};
    const admin = opts.as === 'admin';
    const h = UI.sheet.open({
      title: admin ? 'Admin' : 'Referee', cls: 'sh-shell-signin',
      body: `<form class="stack" data-signin novalidate style="padding-top:8px">
          ${admin ? `<label class="inp"><input type="email" name="email" autocomplete="username" placeholder="Email" aria-label="Email"></label>` : ''}
          <label class="inp"><input type="password" name="password" autocomplete="current-password" placeholder="${admin ? 'Password' : 'Referee password'}" aria-label="Password"></label>
          <div class="field-err" data-err></div>
          <button type="submit" class="btn w big">Sign in</button>
        </form>`,
    });
    const form = h.el.querySelector('[data-signin]');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      const err = form.querySelector('[data-err]');
      btn.classList.add('is-saving'); btn.textContent = 'Signing in…'; err.textContent = '';
      try {
        await Auth.signIn(admin ? form.email.value : '', form.password.value);
        h.close();
        const r = Auth.isAdmin() && admin ? 'admin' : 'referee';
        setRole(r);
        if (opts.onSignedIn) opts.onSignedIn(); else go(homeFor(r), {}, { replace: true });
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
    setRole(viewerRole());
    go(needsWelcome() ? 'welcome' : homeFor(viewerRole()), {}, { replace: true });
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

  // ---------------------------------------------------------------- placeholders
  function placeholderDef(id, p) {
    const def = { placeholder: true, owner: p.owner, tab: p.tab, mode: p.mode, title: p.title };
    if (p.wrap) {
      const w = () => screens[p.wrap];
      def.header = ctx => (w() && w().header ? w().header(ctx) : null);
      def.layout = (screens[p.wrap] || {}).layout || 'wide';
      def.mount = (el, ctx) => { el.classList.add('scr-' + p.wrap.replace(/\./g, '-')); if (w() && w().mount) w().mount(el, ctx); };
      def.render = (el, ctx) => { if (w()) w().render(el, ctx); else el.innerHTML = UI.empty('Coming in round 5', ''); };
      def.onData = (el, ctx) => { const x = w(); if (x && x.onData) x.onData(el, ctx); else if (x) x.render(el, ctx); };
      def.onHide = (el, ctx) => { const x = w(); if (x && x.onHide) x.onHide(el, ctx); };
      return def;
    }
    def.render = el => { el.innerHTML = p.demo === 'stats' ? statsDemo() : settingsDemo(); };
    def.mount = el => {
      UI.on(el, 'open', b => go('player.profile', { pid: b.dataset.pid }));
      UI.on(el, 'appearance', () => openAppearance());
    };
    return def;
  }
  function statsDemo() {
    const rows = Scoring.seasonTable();
    const last = rows.lastGame;
    const top = rows.slice(0, 3).map(r => ({ pid: r.pid, name: r.name, team: r.team, value: r.pts,
      stat: `${UI.fmt.plural(r.g, 'goal')} · ${UI.fmt.plural(r.a, 'assist')}`,
      note: r.lastPts != null && last ? `${UI.fmt.signed(r.lastPts)} on ${UI.fmt.short(last.date)}` : '' }));
    const L = Scoring.leaders();
    const lr = (label, x) => x.players.length ? UI.leaderRow({ label, name: x.players[0].name, team: x.players[0].team, value: x.value, tap: 'open', data: { pid: x.players[0].pid } }) : '';
    return `<div class="lbl">Points</div>${UI.podium(top, { tap: 'open' })}<div class="lbl mt-6">Leaders</div>${lr('Goals', L.goals)}${lr('Assists', L.assists)}${lr('Saves', L.saves)}`;
  }
  function settingsDemo() {
    const c = Teams.club();
    return `<div class="lbl">Club</div>` + UI.rows([
      UI.row({ title: 'Season', right: `<span class="meta">${esc(c.seasonLabel)}</span>` }),
      UI.row({ title: 'Fee', right: `<span class="meta">${esc(UI.fmt.money(c.fee))}</span>` }),
      UI.row({ title: 'Quick amounts', right: `<span class="meta">${esc(c.quickAmounts.join(' · '))}</span>` }),
    ]) + `<div class="lbl mt-6">Teams</div>` + UI.rows(Teams.all().map(t =>
      UI.row({ cls: 'wash ' + Teams.cls(t.id), titleHtml: UI.teamChip(t.id), right: `<span class="meta">${t.active ? 'Active' : 'Not active'}</span>` }))) +
      `<div class="lbl mt-6">Appearance</div>` + UI.rows([UI.row({ tap: 'appearance', title: 'Appearance', chevron: true })]);
  }

  // ---------------------------------------------------------------- start
  function start() {
    if (started) return; started = true;
    Object.entries(PLACEHOLDERS).forEach(([id, p]) => { if (!screens[id]) screens[id] = Object.assign({ layout: 'wide' }, placeholderDef(id, p)); });
    route = parseHash(); trail.push(location.hash);
    window.addEventListener('hashchange', () => { onHash(); });
    wideMQ.addEventListener && wideMQ.addEventListener('change', () => scheduleRender(false));
    Store.on(() => scheduleRender(false));
    Store.onStatus(renderStatus);
    Auth.onChange(() => scheduleRender(true));
    Store.start();
    if (window.Teams) Teams.applyCss();
    renderStatus(Store.status());
    applyTheme();
    render(true);
    if (!TEST && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
    }
  }
  function renderStatus(info) {
    document.querySelectorAll('#app-header [data-sync]').forEach(el => { el.outerHTML = UI.syncChip(info); });
    const el = document.getElementById('app-status');
    const def = screens['app.offline'];
    if (!el || !def) return;
    try { def.render(el, Object.assign({ store: Store }, info)); } catch (e) { console.error(e); }
  }

  window.App = {
    registerScreen, registerAction, action, screens, actions,
    go, back, goTab, tabs, current: () => ({ id: route.id || (cur && cur.id), params: route.params }),
    role, setRole, mode, setMode, viewer, viewerState, setViewer, isLiveMatch, staffOnly,
    openSignIn, signOut, openAppearance, openPill, openSheet: o => UI.sheet.open(o),
    findPeople, theme, rerender: () => scheduleRender(false), start,
    PLACEHOLDERS: Object.freeze(Object.assign({}, PLACEHOLDERS)), ROLES,
  };
  document.addEventListener('DOMContentLoaded', start);
})();
