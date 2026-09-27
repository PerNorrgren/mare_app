// ── busy-buttons.js (Mare App 5) — every button on the admin and editor
// pages answers at once and says when it's finished, without each
// handler having to do it.
//
//   click        → the button dips (instant, even if nothing is sent)
//   request out  → spinner, and further clicks are ignored (no doubles)
//   all finished → ✓ for a moment if something was saved/sent,
//                  ✕ if a request failed; just back to normal after a
//                  plain load. If the button was replaced while working
//                  (lists re-render), a small "Done" note shows instead.
//
// How: a click "arms" that button; every fetch() started while it is
// armed (including follow-on requests in the same chain, e.g. save then
// send) is counted against it. Must load before the page's own script.
// ──────────────────────────────────────────────────────────────────────
(function () {
  const ARM_MS = 2500;      // a request this soon after the click belongs to it
  const SETTLE_MS = 150;    // wait this long after the last reply for a follow-on
  const MARK_MS = 1600;     // how long ✓ / ✕ stays
  const SKIP = '.lang-btn, [data-no-busy]';
  const st = new WeakMap(); // button -> { pending, wrote, failed, timer }
  let armed = null;         // { btn, t }

  const nl = () => (window.MareI18n && window.MareI18n.locale === 'nl');

  function toast(ok) {
    let el = document.getElementById('busy-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'busy-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = ok ? (nl() ? '✓ Klaar' : '✓ Done') : (nl() ? '✕ Dat lukte niet' : '✕ That didn’t work');
    el.className = ok ? 'show' : 'show fail';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = ''; }, MARK_MS);
  }

  function state(btn) {
    let s = st.get(btn);
    if (!s) { s = { pending: 0, wrote: false, failed: false, timer: null }; st.set(btn, s); }
    return s;
  }

  function start(btn, isWrite) {
    const s = state(btn);
    clearTimeout(s.timer);
    if (s.pending === 0 && !btn.classList.contains('is-busy')) { s.wrote = false; s.failed = false; }
    s.pending++;
    if (isWrite) s.wrote = true;
    btn.classList.remove('is-done', 'is-failed');
    btn.classList.add('is-busy');
    btn.setAttribute('aria-busy', 'true');
  }

  function finish(btn, ok) {
    const s = state(btn);
    s.pending = Math.max(0, s.pending - 1);
    if (!ok) s.failed = true;
    if (armed && armed.btn === btn) armed.t = Date.now(); // keep the chain attached
    if (s.pending) return;
    clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      if (s.pending) return;
      btn.classList.remove('is-busy');
      btn.removeAttribute('aria-busy');
      const show = s.failed || s.wrote;
      if (!show) return;
      if (!document.contains(btn)) { toast(!s.failed); return; }
      btn.classList.add(s.failed ? 'is-failed' : 'is-done');
      setTimeout(() => btn.classList.remove('is-done', 'is-failed'), MARK_MS);
    }, SETTLE_MS);
  }

  function arm(btn) {
    if (!btn || btn.matches(SKIP)) return;
    btn.classList.remove('is-done', 'is-failed');
    btn.classList.add('is-pressed');
    setTimeout(() => btn.classList.remove('is-pressed'), 160);
    armed = { btn, t: Date.now() };
  }

  // Capture phase: runs before the page's own handlers, and swallows
  // clicks on a button that is still working.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('button, input[type="submit"], input[type="button"]');
    if (!btn || btn.disabled) return;
    if (btn.classList.contains('is-busy')) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    arm(btn);
  }, true);
  // Pressing Enter in a form "clicks" its submit button.
  document.addEventListener('submit', (e) => {
    const btn = e.submitter || (e.target.querySelector && e.target.querySelector('button[type="submit"], button:not([type])'));
    if (btn && btn.classList.contains('is-busy')) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (btn && (!armed || armed.btn !== btn || Date.now() - armed.t > ARM_MS)) arm(btn);
  }, true);

  // A confirm box can stay open longer than ARM_MS; the clock restarts
  // once it's answered, so "Send to 40 families? OK" still shows working.
  const realConfirm = window.confirm.bind(window);
  window.confirm = function (msg) {
    const ok = realConfirm(msg);
    if (armed) armed.t = Date.now();
    if (!ok) armed = null;
    return ok;
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const a = armed;
    const live = a && document.contains(a.btn) && (Date.now() - a.t <= ARM_MS || state(a.btn).pending > 0);
    if (!live) return realFetch(input, init);
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const btn = a.btn;
    start(btn, method !== 'GET' && method !== 'HEAD');
    return realFetch(input, init).then(
      (res) => { finish(btn, res.ok); return res; },
      (err) => { finish(btn, false); throw err; }
    );
  };
})();
