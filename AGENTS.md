# AGENTS.md: the rulebook for every assistant on BE Fit Club

This is the **one home** of how work gets done and released on BE Fit Club (Claude, GPT/Codex or any
other assistant). `CLAUDE.md` points here; if anything disagrees with this file, this file wins.
Adapted from My FPL Admin's rulebook on 20 Oct 2026, with Reuben's approval.

Reuben is **non-technical**. Plain language, bottom line first, real numbers with their simple maths and
where they came from (the root `Claude Code/CLAUDE.md` has the full "how to talk to me" contract).

## 1. Approval and release authority

- **An approved task includes its full release:** branch → local checks green → push to `main` →
  live check → report. Do not ask "commit?", "push?" or "merge?" again. (Decided 25 Oct 2026, the
  xPoints Lab way: GitHub's CI runs *after* going live as a safety alarm, not as a gate to wait for.)
- **A batch approval** ("all approved, go") covers every item named, done in order, stopping only at a
  blocker. It does not cover new items found on the way: report those and wait.
- **Narrower instructions win:** "mock-up first", "don't push", "stop at the preview", "review only".
- **Pause** for a scope change, a new choice with consequences, a red check you can't fix inside the
  approved scope, or a sensitive action (§4) the approval did not name.
- After the task or batch is reported, **stop**. Don't chain into the next thing unasked.

## 2. The routine: request → live (5–10 minutes for a small edit)

`main` is LIVE: Cloudflare Pages deploys every push to `main` in about 40 seconds. Every other branch
gets its own preview at `https://<branch>.the-be-fit-club.pages.dev` (slashes become dashes:
`fix/tables-colour` → `fix-tables-colour.the-be-fit-club.pages.dev`).

1. Branch from current `main`: `git fetch origin && git checkout -b <type>/<topic> origin/main`
   (`fix/`, `feat/`, `chore/`; `claude/` or `codex/` prefix if Reuben wants to tell builders apart).
   Then `git branch --unset-upstream` so a plain `git push` can never land on `main`.
2. Build. When you change a rule, wording or limit, **search for every copy of it** (screens, share
   cards, guides, tests) and make them all agree in the same release.
3. Run the checks for the change's lane (§3). `npm run test:changed` picks them for you.
4. Commit on the branch. **Nothing red goes live:** the local checks from step 3 must be green.
5. Go live without waiting for CI: fast-forward `main` to the branch (`git fetch origin && git push origin
   <branch>:main`; if `main` moved, rebase the branch on `origin/main` and re-run step 3 first). Cloudflare
   deploys `main`. Also push the branch itself for the record.
6. **CI is the safety alarm, after release.** GitHub Actions "Checks" runs on every push, `main`
   included. Glance at the result before reporting if it has finished; if it later goes red on `main`,
   fixing it (or reverting the release) is the next job, before anything else. A red caused only by
   changed live data is fixed with `npm run snapshot -- --pin --keep tests/.data/pinned-copy.json`.
   **Sensitive lane only (§4): wait for CI green before step 5.**
7. If the change is visible, look at it live (phone width first).
8. Live check: `gh api repos/Larmie/befit-fc/commits/<main sha>/check-runs` shows "Cloudflare Pages"
   success; then load https://the-be-fit-club.pages.dev and confirm the change is there (fetch the changed
   file or look at the screen). Say plainly what you did not see.
9. Report (§5).

No cache-busting step is needed: `sw.js` is network-first for every app file, so a release reaches phones
on their next load with signal. Bump `CACHE` in `sw.js` only when the **list** of app files changes.

## 3. Risk lanes

