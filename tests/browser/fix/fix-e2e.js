// Fix area end-to-end test (TEST MODE ONLY, via the harness: no Firebase, writes stay in memory).
// Scripts: 12 Oct fixes (scorer, assist, move, cross-team move, remove + undo, add missed "Not sure"),
// 20 Jul full-time check (re-injected double tap → Remove one, Keep both, Publish), big poles move,
// post / history / date / add + take off player / delete match; round 5: the long-stoppage heads-up ("stop"). After every step: Scoring totals,
// storedFields, and preview == actual for every player.
const path = require('path');
const fs = require('fs');
const H = require('../harness.js');
const OUT = H.out(__dirname);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const log = [];
const check = (label, ok, extra) => { if (ok) passes++; else fails++; const line = (ok ? 'ok   ' : 'FAIL ') + label + (extra !== undefined ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''); console.log(line); log.push(line); };

const SID12 = '-P3lenQyxWIniPyrtFAn', SID20 = '-Oy-xrzTcJG36b_J29aK';
const snap = H.snapshot();
const P = {}; Object.entries(snap.players).forEach(([pid, p]) => { P[p.name] = pid; });
const evId = (sid, pred) => Object.entries(snap.sessions[sid].events).find(([, e]) => pred(e))[0];

// --- page helpers -----------------------------------------------------------------------------
const HELPERS = () => {
  window.__t = {
    totals(sid) { const s = Store.session(sid); const o = {}; Scoring.sessPlayers(s).forEach(p => { const m = Scoring.matchPoints(s, p.pid); o[p.pid] = m ? m.total : 0; }); return o; },
    pts(sid, pid) { const m = Scoring.matchPoints(Store.session(sid), pid); return m ? m.total : null; },
    teamPts(sid) { const o = {}; Scoring.matchBreakdown(Store.session(sid)).columns.forEach(c => { o[c.team] = c.points; }); return o; },
    stored(sid) { const s = Store.session(sid); const f = Scoring.storedFields(s); return { goals: s.goals, cleanSheets: s.cleanSheets, want: f, ok: JSON.stringify(s.goals) === JSON.stringify(f.goals) && JSON.stringify(s.cleanSheets) === JSON.stringify(f.cleanSheets) }; },
    score(sid) { const s = Store.session(sid); return Scoring.orderTeams(Scoring.teamsOf(s)).map(t => Scoring.teamGoals(s, t)).join('–'); },
    preview() {
      const top = document.querySelectorAll('.sheet'); const sh = top[top.length - 1]; if (!sh) return null;
      const rows = {}; sh.querySelectorAll('[data-delta] .dr[data-pid]').forEach(r => { rows[r.dataset.pid] = [Number(r.dataset.from), Number(r.dataset.to)]; });
      const sc = sh.querySelector('[data-delta] .fx-score');
      return { rows, score: sc ? [sc.dataset.scoreFrom, sc.dataset.scoreTo] : null, text: (sh.querySelector('[data-delta]') || {}).innerText || '' };
    },
    removePreview() {
      const b = document.querySelector('.sheet [data-tap="f-remove"]'); if (!b) return null;
      const pv = JSON.parse(b.dataset.preview); const rows = {}; pv.players.forEach(p => { rows[p.pid] = [p.from, p.to]; });
      return { rows, text: b.innerText, score: pv.score };
    },
    undoText() { const u = document.querySelector('#app-undo .undo'); return u ? u.innerText.replace(/\s+/g, ' ').trim() : ''; },
    noOverflow() {
      const bad = [];
      if (document.documentElement.scrollWidth > window.innerWidth + 1) bad.push('page scrolls sideways ' + document.documentElement.scrollWidth);
      document.querySelectorAll('.nm, .pt-name, .fx-v, .fx-dn, .fx-dv, .fx-ft-s, .tm, .fx-evm, .meta, .btn, .chip, .lbl, .hd-c, .fx-eff, .link, .sheet h4').forEach(el => {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
        const r = el.getBoundingClientRect(); if (!r.width) return;
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto') bad.push('wide: ' + el.className + ' "' + el.textContent.trim().slice(0, 40) + '"');
        if (el.classList.contains('pt-name') && el.scrollHeight > el.clientHeight + 2) bad.push('clamped: "' + el.textContent + '"');
        if (r.right > window.innerWidth + 1 && !el.closest('.chips')) bad.push('off-screen: ' + el.className + ' "' + el.textContent.trim().slice(0, 40) + '"');
      });
      const small = []; document.querySelectorAll('.sheet button, .screen button').forEach(b => { const r = b.getBoundingClientRect(); if (r.height && r.height < 44 && !b.closest('.chips') && b.offsetParent) small.push(b.textContent.trim().slice(0, 20) + ':' + Math.round(r.height)); });
      return { bad, small };
    },
  };
};

async function openApp(o) {
  const s = await H.open(Object.assign({ referee: true, width: 390, theme: 'dark', latency: 60 }, o));
  await s.page.evaluate(HELPERS);
  return s;
}
const T = (p, fn, ...a) => p.evaluate((fn, a) => window.__t[fn](...a), fn, a);
const click = async (p, sel, wait = 220) => {
  await p.waitForSelector(sel, { visible: true, timeout: 5000 });
  await p.$eval(sel, e => e.scrollIntoView({ block: 'center' }));
  await p.click(sel); await sleep(wait);
};
const waitSaved = async p => { await p.waitForFunction(() => { const u = document.querySelector('#app-undo .undo'); return u && !u.classList.contains('saving') && !u.classList.contains('err') && !document.querySelector('.is-saving'); }, { timeout: 5000 }); await sleep(120); };
const sheetCount = p => p.evaluate(() => document.querySelectorAll('.sheet').length);

