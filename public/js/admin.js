(function () {
  let currentUser = null;
  const t = (key, vars) => window.MareI18n.t(key, vars);

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

  async function api(path, options) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function setupLangSwitch() {
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });
  }

  // ── Login ──
  function showError(id, message) {
    const el = document.getElementById(id);
    el.textContent = message;
    el.hidden = false;
  }
  function clearError(id) {
    document.getElementById(id).hidden = true;
  }

  // Server error strings -> translation keys, same pattern as login.js,
  // so a Dutch-language admin session never sees a raw English message.
  const SERVER_ERROR_MAP = {
    'Invalid email or password': 'errorInvalidCredentials',
    'Email already registered': 'errorEmailTaken',
    'Password must be at least 8 characters': 'errorPasswordTooShort',
    'Missing fields': 'errorMissingFields',
  };

  function setupLoginForm() {
    document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('form-error');
      const email = document.getElementById('f-email').value.trim();
      const password = document.getElementById('f-password').value;
      const submitBtn = document.getElementById('submit-btn');
      submitBtn.disabled = true;
      try {
        await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        currentUser = await checkSession();
        if (currentUser) enterDashboard(currentUser);
      } catch (err) {
        showError('form-error', t(SERVER_ERROR_MAP[err.message] || 'errorGeneric'));
      } finally {
        submitBtn.disabled = false;
      }
    });

    document.getElementById('sign-out-btn').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/admin.html';
    });
  }

  // ── Dashboard shell ──
  function enterDashboard(user) {
    document.getElementById('login-view').hidden = true;
    document.getElementById('dashboard-view').hidden = false;
    // Dashboard interiors stay on the plain, readable light background —
    // the atmosphere (slideshow + dark glass card) is for the login gate
    // only, not for reading tables and forms once you're actually
    // working. See the .auth-atmosphere comment in day.css.
    document.body.classList.remove('auth-atmosphere');
    const pill = document.getElementById('who-pill');
    pill.hidden = false;
    pill.textContent = `${user.name} · ${t(user.role === 'admin' ? 'staffRoleAdmin' : 'staffRoleSupport')}`;
    pill.classList.toggle('admin', user.role === 'admin');
    document.getElementById('sign-out-btn').hidden = false;

    const isAdmin = user.role === 'admin';
    document.querySelectorAll('.admin-only-tab').forEach(el => { el.hidden = !isAdmin; });

    setupTabs();
    loadOverview();
    loadResources();
    loadPages();
    loadDirectory();
    loadSocialLinks();
    loadMarketingHistory();
    if (isAdmin) loadStaff();
  }

  function setupTabs() {
    document.querySelectorAll('#admin-tabs .admin-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.hidden) return;
        document.querySelectorAll('#admin-tabs .admin-tab').forEach(b => b.classList.toggle('active', b === btn));
        const target = btn.getAttribute('data-tab');
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${target}`));
      });
    });
  }

  // ── Overview ──
  async function loadOverview() {
    try {
      const data = await api('/api/admin/books');
      document.getElementById('book-count-note').textContent =
        t('adminBookCount', { count: (data.books || []).length });
    } catch {
      document.getElementById('book-count-note').textContent = t('adminCouldNotLoadBookCount');
    }
    if (currentUser && currentUser.role === 'admin') {
      document.getElementById('products-note-card').hidden = false;
    }
  }

  // ── Teacher resources ──
  function setupResourceForm() {
    const categorySelect = document.getElementById('r-category');
    categorySelect.addEventListener('change', () => {
      const isDoc = categorySelect.value === 'document';
      document.getElementById('r-file-field').hidden = !isDoc;
      document.getElementById('r-url-field').hidden = isDoc;
    });

    document.getElementById('resource-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('resource-error');
      const submitBtn = document.getElementById('resource-submit-btn');
      submitBtn.disabled = true;
      try {
        const title = document.getElementById('r-title').value.trim();
        const description = document.getElementById('r-description').value.trim();
        const category = categorySelect.value;
        if (!title) throw new Error(t('adminErrorTitleRequired'));

        let fileKey = null, externalUrl = null;
        if (category === 'document') {
          const fileInput = document.getElementById('r-file');
          if (!fileInput.files[0]) throw new Error(t('adminErrorChooseFile'));
          fileKey = await uploadResourceFile(fileInput.files[0]);
        } else {
          externalUrl = document.getElementById('r-url').value.trim();
          if (!externalUrl) throw new Error(t('adminErrorAddUrl'));
        }

        await api('/api/admin/teacher-resources', {
          method: 'POST',
          body: JSON.stringify({ title, description, category, fileKey, externalUrl }),
        });

        document.getElementById('resource-form').reset();
        document.getElementById('r-upload-status').textContent = '';
        document.getElementById('r-file-field').hidden = true;
        document.getElementById('r-url-field').hidden = false;
        await loadResources();
      } catch (err) {
        showError('resource-error', err.message || t('adminErrorSaveResource'));
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  async function uploadResourceFile(file) {
    const status = document.getElementById('r-upload-status');
    status.textContent = t('adminUploading');
    const key = `teacher-resources/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { url } = await api('/api/admin/upload-url', {
      method: 'POST',
      body: JSON.stringify({ key, contentType: file.type || 'application/octet-stream' }),
    });
    const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    if (!putRes.ok) throw new Error(t('adminErrorUploadFailed'));
    status.textContent = t('adminUploaded');
    return key;
  }

  async function loadResources() {
    const container = document.getElementById('resource-list');
    try {
      const data = await api('/api/admin/teacher-resources');
      const resources = data.resources || [];
      if (!resources.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoResourcesYet'))}</p>`;
        return;
      }
      container.innerHTML = '';
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `<thead><tr><th>${t('adminFieldTitle')}</th><th>${t('adminFieldType')}</th><th>${t('adminActive')}</th><th></th></tr></thead>`;
      const tbody = document.createElement('tbody');
      resources.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(r.title)}</td>
          <td>${escapeHtml(t(({ document: 'resourceCategoryDocument', tool: 'resourceCategoryTool', link: 'resourceCategoryLink' })[r.category] || 'resourceCategoryDocument'))}</td>
          <td>${r.active ? escapeHtml(t('adminYes')) : escapeHtml(t('adminNo'))}</td>
        `;
        const actionsTd = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'admin-resource-actions';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = r.active ? t('adminHide') : t('adminShow');
        toggleBtn.addEventListener('click', async () => {
          await api(`/api/admin/teacher-resources/${r.id}`, { method: 'PATCH', body: JSON.stringify({ active: r.active ? 0 : 1 }) });
          loadResources();
        });
        actions.appendChild(toggleBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'danger';
        deleteBtn.textContent = t('adminDelete');
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(t('adminConfirmDelete', { name: r.title }))) return;
          await api(`/api/admin/teacher-resources/${r.id}`, { method: 'DELETE' });
          loadResources();
        });
        actions.appendChild(deleteBtn);

        actionsTd.appendChild(actions);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadResources'))}</p>`;
    }
  }

  // ── Pages directory ──
  function setupPageForm() {
    document.getElementById('page-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('page-error');
      const submitBtn = document.getElementById('page-submit-btn');
      submitBtn.disabled = true;
      try {
        const label = document.getElementById('p-label').value.trim();
        const url = document.getElementById('p-url').value.trim();
        const kind = document.getElementById('p-kind').value;
        const status = document.getElementById('p-status').value;
        const description = document.getElementById('p-description').value.trim();
        if (!label || !url) throw new Error(t('adminErrorLabelUrlRequired'));

        await api('/api/admin/pages', {
          method: 'POST',
          body: JSON.stringify({ label, url, kind, status, description }),
        });

        document.getElementById('page-form').reset();
        await loadPages();
      } catch (err) {
        showError('page-error', err.message || t('adminErrorSavePage'));
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  const PAGE_STATUS_KEY = { live: 'pageStatusLive', planned: 'pageStatusPlanned', stub: 'pageStatusStub' };
  const PAGE_KIND_KEY = { internal: 'pageKindInternal', external: 'pageKindExternal' };

  async function loadPages() {
    const container = document.getElementById('pages-list');
    try {
      const data = await api('/api/admin/pages');
      const pages = data.pages || [];
      if (!pages.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoPagesYet'))}</p>`;
        return;
      }
      container.innerHTML = '';
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `<thead><tr><th>${t('adminFieldLabel')}</th><th>${t('adminFieldUrl')}</th><th>${t('adminFieldKind')}</th><th>${t('adminFieldStatus')}</th><th></th></tr></thead>`;
      const tbody = document.createElement('tbody');
      pages.forEach(p => {
        const tr = document.createElement('tr');
        const isExternal = p.kind === 'external';
        const linkHtml = isExternal
          ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.url)}</a>`
          : `<a href="${escapeHtml(p.url)}">${escapeHtml(p.url)}</a>`;
        tr.innerHTML = `
          <td>${escapeHtml(p.label)}${p.description ? `<br><span class="admin-empty-note">${escapeHtml(p.description)}</span>` : ''}</td>
          <td>${linkHtml}</td>
          <td>${escapeHtml(t(PAGE_KIND_KEY[p.kind] || 'pageKindInternal'))}</td>
          <td>${escapeHtml(t(PAGE_STATUS_KEY[p.status] || 'pageStatusLive'))}</td>
        `;
        const actionsTd = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'admin-resource-actions';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = p.active ? t('adminHide') : t('adminShow');
        toggleBtn.addEventListener('click', async () => {
          await api(`/api/admin/pages/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: p.active ? 0 : 1 }) });
          loadPages();
        });
        actions.appendChild(toggleBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'danger';
        deleteBtn.textContent = t('adminDelete');
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(t('adminConfirmDelete', { name: p.label }))) return;
          await api(`/api/admin/pages/${p.id}`, { method: 'DELETE' });
          loadPages();
        });
        actions.appendChild(deleteBtn);

        actionsTd.appendChild(actions);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadPages'))}</p>`;
    }
  }

  // ── Marketing: social links ──
  const PLATFORM_LABEL = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', threads: 'Threads', x: 'X', other: 'Other' };

  function setupSocialLinkForm() {
    document.getElementById('social-link-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('social-link-error');
      const submitBtn = document.getElementById('social-link-submit-btn');
      submitBtn.disabled = true;
      try {
        const platform = document.getElementById('sl-platform').value;
        const label = document.getElementById('sl-label').value.trim();
        const url = document.getElementById('sl-url').value.trim();
        if (!url) throw new Error(t('adminErrorAddUrl'));
        await api('/api/admin/social-links', { method: 'POST', body: JSON.stringify({ platform, label, url }) });
        document.getElementById('social-link-form').reset();
        await loadSocialLinks();
      } catch (err) {
        showError('social-link-error', err.message || t('adminErrorSavePage'));
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  async function loadSocialLinks() {
    const container = document.getElementById('social-links-list');
    try {
      const data = await api('/api/admin/social-links');
      const links = data.links || [];
      if (!links.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoSocialLinksYet'))}</p>`;
        return;
      }
      container.innerHTML = '';
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `<thead><tr><th>${t('adminFieldPlatform')}</th><th>${t('adminFieldUrl')}</th><th></th></tr></thead>`;
      const tbody = document.createElement('tbody');
      links.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(PLATFORM_LABEL[l.platform] || l.platform)}${l.label ? `<br><span class="admin-empty-note">${escapeHtml(l.label)}</span>` : ''}</td>
          <td><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.url)}</a></td>
        `;
        const actionsTd = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'admin-resource-actions';
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = l.active ? t('adminHide') : t('adminShow');
        toggleBtn.addEventListener('click', async () => {
          await api(`/api/admin/social-links/${l.id}`, { method: 'PATCH', body: JSON.stringify({ active: l.active ? 0 : 1 }) });
          loadSocialLinks();
        });
        actions.appendChild(toggleBtn);
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'danger';
        deleteBtn.textContent = t('adminDelete');
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(t('adminConfirmDelete', { name: PLATFORM_LABEL[l.platform] || l.platform }))) return;
          await api(`/api/admin/social-links/${l.id}`, { method: 'DELETE' });
          loadSocialLinks();
        });
        actions.appendChild(deleteBtn);
        actionsTd.appendChild(actions);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadSocialLinks'))}</p>`;
    }
  }

  // ── Marketing: generate social posts ──
  function setupMarketingGenerator() {
    document.getElementById('marketing-generate-btn').addEventListener('click', async () => {
      clearError('marketing-error');
      const source = document.getElementById('mkt-source').value.trim();
      const platforms = Array.from(document.querySelectorAll('.mkt-platform:checked')).map(el => el.value);
      const includeCta = document.getElementById('mkt-include-cta').checked;
      const resultsEl = document.getElementById('marketing-results');
      const btn = document.getElementById('marketing-generate-btn');
      if (!source) return showError('marketing-error', t('adminErrorSourceRequired'));
      if (!platforms.length) return showError('marketing-error', t('adminErrorPlatformRequired'));
      btn.disabled = true;
      resultsEl.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminGenerating'))}</p>`;
      try {
        const data = await api('/api/admin/marketing/generate', { method: 'POST', body: JSON.stringify({ sourceText: source, platforms, includeCta }) });
        renderMarketingResults(resultsEl, data.results);
        loadMarketingHistory();
      } catch (err) {
        resultsEl.innerHTML = '';
        showError('marketing-error', err.message || t('adminErrorGenerateFailed'));
      } finally {
        btn.disabled = false;
      }
    });
  }

  function renderMarketingResults(container, results) {
    container.innerHTML = '';
    Object.keys(results).forEach(platform => {
      const card = document.createElement('div');
      card.className = 'mkt-result-card';
      const header = document.createElement('div');
      header.className = 'mkt-result-platform';
      const label = document.createElement('span');
      label.textContent = PLATFORM_LABEL[platform] || platform;
      header.appendChild(label);
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn-ghost btn-sm';
      copyBtn.textContent = t('adminCopy');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(results[platform]);
          copyBtn.textContent = t('adminCopied');
          setTimeout(() => { copyBtn.textContent = t('adminCopy'); }, 1800);
        } catch { /* clipboard permission denied — text is still visible to select manually */ }
      });
      header.appendChild(copyBtn);
      card.appendChild(header);
      const text = document.createElement('div');
      text.className = 'mkt-result-text';
      text.textContent = results[platform];
      card.appendChild(text);
      container.appendChild(card);
    });
  }

  async function loadMarketingHistory() {
    const container = document.getElementById('marketing-history-list');
    try {
      const data = await api('/api/admin/marketing/history');
      const history = data.history || [];
      if (!history.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoMarketingHistoryYet'))}</p>`;
        return;
      }
      container.innerHTML = '';
      history.forEach(item => {
        const row = document.createElement('div');
        row.className = 'mkt-history-item';
        const source = document.createElement('div');
        source.className = 'mkt-history-source';
        source.textContent = item.source_text.length > 140 ? item.source_text.slice(0, 140) + '…' : item.source_text;
        row.appendChild(source);
        const resultsWrap = document.createElement('div');
        renderMarketingResults(resultsWrap, item.results);
        row.appendChild(resultsWrap);
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn-ghost btn-sm';
        deleteBtn.style.marginTop = '8px';
        deleteBtn.textContent = t('adminDelete');
        deleteBtn.addEventListener('click', async () => {
          await api(`/api/admin/marketing/history/${item.id}`, { method: 'DELETE' });
          loadMarketingHistory();
        });
        row.appendChild(deleteBtn);
        container.appendChild(row);
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadHistory'))}</p>`;
    }
  }

  // ── Directory ──
  async function loadDirectory() {
    try {
      const data = await api('/api/admin/parents');
      renderDirectoryTable('parents-table', data.parents || [], ['name', 'email', 'preferred_locale', 'created_at']);
    } catch {
      document.getElementById('parents-table').innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadParents'))}</p>`;
    }
    try {
      const data = await api('/api/admin/teachers');
      renderDirectoryTable('teachers-table', data.teachers || [], ['name', 'email', 'school', 'preferred_locale', 'created_at']);
    } catch {
      document.getElementById('teachers-table').innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadTeachers'))}</p>`;
    }
  }

  function renderDirectoryTable(containerId, rows, columns) {
    const container = document.getElementById(containerId);
    if (!rows.length) {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
      return;
    }
    const table = document.createElement('table');
    table.className = 'admin-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>${columns.map(c => `<th>${labelFor(c)}</th>`).join('')}</tr>`;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = columns.map(c => `<td>${escapeHtml(row[c] ?? '—')}</td>`).join('');
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
  }

  function labelFor(col) {
    const map = { name: 'fieldName', email: 'fieldEmail', school: 'fieldSchool', preferred_locale: 'adminLocale', created_at: 'adminJoined' };
    return escapeHtml(t(map[col] || col));
  }

  // ── Staff ──
  function setupStaffForm() {
    document.getElementById('staff-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('staff-error');
      try {
        const name = document.getElementById('s-name').value.trim();
        const email = document.getElementById('s-email').value.trim();
        const password = document.getElementById('s-password').value;
        const role = document.getElementById('s-role').value;
        await api('/api/admin/staff', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
        document.getElementById('staff-form').reset();
        loadStaff();
      } catch (err) {
        showError('staff-error', t(SERVER_ERROR_MAP[err.message] || 'adminErrorCreateAccount'));
      }
    });
  }

  async function loadStaff() {
    const container = document.getElementById('staff-table');
    try {
      const data = await api('/api/admin/staff');
      const staff = data.staff || [];
      if (!staff.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `<thead><tr><th>${t('fieldName')}</th><th>${t('fieldEmail')}</th><th>${t('adminFieldRole')}</th><th>${t('adminSince')}</th></tr></thead>`;
      const tbody = document.createElement('tbody');
      staff.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.email)}</td>
          <td><span class="role-pill ${s.role === 'admin' ? 'admin' : ''}">${escapeHtml(t(s.role === 'admin' ? 'staffRoleAdmin' : 'staffRoleSupport'))}</span></td>
          <td>${escapeHtml(s.created_at)}</td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.innerHTML = '';
      container.appendChild(table);
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadStaff'))}</p>`;
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Boot ──
  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();
    setupLoginForm();
    setupResourceForm();
    setupPageForm();
    setupSocialLinkForm();
    setupMarketingGenerator();
    setupStaffForm();

    const user = await checkSession();
    if (user && (user.role === 'admin' || user.role === 'support')) {
      currentUser = user;
      enterDashboard(user);
    }
  }
  init();
})();
