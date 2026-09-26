// ── editor.js — "Edit the words on the site" (Mare App 4). One plain
// screen: find a text, change the English and/or Dutch, Save. Live at
// once; "Back to original" always available. The server (texts.js)
// refuses anything that could break a page. ──
(function () {
  const t = (key, vars) => window.MareI18n.t(key, vars);
  const PAGE = 40;
  const GROUP_ORDER = ['home', 'teacher', 'club', 'shop', 'reader', 'talk', 'account', 'other'];
  let texts = [];
  let group = 'all';
  let shown = PAGE;

  function autoGrow(el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; }

  function filtered() {
    const q = document.getElementById('editor-search').value.trim().toLowerCase();
    const changedOnly = document.getElementById('editor-changed-only').checked;
    return texts.filter(x =>
      (group === 'all' || x.group === group) &&
      (!changedOnly || x.en !== null || x.nl !== null) &&
      (!q || [x.enOriginal, x.nlOriginal, x.en || '', x.nl || ''].some(s => s.toLowerCase().includes(q))));
  }

  async function save(x, locale, value, box) {
    const status = box.querySelector('.editor-status');
    status.className = 'editor-status';
    status.textContent = t('editorSaving');
    try {
      const res = await fetch('/api/editor/texts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: x.key, locale, text: value }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || t('errorGeneric'));
      const original = locale === 'en' ? x.enOriginal : x.nlOriginal;
      x[locale] = out.reset ? null : value.trim();
      status.classList.add('editor-status-ok');
      status.textContent = out.reset ? t('editorBackDone') : t('editorSaved');
      renderBox(x, locale, box, original);
    } catch (e) {
      status.classList.add('editor-status-err');
      status.textContent = e.message;
    }
  }

  function renderBox(x, locale, box, original) {
    const ta = box.querySelector('textarea');
    const saveBtn = box.querySelector('.editor-save');
    const backBtn = box.querySelector('.editor-back');
    const orig = box.querySelector('.editor-original');
    const current = x[locale] !== null ? x[locale] : original;
    ta.value = current;
    autoGrow(ta);
    const changed = x[locale] !== null;
    box.classList.toggle('editor-box-changed', changed);
    backBtn.hidden = !changed;
    orig.hidden = !changed;
    orig.textContent = `${t('editorOriginal')} ${original}`;
    saveBtn.disabled = true;
  }

  function card(x) {
    const div = document.createElement('div');
    div.className = 'editor-card';
    const where = document.createElement('span');
    where.className = 'editor-where';
    where.textContent = t(`editorGroup_${x.group}`);
    div.appendChild(where);
    const cols = document.createElement('div');
    cols.className = 'editor-cols';
    for (const locale of ['en', 'nl']) {
      const original = locale === 'en' ? x.enOriginal : x.nlOriginal;
      const box = document.createElement('div');
      box.className = 'editor-box';
      box.innerHTML = `
        <span class="editor-lang">${locale === 'en' ? 'English' : 'Nederlands'}</span>
        <textarea rows="1" maxlength="2000"></textarea>
        <p class="editor-original" hidden></p>
        <div class="editor-actions">
          <button type="button" class="btn-primary btn-small editor-save" disabled></button>
          <button type="button" class="btn-ghost btn-small editor-back" hidden></button>
          <span class="editor-status" role="status"></span>
        </div>`;
      box.querySelector('.editor-save').textContent = t('editorSave');
      box.querySelector('.editor-back').textContent = t('editorBack');
      const ta = box.querySelector('textarea');
      ta.addEventListener('input', () => {
        autoGrow(ta);
        const current = x[locale] !== null ? x[locale] : original;
        box.querySelector('.editor-save').disabled = ta.value.trim() === current.trim();
        box.querySelector('.editor-status').textContent = '';
      });
      box.querySelector('.editor-save').addEventListener('click', () => save(x, locale, ta.value, box));
      box.querySelector('.editor-back').addEventListener('click', () => save(x, locale, '', box));
      cols.appendChild(box);
      requestAnimationFrame(() => renderBox(x, locale, box, original));
    }
    div.appendChild(cols);
    return div;
  }

  function render() {
    const list = document.getElementById('editor-list');
    const items = filtered();
    list.innerHTML = '';
    items.slice(0, shown).forEach(x => list.appendChild(card(x)));
    document.getElementById('editor-count').textContent = t('editorCount', { n: items.length });
    document.getElementById('editor-more').hidden = items.length <= shown;
  }

  function renderGroups() {
    const box = document.getElementById('editor-groups');
    box.innerHTML = '';
    ['all', ...GROUP_ORDER].forEach(g => {
      if (g !== 'all' && !texts.some(x => x.group === g)) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'editor-chip' + (g === group ? ' active' : '');
      b.textContent = t(`editorGroup_${g}`);
      b.addEventListener('click', () => { group = g; shown = PAGE; renderGroups(); render(); });
      box.appendChild(b);
    });
  }

  async function init() {
    await window.MareI18n.ready;
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });
    document.getElementById('editor-search').placeholder = t('editorSearch');
    document.getElementById('editor-signout').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/admin.html';
    });

    const res = await fetch('/api/editor/texts');
    if (!res.ok) {
      document.getElementById('editor-denied').hidden = false;
      setTimeout(() => { window.location.href = '/admin.html'; }, 1500);
      return;
    }
    texts = (await res.json()).texts || [];
    let timer;
    document.getElementById('editor-search').addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { shown = PAGE; render(); }, 200);
    });
    document.getElementById('editor-changed-only').addEventListener('change', () => { shown = PAGE; render(); });
    document.getElementById('editor-more').addEventListener('click', () => { shown += PAGE; render(); });
    renderGroups();
    render();
  }
  init();
})();
