/* ============================================================================
   BE Fit Club · js/screens/setup.js · NIGHT SETUP             OWNER: Phase 2 · Setup builder
   ----------------------------------------------------------------------------
   How the referee gets the night going and copes with people arriving all match.
   Styles in css/setup.css, scoped under .scr-ref-setup and .sh-setup (sheets).

   SCREENS
     'ref.setup'          tab match · layout phone · console   THE LINEUP PICKER (round 6) before kick-off: one 56 px tab
                          per team ("4 of 10"), that team's usual squad (usually here first: last 8 matches), tap to tick;
                          "+ From Red" (other teams' usual squads) · "+ New person" (duplicate check) · search; the team
                          sheet card once both sides have players; poles + keepers; "Kick off · n players". Round 4 text:
                          Green · n | Red · n switch, search ("Add a name": existing names first, then
                          "Someone new"), "Usually here" chips (recent players first), the side's rows,
                          Small poles | Big poles (+ one keeper per side when big), "Kick off · n players"
                          → creates the session like classic (status 'active', mode 'live', teams) plus
                          format:{start, keepers?} and a running timer, then opens 'ref.console'.
                          The list being built is kept on the phone (localStorage) until kick-off.
   ACTIONS (others call these with App.action(name, args))
     'setup.newPerson'    ({ name?, team?, teams?, sid?, position?, onDone(pid, team)? })
                          "Add someone": existing names first (duplicate check as you type, case-insensitive,
                          "contains"; same-name entries grouped: "3 entries with this name"), else name only +
                          one tap on "+ Green" / "+ Red". New players: defaultPosition 'MID' (or `position`),
                          defaultTeam = side, needsDetails:true, createdBy, createdAt.
                          With onDone: picking an existing name calls onDone(pid) (no write); a new name is
                          written, then onDone(pid, team). Without onDone, inside a match (sid, or the active
                          session) the person is also put on that side tonight, in the same write.
     'setup.addArrival'   ({ sid })   "Who's arrived?": usually-here rows not on yet + search; one tap on a side
                          adds them at once (Save.run: Saving… → Undo 5 s), the sheet stays open for the next.
     'setup.teamsTonight' ({ sid })   one team per tab, full-width rows, a quiet "→ Red" per row, "Moved 27'" tag.
     'setup.bigPoles'     ({ sid })   one keeper per side (known keepers on that side first, then "Other ›" = tonight's
                          players on that side; "+ Someone not here yet") → format.switchedAt (first big-poles minute),
                          format.keepers = { team: pid }, those players' position 'GK'. Score untouched.
   RULES KEPT HERE (one place)
     · Up to 9 outfield + 1 keeper per side: the 10th outfield add or move needs a second tap (toast says so).
     · A keeper slot exists only on big poles. Someone whose usual position is GK joins as MID on small poles,
       or when his side already has a keeper; on big poles he fills an empty keeper slot.
     · Every write goes through Save.run (lock → Saving… → Undo 5 s → or Not saved + Retry); undo writes back
       exactly what was there before (one atomic multi-path write each way).
   DATA WRITTEN (all additive; classic still reads every session)
     sessions/{sid} = { date, status:'active', mode:'live', teams:{team:{players:{pid:{position}}}},
                        format:{ start:'small'|'big', keepers?:{team:pid} }, timer: Clock.kickOff(now) }
     sessions/{sid}/teams/{team}/players/{pid} = { position, arrived?:{at:min}, moved?:{from, at:min} }
     sessions/{sid}/format/switchedAt = min · format/keepers/{team} = pid
     players/{pid} = { name, defaultPosition, defaultTeam, needsDetails:true, createdBy, createdAt }
   Design: section 03 flows 1, 2, 3 and "New game and team picking". Checklist items 5–8.
   ========================================================================== */
