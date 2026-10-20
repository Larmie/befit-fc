/* ============================================================================
   BE Fit Club · js/screens/tables.js · TABLES, PODIUM, LEADERS, SHARE CARDS
                                                              OWNER: Round 5 · Tables builder
   ----------------------------------------------------------------------------
   Styles in css/tables.css, scoped under .scr-tables-* (sheets: .sh-tables-*).
   Contract: ...\scratchpad\build\R5-CONTRACT.md (screen ids, components, Teams API).
   Every number comes from Scoring; every team colour from Teams (t-<id>), so Blue / Gold just work.

   SCREENS
     'tables.teams'    tab tables   Teams · Players · Stats switch on top. One row per team washed in its colour,
                                    form (last 5, newest right) W/D/L in the team's own colour, league pts; then the
                                    full table inline (W · D · L · GD · Pts; laptop adds GF · GA). Sorted by league pts.
     'tables.players'  tab tables   position chips on one row, Season | Last game, team chips, movement,
                                    last-game and season player pts, the sticky "you" row. Tap a row → player.profile.
                                    (Keeps the round 4 hooks: table.pl-tbl, chips "tpos", seg "tview", cells
                                    rank · player · last/season · pts, tr.you, so the round 4 suites still read it.)
     'tables.stats'    tab tables   stepped podium for points (#1 is the screen's one hero), Top 10 ›;
                                    leader rows for goals · assists · saves with the runner-up ("Next: Harry 55 · Top 5 ›").
   ACTIONS
     'player.shareCard'  ({ pid, kind?: 'season'|'last'|'ft' })   the share sheet: Season · Last game · Full time,
                                    Dark | Light, Share (Web Share with the image) / Save image. Re-registered here
                                    (this file loads after player.js, so it wins).
     'share.fullTime'    ({ sid })   the Full-time card sheet for one match (offered after Publish).
                         ({ sid, canvas, theme? })  draws the card into your <canvas> and returns it, no sheet:
                                    the full-time check uses this for its scaled preview.
                         ({ sid, save: true, theme? })  downloads the PNG straight away (no sheet); returns a Promise.
   The share sheet's controls are all 48 px (it also opens from referee screens).
   SHARE CARDS: broadcast graphics, 1080 × 1350 (drawn at 300 × 375 × 3.6). Team light behind the big number,
   a fine diagonal texture, a team edge on top, big numerals in Geist 700 (never Mono). Position-aware last game:
   a defender's night shows blocks and clearances, a keeper's saves and conceded (never "0 goals · 0 assists").
   ========================================================================== */
