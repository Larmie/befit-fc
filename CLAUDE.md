# BE Fit Club

> Project context for this app. The OS rules and the "how to talk to me while coding" contract live in the
> parent `Claude Code\CLAUDE.md` and apply here automatically.

**How work gets done and released → `AGENTS.md`** (approvals, request → live routine, risk lanes, the checks,
the end-of-task report). If anything here disagrees with it, `AGENTS.md` wins.

## What it is
A mobile-first web app for a Monday night football group: live match logging by a referee, FPL-style points,
the season tables, and subs (payments). Plain files, no build step, no frameworks.

- **Live:** https://the-be-fit-club.pages.dev (Cloudflare Pages; every push to `main` deploys in about 40 s)
- **Branch previews:** `https://<branch, slashes as dashes>.the-be-fit-club.pages.dev`
- **Repo:** https://github.com/Larmie/befit-fc (public: never commit people's data, passwords or backups)
- **Practice mode:** add `?practice` to the URL: real data read once, nothing saved
- **Old app:** `/classic.html`, read-only, never edited (the engine check compares against it)

## Files
- `index.html` shell · `css/` (tokens, base, components + one file per screen) · `js/core/` (config, practice,
  store, teams, scoring, pay, clock, auth, save) · `js/ui/` (components, shell) · `js/screens/` (welcome, player,
  tables, setup, console, fix, admin) · `sw.js` network-first service worker
- `tests/`: unit checks (`tests/unit`), browser suites (`tests/browser`), runner and picker (`tests/tools`).
  First time: `npm ci` then `npm run snapshot`; day to day `npm run test:changed` (AGENTS.md §6). Tests never
  write to the real database.
- `design-review/`: mock-ups and backups, kept out of git (`.git/info/exclude`)

## Firebase
- Realtime Database, project `befit-fc` (`https://befit-fc-default-rtdb.firebaseio.com`); config in `js/core/config.js`.
- **Rules (locked 20 Oct 2026):** `players`, `sessions`, `paymentDays`, `settings` readable by everyone;
  `players`/`sessions`/`paymentDays` writable only by a signed-in user with a role in `roles/`; `settings` writable
  only by the admin; `roles/{uid}` readable only by that user; reading the whole database is refused.
- Logins are Firebase Auth email + password: the admin (Reuben) and one shared referee login. Any write from a
  script without a login is refused, which is good: tests and Claude never write to it.
- If the whole site stops loading for everyone at once, suspect the rules first:
  `curl -s -o /dev/null -w "%{http_code}" https://befit-fc-default-rtdb.firebaseio.com/players.json?shallow=true`
  (200 = fine, 401 = rules blocking).

## Roles
guest (Home · Match · Tables) · player (+ Me) · referee (console + Money tonight) · admin (Home · Squad · Money ·
Settings). Teams are data in `settings/teams` (Green and Red today; Blue and Gold ready). Teams are per night:
a usual-Red player may play Green. Max 9 outfield + 1 keeper per side.

## Rules Reuben decided (don't change without him)
- **Poles:** goalposts are "poles" (small poles / big poles; a scored "Goal" stays "Goal"). A match can start on
  small poles with no keepers and switch to big poles mid-match; the score carries over.
- **Keepers:** saves, clean sheets and goals conceded count **only from the switch to big poles**. On small poles
  a usual keeper plays (and scores) as a MID; after the switch only the chosen keepers are GK.
- **Stoppage:** the stoppage label restarts each half (46+12', not cumulative). A long or forgotten stoppage is
  **never** re-stamped into plain minutes ("I want people to see the stoppages"). The full-time check only shows a
  heads-up with "OK". Adjust clock keeps the minutes already logged.
- **Full time:** the referee publishes the result; Reuben is notified and can edit after (no approval step).
- **Scoring (FPL-style), the one engine is `js/core/scoring.js`** (its header and `SCORE` table are the source):
  everyone played +2, assist +3, yellow −1, red −3 · GK goal +10, penalty save +6, clean sheet +8, +1 per 4 saves,
  −1 per 3 conceded · DEF goal +6, clean sheet +3, block +2, clearance +1 · MID goal +5, FWD goal +4, plus a defence
  bonus (+2 per 4 / 6 defence points). Own goal: the scorer −2, the player who forced it +3.
- "The keeper" in Reuben's speech often means the referee / scorekeeper.
