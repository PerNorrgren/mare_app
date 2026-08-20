(function () {
  const grid = document.getElementById('books-grid');

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

  // Cover art: prefer a real uploaded image (splash_icon_key, via R2),
  // then a bundled static cover shipped with the app for books we
  // already have finished art for, then fall back to a generated
  // typographic cover so a brand-new book never looks broken. Bundled
  // covers are keyed by group_slug, not the locale-specific slug —
  // 'mare' covers both mare/mare-nl until Dutch cover art exists too.
  const BUNDLED_COVERS = { mare: '/images/mare-front-cover.jpg' };

  async function bookCoverEl(book) {
    const cover = document.createElement('div');
    const bundled = BUNDLED_COVERS[book.group_slug || book.slug];
    if (book.splash_icon_key || bundled) {
      cover.className = 'book-cover';
      const img = document.createElement('img');
      img.alt = '';
      if (book.splash_icon_key) {
        // /api/playback-url returns { url }, not the image itself —
        // resolve it first rather than pointing img.src straight at the
        // JSON endpoint.
        try {
          const res = await fetch(`/api/playback-url?key=${encodeURIComponent(book.splash_icon_key)}`);
          const data = await res.json();
          img.src = data.url;
        } catch {
          img.src = bundled || '';
        }
      } else {
        img.src = bundled;
      }
      cover.appendChild(img);
    } else {
      // No artwork uploaded yet — a generated typographic cover so this
      // still looks intentional rather than broken, and so new books
      // added before their art is ready don't need special-casing.
      cover.className = 'book-cover generated';
      const title = document.createElement('span');
      title.className = 'gen-title';
      title.textContent = book.title;
      cover.appendChild(title);
    }
    return cover;
  }

  async function renderBooks(books) {
    grid.innerHTML = '';
    for (const book of books) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'book-card';
      card.appendChild(await bookCoverEl(book));
      const ribbon = document.createElement('div');
      ribbon.className = 'book-ribbon';
      ribbon.textContent = book.title;
      card.appendChild(ribbon);
      card.addEventListener('click', () => openBook(book));
      grid.appendChild(card);
    }

    // "More stories coming soon" — a locked slot so the shelf reads as
    // ongoing rather than finished, matching "more to come" from the brief.
    const locked = document.createElement('div');
    locked.className = 'book-card locked';
    const lockedCover = document.createElement('div');
    lockedCover.className = 'book-cover';
    lockedCover.textContent = '✨';
    lockedCover.style.fontSize = '1.8rem';
    locked.appendChild(lockedCover);
    const lockedLabel = document.createElement('div');
    lockedLabel.className = 'book-ribbon';
    lockedLabel.textContent = window.MareI18n.t('moreStoriesSoon');
    locked.appendChild(lockedLabel);
    grid.appendChild(locked);
  }

  async function openBook(book) {
    const user = await checkSession();
    if (!user) return showLoginPrompt();
    // Carry the current locale through to the reader explicitly — the
    // reader will also have its own book/chapter/scene rows scoped to
    // this exact locale-specific book id, so this isn't just cosmetic.
    window.location.href = `/reader.html?book=${encodeURIComponent(book.slug)}&lang=${window.MareI18n.locale}`;
  }

  function showLoginPrompt() {
    document.getElementById('login-prompt').hidden = false;
  }

  document.getElementById('close-prompt').addEventListener('click', () => {
    document.getElementById('login-prompt').hidden = true;
  });

  document.getElementById('tile-club').addEventListener('click', async () => {
    const user = await checkSession();
    if (!user) return showLoginPrompt();
    window.location.href = '/club-mare.html';
  });

  document.getElementById('tile-shop').addEventListener('click', () => {
    // Merchandise browsing itself doesn't need login — only checkout does.
    window.location.href = '/merchandise.html';
  });

  function setupLangSwitch() {
    const buttons = document.querySelectorAll('#lang-switch .lang-btn');
    buttons.forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });
  }

  async function init() {
    await window.MareI18n.ready; // i18n.js applies data-i18n text itself; wait so t() below is safe too
    setupLangSwitch();

    try {
      const res = await fetch(`/api/splash?lang=${window.MareI18n.locale}`);
      const data = await res.json();
      await renderBooks(data.books || []);
    } catch {
      grid.innerHTML = `<p>${window.MareI18n.t('loadError')}</p>`;
    }

    const user = await checkSession();
    if (user) {
      const link = document.getElementById('account-link');
      link.href = user.role === 'teacher' ? '/teacher.html' : '/account.html';
      link.removeAttribute('data-i18n');
      link.textContent = user.name ? window.MareI18n.t('hiName', { name: user.name }) : 'Account';
    }
  }

  init();
})();
