(function () {
  // ── message-editor.js ──
  // Reusable rich-text editor mount, first used by the broadcast
  // composer (admin.html, Messaging tab). Built fresh for mare_app —
  // there was no existing Quill instance here to inherit a bug from —
  // but the scroll-jump fix below is ported directly from a real bug
  // per_bot hit and fixed (Per App 29): pasting text or clicking a
  // toolbar button inside Quill jumps the whole surrounding modal back
  // to its top, because Quill's own selection-tracking scrolls whatever
  // it thinks the page's scroll container is, without knowing the
  // editor actually lives inside a scrollable modal. Fixed here from
  // day one rather than discovered later, per that lesson.

  // Walks up from the editor's own mount element to find its real
  // scrollable ancestor, rather than assuming a fixed selector — works
  // regardless of which modal/wrapper this gets mounted inside.
  function findScrollAncestor(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  // Restores a snapshotted scrollTop across a few animation frames and
  // short timeouts — Quill's own scroll correction sometimes lands a
  // beat after the paste/format itself, not synchronously with it, so
  // a single restore right after the event isn't always enough.
  function guardScroll(scrollEl) {
    const snapshot = scrollEl.scrollTop;
    const restore = () => { scrollEl.scrollTop = snapshot; };
    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(restore);
    });
    setTimeout(restore, 50);
    setTimeout(restore, 200);
  }

  function quillAvailable() {
    return typeof window.Quill !== 'undefined';
  }

  // mountRichEditor(containerId, initialHtml, opts) -> { getHtml(), getText(), setHtml(html), destroy() }
  // opts.placeholder — placeholder text for an empty editor.
  // Falls back to a plain <textarea> (still returning the same
  // interface) if Quill hasn't loaded — a blocked CDN or offline
  // moment shouldn't take the whole compose form down with it.
  function mountRichEditor(containerId, initialHtml, opts) {
    opts = opts || {};
    const container = document.getElementById(containerId);
    if (!container) return null;

    if (!quillAvailable()) {
      container.innerHTML = '';
      const textarea = document.createElement('textarea');
      textarea.className = 'me-fallback-textarea';
      textarea.rows = 10;
      textarea.placeholder = opts.placeholder || '';
      textarea.value = initialHtml ? stripHtml(initialHtml) : '';
      container.appendChild(textarea);
      return {
        getHtml: () => `<p>${escapeHtml(textarea.value).replace(/\n/g, '<br>')}</p>`,
        getText: () => textarea.value,
        setHtml: (html) => { textarea.value = stripHtml(html); },
        destroy: () => { container.innerHTML = ''; },
      };
    }

    container.innerHTML = '<div class="me-ql-toolbar"></div><div class="me-ql-editor"></div>';
    const toolbarEl = container.querySelector('.me-ql-toolbar');
    const editorEl = container.querySelector('.me-ql-editor');

    const quill = new window.Quill(editorEl, {
      theme: 'snow',
      placeholder: opts.placeholder || '',
      modules: {
        toolbar: {
          container: [
            [{ header: [2, 3, false] }],
            ['bold', 'italic', 'underline'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link'],
            ['clean'],
          ],
        },
      },
    });
    // Quill built its own toolbar DOM as a sibling before .me-ql-editor;
    // move it into our .me-ql-toolbar wrapper so the mousedown guard
    // below has one stable element to attach to regardless of Quill's
    // internal DOM structure.
    const builtToolbar = container.querySelector('.ql-toolbar');
    if (builtToolbar) toolbarEl.appendChild(builtToolbar);

    if (initialHtml) quill.root.innerHTML = initialHtml;

    // ── The scroll-jump fix itself ──
    // Find the real scrollable ancestor once, up front — it doesn't
    // change while the editor is mounted.
    const scrollEl = findScrollAncestor(container);

    // mousedown, not click, and capture phase: fires before Quill's own
    // click handling runs at all, so the snapshot is taken before
    // anything has a chance to scroll.
    toolbarEl.addEventListener('mousedown', () => guardScroll(scrollEl), true);
    // paste on the editor root, capture phase, registered ahead of any
    // of Quill's own paste listeners.
    quill.root.addEventListener('paste', () => guardScroll(scrollEl), true);

    return {
      getHtml: () => quill.root.innerHTML,
      getText: () => quill.getText(),
      setHtml: (html) => { quill.root.innerHTML = html || ''; },
      destroy: () => { container.innerHTML = ''; },
      quill,
    };
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || '';
  }

  window.MessageEditor = { mountRichEditor };
})();