(function () {
  'use strict';
  const esc = UI.esc, fmt = UI.fmt;
  const db = () => Store.state;
  const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
  const POS_WORD = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' };
  const LOADING = '<div class="skel" style="height:52px"></div><div class="skel mt-3" style="height:240px"></div>';
  const tcls = t => (window.Teams ? Teams.cls(t) : 't-' + String(t || '').replace(/[^A-Za-z0-9_-]/g, ''));
  const seasonLabel = () => (window.Teams ? Teams.club().seasonLabel : BF_CONFIG.seasonLabel);

  // ======================================================================== shared: the Teams · Players · Stats switch
  const TABS = [{ value: 'teams', label: 'Teams' }, { value: 'players', label: 'Players' }, { value: 'stats', label: 'Stats' }];
  const topSeg = cur => `<div class="tb-tabs">${UI.seg('tbtab', TABS, cur)}</div>`;
  function bindCommon(el) {
    UI.onSeg(el, 'tbtab', v => App.go('tables.' + v, {}, { replace: true }));
    UI.on(el, 'open', b => App.go('player.profile', { pid: b.dataset.pid }));
    // Enter / Space on table rows (they are role="button")
    el.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target.closest && e.target.closest('tr[data-tap]');
      if (t && el.contains(t)) { e.preventDefault(); t.click(); }
    });
  }
  const gamesPlayed = d => Scoring.completedSessions(d).filter(x => Scoring.result(x.sess).valid).length;

  // ======================================================================== tables.teams
  function teamsShown(T) {
    const ids = new Set((window.Teams ? Teams.list() : []).map(t => t.id));
    Object.keys(T).forEach(t => { if (T[t] && T[t].played) ids.add(t); });
    const blank = { w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, played: 0 };
    ids.forEach(t => { if (!T[t]) T[t] = Object.assign({}, blank); });
    // league order: points, then goal difference, then goals for; ties keep the Settings order (stable sort)
    return Scoring.orderTeams([...ids]).sort((a, b) => T[b].pts - T[a].pts || (T[b].gf - T[b].ga) - (T[a].gf - T[a].ga) || T[b].gf - T[a].gf);
  }

  function teamsHtml(ctx) {
    const d = db();
    const T = Scoring.teamStandings(d);
    const teams = teamsShown(T);
    const F = Scoring.teamForm(d);
    const games = gamesPlayed(d);
    const count = (teams.length > 2 ? `${teams.length} teams · ` : '') + fmt.plural(games, 'game');
    const head = `<div class="lbl tb-lbl">${esc(seasonLabel())}<b>${esc(count)}</b></div>`;
    if (!teams.length) return topSeg('teams') + head + UI.empty('No games yet', '');
    const rows = teams.map(t => {
      const form = (F[t] || []).slice(-5);
      return `<div class="tb-trow wash ${tcls(t)}"><i class="tb-bar" aria-hidden="true"></i><span class="tb-tn">${esc(fmt.team(t))}</span>` +
        `<span class="tb-form" aria-label="Form, newest last: ${esc(form.join(' ') || 'no games')}">${form.map(r => UI.resultMark(r, t)).join('')}</span>` +
        `<b class="hn tb-tp" aria-label="${T[t].pts} league points">${T[t].pts}</b></div>`;
    }).join('');
    const summary = `<div class="tb-tcard">${rows}</div><p class="tb-cap">Form: last 5, newest right · league pts (win 3, draw 1)</p>`;
    const wide = ctx.wide;
    const gd = x => fmt.signed(x.gf - x.ga);
    const table = `<div class="tb-box"><table class="tbl tb-ftbl"><thead><tr><th class="l">Team</th><th>W</th><th>D</th><th>L</th>` +
      (wide ? '<th>GF</th><th>GA</th>' : '') + `<th>GD</th><th title="League pts">Pts</th></tr></thead><tbody>` +
      teams.map(t => { const x = T[t]; return `<tr><td class="l">${UI.teamChip(t)}</td><td>${x.w}</td><td>${x.d}</td><td>${x.l}</td>` +
        (wide ? `<td>${x.gf}</td><td>${x.ga}</td>` : '') + `<td>${gd(x)}</td><td class="bk">${x.pts}</td></tr>`; }).join('') +
      `</tbody></table></div>`;
    const full = `<div class="lbl tb-lbl tb-gap">Full table<b>League pts</b></div>${table}`;
    return topSeg('teams') + `<div class="tb-2col"><div>${head}${summary}</div><div>${full}</div></div>`;
  }

  App.registerScreen('tables.teams', {
    tab: 'tables',
    mount(el) { bindCommon(el); },
    render(el, ctx) {
      if (!Store.hasData()) { el.innerHTML = LOADING; return; }
      el.innerHTML = teamsHtml(ctx);
    },
  });

  // ======================================================================== tables.players
  const TBL = { view: 'season', pos: 'all' };

  function playersHtml(ctx) {
    const rows = Scoring.seasonTable(db());
    const v = ctx.viewer;
    const lastDate = rows.lastGame ? fmt.short(rows.lastGame.date) : 'Last';
    const count = {}; rows.forEach(r => { count[r.pos] = (count[r.pos] || 0) + 1; });
    const chips = UI.chips('tpos', [{ value: 'all', label: `All ${rows.length}`, on: TBL.pos === 'all' }]
      .concat(POSITIONS.filter(p => count[p]).map(p => ({ value: p, label: p, on: TBL.pos === p }))));
    const last = TBL.view === 'last' && !!rows.lastGame;
    let list = TBL.pos === 'all' ? rows : rows.filter(r => r.pos === TBL.pos);
    if (last) list = list.filter(r => r.lastPts != null).sort((a, b) => b.lastPts - a.lastPts || b.pts - a.pts || a.name.localeCompare(b.name));
    const bar = `<div class="tb-pbar"><span class="lbl">Player pts</span>` +
      UI.seg('tview', [{ value: 'season', label: 'Season' }, { value: 'last', label: 'Last game' }], last ? 'last' : 'season') + '</div>';
    const wide = ctx.wide;
    let prev = null, prevRank = 0;
    const body = list.map((r, i) => {
      const you = r.pid === v;
      // last game view: equal points share a rank (1, 2, 2, 4)
      const rank = last ? (prev === r.lastPts ? prevRank : i + 1) : r.rank;
      prev = last ? r.lastPts : null; prevRank = rank;
      return `<tr class="${you ? 'you you-row ' + tcls(r.team) : ''}" data-tap="open" data-pid="${esc(r.pid)}" tabindex="0" role="button" aria-label="${esc(`${rank}. ${r.name}, ${last ? r.lastPts : r.pts} pts`)}">` +
        `<td class="l tb-rk"><span class="tb-rn${rank <= 3 ? ' top' : ''}">${rank}</span></td>` +
        `<td class="l"><div class="tb-nm">${esc(r.name)}${you ? ' <span class="tb-you">you</span>' : ''}</div>` +
        `<div class="tb-meta">${UI.pos(r.pos)}${UI.teamChip(r.team)}${last ? '' : UI.move(r.move)}</div></td>` +
        (wide ? `<td class="tb-w">${r.apps}</td><td class="tb-w">${r.g}</td><td class="tb-w">${r.a}</td>` : '') +
        `<td class="tb-c2">${last ? r.pts : (r.lastPts == null ? '–' : r.lastPts)}</td><td class="tb-pts">${last ? r.lastPts : r.pts}</td></tr>`;
    }).join('');
    const table = list.length
      ? `<div class="tb-box tb-pbox"><table class="tbl pl-tbl tb-ptbl"><thead><tr><th class="l tb-rk">#</th><th class="l">Player</th>` +
        (wide ? '<th class="tb-w">Apps</th><th class="tb-w">G</th><th class="tb-w">A</th>' : '') +
        `<th class="tb-c2">${last ? 'Season' : esc(lastDate)}</th><th class="tb-pts">${last ? esc(lastDate) : 'Pts'}</th></tr></thead><tbody>${body}</tbody></table></div>`
      : UI.empty(last ? 'No one in this position last game' : 'No one in this position', '');
    return topSeg('players') + chips + bar + table;
  }

  App.registerScreen('tables.players', {
    tab: 'tables',
    mount(el, ctx) {
      bindCommon(el);
      UI.onSeg(el, 'tview', val => { TBL.view = val; this.render(el, ctx); });
      UI.onChip(el, 'tpos', val => { TBL.pos = val; this.render(el, ctx); });
    },
    render(el, ctx) {
      if (!Store.hasData()) { el.innerHTML = LOADING; return; }
      const chips = el.querySelector('[data-chips="tpos"]');
      const sx = chips ? chips.scrollLeft : 0;
      el.innerHTML = playersHtml(ctx);
      const c2 = el.querySelector('[data-chips="tpos"]'); if (c2) c2.scrollLeft = sx;
    },
  });

  // ======================================================================== tables.stats
  const STAT = {
    pts: { key: 'pts', label: 'Points', n: 10 },
    g: { key: 'g', label: 'Goals', n: 5 },
    a: { key: 'a', label: 'Assists', n: 5 },
    sv: { key: 'sv', label: 'Saves', n: 5 },
  };
  function ranked(rows, key) {
    const list = rows.filter(r => r[key] > 0).sort((a, b) => b[key] - a[key] || b.pts - a.pts || a.name.localeCompare(b.name));
    let prev = null, rank = 0;
    list.forEach((r, i) => { if (r[key] !== prev) rank = i + 1; prev = r[key]; r._rank = rank; });
    return list;
  }
  const statLine = r => r.pos === 'GK' && r.sv ? `${fmt.plural(r.sv, 'save')} · ${fmt.plural(r.g, 'goal')}` : `${fmt.plural(r.g, 'goal')} · ${fmt.plural(r.a, 'assist')}`;

  function statsHtml(ctx) {
    const rows = Scoring.seasonTable(db());
    const last = rows.lastGame;
    const lastShort = last ? fmt.short(last.date) : '';
    const top = rows.filter(r => r.pts > 0 || r.apps > 0).slice(0, 3).map(r => ({
      pid: r.pid, name: r.name, team: r.team, value: r.pts, stat: statLine(r),
      note: !last ? '' : r.lastPts != null ? `${fmt.signed(r.lastPts)} on ${lastShort}` : `Didn't play ${lastShort}`,
    }));
    // the #1 podium card is this screen's one glowing hero
    const podium = top.length ? UI.podium(top, { tap: 'open' }).replace('pcol lit r1 first', 'pcol lit r1 first hero') : UI.empty('No games yet', '');
    const leader = s => {
      const list = ranked(rows.map(r => Object.assign({}, r)), STAT[s].key);
      if (!list.length) return '';
      const best = list[0][STAT[s].key];
      const first = list.filter(r => r[STAT[s].key] === best);
      const next = list.find(r => r[STAT[s].key] < best);
      return UI.leaderRow({ label: STAT[s].label, name: first.map(r => r.name).join(', '), team: first[0].team, value: best,
        next: (next ? `Next: ${next.name} ${next[STAT[s].key]} · ` : '') + 'Top 5 ›', tap: 'top', data: { k: s } });
    };
    const leaders = ['g', 'a', 'sv'].map(leader).filter(Boolean).join('');
    const pts = `<div class="lbl tb-lbl">Points${top.length ? '<button type="button" data-tap="top" data-k="pts">Top 10 ›</button>' : ''}</div><div class="tb-pod">${podium}</div>`;
    const lead = leaders ? `<div class="lbl tb-lbl tb-gap">Leaders</div><div class="tb-leaders">${leaders}</div>` : '';
    return topSeg('stats') + `<div class="tb-2col tb-2col-stats"><div>${pts}</div><div>${lead}</div></div>`;
  }

  function openTop(k) {
    const s = STAT[k] || STAT.pts;
    const list = ranked(Scoring.seasonTable(db()).map(r => Object.assign({}, r)), s.key).slice(0, s.n);
    const body = list.length ? UI.rows(list.map(r => UI.row({ tap: 'open', data: { pid: r.pid }, cls: 'tb-toprow',
      left: `<span class="tb-rn${r._rank <= 3 ? ' top' : ''}">${r._rank}</span>`,
      title: r.name, metaHtml: `${UI.pos(r.pos)}${UI.teamChip(r.team)}`, pts: r[s.key] }))) : UI.empty('Nobody yet', '');
    const h = UI.sheet.open({ title: `Top ${s.n} · ${s.label}`, titleEnd: esc(seasonLabel()), cls: 'sh-tables-top', cancel: 'Close', body });
    UI.on(h.el, 'open', b => { h.close(); App.go('player.profile', { pid: b.dataset.pid }); });
    return h;
  }

  App.registerScreen('tables.stats', {
    tab: 'tables',
    mount(el) {
      bindCommon(el);
      UI.on(el, 'top', b => openTop(b.dataset.k));
    },
    render(el, ctx) {
      if (!Store.hasData()) { el.innerHTML = LOADING; return; }
      el.innerHTML = statsHtml(ctx);
    },
  });

  // ======================================================================== share cards (canvas, 1080 × 1350)
  const CW = 300, CH = 375, SCALE = 3.6;
  const FONT = 'Geist, system-ui, -apple-system, "Segoe UI", sans-serif';
  const MONO = '"Geist Mono", ui-monospace, Menlo, monospace';

  function hexRgb(c) {
    c = String(c || '').trim();
    let m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) { let h = m[1]; if (h.length === 3) h = h.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
    m = c.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(/[ ,/]+/).slice(0, 3).map(Number);
    return [138, 146, 157];
  }
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  const darken = (rgb, k) => rgb.map(v => Math.round(v * k));

  // Colours straight from the tokens (and the team's --tc), for the chosen theme
  function palette(theme, teams) {
    const probe = document.createElement('div');
    probe.setAttribute('data-theme', theme); probe.style.display = 'none';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const v = n => cs.getPropertyValue(n).trim();
    const P = { theme, dark: theme !== 'light', bg: v('--bg'), s1: v('--s1'), line: v('--line'), ink: v('--ink'), ink2: v('--ink2'), ink3: v('--ink3'), team: {} };
    (teams || []).filter(Boolean).forEach(t => {
      const tp = document.createElement('div'); tp.className = tcls(t); probe.appendChild(tp);
      const raw = getComputedStyle(tp).getPropertyValue('--tc').trim();
      const rgb = hexRgb(raw);
      // light theme: team-coloured text is darkened 15% for contrast (as .tnum)
      P.team[t] = { rgb, hex: raw, text: P.dark ? rgba(rgb, 1) : rgba(darken(rgb, 0.85), 1) };
    });
    probe.remove();
    return P;
  }
  const teamOf = (P, t) => P.team[t] || { rgb: hexRgb(P.ink3), hex: P.ink3, text: P.ink3 };

  function spaced(ctx, text, x, y, spacing, align) {
    text = String(text);
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = spacing + 'px';
      const w = ctx.measureText(text).width - spacing;   // trailing space after the last letter
      ctx.textAlign = 'left';
      ctx.fillText(text, align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, y);
      ctx.letterSpacing = '0px';
      return w;
    }
    let w = 0; for (const ch of text) w += ctx.measureText(ch).width + spacing; w -= spacing;
    let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x; ctx.textAlign = 'left';
    for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
    return w;
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }

  // Name: shrink from `max` to 24 px to fit one line, else wrap (never cut)
  function nameLines(ctx, name, maxW, max) {
    for (let size = max; size >= 24; size -= 2) {
      ctx.font = `700 ${size}px ${FONT}`;
      if (ctx.measureText(name).width <= maxW) return { size, lines: [name] };
    }
    const size = 24; ctx.font = `700 ${size}px ${FONT}`;
    const lines = [''];
    name.split(/\s+/).forEach(w => {
      const t = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW || !lines[lines.length - 1]) lines[lines.length - 1] = t; else lines.push(w);
    });
    const out = [];
    lines.forEach(l => { let cur = ''; for (const ch of l) { if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch; } else cur += ch; } out.push(cur); });
    return { size, lines: out };
  }
  // Biggest font (≤ max) at which text fits maxW
  function fitSize(ctx, text, weight, family, max, min, maxW) {
    for (let s = max; s > min; s -= 2) { ctx.font = `${weight} ${s}px ${family}`; if (ctx.measureText(text).width <= maxW) return s; }
    ctx.font = `${weight} ${min}px ${family}`; return min;
  }

  // The broadcast frame: base, team light(s), fine diagonal texture, a team edge on top, hairline border
  function frame(ctx, P, lights, edge) {
    ctx.save(); rr(ctx, 0, 0, CW, CH, 14); ctx.clip();
    ctx.fillStyle = P.dark ? P.bg : P.s1; ctx.fillRect(0, 0, CW, CH);
    lights.forEach(L => {
      const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
      g.addColorStop(0, rgba(L.rgb, P.dark ? L.a : L.a * 0.5)); g.addColorStop(1, rgba(L.rgb, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
    });
    if (P.dark) {   // the footer sinks into shadow, like a broadcast lower third
      const g = ctx.createLinearGradient(0, CH * 0.55, 0, CH);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.42)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
    }
    ctx.strokeStyle = P.dark ? 'rgba(255,255,255,.045)' : 'rgba(11,13,16,.045)'; ctx.lineWidth = 1;
    for (let x = -CH * 0.4; x < CW + 20; x += 9) { ctx.beginPath(); ctx.moveTo(x, CH); ctx.lineTo(x + CH * 0.4, 0); ctx.stroke(); }
    // team edge on top (one colour, or split between the teams on a full-time card)
    const w = CW / edge.length;
    edge.forEach((rgb, i) => { ctx.fillStyle = rgba(rgb, 1); ctx.fillRect(i * w, 0, w + (i < edge.length - 1 ? 0.5 : 0), 3); });
    ctx.restore();
    ctx.strokeStyle = P.dark ? 'rgba(255,255,255,.08)' : P.line; ctx.lineWidth = 1; rr(ctx, 0.5, 0.5, CW - 1, CH - 1, 14); ctx.stroke();
  }
  function header(ctx, P, right) {
    ctx.fillStyle = P.ink3; ctx.font = `700 12px ${FONT}`; ctx.textBaseline = 'alphabetic';
    spaced(ctx, 'BE FIT CLUB', 20, 32, 2.4, 'left');
    spaced(ctx, String(right).toUpperCase(), CW - 20, 32, 2.4, 'right');
  }
  // the footer stat bar: a hairline, then up to 3 columns of value + caps label.
  // Columns start on thirds; a long label (CLEARANCES) pushes the next column right, never into it.
  function statBar(ctx, P, stats) {
    ctx.fillStyle = P.dark ? 'rgba(255,255,255,.14)' : P.line; ctx.fillRect(20, 306, CW - 40, 1);
    const colW = (CW - 40) / 3;
    const items = stats.map(([label, val]) => ({ lab: String(label).toUpperCase(), val: String(val) }));
    let sp = 1.2, xs = [];
    const widths = () => items.map(it => {
      ctx.font = `700 24px ${FONT}`; const vw = ctx.measureText(it.val).width;
      ctx.font = `500 12px ${FONT}`; return Math.max(vw, ctx.measureText(it.lab).width + sp * (it.lab.length - 1));
    });
    for (;;) {
      const w = widths(); xs = [];
      w.forEach((wi, i) => { xs.push(i ? Math.max(20 + i * colW, xs[i - 1] + w[i - 1] + 14) : 20); });
      if (xs[xs.length - 1] + w[w.length - 1] <= CW - 20 || sp <= 0) break;
      sp = Math.max(0, sp - 0.4);
    }
    items.forEach((it, i) => {
      const room = (i < items.length - 1 ? xs[i + 1] - 10 : CW - 20) - xs[i];
      ctx.fillStyle = P.ink; ctx.textAlign = 'left';
      fitSize(ctx, it.val, 700, FONT, 24, 16, room);
      ctx.fillText(it.val, xs[i], 333);
      ctx.fillStyle = P.ink3; ctx.font = `500 12px ${FONT}`;
      spaced(ctx, it.lab, xs[i], 352, sp, 'left');
    });
  }
  function bigNumber(ctx, P, text, y, maxW) {
    const s = fitSize(ctx, text, 700, FONT, 132, 64, maxW);
    ctx.font = `700 ${s}px ${FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = (-0.04 * s) + 'px';
    ctx.fillStyle = P.ink; ctx.textAlign = 'left'; ctx.fillText(text, 16, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  // ---------------------------------------------------------------- card data (all from Scoring)
  function seasonData(pid) {
    const p = Store.player(pid); if (!p) return null;
    const rows = Scoring.seasonTable(db());
    const r = rows.find(x => x.pid === pid);
    const st = Scoring.seasonStats(pid, db());
    const stats = p.defaultPosition === 'GK' ? [['Apps', st.apps], ['Saves', st.sv], ['Goals', st.g]] : [['Apps', st.apps], ['Goals', st.g], ['Assists', st.a]];
    return { kind: 'season', pid, name: p.name, pos: p.defaultPosition, team: p.defaultTeam, corner: seasonLabel(), big: st.pts,
      label: 'Season points', rank: r && st.apps ? { n: fmt.ordinal(r.rank), of: rows.length } : null, stats };
  }
  // Position-aware: show what this player actually did, by position first, never two zeros when something else happened
  function lastStats(h) {
    const t = h.tally;
    const C = { goals: ['Goals', t.goals], assists: ['Assists', t.assists], blocks: ['Blocks', t.blocks], clearances: ['Clearances', t.clearances],
      saves: ['Saves', t.saves], conceded: ['Conceded', t.conceded], yellow: ['Yellow', t.yellow], red: ['Red card', t.red] };
    const order = h.pos === 'GK' ? ['saves', 'conceded', 'goals', 'assists']
      : h.pos === 'DEF' ? ['blocks', 'clearances', 'goals', 'assists']
      : ['goals', 'assists', 'blocks', 'clearances'];
    const nonzero = order.filter(k => C[k][1] > 0);
    const pick = nonzero.slice(0, 2);
    order.forEach(k => { if (pick.length < 2 && !pick.includes(k)) pick.push(k); });
    return pick.map(k => C[k]);
  }
  function lastData(pid) {
    const p = Store.player(pid); if (!p) return null;
    const h = Scoring.playerHistory(pid, db(), 1)[0];
    if (!h) return null;
    const team = fmt.team(h.team);
    const res = h.result === 'W' ? 'won' : h.result === 'L' ? 'lost' : 'drew';
    const score = h.against == null ? String(h.for) : `${h.for}–${h.against}`;
    return { kind: 'last', pid, sid: h.sid, name: p.name, pos: h.pos, team: h.team, corner: fmt.date(h.date),
      sub: `${POS_WORD[h.pos] || h.pos} · ${team}`, big: fmt.signed(h.pts).replace('+', ''), label: 'Points last game',
      stats: lastStats(h).concat([[`${team} ${res}`, score]]) };
  }
  function ftData(sid) {
    const sess = Store.session(sid); if (!sess) return null;
    const teams = Scoring.orderTeams(Scoring.teamsOf(sess));
    if (!teams.length) return null;
    const sc = Scoring.scorers(sess, db());
    const mb = Scoring.matchBreakdown(sess, db());
    return { kind: 'ft', sid, date: sess.date, corner: fmt.date(sess.date),
      teams: teams.map(t => ({ team: t, goals: Scoring.teamGoals(sess, t), scorers: (sc[t] || []).map(r => ({
        name: r.name + (r.og ? ' (og)' : ''), mins: r.mins.map(e => fmt.minute(e)).filter(Boolean).join(' '), n: r.mins.length })) })),
      top: mb.top && mb.top.players.length ? { names: mb.top.players.map(x => x.name), pts: mb.top.pts } : null };
  }

  // ---------------------------------------------------------------- drawing
  function setup(canvas) {
    canvas.width = CW * SCALE; canvas.height = CH * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.clearRect(0, 0, CW, CH);
    ctx.textBaseline = 'alphabetic';
    return ctx;
  }

  function drawPlayer(canvas, D, theme) {
    const ctx = setup(canvas);
    const P = palette(theme, [D.team]);
    const T = teamOf(P, D.team);
    frame(ctx, P, [{ x: 205, y: 165, r: 230, rgb: T.rgb, a: 0.34 }], [T.rgb]);
    header(ctx, P, D.corner);
    const badgeW = D.rank ? 70 : 0;
    const nm = nameLines(ctx, D.name, CW - 40 - (badgeW ? badgeW + 10 : 0), 36);
    ctx.fillStyle = P.ink; ctx.textAlign = 'left'; ctx.font = `700 ${nm.size}px ${FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = (-0.02 * nm.size) + 'px';
    let y = 52 + nm.size * 0.86;
    nm.lines.forEach((l, i) => { if (i) y += nm.size * 1.02; ctx.fillText(l, 20, y); });
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (D.kind === 'season') {
      // chip: ■ DEF · RED
      const txt = `${D.pos || ''}${D.pos ? ' · ' : ''}${fmt.team(D.team)}`.toUpperCase();
      ctx.font = `700 12px ${FONT}`;
      const tw = ('letterSpacing' in ctx ? (ctx.letterSpacing = '0.6px', ctx.measureText(txt).width) : ctx.measureText(txt).width + txt.length * 0.6);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      const cy = y + 12, cw = tw + 34;
      rr(ctx, 20, cy, cw, 24, 12); ctx.fillStyle = rgba(T.rgb, P.dark ? 0.16 : 0.1); ctx.fill();
      ctx.strokeStyle = rgba(T.rgb, P.dark ? 0.5 : 0.45); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = rgba(T.rgb, 1); rr(ctx, 31, cy + 8.5, 7, 7, 2); ctx.fill();
      ctx.fillStyle = P.ink; spaced(ctx, txt, 45, cy + 16.5, 0.6, 'left');
      if (D.rank) {
        const bx = CW - 20 - badgeW, by = 50;
        rr(ctx, bx, by, badgeW, 54, 11);
        ctx.fillStyle = P.dark ? 'rgba(255,255,255,.06)' : 'rgba(11,13,16,.04)'; ctx.fill();
        ctx.strokeStyle = P.dark ? 'rgba(255,255,255,.16)' : 'rgba(11,13,16,.14)'; ctx.stroke();
        ctx.fillStyle = P.ink; fitSize(ctx, D.rank.n, 700, FONT, 23, 14, badgeW - 10);
        ctx.textAlign = 'center'; ctx.fillText(D.rank.n, bx + badgeW / 2, by + 28); ctx.textAlign = 'left';
        ctx.fillStyle = P.ink3; ctx.font = `500 12px ${FONT}`; spaced(ctx, `OF ${D.rank.of}`, bx + badgeW / 2, by + 45, 0.8, 'center');
      }
    } else {
      ctx.fillStyle = P.ink2; ctx.font = `400 14px ${FONT}`; ctx.fillText(D.sub, 20, y + 22);
    }
    bigNumber(ctx, P, String(D.big), 258, CW - 40);
    teamLabel(ctx, P, T, D.label.toUpperCase(), 20, 284, 3, 'left', 13);
    statBar(ctx, P, D.stats);
  }
  // A small caps label in the team's colour (dark). Light theme never sets small text in team colour:
  // ink text with an 8 px team square in front, like the score block's names row.
  function teamLabel(ctx, P, T, text, x, y, spacing, align, size) {
    ctx.font = `800 ${size}px ${FONT}`;
    if (P.dark) { ctx.fillStyle = T.text; spaced(ctx, text, x, y, spacing, align); return; }
    const w = ('letterSpacing' in ctx ? (ctx.letterSpacing = spacing + 'px', ctx.measureText(text).width - spacing) : ctx.measureText(text).width + spacing * (text.length - 1));
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const total = w + 14, sx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    ctx.fillStyle = rgba(T.rgb, 1); rr(ctx, sx, y - size * 0.72, 8, 8, 2); ctx.fill();
    ctx.fillStyle = P.ink; spaced(ctx, text, sx + 14, y, spacing, 'left');
  }

  function drawFullTime(canvas, D, theme) {
    const ctx = setup(canvas);
    const P = palette(theme, D.teams.map(t => t.team));
    const n = D.teams.length;
    const cx = i => CW * (i + 0.5) / n;
    frame(ctx, P, D.teams.map((t, i) => ({ x: cx(i), y: 128, r: 150, rgb: teamOf(P, t.team).rgb, a: 0.34 })), D.teams.map(t => teamOf(P, t.team).rgb));
    header(ctx, P, D.corner);
    ctx.fillStyle = P.ink2; ctx.font = `800 14px ${FONT}`; spaced(ctx, 'FULL TIME', CW / 2, 64, 4, 'center');
    // the score: big team-coloured numerals, a dash between two teams
    const colW = (CW - 40) / n;
    const numSize = Math.min(n === 2 ? 104 : 76, ...D.teams.map(t => fitSize(ctx, String(t.goals), 700, FONT, n === 2 ? 104 : 76, 40, colW - 16)));
    D.teams.forEach((t, i) => {
      const T = teamOf(P, t.team);
      ctx.font = `700 ${numSize}px ${FONT}`; ctx.fillStyle = T.text; ctx.textAlign = 'center';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.fillText(String(t.goals), cx(i), 156);
      teamLabel(ctx, P, T, fmt.team(t.team).toUpperCase(), cx(i), 186, 3.5, 'center', 14);
    });
    if (n === 2) { ctx.fillStyle = P.ink3; ctx.fillRect(CW / 2 - 8, 117, 16, 3); }
    // scorers under their own team: name in ink, minutes in Mono ink3; wraps, never cuts
    const top = 212, bottom = 318, avail = bottom - top;
    let size = 13, lh = 16.5, layout = null;
    // nowrap: each scorer on one line, allowed past the middle when the line opposite is short (two teams only)
    const build = (fs, withMins, nowrap) => D.teams.map((t, i) => {
      const lines = [];
      ctx.font = `500 ${fs}px ${FONT}`;
      t.scorers.forEach(s => {
        const nmW = ctx.measureText(s.name).width;
        ctx.font = `500 ${fs - 1}px ${MONO}`;
        const mins = withMins ? s.mins : (s.n > 1 ? '×' + s.n : '');
        const mW = mins ? ctx.measureText(mins).width + 5 : 0;
        ctx.font = `500 ${fs}px ${FONT}`;
        if (nowrap || nmW + mW <= colW - 6) lines.push({ name: s.name, mins, w: nmW + mW });
        else { lines.push({ name: s.name, mins: '', w: nmW }); if (mins) lines.push({ name: '', mins, w: mW }); }
      });
      return { i, lines };
    });
    const pairsFit = L => n === 2 && [0, 1].every(a => L[a].lines.every((x, k) => x.w + ((L[1 - a].lines[k] || {}).w || 0) + 16 <= CW - 40));
    for (const [fs, l, mins, nowrap] of [[13, 16.5, true, true], [13, 16.5, true, false], [12, 15, true, true], [12, 15, true, false], [12, 13.5, true, false], [12, 14, false, false]]) {
      layout = build(fs, mins, nowrap); size = fs; lh = l;
      if ((!nowrap || pairsFit(layout)) && Math.max(...layout.map(c => c.lines.length)) * lh <= avail) break;
    }
    layout.forEach(({ i, lines }) => {
      const align = n === 1 ? 'center' : i === 0 ? 'left' : i === n - 1 ? 'right' : 'center';
      const x = align === 'left' ? 20 + i * colW : align === 'right' ? 20 + (i + 1) * colW : 20 + (i + 0.5) * colW;
      lines.forEach((ln, k) => {
        const y = top + k * lh + size;
        if (y > bottom + 2) return;
        ctx.font = `500 ${size}px ${FONT}`; const nw = ln.name ? ctx.measureText(ln.name).width : 0;
        ctx.font = `500 ${size - 1}px ${MONO}`; const mw = ln.mins ? ctx.measureText(ln.mins).width : 0;
        const gap = ln.name && ln.mins ? 5 : 0, w = nw + gap + mw;
        let sx = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
        ctx.textAlign = 'left';
        if (ln.name) { ctx.font = `500 ${size}px ${FONT}`; ctx.fillStyle = P.ink; ctx.fillText(ln.name, sx, y); sx += nw + gap; }
        if (ln.mins) { ctx.font = `500 ${size - 1}px ${MONO}`; ctx.fillStyle = P.ink3; ctx.fillText(ln.mins, sx, y); }
      });
    });
    // footer: top points
    ctx.fillStyle = P.dark ? 'rgba(255,255,255,.14)' : P.line; ctx.fillRect(20, 330, CW - 40, 1);
    ctx.fillStyle = P.ink3; ctx.font = `500 12px ${FONT}`; const lw = spaced(ctx, 'TOP POINTS', 20, 356, 1.6, 'left');
    if (D.top) {
      let txt = `${D.top.names.join(', ')} · ${D.top.pts} pts`;
      const maxW = CW - 40 - lw - 14;
      let s = fitSize(ctx, txt, 700, FONT, 15, 12, maxW);
      if (ctx.measureText(txt).width > maxW && D.top.names.length > 1) { txt = `${D.top.names[0]} +${D.top.names.length - 1} · ${D.top.pts} pts`; s = fitSize(ctx, txt, 700, FONT, 15, 12, maxW); }
      ctx.font = `700 ${s}px ${FONT}`; ctx.fillStyle = P.ink; ctx.textAlign = 'right'; ctx.fillText(txt, CW - 20, 357); ctx.textAlign = 'left';
    }
  }

  function drawCard(canvas, D, theme) { if (D.kind === 'ft') drawFullTime(canvas, D, theme); else drawPlayer(canvas, D, theme); }
  const fontsReady = () => (document.fonts && document.fonts.load
    ? Promise.all([`700 132px Geist`, `800 14px Geist`, `500 13px Geist`, `400 14px Geist`, `500 12px "Geist Mono"`].map(f => document.fonts.load(f).catch(() => null)))
    : Promise.resolve());

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // ---------------------------------------------------------------- the share sheet
  // o = { pid?, sid?, kind: 'season'|'last'|'ft' }. With a pid: Season · Last game · Full time (his last game).
  // Without a pid (share.fullTime): the full-time card only.
  function openSheet(o) {
    const pid = o.pid && Store.player(o.pid) ? o.pid : null;
    const lastH = pid ? Scoring.playerHistory(pid, db(), 1)[0] : null;
    const lg = Scoring.lastGame(db());
    const ftSid = o.sid || (lastH && lastH.sid) || (lg && lg.sid) || null;
    const can = { season: !!pid, last: !!lastH, ft: !!(ftSid && Store.session(ftSid)) };
    let kind = can[o.kind] ? o.kind : (pid ? 'season' : 'ft');
    if (!can[kind]) { UI.toast(pid ? 'No card yet' : 'Match not found'); return null; }
    const st = { kind, theme: App.theme.effective(), blob: null };
    const data = () => kind === 'season' ? seasonData(pid) : kind === 'last' ? lastData(pid) : ftData(ftSid);
    const fileName = () => {
      const D = data();
      return D.kind === 'ft' ? `befit-full-time-${D.date || 'match'}.png` : `befit-${slug(D.name) || 'player'}-${D.kind === 'last' ? 'last-game' : 'season'}.png`;
    };
    const views = pid ? UI.seg('cview', [{ value: 'season', label: 'Season' }, { value: 'last', label: 'Last game' }, { value: 'ft', label: 'Full time' }], kind) : '';
    const name = pid ? Store.player(pid).name : 'the match';
    const h = UI.sheet.open({
      title: pid ? 'Share card' : 'Full-time card', cls: 'sh-tables-share sh-player-share',
      titleEnd: '<button type="button" class="tb-close" data-tap="sheet-cancel">Close</button>',
      body: views + `<div class="tb-cardwrap pl-cardwrap"><canvas class="tb-card" width="${CW * SCALE}" height="${CH * SCALE}" role="img" aria-label="Share card for ${esc(name)}"></canvas></div>` +
        `<div class="tb-cardctl">${UI.seg('ctheme', [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }], st.theme)}</div>`,
      footer: `<div class="grid2">${UI.btn('Share', { kind: 'w', tap: 'share-img' })}${UI.btn('Save image', { kind: 'g', tap: 'save-img' })}</div>`,
    });
    const canvas = h.el.querySelector('canvas');
    ['season', 'last', 'ft'].forEach(k => { if (!can[k]) { const b = h.el.querySelector(`[data-seg="cview"] [data-value="${k}"]`); if (b) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); } } });
    const draw = () => {
      const D = data();
      if (!D) return;
      drawCard(canvas, D, st.theme);
      canvas.setAttribute('aria-label', D.kind === 'ft'
        ? `Full-time card: ${D.teams.map(t => fmt.team(t.team) + ' ' + t.goals).join(', ')}`
        : `${D.kind === 'last' ? 'Last game' : 'Season'} card for ${D.name}: ${D.big} points`);
      st.blob = null;
      canvas.toBlob(b => { st.blob = b; }, 'image/png');
    };
    draw();
    fontsReady().then(() => { if (!h.closed) draw(); });
    UI.onSeg(h.el, 'cview', v => { kind = v; draw(); });
    UI.onSeg(h.el, 'ctheme', v => { st.theme = v; draw(); });
    const withBlob = fn => { if (st.blob) fn(st.blob); else canvas.toBlob(b => b && fn(b), 'image/png'); };
    UI.on(h.el, 'save-img', () => withBlob(b => { download(b, fileName()); UI.toast('Image saved'); }));
    UI.on(h.el, 'share-img', () => withBlob(b => {
      let file = null;
      try { file = new File([b], fileName(), { type: 'image/png' }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        // a cancelled share is fine; any other failure falls back to saving the image
        navigator.share({ files: [file], title: 'BE Fit Club' }).catch(e => { if (!e || e.name !== 'AbortError') { download(b, fileName()); UI.toast('Image saved'); } });
      } else { download(b, fileName()); UI.toast('Image saved'); }
    }));
    return h;
  }

  App.registerAction('player.shareCard', args => {
    const pid = (args && args.pid) || App.viewer();
    if (!pid || !Store.player(pid)) { UI.toast('Pick your name first'); return null; }
    return openSheet({ pid, kind: (args && args.kind) || 'season' });
  });
  App.registerAction('share.fullTime', args => {
    const sid = args && args.sid;
    if (args && args.canvas) {   // preview: draw into the caller's canvas, no sheet
      const D = sid && ftData(sid);
      if (!D) return null;
      const theme = args.theme || App.theme.effective();
      drawFullTime(args.canvas, D, theme);
      fontsReady().then(() => { if (args.canvas.isConnected) drawFullTime(args.canvas, ftData(sid) || D, theme); });
      return args.canvas;
    }
    if (args && args.save) {     // "Save image" elsewhere: draw off-screen and download, no sheet
      const D = sid && ftData(sid);
      if (!D) { UI.toast('Match not found'); return null; }
      const theme = args.theme || App.theme.effective();
      const c = document.createElement('canvas');
      return fontsReady().then(() => new Promise(resolve => {
        drawFullTime(c, ftData(sid) || D, theme);
        c.toBlob(b => {
          if (b) { download(b, `befit-full-time-${D.date || 'match'}.png`); UI.toast('Image saved'); }
          resolve(!!b);
        }, 'image/png');
      }));
    }
    return openSheet({ sid, kind: 'ft' });
  });
})();
