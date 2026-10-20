/* ============================================================================
   BE Fit Club · js/screens/console.js · REFEREE CONSOLE (the deck)   OWNER: Round 5 · Console builder
   ----------------------------------------------------------------------------
   Styles in css/console.css, scoped under .scr-ref-console / .scr-ref-events / .sh-console-*.
   Used pitch-side, at night, one-handed, offline-capable. It must never double-log.

   SCREENS
     'ref.console'        tab match · layout phone · console. Nav hidden while the clock runs, is paused or in
                          stoppage (shell: App.isLiveMatch()). Header: "Referee ▾" · date · sync chip (no ⋯).
                          THE DECK, titled sections, top to bottom:
                            score block (UI.scoreFor, console size, running clock in the centre, the screen's
                              one hero) + one line ("Big poles · Green 9 · Red 9" / "Clock held at 46:00 · 2nd half")
                            GOALS & ASSISTS     one 96 px Goal tile per team (team tint + corner light, tonight's count)
                            DEFENCE / KEEPERS & DEFENCE   Block · Clear (small poles) or Save · Block · Clear (when
                                                keepers exist), 72 px, word + tonight's count, no icons
                            CARDS               Yellow · Red as real card shapes (76 px), count when > 0
                            MATCH CONTROLS      row 1: + Stoppage (primary 2/3) · Pause (quiet 1/3)
                                                  in stoppage: amber "End stoppage · +1:36"; after 4 min of the SAME
                                                  stoppage it pulses: "Still in stoppage? / End · +7:10" (no banner)
                                                  at half time: "Resume second half" (primary, full width)
                                                row 2: Half time · Adjust clock (hold 1.5 s) · Poles · + Player ·
                                                  Teams tonight · Edit events (3 × 2, 52 px)
                                                row 3: Hold to end the game (1.5 s, amber fill) → ref.ftcheck
                            LATEST              the last 3 events (minute · name · type · team chip, amber dot =
                                                still on the phone), "All n ›"
     'ref.events' {sid}   All events: filter chips + search; every row opens App.action('fix.eventSheet', { sid, eid }).
   ACTIONS
     'console.syncSheet'  ({})        tap on the sync chip: what is still waiting to send, in plain words
     'console.adjustClock'({ sid })   Adjust clock sheet: set the minute (− / +) or Reset to 0:00 → Clock.adjust.
                                      Events already logged keep their minutes (only the timer is written).
     'console.menu'       ({ sid })   RETIRED (no ⋯ menu). Kept so old callers do nothing harmful: it scrolls the
                                      deck to Match controls.

   LOGGING (every log goes through Save.run: lock on first tap → Saving… → Undo 5 s, or Not saved + Retry)
     Goal     Goal · Team → scorer tile → assist tile / "No assist" (saves)            3 taps
              own goal: Goal · Team → "Own goal by a Red player ›" → player → assist    4 taps
     Block / Clear   tile → player row or Recent chip (saves); "+1 again" on the bar     2 taps
     Card     Yellow (or Red) tile → (team tab) → player (saves); booked players marked 2–3 taps
     Save     Save → keeper (saves); Save | Penalty save first; only tonight's keepers   2–3 taps
     Small poles: a GK-position player plays as an outfielder (Scoring.effectivePos → MID): he is on Block / Clear.
   Double-tap guards: one sheet at a time; a sheet ignores taps for 350 ms after it opens or changes step;
     clock buttons take one change per 0.7 s; deck tiles that open a sheet ignore a second tap for 0.5 s.
   Event shapes (classic + additive `by`, `again`):
     goal        { type, team, scorerId, assistId?, min, [stoppageBaseMin, stoppageMin], timestamp, by }
     ownGoal     { type, team (scorer's side), benefitTeam, scorerId, assistId?, min…, timestamp, by }
     save | penaltySave | block | clearance | yellowCard | redCard  { type, playerId, min…, timestamp, by, again? }
     halfTime    { type, min…, timestamp, by }  (written with the paused timer in one atomic write)
   ========================================================================== */
