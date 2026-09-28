// ── post-editor.js (Mare App 5) — the full editor for Club Mare posts.
//
// Rich text (headings, bold/italic/underline, lists, links) plus:
//   Image  — upload a picture into the text
//   Video  — upload a video file, or paste a YouTube/Vimeo link
//   Audio  — upload a sound file (a recording of Mare, music…)
//   App    — link the selected words to a page in the app
//   Button — a big Mare button ("Plant your word →") to a page in the app
// Uploaded media is stored under club-mare/inline/ and referenced as
// /m/club-mare/…, a stable address the server turns into a fresh signed
// link (server.js). The server cleans the HTML again on save
// (html-clean.js). Built on Quill 1.3.7 (already loaded on admin.html),
// with the same scroll-jump guard as message-editor.js.
// ──────────────────────────────────────────────────────────────────────
(function () {
  const t = (k, v) => (window.MareI18n ? window.MareI18n.t(k, v) : k);

  // Pages a link or button can point to (label keys are in en/nl.json).
  const APP_PAGES = [
    ['/club-mare.html', 'pePageClub'],
    ['/club-mare.html#whisper', 'pePageWhisper'],
    ['/club-mare.html#wq', 'pePageQuestion'],
    ['/club-mare.html#ms', 'pePageMission'],
    ['/club-mare.html#mk', 'pePageMakers'],
    ['/club-mare.html#mp', 'pePageLetter'],
    ['/forest.html', 'pePageForest'],
    ['/riddle.html', 'pePageRiddle'],
    ['/talk.html', 'pePageTalk'],
    ['/merchandise.html', 'pePageShop'],
    ['/', 'pePageHome'],
  ];

  let registered = false;
  function registerBlots() {
    if (registered || !window.Quill) return;
    registered = true;
    const Quill = window.Quill;
    const BlockEmbed = Quill.import('blots/block/embed');

    class MareAudio extends BlockEmbed {
      static create(src) {
        const node = super.create();
        node.setAttribute('src', src);
        node.setAttribute('controls', '');
        node.setAttribute('preload', 'none');
        return node;
      }
      static value(node) { return node.getAttribute('src'); }
    }
    MareAudio.blotName = 'mareAudio';
    MareAudio.tagName = 'audio';

    class MareVideo extends BlockEmbed {
      static create(src) {
        const node = super.create();
        node.setAttribute('src', src);
        node.setAttribute('controls', '');
        node.setAttribute('playsinline', '');
        node.setAttribute('preload', 'metadata');
        return node;
      }
      static value(node) { return node.getAttribute('src'); }
    }
    MareVideo.blotName = 'mareVideo';
    MareVideo.tagName = 'video';

    // <div class="mare-btn"><a class="mare-btn-link" href="…">Text</a></div>
    class MareButton extends BlockEmbed {
      static create(value) {
        const node = super.create();
        node.setAttribute('contenteditable', 'false');
        const a = document.createElement('a');
        a.className = 'mare-btn-link';
        a.setAttribute('href', value.href || '/club-mare.html');
        a.textContent = value.text || '';
        node.appendChild(a);
        return node;
      }
      static value(node) {
        const a = node.querySelector('a');
        return { href: a ? a.getAttribute('href') : '', text: a ? a.textContent : '' };
      }
    }
    MareButton.blotName = 'mareButton';
    MareButton.tagName = 'div';
    MareButton.className = 'mare-btn';

    Quill.register(MareAudio, true);
    Quill.register(MareVideo, true);
    Quill.register(MareButton, true);
  }

  function findScrollAncestor(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  function guardScroll(scrollEl) {
    const snap = scrollEl.scrollTop;
    const restore = () => { scrollEl.scrollTop = snap; };
    requestAnimationFrame(() => { restore(); requestAnimationFrame(restore); });
    setTimeout(restore, 50); setTimeout(restore, 200);
  }

  async function upload(file, kind) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const key = `club-mare/inline/${kind}/${Date.now()}-${safe}`;
    const r = await fetch('/api/admin/upload-url', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, contentType: file.type || 'application/octet-stream' }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) throw new Error(d.error || t('adminErrorUploadFailed'));
    const put = await fetch(d.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    if (!put.ok) throw new Error(t('adminErrorUploadFailed'));
    return `/m/${key}`;
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
      input.click();
    });
  }

  function youTubeEmbed(url) {
    const s = String(url || '').trim();
    let m = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    m = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
    return null;
  }

  function mount(containerId, opts) {
    opts = opts || {};
    registerBlots();
    const container = document.getElementById(containerId);
    if (!container) return null;
    if (!window.Quill) {
      // The editor library didn't load (blocked or offline): a plain text
      // box keeps the form usable. Blank lines become paragraphs.
      container.innerHTML = '<textarea class="me-fallback-textarea" rows="10"></textarea>';
      const ta = container.querySelector('textarea');
      ta.placeholder = opts.placeholder || '';
      const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const toText = (html) => { const d = document.createElement('div'); d.innerHTML = String(html || '').replace(/<\/p>/g, '</p>\n\n'); return d.textContent.trim(); };
      return {
        getHtml: () => ta.value.trim() ? ta.value.trim().split(/\n{2,}/).map(par => `<p>${esc(par).replace(/\n/g, '<br>')}</p>`).join('') : '',
        setHtml: (html) => { ta.value = toText(html); },
        appendButton: (text) => { ta.value = (ta.value.trim() + '\n\n' + text).trim(); },
        focus: () => ta.focus(),
      };
    }
    container.classList.add('pe-wrap');
    container.innerHTML = `
      <div class="pe-toolbar">
        <span class="ql-formats">
          <select class="ql-header"><option value="2"></option><option value="3"></option><option selected></option></select>
        </span>
        <span class="ql-formats">
          <button type="button" class="ql-bold"></button><button type="button" class="ql-italic"></button><button type="button" class="ql-underline"></button>
        </span>
        <span class="ql-formats">
          <button type="button" class="ql-list" value="ordered"></button><button type="button" class="ql-list" value="bullet"></button>
          <button type="button" class="ql-link"></button>
        </span>
        <span class="ql-formats pe-media">
          <button type="button" class="pe-btn" data-pe="image" data-no-busy>🖼 ${t('peImage')}</button>
          <button type="button" class="pe-btn" data-pe="video" data-no-busy>🎬 ${t('peVideo')}</button>
          <button type="button" class="pe-btn" data-pe="audio" data-no-busy>🔊 ${t('peAudio')}</button>
          <button type="button" class="pe-btn" data-pe="applink" data-no-busy>🔗 ${t('peAppLink')}</button>
          <button type="button" class="pe-btn" data-pe="button" data-no-busy>⬛ ${t('peButton')}</button>
        </span>
        <span class="ql-formats"><button type="button" class="ql-clean"></button></span>
      </div>
      <div class="pe-editor"></div>
      <div class="pe-status" role="status"></div>
      <div class="pe-dialog" hidden></div>`;
    const toolbar = container.querySelector('.pe-toolbar');
    const status = container.querySelector('.pe-status');
    const dialog = container.querySelector('.pe-dialog');
    const quill = new window.Quill(container.querySelector('.pe-editor'), {
      theme: 'snow',
      placeholder: opts.placeholder || '',
      modules: { toolbar: { container: toolbar } },
    });
    const scrollEl = findScrollAncestor(container);
    toolbar.addEventListener('mousedown', () => guardScroll(scrollEl), true);
    quill.root.addEventListener('paste', () => guardScroll(scrollEl), true);

    const say = (msg, bad) => { status.textContent = msg || ''; status.className = 'pe-status' + (bad ? ' bad' : ''); };

    // A small form inside the editor (no browser pop-ups).
    function ask(title, fields) {
      return new Promise((resolve) => {
        dialog.innerHTML = `<div class="pe-dialog-card"><strong>${title}</strong>
          ${fields.map((f, i) => f.type === 'select'
            ? `<label>${f.label}<select data-i="${i}">${f.options.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select></label>`
            : `<label>${f.label}<input data-i="${i}" type="text" value="${(f.value || '').replace(/"/g, '&quot;')}" placeholder="${f.placeholder || ''}"></label>`).join('')}
          <div class="pe-dialog-btns"><button type="button" class="btn-ghost btn-small" data-x="cancel" data-no-busy>${t('adminCancel')}</button>
          <button type="button" class="btn-primary btn-small" data-x="ok" data-no-busy>${t('peInsert')}</button></div></div>`;
        dialog.hidden = false;
        const first = dialog.querySelector('input, select');
        if (first) first.focus();
        const done = (ok) => {
          const vals = ok ? fields.map((f, i) => dialog.querySelector(`[data-i="${i}"]`).value.trim()) : null;
          dialog.hidden = true; dialog.innerHTML = '';
          resolve(vals);
        };
        dialog.querySelector('[data-x="cancel"]').onclick = () => done(false);
        dialog.querySelector('[data-x="ok"]').onclick = () => done(true);
        dialog.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') done(false); };
      });
    }

    function insertEmbed(type, value) {
      const range = quill.getSelection(true);
      const at = range ? range.index : quill.getLength();
      quill.insertEmbed(at, type, value, 'user');
      quill.setSelection(at + 1, 0, 'silent');
    }

    async function doUpload(accept, kind, embedType) {
      const file = await pickFile(accept);
      if (!file) return;
      const limitMb = kind === 'video' ? 200 : 25;
      if (file.size > limitMb * 1024 * 1024) { say(t('peTooBig', { mb: limitMb }), true); return; }
      say(t('adminUploading'));
      try {
        const src = await upload(file, kind);
        insertEmbed(embedType, src);
        say(t('adminUploaded'));
        setTimeout(() => say(''), 2500);
      } catch (e) { say(e.message || t('errorGeneric'), true); }
    }

    const pageOptions = () => APP_PAGES.map(([href, key]) => [href, t(key)]);

    const actions = {
      image: () => doUpload('image/*', 'image', 'image'),
      audio: () => doUpload('audio/*', 'audio', 'mareAudio'),
      video: async () => {
        const v = await ask(t('peVideo'), [{ type: 'select', label: t('peVideoHow'), options: [['upload', t('peVideoUpload')], ['link', t('peVideoLink')]] }]);
        if (!v) return;
        if (v[0] === 'upload') return doUpload('video/*', 'video', 'mareVideo');
        const l = await ask(t('peVideoLink'), [{ label: t('peVideoLinkLabel'), placeholder: 'https://www.youtube.com/watch?v=…' }]);
        if (!l) return;
        const embed = youTubeEmbed(l[0]);
        if (!embed) { say(t('peVideoLinkBad'), true); return; }
        insertEmbed('video', embed);
      },
      applink: async () => {
        const range = quill.getSelection(true);
        const hasText = range && range.length > 0;
        const fields = [{ type: 'select', label: t('pePage'), options: pageOptions() }];
        if (!hasText) fields.push({ label: t('peLinkText'), placeholder: t('peLinkTextPh') });
        const v = await ask(t('peAppLink'), fields);
        if (!v) return;
        if (hasText) quill.formatText(range.index, range.length, 'link', v[0], 'user');
        else if (v[1]) {
          const at = range ? range.index : quill.getLength();
          quill.insertText(at, v[1], 'link', v[0], 'user');
          quill.setSelection(at + v[1].length, 0, 'silent');
        }
      },
      button: async () => {
        const v = await ask(t('peButton'), [
          { label: t('peButtonText'), value: opts.suggestedButtonText ? opts.suggestedButtonText() : '', placeholder: t('peButtonTextPh') },
          { type: 'select', label: t('pePage'), options: pageOptions() },
        ]);
        if (!v || !v[0]) return;
        insertEmbed('mareButton', { text: v[0], href: v[1] });
      },
    };
    toolbar.querySelectorAll('[data-pe]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      actions[b.getAttribute('data-pe')]();
    }));

    const api = {
      getHtml: () => {
        const html = quill.root.innerHTML;
        return quill.getText().trim() || /<(img|video|audio|iframe)|mare-btn/.test(html) ? html : '';
      },
      setHtml: (html) => {
        quill.setContents([], 'silent');
        if (html) quill.clipboard.dangerouslyPasteHTML(0, html, 'silent');
      },
      appendButton: (text, href) => {
        quill.insertEmbed(quill.getLength() - 1, 'mareButton', { text, href }, 'user');
      },
      focus: () => quill.focus(),
      quill,
    };
    return api;
  }

  window.MarePostEditor = { mount, APP_PAGES };
})();
