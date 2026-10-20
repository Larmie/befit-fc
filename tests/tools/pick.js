// The test picker: from the files a change touches, which browser suites can it affect?
// (BeFit's version of FPL Admin's scripts/check-selection.mjs.) It errs towards running a suite:
//   - an app file maps to "areas" (css/tables.css → tables, js/core/scoring.js → scoring) and every suite
//     sharing an area runs (tests/suites.js lists each suite's areas);
//   - the shared shell and look (js/ui/*, css/tokens|base|components.css, index.html) can break any screen:
//     every suite runs;
//   - a test file runs the suites that are, or use, that file;
//   - the test tooling itself (harness, paths, runner, package.json, CI) or ANY path it does not know: everything;
//   - docs, notes and design files: nothing (the unit checks still run, they always do).
'use strict';
const SUITES = require('../suites.js');

const SCREENS = 'welcome|player|tables|setup|console|fix|admin';
const AREA_RULES = [
  [new RegExp(`^js/screens/(${SCREENS})\\.js$`), m => [m[1]]],
  [new RegExp(`^css/(${SCREENS})\\.css$`), m => [m[1]]],
  [/^js\/core\/(scoring|pay|clock|teams|store|auth|config|practice)\.js$/, m => [m[1]]],
  [/^js\/core\/save\.js$/, () => ['store']],
  [/^sw\.js$/, () => ['offline']],
  [/^classic\.html$/, () => ['classic']],
];
// The shell and the shared look: any screen can change.
const EVERYTHING_APP = [/^js\/ui\//, /^css\/(tokens|base|components)\.css$/, /^index\.html$/];
// Test tooling: can change any result.
const EVERYTHING_TOOLS = [/^tests\/(paths|suites)\.js$/, /^tests\/browser\/harness\.js$/, /^tests\/tools\//, /^package(-lock)?\.json$/, /^\.github\//];
// Can't change what a browser suite sees (unit checks always run anyway; deploy files are checked on the preview).
const INERT = [/\.md$/, /^\.gitignore$/, /^\.gitattributes$/, /^\.claude\//, /^design-review\//, /^tests\/unit\//,
  /^tests\/known-failures\.json$/, /^(manifest\.json|icon\.svg|Image\.jpg|wrangler\.jsonc|_redirects|_headers)$/];

const norm = f => f.replace(/\\/g, '/').replace(/^\.\//, '');

// changed: repo-relative paths. Returns { all, reasons: [..], suites: [names in run order], why: {name: [reasons]} }
function pick(changed, suites = SUITES) {
  const files = [...new Set(changed.map(norm).filter(Boolean))];
  const why = {};
  const add = (name, reason) => { (why[name] = why[name] || []).push(reason); };
  let all = null;
  for (const f of files) {
    if (INERT.some(re => re.test(f))) continue;
    if (EVERYTHING_TOOLS.some(re => re.test(f))) { all = all || `${f} is test tooling`; continue; }
    if (EVERYTHING_APP.some(re => re.test(f))) { all = all || `${f} is shared by every screen`; continue; }
    const rule = AREA_RULES.find(([re]) => re.test(f));
    if (rule) {
      const areas = rule[1](f.match(rule[0]));
      for (const s of suites) if (s.areas.some(a => areas.includes(a))) add(s.name, `${f} (${areas.join(', ')})`);
      continue;
    }
    const tm = f.match(/^tests\/((browser|fixtures)\/.+)$/);
    if (tm) {
      const rel = tm[1];
      let hit = false;
      for (const s of suites) if ('browser/' + s.file === rel || (s.uses || []).includes(rel)) { add(s.name, f); hit = true; }
      if (!hit) all = all || `${f} is a test file no suite is listed for`;
      continue;
    }
    all = all || `${f} is not a path the picker knows`;
  }
  let names = all ? suites.map(s => s.name) : suites.filter(s => why[s.name]).map(s => s.name);
  // a suite that reads another suite's output needs that one first
  const byName = Object.fromEntries(suites.map(s => [s.name, s]));
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of names) for (const d of byName[n].needs || []) if (!names.includes(d)) { names.push(d); add(d, `needed by ${n}`); grew = true; }
  }
  names = suites.map(s => s.name).filter(n => names.includes(n));   // catalogue order
  return { all: !!all, reason: all, files, suites: names, why };
}

module.exports = { pick, AREA_RULES, EVERYTHING_APP, EVERYTHING_TOOLS, INERT };
