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

  // ── Forgot password ──
  function setupForgotPassword() {
    document.getElementById('forgot-link').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('admin-login-form').hidden = true;
      document.getElementById('admin-forgot-wrap').hidden = true;
      document.getElementById('forgot-form').hidden = false;
      document.getElementById('forgot-success').hidden = true;
    });
    document.getElementById('back-to-login-link').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('forgot-form').hidden = true;
      document.getElementById('admin-login-form').hidden = false;
      document.getElementById('admin-forgot-wrap').hidden = false;
    });
    document.getElementById('forgot-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      document.getElementById('forgot-error').hidden = true;
      const email = document.getElementById('fp-email').value.trim();
      const btn = document.getElementById('forgot-submit-btn');
      btn.disabled = true;
      try {
        await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role: 'admin' }),
        });
        document.getElementById('forgot-success').hidden = false;
        document.getElementById('forgot-form').querySelector('.field').hidden = true;
        btn.hidden = true;
      } catch {
        document.getElementById('forgot-error').textContent = t('errorGeneric');
        document.getElementById('forgot-error').hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

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
    setupBroadcastModal();
    setupWhatsNewModal();
    setupOfferModal();
    setupShowcaseWelcome();
    setupShowcaseVideo();
    setupTileModal();
    setupPhraseModal();
    setupBulkImport();
    setupAddTeacherForm();
    setupClubMarePostModal();
    setupProductModal();
    loadOverview();
    loadResources();
    loadPages();
    loadDirectory();
    loadSocialLinks();
    loadMarketingHistory();
    loadBroadcasts();
    loadWhatsNew();
    loadOffers();
    loadProducts();
    loadMarketingStats();
    loadShowcaseContent();
    loadShowcaseTiles();
    loadShowcasePhrases();
    loadClubMareMembers();
    loadClubMarePosts();
    loadClubMareStats();
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
    await loadStatsGrid();
  }

  async function loadStatsGrid() {
    const grid = document.getElementById('stat-grid');
    try {
      const stats = await api('/api/admin/report/overview');
      const items = [
        { label: t('adminStatParents'), value: stats.parents, sub: stats.suspendedParents ? t('adminStatSuspended', { count: stats.suspendedParents }) : null },
        { label: t('adminStatChildren'), value: stats.children },
        { label: t('adminStatTeachers'), value: stats.teachers, sub: stats.suspendedTeachers ? t('adminStatSuspended', { count: stats.suspendedTeachers }) : null },
        { label: t('adminStatTalkSessions7d'), value: stats.talkSessions7d, sub: t('adminStatTalkSessionsTotal', { count: stats.talkSessionsTotal }) },
        { label: t('adminStatOrders'), value: stats.ordersPaid, sub: t('adminStatOrdersTotal', { count: stats.ordersTotal }) },
        { label: t('adminStatClubMembers'), value: stats.clubMembers },
        { label: t('adminStatEmailSent'), value: stats.email.sent, sub: stats.email.failed ? t('adminStatEmailFailed', { count: stats.email.failed }) : null },
      ];
      grid.innerHTML = items.map(item => `
        <div class="stat-item">
          <div class="stat-value">${escapeHtml(String(item.value))}</div>
          <div class="stat-label">${escapeHtml(item.label)}</div>
          ${item.sub ? `<div class="stat-sub">${escapeHtml(item.sub)}</div>` : ''}
        </div>
      `).join('');
    } catch {
      grid.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadStats'))}</p>`;
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
      renderAccountsTable('parents-table', data.parents || [], ['name', 'email', 'preferred_locale', 'created_at'], 'parents');
    } catch {
      document.getElementById('parents-table').innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadParents'))}</p>`;
    }
    try {
      const data = await api('/api/admin/teachers');
      renderAccountsTable('teachers-table', data.teachers || [], ['name', 'email', 'school', 'preferred_locale', 'created_at'], 'teachers');
    } catch {
      document.getElementById('teachers-table').innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadTeachers'))}</p>`;
    }
  }

  // kind: 'parents' | 'teachers' — used to build the /api/admin/{kind}/:id/status URL.
  function renderAccountsTable(containerId, rows, columns, kind) {
    const container = document.getElementById(containerId);
    if (!rows.length) {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
      return;
    }
    const table = document.createElement('table');
    table.className = 'admin-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>${columns.map(c => `<th>${labelFor(c)}</th>`).join('')}<th>${escapeHtml(t('adminFieldStatus'))}</th><th></th></tr>`;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      const suspended = row.status === 'suspended';
      tr.innerHTML = columns.map(c => `<td>${escapeHtml(row[c] ?? '—')}</td>`).join('') +
        `<td><span class="status-badge ${suspended ? 'suspended' : 'active'}">${escapeHtml(t(suspended ? 'adminStatusSuspended' : 'adminStatusActive'))}</span></td>`;
      const actionTd = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-ghost btn-small';
      btn.textContent = t(suspended ? 'adminReactivate' : 'adminSuspend');
      btn.addEventListener('click', async () => {
        const nextStatus = suspended ? 'active' : 'suspended';
        if (!suspended && !window.confirm(t('adminSuspendConfirm', { name: row.name }))) return;
        btn.disabled = true;
        try {
          await api(`/api/admin/${kind}/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
          loadDirectory();
        } catch {
          btn.disabled = false;
        }
      });
      actionTd.appendChild(btn);
      tr.appendChild(actionTd);
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

  // ── Messaging: broadcasts ──
  let bcEditor = null; // current MessageEditor instance, mounted per compose-modal open
  let bcEditingId = null; // id of the broadcast being edited, or null for a fresh compose

  function fmtDate(str) {
    if (!str) return '—';
    return str.replace('T', ' ').slice(0, 16);
  }

  async function loadBroadcasts() {
    const container = document.getElementById('broadcasts-list');
    try {
      const data = await api('/api/admin/broadcasts');
      const rows = data.broadcasts || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(b => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(b.subject)}</div>
            <div class="admin-list-item-sub">
              <span class="bc-status ${b.status}">${escapeHtml(t('bcStatus_' + b.status))}</span>
              &nbsp;·&nbsp; ${escapeHtml(t('audience' + capitalize(b.audience)))}
              ${b.status === 'scheduled' ? ` · ${escapeHtml(t('adminScheduledFor', { time: fmtDate(b.scheduled_for) }))}` : ''}
              ${b.status === 'sent' ? ` · ${escapeHtml(t('adminSentCount', { sent: b.sent_count, total: b.recipient_count }))}` : ''}
            </div>
          </div>
          <div class="admin-list-item-actions">
            ${b.status === 'draft' || b.status === 'scheduled' ? `<button type="button" class="btn-ghost btn-small" data-edit="${b.id}">${escapeHtml(t('adminEdit'))}</button>` : ''}
            ${b.status === 'draft' || b.status === 'scheduled' ? `<button type="button" class="btn-ghost btn-small" data-delete="${b.id}">${escapeHtml(t('adminDelete'))}</button>` : ''}
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => openBroadcastModal(btn.getAttribute('data-edit')));
      });
      container.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/broadcasts/${btn.getAttribute('data-delete')}`, { method: 'DELETE' });
          loadBroadcasts();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadMessages'))}</p>`;
    }
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  async function openBroadcastModal(id) {
    bcEditingId = id || null;
    document.getElementById('broadcast-error').hidden = true;
    document.getElementById('broadcast-success').hidden = true;
    document.getElementById('bc-schedule-field').hidden = true;
    document.getElementById('broadcast-modal-title').textContent = t(id ? 'adminEditMessage' : 'adminComposeMessage');

    let subject = '', audience = 'parents', bodyHtml = '';
    if (id) {
      try {
        const data = await api(`/api/admin/broadcasts/${id}`);
        subject = data.broadcast.subject;
        audience = data.broadcast.audience;
        bodyHtml = data.broadcast.body_html;
      } catch {
        showModalError('broadcast-error', t('errorGeneric'));
        return;
      }
    }
    document.getElementById('bc-subject').value = subject;
    document.getElementById('bc-audience').value = audience;

    if (bcEditor) bcEditor.destroy();
    bcEditor = window.MessageEditor.mountRichEditor('bc-editor-mount', bodyHtml, { placeholder: t('adminMessagePlaceholder') });

    document.getElementById('broadcast-modal').hidden = false;
  }

  function showModalError(id, message) {
    const el = document.getElementById(id);
    el.textContent = message;
    el.hidden = false;
  }

  async function saveBroadcast(sendAfter) {
    const subject = document.getElementById('bc-subject').value.trim();
    const audience = document.getElementById('bc-audience').value;
    const bodyHtml = bcEditor ? bcEditor.getHtml() : '';
    const bodyText = bcEditor ? bcEditor.getText() : '';
    if (!subject || !bodyText.trim()) {
      showModalError('broadcast-error', t('errorMissingFields'));
      return null;
    }
    document.getElementById('broadcast-error').hidden = true;
    try {
      if (bcEditingId) {
        await api(`/api/admin/broadcasts/${bcEditingId}`, { method: 'PATCH', body: JSON.stringify({ subject, bodyHtml, bodyText, audience }) });
        return bcEditingId;
      }
      const res = await api('/api/admin/broadcasts', { method: 'POST', body: JSON.stringify({ subject, bodyHtml, bodyText, audience }) });
      bcEditingId = res.id;
      return res.id;
    } catch {
      showModalError('broadcast-error', t('errorGeneric'));
      return null;
    }
  }

  function setupBroadcastModal() {
    document.getElementById('new-broadcast-btn').addEventListener('click', () => openBroadcastModal(null));
    document.getElementById('bc-close-btn').addEventListener('click', () => {
      document.getElementById('broadcast-modal').hidden = true;
      if (bcEditor) { bcEditor.destroy(); bcEditor = null; }
      loadBroadcasts();
    });
    document.getElementById('bc-save-btn').addEventListener('click', async () => {
      const id = await saveBroadcast();
      if (id) {
        document.getElementById('broadcast-success').textContent = t('adminDraftSaved');
        document.getElementById('broadcast-success').hidden = false;
        loadBroadcasts();
      }
    });
    document.getElementById('bc-test-btn').addEventListener('click', async () => {
      const id = await saveBroadcast();
      if (!id) return;
      const btn = document.getElementById('bc-test-btn');
      btn.disabled = true;
      try {
        await api(`/api/admin/broadcasts/${id}/send-test`, { method: 'POST' });
        document.getElementById('broadcast-success').textContent = t('adminTestSent');
        document.getElementById('broadcast-success').hidden = false;
      } catch {
        showModalError('broadcast-error', t('adminTestSendFailed'));
      } finally {
        btn.disabled = false;
      }
    });
    document.getElementById('bc-schedule-btn').addEventListener('click', () => {
      document.getElementById('bc-schedule-field').hidden = false;
    });
    document.getElementById('bc-schedule-confirm-btn').addEventListener('click', async () => {
      const id = await saveBroadcast();
      if (!id) return;
      const scheduledFor = document.getElementById('bc-schedule-time').value;
      if (!scheduledFor) return;
      try {
        await api(`/api/admin/broadcasts/${id}/schedule`, { method: 'POST', body: JSON.stringify({ scheduledFor }) });
        document.getElementById('broadcast-modal').hidden = true;
        if (bcEditor) { bcEditor.destroy(); bcEditor = null; }
        loadBroadcasts();
      } catch {
        showModalError('broadcast-error', t('errorGeneric'));
      }
    });
    document.getElementById('bc-send-btn').addEventListener('click', async () => {
      if (!window.confirm(t('adminSendNowConfirm'))) return;
      const id = await saveBroadcast();
      if (!id) return;
      try {
        await api(`/api/admin/broadcasts/${id}/send`, { method: 'POST' });
        document.getElementById('broadcast-modal').hidden = true;
        if (bcEditor) { bcEditor.destroy(); bcEditor = null; }
        loadBroadcasts();
      } catch {
        showModalError('broadcast-error', t('errorGeneric'));
      }
    });
  }

  // ── Messaging: What's New ──
  let wnEditingId = null;

  async function loadWhatsNew() {
    const container = document.getElementById('whats-new-list');
    try {
      const data = await api('/api/admin/whats-new-items');
      const rows = data.items || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(item => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(item.title)}</div>
            <div class="admin-list-item-sub">
              <span class="status-badge ${item.active ? 'active' : 'suspended'}">${escapeHtml(t(item.active ? 'adminActive' : 'adminInactive'))}</span>
              &nbsp;·&nbsp; ${escapeHtml(t('audience' + capitalize(item.audience)))}
            </div>
          </div>
          <div class="admin-list-item-actions">
            <button type="button" class="btn-ghost btn-small" data-edit-wn="${item.id}">${escapeHtml(t('adminEdit'))}</button>
            <button type="button" class="btn-ghost btn-small" data-delete-wn="${item.id}">${escapeHtml(t('adminDelete'))}</button>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit-wn]').forEach(btn => {
        btn.addEventListener('click', () => openWhatsNewModal(btn.getAttribute('data-edit-wn'), rows.find(r => r.id === btn.getAttribute('data-edit-wn'))));
      });
      container.querySelectorAll('[data-delete-wn]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/whats-new-items/${btn.getAttribute('data-delete-wn')}`, { method: 'DELETE' });
          loadWhatsNew();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadWhatsNew'))}</p>`;
    }
  }

  function openWhatsNewModal(id, item) {
    wnEditingId = id || null;
    document.getElementById('whats-new-error').hidden = true;
    document.getElementById('whats-new-modal-title').textContent = t(id ? 'adminEditWhatsNew' : 'adminNewWhatsNew');
    document.getElementById('wn-title').value = item ? item.title : '';
    document.getElementById('wn-audience').value = item ? item.audience : 'both';
    document.getElementById('wn-body').value = item ? (item.body || '') : '';
    document.getElementById('wn-active').checked = item ? !!item.active : true;
    document.getElementById('whats-new-modal').hidden = false;
  }

  function setupWhatsNewModal() {
    document.getElementById('new-whats-new-btn').addEventListener('click', () => openWhatsNewModal(null, null));
    document.getElementById('wn-close-btn').addEventListener('click', () => { document.getElementById('whats-new-modal').hidden = true; });
    document.getElementById('wn-save-btn').addEventListener('click', async () => {
      const title = document.getElementById('wn-title').value.trim();
      const audience = document.getElementById('wn-audience').value;
      const body = document.getElementById('wn-body').value.trim();
      const active = document.getElementById('wn-active').checked;
      if (!title) { showModalError('whats-new-error', t('errorMissingFields')); return; }
      try {
        if (wnEditingId) {
          await api(`/api/admin/whats-new-items/${wnEditingId}`, { method: 'PATCH', body: JSON.stringify({ audience, title, body, active }) });
        } else {
          await api('/api/admin/whats-new', { method: 'POST', body: JSON.stringify({ audience, title, body }) });
        }
        document.getElementById('whats-new-modal').hidden = true;
        loadWhatsNew();
      } catch {
        showModalError('whats-new-error', t('errorGeneric'));
      }
    });
  }

  // ── Sales & Marketing: offers ──
  let ofEditingId = null;

  async function loadOffers() {
    const container = document.getElementById('offers-list');
    try {
      const data = await api('/api/admin/offers-catalog');
      const rows = data.offers || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(o => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(o.code)}</div>
            <div class="admin-list-item-sub">
              <span class="status-badge ${o.active ? 'active' : 'suspended'}">${escapeHtml(t(o.active ? 'adminActive' : 'adminInactive'))}</span>
              &nbsp;·&nbsp; ${o.discount_type === 'percent' ? `${o.discount_value}%` : `${(o.discount_value / 100).toFixed(2)}`} ${escapeHtml(t('adminOfferOff'))}
              ${o.expires_at ? ` · ${escapeHtml(t('adminExpires', { date: o.expires_at }))}` : ''}
            </div>
          </div>
          <div class="admin-list-item-actions">
            <button type="button" class="btn-ghost btn-small" data-edit-of="${o.id}">${escapeHtml(t('adminEdit'))}</button>
            <button type="button" class="btn-ghost btn-small" data-delete-of="${o.id}">${escapeHtml(t('adminDelete'))}</button>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit-of]').forEach(btn => {
        btn.addEventListener('click', () => openOfferModal(btn.getAttribute('data-edit-of'), rows.find(r => r.id === btn.getAttribute('data-edit-of'))));
      });
      container.querySelectorAll('[data-delete-of]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/offers-catalog/${btn.getAttribute('data-delete-of')}`, { method: 'DELETE' });
          loadOffers();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadOffers'))}</p>`;
    }
  }

  function openOfferModal(id, offer) {
    ofEditingId = id || null;
    document.getElementById('offer-error').hidden = true;
    document.getElementById('offer-modal-title').textContent = t(id ? 'adminEditOffer' : 'adminNewOffer');
    document.getElementById('of-code').value = offer ? offer.code : '';
    document.getElementById('of-code').disabled = !!id; // code is immutable once created — it's the lookup key
    document.getElementById('of-description').value = offer ? (offer.description || '') : '';
    document.getElementById('of-type').value = offer ? offer.discount_type : 'percent';
    document.getElementById('of-value').value = offer ? offer.discount_value : '';
    document.getElementById('of-expires').value = offer && offer.expires_at ? offer.expires_at.slice(0, 10) : '';
    document.getElementById('of-active').checked = offer ? !!offer.active : true;
    document.getElementById('offer-modal').hidden = false;
  }

  function setupOfferModal() {
    document.getElementById('new-offer-btn').addEventListener('click', () => openOfferModal(null, null));
    document.getElementById('of-close-btn').addEventListener('click', () => { document.getElementById('offer-modal').hidden = true; });
    document.getElementById('of-save-btn').addEventListener('click', async () => {
      const code = document.getElementById('of-code').value.trim();
      const description = document.getElementById('of-description').value.trim();
      const discountType = document.getElementById('of-type').value;
      const discountValue = parseInt(document.getElementById('of-value').value, 10) || 0;
      const expiresAt = document.getElementById('of-expires').value || null;
      const active = document.getElementById('of-active').checked;
      if (!code || !discountValue) { showModalError('offer-error', t('errorMissingFields')); return; }
      try {
        if (ofEditingId) {
          await api(`/api/admin/offers-catalog/${ofEditingId}`, { method: 'PATCH', body: JSON.stringify({ description, discountType, discountValue, active, expiresAt }) });
        } else {
          await api('/api/admin/offers-catalog', { method: 'POST', body: JSON.stringify({ code, description, discountType, discountValue, expiresAt }) });
        }
        document.getElementById('offer-modal').hidden = true;
        loadOffers();
      } catch (err) {
        showModalError('offer-error', err.message === 'Code already exists' ? t('adminOfferCodeTaken') : t('errorGeneric'));
      }
    });
  }

  // ── Sales & Marketing: stats ──
  async function loadMarketingStats() {
    const grid = document.getElementById('marketing-stat-grid');
    try {
      const stats = await api('/api/admin/report/overview');
      const items = [
        { label: t('adminStatParents'), value: stats.parents },
        { label: t('adminStatClubMembers'), value: stats.clubMembers, sub: t('adminStatOfParents', { count: stats.parents }) },
        { label: t('adminStatOrders'), value: stats.ordersPaid, sub: t('adminStatOrdersTotal', { count: stats.ordersTotal }) },
      ];
      grid.innerHTML = items.map(item => `
        <div class="stat-item">
          <div class="stat-value">${escapeHtml(String(item.value))}</div>
          <div class="stat-label">${escapeHtml(item.label)}</div>
          ${item.sub ? `<div class="stat-sub">${escapeHtml(item.sub)}</div>` : ''}
        </div>
      `).join('');
    } catch {
      grid.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadStats'))}</p>`;
    }
  }

  // ── Showcase: welcome message ──
  async function loadShowcaseContent() {
    try {
      const data = await api('/api/showcase');
      document.getElementById('sc-welcome-en').value = data.welcomeMessageEn || '';
      document.getElementById('sc-welcome-nl').value = data.welcomeMessageNl || '';
      renderVideoStatus(data.videoStatus);
    } catch { /* leave fields blank — the save button still works from empty */ }
  }

  function renderVideoStatus(status) {
    const el = document.getElementById('showcase-video-status');
    const clearBtn = document.getElementById('sc-video-clear-btn');
    if (status === 'ready') {
      el.textContent = t('adminShowcaseVideoReady');
      clearBtn.hidden = false;
    } else {
      el.textContent = t('adminShowcaseVideoPlaceholder');
      clearBtn.hidden = true;
    }
  }

  function setupShowcaseWelcome() {
    document.getElementById('showcase-welcome-save-btn').addEventListener('click', async () => {
      document.getElementById('showcase-welcome-error').hidden = true;
      document.getElementById('showcase-welcome-success').hidden = true;
      const welcomeMessageEn = document.getElementById('sc-welcome-en').value.trim();
      const welcomeMessageNl = document.getElementById('sc-welcome-nl').value.trim();
      try {
        await api('/api/admin/showcase', { method: 'PATCH', body: JSON.stringify({ welcomeMessageEn, welcomeMessageNl }) });
        document.getElementById('showcase-welcome-success').textContent = t('adminSaved');
        document.getElementById('showcase-welcome-success').hidden = false;
      } catch {
        document.getElementById('showcase-welcome-error').textContent = t('errorGeneric');
        document.getElementById('showcase-welcome-error').hidden = false;
      }
    });
  }

  // ── Showcase: video ──
  function setupShowcaseVideo() {
    document.getElementById('sc-video-upload-btn').addEventListener('click', () => {
      document.getElementById('sc-video-file').click();
    });
    document.getElementById('sc-video-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      document.getElementById('showcase-video-error').hidden = true;
      document.getElementById('showcase-video-status').textContent = t('adminUploading');
      try {
        const key = `showcase/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { url } = await api('/api/admin/upload-url', { method: 'POST', body: JSON.stringify({ key, contentType: file.type || 'video/mp4' }) });
        const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'video/mp4' }, body: file });
        if (!putRes.ok) throw new Error(t('adminErrorUploadFailed'));
        await api('/api/admin/showcase/video', { method: 'POST', body: JSON.stringify({ key }) });
        renderVideoStatus('ready');
      } catch (err) {
        document.getElementById('showcase-video-error').textContent = err.message || t('errorGeneric');
        document.getElementById('showcase-video-error').hidden = false;
        renderVideoStatus('placeholder');
      }
    });
    document.getElementById('sc-video-clear-btn').addEventListener('click', async () => {
      if (!window.confirm(t('adminDeleteConfirm'))) return;
      await api('/api/admin/showcase/video', { method: 'DELETE' });
      renderVideoStatus('placeholder');
    });
  }

  // ── Showcase: tiles ──
  let tiEditingId = null;

  async function loadShowcaseTiles() {
    const container = document.getElementById('showcase-tiles-list');
    try {
      const data = await api('/api/admin/showcase/tiles');
      const rows = data.tiles || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(tile => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(tile.icon || '')} ${escapeHtml(tile.label_en)}</div>
            <div class="admin-list-item-sub">
              <span class="status-badge ${tile.active ? 'active' : 'suspended'}">${escapeHtml(t(tile.active ? 'adminActive' : 'adminInactive'))}</span>
              &nbsp;·&nbsp; ${escapeHtml(t('tileType' + capitalize(tile.tile_type)))} &nbsp;·&nbsp; ${escapeHtml(t('linkType' + capitalize(tile.link_type === 'talk_demo' ? 'TalkDemo' : tile.link_type)))}
            </div>
          </div>
          <div class="admin-list-item-actions">
            <button type="button" class="btn-ghost btn-small" data-edit-ti="${tile.id}">${escapeHtml(t('adminEdit'))}</button>
            <button type="button" class="btn-ghost btn-small" data-delete-ti="${tile.id}">${escapeHtml(t('adminDelete'))}</button>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit-ti]').forEach(btn => {
        btn.addEventListener('click', () => openTileModal(btn.getAttribute('data-edit-ti'), rows.find(r => r.id === btn.getAttribute('data-edit-ti'))));
      });
      container.querySelectorAll('[data-delete-ti]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/showcase/tiles/${btn.getAttribute('data-delete-ti')}`, { method: 'DELETE' });
          loadShowcaseTiles();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadTiles'))}</p>`;
    }
  }

  function openTileModal(id, tile) {
    tiEditingId = id || null;
    document.getElementById('tile-error').hidden = true;
    document.getElementById('tile-modal-title').textContent = t(id ? 'adminEditTile' : 'adminNewTile');
    document.getElementById('ti-label-en').value = tile ? tile.label_en : '';
    document.getElementById('ti-label-nl').value = tile ? (tile.label_nl || '') : '';
    document.getElementById('ti-type').value = tile ? tile.tile_type : 'read';
    document.getElementById('ti-icon').value = tile ? (tile.icon || '') : '';
    document.getElementById('ti-link-type').value = tile ? tile.link_type : 'book';
    document.getElementById('ti-link-value').value = tile ? (tile.link_value || '') : '';
    document.getElementById('ti-active').checked = tile ? !!tile.active : true;
    document.getElementById('tile-modal').hidden = false;
  }

  function setupTileModal() {
    document.getElementById('new-tile-btn').addEventListener('click', () => openTileModal(null, null));
    document.getElementById('ti-close-btn').addEventListener('click', () => { document.getElementById('tile-modal').hidden = true; });
    document.getElementById('ti-save-btn').addEventListener('click', async () => {
      const labelEn = document.getElementById('ti-label-en').value.trim();
      const labelNl = document.getElementById('ti-label-nl').value.trim();
      const tileType = document.getElementById('ti-type').value;
      const icon = document.getElementById('ti-icon').value.trim();
      const linkType = document.getElementById('ti-link-type').value;
      const linkValue = document.getElementById('ti-link-value').value.trim();
      const active = document.getElementById('ti-active').checked;
      if (!labelEn) { showModalError('tile-error', t('errorMissingFields')); return; }
      try {
        const body = JSON.stringify({ tileType, labelEn, labelNl, icon, linkType, linkValue, active });
        if (tiEditingId) {
          await api(`/api/admin/showcase/tiles/${tiEditingId}`, { method: 'PATCH', body });
        } else {
          await api('/api/admin/showcase/tiles', { method: 'POST', body });
        }
        document.getElementById('tile-modal').hidden = true;
        loadShowcaseTiles();
      } catch {
        showModalError('tile-error', t('errorGeneric'));
      }
    });
  }

  // ── Showcase: Talk to Mare phrases ──
  let phEditingId = null;

  async function loadShowcasePhrases() {
    const container = document.getElementById('showcase-phrases-list');
    try {
      const data = await api('/api/admin/showcase/phrases');
      const rows = data.phrases || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(p => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(p.phrase_en)}</div>
            <div class="admin-list-item-sub">
              <span class="status-badge ${p.active ? 'active' : 'suspended'}">${escapeHtml(t(p.active ? 'adminActive' : 'adminInactive'))}</span>
            </div>
          </div>
          <div class="admin-list-item-actions">
            <button type="button" class="btn-ghost btn-small" data-edit-ph="${p.id}">${escapeHtml(t('adminEdit'))}</button>
            <button type="button" class="btn-ghost btn-small" data-delete-ph="${p.id}">${escapeHtml(t('adminDelete'))}</button>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit-ph]').forEach(btn => {
        btn.addEventListener('click', () => openPhraseModal(btn.getAttribute('data-edit-ph'), rows.find(r => r.id === btn.getAttribute('data-edit-ph'))));
      });
      container.querySelectorAll('[data-delete-ph]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/showcase/phrases/${btn.getAttribute('data-delete-ph')}`, { method: 'DELETE' });
          loadShowcasePhrases();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadPhrases'))}</p>`;
    }
  }

  function openPhraseModal(id, phrase) {
    phEditingId = id || null;
    document.getElementById('phrase-error').hidden = true;
    document.getElementById('phrase-modal-title').textContent = t(id ? 'adminEditPhrase' : 'adminNewPhrase');
    document.getElementById('ph-en').value = phrase ? phrase.phrase_en : '';
    document.getElementById('ph-nl').value = phrase ? (phrase.phrase_nl || '') : '';
    document.getElementById('ph-active').checked = phrase ? !!phrase.active : true;
    document.getElementById('phrase-modal').hidden = false;
  }

  function setupPhraseModal() {
    document.getElementById('new-phrase-btn').addEventListener('click', () => openPhraseModal(null, null));
    document.getElementById('ph-close-btn').addEventListener('click', () => { document.getElementById('phrase-modal').hidden = true; });
    document.getElementById('ph-save-btn').addEventListener('click', async () => {
      const phraseEn = document.getElementById('ph-en').value.trim();
      const phraseNl = document.getElementById('ph-nl').value.trim();
      const active = document.getElementById('ph-active').checked;
      if (!phraseEn) { showModalError('phrase-error', t('errorMissingFields')); return; }
      try {
        const body = JSON.stringify({ phraseEn, phraseNl, active });
        if (phEditingId) {
          await api(`/api/admin/showcase/phrases/${phEditingId}`, { method: 'PATCH', body });
        } else {
          await api('/api/admin/showcase/phrases', { method: 'POST', body });
        }
        document.getElementById('phrase-modal').hidden = true;
        loadShowcasePhrases();
      } catch {
        showModalError('phrase-error', t('errorGeneric'));
      }
    });
  }

  // ── Add single teacher (admin-side account creation) ──
  function setupAddTeacherForm() {
    document.getElementById('add-teacher-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      document.getElementById('add-teacher-error').hidden = true;
      document.getElementById('add-teacher-success').hidden = true;
      const name = document.getElementById('at-name').value.trim();
      const email = document.getElementById('at-email').value.trim();
      const school = document.getElementById('at-school').value.trim();
      if (!name || !email) {
        document.getElementById('add-teacher-error').textContent = t('errorMissingFields');
        document.getElementById('add-teacher-error').hidden = false;
        return;
      }
      const btn = document.getElementById('add-teacher-btn');
      btn.disabled = true;
      try {
        await api('/api/admin/teachers', { method: 'POST', body: JSON.stringify({ name, email, school }) });
        document.getElementById('add-teacher-success').textContent = t('adminTeacherAdded', { name });
        document.getElementById('add-teacher-success').hidden = false;
        document.getElementById('add-teacher-form').reset();
        loadDirectory();
      } catch (err) {
        document.getElementById('add-teacher-error').textContent = err.message === 'Email already registered' ? t('errorEmailTaken') : t('errorGeneric');
        document.getElementById('add-teacher-error').hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ── Bulk school onboarding ──
  function setupBulkImport() {
    document.getElementById('bulk-import-btn').addEventListener('click', async () => {
      document.getElementById('bulk-import-error').hidden = true;
      document.getElementById('bulk-import-result').innerHTML = '';
      const schoolName = document.getElementById('bi-school-name').value.trim();
      const text = document.getElementById('bi-text').value;
      if (!text.trim()) {
        document.getElementById('bulk-import-error').textContent = t('errorMissingFields');
        document.getElementById('bulk-import-error').hidden = false;
        return;
      }
      const btn = document.getElementById('bulk-import-btn');
      btn.disabled = true;
      try {
        const result = await api('/api/admin/bulk-import', { method: 'POST', body: JSON.stringify({ schoolName, text }) });
        const detail = await api(`/api/admin/bulk-imports/${result.importId}`);
        const failedRows = detail.rows.filter(r => r.status === 'failed');
        document.getElementById('bulk-import-result').innerHTML = `
          <p class="form-success">${escapeHtml(t('adminBulkImportSummary', { created: result.createdCount, total: result.rowCount }))}</p>
          ${failedRows.length ? `<div class="admin-list-item-sub" style="margin-bottom:12px;">${
            failedRows.map(r => `${escapeHtml(t('adminBulkImportRowFailed', { row: r.row_number, name: r.name || '—', error: r.error }))}`).join('<br>')
          }</div>` : ''}
        `;
        if (result.createdCount > 0) {
          document.getElementById('bi-text').value = '';
          loadDirectory();
        }
      } catch {
        document.getElementById('bulk-import-error').textContent = t('errorGeneric');
        document.getElementById('bulk-import-error').hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ── Club Mare: stats ──
  async function loadClubMareStats() {
    const grid = document.getElementById('clubmare-stat-grid');
    try {
      const stats = await api('/api/admin/report/overview');
      const items = [
        { label: t('adminStatClubMembers'), value: stats.clubMembers, sub: t('adminStatOfParents', { count: stats.parents }) },
      ];
      grid.innerHTML = items.map(item => `
        <div class="stat-item">
          <div class="stat-value">${escapeHtml(String(item.value))}</div>
          <div class="stat-label">${escapeHtml(item.label)}</div>
          ${item.sub ? `<div class="stat-sub">${escapeHtml(item.sub)}</div>` : ''}
        </div>
      `).join('');
    } catch {
      grid.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadStats'))}</p>`;
    }
  }

  // ── Club Mare: members ──
  async function loadClubMareMembers() {
    const container = document.getElementById('clubmare-members-table');
    try {
      const data = await api('/api/admin/club-mare/members');
      const rows = data.members || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `<thead><tr>
        <th>${escapeHtml(t('fieldName'))}</th><th>${escapeHtml(t('fieldEmail'))}</th>
        <th>${escapeHtml(t('adminClubMareTier'))}</th><th>${escapeHtml(t('adminClubMareJoined'))}</th><th></th>
      </tr></thead>`;
      const tbody = document.createElement('tbody');
      rows.forEach(m => {
        const tr = document.createElement('tr');
        const isPaid = m.tier === 2;
        tr.innerHTML = `
          <td>${escapeHtml(m.parent_name || '—')}</td>
          <td>${escapeHtml(m.parent_email || '—')}</td>
          <td><span class="status-badge ${isPaid ? 'active' : 'suspended'}">${escapeHtml(t(isPaid ? 'adminClubMarePaid' : 'adminClubMareFree'))}</span></td>
          <td>${escapeHtml((m.joined_at || '').slice(0, 10))}</td>
        `;
        const actionTd = document.createElement('td');
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn-ghost btn-small';
        toggleBtn.textContent = t(isPaid ? 'adminClubMareDowngrade' : 'adminClubMareUpgrade');
        toggleBtn.addEventListener('click', async () => {
          toggleBtn.disabled = true;
          try {
            await api(`/api/admin/club-mare/members/${m.parent_id}/tier`, { method: 'PATCH', body: JSON.stringify({ tier: isPaid ? 1 : 2 }) });
            loadClubMareMembers();
          } catch { toggleBtn.disabled = false; }
        });
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-ghost btn-small';
        removeBtn.textContent = t('adminDelete');
        removeBtn.style.marginLeft = '6px';
        removeBtn.addEventListener('click', async () => {
          if (!window.confirm(t('adminClubMareRemoveConfirm', { name: m.parent_name }))) return;
          await api(`/api/admin/club-mare/members/${m.parent_id}`, { method: 'DELETE' });
          loadClubMareMembers();
        });
        actionTd.appendChild(toggleBtn);
        actionTd.appendChild(removeBtn);
        tr.appendChild(actionTd);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.innerHTML = '';
      container.appendChild(table);
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadMembers'))}</p>`;
    }
  }

  // ── Club Mare: exclusive posts ──
  let cmpEditingId = null;
  let cmpUploadedImageKey = null;

  async function loadClubMarePosts() {
    const container = document.getElementById('clubmare-posts-list');
    try {
      const data = await api('/api/admin/club-mare/posts');
      const rows = data.posts || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(post => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(post.title)}</div>
            <div class="admin-list-item-sub">
              <span class="status-badge ${post.active ? 'active' : 'suspended'}">${escapeHtml(t(post.active ? 'adminActive' : 'adminInactive'))}</span>
              &nbsp;·&nbsp; ${escapeHtml(t(post.min_tier === 2 ? 'clubMareTierPaidOnly' : 'clubMareTierFreeAndPaid'))}
            </div>
          </div>
          <div class="admin-list-item-actions">
            <button type="button" class="btn-ghost btn-small" data-edit-cmp="${post.id}">${escapeHtml(t('adminEdit'))}</button>
            <button type="button" class="btn-ghost btn-small" data-delete-cmp="${post.id}">${escapeHtml(t('adminDelete'))}</button>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit-cmp]').forEach(btn => {
        btn.addEventListener('click', () => openClubMarePostModal(btn.getAttribute('data-edit-cmp'), rows.find(r => r.id === btn.getAttribute('data-edit-cmp'))));
      });
      container.querySelectorAll('[data-delete-cmp]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/club-mare/posts/${btn.getAttribute('data-delete-cmp')}`, { method: 'DELETE' });
          loadClubMarePosts();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadPosts'))}</p>`;
    }
  }

  function openClubMarePostModal(id, post) {
    cmpEditingId = id || null;
    cmpUploadedImageKey = post ? (post.image_key || null) : null;
    document.getElementById('clubmare-post-error').hidden = true;
    document.getElementById('clubmare-post-modal-title').textContent = t(id ? 'adminEditPost' : 'adminNewPost');
    document.getElementById('cmp-title').value = post ? post.title : '';
    document.getElementById('cmp-body').value = post ? (post.body || '') : '';
    document.getElementById('cmp-min-tier').value = post ? String(post.min_tier) : '1';
    document.getElementById('cmp-active').checked = post ? !!post.active : true;
    document.getElementById('cmp-image-status').textContent = cmpUploadedImageKey ? t('adminImageAttached') : '';
    document.getElementById('cmp-image-file').value = '';
    document.getElementById('clubmare-post-modal').hidden = false;
  }

  function setupClubMarePostModal() {
    document.getElementById('new-clubmare-post-btn').addEventListener('click', () => openClubMarePostModal(null, null));
    document.getElementById('cmp-close-btn').addEventListener('click', () => { document.getElementById('clubmare-post-modal').hidden = true; });
    document.getElementById('cmp-image-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const status = document.getElementById('cmp-image-status');
      status.textContent = t('adminUploading');
      try {
        const key = `club-mare/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { url } = await api('/api/admin/upload-url', { method: 'POST', body: JSON.stringify({ key, contentType: file.type || 'application/octet-stream' }) });
        const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        if (!putRes.ok) throw new Error(t('adminErrorUploadFailed'));
        cmpUploadedImageKey = key;
        status.textContent = t('adminUploaded');
      } catch (err) {
        status.textContent = err.message || t('errorGeneric');
      }
    });
    document.getElementById('cmp-save-btn').addEventListener('click', async () => {
      const title = document.getElementById('cmp-title').value.trim();
      const body = document.getElementById('cmp-body').value.trim();
      const minTier = document.getElementById('cmp-min-tier').value;
      const active = document.getElementById('cmp-active').checked;
      if (!title) { showModalError('clubmare-post-error', t('errorMissingFields')); return; }
      try {
        const payload = JSON.stringify({ title, body, minTier, active, imageKey: cmpUploadedImageKey });
        if (cmpEditingId) {
          await api(`/api/admin/club-mare/posts/${cmpEditingId}`, { method: 'PATCH', body: payload });
        } else {
          await api('/api/admin/club-mare/posts', { method: 'POST', body: payload });
        }
        document.getElementById('clubmare-post-modal').hidden = true;
        loadClubMarePosts();
      } catch {
        showModalError('clubmare-post-error', t('errorGeneric'));
      }
    });
  }

  // ── Merchandise: products ──
  let prEditingId = null;
  let prUploadedImageKeys = [];
  let prUploadedVideoKey = null;

  function fmtPrice(cents, currency) {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency || 'gbp').toUpperCase() }).format((cents || 0) / 100);
    } catch { return `${(cents || 0) / 100}`; }
  }

  async function loadProducts() {
    const container = document.getElementById('products-list');
    try {
      const data = await api('/api/admin/products');
      const rows = data.products || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(p => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(p.name)} — ${escapeHtml(fmtPrice(p.price_cents, p.currency))}</div>
            <div class="admin-list-item-sub">
              <span class="status-badge ${p.active ? 'active' : 'suspended'}">${escapeHtml(t(p.active ? 'adminActive' : 'adminInactive'))}</span>
              &nbsp;·&nbsp; ${escapeHtml(t('adminProductPhotoCount', { count: (p.image_keys || []).length }))}
              ${p.video_key ? ` · ${escapeHtml(t('adminProductHasVideo'))}` : ''}
              ${p.stock != null ? ` · ${escapeHtml(t('adminProductStock', { count: p.stock }))}` : ''}
            </div>
          </div>
          <div class="admin-list-item-actions">
            <button type="button" class="btn-ghost btn-small" data-edit-pr="${p.id}">${escapeHtml(t('adminEdit'))}</button>
            <button type="button" class="btn-ghost btn-small" data-delete-pr="${p.id}">${escapeHtml(t('adminDelete'))}</button>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit-pr]').forEach(btn => {
        btn.addEventListener('click', () => openProductModal(btn.getAttribute('data-edit-pr'), rows.find(r => r.id === btn.getAttribute('data-edit-pr'))));
      });
      container.querySelectorAll('[data-delete-pr]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/products/${btn.getAttribute('data-delete-pr')}`, { method: 'DELETE' });
          loadProducts();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadProducts'))}</p>`;
    }
  }

  function renderImageChips() {
    const wrap = document.getElementById('pr-image-list');
    wrap.innerHTML = prUploadedImageKeys.map((key, i) => `
      <span class="admin-image-chip">${escapeHtml(t('adminPhotoLabel', { n: i + 1 }))} <button type="button" data-remove-img="${i}" aria-label="Remove">✕</button></span>
    `).join('');
    wrap.querySelectorAll('[data-remove-img]').forEach(btn => {
      btn.addEventListener('click', () => {
        prUploadedImageKeys.splice(Number(btn.getAttribute('data-remove-img')), 1);
        renderImageChips();
      });
    });
  }

  function openProductModal(id, product) {
    prEditingId = id || null;
    prUploadedImageKeys = product ? [...(product.image_keys || [])] : [];
    prUploadedVideoKey = product ? (product.video_key || null) : null;
    document.getElementById('product-error').hidden = true;
    document.getElementById('product-modal-title').textContent = t(id ? 'adminEditProduct' : 'adminNewProduct');
    document.getElementById('pr-name').value = product ? product.name : '';
    document.getElementById('pr-description').value = product ? (product.description || '') : '';
    document.getElementById('pr-price').value = product ? (product.price_cents / 100).toFixed(2) : '';
    document.getElementById('pr-currency').value = product ? product.currency : 'gbp';
    document.getElementById('pr-stock').value = product && product.stock != null ? product.stock : '';
    document.getElementById('pr-active').checked = product ? !!product.active : true;
    document.getElementById('pr-image-file').value = '';
    document.getElementById('pr-video-file').value = '';
    document.getElementById('pr-video-status').textContent = prUploadedVideoKey ? t('adminVideoAttached') : '';
    renderImageChips();
    document.getElementById('product-modal').hidden = false;
  }

  function setupProductModal() {
    document.getElementById('new-product-btn').addEventListener('click', () => openProductModal(null, null));
    document.getElementById('pr-close-btn').addEventListener('click', () => { document.getElementById('product-modal').hidden = true; });

    document.getElementById('pr-image-file').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        try {
          const key = `products/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const { url } = await api('/api/admin/upload-url', { method: 'POST', body: JSON.stringify({ key, contentType: file.type || 'application/octet-stream' }) });
          const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
          if (!putRes.ok) throw new Error();
          prUploadedImageKeys.push(key);
        } catch {
          showModalError('product-error', t('adminErrorUploadFailed'));
        }
      }
      renderImageChips();
      e.target.value = '';
    });

    document.getElementById('pr-video-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const status = document.getElementById('pr-video-status');
      status.textContent = t('adminUploading');
      try {
        const key = `products/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { url } = await api('/api/admin/upload-url', { method: 'POST', body: JSON.stringify({ key, contentType: file.type || 'video/mp4' }) });
        const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'video/mp4' }, body: file });
        if (!putRes.ok) throw new Error(t('adminErrorUploadFailed'));
        prUploadedVideoKey = key;
        status.textContent = t('adminUploaded');
      } catch (err) {
        status.textContent = err.message || t('errorGeneric');
      }
    });

    document.getElementById('pr-save-btn').addEventListener('click', async () => {
      const name = document.getElementById('pr-name').value.trim();
      const description = document.getElementById('pr-description').value.trim();
      const priceVal = parseFloat(document.getElementById('pr-price').value);
      const currency = document.getElementById('pr-currency').value;
      const stockVal = document.getElementById('pr-stock').value;
      const active = document.getElementById('pr-active').checked;
      if (!name || !priceVal || priceVal <= 0) { showModalError('product-error', t('errorMissingFields')); return; }
      try {
        const payload = JSON.stringify({
          name, description, priceCents: Math.round(priceVal * 100), currency,
          imageKeys: prUploadedImageKeys, videoKey: prUploadedVideoKey,
          stock: stockVal === '' ? null : Number(stockVal), active,
        });
        if (prEditingId) {
          await api(`/api/admin/products/${prEditingId}`, { method: 'PATCH', body: payload });
        } else {
          await api('/api/admin/products', { method: 'POST', body: payload });
        }
        document.getElementById('product-modal').hidden = true;
        loadProducts();
      } catch {
        showModalError('product-error', t('errorGeneric'));
      }
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Boot ──
  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();
    setupLoginForm();
    setupForgotPassword();
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
