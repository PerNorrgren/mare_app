// ── busy-buttons.js (Mare App 5) — every button on every page answers at
// once and says when it's finished, without each handler having to do
// it. (First admin + editor only; from v70 loaded on every page except
// the child's Picture Explorer, whose buttons never talk to the server.)
//
//   click        → the button dips (instant, even if nothing is sent)
//   request out  → spinner, and further clicks are ignored (no doubles)
//   all finished → ✓ for a moment if something was saved/sent,
//                  ✕ if a request failed; just back to normal after a
//                  plain load. If the button was replaced while working
//                  (lists re-render), a small "Done" note shows instead.
//
//   leaves page  → if the click ends in going to another page (checkout
//                  to Stripe, log in, a button-style link), the spinner
//                  stays until that page opens, so it can't be clicked
//                  twice. Coming back with Back clears it.
//
// Per button:  data-no-busy     → left alone entirely
//              data-busy-quiet  → spinner only, no ✓ (page turns, play)
//
// How: a click "arms" that button; every fetch() started while it is
// armed (including follow-on requests in the same chain, e.g. save then
// send) is counted against it. Must load before the page's own script.
// ──────────────────────────────────────────────────────────────────────
(function () {
  const ARM_MS = 2500;      // a request this soon after the click belongs to it
  const SETTLE_MS = 150;    // wait this long after the last reply for a follow-on
  const MARK_MS = 1600;     // how long ✓ / ✕ stays
  const NAV_MS = 10000;     // longest a "going to the next page" spinner stays
  const SKIP = '.lang-btn, [data-no-busy]';
  // Links that look like buttons get the dip and, if they open another
  // page in this tab, the leaving spinner.
  const LINK_BTN = 'a.btn-primary, a.btn-ghost';
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
      if (s.pending || s.leaving) return; // leaving: keep turning
      btn.classList.remove('is-busy');
      btn.removeAttribute('aria-busy');
      const show = s.failed || (s.wrote && !btn.hasAttribute('data-busy-quiet'));
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

  function sameTabLink(a, e) {
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    if (a.hasAttribute('download') || (a.target && a.target !== '_self')) return false;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return false;
    return true;
  }

  // Capture phase: runs before the page's own handlers, and swallows
  // clicks on a button that is still working.
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('button, input[type="submit"], input[type="button"], ' + LINK_BTN);
    if (!t || t.disabled) return;
    if (t.classList.contains('is-busy')) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (t.tagName === 'A' && !sameTabLink(t, e)) return;
    arm(t);
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

  // The click led to another page (location change, form post, link):
  // keep that button turning until the new page is up. beforeunload
  // fires for real page changes only — not for downloads — and a safety
  // timer brings it back if the page somehow stays.
  window.addEventListener('beforeunload', () => {
    const a = armed;
    if (!a || !document.contains(a.btn) || Date.now() - a.t > NAV_MS) return;
    const s = state(a.btn);
    s.leaving = true;
    clearTimeout(s.timer);
    a.btn.classList.remove('is-done', 'is-failed');
    a.btn.classList.add('is-busy');
    a.btn.setAttribute('aria-busy', 'true');
    setTimeout(() => clear(a.btn), NAV_MS);
  });
  function clear(btn) {
    const s = state(btn);
    s.leaving = false; s.pending = 0;
    btn.classList.remove('is-busy', 'is-done', 'is-failed');
    btn.removeAttribute('aria-busy');
  }
  // Back button from Stripe or another page restores this one as it was
  // left: take every leftover spinner down.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    armed = null;
    document.querySelectorAll('.is-busy').forEach(clear);
  });

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
