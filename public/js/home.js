// ── home.js — the one home page (Mare App 4) ──
// Replaces the old split between the public showcase (index.html +
// showcase.js) and Story Corner (library.html + app.js). One address,
// two states:
//   signed out -> the whole sales journey (welcome, benefits, video,
//                 sample tiles, "try it free"), then the real shelf and
//                 tiles in preview mode, then the invitation to join;
//   signed in  -> just the app: shelf and tiles, full access.
// The preview limits themselves are enforced where they always were
// (reader, Club Mare, Talk to Mare, server-side) — this page only
// decides what to show around them.
(function () {
  const grid = document.getElementById('books-grid');
  let showcaseData = null;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

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
  }

  function openBook(book) {
    // Signed out, the reader itself gates how far a visitor can read.
    window.location.href = `/reader.html?book=${encodeURIComponent(book.slug)}&lang=${window.MareI18n.locale}`;
  }

  async function loadBooks() {
    try {
      const res = await fetch(`/api/splash?lang=${window.MareI18n.locale}`);
      const data = await res.json();
      await renderBooks(data.books || []);
    } catch {
      grid.innerHTML = `<p>${escapeHtml(window.MareI18n.t('loadError'))}</p>`;
    }
  }

  function setupAppTiles() {
    // Each destination handles its own signed-out preview, so none of
    // these need a login check here.
    document.getElementById('tile-talk').addEventListener('click', () => { window.location.href = '/talk.html'; });
    document.getElementById('tile-club').addEventListener('click', () => { window.location.href = '/club-mare.html'; });
    document.getElementById('tile-shop').addEventListener('click', () => { window.location.href = '/merchandise.html'; });
  }

  // ── Sales journey (signed-out only) — from the old showcase page ──
  const TILE_ICON_FALLBACK = { read: '📖', listen: '🎧', view: '🎬', talk: '💬', buy: '🛍️', custom: '✨' };

  function tileTargetHref(tile) {
    switch (tile.link_type) {
      case 'book': return `/reader.html?book=${encodeURIComponent(tile.link_value || '')}`;
      case 'external': return tile.link_value || '#';
      case 'register': return '/login.html?mode=signup';
      case 'login': return '/login.html';
      default: return null; // audio / video / talk_demo are handled by click behavior, not a plain link
    }
  }

  function renderTiles() {
    const container = document.getElementById('showcase-tiles');
    const tiles = (showcaseData && showcaseData.tiles) || [];
    if (!tiles.length) {
      container.innerHTML = '';
      return;
    }
    const locale = window.MareI18n.locale;
    container.innerHTML = tiles.map(tile => {
      const label = (locale === 'nl' && tile.label_nl) ? tile.label_nl : tile.label_en;
      const icon = tile.icon || TILE_ICON_FALLBACK[tile.tile_type] || '✨';
      const href = tileTargetHref(tile);
      const tag = href ? 'a' : 'button';
      const hrefAttr = href ? `href="${escapeHtml(href)}"` : `type="button"`;
      return `<${tag} class="showcase-tile" ${hrefAttr} data-tile-id="${escapeHtml(tile.id)}" data-link-type="${escapeHtml(tile.link_type)}">
        <span class="showcase-tile-icon" aria-hidden="true">${escapeHtml(icon)}</span>
        <span class="showcase-tile-label">${escapeHtml(label)}</span>
      </${tag}>`;
    }).join('');

    container.querySelectorAll('[data-link-type="talk_demo"]').forEach(el => {
      el.addEventListener('click', (e) => { e.preventDefault(); openTalkDemo(); });
    });
    container.querySelectorAll('[data-link-type="video"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('showcase-video-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    container.querySelectorAll('[data-link-type="audio"]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        const tile = tiles.find(t => t.id === el.getAttribute('data-tile-id'));
        if (!tile || !tile.link_value) return;
        try {
          const res = await fetch(`/api/playback-url?key=${encodeURIComponent(tile.link_value)}`);
          const data = await res.json();
          if (data.url) new Audio(data.url).play();
        } catch { /* sample audio not available yet — silently no-op rather than an error popup on a marketing page */ }
      });
    });
  }

  function openTalkDemo() {
    const phrases = (showcaseData && showcaseData.talkPhrases) || [];
    const locale = window.MareI18n.locale;
    const phraseObj = phrases.length ? phrases[Math.floor(Math.random() * phrases.length)] : null;
    const text = phraseObj
      ? ((locale === 'nl' && phraseObj.phrase_nl) ? phraseObj.phrase_nl : phraseObj.phrase_en)
      : window.MareI18n.t('showcaseTalkDemoFallback');
    document.getElementById('talk-demo-phrase').textContent = text;
    document.getElementById('talk-demo-modal').hidden = false;
  }

  function setupTalkDemoModal() {
    document.getElementById('talk-demo-close-btn').addEventListener('click', () => {
      document.getElementById('talk-demo-modal').hidden = true;
    });
  }

  async function renderVideo() {
    const placeholder = document.getElementById('showcase-video-placeholder');
    const player = document.getElementById('showcase-video-player');
    if (showcaseData && showcaseData.videoStatus === 'ready' && showcaseData.videoUrl) {
      placeholder.hidden = true;
      player.hidden = false;
      player.src = showcaseData.videoUrl;
    } else {
      placeholder.hidden = false;
      player.hidden = true;
    }
  }

  async function loadSales() {
    const locale = window.MareI18n.locale;
    try {
      const res = await fetch('/api/showcase');
      showcaseData = await res.json();
    } catch {
      showcaseData = null; // page still works — just the plainer welcome line, no tiles/video
    }
    const welcome = showcaseData
      ? ((locale === 'nl' && showcaseData.welcomeMessageNl) ? showcaseData.welcomeMessageNl : showcaseData.welcomeMessageEn)
      : null;
    document.getElementById('home-hero-sub').textContent = welcome || window.MareI18n.t('showcaseHeroSub');
    if (showcaseData) {
      renderTiles();
      renderVideo();
    }
    document.getElementById('sales-intro').hidden = false;
    document.getElementById('sales-outro').hidden = false;
  }

  // ── From Mare's Shop — featured products (Mare App 4) ──
  async function loadFeaturedProducts() {
    const t = window.MareI18n.t;
    let products = [];
    try {
      const res = await fetch('/api/products');
      products = ((await res.json()).products || []).filter(p => p.featured).slice(0, 3);
    } catch { return; }
    if (!products.length) return;
    const grid = document.getElementById('home-shop-grid');
    const locale = window.MareI18n.locale === 'nl' ? 'nl-NL' : 'en-GB';
    for (const p of products) {
      const card = document.createElement('a');
      card.className = 'home-shop-card';
      card.href = '/merchandise.html';
      const key = p.image_key || (p.image_keys && p.image_keys[0]);
      if (key) {
        try {
          const r = await fetch(`/api/playback-url?key=${encodeURIComponent(key)}`);
          const { url } = await r.json();
          if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = (window.MareI18n.locale === 'nl' && p.name_nl) ? p.name_nl : p.name;
            img.loading = 'lazy';
            card.appendChild(img);
          }
        } catch { /* card still shows without the photo */ }
      }
      const body = document.createElement('div');
      body.className = 'home-shop-body';
      const h = document.createElement('h3');
      const nl = window.MareI18n.locale === 'nl';
      h.textContent = (nl && p.name_nl) ? p.name_nl : p.name;
      body.appendChild(h);
      const desc = (nl && p.description_nl) ? p.description_nl : p.description;
      if (desc) {
        const d = document.createElement('p');
        d.textContent = desc;
        body.appendChild(d);
      }
      const price = document.createElement('span');
      price.className = 'home-shop-price';
      try {
        price.textContent = new Intl.NumberFormat(locale, { style: 'currency', currency: (p.currency || 'gbp').toUpperCase() }).format(p.price_cents / 100);
      } catch { price.textContent = (p.price_cents / 100).toFixed(2); }
      body.appendChild(price);
      const cta = document.createElement('span');
      cta.className = 'btn-primary home-shop-btn';
      cta.textContent = t('homeShopButton');
      body.appendChild(cta);
      card.appendChild(body);
      grid.appendChild(card);
    }
    grid.classList.toggle('home-shop-single', products.length === 1);
    document.getElementById('home-shop').hidden = false;
  }

  // ── Signed-in header ──
  function applySignedIn(user) {
    document.getElementById('login-link').hidden = true;
    document.getElementById('register-link').hidden = true;
    const link = document.getElementById('account-link');
    link.hidden = false;
    link.href = user.role === 'teacher' ? '/teacher.html'
      : (user.role === 'admin' || user.role === 'support') ? '/admin.html'
      : '/account.html';
    link.removeAttribute('data-i18n');
    link.textContent = user.name ? window.MareI18n.t('hiName', { name: user.name }) : window.MareI18n.t('parentNavLabel');
    const signOutBtn = document.getElementById('topbar-signout-btn');
    signOutBtn.hidden = false;
    signOutBtn.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });
  }

  function setupLangSwitch() {
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang)); // reloads the page in the new language
    });
  }

  // Short glyph per platform for the circular footer icons — avoids
  // needing exact brand logo SVGs for every platform while still
  // reading as intentional rather than a placeholder.
  const SOCIAL_GLYPH = { instagram: 'IG', facebook: 'FB', tiktok: 'TT', youtube: '▶', linkedin: 'in', threads: '@', x: 'X', other: '↗' };

  async function loadSocialFooter() {
    const footer = document.getElementById('social-footer');
    if (!footer) return;
    try {
      const res = await fetch('/api/social-links');
      const data = await res.json();
      const links = data.links || [];
      if (!links.length) { footer.hidden = true; return; }
      footer.innerHTML = '';
      links.forEach(l => {
        const a = document.createElement('a');
        a.href = l.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.setAttribute('aria-label', l.label || l.platform);
        a.textContent = SOCIAL_GLYPH[l.platform] || l.platform.slice(0, 2).toUpperCase();
        footer.appendChild(a);
      });
      footer.hidden = false;
    } catch {
      footer.hidden = true;
    }
  }

  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();
    setupAppTiles();
    setupTalkDemoModal();
    loadSocialFooter();
    loadFeaturedProducts();

    const [user] = await Promise.all([checkSession(), loadBooks()]);
    if (user) {
      applySignedIn(user);
    } else {
      await loadSales();
    }
  }

  init();
})();
