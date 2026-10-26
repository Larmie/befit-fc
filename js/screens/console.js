/* ============================================================================
   BE Fit Club · js/screens/console.js · REFEREE CONSOLE (the deck)   OWNER: Round 5 · Console builder
   ----------------------------------------------------------------------------
   Styles in css/console.css, scoped under .scr-ref-console / .scr-ref-events / .sh-console-*.
   Used pitch-side, at night, one-handed, offline-capable. It must never double-log.

   SCREENS
     'ref.console'        tab match · layout phone · console. Nav hidden while the clock runs, is paused or in
                          stoppage (shell: App.isLiveMatch()). Header: "Referee ▾" · date · sync chip (no ⋯).
                          THE DECK (round 6: team first), top to bottom:
                            score block (UI.scoreFor, console size, running clock in the centre, the screen's
                              one hero); in stoppage one amber line "Clock held at 46:00 · 2nd half"
                            TEAM COLUMNS        one column per team tonight (any two; 3 side by side), each:
                                                Goal 88 px (team tint + corner light, the team's goals top right)
                                                Save 56 px "Save · Toby · 5" (big poles only; the keeper named)
                                                Block | Clear, Yellow | Red: 60 px team-tinted pairs, per-team counts
                                                All of it above Match controls: no scrolling at 390 px.
                            MATCH CONTROLS      row 1: + Stoppage (primary 2/3) · Pause (quiet 1/3)
                                                  in stoppage: amber "End stoppage · +1:36"; after 4 min of the SAME
                                                  stoppage it pulses: "Still in stoppage? / End · +7:10" (no banner)
                                                  at half time: "Resume second half" (primary, full width)
                                                poles slot (25 Oct): small poles "Switch to big poles ›" / "Now: small
                                                  poles · no keepers" (56 px, ink outline); after the switch a quiet card
                                                  "Big poles since 46' · Toby · Mike" (or "from kick-off"), tap to change
                                                  keepers. Both open setup.bigPoles.
                                                row 2: Half time · Adjust clock (hold 1.5 s) · + Player · Teams tonight ·
                                                  Edit events (5 tiles: 3 + 2, 52 px)
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
     Block / Clear   Team's tile → player row or Recent chip (saves); "+1 again" on the bar   2 taps
     Yellow / Red    Team's tile → player (saves); "Booked 71'" marks anyone carded tonight   2 taps
              The sheet opens on the tapped team (tinted title "Block · Green", no team tab);
              "Wrong team? Block · Red ›" at the bottom swaps sides in one tap.
     Save     Save · Team logs that side's one keeper at once (lock, Undo)                  1 tap
              the toast's "Penalty" turns it into a penalty save                             2 taps
              two keepers listed on a side → a 2-tile picker (Save | Penalty save first)     2–3 taps
     Small poles: a GK-position player plays as an outfielder (Scoring.effectivePos → MID): he is on Block / Clear.
   Double-tap guards: one sheet at a time; a sheet ignores taps for 350 ms after it opens or changes step;
     clock buttons take one change per 0.7 s; deck tiles that open a sheet ignore a second tap for 0.5 s;
     a 1-tap Save ignores further Save taps on that team for 1.2 s; any deck tap within 0.5 s of a tap on the
     Undo bar is ignored (the second tap of a double tap on "+1 again" / "Penalty" / Undo falls through to the deck).
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
    bigPoles: 'Big poles', formatSwitch: 'Big poles', poles: 'Big poles', smallPoles: 'Small poles',
  };
  const FEED_LABEL = Object.assign({}, TYPE_LABEL, { yellowCard: 'Yellow', redCard: 'Red card' });
  const BAR_LABEL = Object.assign({}, TYPE_LABEL, { yellowCard: 'Yellow' });   // "Yellow · Keith 64'"
  const FILTERS = [
    { value: 'goals', label: 'Goals', types: ['goal', 'ownGoal'] },
    { value: 'saves', label: 'Saves', types: ['save', 'penaltySave'] },
    { value: 'defence', label: 'Defence', types: ['block', 'clearance'] },
    { value: 'cards', label: 'Cards', types: ['yellowCard', 'redCard'] },
  ];
  // 25 Oct (Reuben): every pick list is A–Z by name, whatever the position (only points lists sort by points)
  const ARM_MS = 350;        // a sheet ignores taps this long after it opens or changes step (double-tap guard)
  const CTL_MS = 700;        // clock buttons: one change per 0.7 s (a double tap on Pause never resumes)
  const OPEN_MS = 500;       // deck tiles that open a sheet: a second tap within 0.5 s does nothing
  const ESCALATE_MS = 4 * 60000;   // the same stoppage running this long → "Still in stoppage?"
  const HOLD_MS = 1500;      // Adjust clock and End game: 1.5 s hold with a fill
  // Practice mode (html.practice, set by js/core/practice.js): the clock’s small label and “End practice” (the violet is in css/welcome.css)
  const practice = () => document.documentElement.classList.contains('practice');
  const centreOf = sess => { const c = UI.scoreCentre(sess, { clock: true }); if (practice() && c.state === 'live') c.sub = 'Practice'; return c; };

  // ---------------------------------------------------------------- data helpers
  const nameOf = pid => { const p = Store.player(pid); return p ? p.name : 'Unknown'; };
  const effPos = (sess, p) => (Scoring.playsAsNow ? Scoring.playsAsNow(sess, p.pid) : Scoring.effectivePos ? Scoring.effectivePos(sess, p) : p.pos) || 'MID';
  // players tonight with the position they PLAY as (small poles: a GK plays and scores as MID)
  const playersOf = sess => Scoring.sessPlayers(sess).map(p => Object.assign({}, p, { listed: p.pos, pos: effPos(sess, p) }));
  const teamsOf = sess => Scoring.orderTeams(Object.keys((sess && sess.teams) || {}));
  function teamOfPlayer(sess, pid) {
    for (const [team, td] of Object.entries((sess && sess.teams) || {})) if (td && td.players && td.players[pid]) return team;
    return null;
  }
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
  const minuteNow = sess => Scoring.minuteText(Clock.minuteParts(sess) || {});
  const ts = ev => Number(ev.timestamp) || 0;
  const eventsNewest = sess => Scoring.sessEvents(sess).sort((a, b) => ts(b) - ts(a));
  const matchesQ = (name, q) => !q || String(name || '').toLowerCase().includes(q);
  const countOf = (sess, types) => Scoring.sessEvents(sess).filter(e => types.includes(e.type)).length;

  // Tonight's keepers: the chosen big-poles keepers (format.keepers); with none recorded on big poles
  // (old matches) every player who still plays as GK. Small poles, never switched: nobody.
  function keepersOf(sess) {
    const f = Scoring.formatOf(sess);
    if (!f.everBig || f.bigNow === false) return [];   // small poles now (never big, or switched back): no keepers
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
    if (ev.type === 'smallPoles') return 'keepers stop counting';
    if (TYPE_LABEL[ev.type] === 'Big poles') { const k = (Scoring.formatOf(sess).keepers && Object.values(Scoring.formatOf(sess).keepers).filter(Boolean).map(nameOf)) || []; return k.length ? `keepers ${esc(k.join(', '))}` : ''; }
    return esc(label);
  }

  // one feed / list row; tappable when the event is real (opens the fix builder's Event sheet)
  function eventRow(ev, sess, o) {
    o = o || {};
    const who = evWho(ev);
    const team = evTeam(sess, ev);
    const isPoles = TYPE_LABEL[ev.type] === 'Big poles' || ev.type === 'smallPoles';
    const title = who ? `<span class="nm">${esc(nameOf(who))}</span> <span class="kind">${kindHtml(ev, sess)}</span>`
      : isPoles ? `<span class="nm">${ev.type === 'smallPoles' ? 'Small poles' : 'Big poles'}</span> <span class="kind">${kindHtml(ev, sess)}</span>`
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
    // every change of poles after kick-off (switchedAt and format.switches), as rows in All events
    const f = Scoring.formatOf(sess);
    if (f.legacy || !f.periods || f.periods.length < 2) return [];
    if (Scoring.sessEvents(sess).some(e => TYPE_LABEL[e.type] === 'Big poles')) return [];
    return f.periods.slice(1).map((x, i) => ({ id: 'poles' + i, synthetic: true, type: x.big ? 'bigPoles' : 'smallPoles', min: x.from, timestamp: i }));
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
    // 1-tap Save: the toast's second button turns it into a penalty save (Save · Team → Penalty = 2 taps)
    const penalty = o.penalty && ev.type === 'save'
      ? { label: 'Penalty', run: () => Save.run({
        label: `Penalty save · ${nameOf(ev.playerId)}${min ? ' ' + min : ''}`,
        write: () => Store.update(path, { type: 'penaltySave' }),
        undo: () => Store.update(path, { type: 'save' }),
      }) } : null;
    return Save.run({
      label, button: o.button || null, group: o.group || null, savingText: o.savingText || 'Saving…',
      timeoutMs: offline ? 2500 : 8000,
      write: () => Store.set(path, ev),
      undo: () => Store.remove(path),
      again: repeatable ? { label: '+1 again', run: () => logEvent({ sid: o.sid, data: Object.assign({}, o.data, { again: true }), again: true }) } : penalty,
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
        const list = sideOf(scoringTeam).sort(byName);
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
      const mates = (st.og ? sideOf(team) : sideOf(team).filter(p => p.pid !== st.scorer)).sort(byName);
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

  // Round 6: team first. The deck's team column says whose Block / Clear / Yellow / Red it is, so the sheet
  // opens straight on that team (tinted title "Block · Green", no team tab): tile → player = 2 taps.
  // "Wrong team? Block · Red ›" at the bottom swaps sides in one tap.
  function openAction(sid, kind, ctype, team) {
    if (!guardLog(sid)) return;
    const sess = Store.session(sid);
    const isCard = kind === 'card';
    const type = isCard ? (ctype === 'redCard' ? 'redCard' : 'yellowCard') : kind;
    const famTypes = isCard ? ['yellowCard', 'redCard'] : ['block', 'clearance'];
    const teams = teamsOf(sess);
    if (!teams.includes(team)) team = lastSide(sess, famTypes) || teams[0];
    const word = { block: 'Block', clearance: 'Clear', yellowCard: 'Yellow', redCard: 'Red' }[type];
    const h = openSheet({ title: `${word} · ${fmtTeam(team)}`, titleEnd: `<span class="n">${esc(minuteNow(sess))}</span>`,
      cls: 'sh-console sh-console-act sh-console-team' + (isCard ? ' sh-console-card' : ''), body: '', cancel: 'Cancel', autofocus: false });
    if (!h) return;
    const head = h.el.querySelector('.sheet-h');
    if (head) head.classList.add('lit', 'cn-gbar', tcls(team));
    if (isCard) { const t = h.el.querySelector('.sheet-title'); if (t) t.insertAdjacentHTML('afterbegin', cardShape(type === 'redCard' ? 'red' : 'yellow')); }

    // Block / Clear: everyone who plays outfield tonight (a GK on small poles plays as MID, so he is here too)
    const eligible = s => playersOf(s).filter(p => p.team === team && (isCard || p.pos !== 'GK'));
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
    const prow = (p, booked) =>
      `<button type="button" class="r cn-prow" data-tap="pick" data-pid="${esc(p.pid)}" data-name="${esc(p.name)}">` +
      `<span class="grow"><span class="nm" data-label>${esc(p.name)}</span><span class="tally">${esc(p.pos || '')}</span></span>` +
      `<span class="end">${isCard ? marker(booked[p.pid]) : ''}</span></button>`;

    function draw() {
      const s = Store.session(sid);
      const list = eligible(s).sort(byName);
      const booked = isCard ? bookedOf(s) : {};
      const rec = recent(s);
      h.setBody(
        (rec.length ? `<div class="lbl cn-reclbl">Recent tonight</div><div class="chips cn-recent">` +
          rec.map(pid => `<button type="button" class="chip ref" data-tap="pick" data-pid="${esc(pid)}" data-name="${esc(nameOf(pid))}">${esc(nameOf(pid))}</button>`).join('') + `</div>` : '') +
        `<div class="cn-list" data-list>${list.length ? `<div class="rows">${list.map(p => prow(p, booked)).join('')}</div>` : UI.empty(`No ${fmtTeam(team)} players`, '')}` +
        `<div class="cn-wrongs">${teamsOf(s).filter(t => t !== team).map(t =>
          `<button type="button" class="link cn-link cn-wrong" data-tap="wrong" data-team="${esc(t)}">Wrong team? ${esc(word)} · ${esc(fmtTeam(t))} ›</button>`).join('')}</div></div>`);
    }
    onPick(h, 'wrong', el => { const t = el.dataset.team; h.close(); openAction(sid, kind, type, t); });
    onPick(h, 'pick', el => {
      h.save = logEvent({ sid, data: { type, playerId: el.dataset.pid }, button: el, group: h.el, again: !isCard,
        savingText: el.classList.contains('chip') ? 'Saving…' : 'Saving… ' + (el.dataset.name || ''),
        onSaved: () => h.close() });
    });
    draw();
  }

  // Save · Team: with exactly one keeper in goal for that side it logs at once (lock, Undo 5 s, "Penalty" on the
  // toast). Two keepers listed on a side → a 2-tile picker. A second / third tap within 1.2 s does nothing.
  const saveBusy = {};
  function quickSave(sid, team, button) {
    if (UI.sheet.top() || afterBar() || Date.now() < (saveBusy[team] || 0)) return null;
    if (!guardLog(sid)) return null;
    const ks = keepersOf(Store.session(sid)).filter(k => k.team === team);
    if (ks.length !== 1) { openSave(sid, team); return null; }
    saveBusy[team] = Date.now() + 1200;
    return logEvent({ sid, data: { type: 'save', playerId: ks[0].pid }, button, penalty: true });
  }

  // ---------------------------------------------------------------- Save sheet (tonight's keepers only)
  function openSave(sid, team) {
    if (!guardLog(sid)) return;
    const sess = Store.session(sid);
    const st = { stype: 'save' };
    const h = openSheet({ title: team ? 'Save · ' + fmtTeam(team) : 'Save', titleEnd: `<span class="n">${esc(minuteNow(sess))}</span>`, cls: 'sh-console sh-console-save', body: '', cancel: 'Cancel' });
    if (!h) return;
    const keepers = keepersOf(sess).filter(k => !team || k.team === team);
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
    const poles = f.legacy ? '' : Scoring.polesText(sess);
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
  // The poles slot, just above the controls grid (25 Oct): on small poles an obvious action
  // "Switch to big poles ›" (ink outline, not amber: amber means stoppage); after the switch a quiet status card
  // "Big poles since 46' · Toby · Mike" (or "from kick-off"), tap to change keepers. Both open setup.bigPoles.
  function polesHtml(sess, f) {
    const ranges = () => f.periods.filter(x => x.big).map(x => (x.to == null ? `from ${x.from}'` : `${x.from}'–${x.to}'`)).join(', ');
    if (!f.everBig) {
      return `<button type="button" class="cn-poles is-small" data-tap="poles">` +
        `<span class="cn-pt">Switch to big poles ›</span><span class="cn-ps">Now: small poles · no keepers</span></button>`;
    }
    if (f.bigNow === false) {   // switched back to small: say what counted, and offer big poles again
      const last = f.periods[f.periods.length - 1];
      return `<button type="button" class="cn-poles is-small" data-tap="poles">` +
        `<span class="cn-pt">Switch to big poles ›</span><span class="cn-ps">Small poles since ${last.from}' · keepers counted ${esc(ranges())}</span></button>`;
    }
    // big poles now: the action is the way back to small. Changing keepers lives with the keepers
    // (the "In goal" line under the Save tiles, see keepersLine), so it never reads as part of the poles switch.
    const names = keepersOf(sess).map(k => k.name);
    return `<button type="button" class="cn-poles is-small" data-tap="tosmall">` +
      `<span class="cn-pt">Switch to small poles ›</span><span class="cn-ps">${esc(['Now: big poles'].concat(names.length ? names : ['no keepers chosen']).join(' · '))}</span></button>`;
  }
  // Under the Save tiles while big poles are on: who is in goal, and the way to change them (opens setup.bigPoles).
  function keepersLine(sess, f) {
    if (!f.everBig || f.bigNow === false) return '';
    const names = keepersOf(sess).map(k => k.name);
    return `<button type="button" class="cn-keeplink" data-tap="poles">` +
      `<span class="cn-ig">${esc(names.length ? 'In goal: ' + names.join(' · ') : 'No keepers chosen')}</span>` +
      `<span class="cn-igc">${names.length ? 'Change ›' : 'Choose ›'}</span></button>`;
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
    return primaryHtml(sess) + polesHtml(sess, f) +
      `<div class="cn-grid n5">${ht}${adjust}${ctlTile('+ Player', 'player')}${ctlTile('Teams tonight', 'teams')}${ctlTile('Edit events', 'events')}</div>` +
      `<div class="cn-endw">${UI.hold(practice() ? 'Hold to end practice' : 'Hold to end the game', { name: 'end', ms: HOLD_MS, warn: true, doneText: 'Ending…' })}</div>`;
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
    const total = totalText(sess);
    const sec = (label, right, body, cls) =>
      `<section class="cn-sec${cls ? ' ' + cls : ''}"><div class="lbl"><span>${esc(label)}</span>${right || ''}</div>${body}</section>`;
    // per-team counts: an event belongs to the side of the player it is about
    const evTeams = Scoring.sessEvents(sess).map(e => ({ type: e.type, team: evTeam(sess, e) }));
    const cnt = (t, types) => evTeams.filter(x => x.team === t && types.includes(x.type)).length;

    let html = `<div class="cn-score">${UI.scoreFor(sess, { size: 'console', clock: true, hero: true, centre: centreOf(sess) })}` +
      (st === 'stoppage' ? `<div class="cn-line is-stop" data-line>${esc(lineText(sess))}</div>` : '') + `</div>`;
    if (!ended) {
      // ROUND 6 · team-first: one column per team, top to bottom Goal 88 · Save 56 (big poles) · Block | Clear 60 ·
      // Yellow | Red 60, every tile tinted in its team. Same muscle memory as Goal: tap the team's tile, tap the player.
      const tile = (t, kind, label, n) =>
        `<button type="button" class="cn-tt cn-act${off}" data-tap="act" data-kind="${kind}" data-team="${esc(t)}">` +
        `<b>${label}</b><span class="cn-ct">${n}</span></button>`;
      const card = (t, ctype) => {
        const n = cnt(t, [ctype]), red = ctype === 'redCard';
        return `<button type="button" class="cn-tt cn-card${off}" data-tap="act" data-kind="card" data-ctype="${ctype}" data-team="${esc(t)}">` +
          `${cardShape(red ? 'red' : 'yellow')}<b>${red ? 'Red' : 'Yellow'}${n ? ` <span class="cn-cn">· ${n}</span>` : ''}</b></button>`;
      };
      const col = t => {
        const ks = keepers.filter(k => k.team === t);
        const save = !keepers.length ? '' : ks.length
          ? `<button type="button" class="cn-tt cn-save${off}" data-tap="save" data-team="${esc(t)}" aria-label="Save ${esc(fmtTeam(t))}">` +
            `<b>Save</b><span class="cn-sk">${esc(ks.map(k => k.name).join(' · '))} · ${cnt(t, ['save', 'penaltySave'])}</span></button>`
          : `<div class="cn-tt cn-save is-none"><span class="cn-sk">No keeper</span></div>`;
        return `<div class="cn-col ${tcls(t)}" data-col="${esc(t)}">` +
          `<button type="button" class="cn-goal lit ${tcls(t)}${off}" data-tap="goal" data-team="${esc(t)}" aria-label="Goal ${esc(fmtTeam(t))}">` +
          `<span class="cn-gc">${esc(Scoring.teamGoals(sess, t))}</span><b>Goal</b><small>${esc(fmtTeam(t))}</small></button>` +
          save +
          `<div class="cn-pair">${tile(t, 'block', 'Block', cnt(t, ['block']))}${tile(t, 'clearance', 'Clear', cnt(t, ['clearance']))}</div>` +
          `<div class="cn-pair">${card(t, 'yellowCard')}${card(t, 'redCard')}</div></div>`;
      };
      html += `<div class="cn-cols" style="--cols:${Math.min(Math.max(teams.length, 2), 3)}">${teams.map(col).join('')}</div>` +
        keepersLine(sess, Scoring.formatOf(sess));
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
    const c = centreOf(sess);
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
  // the second tap of a double tap on the Undo bar ("+1 again", "Penalty", Undo) must not land on the deck behind it
  let barTapAt = 0;
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#app-undo')) barTapAt = Date.now(); }, true);
  const afterBar = () => Date.now() - barTapAt < 500;
  const once = fn => (...a) => {
    if (UI.sheet.top() || Date.now() < openBusyUntil || afterBar()) return;
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
      // the poles button sits right under the clock buttons: the 2nd tap of a double-tapped Kick off / + Stoppage
      // (within their 0.7 s guard) must not open the poles sheet
      UI.on(el, 'poles', b => { if (Date.now() >= ctlBusyUntil) once(() => App.action('setup.bigPoles', { sid: sid() }))(b); });
      UI.on(el, 'tosmall', b => { if (Date.now() >= ctlBusyUntil) once(() => App.action('setup.smallPoles', { sid: sid() }))(b); });
      UI.on(el, 'ftcheck', once(() => App.go('ref.ftcheck', { sid: sid() })));
      UI.on(el, 'ctl', b => { if (!afterBar()) clockAction(sid(), b.dataset.act, b); });
      UI.on(el, 'halftime', b => { if (!b.classList.contains('is-done') && !afterBar()) halfTime(sid(), b); });
      UI.on(el, 'goal', once(b => openGoal(sid(), b.dataset.team)));
      UI.on(el, 'save', b => quickSave(sid(), b.dataset.team, b));
      UI.on(el, 'act', once(b => {
        const k = b.dataset.kind;
        if (k === 'save') openSave(sid(), b.dataset.team); else openAction(sid(), k, b.dataset.ctype, b.dataset.team);
      }));
      // the two protected controls: a short press only explains; the 1.5 s hold does it
      el.addEventListener('click', e => {
        const hb = e.target.closest && e.target.closest('.hold');
        if (!hb || hb.classList.contains('done') || !el.contains(hb)) return;
        if (hb.dataset.hold === 'adjust' && hb.classList.contains('is-off')) { UI.toast('Kick off first'); return; }
        UI.toast(hb.dataset.hold === 'adjust' ? 'Hold to adjust the clock' : practice() ? 'Hold for 1.5 s to end practice' : 'Hold for 1.5 s to end the game');
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
    polesPseudo(sess).forEach(x => list.push(x));
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
