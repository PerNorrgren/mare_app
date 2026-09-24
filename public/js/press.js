// press.js — press release page (Mare App 4). Both language versions
// are in press.html; show the one matching the site language. The
// EN/NL buttons reload the page in the other language, same as every
// other page, so this only ever has to pick once.
(function () {
  async function init() {
    await window.MareI18n.ready;
    const locale = window.MareI18n.locale === 'nl' ? 'nl' : 'en';
    document.querySelectorAll('[data-press-lang]').forEach(a => {
      a.hidden = a.getAttribute('data-press-lang') !== locale;
    });
    document.documentElement.lang = locale;
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });
  }
  init();
})();
