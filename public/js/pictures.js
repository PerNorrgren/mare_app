// ── pictures.js (Mare App 5) — Child mode: explore the pictures for the
// chapter being read. Full screen, touch-first (iPad), locked: the only
// way out is holding the moon for 3 seconds. The chapter follows the
// family's Book Companion (checked every 8 seconds).
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (window.MareI18n ? window.MareI18n.t(k, v) : k);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  const fixedChapter = Number(params.get('chapter')) || 0; // staff preview
  let data = null, idx = 0, audio = null;
  const found = new Set();

  async function getJson(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (r.status === 401) { location.href = '/login.html'; throw new Error('auth'); } // v71: 403 no longer bounces through login
    return r.json();
  }

  function stopSound() { if (audio) { audio.pause(); audio = null; } document.querySelectorAll('.px-spot.playing').forEach(s => s.classList.remove('playing')); }

  function closePop() { $('px-pop').hidden = true; $('px-pop-body').innerHTML = ''; stopSound(); }

  function openSpot(spot, el) {
    found.add(spot.id);
    el.classList.add('found');
    updateFound();
    stopSound();
    if ((spot.type === 'sound' || spot.type === 'voice') && spot.audio) {
      audio = new Audio(spot.audio);
      el.classList.add('playing');
      audio.onended = () => el.classList.remove('playing');
      audio.play().catch(() => el.classList.remove('playing'));
      if (spot.type === 'sound' && !spot.text && !spot.image) return; // just the sound
    }
    let html = '';
    if (spot.title) html += `<h2>${esc(spot.title)}</h2>`;
    if (spot.type === 'video') {
      if (spot.video) html += `<video src="${esc(spot.video)}" controls playsinline autoplay></video>`;
      else if (spot.embed) html += `<div class="px-embed"><iframe src="${esc(spot.embed)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe></div>`;
    }
    if (spot.image) html += `<img src="${esc(spot.image)}" alt="">`;
    if (spot.text) html += `<p>${esc(spot.text).replace(/\n/g, '<br>')}</p>`;
    if (spot.type === 'voice' && spot.audio) html += `<button type="button" class="px-again" id="px-again">🔊 ${esc(t('picturesPlayAgain'))}</button>`;
    if (!html) return;
    $('px-pop-body').innerHTML = html;
    $('px-pop').hidden = false;
    const again = $('px-again');
    if (again) again.onclick = () => { stopSound(); audio = new Audio(spot.audio); audio.play().catch(() => {}); };
  }

  function updateFound() {
    const scene = data && data.scenes[idx];
    if (!scene || !scene.spots.length) { $('px-found').hidden = true; return; }
    const n = scene.spots.filter(s => found.has(s.id)).length;
    $('px-found').hidden = false;
    $('px-found').textContent = n === scene.spots.length ? t('picturesAllFound') : t('picturesFound', { n, total: scene.spots.length });
    $('px-found').classList.toggle('all', n === scene.spots.length);
  }

  // Fit the picture inside the screen (letterbox), spots sit on top.
  function layout() {
    const img = $('px-img'), frame = $('px-frame');
    if (!img.naturalWidth) return;
    const W = window.innerWidth, H = window.innerHeight;
    const s = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    frame.style.width = Math.round(img.naturalWidth * s) + 'px';
    frame.style.height = Math.round(img.naturalHeight * s) + 'px';
  }

  function showScene(i) {
    closePop();
    idx = Math.max(0, Math.min(i, data.scenes.length - 1));
    const scene = data.scenes[idx];
    const img = $('px-img');
    img.onload = layout;
    img.src = scene.image;
    const spots = $('px-spots');
    spots.innerHTML = '';
    scene.spots.forEach((sp, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'px-spot px-' + sp.type + (found.has(sp.id) ? ' found' : '');
      b.style.left = (sp.x * 100) + '%';
      b.style.top = (sp.y * 100) + '%';
      b.style.width = (sp.r * 200) + '%'; // r = radius as a share of the picture width
      b.style.aspectRatio = '1';
      b.style.animationDelay = (n * 0.37) + 's';
      b.setAttribute('aria-label', sp.title || t('picturesSecret'));
      b.addEventListener('click', (e) => { e.stopPropagation(); openSpot(sp, b); });
      spots.appendChild(b);
    });
    $('px-prev').hidden = idx === 0;
    $('px-next').hidden = idx >= data.scenes.length - 1;
    $('px-dots').innerHTML = data.scenes.length > 1 ? data.scenes.map((_, k) => `<i class="${k === idx ? 'on' : ''}"></i>`).join('') : '';
    updateFound();
  }

  async function load() {
    const q = fixedChapter ? `?chapter=${fixedChapter}` : '';
    const lang = window.MareI18n ? window.MareI18n.locale : 'en';
    data = await getJson(`/api/pictures${q}${q ? '&' : '?'}lang=${lang}`);
    $('px-chapter').textContent = `${t('companionChapterN', { n: data.chapter })}${data.chapterTitle ? ' · ' + data.chapterTitle : ''}`;
    if (!data.scenes.length) {
      $('px-empty').hidden = false;
      $('px-empty-title').textContent = t('picturesNoneTitle');
      $('px-empty-body').textContent = t('picturesNoneBody');
      $('px-spots').innerHTML = ''; $('px-img').removeAttribute('src');
      $('px-prev').hidden = $('px-next').hidden = true; $('px-dots').innerHTML = ''; $('px-found').hidden = true;
      $('px-talk').hidden = true;
      return;
    }
    $('px-empty').hidden = true;
    $('px-talk').hidden = !data.talk;
    showScene(0);
    if (!sessionStorage.getItem('px-hinted')) {
      $('px-hint').textContent = t('picturesHint');
      $('px-hint').hidden = false;
      setTimeout(() => { $('px-hint').hidden = true; }, 5000);
      try { sessionStorage.setItem('px-hinted', '1'); } catch { /* private mode */ }
    }
  }

  // Follow the grown-up's chapter.
  async function poll() {
    if (fixedChapter || !data || !$('px-talkbox').hidden) return;
    try {
      const c = await getJson('/api/pictures/chapter');
      if (c.chapter !== data.chapter) { found.clear(); await load(); }
    } catch { /* offline for a moment: try again next time */ }
  }

  // Mare App 5 — Talk to Mare about the picture on screen.
  function openTalk() {
    const scene = data && data.scenes[idx];
    if (!scene) return;
    closePop();
    const lang = window.MareI18n ? window.MareI18n.locale : 'en';
    $('px-talk-frame').src = `/talk.html?embed=1&scene=${encodeURIComponent(scene.id)}&lang=${lang}`;
    $('px-talkbox').hidden = false;
  }
  function closeTalk() {
    $('px-talkbox').hidden = true;
    $('px-talk-frame').src = 'about:blank';
  }
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data && e.data.mare === 'talk-close') closeTalk();
  });

  // Grown-ups: hold the moon 3 seconds to leave.
  // Mare App 6 (v73) — bigger, labelled "Exit"; the label says "Keep
  // holding…" while the ring fills. The finger is captured so a small
  // wobble doesn't cancel it, and the long-press menu (iPad) is blocked.
  // The top bar now sits above "Tap to start", which used to cover it.
  function setupExit() {
    const btn = $('px-exit'), ring = $('px-exit-ring'), label = $('px-exit-label');
    let timer = null;
    const showHint = () => { $('px-hint').textContent = t('picturesExitHint'); $('px-hint').hidden = false; clearTimeout(showHint.t); showHint.t = setTimeout(() => { $('px-hint').hidden = true; }, 2500); };
    const start = (e) => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
      clearTimeout(timer);
      ring.classList.add('filling');
      label.textContent = t('picturesExitHolding');
      timer = setTimeout(() => {
        timer = null;
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        location.href = fixedChapter ? '/admin.html' : '/companion.html';
      }, 3000);
    };
    const cancel = () => {
      if (!timer) return;
      clearTimeout(timer); timer = null;
      ring.classList.remove('filling');
      label.textContent = t('picturesExit');
      showHint(); // let go too early: say how it works
    };
    btn.addEventListener('pointerdown', start);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, cancel));
    btn.addEventListener('contextmenu', e => e.preventDefault());
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showHint(); });
  }

  (async function init() {
    if (window.MareI18n) await window.MareI18n.ready;
    $('px-prev').onclick = () => showScene(idx - 1);
    $('px-next').onclick = () => showScene(idx + 1);
    $('px-pop-close').onclick = closePop;
    $('px-talk-label').textContent = t('picturesTalk');
    $('px-talk').onclick = openTalk;
    $('px-talk-close').onclick = closeTalk;
    $('px-pop').addEventListener('click', (e) => { if (e.target.id === 'px-pop') closePop(); });
    // swipe between pictures
    let sx = null;
    $('px-stage').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    $('px-stage').addEventListener('touchend', (e) => {
      if (sx == null || !data) return;
      const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 60) showScene(idx + (dx < 0 ? 1 : -1));
    });
    window.addEventListener('resize', layout);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    setupExit();
    // First tap: go full screen where the browser allows it (not needed
    // when opened from the Home Screen, which is already full screen).
    const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    if (!standalone && document.documentElement.requestFullscreen) {
      $('px-start-btn').textContent = t('picturesStart');
      $('px-start').hidden = false;
      $('px-start-btn').onclick = () => { document.documentElement.requestFullscreen().catch(() => {}); $('px-start').hidden = true; };
    }
    try { await load(); } catch { return; }
    setInterval(poll, 8000);
  })();
})();
