/* ============================================================================
   BE Fit Club · js/core/clock.js · the match clock (same maths as classic)
   ----------------------------------------------------------------------------
   The timer is stored as start times, not a ticking counter, so a refresh loses
   nothing. sessions/{sid}/timer = { status:'idle'|'running'|'paused'|'stoppage'|'ended',
     startedAt, pausedAt, pausedTotal, htLogged, pauseReason, endedAt,
     stoppageStartedAt, stoppageTotal, stoppageBaseTotalMs }

   READ
     Clock.status(sess)                  'idle' | 'running' | 'paused' | 'stoppage' | 'ended'
     Clock.isActive(sess)                running, paused or stoppage
     Clock.canLog(sess)                  running or stoppage (events need a live clock)
     Clock.elapsedMs(sess, now?)         regular time on the clock
     Clock.stoppageMs(sess, now?)        all stoppage so far (cumulative, as decided 3 Aug)
     Clock.minuteParts(sess, now?)       { min, stoppageBaseMin?, stoppageMin? } | null
     Clock.minute(sess, now?)            the current match minute, or null
     Clock.phase(sess)                   'Not started' | '1st half' | 'Half time' | '2nd half' | 'Paused' | 'Full time'
     Clock.fmtClock(ms)                  '72:18'
     Clock.fmtMinute(ev)                 "72'" or "45+2'" (or '' when the event has no minute)
   NEW TIMER OBJECTS (pure; write the result to sessions/{sid}/timer)
     Clock.kickOff(now) · halfTime(sess, now) · pause(sess, now) · resume(sess, now)
     Clock.startStoppage(sess, now) · endStoppage(sess, now) · end(sess, now)
     Clock.stamp(evData, sess, now)      adds min / stoppage minutes to a new event (mutates + returns it)
   ========================================================================== */
(function () {
  'use strict';
  const nowMs = () => (window.Store ? window.Store.now() : Date.now());

  function status(sess) { return (sess && sess.timer && sess.timer.status) || 'idle'; }
  const isActive = sess => ['running', 'paused', 'stoppage'].includes(status(sess));
  const canLog = sess => ['running', 'stoppage'].includes(status(sess));

  function elapsedMs(sess, now) {
    now = now == null ? nowMs() : now;
    const t = sess && sess.timer;
    if (!t || !t.startedAt || t.status === 'idle') return null;
    let ref;
    if (t.status === 'ended') ref = t.endedAt || now;
    else if (t.status === 'paused') ref = t.pausedAt || now;
    else if (t.status === 'stoppage') ref = t.stoppageStartedAt || now;
    else ref = now;
    return Math.max(0, ref - t.startedAt - (t.pausedTotal || 0));
  }

  function stoppageMs(sess, now) {
    now = now == null ? nowMs() : now;
    const t = sess && sess.timer;
    if (!t || t.status === 'idle') return 0;
    const current = t.status === 'stoppage' && t.stoppageStartedAt ? Math.max(0, now - t.stoppageStartedAt) : 0;
    return (t.stoppageTotal || 0) + current;
  }

  function minuteParts(sess, now) {
    now = now == null ? nowMs() : now;
    const t = sess && sess.timer;
    if (!t || !t.startedAt || t.status === 'idle') return null;
    const regular = elapsedMs(sess, now);
    if (regular == null) return null;
    const parts = { min: Math.max(1, Math.ceil(regular / 60000)) };
    if (t.status === 'stoppage') {
      const base = Number.isFinite(t.stoppageBaseTotalMs) ? t.stoppageBaseTotalMs : regular;
      parts.stoppageBaseMin = Math.max(1, Math.ceil(base / 60000));
      parts.stoppageMin = Math.max(1, Math.ceil(stoppageMs(sess, now) / 60000));
    }
    return parts;
  }
  const minute = (sess, now) => { const p = minuteParts(sess, now); return p ? p.min : null; };

  function stamp(evData, sess, now) {
    const p = minuteParts(sess, now);
    if (!p) return evData;
    evData.min = p.min;
    if (p.stoppageMin != null) { evData.stoppageBaseMin = p.stoppageBaseMin; evData.stoppageMin = p.stoppageMin; }
    return evData;
  }

  function fmtClock(ms) {
    const s = Math.max(0, Math.floor((ms || 0) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  const fmtMinute = ev => (window.Scoring ? window.Scoring.minuteText(ev) : '');

  function phase(sess) {
    const st = status(sess), t = (sess && sess.timer) || {};
    if (st === 'idle') return 'Not started';
    if (st === 'ended') return 'Full time';
    if (st === 'paused') return t.pauseReason === 'halftime' ? 'Half time' : 'Paused';
    return t.htLogged ? '2nd half' : '1st half';
  }

  function finalizeStoppage(timer, now) {
    const t = Object.assign({}, timer || {});
    if (t.status !== 'stoppage') return t;
    const d = Math.max(0, now - (t.stoppageStartedAt || now));
    t.stoppageTotal = (t.stoppageTotal || 0) + d;
    t.pausedTotal = (t.pausedTotal || 0) + d;
    t.stoppageStartedAt = null;
    t.stoppageBaseTotalMs = null;
    return t;
  }

  // ---- transitions (each returns the new timer object) ----
  const kickOff = now => ({ status: 'running', startedAt: now, pausedAt: null, pausedTotal: 0, htLogged: false,
    endedAt: null, stoppageStartedAt: null, stoppageTotal: 0, stoppageBaseTotalMs: null });
  const halfTime = (sess, now) => Object.assign(finalizeStoppage(sess.timer, now),
    { status: 'paused', pausedAt: now, htLogged: true, pauseReason: 'halftime' });
  const pause = (sess, now) => Object.assign({}, sess.timer, { status: 'paused', pausedAt: now, pauseReason: 'pause' });
  const resume = (sess, now) => Object.assign({}, sess.timer, { status: 'running', pausedAt: null, pauseReason: null,
    pausedTotal: (sess.timer.pausedTotal || 0) + (now - (sess.timer.pausedAt || now)) });
  const startStoppage = (sess, now) => Object.assign({}, sess.timer, { status: 'stoppage', stoppageStartedAt: now,
    stoppageBaseTotalMs: elapsedMs(sess, now), pauseReason: 'stoppage' });
  const endStoppage = (sess, now) => Object.assign(finalizeStoppage(sess.timer, now), { status: 'running', pauseReason: null });
  function end(sess, now) {
    if (!sess.timer || !isActive(sess)) return sess.timer || null;
    const t = finalizeStoppage(sess.timer, now);
    const endedAt = sess.timer.status === 'paused' ? (sess.timer.pausedAt || now) : now;
    return Object.assign(t, { status: 'ended', endedAt, pausedAt: null, pauseReason: null });
  }

  window.Clock = { status, isActive, canLog, elapsedMs, stoppageMs, minuteParts, minute, stamp, fmtClock, fmtMinute,
    phase, finalizeStoppage, kickOff, halfTime, pause, resume, startStoppage, endStoppage, end };
})();
