// ── track.js (Mare App 6, v78) — first-party usage analytics ──────────
// Counts pages opened, the time a page is actually in view, and things
// done (window.MareTrack.event). The visit id lives in sessionStorage
// only: it ends when the tab closes. No cookies, nothing sent elsewhere.
// Time stops counting when the tab is hidden, and after 5 minutes with no
// touch, key or scroll — unless a video or sound is playing.
(function () {
  if (window.MareTrack) return;
  const IDLE_MS = 5 * 60 * 1000, PING_MS = 30 * 1000;
  let sid = '';
  try {
    sid = sessionStorage.getItem('mare_sid') || '';
    if (!sid) { sid = (Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-z0-9]/g, '').slice(0, 24); sessionStorage.setItem('mare_sid', sid); }
  } catch { sid = Math.random().toString(36).slice(2, 14) + 'x'; }
  const page = location.pathname === '/index.html' ? '/' : location.pathname;
  const lang = () => (window.MareI18n && window.MareI18n.locale) || (document.documentElement.lang || 'en').slice(0, 2);
  const device = (() => {
    const w = Math.min(screen.width, screen.height), ua = navigator.userAgent;
    if (/iPad|Tablet/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) return 'tablet';
    if (/Mobi|iPhone|Android.+Mobile/i.test(ua) || w < 600) return 'phone';
    if (/Android/i.test(ua)) return 'tablet';
    return 'desktop';
  })();
  const send = (url, data, beacon) => {
    const body = JSON.stringify(data);
    if (beacon && navigator.sendBeacon) { try { if (navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return Promise.resolve(null); } catch { /* fall back */ } }
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => null);
  };

  let vid = null, counted = 0, lastTick = Date.now(), lastActive = Date.now();
  const playing = () => [...document.querySelectorAll('video, audio')].some(m => !m.paused && !m.ended);
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev => window.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true, capture: true }));
  function tick() {
    const now = Date.now(), dt = now - lastTick; lastTick = now;
    if (document.visibilityState === 'visible' && (now - lastActive < IDLE_MS || playing())) counted += Math.min(dt, PING_MS + 5000);
  }
  function flushTime(beacon) {
    tick();
    const s = Math.round(counted / 1000);
    if (!vid || s < 1) return;
    counted -= s * 1000;
    send('/api/a/p', { vid, s: Math.min(s, 90) }, beacon);
  }
  // Start once the language is known (so EN/NL is right).
  const start = () => {
    send('/api/a/v', { sid, page, lang: lang(), device, ref: document.referrer || '' })
      .then(r => (r && r.ok && r.status !== 204 ? r.json() : null)).then(d => { if (d && d.vid) vid = d.vid; }).catch(() => {});
  };
  if (window.MareI18n && window.MareI18n.ready) window.MareI18n.ready.then(start, start); else start();
  setInterval(() => flushTime(false), PING_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushTime(true); else lastTick = Date.now(); });
  window.addEventListener('pagehide', () => flushTime(true));

  window.MareTrack = {
    event(name, detail, value) {
      send('/api/a/e', { sid, page, name, detail: detail == null ? '' : String(detail), value: value == null ? '' : value }, true);
    },
  };
})();
