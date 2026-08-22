(function () {
  // Teacher login only — signup removed. Teacher accounts are now
  // created by admin (bulk import or the single-account form in the
  // Parents & Teachers admin tab), not self-service, per Per's request.

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

  function showError(key) {
    const el = document.getElementById('form-error');
    el.textContent = window.MareI18n.t(key);
    el.hidden = false;
  }
  function clearError() {
    document.getElementById('form-error').hidden = true;
  }

  const SERVER_ERROR_MAP = {
    'Invalid email or password': 'errorInvalidCredentials',
    'Missing fields': 'errorMissingFields',
    'Account suspended': 'errorAccountSuspended',
  };

  async function handleSubmit(e) {
    e.preventDefault();
    clearError();
    const email = document.getElementById('f-email').value.trim();
    const password = document.getElementById('f-password').value;

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    try {
      const res = await fetch('/api/teacher/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(SERVER_ERROR_MAP[data.error] || 'errorGeneric');
        submitBtn.disabled = false;
        return;
      }
      window.location.href = '/teacher.html';
    } catch {
      showError('errorGeneric');
      submitBtn.disabled = false;
    }
  }

  // ── Forgot password ──
  function showForgotForm() {
    document.getElementById('auth-form').hidden = true;
    document.getElementById('forgot-form').hidden = false;
    document.getElementById('forgot-success').hidden = true;
    document.getElementById('auth-heading').textContent = window.MareI18n.t('forgotPasswordHeading');
    document.getElementById('auth-sub').hidden = true;
  }
  function showLoginForm() {
    document.getElementById('forgot-form').hidden = true;
    document.getElementById('auth-form').hidden = false;
    document.getElementById('auth-sub').hidden = false;
    document.getElementById('auth-heading').textContent = window.MareI18n.t('authHeadingLogin');
  }
  function setupForgotPassword() {
    document.getElementById('forgot-link').addEventListener('click', (e) => {
      e.preventDefault();
      showForgotForm();
    });
    document.getElementById('back-to-login-link').addEventListener('click', (e) => {
      e.preventDefault();
      showLoginForm();
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
          body: JSON.stringify({ email, role: 'teacher' }),
        });
        document.getElementById('forgot-success').hidden = false;
        document.getElementById('forgot-form').querySelector('.field').hidden = true;
        btn.hidden = true;
      } catch {
        document.getElementById('forgot-error').textContent = window.MareI18n.t('errorGeneric');
        document.getElementById('forgot-error').hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();
    setupForgotPassword();
    document.getElementById('auth-form').addEventListener('submit', handleSubmit);

    // Already signed in as a teacher? Straight to the hub. Signed in as a
    // parent on this device? Send them to the parent side rather than
    // showing a teacher form they can't use.
    const user = await checkSession();
    if (user) window.location.href = user.role === 'teacher' ? '/teacher.html' : '/';
  }

  init();
})();
