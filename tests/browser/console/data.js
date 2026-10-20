// Test data for the console: the real snapshot plus one ACTIVE session built from Mon 27 Jul's real teams (26 players, 4 keepers).
const H = require('../harness.js');
const SRC = '-Oy_1BtNsEE82ATl5uSM';   // Mon 27 Jul 2026, 26 players
function liveData(o = {}) {
  const d = H.snapshot();
  const src = d.sessions[SRC];
  const sess = { date: '2026-10-19', status: 'active', mode: 'live', teams: JSON.parse(JSON.stringify(src.teams)) };
  if (o.format !== null) sess.format = o.format || { start: 'small' };
  if (o.timer) sess.timer = o.timer;
  if (o.events) sess.events = o.events;
  // the real 19 Oct session in the snapshot is completed; ours is the only active one
  d.sessions.test_live = sess;
  return d;
}
module.exports = { liveData, SRC };
