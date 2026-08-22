(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const role = params.get('role') || 'parent';

  // The three login pages have different URLs — send someone back to
  // the right one once they're done, rather than always defaulting to
  // the parent login page regardless of which account this reset was for.
  const LOGIN_URL_BY_ROLE = {
    parent: '/login.html',
    teacher: '/teacher-login.html',
    admin: '/admin.html',
  };

  function setupLangSwitch() {
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });
  }

  function showError(key) {
    const el = document.getElementById('form-error');
    el.textContent = window.MareI18n.t(key);
    el.hidden = false;
  }

  const SERVER_ERROR_MAP = {
    'This reset link is invalid or has expired': 'resetPasswordInvalid',
    'Password must be at least 8 characters': 'errorPasswordTooShort',
    'Missing fields': 'errorMissingFields',
  };

  async function handleSubmit(e) {
    e.preventDefault();
    document.getElementById('form-error').hidden = true;

    const password = document.getElementById('f-password').value;
    const confirm = document.getElementById('f-confirm').value;
    if (password !== confirm) return showError('errorPasswordMismatch');

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(SERVER_ERROR_MAP[data.error] || 'errorGeneric');
        submitBtn.disabled = false;
        return;
      }
      document.getElementById('reset-form').hidden = true;
      document.getElementById('reset-success').hidden = false;
    } catch {
      showError('errorGeneric');
      submitBtn.disabled = false;
    }
  }

  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();

    const loginUrl = LOGIN_URL_BY_ROLE[role] || '/login.html';
    document.getElementById('success-login-link').href = loginUrl;
    document.getElementById('invalid-login-link').href = loginUrl;

    if (!token) {
      document.getElementById('reset-form').hidden = true;
      document.getElementById('reset-invalid').hidden = false;
      return;
    }
    document.getElementById('reset-form').addEventListener('submit', handleSubmit);
  }

  init();
})();
