// Test data for the fulltime area (TEST MODE ONLY): copies of real matches, never the real database.
const H = require('../harness.js');
const SID19 = '-P4KcMogcPM8_RRG9wAQ', COPY = 'zz_r5_copy_19oct', SID20 = '-Oy-xrzTcJG36b_J29aK', SID12 = '-P3lenQyxWIniPyrtFAn';
const clone = v => JSON.parse(JSON.stringify(v));
// 19 Oct re-created as a fresh full-time check: the stoppage left running after half time.
//   style 'r5'  : a round 5 timer (stoppageAtHalf = 5 min) and labels restarting each half (46+1' … 46+12', the design and the refreshed snapshot)
//   style 'old' : the timer and labels exactly as recorded on 19 Oct (46+7' … 46+18', cumulative)
function copy19(style) {
  const data = H.snapshot();
  const s = clone(data.sessions[SID19]);
  delete data.sessions[SID19];
  s.status = 'active';
  s.ftCheck = { status: 'checking' };
  delete s.goals; delete s.cleanSheets; delete s.publishedBy;
  const ht = Object.values(s.events).find(e => e.type === 'halfTime');
  // the event added at 22:46 (after full time) is not part of the pattern: keep it (it has a picked minute)
  // The snapshot refreshed on 20 Oct already holds the corrected labels (46+1' … 46+12'). 'old' takes each event's
  // minutes from tests/fixtures/19oct-stoppage-as-recorded.json (the night as first recorded) to re-create the night exactly as first recorded
  // (cumulative, 46+7' … 46+18').
  if (style !== 'old') s.timer = Object.assign({}, s.timer, { stoppageAtHalf: 300000 });
  else {
    const early = JSON.parse(require('fs').readFileSync(require('path').join(H.FIXTURES, '19oct-stoppage-as-recorded.json'), 'utf8'));
    Object.entries(s.events).forEach(([k, e]) => { const o = early.events[k]; if (o && e.stoppageMin != null) { e.stoppageMin = o.stoppageMin; e.stoppageBaseMin = o.stoppageBaseMin; } });
  }
  data.sessions[COPY] = s;
  return data;
}
function data20Jul() {   // as fix-e2e: 20 Jul as if End game just happened, with a re-injected double tap
  const data = H.snapshot();
  const P = {}; Object.entries(data.players).forEach(([pid, p]) => { P[p.name] = pid; });
  const s = data.sessions[SID20];
  const ts = Object.values(s.events).map(e => e.timestamp);
  s.status = 'active';
  s.timer = { status: 'ended', startedAt: Math.min(...ts) - 60000, endedAt: Math.max(...ts) + 60000, pausedTotal: 0, htLogged: false };
  s.ftCheck = { status: 'checking' };
  delete s.goals; delete s.cleanSheets;
  const ab = Object.values(s.events).find(e => e.type === 'block' && e.playerId === P.Andrew);
  s.events.zz_dup_andrew = { type: 'block', playerId: P.Andrew, timestamp: ab.timestamp + 680, by: 'referee' };
  return data;
}
module.exports = { copy19, data20Jul, SID19, COPY, SID20, SID12, clone };
