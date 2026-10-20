/* ============================================================================
   BE Fit Club · js/ui/components.js · shared building blocks (window.UI)
   ----------------------------------------------------------------------------
   Markup helpers return HTML strings (escape every name with UI.esc — names are
   typed by people). Behaviour is wired once, by event delegation, so re-rendering
   a screen never loses it. Styles live in css/components.css.

   TEXT & FORMAT
     UI.esc(str)                      escape for HTML (ALWAYS use for names / free text)
     UI.fmt.date('2026-10-12')        'Mon 12 Oct'      · UI.fmt.date(d, {long:true}) 'Monday 12 October'
     UI.fmt.short('2026-10-12')       '12 Oct'
     UI.fmt.time(ms)                  '21:23'
     UI.fmt.money(360)                '₵360'  (decimals only when needed)
     UI.fmt.team('green')             'Green' (the team's name from Settings, via Teams.name)
     UI.fmt.signed(-2)                '−2'  ('+3', '0')
     UI.fmt.ordinal(1)                '1st'
     UI.fmt.minute(ev)                "33'" / "45+2'" / ''
     UI.fmt.plural(3, 'goal')         '3 goals'
     UI.icon(name)                    svg: live table season me match squad money search chev back close more check wifi-off plus

   MARKS (not tappable)
     UI.teamMark(team, {label})       8 px square in the team colour + the team word (inline text, headings)
     UI.teamChip(team, {label})       24 px TEAM CHIP: soft team tint, team ring, 7 px square + word (lists, rows) ← round 5
     UI.resultMark(r, team?)          24 px W / D / L. With a team: W = team fill, D = team outline, L = faint team tint
                                      (the team that row is about; on a player's history, the team he played for).
                                      Without a team: ink (old look; avoid in new screens).
     UI.move(n)                       ▲n (ink) / ▼n (ink3) / '' when unchanged. Goes under the rank.
     UI.pos('MID')                    position letters, mono, ink3
     UI.pill(text, {kind:'warn'|'ink'})   28 px status pill, not tappable
     UI.avatar(name, team, {size})    32 px initial on a team tint with a team ring (size: px number, e.g. 44, 58)
     UI.cardGlyph('yellow'|'red')     9×13 card shape (the only place card colours appear)

   CONTROLS (tap targets: 48 px referee, 44 px player)
     UI.row({ title, meta, right, pts, chevron, tap, data, cls, tall, sel })   one list row (button if tap given)
     UI.rows(rowHtml[] | string, {cls})                                        rounded list container
     UI.tile({ name, pos, tap, data, sel, center, cls })                       64 px player tile; name wraps to 2 lines, position below
     UI.tiles(tileHtml[])                                                      2-column grid of tiles
     UI.chips(name, [{value,label,n,on}], {ref, multi})                       one row, scrolls sideways, never wraps
     UI.seg(name, [{value,label,n,team}], value, {ref})                        segmented switch (one is .on)
     UI.teamSwitch(name, [{team,count}], value, {ref})                         "Green · 5 | Red · 5", any number of teams
     UI.search({ name, placeholder, value })                                   48 px search box
     UI.btn(label, { kind:'w'|'g'|'o'|'warn', sm, big, tap, data, cls, attrs })
     UI.hold(label, { name, ms:2000, warn, doneText:'Ending…' })               hold-to-confirm (End game, Clear payment record)
     ---- round 5 shared pieces (see css/components.css "round 5") ----
     UI.score({ teams, centre|mid, size, scorers, names, hero, tap, data, cls })   THE joined score block (one piece everywhere)
         teams   [{team, goals}] left → right (Scoring.orderTeams). Any number of teams (3+ sit side by side).
         centre  { top:'FT', sub:'19 Oct', state:'ft'|'live'|'ht'|'paused'|'stoppage'|'vs'|'idle' }  (stoppage = amber)
         mid     legacy: raw HTML for the centre (old callers; prefer centre)
         size    'full' (76 px, 56 px numerals: Home, Match) · 'console' (66 / 46) · 'compact' (60 / 40: cards, FT check)
         scorers { team: [{ name, og, mins:[ev] }] } (Scoring.scorers) → names under their own half, minutes in Mono
         names   false hides the names row above the halves · hero: true = this screen's one glowing hero
     UI.scoreFor(sess, { size, scorers:true, hero, clock, now, tap, data, cls })  the block for a session (centre from the clock)
     UI.scoreCentre(sess, { now, clock })     → { top, sub, state }   FT · 72' 2nd half · HT 45:00 · +7:10 Stoppage · VS
                                                clock:true = the running clock ("30:01") instead of the minute (console)
     UI.miniScore(sessOrTeams)                two 28 px tinted squares with the numbers; the losing side's number ink2 (lists)
     UI.liveDot(text='LIVE')                  pulsing LIVE label (1.6 s halo, off under reduced motion)
     UI.sum({ rows:[{label, value}], total, label, team, hero, signed })   SUM PATTERN: values in one right column, the
                                                total as a team-coloured hero under it, right edges aligned
     UI.podium([{pid,name,team,value,stat,note}] (ranks 1,2,3), { tap })   STEPPED PODIUM, shown 2 · 1 · 3
     UI.leaderRow({ label, name, team, value, next, tap, data })          tinted leader row (Tables · Stats)
     UI.syncChip(Store.status())              header sync chip: "✓ All sent" · "Sending 2…" · "On phone · 3 waiting" ·
                                                "No signal · 3 saved on phone"  (data-shell="sync" → App.action('console.syncSheet'))
     UI.nextGame(now?)                        'YYYY-MM-DD' of the next match day (Settings › club.matchDay, Monday by default;
                                                today if today is match day and tonight's game isn't finished)
     CSS-only (components.css): .hero (the one glow) · .lit (allowed light on listed components) · .wash (team row wash) ·
       .you-row (the "you" row) · .tnum (team-coloured numeral) · .hn (hero numeral) · .sheen · .tc (team chip)
     UI.empty(title, text)

   EVENTS (delegated; `root` is any element, usually your screen element)
     UI.on(root, tapName, (el, event, data) => {})     clicks on [data-tap="tapName"]; data = el.dataset
     UI.onSeg(root, name, (value, el) => {})           a seg / teamSwitch changed (the .on class moves by itself)
     UI.onChip(root, name, (value, el, on) => {})      a chip tapped (single-select by default; data-multi on .chips for multi)
     UI.onHold(root, name, (el) => {})                 a hold button completed (2 s)

   LAYERS
     UI.sheet.open({ title, sub, titleEnd, body, footer, cancel, onClose, cls, theme }) → handle
         body: html string or (bodyEl, handle) => void.  cancel: 'Cancel' adds a pinned Cancel.
         handle: { el, body, close(), setBody(html), setTitle(text) }.  34 px safe area below the last action.
     UI.sheet.closeAll() · UI.sheet.top()
     UI.undoBar.show({ text, sub?, onUndo, again:{label,run}, seconds:5 })   white bar, Undo with 5 → 0 count, shrinking line
     UI.undoBar.error({ title?, text, onRetry, onDismiss })              orange bar with Retry; stays until retried/dismissed
     UI.undoBar.saving(text) · UI.undoBar.note(text, ms=2000) · UI.undoBar.hide()
     UI.toast(text, { err, ms:2400 })                                     one line, never two
   ========================================================================== */
