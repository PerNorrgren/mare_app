(function () {
  // Teacher-only login/signup, its own page (separate from the parent
  // login at login.html — Per asked for these to be split rather than a
  // shared page with a role switch).
  const state = { mode: 'login' };

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

  function updateHeading() {
    const t = window.MareI18n.t;
    document.getElementById('auth-heading').textContent =
      t(state.mode === 'login' ? 'authHeadingLogin' : 'authHeadingSignup');
    document.getElementById('auth-sub').textContent =
      t(state.mode === 'login' ? 'subTeacherLogin' : 'subTeacherSignup');
  }

  function applyMode() {
    const isSignup = state.mode === 'signup';
    document.querySelectorAll('.signup-only').forEach(el => { el.hidden = !isSignup; });
    document.getElementById('f-name').required = isSignup;
    document.getElementById('f-confirm').required = isSignup;
    document.getElementById('f-password').autocomplete = isSignup ? 'new-password' : 'current-password';
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.textContent = window.MareI18n.t(isSignup ? 'submitSignup' : 'submitLogin');
    updateHeading();
  }

  function setupModeSwitch() {
    document.querySelectorAll('.mode-switch .mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.mode = btn.getAttribute('data-mode');
        document.querySelectorAll('.mode-switch .mode-btn').forEach(b =>
          b.classList.toggle('active', b === btn));
        applyMode();
      });
    });
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
    'Email already registered': 'errorEmailTaken',
    'Password must be at least 8 characters': 'errorPasswordTooShort',
    'Missing fields': 'errorMissingFields',
  };

  async function handleSubmit(e) {
    e.preventDefault();
    clearError();

    const email = document.getElementById('f-email').value.trim();
    const password = document.getElementById('f-password').value;
    const name = document.getElementById('f-name').value.trim();
    const school = document.getElementById('f-school').value.trim();
    const confirm = document.getElementById('f-confirm').value;

    if (state.mode === 'signup' && password !== confirm) {
      return showError('errorPasswordMismatch');
    }

    const endpoint = `/api/teacher/${state.mode}`;
    const body = state.mode === 'signup' ? { email, password, name, school } : { email, password };

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();
    setupModeSwitch();

    // Deep link support — /teacher-login.html?mode=signup (used by the
    // "Create a teacher account" CTA on teacher.html's public view).
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'signup') {
      state.mode = 'signup';
      document.querySelectorAll('.mode-switch .mode-btn').forEach(b =>
        b.classList.toggle('active', b.getAttribute('data-mode') === 'signup'));
    }
    applyMode();
    document.getElementById('auth-form').addEventListener('submit', handleSubmit);

    // Already signed in as a teacher? Straight to the hub. Signed in as a
    // parent on this device? Send them to the parent side rather than
    // showing a teacher form they can't use.
    const user = await checkSession();
    if (user) window.location.href = user.role === 'teacher' ? '/teacher.html' : '/';
  }

  init();
})();
