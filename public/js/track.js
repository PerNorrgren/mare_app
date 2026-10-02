// ── track.js (Mare App 6, v78; v80) — first-party usage analytics ─────
// Counts pages opened, the time a page is actually in view, and things
// done (window.MareTrack.event). Nothing is sent to other companies.
//
// v80:
//   - Visitor ID: a random 8-character code kept in this browser
//     (localStorage), so a returning visitor can be recognised. It is not
//     an IP address and carries nothing about the person; once the
//     browser signs in, the server links the code to that account.
//   - Only people: a visit counts once someone is clearly there (5 s in
//     view, or a tap, scroll or key). Automated browsers are reported as
//     bots and not counted; named crawlers are refused by the server.
//   - Off switch: nothing is recorded if the visitor turned visit
//     statistics off (link at the bottom of public pages), or the browser
//     sends 'do not track' / Global Privacy Control.
// Time stops counting when the tab is hidden, and after 5 minutes with no
// touch, key or scroll — unless a video or sound is playing.
(function () {
  if (window.MareTrack) return;
  const IDLE_MS = 5 * 60 * 1000, PING_MS = 30 * 1000, HUMAN_MS = 5000;
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } return null; };
  const browserSaysNo = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  const optedOut = () => browserSaysNo || store('mare_stats_off') === '1';
  const page = location.pathname === '/index.html' ? '/' : location.pathname;
  const t = (k, fb) => { try { const v = window.MareI18n && window.MareI18n.t(k); return v && v !== k ? v : fb; } catch { return fb; } };

  // The small "Visit statistics" link + switch on public pages
  const PUBLIC = ['/', '/companion.html', '/club-mare.html', '/forest.html', '/riddle.html', '/merchandise.html', '/account.html', '/login.html', '/teacher.html', '/teacher-login.html', '/press.html'];
  function statsLink() {
    if (!PUBLIC.includes(page) || document.getElementById('mare-stats-link')) return;
    const st = document.createElement('style');
    st.textContent = `#mare-stats-link{position:relative;z-index:1;display:block;margin:28px auto 18px;text-align:center;font:500 0.78rem 'Quicksand',sans-serif;color:inherit;opacity:.65;background:none;border:0;cursor:pointer;text-decoration:underline}
      #mare-stats-box{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px}
      #mare-stats-box>div{max-width:440px;background:#FFFBF1;color:#16305C;border-radius:16px;padding:20px 22px;font:0.92rem/1.5 'Quicksand',sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.4)}
      #mare-stats-box h3{margin:0 0 8px;font-size:1.1rem}#mare-stats-box label{display:flex;gap:10px;align-items:center;margin:14px 0;font-weight:700}
      #mare-stats-box input{width:20px;height:20px}#mare-stats-box button{font:700 .9rem 'Quicksand',sans-serif;padding:8px 18px;border-radius:999px;border:0;background:#E2BE6E;color:#16305C;cursor:pointer}`;
    document.head.appendChild(st);
    const a = document.createElement('button');
    a.type = 'button'; a.id = 'mare-stats-link'; a.setAttribute('data-no-busy', '');
    a.textContent = t('statsLink', 'Visit statistics');
    a.addEventListener('click', () => {
      const box = document.createElement('div'); box.id = 'mare-stats-box';
      box.innerHTML = `<div role="dialog" aria-modal="true"><h3></h3><p class="s1"></p><p class="s2"></p>
        <label><input type="checkbox"> <span></span></label><p class="s3"></p><button type="button" data-no-busy></button></div>`;
      box.querySelector('h3').textContent = t('statsTitle', 'Visit statistics');
      box.querySelector('.s1').textContent = t('statsBody1', 'To see how Mare is used, this app counts visits: which pages are opened and for how long. Your browser keeps a random code so a return visit is recognised.');
      box.querySelector('.s2').textContent = t('statsBody2', 'No cookies from other companies, no IP addresses, nothing shared or sold. If you have an account, your visits are linked to it so we can help you.');
      const cb = box.querySelector('input'); cb.checked = !optedOut(); cb.disabled = browserSaysNo;
      box.querySelector('label span').textContent = t('statsSwitch', 'Count my visits');
      box.querySelector('.s3').textContent = browserSaysNo ? t('statsBrowserNo', "Your browser asks websites not to track, so your visits aren't counted.") : '';
      cb.addEventListener('change', () => {
        if (cb.checked) { store('mare_stats_off', null); } else { store('mare_stats_off', '1'); store('mare_did', null); stopped = true; }
      });
      const close = () => box.remove();
      const btn = box.querySelector('button'); btn.textContent = t('statsClose', 'Close'); btn.addEventListener('click', close);
      box.addEventListener('click', (e) => { if (e.target === box) close(); });
      document.body.appendChild(box);
    });
    document.body.appendChild(a);
  }
  const ready = window.MareI18n && window.MareI18n.ready ? window.MareI18n.ready : Promise.resolve();
  ready.then(statsLink, statsLink);

  let stopped = optedOut();
  if (stopped) { window.MareTrack = { event() {} }; return; }

  // visit (this tab) and visitor ID (this browser)
  let sid = '';
  try {
    sid = sessionStorage.getItem('mare_sid') || '';
    if (!sid) { sid = (Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-z0-9]/g, '').slice(0, 24); sessionStorage.setItem('mare_sid', sid); }
  } catch { sid = Math.random().toString(36).slice(2, 14) + 'x'; }
  let did = store('mare_did');
  if (!/^[0-9A-Z]{8}$/.test(did || '')) {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // no I, L, O, U: easy to read out
    const r = new Uint8Array(8); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(r) : r.forEach((_, i) => { r[i] = Math.random() * 256; });
    did = [...r].map(x => A[x % 32]).join('');
    store('mare_did', did);
  }
  const bot = navigator.webdriver === true;
  const lang = () => (window.MareI18n && window.MareI18n.locale) || (document.documentElement.lang || 'en').slice(0, 2);
  const device = (() => {
    const w = Math.min(screen.width, screen.height), ua = navigator.userAgent;
    if (/iPad|Tablet/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) return 'tablet';
    if (/Mobi|iPhone|Android.+Mobile/i.test(ua) || w < 600) return 'phone';
    if (/Android/i.test(ua)) return 'tablet';
    return 'desktop';
  })();
  const send = (url, data, beacon) => {
    if (stopped) return Promise.resolve(null);
    const body = JSON.stringify(data);
    if (beacon && navigator.sendBeacon) { try { if (navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return Promise.resolve(null); } catch { /* fall back */ } }
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => null);
  };

  let vid = null, started = false, counted = 0, lastTick = Date.now(), lastActive = 0, visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
  const pendingEvents = [];
  const playing = () => [...document.querySelectorAll('video, audio')].some(m => !m.paused && !m.ended);
  function start() {
    if (started || stopped) return;
    started = true;
    send('/api/a/v', { sid, did, page, lang: lang(), device, ref: document.referrer || '', bot: bot ? 1 : 0 })
      .then(r => (r && r.ok && r.status !== 204 ? r.json() : null)).then(d => { if (d && d.vid) vid = d.vid; }).catch(() => {});
    pendingEvents.splice(0).forEach(e => send('/api/a/e', e, true));
  }
  // a person is there: a tap/scroll/key, or 5 s with the page in view
  ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'].forEach(ev => window.addEventListener(ev, () => { lastActive = Date.now(); start(); }, { passive: true, capture: true }));
  setTimeout(function check() { if (started) return; if (visibleSince && Date.now() - visibleSince >= HUMAN_MS) start(); else setTimeout(check, 1000); }, HUMAN_MS);
  function tick() {
    const now = Date.now(), dt = now - lastTick; lastTick = now;
    if (document.visibilityState === 'visible' && (now - Math.max(lastActive, visibleSince) < IDLE_MS || playing())) counted += Math.min(dt, PING_MS + 5000);
  }
  function flushTime(beacon) {
    tick();
    const s = Math.round(counted / 1000);
    if (!vid || s < 1) return;
    counted -= s * 1000;
    send('/api/a/p', { vid, s: Math.min(s, 90) }, beacon);
  }
  setInterval(() => flushTime(false), PING_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushTime(true);
    else { lastTick = Date.now(); if (!visibleSince) visibleSince = Date.now(); }
  });
  window.addEventListener('pagehide', () => flushTime(true));

  window.MareTrack = {
    event(name, detail, value) {
      const e = { sid, page, name, detail: detail == null ? '' : String(detail), value: value == null ? '' : value, bot: bot ? 1 : 0 };
      if (started) send('/api/a/e', e, true); else { pendingEvents.push(e); start(); } // doing something = a person
    },
  };
})();
