/* ============================================================================
   BE Fit Club · js/screens/fix.js · FIXING                    OWNER: Round 5 · Fulltime builder
   ----------------------------------------------------------------------------
   Correcting mistakes during and after a match, and the full-time check.
   Styles in css/fix.css, scoped under .scr-ref-ftcheck / .scr-ref-edit / .sh-fix-*.

   SCREENS
     'ref.ftcheck' {sid}  Full-time check (round 5): the joined score block as the hero, then "Check before
                          publishing": the LONG-STOPPAGE heads-up ("Stoppage ran about 13 min after half time ·
                          6 events in stoppage (46+1' to 46+12')" · OK), double-tap flags ("Remove one" with its effect / "Keep both"),
                          no-minute flags; then the FULL-TIME CARD preview and a pinned "Publish & share".
                          With no signal (or saves still waiting on the phone) it reads "Publish · sends when
                          signal returns": the publish goes into the phone's outbox behind them, the page shows
                          "Waiting for signal", and it turns into "Published" by itself once everything is sent.
                          Publish → status 'completed', goals + cleanSheets from Scoring.storedFields,
                          ftCheck { status:'published', publishedAt, by, fixes, flags? }, publishedBy.
                          Then "Published": the full-time card (hero) + Share / Save image (App.action
                          'share.fullTime', owned by tables.js), player points as a sum, fixes, table moves.
     LONG STOPPAGE        A stoppage of 8+ min (one base minute, one half) gets a heads-up flag, nothing more
                          (decided 20 Oct, option B: "people should see the stoppages"): minutes are never
                          re-stamped. "OK" sets ftCheck.keep.stoppage_<half>_<base> = true and hides it; a flag
                          still open at Publish is counted in ftCheck.flags.longStoppage (the admin's Needs you).
                          The flag quotes per-half stoppage minutes (old timers counted both halves: 46+7' is
                          quoted as 46+3' when the 1st half had 4 min).
     'ref.edit' {sid}     Edit match: the joined score block (hero) on top. Live matches: Players (default; "Green · 57 | Red · 42") and Timeline
                          (filters on one row, grouped by half, "Added after full time"). Laptop shows both.
                          Post matches: per-player stat steppers + score. History matches: score + "Add who
                          played" (upgrades to mode 'post', as classic). Add / take off a player, date,
                          hold to delete the match.
   ACTIONS
     'fix.eventSheet'  ({ sid, eid, preset? })  One Event sheet for every event row anywhere.
     'fix.addMissed'   ({ sid, pid?, type? })   Add a missed event (4 + 3 type grid, Who, Minute "Not sure").
     'fix.playerSheet' ({ sid, pid })           One player's night: points maths, events, add missed, move all.

   EVERY CHANGE is built as the next session, previewed with Scoring.previewChange (points change shown
   before Save, round 5: as a SUM for one player, "Andrew tonight 11 · This change −2 · New total 9",
   or one right-aligned value column for several), then written as one atomic Store.multi through
   Save.run (lock → Undo 5 s → Retry).
   On a finished match the same write also refreshes goals + cleanSheets (Scoring.storedFields), so the
   classic app and the table stay right and no clean sheet is ever left stale (review #5).
   Edited events keep their minute, timestamp and `by`, and gain editedBy / editedAt.
   During the full-time check, fixes are also recorded at ftCheck/fixes/{key} = { text, pid, delta, at, by }
   so the Published screen and the admin's "New since you last looked" can show them.
   ========================================================================== */
