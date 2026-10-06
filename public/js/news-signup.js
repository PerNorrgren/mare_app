// ── news-signup.js (Mare App 8, v87) — Comms on the public pages ──
//
//   <div data-news="teachers">  (or "parents", or "choose")
//     Not signed in → the newsletter form (name, email, which list, an
//     unticked box). The address is confirmed by email before anything
//     is sent.
//     Signed in as a parent or teacher → a simple on/off switch for that
//     person's own lists.
//
//   <body data-news-offer="parent"> (or "teacher")
//     A parent/teacher who has never been asked, and isn't on their own
//     list, is asked once in a small window. "No thanks" is remembered.
// ──────────────────────────────────────────────────────────────────────
(function () {
  const t = (k, v) => (window.MareI18n ? window.MareI18n.t(k, v) : k);
  const loc = () => (window.MareI18n && window.MareI18n.locale === 'en' ? 'en' : 'nl');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const consentKey = (lists) => lists.length > 1 ? 'newsConsentBoth' : (lists[0] === 'teachers' ? 'newsConsentTeachers' : 'newsConsentParents');
  let uid = 0;

  async function post(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('errorGeneric'));
    return data;
  }

  // ── the form (not signed in) ──
  function renderForm(el) {
    const kind = el.getAttribute('data-news');
    const id = `nw${++uid}`;
    const choose = kind === 'choose';
    el.className = (el.className + ' whisper-card news-card').trim();
    el.innerHTML = `
      <span class="whisper-label">${esc(t('newsFormLabel'))}</span>
      <h2>${esc(t(kind === 'teachers' ? 'newsFormTitleTeachers' : 'newsFormTitleParents'))}</h2>
      <p class="whisper-body">${esc(t(kind === 'teachers' ? 'newsFormBodyTeachers' : 'newsFormBodyParents'))}</p>
      <form class="whisper-form" novalidate>
        ${choose ? `<fieldset class="news-choice"><legend>${esc(t('newsIAm'))}</legend>
          <label><input type="radio" name="${id}-who" value="parents" checked> ${esc(t('newsWhoParent'))}</label>
          <label><input type="radio" name="${id}-who" value="teachers"> ${esc(t('newsWhoTeacher'))}</label>
          <label><input type="radio" name="${id}-who" value="both"> ${esc(t('newsWhoBoth'))}</label></fieldset>` : ''}
        <div class="news-fields">
          <div class="field"><label for="${id}-name">${esc(t('newsFirstName'))}</label><input type="text" id="${id}-name" autocomplete="given-name" maxlength="80"></div>
          <div class="field"><label for="${id}-email">${esc(t('fieldEmail'))}</label><input type="email" id="${id}-email" autocomplete="email" required></div>
        </div>
        <input type="text" name="website" tabindex="-1" autocomplete="off" class="news-hp" aria-hidden="true">
        <label class="acc-checkbox-row news-consent"><input type="checkbox"> <span></span></label>
        <p class="form-error" hidden></p>
        <p class="form-success" hidden>${esc(t('newsFormSent'))}</p>
        <button type="submit" class="btn-primary">${esc(t('newsFormButton'))}</button>
      </form>`;
    const form = el.querySelector('form');
    const lists = () => {
      if (!choose) return [kind === 'teachers' ? 'teachers' : 'parents'];
      const v = (form.querySelector(`input[name="${id}-who"]:checked`) || {}).value || 'parents';
      return v === 'both' ? ['parents', 'teachers'] : [v];
    };
    const label = () => { form.querySelector('.news-consent span').textContent = t(consentKey(lists())); };
    label();
    form.querySelectorAll(`input[name="${id}-who"]`).forEach(r => r.addEventListener('change', label));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('.form-error');
      err.hidden = true;
      if (!form.querySelector('.news-consent input').checked) { err.textContent = t('newsTickFirst'); err.hidden = false; return; }
      try {
        await post('/api/comms/signup', {
          name: document.getElementById(`${id}-name`).value.trim(), email: document.getElementById(`${id}-email`).value.trim(),
          lists: lists(), consent: true, locale: loc(), website: form.querySelector('.news-hp').value,
        });
        form.querySelectorAll('.news-choice, .news-fields, .news-consent, button').forEach(x => { x.hidden = true; });
        form.querySelector('.form-success').hidden = false;
      } catch (ex) { err.textContent = ex.message === "That doesn't look like a valid email address" ? t('errorInvalidEmail') : ex.message; err.hidden = false; }
    });
  }

  // ── the switch (signed in) ──
  function renderSwitch(el, me) {
    const kind = el.getAttribute('data-news');
    const own = me.role === 'teacher' ? 'teachers' : 'parents';
    const show = kind === 'choose' ? [own, own === 'parents' ? 'teachers' : 'parents'] : [kind];
    const plain = el.hasAttribute('data-news-plain');
    el.className = (el.className + (plain ? ' news-switch-plain' : ' whisper-card news-card')).trim();
    el.innerHTML = `${plain ? `<p class="news-switch-head">${esc(t('newsFormLabel'))}</p>` : `<span class="whisper-label">${esc(t('newsFormLabel'))}</span>`}
      ${show.map(l => `<label class="acc-checkbox-row"><input type="checkbox" data-list="${l}"${me.lists[l] ? ' checked' : ''}> <span>${esc(t(l === 'teachers' ? 'newsSwitchTeachers' : 'newsSwitchParents'))}</span></label>`).join('')}
      <p class="news-switch-note">${esc(t('newsSwitchNote'))}</p>`;
    el.querySelectorAll('input[data-list]').forEach(box => box.addEventListener('change', async () => {
      box.disabled = true;
      try {
        await post('/api/comms/mine', { lists: { [box.dataset.list]: box.checked }, source: 'account', locale: loc() });
        flash(el, t(box.checked ? 'newsSwitchOn' : 'newsSwitchOff'));
      } catch { box.checked = !box.checked; flash(el, t('errorGeneric')); }
      box.disabled = false;
    }));
  }
  function flash(el, msg) {
    let n = el.querySelector('.news-flash');
    if (!n) { n = document.createElement('p'); n.className = 'form-success news-flash'; el.appendChild(n); }
    n.textContent = msg; n.hidden = false;
    clearTimeout(n._t); n._t = setTimeout(() => { n.hidden = true; }, 3000);
  }

  // ── asked once (signed in, never asked, not on their own list) ──
  function offer(me) {
    const own = me.role === 'teacher' ? 'teachers' : 'parents';
    const bd = document.createElement('div');
    bd.className = 'admin-modal-backdrop news-offer';
    bd.innerHTML = `<div class="admin-modal-card" role="dialog" aria-modal="true" aria-labelledby="news-offer-title">
      <h3 id="news-offer-title">${esc(t('newsOfferTitle'))}</h3>
      <p>${esc(t(own === 'teachers' ? 'newsOfferBodyTeachers' : 'newsOfferBodyParents'))}</p>
      <p class="form-error" hidden></p>
      <div class="admin-modal-btns">
        <button type="button" class="btn-ghost" data-a="no">${esc(t('newsOfferNo'))}</button>
        <button type="button" class="btn-primary" data-a="yes">${esc(t('newsOfferYes'))}</button>
      </div></div>`;
    document.body.appendChild(bd);
    const close = () => bd.remove();
    bd.querySelector('[data-a="no"]').addEventListener('click', async () => {
      try { await post('/api/comms/asked'); } catch { /* asked again next time */ }
      close();
    });
    bd.querySelector('[data-a="yes"]').addEventListener('click', async () => {
      try {
        await post('/api/comms/mine', { lists: { [own]: true }, source: 'offer', locale: loc() });
        bd.querySelector('.admin-modal-card').innerHTML = `<h3>${esc(t('newsOfferThanks'))}</h3><p>${esc(t('newsOfferThanksBody'))}</p>
          <div class="admin-modal-btns"><button type="button" class="btn-primary" data-no-busy>${esc(t('adminClose'))}</button></div>`;
        bd.querySelector('button').addEventListener('click', close);
        document.querySelectorAll(`[data-news] input[data-list="${own}"]`).forEach(b => { b.checked = true; });
      } catch (e) { const er = bd.querySelector('.form-error'); er.textContent = e.message; er.hidden = false; }
    });
  }

  async function init() {
    if (window.MareI18n) await window.MareI18n.ready;
    const els = [...document.querySelectorAll('[data-news]')];
    const wantsOffer = document.body.getAttribute('data-news-offer');
    if (!els.length && !wantsOffer) return;
    let me = null;
    try {
      const r = await fetch('/api/comms/mine');
      if (r.ok) me = await r.json();
    } catch { /* offline for a moment: show the form */ }
    els.forEach(el => (me ? renderSwitch(el, me) : renderForm(el)));
    if (me && wantsOffer && wantsOffer === me.role && !me.asked) setTimeout(() => offer(me), 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
