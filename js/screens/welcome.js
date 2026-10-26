/* ============================================================================
   BE Fit Club · js/screens/welcome.js · THE FRONT DOOR (round 7: the "title screen" menu)
   ----------------------------------------------------------------------------
   Screen 'welcome' (no header, no nav, always dark). First open of the day, "Back to menu", the logo button,
   after Sign out, or data-shell="welcome". Design: design-review/front-door.html (spec C and E, round 3 art).

   ONE LIST OF DOORS, heights stepping down 84 → 70 → 58 → 58:
     first time   My stats (lit) · Browse as guest · Referee (lock) · Admin (lock)
     returning    Continue as <name> (rank · pts · move, team coloured, last 5 games as bars)
                  + "Not <name>? Find your name ›" · Browse as guest · Referee · Admin
     signed in    the lock becomes a tick on green, sub-line "Signed in", the tap goes straight in
   - "My stats" / "Find your name" → the same screen in state find ("‹ Menu", the search, results only after
     typing). Tapping a name remembers it on this phone and opens player.me. "Continue as" opens player.me too.
   - Browse as guest → guest.home. Referee / Admin → the sign-in sheets (App.openSignIn).
   - Above the doors: the K1 lockup, "BE FIT CLUB", the slogan, then the Tonight strip (the next game + the last
     score as two mini squares). While a match is live the strip becomes the live score block and taps to Match.
   - Footer: one pill, "Try practice mode · nothing is saved" (opens ?practice; inside practice: "Exit practice ›").
   - Laptop (>= 960): two columns. Left: lockup 320 × 160, name, slogan, the last game as the joined score block.
     Right: the doors (max 440). In state find the search takes the right column.
   - Entry motion: every .st block fades up 420 ms, staggered 40 ms (css/welcome.css). If the splash
     (#splash) is still on screen the motion waits until it has gone. None with reduced motion.
   ========================================================================== */
