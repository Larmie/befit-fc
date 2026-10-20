/* ============================================================================
   BE Fit Club · js/core/save.js · THE save pattern (every log button uses it)
   ----------------------------------------------------------------------------
   lock on first tap → "Saving…" → saved + 5 s Undo bar → or "Not saved" + Retry.
   No "Are you sure?" boxes anywhere (hold-to-confirm is UI.hold, for End game
   and Clear payment record only).

     const h = Save.run({
       label:   "Goal · Barnabas 72'",       // one line for the Undo bar (sub: optional second line)
       write:   () => Store.set(path, data),  // MUST be safe to repeat (use a key made with Store.newKey())
       undo:    () => Store.remove(path),     // optional; no undo → no Undo button
       button:  tappedEl,                     // optional: locks at once and shows "Saving…"
       group:   sheetEl,                      // optional: every other [data-tap]/button inside locks (opacity .35)
       again:   { label: '+1 again', run: () => {...} },   // optional extra button on the bar
       onSaved: h => {}, onError: (err, h) => {}, onUndone: h => {},
       bar:     true,                         // false = no Undo bar (e.g. settings); a toast is up to you
       timeoutMs: 8000,                       // after this, show "Not saved" (Firebase keeps trying underneath)
     });
     h.state   'saving' | 'saved' | 'error' | 'undoing' | 'undone'
     h.done    Promise<'saved' | 'error'> (first outcome)
     h.undo()  h.retry()  h.dismiss()

   Second taps while saving do nothing (the same handle comes back).
   If a timed-out write lands later, the bar flips to saved on its own.
   ========================================================================== */
(function () {
  'use strict';
  const active = new WeakMap();
  const ui = () => window.UI;

  function lockGroup(group, button) {
    if (!group) return [];
    const els = Array.from(group.querySelectorAll('button, [data-tap]')).filter(el => el !== button && !el.classList.contains('is-locked'));
    els.forEach(el => el.classList.add('is-locked'));
    return els;
  }

  function run(opts) {
    const o = Object.assign({ bar: true, timeoutMs: 8000, savingText: 'Saving…' }, opts);
    if (o.button && active.has(o.button)) return active.get(o.button);

    let locked = [], original = null, settled = false, resolveDone;
    const h = { state: 'saving', label: o.label, done: new Promise(r => { resolveDone = r; }) };
    const first = outcome => { if (!settled) { settled = true; resolveDone(outcome); } };

    function lock() {
      if (o.button) {
        active.set(o.button, h);
        if (original === null) original = o.button.innerHTML;
        o.button.classList.add('is-saving');
        o.button.setAttribute('aria-busy', 'true');
        if (o.savingText) {
          const txt = o.button.querySelector('[data-label]') || o.button;
          if (txt === o.button) o.button.textContent = o.savingText; else txt.textContent = o.savingText;
        }
      }
      locked = locked.length ? locked : lockGroup(o.group, o.button);
    }
    function unlock() {
      if (o.button) {
        active.delete(o.button);
        o.button.classList.remove('is-saving');
        o.button.removeAttribute('aria-busy');
        if (original !== null) o.button.innerHTML = original;
      }
      locked.forEach(el => el.classList.remove('is-locked'));
      locked = [];
    }

    function attempt(fn, onOk, onFail) {
      let timer, late = false;
      const p = Promise.resolve().then(fn);
      const timeout = new Promise((_, rej) => { timer = setTimeout(() => { late = true; rej(new Error('timeout')); }, o.timeoutMs); });
      Promise.race([p, timeout]).then(v => { clearTimeout(timer); onOk(v); }, err => {
        clearTimeout(timer); onFail(err);
        if (late) p.then(() => { if (h.state === 'error') onOk(null, true); }, () => {});
      });
    }

    function noSignal() {
      const st = window.Store && window.Store.status();
      return st && st.status === 'offline';
    }

    function saved(_, late) {
      h.state = 'saved';
      unlock();
      first('saved');
      if (o.bar && ui()) {
        ui().undoBar.show({
          text: o.label, sub: o.sub || null,
          onUndo: o.undo ? () => h.undo() : null,
          again: o.again || null,
          note: late ? 'Sent' : null,
        });
      }
      if (o.onSaved) o.onSaved(h);
    }
    function failed(err) {
      h.state = 'error';
      h.error = err;
      first('error');
      if (ui()) {
        ui().undoBar.error({
          title: noSignal() || (err && err.message === 'timeout') ? 'Not saved · no signal' : 'Not saved',
          text: o.label,
          onRetry: () => h.retry(),
          onDismiss: () => h.dismiss(),
        });
      }
      if (o.onError) o.onError(err, h);
    }

    h.retry = () => {
      if (h.state !== 'error') return h;
      h.state = 'saving';
      if (ui()) ui().undoBar.saving('Saving… · ' + o.label);
      attempt(o.write, saved, failed);
      return h;
    };
    h.dismiss = () => { unlock(); if (ui()) ui().undoBar.hide(); return h; };
    h.undo = () => {
      if (!o.undo || h.state !== 'saved') return h;
      h.state = 'undoing';
      attempt(o.undo, () => {
        h.state = 'undone';
        if (ui()) ui().undoBar.note('Removed');
        if (o.onUndone) o.onUndone(h);
      }, err => {
        h.state = 'saved';
        if (ui()) ui().undoBar.error({ title: 'Not removed', text: o.label, onRetry: () => h.undo(), onDismiss: () => ui().undoBar.hide() });
      });
      return h;
    };

    lock();
    attempt(o.write, saved, failed);
    return h;
  }

  window.Save = { run };
})();