(function () {
  'use strict';
  const CFG = window.BF_CONFIG;
  const MINUS = '−';

  // ---------------------------------------------------------------- text
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const dataAttrs = data => Object.entries(data || {}).filter(([, v]) => v != null)
    .map(([k, v]) => ` data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${esc(v)}"`).join('');
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_L = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_L = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const toDate = d => (d instanceof Date ? d : new Date(String(d).length <= 10 ? d + 'T12:00:00' : d));

  const fmt = {
    date(d, o) {
      if (!d) return '';
      const x = toDate(d); if (isNaN(x)) return String(d);
      return o && o.long ? `${DAYS_L[x.getDay()]} ${x.getDate()} ${MONTHS_L[x.getMonth()]}` : `${DAYS[x.getDay()]} ${x.getDate()} ${MONTHS[x.getMonth()]}`;
    },
    short(d) { const x = toDate(d); return isNaN(x) ? '' : `${x.getDate()} ${MONTHS[x.getMonth()]}`; },
    iso(ms) { const x = new Date(ms); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; },
    time(ms) { const x = new Date(ms); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; },
    money(n) { const v = Number(n) || 0; return (CFG ? CFG.currency : '₵') + (Number.isInteger(v) ? v.toLocaleString('en-GB') : v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); },
    team(t) { return !t ? '' : window.Teams ? window.Teams.name(t) : t.charAt(0).toUpperCase() + t.slice(1); },
    signed(n) { return n > 0 ? '+' + n : n < 0 ? MINUS + Math.abs(n) : '0'; },
    ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); },
    minute(ev) { return window.Scoring ? window.Scoring.minuteText(ev) : ''; },
    plural(n, w) { return `${n} ${w}${n === 1 ? '' : 's'}`; },
  };

  // ---------------------------------------------------------------- icons (stroke icons from the design)
  const ICONS = {
    live: '<circle cx="12" cy="12" r="2.6"/><path d="M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10M4.2 4.2a11 11 0 0 0 0 15.6M19.8 4.2a11 11 0 0 1 0 15.6"/>',
    table: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
    season: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>',
    me: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    home: '<path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5M10 20v-5h4v5"/>',
    tables: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1"/>',
    person: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    match: '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M10 3.5h4M18 6.5l1.5-1.5"/>',
    squad: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.5a3 3 0 0 1 0 6M17 14a5.5 5.5 0 0 1 3.5 5"/>',
    money: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.6-4.6"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    more: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    'wifi-off': '<path d="M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.4-1.7M2 9.3a15 15 0 0 1 4.3-2.6M22 9.3A15 15 0 0 0 11 5.1M12 20h.01"/>',
  };
  const icon = (name, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  // ---------------------------------------------------------------- marks
  const teamMark = (team, o) => team ? `<span class="tm ${teamCls(team)}">${esc((o && o.label) || fmt.team(team))}</span>` : '';
  const teamCls = t => (window.Teams ? window.Teams.cls(t) : 't-' + String(t || '').replace(/[^A-Za-z0-9_-]/g, ''));
  const teamChip = (team, o) => team ? `<span class="tc ${teamCls(team)}">${esc((o && o.label) || fmt.team(team))}</span>` : '';
  const resultMark = (r, team) => r ? `<span class="wdl ${esc(r)}${team ? ' tcol ' + teamCls(team) : ''}" aria-label="${r === 'W' ? 'Won' : r === 'L' ? 'Lost' : 'Drawn'}">${esc(r)}</span>` : '';
  const move = n => !n ? '' : n > 0 ? `<span class="mv up" aria-label="Up ${n}">▲${n}</span>` : `<span class="mv dn" aria-label="Down ${-n}">▼${-n}</span>`;
  const pos = p => p ? `<span class="pos">${esc(p)}</span>` : '';
  const pill = (text, o) => `<span class="pill-s ${o && o.kind ? esc(o.kind) : ''}">${esc(text)}</span>`;
  const avatar = (name, team, o) => `<span class="av ${team ? teamCls(team) : 't-none'}"${o && o.size ? ` style="--av:${Number(o.size)}px"` : ''}>${esc(String(name || '?').trim().charAt(0).toUpperCase())}</span>`;
  const cardGlyph = kind => `<span class="card-glyph ${kind === 'red' ? 'red' : ''}" aria-label="${kind === 'red' ? 'Red card' : 'Yellow card'}"></span>`;

  // ---------------------------------------------------------------- controls
  function row(o) {
    const tag = o.tap ? 'button' : 'div';
    const tapA = o.tap ? ` type="button" data-tap="${esc(o.tap)}"` : '';
    const right = [o.right || '', o.pts != null ? `<span class="pts">${esc(o.pts)}</span>` : '', o.chevron ? '<span class="chev">›</span>' : ''].join('');
    return `<${tag} class="r${o.tall ? ' tall' : ''}${o.sel ? ' chg' : ''} ${esc(o.cls || '')}"${tapA}${dataAttrs(o.data)}>` +
      (o.left || '') +
      `<span class="grow"><span class="nm">${o.titleHtml || esc(o.title)}</span>${o.meta || o.metaHtml ? `<span class="meta" style="display:block">${o.metaHtml || esc(o.meta)}</span>` : ''}</span>` +
      (right ? `<span class="end">${right}</span>` : '') + `</${tag}>`;
  }
  const rows = (items, o) => `<div class="rows ${esc((o && o.cls) || '')}">${Array.isArray(items) ? items.join('') : items}</div>`;

  function tile(o) {
    const cls = ['ptile', o.sel ? 'sel' : '', o.center ? 'c' : '', o.cls || ''].join(' ');
    return `<button type="button" class="${cls}"${o.tap ? ` data-tap="${esc(o.tap)}"` : ''}${dataAttrs(o.data)}>` +
      `<span class="pt-name" data-label>${esc(o.name)}</span>${o.pos ? pos(o.pos) : ''}</button>`;
  }
  const tiles = list => `<div class="grid2 tiles">${list.join('')}</div>`;

  function chips(name, items, o) {
    return `<div class="chips" data-chips="${esc(name)}"${o && o.multi ? ' data-multi="1"' : ''}>` + items.map(it =>
      `<button type="button" class="chip${it.on ? ' on' : ''}${o && o.ref ? ' ref' : ''}" data-value="${esc(it.value)}">${esc(it.label)}${it.n != null ? ` <span class="n">${esc(it.n)}</span>` : ''}</button>`
    ).join('') + '</div>';
  }

  function seg(name, items, value, o) {
    return `<div class="seg${o && o.ref ? ' ref' : ''}" role="tablist" data-seg="${esc(name)}">` + items.map(it =>
      `<button type="button" role="tab" aria-selected="${it.value === value}" class="${it.value === value ? 'on' : ''}${it.team ? ` team t-${esc(it.team)}` : ''}" data-value="${esc(it.value)}">` +
      `<span>${esc(it.label)}${it.n != null ? `<span class="n"> · ${esc(it.n)}</span>` : ''}</span></button>`
    ).join('') + '</div>';
  }
  const teamSwitch = (name, teams, value, o) =>
    seg(name, teams.map(t => ({ value: t.team, label: fmt.team(t.team), n: t.count, team: t.team })), value, o);

  const search = o => `<label class="inp">${icon('search')}<input type="search" autocomplete="off" enterkeyhint="search" ` +
    `data-search="${esc(o.name || 'q')}" placeholder="${esc(o.placeholder || 'Search')}" value="${esc(o.value || '')}" aria-label="${esc(o.placeholder || 'Search')}"></label>`;

  function btn(label, o) {
    o = o || {};
    const cls = ['btn', o.kind || 'w', o.sm ? 'sm' : '', o.big ? 'big' : '', o.cls || ''].join(' ');
    return `<button type="button" class="${cls}"${o.tap ? ` data-tap="${esc(o.tap)}"` : ''}${dataAttrs(o.data)}${o.attrs || ''}>${o.html || esc(label)}</button>`;
  }

  const hold = (label, o) => {
    o = o || {};
    return `<button type="button" class="hold${o.warn ? ' warn' : ''}" data-hold="${esc(o.name || 'hold')}" style="--hold-ms:${o.ms || 2000}ms" data-ms="${o.ms || 2000}" data-done-text="${esc(o.doneText || 'Ending…')}">` +
      `<span class="fill"></span><span class="hl">${esc(label)}</span></button>`;
  };

  // ---------------------------------------------------------------- round 5: the joined score block
  // One piece everywhere (Home, Match, the console, the goal moment, FT check, share card previews).
  const SB_SIZES = { full: 'sb-full', console: 'sb-console', compact: 'sb-compact' };
  function scorersHtml(teams, by) {
    if (!by) return '';
    const col = (t, rt) => {
      const list = (t && by[t.team]) || [];
      return `<div class="${rt ? 'rt' : 'lt'}">` + list.map(r => `<div class="sc-r"><span class="sc-n">${esc(r.name)}${r.og ? ' (og)' : ''}</span> ` +
        `<span class="n">${(r.mins || []).map(e => esc(fmt.minute(e))).filter(Boolean).join(' ')}</span></div>`).join('') + '</div>';
    };
    if (!teams.some(t => (by[t.team] || []).length)) return '';
    if (teams.length !== 2) return `<div class="sb-scorers multi">${teams.map(t => col(t)).join('')}</div>`;
    return `<div class="sb-scorers">${col(teams[0])}<div></div>${col(teams[1], true)}</div>`;
  }
  function score(o) {
    o = o || {};
    const teams = (o.teams || []).filter(Boolean);
    const n = Math.max(2, teams.length);
    const c = o.centre || null;
    const mid = c ? `<b>${esc(c.top || '')}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}` : (o.mid || '');
    const midCls = 'sb-mid' + (c && c.state ? ' is-' + esc(c.state) : '');
    const half = t => t ? `<div class="sb-half ${teamCls(t.team)}"><b class="hn tnum">${esc(t.goals)}</b></div>` : '<div class="sb-half"></div>';
    const name = (t, rt) => t ? `<span class="sb-nm ${teamCls(t.team)}${rt ? ' rt' : ''}">${esc(fmt.team(t.team))}</span>` : '<span></span>';
    const cols = n === 2 ? '' : ` style="--sb-cols:1fr var(--sb-mid) repeat(${n - 1}, 1fr)"`;
    const names = o.names === false ? '' :
      `<div class="sb-names"${cols}>${name(teams[0])}<span></span>${teams.slice(1).map((t, i) => name(t, n === 2 && i === 0)).join('')}</div>`;
    const blk = `<div class="sb-blk"${cols}>${half(teams[0])}<div class="${midCls}">${mid}</div>` +
      `${teams.slice(1).map(half).join('')}${teams.length < 2 ? half(null) : ''}</div>`;
    const cls = ['sb', 'lit', SB_SIZES[o.size] || 'sb-full', o.hero ? 'hero' : '', n > 2 ? 'sb-multi' : '', o.cls || '']
      .filter(Boolean).join(' ');
    const tag = o.tap ? 'button' : 'div';
    const tapA = o.tap ? ` type="button" data-tap="${esc(o.tap)}"` : '';
    const label = teams.map(t => `${fmt.team(t.team)} ${t.goals}`).join(', ') + (c ? ', ' + [c.top, c.sub].filter(Boolean).join(' ') : '');
    return `<${tag} class="${cls}"${tapA}${dataAttrs(o.data)} aria-label="${esc(label)}">${names}${blk}${scorersHtml(teams, o.scorers)}</${tag}>`;
  }

  // The centre of the block from a session's clock: FT · 72' 2nd half · HT 45:00 · +7:10 Stoppage · VS.
  function scoreCentre(sess, o) {
    o = o || {};
    const C = window.Clock;
    const now = o.now != null ? o.now : (window.Store ? window.Store.now() : Date.now());
    const mode = (sess && sess.mode) || 'live';
    const date = sess && sess.date ? fmt.short(sess.date) : '';
    if (!sess || !C || mode !== 'live' || sess.status === 'completed') return { top: 'FT', sub: date, state: 'ft' };
    const st = C.status(sess), t = sess.timer || {};
    if (st === 'ended') return { top: 'FT', sub: date, state: 'ft' };
    if (st === 'idle') return { top: 'VS', sub: o.idleSub || '', state: 'vs' };
    const half = t.htLogged ? '2nd half' : '1st half';
    if (st === 'stoppage') return { top: '+' + C.fmtClock(C.halfStoppageMs(sess, now)), sub: 'Stoppage', state: 'stoppage' };
    if (st === 'paused' && t.pauseReason === 'halftime') return { top: 'HT', sub: C.fmtClock(C.elapsedMs(sess, now)), state: 'ht' };
    if (st === 'paused') return { top: 'Paused', sub: o.clock ? C.fmtClock(C.elapsedMs(sess, now)) : (C.minute(sess, now) || 0) + "'", state: 'paused' };
    return { top: o.clock ? C.fmtClock(C.elapsedMs(sess, now)) : (C.minute(sess, now) || 1) + "'", sub: half, state: 'live' };
  }
  function sessTeams(sess) {
    const S = window.Scoring;
    if (!S || !sess) return [];
    return S.orderTeams(S.teamsOf(sess)).map(team => ({ team, goals: S.teamGoals(sess, team) }));
  }
  function scoreFor(sess, o) {
    o = o || {};
    const S = window.Scoring;
    return score(Object.assign({}, o, { teams: sessTeams(sess), centre: o.centre || scoreCentre(sess, o),
      scorers: o.scorers === true && S ? S.scorers(sess) : (o.scorers || null) }));
  }

  // Mini score for lists: two 28 px tinted squares; the losing side's number in ink2.
  function miniScore(x) {
    const teams = Array.isArray(x) ? x : sessTeams(x);
    const g = t => Number(t.goals) || 0;
    const max = teams.length ? Math.max(...teams.map(g)) : 0;
    const tie = teams.filter(t => g(t) === max).length > 1;
    return `<span class="ms" aria-label="${esc(teams.map(t => fmt.team(t.team) + ' ' + t.goals).join(', '))}">` +
      teams.map(t => `<i class="${teamCls(t.team)}${!tie && g(t) < max ? ' lose' : ''}">${esc(t.goals)}</i>`).join('') + '</span>';
  }
  const liveDot = text => `<span class="live pulse">${esc(text || 'LIVE')}</span>`;

  // Sum pattern: values in one right-aligned column, the total as the hero under it, right edges aligned.
  function sum(o) {
    o = o || {};
    const v = x => (typeof x === 'number' && o.signed !== false ? fmt.signed(x) : x);
    return `<div class="sum lit${o.hero ? ' hero' : ''}${o.team ? ' ' + teamCls(o.team) : ''}">` +
      (o.rows || []).map(r => `<div class="sr"><span class="sr-l">${r.html || esc(r.label)}</span><span class="v">${esc(v(r.value))}</span></div>`).join('') +
      `<div class="sum-tot"><span class="lab">${esc(o.label || 'Total')}</span><b class="hn tnum">${esc(o.total)}</b></div></div>`;
  }

  // Stepped podium: items are ranks 1, 2, 3; shown 2 · 1 · 3. Steps 64 / 92 / 44 px; #1 wider, lit, haloed.
  function podium(items, o) {
    o = o || {};
    items = items || [];
    const col = (it, rank) => {
      if (!it) return '<div class="pcol empty"></div>';
      const tag = o.tap ? 'button' : 'div';
      const tapA = o.tap ? ` type="button" data-tap="${esc(o.tap)}" data-pid="${esc(it.pid || '')}"` : '';
      return `<${tag} class="pcol lit r${rank}${rank === 1 ? ' first' : ''} ${teamCls(it.team)}"${tapA}>` +
        `<span class="who">${avatar(it.name, it.team)}<span class="nm">${esc(it.name)}</span><b class="hn">${esc(it.value)}</b>` +
        (it.stat ? `<span class="st">${esc(it.stat)}</span>` : '') + (it.note ? `<span class="st">${esc(it.note)}</span>` : '') +
        `</span><span class="step"><b>${rank}</b></span></${tag}>`;
    };
    return `<div class="pod">${col(items[1], 2)}${col(items[0], 1)}${col(items[2], 3)}</div>`;
  }
  // Leader row (Tables · Stats): tinted 22% → 0, glowing top edge, 40 px number with a soft team text-glow.
  function leaderRow(o) {
    const tag = o.tap ? 'button' : 'div';
    return `<${tag} class="ldr lit ${teamCls(o.team)}"${o.tap ? ` type="button" data-tap="${esc(o.tap)}"` : ''}${dataAttrs(o.data)}>` +
      `${avatar(o.name, o.team, { size: 44 })}<span class="grow"><span class="k">${esc(o.label)}</span><span class="w">${esc(o.name)}</span>` +
      (o.next ? `<span class="nx">${esc(o.next)}</span>` : '') + `</span><b class="hn">${esc(o.value)}</b></${tag}>`;
  }

  // Header sync chip (referee). Quiet when all sent; amber outline + dot while saves wait on the phone.
  function syncChip(info) {
    info = info || {};
    const n = info.pending || 0;
    let text, wait = false;
    if (!n) { text = info.status === 'offline' ? 'No signal' : '✓ All sent'; wait = info.status === 'offline'; }
    else if (info.status === 'online' && !info.failed) text = `Sending ${n}…`;
    else if (info.source === 'cache' || info.source === 'none') { text = `No signal · ${n} saved on phone`; wait = true; }
    else { text = `On phone · ${n} waiting`; wait = true; }
    return `<button type="button" class="hd-syncbtn" data-shell="sync" data-sync aria-label="${esc(text)}"><span class="sync${wait ? ' wait' : ''}">${esc(text)}</span></button>`;
  }

  // The next match day as 'YYYY-MM-DD' (today if it is match day and tonight's game isn't finished).
  function nextGame(now) {
    now = now != null ? now : (window.Store ? window.Store.now() : Date.now());
    const day = window.Teams ? window.Teams.club().matchDay : 1;
    const d = new Date(now); d.setHours(12, 0, 0, 0);
    const iso = fmt.iso(d.getTime());
    const done = !!window.Store && Object.values(window.Store.sessions()).some(x => x && x.date === iso && x.status === 'completed');
    let add = (day - d.getDay() + 7) % 7;
    if (add === 0 && done) add = 7;
    d.setDate(d.getDate() + add);
    return fmt.iso(d.getTime());
  }
  const empty = (title, text) => `<div class="empty"><b>${esc(title)}</b>${text ? esc(text) : ''}</div>`;

  // ---------------------------------------------------------------- delegation
  function on(root, name, fn) {
    root.addEventListener('click', e => {
      const el = e.target.closest(`[data-tap="${name}"]`);
      if (!el || !root.contains(el) || el.classList.contains('is-locked') || el.classList.contains('is-saving')) return;
      fn(el, e, Object.assign({}, el.dataset));
    });
  }
  const onCustom = type => (root, name, fn) => root.addEventListener(type, e => {
    if (e.detail && e.detail.name === name) fn(e.detail.value, e.target, e.detail.on);
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-seg] > button');
    if (b) {
      const segEl = b.parentElement;
      segEl.querySelectorAll(':scope > button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
      b.dispatchEvent(new CustomEvent('ui:seg', { bubbles: true, detail: { name: segEl.dataset.seg, value: b.dataset.value } }));
      return;
    }
    const c = e.target.closest('[data-chips] > .chip');
    if (c) {
      const wrap = c.parentElement;
      const multi = !!wrap.dataset.multi;
      const nowOn = multi ? !c.classList.contains('on') : true;
      if (!multi) wrap.querySelectorAll(':scope > .chip').forEach(x => x.classList.toggle('on', x === c));
      else c.classList.toggle('on', nowOn);
      c.dispatchEvent(new CustomEvent('ui:chip', { bubbles: true, detail: { name: wrap.dataset.chips, value: c.dataset.value, on: nowOn } }));
    }
  });

  // hold-to-confirm
  let holdTimer = null, holdEl = null;
  function holdStart(el) {
    if (el.classList.contains('done')) return;
    holdCancel();
    holdEl = el; el.classList.add('holding');
    holdTimer = setTimeout(() => {
      el.classList.remove('holding'); el.classList.add('done');
      const hl = el.querySelector('.hl'); if (hl) hl.textContent = el.dataset.doneText || 'Done';
      holdEl = null; holdTimer = null;
      el.dispatchEvent(new CustomEvent('ui:hold', { bubbles: true, detail: { name: el.dataset.hold } }));
    }, Number(el.dataset.ms) || 2000);
  }
  function holdCancel() {
    if (holdTimer) clearTimeout(holdTimer);
    if (holdEl) holdEl.classList.remove('holding');
    holdTimer = null; holdEl = null;
  }
  document.addEventListener('pointerdown', e => { const el = e.target.closest('.hold'); if (el) { e.preventDefault(); holdStart(el); } });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => document.addEventListener(t, e => { if (holdEl && (t !== 'pointerleave' || e.target === holdEl)) holdCancel(); }, true));
  document.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && e.target.classList && e.target.classList.contains('hold') && !e.repeat) { e.preventDefault(); holdStart(e.target); } });
  document.addEventListener('keyup', e => { if ((e.key === ' ' || e.key === 'Enter') && holdEl) holdCancel(); });
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.hold')) e.preventDefault(); });

  // ---------------------------------------------------------------- sheets
  const stack = [];
  const layer = () => document.getElementById('app-layer') || document.body;
  function openSheet(o) {
    o = o || {};
    const dim = document.createElement('div'); dim.className = 'dim';
    const el = document.createElement('div');
    el.className = 'sheet ' + (o.cls || '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    if (o.theme) el.dataset.theme = o.theme, dim.dataset.theme = o.theme;
    el.innerHTML = `<div class="sheet-h"><div class="hdl"></div>` +
      (o.title ? `<h4><span class="sheet-title">${esc(o.title)}</span>${o.titleEnd ? `<span class="end">${o.titleEnd}</span>` : ''}</h4>` : '') +
      (o.sub ? `<div class="sh-s">${esc(o.sub)}</div>` : '') + `</div><div class="sheet-b"></div>` +
      (o.footer || o.cancel ? `<div class="sheet-f">${o.footer || ''}${o.cancel ? btn(o.cancel === true ? 'Cancel' : o.cancel, { kind: 'g', sm: true, tap: 'sheet-cancel' }) : ''}</div>` : '');
    const body = el.querySelector('.sheet-b');
    const h = {
      el, body, closed: false,
      close() {
        if (h.closed) return; h.closed = true;
        dim.remove(); el.remove();
        const i = stack.indexOf(h); if (i >= 0) stack.splice(i, 1);
        if (!stack.length) document.body.classList.remove('sheet-open');
        if (o.onClose) o.onClose(h);
      },
      setBody(html) { body.innerHTML = html; },
      setTitle(t) { const x = el.querySelector('.sheet-title'); if (x) x.textContent = t; },
    };
    if (typeof o.body === 'function') o.body(body, h); else body.innerHTML = o.body || '';
    dim.addEventListener('click', () => h.close());
    on(el, 'sheet-cancel', () => h.close());
    layer().appendChild(dim); layer().appendChild(el);
    stack.push(h);
    document.body.classList.add('sheet-open');
    const focusable = el.querySelector('input:not([type=hidden])');
    if (focusable && o.autofocus !== false && window.matchMedia('(pointer:fine)').matches) setTimeout(() => focusable.focus(), 60);
    return h;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });
  const sheet = { open: openSheet, closeAll() { stack.slice().forEach(h => h.close()); }, top: () => stack[stack.length - 1] || null };

  // ---------------------------------------------------------------- undo bar
  let barEl = null, barTimer = null, countTimer = null;
  function barHost() { return document.getElementById('app-undo') || document.body; }
  function clearBar() {
    clearTimeout(barTimer); clearInterval(countTimer); barTimer = countTimer = null;
    if (barEl) { barEl.remove(); barEl = null; }
  }
  function makeBar(cls, html) {
    clearBar();
    barEl = document.createElement('div');
    barEl.className = 'undo ' + cls;
    barEl.setAttribute('role', 'status'); barEl.setAttribute('aria-live', 'polite');
    barEl.innerHTML = html;
    barHost().appendChild(barEl);
    return barEl;
  }
  const undoBar = {
    show(o) {
      const secs = o.seconds || 5;
      const el = makeBar('', `<span class="tick">✓</span><span class="tx">${o.html || esc(o.text)}${o.note ? ` · ${esc(o.note)}` : ''}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>` +
        (o.again ? `<button type="button" class="ub ghost" data-act="again">${esc(o.again.label)}</button>` : '') +
        (o.onUndo ? `<button type="button" class="ub" data-act="undo">Undo <span class="n">${secs}</span></button>` : '') +
        `<span class="bar"></span>`);
      const bar = el.querySelector('.bar');
      bar.style.transition = `transform ${secs}s linear`;
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; }));
      let left = secs;
      const n = el.querySelector('[data-act="undo"] .n');
      countTimer = setInterval(() => { left--; if (n) n.textContent = Math.max(0, left); }, 1000);
      barTimer = setTimeout(clearBar, secs * 1000);
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        if (b.dataset.act === 'undo') { clearBar(); undoBar.saving('Removing…'); o.onUndo(); }
        if (b.dataset.act === 'again') { clearBar(); o.again.run(); }
      });
      return el;
    },
    error(o) {
      const el = makeBar('err', `<span class="tick">!</span><span class="tx">${o.title ? `<b>${esc(o.title)}</b><small>${esc(o.text)}</small>` : esc(o.text)}</span>` +
        (o.onRetry ? `<button type="button" class="ub" data-act="retry">Retry</button>` : '') +
        `<button type="button" class="ub ghost icon" data-act="dismiss" aria-label="Dismiss">${icon('close')}</button>`);
      el.querySelector('[data-act="dismiss"] svg').style.cssText = 'width:18px;height:18px';
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        if (b.dataset.act === 'retry') o.onRetry();
        if (b.dataset.act === 'dismiss') { clearBar(); if (o.onDismiss) o.onDismiss(); }
      });
      return el;
    },
    saving(text) { return makeBar('saving', `<span class="tick"></span><span class="tx">${esc(text)}</span>`); },
    note(text, ms) { const el = makeBar('', `<span class="tick">✓</span><span class="tx">${esc(text)}</span>`); barTimer = setTimeout(clearBar, ms || 2000); return el; },
    hide: clearBar,
    get el() { return barEl; },
  };

  // ---------------------------------------------------------------- toast
  let toastEl = null, toastTimer = null;
  function toast(text, o) {
    o = o || {};
    if (toastEl) toastEl.remove();
    clearTimeout(toastTimer);
    toastEl = document.createElement('div');
    toastEl.className = 'toast' + (o.err ? ' err' : '');
    toastEl.setAttribute('role', 'status');
    toastEl.textContent = String(text).split('\n')[0];
    (document.getElementById('app-toast') || document.body).appendChild(toastEl);
    toastTimer = setTimeout(() => { if (toastEl) { toastEl.remove(); toastEl = null; } }, o.ms || 2400);
  }

  window.UI = {
    esc, fmt, icon, dataAttrs,
    teamMark, teamChip, resultMark, move, pos, pill, avatar, cardGlyph,
    row, rows, tile, tiles, chips, seg, teamSwitch, search, btn, hold, score, empty,
    scoreFor, scoreCentre, miniScore, liveDot, sum, podium, leaderRow, syncChip, nextGame,
    on, onSeg: onCustom('ui:seg'), onChip: onCustom('ui:chip'),
    onHold: (root, name, fn) => root.addEventListener('ui:hold', e => { if (e.detail && e.detail.name === name) fn(e.target); }),
    sheet, undoBar, toast,
  };
})();
