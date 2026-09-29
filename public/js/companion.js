// ── companion.js (Mare App 5) — The Book Companion, a parent's home.
// Loads /api/companion; not signed in as a parent → the log-in page.
(function () {
  const t = (k, v) => window.MareI18n.t(k, v);
  const nl = () => window.MareI18n.locale === 'nl';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let data = null;
  let stars = 0;

  async function api(path, body) {
    const res = await fetch(path + (path.includes('?') ? '&' : '?') + `lang=${nl() ? 'nl' : 'en'}`, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : undefined);
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(out.error || t('errorGeneric')); e.status = res.status; throw e; }
    return out;
  }

  // Practice text: blank lines = paragraphs; "1." lines become a list.
  function practiceHtml(body) {
    return String(body || '').split(/\n{2,}/).map(block => {
      const lines = block.split('\n');
      if (lines.every(l => /^\d+\.\s/.test(l.trim()))) {
        return `<ol>${lines.map(l => `<li>${esc(l.trim().replace(/^\d+\.\s*/, ''))}</li>`).join('')}</ol>`;
      }
      const m = block.match(/^(Talk about it|Praat erover):\s*([\s\S]*)$/);
      if (m) return `<p class="cp-talk"><strong>${esc(m[1])}:</strong> ${esc(m[2])}</p>`;
      return `<p>${esc(block).replace(/\n/g, '<br>')}</p>`;
    }).join('');
  }

  function renderPractice(p) {
    $('cp-practice-title').textContent = p ? p.title : '';
    $('cp-practice-body').innerHTML = p ? practiceHtml(p.body) : '';
  }

  function renderChapters() {
    const sel = $('cp-chapter');
    sel.innerHTML = data.chapters.map(c => `<option value="${c.no}"${c.no === data.chapter ? ' selected' : ''}>${esc(t('companionChapterN', { n: c.no }))}: ${esc(c.title)}</option>`).join('');
    sel.onchange = async () => {
      try {
        const out = await api('/api/companion/chapter', { chapter: Number(sel.value) });
        data.chapter = out.chapter;
        renderPractice(out.practice);
        if (data.preview) $('cp-read-btn').href = `/pictures.html?chapter=${out.chapter}`;
      } catch { /* keep the old one */ }
    };
  }

  function renderMessages() {
    const box = $('cp-msgs');
    const msgs = data.messages || [];
    box.innerHTML = msgs.length ? `<h3>${esc(t('companionMsgHistory'))}</h3>` + msgs.map(m => `
      <div class="cp-msg">
        <p class="cp-msg-you"><span>${esc(m.child_name || t('companionMsgYou'))}:</span> ${esc(m.message).replace(/\n/g, '<br>')}</p>
        ${m.reply ? `<p class="cp-msg-mare"><span>Mare:</span> ${esc(m.reply).replace(/\n/g, '<br>')}</p>` : `<p class="cp-msg-wait">${esc(t('companionMsgWaiting'))}</p>`}
      </div>`).join('') : '';
  }

  function renderStars() {
    const box = $('cp-stars');
    box.innerHTML = [1, 2, 3, 4, 5].map(n => `<button type="button" class="cp-star${n <= stars ? ' on' : ''}" role="radio" aria-checked="${n === stars}" aria-label="${n}" data-n="${n}" data-no-busy>★</button>`).join('');
    box.querySelectorAll('.cp-star').forEach(b => b.addEventListener('click', () => { stars = Number(b.dataset.n); renderStars(); }));
  }

  function renderRating() {
    const r = data.rating;
    $('cp-rate-body').textContent = r ? t('companionRateThanks') : t('companionRateBody', { percent: data.ratingPercent });
    stars = r ? r.stars : 0;
    renderStars();
    $('cp-rate-comment').value = r ? r.comment : '';
    $('cp-rate-btn').textContent = r ? t('companionRateUpdate') : t('companionRateSend');
    if (r && r.code) {
      $('cp-code').hidden = false;
      $('cp-code-text').textContent = t('companionRateCode', { percent: data.ratingPercent });
      $('cp-code-value').textContent = r.code;
    }
  }

  async function load() {
    try {
      data = await api('/api/companion');
    } catch (e) {
      if (e.status === 401 || e.status === 403) { window.location.href = '/login.html'; return; }
      $('cp-hello').textContent = e.message;
      return;
    }
    $('cp-hello').textContent = t('companionHello', { name: data.name || '' });
    if (data.preview) {
      $('cp-preview').hidden = false;
      document.querySelectorAll('#cp-msg-form button, #cp-msg-form textarea, #cp-msg-form select, #cp-rate-btn, #cp-rate-comment').forEach(el => { el.disabled = true; });
      $('cp-read-btn').href = `/pictures.html?chapter=${data.chapter}`;
      document.querySelector('.topbar-actions a[href="/account.html"]').setAttribute('href', '/admin.html');
      document.querySelector('.topbar-actions a[href="/admin.html"]').textContent = t('companionBackToAdmin');
    }
    renderChapters();
    renderPractice(data.practice);
    const from = $('cp-msg-child');
    from.innerHTML = data.children.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('') + `<option value="">${esc(t('companionMsgFromMe'))}</option>`;
    renderMessages();
    renderRating();
  }

  function setup() {
    $('cp-msg-text').placeholder = t('companionMsgPh');
    $('cp-rate-comment').placeholder = t('companionRateCommentPh');
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(btn.dataset.lang));
    });
    $('topbar-signout-btn').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });
    $('cp-msg-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = $('cp-msg-status');
      const message = $('cp-msg-text').value.trim();
      if (!message) { $('cp-msg-text').focus(); return; }
      try {
        const out = await api('/api/companion/message', { message, childName: $('cp-msg-child').value });
        data.messages = out.messages;
        $('cp-msg-text').value = '';
        status.textContent = t('companionMsgSent');
        status.hidden = false;
        renderMessages();
      } catch (err) {
        status.textContent = err.message;
        status.hidden = false;
      }
    });
    $('cp-rate-btn').addEventListener('click', async () => {
      const errEl = $('cp-rate-error');
      errEl.hidden = true;
      if (!stars) { errEl.textContent = t('companionRatePickStars'); errEl.hidden = false; return; }
      try {
        const out = await api('/api/companion/rating', { stars, comment: $('cp-rate-comment').value.trim() });
        data.rating = out.rating;
        renderRating();
      } catch (err) { errEl.textContent = err.message; errEl.hidden = false; }
    });
    $('cp-code-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('cp-code-value').textContent); $('cp-code-copy').textContent = t('homeNoticeCopied'); } catch { /* select manually */ }
    });
  }

  (async function init() {
    await window.MareI18n.ready;
    setup();
    load();
  })();
})();
