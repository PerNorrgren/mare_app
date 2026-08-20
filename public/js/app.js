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

  function bookCoverEl(book) {
    const cover = document.createElement('div');
    if (book.splash_icon_key) {
      cover.className = 'book-cover';
      const img = document.createElement('img');
      img.alt = '';
      img.src = `/api/playback-url?key=${encodeURIComponent(book.splash_icon_key)}`;
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

  function renderBooks(books) {
    grid.innerHTML = '';
    books.forEach(book => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'book-card';
      card.appendChild(bookCoverEl(book));
      const ribbon = document.createElement('div');
      ribbon.className = 'book-ribbon';
      ribbon.textContent = book.title;
      card.appendChild(ribbon);
      card.addEventListener('click', () => openBook(book));
      grid.appendChild(card);
    });

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
    lockedLabel.textContent = 'More stories soon';
    locked.appendChild(lockedLabel);
    grid.appendChild(locked);
  }

  async function openBook(book) {
    const user = await checkSession();
    if (!user) return showLoginPrompt();
    window.location.href = `/reader.html?book=${encodeURIComponent(book.slug)}`;
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

  async function init() {
    try {
      const res = await fetch('/api/splash');
      const data = await res.json();
      renderBooks(data.books || []);
    } catch {
      grid.innerHTML = '<p>The wood is quiet right now — try refreshing in a moment.</p>';
    }

    const user = await checkSession();
    if (user) {
      const actions = document.getElementById('topbar-actions');
      actions.innerHTML = '';
      const link = document.createElement('a');
      link.href = user.role === 'teacher' ? '/teacher.html' : '/account.html';
      link.className = 'btn-ghost';
      link.textContent = user.name ? `Hi, ${user.name}` : 'Account';
      actions.appendChild(link);
    }
  }

  init();
})();
