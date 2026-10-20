/* ============================================================================
   BE Fit Club · js/core/teams.js · teams and club settings are DATA, not code
   ----------------------------------------------------------------------------
   The admin's Settings (round 5) live in the database root `settings`:
     settings/club          = { name, seasonLabel, fee, quickAmounts:[60,120], currency, matchDay }
     settings/teams/{id}    = { name, colour, order, active }
       id      the key sessions already use for the side ('green', 'red', 'blue', 'gold').
               A new team's id is its colour (Settings › Teams › Add a team picks an unused colour).
       colour  one of the built-in colours: 'green' | 'red' | 'blue' | 'gold' (tokens.css)
       order   1, 2, 3 …  sets left and right (lowest = left) and list order
       active  false = kept for old matches, not offered for new ones
   When `settings` is missing (before an admin saves Settings) everything falls back to
   today's config: Green (left) and Red (right), ₵60, quick amounts 60 · 120.
   The classic app never reads this root.

   API (window.Teams)
     Teams.COLOURS                    ['green','red','blue','gold']  the built-in colours
     Teams.all()                      every team (active or not), by order → [{ id, name, colour, order, active }]
     Teams.list()                     active teams only, by order (who can play tonight)
     Teams.ids()                      Teams.list().map(t => t.id)
     Teams.get(id)                    one team; an unknown id (an old match) gets a sensible stand-in
     Teams.name(id)                   'Green'  (UI.fmt.team uses this)
     Teams.colour(id)                 'green'  (the colour key)
     Teams.cls(id)                    't-green' (sets --tc: put it on anything team-coloured, with the team word)
     Teams.order(ids)                 sorts any list of team ids left → right
     Teams.rank(id)                   the sort key used by order()
     Teams.unusedColours()            colours no team has yet (for Add a team)
     Teams.club()                     { name, seasonLabel, fee, quickAmounts, currency, matchDay } with fallbacks
     Teams.fromSettings(settings)     the same list from any settings object (pure; for previews and tests)
     Teams.writeFor(team)             { 'settings/teams/<id>': {name, colour, order, active} } for Store.multi
     Teams.applyCss()                 (re)writes the .t-<id> colour rules; the app calls it on every data change
   ========================================================================== */
(function (root) {
  'use strict';
  const CFG = root.BF_CONFIG || {};
  const COLOURS = ['green', 'red', 'blue', 'gold'];
  const FALLBACK = [
    { id: 'green', name: 'Green', colour: 'green', order: 1, active: true },
    { id: 'red', name: 'Red', colour: 'red', order: 2, active: true },
  ];
  const cap = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
  const safeId = id => String(id || '').replace(/[^A-Za-z0-9_-]/g, '');

  function settings() {
    const S = root.Store && root.Store.state;
    return (S && S.settings) || {};
  }

  function fromSettings(st) {
    const raw = (st && st.teams) || null;
    if (!raw || typeof raw !== 'object' || !Object.keys(raw).length) return FALLBACK.map(t => Object.assign({}, t));
    return Object.entries(raw).filter(([, t]) => t && typeof t === 'object').map(([id, t], i) => {
      const colour = COLOURS.includes(t.colour) ? t.colour : (COLOURS.includes(id) ? id : 'green');
      return { id, name: t.name || cap(id), colour, order: Number.isFinite(Number(t.order)) ? Number(t.order) : 50 + i, active: t.active !== false };
    }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  // memo per settings object (Store.state is replaced on every change)
  let memoSrc = null, memoList = null;
  function all() {
    const st = settings();
    if (st !== memoSrc || !memoList) { memoSrc = st; memoList = fromSettings(st); }
    return memoList;
  }
  const list = () => all().filter(t => t.active);
  const ids = () => list().map(t => t.id);

  function get(id) {
    const t = all().find(x => x.id === id);
    if (t) return t;
    // A team from an old match that is not in Settings: keep its own colour if it is a built-in one.
    const k = COLOURS.indexOf(id);
    return { id, name: cap(id), colour: k >= 0 ? id : 'green', order: 90 + (k >= 0 ? k : 9), active: false, unknown: true };
  }
  const rank = id => get(id).order;
  const order = teamIds => [...teamIds].sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)));
  const unusedColours = () => { const used = new Set(all().map(t => t.colour)); return COLOURS.filter(c => !used.has(c)); };

  function club() {
    const c = settings().club || {};
    const quick = Array.isArray(c.quickAmounts) && c.quickAmounts.length ? c.quickAmounts.map(Number).filter(n => n > 0) : null;
    const fee = Number(c.fee) > 0 ? Number(c.fee) : (CFG.fee || 60);
    return {
      name: c.name || 'BE Fit Club',
      seasonLabel: c.seasonLabel || CFG.seasonLabel || 'Season',
      fee,
      quickAmounts: quick || [fee, fee * 2],
      currency: c.currency || CFG.currency || '₵',
      matchDay: Number.isInteger(Number(c.matchDay)) && c.matchDay !== '' && c.matchDay != null ? Number(c.matchDay) : 1,   // 0 Sun … 6 Sat
    };
  }

  function writeFor(t) {
    const id = safeId(t.id || t.colour);
    return { ['settings/teams/' + id]: { name: String(t.name || cap(id)), colour: COLOURS.includes(t.colour) ? t.colour : id, order: Number(t.order) || all().length + 1, active: t.active !== false } };
  }

  // One <style> with a .t-<id> rule per team, so a team's colour comes from Settings.
  let lastCss = '';
  function applyCss() {
    if (typeof document === 'undefined') return;
    const css = all().map(t => { const id = safeId(t.id); return id ? `.t-${id}{--tc:var(--${t.colour})}` : ''; }).join('\n');
    if (css === lastCss) return;
    lastCss = css;
    let el = document.getElementById('bf-team-css');
    if (!el) { el = document.createElement('style'); el.id = 'bf-team-css'; document.head.appendChild(el); }
    el.textContent = css;
  }

  const Teams = {
    COLOURS, FALLBACK, all, list, ids, get, rank, order, unusedColours, club, fromSettings, writeFor, applyCss,
    name: id => get(id).name,
    colour: id => get(id).colour,
    cls: id => 't-' + safeId(id),
  };
  root.Teams = Teams;
  if (typeof module !== 'undefined' && module.exports) module.exports = Teams;
  if (root.Store && root.Store.on) { root.Store.on(applyCss); applyCss(); }
})(typeof window !== 'undefined' ? window : globalThis);
