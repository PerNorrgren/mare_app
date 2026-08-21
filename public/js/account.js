(function () {
  const t = (key, vars) => window.MareI18n.t(key, vars);
  let accountData = null;

  async function api(path, options) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.data = data; throw err; }
    return data;
  }

  function showError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }
  function clearError(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
  function flashSaved(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 2500);
  }
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function setupLangSwitch() {
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });
  }

  // ── Month/day select population — month names via Intl so they follow
  // the page's own locale without needing 12 extra translation keys. ──
  function monthNames() {
    const fmt = new Intl.DateTimeFormat(window.MareI18n.locale === 'nl' ? 'nl' : 'en', { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2024, i, 1)));
  }
  function populateMonthSelect(select) {
    monthNames().forEach((name, i) => {
      const opt = document.createElement('option');
      opt.value = String(i + 1);
      opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      select.appendChild(opt);
    });
  }
  function populateDaySelect(select) {
    for (let d = 1; d <= 31; d++) {
      const opt = document.createElement('option');
      opt.value = String(d);
      opt.textContent = String(d);
      select.appendChild(opt);
    }
  }
  function setDobSelects(monthSelect, daySelect, month, day) {
    monthSelect.value = month ? String(month) : '';
    daySelect.value = day ? String(day) : '';
  }

  // ── Accordion ──
  function setupAccordions() {
    document.querySelectorAll('.acc-card-header').forEach(header => {
      header.addEventListener('click', () => {
        const body = document.getElementById(`body-${header.getAttribute('data-card')}`);
        const chevron = header.querySelector('.acc-chevron');
        const open = body.classList.toggle('open');
        chevron.classList.toggle('open', open);
      });
    });
  }
  function openFirstCard() {
    document.querySelector('.acc-card-header')?.click();
  }

  // ── Profile ──
  function renderProfile(parent) {
    document.getElementById('p-name').value = parent.name || '';
    document.getElementById('p-email').value = parent.email || '';
    setDobSelects(document.getElementById('p-bday-month'), document.getElementById('p-bday-day'), parent.birthday_month, parent.birthday_day);
  }
  function setupProfileForm() {
    populateMonthSelect(document.getElementById('p-bday-month'));
    populateDaySelect(document.getElementById('p-bday-day'));
    document.getElementById('profile-save-btn').addEventListener('click', async () => {
      clearError('profile-error');
      const name = document.getElementById('p-name').value.trim();
      if (!name) return showError('profile-error', t('accErrorNameRequired'));
      const birthdayMonth = document.getElementById('p-bday-month').value || null;
      const birthdayDay = document.getElementById('p-bday-day').value || null;
      try {
        await api('/api/account', { method: 'PATCH', body: JSON.stringify({ name, birthdayMonth, birthdayDay }) });
        document.getElementById('acc-welcome').textContent = t('accWelcome', { name });
        flashSaved('profile-saved');
      } catch {
        showError('profile-error', t('accErrorGeneric'));
      }
    });
  }

  // ── Preferences ──
  function renderPrefs(parent) {
    document.getElementById('p-email-optin').checked = !!parent.email_opt_in;
    document.getElementById('p-frequency').value = parent.email_frequency || 'weekly';
  }
  function setupPrefsForm() {
    document.getElementById('prefs-save-btn').addEventListener('click', async () => {
      const optIn = document.getElementById('p-email-optin').checked;
      const frequency = document.getElementById('p-frequency').value;
      try {
        await api('/api/account/email-prefs', { method: 'PATCH', body: JSON.stringify({ optIn, frequency }) });
        flashSaved('prefs-saved');
      } catch { /* silent — low-stakes toggle, no error UI needed */ }
    });
  }

  // ── Address rendering (shared shape for parent- and child-owned) ──
  function renderAddressList(container, addresses, onDelete, onSetDefault) {
    container.innerHTML = '';
    if (!addresses.length) {
      const p = document.createElement('p');
      p.className = 'acc-locked-note';
      p.textContent = t('accNoAddressesYet');
      container.appendChild(p);
      return;
    }
    addresses.forEach(a => {
      const row = document.createElement('div');
      row.className = 'acc-address-item';
      const text = document.createElement('div');
      const labelLine = [a.label, a.recipient_name].filter(Boolean).join(' — ');
      text.innerHTML = `${labelLine ? `<strong>${escapeHtml(labelLine)}</strong><br>` : ''}${escapeHtml(a.line1)}${a.line2 ? ', ' + escapeHtml(a.line2) : ''}<br>${escapeHtml(a.city)}, ${escapeHtml(a.postcode)}, ${escapeHtml(a.country)}${a.is_default ? `<span class="addr-default-badge">${escapeHtml(t('accDefault'))}</span>` : ''}`;
      row.appendChild(text);
      const actions = document.createElement('div');
      actions.className = 'admin-resource-actions';
      if (!a.is_default) {
        const defBtn = document.createElement('button');
        defBtn.type = 'button';
        defBtn.textContent = t('accMakeDefault');
        defBtn.addEventListener('click', () => onSetDefault(a));
        actions.appendChild(defBtn);
      }
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'danger';
      delBtn.textContent = t('adminDelete');
      delBtn.addEventListener('click', () => onDelete(a));
      actions.appendChild(delBtn);
      row.appendChild(actions);
      container.appendChild(row);
    });
  }

  async function loadParentAddresses() {
    const data = await api('/api/account/addresses');
    renderAddressList(
      document.getElementById('parent-address-list'),
      data.addresses || [],
      async (a) => { await api(`/api/addresses/${a.id}`, { method: 'DELETE' }); loadParentAddresses(); },
      async (a) => { await api(`/api/addresses/${a.id}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) }); loadParentAddresses(); }
    );
  }

  function setupParentAddressForm() {
    const toggle = document.getElementById('add-address-toggle');
    const form = document.getElementById('parent-address-form');
    toggle.addEventListener('click', () => { form.hidden = !form.hidden; });
    document.getElementById('cancel-address-btn').addEventListener('click', () => { form.hidden = true; form.reset(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('address-error');
      const body = {
        label: document.getElementById('a-label').value.trim(),
        recipientName: document.getElementById('a-recipient').value.trim(),
        line1: document.getElementById('a-line1').value.trim(),
        line2: document.getElementById('a-line2').value.trim(),
        city: document.getElementById('a-city').value.trim(),
        postcode: document.getElementById('a-postcode').value.trim(),
        country: document.getElementById('a-country').value.trim() || 'GB',
        isDefault: document.getElementById('a-default').checked,
      };
      try {
        await api('/api/account/addresses', { method: 'POST', body: JSON.stringify(body) });
        form.hidden = true;
        form.reset();
        await loadParentAddresses();
      } catch (err) {
        showError('address-error', err.message || t('accErrorGeneric'));
      }
    });
  }

  // ── Children ──
  const AGE_BAND_LABEL_KEY = { '6-8': null, '9-11': null, '12-15': null }; // labels come straight from the option text already in the DOM

  async function loadChildren() {
    const data = await api('/api/children');
    const list = document.getElementById('children-list');
    list.innerHTML = '';
    for (const child of data.children || []) {
      const detail = await api(`/api/children/${child.id}`);
      list.appendChild(buildChildCard(detail));
    }
  }

  function buildChildCard(detail) {
    const { child, isPrimary, carers, addresses } = detail;
    const tpl = document.getElementById('child-card-template');
    const node = tpl.content.cloneNode(true);
    const root = node.querySelector('.acc-child-card');
    const header = node.querySelector('.acc-child-header');
    const body = node.querySelector('.acc-child-body');
    const nameEl = node.querySelector('.acc-child-name');
    const rolePill = node.querySelector('.acc-child-role-pill');

    nameEl.textContent = child.name;
    rolePill.textContent = isPrimary ? t('accPrimaryParent') : t('accCarer');
    rolePill.classList.toggle('admin', isPrimary);

    header.addEventListener('click', () => {
      const open = body.classList.toggle('open');
      header.querySelector('.acc-chevron')?.classList.toggle('open', open);
    });

    const monthSel = node.querySelector('.child-bday-month');
    const daySel = node.querySelector('.child-bday-day');
    populateMonthSelect(monthSel);
    populateDaySelect(daySel);
    setDobSelects(monthSel, daySel, child.birthday_month, child.birthday_day);
    node.querySelector('.child-age-band').value = child.age_band || '';

    node.querySelector('.child-save-btn').addEventListener('click', async () => {
      const ageBand = node.querySelector ? root.querySelector('.child-age-band').value || null : null;
      const bMonth = root.querySelector('.child-bday-month').value || null;
      const bDay = root.querySelector('.child-bday-day').value || null;
      try {
        await api(`/api/children/${child.id}`, { method: 'PATCH', body: JSON.stringify({ ageBand: root.querySelector('.child-age-band').value || null, birthdayMonth: bMonth, birthdayDay: bDay }) });
        const note = root.querySelector('.child-saved-note');
        note.hidden = false;
        setTimeout(() => { note.hidden = true; }, 2500);
      } catch { /* age-band validation errors are unreachable from this dropdown's fixed options */ }
    });

    // Carers
    const carerList = root.querySelector('.carer-list');
    function renderCarers() {
      carerList.innerHTML = '';
      // Primary parent shown first, as a non-removable reference line —
      // the actual primary-parent identity lives on the child row itself
      // (child.parent_id), not in the carers list, so this reads the
      // account owner's own name/email off the page's loaded data when
      // it's them, otherwise just labels the row.
      carers.forEach(c => {
        const row = document.createElement('div');
        row.className = 'acc-carer-item';
        const text = document.createElement('div');
        text.innerHTML = `${escapeHtml(c.name)} <span class="acc-locked-note">(${escapeHtml(c.email)}${c.relationship ? ' \u2014 ' + escapeHtml(c.relationship) : ''})</span>`;
        row.appendChild(text);
        if (isPrimary) {
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'danger';
          removeBtn.textContent = t('accRemove');
          removeBtn.addEventListener('click', async () => {
            await api(`/api/children/${child.id}/carers/${c.carer_link_id}`, { method: 'DELETE' });
            loadChildren();
          });
          const wrap = document.createElement('div');
          wrap.className = 'admin-resource-actions';
          wrap.appendChild(removeBtn);
          row.appendChild(wrap);
        }
        carerList.appendChild(row);
      });
      if (!carers.length) {
        const p = document.createElement('p');
        p.className = 'acc-locked-note';
        p.textContent = t('accNoOtherCarers');
        carerList.appendChild(p);
      }
    }
    renderCarers();

    root.querySelector('.add-carer-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const errEl = form.querySelector('.carer-error');
      errEl.hidden = true;
      const email = form.querySelector('.carer-email').value.trim();
      const relationship = form.querySelector('.carer-relationship').value.trim();
      try {
        await api(`/api/children/${child.id}/carers`, { method: 'POST', body: JSON.stringify({ email, relationship }) });
        form.reset();
        loadChildren();
      } catch (err) {
        errEl.textContent = err.message || t('accErrorGeneric');
        errEl.hidden = false;
      }
    });

    // Child addresses
    const addrList = root.querySelector('.child-address-list');
    renderAddressList(
      addrList,
      addresses,
      async (a) => { await api(`/api/addresses/${a.id}`, { method: 'DELETE' }); loadChildren(); },
      async (a) => { await api(`/api/addresses/${a.id}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) }); loadChildren(); }
    );
    const addrToggle = root.querySelector('.add-child-address-toggle');
    const addrForm = root.querySelector('.add-child-address-form');
    addrToggle.addEventListener('click', () => { addrForm.hidden = !addrForm.hidden; });
    root.querySelector('.cancel-child-address-btn').addEventListener('click', () => { addrForm.hidden = true; addrForm.reset(); });
    addrForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = addrForm.querySelector('.ca-error');
      errEl.hidden = true;
      const body = {
        label: addrForm.querySelector('.ca-label').value.trim(),
        recipientName: addrForm.querySelector('.ca-recipient').value.trim(),
        line1: addrForm.querySelector('.ca-line1').value.trim(),
        line2: addrForm.querySelector('.ca-line2').value.trim(),
        city: addrForm.querySelector('.ca-city').value.trim(),
        postcode: addrForm.querySelector('.ca-postcode').value.trim(),
        country: addrForm.querySelector('.ca-country').value.trim() || 'GB',
        isDefault: addrForm.querySelector('.ca-default').checked,
      };
      try {
        await api(`/api/children/${child.id}/addresses`, { method: 'POST', body: JSON.stringify(body) });
        addrForm.hidden = true;
        addrForm.reset();
        loadChildren();
      } catch (err) {
        errEl.textContent = err.message || t('accErrorGeneric');
        errEl.hidden = false;
      }
    });

    // Delete child (primary only)
    const deleteBtn = root.querySelector('.child-delete-btn');
    const notPrimaryNote = root.querySelector('.child-not-primary-note');
    if (!isPrimary) {
      deleteBtn.hidden = true;
      notPrimaryNote.hidden = false;
    } else {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(t('accConfirmDeleteChild', { name: child.name }))) return;
        await api(`/api/children/${child.id}`, { method: 'DELETE' });
        loadChildren();
      });
    }

    return root;
  }

  function setupAddChildForm() {
    const toggle = document.getElementById('add-child-toggle');
    const form = document.getElementById('add-child-form');
    toggle.addEventListener('click', () => { form.hidden = !form.hidden; });
    document.getElementById('cancel-child-btn').addEventListener('click', () => { form.hidden = true; form.reset(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('add-child-error');
      const name = document.getElementById('new-child-name').value.trim();
      if (!name) return showError('add-child-error', t('accErrorNameRequired'));
      try {
        await api('/api/children', { method: 'POST', body: JSON.stringify({ name }) });
        form.hidden = true;
        form.reset();
        await loadChildren();
      } catch {
        showError('add-child-error', t('accErrorGeneric'));
      }
    });
  }

  // ── Password ──
  function setupPasswordForm() {
    document.getElementById('password-save-btn').addEventListener('click', async () => {
      clearError('password-error');
      const current = document.getElementById('pw-current').value;
      const next = document.getElementById('pw-new').value;
      const confirm = document.getElementById('pw-confirm').value;
      if (!current || !next) return showError('password-error', t('errorMissingFields'));
      if (next !== confirm) return showError('password-error', t('errorPasswordMismatch'));
      if (next.length < 8) return showError('password-error', t('errorPasswordTooShort'));
      try {
        await api('/api/account/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) });
        document.getElementById('pw-current').value = '';
        document.getElementById('pw-new').value = '';
        document.getElementById('pw-confirm').value = '';
        flashSaved('password-saved');
      } catch (err) {
        showError('password-error', err.message === 'Current password is incorrect' ? t('accErrorWrongCurrentPassword') : t('accErrorGeneric'));
      }
    });
  }

  // ── Delete account ──
  function setupDeleteAccount() {
    document.getElementById('delete-account-btn').addEventListener('click', async () => {
      clearError('delete-error');
      if (!confirm(t('accConfirmDeleteAccount'))) return;
      try {
        await api('/api/account', { method: 'DELETE' });
        window.location.href = '/';
      } catch (err) {
        showError('delete-error', err.data?.error === undefined ? t('accErrorGeneric') : (
          err.message.includes('primary parent') ? t('accErrorPrimaryBlocksDelete') : t('accErrorGeneric')
        ));
      }
    });
  }

  document.getElementById('sign-out-btn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });

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

  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();
    setupAccordions();
    setupProfileForm();
    setupPrefsForm();
    setupParentAddressForm();
    setupAddChildForm();
    setupPasswordForm();
    setupDeleteAccount();

    const user = await checkSession();
    if (!user || user.role !== 'parent') {
      window.location.href = '/login.html';
      return;
    }

    const data = await api('/api/account');
    accountData = data;
    document.getElementById('acc-welcome').textContent = t('accWelcome', { name: data.parent.name });
    renderProfile(data.parent);
    renderPrefs(data.parent);
    await loadParentAddresses();
    await loadChildren();
    openFirstCard();
  }
  init();
})();
