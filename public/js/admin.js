(function () {
  let currentUser = null;

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

  // ── Login ──
  function showError(id, message) {
    const el = document.getElementById(id);
    el.textContent = message;
    el.hidden = false;
  }
  function clearError(id) {
    document.getElementById(id).hidden = true;
  }

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
      showError('form-error', err.message === 'Invalid email or password' ? "That email or password doesn't match our records." : 'Something went wrong — please try again.');
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById('sign-out-btn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/admin.html';
  });

  // ── Dashboard shell ──
  function enterDashboard(user) {
    document.getElementById('login-view').hidden = true;
    document.getElementById('dashboard-view').hidden = false;
    const pill = document.getElementById('who-pill');
    pill.hidden = false;
    pill.textContent = `${user.name} · ${user.role}`;
    pill.classList.toggle('admin', user.role === 'admin');
    document.getElementById('sign-out-btn').hidden = false;

    const isAdmin = user.role === 'admin';
    document.querySelectorAll('.admin-only-tab').forEach(el => { el.hidden = !isAdmin; });

    setupTabs();
    loadOverview();
    loadResources();
    loadDirectory();
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
        `${(data.books || []).length} book row(s) in the library right now.`;
    } catch {
      document.getElementById('book-count-note').textContent = 'Could not load book count.';
    }
    if (currentUser && currentUser.role === 'admin') {
      document.getElementById('products-note-card').hidden = false;
    }
  }

  // ── Teacher resources ──
  const categorySelect = document.getElementById('r-category');
  categorySelect.addEventListener('change', () => {
    const isDoc = categorySelect.value === 'document';
    document.getElementById('r-file-field').hidden = !isDoc;
    document.getElementById('r-url-field').hidden = isDoc;
  });

  async function uploadResourceFile(file) {
    const status = document.getElementById('r-upload-status');
    status.textContent = 'Uploading…';
    const key = `teacher-resources/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { url } = await api('/api/admin/upload-url', {
      method: 'POST',
      body: JSON.stringify({ key, contentType: file.type || 'application/octet-stream' }),
    });
    const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    if (!putRes.ok) throw new Error('Upload failed');
    status.textContent = 'Uploaded ✓';
    return key;
  }

  document.getElementById('resource-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('resource-error');
    const submitBtn = document.getElementById('resource-submit-btn');
    submitBtn.disabled = true;
    try {
      const title = document.getElementById('r-title').value.trim();
      const description = document.getElementById('r-description').value.trim();
      const category = categorySelect.value;
      if (!title) throw new Error('Title is required.');

      let fileKey = null, externalUrl = null;
      if (category === 'document') {
        const fileInput = document.getElementById('r-file');
        if (!fileInput.files[0]) throw new Error('Choose a file to upload.');
        fileKey = await uploadResourceFile(fileInput.files[0]);
      } else {
        externalUrl = document.getElementById('r-url').value.trim();
        if (!externalUrl) throw new Error('Add a URL.');
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
      showError('resource-error', err.message || 'Could not save this resource.');
    } finally {
      submitBtn.disabled = false;
    }
  });

  async function loadResources() {
    const container = document.getElementById('resource-list');
    try {
      const data = await api('/api/admin/teacher-resources');
      const resources = data.resources || [];
      if (!resources.length) {
        container.innerHTML = '<p class="admin-empty-note">No resources yet — add one above.</p>';
        return;
      }
      container.innerHTML = '';
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = '<thead><tr><th>Title</th><th>Type</th><th>Active</th><th></th></tr></thead>';
      const tbody = document.createElement('tbody');
      resources.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(r.title)}</td>
          <td>${escapeHtml(r.category)}</td>
          <td>${r.active ? 'Yes' : 'No'}</td>
        `;
        const actionsTd = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'admin-resource-actions';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = r.active ? 'Hide' : 'Show';
        toggleBtn.addEventListener('click', async () => {
          await api(`/api/admin/teacher-resources/${r.id}`, { method: 'PATCH', body: JSON.stringify({ active: r.active ? 0 : 1 }) });
          loadResources();
        });
        actions.appendChild(toggleBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(`Delete "${r.title}"?`)) return;
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
      container.innerHTML = '<p class="admin-empty-note">Could not load resources.</p>';
    }
  }

  // ── Directory ──
  async function loadDirectory() {
    try {
      const data = await api('/api/admin/parents');
      renderDirectoryTable('parents-table', data.parents || [], ['name', 'email', 'preferred_locale', 'created_at']);
    } catch {
      document.getElementById('parents-table').innerHTML = '<p class="admin-empty-note">Could not load parents.</p>';
    }
    try {
      const data = await api('/api/admin/teachers');
      renderDirectoryTable('teachers-table', data.teachers || [], ['name', 'email', 'school', 'preferred_locale', 'created_at']);
    } catch {
      document.getElementById('teachers-table').innerHTML = '<p class="admin-empty-note">Could not load teachers.</p>';
    }
  }

  function renderDirectoryTable(containerId, rows, columns) {
    const container = document.getElementById(containerId);
    if (!rows.length) {
      container.innerHTML = '<p class="admin-empty-note">None yet.</p>';
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
    const map = { name: 'Name', email: 'Email', school: 'School', preferred_locale: 'Locale', created_at: 'Joined' };
    return map[col] || col;
  }

  // ── Staff ──
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
      showError('staff-error', err.message || 'Could not create this account.');
    }
  });

  async function loadStaff() {
    const container = document.getElementById('staff-table');
    try {
      const data = await api('/api/admin/staff');
      const staff = data.staff || [];
      if (!staff.length) {
        container.innerHTML = '<p class="admin-empty-note">None yet.</p>';
        return;
      }
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = '<thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Since</th></tr></thead>';
      const tbody = document.createElement('tbody');
      staff.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.email)}</td>
          <td><span class="role-pill ${s.role === 'admin' ? 'admin' : ''}">${escapeHtml(s.role)}</span></td>
          <td>${escapeHtml(s.created_at)}</td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.innerHTML = '';
      container.appendChild(table);
    } catch {
      container.innerHTML = '<p class="admin-empty-note">Could not load staff accounts.</p>';
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Boot ──
  async function init() {
    const user = await checkSession();
    if (user && (user.role === 'admin' || user.role === 'support')) {
      currentUser = user;
      enterDashboard(user);
    }
  }
  init();
})();
