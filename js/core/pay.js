/* ============================================================================
   BE Fit Club · js/core/pay.js · THE payments rule (the only one)
   ----------------------------------------------------------------------------
   Read-only maths over paymentDays + sessions, used by Money (admin.js) and
   Me › Subs (player.js), so both screens always agree. Same rules as classic:
     - a date is "entered" when it has a payment record: paymentDays/{date}, or
       the legacy sessions/{sid}/payments on that date;
     - someone who PLAYED on an entered date with ₵0 or no amount is "not paid";
     - a date with no record is "not entered" for everyone (nobody owes it);
     - the newest record (updatedAt) wins when a date has more than one.
   Every function takes an optional db (defaults to Store.state), like Scoring.

   PUBLIC API (window.BF_PAY, frozen)
     status(pid, date, db?)  → 'paid' | 'not paid' | 'not entered' | null (didn't play, didn't pay)
     owed(pid, db?)          → ['2026-08-24', ...] dates this player owes, oldest first
     amount(pid, date, db?)  → ₵ amount on that date (0 if none)
     hasRecord(date, db?)    → bool
     day(date, db?)          → the Money row summary { played, paid, paidPlayed, notPaid, others, total, entered, isMatch, active }
     dates(db?)              → every money date, newest first · overview(db?) → the Money list model
     helpers: amountOf, recTime, isDate, sessionsOn, recordsFor, arrivalMin, playedOn
   ========================================================================== */
(function () {
  'use strict';
  const amountOf = rec => { const raw = typeof rec === 'number' ? rec : rec && rec.amount; const n = Number(raw); return Number.isFinite(n) && n > 0 ? n : 0; };
  const recTime = rec => (rec && typeof rec === 'object' ? Number(rec.updatedAt) || 0 : 0);
  const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

  function sessionsOn(date, db) {
    return Object.entries((db || Store.state).sessions || {}).filter(([, s]) => s && s.date === date);
  }
  function recordsFor(date, db) {
    db = db || Store.state;
    const merged = {};
    const put = (pid, rec) => { if (rec == null) return; if (merged[pid] == null || recTime(rec) >= recTime(merged[pid])) merged[pid] = rec; };
    sessionsOn(date, db).forEach(([, s]) => Object.entries(s.payments || {}).forEach(([pid, r]) => put(pid, r)));
    Object.entries(((db.paymentDays || {})[date] || {}).payments || {}).forEach(([pid, r]) => put(pid, r));
    return merged;
  }
  // Late arrivals, as setup.js stores them: teams/{team}/players/{pid} = { position, arrived?: { at: 23 }, moved?: { from, at } }
  function arrivalMin(pd) {
    const at = pd && pd.arrived && typeof pd.arrived === 'object' ? Number(pd.arrived.at) : NaN;
    return Number.isFinite(at) && at > 0 ? at : null;
  }
  // Who played on a date (every session that day): pid → { team, pos, tag }
  function playedOn(date, db) {
    db = db || Store.state;
    const out = new Map();
    for (const [, s] of sessionsOn(date, db)) {
      const f = Scoring.formatOf(s);
      for (const [team, td] of Object.entries(s.teams || {})) {
        for (const [pid, pd] of Object.entries((td && td.players) || {})) {
          if (out.has(pid) || !(db.players || {})[pid]) continue;
          let tag = '';
          if (f.switchedAt != null && f.keepers && f.keepers[team] === pid) tag = `keeper · ${f.switchedAt}'`;
          else if (arrivalMin(pd) != null) tag = `arrived ${arrivalMin(pd)}'`;
          out.set(pid, { team, pos: pd && pd.position, tag });
        }
      }
    }
    return out;
  }
  // ONE rule for "paid / not paid / not entered" (shared with Me › Subs via window.BF_PAY):
  //   a date is "entered" when it has a payment record: paymentDays/{date} exists, or the legacy
  //   sessions/{sid}/payments on that date (3 Aug) has entries. Then someone who PLAYED with ₵0 or no
  //   amount is "not paid". A date with no record is "not entered" for everyone (nobody owes it).
  function hasRecord(date, db) {
    db = db || Store.state;
    return !!(db.paymentDays || {})[date] || sessionsOn(date, db).some(([, s]) => s.payments && Object.keys(s.payments).length > 0);
  }
  // → 'paid' | 'not paid' | 'not entered' | null (didn't play and didn't pay: nothing to say)
  function payStatus(pid, date, db) {
    db = db || Store.state;
    if (amountOf(recordsFor(date, db)[pid]) > 0) return 'paid';
    if (!playedOn(date, db).has(pid)) return null;
    return hasRecord(date, db) ? 'not paid' : 'not entered';
  }
  // Every date a player owes: [{ date }], oldest first.
  function owedDates(pid, db) {
    db = db || Store.state;
    const dates = [...new Set(Object.values(db.sessions || {}).map(s => s && s.date).filter(isDate))].sort();
    return dates.filter(d => payStatus(pid, d, db) === 'not paid');
  }
  function daySummary(date, db) {
    db = db || Store.state;
    const players = db.players || {};
    const played = playedOn(date, db);
    const recs = recordsFor(date, db);
    let total = 0, paid = 0, paidPlayed = 0;
    for (const [pid, rec] of Object.entries(recs)) {
      if (!players[pid]) continue;                     // classic counts registered players only
      const a = amountOf(rec);
      if (a > 0) { paid++; total += a; if (played.has(pid)) paidPlayed++; }
    }
    const sess = sessionsOn(date, db);
    const entered = hasRecord(date, db);
    return { date, played: played.size, paid, paidPlayed, notPaid: entered ? played.size - paidPlayed : 0, others: paid - paidPlayed, total, entered,
      isMatch: played.size > 0, active: sess.some(([, s]) => s.status === 'active') };
  }
  // Every date that matters for money: match days with players, payment days, legacy payments. Newest first.
  function moneyDates(db) {
    db = db || Store.state;
    const dates = new Set();
    Object.entries(db.paymentDays || {}).forEach(([k, d]) => { const date = (d && d.date) || k; if (isDate(date)) dates.add(date); });
    Object.values(db.sessions || {}).forEach(s => {
      if (s && isDate(s.date) && (Scoring.sessPlayers(s, db).length || Object.keys(s.payments || {}).length)) dates.add(s.date);
    });
    return [...dates].sort((a, b) => b.localeCompare(a));
  }
  function moneyOverview(db) {
    db = db || Store.state;
    const rows = moneyDates(db).map(d => daySummary(d, db));
    const withMoney = rows.filter(r => r.entered);
    const first = withMoney.length ? withMoney[withMoney.length - 1].date : null;
    const last = withMoney.length ? withMoney[0].date : null;
    const tracked = rows.filter(r => !first || r.date >= first);
    const earlier = first ? rows.filter(r => r.date < first) : [];
    const missing = tracked.filter(r => r.isMatch && !r.entered && !r.active);
    return { rows, tracked, earlier, first, last, total: withMoney.reduce((s, r) => s + r.total, 0), missing };
  }

  window.BF_PAY = Object.freeze({
    status: payStatus, owed: owedDates, hasRecord, day: daySummary,
    amount: (pid, date, db) => amountOf(recordsFor(date, db)[pid]),
    dates: moneyDates, overview: moneyOverview,
    amountOf, recTime, isDate, sessionsOn, recordsFor, arrivalMin, playedOn,
  });
})();