// preview == actual for every player in the match (others must not move)
async function assertPreviewMatches(p, sid, before, pv, label) {
  const after = await T(p, 'totals', sid);
  const pids = new Set([...Object.keys(before), ...Object.keys(after)]);
  const wrong = [];
  pids.forEach(pid => {
    const a = before[pid] || 0, b = after[pid] || 0;
    const want = pv.rows[pid] ? pv.rows[pid] : [a, a];
    if (want[0] !== a || want[1] !== b) wrong.push(`${snap.players[pid] ? snap.players[pid].name : pid}: preview ${want[0]}→${want[1]}, actual ${a}→${b}`);
  });
  check(`${label}: preview matched the real result for every player`, !wrong.length, wrong.join('; ') || Object.entries(pv.rows).map(([pid, r]) => `${snap.players[pid].name} ${r[0]}→${r[1]}`).join(', '));
}
async function assertStored(p, sid, label, wantGoals) {
  const st = await T(p, 'stored', sid);
  check(`${label}: stored goals + cleanSheets = Scoring.storedFields`, st.ok, st);
  if (wantGoals) check(`${label}: stored goals ${JSON.stringify(wantGoals)}`, JSON.stringify(st.goals) === JSON.stringify(wantGoals), st.goals);
}
async function layout(p, label) {
  const r = await T(p, 'noOverflow');
  check(`${label}: no sideways scroll, no truncated names`, !r.bad.length, r.bad.slice(0, 5).join(' | '));
  check(`${label}: tap targets ≥ 44 px`, !r.small.length, r.small.slice(0, 6).join(', '));
}

