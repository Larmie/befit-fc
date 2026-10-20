// Where everything lives for the tests. One place, so no test hard-codes a folder on Reuben's laptop.
//   REPO      the app (the folder above tests/)
//   SNAPSHOT  the read-only copy of the live data: tests/.data/snapshot.json (git-ignored; `npm run snapshot`)
//             override with BEFIT_SNAPSHOT=<file>
//   OUT       test output (screenshots, result files, written-data dumps): tests/.out/ (git-ignored)
//   CACHE     downloaded fonts: tests/.cache/ (git-ignored)
//   chrome()  the installed Chrome; override with CHROME_PATH=<exe>
'use strict';
const fs = require('fs');
const path = require('path');

const TESTS = __dirname;
const REPO = path.resolve(TESTS, '..');
const SNAPSHOT = process.env.BEFIT_SNAPSHOT ? path.resolve(process.env.BEFIT_SNAPSHOT) : path.join(TESTS, '.data', 'snapshot.json');
const OUT = path.join(TESTS, '.out');
const CACHE = path.join(TESTS, '.cache');
const BROWSER = path.join(TESTS, 'browser');
const FIXTURES = path.join(TESTS, 'fixtures');

const CHROME_CANDIDATES = {
  win32: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium'],
};
function chrome() {
  const env = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env) return env;
  const found = (CHROME_CANDIDATES[process.platform] || []).find(p => p && fs.existsSync(p));
  if (!found) throw new Error('Chrome not found. Install Google Chrome, or set CHROME_PATH to its chrome executable.');
  return found;
}

// The output folder that mirrors a suite's folder: out(__dirname, 'shots') in tests/browser/admin → tests/.out/admin/shots
function out(dir, ...parts) {
  const target = path.join(OUT, path.relative(BROWSER, path.resolve(dir, ...parts)));
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function snapshot() {
  if (!fs.existsSync(SNAPSHOT)) throw new Error(`No test data at ${SNAPSHOT}. Run "npm run snapshot" first (a read-only copy of the live data).`);
  return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
}

module.exports = { TESTS, REPO, SNAPSHOT, OUT, CACHE, BROWSER, FIXTURES, chrome, out, snapshot };
