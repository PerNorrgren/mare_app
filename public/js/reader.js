(function () {
  // ── reader.js — Mare's illustrated book reader ──
  // Applies the hard-won lessons from per_bot's own EPUB/PPTX reader
  // work rather than re-deriving them: distance-threshold swipe
  // detection (a tap under ~40px of movement is never treated as a
  // swipe, which is also what lets hotspot taps and page-swipes coexist
  // with zero extra event-propagation handling), a JS-computed viewport
  // height rather than raw vh (iOS Safari's vh/dvh handling isn't
  // reliable below 15.4), and a delayed-retry pattern after resize/
  // orientationchange rather than trusting the first measurement taken.
  //
  // One genuine simplification versus epub.js's problem: hotspots use
  // normalized 0-1 coordinates from the DB, so they never need
  // recalculating on resize the way pixel-laid-out text pagination did
  // — the browser's own percentage positioning handles that for free.

  const params = new URLSearchParams(window.location.search);
  const bookSlug = params.get('book');
  const urlLang = params.get('lang');

  let currentUser = null;
  let bookData = null;      // { book, chapters: [{ ...chapter, scenes: [...] }] }
  let flatScenes = [];      // [{ chapterId, chapterTitle, sceneId, scene }]
  let currentIndex = -1;
  let sceneDetail = null;   // { sentences, hotspots, audioCues } for the current scene

  let narrationAudio = null;
  let musicAudio = null;
  let sfxTimers = [];
  let syncRAF = null;

  let textVisible = localStorage.getItem('reader_text_visible') === '1';
  let musicMuted = localStorage.getItem('reader_music_muted') === '1';

  const urlCache = new Map(); // R2 key -> resolved playback URL, avoids re-resolving the same asset repeatedly

  const els = {};
  function cacheEls() {
    ['reader-shell', 'reader-loading', 'back-btn', 'toc-btn', 'reader-book-title',
     'reader-stage', 'scene-image', 'hotspot-layer', 'text-overlay', 'text-line',
     'edge-prev', 'edge-next', 'prev-btn', 'next-btn', 'play-btn',
     'text-toggle-btn', 'music-toggle-btn', 'toc-panel', 'toc-close-btn', 'toc-list',
     'hotspot-modal', 'hotspot-modal-image', 'hotspot-modal-text', 'hotspot-modal-close',
     'resume-prompt', 'resume-restart-btn', 'resume-continue-btn',
    ].forEach(id => { els[id] = document.getElementById(id); });
  }

  // ── Viewport height (iOS Safari-safe) ──
  function setViewportHeight() {
    document.documentElement.style.setProperty('--vh-px', window.innerHeight + 'px');
  }
  function setViewportHeightDelayed() {
    [50, 150, 300].forEach(delay => setTimeout(setViewportHeight, delay));
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

  async function resolveUrl(key) {
    if (!key) return null;
    if (urlCache.has(key)) return urlCache.get(key);
    try {
      const res = await fetch(`/api/playback-url?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      urlCache.set(key, data.url);
      return data.url;
    } catch {
      return null;
    }
  }

  // ── Book loading ──
  async function loadBook() {
    const res = await fetch(`/api/books/${encodeURIComponent(bookSlug)}`);
    if (!res.ok) { window.location.href = '/'; return; }
    bookData = await res.json();
    els['reader-book-title'].textContent = bookData.book.title;

    flatScenes = [];
    bookData.chapters.forEach(ch => {
      ch.scenes.forEach(scene => {
        flatScenes.push({ chapterId: ch.id, chapterTitle: ch.title, sceneId: scene.id, scene });
      });
    });

    renderToc();
  }

  function renderToc() {
    els['toc-list'].innerHTML = '';
    const seenChapters = new Set();
    bookData.chapters.forEach(ch => {
      if (seenChapters.has(ch.id)) return;
      seenChapters.add(ch.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'reader-toc-item';
      btn.textContent = ch.title;
      btn.dataset.chapterId = ch.id;
      btn.addEventListener('click', () => {
        const idx = flatScenes.findIndex(f => f.chapterId === ch.id);
        if (idx !== -1) goToScene(idx);
        closeToc();
      });
      els['toc-list'].appendChild(btn);
    });
  }
  function updateTocHighlight() {
    const currentChapterId = flatScenes[currentIndex]?.chapterId;
    els['toc-list'].querySelectorAll('.reader-toc-item').forEach(btn => {
      btn.classList.toggle('current', btn.dataset.chapterId === currentChapterId);
    });
  }

  // ── Progress ──
  async function checkResumeProgress() {
    if (!currentUser || currentUser.role !== 'parent') return false;
    try {
      const res = await fetch(`/api/reading-progress/${bookData.book.id}`);
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.progress) return false;
      const idx = flatScenes.findIndex(f => f.sceneId === data.progress.scene_id);
      if (idx === -1) return false;
      return new Promise(resolve => {
        els['resume-prompt'].hidden = false;
        els['resume-continue-btn'].onclick = () => {
          els['resume-prompt'].hidden = true;
          goToScene(idx);
          resolve(true);
        };
        els['resume-restart-btn'].onclick = () => {
          els['resume-prompt'].hidden = true;
          goToScene(0);
          resolve(true);
        };
      });
    } catch {
      return false;
    }
  }
  function saveProgress() {
    if (!currentUser || currentUser.role !== 'parent') return;
    const entry = flatScenes[currentIndex];
    if (!entry) return;
    fetch('/api/reading-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId: bookData.book.id, chapterId: entry.chapterId, sceneId: entry.sceneId }),
    }).catch(() => { /* progress save is best-effort — never block reading on it */ });
  }

  // ── Scene rendering ──
  async function goToScene(index) {
    if (index < 0 || index >= flatScenes.length) return;
    stopSceneAudio();
    currentIndex = index;
    const entry = flatScenes[index];
    const scene = entry.scene;

    els['scene-image'].classList.add('transitioning');

    const [detailRes, imageUrl] = await Promise.all([
      fetch(`/api/scenes/${scene.id}`).then(r => r.json()),
      resolveUrl(scene.image_key),
    ]);
    sceneDetail = detailRes;

    els['scene-image'].src = imageUrl || '';
    els['scene-image'].onload = () => { els['scene-image'].classList.remove('transitioning'); };

    renderHotspots(sceneDetail.hotspots || []);
    setupNarration(scene);
    setupAudioCues(sceneDetail.audioCues || []);
    updateTextOverlay('');
    updateTocHighlight();
    updateEdgeButtons();
    saveProgress();
  }

  function updateEdgeButtons() {
    els['edge-prev'].style.visibility = currentIndex > 0 ? 'visible' : 'hidden';
    els['edge-next'].style.visibility = currentIndex < flatScenes.length - 1 ? 'visible' : 'hidden';
  }

  // ── Hotspots ──
  function renderHotspots(hotspots) {
    els['hotspot-layer'].innerHTML = '';
    hotspots.forEach(h => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'reader-hotspot';
      btn.style.left = `${h.x * 100}%`;
      btn.style.top = `${h.y * 100}%`;
      btn.style.width = `${h.w * 100}%`;
      btn.style.height = `${h.h * 100}%`;
      const marker = document.createElement('div');
      marker.className = 'reader-hotspot-marker';
      btn.appendChild(marker);
      btn.addEventListener('click', () => triggerHotspot(btn, h));
      els['hotspot-layer'].appendChild(btn);
    });
  }

  async function triggerHotspot(el, hotspot) {
    el.classList.add('hotspot-triggered');
    setTimeout(() => el.classList.remove('hotspot-triggered'), 500);
    let payload = {};
    try { payload = JSON.parse(hotspot.payload_json || '{}'); } catch { /* malformed payload — treat as empty rather than breaking the scene */ }

    if (hotspot.type === 'sound') {
      const url = await resolveUrl(payload.audioKey);
      if (url) new Audio(url).play().catch(() => {});
      return;
    }
    if (hotspot.type === 'animation') {
      // Generic: re-trigger the marker's own pulse animation — enough
      // for a simple "this thing noticed you" response without needing
      // per-hotspot custom animation code. A named animation in the
      // payload is reserved for future, more specific effects.
      return;
    }
    if (hotspot.type === 'popup') {
      els['hotspot-modal-text'].textContent = payload.text || '';
      if (payload.imageKey) {
        const url = await resolveUrl(payload.imageKey);
        els['hotspot-modal-image'].src = url || '';
        els['hotspot-modal-image'].hidden = !url;
      } else {
        els['hotspot-modal-image'].hidden = true;
      }
      els['hotspot-modal'].hidden = false;
    }
  }

  // ── Narration + sentence sync ──
  function setupNarration(scene) {
    narrationAudio = new Audio();
    resolveUrl(scene.narration_audio_key).then(url => {
      if (url) narrationAudio.src = url;
    });
    narrationAudio.addEventListener('play', () => {
      setPlayIcon(true);
      duckMusic(true);
      startSentenceSync();
    });
    narrationAudio.addEventListener('pause', () => {
      setPlayIcon(false);
      duckMusic(false);
      stopSentenceSync();
    });
    narrationAudio.addEventListener('ended', () => {
      setPlayIcon(false);
      duckMusic(false);
      stopSentenceSync();
      // Deliberately no auto-advance to the next scene — a child
      // exploring hotspots or re-listening shouldn't be swept forward
      // by a timer; they turn the page themselves when ready.
    });
  }
  function setPlayIcon(isPlaying) {
    els['play-btn'].querySelector('.icon-play').hidden = isPlaying;
    els['play-btn'].querySelector('.icon-pause').hidden = !isPlaying;
    els['play-btn'].setAttribute('aria-label', window.MareI18n.t(isPlaying ? 'readerPause' : 'readerPlay'));
  }
  function toggleNarration() {
    if (!narrationAudio) return;
    if (narrationAudio.paused) narrationAudio.play().catch(() => {});
    else narrationAudio.pause();
  }

  function startSentenceSync() {
    stopSentenceSync();
    const sentences = sceneDetail?.sentences || [];
    function tick() {
      if (!narrationAudio || narrationAudio.paused) return;
      const ms = narrationAudio.currentTime * 1000;
      const current = sentences.find(s => ms >= s.start_ms && ms < s.end_ms);
      if (current) updateTextOverlay(current.text);
      syncRAF = requestAnimationFrame(tick);
    }
    syncRAF = requestAnimationFrame(tick);
  }
  function stopSentenceSync() {
    if (syncRAF) cancelAnimationFrame(syncRAF);
    syncRAF = null;
  }
  function updateTextOverlay(text) {
    els['text-line'].textContent = text;
  }

  // ── Music + SFX ──
  function setupAudioCues(cues) {
    cues.forEach(cue => {
      if (cue.kind === 'music') {
        resolveUrl(cue.audio_key).then(url => {
          if (!url) return;
          musicAudio = new Audio(url);
          musicAudio.loop = !!cue.loop_audio;
          musicAudio.volume = musicMuted ? 0 : cue.volume;
          musicAudio.dataset.baseVolume = cue.volume;
          musicAudio.play().catch(() => {});
        });
      } else if (cue.kind === 'sfx') {
        const timer = setTimeout(async () => {
          const url = await resolveUrl(cue.audio_key);
          if (url) new Audio(url).play().catch(() => {});
        }, cue.start_ms || 0);
        sfxTimers.push(timer);
      }
    });
  }
  function duckMusic(duck) {
    if (!musicAudio) return;
    const base = parseFloat(musicAudio.dataset.baseVolume || '1');
    musicAudio.volume = musicMuted ? 0 : (duck ? base * 0.3 : base);
  }
  function stopSceneAudio() {
    if (narrationAudio) { narrationAudio.pause(); narrationAudio.src = ''; narrationAudio = null; }
    if (musicAudio) { musicAudio.pause(); musicAudio = null; }
    sfxTimers.forEach(t => clearTimeout(t));
    sfxTimers = [];
    stopSentenceSync();
    setPlayIcon(false);
  }

  // ── Swipe navigation ──
  // Same distance-threshold logic proven in per_bot's epub reader: under
  // ~40px of horizontal movement (or a movement more vertical than
  // horizontal) is never treated as a swipe — which is also exactly
  // what lets a hotspot tap and a page-swipe coexist on the same
  // element with no extra stopPropagation bookkeeping needed.
  function setupSwipe() {
    let touchStart = null;
    els['reader-stage'].addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    els['reader-stage'].addEventListener('touchend', (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) goToScene(currentIndex + 1);
      else goToScene(currentIndex - 1);
    }, { passive: true });
  }

  // ── TOC panel ──
  function openToc() { els['toc-panel'].hidden = false; }
  function closeToc() { els['toc-panel'].hidden = true; }

  // ── Toggles ──
  function setupToggles() {
    els['text-toggle-btn'].classList.toggle('active', textVisible);
    els['text-overlay'].hidden = !textVisible;
    els['text-toggle-btn'].addEventListener('click', () => {
      textVisible = !textVisible;
      localStorage.setItem('reader_text_visible', textVisible ? '1' : '0');
      els['text-toggle-btn'].classList.toggle('active', textVisible);
      els['text-overlay'].hidden = !textVisible;
    });

    updateMusicIcon();
    els['music-toggle-btn'].addEventListener('click', () => {
      musicMuted = !musicMuted;
      localStorage.setItem('reader_music_muted', musicMuted ? '1' : '0');
      updateMusicIcon();
      if (musicAudio) duckMusic(narrationAudio && !narrationAudio.paused);
    });
  }
  function updateMusicIcon() {
    els['music-toggle-btn'].querySelector('.icon-sound-on').hidden = musicMuted;
    els['music-toggle-btn'].querySelector('.icon-sound-off').hidden = !musicMuted;
  }

  // ── Boot ──
  async function init() {
    cacheEls();
    await window.MareI18n.ready;
    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', setViewportHeightDelayed);
    window.addEventListener('resize', setViewportHeightDelayed);

    if (!bookSlug) { window.location.href = '/'; return; }

    currentUser = await checkSession();
    if (!currentUser) { window.location.href = '/login.html'; return; }

    await loadBook();
    if (!flatScenes.length) { window.location.href = '/'; return; }

    els['back-btn'].addEventListener('click', () => { window.location.href = '/'; });
    els['toc-btn'].addEventListener('click', openToc);
    els['toc-close-btn'].addEventListener('click', closeToc);
    els['prev-btn'].addEventListener('click', () => goToScene(currentIndex - 1));
    els['next-btn'].addEventListener('click', () => goToScene(currentIndex + 1));
    els['edge-prev'].addEventListener('click', () => goToScene(currentIndex - 1));
    els['edge-next'].addEventListener('click', () => goToScene(currentIndex + 1));
    els['play-btn'].addEventListener('click', toggleNarration);
    els['hotspot-modal-close'].addEventListener('click', () => { els['hotspot-modal'].hidden = true; });
    setupToggles();
    setupSwipe();

    els['reader-loading'].hidden = true;
    els['reader-shell'].hidden = false;

    const resumed = await checkResumeProgress();
    if (!resumed) goToScene(0);
  }

  init();
})();