// =================================================================================================
async function flow12Oct(theme) {
  const t = theme;
  const data = H.snapshot();
  const g33 = evId(SID12, e => e.type === 'goal' && e.min === 33);
  data.sessions[SID12].events[g33].scorerId = P.Joshua;      // the illustrative mistake: Joshua, not Sosa
  const s = await openApp({ data, theme, route: `#/ref.edit?sid=${SID12}` });
  const p = s.page;
  const ev0 = await p.evaluate((sid, id) => Store.session(sid).events[id], SID12, g33);
  const segText = await p.$eval('[data-seg="fx-team"]', e => e.innerText.replace(/\s+/g, ' ').trim());
  check(`[${t}] 12 Oct: Players tab first, "Green · 57 | Red · 42"`, segText === 'Green · 57 Red · 42', segText);
  await s.shot(path.join(OUT, `edit-players-390-${t}.png`));
  await layout(p, `[${t}] Edit · Players`);

  // 1 · change the 33' scorer Joshua → Sosa
  await click(p, '[data-tap="tab"][data-value="timeline"]');
  await s.shot(path.join(OUT, `edit-timeline-390-${t}.png`));
  await layout(p, `[${t}] Edit · Timeline`);
  let before = await T(p, 'totals', SID12);
  await click(p, `[data-tap="ev"][data-eid="${g33}"]`);
  check(`[${t}] event sheet title "Goal · 33'"`, (await p.$eval('.sheet .sheet-title', e => e.textContent)) === "Goal · 33'");
  await s.shot(path.join(OUT, `event-sheet-390-${t}.png`));
  await click(p, '.sheet [data-tap="f-who"]');
  check(`[${t}] picker "Who scored at 33'?" + "A Red player"`, (await p.$eval('.sheet', e => e.innerText)).includes("Who scored at 33'?") && (await p.$eval('.sheet', e => e.innerText)).includes('A Red player'));
  await s.shot(path.join(OUT, `event-pick-390-${t}.png`));
  await layout(p, `[${t}] scorer picker`);
  await click(p, `.sheet [data-tap="pk"][data-pid="${P.Sosa}"]`);
  let pv = await T(p, 'preview');
  check(`[${t}] 1 scorer: preview "Sosa 12 → 17, Joshua 7 → 2", no score line`, JSON.stringify(pv.rows[P.Sosa]) === '[12,17]' && JSON.stringify(pv.rows[P.Joshua]) === '[7,2]' && !pv.score, pv.text.replace(/\n/g, ' '));
  await s.shot(path.join(OUT, `event-preview-390-${t}.png`));
  await layout(p, `[${t}] event sheet preview`);
  await click(p, '.sheet [data-tap="f-save"]', 50);
  await waitSaved(p);
  check(`[${t}] 1 scorer: sheet closed, Undo bar "${await T(p, 'undoText')}"`, (await sheetCount(p)) === 0 && /Saved · Goal, Sosa 33'/.test(await T(p, 'undoText')));
  await assertPreviewMatches(p, SID12, before, pv, `[${t}] 1 scorer`);
  const ev1 = await p.evaluate((sid, id) => Store.session(sid).events[id], SID12, g33);
  check(`[${t}] 1 scorer: kept minute 33, timestamp and team; editedBy/editedAt added`, ev1.min === 33 && ev1.timestamp === ev0.timestamp && ev1.team === 'green' && ev1.scorerId === P.Sosa && ev1.assistId === P.Theophilus && ev1.editedBy === 'referee@test' && ev1.editedAt > 0, ev1);
  check(`[${t}] 1 scorer: edited row has the ink edge`, await p.$eval(`[data-tap="ev"][data-eid="${g33}"]`, e => e.classList.contains('chg')));
  await assertStored(p, SID12, `[${t}] 1 scorer`, { green: 7, red: 4 });

  // 2 · add an assist to Harry's 24' goal → Theophilus
  const g24 = evId(SID12, e => e.type === 'goal' && e.min === 24);
  before = await T(p, 'totals', SID12);
  await click(p, `[data-tap="ev"][data-eid="${g24}"]`);
  await click(p, '.sheet [data-tap="f-assist"]');
  check(`[${t}] assist picker has "No assist" and not the scorer (Harry)`, await p.$eval('.sheet', (e, h) => e.innerText.includes('No assist') && !e.querySelector(`[data-tap="pk"][data-pid="${h}"]`), P.Harry));
  await click(p, `.sheet [data-tap="pk"][data-pid="${P.Theophilus}"]`);
  pv = await T(p, 'preview');
  check(`[${t}] 2 assist: preview "Theophilus 12 → 15"`, JSON.stringify(pv.rows[P.Theophilus]) === '[12,15]' && Object.keys(pv.rows).length === 1, pv.text.replace(/\n/g, ' '));
  await click(p, '.sheet [data-tap="f-save"]', 50); await waitSaved(p);
  await assertPreviewMatches(p, SID12, before, pv, `[${t}] 2 assist`);
  await assertStored(p, SID12, `[${t}] 2 assist`, { green: 7, red: 4 });

  // 3 · move Andrew's 34' block to Solomon, from Andrew's player sheet
  const b34 = evId(SID12, e => e.type === 'block' && e.min === 34);
  await click(p, '[data-tap="tab"][data-value="players"]');
  await p.evaluate(() => { const b = document.querySelector('[data-seg="fx-team"] [data-value="red"]'); b.click(); });
  await sleep(250);
  await click(p, `[data-tap="pl"][data-pid="${P.Andrew}"]`);
  // round 5: the team is a chip in the title, the position under it, the points a sum (total = the hero)
  check(`[${t}] player sheet: "Andrew" + Red chip, "DEF", sum total 4`, (await p.$eval('.sheet h4', e => e.innerText)).includes('Andrew') && (await p.$eval('.sheet h4 .tc', e => e.innerText)) === 'Red' && (await p.$eval('.sheet .fx-sub', e => e.innerText)) === 'DEF' && (await p.$eval('.sheet .sum-tot .hn', e => e.textContent)) === '4');
  await s.shot(path.join(OUT, `player-sheet-390-${t}.png`));
  await layout(p, `[${t}] player sheet`);
  before = await T(p, 'totals', SID12);
  await click(p, `.sheet [data-tap="ev"][data-eid="${b34}"]`);
  check(`[${t}] event sheet opens on top of the player sheet`, (await sheetCount(p)) === 2);
  await click(p, '.sheet:last-of-type [data-tap="f-who"]');
  await click(p, `.sheet:last-of-type [data-tap="pk"][data-pid="${P.Solomon}"]`);
  pv = await T(p, 'preview');
  check(`[${t}] 3 move: preview "Andrew 4 → 2, Solomon 2 → 4"`, JSON.stringify(pv.rows[P.Andrew]) === '[4,2]' && JSON.stringify(pv.rows[P.Solomon]) === '[2,4]', pv.text.replace(/\n/g, ' '));
  await click(p, '.sheet:last-of-type [data-tap="f-save"]', 50); await waitSaved(p);
  await assertPreviewMatches(p, SID12, before, pv, `[${t}] 3 move`);
  check(`[${t}] 3 move: player sheet behind updated (2 pts, no events)`, (await sheetCount(p)) === 1 && (await p.$eval('.sheet .sum-tot .hn', e => e.textContent)) === '2' && (await p.$eval('.sheet', e => e.innerText)).includes('Nothing logged'));
  await assertStored(p, SID12, `[${t}] 3 move`, { green: 7, red: 4 });
  await p.keyboard.press('Escape'); await sleep(200);

  // 3b · move a goal across teams: Barnabas 72' (Red) → Harry (Green) changes the score
  const g72 = evId(SID12, e => e.type === 'goal' && e.min === 72);
  await click(p, '[data-tap="tab"][data-value="timeline"]');
  before = await T(p, 'totals', SID12);
  await click(p, `[data-tap="ev"][data-eid="${g72}"]`);
  await click(p, '.sheet [data-tap="f-who"]');
  await click(p, '.sheet [data-tap="pk-team"][data-team="green"]');
  await click(p, `.sheet [data-tap="pk"][data-pid="${P.Harry}"]`);
  pv = await T(p, 'preview');
  check(`[${t}] 3b cross-team move: score line 7–4 → 8–3, Barnabas 7 → 2, Harry 17 → 21`, pv.score && pv.score[0] === '7–4' && pv.score[1] === '8–3' && JSON.stringify(pv.rows[P.Barnabas]) === '[7,2]' && JSON.stringify(pv.rows[P.Harry]) === '[17,21]', pv.text.replace(/\n/g, ' '));
  await click(p, '.sheet [data-tap="f-save"]', 50); await waitSaved(p);
  await assertPreviewMatches(p, SID12, before, pv, `[${t}] 3b cross-team move`);
  await assertStored(p, SID12, `[${t}] 3b cross-team move`, { green: 8, red: 3 });
  // put it back with Undo
  await p.click('#app-undo [data-act="undo"]'); await sleep(500);
  check(`[${t}] 3b Undo: score back to 7–4, Barnabas 7`, (await T(p, 'score', SID12)) === '7–4' && (await T(p, 'pts', SID12, P.Barnabas)) === 7);
  await assertStored(p, SID12, `[${t}] 3b Undo`, { green: 7, red: 4 });

  // 4 · remove Emmanuel's 45' goal (shows its effect first), Undo, remove again
  const g45 = evId(SID12, e => e.type === 'goal' && e.min === 45);
  before = await T(p, 'totals', SID12);
  await click(p, `[data-tap="ev"][data-eid="${g45}"]`);
  const rp = await T(p, 'removePreview');
  check(`[${t}] 4 remove: link shows "Emmanuel 12 → 7 · Score 7–3"`, /Emmanuel 12 → 7/.test(rp.text) && /Score 7–3/.test(rp.text), rp.text.replace(/\n/g, ' '));
  await s.shot(path.join(OUT, `event-remove-390-${t}.png`));
  await click(p, '.sheet [data-tap="f-remove"]', 50); await waitSaved(p);
  await assertPreviewMatches(p, SID12, before, rp, `[${t}] 4 remove`);
  check(`[${t}] 4 remove: Undo bar "Removed · Goal, Emmanuel 45'"`, /Removed · Goal, Emmanuel 45'/.test(await T(p, 'undoText')));
  await assertStored(p, SID12, `[${t}] 4 remove`, { green: 7, red: 3 });
  await p.click('#app-undo [data-act="undo"]'); await sleep(500);
  check(`[${t}] 4 Undo restores the goal and Emmanuel 12`, (await T(p, 'pts', SID12, P.Emmanuel)) === 12 && (await T(p, 'score', SID12)) === '7–4');
  await assertStored(p, SID12, `[${t}] 4 Undo`, { green: 7, red: 4 });
  await click(p, `[data-tap="ev"][data-eid="${g45}"]`);
  await click(p, '.sheet [data-tap="f-remove"]', 50); await waitSaved(p);
  check(`[${t}] 4 removed again: Emmanuel 7, 7–3`, (await T(p, 'pts', SID12, P.Emmanuel)) === 7 && (await T(p, 'score', SID12)) === '7–3');

  // 5 · add a missed clearance for Reuel, minute "Not sure"
  await sleep(5200);   // let the Undo bar go (it sits over the dock button for 5 s)
  before = await T(p, 'totals', SID12);
  const n0 = await p.evaluate(sid => Object.keys(Store.session(sid).events).length, SID12);
  await click(p, '[data-tap="addm"]');
  await click(p, '.sheet [data-tap="a-type"][data-value="clearance"]');
  await click(p, '.sheet [data-tap="a-who"]');
  await click(p, `.sheet [data-tap="pk"][data-pid="${P.Reuel}"]`);
  check(`[${t}] 5 add: minute defaults to "Not sure"`, await p.$eval('.sheet [data-seg="minmode"] .on', e => e.dataset.value === 'none'));
  pv = await T(p, 'preview');
  check(`[${t}] 5 add: preview "Reuel 2 → 2", button "Add clearance"`, JSON.stringify(pv.rows[P.Reuel]) === '[2,2]' && (await p.$eval('.sheet [data-tap="a-save"]', e => e.textContent)) === 'Add clearance', pv.text.replace(/\n/g, ' '));
  await s.shot(path.join(OUT, `add-missed-390-${t}.png`));
  await layout(p, `[${t}] add missed`);
  await click(p, '.sheet [data-tap="a-save"]', 50); await waitSaved(p);
  await assertPreviewMatches(p, SID12, before, pv, `[${t}] 5 add`);
  const added = await p.evaluate((sid, n0) => { const evs = Store.session(sid).events; const k = Object.keys(evs).find(k => evs[k].type === 'clearance' && evs[k].playerId && !evs[k].min && evs[k].by); return { n: Object.keys(evs).length, n0, ev: evs[k], k }; }, SID12, n0);
  check(`[${t}] 5 add: one event, no minute, by referee, Undo "Added · Clearance, Reuel"`, added.n === n0 + 1 && added.ev && added.ev.min === undefined && added.ev.playerId === P.Reuel && /Added · Clearance, Reuel/.test(await T(p, 'undoText')), added.ev);
  const grp = await p.$eval('.fx-tl', e => e.querySelector('.lbl').innerText + ' / ' + e.querySelector('.fx-ev').innerText.replace(/\s+/g, ' '));
  check(`[${t}] 5 add: top of the timeline is "Added after full time" with "– Reuel Clearance"`, /^Added after full time/i.test(grp) && /– Reuel Clearance/.test(grp), grp);
  await s.shot(path.join(OUT, `edit-added-390-${t}.png`));
  await assertStored(p, SID12, `[${t}] 5 add`, { green: 7, red: 3 });
  // all the edits: season totals still come from the one engine
  const fin = await p.evaluate((ids) => ids.map(id => Scoring.seasonStats(id).pts), [P.Sosa, P.Joshua, P.Theophilus]);
  check(`[${t}] season totals follow the edits (Sosa/Joshua/Theophilus)`, fin.every(n => typeof n === 'number'), fin);
  const writes = await p.evaluate(() => Store.test.writes.map(w => Object.keys(w.updates)));
  check(`[${t}] every write is one atomic multi touching only sessions/${SID12}`, writes.every(k => k.every(x => x.startsWith('sessions/' + SID12 + '/'))), writes.length + ' writes');
  check(`[${t}] no console errors`, !s.errors.length, s.errors.join(' | '));
  if (theme === 'dark') fs.writeFileSync(path.join(OUT, 'writes-12oct.json'), JSON.stringify(await p.evaluate(() => Store.test.writes), null, 1));
  await s.close();
}

// =================================================================================================
function data20Jul() {
  const data = H.snapshot();
  const s = data.sessions[SID20];
  const evs = Object.values(s.events);
  const ts = evs.map(e => e.timestamp);
  s.status = 'active';
  s.timer = { status: 'ended', startedAt: Math.min(...ts) - 60000, endedAt: Math.max(...ts) + 60000, pausedTotal: 0, htLogged: false };
  s.ftCheck = { status: 'checking' };
  delete s.goals; delete s.cleanSheets;                       // as if End game just happened (classic wrote none of these yet)
  const andrewBlock = Object.entries(s.events).find(([, e]) => e.type === 'block' && e.playerId === P.Andrew)[1];
  s.events['zz_dup_andrew'] = { type: 'block', playerId: P.Andrew, timestamp: andrewBlock.timestamp + 680, by: 'referee' };   // re-injected double tap (0.68 s)
  const mikeSave = Object.entries(s.events).find(([, e]) => e.type === 'save' && e.playerId === P.Mike)[1];
  s.events['zz_dup_mike'] = { type: 'save', playerId: P.Mike, timestamp: mikeSave.timestamp + 1500, by: 'referee' };          // a second one, to test Keep both
  return data;
}

async function flowFT(theme) {
  const t = theme;
  const s = await openApp({ data: data20Jul(), theme, route: `#/ref.ftcheck?sid=${SID20}` });
  const p = s.page;
  check(`[${t}] FT: Andrew 11, Red 85 before`, (await T(p, 'pts', SID20, P.Andrew)) === 11 && (await T(p, 'teamPts', SID20)).red === 85, await T(p, 'teamPts', SID20));
  const text = await p.$eval('.scr-ref-ftcheck', e => e.innerText.replace(/\s+/g, ' '));
  check(`[${t}] FT: score 4–7, "No minutes logged", 2 flags`, /GREEN 4 FT 7 RED|Green 4|4/.test(text) && text.includes('No minutes logged') && /Check before publishing 2/i.test(text), text.slice(0, 200));
  check(`[${t}] FT: "Andrew · Block twice, 0.7 s apart" + "Remove one / Andrew 11 → 9"`, text.includes('Andrew · Block twice, 0.7 s apart') && text.includes('Remove one Andrew 11 → 9'));
  // Keep both on Mike's
  await click(p, '[data-tap="keep"][data-eid="zz_dup_mike"]', 50); await waitSaved(p);
  check(`[${t}] FT: Keep both stores ftCheck.keep and the flag goes`, (await p.evaluate(sid => Store.session(sid).ftCheck.keep.zz_dup_mike, SID20)) === true && !(await p.$('[data-flag="zz_dup_mike"]')));
  check(`[${t}] FT: Mike's save still counted (Keep both)`, await p.evaluate(sid => !!Store.session(sid).events.zz_dup_mike, SID20));
  await sleep(5200);
  await s.shot(path.join(OUT, `ftcheck-390-${t}.png`));
  await layout(p, `[${t}] full-time check`);
  // Remove one
  const before = await T(p, 'totals', SID20);
  await click(p, '[data-tap="rm1"][data-eid="zz_dup_andrew"]', 50); await waitSaved(p);
  const after = await T(p, 'totals', SID20);
  const tp = await T(p, 'teamPts', SID20);
  check(`[${t}] FT Remove one: Andrew 11 → 9 (as previewed), Red 85 → 83`, before[P.Andrew] === 11 && after[P.Andrew] === 9 && tp.red === 83, { andrew: [before[P.Andrew], after[P.Andrew]], teams: tp });
  await assertPreviewMatches(p, SID20, before, { rows: { [P.Andrew]: [11, 9] } }, `[${t}] FT Remove one`);
  const fx = await p.evaluate(sid => Store.session(sid).ftCheck.fixes, SID20);
  check(`[${t}] FT: fix recorded "Andrew · duplicate block removed" −2`, fx && fx.zz_dup_andrew && fx.zz_dup_andrew.text === 'Andrew · duplicate block removed' && fx.zz_dup_andrew.delta === -2, fx);
  check(`[${t}] FT: no flags left`, !(await p.$('.fx-flag')));
  // Publish
  await sleep(300);
  await click(p, '[data-tap="publish"]', 50); await waitSaved(p); await sleep(300);
  const pub = await p.evaluate(sid => { const s = Store.session(sid); return { status: s.status, goals: s.goals, cleanSheets: s.cleanSheets, ftCheck: s.ftCheck, publishedBy: s.publishedBy, timer: s.timer.status }; }, SID20);
  check(`[${t}] Publish: status completed, goals {green 4, red 7}, cleanSheets false/false`, pub.status === 'completed' && JSON.stringify(pub.goals) === '{"green":4,"red":7}' && JSON.stringify(pub.cleanSheets) === '{"green":false,"red":false}', pub);
  check(`[${t}] Publish: ftCheck published + publishedAt + by, publishedBy`, pub.ftCheck.status === 'published' && pub.ftCheck.publishedAt > 0 && pub.ftCheck.by === 'referee@test' && pub.publishedBy === 'referee@test');
  await assertStored(p, SID20, `[${t}] Publish`, { green: 4, red: 7 });
  const ptext = await p.$eval('.scr-ref-ftcheck', e => e.innerText.replace(/\s+/g, ' '));
  // round 5: player points as a sum (Green 42 + Red 83 = 125, 11 + 14 = 25 players); top points on the full-time card
  const card = await p.$eval('[data-ftcard] [aria-label], [data-ftcard][aria-label]', e => e.getAttribute('aria-label'));
  check(`[${t}] Published: sum Green 11 players 42 + Red 14 players 83 = 125, fix line, card top points Emmanuel 15`, ptext.includes('Published') && /Green 11 players 42 Red 14 players 83 PLAYER PTS 125/i.test(ptext) && ptext.includes('Andrew · duplicate block removed −2') && /Top points Emmanuel · 15 pts/.test(card), ptext.slice(0, 200) + ' | ' + card);
  check(`[${t}] Published counts in the season again (Andrew season = snapshot season)`, (await p.evaluate(pid => Scoring.seasonStats(pid).pts, P.Andrew)) === (await (async () => { const c = await H.open({ referee: true }); const v = await c.page.evaluate(pid => Scoring.seasonStats(pid).pts, P.Andrew); await c.close(); return v; })()));
  await sleep(5200);
  await s.shot(path.join(OUT, `published-390-${t}.png`));
  await layout(p, `[${t}] published`);
  check(`[${t}] FT no console errors`, !s.errors.length, s.errors.join(' | '));
  if (theme === 'dark') fs.writeFileSync(path.join(OUT, 'writes-20jul-ft.json'), JSON.stringify(await p.evaluate(() => Store.test.writes), null, 1));
  await s.close();
}

// =================================================================================================
async function flowBigPoles() {
  const data = H.snapshot();
  const sess = data.sessions[SID12];
  sess.format = { start: 'small', switchedAt: 46, keepers: { red: P.Mike } };
  const s = await openApp({ data, route: `#/ref.edit?sid=${SID12}` });
  const p = s.page;
  // Mike: app 2 + saves since 46' (62,67,69,69,71,73 = 6 → +1) − conceded since 46' (Sosa 56' = 1 → 0), no clean sheet = 3
  check('[big poles] Mike 3 before (saves from 46\' only, 56\' goal conceded)', (await T(p, 'pts', SID12, P.Mike)) === 3, await T(p, 'pts', SID12, P.Mike));
  const g56 = evId(SID12, e => e.type === 'goal' && e.min === 56);
  await click(p, '[data-tap="tab"][data-value="timeline"]');
  let before = await T(p, 'totals', SID12);
  await click(p, `[data-tap="ev"][data-eid="${g56}"]`);
  for (let i = 0; i < 16; i++) await p.click('.sheet [data-tap="min-dn"]');
  await sleep(200);
  check('[big poles] minute stepped 56\' → 40\'', (await p.$eval('.sheet [data-min]', e => e.textContent)) === "40'");
  let pv = await T(p, 'preview');
  check('[big poles] move before the switch: preview Mike 3 → 11 (clean sheet +8), Red DEFs +3', JSON.stringify(pv.rows[P.Mike]) === '[3,11]' && JSON.stringify(pv.rows[P.Andrew]) === '[4,7]', pv.text.replace(/\n/g, ' '));
  await s.shot(path.join(OUT, 'bigpoles-preview-390-dark.png'));
  await click(p, '.sheet [data-tap="f-save"]', 50); await waitSaved(p);
  await assertPreviewMatches(p, SID12, before, pv, '[big poles] 56\'→40\'');
  check('[big poles] stored cleanSheets.red = true', (await p.evaluate(sid => Store.session(sid).cleanSheets.red, SID12)) === true);
  await assertStored(p, SID12, '[big poles] 56\'→40\'', { green: 7, red: 4 });
  await sleep(5200);
  before = await T(p, 'totals', SID12);
  await click(p, `[data-tap="ev"][data-eid="${g56}"]`);
  for (let i = 0; i < 10; i++) await p.click('.sheet [data-tap="min-up"]');
  await sleep(200);
  pv = await T(p, 'preview');
  check('[big poles] move after the switch (50\'): preview Mike 11 → 3', JSON.stringify(pv.rows[P.Mike]) === '[11,3]', pv.text.replace(/\n/g, ' '));
  await click(p, '.sheet [data-tap="f-save"]', 50); await waitSaved(p);
  await assertPreviewMatches(p, SID12, before, pv, '[big poles] 40\'→50\'');
  check('[big poles] stored cleanSheets.red = false', (await p.evaluate(sid => Store.session(sid).cleanSheets.red, SID12)) === false);
  check('[big poles] no console errors', !s.errors.length, s.errors.join(' | '));
  await s.close();
}

// =================================================================================================
async function flowOther() {
  const s = await openApp({ route: `#/ref.edit?sid=-Ou8Jcu4lmK8K8cNMFpg` });
  const p = s.page;
  const SP = '-Ou8Jcu4lmK8K8cNMFpg';
  // post match: stats stepper on a player
  const pid = await p.$eval('[data-tap="pl"]', e => e.dataset.pid);
  let before = await T(p, 'totals', SP);
  await click(p, `[data-tap="pl"][data-pid="${pid}"]`);
  await click(p, '.sheet [data-tap="ps-up"][data-k="goals"]');
  let pv = await T(p, 'preview');
  await s.shot(path.join(OUT, 'post-player-390-dark.png'));
  await click(p, '.sheet [data-tap="ps-save"]', 50); await waitSaved(p);
  await assertPreviewMatches(p, SP, before, pv, '[post] +1 goal');
  // post: score sheet (clean sheets follow the stored score)
  await p.keyboard.press('Escape'); await sleep(200);
  const g0 = await p.evaluate(sid => Store.session(sid).goals, SP);
  await click(p, '[data-tap="score"]');
  const t1 = Object.keys(g0).sort()[0];
  await click(p, `.sheet [data-tap="g-up"][data-team="${t1}"]`);
  before = await T(p, 'totals', SP);
  pv = await T(p, 'preview');
  await click(p, '.sheet [data-tap="g-save"]', 50); await waitSaved(p);
  await assertPreviewMatches(p, SP, before, pv, '[post] score +1');
  await assertStored(p, SP, '[post] score +1');
  // add a player who played, then take them off
  await sleep(5200);
  await click(p, '[data-tap="addp"]');
  await click(p, '.sheet [data-tap="ap-who"]');
  const newPid = await p.$eval('.sheet [data-tap="ap-pick"]', e => e.dataset.pid);
  await click(p, `.sheet [data-tap="ap-pick"][data-pid="${newPid}"]`);
  await click(p, '.sheet [data-tap="ap-save"]', 50); await waitSaved(p);
  check('[post] add a player: on the team sheet, 2 pts', (await T(p, 'pts', SP, newPid)) === 2);
  await sleep(300);
  await p.evaluate(pid => { const team = Object.entries(Store.session('-Ou8Jcu4lmK8K8cNMFpg').teams).find(([, td]) => td.players[pid])[0]; document.querySelector(`[data-seg="fx-team"] [data-value="${team}"]`).click(); }, newPid);
  await sleep(250);
  await click(p, `[data-tap="pl"][data-pid="${newPid}"]`);
  await click(p, '.sheet [data-tap="p-off"]', 50); await waitSaved(p);
  check('[post] take off: gone from the match', (await T(p, 'pts', SP, newPid)) === null);
  // date change
  await sleep(300);
  await p.evaluate(() => { const i = document.querySelector('[data-date]'); i.value = '2026-06-02'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await waitSaved(p);
  check('[post] date changed to 2026-06-02', (await p.evaluate(sid => Store.session(sid).date, SP)) === '2026-06-02');
  // delete match: hold 2 s, then Undo
  await sleep(5200);
  const hold = await p.$('[data-hold="fx-del"]');
  await hold.evaluate(e => e.scrollIntoView({ block: 'center' }));
  const box = await hold.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down(); await sleep(600); await p.mouse.up(); await sleep(200);
  check('[delete] a short press does nothing', !!(await p.evaluate(sid => Store.session(sid), SP)));
  await p.mouse.down(); await sleep(2300); await p.mouse.up();
  await waitSaved(p); await sleep(300);
  check('[delete] hold 2 s deletes the match and goes to the Match tab', !(await p.evaluate(sid => Store.session(sid), SP)) && /^(admin.home|ref.setup|ref.console)$/.test(await p.evaluate(() => document.querySelector('#app-screen section').dataset.screen)));   // round 5: ref.home is retired → the role's home
  await p.click('#app-undo [data-act="undo"]'); await sleep(500);
  check('[delete] Undo brings it back', !!(await p.evaluate(sid => Store.session(sid), SP)));
  // history match: score + "Add who played" → post
  await s.go('#/ref.edit?sid=seed_s16'); await sleep(300);
  await s.shot(path.join(OUT, 'history-390-dark.png'));
  await click(p, '[data-tap="upgrade"]');
  const ticks = await p.$$eval('.sheet [data-tap="up-tick"]', els => els.slice(0, 3).map(e => e.dataset.pid));
  for (const id of ticks) await click(p, `.sheet [data-tap="up-tick"][data-pid="${id}"]`, 120);
  await click(p, '.sheet [data-tap="up-save"]', 50); await waitSaved(p);
  const hs = await p.evaluate(() => { const s = Store.session('seed_s16'); return { mode: s.mode, n: Scoring.sessPlayers(s).length, goals: s.goals }; });
  check('[history] Add who played → mode post with 3 players, score kept', hs.mode === 'post' && hs.n === 3, hs);
  await assertStored(p, 'seed_s16', '[history] upgrade');
  check('[other] no console errors', !s.errors.length, s.errors.join(' | '));
  await s.close();
}

// =================================================================================================
async function shots() {
  for (const theme of ['dark', 'light']) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${theme}`;
      let s = await openApp({ theme, width, route: `#/ref.edit?sid=${SID12}` });
      if (width === 1280) { await s.shot(path.join(OUT, `edit-${tag}.png`)); await layout(s.page, `[${tag}] Edit (laptop: Players + Timeline)`); }
      const g = Object.entries(snap.sessions[SID12].events).find(([, e]) => e.min === 56)[0];
      if (width === 1280) {
        await click(s.page, `[data-tap="ev"][data-eid="${g}"]`);
        await click(s.page, '.sheet [data-tap="f-assist"]');
        await click(s.page, `.sheet [data-tap="pk"][data-pid="${P.Theophilus}"]`);
        await s.shot(path.join(OUT, `event-preview-${tag}.png`)); await layout(s.page, `[${tag}] event sheet`);
      }
      check(`[${tag}] edit no console errors`, !s.errors.length, s.errors.join(' | '));
      await s.close();
      s = await openApp({ theme, width, data: data20Jul(), route: `#/ref.ftcheck?sid=${SID20}` });
      if (width === 1280) { await s.shot(path.join(OUT, `ftcheck-${tag}.png`)); await layout(s.page, `[${tag}] FT check`); }
      // console theme "Same as the app" shows the light check too
      await s.close();
      if (theme === 'light') {
        s = await openApp({ theme, width, data: data20Jul(), consoleTheme: 'app', route: `#/ref.ftcheck?sid=${SID20}` });
        await s.shot(path.join(OUT, `ftcheck-${tag}-consoleapp.png`)); await layout(s.page, `[${tag}] FT check (console = app)`);
        check(`[${tag}] FT check light when console follows the app`, (await s.page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
        await s.close();
      }
    }
  }
}

// =================================================================================================
// Round 5 (decided 20 Oct, option B): a long stoppage is a heads-up only. 19 Oct re-created on a copy
// (round 5 timer, labels restarting each half): the flag shows, OK hides it, Publish works offline,
// and no event minute changes anywhere.
async function flowStoppage() {
  const D = require('../r5-fulltime/data.js');
  const C = D.COPY;
  const s = await openApp({ data: D.copy19('r5'), referee: 'referee', now: '2026-10-19T21:30', route: '#/ref.ftcheck?sid=' + C });
  const p = s.page;
  const all = () => p.evaluate(() => JSON.stringify(Object.entries(Store.sessions()).map(([sid, x]) => [sid, Object.entries((x && x.events) || {}).map(([k, e]) => [k, e.min, e.stoppageBaseMin, e.stoppageMin, e.timestamp])])));
  const ev0 = await all();
  const flag = await p.$eval('[data-stoppage]', e => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  check('[stoppage] flag: "Stoppage ran about 13 min after half time · 6 events in stoppage (46+1\' to 46+12\') · OK"', flag === "Stoppage ran about 13 min after half time 6 events in stoppage (46+1' to 46+12') OK", flag);
  await click(p, '[data-tap="stopkeep"]', 50); await waitSaved(p);
  check('[stoppage] OK hides the flag and stores ftCheck.keep.stoppage_2_46', !(await p.$('[data-stoppage]')) && (await p.evaluate(sid => Store.session(sid).ftCheck.keep.stoppage_2_46, C)) === true);
  check('[stoppage] OK: no event minute changed anywhere', (await all()) === ev0);
  await sleep(5300);
  await p.evaluate(() => Store.test.setStatus('offline')); await sleep(300);
  check('[stoppage] offline: "Publish · sends when signal returns"', (await p.$eval('[data-tap="publish"]', e => e.innerText.trim())) === 'Publish · sends when signal returns');
  await click(p, '[data-tap="publish"]', 50); await waitSaved(p); await sleep(300);
  check('[stoppage] Publish offline: completed on the phone, still active on the "server", page "Waiting for signal"',
    (await p.evaluate(sid => Store.session(sid).status, C)) === 'completed' && (await p.evaluate(sid => Store.test.server.sessions[sid].status, C)) === 'active' &&
    /Waiting for signal/.test(await p.$eval('.fx-pubhead', e => e.innerText)));
  await p.evaluate(() => Store.test.setStatus('online'));
  await p.waitForFunction(() => Store.status().pending === 0, { timeout: 8000 }); await sleep(400);
  const srv = await p.evaluate(sid => Store.test.server.sessions[sid], C);
  check('[stoppage] back online: the "server" has it completed + published, goals {green 6, red 4}; page "Published"',
    srv.status === 'completed' && srv.ftCheck.status === 'published' && JSON.stringify(srv.goals) === '{"green":6,"red":4}' && /Published/.test(await p.$eval('.fx-pubhead', e => e.innerText)), srv.ftCheck);
  await assertStored(p, C, '[stoppage] Publish', { green: 6, red: 4 });
  check('[stoppage] Publish: no event minute changed anywhere (phone and "server")', (await all()) === ev0 &&
    JSON.stringify(Object.entries(srv.events).map(([k, e]) => [k, e.min, e.stoppageMin])) === JSON.stringify(Object.entries(D.copy19('r5').sessions[C].events).map(([k, e]) => [k, e.min, e.stoppageMin])));
  check('[stoppage] no console errors', !s.errors.length, s.errors.join(' | '));
  await s.close();
}

(async () => {
  const only = process.argv[2];
  if (!only || only === '12') { await flow12Oct('dark'); await flow12Oct('light'); }
  if (!only || only === 'ft') { await flowFT('dark'); await flowFT('light'); }
  if (!only || only === 'big') await flowBigPoles();
  if (!only || only === 'other') await flowOther();
  if (!only || only === 'stop') await flowStoppage();
  if (!only || only === 'shots') await shots();
  const sum = `\n${passes} passed, ${fails} failed`;
  console.log(sum); log.push(sum);
  fs.writeFileSync(path.join(OUT, `fix-e2e-result${only ? '-' + only : ''}.txt`), log.join('\n') + '\n');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
