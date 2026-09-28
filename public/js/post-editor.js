// ── post-editor.js (Mare App 5) — THE text editor for the whole admin.
//
// One editor everywhere. Each place says what its text can hold, and
// the buttons that make no sense there are greyed out and do nothing:
//   mode 'post'  — Club Mare posts: everything below.
//   mode 'email' — news emails: formatting, links, pictures, app links,
//                  buttons (no video/sound — email can't play them).
//   mode 'plain' — texts shown as plain text (shop descriptions, notices,
//                  prompts, riddles, Mare's letter, social posts…):
//                  every formatting button is grey; typing, paste and
//                  line breaks work as normal. Pasted formatting is
//                  dropped, so what you see is what gets shown.
// Plain <textarea data-editor="plain|email|post"> fields are upgraded
// automatically (upgradeTextarea): the page's own code keeps reading and
// setting textarea.value exactly as before.
//
// Club Mare posts can hold:
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
  // Labels on editors made before the language file has loaded: English
  // now, and data-i18n so the page's translation pass fills them in.
  const FALLBACK = { peImage: 'Picture', peVideo: 'Video', peAudio: 'Sound', peAppLink: 'Link to app', peButton: 'Button',
    peOffPlain: 'Not available here: this text is shown as plain text.', peOffEmail: 'Not available in emails.' };
  const tt = (k) => { const v = t(k); return v && v !== k ? v : (FALLBACK[k] || k); };
  const lbl = (k) => `<span data-i18n="${k}">${tt(k)}</span>`;

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

  const MODES = {
    post: ['format', 'link', 'image', 'video', 'audio', 'applink', 'button'],
    email: ['format', 'link', 'image', 'applink', 'button'],
    plain: [],
  };
  const FORMATS = {
    format: ['header', 'bold', 'italic', 'underline', 'list'],
    link: ['link'], applink: ['link'], image: ['image'], video: ['video', 'mareVideo'], audio: ['mareAudio'], button: ['mareButton'],
  };

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

  function mount(containerOrId, opts) {
    opts = opts || {};
    registerBlots();
    const container = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
    if (!container) return null;
    const mode = MODES[opts.mode] ? opts.mode : 'post';
    const on = new Set(MODES[mode]);
    const plain = mode === 'plain';
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
        getText: () => ta.value,
        setText: (v) => { ta.value = v || ''; },
        appendButton: (text) => { ta.value = (ta.value.trim() + '\n\n' + text).trim(); },
        focus: () => ta.focus(),
        destroy: () => { container.innerHTML = ''; },
        onChange: (fn) => ta.addEventListener('input', fn),
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
          <button type="button" class="pe-btn" data-pe="image" data-no-busy>🖼 ${lbl('peImage')}</button>
          <button type="button" class="pe-btn" data-pe="video" data-no-busy>🎬 ${lbl('peVideo')}</button>
          <button type="button" class="pe-btn" data-pe="audio" data-no-busy>🔊 ${lbl('peAudio')}</button>
          <button type="button" class="pe-btn" data-pe="applink" data-no-busy>🔗 ${lbl('peAppLink')}</button>
          <button type="button" class="pe-btn" data-pe="button" data-no-busy>⬛ ${lbl('peButton')}</button>
        </span>
        <span class="ql-formats"><button type="button" class="ql-clean"></button></span>
      </div>
      <div class="pe-editor"></div>
      <div class="pe-status" role="status"></div>
      <div class="pe-dialog" hidden></div>`;
    const toolbar = container.querySelector('.pe-toolbar');
    const status = container.querySelector('.pe-status');
    const dialog = container.querySelector('.pe-dialog');
    // Grey out what this place can't hold (and keep it switched off).
    const offKey = plain ? 'peOffPlain' : 'peOffEmail';
    const offTitle = tt(offKey);
    const featureOf = (el) => {
      if (el.matches('[data-pe]')) return el.getAttribute('data-pe');
      if (el.matches('.ql-link')) return 'link';
      if (el.matches('.ql-clean')) return 'format';
      return 'format';
    };
    toolbar.querySelectorAll('button, select').forEach(el => {
      if (on.has(featureOf(el))) return;
      el.disabled = true;
      el.classList.add('pe-off');
      el.setAttribute('title', offTitle);
      el.setAttribute('aria-disabled', 'true');
    });
    toolbar.addEventListener('mouseover', (e) => {
      const off = e.target.closest && e.target.closest('.pe-off');
      if (off) off.setAttribute('title', tt(offKey));
    });
    if (plain) container.classList.add('pe-plain');
    const allowed = [];
    on.forEach(f => (FORMATS[f] || []).forEach(x => { if (!allowed.includes(x)) allowed.push(x); }));
    const quill = new window.Quill(container.querySelector('.pe-editor'), {
      theme: 'snow',
      placeholder: opts.placeholder || '',
      formats: allowed,
      modules: { toolbar: { container: toolbar } },
    });
    // Quill swaps the heading <select> for its own picker: grey that too.
    if (!on.has('format')) toolbar.querySelectorAll('.ql-picker').forEach(pk => { pk.classList.add('pe-off'); pk.setAttribute('title', offTitle); pk.style.pointerEvents = 'none'; });
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
      if (b.disabled) return;
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
        if (!on.has('button')) return;
        quill.insertEmbed(quill.getLength() - 1, 'mareButton', { text, href }, 'user');
      },
      // Plain text in and out, line breaks kept exactly.
      getText: () => quill.getText().replace(/\n$/, ''),
      setText: (v) => { quill.setText(String(v || ''), 'silent'); },
      focus: () => quill.focus(),
      destroy: () => { container.innerHTML = ''; container.classList.remove('pe-wrap', 'pe-plain'); },
      onChange: (fn) => quill.on('text-change', fn),
      quill,
    };
    return api;
  }

  // Swap a <textarea data-editor="…"> for the editor, keeping the page's
  // own code working: reading/setting textarea.value, form reset, the
  // form data sent — all still go through the textarea (kept in sync).
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  function upgradeTextarea(ta) {
    if (!ta || ta._peUpgraded || !window.Quill) return;
    ta._peUpgraded = true;
    const mode = MODES[ta.getAttribute('data-editor')] ? ta.getAttribute('data-editor') : 'plain';
    const holder = document.createElement('div');
    holder.className = 'pe-host' + (Number(ta.getAttribute('rows') || 4) <= 3 ? ' pe-short' : '');
    ta.insertAdjacentElement('afterend', holder);
    ta.style.display = 'none';
    ta.removeAttribute('required');
    const ed = mount(holder, { mode, placeholder: ta.getAttribute('placeholder') || '' });
    if (!ed) { ta.style.display = ''; return; }
    const html = mode !== 'plain';
    const read = () => (html ? ed.getHtml() : ed.getText());
    const write = (v) => { if (html) ed.setHtml(v); else ed.setText(v); };
    write(nativeValue.get.call(ta));
    let quiet = false;
    ed.onChange(() => {
      if (quiet) return;
      nativeValue.set.call(ta, read());
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    Object.defineProperty(ta, 'value', {
      configurable: true,
      get() { return read(); },
      set(v) { quiet = true; nativeValue.set.call(ta, v); write(v); quiet = false; },
    });
    if (ta.form) ta.form.addEventListener('reset', () => setTimeout(() => { quiet = true; write(nativeValue.get.call(ta)); quiet = false; }));
    ta._peEditor = ed;
  }
  function upgradeAll(root) {
    (root || document).querySelectorAll('textarea[data-editor]').forEach(upgradeTextarea);
  }
  // Fields added later (riddle cards, letters…) are upgraded as they appear.
  function watch() {
    upgradeAll(document);
    new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches('textarea[data-editor]')) upgradeTextarea(n);
        else if (n.querySelectorAll) upgradeAll(n);
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

  window.MarePostEditor = { mount, upgradeTextarea, APP_PAGES, MODES };
})();
