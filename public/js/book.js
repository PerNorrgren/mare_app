// ── book.js — Mare App 9 (v110) ──
// The book flow for a grown-up and a child together: the book cover → the
// contents → a chapter page listing its videos and pictures (each says when
// to watch it while reading). A step opens in the picture explorer and comes
// back here. At the bottom: the chapter's diamonds, its code once the chest
// is open, and Talk to Mare. Every picture and word of the flow is set in
// admin (Book Companion → Flow).
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (window.MareI18n ? window.MareI18n.t(k, v) : k);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const track = (n, d) => { try { window.MareTrack && window.MareTrack.event(n, d); } catch { /* never break the page */ } };
  let book = null;

  // diamonds: the same store the picture explorer uses (per chest)
  // v115: previews keep their diamonds in this browser too (under their own
  // key), so every tab and every way back to the chapter page sees them
  const store = () => localStorage;
  const chestKeyOf = (id) => `px-chest-${book && book.preview ? 'preview-' : ''}${id}`;
  function gemsOf(tr) {
    if (!tr) return { n: 0, total: 0 };
    let have = [];
    try { have = JSON.parse(store().getItem(chestKeyOf(tr.id)) || '[]'); } catch { have = []; }
    const n = tr.done ? tr.total : have.filter(id => (tr.ids || []).includes(id)).length;
    return { n: Math.min(n, tr.total), total: tr.total, done: tr.done || (book.preview && n >= tr.total && tr.total ? { code: 'VOORBEELD', preview: true } : null) };
  }
  const COLOURS = ['#ff9ad5', '#9fdcff', '#c7a6ff', '#ffe08a', '#a6f0d0'];
  const gem = (i) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z" fill="${COLOURS[i % COLOURS.length]}"/><path d="M2 9h20M6 3l3 6 3-6 3 6 3-6M9 9l3 12 3-12" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="0.9" stroke-linejoin="round"/></svg>`;
  const gemRow = (n, total) => Array.from({ length: total }, (_, i) => `<i class="${i < n ? 'on' : ''}">${gem(i)}</i>`).join('');

  function show(view) {
    ['bk-cover', 'bk-contents', 'bk-chapter'].forEach(id => { $(id).hidden = id !== view; });
    document.body.dataset.view = view;
    window.scrollTo(0, 0);
  }

  function renderCover() {
    show('bk-cover'); background(book.images.contents);
    $('bk-up').hidden = true; $('bk-where').textContent = '';
    $('bk-cover-img').src = book.images.cover || '';
    $('bk-cover-title').textContent = book.texts.coverTitle;
    $('bk-cover-tap').textContent = book.texts.coverTap;
    // a preview starts with empty chests every time the book is opened
    if (book.preview) { try { Object.keys(localStorage).filter(k => k.startsWith('px-chest-preview-')).forEach(k => localStorage.removeItem(k)); } catch { /* fine */ } }
  }
  function renderContents() {
    show('bk-contents'); background(book.images.contents);
    $('bk-up').hidden = false; $('bk-up').textContent = t('bookBackCover'); $('bk-up').onclick = () => { location.hash = ''; };
    $('bk-where').textContent = book.texts.coverTitle;
    $('bk-contents-title').textContent = book.texts.contentsTitle;
    $('bk-contents-intro').textContent = book.texts.contentsIntro;
    $('bk-chapters').innerHTML = book.chapters.map(c => {
      const g = gemsOf(c.treasure);
      return `<li><a class="bk-ch-card" href="#h${c.no}">
        ${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy">` : c.imageVideo ? `<video class="bk-ch-vid" src="${esc(c.imageVideo)}#t=1" preload="metadata" muted playsinline></video>` : `<span class="bk-ch-no">${c.no}</span>`}
        <span class="bk-ch-text"><small>${esc(t('companionChapterN', { n: c.no }))}</small><strong>${esc(c.title)}</strong>
          <em>${c.steps.length ? esc(t('bookStepsN', { n: c.steps.length })) : esc(t('bookNoStepsShort'))}</em>
          ${c.treasure ? `<span class="bk-ch-gems"><i>${gem(0)}</i> ${g.n}/${g.total}${g.done ? ' · 🗝️' : ''}</span>` : ''}</span>
      </a></li>`;
    }).join('');
  }
  // the big picture on top: an image, or a video's first frame
  const picHtml = (img, vid) => (img ? `<img src="${esc(img)}" alt="">` : vid ? `<video src="${esc(vid)}#t=1" preload="metadata" muted playsinline></video>` : '');
  function background(url, vid) {
    $('bk-bg').style.backgroundImage = url ? `url("${url}")` : '';
    $('bk-bg').innerHTML = !url && vid ? `<video src="${esc(vid)}#t=1" preload="metadata" muted playsinline></video>` : '';
  }
  let chSel = 0; // 0 = the chapter itself, n = step n
  function renderChapter(no, pick) {
    const i = book.chapters.findIndex(c => c.no === no);
    const c = book.chapters[i];
    if (!c) { location.hash = '#inhoud'; return; }
    show('bk-chapter');
    $('bk-up').hidden = false; $('bk-up').textContent = t('bookBackContents'); $('bk-up').onclick = () => { location.hash = '#inhoud'; };
    $('bk-where').textContent = book.texts.coverTitle;
    const lang = window.MareI18n ? window.MareI18n.locale : 'nl';
    const open = (s) => { location.href = `/pictures.html?chapter=${c.no}&step=${s.n}&book=1&lang=${lang}`; };
    chSel = pick != null ? pick : 0;
    const g = gemsOf(c.treasure);
    const stage = () => {
      const s = c.steps.find(x => x.n === chSel);
      if (!s) { // the chapter itself
        $('bk-stage-pic').innerHTML = picHtml(c.image, c.imageVideo);
        $('bk-stage-kicker').textContent = t('companionChapterN', { n: c.no }) + (c.treasure ? `  ·  💎 ${g.n}/${g.total}` : '');
        $('bk-stage-title').textContent = c.title;
        $('bk-stage-when').hidden = true;
        $('bk-stage-body').textContent = c.intro || book.texts.chapterIntro;
        $('bk-stage-go').hidden = !c.steps.length;
        $('bk-stage-go').textContent = t('bookStart');
        $('bk-stage-go').onclick = () => open(c.steps[0]);
        background(c.image || book.images.chapterBg, null);
      } else {
        $('bk-stage-pic').innerHTML = picHtml(s.thumb, s.video ? s.videoUrl : null) + `<span class="bk-stage-play" aria-hidden="true">▶</span>`;
        $('bk-stage-kicker').textContent = `${t('bookStepN', { n: s.n })} · ${t(s.video ? 'bookVideo' : 'bookPicture')}${s.quizzes ? ` · ❓ ${t('bookQuizN', { n: s.quizzes })}` : ''}`;
        $('bk-stage-title').textContent = s.title || c.title;
        $('bk-stage-when').hidden = !s.when; $('bk-stage-when').textContent = s.when ? `📖 ${s.when}` : '';
        $('bk-stage-body').textContent = '';
        $('bk-stage-go').hidden = false;
        $('bk-stage-go').textContent = t(s.video ? 'bookWatch' : 'bookLook');
        $('bk-stage-go').onclick = () => open(s);
        background(s.thumb, s.thumb ? null : s.videoUrl);
      }
      $('bk-stage-pic').onclick = s ? () => open(s) : null;
      $('bk-stage-pic').classList.toggle('bk-click', !!s);
      document.querySelectorAll('#bk-steps .bk-chip').forEach(b => b.classList.toggle('on', Number(b.dataset.n) === chSel));
    };
    // small step buttons: the chapter first, then each step (a second tap opens it)
    $('bk-steps').innerHTML = c.steps.length ? [`<li><button type="button" class="bk-chip" data-n="0"><span class="bk-chip-pic">${picHtml(c.image, c.imageVideo) || `<b>${c.no}</b>`}</span><span>${esc(t('bookChapterChip'))}</span></button></li>`]
      .concat(c.steps.map(s => `<li><button type="button" class="bk-chip" data-n="${s.n}"><span class="bk-chip-pic">${picHtml(s.thumb, s.video ? s.videoUrl : null)}${s.video ? '<i>▶</i>' : ''}</span>
        <span>${esc(t('bookStepN', { n: s.n }))}${s.quizzes ? ` · ❓${s.quizzes}` : ''}</span></button></li>`)).join('') : `<li class="bk-none">${esc(t('bookNoSteps'))}</li>`;
    $('bk-steps').querySelectorAll('.bk-chip').forEach(b => b.addEventListener('click', () => {
      const n = Number(b.dataset.n);
      if (n && n === chSel) { open(c.steps.find(x => x.n === n)); return; }
      chSel = n; stage(); track('book_step_pick', `${c.no}:${n}`);
    }));
    stage();
    // under the last step: the chapter's diamonds, and its code once the chest is open
    $('bk-gemcard').hidden = !c.treasure;
    if (c.treasure) {
      $('bk-gemcard').innerHTML = `<div class="bk-gem-line"><strong>${esc(book.texts.diamonds)}: ${esc(t('bookGemsOf', { n: g.n, total: g.total }))}</strong><span class="bk-gems">${gemRow(g.n, g.total)}</span></div>
        ${g.done ? `<button type="button" class="bk-code-line" id="bk-code-line"><img src="${esc(c.treasure.open || '/images/mare-spot-treasure-chest.png')}" alt=""><span><b>${esc(book.texts.chestLine)}</b><span class="bk-code-pill">🗝️ ${esc(g.done.code)}</span></span></button>`
          : `<p class="bk-gem-hint">${esc(t(g.n ? 'bookGemsToGo' : 'bookGemsStart', { n: g.total - g.n }))}</p>`}`;
      if ($('bk-code-line')) $('bk-code-line').onclick = () => showCode(c, g.done);
    }
    // v111: the chapter's practice (from the Book Companion) as its own card
    $('bk-practice').hidden = !c.practice;
    if (c.practice) {
      const lines = String(c.practice.body).split(/\n+/).map(x => x.trim()).filter(Boolean);
      let html = '', list = [];
      const flush = () => { if (list.length) { html += `<ol>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`; list = []; } };
      lines.forEach(x => { const m = /^\d+[.)]\s*(.*)$/.exec(x); if (m) list.push(m[1]); else { flush(); html += `<p>${esc(x)}</p>`; } });
      flush();
      $('bk-practice').innerHTML = `<p class="bk-kicker">${esc(t('bookPractice'))}</p><h2>${esc(c.practice.title)}</h2>${html}`;
    }
    // previous / next chapter
    const prev = book.chapters[i - 1], next = book.chapters[i + 1];
    $('bk-prev-ch').hidden = !prev; $('bk-next-ch').hidden = !next;
    if (prev) { $('bk-prev-ch').textContent = t('bookPrevCh'); $('bk-prev-ch').onclick = () => { location.hash = `#h${prev.no}`; }; }
    if (next) { $('bk-next-ch').textContent = t('bookNextCh'); $('bk-next-ch').onclick = () => { location.hash = `#h${next.no}`; }; }
    $('bk-talk').hidden = !(book.talk && c.steps.length);
    $('bk-talk').onclick = () => {
      track('book_talk', String(c.no));
      const s = c.steps.find(x => x.n === chSel) || c.steps[0];
      $('bk-talk-frame').src = `/talk.html?embed=1&scene=${encodeURIComponent(s.id)}&lang=${lang}`;
      $('bk-talkbox').hidden = false;
    };
    track('book_chapter', String(c.no));
  }
  function showCode(c, done) {
    const tr = c.treasure || {};
    $('bk-modal-body').innerHTML = `<div class="bk-chest-pic"><img src="${esc(tr.open || '/images/mare-spot-treasure-chest.png')}" alt=""></div>
      <h2>${esc(t('picturesTreasureTitle'))}</h2><p>${esc(t('picturesTreasureBody'))}</p>
      <div class="bk-code-big">${esc(done.code)}</div>
      <p>${esc(t('picturesTreasureShow', { percent: tr.percent || '' }))}</p>
      ${done.preview ? `<p class="bk-note">${esc(t('picturesTreasurePreview'))}</p>` : ''}`;
    $('bk-modal').hidden = false;
  }

  function route() {
    if (!book) return;
    const h = location.hash;
    const m = /^#h(\d+)(?:-(\d+))?$/.exec(h);
    if (m) renderChapter(Number(m[1]), m[2] ? Number(m[2]) : null);
    else if (h === '#inhoud') renderContents();
    else renderCover();
  }

  async function start() {
    if (window.MareI18n) await window.MareI18n.ready;
    const lang = window.MareI18n ? window.MareI18n.locale : 'nl';
    const r = await fetch(`/api/book?lang=${lang}`, { cache: 'no-store' });
    if (r.status === 401 || r.status === 403) { location.href = '/login.html'; return; }
    book = await r.json();
    $('bk-loading').hidden = true;
    $('bk-cover-book').onclick = () => { track('book_open', 'cover'); location.hash = '#inhoud'; };
    $('bk-modal-close').onclick = () => { $('bk-modal').hidden = true; };
    $('bk-modal').addEventListener('click', (e) => { if (e.target.id === 'bk-modal') $('bk-modal').hidden = true; });
    $('bk-talk-close').onclick = () => { $('bk-talkbox').hidden = true; $('bk-talk-frame').src = 'about:blank'; };
    window.addEventListener('hashchange', route);
    // v115: coming back with the browser's back button (or to this tab) shows the diamonds as they are now
    window.addEventListener('pageshow', (e) => { if (e.persisted) route(); });
    window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('px-chest-') && !/^#?$|^#inhoud$/.test(location.hash)) route(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && /^#h\d/.test(location.hash)) route(); });
    route();
  }
  start().catch(() => { $('bk-loading').textContent = t('errorGeneric'); });
})();
