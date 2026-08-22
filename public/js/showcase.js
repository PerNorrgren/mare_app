(function () {
  let showcaseData = null;

  function setupLangSwitch() {
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => {
        window.MareI18n.switchLocale(lang);
        render(); // re-render dynamic content (welcome message, tile labels) in the new locale
      });
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

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

  function render() {
    if (!showcaseData) return;
    const locale = window.MareI18n.locale;
    const welcome = (locale === 'nl' && showcaseData.welcomeMessageNl) ? showcaseData.welcomeMessageNl : showcaseData.welcomeMessageEn;
    document.getElementById('showcase-welcome').textContent = welcome || window.MareI18n.t('heroSub');
    renderTiles();
    renderVideo();
  }

  async function loadShowcase() {
    try {
      const res = await fetch('/api/showcase');
      showcaseData = await res.json();
      render();
    } catch {
      // The page still works without this — hero title and the "browse
      // all stories" link don't depend on it, so a failed fetch here
      // shouldn't leave the visitor with a broken page, just a plainer one.
      document.getElementById('showcase-welcome').textContent = window.MareI18n.t('heroSub');
    }
  }

  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();
    setupTalkDemoModal();
    await loadShowcase();
  }

  init();
})();