(function () {
  'use strict';
  const esc = UI.esc, fmt = UI.fmt;

  // ---------------------------------------------------------------- words
  const TYPE = { goal: 'Goal', ownGoal: 'Own goal', save: 'Save', penaltySave: 'Penalty save', block: 'Block',
    clearance: 'Clearance', yellowCard: 'Yellow card', redCard: 'Red card', halfTime: 'Half time' };
  const typeLabel = t => TYPE[t] || (t ? (t.charAt(0).toUpperCase() + t.slice(1).replace(/([A-Z])/g, ' $1').toLowerCase()) : 'Event');
  const typeLower = t => typeLabel(t).toLowerCase();
  const FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'goals', label: 'Goals', types: ['goal', 'ownGoal'] },
    { value: 'saves', label: 'Saves', types: ['save', 'penaltySave'] },
    { value: 'defence', label: 'Defence', types: ['block', 'clearance'] },
    { value: 'cards', label: 'Cards', types: ['yellowCard', 'redCard'] },
  ];
  const ADD_TYPES = [['goal', 'Goal'], ['save', 'Save'], ['block', 'Block'], ['clearance', 'Clearance'],
    ['yellowCard', 'Yellow'], ['redCard', 'Red card'], ['ownGoal', 'Own goal']];
  const POS_ORDER = { FWD: 0, MID: 1, DEF: 2, GK: 3 };
  const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
  const POST_STATS = [['goals', 'Goals'], ['assists', 'Assists'], ['yellow', 'Yellow cards'], ['red', 'Red cards']];
  const POST_GK = [['saves', 'Saves'], ['penaltySaves', 'Penalty saves'], ['conceded', 'Conceded']];

  // ---------------------------------------------------------------- data helpers
  const base = sid => 'sessions/' + sid;
  const modeOf = s => (s && s.mode) || 'live';
  const actor = ev => (ev && (ev.scorerId || ev.playerId)) || null;
  const pname = pid => (Store.player(pid) || {}).name || 'Someone';
  const minText = ev => Scoring.minuteText(ev);
  const isFinished = s => !!s && s.status === 'completed';
  const inCheck = s => !!s && s.status !== 'completed' && Clock.status(s) === 'ended';
  const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const tcls = t => (window.Teams ? Teams.cls(t) : 't-' + t);

  function teamOf(sess, pid) {
    for (const [t, td] of Object.entries((sess && sess.teams) || {})) if (td && td.players && td.players[pid]) return t;
    return null;
  }
  function posOf(sess, pid) {
    const t = teamOf(sess, pid);
    return t ? sess.teams[t].players[pid].position : null;
  }
  function evTeam(sess, ev) {
    if (!ev) return null;
    if (ev.type === 'goal') return ev.team || teamOf(sess, ev.scorerId);
    if (ev.type === 'ownGoal') return ev.team || teamOf(sess, ev.scorerId);
    return teamOf(sess, actor(ev));
  }
  const teamList = sess => Scoring.orderTeams(Array.from(new Set([...Object.keys((sess && sess.teams) || {}), ...Scoring.teamsOf(sess)])));
  const rosterOf = (sess, team) => Scoring.sessPlayers(sess).filter(p => !team || p.team === team)
    .sort((a, b) => (POS_ORDER[a.pos] ?? 9) - (POS_ORDER[b.pos] ?? 9) || a.name.localeCompare(b.name));

  function events(sess) {
    return Scoring.sessEvents(sess).filter(e => e.type !== 'halfTime');
  }
  // The end of the match: the final whistle, or (old matches with no clock) the end of that day.
  function endOf(sess) {
    const t = sess && sess.timer;
    if (t && t.endedAt) return t.endedAt;
    const d = sess && sess.date ? new Date(sess.date + 'T23:59:59').getTime() : NaN;
    return isNaN(d) ? Infinity : d;
  }
  const addedAfter = (sess, ev) => (ev.timestamp || 0) > endOf(sess);

  // A minute to start from when "Set" is tapped: the live minute, or the last one logged. Never the FT clock.
  function startMinute(sess) {
    if (Clock.canLog(sess)) return Clock.minute(sess) || 1;
    const mins = events(sess).filter(e => e.min != null && !addedAfter(sess, e)).map(e => Number(e.min));
    return mins.length ? Math.max(...mins) : 1;
  }
  function stepMinute(d, delta) {
    if (d.stoppageMin != null && d.stoppageBaseMin != null) {
      const s = Number(d.stoppageMin) + delta;
      if (s >= 1) d.stoppageMin = s;
      else { d.min = Number(d.stoppageBaseMin); delete d.stoppageMin; delete d.stoppageBaseMin; }
    } else d.min = Math.min(150, Math.max(1, (Number(d.min) || 1) + delta));
  }
  function clearMinute(d) { delete d.min; delete d.stoppageMin; delete d.stoppageBaseMin; }
  function tidy(ev) { Object.keys(ev).forEach(k => { if (ev[k] == null || ev[k] === '') delete ev[k]; }); return ev; }

  // Next session after a change; on a finished match goals + cleanSheets follow the events.
  function nextOf(sess, ch) {
    const next = Object.assign({}, sess);
    if (ch.events) {
      const evs = Object.assign({}, sess.events || {});
      for (const [k, v] of Object.entries(ch.events)) { if (v) evs[k] = v; else delete evs[k]; }
      next.events = evs;
    }
    ['teams', 'playerStats', 'goals', 'mode', 'date', 'ftCheck', 'status', 'timer', 'publishedBy'].forEach(k => {
      if (Object.prototype.hasOwnProperty.call(ch, k)) next[k] = ch[k];
    });
    if (isFinished(next)) Object.assign(next, Scoring.storedFields(next));
    return next;
  }
  function addToTeam(sess, pid, team, pos) {
    const teams = clone(sess.teams || {});
    teams[team] = teams[team] || {};
    teams[team].players = teams[team].players || {};
    let p = pos || (Store.player(pid) || {}).defaultPosition || 'MID';
    // Same rule as Who's here (setup.js joinPos): a usual keeper added to a small-poles night goes on the sheet as a
    // MID (no keepers on small poles), so the classic app, which reads the stored position, scores him the same way.
    if (p === 'GK') {
      const f = Scoring.formatOf(sess), k = f.keepers || {};
      if (!f.legacy && (!f.everBig || (Object.keys(k).length && k[team] !== pid))) p = 'MID';
    }
    teams[team].players[pid] = { position: p };
    return teams;
  }
  function fixNote(sess, ch, key, text, pid, delta) {
    if (!inCheck(sess)) return ch;
    const ft = clone(sess.ftCheck || {});
    ft.fixes = Object.assign({}, ft.fixes || {}, { [key]: { text, pid: pid || null, delta: delta || 0, at: Store.now(), by: Auth.by() } });
    return Object.assign({}, ch, { ftCheck: ft });
  }

  // Forward and backward update maps (deep enough that one change never rewrites the whole match).
  const DEPTH = { events: 1, playerStats: 1, teams: 3, ftCheck: 2 };
  function diffInto(a, b, path, depth, fwd, back) {
    if (same(a, b)) return;
    if (depth <= 0 || !isObj(a) || !isObj(b)) { fwd[path] = b === undefined ? null : b; back[path] = a === undefined ? null : a; return; }
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => diffInto(a[k], b[k], path + '/' + k, depth - 1, fwd, back));
  }
  function writesFor(sid, sess, next) {
    const fwd = {}, back = {};
    new Set([...Object.keys(sess || {}), ...Object.keys(next || {})])
      .forEach(k => diffInto((sess || {})[k], (next || {})[k], base(sid) + '/' + k, DEPTH[k] || 0, fwd, back));
    return { fwd, back };
  }

  // One save for every fix: lock → saving → Undo 5 s, or Not saved + Retry.
  function commit(sid, sess, next, o) {
    const { fwd, back } = writesFor(sid, sess, next);
    if (!Object.keys(fwd).length) { if (o.onSaved) o.onSaved(); return null; }
    return Save.run({
      label: o.label, sub: o.sub, button: o.button, group: o.group,
      write: () => Store.multi(fwd), undo: () => Store.multi(back),
      onSaved: o.onSaved, onError: o.onError,
    });
  }

  // ---------------------------------------------------------------- points change panel
  function preview(sid, sess, next, mustPids) {
    const pv = Scoring.previewChange(Store.state, sid, next);
    const list = pv.players.slice();
    // Only who moves; when nobody does, show the player involved ("Reuel 2 → 2").
    if (!list.length) (mustPids || []).filter(Boolean).slice(0, 1).forEach(pid => {
      if (list.some(p => p.pid === pid)) return;
      const a = Scoring.matchPoints(sess, pid), b = Scoring.matchPoints(next, pid);
      if (!a && !b) return;
      const from = a ? a.total : 0, to = b ? b.total : 0;
      list.push({ pid, name: pname(pid), from, to, delta: to - from });
    });
    return { players: list, score: pv.score };
  }
  function scoreText(map, teams) { return teams.map(t => map[t] || 0).join('–'); }
  // Round 5 · the SUM PATTERN for points previews. One player: "Andrew tonight 11 · This change −2", the new
  // total under the value column as the hero (team colour). Several: one right-aligned value column (the change),
  // "11 → 9" beside it. Every row keeps data-pid / data-from / data-to (tests compare them with the result).
  function deltaHtml(sid, sess, next, mustPids, o) {
    const pv = preview(sid, sess, next, mustPids);
    const max = (o && o.max) || 8;
    let body = '';
    if (pv.players.length === 1) {
      const p = pv.players[0];
      const team = teamOf(next, p.pid) || teamOf(sess, p.pid);
      body = `<div class="dr fx-one" data-pid="${esc(p.pid)}" data-from="${p.from}" data-to="${p.to}">` +
        UI.sum({ rows: [{ label: `${p.name} tonight`, value: String(p.from) }, { label: 'This change', value: fmt.signed(p.delta) }],
          total: p.to, label: 'New total', team }) + `</div>`;
    } else if (pv.players.length) {
      const rows = pv.players.slice(0, max).map(p =>
        `<div class="dr fx-dr" data-pid="${esc(p.pid)}" data-from="${p.from}" data-to="${p.to}"><span class="fx-dn">${esc(p.name)}</span>` +
        `<span class="fx-dv">${p.from} → ${p.to}</span><span class="v">${esc(fmt.signed(p.delta))}</span></div>`);
      if (pv.players.length > max) rows.push(`<div class="dr fx-dr"><span class="fx-dn">${esc(fmt.plural(pv.players.length - max, 'more player'))}</span></div>`);
      body = `<div class="fx-list">${rows.join('')}</div>`;
    }
    let score = '';
    if (pv.score) {
      const teams = Scoring.orderTeams(Object.keys(pv.score.to));
      score = `<div class="fx-list mt-2"><div class="dr fx-dr fx-score" data-score-from="${esc(scoreText(pv.score.from, teams))}" data-score-to="${esc(scoreText(pv.score.to, teams))}">` +
        `<span class="fx-dn">Score</span><span class="fx-dv">${esc(scoreText(pv.score.from, teams))} →</span><span class="v">${esc(scoreText(pv.score.to, teams))}</span></div></div>`;
    }
    if (!body && !score) body = `<div class="fx-list"><div class="dr fx-dr fx-nochg"><span class="fx-dn">No points change</span></div></div>`;
    return `<div class="fx-delta" data-delta><div class="lbl fx-dh">Points change</div>${body}${score}</div>`;
  }

  // ---------------------------------------------------------------- shared markup
  const field = (k, valueHtml, o) => {
    o = o || {};
    const tag = o.tap ? 'button' : 'div';
    return `<${tag} class="r fx-f${o.chg ? ' chg' : ''}"${o.tap ? ` type="button" data-tap="${esc(o.tap)}"` : ''}${UI.dataAttrs(o.data)}>` +
      `<span class="fx-k">${esc(k)}</span><span class="grow fx-v">${valueHtml}</span>${o.end || ''}${o.tap ? '<span class="chev">›</span>' : ''}</${tag}>`;
  };
  const changed = (from, to) => from === to ? esc(to) : `${esc(from)} → <b>${esc(to)}</b>`;
  const stepper = (valueText) => `<span class="fx-step"><button type="button" class="step" data-tap="min-dn" aria-label="One minute earlier">−</button>` +
    `<span class="n fx-minv" data-min>${esc(valueText)}</span><button type="button" class="step" data-tap="min-up" aria-label="One minute later">+</button></span>`;
  function minuteRows(d, withChoice) {
    const set = d.min != null;
    let html = '';
    if (withChoice) html += field('Minute', '', { end: UI.seg('minmode', [{ value: 'none', label: 'Not sure' }, { value: 'set', label: 'Set' }], set ? 'set' : 'none') });
    if (set) html += field(withChoice ? '' : 'Minute', '', { end: stepper(minText(d)) });
    return html;
  }

  function evRow(sess, ev, o) {
    o = o || {};
    const pid = actor(ev), team = evTeam(sess, ev);
    let name = pid ? pname(pid) : typeLabel(ev.type), kind = pid ? typeLabel(ev.type) : '', meta = '';
    if (o.forPid && o.forPid !== pid) { name = 'Assist'; kind = ''; meta = `${pname(pid)}'s ${ev.type === 'ownGoal' ? 'own goal' : 'goal'}`; }
    else if (o.forPid) { name = typeLabel(ev.type); kind = ''; }
    if (!(o.forPid && o.forPid !== pid)) {
      if (ev.type === 'goal' && ev.assistId) meta = 'assist ' + pname(ev.assistId);
      if (ev.type === 'ownGoal') meta = 'for ' + fmt.team(ev.benefitTeam) + (ev.assistId ? ' · assist ' + pname(ev.assistId) : '');
    }
    return `<button type="button" class="r fx-ev${ev.editedAt || addedAfter(sess, ev) ? ' chg' : ''}" data-tap="ev" data-eid="${esc(ev.id)}">` +
      `<span class="min">${esc(minText(ev) || '–')}</span>` +
      `<span class="grow"><span class="nm">${esc(name)}</span>${kind ? ` <span class="kind">${esc(kind)}</span>` : ''}` +
      `${meta ? `<span class="meta fx-evm">${esc(meta)}</span>` : ''}</span>` +
      `${team && !o.noTeam ? UI.teamChip(team) : ''}<span class="chev">›</span></button>`;
  }

  // ---------------------------------------------------------------- player picker (inside any sheet)
  // opts: { sess, title, team, teams (allowed), current, exclude:[pid], none:'No assist', squad:true, onPick(pid, team, isNew), onBack }
  function picker(h, opts) {
    const st = { team: opts.team || (opts.teams || teamList(opts.sess))[0], squad: false };
    const allowed = opts.teams || teamList(opts.sess);
    const draw = () => {
      h.setTitle(opts.title);
      const end = h.el.querySelector('[data-end]'); if (end) end.textContent = '';
      if (st.squad) {
        const inMatch = new Set(Scoring.sessPlayers(opts.sess).map(p => p.pid));
        const list = Object.entries(Store.players()).filter(([pid, p]) => p && !inMatch.has(pid))
          .sort(([, a], [, b]) => String(a.name).localeCompare(String(b.name)));
        h.setBody(`<div class="lbl fx-sq-h">Joins ${UI.teamChip(st.team)}</div>` +
          UI.search({ name: 'fx-sq', placeholder: 'Find a player' }) +
          `<div class="mt-2">${UI.rows(list.map(([pid, p]) => UI.row({ tap: 'pk-new', data: { pid, name: String(p.name).toLowerCase() }, title: p.name, meta: p.defaultPosition || '' })), { cls: 'fx-sq' })}</div>`);
        const inp = h.body.querySelector('input');
        if (inp) inp.addEventListener('input', () => {
          const q = inp.value.trim().toLowerCase();
          h.body.querySelectorAll('[data-tap="pk-new"]').forEach(r => { r.hidden = !!q && !r.dataset.name.includes(q); });
        });
      } else {
        const tiles = [];
        if (opts.none) tiles.push(`<button type="button" class="ptile c fx-none${!opts.current ? ' sel' : ''}" data-tap="pk" data-pid="">${esc(opts.none)}</button>`);
        const people = rosterOf(opts.sess, st.team).filter(p => !(opts.exclude || []).includes(p.pid));
        const grid = people.map(p => UI.tile({ name: p.name, pos: p.pid === opts.current ? 'now' : p.pos, tap: 'pk', data: { pid: p.pid }, sel: false }));
        const others = allowed.filter(t => t !== st.team);
        h.setBody((tiles.length ? `<div class="fx-nonewrap">${tiles.join('')}</div>` : '') +
          (grid.length ? UI.tiles(grid) : UI.empty('Nobody on ' + fmt.team(st.team), '')) +
          `<div class="rows mt-3">${others.map(t => UI.row({ tap: 'pk-team', data: { team: t }, cls: 'wash ' + tcls(t), titleHtml: `A ${esc(fmt.team(t))} player`, chevron: true })).join('')}` +
          (opts.squad ? UI.row({ tap: 'pk-squad', titleHtml: `Someone else on ${esc(fmt.team(st.team))}`, chevron: true }) : '') + `</div>`);
      }
      setFoot(h, UI.btn('Back', { kind: 'g', sm: true, tap: 'pk-back' }));
    };
    h.pick = {
      team: t => { st.team = t; st.squad = false; draw(); },
      squad: () => { st.squad = true; draw(); },
      chose: (pid, isNew) => opts.onPick(pid || null, st.team, !!isNew),
      back: () => { if (st.squad) { st.squad = false; draw(); } else opts.onBack(); },
    };
    draw();
  }
  function wirePicker(h) {
    UI.on(h.el, 'pk', b => h.pick && h.pick.chose(b.dataset.pid, false));
    UI.on(h.el, 'pk-new', b => h.pick && h.pick.chose(b.dataset.pid, true));
    UI.on(h.el, 'pk-team', b => h.pick && h.pick.team(b.dataset.team));
    UI.on(h.el, 'pk-squad', () => h.pick && h.pick.squad());
    UI.on(h.el, 'pk-back', () => h.pick && h.pick.back());
  }
  function setFoot(h, html) { const f = h.el.querySelector('[data-foot]'); if (f) f.innerHTML = html; }
  function setEnd(h, html) { const e = h.el.querySelector('[data-end]'); if (e) e.innerHTML = html; }
  function sheet(o) {
    const h = UI.sheet.open(Object.assign({ body: '', footer: '<div class="fx-foot" data-foot></div>', titleEnd: '<span data-end></span>' }, o, { cls: 'sh-fix ' + (o.cls || '') }));
    wirePicker(h);
    return h;
  }

  // =================================================================== EVENT SHEET
  function openEventSheet(args) {
    const sid = args.sid, eid = args.eid;
    const sess0 = Store.session(sid);
    const orig = sess0 && sess0.events && sess0.events[eid];
    if (!orig) { UI.toast('That event has gone'); return null; }
    const st = { d: Object.assign({}, clone(orig), args.preset || {}) };
    if (st.d.assistId === null) delete st.d.assistId;
    const h = sheet({ cls: 'sh-fix-event', title: typeLabel(orig.type), theme: args.theme });
    h.el.dataset.eid = eid;

    const sess = () => Store.session(sid) || sess0;
    const KEYS = ['type', 'team', 'benefitTeam', 'scorerId', 'assistId', 'playerId', 'min', 'stoppageBaseMin', 'stoppageMin'];
    const dirty = () => KEYS.some(k => !same(orig[k], st.d[k]));
    const built = () => tidy(Object.assign({}, st.d, { editedBy: Auth.by(), editedAt: Store.now() }));
    const nextFor = ev => {
      const s = sess();
      let ch = { events: { [eid]: ev } };
      if (st.addTo) ch.teams = addToTeam(s, st.addTo.pid, st.addTo.team);
      const nx0 = nextOf(s, ch);
      if (inCheck(s)) {
        const who = actor(ev || orig);
        const pv = preview(sid, s, nx0, [who]).players.find(p => p.pid === who);
        ch = fixNote(s, ch, eid, ev ? `${pname(actor(orig))}${actor(orig) !== who ? ' → ' + pname(who) : ''} · ${typeLower(orig.type)} changed`
          : `${pname(who)} · ${typeLower(orig.type)} removed`, who, pv ? pv.delta : 0);
        return nextOf(s, ch);
      }
      return nx0;
    };
    const involved = () => [actor(orig), actor(st.d), orig.assistId, st.d.assistId];

    function main() {
      const s = sess(), d = st.d;
      h.setTitle(`${typeLabel(d.type)}${minText(d) ? ' · ' + minText(d) : ''}`);
      setEnd(h, orig.timestamp ? `<span class="fx-logged">logged ${esc(fmt.time(orig.timestamp))}</span>` : '');
      const isGoal = d.type === 'goal', isOG = d.type === 'ownGoal';
      const who0 = actor(orig), who = actor(d);
      let rows = '';
      rows += field(isGoal ? 'Scorer' : isOG ? 'Own goal' : 'Player', changed(pname(who0), pname(who)),
        { tap: 'f-who', chg: who0 !== who });
      if (isGoal || (isOG && (orig.assistId || d.assistId))) {
        const a0 = orig.assistId ? pname(orig.assistId) : 'None', a1 = d.assistId ? pname(d.assistId) : 'None';
        rows += field('Assist', changed(a0, a1), { tap: 'f-assist', chg: a0 !== a1 });
      }
      const team = isOG ? d.benefitTeam : evTeam(s, d);
      if (team) rows += field(isOG ? 'Goal for' : 'Team', UI.teamChip(team));
      rows += minuteRows(d, orig.min == null);
      let html = `<div class="rows fx-fields">${rows}</div>`;
      if (isGoal || isOG) html += `<div class="rows mt-2">${UI.row({ tap: 'f-og', title: isGoal ? 'It was an own goal' : 'It wasn’t an own goal', chevron: true })}</div>`;
      if (dirty()) html += deltaHtml(sid, s, nextFor(built()), involved());
      h.setBody(html);
      if (dirty()) { setFoot(h, UI.btn('Save change', { big: true, tap: 'f-save' })); return; }
      // Remove shows what it will do, like "Remove one · Andrew 11 → 9" (no "Are you sure?", Undo after).
      const rp = preview(sid, s, nextFor(null), [actor(orig), orig.assistId]);
      const eff = rp.players.filter(p => p.delta || p.pid === actor(orig)).slice(0, 2).map(p => `${p.name} ${p.from} → ${p.to}`);
      if (rp.score) { const tt = Scoring.orderTeams(Object.keys(rp.score.to)); eff.push('Score ' + scoreText(rp.score.to, tt)); }
      setFoot(h, `<div class="fx-acts"><button type="button" class="link warn fx-rm" data-tap="f-remove" data-preview="${esc(JSON.stringify(rp))}">` +
        `<span data-label>Remove this ${esc(typeLower(orig.type))}</span>${eff.length ? `<span class="n fx-eff">${esc(eff.join(' · '))}</span>` : ''}</button>` +
        `<button type="button" class="link" data-tap="sheet-cancel">Close</button></div>`);
    }

    function pickWho() {
      const s = sess(), d = st.d;
      const m = minText(d) ? ` at ${minText(d)}` : '';
      const team = d.type === 'goal' ? (d.team || teamOf(s, d.scorerId)) : evTeam(s, d) || teamList(s)[0];
      const teams = d.type === 'ownGoal' ? teamList(s).filter(t => t !== d.benefitTeam) : teamList(s);
      picker(h, {
        sess: s, team: teams.includes(team) ? team : teams[0], teams, current: actor(d), squad: true,
        title: d.type === 'goal' ? `Who scored${m}?` : d.type === 'ownGoal' ? `Whose own goal${m}?` : `Who made the ${typeLower(d.type)}${m}?`,
        onPick: (pid, t, isNew) => {
          if (!pid) return;
          st.addTo = isNew ? { pid, team: t } : null;
          if (d.type === 'goal') {
            d.scorerId = pid; d.team = t;
            if (d.assistId && (d.assistId === pid || teamOf(s, d.assistId) !== t)) delete d.assistId;
          } else if (d.type === 'ownGoal') { d.scorerId = pid; d.team = t; }
          else d.playerId = pid;
          main();
        },
        onBack: main,
      });
    }
    function pickAssist() {
      const s = sess(), d = st.d;
      const team = d.type === 'ownGoal' ? d.benefitTeam : (d.team || teamOf(s, d.scorerId));
      picker(h, {
        sess: s, team, teams: [team], current: d.assistId, exclude: [d.scorerId], none: 'No assist', title: 'Who made the assist?',
        onPick: pid => { if (pid) d.assistId = pid; else delete d.assistId; main(); },
        onBack: main,
      });
    }
    function toggleOG() {
      const s = sess(), d = st.d;
      const m = minText(d) ? ` at ${minText(d)}` : '';
      if (d.type === 'goal') {
        const forTeam = d.team || teamOf(s, d.scorerId);
        const teams = teamList(s).filter(t => t !== forTeam);
        picker(h, {
          sess: s, team: teams[0], teams, title: `Whose own goal${m}?`, squad: true,
          onPick: (pid, t, isNew) => {
            if (!pid) return;
            st.addTo = isNew ? { pid, team: t } : null;
            Object.assign(d, { type: 'ownGoal', scorerId: pid, team: t, benefitTeam: forTeam }); delete d.assistId;
            main();
          },
          onBack: main,
        });
      } else {
        const forTeam = d.benefitTeam;
        picker(h, {
          sess: s, team: forTeam, teams: [forTeam], title: `Who scored${m}?`, squad: true,
          onPick: (pid, t, isNew) => {
            if (!pid) return;
            st.addTo = isNew ? { pid, team: t } : null;
            Object.assign(d, { type: 'goal', scorerId: pid, team: t }); delete d.benefitTeam; delete d.assistId;
            main();
          },
          onBack: main,
        });
      }
    }

    UI.on(h.el, 'f-who', pickWho);
    UI.on(h.el, 'f-assist', pickAssist);
    UI.on(h.el, 'f-og', toggleOG);
    UI.on(h.el, 'min-dn', () => { stepMinute(st.d, -1); main(); });
    UI.on(h.el, 'min-up', () => { stepMinute(st.d, 1); main(); });
    UI.onSeg(h.el, 'minmode', v => { if (v === 'set') { if (st.d.min == null) st.d.min = startMinute(sess()); } else clearMinute(st.d); main(); });
    UI.on(h.el, 'f-save', btn => {
      const s = sess(), ev = built();
      commit(sid, s, nextFor(ev), {
        label: `Saved · ${typeLabel(ev.type)}, ${pname(actor(ev))}${minText(ev) ? ' ' + minText(ev) : ''}`,
        button: btn, group: h.el, onSaved: () => { h.close(); if (args.onDone) args.onDone(); },
      });
    });
    UI.on(h.el, 'f-remove', btn => {
      const s = sess();
      commit(sid, s, nextFor(null), {
        label: `Removed · ${typeLabel(orig.type)}, ${pname(actor(orig))}${minText(orig) ? ' ' + minText(orig) : ''}`,
        button: btn, group: h.el, onSaved: () => { h.close(); if (args.onDone) args.onDone(); },
      });
    });
    main();
    return h;
  }

  // =================================================================== ADD A MISSED EVENT
  function openAddMissed(args) {
    const sid = args.sid;
    const s0 = Store.session(sid);
    if (!s0) { UI.toast('That match has gone'); return null; }
    const live = Clock.canLog(s0);
    const st = { type: args.type || null, pid: args.pid || null, team: args.pid ? teamOf(s0, args.pid) : null,
      assistId: null, forTeam: null, d: {}, addTo: null };
    if (live) st.d.min = startMinute(s0);
    const h = sheet({ cls: 'sh-fix-add', title: 'Add a missed event', theme: args.theme });
    const sess = () => Store.session(sid) || s0;

    function otherTeams(s) { return teamList(s).filter(t => t !== st.team); }
    function build() {
      const s = sess();
      if (!st.type || !st.pid) return null;
      const ev = { type: st.type, timestamp: Store.now(), by: Auth.by() };
      if (st.d.min != null) Object.assign(ev, { min: st.d.min }, st.d.stoppageMin != null ? { stoppageBaseMin: st.d.stoppageBaseMin, stoppageMin: st.d.stoppageMin } : {});
      if (st.type === 'goal') Object.assign(ev, { team: st.team, scorerId: st.pid }, st.assistId ? { assistId: st.assistId } : {});
      else if (st.type === 'ownGoal') Object.assign(ev, { team: st.team, benefitTeam: st.forTeam || otherTeams(s)[0], scorerId: st.pid });
      else ev.playerId = st.pid;
      return ev;
    }
    let key = null;
    const nextFor = ev => {
      const s = sess();
      key = key || Store.newKey();
      let ch = { events: { [key]: ev } };
      if (st.addTo) ch.teams = addToTeam(s, st.addTo.pid, st.addTo.team);
      const nx0 = nextOf(s, ch);
      if (inCheck(s)) {
        const pv = preview(sid, s, nx0, [st.pid]).players.find(p => p.pid === st.pid);
        return nextOf(s, fixNote(s, ch, key, `${pname(st.pid)} · ${typeLower(st.type)} added`, st.pid, pv ? pv.delta : 0));
      }
      return nx0;
    };

    function main() {
      const s = sess();
      h.setTitle('Add a missed event'); setEnd(h, '');
      if (st.forTeam && !otherTeams(s).includes(st.forTeam)) st.forTeam = null;
      const tbtn = ([v, l]) => `<button type="button" class="btn ${st.type === v ? 'w' : 'g'} fx-type" data-tap="a-type" data-value="${v}" aria-pressed="${st.type === v}">${esc(l)}</button>`;
      let html = `<div class="grid4 fx-types">${ADD_TYPES.slice(0, 4).map(tbtn).join('')}</div>` +
        `<div class="grid3 fx-types mt-2">${ADD_TYPES.slice(4).map(tbtn).join('')}</div>`;
      let rows = field('Who', st.pid ? esc(pname(st.pid)) : '<span class="fx-ph">Pick</span>', { tap: 'a-who' });
      if (st.pid && st.team) {
        if (st.type === 'ownGoal') {
          const others = otherTeams(s);
          rows += others.length > 1
            ? field('Goal for', '', { end: UI.seg('a-for', others.map(t => ({ value: t, label: fmt.team(t), team: t })), st.forTeam || others[0]) })
            : field('Goal for', UI.teamChip(others[0]));
        } else rows += field('Team', UI.teamChip(st.team));
      }
      if (st.type === 'goal' && st.pid) rows += field('Assist', st.assistId ? esc(pname(st.assistId)) : 'None', { tap: 'a-assist' });
      rows += minuteRows(st.d, true);
      html += `<div class="rows fx-fields mt-4">${rows}</div>`;
      const ev = build();
      if (ev) html += deltaHtml(sid, s, nextFor(ev), [st.pid, st.assistId]);
      h.setBody(html);
      setFoot(h, UI.btn(st.type ? 'Add ' + typeLower(st.type) : 'Add', { big: true, tap: 'a-save', attrs: ev ? '' : ' disabled' }));
    }
    function pickWho() {
      const s = sess();
      const teams = teamList(s);
      picker(h, {
        sess: s, team: st.team || teams[0], teams, current: st.pid, squad: true, title: 'Who?',
        onPick: (pid, t, isNew) => {
          if (!pid) return;
          st.pid = pid; st.team = t; st.addTo = isNew ? { pid, team: t } : null;
          if (st.assistId && (st.assistId === pid || teamOf(s, st.assistId) !== t)) st.assistId = null;
          main();
        },
        onBack: main,
      });
    }
    function pickAssist() {
      const s = sess();
      picker(h, { sess: s, team: st.team, teams: [st.team], current: st.assistId, exclude: [st.pid], none: 'No assist', title: 'Who made the assist?',
        onPick: pid => { st.assistId = pid || null; main(); }, onBack: main });
    }
    UI.on(h.el, 'a-type', b => { st.type = b.dataset.value; if (st.type !== 'goal') st.assistId = null; main(); });
    UI.on(h.el, 'a-who', pickWho);
    UI.on(h.el, 'a-assist', pickAssist);
    UI.onSeg(h.el, 'a-for', v => { st.forTeam = v; main(); });
    UI.on(h.el, 'min-dn', () => { stepMinute(st.d, -1); main(); });
    UI.on(h.el, 'min-up', () => { stepMinute(st.d, 1); main(); });
    UI.onSeg(h.el, 'minmode', v => { if (v === 'set') { if (st.d.min == null) st.d.min = startMinute(sess()); } else clearMinute(st.d); main(); });
    UI.on(h.el, 'a-save', btn => {
      const ev = build(); if (!ev) return;
      const s = sess();
      commit(sid, s, nextFor(ev), {
        label: `Added · ${typeLabel(ev.type)}, ${pname(st.pid)}`, button: btn, group: h.el,
        onSaved: () => { h.close(); if (args.onDone) args.onDone(); },
      });
    });
    main();
    return h;
  }

  // =================================================================== PLAYER SHEET
  function openPlayerSheet(args) {
    const sid = args.sid, pid = args.pid;
    const s0 = Store.session(sid);
    if (!s0 || !teamOf(s0, pid)) { UI.toast('Not in this match'); return null; }
    const h = sheet({ cls: 'sh-fix-player', title: pname(pid), theme: args.theme });
    const sess = () => Store.session(sid);
    const st = { view: 'main', stats: null, target: null, pos: null };

    const mine = s => events(s).filter(e => actor(e) === pid || e.assistId === pid)
      .sort((a, b) => (a.min ?? 999) - (b.min ?? 999) || (a.timestamp || 0) - (b.timestamp || 0));
    const own = s => events(s).filter(e => actor(e) === pid);

    function header(s) {
      const mp = Scoring.matchPoints(s, pid);
      h.setTitle(pname(pid));
      setEnd(h, UI.teamChip(teamOf(s, pid)));
      const sub = h.el.querySelector('.fx-sub');
      // small poles: a GK-position player plays as a MID (the engine says which position he scored as)
      const listed = posOf(s, pid) || '';
      const text = mp && mp.pos && listed && mp.pos !== listed ? `${listed} · plays as ${mp.pos}` : listed;
      if (sub) sub.textContent = text;
      else { const hh = h.el.querySelector('.sheet-h'); hh.insertAdjacentHTML('beforeend', `<div class="sh-s fx-sub">${esc(text)}</div>`); }
      return mp;
    }
    function maths(mp) {
      if (!mp) return '';
      // the sum pattern: values in one column, the night's total as the hero under it (team colour)
      return UI.sum({ rows: mp.breakdown.map(b => ({ label: b.label, value: b.pts })), total: mp.total, label: 'Pts tonight', team: mp.team || teamOf(sess(), pid) });
    }

    function main() {
      const s = sess();
      if (!s || !teamOf(s, pid)) { h.close(); return; }
      st.view = 'main';
      const mp = header(s);
      if (modeOf(s) !== 'live') return postMain(s, mp);
      const list = mine(s);
      const n = own(s).length;
      const first = pname(pid);
      let html = maths(mp);
      html += list.length ? UI.rows(list.map(e => evRow(s, e, { forPid: pid, noTeam: true })), { cls: 'fx-pev mt-3' })
        : `<div class="fx-none-ev mt-3">Nothing logged</div>`;
      html += `<div class="lbl mt-4">Add a missed one for ${esc(first)}</div>` +
        `<div class="grid4 fx-quick">${[['goal', 'Goal'], ['assist', 'Assist'], ['block', 'Block'], ['more', 'More']]
          .map(([v, l]) => `<button type="button" class="btn g fx-type" data-tap="p-add" data-value="${v}">${l}</button>`).join('')}</div>`;
      html += `<div class="rows mt-3">` +
        (n ? UI.row({ tap: 'p-moveall', title: `Move all ${n} to another player`, chevron: true }) : '') +
        UI.row({ tap: 'p-pos', title: 'Position tonight', right: `<span class="pos">${esc(posOf(s, pid) || '')}</span>`, chevron: true }) +
        `</div>`;
      html += `<button type="button" class="link warn fx-off" data-tap="p-off">Take ${esc(first)} off this match</button>`;
      h.setBody(html);
      setFoot(h, UI.btn('Close', { kind: 'g', sm: true, tap: 'sheet-cancel' }));
    }

    // post matches: stat steppers
    function postMain(s, mp) {
      const ps = Object.assign({}, (s.playerStats || {})[pid] || {});
      if (!st.stats) st.stats = ps;
      const keys = POST_STATS.concat(posOf(s, pid) === 'GK' ? POST_GK : []);
      const next = postNext(s);
      const dirtyStats = !same(tidy(clone(ps)), tidy(clone(st.stats)));
      let html = maths(mp) + `<div class="rows fx-fields mt-3">` + keys.map(([k, l]) =>
        field(l, '', { end: `<span class="fx-step"><button type="button" class="step" data-tap="ps-dn" data-k="${k}" aria-label="Less">−</button>` +
          `<span class="n fx-minv">${Number(st.stats[k]) || 0}</span><button type="button" class="step" data-tap="ps-up" data-k="${k}" aria-label="More">+</button></span>` })).join('') + `</div>`;
      if (dirtyStats) html += deltaHtml(sid, s, next, [pid]);
      html += `<div class="rows mt-3">${UI.row({ tap: 'p-pos', title: 'Position tonight', right: `<span class="pos">${esc(posOf(s, pid) || '')}</span>`, chevron: true })}</div>`;
      html += `<button type="button" class="link warn fx-off" data-tap="p-off">Take ${esc(pname(pid))} off this match</button>`;
      h.setBody(html);
      setFoot(h, dirtyStats ? UI.btn('Save change', { big: true, tap: 'ps-save' }) : UI.btn('Close', { kind: 'g', sm: true, tap: 'sheet-cancel' }));
    }
    function postNext(s) {
      const stats = clone(s.playerStats || {});
      stats[pid] = Object.assign({}, stats[pid] || {}, st.stats, { played: true });
      return nextOf(s, { playerStats: stats });
    }

    function moveAll() {
      const s = sess();
      st.view = 'pick';
      picker(h, {
        sess: s, team: teamOf(s, pid), current: null, exclude: [pid], squad: true,
        title: `Move all ${own(s).length} to…`,
        onPick: (to, t, isNew) => { if (!to) return; st.target = { pid: to, team: t, isNew }; confirmMove(); },
        onBack: main,
      });
    }
    function moveNext(s) {
      const tg = st.target, evs = {};
      const teams = tg.isNew ? addToTeam(s, tg.pid, tg.team) : s.teams;
      const tTeam = tg.isNew ? tg.team : teamOf(s, tg.pid);
      const sx = Object.assign({}, s, { teams });
      events(s).forEach(e => {
        if (actor(e) !== pid && e.assistId !== pid) return;
        const ev = clone(s.events[e.id]);
        if (ev.scorerId === pid) {
          ev.scorerId = tg.pid;
          if (ev.type === 'goal' || ev.type === 'ownGoal') ev.team = tTeam;
          if (ev.type === 'goal' && ev.assistId && (ev.assistId === tg.pid || teamOf(sx, ev.assistId) !== tTeam)) delete ev.assistId;
        }
        if (ev.playerId === pid) ev.playerId = tg.pid;
        if (ev.assistId === pid) { if (ev.scorerId === tg.pid) delete ev.assistId; else ev.assistId = tg.pid; }
        ev.editedBy = Auth.by(); ev.editedAt = Store.now();
        evs[e.id] = ev;
      });
      let ch = { events: evs };
      if (tg.isNew) ch.teams = teams;
      if (inCheck(s)) {
        const pv = preview(sid, s, nextOf(s, ch), [pid]).players.find(p => p.pid === pid);
        ch = fixNote(s, ch, 'move_' + pid, `${pname(pid)} → ${pname(tg.pid)} · events moved`, pid, pv ? pv.delta : 0);
      }
      return nextOf(s, ch);
    }
    function confirmMove() {
      const s = sess();
      st.view = 'confirm';
      const n = own(s).length;
      h.setTitle(`Move all ${n} to ${pname(st.target.pid)}`); setEnd(h, '');
      h.setBody(UI.rows(mine(s).map(e => evRow(s, e, { forPid: pid, noTeam: true })), { cls: 'fx-pev' }) +
        deltaHtml(sid, s, moveNext(s), [pid, st.target.pid]));
      setFoot(h, UI.btn(`Move all ${n}`, { big: true, tap: 'p-move-go' }) + UI.btn('Back', { kind: 'g', sm: true, tap: 'p-back' }));
    }
    function posPick() {
      const s = sess();
      st.view = 'pos'; st.pos = posOf(s, pid);
      drawPos();
    }
    function posNext(s) {
      const teams = clone(s.teams);
      teams[teamOf(s, pid)].players[pid] = Object.assign({}, teams[teamOf(s, pid)].players[pid], { position: st.pos });
      return nextOf(s, { teams });
    }
    function drawPos() {
      const s = sess();
      h.setTitle(`${pname(pid)} · position`); setEnd(h, '');
      let html = UI.seg('p-posv', POSITIONS.map(p => ({ value: p, label: p })), st.pos);
      const dirtyPos = st.pos !== posOf(s, pid);
      if (dirtyPos) html += deltaHtml(sid, s, posNext(s), [pid]);
      h.setBody(html);
      setFoot(h, (dirtyPos ? UI.btn('Save change', { big: true, tap: 'p-pos-go' }) : '') + UI.btn('Back', { kind: 'g', sm: true, tap: 'p-back' }));
    }

    UI.on(h.el, 'ev', b => App.action('fix.eventSheet', { sid, eid: b.dataset.eid }));
    UI.on(h.el, 'p-add', b => {
      const v = b.dataset.value;
      if (v === 'assist') return assistPick();
      App.action('fix.addMissed', { sid, pid, type: v === 'more' ? null : v });
    });
    UI.on(h.el, 'p-moveall', moveAll);
    UI.on(h.el, 'p-back', main);
    UI.on(h.el, 'p-pos', posPick);
    UI.onSeg(h.el, 'p-posv', v => { st.pos = v; drawPos(); });
    UI.on(h.el, 'p-pos-go', btn => {
      const s = sess();
      commit(sid, s, posNext(s), { label: `${pname(pid)} · ${st.pos}`, button: btn, group: h.el, onSaved: main });
    });
    UI.on(h.el, 'p-move-go', btn => {
      const s = sess(), n = own(s).length;
      commit(sid, s, moveNext(s), { label: `Moved ${n} · ${pname(pid)} → ${pname(st.target.pid)}`, button: btn, group: h.el, onSaved: main });
    });
    UI.on(h.el, 'p-off', btn => {
      const s = sess(), t = teamOf(s, pid);
      const teams = clone(s.teams); delete teams[t].players[pid];
      commit(sid, s, nextOf(s, { teams }), { label: `${pname(pid)} taken off · ${fmt.date(s.date)}`, button: btn, group: h.el, onSaved: () => h.close() });
    });
    UI.on(h.el, 'ps-dn', b => { st.stats[b.dataset.k] = Math.max(0, (Number(st.stats[b.dataset.k]) || 0) - 1); main(); });
    UI.on(h.el, 'ps-up', b => { st.stats[b.dataset.k] = (Number(st.stats[b.dataset.k]) || 0) + 1; main(); });
    UI.on(h.el, 'ps-save', btn => {
      const s = sess();
      commit(sid, s, postNext(s), { label: `Saved · ${pname(pid)}`, button: btn, group: h.el, onSaved: () => { st.stats = null; main(); } });
    });

    // "Assist": pick which of the team's goals they assisted, then the Event sheet shows the change.
    function assistPick() {
      const s = sess(), team = teamOf(s, pid);
      st.view = 'assist';
      const goals = events(s).filter(e => (e.type === 'goal' && (e.team || teamOf(s, e.scorerId)) === team && e.scorerId !== pid) ||
        (e.type === 'ownGoal' && e.benefitTeam === team))
        .sort((a, b) => (a.min ?? 999) - (b.min ?? 999) || (a.timestamp || 0) - (b.timestamp || 0));
      h.setTitle(`Which goal did ${pname(pid)} assist?`); setEnd(h, '');
      h.setBody(goals.length ? UI.rows(goals.map(e => evRow(s, e, { noTeam: true }).replace('data-tap="ev"', 'data-tap="p-assist-go"')), { cls: 'fx-pev' })
        : UI.empty(`No ${fmt.team(team)} goals`, ''));
      setFoot(h, UI.btn('Back', { kind: 'g', sm: true, tap: 'p-back' }));
    }
    UI.on(h.el, 'p-assist-go', b => { main(); App.action('fix.eventSheet', { sid, eid: b.dataset.eid, preset: { assistId: pid } }); });

    // Stay current while other sheets on top change the match.
    const off = Store.on(() => { if (!h.closed && st.view === 'main') main(); });
    const close0 = h.close;
    h.close = () => { off(); close0(); };
    main();
    return h;
  }

  // =================================================================== EDIT MATCH
  const viewState = {};
  const vs = sid => viewState[sid] || (viewState[sid] = { tab: 'players', team: null, filter: 'all' });

  function playersPane(sid, s, v) {
    const mb = Scoring.matchBreakdown(s);
    const cols = mb.columns.filter(c => c.players.length || Object.keys((s.teams || {})[c.team] || {}).length);
    if (!cols.length) return UI.empty('No players yet', '');
    if (!v.team || !cols.some(c => c.team === v.team)) v.team = cols[0].team;
    const col = cols.find(c => c.team === v.team);
    const rows = col.players.map(p => UI.row({ tap: 'pl', data: { pid: p.pid }, title: p.name, left: UI.avatar(p.name, p.team),
      metaHtml: `<span class="tally">${esc(tallyText(p))}</span>`, pts: p.total, chevron: true }));
    return UI.teamSwitch('fx-team', cols.map(c => ({ team: c.team, count: c.points })), v.team, { ref: true }) +
      `<div class="mt-3">${UI.rows(rows, { cls: 'fx-players' })}</div>` +
      `<button type="button" class="link fx-link" data-tap="addp">+ Add a player who played</button>`;
  }
  function tallyText(mp) {
    const t = mp.tally, parts = [];
    [['goals', 'G'], ['assists', 'A'], ['ogs', 'OG'], ['saves', 'S'], ['penSaves', 'PS'], ['blocks', 'B'], ['clearances', 'C'], ['yellow', 'Y'], ['red', 'R']]
      .forEach(([k, l]) => { if (t[k]) parts.push(t[k] + l); });
    return [mp.pos, parts.join(' ')].filter(Boolean).join(' · ');
  }

  function timelinePane(sid, s, v) {
    const all = events(s);
    const counts = {};
    FILTERS.forEach(f => { counts[f.value] = f.types ? all.filter(e => f.types.includes(e.type)).length : all.length; });
    if (v.filter !== 'all' && !counts[v.filter]) v.filter = 'all';
    const f = FILTERS.find(x => x.value === v.filter);
    const list = f.types ? all.filter(e => f.types.includes(e.type)) : all;
    const ht = Scoring.sessEvents(s).find(e => e.type === 'halfTime');
    const groups = { after: [], second: [], first: [], all: [] };
    list.forEach(e => {
      if (addedAfter(s, e)) groups.after.push(e);
      else if (ht) ((e.timestamp || 0) > (ht.timestamp || 0) ? groups.second : groups.first).push(e);
      else groups.all.push(e);
    });
    const desc = (a, b) => (b.min ?? -1) - (a.min ?? -1) || (b.stoppageMin ?? 0) - (a.stoppageMin ?? 0) || (b.timestamp || 0) - (a.timestamp || 0);
    const range = list => {
      const m = list.filter(e => e.min != null).map(e => Number(e.min));
      return m.length ? `${Math.min(...m)}'–${Math.max(...m)}'` : '';
    };
    const block = (label, list, withRange) => list.length
      ? `<div class="lbl fx-gl">${esc(label)}${withRange && range(list) ? ` <b class="n">${esc(range(list))}</b>` : ''}</div>${UI.rows(list.sort(desc).map(e => evRow(s, e)), { cls: 'fx-feed' })}` : '';
    const chips = UI.chips('fx-filter', FILTERS.filter(x => x.value === 'all' || counts[x.value])
      .map(x => ({ value: x.value, label: x.label, n: counts[x.value], on: x.value === v.filter })), { ref: true });
    const body = block('Added after full time', groups.after) + block('Second half', groups.second, true) +
      block('First half', groups.first, true) + block('Events', groups.all, true);
    return chips + `<div class="fx-tl">${body || UI.empty('Nothing logged', '')}</div>` +
      `<div class="fx-dock">${UI.btn('+ Add a missed event', { tap: 'addm' })}</div>`;
  }

  // Round 5: the joined score block (FT · 12 Oct) in the screen's one hero card, lit in the winner's colour.
  // Post / history matches store the score, so there the block is a button that opens the score sheet.
  function scoreHero(s, o) {
    o = o || {};
    if (!Scoring.teamsOf(s).length) return '';
    const win = Scoring.result(s).winner;
    return `<div class="card hero fx-hero ${win ? tcls(win) : ''}">` +
      UI.scoreFor(s, { size: 'compact', tap: o.tap || null, cls: 'fx-sb' }) +
      (o.under ? `<div class="fx-under">${o.under}</div>` : '') +
      (o.tap ? `<button type="button" class="link fx-link fx-editscore" data-tap="${o.tap}">Edit score ›</button>` : '') + `</div>`;
  }

  function matchPane(sid, s) {
    return `<div class="lbl mt-6">This match</div>` +
      `<div class="rows">${field('Date', `<input class="fx-date" type="date" data-date value="${esc(s.date || '')}" aria-label="Match date">`)}</div>` +
      `<div class="mt-4">${UI.hold('Hold to delete this match', { name: 'fx-del', warn: true, doneText: 'Deleting…' })}</div>`;
  }

  function renderEdit(el, ctx) {
    const sid = ctx.params.sid, s = Store.session(sid);
    if (!s) { el.innerHTML = UI.empty('Match not found', '') + UI.btn('Back to matches', { kind: 'g', tap: 'home' }); return; }
    const v = vs(sid), mode = modeOf(s);
    // The admin can post the full-time card (both pages) straight from here; Needs you › Published opens this screen.
    const share = s.status === 'completed' ? `<div class="fx-share">${UI.btn('Share full-time card', { kind: 'g', tap: 'ftshare' })}</div>` : '';
    let html = '';
    if (mode === 'live') {
      const n = events(s).length;
      html = scoreHero(s) + share;
      if (ctx.wide) {
        html += `<div class="fx-cols mt-6"><div class="fx-col"><div class="lbl">Players</div>${playersPane(sid, s, v)}${matchPane(sid, s)}</div>` +
          `<div class="fx-col"><div class="lbl">Timeline <b class="n">${n}</b></div>${timelinePane(sid, s, v)}</div></div>`;
      } else {
        html += `<div class="tabs2 mt-4" role="tablist"><button type="button" role="tab" data-tap="tab" data-value="players" class="${v.tab === 'players' ? 'on' : ''}">Players</button>` +
          `<button type="button" role="tab" data-tap="tab" data-value="timeline" class="${v.tab === 'timeline' ? 'on' : ''}">Timeline <span class="n fx-tabn">${n}</span></button></div>` +
          (v.tab === 'timeline' ? timelinePane(sid, s, v) : playersPane(sid, s, v) + matchPane(sid, s));
      }
    } else if (mode === 'post') {
      html = scoreHero(s, { tap: 'score' }) + share + `<div class="mt-4">${playersPane(sid, s, v)}</div>` + matchPane(sid, s);
    } else {
      html = scoreHero(s, { tap: 'score' }) + share + `<div class="mt-4">${UI.empty('No player details', '')}</div>` +
        UI.btn('Add who played', { tap: 'upgrade' }) + matchPane(sid, s);
    }
    el.innerHTML = `<div class="fx-edit">${html}</div>`;
  }

  // score sheet (post and history matches: the score is stored, not counted)
  function openScoreSheet(sid) {
    const s0 = Store.session(sid); if (!s0) return;
    const teams = Scoring.orderTeams(Scoring.teamsOf(s0));
    const st = { goals: Object.assign({}, s0.goals || {}) };
    const h = sheet({ cls: 'sh-fix-score', title: 'Score' });
    const draw = () => {
      const s = Store.session(sid) || s0;
      const next = nextOf(s, { goals: Object.assign({}, st.goals) });
      const dirty = !same(s.goals, next.goals);
      h.setBody(`<div class="rows fx-fields">${teams.map(t => field(fmt.team(t), '', { end:
        `<span class="fx-step"><button type="button" class="step" data-tap="g-dn" data-team="${esc(t)}" aria-label="One less">−</button>` +
        `<span class="n fx-minv">${st.goals[t] || 0}</span><button type="button" class="step" data-tap="g-up" data-team="${esc(t)}" aria-label="One more">+</button></span>` })).join('')}</div>` +
        (dirty ? deltaHtml(sid, s, next, []) : ''));
      setFoot(h, dirty ? UI.btn('Save change', { big: true, tap: 'g-save' }) : UI.btn('Close', { kind: 'g', sm: true, tap: 'sheet-cancel' }));
    };
    UI.on(h.el, 'g-dn', b => { st.goals[b.dataset.team] = Math.max(0, (st.goals[b.dataset.team] || 0) - 1); draw(); });
    UI.on(h.el, 'g-up', b => { st.goals[b.dataset.team] = (st.goals[b.dataset.team] || 0) + 1; draw(); });
    UI.on(h.el, 'g-save', btn => {
      const s = Store.session(sid);
      commit(sid, s, nextOf(s, { goals: Object.assign({}, st.goals) }), { label: `Score · ${teams.map(t => st.goals[t] || 0).join('–')}`, button: btn, group: h.el, onSaved: () => h.close() });
    });
    draw();
  }

  // add a player who played (live / post)
  function openAddPlayer(sid) {
    const s0 = Store.session(sid); if (!s0) return;
    const h = sheet({ cls: 'sh-fix-addp', title: 'Add a player who played' });
    const st = { pid: null, team: null, pos: null };
    const teams = teamList(s0);
    const draw = () => {
      const s = Store.session(sid) || s0;
      h.setTitle('Add a player who played');
      let html = `<div class="rows fx-fields">${field('Who', st.pid ? esc(pname(st.pid)) : '<span class="fx-ph">Pick</span>', { tap: 'ap-who' })}</div>`;
      let next = null;
      if (st.pid) {
        html += `<div class="lbl mt-4">Team tonight</div>` + UI.seg('ap-team', teams.map(t => ({ value: t, label: fmt.team(t), team: t })), st.team, { ref: true }) +
          `<div class="lbl mt-4">Position</div>` + UI.seg('ap-pos', POSITIONS.map(p => ({ value: p, label: p })), st.pos, { ref: true });
        next = nextOf(s, Object.assign({ teams: addToTeam(s, st.pid, st.team, st.pos) },
          modeOf(s) === 'post' ? { playerStats: Object.assign({}, clone(s.playerStats || {}), { [st.pid]: { played: true } }) } : {}));
        html += deltaHtml(sid, s, next, [st.pid]);
      }
      h.setBody(html);
      setFoot(h, UI.btn('Add to match', { big: true, tap: 'ap-save', attrs: st.pid ? '' : ' disabled' }));
      h.next = next;
    };
    const pickWho = () => {
      const s = Store.session(sid) || s0;
      const inMatch = new Set(Scoring.sessPlayers(s).map(p => p.pid));
      const list = Object.entries(Store.players()).filter(([pid, p]) => p && !inMatch.has(pid)).sort(([, a], [, b]) => String(a.name).localeCompare(String(b.name)));
      h.setTitle('Who played?');
      h.setBody(UI.search({ name: 'fx-ap', placeholder: 'Find a player' }) +
        `<div class="mt-2">${UI.rows(list.map(([pid, p]) => UI.row({ tap: 'ap-pick', data: { pid, name: String(p.name).toLowerCase() }, title: p.name, meta: p.defaultPosition || '' })))}</div>`);
      const inp = h.body.querySelector('input');
      inp.addEventListener('input', () => { const q = inp.value.trim().toLowerCase(); h.body.querySelectorAll('[data-tap="ap-pick"]').forEach(r => { r.hidden = !!q && !r.dataset.name.includes(q); }); });
      setFoot(h, UI.btn('Back', { kind: 'g', sm: true, tap: 'ap-back' }));
    };
    UI.on(h.el, 'ap-who', pickWho);
    UI.on(h.el, 'ap-back', draw);
    UI.on(h.el, 'ap-pick', b => {
      const p = Store.player(b.dataset.pid) || {};
      st.pid = b.dataset.pid; st.team = teams.includes(p.defaultTeam) ? p.defaultTeam : teams[0];
      st.pos = POSITIONS.includes(p.defaultPosition) ? p.defaultPosition : 'MID'; draw();
    });
    UI.onSeg(h.el, 'ap-team', v => { st.team = v; draw(); });
    UI.onSeg(h.el, 'ap-pos', v => { st.pos = v; draw(); });
    UI.on(h.el, 'ap-save', btn => {
      if (!h.next) return;
      const s = Store.session(sid);
      commit(sid, s, h.next, { label: `Added · ${pname(st.pid)}, ${fmt.team(st.team)}`, button: btn, group: h.el, onSaved: () => h.close() });
    });
    draw();
  }

  // history → post: tick who played (classic "upgrade" behaviour)
  function openUpgrade(sid) {
    const s0 = Store.session(sid); if (!s0) return;
    const teams = Scoring.orderTeams(Scoring.teamsOf(s0));
    const picked = new Set();
    const h = sheet({ cls: 'sh-fix-up', title: 'Who played?' });
    const next = s => {
      const tm = {}, stats = {};
      picked.forEach(pid => {
        const p = Store.player(pid) || {};
        const team = teams.includes(p.defaultTeam) ? p.defaultTeam : teams[0];
        tm[team] = tm[team] || { players: {} };
        tm[team].players[pid] = { position: POSITIONS.includes(p.defaultPosition) ? p.defaultPosition : 'MID' };
        stats[pid] = { played: true, goals: 0, assists: 0, yellow: 0, red: 0 };
      });
      return nextOf(s, { teams: tm, playerStats: stats, mode: 'post' });
    };
    const list = Object.entries(Store.players()).filter(([, p]) => p).sort(([, a], [, b]) => String(a.name).localeCompare(String(b.name)));
    h.setBody(UI.search({ name: 'fx-up', placeholder: 'Find a player' }) +
      `<div class="mt-2">${UI.rows(list.map(([pid, p]) => UI.row({ tap: 'up-tick', data: { pid, name: String(p.name).toLowerCase() }, title: p.name,
        meta: `${p.defaultPosition || ''} · ${fmt.team(p.defaultTeam)}`, right: '<span class="fx-tick"></span>' })))}</div><div data-up-delta></div>`);
    const inp = h.body.querySelector('input');
    inp.addEventListener('input', () => { const q = inp.value.trim().toLowerCase(); h.body.querySelectorAll('[data-tap="up-tick"]').forEach(r => { r.hidden = !!q && !r.dataset.name.includes(q); }); });
    const foot = () => {
      const s = Store.session(sid) || s0;
      h.body.querySelector('[data-up-delta]').innerHTML = picked.size ? deltaHtml(sid, s, next(s), [], { max: 4 }) : '';
      setFoot(h, UI.btn(picked.size ? `Save · ${fmt.plural(picked.size, 'player')}` : 'Tick who played', { big: true, tap: 'up-save', attrs: picked.size ? '' : ' disabled' }));
    };
    UI.on(h.el, 'up-tick', b => {
      const pid = b.dataset.pid;
      if (picked.has(pid)) picked.delete(pid); else picked.add(pid);
      b.classList.toggle('chg', picked.has(pid));
      b.querySelector('.fx-tick').textContent = picked.has(pid) ? '✓' : '';
      b.querySelector('.fx-tick').classList.toggle('on', picked.has(pid));
      foot();
    });
    UI.on(h.el, 'up-save', btn => {
      const s = Store.session(sid);
      commit(sid, s, next(s), { label: `Saved · ${fmt.plural(picked.size, 'player')}`, button: btn, group: h.el, onSaved: () => h.close() });
    });
    foot();
  }

  App.registerScreen('ref.edit', {
    tab: 'match',
    header: ctx => {
      const s = Store.session(ctx.params.sid);
      return { center: 'Edit' + (s ? ' · ' + esc(fmt.date(s.date)) : ''), right: `<button type="button" class="hd-btn" data-shell="back">Done</button>` };
    },
    mount(el, ctx) {
      const sid = ctx.params.sid;
      UI.on(el, 'tab', b => { vs(sid).tab = b.dataset.value; ctx.rerender(); });
      UI.onSeg(el, 'fx-team', v => { vs(sid).team = v; ctx.rerender(); });
      UI.onChip(el, 'fx-filter', v => { vs(sid).filter = v; ctx.rerender(); });
      UI.on(el, 'pl', b => App.action('fix.playerSheet', { sid, pid: b.dataset.pid }));
      UI.on(el, 'ev', b => App.action('fix.eventSheet', { sid, eid: b.dataset.eid }));
      // after adding, show the top of the Timeline, where "Added after full time" sits
      UI.on(el, 'addm', () => App.action('fix.addMissed', { sid, onDone: () => { vs(sid).filter = 'all'; window.scrollTo({ top: 0 }); } }));
      UI.on(el, 'addp', () => openAddPlayer(sid));
      UI.on(el, 'score', () => openScoreSheet(sid));
      UI.on(el, 'upgrade', () => openUpgrade(sid));
      UI.on(el, 'ftshare', () => App.action('share.fullTime', { sid }));
      UI.on(el, 'home', () => App.go('ref.home', {}, { replace: true }));   // the shell routes it to the role's Match / Home
      el.addEventListener('change', e => {
        const inp = e.target.closest('[data-date]');
        if (!inp || !inp.value) return;
        const s = Store.session(sid);
        if (!s || inp.value === s.date) return;
        commit(sid, s, nextOf(s, { date: inp.value }), { label: `Date · ${fmt.date(inp.value)}` });
      });
      UI.onHold(el, 'fx-del', () => {
        const s = Store.session(sid);
        if (!s) return;
        const copy = clone(s);
        Save.run({
          label: `Match deleted · ${fmt.date(s.date)}`,
          write: () => Store.remove(base(sid)), undo: () => Store.set(base(sid), copy),
          onSaved: () => App.go('ref.home', {}, { replace: true }),
          onError: () => { const b = el.querySelector('[data-hold="fx-del"]'); if (b) { b.classList.remove('done'); b.querySelector('.hl').textContent = 'Hold to delete this match'; } },
        });
      });
    },
    render: renderEdit,
  });

  // =================================================================== FULL-TIME CHECK
  function teamPoints(s) { const mb = Scoring.matchBreakdown(s); const o = {}; mb.columns.forEach(c => { o[c.team] = c.points; }); return o; }

  // ---------------------------------------------------------------- long stoppage (a heads-up only)
  // 19 Oct: the stoppage after half time ran about 13-14 min (6 events in it, 46+1' … 46+12'). The minutes stay as they
  // are (people should see the stoppages); the referee just confirms it with OK.
  const LONG_STOPPAGE_MIN = 8;
  const maxOf = list => (list.length ? Math.max(...list) : 0);
  function halfInfo(sess) {
    const ht = Scoring.sessEvents(sess).find(e => e.type === 'halfTime');
    return ht ? { id: ht.id, ts: ht.timestamp || 0, min: ht.min != null ? Number(ht.min) : 45 } : null;
  }
  // 1st or 2nd half: by the clock for events logged live, by the minute for ones added after full time.
  function halfOf(sess, ev, ht) {
    if (!ht || ev.type === 'halfTime') return 1;
    if (ev.timestamp && !addedAfter(sess, ev)) return ev.timestamp > ht.ts ? 2 : 1;
    const m = ev.stoppageBaseMin != null ? Number(ev.stoppageBaseMin) : ev.min != null ? Number(ev.min) : null;
    return m != null && m > ht.min ? 2 : 1;
  }

  // Every stoppage that has events in it (one half, one base minute), with its length in whole minutes:
  //   labels  the events' stoppage minutes counted from this stoppage's start (labels restart each half; on
  //           timers from before round 5 the 2nd half's labels still include the 1st half's stoppage)
  //   mins    the stoppage's length: its last label, or the clock's own total for that half when the clock can
  //           tell it apart (round 5 timers keep stoppageAtHalf) and it agrees with the labels (within 3 min)
  function stoppages(sess) {
    if (!sess || modeOf(sess) !== 'live') return [];
    const ht = halfInfo(sess);
    const t = sess.timer || {};
    const perHalf = Number.isFinite(t.stoppageAtHalf);
    const groups = {};
    events(sess).forEach(e => {
      if (e.stoppageMin == null || e.stoppageBaseMin == null) return;
      const half = halfOf(sess, e, ht), base = Number(e.stoppageBaseMin);
      const key = `stoppage_${half}_${base}`;
      (groups[key] = groups[key] || { key, half, base, evs: [] }).evs.push(e);
    });
    const list = Object.values(groups).sort((a, b) => a.half - b.half || a.base - b.base);
    const labelsOf = g => g.evs.map(e => Number(e.stoppageMin));
    list.forEach(g => {
      g.evs.sort((a, b) => Number(a.stoppageMin) - Number(b.stoppageMin) || (a.timestamp || 0) - (b.timestamp || 0));
      const raw = labelsOf(g);
      const before = list.filter(o => o !== g && (o.half === g.half ? o.base < g.base : (!perHalf && o.half < g.half)));
      const off = Math.max(0, Math.min(maxOf(before.flatMap(labelsOf)), Math.min(...raw) - 1));
      g.labels = raw.map(l => Math.max(1, l - off));
      const last = maxOf(g.labels);
      let mins = last;
      if (perHalf && ht && list.filter(o => o.half === g.half).length === 1) {
        const clock = (g.half === 1 ? t.stoppageAtHalf : (t.stoppageTotal || 0) - t.stoppageAtHalf) / 60000;
        if (clock >= last && clock - last <= 3) mins = clock;
      }
      g.mins = Math.round(mins);
      g.long = g.mins >= LONG_STOPPAGE_MIN;
      g.where = g.half === 2 && ht && g.base <= ht.min + 2 ? 'after half time' : g.half === 1 && g.base <= 2 ? 'from kick-off' : `from ${g.base}'`;
    });
    return list;
  }
  const longStoppages = sess => stoppages(sess).filter(g => g.long);

  // ---------------------------------------------------------------- flags
  function ftFlags(sid, s) {
    const chk = Scoring.checks(s);
    const keep = (s.ftCheck && s.ftCheck.keep) || {};
    const flags = [];
    const open = { longStoppage: 0, doubleTaps: 0, noMinute: 0 };
    // 1 · a long stoppage: a heads-up only (minutes are never changed). Minutes quoted per half (g.labels).
    longStoppages(s).filter(g => !keep[g.key]).forEach(g => {
      open.longStoppage++;
      const n = g.evs.length, first = `${g.base}+${g.labels[0]}'`, last = `${g.base}+${g.labels[n - 1]}'`;
      flags.push(`<div class="flag fx-flag fx-stop" data-stoppage="${esc(g.key)}"><div class="fx-ft-t">Stoppage ran about ${esc(g.mins)} min ${esc(g.where)}</div>` +
        `<div class="fx-ft-s">${n === 1 ? `1 event in stoppage (${esc(first)})` : `${n} events in stoppage (${esc(first)} to ${esc(last)})`}</div>` +
        `${UI.btn('OK', { kind: 'g', tap: 'stopkeep', data: { key: g.key }, cls: 'fx-ok' })}</div>`);
    });
    // 2 · double taps
    const taps = chk.doubleTaps.filter(x => !keep[x.b.id] && s.events && s.events[x.b.id] && s.events[x.a.id]);
    const seen = new Set();
    taps.forEach(x => {
      if (seen.has(x.b.id)) return; seen.add(x.b.id);
      open.doubleTaps++;
      const who = actor(x.b);
      const next = nextOf(s, { events: { [x.b.id]: null } });
      const pv = preview(sid, s, next, [who]).players.find(p => p.pid === who);
      const effect = pv ? `${pv.name} ${pv.from} → ${pv.to}` : `${pname(who)} no change`;
      flags.push(`<div class="flag fx-flag" data-flag="${esc(x.b.id)}"><div class="fx-ft-t">Possible double tap</div>` +
        `<div class="fx-ft-s">${esc(pname(who))} · ${esc(typeLabel(x.b.type))} twice, ${esc((x.gapMs / 1000).toFixed(1))} s apart</div>` +
        `<div class="grid2"><button type="button" class="btn w fx-two" data-tap="rm1" data-eid="${esc(x.b.id)}"><span data-label>Remove one</span><span class="n fx-eff">${esc(effect)}</span></button>` +
        `${UI.btn('Keep both', { kind: 'g', tap: 'keep', data: { eid: x.b.id }, cls: 'fx-two' })}</div></div>`);
    });
    // 3 · events with no minute
    const all = events(s);
    const noMin = chk.noMinute.filter(e => e.type !== 'halfTime');
    let line = '';
    if (all.length && noMin.length === all.length) line = 'No minutes logged';
    else if (noMin.length) {
      open.noMinute = noMin.length;
      flags.push(`<div class="flag info fx-flag"><div class="fx-ft-t">${esc(fmt.plural(noMin.length, 'event'))} with no minute</div>` +
        `${UI.rows(noMin.slice(0, 4).map(e => evRow(s, e)), { cls: 'fx-feed mt-3' })}</div>`);
    }
    if (!line) {
      const f = Scoring.formatOf(s);
      if (f.start === 'small') line = f.switchedAt != null ? `Big poles from ${f.switchedAt}'` : 'Small poles';
    }
    Object.keys(open).forEach(k => { if (!open[k]) delete open[k]; });
    return { flags, line, count: flags.length, open: Object.keys(open).length ? open : null };
  }

  // ---------------------------------------------------------------- the full-time card
  // The card people post: club · date, FULL TIME, the score in team colour, scorers with minutes under their own
  // side, top points. A broadcast graphic: always dark (data-theme="dark" scopes the dark tokens), lit (.lit).
  // tables.js owns the posted image (App.action 'share.fullTime'), and draws the preview into our <canvas> too
  // ({ sid, canvas, theme }), so the preview is the real card. If that action is missing, an HTML copy shows instead.
  const canDrawCard = () => !!(App.actions && App.actions['share.fullTime']);
  function drawCards(el, sid) {
    el.querySelectorAll('canvas[data-ftcanvas]').forEach(c => {
      try { App.action('share.fullTime', { sid, canvas: c, theme: App.theme.effective() }); } catch (e) { console.error(e); }
    });
  }
  function topPoints(s) {
    const all = Scoring.matchBreakdown(s).columns.flatMap(c => c.players);
    if (!all.length) return null;
    const max = Math.max(...all.map(p => p.total));
    const names = all.filter(p => p.total === max).map(p => p.name);
    return `${names.length > 2 ? `${names[0]} +${names.length - 1}` : names.join(', ')} · ${max} pts`;
  }
  function ftCard(s, o) {
    o = o || {};
    const teams = Scoring.orderTeams(Scoring.teamsOf(s)).map(team => ({ team, goals: Scoring.teamGoals(s, team) }));
    const two = teams.length === 2;
    const by = modeOf(s) === 'live' ? Scoring.scorers(s) : {};
    const club = (window.Teams && Teams.club().name) || 'BE Fit Club';
    const top = topPoints(s);
    const side = t => `<div class="fx-ftc-t ${tcls(t.team)}"><b class="fx-ftc-n">${esc(t.goals)}</b><span class="fx-ftc-w">${esc(fmt.team(t.team))}</span></div>`;
    const score = two ? side(teams[0]) + '<i class="fx-ftc-d" aria-hidden="true">–</i>' + side(teams[1]) : teams.map(side).join('');
    const col = (t, rt) => `<div class="${rt ? 'rt' : ''}">` + (by[t.team] || []).map(r =>
      `<div class="fx-ftc-r"><span class="fx-ftc-who">${esc(r.name)}${r.og ? ' (og)' : ''}</span> <span class="fx-ftc-m">${(r.mins || []).map(e => esc(fmt.minute(e))).filter(Boolean).join(' ')}</span></div>`).join('') + '</div>';
    const scorers = teams.some(t => (by[t.team] || []).length)
      ? `<div class="fx-ftc-s${two ? '' : ' multi'}" style="--n:${teams.length}">${teams.map((t, i) => col(t, two && i === 1)).join('')}</div>` : '';
    const glows = teams.slice(0, 2).map((t, i) => `<span class="fx-ftc-gl ${i ? 'r' : 'l'} ${tcls(t.team)}" aria-hidden="true"></span>`).join('');
    const label = `Full time, ${fmt.date(s.date)}: ` + teams.map(t => `${fmt.team(t.team)} ${t.goals}`).join(', ') + (top ? `. Top points ${top}` : '');
    if (canDrawCard() && !o.html) return `<div class="fx-ftcv lit${o.hero ? ' hero' : ''}${o.preview ? ' pv' : ''}" data-ftcard>` +
      `<canvas class="fx-ftcanvas" data-ftcanvas width="1080" height="1350" role="img" aria-label="${esc(label)}"></canvas></div>`;
    return `<div class="fx-ftc lit${o.hero ? ' hero' : ''}${o.preview ? ' pv' : ''}" data-theme="dark" data-ftcard role="img" aria-label="${esc(label)}">${glows}` +
      `<div class="fx-ftc-top"><span>${esc(club)}</span><span>${esc(fmt.date(s.date))}</span></div>` +
      `<div class="fx-ftc-k">Full time</div>` +
      `<div class="fx-ftc-sc${two ? '' : ' multi'}" style="--n:${teams.length}">${score}</div>` + scorers +
      (top ? `<div class="fx-ftc-f"><span>Top points</span><b>${esc(top)}</b></div>` : '') + `</div>`;
  }

  // ---------------------------------------------------------------- signal (the outbox)
  // "Publish · sends when signal returns": no signal, or saves still waiting on the phone with no connection,
  // or the database refusing the oldest save. The publish then waits in the outbox behind them.
  function waitingForSignal(info) {
    info = info || Store.status();
    return !!info.failed || info.status === 'offline' || (info.status !== 'online' && (info.pending || 0) > 0);
  }
  function pubState(info) {
    info = info || Store.status();
    if (!(info.pending || 0) && !info.failed) return 'done';
    return info.status === 'online' && !info.failed ? 'sending' : 'waiting';
  }

  function renderCheck(el, sid, s) {
    const f = ftFlags(sid, s);
    const waiting = waitingForSignal();
    el.innerHTML = scoreHero(s, { under: f.line ? esc(f.line) : '' }) +
      (f.count ? `<div class="lbl mt-6">Check before publishing <b class="n">${f.count}</b></div><div class="stack">${f.flags.join('')}</div>` : '') +
      `<div class="fx-links"><button type="button" class="link fx-link" data-tap="addm">+ Add a missed event</button>` +
      `<button type="button" class="link fx-link" data-tap="allev">All events <span class="n">${events(s).length}</span></button></div>` +
      `<div class="lbl mt-4">Full-time card</div>${ftCard(s, { preview: true })}` +
      `<div class="fx-pub">${UI.btn(waiting ? 'Publish · sends when signal returns' : 'Publish & share', { big: true, tap: 'publish', cls: waiting ? 'fx-waitbtn' : '', data: { waiting: waiting ? 1 : null } })}</div>`;
  }

  function renderPublished(el, sid, s) {
    const mb = Scoring.matchBreakdown(s);
    const info = Store.status(), state = pubState(info);
    const fixes = Object.values((s.ftCheck && s.ftCheck.fixes) || {}).sort((a, b) => (a.at || 0) - (b.at || 0));
    // table moves: the season with this match vs without it
    const without = Object.assign({}, Store.state, { sessions: Object.assign({}, Store.state.sessions, { [sid]: Object.assign({}, s, { status: 'active' }) }) });
    const before = {}; Scoring.seasonTable(without).forEach(r => { before[r.pid] = r.rank; });
    const inMatch = new Set(mb.columns.flatMap(c => c.players.map(p => p.pid)));
    const moves = Scoring.seasonTable(Store.state).filter(r => inMatch.has(r.pid) && before[r.pid] !== r.rank)
      .sort((a, b) => Math.abs(before[b.pid] - b.rank) - Math.abs(before[a.pid] - a.rank) || a.rank - b.rank).slice(0, 3);
    const head = state === 'done'
      ? { mark: '✓', cls: '', t: 'Published', sub: Auth.isAdmin() ? 'Results are live' : 'Reuben has been told' }
      : state === 'sending' ? { mark: '✓', cls: ' ring', t: 'Publishing…', sub: 'Sending to the club' }
        : { mark: '', cls: ' wait', t: 'Waiting for signal', sub: `Publishes by itself · ${info.pending || 0} waiting` };
    const cols = mb.columns.filter(c => c.players.length);
    el.innerHTML = `<div class="fx-pubhead" data-pubstate="${state}"><span class="fx-bigtick${head.cls}" aria-hidden="true">${head.mark}</span>` +
      `<div><div class="fx-pubt">${esc(head.t)}</div><div class="sub">${esc(head.sub)}</div></div></div>` +
      ftCard(s, { hero: true }) +
      `<div class="grid2 mt-4">${UI.btn('Share', { tap: 'share' })}${UI.btn('Save image', { kind: 'g', tap: 'saveimg' })}</div>` +
      (cols.length ? `<div class="lbl mt-6">Player points</div>` + UI.sum({ rows: cols.map(c => ({ html: `${UI.teamChip(c.team)} <span class="fx-np">${esc(fmt.plural(c.players.length, 'player'))}</span>`, value: String(c.points) })),
        total: mb.total, label: 'Player pts', signed: false }) : '') +
      (fixes.length ? `<div class="lbl mt-6">Fixed at full time</div>` + UI.rows(fixes.map(x => UI.row({ title: x.text, right: `<span class="n bk">${esc(fmt.signed(x.delta || 0))}</span>` }))) : '') +
      (moves.length ? `<div class="lbl mt-6">Table moves</div>` + UI.rows(moves.map(r => UI.row({ title: r.name, left: UI.avatar(r.name, r.team), right: `<span class="n fx-mv">${fmt.ordinal(before[r.pid])} → ${fmt.ordinal(r.rank)}</span>` }))) : '') +
      `<div class="grid2 mt-6">${UI.btn('Match summary', { kind: 'g', sm: true, tap: 'summary' })}${UI.btn('Edit match', { kind: 'g', sm: true, tap: 'edit' })}</div>`;
  }

  App.registerScreen('ref.ftcheck', {
    tab: 'match', layout: 'phone', console: true,
    // the title gives way while the sync chip is long ("On phone · 2 waiting"), so the two never overlap at 390 px
    header: () => { const i = Store.status(); return { center: i.pending || i.status !== 'online' ? '' : '<span class="hd-title">Full time</span>', right: UI.syncChip(i) }; },
    mount(el, ctx) {
      const sid = ctx.params.sid;
      // the page follows the outbox: "Publish · sends when signal returns" ↔ "Publish & share", Waiting → Published
      let last = '';
      const key = info => `${waitingForSignal(info)}|${pubState(info)}|${info.pending || 0}`;
      last = key(Store.status());
      ctx.onCleanup(Store.onStatus(info => { const k = key(info); if (k !== last) { last = k; ctx.rerender(); } }));
      UI.on(el, 'ev', b => App.action('fix.eventSheet', { sid, eid: b.dataset.eid }));
      UI.on(el, 'addm', () => App.action('fix.addMissed', { sid }));
      UI.on(el, 'allev', () => App.go('ref.events', { sid }));
      UI.on(el, 'summary', () => App.go('player.match', { sid }));
      UI.on(el, 'edit', () => App.go('ref.edit', { sid }));
      UI.on(el, 'share', () => App.action('share.fullTime', { sid }));
      UI.on(el, 'saveimg', () => App.action('share.fullTime', { sid, save: true }));
      UI.on(el, 'stopkeep', btn => {
        const s = Store.session(sid), k = btn.dataset.key;
        const ft = clone(s.ftCheck || {}); ft.keep = Object.assign({}, ft.keep || {}, { [k]: true });
        commit(sid, s, nextOf(s, { ftCheck: ft }), { label: 'OK · long stoppage noted', button: btn, group: btn.closest('.flag') });
      });
      UI.on(el, 'rm1', btn => {
        const s = Store.session(sid), eid = btn.dataset.eid, ev = s && s.events && s.events[eid];
        if (!ev) return;
        const who = actor(ev);
        const ch = { events: { [eid]: null } };
        const pv = preview(sid, s, nextOf(s, ch), [who]).players.find(p => p.pid === who);
        const ft = clone(s.ftCheck || {});
        ft.fixes = Object.assign({}, ft.fixes || {}, { [eid]: { text: `${pname(who)} · duplicate ${typeLower(ev.type)} removed`, pid: who, delta: pv ? pv.delta : 0, at: Store.now(), by: Auth.by() } });
        ch.ftCheck = ft;
        commit(sid, s, nextOf(s, ch), { label: `Removed · ${typeLabel(ev.type)}, ${pname(who)}`, button: btn, group: btn.closest('.flag') });
      });
      UI.on(el, 'keep', btn => {
        const s = Store.session(sid), eid = btn.dataset.eid;
        const ft = clone(s.ftCheck || {}); ft.keep = Object.assign({}, ft.keep || {}, { [eid]: true });
        commit(sid, s, nextOf(s, { ftCheck: ft }), { label: `Kept both · ${pname(actor((s.events || {})[eid]))}`, button: btn, group: btn.closest('.flag') });
      });
      // Publish: one atomic write. With no signal it waits in the phone's outbox behind the other saves and
      // goes by itself when signal returns (the page shows "Waiting for signal" until then).
      UI.on(el, 'publish', btn => {
        const s = Store.session(sid);
        if (!s) return;
        const now = Store.now(), by = Auth.by();
        const open = ftFlags(sid, s).open;
        const ft = Object.assign(clone(s.ftCheck || {}), { status: 'published', publishedAt: now, by });
        if (open) ft.flags = open; else delete ft.flags;
        const ch = { status: 'completed', ftCheck: ft, publishedBy: by };
        if (Clock.isActive(s)) ch.timer = Clock.end(s, now);
        const waiting = waitingForSignal();
        commit(sid, s, nextOf(s, ch), { label: `Published · ${fmt.date(s.date)}`, sub: waiting ? 'Sends when signal returns' : undefined,
          button: btn, group: el, onSaved: () => window.scrollTo({ top: 0 }) });
      });
    },
    render(el, ctx) {
      const sid = ctx.params.sid, s = Store.session(sid);
      if (!s) { el.innerHTML = UI.empty('Match not found', ''); return; }
      if (isFinished(s)) renderPublished(el, sid, s); else renderCheck(el, sid, s);
      drawCards(el, sid);
    },
  });

  App.registerAction('fix.eventSheet', openEventSheet);
  App.registerAction('fix.addMissed', openAddMissed);
  App.registerAction('fix.playerSheet', openPlayerSheet);

  // For tests and other screens: the pure helpers (no writes).
  window.Fix = { nextOf, writesFor, preview, tallyText, teamPoints, addedAfter, stoppages, longStoppages, waitingForSignal, ftCard };
})();
