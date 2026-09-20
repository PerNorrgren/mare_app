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
    document.getElementById('register-form').hidden = true;
    document.getElementById('forgot-form').hidden = false;
    document.getElementById('forgot-success').hidden = true;
    document.getElementById('auth-heading').textContent = window.MareI18n.t('forgotPasswordHeading');
    document.getElementById('auth-sub').hidden = true;
  }
  function showLoginForm() {
    document.getElementById('forgot-form').hidden = true;
    document.getElementById('register-form').hidden = true;
    document.getElementById('auth-form').hidden = false;
    document.getElementById('auth-sub').hidden = false;
    document.getElementById('auth-heading').textContent = window.MareI18n.t('authHeadingLogin');
  }
  function showRegisterForm() {
    document.getElementById('auth-form').hidden = true;
    document.getElementById('forgot-form').hidden = true;
    document.getElementById('register-form').hidden = false;
    document.getElementById('register-success').hidden = true;
    document.getElementById('auth-heading').textContent = window.MareI18n.t('teacherRegisterHeading');
    document.getElementById('auth-sub').hidden = true;
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

  // ── Self-serve signup request — creates a request, not an account;
  // admin still reviews and creates the real login by hand (see the
  // server-side comment on db.createTeacherSignupRequest). ──
  const REGISTER_ERROR_MAP = {
    'Missing fields': 'errorMissingFields',
    "That doesn't look like a valid email address": 'errorInvalidEmail',
  };
  function setupRegister() {
    document.getElementById('register-link').addEventListener('click', (e) => {
      e.preventDefault();
      showRegisterForm();
    });
    document.getElementById('back-to-login-from-register-link').addEventListener('click', (e) => {
      e.preventDefault();
      showLoginForm();
    });
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      document.getElementById('register-error').hidden = true;
      const firstName = document.getElementById('r-first-name').value.trim();
      const lastName = document.getElementById('r-last-name').value.trim();
      const email = document.getElementById('r-email').value.trim();
      const school = document.getElementById('r-school').value.trim();
      const btn = document.getElementById('register-submit-btn');
      btn.disabled = true;
      try {
        const res = await fetch('/api/teacher/signup-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName, lastName, email, school }),
        });
        const data = await res.json();
        if (!res.ok) {
          document.getElementById('register-error').textContent = window.MareI18n.t(REGISTER_ERROR_MAP[data.error] || 'errorGeneric');
          document.getElementById('register-error').hidden = false;
          btn.disabled = false;
          return;
        }
        document.getElementById('register-success').hidden = false;
        document.getElementById('register-form').querySelectorAll('.field').forEach(f => { f.hidden = true; });
        btn.hidden = true;
      } catch {
        document.getElementById('register-error').textContent = window.MareI18n.t('errorGeneric');
        document.getElementById('register-error').hidden = false;
        btn.disabled = false;
      }
    });
  }

  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();
    setupForgotPassword();
    setupRegister();
    document.getElementById('auth-form').addEventListener('submit', handleSubmit);

    // Already signed in as a teacher? Straight to the hub. Signed in as a
    // parent on this device? Send them to the parent side rather than
    // showing a teacher form they can't use.
    const user = await checkSession();
    if (user) window.location.href = user.role === 'teacher' ? '/teacher.html' : '/';
  }

  init();
})();
