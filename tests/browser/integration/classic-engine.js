// Pull classic.html's engine out by function name (same method as phase1/engine-test.js) and bind it to a db.
const fs = require('fs');
const path = require('path');
const REPO = require('../../paths.js').REPO;
const src = fs.readFileSync(path.join(REPO, 'classic.html'), 'utf8');
function grab(re) {
  const m = src.match(re);
  if (!m) throw new Error('not found: ' + re);
  let i = m.index + m[0].length - 1, depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(m.index, i + 1) + (src[i + 1] === ';' ? ';' : '');
}
const parts = [
  grab(/const SCORE = \{/),
  grab(/function defActionPoints\([^)]*\) \{/),
  "const ALL_TEAMS = ['red','green','blue','gold'];",
  ...['sessPlayers', 'sessEvents', 'goalsFor', 'getTeamGoals', 'getActiveTeams', 'calcMatchPoints',
      'calcStats', 'calcTeams', 'calcStreak', 'calcForm', 'getPlayerHistory'].map(n => grab(new RegExp('function ' + n + '\\([^)]*\\) \\{'))),
];
const body = parts.join('\n') + '\nreturn {calcStats,calcMatchPoints,calcTeams,calcStreak,calcForm,getPlayerHistory,sessPlayers,getTeamGoals};';
module.exports = db => new Function('S', body)(db);
module.exports.Scoring = require(path.join(REPO, 'js/core/scoring.js'));
module.exports.REPO = REPO;
