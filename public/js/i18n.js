// ── i18n.js ──
// Small, dependency-free translation loader. Detection order: ?lang= URL
// param (explicit choice always wins) → saved mare_locale cookie →
// browser language → default 'en'. Exposes window.MareI18n so app.js
// (and every future page) can read the resolved locale and translate
// strings that aren't simple static text (e.g. "Hi, {name}").
//
// Adding a language: drop public/i18n/<locale>.json next to these two,
// add the locale code to SUPPORTED in both this file and server.js's
// SUPPORTED_LOCALES, and add the corresponding book row(s) in the DB.
// Nothing else in this file needs to change.

window.MareI18n = (function () {
  const SUPPORTED = ['en', 'nl'];
  const DEFAULT = 'en';

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }
  function setCookie(name, value) {
    const oneYear = 365 * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${oneYear}; path=/; samesite=lax`;
  }

  function detectLocale() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('lang');
    if (fromQuery && SUPPORTED.includes(fromQuery)) return fromQuery;
    const fromCookie = getCookie('mare_locale');
    if (fromCookie && SUPPORTED.includes(fromCookie)) return fromCookie;
    const browser = (navigator.language || '').slice(0, 2);
    if (SUPPORTED.includes(browser)) return browser;
    return DEFAULT;
  }

  const locale = detectLocale();
  setCookie('mare_locale', locale);
  document.documentElement.lang = locale;

  let dict = {};

  async function load() {
    try {
      const res = await fetch(`/i18n/${locale}.json`);
      dict = await res.json();
    } catch {
      dict = {};
    }
    applyToDom();
  }

  function t(key, vars) {
    let str = dict[key] || key;
    if (vars) {
      Object.keys(vars).forEach(k => { str = str.replace(`{${k}}`, vars[k]); });
    }
    return str;
  }

  function applyToDom() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
  }

  function switchLocale(newLocale) {
    if (!SUPPORTED.includes(newLocale)) return;
    setCookie('mare_locale', newLocale);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', newLocale);
    window.location.href = url.toString();
  }

  const ready = load();

  return { locale, t, ready, switchLocale, SUPPORTED };
})();
