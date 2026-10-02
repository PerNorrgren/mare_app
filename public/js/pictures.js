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
  // v74 — video scenes: spots appear between tStart and tEnd; a spot can
  // stop the video when it appears (once per pass); opening a spot pauses
  // the video and closing it carries on.
  const vid = () => $('px-video');
  let isVideo = false, resumeAfter = false, raf = 0;
  const pausedFor = new Set();
  let spotEls = [];

  async function getJson(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (r.status === 401) { location.href = '/login.html'; throw new Error('auth'); } // v71: 403 no longer bounces through login
    return r.json();
  }

  function stopSound() { if (audio) { audio.pause(); audio = null; } document.querySelectorAll('.px-spot.playing').forEach(s => s.classList.remove('playing')); }

  function closePop() {
    const wasOpen = !$('px-pop').hidden;
    $('px-pop').hidden = true; $('px-pop-body').innerHTML = ''; stopSound();
    if (wasOpen && isVideo && resumeAfter) { resumeAfter = false; playVideo(); }
  }

  function openSpot(spot, el) {
    found.add(spot.id);
    el.classList.add('found');
    el.classList.remove('beckon');
    updateFound();
    stopSound();
    if (isVideo) {
      const v = vid();
      if (!v.paused || v.dataset.stoppedBySpot) { resumeAfter = true; delete v.dataset.stoppedBySpot; }
      v.pause();
    }
    if (spot.type === 'quiz' && spot.quiz && spot.quiz.answers.length) return openQuiz(spot);
    if (spot.type === 'write') return openWrite(spot);
    if ((spot.type === 'sound' || spot.type === 'voice') && spot.audio) {
      audio = new Audio(spot.audio);
      el.classList.add('playing');
      audio.onended = () => el.classList.remove('playing');
      audio.play().catch(() => el.classList.remove('playing'));
      if (spot.type === 'sound' && !spot.text && !spot.image) { // just the sound; a video carries on after it
        audio.onended = () => { el.classList.remove('playing'); if (resumeAfter) { resumeAfter = false; playVideo(); } };
        return;
      }
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
    if (!html) { if (resumeAfter && audio) { audio.onended = () => { el.classList.remove('playing'); if (resumeAfter) { resumeAfter = false; playVideo(); } }; } else if (resumeAfter) { resumeAfter = false; playVideo(); } return; }
    $('px-pop-body').innerHTML = html;
    $('px-pop').hidden = false;
    const again = $('px-again');
    if (again) again.onclick = () => { stopSound(); audio = new Audio(spot.audio); audio.play().catch(() => {}); };
  }

  // v74 — a little quiz: tap an answer; wrong = try again, right = carry on.
  function openQuiz(spot) {
    const q = spot.quiz;
    let html = `<h2>${esc(spot.title || '')}</h2>`;
    if (spot.text) html += `<p>${esc(spot.text).replace(/\n/g, '<br>')}</p>`;
    if (spot.image) html += `<img src="${esc(spot.image)}" alt="">`;
    const pics = q.answers.some(a => a.image);
    html += `<div class="px-quiz${pics ? ' pics' : ''}">${q.answers.map((a, i) => `<button type="button" class="px-answer" data-i="${i}"${a.text ? '' : ` aria-label="${esc(t('adminQuizAnswer', { n: i + 1 }))}"`}>${a.image ? `<img src="${esc(a.image)}" alt="${esc(a.text)}" draggable="false">` : ''}${a.text ? `<span>${esc(a.text)}</span>` : ''}</button>`).join('')}</div>
      <p class="px-quiz-msg" id="px-quiz-msg" hidden></p>
      <button type="button" class="px-again px-carry" id="px-carry" hidden>${esc(isVideo ? t('picturesCarryOn') : t('picturesDone'))}</button>`;
    $('px-pop-body').innerHTML = html;
    $('px-pop').hidden = false;
    const msg = $('px-quiz-msg');
    $('px-pop-body').querySelectorAll('.px-answer').forEach(b => b.addEventListener('click', () => {
      const right = Number(b.dataset.i) === q.correct;
      if (right) {
        $('px-pop-body').querySelectorAll('.px-answer').forEach(x => { x.disabled = true; });
        b.classList.add('right');
        msg.textContent = q.right || t('picturesQuizRight');
        msg.className = 'px-quiz-msg right';
        $('px-carry').hidden = false;
      } else {
        b.classList.add('wrong'); b.disabled = true;
        msg.textContent = q.wrong || t('picturesQuizWrong');
        msg.className = 'px-quiz-msg wrong';
      }
      msg.hidden = false;
    }));
    $('px-carry').onclick = closePop;
  }

  // v74 — write to Mare from inside the picture or video.
  function openWrite(spot) {
    let html = `<h2>${esc(spot.title || t('picturesWriteTitle'))}</h2>`;
    if (spot.text) html += `<p>${esc(spot.text).replace(/\n/g, '<br>')}</p>`;
    if (spot.image) html += `<img src="${esc(spot.image)}" alt="">`;
    html += `<textarea class="px-write" id="px-write" rows="4" maxlength="1200" placeholder="${esc(t('picturesWritePlaceholder'))}"></textarea>
      <p class="px-quiz-msg" id="px-write-msg" hidden></p>
      <div class="px-write-btns"><button type="button" class="px-again" id="px-write-send">✉️ ${esc(t('picturesWriteSend'))}</button>
      <button type="button" class="px-again px-carry" id="px-carry" hidden>${esc(isVideo ? t('picturesCarryOn') : t('picturesDone'))}</button></div>`;
    $('px-pop-body').innerHTML = html;
    $('px-pop').hidden = false;
    $('px-carry').onclick = closePop;
    $('px-write-send').onclick = async () => {
      const text = $('px-write').value.trim();
      const msg = $('px-write-msg');
      if (!text) { $('px-write').focus(); return; }
      const scene = data.scenes[idx];
      const where = `${t('companionChapterN', { n: data.chapter })}${scene && scene.title ? ' · ' + scene.title : ''}${spot.title ? ' · ' + spot.title : ''}`;
      try {
        const body = JSON.stringify({ message: `[${where}]\n${text}` });
        const post = (u) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        let r = await post('/api/companion/message');
        let test = false;
        if (r.status === 403) { r = await post('/api/pictures/test-message'); test = true; } // staff/teacher preview → Mare team email
        const out = await r.json().catch(() => ({}));
        if (test && r.ok) { msg.textContent = t('picturesWriteTestSent'); msg.className = 'px-quiz-msg right'; }
        else if (!r.ok) { msg.textContent = out.error || t('errorGeneric'); msg.className = 'px-quiz-msg wrong'; msg.hidden = false; return; }
        else { msg.textContent = t('picturesWriteSent'); msg.className = 'px-quiz-msg right'; }
        msg.hidden = false;
        $('px-write').disabled = true; $('px-write-send').hidden = true; $('px-carry').hidden = false;
      } catch { msg.textContent = t('errorGeneric'); msg.className = 'px-quiz-msg wrong'; msg.hidden = false; }
    };
  }

  // ── v74 — video scenes ──
  function playVideo() {
    const v = vid();
    $('px-bigplay').hidden = true;
    v.play().catch(() => { $('px-bigplay').hidden = false; });
  }
  function fmtBtn() {
    const v = vid();
    $('px-play').textContent = v.paused ? '▶' : '❚❚';
    $('px-play').setAttribute('aria-label', v.paused ? t('picturesPlay') : t('picturesPause'));
  }
  // Which spots are on screen now; stop the video for a spot that asks to.
  function tick() {
    if (!isVideo) return;
    const v = vid(), now = v.currentTime || 0, dur = v.duration || 0;
    $('px-prog-fill').style.width = dur ? ((now / dur) * 100) + '%' : '0';
    const scene = data.scenes[idx];
    scene.spots.forEach((sp, n) => {
      const el = spotEls[n]; if (!el) return;
      const from = sp.tStart == null ? 0 : sp.tStart;
      const to = sp.tEnd == null ? Infinity : sp.tEnd;
      const on = now >= from && now < to;
      if (on && !el.classList.contains('shown')) {
        el.classList.add('shown');
        if (sp.pause && sp.type !== 'mask' && !pausedFor.has(sp.id) && !v.paused) {
          pausedFor.add(sp.id);
          v.pause(); v.dataset.stoppedBySpot = '1';
          el.classList.add('beckon');
        }
      } else if (!on && el.classList.contains('shown')) {
        el.classList.remove('shown', 'beckon');
      }
      if (now < from - 0.3) pausedFor.delete(sp.id); // rewound: it may stop again
    });
  }
  function loop() { tick(); if (isVideo && !vid().paused) raf = requestAnimationFrame(loop); }
  function setupVideo() {
    const v = vid();
    v.addEventListener('loadedmetadata', () => { layout(); tick(); });
    v.addEventListener('play', () => { delete v.dataset.stoppedBySpot; $('px-bigplay').hidden = true; fmtBtn(); cancelAnimationFrame(raf); loop(); });
    v.addEventListener('pause', () => { fmtBtn(); tick(); });
    v.addEventListener('seeked', tick);
    v.addEventListener('ended', () => { fmtBtn(); $('px-bigplay').textContent = '↻'; $('px-bigplay').setAttribute('aria-label', t('picturesWatchAgain')); $('px-bigplay').hidden = false; });
    $('px-bigplay').onclick = () => {
      if (v.ended) { pausedFor.clear(); v.currentTime = 0; }
      $('px-bigplay').textContent = '▶';
      playVideo();
    };
    $('px-play').onclick = () => {
      if (v.paused) { if (v.ended) { pausedFor.clear(); v.currentTime = 0; } delete v.dataset.stoppedBySpot; playVideo(); }
      else v.pause();
    };
    // tap or drag along the bar to jump
    const seek = (e) => {
      const r = $('px-prog').getBoundingClientRect();
      if (!v.duration) return;
      v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * v.duration;
      tick();
    };
    $('px-prog').addEventListener('pointerdown', (e) => {
      e.preventDefault(); seek(e);
      const mv = (ev) => seek(ev);
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
  }

  function updateFound() {
    const scene = data && data.scenes[idx];
    const secrets = scene ? scene.spots.filter(s => s.type !== 'mask') : []; // v76: masks aren't secrets
    if (!secrets.length) { $('px-found').hidden = true; return; }
    const n = secrets.filter(s => found.has(s.id)).length;
    $('px-found').hidden = false;
    $('px-found').textContent = n === secrets.length ? t('picturesAllFound') : t('picturesFound', { n, total: secrets.length });
    $('px-found').classList.toggle('all', n === secrets.length);
  }

  // Fit the picture inside the screen (letterbox), spots sit on top.
  function layout() {
    const img = $('px-img'), v = vid(), frame = $('px-frame');
    const w = isVideo ? v.videoWidth : img.naturalWidth, h = isVideo ? v.videoHeight : img.naturalHeight;
    if (!w || !h) return;
    const W = window.innerWidth, H = window.innerHeight;
    const s = Math.min(W / w, H / h);
    frame.style.width = Math.round(w * s) + 'px';
    frame.style.height = Math.round(h * s) + 'px';
  }

  function showScene(i) {
    closePop();
    idx = Math.max(0, Math.min(i, data.scenes.length - 1));
    const scene = data.scenes[idx];
    const img = $('px-img'), v = vid();
    isVideo = !!scene.video;
    resumeAfter = false; pausedFor.clear(); cancelAnimationFrame(raf);
    $('px-vbar').hidden = !isVideo;
    document.body.classList.toggle('px-has-video', isVideo); // hints sit above the play bar
    $('px-bigplay').hidden = !isVideo; $('px-bigplay').textContent = '▶';
    if (isVideo) {
      img.hidden = true; img.removeAttribute('src');
      v.hidden = false;
      if (v.getAttribute('src') !== scene.video) { v.src = scene.video; v.load(); }
      else { v.currentTime = 0; }
      fmtBtn();
    } else {
      v.pause(); v.hidden = true; v.removeAttribute('src'); v.load();
      img.hidden = false;
      img.onload = layout;
      img.src = scene.image;
    }
    const spots = $('px-spots');
    spots.innerHTML = '';
    spotEls = [];
    scene.spots.forEach((sp, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'px-spot px-' + sp.type + (found.has(sp.id) ? ' found' : '') + (isVideo ? ' px-timed' : '');
      spotEls.push(b);
      b.style.left = (sp.x * 100) + '%';
      b.style.top = (sp.y * 100) + '%';
      b.style.width = (sp.r * 200) + '%'; // r = radius as a share of the picture width
      b.style.aspectRatio = '1';
      const look = sp.look || {};
      if (look.colour) b.style.setProperty('--spot', look.colour); // v76: chosen colour
      if (sp.type === 'mask') { // v76: a blurred or coloured patch, not a secret
        b.classList.add('px-mask-' + look.mode, 'px-shape-' + look.shape);
        if (look.shape === 'rect') { b.style.aspectRatio = ''; b.style.height = ((look.h || sp.r * 2) * 100) + '%'; }
        b.setAttribute('aria-hidden', 'true'); b.tabIndex = -1;
        if (look.reveal) b.addEventListener('click', (e) => { e.stopPropagation(); b.classList.add('revealed'); });
        else b.disabled = true;
        spots.appendChild(b);
        return;
      }
      b.style.animationDelay = (n * 0.37) + 's';
      b.setAttribute('aria-label', sp.title || t('picturesSecret'));
      b.addEventListener('click', (e) => { e.stopPropagation(); openSpot(sp, b); });
      spots.appendChild(b);
    });
    if (isVideo) tick();
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
    if (isVideo) vid().pause();
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
    $('px-stage').addEventListener('touchstart', (e) => { sx = e.target.closest('#px-vbar') ? null : e.touches[0].clientX; }, { passive: true });
    $('px-stage').addEventListener('touchend', (e) => {
      if (sx == null || !data) return;
      const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 60) showScene(idx + (dx < 0 ? 1 : -1));
    });
    window.addEventListener('resize', layout);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    setupExit();
    setupVideo();
    // First tap: go full screen where the browser allows it (not needed
    // when opened from the Home Screen, which is already full screen).
    const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    if (!standalone && document.documentElement.requestFullscreen) {
      $('px-start-btn').textContent = t('picturesStart');
      $('px-start').hidden = false;
      $('px-start-btn').onclick = () => { document.documentElement.requestFullscreen().catch(() => {}); $('px-start').hidden = true; if (isVideo) playVideo(); };
    }
    try { await load(); } catch { return; }
    setInterval(poll, 8000);
  })();
})();