(function () {
  'use strict';
  const esc = UI.esc;

  // ---- the art: one faded picture per door (design file, art-data), the K1 lockup (#lk-kick)
  const ART = {
    stats: '<svg viewBox="0 0 220 64" preserveAspectRatio="xMaxYMid slice"><defs><radialGradient id="g-stat" cx="80%" cy="80%" r="40%"><stop offset="0" stop-color="currentColor" stop-opacity=".16"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs><rect width="220" height="64" fill="url(#g-stat)"/><rect x="112" y="48" width="11" height="14" rx="3" fill="currentColor" opacity="0.14"/><rect x="130" y="40" width="11" height="22" rx="3" fill="currentColor" opacity="0.14"/><rect x="148" y="44" width="11" height="18" rx="3" fill="currentColor" opacity="0.14"/><rect x="166" y="32" width="11" height="30" rx="3" fill="currentColor" opacity="0.14"/><rect x="184" y="20" width="11" height="42" rx="3" fill="currentColor" opacity="0.32"/><path d="M150 20H158L162 12L167 28L173 3L178 20H198" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".45"/></svg>',
    guest: '<svg viewBox="0 0 220 64" preserveAspectRatio="xMaxYMid slice"><defs><linearGradient id="g-beam" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".24"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="M184 18L76 64H156Z" fill="url(#g-beam)"/><path d="M196 64V18" stroke="currentColor" stroke-width="2" opacity=".32"/><rect x="180" y="3" width="32" height="15" rx="2.5" fill="currentColor" opacity=".22"/><circle cx="187" cy="7.5" r="2.2" fill="currentColor" opacity=".8"/><circle cx="187" cy="13.5" r="2.2" fill="currentColor" opacity=".8"/><circle cx="196" cy="7.5" r="2.2" fill="currentColor" opacity=".8"/><circle cx="196" cy="13.5" r="2.2" fill="currentColor" opacity=".8"/><circle cx="205" cy="7.5" r="2.2" fill="currentColor" opacity=".8"/><circle cx="205" cy="13.5" r="2.2" fill="currentColor" opacity=".8"/><path d="M112 49H220M100 56.5H220M88 64H220" stroke="currentColor" stroke-width="4" stroke-dasharray="7 4" opacity=".16"/></svg>',
    ref: '<svg viewBox="0 0 220 64" preserveAspectRatio="xMaxYMid slice"><defs><clipPath id="cp-ref"><path d="M84 64L90 26L114 10L136 15Q152 27 168 15L190 10L220 22V64Z"/></clipPath></defs><g clip-path="url(#cp-ref)"><rect x="80" y="0" width="140" height="64" fill="currentColor" opacity=".07"/><rect x="86" y="0" width="6" height="64" fill="currentColor" opacity=".26"/><rect x="98" y="0" width="6" height="64" fill="currentColor" opacity=".26"/><rect x="110" y="0" width="6" height="64" fill="currentColor" opacity=".26"/><rect x="122" y="0" width="6" height="64" fill="currentColor" opacity=".26"/><rect x="134" y="0" width="6" height="64" fill="currentColor" opacity=".26"/><rect x="146" y="0" width="6" height="64" fill="currentColor" opacity=".26"/><rect x="158" y="0" width="6" height="64" fill="currentColor" opacity=".26"/><rect x="170" y="0" width="6" height="64" fill="currentColor" opacity=".26"/><rect x="182" y="0" width="6" height="64" fill="currentColor" opacity=".26"/><rect x="194" y="0" width="6" height="64" fill="currentColor" opacity=".26"/><rect x="206" y="0" width="6" height="64" fill="currentColor" opacity=".26"/><rect x="218" y="0" width="6" height="64" fill="currentColor" opacity=".26"/></g><path d="M136 15Q152 27 168 15" fill="none" stroke="currentColor" stroke-width="2" opacity=".45"/><path d="M147 21C145 32 137 38 128 42" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".5"/><g opacity=".65"><circle cx="122" cy="46" r="6.5" fill="currentColor"/><rect x="122" y="39.5" width="15" height="6.5" rx="2" fill="currentColor" transform="rotate(-24 122 46)"/><circle cx="122" cy="46" r="2.3" style="fill:var(--s1)"/></g></svg>',
    admin: '<svg viewBox="0 0 220 64" preserveAspectRatio="xMaxYMid slice"><path d="M100 0H148L160 46L156 64H92Z" fill="currentColor" opacity=".12"/><path d="M220 0H176L164 46L168 64H220Z" fill="currentColor" opacity=".12"/><path d="M148 0L160 46L130 16Z" fill="currentColor" opacity=".14"/><path d="M176 0L164 46L194 16Z" fill="currentColor" opacity=".14"/><path d="M148 0H176L162 48Z" fill="currentColor" opacity=".24"/><path d="M150 0L157 9L162 2ZM174 0L167 9L162 2Z" fill="currentColor" opacity=".45"/><path d="M158 4H166L164.5 11H159.5Z" fill="currentColor" opacity=".7"/><path d="M159.5 11H164.5L167 40L162 47L157 40Z" fill="currentColor" opacity=".5"/><path d="M130 16L148 0M194 16L176 0M112 31H132" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".4"/><path d="M116 31L128 31L124 26Z" fill="currentColor" opacity=".35"/><circle cx="162" cy="56" r="2" fill="currentColor" opacity=".45"/></svg>',
  };
  const art = svg => `<span class="fd-art" aria-hidden="true">${svg}</span>`;
  const LOCKUP = `<svg class="fd-lk" viewBox="0 0 200 100" role="img" aria-label="BE Fit Club"><g transform="translate(4 47)"><path d="M2 26.5C0.5 20 0.5 10 3 3H17C18 8 20.5 11 26 12L46 16C53 17.5 57 20.5 56 24C55.6 25.8 54.3 26.5 52 26.5Z" fill="currentColor"/><path d="M6 26.5h5v3h-5zM17 26.5h5v3h-5zM36 26.5h5v3h-5zM46 26.5h5v3h-5z" fill="currentColor"/><path d="M20 9.5l3 4M26 11.5l2.5 3.5M32 12.8l2 3.4" style="stroke:var(--knock,#0B0D10)" stroke-width="1.7" stroke-linecap="round" fill="none"/></g><path d="M138 50.5V70M148 50.5V70M166 50.5V70M176 50.5V70M131.5 56H182.5M131.5 63H182.5" stroke="currentColor" stroke-width="1.4" opacity=".32"/><circle cx="157" cy="59.5" r="10.5" fill="currentColor"/><clipPath id="cb3"><circle cx="157" cy="59.5" r="10.5"/></clipPath><g clip-path="url(#cb3)"><polygon points="157.00,55.72 160.59,58.33 159.22,62.56 154.78,62.56 153.41,58.33" style="fill:var(--knock,#0B0D10)"/><polygon points="157.00,52.37 153.90,50.12 155.09,46.48 158.91,46.48 160.10,50.12" style="fill:var(--knock,#0B0D10)"/><polygon points="163.79,57.30 164.98,53.66 168.80,53.66 169.99,57.30 166.89,59.55" style="fill:var(--knock,#0B0D10)"/><polygon points="161.20,65.28 165.02,65.28 166.21,68.92 163.11,71.16 160.01,68.92" style="fill:var(--knock,#0B0D10)"/><polygon points="152.80,65.28 153.99,68.92 150.89,71.16 147.79,68.92 148.98,65.28" style="fill:var(--knock,#0B0D10)"/><polygon points="150.21,57.30 147.11,59.55 144.01,57.30 145.20,53.66 149.02,53.66" style="fill:var(--knock,#0B0D10)"/></g><path d="M157.00 55.72L157.00 52.15M160.59 58.33L163.99 57.23M159.22 62.56L161.32 65.45M154.78 62.56L152.68 65.45M153.41 58.33L150.01 57.23" style="stroke:var(--knock,#0B0D10)" stroke-width="0.84" stroke-linecap="round"/><path d="M62 70H80L88 59L97 81L107 30L116 70H128V47H186V70" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';
  const TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
  const RING = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" stroke-dasharray="2.3 2.1"/></svg>';
  const CHEV = '<span class="chev" aria-hidden="true">›</span>';

  const inPractice = () => document.documentElement.classList.contains('practice');
  const firstName = n => String(n || '').trim().split(/\s+/)[0];

  // His real last 5 games' points as bars (oldest → newest), the latest one brighter.
  function barsArt(pts) {
    if (!pts.length) return '';
    const X = [118, 135, 152, 169, 186];
    const xs = X.slice(X.length - pts.length);
    const max = Math.max(9, ...pts);
    return art('<svg viewBox="0 0 220 64" preserveAspectRatio="xMaxYMid slice">' + pts.map((p, i) => {
      const h = p > 0 ? Math.max(4, Math.round(p / max * 46)) : 3;
      return `<rect x="${xs[i]}" y="${62 - h}" width="11" height="${h}" rx="3" fill="currentColor" opacity="${i === pts.length - 1 ? '0.55' : '0.28'}"/>`;
    }).join('') + '</svg>');
  }

  // ---- pieces
  function title(at) {
    return `<div class="fd-title st"${at()}>${LOCKUP}<h1 class="fd-wm">BE FIT <em>CLUB</em></h1><div class="fd-slogan">Be fit or be finished</div></div>`;
  }

  function liveSession() { return App.isLiveMatch() ? Store.activeSession() : null; }

  // The Tonight strip: the next game + the last score. Live: the joined score block, tap → Match.
  function tonight(at) {
    const live = liveSession();
    if (live) {
      return `<div class="fd-live st"${at()}><div class="lbl"><span>${UI.liveDot()}</span><b>Tap for the match</b></div>` +
        UI.scoreFor(live, { size: 'compact', tap: 'live' }) + '</div>';
    }
    const last = Scoring.lastGame(Store.state);
    const next = UI.nextGame();
    const word = next === UI.fmt.iso(Store.now()) ? 'Tonight' : 'Next game';
    return `<div class="fd-tonight st"${at()}><div class="tl"><small>${word}</small><b>${esc(UI.fmt.date(next))}</b></div>` +
      (last ? `<div class="tr">Last ${UI.miniScore(last.sess)}</div>` : '') + '</div>';
  }

  // Laptop, left column: the last game (or the live one) as the joined score block.
  function lastBlock(at) {
    const live = liveSession();
    if (live) {
      return `<div class="fd-last st"${at()}><div class="lbl"><span>${UI.liveDot()}</span><b>Tap for the match</b></div>` +
        UI.scoreFor(live, { size: 'full', tap: 'live', scorers: true }) + '</div>';
    }
    const last = Scoring.lastGame(Store.state);
    if (!last) return '';
    const next = UI.nextGame();
    const word = next === UI.fmt.iso(Store.now()) ? 'Tonight' : 'Next game';
    return `<div class="fd-last st"${at()}><div class="lbl"><span>${word} · ${esc(UI.fmt.date(next))}</span><b>Last game · ${esc(UI.fmt.short(last.sess.date))}</b></div>` +
      UI.scoreFor(last.sess, { size: 'full', scorers: true }) + '</div>';
  }

  function door(o) {
    return `<button type="button" class="fd-door ${o.cls || ''} st" data-tap="${o.tap}"${o.at()}>${o.art || ''}${o.left || ''}` +
      `<span class="tx">${o.kk ? `<span class="kk">${o.kk}</span>` : ''}<b>${esc(o.title)}</b><span class="sub">${o.sub}</span></span>${CHEV}</button>`;
  }

  function staffDoor(tap, name, sub, svg, signedIn, at) {
    const left = `<span class="fd-lock${signedIn ? ' on' : ''}">${signedIn ? TICK : LOCK}</span>`;
    return door({ tap, cls: 'is-staff', art: art(svg), left, title: name, sub: signedIn ? 'Signed in' : sub, at });
  }

  function doors(at) {
    const out = [];
    const pid = App.viewer();
    const me = pid ? Store.player(pid) : null;
    if (me) {
      const row = (Scoring.seasonTable() || []).find(r => r.pid === pid);
      const hist = Scoring.playerHistory(pid, Store.state, 5).map(h => h.pts).reverse();
      const mv = row && row.move > 0 ? ` · <em class="up">▲${row.move}</em>` : row && row.move < 0 ? ` · <em class="dn">▼${-row.move}</em>` : '';
      const sub = row ? `${esc(UI.fmt.ordinal(row.rank))} · ${esc(row.pts)} pts${mv}` : 'Your page';
      out.push(door({ tap: 'continue', cls: `is-continue lit ${Teams.cls(me.defaultTeam)}`, art: barsArt(hist), left: UI.avatar(me.name, me.defaultTeam, { size: 48 }),
        kk: 'Continue as', title: me.name, sub, at }));
      out.push(`<button type="button" class="fd-notyou st" data-tap="find"${at()}>Not ${esc(firstName(me.name))}? Find your name ›</button>`);
    } else {
      out.push(door({ tap: 'stats', cls: 'is-primary', art: art(ART.stats), title: 'My stats', sub: 'Your points and every match you played', at }));
    }
    out.push(door({ tap: 'browse', art: art(ART.guest), title: 'Browse as guest', sub: 'Scores, tables, the season', at }));
    out.push(staffDoor('referee', 'Referee', 'Tonight’s match', ART.ref, Auth.isReferee(), at));
    out.push(staffDoor('admin', 'Admin', 'Run the club', ART.admin, Auth.isAdmin(), at));
    return `<div class="fd-doors">${out.join('')}</div>`;
  }

  function foot(at) {
    const link = inPractice()
      ? `<a class="fd-practice" href="${esc(location.pathname)}"><span class="fd-pill">${RING}Exit practice ›</span></a>`
      : `<a class="fd-practice" href="${esc(location.pathname)}?practice" data-practice><span class="fd-pill">${RING}Try practice mode <em>· nothing is saved</em>${LOCK}</span></a>`;
    return `<div class="fd-foot st"${at()}>${link}</div>`;
  }

  // ---- state "find": the search (results only once something is typed)
  function hl(name, q) {
    const s = String(name), t = q.trim();
    const i = t ? s.toLowerCase().indexOf(t.toLowerCase()) : -1;
    if (i < 0) return esc(s);
    return esc(s.slice(0, i)) + `<span class="fd-hl">${esc(s.slice(i, i + t.length))}</span>` + esc(s.slice(i + t.length));
  }
  function personRow(p, q, pts) {
    return UI.row({ tap: 'pick', data: { pid: p.pid }, left: UI.avatar(p.name, p.defaultTeam), titleHtml: hl(p.name, q),
      meta: [p.defaultPosition, pts[p.pid] != null ? pts[p.pid] + ' pts this season' : ''].filter(Boolean).join(' · '), right: UI.teamChip(p.defaultTeam) });
  }
  function results(q) {
    const r = App.findPeople(q, 6);
    if (!r.total) return UI.empty(`No one called "${q.trim()}"`, '') + `<button type="button" class="link fd-skip" data-tap="browse">Not you? Browse as guest ›</button>`;
    const pts = {};
    (Scoring.seasonTable() || []).forEach(x => { pts[x.pid] = x.pts; });
    return `<div class="lbl">${r.total === 1 ? '1 match' : r.total + ' matches'}${r.total > r.list.length ? ' <b>keep typing</b>' : ''}</div>` +
      UI.rows(r.list.map(p => personRow(p, q, pts))) + `<button type="button" class="link fd-skip" data-tap="browse">Not you? Browse as guest ›</button>`;
  }
  function findPane(q, at) {
    return `<div class="fd-sub st"${at()}><button type="button" class="fd-back" data-tap="menu">‹ Menu</button><h2>Find your name</h2>` +
      UI.search({ name: 'who', placeholder: 'Find your name', value: q }) +
      `<div data-fd-res>${q.trim() ? results(q) : ''}</div><div class="fd-hint">Your name stays on this phone.</div></div>`;
  }

  App.registerScreen('welcome', {
    mode: 'any',
    nav: false,
    flush: true,
    header: () => false,
    mount(el, ctx) {
      el.dataset.theme = 'dark';                       // the front door is always dark, whatever the app theme
      el.classList.add('lit');                         // its floodlight and team glows are the listed "front-door" light
      el._fd = { view: 'menu', q: '' };
      document.body.classList.add('is-fd');
      ctx.onCleanup(() => document.body.classList.remove('is-fd'));

      // Entry motion starts when the splash has gone (no splash: at once).
      const spl = document.getElementById('splash');
      if (spl && spl.isConnected) {
        el.classList.add('fd-hold');
        const release = () => { obs.disconnect(); clearTimeout(t); el.classList.remove('fd-hold'); if (el._fdFirst) el.classList.add('fd-anim'); };
        const obs = new MutationObserver(() => { if (!document.getElementById('splash')) release(); });
        obs.observe(document.body, { childList: true, subtree: true });
        const t = setTimeout(release, 3600);
        ctx.onCleanup(() => { obs.disconnect(); clearTimeout(t); });
      } else el.classList.add('fd-anim');

      const draw = () => render(el, { wide: matchMedia('(min-width: 960px)').matches });
      UI.on(el, 'stats', () => { el._fd.view = 'find'; draw(); });
      UI.on(el, 'find', () => { el._fd.view = 'find'; draw(); });
      UI.on(el, 'menu', () => { el._fd.view = 'menu'; el._fd.q = ''; draw(); });
      UI.on(el, 'continue', () => App.go('player.me', {}, { replace: true }));
      UI.on(el, 'pick', b => { App.setViewer(b.dataset.pid); App.go('player.me', {}, { replace: true }); });
      UI.on(el, 'browse', () => { App.setViewer('guest'); App.go('guest.home', {}, { replace: true }); });
      UI.on(el, 'referee', () => {
        if (Auth.isReferee()) { App.setRole('referee'); App.goTab('match'); return; }
        App.openSignIn({ as: 'referee' });
      });
      UI.on(el, 'admin', () => {
        if (Auth.isAdmin()) { App.setRole('admin'); App.go('admin.home', {}, { replace: true }); return; }
        App.openSignIn({ as: 'admin' });
      });
      UI.on(el, 'live', () => {
        if (Auth.isReferee()) { App.setRole('referee'); App.goTab('match'); } else App.go('player.live');
      });
      el.addEventListener('click', e => {
        // a signed-in admin may open practice without the password (practice.js reads this stamp)
        if (e.target.closest('[data-practice]') && Auth.isAdmin() && window.PracticePw) window.PracticePw.adminPass();
      });
      el.addEventListener('input', e => {
        if (!e.target.matches('[data-search="who"]')) return;
        el._fd.q = e.target.value;
        el.querySelector('[data-fd-res]').innerHTML = el._fd.q.trim() ? results(el._fd.q) : '';
      });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-search="who"]')) e.target.blur(); });
      // the live clock moves a minute at a time
      ctx.every(10000, () => {
        const s = liveSession(), mid = el.querySelector('.fd-live .sb-mid, .fd-last .sb-mid');
        if (!s || !mid) return;
        const c = UI.scoreCentre(s);
        const b = mid.querySelector('b'), sm = mid.querySelector('small');
        if (b) b.textContent = c.top || '';
        if (sm) sm.textContent = c.sub || '';
      });
    },
    render(el, ctx) { render(el, ctx); },
  });

  function render(el, ctx) {
    if (!Store.hasData()) { el.innerHTML = '<div class="skel" style="height:220px;margin:30px 16px 0"></div><div class="skel" style="height:84px;margin:16px 16px 0"></div>'; return; }
    const s = el._fd || (el._fd = { view: 'menu', q: '' });
    // anything after the first paint appears without the entry motion
    if (el._fdFirst) el.classList.remove('fd-anim'); else el._fdFirst = true;
    const wide = !!(ctx && ctx.wide);
    const order = Teams.list();
    const c1 = (order[0] && order[0].colour) || 'green', c2 = (order[1] && order[1].colour) || 'red';
    el.style.setProperty('--c1', `var(--${c1})`);
    el.style.setProperty('--c2', `var(--${c2})`);
    let n = 0;
    const at = () => ` style="--i:${n++}"`;
    const find = s.view === 'find';
    el.classList.toggle('is-find', find);
    if (wide) {
      el.innerHTML = `<div class="fd-l">${title(at)}${lastBlock(at)}</div>` +
        `<div class="fd-r">${find ? findPane(s.q, at) : `<div class="fd-section st"${at()}>Who’s here?</div>${doors(at)}${foot(at)}`}</div>`;
    } else if (find) {
      el.innerHTML = findPane(s.q, at);
    } else {
      el.innerHTML = title(at) + tonight(at) + doors(at) + foot(at);
    }
    if (find) {
      const input = el.querySelector('[data-search="who"]');
      if (input && !el._fdFocused) { el._fdFocused = true; input.focus({ preventScroll: true }); }
    } else el._fdFocused = false;
  }
})();
