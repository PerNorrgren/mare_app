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
    ['cm-preview-view', 'cm-join-view', 'cm-member-view'].forEach(v => {
      document.getElementById(v).hidden = (v !== id);
    });
  }

  // Shared by both the member view and the anonymous preview — same
  // post card markup either way, just a different target container and
  // a different (or no) "you're a member" note around it.
  function renderPosts(posts, listEl, emptyMessage) {
    // Mare App 5 — no stories yet: show nothing. The activity cards above
    // are the club now; an empty "check back soon" line only looked broken.
    if (!posts.length) { listEl.innerHTML = ''; return; }
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
  }

  async function loadPosts(tier) {
    const noteEl = document.getElementById('cm-tier-note');
    noteEl.textContent = tier === 2
      ? t('clubMarePaidNote', "You're a paid member — thank you for supporting the forest.")
      : t('clubMareFreeNote', "You're a free member.");

    const listEl = document.getElementById('cm-posts-list');
    try {
      const res = await fetch('/api/club-mare/posts');
      const data = await res.json();
      renderPosts(data.posts || [], listEl, t('clubMareNoPosts', 'Nothing here yet — check back soon.'));
      // Mare App 5 — no stories: hide the block, "You're a free member" too.
      if (!(data.posts || []).length) document.getElementById('cm-member-view').hidden = true;
    } catch {
      document.getElementById('cm-member-view').hidden = true;
    }
  }

  // Anonymous/not-a-member visitor — the same endpoint now returns a
  // trimmed sample instead of an empty list (see server.js), so this
  // is a plain fetch-and-render, no tier logic at all.
  async function loadPreviewPosts() {
    const listEl = document.getElementById('cm-preview-posts-list');
    try {
      const res = await fetch('/api/club-mare/posts');
      const data = await res.json();
      renderPosts(data.posts || [], listEl, t('clubMareNoPosts', 'Nothing here yet — check back soon.'));
      // Mare App 5 — the "see every story" box only makes sense when there
      // are stories; the activity cards carry their own Register links.
      if (!(data.posts || []).length) document.getElementById('cm-preview-view').hidden = true;
    } catch {
      document.getElementById('cm-preview-view').hidden = true;
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

    if (user) {
      document.getElementById('login-link').hidden = true;
      document.getElementById('register-link').hidden = true;
      const signOutBtn = document.getElementById('topbar-signout-btn');
      signOutBtn.hidden = false;
      signOutBtn.addEventListener('click', async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
      });
    }

    if (!user || user.role !== 'parent') {
      showView('cm-preview-view');
      loadPreviewPosts();
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
