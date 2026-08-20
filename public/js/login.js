(function () {
  const state = { role: 'parent', mode: 'login' };

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
    const subKey = `sub${state.role === 'parent' ? 'Parent' : 'Teacher'}${state.mode === 'login' ? 'Login' : 'Signup'}`;
    document.getElementById('auth-sub').textContent = t(subKey);
  }

  function applyMode() {
    const isSignup = state.mode === 'signup';
    document.querySelectorAll('.signup-only').forEach(el => { el.hidden = !isSignup; });
    document.querySelectorAll('.teacher-only').forEach(el => {
      el.hidden = !isSignup || state.role !== 'teacher';
    });
    document.getElementById('f-name').required = isSignup;
    document.getElementById('f-confirm').required = isSignup;
    document.getElementById('f-password').autocomplete = isSignup ? 'new-password' : 'current-password';
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.textContent = window.MareI18n.t(isSignup ? 'submitSignup' : 'submitLogin');
    updateHeading();
  }

  function setupRoleSwitch() {
    document.querySelectorAll('#role-switch .role-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.role = btn.getAttribute('data-role');
        document.querySelectorAll('#role-switch .role-btn').forEach(b =>
          b.classList.toggle('active', b === btn));
        applyMode();
      });
    });
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

  // Server error strings -> translation keys, so a person on the Dutch
  // page never sees a raw English error message.
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

    const endpoint = `/api/${state.role}/${state.mode}`;
    const body = state.mode === 'signup'
      ? (state.role === 'teacher' ? { email, password, name, school } : { email, password, name })
      : { email, password };

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
      window.location.href = '/';
    } catch {
      showError('errorGeneric');
      submitBtn.disabled = false;
    }
  }

  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();
    setupRoleSwitch();
    setupModeSwitch();
    applyMode();
    document.getElementById('auth-form').addEventListener('submit', handleSubmit);

    // Already signed in? No reason to show a login form.
    const user = await checkSession();
    if (user) window.location.href = '/';
  }

  init();
})();