(function () {
  'use strict';
  const esc = UI.esc, fmt = UI.fmt, T = UI.fmt.team;
  const tcls = t => (window.Teams ? Teams.cls(t) : 't-' + String(t || '').replace(/[^A-Za-z0-9_-]/g, ''));
  // who can play tonight: Settings › Teams (active, by order); falls back to Green, Red
  const clubTeams = () => (window.Teams ? Teams.ids() : ['green', 'red']);
  const CFG = window.BF_CONFIG;
  const MAX_OUT = CFG.maxOutfield || 9;
  const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
  const DRAFT_KEY = 'befit_setup_draft';       // the "Who's here?" list being built (this phone only)
  const KICK_OFF_STARTS_CLOCK = true;          // "Kick off · n players" also starts the match clock

  // ======================================================================== people
  const norm = s => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();
  const cleanName = s => { const t = String(s || '').trim().replace(/\s+/g, ' '); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; };
  const nameOf = pid => (Store.player(pid) || {}).name || '?';
  const defPos = pid => { const p = (Store.player(pid) || {}).defaultPosition; return POSITIONS.includes(p) ? p : 'MID'; };
  function appsOf(pid) { try { return (Scoring.seasonStats(pid) || {}).apps || 0; } catch (e) { return 0; } }
  const plural = (n, w) => fmt.plural(n, w);

  // Recent players first: weighted appearances over the last 8 matches (newest counts most).
  let recCache = { v: -1, map: {} };
  function recency() {
    if (recCache.v === Store.version) return recCache.map;
    const map = {};
    Scoring.completedSessions().filter(x => (x.sess.mode || 'live') !== 'history').slice(0, 8).forEach(({ sess }, i) => {
      Scoring.sessPlayers(sess).forEach(p => {
        const r = map[p.pid] || (map[p.pid] = { n: 0, w: 0, last: sess.date || '' });
        r.n++; r.w += 8 - i;
      });
    });
    recCache = { v: Store.version, map };
    return map;
  }
  function usual(exclude, limit) {
    const rec = recency();
    return Object.keys(rec).filter(pid => Store.player(pid) && !exclude(pid))
      .sort((a, b) => rec[b].w - rec[a].w || String(rec[b].last).localeCompare(String(rec[a].last)) || nameOf(a).localeCompare(nameOf(b)))
      .slice(0, limit || 30);
  }
  function lastPlayed(pid) { const r = recency()[pid]; return r ? r.last : ''; }

  // Duplicate check: case-insensitive "contains" (both ways), same names grouped together.
  function search(q, limit) {
    const nq = norm(q);
    if (!nq) return [];
    const groups = new Map();
    for (const [pid, p] of Object.entries(Store.players())) {
      if (!p || !p.name) continue;
      const nn = norm(p.name);
      if (!(nn.includes(nq) || (nn.length >= 3 && nq.includes(nn)))) continue;
      if (!groups.has(nn)) groups.set(nn, []);
      groups.get(nn).push(pid);
    }
    const rank = nn => nn === nq ? 0 : nn.startsWith(nq) ? 1 : (' ' + nn).includes(' ' + nq) ? 2 : nn.includes(nq) ? 3 : 4;
    return Array.from(groups.entries()).map(([nn, pids]) => {
      pids.sort((a, b) => appsOf(b) - appsOf(a) || String(lastPlayed(b)).localeCompare(String(lastPlayed(a))) || a.localeCompare(b));
      return { nn, pids, pid: pids[0], r: rank(nn), apps: Math.max(...pids.map(appsOf)) };
    }).sort((a, b) => a.r - b.r || b.apps - a.apps || a.nn.localeCompare(b.nn)).slice(0, limit || 8);
  }

  // ======================================================================== teams in a match
  // Teams of a night: what the session has, topped up to two from Settings › Teams order (never hard-coded).
  function nightTeams(keys) {
    const list = Array.from(new Set((keys || []).filter(Boolean)));
    for (const t of clubTeams()) { if (list.length >= 2) break; if (!list.includes(t)) list.push(t); }
    return Scoring.orderTeams(list);
  }
  const matchTeams = sess => nightTeams(Object.keys((sess && sess.teams) || {}));
  function rosterOf(sess) {                               // pid → { team, entry }
    const out = {};
    for (const [team, td] of Object.entries((sess && sess.teams) || {})) {
      for (const [pid, e] of Object.entries((td && td.players) || {})) out[pid] = { team, entry: e || {} };
    }
    return out;
  }
  function counts(list) {                                 // list of positions → { out, gk, all }
    const gk = list.filter(p => p === 'GK').length;
    return { gk, out: list.length - gk, all: list.length };
  }
  const sideCounts = (roster, team) => counts(Object.values(roster).filter(r => r.team === team).map(r => r.entry.position));
  const keeperOn = (roster, team) => Object.keys(roster).find(pid => roster[pid].team === team && roster[pid].entry.position === 'GK') || null;

  // The minute stamped on anything done right now (same as Clock.stamp); null before kick-off.
  function nowMinute(sess) { return Clock.status(sess) === 'idle' ? null : Clock.minute(sess); }
  // First big-poles minute: while paused (half time at 45:00) play resumes in the next minute (46').
  function switchMinute(sess) {
    const st = Clock.status(sess);
    if (st === 'idle') return null;
    if (st === 'paused') return Math.floor((Clock.elapsedMs(sess) || 0) / 60000) + 1;
    return Clock.minute(sess);
  }
  // Where someone joining a match plays (see RULES in the header).
  function joinPos(sess, pid, team, roster, wanted) {
    const pos = POSITIONS.includes(wanted) ? wanted : defPos(pid);
    if (pos !== 'GK') return pos;
    return Scoring.formatOf(sess).everBig && !keeperOn(roster, team) ? 'GK' : 'MID';
  }

  // 9 outfield per side: the 10th needs a second tap within 4 s.
  let armed = null;
  function okToAdd(team, outfield, isKeeper, key) {
    if (isKeeper || outfield < MAX_OUT) return true;
    const t = Date.now();
    if (armed && armed.key === key && t < armed.until) { armed = null; return true; }
    armed = { key, until: t + 4000 };
    UI.toast(`${T(team)} has ${outfield} outfield · tap again to add`);
    return false;
  }

  // ======================================================================== writes
  // One atomic write; Undo writes back exactly what was there (same paths, old values).
  function saveUpdates(updates, o) {
    const reverse = {};
    Object.keys(updates).forEach(p => { const v = Store.get(p); reverse[p] = v === undefined ? null : JSON.parse(JSON.stringify(v)); });
    return Save.run(Object.assign({}, o, { write: () => Store.multi(updates), undo: () => Store.multi(reverse) }));
  }
  const tp = (sid, team, pid) => `sessions/${sid}/teams/${team}/players/${pid}`;

  function addToMatch(sid, pid, team, o) {
    o = o || {};
    const sess = Store.session(sid);
    if (!sess) { UI.toast('No game on', { err: true }); return null; }
    const roster = rosterOf(sess);
    if (roster[pid]) { UI.toast(`${nameOf(pid)} is on ${T(roster[pid].team)}`); return null; }
    const pos = joinPos(sess, pid, team, roster, o.position);
    if (!okToAdd(team, sideCounts(roster, team).out, pos === 'GK', 'add' + pid + team)) return null;
    const min = nowMinute(sess);
    const entry = { position: pos };
    if (min != null) entry.arrived = { at: min };
    const updates = { [tp(sid, team, pid)]: entry };
    if (pos === 'GK' && !Scoring.formatOf(sess).legacy) updates[`sessions/${sid}/format/keepers/${team}`] = pid;
    return saveUpdates(updates, {
      label: `${nameOf(pid)} · ${T(team)}${min != null ? ` · ${min}'` : ''}`,
      button: o.button, group: o.group, onSaved: o.onSaved,
    });
  }

  // Name only (+ tonight's side). With a sid, also on that side tonight, in the same write.
  function createPerson(rawName, team, o) {
    o = o || {};
    const name = cleanName(rawName);
    if (!name) { UI.toast('Type a name first'); return null; }
    const pid = Store.newKey();
    const person = { name, defaultPosition: POSITIONS.includes(o.position) ? o.position : 'MID', defaultTeam: team,
      needsDetails: true, createdBy: Auth.by(), createdAt: Store.now() };
    const updates = { ['players/' + pid]: person };
    let label = `${name} · new · ${T(team)}`;
    const sess = o.sid && Store.session(o.sid);
    if (sess) {
      const roster = rosterOf(sess);
      const pos = joinPos(sess, pid, team, roster, person.defaultPosition);
      if (!okToAdd(team, sideCounts(roster, team).out, pos === 'GK', 'new' + norm(name) + team)) return null;
      const min = nowMinute(sess);
      const entry = { position: pos };
      if (min != null) { entry.arrived = { at: min }; label += ` · ${min}'`; }
      updates[tp(o.sid, team, pid)] = entry;
      if (pos === 'GK' && !Scoring.formatOf(sess).legacy) updates[`sessions/${o.sid}/format/keepers/${team}`] = pid;
    }
    return saveUpdates(updates, {
      label, button: o.button, group: o.group,
      onSaved: h => { if (o.onDone) o.onDone(pid, team); if (o.onSaved) o.onSaved(h, pid); },
    });
  }

  // ======================================================================== shared markup
  const teamBtn = (pid, team, tap) =>
    `<button type="button" class="su-tb ${tcls(team)}" data-tap="${tap || 'add'}" data-pid="${esc(pid)}" data-team="${esc(team)}">${esc(T(team))}</button>`;

  function dupMeta(pids) {
    const apps = pids.map(appsOf);
    const same = apps.every(a => a === apps[0]);
    return `${pids.length} entries with this name · ${same ? `${apps[0]} apps each` : plural(apps.reduce((s, a) => s + a, 0), 'app')}`;
  }
  function personMeta(pid, withApps) {
    const p = Store.player(pid) || {};
    const parts = [defPos(pid)];
    if (p.defaultTeam) parts.push('usually ' + T(p.defaultTeam));
    if (withApps) parts.push(plural(appsOf(pid), 'app'));
    return parts.join(' · ');
  }

  // One person row. o: { teams, onTeam(pid) → team|null, pick, onTap, withApps, pids }
  function personRow(pid, o) {
    const pids = o.pids || [pid];
    const meta = pids.length > 1 ? dupMeta(pids) : personMeta(pid, o.withApps);
    const onPid = pids.find(x => o.onTeam(x));
    const name = `<span class="grow"><span class="nm">${esc(nameOf(pid))}</span><span class="meta" style="display:block">${esc(meta)}</span></span>`;
    if (onPid) {
      const team = o.onTeam(onPid);
      const mark = `<span class="end">${UI.teamMark(team)}</span>`;
      return o.onTap ? `<button type="button" class="r tall" data-tap="${o.onTap}" data-pid="${esc(onPid)}">${name}${mark}</button>`
        : `<div class="r tall su-on">${name}${mark}</div>`;
    }
    if (o.pick) return `<button type="button" class="r tall" data-tap="pick" data-pid="${esc(pid)}">${name}<span class="chev">›</span></button>`;
    return `<div class="r tall su-pr">${name}<span class="end su-tbs">${o.teams.map(t => teamBtn(pid, t)).join('')}</span></div>`;
  }

  // "Already in the club" + "Someone new" for a typed name; `empty` when nothing is typed.
  function finderHtml(q, o) {
    if (!norm(q)) return o.empty || '';
    const found = search(q);
    let html = '';
    if (found.length) html += `<div class="lbl">Already in the club</div>` + UI.rows(found.map(g => personRow(g.pid, Object.assign({}, o, { pids: g.pids, withApps: true }))));
    html += `<div class="lbl${found.length ? ' mt-6' : ''}">Someone new</div>` +
      `<div class="su-newg n${o.newTeams.length}">${o.newTeams.map(t =>
        `<button type="button" class="su-new ${tcls(t)}" data-tap="new" data-team="${esc(t)}">+ ${esc(T(t))}</button>`).join('')}</div>`;
    return html;
  }

  // Keeper picks (Reuben, 25 Oct): per side, the known keepers first: tonight's players ON THAT SIDE whose usual
  // position is GK, most apps first (a usual keeper playing for the other side tonight shows only there). Then
  // "Other ›": tonight's players on that side, to put anyone in goal. No known keeper → "Other ›" is the main choice.
  // onSide(team) → tonight's pids on that side; chosen = the side's pick (shown first even when not a usual GK).
  function knownKeepers(team, onSide, chosen, taken) {
    const byApps = (a, b) => appsOf(b) - appsOf(a) || nameOf(a).localeCompare(nameOf(b));
    const out = onSide(team).filter(pid => Store.player(pid) && defPos(pid) === 'GK' && !taken.includes(pid)).sort(byApps);
    if (chosen && !out.includes(chosen) && !taken.includes(chosen)) out.unshift(chosen);
    return out;
  }
  function keeperBlock(team, cands, chosen) {
    const head = `<div class="lbl su-kl">${UI.teamMark(team, { label: T(team) + ' keeper' })}</div>`;
    if (!cands.length) {
      return head + `<button type="button" class="su-kother is-main" data-tap="kother" data-team="${esc(team)}">` +
        `<span class="grow"><span class="nm">Other ›</span><span class="meta">Pick tonight’s keeper</span></span></button>`;
    }
    return head + `<div class="grid3 su-k">` +
      cands.map(pid => UI.tile({ name: nameOf(pid), pos: defPos(pid) === 'GK' ? 'GK' : defPos(pid) + ' · in goal', tap: 'keeper', data: { pid, team }, sel: pid === chosen })).join('') +
      `<button type="button" class="ptile c su-some su-kother" data-tap="kother" data-team="${esc(team)}"><span class="pt-name">Other ›</span></button></div>`;
  }
  // "Other ›": tonight's players on that side only; "+ Someone not here yet" (secondary) adds a new arrival.
  function openKeeperOther(team, pids, chosen, onPick, onSomeone) {
    const rows = pids.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b))).map(pid =>
      `<button type="button" class="r tall su-korow${pid === chosen ? ' chg' : ''}" data-tap="kpick" data-pid="${esc(pid)}">` +
      `<span class="grow"><span class="nm">${esc(nameOf(pid))}</span><span class="meta" style="display:block">${esc(defPos(pid))}${pid === chosen ? ' · in goal' : ''}</span></span>` +
      `<span class="chev">›</span></button>`);
    const h = UI.sheet.open({ title: T(team) + ' keeper', sub: `Tonight’s ${T(team)} players`, cls: 'sh-setup sh-setup-kother',
      body: rows.length ? UI.rows(rows) : `<div class="su-none">No one on ${esc(T(team))} yet</div>`,
      footer: UI.btn('+ Someone not here yet', { kind: 'g', sm: true, tap: 'ksome' }), cancel: 'Cancel' });
    UI.on(h.el, 'kpick', b => { h.close(); onPick(b.dataset.pid); });
    UI.on(h.el, 'ksome', () => { h.close(); onSomeone(); });
    return h;
  }

  // ======================================================================== "Who's here?" draft
  let draft = null;
  const today = () => fmt.iso(Store.now());
  function blankDraft() { const teams = nightTeams(clubTeams()); return { date: today(), teams, side: teams[0], poles: 'small', picks: {}, keepers: {} }; }
  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d && d.date === today() && d.picks && !(d.sid && Store.session(d.sid))) return Object.assign(blankDraft(), d, { sid: null });
    } catch (e) { /* ignore */ }
    return blankDraft();
  }
  function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* ignore */ } }
  function getDraft() {
    if (!draft || draft.date !== today() || (draft.sid && Store.session(draft.sid))) draft = loadDraft();
    // drop anyone removed from the club (e.g. an undone new person) and stale keepers
    Object.keys(draft.picks).forEach(pid => { if (!Store.player(pid)) delete draft.picks[pid]; });
    Object.keys(draft.keepers).forEach(t => { const k = draft.keepers[t]; if (k && (!draft.picks[k] || draft.picks[k].team !== t)) delete draft.keepers[t]; });
    // tonight's tabs: every active team in Settings (2, or 3 with Blue), plus any side someone is already ticked for
    draft.teams = Scoring.orderTeams(Array.from(new Set(nightTeams(clubTeams()).concat(Object.values(draft.picks).map(x => x.team)))));
    if (!draft.teams.includes(draft.side)) draft.side = draft.teams[0];
    return draft;
  }
  const dTeam = pid => (draft.picks[pid] ? draft.picks[pid].team : null);
  const dSide = team => Object.keys(draft.picks).filter(pid => draft.picks[pid].team === team)
    .sort((a, b) => draft.picks[a].at - draft.picks[b].at);
  function dPos(pid) {
    const pk = draft.picks[pid];
    if (!pk) return null;
    if (draft.poles === 'big' && draft.keepers[pk.team] === pid) return 'GK';
    const p = pk.pos || defPos(pid);
    return p === 'GK' ? 'MID' : p;
  }
  const dCounts = team => counts(dSide(team).map(dPos));

  function dAdd(pid, team) {
    if (draft.picks[pid] && draft.picks[pid].team === team) return true;
    const willKeep = draft.poles === 'big' && defPos(pid) === 'GK' && !draft.keepers[team];
    if (!okToAdd(team, dCounts(team).out, willKeep, 'd' + pid + team)) return false;
    dDrop(pid);
    draft.picks[pid] = { team, at: Date.now() };
    if (willKeep) draft.keepers[team] = pid;
    saveDraft();
    return true;
  }
  function dDrop(pid) {
    const pk = draft.picks[pid];
    if (!pk) return;
    if (draft.keepers[pk.team] === pid) delete draft.keepers[pk.team];
    delete draft.picks[pid];
    saveDraft();
  }
  function dKeeper(team, pid) {
    if (draft.keepers[team] === pid) { delete draft.keepers[team]; saveDraft(); return; }
    if (!draft.picks[pid] || draft.picks[pid].team !== team) { dDrop(pid); draft.picks[pid] = { team, at: Date.now() }; }
    Object.keys(draft.keepers).forEach(t => { if (draft.keepers[t] === pid) delete draft.keepers[t]; });
    draft.keepers[team] = pid;
    saveDraft();
  }
  function dAutoKeepers() {                  // big poles: a usual keeper already on a side fills its empty slot
    if (draft.poles !== 'big') return;
    draft.teams.forEach(t => {
      if (draft.keepers[t]) return;
      const k = dSide(t).find(pid => defPos(pid) === 'GK');
      if (k) draft.keepers[t] = k;
    });
  }

  // ---------------------------------------------------------------- screen: the lineup picker (round 6)
  // A team sheet, not a scoreline: one 56 px tab per team tonight ("Green · 4 of 10"), that team's usual squad
  // as a list (usually here first), tap a row to tick. "+ From Red" adds a usual Red to tonight's side.
  const ui = { extra: {}, more: {} };
  const PER_SIDE = MAX_OUT + 1;              // "n of 10": 9 outfield + 1 keeper
  const usualTeam = pid => (Store.player(pid) || {}).defaultTeam || null;
  const lastN = pid => (recency()[pid] || {}).n || 0;
  const byUsual = (a, b) => ((recency()[b] || {}).w || 0) - ((recency()[a] || {}).w || 0) || nameOf(a).localeCompare(nameOf(b));
  // a team's usual squad (usual team = the player's defaultTeam), plus anyone ticked for it tonight
  function squadOf(team) {
    const all = Object.keys(Store.players()).filter(pid => { const p = Store.player(pid); return p && p.name && (usualTeam(pid) === team || dTeam(pid) === team); });
    return all.sort(byUsual);
  }

  App.registerScreen('ref.setup', {
    tab: 'match', layout: 'phone', console: true, title: 'Tonight',
    header: () => ({ center: `<span class="hd-title">${esc(fmt.date(today()))}</span>`, right: UI.syncChip(Store.status()) }),
    mount(el) {
      UI.onSeg(el, 'side', v => { getDraft().side = v; saveDraft(); drawAll(el); });
      UI.onSeg(el, 'poles', v => { getDraft().poles = v; dAutoKeepers(); saveDraft(); drawAll(el); });
      UI.on(el, 'tick', b => { getDraft(); if (dTick(b.dataset.pid, draft.side)) drawAll(el); });
      UI.on(el, 'more', b => { ui.more[b.dataset.team] = true; drawList(el); });
      UI.on(el, 'pl', b => openPlayerOptions(el, b.dataset.pid));
      UI.on(el, 'from', () => { getDraft(); openFrom(el, draft.side); });
      UI.on(el, 'find', b => {
        getDraft();
        const team = draft.side;
        App.action('setup.newPerson', { team, teams: [team], title: b.dataset.kind === 'new' ? 'New person · ' + T(team) : 'Find a player · ' + T(team),
          onDone: pid => { getDraft(); if (dAdd(pid, team)) { draft.side = team; saveDraft(); } drawAll(el); } });
      });
      UI.on(el, 'keeper', b => { getDraft(); dKeeper(b.dataset.team, b.dataset.pid); drawAll(el); });
      UI.on(el, 'kother', b => {
        getDraft();
        const team = b.dataset.team;
        const pick = pid => { getDraft(); dKeeper(team, pid); drawAll(el); };
        openKeeperOther(team, dSide(team), draft.keepers[team], pick,
          () => App.action('setup.newPerson', { team, teams: [team], position: 'GK', title: T(team) + ' keeper', onDone: pick }));
      });
      UI.on(el, 'kickoff', b => kickOff(el, b));
      UI.on(el, 'to-match', () => App.go('ref.console', {}, { replace: true }));
    },
    render(el) {
      if (Store.activeSessionId()) {
        el.innerHTML = UI.empty('A game is on', '') + `<div class="mt-4">${UI.btn('Go to the match', { tap: 'to-match' })}</div>`;
        return;
      }
      getDraft();
      el.innerHTML = `<div data-r="tabs"></div><div class="su-acts" data-r="acts"></div>` +
        `<div class="su-list" data-r="list"></div><div data-r="sheet"></div><div class="su-foot" data-r="foot"></div>`;
      drawAll(el);
    },
  });

  // tick / untick on the open side (a player ticked for another side moves here; the 9 + 1 cap still asks twice)
  function dTick(pid, team) {
    if (dTeam(pid) === team) { dDrop(pid); return true; }
    return dAdd(pid, team);
  }

  function drawAll(el) { drawTabs(el); drawList(el); drawSheet(el); drawFoot(el); }
  function drawTabs(el) {
    const box = el.querySelector('[data-r="tabs"]');
    if (box) box.innerHTML = `<div class="seg ref su-tabs n${draft.teams.length}" role="tablist" data-seg="side">` + draft.teams.map(t =>
      `<button type="button" role="tab" aria-selected="${t === draft.side}" class="su-tab ${tcls(t)}${t === draft.side ? ' on' : ''}" data-value="${esc(t)}">` +
      `<span class="su-tw">${esc(T(t))}</span><span class="n">${dSide(t).length} of ${PER_SIDE}</span></button>`).join('') + `</div>`;
    const acts = el.querySelector('[data-r="acts"]');
    if (!acts) return;
    const others = draft.teams.filter(t => t !== draft.side);
    const fromLabel = others.length === 1 ? `+ From ${T(others[0])}` : '+ From other teams';
    acts.innerHTML = `<button type="button" class="su-from ${others.length === 1 ? tcls(others[0]) : ''}" data-tap="from">${esc(fromLabel)}</button>` +
      `<button type="button" class="su-newp" data-tap="find" data-kind="new">+ New person</button>` +
      `<button type="button" class="su-find" data-tap="find" data-kind="find" aria-label="Find a player">${UI.icon('search')}</button>`;
  }

  // one squad row: avatar, name, "MID · 8 of last 8" (+ "usually Red" / "on Red tonight"), a tick circle
  function squadRow(pid, team) {
    const on = dTeam(pid) === team;
    const elsewhere = !on && dTeam(pid);
    const ut = usualTeam(pid);
    const n = lastN(pid);
    const posTxt = defPos(pid) === 'GK' && draft.poles !== 'big' ? 'GK · plays outfield on small poles' : defPos(pid);
    const meta = [posTxt, ut && ut !== team ? 'usually ' + T(ut) : '', elsewhere ? `on ${T(elsewhere)} tonight` : '', n ? `${n} of last 8` : 'not in the last 8'].filter(Boolean).join(' · ');
    return `<button type="button" class="r su-sq ${tcls(team)}${on ? ' on wash' : ''}" data-tap="tick" data-pid="${esc(pid)}" aria-pressed="${on}">` +
      UI.avatar(nameOf(pid), ut || team) + `<span class="grow"><span class="nm">${esc(nameOf(pid))}</span><span class="meta">${esc(meta)}</span></span>` +
      `<span class="su-tick${on ? ' on' : ''}" aria-hidden="true">${on ? '✓' : ''}</span></button>`;
  }
  function drawList(el) {
    const box = el.querySelector('[data-r="list"]');
    if (!box) return;
    const team = draft.side;
    const all = squadOf(team);
    const shown = all.filter(pid => lastN(pid) > 0 || dTeam(pid));
    const rest = all.filter(pid => !shown.includes(pid));
    const list = ui.more[team] ? shown.concat(rest) : shown;
    box.innerHTML = `<div class="lbl su-sqlbl"><span>${esc(T(team))} squad</span><b>usually here first</b></div>` +
      (list.length ? UI.rows(list.map(pid => squadRow(pid, team)), { cls: 'su-squad' }) : `<div class="su-none">No usual ${esc(T(team))} players yet · use + From or + New person</div>`) +
      (!ui.more[team] && rest.length ? `<button type="button" class="su-more" data-tap="more" data-team="${esc(team)}">Show ${rest.length} more ${esc(T(team))} ${rest.length === 1 ? 'player' : 'players'}</button>` : '');
  }
  // the ready state: a team sheet card per side with players (keeper first, "GK · in goal" on big poles)
  function drawSheet(el) {
    const box = el.querySelector('[data-r="sheet"]');
    if (!box) return;
    const sides = draft.teams.filter(t => dSide(t).length);
    if (sides.length < 2) { box.innerHTML = ''; return; }
    const posRank = { GK: 0, DEF: 2, MID: 3, FWD: 4 };
    box.innerHTML = `<div class="lbl su-tslbl"><span>Team sheet · ${draft.poles === 'big' ? 'big' : 'small'} poles</span><b>Tap a name to move</b></div>` +
      `<div class="su-ts n${sides.length}">` + sides.map(t => {
        const list = dSide(t).slice().sort((a, b) => (draft.keepers[t] === a ? -1 : draft.keepers[t] === b ? 1 : 0) || ((posRank[dPos(a)] ?? 3) - (posRank[dPos(b)] ?? 3)) || draft.picks[a].at - draft.picks[b].at);
        return `<div class="su-tsc ${tcls(t)}"><div class="su-tsh"><span>${esc(T(t))}</span><b>${list.length}</b></div>` + list.map(pid => {
          const gk = draft.poles === 'big' && draft.keepers[t] === pid;
          return `<button type="button" class="su-tsr${gk ? ' gk' : ''}" data-tap="pl" data-pid="${esc(pid)}"><span class="nm">${esc(nameOf(pid))}</span>` +
            `<span class="pos">${gk ? 'GK · in goal' : esc(dPos(pid))}</span></button>`;
        }).join('') + `</div>`;
      }).join('') + `</div>`;
  }
  function drawFoot(el) {
    const box = el.querySelector('[data-r="foot"]');
    if (!box) return;
    const n = Object.keys(draft.picks).length;
    const ready = draft.teams.filter(t => dSide(t).length).length >= 2;
    let html = `<div class="mt-6">${UI.seg('poles', [{ value: 'small', label: 'Small poles' }, { value: 'big', label: 'Big poles' }], draft.poles, { ref: true })}</div>`;
    if (draft.poles === 'big') {
      const taken = t => Object.keys(draft.keepers).filter(x => x !== t).map(x => draft.keepers[x]);
      html += draft.teams.filter(t => dSide(t).length || draft.teams.length <= 2).map(t => keeperBlock(t, knownKeepers(t, dSide, draft.keepers[t], taken(t)), draft.keepers[t])).join('');
    }
    html += `<div class="su-go">${UI.btn(ready ? `Kick off · ${plural(n, 'player')}` : 'Pick both teams to kick off', { kind: 'w', big: true, tap: 'kickoff', attrs: ready ? '' : ' disabled' })}</div>`;
    box.innerHTML = html;
  }

  // "+ From Red": the other teams' usual squads; tick to add to tonight's side (tick again to take off)
  function openFrom(el, side) {
    if (UI.sheet.top()) return null;
    const others = draft.teams.filter(t => t !== side);
    let from = others.find(t => Object.keys(Store.players()).some(pid => usualTeam(pid) === t)) || others[0];
    const h = UI.sheet.open({ title: `Add to ${T(side)} tonight`, sub: `From ${T(from)}’s usual squad`, cls: 'sh-setup sh-setup-from',
      titleEnd: `<button type="button" class="su-done" data-tap="done">Done</button>`, body: '', theme: document.documentElement.dataset.theme });
    const head = h.el.querySelector('.sheet-h');
    if (head) head.classList.add('lit', 'su-fbar', tcls(side));
    const usualOf = t => Object.keys(Store.players()).filter(pid => Store.player(pid) && Store.player(pid).name && usualTeam(pid) === t).sort(byUsual);
    const more = {};
    function draw() {
      if (h.closed) return;
      const sub = h.el.querySelector('.sh-s'); if (sub) sub.textContent = `From ${T(from)}’s usual squad`;
      const tabs = `<div class="seg ref su-ftabs" role="tablist" data-seg="from">` + others.map(t => {
        const n = usualOf(t).length;
        return `<button type="button" role="tab" class="team ${tcls(t)}${t === from ? ' on' : ''}" data-value="${esc(t)}"><span>${esc(T(t))}${n ? '' : ' · none'}</span></button>`;
      }).join('') + `</div>`;
      const all = usualOf(from);
      const shown = all.filter(pid => lastN(pid) > 0 || dTeam(pid) === side);
      const rest = all.filter(pid => !shown.includes(pid));
      const list = more[from] ? shown.concat(rest) : shown;
      h.setBody(tabs + (list.length ? UI.rows(list.map(pid => squadRow(pid, side)), { cls: 'su-squad mt-3' }) : `<div class="su-none mt-3">No usual ${esc(T(from))} players</div>`) +
        (!more[from] && rest.length ? `<button type="button" class="su-more" data-tap="fmore">Show ${rest.length} more</button>` : ''));
    }
    UI.onSeg(h.el, 'from', v => { from = v; draw(); });
    UI.on(h.el, 'fmore', () => { more[from] = true; draw(); });
    UI.on(h.el, 'tick', b => { getDraft(); if (dTick(b.dataset.pid, side)) { draw(); drawAll(el); } });
    UI.on(h.el, 'done', () => h.close());
    draw();
    return h;
  }

  // Tap a name on the side: position for tonight, move, or take off the list.
  function openPlayerOptions(el, pid) {
    getDraft();
    const pk = draft.picks[pid];
    if (!pk) return;
    const pos = dPos(pid);
    const posItems = (draft.poles === 'big' ? POSITIONS : POSITIONS.slice(1)).map(p => ({ value: p, label: p }));
    const others = draft.teams.filter(t => t !== pk.team);
    const h = UI.sheet.open({
      title: nameOf(pid), sub: personMeta(pid, true), cls: 'sh-setup sh-setup-player',
      body: `<div class="lbl">Tonight</div>${UI.seg('pos', posItems, pos, { ref: true })}` +
        `<div class="grid${Math.min(others.length, 3)} mt-4">${others.map(t => UI.btn('→ ' + T(t), { kind: 'o', sm: true, tap: 'move', data: { team: t } })).join('')}</div>`,
      footer: UI.btn('Take off the list', { kind: 'warn', sm: true, tap: 'drop' }), cancel: 'Done',
    });
    UI.onSeg(h.el, 'pos', v => {
      if (v === 'GK') dKeeper(pk.team, pid);
      else { if (draft.keepers[pk.team] === pid) delete draft.keepers[pk.team]; draft.picks[pid].pos = v; saveDraft(); }
      drawAll(el);
    });
    UI.on(h.el, 'move', b => { if (dAdd(pid, b.dataset.team)) { h.close(); drawAll(el); } });
    UI.on(h.el, 'drop', () => { dDrop(pid); h.close(); drawAll(el); });
  }

  function kickOff(el, button) {
    getDraft();
    if (Store.activeSessionId()) { UI.toast('A game is on'); return; }
    const pids = Object.keys(draft.picks);
    if (!pids.length) return;
    const sid = Store.newKey();
    const now = Store.now();
    const teams = {};
    pids.forEach(pid => {
      const t = draft.picks[pid].team;
      (teams[t] || (teams[t] = { players: {} })).players[pid] = { position: dPos(pid) };
    });
    const format = { start: draft.poles === 'big' ? 'big' : 'small' };
    if (format.start === 'big') {
      const keepers = {};
      draft.teams.forEach(t => { if (draft.keepers[t] && teams[t] && teams[t].players[draft.keepers[t]]) keepers[t] = draft.keepers[t]; });
      if (Object.keys(keepers).length) format.keepers = keepers;
    }
    const sess = { date: today(), status: 'active', mode: 'live', teams, format };
    if (KICK_OFF_STARTS_CLOCK) sess.timer = Clock.kickOff(now);
    Save.run({
      label: `Kick off · ${plural(pids.length, 'player')}`, button, group: el,
      write: () => Store.set('sessions/' + sid, sess),
      undo: () => Store.remove('sessions/' + sid),
      onSaved: () => { draft.sid = sid; saveDraft(); App.go('ref.console', {}, { replace: true }); },
      onUndone: () => { draft.sid = null; saveDraft(); App.go('ref.setup', {}, { replace: true }); },
    });
  }

  // ======================================================================== sheets
  const activeSid = sid => (sid && Store.session(sid) ? sid : Store.activeSessionId());

  // A sheet with a search box (kept alive while typing) and a list that redraws on every data change.
  function searchSheet(o) {
    let q = o.name || '';
    let off = null;
    const h = UI.sheet.open({
      title: o.title, titleEnd: o.titleEnd || '', cls: 'sh-setup ' + o.cls, cancel: o.cancel === false ? false : (o.cancel || 'Cancel'),
      body: `${UI.search({ name: 'q', placeholder: o.placeholder, value: q })}<div class="su-res mt-4" data-r="res"></div>`,
      onClose: () => { if (off) off(); if (o.onClose) o.onClose(); },
    });
    const res = h.el.querySelector('[data-r="res"]');
    const inp = h.el.querySelector('[data-search="q"]');
    const draw = () => { if (!h.closed) res.innerHTML = o.list(q, h); };
    h.redraw = draw;
    h.setQ = v => { q = v; inp.value = v; draw(); };
    h.getQ = () => q;
    inp.addEventListener('input', () => { q = inp.value; draw(); });
    off = Store.on(() => { if (!h.el.querySelector('.is-saving')) draw(); });
    draw();
    return h;
  }

  // ---------------------------------------------------------------- setup.newPerson
  App.registerAction('setup.newPerson', args => {
    const a = args || {};
    const sid = a.onDone ? null : (a.sid ? activeSid(a.sid) : Store.activeSessionId());
    const sess = sid && Store.session(sid);
    const teams = a.teams && a.teams.length ? a.teams : sess ? matchTeams(sess) : nightTeams([]);
    const h = searchSheet({
      title: a.title || 'Add someone', cls: 'sh-setup-new', placeholder: 'Type a name', name: a.name || '',
      list: q => finderHtml(q, {
        teams, newTeams: teams, pick: !sess,
        onTeam: pid => (sess ? (rosterOf(Store.session(sid) || {})[pid] || {}).team || null : null),
        empty: '',
      }),
    });
    UI.on(h.el, 'pick', b => {
      const pid = b.dataset.pid;
      h.close();
      if (a.onDone) a.onDone(pid, a.team || null);
      else App.action('admin.editPlayer', { pid });
    });
    UI.on(h.el, 'add', b => addToMatch(sid, b.dataset.pid, b.dataset.team, { button: b, group: h.el, onSaved: () => h.close() }));
    UI.on(h.el, 'new', b => createPerson(h.getQ(), b.dataset.team, {
      sid, position: a.position, button: b, group: h.el,
      onDone: (pid, team) => { h.close(); if (a.onDone) a.onDone(pid, team); },
    }));
    return h;
  });

  // ---------------------------------------------------------------- setup.addArrival ("+ Player")
  App.registerAction('setup.addArrival', args => {
    const sid = activeSid(args && args.sid);
    if (!sid) { UI.toast('No game on'); return null; }
    const min = nowMinute(Store.session(sid));
    const h = searchSheet({
      title: 'Who’s arrived?', titleEnd: min != null ? `<span class="n">${min}'</span>` : '', cls: 'sh-setup-arrival',
      placeholder: 'Type a name, or add someone new', cancel: 'Done',
      list: q => {
        const sess = Store.session(sid);
        if (!sess) return UI.empty('No game on', '');
        const roster = rosterOf(sess);
        const teams = matchTeams(sess);
        const onTeam = pid => (roster[pid] ? roster[pid].team : null);
        const list = usual(pid => !!roster[pid], 12);
        const empty = list.length ? `<div class="lbl">Usually here, not on yet</div>` +
          UI.rows(list.map(pid => personRow(pid, { teams, onTeam }))) : '';
        return finderHtml(q, { teams, newTeams: teams, onTeam, empty });
      },
    });
    UI.on(h.el, 'add', b => addToMatch(sid, b.dataset.pid, b.dataset.team, {
      button: b, group: h.el, onSaved: () => { h.setQ(''); },
    }));
    UI.on(h.el, 'new', b => createPerson(h.getQ(), b.dataset.team, {
      sid, button: b, group: h.el, onSaved: () => { h.setQ(''); },
    }));
    return h;
  });

  // ---------------------------------------------------------------- setup.teamsTonight
  App.registerAction('setup.teamsTonight', args => {
    const sid = activeSid(args && args.sid);
    if (!sid || !Store.session(sid)) { UI.toast('No game on'); return null; }
    let side = null, off = null;
    const h = UI.sheet.open({
      title: 'Teams tonight', cls: 'sh-setup sh-setup-teams',
      titleEnd: `<button type="button" class="su-done" data-tap="done">Done</button>`,
      body: '', onClose: () => { if (off) off(); },
    });
    function draw() {
      const sess = Store.session(sid);
      if (!sess) { h.setBody(UI.empty('No game on', '')); return; }
      const roster = rosterOf(sess);
      const teams = matchTeams(sess);
      if (!teams.includes(side)) side = teams[0];
      const posRank = p => ({ GK: 3, DEF: 2, MID: 1, FWD: 0 }[p] ?? 1);
      const list = Object.keys(roster).filter(pid => roster[pid].team === side)
        .sort((a, b) => posRank(roster[a].entry.position) - posRank(roster[b].entry.position) || nameOf(a).localeCompare(nameOf(b)));
      const row = pid => {
        const e = roster[pid].entry;
        const tag = e.moved && e.moved.at != null ? `<span class="tagm">Moved ${esc(e.moved.at)}'</span>` : '';
        return `<div class="r tall su-mrow${tag ? ' su-moved' : ''}"><span class="grow"><span class="nm">${esc(nameOf(pid))}${tag}</span>` +
          `<span class="meta" style="display:block">${UI.pos(e.position || 'MID')}</span></span>` +
          `<span class="end">${teams.filter(t => t !== side).map(t =>
            `<button type="button" class="mv2 ${tcls(t)}" data-tap="move" data-pid="${esc(pid)}" data-to="${esc(t)}">→ ${esc(T(t))}</button>`).join('')}</span></div>`;
      };
      h.setBody(UI.teamSwitch('tt', teams.map(team => ({ team, count: Object.values(roster).filter(r => r.team === team).length })), side, { ref: true }) +
        (list.length ? UI.rows(list.map(row), { cls: 'mt-3' }) : `<div class="su-none mt-3">No one on ${esc(T(side))}</div>`));
    }
    UI.onSeg(h.el, 'tt', v => { side = v; draw(); });
    UI.on(h.el, 'done', () => h.close());
    UI.on(h.el, 'move', b => movePlayer(sid, b.dataset.pid, b.dataset.to, { button: b, group: h.el, onSaved: () => draw() }));
    off = Store.on(() => { if (!h.el.querySelector('.is-saving')) draw(); });
    draw();
    return h;
  });

  function movePlayer(sid, pid, to, o) {
    const sess = Store.session(sid);
    if (!sess) return null;
    const roster = rosterOf(sess);
    const cur = roster[pid];
    if (!cur || cur.team === to) return null;
    const from = cur.team;
    const f = Scoring.formatOf(sess);
    const wasKeeper = cur.entry.position === 'GK';
    const toHasKeeper = !!keeperOn(roster, to);
    const pos = wasKeeper && (toHasKeeper || !f.everBig) ? 'MID' : (cur.entry.position || 'MID');
    if (!okToAdd(to, sideCounts(roster, to).out, pos === 'GK', 'mv' + pid + to)) return null;
    const min = nowMinute(sess);
    const entry = Object.assign({}, cur.entry, { position: pos });
    delete entry.moved;
    if (min != null) entry.moved = { from, at: min };
    const updates = { [tp(sid, from, pid)]: null, [tp(sid, to, pid)]: entry };
    if (!f.legacy) {
      if ((f.keepers || {})[from] === pid) updates[`sessions/${sid}/format/keepers/${from}`] = null;
      if (pos === 'GK') updates[`sessions/${sid}/format/keepers/${to}`] = pid;
    }
    return saveUpdates(updates, {
      label: `${nameOf(pid)} → ${T(to)}${min != null ? ` · ${min}'` : ''}`, button: o.button, group: o.group, onSaved: o.onSaved,
    });
  }

  // ---------------------------------------------------------------- setup.bigPoles
  App.registerAction('setup.bigPoles', args => {
    const sid = activeSid(args && args.sid);
    const sess0 = sid && Store.session(sid);
    if (!sess0) { UI.toast('No game on'); return null; }
    const f0 = Scoring.formatOf(sess0);
    const alreadyBig = f0.everBig;
    const at = alreadyBig ? null : switchMinute(sess0);
    const roster0 = rosterOf(sess0);
    const teams = matchTeams(sess0);
    const chosen = {}, extra = {};
    teams.forEach(t => {
      const k = keeperOn(roster0, t) || (f0.keepers || {})[t];
      if (k && roster0[k] && roster0[k].team === t) chosen[t] = k;
      else {
        const onSide = Object.keys(roster0).find(pid => roster0[pid].team === t && defPos(pid) === 'GK');
        if (onSide) chosen[t] = onSide;
      }
    });
    const score = teams.map(t => Scoring.teamGoals(sess0, t)).join('–');
    const title = alreadyBig ? 'Keepers' : at != null ? `Big poles from ${at}'` : 'Big poles';
    const sub = alreadyBig ? 'One keeper per side' : at != null ? `Score carries over: ${score} · keepers count from ${at}'` : 'Keepers count from kick-off';
    const h = UI.sheet.open({
      title, sub, cls: 'sh-setup sh-setup-poles', body: '', cancel: 'Cancel',
      footer: `<div data-r="go"></div>`,
    });
    function draw() {
      const roster = rosterOf(Store.session(sid) || sess0);
      const rTeam = pid => (roster[pid] ? roster[pid].team : null);
      h.setBody(teams.map(t => {
        const taken = teams.filter(x => x !== t).map(x => chosen[x]).filter(Boolean);
        return keeperBlock(t, knownKeepers(t, x => Object.keys(roster).filter(pid => rTeam(pid) === x), chosen[t], taken), chosen[t]);
      }).join(''));
      const n = teams.filter(t => chosen[t]).length;
      h.el.querySelector('[data-r="go"]').innerHTML = UI.btn(alreadyBig ? 'Save keepers' : 'Switch to big poles',
        { kind: 'w', big: true, tap: 'switch', attrs: n ? '' : ' disabled' });
    }
    UI.on(h.el, 'keeper', b => {
      const t = b.dataset.team, pid = b.dataset.pid;
      chosen[t] = chosen[t] === pid ? null : pid;
      teams.forEach(x => { if (x !== t && chosen[x] === pid) chosen[x] = null; });
      draw();
    });
    const pickKeeper = (t, pid) => { chosen[t] = pid; teams.forEach(x => { if (x !== t && chosen[x] === pid) chosen[x] = null; }); if (!h.closed) draw(); };
    // "Other ›": tonight's players on that side only; "+ Someone not here yet" joins at the switch (arrived)
    UI.on(h.el, 'kother', b => {
      const t = b.dataset.team;
      const roster = rosterOf(Store.session(sid) || sess0);
      openKeeperOther(t, Object.keys(roster).filter(pid => roster[pid].team === t), chosen[t], pid => pickKeeper(t, pid),
        () => App.action('setup.newPerson', { team: t, teams: [t], position: 'GK', title: T(t) + ' keeper',
          onDone: pid => { extra[t] = pid; pickKeeper(t, pid); } }));
    });
    UI.on(h.el, 'switch', b => {
      const sess = Store.session(sid);
      if (!sess) return;
      const f = Scoring.formatOf(sess);
      const roster = rosterOf(sess);
      const min = nowMinute(sess);
      const updates = {};
      if (!f.everBig) {
        if (at == null) updates[`sessions/${sid}/format/start`] = 'big';
        else updates[`sessions/${sid}/format/switchedAt`] = at;
      }
      const names = [];
      teams.forEach(t => {
        const k = chosen[t];
        if (!k) return;
        names.push(nameOf(k));
        const cur = roster[k];
        if (cur && cur.team !== t) updates[tp(sid, cur.team, k)] = null;
        const entry = Object.assign({}, cur ? cur.entry : {}, { position: 'GK' });
        if (cur && cur.team !== t) { delete entry.moved; if (min != null) entry.moved = { from: cur.team, at: min }; }
        if (!cur && min != null) entry.arrived = { at: min };
        if (!cur || cur.team !== t || cur.entry.position !== 'GK') updates[tp(sid, t, k)] = entry;
        Object.keys(roster).forEach(o => {   // one keeper per side: anyone else in goal goes outfield
          if (o !== k && !teams.some(x => chosen[x] === o) && roster[o].team === t && roster[o].entry.position === 'GK') updates[tp(sid, t, o) + '/position'] = 'MID';
        });
        if (!f.legacy) updates[`sessions/${sid}/format/keepers/${t}`] = k;
      });
      if (!Object.keys(updates).length) { h.close(); return; }
      const label = alreadyBig ? `Keepers · ${names.join(', ')}` : at != null ? `Big poles from ${at}'` : 'Big poles';
      saveUpdates(updates, { label, sub: alreadyBig ? null : names.join(', '), button: b, group: h.el, onSaved: () => h.close() });
    });
    draw();
    return h;
  });
})();
