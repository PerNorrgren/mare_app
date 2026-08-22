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
    document.body.classList.remove('auth-atmosphere');

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

    document.getElementById('sign-out-btn').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/teacher.html';
    });
  }

  function showPublic() {
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
