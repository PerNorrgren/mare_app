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
  const track = (n, d, v) => { try { window.MareTrack && window.MareTrack.event(n, d, v); } catch { /* never break the page */ } }; // v78
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

  // ── Mare App 7 (v83) — slow or dropped connection ──
  // "Even laden…" appears only if loading takes longer than a moment (no
  // flicker on a good connection). If a picture or video can't load (the
  // connection dropped, or its link expired after a long pause), fresh
  // links are fetched and it tries again, twice; then "tap to try again".
  let loadTimer = null, retries = 0, retrying = false;
  function loading(on) {
    clearTimeout(loadTimer);
    const el = $('px-loading');
    if (!on) { el.hidden = true; el.classList.remove('failed'); document.body.classList.remove('px-is-loading'); return; }
    if (!el.hidden && el.classList.contains('failed')) return;
    loadTimer = setTimeout(() => { el.classList.remove('failed'); $('px-load-text').textContent = t('picturesLoading'); el.hidden = false; document.body.classList.add('px-is-loading'); }, 600);
  }
  function loadFailed() {
    clearTimeout(loadTimer);
    const el = $('px-loading');
    el.classList.add('failed'); $('px-load-text').textContent = t('picturesLoadFailed'); el.hidden = false; document.body.classList.add('px-is-loading');
  }
  async function retryScene() {
    if (retrying || !data) return;
    if (retries >= 2) { loadFailed(); return; }
    retries++; retrying = true;
    loading(true);
    const v = vid(), at = isVideo ? (v.currentTime || 0) : 0, wasPlaying = isVideo && !v.paused;
    try {
      await new Promise(r => setTimeout(r, 1200 * retries));
      const lang = window.MareI18n ? window.MareI18n.locale : 'en';
      const fresh = await getJson(`/api/pictures?chapter=${data.chapter}&lang=${lang}`);
      if (fresh && fresh.chapter === data.chapter && fresh.scenes && fresh.scenes.length) data.scenes = fresh.scenes;
      showScene(idx, true);
      if (isVideo && at > 0) vid().addEventListener('loadedmetadata', () => { try { vid().currentTime = at; } catch { /* ignore */ } if (wasPlaying) playVideo(); }, { once: true });
    } catch { loadFailed(); }
    finally { retrying = false; }
  }

  // ── v96 — when the video stops for a spot, a speech bubble next to it
  // says what to do ("Tap the chest to answer the question"). It goes away
  // when the spot is tapped (tapping the bubble opens the spot too), when
  // the video plays again, or when the spot leaves the screen.
  let askFor = null;
  function hideAsk() { const a = $('px-ask'); if (a) a.hidden = true; askFor = null; }
  function placeAsk() {
    const a = $('px-ask'), f = $('px-frame');
    if (!askFor || !a || a.hidden) return;
    const W = f.clientWidth, H = f.clientHeight, sp = askFor.sp, el = askFor.el;
    a.style.maxWidth = Math.max(160, Math.min(W - 16, 440)) + 'px';
    a.style.left = '0px'; a.style.top = '0px';
    const bw = a.offsetWidth, bh = a.offsetHeight;
    const cx = sp.x * W, cy = sp.y * H, half = (el.offsetHeight || 48) / 2;
    const left = Math.max(8, Math.min(W - bw - 8, cx - bw / 2));
    const above = cy - half - bh - 16 >= 8;
    let top = above ? cy - half - bh - 16 : cy + half + 16;
    if (!above && top + bh > H - 8) top = Math.max(8, H - bh - 8);
    a.style.left = Math.round(left) + 'px'; a.style.top = Math.round(top) + 'px';
    a.classList.toggle('below', !above);
    a.style.setProperty('--tail', Math.round(Math.max(18, Math.min(bw - 18, cx - left))) + 'px');
  }
  function showAsk(sp, el) {
    const a = $('px-ask');
    if (!a || !sp.hint) return;
    askFor = { sp, el };
    a.innerHTML = `<span>${esc(sp.hint)}</span>`;
    a.setAttribute('aria-label', sp.hint);
    a.hidden = false;
    placeAsk();
  }

  function stopSound() { if (audio) { audio.pause(); audio = null; } document.querySelectorAll('.px-spot.playing').forEach(s => s.classList.remove('playing')); }

  function closePop() {
    const wasOpen = !$('px-pop').hidden;
    $('px-pop').hidden = true; $('px-pop-body').innerHTML = ''; stopSound();
    if (wasOpen && isVideo && resumeAfter) { resumeAfter = false; playVideo(); }
  }

  function openSpot(spot, el) {
    hideAsk(); // v96
    track('spot_open', `${data.chapter}:${spot.type}`);
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


  // ── Mare App 8 (v89) — the treasure chest for the quizzes ──────────────
  // Every quiz in the chapter answered right adds a diamond (once per
  // question). With all of them, the chest opens and shows a shop code to
  // show a grown-up. Diamonds are remembered on this device (families) or
  // for this tab (staff and teacher previews, which get an example code).
  const GEM_COLOURS = ['#ff9ad5', '#9fdcff', '#c7a6ff', '#ffe08a', '#a6f0d0'];
  const gemSvg = (i) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z" fill="${GEM_COLOURS[i % GEM_COLOURS.length]}"/><path d="M2 9h20M6 3l3 6 3-6 3 6 3-6M9 9l3 12 3-12" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="0.9" stroke-linejoin="round"/><path d="M7 4.5l1.6 3" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>`;
  let chestRight = new Set();
  const chestStore = () => (data && data.treasure && data.treasure.preview ? sessionStorage : localStorage);
  const chestKey = () => `px-chest-${data.chapter}`;
  function chestSave() { try { chestStore().setItem(chestKey(), JSON.stringify([...chestRight])); } catch { /* private mode */ } }
  function setupChest() {
    const old = $('px-chest'); if (old) old.remove();
    const tr = data && data.treasure;
    if (!tr) return;
    try { chestRight = new Set(JSON.parse(chestStore().getItem(chestKey()) || '[]')); } catch { chestRight = new Set(); }
    const el = document.createElement('button');
    el.type = 'button'; el.id = 'px-chest'; el.className = 'px-chest';
    el.innerHTML = `<span class="px-chest-pics"><img class="px-chest-img px-chest-closed" alt="" draggable="false"><img class="px-chest-open" alt="" draggable="false"><span class="px-chest-burst">${'<i></i>'.repeat(8)}</span></span><span class="px-chest-gems"></span>`;
    el.addEventListener('click', () => {
      if (tr.done) return showTreasure(tr.done);
      const n = Math.min(chestRight.size, tr.total);
      $('px-hint').textContent = t('picturesTreasureHint', { n, total: tr.total });
      $('px-hint').hidden = false;
      clearTimeout(el._h); el._h = setTimeout(() => { $('px-hint').hidden = true; }, 4000);
    });
    document.body.appendChild(el);
    renderChest();
    // all answered before but the chest never opened (e.g. the connection dropped): open it now
    if (!tr.done && chestRight.size >= tr.total) finishChest();
  }
  function renderChest() {
    const tr = data.treasure, el = $('px-chest'); if (!tr || !el) return;
    const full = !!tr.done;
    const n = full ? tr.total : Math.min(chestRight.size, tr.total);
    // v94: the closed picture (or the open chest shown dark) and the open one on top, shown when the lid opens
    const img = el.querySelector('.px-chest-closed'), openImg = el.querySelector('.px-chest-open');
    const src = full ? tr.open : (tr.closed || tr.open);
    if (img.getAttribute('src') !== src) img.src = src;
    if (openImg.getAttribute('src') !== tr.open) openImg.src = tr.open;
    el.classList.toggle('full', full);
    el.classList.toggle('dim', !full && !tr.closed); // no closed picture: the open chest, dark until it fills
    el.style.setProperty('--fill', String(tr.total ? n / tr.total : 0));
    el.setAttribute('aria-label', full ? t('picturesTreasureOpenAgain') : t('picturesTreasureHint', { n, total: tr.total }));
    el.querySelector('.px-chest-gems').innerHTML = Array.from({ length: tr.total }, (_, i) => `<i class="${i < n ? 'on' : ''}">${gemSvg(i)}</i>`).join('');
  }
  function chime(notes) {
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      const ctx = chime.ctx || (chime.ctx = new A());
      notes.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), at = ctx.currentTime + i * 0.11;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.18, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
        o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + 0.55);
      });
    } catch { /* no sound is fine */ }
  }
  // v94 — a right answer: the lid opens, a diamond flies in, a sparkle, the lid closes.
  // The last one: it closes, then the chest grows to the middle, opens, and the code appears.
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  function chestOpen(el, on) {
    el.classList.toggle('open', on);
    if (on) { el.classList.remove('lid'); void el.offsetWidth; el.classList.add('lid'); }
  }
  async function chestAnswer(spotId, fromEl) {
    const tr = data && data.treasure;
    if (!tr || tr.done || chestRight.has(spotId)) return;
    chestRight.add(spotId); chestSave();
    const el = $('px-chest'); if (!el) return;
    const last = chestRight.size >= tr.total;
    const a = fromEl.getBoundingClientRect();
    await wait(350);
    chestOpen(el, true); chime([660]);
    await wait(420);
    const b = el.querySelector('.px-chest-pics').getBoundingClientRect();
    const gem = document.createElement('div');
    gem.className = 'px-flygem'; gem.innerHTML = gemSvg(chestRight.size - 1);
    gem.style.left = (a.left + a.width / 2) + 'px'; gem.style.top = (a.top + a.height / 2) + 'px';
    document.body.appendChild(gem);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      gem.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height * 0.42 - (a.top + a.height / 2)}px) scale(0.5) rotate(360deg)`;
    }));
    await wait(880);
    gem.remove(); renderChest(); chime([988, 1319]);
    el.classList.remove('burst'); void el.offsetWidth; el.classList.add('burst');
    await wait(750);
    chestOpen(el, false); chime([392]);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    if (last) { await wait(900); finishChest(); }
  }
  let finishing = false;
  async function finishChest() {
    const tr = data && data.treasure;
    if (!tr || tr.done || finishing) return;
    if (data.demo) { // v95: the admin preview — no server, an example code
      tr.done = { code: 'VOORBEELD', percent: tr.percent, preview: true };
      renderChest(); showTreasure(tr.done); return;
    }
    finishing = true;
    try {
      const r = await fetch('/api/pictures/treasure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chapter: data.chapter, spots: [...chestRight] }) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        // the questions changed since: keep only diamonds for questions that still exist
        const live = new Set(data.scenes.flatMap(s => s.spots).filter(sp => sp.type === 'quiz').map(sp => sp.id));
        chestRight = new Set([...chestRight].filter(id => live.has(id))); chestSave(); renderChest();
        return;
      }
      tr.done = { code: out.code, expires: out.expires || null, percent: out.percent, preview: !!out.preview };
      renderChest();
      showTreasure(tr.done);
      track('treasure_open', `${data.chapter}:chest`);
    } catch { /* offline: tries again next time the pictures open */ }
    finally { finishing = false; }
  }
  function showTreasure(done) {
    const tr = data.treasure;
    if (!$('px-pop').hidden) closePop(); // the last question's window makes way for the chest
    let box = $('px-treasure');
    if (box) box.remove();
    box = document.createElement('div');
    box.id = 'px-treasure'; box.className = 'px-treasure';
    box.innerHTML = `<div class="px-treasure-card" role="dialog" aria-modal="true" aria-labelledby="px-tr-title">
      <div class="px-treasure-chest${tr.closed ? '' : ' nodark'}"><img class="px-tr-closed" src="${esc(tr.closed || tr.open)}" alt="" draggable="false"><img class="px-tr-open" src="${esc(tr.open)}" alt="" draggable="false"><span class="px-sparkles">${'<i></i>'.repeat(14)}</span></div>
      <h2 id="px-tr-title">${esc(t('picturesTreasureTitle'))}</h2>
      <p>${esc(t('picturesTreasureBody'))}</p>
      <div class="px-treasure-code">${esc(done.code)}</div>
      <p class="px-treasure-show">${esc(t('picturesTreasureShow', { percent: done.percent || tr.percent }))}</p>
      ${done.preview ? `<p class="px-treasure-note">${esc(t('picturesTreasurePreview'))}</p>` : ''}
      <button type="button" class="px-again px-carry" id="px-tr-close">${esc(t('picturesDone'))}</button></div>`;
    document.body.appendChild(box);
    // v94: closed first, then the lid opens and the code appears
    setTimeout(() => { box.classList.add('opened'); chime([784, 988, 1175, 1568]); }, 1100);
    $('px-tr-close').onclick = () => box.remove();
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
      track('quiz_answer', `${data.chapter}:quiz`, right ? 1 : 0);
      if (right) {
        $('px-pop-body').querySelectorAll('.px-answer').forEach(x => { x.disabled = true; });
        b.classList.add('right');
        msg.textContent = q.right || t('picturesQuizRight');
        msg.className = 'px-quiz-msg right';
        $('px-carry').hidden = false;
        chestAnswer(spot.id, b); // v89
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
        else { msg.textContent = t('picturesWriteSent'); msg.className = 'px-quiz-msg right'; track('write_sent', `${data.chapter}:write`); }
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
          showAsk(sp, el); // v96
        }
      } else if (!on && el.classList.contains('shown')) {
        el.classList.remove('shown', 'beckon');
        if (askFor && askFor.sp.id === sp.id) hideAsk(); // v96
      }
      if (now < from - 0.3) pausedFor.delete(sp.id); // rewound: it may stop again
    });
  }
  function loop() { tick(); if (isVideo && !vid().paused) raf = requestAnimationFrame(loop); }
  function setupVideo() {
    const v = vid();
    v.addEventListener('loadedmetadata', () => { layout(); tick(); loading(false); });
    // v83: slow connection
    v.addEventListener('waiting', () => { if (!v.paused) loading(true); });
    ['playing', 'canplay', 'pause', 'seeked'].forEach(ev => v.addEventListener(ev, () => { if (ev !== 'canplay' || v.paused) loading(false); if (ev === 'playing') retries = 0; }));
    v.addEventListener('error', () => { if (isVideo && v.getAttribute('src')) retryScene(); });
    v.addEventListener('play', () => { hideAsk(); if (v.currentTime < 0.5) track('video_start', `${data.chapter}:${idx + 1}`); delete v.dataset.stoppedBySpot; $('px-bigplay').hidden = true; fmtBtn(); cancelAnimationFrame(raf); loop(); });
    v.addEventListener('pause', () => { fmtBtn(); tick(); });
    v.addEventListener('seeked', tick);
    v.addEventListener('ended', () => { track('video_end', `${data.chapter}:${idx + 1}`); fmtBtn(); $('px-bigplay').textContent = '↻'; $('px-bigplay').setAttribute('aria-label', t('picturesWatchAgain')); $('px-bigplay').hidden = false; });
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

  function showScene(i, isRetry) {
    closePop();
    hideAsk(); // v96
    if (!isRetry) retries = 0;
    loading(false);
    idx = Math.max(0, Math.min(i, data.scenes.length - 1));
    const scene = data.scenes[idx];
    track('step_view', `${data.chapter}:${idx + 1}`);
    const img = $('px-img'), v = vid();
    isVideo = !!scene.video;
    resumeAfter = false; pausedFor.clear(); cancelAnimationFrame(raf);
    $('px-vbar').hidden = !isVideo;
    document.body.classList.toggle('px-has-video', isVideo); // hints sit above the play bar
    $('px-bigplay').hidden = !isVideo; $('px-bigplay').textContent = '▶';
    if (isVideo) {
      img.hidden = true; img.removeAttribute('src');
      v.hidden = false;
      if (v.getAttribute('src') !== scene.video) { v.src = scene.video; v.load(); loading(true); }
      else { v.currentTime = 0; }
      fmtBtn();
    } else {
      v.pause(); v.hidden = true; v.removeAttribute('src'); v.load();
      img.hidden = false;
      img.onload = () => { layout(); loading(false); retries = 0; };
      img.onerror = () => { if (!isVideo && img.getAttribute('src')) retryScene(); };
      loading(true);
      img.src = scene.image;
      if (img.complete && img.naturalWidth) { layout(); loading(false); }
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
      if (look.iconUrl) { // v88: the spot is a picture, as see-through as staff chose; glow optional
        b.classList.add('px-iconspot');
        if (look.glow === false) b.classList.add('px-noglow');
        b.style.aspectRatio = '';
        const im = document.createElement('img');
        im.src = look.iconUrl; im.alt = ''; im.draggable = false;
        im.style.opacity = look.opacity == null ? 1 : look.opacity;
        b.appendChild(im);
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
      setupChest(); // v89: (none without pictures)
      return;
    }
    $('px-empty').hidden = true;
    $('px-talk').hidden = !data.talk;
    showScene(0);
    setupChest(); // v89
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
    track('picture_talk', String(data.chapter));
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
        if (/(?:^|;\s*)mare_viewas=child/.test(document.cookie)) { // v95: admin viewing as a child → straight back to admin
          fetch('/api/view-as/exit', { method: 'POST' }).catch(() => {}).finally(() => { location.href = '/admin.html'; });
          return;
        }
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
    $('px-loading').onclick = () => { if ($('px-loading').classList.contains('failed')) { retries = 0; $('px-loading').classList.remove('failed'); retryScene(); } };
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
    window.addEventListener('resize', () => { layout(); placeAsk(); }); // v96: the bubble follows
    $('px-ask').addEventListener('click', (e) => { e.stopPropagation(); if (askFor) openSpot(askFor.sp, askFor.el); });
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
    if (new URLSearchParams(location.search).has('chestdemo')) return chestDemo(); // v95
    try { await load(); } catch { return; }
    setInterval(poll, 8000);
  })();

  // ── v95 — admin's preview of the treasure chest: the real chest and
  // animations, with a "Right answer" button instead of quiz questions.
  async function chestDemo() {
    $('px-start').hidden = true;
    document.body.classList.add('px-chest-demo');
    let cfg = {};
    try { cfg = await getJson('/api/admin/treasure'); } catch { /* not staff: nothing to show */ return; }
    const n = Math.max(1, Math.min(10, parseInt(new URLSearchParams(location.search).get('chestdemo'), 10) || 4));
    data = { demo: true, chapter: 'demo', scenes: [], treasure: { total: n, preview: true, percent: cfg.percent, closed: cfg.closedKey ? cfg.closedUrl : null, open: cfg.openUrl, done: null } };
    try { sessionStorage.removeItem('px-chest-demo'); } catch { /* fine */ }
    ['px-found', 'px-talk', 'px-prev', 'px-next'].forEach(id => { const el = $(id); if (el) el.hidden = true; });
    $('px-chapter').textContent = t('picturesChestDemo');
    setupChest();
    const bar = document.createElement('div');
    bar.className = 'px-demo-bar';
    bar.innerHTML = `<button type="button" class="px-again px-carry" id="px-demo-right">✓ ${esc(t('picturesDemoRight'))}</button>
      <button type="button" class="px-again" id="px-demo-reset">↺ ${esc(t('picturesDemoReset'))}</button>`;
    document.body.appendChild(bar);
    let k = 0, busy = false;
    $('px-demo-right').onclick = async () => {
      if (busy || data.treasure.done) return;
      busy = true; $('px-demo-right').disabled = true;
      await chestAnswer(`demo-${++k}`, $('px-demo-right'));
      busy = false; $('px-demo-right').disabled = !!data.treasure.done;
    };
    $('px-demo-reset').onclick = () => {
      chestRight = new Set(); data.treasure.done = null; k = 0; chestSave();
      const box = $('px-treasure'); if (box) box.remove();
      $('px-demo-right').disabled = false; renderChest();
    };
  }
})();
