(function () {
  async function checkSession() {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) return null;
      const data = await res.json();
      return data.user;
    } catch {
      return null;
    }
  }

  function setupLangSwitch() {
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });
  }

  const CATEGORY_LABEL_KEY = { document: 'resourceCategoryDocument', tool: 'resourceCategoryTool', link: 'resourceCategoryLink' };

  async function resolveResourceUrl(resource) {
    if (resource.file_key) {
      try {
        const res = await fetch(`/api/playback-url?key=${encodeURIComponent(resource.file_key)}`);
        const data = await res.json();
        return data.url;
      } catch {
        return null;
      }
    }
    return resource.external_url || null;
  }

  async function renderResources(resources) {
    const grid = document.getElementById('resource-grid');
    const empty = document.getElementById('resource-empty');
    grid.querySelectorAll('.resource-card').forEach(el => el.remove());

    if (!resources.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const t = window.MareI18n.t;
    for (const resource of resources) {
      const card = document.createElement('div');
      card.className = 'resource-card';

      const tag = document.createElement('span');
      tag.className = 'resource-tag';
      tag.textContent = t(CATEGORY_LABEL_KEY[resource.category] || 'resourceCategoryDocument');
      card.appendChild(tag);

      const title = document.createElement('h3');
      title.textContent = resource.title;
      card.appendChild(title);

      if (resource.description) {
        const desc = document.createElement('p');
        desc.textContent = resource.description;
        card.appendChild(desc);
      }

      const link = document.createElement('a');
      link.className = 'btn-ghost';
      link.textContent = t('resourceOpen');
      link.target = '_blank';
      link.rel = 'noopener';
      const url = await resolveResourceUrl(resource);
      if (url) link.href = url;
      else link.setAttribute('aria-disabled', 'true');
      card.appendChild(link);

      grid.appendChild(card);
    }
  }

  function renderWhatsNew(items) {
    const section = document.getElementById('whats-new-section');
    const list = document.getElementById('whats-new-list');
    if (!items.length) { section.hidden = true; return; }
    section.hidden = false;
    list.innerHTML = '';
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'whats-new-item';
      const h4 = document.createElement('h4');
      h4.textContent = item.title;
      el.appendChild(h4);
      if (item.body) {
        const p = document.createElement('p');
        p.textContent = item.body;
        el.appendChild(p);
      }
      list.appendChild(el);
    });
  }

  async function showHub(user) {
    document.getElementById('public-view').hidden = true;
    const hub = document.getElementById('hub-view');
    hub.hidden = false;

    document.getElementById('hub-welcome').textContent =
      window.MareI18n.t('teacherWelcome', { name: user.name || '' });

    try {
      const [resRes, newsRes] = await Promise.all([
        fetch('/api/teacher/resources'),
        fetch('/api/whats-new'),
      ]);
      const resData = resRes.ok ? await resRes.json() : { resources: [] };
      const newsData = newsRes.ok ? await newsRes.json() : { items: [] };
      await renderResources(resData.resources || []);
      renderWhatsNew(newsData.items || []);
    } catch {
      await renderResources([]);
    }

    // Sign out lives in the topbar menu now, not duplicated inside the
    // page content — same place Log in/Register/Home already are.
    const signOutBtn = document.getElementById('topbar-signout-btn');
    signOutBtn.hidden = false;
    signOutBtn.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/teacher.html';
    });

    setupAskQuestion();
  }

  // ── Ask a question — pre-filled from the teacher's own profile
  // (fetched fresh each open, not cached, in case it changed), free-text
  // question, sent to whatever address admin has configured as the
  // notify address. ──
  function setupAskQuestion() {
    const modal = document.getElementById('ask-question-modal');
    const openBtn = document.getElementById('ask-question-btn');
    const closeBtn = document.getElementById('aq-close-btn');
    const sendBtn = document.getElementById('aq-send-btn');
    const messageField = document.getElementById('aq-message');
    const errorEl = document.getElementById('aq-error');
    const successEl = document.getElementById('aq-success');

    function resetModal() {
      errorEl.hidden = true;
      successEl.hidden = true;
      messageField.value = '';
      messageField.hidden = false;
      sendBtn.hidden = false;
    }

    openBtn.addEventListener('click', async () => {
      resetModal();
      modal.hidden = false;
      try {
        const res = await fetch('/api/teacher/profile');
        const data = await res.json();
        document.getElementById('aq-name').value = data.name || '';
        document.getElementById('aq-email').value = data.email || '';
        document.getElementById('aq-school').value = data.school || '';
      } catch {
        // Profile fetch failing shouldn't block asking a question —
        // the fields just stay blank; the server still knows who's
        // actually signed in from the session either way.
      }
    });
    closeBtn.addEventListener('click', () => { modal.hidden = true; });

    sendBtn.addEventListener('click', async () => {
      errorEl.hidden = true;
      const message = messageField.value.trim();
      if (!message) {
        errorEl.textContent = window.MareI18n.t('teacherAskQuestionEmpty');
        errorEl.hidden = false;
        return;
      }
      sendBtn.disabled = true;
      try {
        const res = await fetch('/api/teacher/ask-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        const data = await res.json();
        if (!res.ok) {
          errorEl.textContent = data.error || window.MareI18n.t('errorGeneric');
          errorEl.hidden = false;
          return;
        }
        successEl.hidden = false;
        messageField.hidden = true;
        sendBtn.hidden = true;
      } catch {
        errorEl.textContent = window.MareI18n.t('errorGeneric');
        errorEl.hidden = false;
      } finally {
        sendBtn.disabled = false;
      }
    });
  }

  function showPublic() {
    document.getElementById('topbar-signout-btn').hidden = true;
    document.getElementById('hub-view').hidden = true;
    document.getElementById('public-view').hidden = false;
    document.body.classList.add('auth-atmosphere');
  }

  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();

    const user = await checkSession();
    if (user && user.role === 'teacher') {
      await showHub(user);
    } else {
      showPublic();
    }
  }

  init();
})();
