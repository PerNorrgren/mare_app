(function () {
  function t(key, fallback, vars) {
    if (window.MareI18n && window.MareI18n.ready) {
      const val = window.MareI18n.t(key, vars);
      if (val && val !== key) return val;
    }
    return fallback || key;
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function showView(id) {
    ['cm-signed-out-view', 'cm-join-view', 'cm-member-view'].forEach(v => {
      document.getElementById(v).hidden = (v !== id);
    });
  }

  async function loadPosts(tier) {
    const noteEl = document.getElementById('cm-tier-note');
    noteEl.textContent = tier === 2
      ? t('clubMarePaidNote', "You're a paid member — thank you for supporting the wood.")
      : t('clubMareFreeNote', "You're a free member.");

    const listEl = document.getElementById('cm-posts-list');
    try {
      const res = await fetch('/api/club-mare/posts');
      const data = await res.json();
      const posts = data.posts || [];
      if (!posts.length) {
        listEl.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('clubMareNoPosts', 'Nothing here yet — check back soon.'))}</p>`;
        return;
      }
      listEl.innerHTML = posts.map(post => `
        <div class="showcase-tile" style="cursor:default; text-align:left; align-items:flex-start;">
          ${post.image_key ? `<img class="clubmare-post-image" data-image-key="${escapeHtml(post.image_key)}" alt="" style="width:100%;border-radius:10px;margin-bottom:10px;">` : ''}
          <div class="showcase-tile-label" style="font-size:1.05rem;">${escapeHtml(post.title)}</div>
          ${post.body ? `<p style="color:rgba(243,236,217,0.8);font-size:0.88rem;margin-top:8px;">${escapeHtml(post.body)}</p>` : ''}
        </div>
      `).join('');
      listEl.querySelectorAll('[data-image-key]').forEach(async (img) => {
        try {
          const r = await fetch(`/api/playback-url?key=${encodeURIComponent(img.getAttribute('data-image-key'))}`);
          const d = await r.json();
          if (d.url) img.src = d.url;
        } catch { /* image just doesn't load — post text still shows */ }
      });
    } catch {
      listEl.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('clubMareCouldNotLoad', "Couldn't load Club Mare posts right now."))}</p>`;
    }
  }

  function setupLangSwitch() {
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });
  }

  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();

    let user = null;
    try {
      const res = await fetch('/api/me');
      if (res.ok) { const data = await res.json(); user = data.user; }
    } catch { /* treat as signed out */ }

    if (!user || user.role !== 'parent') {
      showView('cm-signed-out-view');
      return;
    }

    let tier = 0;
    try {
      const res = await fetch('/api/club-mare/membership');
      const data = await res.json();
      tier = data.tier || 0;
    } catch { /* treat as not-yet-a-member — the join button still works either way */ }

    if (tier === 0) {
      showView('cm-join-view');
      document.getElementById('cm-join-btn').addEventListener('click', async (e) => {
        e.target.disabled = true;
        try {
          await fetch('/api/club-mare/join', { method: 'POST' });
          showView('cm-member-view');
          loadPosts(1);
        } catch {
          e.target.disabled = false;
        }
      });
      return;
    }

    showView('cm-member-view');
    loadPosts(tier);
  }

  init();
})();
