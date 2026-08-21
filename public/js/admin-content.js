(function () {
  const t = (key, vars) => window.MareI18n.t(key, vars);

  let currentUser = null;
  let books = [];
  let bookTree = null; // { book, chapters: [{ ...chapter, scenes: [{ ...scene, hotspots, audioCues, sentences }] }] }
  let currentChapterId = null;
  let currentSceneId = null;
  let selectedHotspotId = null;
  const urlCache = new Map();

  const els = {};
  function cacheEls() {
    document.querySelectorAll('[id]').forEach(el => { els[el.id] = el; });
  }

  async function api(path, options) {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.data = data; throw err; }
    return data;
  }

  async function resolveUrl(key) {
    if (!key) return null;
    if (urlCache.has(key)) return urlCache.get(key);
    const data = await api(`/api/playback-url?key=${encodeURIComponent(key)}`);
    urlCache.set(key, data.url);
    return data.url;
  }

  // Presigned direct-to-R2 upload — same pattern already proven for
  // teacher resources: get a presigned PUT URL, upload the file
  // straight to R2 (never through this server), store the resulting key.
  async function uploadFile(file, prefix) {
    const key = `${prefix}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { url } = await api('/api/admin/upload-url', {
      method: 'POST',
      body: JSON.stringify({ key, contentType: file.type || 'application/octet-stream' }),
    });
    const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    if (!putRes.ok) throw new Error('Upload failed');
    urlCache.delete(key);
    return key;
  }

  function setupLangSwitch() {
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });
  }

  // ── Auth ──
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
  function setupLogin() {
    els['admin-login-form'].addEventListener('submit', async (e) => {
      e.preventDefault();
      els['login-error'].hidden = true;
      try {
        await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: els['f-email'].value.trim(), password: els['f-password'].value }) });
        const user = await checkSession();
        if (user) enterApp(user);
      } catch {
        els['login-error'].textContent = t('errorInvalidCredentials');
        els['login-error'].hidden = false;
      }
    });
  }

  function enterApp(user) {
    currentUser = user;
    els['login-view'].hidden = true;
    els['book-bar'].hidden = false;
    els['who-pill'].hidden = false;
    els['who-pill'].textContent = user.name;
    loadBooks();
  }

  // ── Books ──
  async function loadBooks() {
    const data = await api('/api/admin/books');
    books = data.books || [];
    els['book-select'].innerHTML = '';
    books.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.title} (${b.locale})`;
      els['book-select'].appendChild(opt);
    });
    if (books.length) selectBook(books[0].id);
  }
  function setupBookPicker() {
    els['book-select'].addEventListener('change', () => selectBook(els['book-select'].value));
    els['new-book-btn'].addEventListener('click', () => { els['new-book-modal'].hidden = false; });
    els['nb-cancel-btn'].addEventListener('click', () => { els['new-book-modal'].hidden = true; });
    els['nb-save-btn'].addEventListener('click', async () => {
      els['nb-error'].hidden = true;
      const title = els['nb-title'].value.trim();
      const slug = els['nb-slug'].value.trim();
      const description = els['nb-description'].value.trim();
      if (!title || !slug) { els['nb-error'].textContent = t('acErrorTitleSlugRequired'); els['nb-error'].hidden = false; return; }
      try {
        const data = await api('/api/admin/books', { method: 'POST', body: JSON.stringify({ title, slug, description }) });
        els['new-book-modal'].hidden = true;
        els['nb-title'].value = ''; els['nb-slug'].value = ''; els['nb-description'].value = '';
        await loadBooks();
        els['book-select'].value = data.id;
        selectBook(data.id);
      } catch (err) {
        els['nb-error'].textContent = err.message || t('acErrorGeneric');
        els['nb-error'].hidden = false;
      }
    });
  }

  async function selectBook(bookId) {
    bookTree = await api(`/api/admin/books/${bookId}/full`);
    currentChapterId = null;
    els['tree-view'].hidden = false;
    els['scene-editor'].hidden = true;
    renderChapters();
    els['scene-grid'].innerHTML = '';
    els['scenes-col-title'].textContent = t('acScenes');
    els['add-scene-btn'].disabled = true;
  }

  // ── Chapters ──
  function renderChapters() {
    const list = els['chapter-list'];
    list.innerHTML = '';
    bookTree.chapters.forEach(ch => {
      const card = document.createElement('div');
      card.className = 'ac-chapter-card';
      card.draggable = true;
      card.dataset.chapterId = ch.id;
      card.classList.toggle('selected', ch.id === currentChapterId);

      const title = document.createElement('span');
      title.className = 'ac-chapter-card-title';
      title.textContent = ch.title;
      title.addEventListener('click', () => selectChapter(ch.id));
      card.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'ac-chapter-card-actions';
      const renameBtn = document.createElement('button');
      renameBtn.className = 'ac-mini-btn';
      renameBtn.textContent = '\u270e';
      renameBtn.title = t('acRename');
      renameBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newTitle = prompt(t('acRenameChapterPrompt'), ch.title);
        if (newTitle && newTitle.trim() && newTitle !== ch.title) {
          await api(`/api/admin/chapters/${ch.id}`, { method: 'PATCH', body: JSON.stringify({ title: newTitle.trim() }) });
          ch.title = newTitle.trim();
          renderChapters();
        }
      });
      actions.appendChild(renameBtn);
      const delBtn = document.createElement('button');
      delBtn.className = 'ac-mini-btn danger';
      delBtn.textContent = '\u00d7';
      delBtn.title = t('adminDelete');
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(t('acConfirmDeleteChapter', { title: ch.title }))) return;
        await api(`/api/admin/chapters/${ch.id}`, { method: 'DELETE' });
        await selectBook(bookTree.book.id);
      });
      actions.appendChild(delBtn);
      card.appendChild(actions);

      setupDrag(card, list, async () => {
        const orderedIds = Array.from(list.children).map(c => c.dataset.chapterId);
        await api('/api/admin/chapters/reorder', { method: 'POST', body: JSON.stringify({ bookId: bookTree.book.id, orderedIds }) });
        bookTree.chapters.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
      });

      list.appendChild(card);
    });
  }

  function selectChapter(chapterId) {
    currentChapterId = chapterId;
    renderChapters();
    els['add-scene-btn'].disabled = false;
    const chapter = bookTree.chapters.find(c => c.id === chapterId);
    els['scenes-col-title'].textContent = chapter.title;
    renderScenes(chapter);
  }

  function setupAddChapter() {
    els['add-chapter-btn'].addEventListener('click', () => { els['new-chapter-modal'].hidden = false; });
    els['nc-cancel-btn'].addEventListener('click', () => { els['new-chapter-modal'].hidden = true; });
    els['nc-save-btn'].addEventListener('click', async () => {
      els['nc-error'].hidden = true;
      const title = els['nc-title'].value.trim();
      if (!title) { els['nc-error'].textContent = t('acErrorTitleRequired'); els['nc-error'].hidden = false; return; }
      const data = await api('/api/admin/chapters', { method: 'POST', body: JSON.stringify({ bookId: bookTree.book.id, title }) });
      els['new-chapter-modal'].hidden = true;
      els['nc-title'].value = '';
      await selectBook(bookTree.book.id);
      selectChapter(data.id);
    });
  }

  // ── Scenes ──
  async function renderScenes(chapter) {
    const grid = els['scene-grid'];
    grid.innerHTML = '';
    for (const scene of chapter.scenes) {
      const card = document.createElement('div');
      card.className = 'ac-scene-card';
      card.draggable = true;
      card.dataset.sceneId = scene.id;

      if (scene.image_key) {
        const img = document.createElement('img');
        img.className = 'ac-scene-thumb';
        resolveUrl(scene.image_key).then(url => { if (url) img.src = url; });
        card.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'ac-scene-thumb ac-scene-empty-thumb';
        placeholder.textContent = t('acNoImage');
        card.appendChild(placeholder);
      }

      const label = document.createElement('div');
      label.className = 'ac-scene-card-label';
      const kindSpan = document.createElement('span');
      kindSpan.textContent = scene.kind;
      label.appendChild(kindSpan);
      const delBtn = document.createElement('button');
      delBtn.className = 'ac-mini-btn danger';
      delBtn.textContent = '\u00d7';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(t('acConfirmDeleteScene'))) return;
        await api(`/api/admin/scenes/${scene.id}`, { method: 'DELETE' });
        await selectBook(bookTree.book.id);
        selectChapter(chapter.id);
      });
      label.appendChild(delBtn);
      card.appendChild(label);

      card.addEventListener('click', (e) => {
        if (e.target === delBtn) return;
        openSceneEditor(scene.id);
      });

      setupDrag(card, grid, async () => {
        const orderedIds = Array.from(grid.children).map(c => c.dataset.sceneId);
        await api('/api/admin/scenes/reorder', { method: 'POST', body: JSON.stringify({ chapterId: chapter.id, orderedIds }) });
        chapter.scenes.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
      });

      grid.appendChild(card);
    }
  }

  function setupAddScene() {
    els['add-scene-btn'].addEventListener('click', async () => {
      if (!currentChapterId) return;
      const data = await api('/api/admin/scenes', { method: 'POST', body: JSON.stringify({ chapterId: currentChapterId, kind: 'opening' }) });
      await selectBook(bookTree.book.id);
      selectChapter(currentChapterId);
      openSceneEditor(data.id);
    });
  }

  // ── Generic HTML5 drag-and-drop reorder — same standard pattern
  // per_bot's own carousel/lesson-file reordering uses: dragover tells
  // you where you'd land (so what you see while dragging IS the new
  // order already), drop just persists whatever the DOM already shows. ──
  function setupDrag(card, container, onDrop) {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend', async () => {
      card.classList.remove('dragging');
      await onDrop();
    });
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = container.querySelector('.dragging');
      if (!dragging) return;
      const after = [...container.children].find(child => {
        if (child === dragging) return false;
        const rect = child.getBoundingClientRect();
        return e.clientY <= rect.top + rect.height / 2 || e.clientX <= rect.left + rect.width / 2;
      });
      if (after) container.insertBefore(dragging, after);
      else container.appendChild(dragging);
    });
  }

  // ── Scene editor ──
  function findScene(sceneId) {
    for (const ch of bookTree.chapters) {
      const scene = ch.scenes.find(s => s.id === sceneId);
      if (scene) return { chapter: ch, scene };
    }
    return null;
  }

  function openSceneEditor(sceneId) {
    currentSceneId = sceneId;
    selectedHotspotId = null;
    els['tree-view'].hidden = true;
    els['scene-editor'].hidden = false;
    renderSceneEditor();
  }

  async function renderSceneEditor() {
    const { scene } = findScene(currentSceneId);

    // Image
    if (scene.image_key) {
      const url = await resolveUrl(scene.image_key);
      els['scene-canvas-image'].src = url || '';
      els['scene-canvas-image'].hidden = false;
      els['image-dropzone-hint'].hidden = true;
    } else {
      els['scene-canvas-image'].hidden = true;
      els['image-dropzone-hint'].hidden = false;
    }
    renderHotspotMarkers(scene);
    clearHotspotPanel();

    // Narration
    if (scene.narration_audio_key) {
      const url = await resolveUrl(scene.narration_audio_key);
      els['narration-preview'].src = url || '';
      els['narration-preview'].hidden = false;
      els['narration-status'].textContent = t('acNarrationUploaded');
    } else {
      els['narration-preview'].hidden = true;
      els['narration-status'].textContent = '';
    }
    renderSentences(scene.sentences || []);
    renderAudioCues(scene.audioCues || []);
  }

  // ── Image upload ──
  function setupImageUpload() {
    const zone = els['image-dropzone'];
    zone.addEventListener('click', (e) => {
      if (e.target.closest('.ac-canvas-hotspot')) return;
      els['image-file-input'].click();
    });
    els['image-file-input'].addEventListener('change', () => {
      const file = els['image-file-input'].files[0];
      if (file) handleImageFile(file);
    });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleImageFile(file);
    });
  }
  async function handleImageFile(file) {
    els['image-dropzone-hint'].textContent = t('acUploading');
    els['image-dropzone-hint'].hidden = false;
    const key = await uploadFile(file, 'scenes/images');
    await api(`/api/admin/scenes/${currentSceneId}/image`, { method: 'PATCH', body: JSON.stringify({ imageKey: key }) });
    findScene(currentSceneId).scene.image_key = key;
    renderSceneEditor();
  }

  // ── Hotspot canvas ──
  function renderHotspotMarkers(scene) {
    const layer = els['hotspot-canvas-layer'];
    layer.innerHTML = '';
    (scene.hotspots || []).forEach(h => {
      const marker = document.createElement('div');
      marker.className = 'ac-canvas-hotspot';
      marker.style.left = `${h.x * 100}%`;
      marker.style.top = `${h.y * 100}%`;
      marker.style.width = `${h.w * 100}%`;
      marker.style.height = `${h.h * 100}%`;
      marker.dataset.hotspotId = h.id;
      marker.classList.toggle('selected', h.id === selectedHotspotId);
      setupHotspotDrag(marker, h);
      layer.appendChild(marker);
    });
  }

  function setupHotspotDrag(marker, hotspot) {
    let dragging = false;
    let moved = false;
    marker.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      dragging = true;
      moved = false;
      marker.classList.add('dragging');
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      moved = true;
      const rect = els['image-dropzone'].getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      marker.style.left = `${x * 100}%`;
      marker.style.top = `${y * 100}%`;
      marker._pendingX = x;
      marker._pendingY = y;
    });
    document.addEventListener('mouseup', async () => {
      if (!dragging) return;
      dragging = false;
      marker.classList.remove('dragging');
      if (moved && marker._pendingX !== undefined) {
        hotspot.x = marker._pendingX;
        hotspot.y = marker._pendingY;
        await api(`/api/admin/hotspots/${hotspot.id}`, { method: 'PATCH', body: JSON.stringify({ x: hotspot.x, y: hotspot.y }) });
      }
      if (!moved) selectHotspot(hotspot.id);
    });
  }

  function setupCanvasClickToCreate() {
    els['image-dropzone'].addEventListener('click', async (e) => {
      if (e.target.closest('.ac-canvas-hotspot')) return;
      if (!findScene(currentSceneId).scene.image_key) return; // click handled by upload trigger instead
      const rect = els['image-dropzone'].getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const data = await api('/api/admin/hotspots', {
        method: 'POST',
        body: JSON.stringify({ sceneId: currentSceneId, x, y, w: 0.08, h: 0.08, type: 'popup', payload: { text: '' } }),
      });
      const { scene } = findScene(currentSceneId);
      scene.hotspots = scene.hotspots || [];
      scene.hotspots.push({ id: data.id, scene_id: currentSceneId, x, y, w: 0.08, h: 0.08, type: 'popup', payload_json: '{"text":""}', active: 1 });
      renderHotspotMarkers(scene);
      selectHotspot(data.id);
    });
  }

  function selectHotspot(hotspotId) {
    selectedHotspotId = hotspotId;
    const { scene } = findScene(currentSceneId);
    renderHotspotMarkers(scene);
    const hotspot = scene.hotspots.find(h => h.id === hotspotId);
    if (!hotspot) return clearHotspotPanel();
    let payload = {};
    try { payload = JSON.parse(hotspot.payload_json || '{}'); } catch { /* fall back to empty */ }
    els['hotspot-panel'].hidden = false;
    els['hotspot-panel-empty'].hidden = true;
    els['hs-type'].value = hotspot.type;
    els['hs-text'].value = payload.text || '';
    els['hs-w'].value = hotspot.w;
    els['hs-h'].value = hotspot.h;
    updateHotspotTypeFields();
    els['hs-sound-status'].textContent = payload.audioKey ? t('acSoundFileSet') : '';
  }
  function clearHotspotPanel() {
    selectedHotspotId = null;
    els['hotspot-panel'].hidden = true;
    els['hotspot-panel-empty'].hidden = false;
  }
  function updateHotspotTypeFields() {
    const type = els['hs-type'].value;
    els['hs-popup-fields'].hidden = type !== 'popup';
    els['hs-sound-fields'].hidden = type !== 'sound';
  }

  function setupHotspotPanel() {
    els['hs-type'].addEventListener('change', updateHotspotTypeFields);
    els['hs-save-btn'].addEventListener('click', async () => {
      if (!selectedHotspotId) return;
      const { scene } = findScene(currentSceneId);
      const hotspot = scene.hotspots.find(h => h.id === selectedHotspotId);
      const type = els['hs-type'].value;
      let payload = {};
      if (type === 'popup') {
        payload = { text: els['hs-text'].value.trim() };
      } else if (type === 'sound') {
        const file = els['hs-sound-file'].files[0];
        let payloadPrev = {};
        try { payloadPrev = JSON.parse(hotspot.payload_json || '{}'); } catch { /* keep empty */ }
        payload = { audioKey: payloadPrev.audioKey };
        if (file) {
          els['hs-sound-status'].textContent = t('acUploading');
          payload.audioKey = await uploadFile(file, 'scenes/sfx');
        }
      }
      const body = { type, w: parseFloat(els['hs-w'].value), h: parseFloat(els['hs-h'].value), payload };
      await api(`/api/admin/hotspots/${selectedHotspotId}`, { method: 'PATCH', body: JSON.stringify(body) });
      hotspot.type = type;
      hotspot.w = body.w;
      hotspot.h = body.h;
      hotspot.payload_json = JSON.stringify(payload);
      renderHotspotMarkers(scene);
      els['hs-sound-status'].textContent = payload.audioKey ? t('acSoundFileSet') : '';
    });
    els['hs-delete-btn'].addEventListener('click', async () => {
      if (!selectedHotspotId) return;
      await api(`/api/admin/hotspots/${selectedHotspotId}`, { method: 'DELETE' });
      const { scene } = findScene(currentSceneId);
      scene.hotspots = scene.hotspots.filter(h => h.id !== selectedHotspotId);
      clearHotspotPanel();
      renderHotspotMarkers(scene);
    });
  }

  // ── Narration ──
  function setupNarrationUpload() {
    const zone = els['narration-dropzone'];
    zone.addEventListener('click', () => els['narration-file-input'].click());
    els['narration-file-input'].addEventListener('change', () => {
      const file = els['narration-file-input'].files[0];
      if (file) handleNarrationFile(file);
    });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleNarrationFile(file);
    });
  }
  async function handleNarrationFile(file) {
    els['narration-status'].textContent = t('acUploading');
    const key = await uploadFile(file, 'scenes/narration');
    await api(`/api/admin/scenes/${currentSceneId}/narration-audio`, { method: 'PATCH', body: JSON.stringify({ audioKey: key }) });
    findScene(currentSceneId).scene.narration_audio_key = key;
    renderSceneEditor();
  }
  function setupSyncNarration() {
    els['sync-narration-btn'].addEventListener('click', async () => {
      const { scene } = findScene(currentSceneId);
      if (!scene.narration_audio_key) { alert(t('acErrorNoNarrationYet')); return; }
      els['sync-narration-btn'].disabled = true;
      els['sync-narration-btn'].textContent = t('acSyncing');
      try {
        const data = await api(`/api/admin/scenes/${currentSceneId}/sync-narration`, {
          method: 'POST', body: JSON.stringify({ audioKey: scene.narration_audio_key }),
        });
        scene.sentences = data.sentences || [];
        renderSentences(scene.sentences);
      } catch (err) {
        alert(err.message || t('acErrorGeneric'));
      } finally {
        els['sync-narration-btn'].disabled = false;
        els['sync-narration-btn'].textContent = t('acSyncNarration');
      }
    });
  }
  function renderSentences(sentences) {
    const container = els['sentence-list'];
    container.innerHTML = '';
    sentences.forEach(s => {
      const row = document.createElement('div');
      row.className = 'ac-sentence-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = s.text;
      input.addEventListener('blur', async () => {
        if (input.value !== s.text) {
          s.text = input.value;
          await api(`/api/admin/narration-sentences/${s.id}`, { method: 'PATCH', body: JSON.stringify({ text: s.text }) });
        }
      });
      row.appendChild(input);
      const timing = document.createElement('span');
      timing.className = 'ac-sentence-timing';
      timing.textContent = `${(s.start_ms / 1000).toFixed(1)}s\u2013${(s.end_ms / 1000).toFixed(1)}s`;
      row.appendChild(timing);
      container.appendChild(row);
    });
  }

  // ── Audio cues ──
  function renderAudioCues(cues) {
    const container = els['audio-cue-list'];
    container.innerHTML = '';
    if (!cues.length) {
      const p = document.createElement('p');
      p.className = 'ac-hint-text';
      p.textContent = t('acNoCuesYet');
      container.appendChild(p);
      return;
    }
    cues.forEach(cue => {
      const row = document.createElement('div');
      row.className = 'ac-cue-row';
      const label = document.createElement('span');
      label.textContent = `${cue.kind === 'music' ? t('acCueMusic') : t('acCueSfx')} \u2014 ${(cue.start_ms / 1000).toFixed(1)}s, vol ${cue.volume}`;
      row.appendChild(label);
      const delBtn = document.createElement('button');
      delBtn.className = 'ac-mini-btn danger';
      delBtn.textContent = t('adminDelete');
      delBtn.addEventListener('click', async () => {
        await api(`/api/admin/audio-cues/${cue.id}`, { method: 'DELETE' });
        const { scene } = findScene(currentSceneId);
        scene.audioCues = scene.audioCues.filter(c => c.id !== cue.id);
        renderAudioCues(scene.audioCues);
      });
      row.appendChild(delBtn);
      container.appendChild(row);
    });
  }
  function setupAddCue() {
    els['add-cue-toggle'].addEventListener('click', () => { els['add-cue-form'].hidden = !els['add-cue-form'].hidden; });
    els['cancel-cue-btn'].addEventListener('click', () => { els['add-cue-form'].hidden = true; els['add-cue-form'].reset(); });
    els['add-cue-form'].addEventListener('submit', async (e) => {
      e.preventDefault();
      els['cue-error'].hidden = true;
      const file = els['cue-file-input'].files[0];
      if (!file) { els['cue-error'].textContent = t('acErrorFileRequired'); els['cue-error'].hidden = false; return; }
      try {
        const key = await uploadFile(file, 'scenes/audio-cues');
        const data = await api('/api/admin/audio-cues', {
          method: 'POST',
          body: JSON.stringify({
            sceneId: currentSceneId,
            kind: els['cue-kind'].value,
            audioKey: key,
            startMs: parseInt(els['cue-start-ms'].value, 10) || 0,
            volume: parseFloat(els['cue-volume'].value),
            loop: els['cue-kind'].value === 'music',
          }),
        });
        const { scene } = findScene(currentSceneId);
        scene.audioCues = scene.audioCues || [];
        scene.audioCues.push({ id: data.id, kind: els['cue-kind'].value, start_ms: parseInt(els['cue-start-ms'].value, 10) || 0, volume: parseFloat(els['cue-volume'].value) });
        renderAudioCues(scene.audioCues);
        els['add-cue-form'].hidden = true;
        els['add-cue-form'].reset();
      } catch (err) {
        els['cue-error'].textContent = err.message || t('acErrorGeneric');
        els['cue-error'].hidden = false;
      }
    });
  }

  function setupEditorBack() {
    els['editor-back-btn'].addEventListener('click', () => {
      els['scene-editor'].hidden = true;
      els['tree-view'].hidden = false;
    });
  }

  // ── Boot ──
  async function init() {
    cacheEls();
    await window.MareI18n.ready;
    setupLangSwitch();
    setupLogin();
    setupBookPicker();
    setupAddChapter();
    setupAddScene();
    setupImageUpload();
    setupCanvasClickToCreate();
    setupHotspotPanel();
    setupNarrationUpload();
    setupSyncNarration();
    setupAddCue();
    setupEditorBack();

    const user = await checkSession();
    if (user && (user.role === 'admin' || user.role === 'support')) enterApp(user);
  }
  init();
})();
