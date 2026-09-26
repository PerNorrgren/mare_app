// ── role-chooser.js — one sign-in for every kind of account (Mare App 4).
// Used by the parent, teacher and admin login pages. If the email and
// password match more than one account (e.g. a teacher who is also an
// editor), a small popup asks where to go, one button per account. ──
(function () {
  const t = (key) => (window.MareI18n ? window.MareI18n.t(key) : key);

  const LABELS = {
    parent: ['chooseRoleParent', 'chooseRoleParentSub'],
    teacher: ['chooseRoleTeacher', 'chooseRoleTeacherSub'],
    admin: ['chooseRoleAdmin', 'chooseRoleAdminSub'],
    support: ['chooseRoleSupport', 'chooseRoleSupportSub'],
    editor: ['chooseRoleEditor', 'chooseRoleEditorSub'],
  };

  function popup(roles) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'admin-modal-backdrop role-chooser';
      backdrop.innerHTML = `
        <div class="admin-modal-card role-chooser-card" role="dialog" aria-modal="true">
          <h2></h2>
          <p class="role-chooser-sub"></p>
          <div class="role-chooser-options"></div>
          <button type="button" class="btn-ghost btn-small role-chooser-cancel"></button>
        </div>`;
      backdrop.querySelector('h2').textContent = t('chooseRoleTitle');
      backdrop.querySelector('.role-chooser-sub').textContent = t('chooseRoleSub');
      const cancel = backdrop.querySelector('.role-chooser-cancel');
      cancel.textContent = t('chooseRoleCancel');
      const box = backdrop.querySelector('.role-chooser-options');
      roles.forEach(role => {
        const [title, sub] = LABELS[role] || [role, ''];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'role-chooser-option';
        b.innerHTML = '<strong></strong><span></span>';
        b.querySelector('strong').textContent = t(title);
        b.querySelector('span').textContent = sub ? t(sub) : '';
        b.addEventListener('click', () => { backdrop.remove(); resolve(role); });
        box.appendChild(b);
      });
      cancel.addEventListener('click', () => { backdrop.remove(); resolve(null); });
      document.body.appendChild(backdrop);
      box.querySelector('button').focus();
    });
  }

  // Returns { error } for the page to show, or navigates away on success.
  async function signIn(email, password) {
    const res = await fetch('/api/login-any', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || 'error' };
    if (data.redirect) { window.location.href = data.redirect; return { ok: true }; }

    const role = await popup(data.choose || []);
    if (!role) return { cancelled: true };
    const res2 = await fetch('/api/login-choose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choiceToken: data.choiceToken, role }),
    });
    const data2 = await res2.json().catch(() => ({}));
    if (!res2.ok) return { error: data2.error || 'error' };
    window.location.href = data2.redirect;
    return { ok: true };
  }

  window.MareLogin = { signIn };
})();
