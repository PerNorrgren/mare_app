// ── viewas-bar.js (Mare App 5) — "View the site as…" bar.
// Shown on every page while an admin/support is looking at the site as a
// visitor, the preview family or the preview teacher. Does nothing (not
// even a request) for everyone else: it only runs when the mare_viewas
// cookie is set.
(function () {
  if (!/(?:^|;\s*)mare_viewas=/.test(document.cookie)) return;
  const nl = () => (window.MareI18n && window.MareI18n.locale === 'nl') || /(?:^|;\s*)mare_locale=nl/.test(document.cookie);
  const L = {
    en: { as: 'Viewing the site as', visitor: 'a visitor (not signed in)', parent: 'a parent (preview family)', teacher: 'a teacher (preview teacher)', switchTo: 'Switch to', back: 'Back to admin', v: 'Visitor', p: 'Parent', t: 'Teacher' },
    nl: { as: 'Je bekijkt de site als', visitor: 'bezoeker (niet ingelogd)', parent: 'ouder (voorbeeldgezin)', teacher: 'leerkracht (voorbeeldleerkracht)', switchTo: 'Wissel naar', back: 'Terug naar beheer', v: 'Bezoeker', p: 'Ouder', t: 'Leerkracht' },
  };
  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    return r.json().catch(() => ({}));
  }
  async function show() {
    let st;
    try { st = await (await fetch('/api/view-as')).json(); } catch { return; }
    if (!st || !st.active) return;
    const T = L[nl() ? 'nl' : 'en'];
    const bar = document.createElement('div');
    bar.id = 'viewas-bar';
    bar.setAttribute('role', 'region');
    bar.innerHTML = `<span class="va-eye" aria-hidden="true">👁</span>
      <span class="va-text">${T.as} <strong>${T[st.as] || st.as}</strong></span>
      <span class="va-switch">${T.switchTo}:
        ${[['visitor', T.v], ['parent', T.p], ['teacher', T.t]].filter(([k]) => k !== st.as).map(([k, lab]) => `<button type="button" data-as="${k}">${lab}</button>`).join('')}
      </span>
      <button type="button" class="va-back">${T.back}</button>`;
    document.body.appendChild(bar);
    document.body.classList.add('has-viewas-bar');
    bar.querySelectorAll('[data-as]').forEach(b => b.addEventListener('click', async () => {
      // switching needs the staff session back first, then the new view
      await post('/api/view-as/exit');
      const out = await post('/api/admin/view-as', { as: b.dataset.as });
      window.location.href = out.redirect || '/';
    }));
    bar.querySelector('.va-back').addEventListener('click', async () => {
      const out = await post('/api/view-as/exit');
      window.location.href = out.redirect || '/admin.html';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
