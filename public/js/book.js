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
  const store = () => (book && book.preview ? sessionStorage : localStorage);
  function gemsOf(tr) {
    if (!tr) return { n: 0, total: 0 };
    let have = [];
    try { have = JSON.parse(store().getItem(`px-chest-${tr.id}`) || '[]'); } catch { have = []; }
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
  function background(url) { $('bk-bg').style.backgroundImage = url ? `url("${url}")` : ''; }

  function renderCover() {
    show('bk-cover'); background(book.images.contents);
    $('bk-up').hidden = true; $('bk-where').textContent = ''; $('bk-bar').hidden = true;
    $('bk-cover-img').src = book.images.cover || '';
    $('bk-cover-title').textContent = book.texts.coverTitle;
    $('bk-cover-tap').textContent = book.texts.coverTap;
    // a preview starts with empty chests every time the book is opened
    if (book.preview) { try { Object.keys(sessionStorage).filter(k => k.startsWith('px-chest-')).forEach(k => sessionStorage.removeItem(k)); } catch { /* fine */ } }
  }
  function renderContents() {
    show('bk-contents'); background(book.images.contents);
    $('bk-up').hidden = false; $('bk-up').textContent = t('bookBackCover'); $('bk-up').onclick = () => { location.hash = ''; };
    $('bk-where').textContent = book.texts.coverTitle; $('bk-bar').hidden = true;
    $('bk-contents-title').textContent = book.texts.contentsTitle;
    $('bk-contents-intro').textContent = book.texts.contentsIntro;
    $('bk-chapters').innerHTML = book.chapters.map(c => {
      const g = gemsOf(c.treasure);
      return `<li><a class="bk-ch-card" href="#h${c.no}">
        ${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy">` : `<span class="bk-ch-no">${c.no}</span>`}
        <span class="bk-ch-text"><small>${esc(t('companionChapterN', { n: c.no }))}</small><strong>${esc(c.title)}</strong>
          <em>${c.steps.length ? esc(t('bookStepsN', { n: c.steps.length })) : esc(t('bookNoStepsShort'))}</em>
          ${c.treasure ? `<span class="bk-ch-gems"><i>${gem(0)}</i> ${g.n}/${g.total}${g.done ? ' · 🗝️' : ''}</span>` : ''}</span>
      </a></li>`;
    }).join('');
  }
  function renderChapter(no) {
    const i = book.chapters.findIndex(c => c.no === no);
    const c = book.chapters[i];
    if (!c) { location.hash = '#inhoud'; return; }
    show('bk-chapter'); background(book.images.chapterBg);
    $('bk-up').hidden = false; $('bk-up').textContent = t('bookBackContents'); $('bk-up').onclick = () => { location.hash = '#inhoud'; };
    $('bk-where').textContent = book.texts.coverTitle;
    $('bk-chapter-img').hidden = !c.image; if (c.image) $('bk-chapter-img').src = c.image;
    $('bk-chapter-kicker').textContent = t('companionChapterN', { n: c.no });
    $('bk-chapter-title').textContent = c.title;
    $('bk-chapter-intro').textContent = c.intro || book.texts.chapterIntro;
    const lang = window.MareI18n ? window.MareI18n.locale : 'nl';
    const g = gemsOf(c.treasure);
    $('bk-steps').innerHTML = (c.steps.length ? c.steps.map(s => `<li><a class="bk-step" href="/pictures.html?chapter=${c.no}&step=${s.n}&book=1&lang=${lang}">
        <span class="bk-thumb">${s.video ? `<video src="${esc(s.videoUrl || '')}#t=1" preload="metadata" muted playsinline></video><span class="bk-play">▶</span>` : `<img src="${esc(s.thumb || '')}" alt="" loading="lazy">`}</span>
        <span class="bk-step-text"><small>${esc(t('bookStepN', { n: s.n }))} · ${esc(t(s.video ? 'bookVideo' : 'bookPicture'))}${s.quizzes ? ` · ❓ ${esc(t('bookQuizN', { n: s.quizzes }))}` : ''}</small>
          ${s.title ? `<strong>${esc(s.title)}</strong>` : ''}
          ${s.when ? `<span class="bk-when">📖 ${esc(s.when)}</span>` : ''}</span>
        <span class="bk-go" aria-hidden="true">›</span></a></li>`).join('') : `<li class="bk-none">${esc(t('bookNoSteps'))}</li>`)
      + (g.done ? `<li><button type="button" class="bk-step bk-chest-line" id="bk-chest-line"><span class="bk-thumb bk-thumb-chest"><img src="${esc(c.treasure.open || '/images/mare-spot-treasure-chest.png')}" alt=""></span>
          <span class="bk-step-text"><strong>${esc(book.texts.chestLine)}</strong><span class="bk-when">🗝️ ${esc(g.done.code)}</span></span><span class="bk-go" aria-hidden="true">›</span></button></li>` : '');
    if ($('bk-chest-line')) $('bk-chest-line').onclick = () => showCode(c, g.done);
    // previous / next chapter
    const prev = book.chapters[i - 1], next = book.chapters[i + 1];
    $('bk-prev-ch').hidden = !prev; $('bk-next-ch').hidden = !next;
    if (prev) { $('bk-prev-ch').textContent = t('bookPrevCh'); $('bk-prev-ch').onclick = () => { location.hash = `#h${prev.no}`; }; }
    if (next) { $('bk-next-ch').textContent = t('bookNextCh'); $('bk-next-ch').onclick = () => { location.hash = `#h${next.no}`; }; }
    // the bar: diamonds, code, Talk to Mare
    const hasChest = !!c.treasure;
    $('bk-bar').hidden = !hasChest && !book.talk;
    $('bk-bar-label').textContent = hasChest ? `${book.texts.diamonds} ${g.n}/${g.total}` : '';
    $('bk-gems').innerHTML = hasChest ? gemRow(g.n, g.total) : '';
    $('bk-code').hidden = !g.done;
    if (g.done) { $('bk-code').innerHTML = `🗝️ <b>${esc(g.done.code)}</b>`; $('bk-code').onclick = () => showCode(c, g.done); }
    $('bk-talk').hidden = !(book.talk && c.steps.length);
    $('bk-talk').onclick = () => {
      track('book_talk', String(c.no));
      $('bk-talk-frame').src = `/talk.html?embed=1&scene=${encodeURIComponent(c.steps[0].id)}&lang=${lang}`;
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
    const m = /^#h(\d+)$/.exec(h);
    if (m) renderChapter(Number(m[1]));
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
    if (book.preview) $('bk-leave').href = '/admin.html';
    $('bk-cover-book').onclick = () => { track('book_open', 'cover'); location.hash = '#inhoud'; };
    $('bk-modal-close').onclick = () => { $('bk-modal').hidden = true; };
    $('bk-modal').addEventListener('click', (e) => { if (e.target.id === 'bk-modal') $('bk-modal').hidden = true; });
    $('bk-talk-close').onclick = () => { $('bk-talkbox').hidden = true; $('bk-talk-frame').src = 'about:blank'; };
    window.addEventListener('hashchange', route);
    route();
  }
  start().catch(() => { $('bk-loading').textContent = t('errorGeneric'); });
})();