(function () {
  'use strict';
  const esc = UI.esc;
  const fmtTeam = UI.fmt.team;
  const tcls = t => (window.Teams ? Teams.cls(t) : 't-' + String(t || '').replace(/[^A-Za-z0-9_-]/g, ''));

  // ---------------------------------------------------------------- constants
  const TYPE_LABEL = {
    goal: 'Goal', ownGoal: 'Own goal', save: 'Save', penaltySave: 'Penalty save', block: 'Block',
    clearance: 'Clearance', yellowCard: 'Yellow card', redCard: 'Red card', halfTime: 'Half time',
    bigPoles: 'Big poles', formatSwitch: 'Big poles', poles: 'Big poles',
  };
  const FEED_LABEL = Object.assign({}, TYPE_LABEL, { yellowCard: 'Yellow', redCard: 'Red card' });
  const BAR_LABEL = Object.assign({}, TYPE_LABEL, { yellowCard: 'Yellow' });   // "Yellow · Keith 64'"
  const FILTERS = [
    { value: 'goals', label: 'Goals', types: ['goal', 'ownGoal'] },
    { value: 'saves', label: 'Saves', types: ['save', 'penaltySave'] },
    { value: 'defence', label: 'Defence', types: ['block', 'clearance'] },
    { value: 'cards', label: 'Cards', types: ['yellowCard', 'redCard'] },
  ];
  const ATTACK_ORDER = { FWD: 0, MID: 1, DEF: 2, GK: 3 };   // goal sheet: scorers
  const DEFENCE_ORDER = { DEF: 0, MID: 1, FWD: 2, GK: 3 };  // block / clear / card: defenders first
  const ARM_MS = 350;        // a sheet ignores taps this long after it opens or changes step (double-tap guard)
  const CTL_MS = 700;        // clock buttons: one change per 0.7 s (a double tap on Pause never resumes)
  const OPEN_MS = 500;       // deck tiles that open a sheet: a second tap within 0.5 s does nothing
  const ESCALATE_MS = 4 * 60000;   // the same stoppage running this long → "Still in stoppage?"
  const HOLD_MS = 1500;      // Adjust clock and End game: 1.5 s hold with a fill

  // ---------------------------------------------------------------- data helpers
  const nameOf = pid => { const p = Store.player(pid); return p ? p.name : 'Unknown'; };
  const effPos = (sess, p) => (Scoring.effectivePos ? Scoring.effectivePos(sess, p) : p.pos) || 'MID';
  // players tonight with the position they PLAY as (small poles: a GK plays and scores as MID)
  const playersOf = sess => Scoring.sessPlayers(sess).map(p => Object.assign({}, p, { listed: p.pos, pos: effPos(sess, p) }));
  const teamsOf = sess => Scoring.orderTeams(Object.keys((sess && sess.teams) || {}));
  function teamOfPlayer(sess, pid) {
    for (const [team, td] of Object.entries((sess && sess.teams) || {})) if (td && td.players && td.players[pid]) return team;
    return null;
  }
  const byOrder = order => (a, b) => ((order[a.pos] ?? 9) - (order[b.pos] ?? 9)) || String(a.name).localeCompare(String(b.name));
  const minuteNow = sess => Scoring.minuteText(Clock.minuteParts(sess) || {});
  const ts = ev => Number(ev.timestamp) || 0;
  const eventsNewest = sess => Scoring.sessEvents(sess).sort((a, b) => ts(b) - ts(a));
  const matchesQ = (name, q) => !q || String(name || '').toLowerCase().includes(q);
  const countOf = (sess, types) => Scoring.sessEvents(sess).filter(e => types.includes(e.type)).length;

  // Tonight's keepers: the chosen big-poles keepers (format.keepers); with none recorded on big poles
  // (old matches) every player who still plays as GK. Small poles, never switched: nobody.
  function keepersOf(sess) {
    const f = Scoring.formatOf(sess);
    if (!f.everBig) return [];
    const on = playersOf(sess);
    const chosen = Object.entries(f.keepers || {}).map(([team, pid]) => on.find(p => p.pid === pid && p.team === team)).filter(Boolean);
    const list = chosen.length ? chosen : on.filter(p => p.pos === 'GK');
    const order = teamsOf(sess);
    return list.sort((a, b) => order.indexOf(a.team) - order.indexOf(b.team) || a.name.localeCompare(b.name));
  }
  const keeperNames = sess => keepersOf(sess).map(k => k.name);

  // Saves still on this phone (not yet confirmed by the database): the outbox paths.
  function waitingPaths() {
    const set = new Set();
    try { (Store.outbox() || []).forEach(x => (x.paths || []).forEach(p => set.add(p))); } catch (e) { /* no outbox */ }
    return set;
  }

  // the team a feed row shows: always the side of the player it is about
  function evTeam(sess, ev) {
    if (ev.type === 'goal' || ev.type === 'ownGoal') return ev.team;
    if (ev.playerId) return teamOfPlayer(sess, ev.playerId);
    return null;
  }
  function evWho(ev) {
    if (ev.type === 'goal' || ev.type === 'ownGoal') return ev.scorerId;
    return ev.playerId || null;
  }
  function kindHtml(ev, sess) {
    const label = FEED_LABEL[ev.type] || String(ev.type || 'Event');
    if (ev.type === 'yellowCard' || ev.type === 'redCard') return `${UI.cardGlyph(ev.type === 'redCard' ? 'red' : 'yellow')} ${esc(label)}`;
    if (ev.type === 'goal' && ev.assistId) return `${esc(label)} · assist ${esc(nameOf(ev.assistId))}`;
    if (ev.type === 'ownGoal' && ev.benefitTeam) return `${esc(label)} · for ${esc(fmtTeam(ev.benefitTeam))}`;
    if (TYPE_LABEL[ev.type] === 'Big poles') { const k = keeperNames(sess); return k.length ? `keepers ${esc(k.join(', '))}` : ''; }
    return esc(label);
  }

  // one feed / list row; tappable when the event is real (opens the fix builder's Event sheet)
  function eventRow(ev, sess, o) {
    o = o || {};
    const who = evWho(ev);
    const team = evTeam(sess, ev);
    const isPoles = TYPE_LABEL[ev.type] === 'Big poles';
    const title = who ? `<span class="nm">${esc(nameOf(who))}</span> <span class="kind">${kindHtml(ev, sess)}</span>`
      : isPoles ? `<span class="nm">Big poles</span> <span class="kind">${kindHtml(ev, sess)}</span>`
      : `<span class="kind">${kindHtml(ev, sess)}</span>`;
    const tag = ev.id && !ev.synthetic ? 'button' : 'div';
    const tapA = tag === 'button' ? ` type="button" data-tap="ev" data-eid="${esc(ev.id)}"` : '';
    const waiting = o.waiting && ev.id && o.waiting.has(`sessions/${o.sid}/events/${ev.id}`);
    return `<${tag} class="r cn-evr${waiting ? ' is-waiting' : ''}"${tapA}><span class="min">${esc(Scoring.minuteText(ev))}</span>` +
      `<span class="grow">${title}</span>` +
      `<span class="end">${waiting ? '<span class="cn-wait" role="img" aria-label="Waiting to send"></span>' : ''}${team ? UI.teamChip(team) : ''}` +
      `${o.chevron && tag === 'button' ? '<span class="chev">›</span>' : ''}</span></${tag}>`;
  }

  // Big-poles switch: shown in All events even when setup stores it only on `format`.
  function polesPseudo(sess) {
    const f = Scoring.formatOf(sess);
    if (f.start !== 'small' || f.switchedAt == null) return null;
    if (Scoring.sessEvents(sess).some(e => TYPE_LABEL[e.type] === 'Big poles')) return null;
    return { id: 'poles', synthetic: true, type: 'bigPoles', min: f.switchedAt, timestamp: 0 };
  }

  // ---------------------------------------------------------------- the one log path
  // Key first, then stamp the minute, timestamp and who logged it. Save.run does lock / Undo / Retry.
  function logEvent(o) {
    const sess = Store.session(o.sid);
    if (!sess) return null;
    const eid = Store.newKey();
    const path = `sessions/${o.sid}/events/${eid}`;
    const now = Store.now();
    const ev = Object.assign({}, o.data);
    Clock.stamp(ev, sess, now);
    ev.timestamp = now;
    ev.by = Auth.by();
    const min = Scoring.minuteText(ev);
    const repeatable = o.again && (ev.type === 'block' || ev.type === 'clearance');
    // "+1 again" bars carry two buttons, so (as designed) they drop the minute: "Block · Joshua"
    const label = `${BAR_LABEL[ev.type] || ev.type} · ${nameOf(ev.scorerId || ev.playerId)}${min && !repeatable ? ' ' + min : ''}`;
    const offline = Store.status().status === 'offline';
    return Save.run({
      label, button: o.button || null, group: o.group || null, savingText: o.savingText || 'Saving…',
      timeoutMs: offline ? 2500 : 8000,
      write: () => Store.set(path, ev),
      undo: () => Store.remove(path),
      again: repeatable ? { label: '+1 again', run: () => logEvent({ sid: o.sid, data: Object.assign({}, o.data, { again: true }), again: true }) } : null,
      onSaved: o.onSaved || null,
    });
  }

  // ---------------------------------------------------------------- sheets: open + double-tap guard
  function openSheet(opts) {
    if (UI.sheet.top()) return null;                 // one sheet at a time: a double tap never opens two
    const h = UI.sheet.open(Object.assign({ theme: document.documentElement.dataset.theme }, opts));
    h.armedAt = Date.now() + ARM_MS;
    h.ready = () => Date.now() >= h.armedAt;
    h.rearm = () => { h.armedAt = Date.now() + ARM_MS; };
    h.setSub = t => { const x = h.el.querySelector('.sh-s'); if (x) x.textContent = t; };
    // the second tap of a double tap must not land on the dim and close the sheet straight away
    const dim = h.el.previousElementSibling;
    if (dim && dim.classList.contains('dim')) dim.addEventListener('click', e => { if (!h.ready()) e.stopImmediatePropagation(); }, true);
    return h;
  }
  // a sheet tap handler that respects the arm time and any save already running in it
  function onPick(h, name, fn) {
    UI.on(h.el, name, (el, e) => {
      if (!h.ready()) return;
      if (h.save && (h.save.state === 'saving' || h.save.state === 'saved')) return;
      fn(el, e);
    });
  }
  function guardLog(sid) {
    const s = Store.session(sid);
    if (!s) return false;
    const st = Clock.status(s);
    if (Clock.canLog(s)) return true;
    UI.toast(st === 'idle' ? 'Kick off first' : st === 'ended' ? 'Full time: use the full-time check' : 'Resume the clock to log', { err: true });
    return false;
  }

  // ---------------------------------------------------------------- Goal sheet (team-first, 3 taps)
  function openGoal(sid, team) {
    if (!guardLog(sid)) return;
    const sess = Store.session(sid);
    const st = { og: false, ogTeam: null, scorer: null };
    const h = openSheet({ title: 'Goal · ' + fmtTeam(team), sub: 'Who scored?', titleEnd: `<span class="n">${esc(minuteNow(sess))}</span>`,
      cls: 'sh-console sh-console-goal', body: '' });
    if (!h) return;
    // the team-tinted title bar (the one place a sheet may carry light)
    const head = h.el.querySelector('.sheet-h');
    if (head) head.classList.add('lit', 'cn-gbar', tcls(team));

    const sideOf = t => playersOf(Store.session(sid)).filter(p => p.team === t);
    const tile = (p, tap) => UI.tile({ name: p.name, pos: p.pos, tap, data: { pid: p.pid } });

    function draw() {
      const s = Store.session(sid);
      if (!st.scorer) {
        const scoringTeam = st.og ? st.ogTeam : team;
        const list = sideOf(scoringTeam).sort(byOrder(ATTACK_ORDER));
        const others = teamsOf(s).filter(t => t !== team);
        h.setSub(st.og ? 'Who put it in his own net?' : 'Who scored?');
        h.setBody(
          `<div class="lbl cn-steplbl">${st.og ? `Own goal by a ${esc(fmtTeam(st.ogTeam))} player` : 'Scorer'}</div>` +
          (list.length ? UI.tiles(list.map(p => tile(p, 'scorer'))) : UI.empty(`No ${fmtTeam(scoringTeam)} players`, '')) +
          `<div class="cn-links">` + (st.og
            ? `<button type="button" class="link cn-link" data-tap="normal">‹ ${esc(fmtTeam(team))} scorer</button>`
            : others.map(t => `<button type="button" class="link cn-link" data-tap="og" data-team="${esc(t)}">Own goal by a ${esc(fmtTeam(t))} player ›</button>`).join('')) +
          `</div>`);
        return;
      }
      const mates = (st.og ? sideOf(team) : sideOf(team).filter(p => p.pid !== st.scorer)).sort(byOrder(ATTACK_ORDER));
      h.setSub('Who assisted?');
      h.setBody(
        `<div class="rows cn-scorer"><div class="r"><span class="grow"><span class="meta">${st.og ? 'Own goal' : 'Scorer'}</span>` +
        `<span class="nm">${esc(nameOf(st.scorer))}</span></span>` +
        `<button type="button" class="cn-change" data-tap="change">Change</button></div></div>` +
        `<div class="lbl">Assist</div>` +
        `<button type="button" class="ptile c cn-noassist" data-tap="assist" data-pid=""><span class="pt-name" data-label>No assist</span></button>` +
        (mates.length ? UI.tiles(mates.map(p => tile(p, 'assist'))) : ''));
    }

    onPick(h, 'scorer', el => { st.scorer = el.dataset.pid; draw(); h.rearm(); });
    onPick(h, 'og', el => { st.og = true; st.ogTeam = el.dataset.team; st.scorer = null; draw(); h.rearm(); });
    onPick(h, 'normal', () => { st.og = false; st.ogTeam = null; st.scorer = null; draw(); h.rearm(); });
    onPick(h, 'change', () => { st.scorer = null; draw(); h.rearm(); });
    onPick(h, 'assist', el => {
      const assistId = el.dataset.pid || null;
      const data = st.og
        ? { type: 'ownGoal', team: st.ogTeam, benefitTeam: team, scorerId: st.scorer }
        : { type: 'goal', team, scorerId: st.scorer };
      if (assistId) data.assistId = assistId;
      h.save = logEvent({ sid, data, button: el, group: h.el, onSaved: () => h.close() });
    });
    draw();
  }

  // ---------------------------------------------------------------- Block / Clear / Card (one tap = save)
  function lastSide(sess, types) {
    const ev = eventsNewest(sess).find(e => types.includes(e.type) && evTeam(sess, e));
    return ev ? evTeam(sess, ev) : null;
  }
  // "Booked 71'" / "Sent off 80'": the Card sheet marks anyone carded tonight (second-yellow risk)
  function bookedOf(sess) {
    const out = {};
    Scoring.sessEvents(sess).sort((a, b) => ts(a) - ts(b)).forEach(e => {
      if ((e.type !== 'yellowCard' && e.type !== 'redCard') || !e.playerId) return;
      const r = out[e.playerId] || (out[e.playerId] = { y: [], r: [] });
      (e.type === 'redCard' ? r.r : r.y).push(Scoring.minuteText(e));
    });
    return out;
  }
  const cardShape = kind => `<span class="cn-cs ${kind === 'red' ? 'cn-cs-red' : 'cn-cs-yel'}" aria-hidden="true"></span>`;

  function openAction(sid, kind, ctype) {
    if (!guardLog(sid)) return;
    const sess = Store.session(sid);
    const isCard = kind === 'card';
    const famTypes = isCard ? ['yellowCard', 'redCard'] : ['block', 'clearance'];
    const teams = teamsOf(sess);
    const st = {
      team: lastSide(sess, famTypes) || lastSide(sess, Object.keys(TYPE_LABEL)) || teams[0],
      q: '', ctype: ctype === 'redCard' ? 'redCard' : 'yellowCard',
    };
    if (!teams.includes(st.team)) st.team = teams[0];
    const title = isCard ? 'Card' : TYPE_LABEL[kind];
    const h = openSheet({ title, titleEnd: `<span class="n">${esc(minuteNow(sess))}</span>`, cls: 'sh-console sh-console-act' + (isCard ? ' sh-console-card' : ''),
      body: '', cancel: 'Cancel', autofocus: false });
    if (!h) return;

    // Block / Clear: everyone who plays outfield tonight (a GK on small poles plays as MID, so he is here too)
    const eligible = s => playersOf(s).filter(p => isCard || p.pos !== 'GK');
    function recent(s) {
      if (isCard) return [];
      const seen = new Set(), out = [];
      const ok = new Set(eligible(s).map(p => p.pid));
      for (const e of eventsNewest(s)) {
        if (!famTypes.includes(e.type) || !e.playerId || seen.has(e.playerId) || !ok.has(e.playerId)) continue;
        seen.add(e.playerId); out.push(e.playerId);
        if (out.length === 3) break;
      }
      return out;
    }
    function marker(b) {
      if (!b) return '';
      if (b.r.length) return `<span class="cn-booked">${cardShape('red')}Sent off ${esc(b.r[0])}</span>`;
      return b.y.length ? `<span class="cn-booked">${cardShape('yellow')}Booked ${esc(b.y.join(' '))}</span>` : '';
    }
    const prow = (p, withTeam, booked) =>
      `<button type="button" class="r cn-prow" data-tap="pick" data-pid="${esc(p.pid)}" data-name="${esc(p.name)}">` +
      `<span class="grow"><span class="nm" data-label>${esc(p.name)}</span><span class="tally">${esc(p.pos || '')}</span></span>` +
      `<span class="end">${isCard ? marker(booked[p.pid]) : ''}${withTeam ? UI.teamChip(p.team) : ''}</span></button>`;

    function listHtml() {
      const s = Store.session(sid);
      const q = st.q.trim().toLowerCase();
      const all = eligible(s);
      const booked = isCard ? bookedOf(s) : {};
      const list = (q ? all.filter(p => matchesQ(p.name, q)) : all.filter(p => p.team === st.team)).sort(byOrder(DEFENCE_ORDER));
      return list.length ? `<div class="rows">${list.map(p => prow(p, !!q, booked)).join('')}</div>` : UI.empty(q ? 'No one by that name' : 'No players', '');
    }
    function draw() {
      const s = Store.session(sid);
      const counts = teamsOf(s).map(t => ({ team: t, count: eligible(s).filter(p => p.team === t).length }));
      const rec = recent(s);
      h.setBody(
        (isCard ? `<div class="seg cn-cardseg" role="tablist" data-seg="ctype">` +
          `<button type="button" role="tab" class="cn-ct-y${st.ctype === 'yellowCard' ? ' on' : ''}" data-value="yellowCard">${cardShape('yellow')}<span>Yellow</span></button>` +
          `<button type="button" role="tab" class="cn-ct-r${st.ctype === 'redCard' ? ' on' : ''}" data-value="redCard">${cardShape('red')}<span>Red</span></button></div>` : '') +
        `<div class="cn-search">${UI.search({ name: 'who', placeholder: 'Find a player', value: st.q })}</div>` +
        (rec.length ? `<div class="lbl cn-reclbl">Recent tonight</div><div class="chips cn-recent">` +
          rec.map(pid => `<button type="button" class="chip ref" data-tap="pick" data-pid="${esc(pid)}" data-name="${esc(nameOf(pid))}">${esc(nameOf(pid))}</button>`).join('') + `</div>` : '') +
        `<div class="cn-teams">${UI.teamSwitch('team', counts, st.team)}</div>` +
        `<div class="cn-list" data-list>${listHtml()}</div>`);
    }
    const redrawList = () => { const box = h.body.querySelector('[data-list]'); if (box) box.innerHTML = listHtml(); };

    UI.onSeg(h.el, 'team', v => { st.team = v; st.q = ''; const i = h.body.querySelector('[data-search]'); if (i) i.value = ''; redrawList(); });
    UI.onSeg(h.el, 'ctype', v => { st.ctype = v; });
    h.el.addEventListener('input', e => { if (e.target.matches('[data-search]')) { st.q = e.target.value; redrawList(); } });
    onPick(h, 'pick', el => {
      const type = isCard ? st.ctype : kind;
      h.save = logEvent({ sid, data: { type, playerId: el.dataset.pid }, button: el, group: h.el, again: !isCard,
        savingText: el.classList.contains('chip') ? 'Saving…' : 'Saving… ' + (el.dataset.name || ''),
        onSaved: () => h.close() });
    });
    draw();
  }

  // ---------------------------------------------------------------- Save sheet (tonight's keepers only)
  function openSave(sid) {
    if (!guardLog(sid)) return;
    const sess = Store.session(sid);
    const st = { stype: 'save' };
    const h = openSheet({ title: 'Save', titleEnd: `<span class="n">${esc(minuteNow(sess))}</span>`, cls: 'sh-console sh-console-save', body: '', cancel: 'Cancel' });
    if (!h) return;
    const keepers = keepersOf(sess);
    if (!keepers.length) {
      h.setBody(UI.empty('No keepers chosen', 'Pick tonight’s keepers first.') + UI.btn('Choose keepers', { kind: 'g', sm: true, tap: 'poles' }));
      UI.on(h.el, 'poles', () => { h.close(); App.action('setup.bigPoles', { sid }); });
      return;
    }
    h.setBody(UI.seg('stype', [{ value: 'save', label: 'Save' }, { value: 'penaltySave', label: 'Penalty save' }], st.stype) +
      `<div class="cn-keepers" style="--cols:${Math.min(keepers.length, 3)}">` + keepers.map(k =>
        `<button type="button" class="ptile cn-ktile ${tcls(k.team)}" data-tap="keeper" data-pid="${esc(k.pid)}">` +
        `<span class="pt-name" data-label>${esc(k.name)}</span><span class="cn-kmeta">${esc(fmtTeam(k.team))} · in goal</span></button>`).join('') +
      `</div>`);
    UI.onSeg(h.el, 'stype', v => { st.stype = v; });
    onPick(h, 'keeper', el => {
      h.save = logEvent({ sid, data: { type: st.stype, playerId: el.dataset.pid }, button: el, group: h.el, onSaved: () => h.close() });
    });
  }

  // ---------------------------------------------------------------- clock controls
  let ctlBusyUntil = 0;
  function clockAction(sid, act, button) {
    if (Date.now() < ctlBusyUntil) return;
    const sess = Store.session(sid);
    if (!sess) return;
    const now = Store.now(), status = Clock.status(sess);
    const ok = { kick: status === 'idle', pause: status === 'running', resume: status === 'paused',
      stoppage: status === 'running', endStoppage: status === 'stoppage' }[act];
    if (!ok) return;
    ctlBusyUntil = Date.now() + CTL_MS;
    setTimeout(() => document.querySelectorAll('.scr-ref-console .cn-ctl .is-locked').forEach(b => b.classList.remove('is-locked')), CTL_MS + 20);
    const timer = act === 'kick' ? Clock.kickOff(now) : act === 'pause' ? Clock.pause(sess, now) : act === 'resume' ? Clock.resume(sess, now)
      : act === 'stoppage' ? Clock.startStoppage(sess, now) : Clock.endStoppage(sess, now);
    const label = { kick: 'Kick off', pause: 'Pause', resume: 'Resume', stoppage: 'Stoppage', endStoppage: 'End stoppage' }[act];
    Save.run({ label, button, bar: false, write: () => Store.set(`sessions/${sid}/timer`, timer) });
  }

  // Half time: the event and the paused timer in one atomic write (Undo puts both back).
  function halfTime(sid, button) {
    const s = Store.session(sid);
    if (!s || !Clock.canLog(s) || (s.timer && s.timer.htLogged)) return null;
    if (Date.now() < ctlBusyUntil) return null;
    ctlBusyUntil = Date.now() + CTL_MS;
    const now = Store.now();
    const eid = Store.newKey();
    const ev = Clock.stamp({ type: 'halfTime' }, s, now);
    ev.timestamp = now; ev.by = Auth.by();
    const prev = s.timer;
    const base = `sessions/${sid}`;
    return Save.run({
      label: `Half time ${Scoring.minuteText(ev)}`.trim(), button,
      write: () => Store.multi({ [`${base}/timer`]: Clock.halfTime(s, now), [`${base}/events/${eid}`]: ev }),
      undo: () => Store.multi({ [`${base}/timer`]: prev, [`${base}/events/${eid}`]: null }),
    });
  }

  // End game: stop the clock (Clock.end keeps the final minute) and open the full-time check.
  // status stays 'active' (not 'completed'): ref.ftcheck treats "timer ended + not completed" as being checked,
  // and its Publish sets status 'completed', goals, cleanSheets and ftCheck.
  function endGame(sid) {
    const sess = Store.session(sid);
    if (!sess) return;
    const now = Store.now();
    const timer = Clock.isActive(sess) ? Clock.end(sess, now)
      : Object.assign({}, sess.timer || {}, { status: 'ended', endedAt: (sess.timer && sess.timer.endedAt) || now });   // never kicked off
    Store.set(`sessions/${sid}/timer`, timer).catch(() => UI.toast('Not saved · no signal', { err: true }));
    UI.sheet.closeAll();
    App.go('ref.ftcheck', { sid });
  }

  // ---------------------------------------------------------------- console screen
  const halfOf = sess => (sess.timer && sess.timer.htLogged ? '2nd half' : '1st half');
  const escalated = sess => Clock.status(sess) === 'stoppage' && Clock.stoppageNowMs(sess) >= ESCALATE_MS;
  const stopText = sess => '+' + Clock.fmtClock(Clock.halfStoppageMs(sess));

  // The one line under the score: what the referee needs to know about the night.
  function lineText(sess) {
    const st = Clock.status(sess);
    if (st === 'stoppage') return `Clock held at ${Clock.fmtClock(Clock.elapsedMs(sess) || 0)} · ${halfOf(sess)}`;
    const f = Scoring.formatOf(sess);
    const on = playersOf(sess);
    const counts = teamsOf(sess).map(t => `${fmtTeam(t)} ${on.filter(p => p.team === t).length}`).join(' · ');
    const poles = f.legacy ? '' : f.start === 'small' && f.switchedAt == null ? 'Small poles' : f.start === 'small' ? `Big poles from ${f.switchedAt}'` : 'Big poles';
    return [poles, counts].filter(Boolean).join(' · ');
  }
  function totalText(sess) {
    const ms = Clock.stoppageMs(sess);
    return ms > 0 ? `Total tonight +${Clock.fmtClock(ms)}` : '';
  }

  function primaryHtml(sess) {
    const st = Clock.status(sess);
    const busy = Date.now() < ctlBusyUntil ? ' is-locked' : '';
    const t = sess.timer || {};
    if (st === 'idle') return `<div class="cn-row1 one">${UI.btn('Kick off', { kind: 'w', tap: 'ctl', data: { act: 'kick' }, cls: 'cn-prim' + busy })}</div>`;
    if (st === 'ended') return `<div class="cn-row1 one">${UI.btn('Full-time check', { kind: 'w', tap: 'ftcheck', cls: 'cn-prim' })}</div>`;
    if (st === 'paused' && t.pauseReason === 'halftime')
      return `<div class="cn-row1 one">${UI.btn('Resume second half', { kind: 'w', tap: 'ctl', data: { act: 'resume' }, cls: 'cn-prim' + busy })}</div>`;
    if (st === 'paused')
      return `<div class="cn-row1 one">${UI.btn('Resume', { kind: 'w', tap: 'ctl', data: { act: 'resume' }, cls: 'cn-prim' + busy })}</div>`;
    const pause = UI.btn('Pause', { kind: 'g', tap: 'ctl', data: { act: 'pause' }, cls: 'cn-pause' + busy, attrs: st === 'stoppage' ? ' disabled' : '' });
    if (st === 'stoppage') {
      const esc2 = escalated(sess);
      const inner = esc2 ? `<span class="cn-sq">Still in stoppage?</span><span class="cn-sv">End · <span class="n" data-stop>${stopText(sess)}</span></span>`
        : `<span class="cn-sv">End stoppage · <span class="n" data-stop>${stopText(sess)}</span></span>`;
      return `<div class="cn-row1">${UI.btn('', { kind: 'w', tap: 'ctl', data: { act: 'endStoppage' }, cls: 'cn-prim cn-stop' + (esc2 ? ' is-esc lit' : '') + busy, html: inner })}${pause}</div>`;
    }
    return `<div class="cn-row1">${UI.btn('+ Stoppage', { kind: 'w', tap: 'ctl', data: { act: 'stoppage' }, cls: 'cn-prim' + busy })}${pause}</div>`;
  }

  function ctlTile(label, tap, o) {
    o = o || {};
    return `<button type="button" class="cn-ctile${o.cls ? ' ' + o.cls : ''}" data-tap="${tap}"${o.attrs || ''}>${o.html || esc(label)}</button>`;
  }
  function controlsHtml(sess) {
    const st = Clock.status(sess);
    if (st === 'ended') return primaryHtml(sess);
    const t = sess.timer || {};
    const f = Scoring.formatOf(sess);
    const active = Clock.isActive(sess);
    const ht = t.htLogged
      ? ctlTile('', 'halftime', { cls: 'is-done', html: 'Half time <span aria-hidden="true">✓</span>', attrs: ' aria-disabled="true"' })
      : ctlTile('Half time', 'halftime', { cls: Clock.canLog(sess) ? '' : 'is-off' });
    const adjust = `<button type="button" class="hold cn-ctile cn-adjust${active ? '' : ' is-off'}" data-hold="adjust" data-ms="${HOLD_MS}" style="--hold-ms:${HOLD_MS}ms" data-done-text="Adjust clock">` +
      `<span class="fill"></span><span class="hl">Adjust clock</span></button>`;
    const poles = f.everBig ? ctlTile('Poles: big', 'poles', { cls: 'is-quiet' }) : ctlTile('Big poles', 'poles');
    return primaryHtml(sess) +
      `<div class="cn-grid">${ht}${adjust}${poles}${ctlTile('+ Player', 'player')}${ctlTile('Teams tonight', 'teams')}${ctlTile('Edit events', 'events')}</div>` +
      `<div class="cn-endw">${UI.hold('Hold to end the game', { name: 'end', ms: HOLD_MS, warn: true, doneText: 'Ending…' })}</div>`;
  }

  function renderConsole(el) {
    const sid = Store.activeSessionId();
    const sess = sid && Store.session(sid);
    if (!sess) {
      el.innerHTML = UI.empty('No game on', '') + UI.btn('Back to Match', { kind: 'g', sm: true, tap: 'home' });
      el._sig = '';
      return;
    }
    const teams = teamsOf(sess);
    const st = Clock.status(sess);
    const live = Clock.canLog(sess);
    const ended = st === 'ended';
    const off = live ? '' : ' cn-off';
    const evs = eventsNewest(sess);
    const waiting = waitingPaths();
    const keepers = keepersOf(sess);
    const f = Scoring.formatOf(sess);
    const goalCols = Math.min(Math.max(teams.length, 2), 3);
    const def = (keepers.length ? ['save'] : []).concat(['block', 'clearance']);
    const defCount = { save: ['save', 'penaltySave'], block: ['block'], clearance: ['clearance'] };
    const defLabel = { save: 'Save', block: 'Block', clearance: 'Clear' };
    const total = totalText(sess);
    const yc = countOf(sess, ['yellowCard']), rc = countOf(sess, ['redCard']);
    const sec = (label, right, body, cls) =>
      `<section class="cn-sec${cls ? ' ' + cls : ''}"><div class="lbl"><span>${esc(label)}</span>${right || ''}</div>${body}</section>`;

    let html = `<div class="cn-score">${UI.scoreFor(sess, { size: 'console', clock: true, hero: true })}` +
      `<div class="cn-line${st === 'stoppage' ? ' is-stop' : ''}" data-line>${esc(lineText(sess))}</div></div>`;
    if (!ended) {
      html +=
        sec('Goals & assists', '', `<div class="cn-goals" style="--cols:${goalCols}">` + teams.map(t => {
          const n = Scoring.teamGoals(sess, t);
          return `<button type="button" class="cn-goal lit ${tcls(t)}${off}" data-tap="goal" data-team="${esc(t)}" aria-label="Goal ${esc(fmtTeam(t))}">` +
            `<span class="cn-gc">${esc(n)}</span><b>Goal</b><small>${esc(fmtTeam(t))}</small></button>`;
        }).join('') + `</div>`, 'cn-sec-goals') +
        sec(keepers.length || f.everBig ? 'Keepers & defence' : 'Defence',
          keepers.length ? `<b class="cn-inGoal">${esc(keepers.map(k => k.name).join(' · '))} in goal</b>` : '',
          `<div class="cn-def" style="--cols:${def.length}">` + def.map(k =>
            `<button type="button" class="tile cn-act${off}" data-tap="act" data-kind="${k}"><b>${defLabel[k]}</b><span class="cn-ct">${countOf(sess, defCount[k])}</span></button>`).join('') + `</div>`) +
        sec('Cards', '', `<div class="cn-cards">` +
          `<button type="button" class="tile cn-card${off}" data-tap="act" data-kind="card" data-ctype="yellowCard">${cardShape('yellow')}<b>Yellow${yc ? ` <span class="n">· ${yc}</span>` : ''}</b></button>` +
          `<button type="button" class="tile cn-card${off}" data-tap="act" data-kind="card" data-ctype="redCard">${cardShape('red')}<b>Red${rc ? ` <span class="n">· ${rc}</span>` : ''}</b></button></div>`);
    }
    html += sec('Match controls', `<b class="cn-total" data-total>${esc(total)}</b>`, `<div class="cn-ctl">${controlsHtml(sess)}</div>`, 'cn-sec-ctl');
    html += sec('Latest', `<button type="button" class="cn-all" data-tap="all">All${evs.length ? ' ' + evs.length : ''} ›</button>`,
      `<div class="rows cn-feed">${evs.length ? evs.slice(0, 3).map(e => eventRow(e, sess, { waiting, sid })).join('') : '<div class="r cn-none"><span class="grow kind">Nothing logged yet</span></div>'}</div>`,
      'cn-sec-latest');
    el.innerHTML = html;
    el._sig = sigOf(sess);
  }
  const sigOf = sess => sess ? `${Clock.status(sess)}|${escalated(sess) ? 1 : 0}` : '';

  // every second: the clock, stoppage and totals; a full redraw only when the state itself changed
  function tickConsole(el) {
    const sess = Store.activeSession();
    if (!sess) return;
    if (sigOf(sess) !== el._sig) { if (!holding(el)) renderConsole(el); return; }
    const c = UI.scoreCentre(sess, { clock: true });
    const mid = el.querySelector('.cn-score .sb-mid');
    if (mid) {
      const b = mid.querySelector('b'), sm = mid.querySelector('small');
      if (b) b.textContent = c.top || '';
      if (sm) sm.textContent = c.sub || '';
      mid.className = 'sb-mid' + (c.state ? ' is-' + c.state : '');
    }
    const line = el.querySelector('[data-line]'); if (line) line.textContent = lineText(sess);
    const tot = el.querySelector('[data-total]'); if (tot) tot.textContent = totalText(sess);
    el.querySelectorAll('[data-stop]').forEach(x => { x.textContent = stopText(sess); });
    if (Date.now() >= ctlBusyUntil) el.querySelectorAll('.cn-ctl .is-locked').forEach(b => b.classList.remove('is-locked'));
  }
  const holding = el => !!el.querySelector('.hold.holding');

  // header date: 'Mon 19 Oct', or '19 Oct' while the wider 'On phone · 3 waiting' chip needs the room
  function headDate() {
    const s = Store.activeSession();
    const d = s && s.date ? s.date : UI.fmt.iso(Store.now());
    return (Store.status().pending || 0) > 0 ? UI.fmt.short(d) : UI.fmt.date(d);
  }

  // deck taps that open a sheet or another screen: one at a time, and never twice in 0.5 s
  let openBusyUntil = 0;
  const once = fn => (...a) => {
    if (UI.sheet.top() || Date.now() < openBusyUntil) return;
    openBusyUntil = Date.now() + OPEN_MS;
    fn(...a);
  };

  App.registerScreen('ref.console', {
    tab: 'match', layout: 'phone', console: true, title: 'Match',
    header: () => ({ center: `<span class="hd-title">${esc(headDate())}</span>`, right: UI.syncChip(Store.status()) }),
    mount(el, ctx) {
      const sid = () => Store.activeSessionId();
      UI.on(el, 'home', () => App.go('ref.setup', {}, { replace: true }));
      UI.on(el, 'all', once(() => App.go('ref.events', { sid: sid() })));
      UI.on(el, 'events', once(() => App.go('ref.events', { sid: sid() })));
      UI.on(el, 'ev', once(b => App.action('fix.eventSheet', { sid: sid(), eid: b.dataset.eid })));
      UI.on(el, 'player', once(() => App.action('setup.addArrival', { sid: sid() })));
      UI.on(el, 'teams', once(() => App.action('setup.teamsTonight', { sid: sid() })));
      UI.on(el, 'poles', once(() => App.action('setup.bigPoles', { sid: sid() })));
      UI.on(el, 'ftcheck', once(() => App.go('ref.ftcheck', { sid: sid() })));
      UI.on(el, 'ctl', b => clockAction(sid(), b.dataset.act, b));
      UI.on(el, 'halftime', b => { if (!b.classList.contains('is-done')) halfTime(sid(), b); });
      UI.on(el, 'goal', once(b => openGoal(sid(), b.dataset.team)));
      UI.on(el, 'act', once(b => {
        const k = b.dataset.kind;
        if (k === 'save') openSave(sid()); else openAction(sid(), k, b.dataset.ctype);
      }));
      // the two protected controls: a short press only explains; the 1.5 s hold does it
      el.addEventListener('click', e => {
        const hb = e.target.closest && e.target.closest('.hold');
        if (!hb || hb.classList.contains('done') || !el.contains(hb)) return;
        if (hb.dataset.hold === 'adjust' && hb.classList.contains('is-off')) { UI.toast('Kick off first'); return; }
        UI.toast(hb.dataset.hold === 'adjust' ? 'Hold to adjust the clock' : 'Hold for 1.5 s to end the game');
      });
      UI.onHold(el, 'adjust', hb => {
        const reset = () => { hb.classList.remove('done'); const hl = hb.querySelector('.hl'); if (hl) hl.textContent = 'Adjust clock'; };
        if (hb.classList.contains('is-off')) { setTimeout(reset, 400); UI.toast('Kick off first'); return; }
        const h = openAdjust({ sid: sid(), onClose: () => setTimeout(reset, 400) });
        if (!h) setTimeout(reset, 400);
      });
      UI.onHold(el, 'end', () => endGame(sid()));
      ctx.every(1000, () => tickConsole(el));
      // the outbox drained or filled without a data change: refresh the waiting dots
      const offStatus = Store.onStatus(() => {
        const t = document.querySelector('#app-header .hd-title'); if (t) t.textContent = headDate();
        if (el.isConnected && !holding(el) && el.querySelector('.cn-feed')) renderConsole(el);
      });
      ctx.onCleanup(offStatus);
    },
    render(el) { renderConsole(el); },
    // data changed: never redraw under a finger that is holding a protected control
    onData(el) {
      if (!holding(el)) { renderConsole(el); return; }
      const wait = setInterval(() => { if (!el.isConnected) { clearInterval(wait); return; } if (!holding(el)) { clearInterval(wait); renderConsole(el); } }, 200);
    },
  });

  // ---------------------------------------------------------------- Adjust clock (after the 1.5 s hold)
  function openAdjust(args) {
    const sid = (args && args.sid) || Store.activeSessionId();
    const sess = Store.session(sid);
    if (!sess || !Clock.isActive(sess)) { UI.toast(sess && Clock.status(sess) === 'ended' ? 'Full time: the clock has stopped' : 'Kick off first'); return null; }
    const inStop = Clock.status(sess) === 'stoppage';
    const el0 = Clock.elapsedMs(sess) || 0;
    // the likely real minute: regular time plus a stoppage that is still running (the 19 Oct slip)
    const st = { min: Math.floor((el0 + Clock.stoppageNowMs(sess)) / 60000), reset: false };
    const sub = `Now ${Clock.fmtClock(el0)}${inStop ? ` + ${Clock.fmtClock(Clock.halfStoppageMs(sess))} stoppage` : ''}`;
    const h = openSheet({ title: 'Adjust clock', sub, cls: 'sh-console sh-console-adjust', body: '',
      footer: `<div class="cn-adjgo" data-go></div>`, cancel: 'Cancel', onClose: args && args.onClose });
    if (!h) return null;
    const tick = on => `<span class="cn-tick${on ? ' on' : ''}" aria-hidden="true">${on ? '✓' : ''}</span>`;
    function draw() {
      h.setBody(`<div class="rows cn-adj">` +
        `<div class="r cn-adjset${st.reset ? ' is-dim' : ''}"><span class="grow nm">Set the minute</span>` +
        `<button type="button" class="cn-step" data-tap="minus" aria-label="One minute less">−</button>` +
        `<b class="cn-amin n" data-amin>${st.min}'</b>` +
        `<button type="button" class="cn-step" data-tap="plus" aria-label="One minute more">+</button></div>` +
        (inStop ? `<div class="r cn-adjopt"><span class="grow">End stoppage and set the clock</span>${tick(!st.reset)}</div>` : '') +
        `<button type="button" class="r cn-adjopt" data-tap="reset" aria-pressed="${st.reset}"><span class="grow">Reset to 0:00</span>${tick(st.reset)}</button>` +
        `</div><div class="cn-adjnote">Events already logged keep their minutes.</div>`);
      h.el.querySelector('[data-go]').innerHTML = UI.btn(st.reset ? 'Reset clock to 0:00' : `Set clock to ${st.min}:00`, { kind: 'w', big: true, tap: 'save', cls: 'cn-adjsave' });
    }
    onPick(h, 'minus', () => { st.reset = false; st.min = Math.max(0, st.min - 1); draw(); });
    onPick(h, 'plus', () => { st.reset = false; st.min = Math.min(120, st.min + 1); draw(); });
    onPick(h, 'reset', () => { st.reset = !st.reset; draw(); });
    onPick(h, 'save', b => {
      const s = Store.session(sid);
      if (!s || !Clock.isActive(s)) { h.close(); return; }
      const minute = st.reset ? 0 : st.min;
      const prev = s.timer;
      const timer = Clock.adjust(s, Store.now(), minute);
      h.save = Save.run({
        label: st.reset ? 'Clock reset to 0:00' : `Clock set to ${minute}:00`, button: b, group: h.el,
        write: () => Store.set(`sessions/${sid}/timer`, timer),
        undo: () => Store.set(`sessions/${sid}/timer`, prev),
        onSaved: () => h.close(),
      });
    });
    draw();
    return h;
  }
  App.registerAction('console.adjustClock', openAdjust);

  // ---------------------------------------------------------------- sync chip → what is waiting
  function describe(paths) {
    const evp = paths.find(p => /^sessions\/[^/]+\/events\/[^/]+$/.test(p));
    if (evp) {
      const [, sid, , eid] = evp.split('/');
      const s = Store.session(sid);
      const ev = s && s.events && s.events[eid];
      if (!ev) return 'Removed event';
      const who = evWho(ev);
      return [Scoring.minuteText(ev), who ? nameOf(who) : '', FEED_LABEL[ev.type] || ev.type].filter(Boolean).join(' ');
    }
    const p = paths[0] || '';
    if (/\/timer$/.test(p)) return 'Clock';
    if (/^sessions\/[^/]+$/.test(p)) return 'Kick off';
    if (/\/teams\//.test(p)) return 'Teams tonight';
    if (/\/format/.test(p)) return 'Poles and keepers';
    if (/^players\//.test(p)) return 'New player';
    if (/^paymentDays\//.test(p)) return 'Payment';
    return 'Change';
  }
  function openSyncSheet() {
    if (UI.sheet.top()) return null;
    const h = UI.sheet.open({ title: 'Sending', cls: 'sh-console sh-console-sync', body: '', cancel: 'Done',
      theme: document.documentElement.dataset.theme, onClose: () => { if (off) off(); if (offS) offS(); } });
    let off = null, offS = null;
    function draw() {
      if (h.closed) return;
      const info = Store.status();
      const list = Store.outbox() || [];
      h.setTitle(list.length ? `${list.length} waiting to send` : 'All sent');
      const note = !list.length ? (info.status === 'offline' ? 'No signal right now. Nothing is waiting.' : 'Everything is in the database.')
        : info.status === 'offline' ? 'Saved on this phone. They send by themselves, in order, when signal returns.'
          : info.failed ? 'The database refused the oldest one. Sign in again, or ask the admin.' : 'Sending now…';
      h.setBody(`<div class="cn-syncnote">${esc(note)}</div>` + (list.length ? UI.rows(list.map(x => UI.row({
        titleHtml: esc(describe(x.paths || [])),
        metaHtml: `Saved ${esc(UI.fmt.time(x.at))}${(x.paths || []).length > 1 ? ` · ${(x.paths || []).length} changes` : ''}`,
        right: '<span class="cn-wait" aria-hidden="true"></span>',
      })), { cls: 'cn-synclist' }) : ''));
    }
    off = Store.on(draw);
    offS = Store.onStatus(draw);
    draw();
    return h;
  }
  App.registerAction('console.syncSheet', openSyncSheet);

  // ---------------------------------------------------------------- retired ⋯ menu
  // No ⋯ menu any more (everything is on the deck). Old callers land on Match controls instead.
  App.registerAction('console.menu', () => {
    const x = document.querySelector('.scr-ref-console .cn-sec-ctl');
    if (x && x.scrollIntoView) x.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return null;
  });

  // ---------------------------------------------------------------- All events
  function eventsOf(sid) {
    const sess = Store.session(sid);
    if (!sess) return { sess: null, list: [] };
    const list = Scoring.sessEvents(sess);
    const p = polesPseudo(sess);
    if (p) list.push(p);
    // newest minute first; same minute → newest log first; events with no minute last
    list.sort((a, b) => ((b.min ?? -1) - (a.min ?? -1)) || ((b.stoppageMin ?? 0) - (a.stoppageMin ?? 0)) || (ts(b) - ts(a)));
    return { sess, list };
  }
  const filterOf = v => FILTERS.find(f => f.value === v);
  function evMatchesQ(ev, q) {
    if (!q) return true;
    return [ev.scorerId, ev.assistId, ev.playerId].filter(Boolean).some(pid => matchesQ(nameOf(pid), q));
  }

  function eventsListHtml(sid, st) {
    const { sess, list } = eventsOf(sid);
    if (!sess) return UI.empty('Match not found', '');
    const f = filterOf(st.f);
    const q = st.q.trim().toLowerCase();
    const shown = list.filter(e => (!f || f.types.includes(e.type)) && evMatchesQ(e, q));
    if (!shown.length) return UI.empty(list.length ? 'Nothing matches' : 'No events yet', '');
    const waiting = waitingPaths();
    return `<div class="rows cn-evlist">${shown.map(e => eventRow(e, sess, { chevron: true, waiting, sid })).join('')}</div>`;
  }
  function filtersHtml(sid, st) {
    const { list } = eventsOf(sid);
    const real = list.filter(e => !e.synthetic);
    const items = [{ value: 'all', label: 'All', n: real.length, on: st.f === 'all' }];
    FILTERS.forEach(f => {
      const n = real.filter(e => f.types.includes(e.type)).length;
      if (n) items.push({ value: f.value, label: f.label, n, on: st.f === f.value });
    });
    if (!items.some(i => i.on)) { st.f = 'all'; items[0].on = true; }
    return UI.chips('evf', items, { ref: true });
  }
  const evSid = ctx => (ctx.params && ctx.params.sid) || Store.activeSessionId();
  function evClock(sid) {
    const s = Store.session(sid);
    return s && Clock.isActive(s) ? Clock.fmtClock(Clock.elapsedMs(s) || 0) : '';
  }

  App.registerScreen('ref.events', {
    tab: 'match', layout: 'phone', console: true,
    header: ctx => {
      const c = evClock(evSid(ctx));
      return { left: `<button type="button" class="hd-btn cn-back" data-shell="back">‹ Match</button>`,
        center: `Events${c ? ` · <span class="n cn-evclock">${esc(c)}</span>` : ''}`, right: UI.syncChip(Store.status()) };
    },
    mount(el, ctx) {
      el._st = { f: 'all', q: '' };
      UI.onChip(el, 'evf', v => { el._st.f = v; const l = el.querySelector('[data-evlist]'); if (l) l.innerHTML = eventsListHtml(evSid(ctx), el._st); });
      el.addEventListener('input', e => {
        if (!e.target.matches('[data-search]')) return;
        el._st.q = e.target.value;
        const l = el.querySelector('[data-evlist]'); if (l) l.innerHTML = eventsListHtml(evSid(ctx), el._st);
      });
      UI.on(el, 'ev', b => App.action('fix.eventSheet', { sid: evSid(ctx), eid: b.dataset.eid }));
      ctx.every(1000, () => { const x = document.querySelector('#app-header .cn-evclock'); if (x) x.textContent = evClock(evSid(ctx)); });
    },
    render(el, ctx) {
      const sid = evSid(ctx);
      const st = el._st || (el._st = { f: 'all', q: '' });
      el.innerHTML = `<div class="cn-evtop">${UI.search({ name: 'evq', placeholder: 'Find a player', value: st.q })}` +
        `<div class="cn-filters">${filtersHtml(sid, st)}</div></div>` +
        `<div data-evlist>${eventsListHtml(sid, st)}</div>`;
    },
  });
})();
