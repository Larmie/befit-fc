/* ============================================================================
   BE Fit Club · js/screens/console.js · REFEREE CONSOLE       OWNER: Phase 2 · Console builder
   ----------------------------------------------------------------------------
   Styles in css/console.css, scoped under .scr-ref-console / .scr-ref-events / .sh-console-*.

   SCREENS
     'ref.console'        tab match · layout phone · console   The live match (Match tab shows it whenever a
                          session is 'active'): score + clock, format pill, Pause · + Stoppage · + Player
                          (Kick off when idle), Goal tiles per team (92 px), Save (big poles only) · Block ·
                          Clear · Card (72 px), Latest feed + "All n ›". Header ⋯ opens the match menu.
     'ref.events' {sid}   tab match · layout phone · console   All events, filter chips on one row (All · Goals ·
                          Saves · Defence · Cards, hidden at 0) + search; every row opens
                          App.action('fix.eventSheet', { sid, eid }).
   ACTIONS
     'console.menu'       ({ sid })   the ⋯ sheet: Switch to big poles (small poles only), Add a player,
                          Teams tonight, Edit events, Half time (or "done · 51'"), Resume second half,
                          stoppage total, Hold to end the game (2 s) → timer ended (status stays active)
                          → App.go('ref.ftcheck', { sid }).

   LOGGING (every log goes through Save.run: lock on first tap → Saving… → Undo 5 s, or Not saved + Retry)
     Goal     Goal · Team → scorer tile → assist tile / "No assist" (saves)            3 taps
              own goal: Goal · Team → "Own goal by a Red player ›" → player → assist    4 taps
     Block / Clear   tile → player row or Recent chip (saves); "+1 again" on the bar     2 taps
     Card     Card → (Red card) → (team tab) → player (saves)                           2–4 taps
     Save     Save → keeper (saves); Penalty save segment first                          2–3 taps
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

  // ---------------------------------------------------------------- constants
  const TYPE_LABEL = {
    goal: 'Goal', ownGoal: 'Own goal', save: 'Save', penaltySave: 'Penalty save', block: 'Block',
    clearance: 'Clearance', yellowCard: 'Yellow card', redCard: 'Red card', halfTime: 'Half time',
    bigPoles: 'Big poles', formatSwitch: 'Big poles', poles: 'Big poles',
  };
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

  const ICON = {
    save: '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V10M10 9.5v-4a1.5 1.5 0 0 1 3 0V10M13 9.5V6a1.5 1.5 0 0 1 3 0v6.5M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 5 14.5V12a1.5 1.5 0 0 1 2-1.4"/>',
    block: '<path d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z"/>',
    clearance: '<path d="M5 15c4-8 10-8 14-6M15 5l4 4-4 4"/>',
    card: '<rect x="7.5" y="4" width="9" height="16" rx="1.6"/>',
  };
  const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

  // ---------------------------------------------------------------- data helpers
  const nameOf = pid => { const p = Store.player(pid); return p ? p.name : 'Unknown'; };
  const playersOf = sess => Scoring.sessPlayers(sess);
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

  function keeperNames(sess) {
    const f = Scoring.formatOf(sess);
    let pids = Object.values(f.keepers || {}).filter(Boolean);
    if (!pids.length) pids = playersOf(sess).filter(p => p.pos === 'GK').map(p => p.pid);
    return pids.map(nameOf);
  }

  // the team a feed row shows: always the side of the player it is about
  function evTeam(sess, ev) {
    if (ev.type === 'goal') return ev.team;
    if (ev.type === 'ownGoal') return ev.team;
    if (ev.playerId) return teamOfPlayer(sess, ev.playerId);
    return null;
  }
  function evWho(ev) {
    if (ev.type === 'goal' || ev.type === 'ownGoal') return ev.scorerId;
    return ev.playerId || null;
  }
  function kindHtml(ev, sess) {
    const label = TYPE_LABEL[ev.type] || String(ev.type || 'Event');
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
    return `<${tag} class="r cn-evr"${tapA}><span class="min">${esc(Scoring.minuteText(ev))}</span>` +
      `<span class="grow">${title}</span>` +
      `${team ? UI.teamMark(team) : ''}${o.chevron && tag === 'button' ? '<span class="chev">›</span>' : ''}</${tag}>`;
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
    const h = openSheet({ title: 'Goal · ' + fmtTeam(team), titleEnd: esc(minuteNow(sess)), cls: 'sh-console sh-console-goal', body: '' });
    if (!h) return;
    const h4 = h.el.querySelector('h4');
    if (h4) h4.insertAdjacentHTML('afterbegin', `<span class="bar-team t-${esc(team)}"></span>`);

    const sideOf = t => playersOf(Store.session(sid)).filter(p => p.team === t);
    const tile = (p, tap) => UI.tile({ name: p.name, pos: p.pos, tap, data: { pid: p.pid } });

    function draw() {
      const s = Store.session(sid);
      if (!st.scorer) {
        const scoringTeam = st.og ? st.ogTeam : team;
        const list = sideOf(scoringTeam).sort(byOrder(ATTACK_ORDER));
        const others = teamsOf(s).filter(t => t !== team);
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

  function openAction(sid, kind) {
    if (!guardLog(sid)) return;
    const sess = Store.session(sid);
    const isCard = kind === 'card';
    const famTypes = isCard ? ['yellowCard', 'redCard'] : ['block', 'clearance'];
    const teams = teamsOf(sess);
    const st = {
      team: lastSide(sess, famTypes) || lastSide(sess, Object.keys(TYPE_LABEL)) || teams[0],
      q: '', ctype: 'yellowCard',
    };
    if (!teams.includes(st.team)) st.team = teams[0];
    const title = isCard ? 'Card' : TYPE_LABEL[kind];
    const h = openSheet({ title, titleEnd: esc(minuteNow(sess)), cls: 'sh-console sh-console-act', body: '', cancel: 'Cancel', autofocus: false });
    if (!h) return;

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
    const prow = (p, withTeam) =>
      `<button type="button" class="r cn-prow" data-tap="pick" data-pid="${esc(p.pid)}" data-name="${esc(p.name)}">` +
      `<span class="grow"><span class="nm" data-label>${esc(p.name)}</span><span class="tally">${esc(p.pos || '')}</span></span>` +
      `${withTeam ? UI.teamMark(p.team) : ''}</button>`;

    function listHtml() {
      const s = Store.session(sid);
      const q = st.q.trim().toLowerCase();
      const all = eligible(s);
      const list = (q ? all.filter(p => matchesQ(p.name, q)) : all.filter(p => p.team === st.team)).sort(byOrder(DEFENCE_ORDER));
      return list.length ? `<div class="rows">${list.map(p => prow(p, !!q)).join('')}</div>` : UI.empty(q ? 'No one by that name' : 'No players', '');
    }
    function draw() {
      const s = Store.session(sid);
      const counts = teamsOf(s).map(t => ({ team: t, count: eligible(s).filter(p => p.team === t).length }));
      const rec = recent(s);
      h.setBody(
        (isCard ? `<div class="seg cn-cardseg" role="tablist" data-seg="ctype">` +
          `<button type="button" role="tab" class="${st.ctype === 'yellowCard' ? 'on' : ''}" data-value="yellowCard">${UI.cardGlyph('yellow')}<span>Yellow</span></button>` +
          `<button type="button" role="tab" class="${st.ctype === 'redCard' ? 'on' : ''}" data-value="redCard">${UI.cardGlyph('red')}<span>Red card</span></button></div>` : '') +
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

  // ---------------------------------------------------------------- Save sheet (keepers only)
  function openSave(sid) {
    if (!guardLog(sid)) return;
    const sess = Store.session(sid);
    const st = { stype: 'save' };
    const h = openSheet({ title: 'Save', titleEnd: esc(minuteNow(sess)), cls: 'sh-console sh-console-save', body: '', cancel: 'Cancel' });
    if (!h) return;
    const keepers = playersOf(sess).filter(p => p.pos === 'GK');
    const teams = teamsOf(sess).filter(t => keepers.some(k => k.team === t));
    if (!keepers.length) {
      h.setBody(UI.empty('No keepers tonight', '') + UI.btn('Teams tonight', { kind: 'g', sm: true, tap: 'teams' }));
      UI.on(h.el, 'teams', () => { h.close(); App.action('setup.teamsTonight', { sid }); });
      return;
    }
    h.setBody(
      `<div class="cn-keepers" style="--cols:${Math.min(teams.length, 3)}">` + teams.map(t =>
        `<div class="cn-kcol"><div class="lbl">${UI.teamMark(t)}</div>` +
        keepers.filter(k => k.team === t).sort(byOrder(ATTACK_ORDER))
          .map(k => UI.tile({ name: k.name, pos: 'GK', tap: 'keeper', data: { pid: k.pid } })).join('') + `</div>`).join('') +
      `</div>` + UI.seg('stype', [{ value: 'save', label: 'Save' }, { value: 'penaltySave', label: 'Penalty save' }], st.stype));
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

  // ---------------------------------------------------------------- console screen
  function clockText(sess) {
    const st = Clock.status(sess);
    if (st === 'idle') return '0:00';
    return Clock.fmtClock(Clock.elapsedMs(sess) || 0);
  }
  function phaseText(sess) {
    const st = Clock.status(sess);
    if (st === 'stoppage') return `${sess.timer.htLogged ? '2nd half' : '1st half'} · +${Clock.fmtClock(Clock.stoppageMs(sess))}`;
    return Clock.phase(sess);
  }
  function poleText(sess) {
    const f = Scoring.formatOf(sess);
    if (f.legacy) return '';
    const k = keeperNames(sess);
    if (f.start === 'small' && f.switchedAt == null) return 'Small poles · no keepers';
    if (f.start === 'small') return `Big poles since ${f.switchedAt}'${k.length ? ' · ' + k.join(', ') : ''}`;
    return `Big poles${k.length ? ' · ' + k.join(', ') : ''}`;
  }

  function controlsHtml(sess) {
    const st = Clock.status(sess);
    const player = UI.btn('+ Player', { kind: 'g', sm: true, tap: 'player' });
    if (st === 'idle') return `<div class="cn-ctl cn-ctl-idle">${UI.btn('Kick off', { kind: 'w', tap: 'ctl', data: { act: 'kick' }, cls: 'cn-kick' })}${player}</div>`;
    if (st === 'ended') return `<div class="cn-ctl cn-ctl-ft">${UI.btn('Full-time check', { kind: 'w', tap: 'ftcheck', cls: 'cn-kick' })}</div>`;
    const busy = Date.now() < ctlBusyUntil ? ' is-locked' : '';
    const a = st === 'paused' ? UI.btn('Resume', { kind: 'g', sm: true, tap: 'ctl', data: { act: 'resume' }, cls: busy })
      : UI.btn('Pause', { kind: 'g', sm: true, tap: 'ctl', data: { act: 'pause' }, cls: busy, attrs: st === 'stoppage' ? ' disabled' : '' });
    const b = st === 'stoppage' ? UI.btn('End stoppage', { kind: 'g', sm: true, tap: 'ctl', data: { act: 'endStoppage' }, cls: 'cn-on' + busy })
      : UI.btn('+ Stoppage', { kind: 'g', sm: true, tap: 'ctl', data: { act: 'stoppage' }, cls: busy, attrs: st === 'paused' ? ' disabled' : '' });
    return `<div class="cn-ctl">${a}${b}${player}</div>`;
  }

  function renderConsole(el) {
    const sid = Store.activeSessionId();
    const sess = sid && Store.session(sid);
    if (!sess) {
      el.innerHTML = UI.empty('No game on', '') + UI.btn('Back to Match', { kind: 'g', sm: true, tap: 'home' });
      return;
    }
    const teams = teamsOf(sess);
    const st = Clock.status(sess);
    const live = Clock.canLog(sess);
    const ended = st === 'ended';
    const f = Scoring.formatOf(sess);
    const pill = poleText(sess);
    const evs = eventsNewest(sess);
    const off = live ? '' : ' cn-off';
    const goalCols = teams.length === 3 ? 3 : 2;
    const acts = (f.everBig ? ['save'] : []).concat(['block', 'clearance', 'card']);
    const actLabel = { save: 'Save', block: 'Block', clearance: 'Clear', card: 'Card' };

    el.innerHTML =
      `<div class="cn-score">${UI.score({
        teams: teams.map(t => ({ team: t, goals: Scoring.teamGoals(sess, t) })),
        mid: `<div class="clock n cn-clock">${esc(clockText(sess))}</div><div class="clock-s cn-phase">${esc(phaseText(sess))}</div>`,
      })}${pill ? `<div class="cn-pill">${UI.pill(pill)}</div>` : ''}</div>` +
      controlsHtml(sess) +
      (ended ? '' :
        `<div class="cn-goals" style="--cols:${goalCols}">` + teams.map(t =>
          `<button type="button" class="tile team t-${esc(t)} cn-goal${off}" data-tap="goal" data-team="${esc(t)}"><b>Goal</b><small>${esc(fmtTeam(t))}</small></button>`).join('') + `</div>` +
        `<div class="grid4 cn-acts" style="--cols:${acts.length}">` + acts.map(k =>
          `<button type="button" class="tile cn-act${off}" data-tap="act" data-kind="${k}">${svg(k === 'card' ? 'card' : k)}<b>${actLabel[k]}</b></button>`).join('') + `</div>`) +
      `<div class="lbl cn-latest"><span>Latest</span><button type="button" class="cn-all" data-tap="all">All${evs.length ? ' ' + evs.length : ''} ›</button></div>` +
      `<div class="rows cn-feed">${evs.length ? evs.slice(0, 3).map(e => eventRow(e, sess)).join('') : '<div class="r cn-none"><span class="grow kind">Nothing logged yet</span></div>'}</div>`;
  }

  function tickConsole(el) {
    const sess = Store.activeSession();
    if (!sess) return;
    const c = el.querySelector('.cn-clock'), p = el.querySelector('.cn-phase');
    if (c) c.textContent = clockText(sess);
    if (p) p.textContent = phaseText(sess);
    if (Date.now() >= ctlBusyUntil) el.querySelectorAll('.cn-ctl .is-locked').forEach(b => b.classList.remove('is-locked'));
  }

  App.registerScreen('ref.console', {
    tab: 'match', layout: 'phone', console: true,
    header: () => ({ right: `<button type="button" class="hd-btn cn-more" data-cn-more aria-label="Match menu">${UI.icon('more')}</button>` }),
    mount(el, ctx) {
      const sid = () => Store.activeSessionId();
      UI.on(el, 'home', () => App.go('ref.home', {}, { replace: true }));
      UI.on(el, 'all', () => App.go('ref.events', { sid: sid() }));
      UI.on(el, 'ev', b => App.action('fix.eventSheet', { sid: sid(), eid: b.dataset.eid }));
      UI.on(el, 'player', () => App.action('setup.addArrival', { sid: sid() }));
      UI.on(el, 'ftcheck', () => App.go('ref.ftcheck', { sid: sid() }));
      UI.on(el, 'ctl', b => clockAction(sid(), b.dataset.act, b));
      UI.on(el, 'goal', b => openGoal(sid(), b.dataset.team));
      UI.on(el, 'act', b => {
        const k = b.dataset.kind;
        if (k === 'save') openSave(sid()); else openAction(sid(), k);
      });
      const onDoc = e => { if (e.target.closest && e.target.closest('[data-cn-more]')) App.action('console.menu', { sid: sid() }); };
      document.addEventListener('click', onDoc);
      ctx.onCleanup(() => document.removeEventListener('click', onDoc));
      ctx.every(1000, () => tickConsole(el));
    },
    render(el) { renderConsole(el); },
  });

  // ---------------------------------------------------------------- ⋯ match menu
  function openMenu(args) {
    const sid = (args && args.sid) || Store.activeSessionId();
    const sess = Store.session(sid);
    if (!sess) return null;
    const st = Clock.status(sess);
    const f = Scoring.formatOf(sess);
    const evs = Scoring.sessEvents(sess);
    const ht = evs.find(e => e.type === 'halfTime');
    const atHalfTime = st === 'paused' && sess.timer && sess.timer.pauseReason === 'halftime';
    const teams = teamsOf(sess);
    const on = playersOf(sess);
    const kick = sess.timer && sess.timer.startedAt ? `Kick-off ${UI.fmt.time(sess.timer.startedAt)}` : 'Not started';
    const sub = atHalfTime ? `Half time · ${ht ? Scoring.minuteText(ht) : minuteNow(sess)}`
      : st === 'ended' ? 'Full time' : kick + (ht ? ` · half time at ${Scoring.minuteText(ht)}` : '');
    const stopMs = Clock.stoppageMs(sess);
    const rowsHtml = [];
    if (f.start === 'small' && f.switchedAt == null && st !== 'ended')
      rowsHtml.push(UI.row({ tap: 'poles', title: 'Switch to big poles', chevron: true, cls: 'cn-first' }));
    if (st !== 'ended') rowsHtml.push(UI.row({ tap: 'arrival', title: 'Add a player', right: `<span class="meta">${on.length} on</span>`, chevron: true }));
    rowsHtml.push(UI.row({ tap: 'teams', title: 'Teams tonight',
      right: `<span class="meta">${esc(teams.map(t => `${fmtTeam(t)} ${on.filter(p => p.team === t).length}`).join(' · '))}</span>`, chevron: true }));
    rowsHtml.push(UI.row({ tap: 'events', title: 'Edit events', right: evs.length ? `<span class="meta n">${evs.length}</span>` : '', chevron: true }));
    if (ht) rowsHtml.push(UI.row({ title: 'Half time', right: `<span class="meta">done · ${esc(Scoring.minuteText(ht))}</span>` }));
    else if (Clock.canLog(sess)) rowsHtml.push(UI.row({ tap: 'halftime', title: 'Half time', right: `<span class="meta n">${esc(minuteNow(sess))}</span>`, chevron: true }));
    if (stopMs > 0 || st === 'stoppage')
      rowsHtml.push(UI.row({ title: 'Stoppage so far', right: `<span class="meta n cn-stop">+${esc(Clock.fmtClock(stopMs))}</span>` }));

    const footer =
      (atHalfTime ? UI.btn('Resume second half', { kind: 'g', tap: 'resume2' }) : '') +
      (st === 'ended' ? UI.btn('Full-time check', { kind: 'w', tap: 'ftcheck' }) : UI.hold('Hold to end the game', { name: 'end', doneText: 'Ending…' }));
    const h = openSheet({ title: 'Match', sub, body: UI.rows(rowsHtml), footer, cls: 'sh-console sh-console-menu' });
    if (!h) return null;

    const go = (fn) => () => { h.close(); fn(); };
    onPick(h, 'poles', go(() => App.action('setup.bigPoles', { sid })));
    onPick(h, 'arrival', go(() => App.action('setup.addArrival', { sid })));
    onPick(h, 'teams', go(() => App.action('setup.teamsTonight', { sid })));
    onPick(h, 'events', go(() => App.go('ref.events', { sid })));
    onPick(h, 'ftcheck', go(() => App.go('ref.ftcheck', { sid })));
    onPick(h, 'resume2', go(() => clockAction(sid, 'resume', null)));
    onPick(h, 'halftime', el => {
      const s = Store.session(sid);
      if (!Clock.canLog(s) || (s.timer && s.timer.htLogged)) return;
      const now = Store.now();
      const eid = Store.newKey();
      const ev = Clock.stamp({ type: 'halfTime' }, s, now);
      ev.timestamp = now; ev.by = Auth.by();
      const prev = s.timer;
      const base = `sessions/${sid}`;
      h.save = Save.run({
        label: `Half time ${Scoring.minuteText(ev)}`.trim(), button: el, group: h.el,
        write: () => Store.multi({ [`${base}/timer`]: Clock.halfTime(s, now), [`${base}/events/${eid}`]: ev }),
        undo: () => Store.multi({ [`${base}/timer`]: prev, [`${base}/events/${eid}`]: null }),
        onSaved: () => h.close(),
      });
    });
    UI.onHold(h.el, 'end', () => endGame(sid, h));
    const t = setInterval(() => {
      if (h.closed) { clearInterval(t); return; }
      const s = Store.session(sid), x = h.el.querySelector('.cn-stop');
      if (s && x) x.textContent = '+' + Clock.fmtClock(Clock.stoppageMs(s));
    }, 1000);
    return h;
  }

  // End game: stop the clock (Clock.end keeps the final minute) and open the full-time check.
  // status stays 'active' (not 'completed'): ref.ftcheck treats "timer ended + not completed" as being checked,
  // and its Publish sets status 'completed', goals, cleanSheets and ftCheck.
  function endGame(sid, h) {
    const sess = Store.session(sid);
    if (!sess) return;
    const now = Store.now();
    const timer = Clock.isActive(sess) ? Clock.end(sess, now)
      : Object.assign({}, sess.timer || {}, { status: 'ended', endedAt: (sess.timer && sess.timer.endedAt) || now });   // never kicked off
    Store.set(`sessions/${sid}/timer`, timer).catch(() => UI.toast('Not saved · no signal', { err: true }));
    if (h) h.close();
    App.go('ref.ftcheck', { sid });
  }

  App.registerAction('console.menu', openMenu);

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
    return `<div class="rows cn-evlist">${shown.map(e => eventRow(e, sess, { chevron: true })).join('')}</div>`;
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
        center: `Events${c ? ` · <span class="n cn-evclock">${esc(c)}</span>` : ''}`, right: '' };
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