| Lane | What | Checks before going live |
|---|---|---|
| **Cosmetic** | layout, colours, copy, one screen, docs | `npm run test:changed` (unit + the affected screen's suites and sweep groups: 1 m 45 s for a tables colour, measured 21 Oct). CI follows as the alarm. Docs only: read-through |
| **Logic** | points, payments, the clock, stoppage, poles/keepers, rules, what a screen calculates | A test for the change that **fails without the fix and passes with it** (report both counts) + `npm run test:unit` + the affected suites (`test:changed`). CI follows as the alarm |
| **Sensitive** | see §4: always ask Reuben first | Logic lane + a read-only count of what it would change on the real data, shown to Reuben before anything is written + **CI green before going live** |

- New maths goes in a Node unit check (`tests/unit/*.test.js`, `node --test`, no browser) wherever it
  can: those run in seconds. Load the real core files whole (see `tests/unit/core.test.js`), never cut
  code out of a file by position.
- **End of every batch** (the last release of a session or an approved batch): `npm run test:full`
  (every suite, one at a time). Anything red is fixed the same day, before the batch is reported.
  This is what makes it safe for `test:changed` and CI to skip suites a change can't affect.

## 4. Sensitive: always ask Reuben first

- **Writing to the real database**, including clean-ups, fixes to old matches, imports, deleting a
  player or a match. Read-only checks are fine; show counts, not personal data. Take a backup copy first
  (`design-review/backups/`, never committed).
- **Firebase rules**, logins and roles (`roles/`, the shared referee login, the admin login).
- **Deleting data** of any kind, anywhere.
- **Anything that changes historic points** (scoring rules applied to old matches, the engine, carry-overs).
- Cloudflare or Firebase settings, new services, anything that costs money.

Once Reuben approves a specific sensitive operation and its scope, don't re-ask for its mechanical steps.

## 5. The end-of-task report (short, plain English, numbers)

1. What changed: 1 to 3 points, in what people see.
2. Lane and proof: e.g. "Cosmetic: test:changed ran tables + 3 sweep groups, 41 ok, 0 FAIL, 1 m 50 s"
   or "Logic: new check failed 0/1 without the fix, 1/1 with it".
3. PR number and the live check (what you looked at on the live site).
4. What you did not check.
5. Anything Reuben must do, with exact steps if he has to click something.

## 6. The checks

| Command | What it runs | Time |
|---|---|---|
| `npm run test:unit` | 94 Node-only checks: the maths, engine equal to `classic.html` (0 differences), big poles, stoppage per half, keepers on small poles, Teams, the payments rule, the clock, the picker, what the site publishes | under 2 s |
| `npm run test:changed` | unit + only the browser suites the change can affect (vs `origin/main`, including uncommitted edits) | about 2 min for one screen (3 suites at a time) |
| `npm run test:full` | unit + every browser suite, one at a time, every sweep size | about 80 min (78 m 30 s on 21 Oct); `npm run test:full -- --jobs 3` is quicker if the laptop is free |
| `npm test -- tables fix` | unit + the suites named | |
| `npm run test:pick` | shows what `test:changed` would run, runs nothing | instant |
| `npm run snapshot` | refreshes the read-only test data | seconds |

- First time on a machine: `npm ci`, then `npm run snapshot`. Chrome must be installed (set
  `CHROME_PATH` if it is not in the usual place).
- **The picker** (`tests/tools/pick.js`) maps each changed file to areas: `css/tables.css` or
  `js/screens/tables.js` → the tables suites and the tables sweep groups; `js/core/scoring.js` → unit +
  Monday night + every suite that shows points; the shared shell and look (`js/ui/*`,
  `css/tokens|base|components.css`, `index.html`) or the test tooling → **every** suite; docs → none.
  `tests/suites.js` lists each suite with its areas: **add new suites there** or they never run.
- **Red only for a new failure.** `tests/known-failures.json` lists suites that fail for a known reason
  ("failing") or must not run somewhere ("skip", e.g. in CI), each with a reason and a date. Remove an
  entry as soon as the suite passes (the runner says so).
- Output, screenshots and logs go to `tests/.out/` (git-ignored); each suite's full log is in
  `tests/.out/logs/<name>.log`. Never truncate test output when reporting, and never call a vacuous
  test proof.

### Test data

- Tests run on a **read-only copy of the live data** in `tests/.data/snapshot.json` (git-ignored, never
  committed: it holds people's names and payments). `npm run snapshot` only sends GET requests for the
  four public parts (players, sessions, paymentDays, settings).
- Several suites check exact numbers and names from the real data ("24 players owe", "All 76",
  "New francis guy ×3"). So the copy is **rebuilt as it was on the pinned day** (`tests/snapshot-pin.json`):
  - `asOf`: later matches, payment days and new players are left out, so new Mondays don't break tests;
  - `patch`: older entries edited since (a renamed or deleted player, a fixed match) are put back as they
    were (on 21 Oct: 4 players Reuben tidied on 20 Oct);
  - `fingerprint`: the result is checked; "Identical to the data the tests were pinned to" = all good.
- If `npm run snapshot` prints a **HEADS-UP**, someone edited old data again. Two ways out, on a branch:
  - **Keep the pin** (quick, usual): the HEADS-UP saves the last copy that matched as
    `tests/.data/pinned-copy.json` and prints the command: `npm run snapshot -- --pin --keep
    tests/.data/pinned-copy.json`. Commit `tests/snapshot-pin.json`; nothing else changes. (Only a machine
    that had a good copy can do this; Reuben's laptop normally has one.)
  - **Move the pin forward** (when tests should see newer matches): `npm run snapshot -- --as-of <latest
    match date> --pin`, then `npm run test:full`; for each failure confirm it is only the data (a count, a
    name), not a bug, and update that number in the test. Commit the pin and the tests together.
- Made-up fixtures live in `tests/fixtures/` (no names, no money) and are preferred for new tests.

## 7. Project rules (facts every session needs)

- **Test mode:** `window.__BEFIT_TEST__ = { data, now, viewer, referee, status, latency }` makes the app
  run on in-memory data with no Firebase at all (`js/core/store.js`). The harness
  (`tests/browser/harness.js`) injects it, blocks every request to Firebase as a second safety net, and
  refuses to continue if the page is not in test mode.
- **Never write to the real database in tests** or while building. The harness keeps that true; any
  new test must use it (or, like the practice suite, abort every Firebase request that is not a plain GET).
- **Practice mode:** `?practice` reads the real data once (GET only), then runs in test mode; nothing
  is saved. Good for showing Reuben a change on the live site safely.
- **Roles:** guest (Home · Match · Tables), player (+ Me), referee (console + Money tonight), admin
  (Home · Squad · Money · Settings). Logins are Firebase Auth email + password; the role sits in the
  database at `roles/{uid}`. The referee uses one shared login.
- **`settings`** (database root): the club (name, season label, fee, quick amounts) and the teams
  (Green, Red; Blue and Gold ready). Everyone can read it; only the admin can write it.
- **`classic.html`** is the old single-file app, now read-only (it has no login). Never edit it: the
  engine check compares the new engine with it.
- **`design-review/`** holds mock-ups and data backups. It is excluded in `.git/info/exclude` because
  the site publishes every committed file: never commit it.
- **Keep tests off the live site:** Cloudflare Pages serves the whole repo folder. `_redirects` sends
  `/tests/*`, `/package.json`, `/node_modules/*`, `AGENTS.md`, `CLAUDE.md` and the other non-app files to
  the home page (302), so a normal link to them never returns the file. `tests/unit/site.test.js` fails if
  a committed top-level file or folder is neither in the app list of `site-build.sh` nor in `_redirects`:
  add new tooling to `_redirects`, new app files to `site-build.sh`, and check the branch preview
  (`curl -sI <preview>/<path>` answers 302 for tooling, 200 for the app).
  Known gap: a deliberately percent-encoded address (e.g. `/tests%2Fpaths.js`) slips past `_redirects`.
  It only reveals files that are already public in the GitHub repo. The full fix is one Cloudflare
  setting (Builds: build command `bash site-build.sh`, output directory `dist`), which publishes only
  the app; Reuben decides whether to switch it on.
- **No build step, no frameworks:** plain files (`index.html`, `css/`, `js/core`, `js/ui`,
  `js/screens`). `package.json` exists only for the tests.
- **Editing on this Windows machine:** don't use PowerShell `Set-Content` (it breaks emoji and ₵); shell
  heredocs can strip backslashes, so write patch scripts with a file-write tool and check `git diff --stat`.
- **Helpers:** a delegated agent pushes its branch and reports when done; the lead reviews the proof,
  merges and does the live check. Only one agent edits a given branch.

## 8. Where context lives

- `CLAUDE.md`: the key project facts (live URL, Firebase, rules Reuben decided).
- `tests/suites.js`: every browser suite and what it covers. `tests/tools/`: runner, picker, snapshot.
- The root `Claude Code/CLAUDE.md`: how to talk to Reuben, time estimates, model choice.
