(function () {
  let currentUser = null;
  const t = (key, vars) => window.MareI18n.t(key, vars);

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

  async function api(path, options) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function setupLangSwitch() {
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });
  }

  // ── Login ──
  function showError(id, message) {
    const el = document.getElementById(id);
    el.textContent = message;
    el.hidden = false;
  }
  function clearError(id) {
    document.getElementById(id).hidden = true;
  }

  // Server error strings -> translation keys, same pattern as login.js,
  // so a Dutch-language admin session never sees a raw English message.
  const SERVER_ERROR_MAP = {
    'Invalid email or password': 'errorInvalidCredentials',
    'Email already registered': 'errorEmailTaken',
    'Password must be at least 8 characters': 'errorPasswordTooShort',
    'Missing fields': 'errorMissingFields',
  };

  // ── Forgot password ──
  function setupForgotPassword() {
    document.getElementById('forgot-link').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('admin-login-form').hidden = true;
      document.getElementById('admin-forgot-wrap').hidden = true;
      document.getElementById('forgot-form').hidden = false;
      document.getElementById('forgot-success').hidden = true;
    });
    document.getElementById('back-to-login-link').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('forgot-form').hidden = true;
      document.getElementById('admin-login-form').hidden = false;
      document.getElementById('admin-forgot-wrap').hidden = false;
    });
    document.getElementById('forgot-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      document.getElementById('forgot-error').hidden = true;
      const email = document.getElementById('fp-email').value.trim();
      const btn = document.getElementById('forgot-submit-btn');
      btn.disabled = true;
      try {
        await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role: 'admin' }),
        });
        document.getElementById('forgot-success').hidden = false;
        document.getElementById('forgot-form').querySelector('.field').hidden = true;
        btn.hidden = true;
      } catch {
        document.getElementById('forgot-error').textContent = t('errorGeneric');
        document.getElementById('forgot-error').hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  function setupLoginForm() {
    document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('form-error');
      const email = document.getElementById('f-email').value.trim();
      const password = document.getElementById('f-password').value;
      const submitBtn = document.getElementById('submit-btn');
      submitBtn.disabled = true;
      try {
        // Shared sign-in (Mare App 4): goes to the right page for the
        // account (admin reloads here, editors go to /editor.html), or
        // asks which one when the details match several accounts.
        const out = await window.MareLogin.signIn(email, password);
        if (out.error) showError('form-error', t(SERVER_ERROR_MAP[out.error] || 'errorGeneric'));
        if (!out.ok) submitBtn.disabled = false;
      } catch (err) {
        showError('form-error', t(SERVER_ERROR_MAP[err.message] || 'errorGeneric'));
        submitBtn.disabled = false;
      }
    });

    document.getElementById('sign-out-btn').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/admin.html';
    });
  }

  // ── Dashboard shell ──
  function enterDashboard(user) {
    document.getElementById('login-view').hidden = true;
    document.getElementById('dashboard-view').hidden = false;
    // Dashboard interiors stay on the plain, readable light background —
    // the atmosphere (slideshow + dark glass card) is for the login gate
    // only, not for reading tables and forms once you're actually
    // working. See the .auth-atmosphere comment in day.css.
    document.body.classList.remove('auth-atmosphere');
    const pill = document.getElementById('who-pill');
    pill.hidden = false;
    pill.textContent = `${user.name} · ${t(user.role === 'admin' ? 'staffRoleAdmin' : (user.role === 'editor' ? 'staffRoleEditor' : 'staffRoleSupport'))}`;
    pill.classList.toggle('admin', user.role === 'admin');
    document.getElementById('sign-out-btn').hidden = false;

    const isAdmin = user.role === 'admin';
    document.querySelectorAll('.admin-only-tab').forEach(el => { el.hidden = !isAdmin; });

    setupTabs();
    setupBroadcastModal();
    setupWhatsNewModal();
    setupOfferModal();
    setupShowcaseWelcome();
    setupShowcaseVideo();
    setupTileModal();
    setupPhraseModal();
    setupBulkImport();
    setupAddTeacherForm();
    setupClubMarePostModal();
    setupProductModal();
    setupShipping();
    setupHomeNotice();
    setupWhisper();
    setupTextChanges();
    setupMarePosts();
    setupRiddles();
    setupAdminSettings();
    loadOverview();
    loadResources();
    loadPages();
    loadDirectory();
    loadAdminSettings();
    loadSocialLinks();
    loadMarketingHistory();
    loadBroadcasts();
    loadWhatsNew();
    loadOffers();
    loadBookAmazon();
    loadProducts();
    loadShipping();
    loadHomeNotice();
    loadWhisper();
    loadTextChanges();
    loadMarePosts();
    loadRiddles();
    loadMarketingStats();
    loadShowcaseContent();
    loadShowcaseTiles();
    loadShowcasePhrases();
    loadClubMareMembers();
    loadClubMarePosts();
    loadClubMareStats();
    loadCompanionAdmin();
    if (isAdmin) loadStaff();
    if (isAdmin) loadEmailLog();
    if (isAdmin) setupClearEmailLog();
    if (isAdmin) setupBackups();
    if (isAdmin) loadBackups();
  }

  function setupTabs() {
    document.querySelectorAll('#admin-tabs .admin-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.hidden) return;
        document.querySelectorAll('#admin-tabs .admin-tab').forEach(b => b.classList.toggle('active', b === btn));
        const target = btn.getAttribute('data-tab');
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${target}`));
        // Data loaded once on page load goes stale the moment an action
        // elsewhere (add teacher, resend invite, suspend) changes it —
        // refresh the tab's own data every time it's switched into,
        // rather than making the admin manually reload the page to see
        // their own action reflected.
        if (target === 'emaillog' && currentUser && currentUser.role === 'admin') loadEmailLog();
        if (target === 'backups' && currentUser && currentUser.role === 'admin') loadBackups();
        if (target === 'directory') { loadDirectory(); loadAdminSettings(); }
        if (target === 'companion') { loadCompanionAdmin(); loadPictures(); }
      });
    });
  }

  // ── Overview ──
  async function loadOverview() {
    try {
      const data = await api('/api/admin/books');
      document.getElementById('book-count-note').textContent =
        t('adminBookCount', { count: (data.books || []).length });
    } catch {
      document.getElementById('book-count-note').textContent = t('adminCouldNotLoadBookCount');
    }
    if (currentUser && currentUser.role === 'admin') {
      document.getElementById('products-note-card').hidden = false;
    }
    await loadStatsGrid();
  }

  async function loadStatsGrid() {
    const grid = document.getElementById('stat-grid');
    try {
      const stats = await api('/api/admin/report/overview');
      const isAdmin = currentUser && currentUser.role === 'admin';
      const items = [
        { kind: 'parents', label: t('adminStatParents'), value: stats.parents, sub: stats.suspendedParents ? t('adminStatSuspended', { count: stats.suspendedParents }) : null },
        { kind: 'children', label: t('adminStatChildren'), value: stats.children },
        { kind: 'teachers', label: t('adminStatTeachers'), value: stats.teachers, sub: stats.suspendedTeachers ? t('adminStatSuspended', { count: stats.suspendedTeachers }) : null },
        { kind: 'talk', label: t('adminStatTalkSessions7d'), value: stats.talkSessions7d, sub: t('adminStatTalkSessionsTotal', { count: stats.talkSessionsTotal }) },
        { kind: isAdmin ? 'orders' : null, label: t('adminStatOrders'), value: stats.ordersPaid, sub: t('adminStatOrdersTotal', { count: stats.ordersTotal }) },
        { kind: 'club', label: t('adminStatClubMembers'), value: stats.clubMembers },
        { kind: isAdmin ? 'emails' : null, label: t('adminStatEmailSent'), value: stats.email.sent, sub: stats.email.failed ? t('adminStatEmailFailed', { count: stats.email.failed }) : null },
      ];
      // Mare App 5 — each box is a button that opens the list behind it.
      grid.innerHTML = items.map(item => `
        <${item.kind ? `button type="button" data-kind="${item.kind}"` : 'div'} class="stat-item${item.kind ? ' stat-item-link' : ''}${statDetailKind && statDetailKind === item.kind ? ' active' : ''}">
          <div class="stat-value">${escapeHtml(String(item.value))}</div>
          <div class="stat-label">${escapeHtml(item.label)}</div>
          ${item.sub ? `<div class="stat-sub">${escapeHtml(item.sub)}</div>` : ''}
        </${item.kind ? 'button' : 'div'}>
      `).join('');
      grid.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => openStatDetail(b.getAttribute('data-kind'))));
    } catch {
      grid.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadStats'))}</p>`;
    }
  }

  // ── Mare App 5 — "At a glance" detail lists ──
  let statDetailKind = null;
  function goToTab(tab) {
    const btn = document.querySelector(`#admin-tabs .admin-tab[data-tab="${tab}"]`);
    if (btn && !btn.hidden) { btn.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }
  function fmtDate(v) {
    if (!v) return '';
    const d = new Date(String(v).replace(' ', 'T') + (String(v).includes('Z') ? '' : 'Z'));
    if (isNaN(d)) return String(v);
    return d.toLocaleString(window.MareI18n.locale === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fmtMoney(cents, cur) {
    const sym = { gbp: '£', eur: '€', usd: '$' }[String(cur || 'gbp').toLowerCase()] || '';
    return `${sym}${((cents || 0) / 100).toFixed(2)}`;
  }
  const yes = (v) => (v ? t('adminYes') : '—');
  const STAT_COLUMNS = {
    parents: { title: 'adminStatParents', tab: 'directory', cols: [
      ['adminFieldName', r => r.name], ['adminFieldEmail', r => r.email], ['adminStatColChildren', r => r.children || '—'],
      ['adminStatColClub', r => r.club_tier ? t(r.club_tier > 1 ? 'adminStatClubPaid' : 'adminStatClubFree') : '—'],
      ['adminStatColLetter', r => yes(r.letter_on)], ['adminFieldStatus', r => t(r.status === 'suspended' ? 'adminStatusSuspended' : 'adminStatusActive')],
      ['adminStatColJoined', r => fmtDate(r.created_at)]] },
    children: { title: 'adminStatChildren', tab: 'directory', cols: [
      ['adminStatColFirstName', r => r.name], ['adminStatColAge', r => r.age_band ? String(r.age_band).replace('-', '–') : '—'],
      ['adminStatColParent', r => r.parent_name ? `${r.parent_name} (${r.parent_email})` : '—'], ['adminStatColJoined', r => fmtDate(r.created_at)]] },
    teachers: { title: 'adminStatTeachers', tab: 'directory', cols: [
      ['adminFieldName', r => r.name], ['adminFieldEmail', r => r.email], ['adminStatColSchool', r => r.school || '—'],
      ['adminFieldStatus', r => t(r.status === 'suspended' ? 'adminStatusSuspended' : 'adminStatusActive')], ['adminStatColJoined', r => fmtDate(r.created_at)]] },
    talk: { title: 'adminStatTalkTitle', cols: [
      ['adminStatColStarted', r => fmtDate(r.started_at)], ['adminStatColChild', r => r.child_name || '—'], ['adminStatColParent', r => r.parent_name || '—'],
      ['adminStatColTurns', r => String(r.turn_count || 0)], ['adminStatColLang', r => String(r.locale || '').toUpperCase()], ['adminStatColLast', r => fmtDate(r.last_activity_at)]] },
    orders: { title: 'adminStatOrdersTitle', cols: [
      ['adminStatColDate', r => fmtDate(r.created_at)], ['adminFieldStatus', r => t('adminOrderStatus_' + (r.status || 'pending'))],
      ['adminFieldName', r => r.name || '—'], ['adminFieldEmail', r => r.email || '—'], ['adminStatColItems', r => r.items || '—'],
      ['adminStatColTotal', r => fmtMoney(r.total_cents, r.currency) + (r.shipping_cents ? ` (${t('adminStatInclPostage', { amount: fmtMoney(r.shipping_cents, r.currency) })})` : '')],
      ['adminStatColCountry', r => r.shipping_country || '—']] },
    club: { title: 'adminStatClubMembers', cols: [
      ['adminFieldName', r => r.name || '—'], ['adminFieldEmail', r => r.email || '—'], ['adminStatColChildren', r => r.children || '—'],
      ['adminStatColClub', r => t(r.tier > 1 ? 'adminStatClubPaid' : 'adminStatClubFree')], ['adminStatColLetter', r => yes(r.letter_on)],
      ['adminStatColJoined', r => fmtDate(r.joined_at)]] },
  };
  async function openStatDetail(kind) {
    const box = document.getElementById('stat-detail');
    if (kind === 'emails') { goToTab('emaillog'); return; }
    if (statDetailKind === kind && !box.hidden) { closeStatDetail(); return; }
    const def = STAT_COLUMNS[kind];
    if (!def) return;
    statDetailKind = kind;
    document.querySelectorAll('#stat-grid [data-kind]').forEach(b => b.classList.toggle('active', b.getAttribute('data-kind') === kind));
    document.getElementById('stat-detail-title').textContent = t(def.title);
    const openBtn = document.getElementById('stat-detail-open');
    openBtn.hidden = !def.tab;
    if (def.tab) { openBtn.textContent = t('adminStatOpenDirectory'); openBtn.onclick = () => goToTab(def.tab); }
    const body = document.getElementById('stat-detail-body');
    body.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminLoading'))}</p>`;
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    try {
      const data = await api(`/api/admin/report/detail/${kind}`);
      if (statDetailKind !== kind) return; // another box was clicked meanwhile
      const rows = data.rows || [];
      if (!rows.length) { body.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminStatNothingYet'))}</p>`; return; }
      body.innerHTML = `<div class="stat-detail-scroll"><table class="admin-table"><thead><tr>${def.cols.map(c => `<th>${escapeHtml(t(c[0]))}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${def.cols.map(c => `<td>${escapeHtml(String(c[1](r) ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        ${rows.length >= 200 ? `<p class="admin-empty-note">${escapeHtml(t('adminStatNewest200'))}</p>` : ''}`;
    } catch (err) {
      body.innerHTML = `<p class="form-error">${escapeHtml(err.message || t('errorGeneric'))}</p>`;
    }
  }
  function closeStatDetail() {
    statDetailKind = null;
    document.getElementById('stat-detail').hidden = true;
    document.querySelectorAll('#stat-grid [data-kind]').forEach(b => b.classList.remove('active'));
  }
  { // admin.js runs at the end of <body>, so the panel already exists
    const c = document.getElementById('stat-detail-close');
    if (c) c.addEventListener('click', closeStatDetail);
  }

  // ── Mare App 5 — the text editor opens in one reusable tab ("mare-editor"),
  // opened by script so its "✓ Done" button is allowed to close it again.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="/editor.html"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const w = window.open(a.getAttribute('href'), 'mare-editor');
    if (w) w.focus(); else window.location.href = a.getAttribute('href');
  });

  // ── Mare App 5 — "View the site as…" ──
  document.querySelectorAll('[data-viewas]').forEach(b => b.addEventListener('click', async () => {
    try {
      const out = await api('/api/admin/view-as', { method: 'POST', body: JSON.stringify({ as: b.getAttribute('data-viewas') }) });
      window.location.href = out.redirect || '/';
    } catch (err) { alert(err.message || t('errorGeneric')); }
  }));

  // ── Mare App 5 — Picture explorer editor (Admin → Book Companion) ──
  let picData = null;
  let picSelected = null; // spot id
  async function picUpload(file, folder) {
    const key = `pictures/${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)}`;
    const { url } = await api('/api/admin/upload-url', { method: 'POST', body: JSON.stringify({ key, contentType: file.type || 'application/octet-stream' }) });
    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    if (!put.ok) throw new Error(t('adminErrorUploadFailed'));
    return key;
  }
  async function loadPictures(keepChapter) {
    try { picData = await api('/api/admin/pictures'); } catch (err) {
      document.getElementById('pic-list').innerHTML = `<p class="form-error">${escapeHtml(err.message || t('errorGeneric'))}</p>`; return;
    }
    const sel = document.getElementById('pic-chapter');
    const cur = keepChapter || Number(sel.value) || 1;
    sel.innerHTML = picData.chapters.map(c => {
      const n = picData.scenes.filter(s => s.chapter_no === c.no).length;
      return `<option value="${c.no}"${c.no === cur ? ' selected' : ''}>${c.no}. ${escapeHtml(c.title)}${n ? ` (${n})` : ''}</option>`;
    }).join('');
    renderPictures();
  }
  function renderPictures() {
    const ch = Number(document.getElementById('pic-chapter').value) || 1;
    renderFlow(ch);
    document.getElementById('pic-preview').href = `/pictures.html?chapter=${ch}`;
    const list = document.getElementById('pic-list');
    const scenes = chapterSteps(ch);
    list.innerHTML = scenes.length ? '' : `<p class="admin-empty-note">${escapeHtml(t('adminPicNone'))}</p>`;
    scenes.forEach(scene => list.appendChild(pictureCard(scene)));
  }
  // ── Mare App 6 (v75) — the chapter as a flow, top to bottom (view only).
  // Each step (picture or video) is a box; its spots branch off to the
  // right. Click a spot or a step to try it here; "Edit this step" opens
  // that step in the editor on this same page.
  const FLOW_ICON = { popup: '💬', sound: '🔊', voice: '🗣️', video: '🎬', quiz: '❓', write: '✉️', mask: '🌫️' };
  // v76 — a spinner over the picture (or the form) while a click is saved
  async function working(el, fn) {
    el.classList.add('pic-working');
    try { return await fn(); } finally { el.classList.remove('pic-working'); }
  }
  // v76 — spot look: { colour, mode, shape, h, reveal }
  function lookOf(sp) {
    let o = {}; try { o = JSON.parse(sp.look_json || '{}') || {}; } catch { o = {}; }
    return { colour: o.colour || '', mode: o.mode === 'colour' ? 'colour' : 'blur', shape: o.shape === 'circle' ? 'circle' : 'rect', h: o.h == null ? null : Number(o.h), reveal: !!o.reveal };
  }
  const flowT = (s) => { s = Math.max(0, Number(s) || 0); const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s - m * 60)).padStart(2, '0')}`; };
  // the chapter's steps in their order (as the child meets them)
  function chapterSteps(ch) {
    return picData.scenes.filter(s => s.chapter_no === ch).sort((a, b) => (a.sort_order - b.sort_order) || String(a.created_at).localeCompare(String(b.created_at)));
  }
  // v76 — move a step up or down: number the chapter's steps 10, 20, 30… and save the ones that changed
  async function moveStep(ch, sceneId, dir) {
    const steps = chapterSteps(ch);
    const i = steps.findIndex(s => s.id === sceneId), j = i + dir;
    if (i < 0 || j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    await working(document.getElementById('pic-flow'), async () => {
      for (let k = 0; k < steps.length; k++) {
        const want = (k + 1) * 10;
        if (steps[k].sort_order !== want) {
          await api(`/api/admin/pictures/${steps[k].id}`, { method: 'PATCH', body: JSON.stringify({ sortOrder: want }) });
          steps[k].sort_order = want;
        }
      }
    });
    renderPictures();
  }
  function setPicView(view) {
    document.querySelectorAll('.pic-view').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    document.getElementById('pic-flow').hidden = view !== 'flow';
    document.getElementById('pic-list').hidden = view !== 'edit';
    if (view === 'flow' && picData) renderFlow(Number(document.getElementById('pic-chapter').value) || 1);
  }
  function renderFlow(ch) {
    const box = document.getElementById('pic-flow');
    if (!box || !picData) return;
    const scenes = chapterSteps(ch);
    const chapter = picData.chapters.find(c => c.no === ch);
    if (!scenes.length) { box.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminFlowNone'))}</p>`; return; }
    let html = `<p class="admin-empty-note">${escapeHtml(t('adminFlowHint'))}</p>
      <div class="flow-head">${escapeHtml(t('companionChapterN', { n: ch }))}${chapter ? ' · ' + escapeHtml(chapter.title) : ''}</div><div class="flow">`;
    scenes.forEach((s, i) => {
      const isVid = !!s.videoUrl;
      const spots = s.spots.filter(sp => sp.type !== 'mask').sort((a, b) => isVid ? ((a.t_start || 0) - (b.t_start || 0)) : 0);
      const masks = s.spots.length - spots.length; // v76
      const media = isVid ? `<video src="${escapeHtml(s.videoUrl)}#t=0.5" preload="metadata" muted playsinline></video><span class="flow-play">▶</span>`
        : s.imageUrl ? `<img src="${escapeHtml(s.imageUrl)}" alt="" loading="lazy">` : `<span class="flow-nomedia">${escapeHtml(t('adminFlowNoMedia'))}</span>`;
      html += `${i ? '<div class="flow-down" aria-hidden="true">↓</div>' : ''}
        <div class="flow-row">
          <div class="flow-step${s.active ? '' : ' off'}">
            <div class="flow-top"><div class="flow-tag">${escapeHtml(t('adminFlowStep', { n: i + 1 }))} · ${escapeHtml(t(isVid ? 'adminFlowVideo' : 'adminFlowPicture'))}${s.active ? '' : ' · ' + escapeHtml(t('adminFlowHidden'))}</div>
              <span class="flow-move">
                <button type="button" class="flow-mv" data-scene="${s.id}" data-dir="-1" data-no-busy ${i === 0 ? 'disabled' : ''} title="${escapeHtml(t('adminFlowUp'))}" aria-label="${escapeHtml(t('adminFlowUp'))}">↑</button>
                <button type="button" class="flow-mv" data-scene="${s.id}" data-dir="1" data-no-busy ${i === scenes.length - 1 ? 'disabled' : ''} title="${escapeHtml(t('adminFlowDownBtn'))}" aria-label="${escapeHtml(t('adminFlowDownBtn'))}">↓</button>
              </span></div>
            <button type="button" class="flow-thumb" data-scene="${s.id}" data-no-busy ${(s.videoUrl || s.imageUrl) ? '' : 'disabled'}>${media}</button>
            <div class="flow-title">${escapeHtml(s.title_en || '')}</div>
            ${masks ? `<div class="flow-masks">🌫️ ${escapeHtml(t('adminFlowMasks', { n: masks }))}</div>` : ''}
            <button type="button" class="btn-ghost btn-small flow-edit" data-scene="${s.id}" data-no-busy>✏️ ${escapeHtml(t('adminFlowEdit'))}</button>
          </div>
          <div class="flow-branches">${spots.length ? spots.map(sp => `
            <button type="button" class="flow-spot" data-scene="${s.id}" data-spot="${sp.id}" data-no-busy>
              <span class="flow-ico">${FLOW_ICON[sp.type] || '•'}</span>
              <span class="flow-name">${escapeHtml(sp.title_en || t('adminSpotType_' + sp.type))}</span>
              ${isVid ? `<span class="flow-time">${flowT(sp.t_start)}${sp.pause_on_show ? ` · <b class="flow-stops">${escapeHtml(t('adminFlowStops'))}</b>` : ''}</span>` : ''}
            </button>`).join('') : `<span class="admin-empty-note">${escapeHtml(t('adminFlowNoSpots'))}</span>`}</div>
        </div>`;
    });
    box.innerHTML = html + '</div>';
    box.querySelectorAll('.flow-thumb').forEach(b => b.addEventListener('click', () => flowPreviewStep(b.dataset.scene)));
    box.querySelectorAll('.flow-mv').forEach(b => b.addEventListener('click', () => moveStep(ch, b.dataset.scene, Number(b.dataset.dir))));
    box.querySelectorAll('.flow-spot').forEach(b => b.addEventListener('click', () => flowPreviewSpot(b.dataset.scene, b.dataset.spot)));
    box.querySelectorAll('.flow-edit').forEach(b => b.addEventListener('click', () => {
      setPicView('edit');
      const card = document.querySelector(`.pic-card[data-scene="${b.dataset.scene}"]`);
      if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1600); }
    }));
  }
  // preview modal (stops any sound or video when closed)
  let flowAudio = null;
  // Opens in the modal, or (v76) as an overlay over the picture in the editor.
  function flowOpen(html, host) {
    flowClose();
    if (host) {
      const ov = document.createElement('div');
      ov.className = 'pic-try';
      ov.innerHTML = `<div class="pic-try-card"><button type="button" class="flow-modal-close" data-no-busy aria-label="Close">✕</button><div class="pic-try-body">${html}</div></div>`;
      ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('.flow-modal-close')) flowClose(); });
      host.appendChild(ov);
      return ov.querySelector('.pic-try-body');
    }
    document.getElementById('flow-modal-body').innerHTML = html;
    document.getElementById('flow-modal').hidden = false;
    return document.getElementById('flow-modal-body');
  }
  function flowClose() {
    if (flowAudio) { flowAudio.pause(); flowAudio = null; }
    document.querySelectorAll('#flow-modal-body video, #flow-modal-body audio, .pic-try video').forEach(m => m.pause());
    document.querySelectorAll('.pic-try').forEach(o => o.remove());
    const mb = document.getElementById('flow-modal-body');
    if (mb) { mb.innerHTML = ''; document.getElementById('flow-modal').hidden = true; }
  }
  if (document.getElementById('flow-modal')) {
    document.getElementById('flow-modal-close').addEventListener('click', flowClose);
    document.getElementById('flow-modal').addEventListener('click', (e) => { if (e.target.id === 'flow-modal') flowClose(); });
    document.querySelectorAll('.pic-view').forEach(b => b.addEventListener('click', () => setPicView(b.dataset.view)));
  }
  async function mediaUrl(key) {
    if (!key) return null;
    try { return (await api('/api/playback-url?key=' + encodeURIComponent(key))).url; } catch { return null; }
  }
  function flowPreviewStep(sceneId) {
    const s = picData.scenes.find(x => x.id === sceneId); if (!s) return;
    flowOpen(`${s.title_en ? `<h3>${escapeHtml(s.title_en)}</h3>` : ''}${s.videoUrl ? `<video src="${escapeHtml(s.videoUrl)}" controls autoplay playsinline></video>` : `<img src="${escapeHtml(s.imageUrl)}" alt="">`}`);
  }
  async function flowPreviewSpot(sceneId, spotId, host, draft) {
    const s = picData.scenes.find(x => x.id === sceneId); if (!s) return;
    const sp = draft || s.spots.find(x => x.id === spotId); if (!sp) return;
    if (flowAudio) { flowAudio.pause(); flowAudio = null; }
    const [img, audio, video] = await Promise.all([mediaUrl(sp.image_key), mediaUrl(sp.audio_key_en || sp.audio_key_nl), mediaUrl(sp.video_key)]);
    const tag = `<div class="flow-tag">${FLOW_ICON[sp.type] || ''} ${escapeHtml(t('adminSpotType_' + sp.type))}${s.videoUrl ? ` · ${flowT(sp.t_start)}–${sp.t_end == null ? escapeHtml(t('adminVidEnd')) : flowT(sp.t_end)}` : ''}</div>`;
    let html = tag + (sp.title_en ? `<h3>${escapeHtml(sp.title_en)}</h3>` : '');
    if (sp.type === 'video') {
      if (video) html += `<video src="${escapeHtml(video)}" controls autoplay playsinline></video>`;
      else if (sp.video_url) html += `<p><a href="${escapeHtml(sp.video_url)}" target="_blank" rel="noopener">${escapeHtml(sp.video_url)}</a></p>`;
    }
    if (img && sp.type !== 'quiz') html += `<img src="${escapeHtml(img)}" alt="">`;
    if (sp.text_en && sp.type !== 'sound') html += `<p>${escapeHtml(sp.text_en).replace(/\n/g, '<br>')}</p>`;
    if (sp.type === 'quiz') {
      let q = {}; try { q = JSON.parse(sp.quiz_json || '{}'); } catch { q = {}; }
      const answers = (q.answers || []).filter(a => a.en || a.nl || a.image_key);
      const urls = await Promise.all(answers.map(a => mediaUrl(a.image_key)));
      if (img) html += `<img src="${escapeHtml(img)}" alt="">`;
      html += `<div class="flow-quiz${urls.some(Boolean) ? ' pics' : ''}">${answers.map((a, i) => `<button type="button" class="flow-ans" data-i="${i}" data-no-busy>${urls[i] ? `<img src="${escapeHtml(urls[i])}" alt="">` : ''}<span>${escapeHtml(a.en || a.nl || '')}</span></button>`).join('')}</div>
        <p class="flow-quiz-msg"></p>`;
      const root = flowOpen(html, host);
      root.querySelectorAll('.flow-ans').forEach(b => b.addEventListener('click', () => {
        const right = Number(b.dataset.i) === (q.correct || 0);
        b.classList.add(right ? 'right' : 'wrong');
        const m = root.querySelector('.flow-quiz-msg');
        m.textContent = right ? (q.right_en || t('picturesQuizRight')) : (q.wrong_en || t('picturesQuizWrong'));
        m.className = 'flow-quiz-msg ' + (right ? 'right' : 'wrong');
      }));
      return;
    }
    if (sp.type === 'write') html += `<textarea rows="3" disabled placeholder="${escapeHtml(t('picturesWritePlaceholder'))}"></textarea><p class="admin-empty-note">${escapeHtml(t('adminFlowWriteNote'))}</p>`;
    if (audio) html += `<button type="button" class="btn-ghost btn-small flow-again" data-no-busy>🔊 ${escapeHtml(t('picturesPlayAgain'))}</button>`;
    const root = flowOpen(html, host);
    if (audio) {
      const play = () => { if (flowAudio) flowAudio.pause(); flowAudio = new Audio(audio); flowAudio.play().catch(() => {}); };
      play();
      root.querySelector('.flow-again').addEventListener('click', play);
    }
  }

  function pictureCard(scene) {
    const el = document.createElement('div');
    el.className = 'pic-card';
    el.dataset.scene = scene.id;
    el.innerHTML = `
      <div class="pic-head">
        <input type="text" class="pic-title-en" placeholder="Title (EN, optional)" value="${escapeHtml(scene.title_en)}">
        <input type="text" class="pic-title-nl" placeholder="Titel (NL, optioneel)" value="${escapeHtml(scene.title_nl)}">
        <label class="pic-upload btn-ghost btn-small">${escapeHtml(t('adminPicUpload'))}<input type="file" accept="image/*,video/mp4,.mp4" hidden></label>
        <button type="button" class="btn-ghost btn-small btn-danger pic-del">${escapeHtml(t('adminPicDelete'))}</button>
      </div>
      <div class="admin-form-row pic-notes">
        <div class="field"><label>${escapeHtml(t('adminPicNoteEn'))}</label><textarea data-editor="plain" class="pic-note-en" rows="3">${escapeHtml(scene.context_en || '')}</textarea></div>
        <div class="field"><label>${escapeHtml(t('adminPicNoteNl'))}</label><textarea data-editor="plain" class="pic-note-nl" rows="3">${escapeHtml(scene.context_nl || '')}</textarea></div>
      </div>
      <p class="admin-empty-note pic-note-hint">${escapeHtml(t('adminPicNoteHint'))} <button type="button" class="btn-ghost btn-small pic-note-save">${escapeHtml(t('adminSaveItem'))}</button> <span class="staff-row-msg" role="status"></span></p>
      <p class="admin-empty-note">${escapeHtml(scene.videoUrl ? t('adminVidClickHint') : scene.imageUrl ? t('adminPicClickHint') : t('adminPicLandscape'))}</p>
      <div class="pic-body">
        <div>
        <div class="pic-canvas">${scene.videoUrl ? `<video src="${escapeHtml(scene.videoUrl)}" preload="metadata" playsinline></video>` : scene.imageUrl ? `<img src="${escapeHtml(scene.imageUrl)}" alt="" draggable="false">` : ''}<div class="pic-spots"></div></div>
        ${scene.videoUrl ? `<div class="vid-bar">
          <button type="button" class="btn-ghost btn-small vid-play" data-no-busy>▶</button>
          <span class="vid-time">0:00.0</span>
          <div class="vid-track"><input type="range" class="vid-seek" min="0" max="1" step="0.1" value="0"><div class="vid-marks"></div></div>
        </div>
        <div class="vid-list"></div>` : ''}
        </div>
        <div class="pic-form"><p class="admin-empty-note">${escapeHtml(t('adminSpotNone'))}</p></div>
      </div>`;
    const canvas = el.querySelector('.pic-canvas');
    const spotsEl = el.querySelector('.pic-spots');
    const form = el.querySelector('.pic-form');
    const saveTitles = async () => {
      await api(`/api/admin/pictures/${scene.id}`, { method: 'PATCH', body: JSON.stringify({ titleEn: el.querySelector('.pic-title-en').value, titleNl: el.querySelector('.pic-title-nl').value }) });
    };
    el.querySelector('.pic-note-save').addEventListener('click', async () => {
      const msg = el.querySelector('.pic-note-hint .staff-row-msg');
      try {
        await api(`/api/admin/pictures/${scene.id}`, { method: 'PATCH', body: JSON.stringify({ contextEn: el.querySelector('.pic-note-en').value, contextNl: el.querySelector('.pic-note-nl').value }) });
        scene.context_en = el.querySelector('.pic-note-en').value; scene.context_nl = el.querySelector('.pic-note-nl').value;
        msg.textContent = t('adminSaved'); msg.className = 'staff-row-msg ok';
      } catch (err) { msg.textContent = err.message || t('errorGeneric'); msg.className = 'staff-row-msg err'; }
    });
    el.querySelector('.pic-title-en').addEventListener('change', saveTitles);
    el.querySelector('.pic-title-nl').addEventListener('change', saveTitles);
    el.querySelector('.pic-upload input').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const note = el.querySelector('.admin-empty-note'); note.textContent = t('adminUploading');
      try {
        const isVid = (file.type || '').startsWith('video/') || /\.(mov|webm|m4v|avi|mkv)$/i.test(file.name);
        if (isVid && !/\.mp4$/i.test(file.name)) { note.textContent = t('adminVidMp4Only'); e.target.value = ''; return; }
        const key = await picUpload(file, isVid ? 'scene-videos' : 'scenes');
        await api(`/api/admin/pictures/${scene.id}`, { method: 'PATCH', body: JSON.stringify(isVid ? { videoKey: key, imageKey: null } : { imageKey: key, videoKey: null }) });
        loadPictures(scene.chapter_no);
      } catch (err) { note.textContent = err.message || t('errorGeneric'); }
    });
    el.querySelector('.pic-del').addEventListener('click', async () => {
      if (!confirm(t('adminPicDeleteConfirm'))) return;
      await api(`/api/admin/pictures/${scene.id}`, { method: 'DELETE' });
      loadPictures(scene.chapter_no);
    });

    // v74 — video scenes: timeline, current time, spots shown only while on screen
    const video = el.querySelector('.pic-canvas video');
    const fmtT = (s) => { s = Math.max(0, Number(s) || 0); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
    const onNow = (sp) => {
      if (!video) return true;
      const now = video.currentTime || 0;
      return now >= (sp.t_start == null ? 0 : sp.t_start) && now < (sp.t_end == null ? Infinity : sp.t_end);
    };
    const drawTimeline = () => {
      if (!video) return;
      const dur = video.duration || 0;
      el.querySelector('.vid-time').textContent = `${fmtT(video.currentTime)} / ${fmtT(dur)}`;
      const seek = el.querySelector('.vid-seek');
      seek.max = dur || 1; if (document.activeElement !== seek) seek.value = video.currentTime || 0;
      el.querySelector('.vid-play').textContent = video.paused ? '▶' : '❚❚';
      el.querySelector('.vid-marks').innerHTML = dur ? scene.spots.map(sp => {
        const a = sp.t_start == null ? 0 : sp.t_start, b = sp.t_end == null ? dur : Math.min(dur, sp.t_end);
        return `<i class="vid-mark${sp.id === picSelected ? ' sel' : ''}" style="left:${(a / dur) * 100}%;width:${Math.max(0.6, ((b - a) / dur) * 100)}%"></i>`;
      }).join('') : '';
      el.querySelector('.vid-list').innerHTML = scene.spots.length ? scene.spots.slice().sort((p, q) => (p.t_start || 0) - (q.t_start || 0)).map(sp =>
        `<button type="button" class="vid-chip${sp.id === picSelected ? ' sel' : ''}" data-id="${sp.id}" data-no-busy>${escapeHtml(fmtT(sp.t_start || 0))}–${sp.t_end == null ? escapeHtml(t('adminVidEnd')) : escapeHtml(fmtT(sp.t_end))} · ${escapeHtml(sp.title_en || t('adminSpotType_' + sp.type))}${sp.pause_on_show ? ' ⏸' : ''}</button>`).join('') : '';
      el.querySelectorAll('.vid-chip').forEach(c => c.addEventListener('click', () => {
        const sp = scene.spots.find(x => x.id === c.dataset.id); if (!sp) return;
        video.pause(); video.currentTime = Math.min((sp.t_start || 0) + 0.05, (video.duration || 1) - 0.05);
        picSelected = sp.id; drawForm(sp);
      }));
    };
    if (video) {
      video.addEventListener('loadedmetadata', () => { drawTimeline(); drawSpots(); });
      video.addEventListener('timeupdate', () => { drawTimeline(); drawSpots(); });
      video.addEventListener('seeked', () => { drawTimeline(); drawSpots(); });
      video.addEventListener('play', drawTimeline); video.addEventListener('pause', drawTimeline);
      el.querySelector('.vid-play').addEventListener('click', () => { if (video.paused) video.play(); else video.pause(); });
      el.querySelector('.vid-seek').addEventListener('input', (e) => { video.currentTime = Number(e.target.value); });
    }

    const drawSpots = () => {
      spotsEl.innerHTML = '';
      scene.spots.forEach(sp => {
        if (!onNow(sp)) return; // v74: on a video, only the spots on screen now
        const d = document.createElement('div');
        d.className = 'pic-spot pic-spot-' + sp.type + (sp.id === picSelected ? ' sel' : '');
        d.style.left = (sp.x * 100) + '%'; d.style.top = (sp.y * 100) + '%'; d.style.width = (sp.r * 200) + '%';
        const lk = lookOf(sp);
        if (lk.colour) d.style.setProperty('--spot', lk.colour);
        if (sp.type === 'mask') { // v76: shown as the child will see it
          d.classList.add('pic-mask-' + lk.mode, 'pic-shape-' + lk.shape);
          if (lk.shape === 'rect') { d.style.aspectRatio = 'auto'; d.style.height = ((lk.h || sp.r * 2) * 100) + '%'; }
        }
        d.title = sp.title_en || sp.type;
        // drag to move; click to edit
        d.addEventListener('pointerdown', (e) => {
          e.stopPropagation(); e.preventDefault();
          const rect = canvas.getBoundingClientRect();
          let moved = false;
          const mv = (ev) => {
            moved = true;
            sp.x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
            sp.y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
            d.style.left = (sp.x * 100) + '%'; d.style.top = (sp.y * 100) + '%';
          };
          const up = async () => {
            window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
            if (moved) await working(canvas, () => api(`/api/admin/picture-spots/${sp.id}`, { method: 'PATCH', body: JSON.stringify({ x: sp.x, y: sp.y }) }));
            picSelected = sp.id; drawSpots(); drawForm(sp); drawTimeline();
          };
          window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
        });
        spotsEl.appendChild(d);
      });
    };
    canvas.addEventListener('click', async (e) => {
      if ((!scene.imageUrl && !scene.videoUrl) || e.target.closest('.pic-spot')) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
      const extra = {};
      if (video) { // v74: appears now, for 5 seconds
        video.pause();
        const now = Math.round((video.currentTime || 0) * 10) / 10;
        extra.t_start = now;
        extra.t_end = Math.round(Math.min(video.duration || now + 5, now + 5) * 10) / 10;
        extra.pause_on_show = true; // default: stop the video, one thing at a time
      }
      const out = await working(canvas, () => api(`/api/admin/pictures/${scene.id}/spots`, { method: 'POST', body: JSON.stringify({ x, y, type: 'popup', ...extra }) }));
      const sp = { id: out.id, x, y, r: 0.06, type: 'popup', title_en: '', title_nl: '', text_en: '', text_nl: '', ...extra, pause_on_show: extra.pause_on_show ? 1 : 0 };
      scene.spots.push(sp); picSelected = sp.id; drawSpots(); drawForm(sp); drawTimeline();
    });

    // Mare App 5 — show the uploaded file's own name (the stored key is
    // pictures/<folder>/<timestamp>-<name>), and let sounds be played here.
    function fileNameOf(key) { return String(key || '').split('/').pop().replace(/^\d{10,}-/, ''); }
    function mediaField(label, key, accept, folder, sp) {
      const has = sp[key];
      return `<div class="field pic-media" data-key="${key}" data-accept="${accept}" data-folder="${folder}"><label>${escapeHtml(label)}</label>
        <span class="pic-media-state">${has ? `✓ <strong class="pic-media-name">${escapeHtml(fileNameOf(has))}</strong>${accept.startsWith('audio') ? ` <a href="#" class="pic-media-play">▶ ${escapeHtml(t('adminSpotListen'))}</a>` : ''} <a href="#" class="pic-media-rm">${escapeHtml(t('adminSpotRemove'))}</a>` : ''}</span>
        <input type="file" accept="${accept}"></div>`;
    }
    function quizOf(sp) {
      try { const q = JSON.parse(sp.quiz_json || '{}'); return { answers: q.answers || [], correct: q.correct || 0, right_en: q.right_en || '', right_nl: q.right_nl || '', wrong_en: q.wrong_en || '', wrong_nl: q.wrong_nl || '' }; }
      catch { return { answers: [], correct: 0 }; }
    }
    function quizFields(sp) {
      const q = quizOf(sp);
      const rows = [0, 1, 2, 3].map(i => { const a = q.answers[i] || {}; return `<div class="quiz-row" data-image-key="${escapeHtml(a.image_key || '')}">
        <label class="quiz-ok" title="${escapeHtml(t('adminQuizCorrect'))}"><input type="radio" name="qc-${sp.id}" class="qz-correct" value="${i}"${i === q.correct ? ' checked' : ''}> ✓</label>
        <input type="text" class="qz-a-en" placeholder="${escapeHtml(t('adminQuizAnswer', { n: i + 1 }))} EN" value="${escapeHtml(a.en || '')}">
        <input type="text" class="qz-a-nl" placeholder="${escapeHtml(t('adminQuizAnswer', { n: i + 1 }))} NL" value="${escapeHtml(a.nl || '')}">
        <span class="qz-pic">${a.image_key ? `<img class="qz-thumb" alt="" data-key="${escapeHtml(a.image_key)}"><a href="#" class="qz-pic-rm" title="${escapeHtml(t('adminSpotRemove'))}">✕</a>` : `<label class="btn-ghost btn-small qz-pic-add" title="${escapeHtml(t('adminQuizPic'))}">🖼<input type="file" accept="image/*" hidden></label>`}</span></div>`; }).join('');
      return `<div class="field quiz-box"><label>${escapeHtml(t('adminQuizAnswers'))}</label><p class="admin-empty-note">${escapeHtml(t('adminQuizPicHint'))}</p>${rows}
        <div class="admin-form-row"><div class="field"><label>${escapeHtml(t('adminQuizRight'))} EN</label><input type="text" class="qz-right-en" value="${escapeHtml(q.right_en || '')}" placeholder="${escapeHtml(t('picturesQuizRight'))}"></div>
          <div class="field"><label>${escapeHtml(t('adminQuizRight'))} NL</label><input type="text" class="qz-right-nl" value="${escapeHtml(q.right_nl || '')}"></div></div>
        <div class="admin-form-row"><div class="field"><label>${escapeHtml(t('adminQuizWrong'))} EN</label><input type="text" class="qz-wrong-en" value="${escapeHtml(q.wrong_en || '')}" placeholder="${escapeHtml(t('picturesQuizWrong'))}"></div>
          <div class="field"><label>${escapeHtml(t('adminQuizWrong'))} NL</label><input type="text" class="qz-wrong-nl" value="${escapeHtml(q.wrong_nl || '')}"></div></div></div>`;
    }
    function drawForm(sp) {
      const type = sp.type;
      form.innerHTML = `
        <div class="field"><label>${escapeHtml(t('adminSpotType'))}</label><select class="sp-type">
          ${['popup', 'sound', 'voice', 'video', 'quiz', 'write', 'mask'].map(k => `<option value="${k}"${k === type ? ' selected' : ''}>${escapeHtml(t('adminSpotType_' + k))}</option>`).join('')}</select></div>
        ${(() => { const lk = lookOf(sp); return `<div class="admin-form-row look-row">
          <div class="field"><label>${escapeHtml(t(type === 'mask' ? 'adminMaskColour' : 'adminSpotColour'))}</label><div class="look-colour"><input type="color" class="sp-colour" value="${escapeHtml(lk.colour || (type === 'mask' ? '#16305C' : '#FFE9A8'))}"><a href="#" class="sp-colour-reset">${escapeHtml(t('adminSpotColourReset'))}</a></div></div>
          ${type === 'mask' ? `<div class="field"><label>${escapeHtml(t('adminMaskMode'))}</label><select class="sp-mask-mode"><option value="blur"${lk.mode === 'blur' ? ' selected' : ''}>${escapeHtml(t('adminMaskBlur'))}</option><option value="colour"${lk.mode === 'colour' ? ' selected' : ''}>${escapeHtml(t('adminMaskSolid'))}</option></select></div>
          <div class="field"><label>${escapeHtml(t('adminMaskShape'))}</label><select class="sp-mask-shape"><option value="rect"${lk.shape === 'rect' ? ' selected' : ''}>${escapeHtml(t('adminMaskRect'))}</option><option value="circle"${lk.shape === 'circle' ? ' selected' : ''}>${escapeHtml(t('adminMaskCircle'))}</option></select></div>` : ''}
        </div>
        ${type === 'mask' ? `<label class="vid-pause"><input type="checkbox" class="sp-mask-reveal"${lk.reveal ? ' checked' : ''}> ${escapeHtml(t('adminMaskReveal'))}</label>` : ''}`; })()}
        ${video ? `<div class="admin-form-row vid-times">
          <div class="field"><label>${escapeHtml(t('adminVidFrom'))}</label><div class="vid-tin"><input type="number" class="sp-t-start" min="0" step="0.1" value="${sp.t_start == null ? '' : sp.t_start}"><button type="button" class="btn-ghost btn-small sp-now-start" data-no-busy>${escapeHtml(t('adminVidNow'))}</button></div></div>
          <div class="field"><label>${escapeHtml(t('adminVidTo'))}</label><div class="vid-tin"><input type="number" class="sp-t-end" min="0" step="0.1" value="${sp.t_end == null ? '' : sp.t_end}" placeholder="${escapeHtml(t('adminVidEnd'))}"><button type="button" class="btn-ghost btn-small sp-now-end" data-no-busy>${escapeHtml(t('adminVidNow'))}</button></div></div>
        </div>
        ${type === 'mask' ? '' : `<label class="vid-pause"><input type="checkbox" class="sp-pause"${sp.pause_on_show ? ' checked' : ''}> ${escapeHtml(t('adminVidPause'))}</label>`}` : ''}
        <div class="field"><label>${escapeHtml(t(type === 'mask' ? 'adminMaskWidth' : 'adminSpotSize'))}</label><input type="range" class="sp-r" min="0.03" max="${type === 'mask' ? '0.5' : '0.2'}" step="0.005" value="${sp.r}"></div>
        ${type === 'mask' && lookOf(sp).shape === 'rect' ? `<div class="field"><label>${escapeHtml(t('adminMaskHeight'))}</label><input type="range" class="sp-mask-h" min="0.03" max="1" step="0.005" value="${lookOf(sp).h || Math.min(1, sp.r * 2)}"></div>` : ''}
        ${type === 'mask' ? '' : `<button type="button" class="btn-ghost btn-small sp-try" data-no-busy>▶ ${escapeHtml(t('adminSpotTry'))}</button>`}
        ${type === 'mask' ? `<p class="admin-empty-note">${escapeHtml(t('adminMaskNote'))}</p>` : ''}
        <div class="admin-form-row"${type === 'mask' ? ' hidden' : ''}><div class="field"><label>${escapeHtml(t(type === 'quiz' ? 'adminQuizQuestion' : type === 'write' ? 'adminWritePrompt' : 'adminSpotTitle'))} EN</label><input type="text" class="sp-title-en" value="${escapeHtml(sp.title_en || '')}"></div>
          <div class="field"><label>${escapeHtml(t(type === 'quiz' ? 'adminQuizQuestion' : type === 'write' ? 'adminWritePrompt' : 'adminSpotTitle'))} NL</label><input type="text" class="sp-title-nl" value="${escapeHtml(sp.title_nl || '')}"></div></div>
        ${type === 'quiz' ? quizFields(sp) : ''}
        ${type !== 'sound' && type !== 'mask' ? `<div class="admin-form-row"><div class="field"><label>${escapeHtml(t('adminSpotText'))} EN</label><textarea data-editor="plain" class="sp-text-en" rows="3">${escapeHtml(sp.text_en || '')}</textarea></div>
          <div class="field"><label>${escapeHtml(t('adminSpotText'))} NL</label><textarea data-editor="plain" class="sp-text-nl" rows="3">${escapeHtml(sp.text_nl || '')}</textarea></div></div>` : ''}
        ${type === 'popup' || type === 'voice' || type === 'quiz' || type === 'write' ? mediaField(t('adminSpotImage'), 'image_key', 'image/*', 'spots', sp) : ''}
        ${type === 'sound' || type === 'voice' ? mediaField(t('adminSpotAudioEn'), 'audio_key_en', 'audio/*', 'sounds', sp) + mediaField(t('adminSpotAudioNl'), 'audio_key_nl', 'audio/*', 'sounds', sp) : ''}
        ${type === 'video' ? mediaField(t('adminSpotVideo'), 'video_key', 'video/*', 'videos', sp) + `<div class="field"><label>${escapeHtml(t('adminSpotVideoUrl'))}</label><input type="text" class="sp-video-url" value="${escapeHtml(sp.video_url || '')}" placeholder="https://www.youtube.com/watch?v=…"></div>` : ''}
        <div class="pic-form-btns"><button type="button" class="btn-primary btn-small sp-save">${escapeHtml(t('adminSaveItem'))}</button>
          <button type="button" class="btn-ghost btn-small btn-danger sp-del">${escapeHtml(t('adminSpotDelete'))}</button>
          <span class="staff-row-msg" role="status"></span></div>`;
      const q = (c) => form.querySelector(c);
      const say = (ok, txt) => { const m = q('.staff-row-msg'); m.textContent = txt; m.className = 'staff-row-msg ' + (ok ? 'ok' : 'err'); };
      // What's typed in the form right now, so a type change or an upload
      // (which redraw the form) never loses unsaved words; they are saved
      // together with that change.
      const typed = () => {
        const b = { r: sp.r, title_en: q('.sp-title-en').value, title_nl: q('.sp-title-nl').value };
        if (q('.sp-text-en')) { b.text_en = q('.sp-text-en').value; b.text_nl = q('.sp-text-nl').value; }
        if (q('.sp-video-url')) b.video_url = q('.sp-video-url').value;
        if (q('.sp-colour')) { // v76
          const lk = lookOf(sp);
          const look = { colour: q('.sp-colour').dataset.cleared ? null : q('.sp-colour').value, mode: lk.mode, shape: lk.shape, h: lk.h, reveal: lk.reveal };
          if (q('.sp-mask-mode')) { look.mode = q('.sp-mask-mode').value; look.shape = q('.sp-mask-shape').value; look.reveal = q('.sp-mask-reveal').checked; look.h = q('.sp-mask-h') ? Number(q('.sp-mask-h').value) : lk.h; }
          if (!q('.sp-colour').dataset.touched && !lk.colour && sp.type !== 'mask') look.colour = null; // untouched: keep the standard gold
          b.look = look;
        }
        if (q('.sp-t-start')) { // v74
          const num = (v) => (String(v).trim() === '' ? null : Math.max(0, Number(v) || 0));
          b.t_start = num(q('.sp-t-start').value); b.t_end = num(q('.sp-t-end').value);
          b.pause_on_show = q('.sp-pause').checked;
        }
        if (q('.qz-a-en')) {
          const rowsEl = [...form.querySelectorAll('.quiz-row')];
          const all = rowsEl.map((r, i) => ({ en: r.querySelector('.qz-a-en').value.trim(), nl: r.querySelector('.qz-a-nl').value.trim(), image_key: r.dataset.imageKey || null, i }));
          const kept = all.filter(a => a.en || a.nl || a.image_key);
          const pick = form.querySelector('.qz-correct:checked');
          const correctIdx = Math.max(0, kept.findIndex(a => a.i === Number(pick ? pick.value : 0)));
          b.quiz = { answers: kept.map(a => ({ en: a.en, nl: a.nl, image_key: a.image_key })), correct: correctIdx,
            right_en: q('.qz-right-en').value, right_nl: q('.qz-right-nl').value, wrong_en: q('.qz-wrong-en').value, wrong_nl: q('.qz-wrong-nl').value };
        }
        return b;
      };
      // keep the local copy in step with what was saved (quiz is stored as quiz_json)
      const applyLocal = (body) => {
        const { quiz, look, ...rest } = body;
        Object.assign(sp, rest);
        if (quiz) sp.quiz_json = JSON.stringify(quiz);
        if (look) sp.look_json = JSON.stringify(look);
        if (rest.pause_on_show !== undefined) sp.pause_on_show = rest.pause_on_show ? 1 : 0;
      };
      // v74 — answer pictures: show, add (saved straight away), remove
      form.querySelectorAll('.qz-thumb').forEach(async (img) => {
        try { img.src = (await api('/api/playback-url?key=' + encodeURIComponent(img.dataset.key))).url; } catch { /* leave blank */ }
      });
      const saveQuizNow = async () => {
        const body = typed();
        await api(`/api/admin/picture-spots/${sp.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        applyLocal(body); drawForm(sp);
      };
      form.querySelectorAll('.quiz-row').forEach(row => {
        const add = row.querySelector('.qz-pic-add input');
        if (add) add.addEventListener('change', async (e) => {
          const file = e.target.files[0]; if (!file) return;
          row.querySelector('.qz-pic').textContent = t('adminUploading');
          try { row.dataset.imageKey = await picUpload(file, 'quiz'); await saveQuizNow(); }
          catch (err) { row.querySelector('.qz-pic').textContent = err.message || t('errorGeneric'); }
        });
        const rm = row.querySelector('.qz-pic-rm');
        if (rm) rm.addEventListener('click', async (e) => { e.preventDefault(); row.dataset.imageKey = ''; await saveQuizNow(); });
      });
      if (q('.sp-now-start')) {
        q('.sp-now-start').addEventListener('click', () => { q('.sp-t-start').value = (Math.round((video.currentTime || 0) * 10) / 10); });
        q('.sp-now-end').addEventListener('click', () => { q('.sp-t-end').value = (Math.round((video.currentTime || 0) * 10) / 10); });
      }
      q('.sp-type').addEventListener('change', async () => {
        const body = { ...typed(), type: q('.sp-type').value };
        if (body.type === 'mask') { body.pause_on_show = false; if (!sp.look_json) body.look = { mode: 'blur', shape: 'rect', h: Math.min(1, sp.r * 2), reveal: false }; }
        await working(form, () => api(`/api/admin/picture-spots/${sp.id}`, { method: 'PATCH', body: JSON.stringify(body) }));
        applyLocal(body);
        drawSpots(); drawForm(sp);
      });
      q('.sp-r').addEventListener('input', () => { sp.r = Number(q('.sp-r').value); drawSpots(); });
      // v76 — colour and mask settings show on the picture straight away (Save keeps them)
      const liveLook = () => { const b = typed(); if (b.look) sp.look_json = JSON.stringify(b.look); drawSpots(); };
      if (q('.sp-colour')) {
        q('.sp-colour').addEventListener('input', () => { q('.sp-colour').dataset.touched = '1'; delete q('.sp-colour').dataset.cleared; liveLook(); });
        q('.sp-colour-reset').addEventListener('click', (e) => { e.preventDefault(); q('.sp-colour').dataset.cleared = '1'; q('.sp-colour').dataset.touched = '1'; liveLook(); });
      }
      ['.sp-mask-mode', '.sp-mask-reveal', '.sp-mask-h'].forEach(sel => { if (q(sel)) q(sel).addEventListener('input', liveLook); });
      if (q('.sp-mask-shape')) q('.sp-mask-shape').addEventListener('change', () => { liveLook(); drawForm(sp); });
      if (q('.sp-try')) q('.sp-try').addEventListener('click', () => {
        // try it on top of this picture/video, with what is typed now
        const b = typed(); const copy = { ...sp, ...b };
        if (b.quiz) copy.quiz_json = JSON.stringify(b.quiz);
        if (video) video.pause();
        flowPreviewSpot(scene.id, sp.id, canvas.parentElement, copy);
      });
      form.querySelectorAll('.pic-media').forEach(box => {
        const key = box.dataset.key;
        box.querySelector('input[type=file]').addEventListener('change', async (e) => {
          const file = e.target.files[0]; if (!file) return;
          const state = box.querySelector('.pic-media-state'); state.textContent = t('adminUploading');
          try {
            const k = await picUpload(file, box.dataset.folder);
            const body = { ...typed(), [key]: k };
            await api(`/api/admin/picture-spots/${sp.id}`, { method: 'PATCH', body: JSON.stringify(body) });
            applyLocal(body); drawForm(sp);
          } catch (err) { state.textContent = err.message || t('errorGeneric'); }
        });
        const play = box.querySelector('.pic-media-play');
        if (play) play.addEventListener('click', async (e) => {
          e.preventDefault();
          if (window._picAudio) { window._picAudio.pause(); window._picAudio = null; if (play.dataset.on) { delete play.dataset.on; play.textContent = '▶ ' + t('adminSpotListen'); return; } }
          try {
            const { url } = await api('/api/playback-url?key=' + encodeURIComponent(sp[key]));
            window._picAudio = new Audio(url);
            play.dataset.on = '1'; play.textContent = '■ ' + t('adminSpotStop');
            window._picAudio.onended = () => { delete play.dataset.on; play.textContent = '▶ ' + t('adminSpotListen'); };
            await window._picAudio.play();
          } catch (err) { box.querySelector('.pic-media-state').append(' ' + (err.message || t('errorGeneric'))); }
        });
        const rm = box.querySelector('.pic-media-rm');
        if (rm) rm.addEventListener('click', async (e) => {
          e.preventDefault();
          const body = { ...typed(), [key]: null };
          await api(`/api/admin/picture-spots/${sp.id}`, { method: 'PATCH', body: JSON.stringify(body) });
          applyLocal(body); drawForm(sp);
        });
      });
      q('.sp-save').addEventListener('click', async () => {
        const body = typed();
        try {
          await api(`/api/admin/picture-spots/${sp.id}`, { method: 'PATCH', body: JSON.stringify(body) });
          applyLocal(body); drawSpots(); drawTimeline(); say(true, t('adminSaved'));
        } catch (err) { say(false, err.message || t('errorGeneric')); }
      });
      q('.sp-del').addEventListener('click', async () => {
        await api(`/api/admin/picture-spots/${sp.id}`, { method: 'DELETE' });
        scene.spots = scene.spots.filter(x => x.id !== sp.id); picSelected = null; drawSpots(); drawTimeline();
        form.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminSpotNone'))}</p>`;
      });
    }
    drawSpots();
    return el;
  }
  {
    const sel = document.getElementById('pic-chapter');
    if (sel) {
      sel.addEventListener('change', renderPictures);
      document.getElementById('pic-add').addEventListener('click', async () => {
        const ch = Number(sel.value) || 1;
        await api('/api/admin/pictures', { method: 'POST', body: JSON.stringify({ chapter: ch }) });
        loadPictures(ch);
      });
    }
  }

  // ── Mare App 5 — Book Companion admin ──
  // Never leaves the tab on "Loading…": a slow or failed load says so,
  // with a Try again button, and a rendering problem shows its message.
  async function loadCompanionAdmin() {
    const mboxEl = document.getElementById('cpa-messages');
    const fail = (msg) => {
      mboxEl.innerHTML = `<p class="form-error">${escapeHtml(msg || t('errorGeneric'))}</p><button type="button" class="btn-ghost btn-small" id="cpa-retry">${escapeHtml(t('adminTryAgain'))}</button>`;
      document.getElementById('cpa-retry').addEventListener('click', loadCompanionAdmin);
    };
    mboxEl.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminLoading'))}</p>`;
    let d;
    try {
      d = await Promise.race([
        api('/api/admin/companion'),
        new Promise((_, rej) => setTimeout(() => rej(new Error(t('adminCompanionSlow'))), 20000)),
      ]);
    } catch (err) { fail(err.message); return; }
    try { renderCompanionAdmin(d); } catch (err) { console.error(err); fail(`${t('errorGeneric')} (${err.message})`); }
  }
  function renderCompanionAdmin(d) {
    d.messages = d.messages || [];
    d.practices = d.practices || [];
    // Messages to Mare: unanswered first.
    const mbox = document.getElementById('cpa-messages');
    mbox.innerHTML = d.messages.length ? '' : `<p class="admin-empty-note">${escapeHtml(t('adminCompanionNoMessages'))}</p>`;
    d.messages.forEach(m => {
      const el = document.createElement('div');
      el.className = 'cpa-msg' + (m.reply ? ' answered' : '');
      el.innerHTML = `
        <div class="cpa-msg-head"><strong>${escapeHtml(m.child_name || m.parent_name || '')}</strong>
          <span class="admin-empty-note">${escapeHtml(m.parent_name || '')} · ${escapeHtml(m.parent_email || '')} · ${escapeHtml(m.created_at)} · ${escapeHtml((m.preferred_locale || 'en').toUpperCase())}</span>
          ${m.reply ? `<span class="role-pill">${escapeHtml(t('adminCompanionReplied'))}</span>` : ''}</div>
        <p class="cpa-msg-text">${escapeHtml(m.message).replace(/\n/g, '<br>')}</p>
        <textarea data-editor="plain" class="cpa-reply" rows="4">${escapeHtml(m.reply || '')}</textarea>
        <div class="cpa-msg-btns">
          <button type="button" class="btn-ghost btn-small cpa-suggest">${escapeHtml(t('adminCompanionSuggest'))}</button>
          <button type="button" class="btn-primary btn-small cpa-send">${escapeHtml(t('adminCompanionSendReply'))}</button>
          <span class="staff-row-msg" role="status"></span>
        </div>`;
      const say = (ok, txt) => { const s2 = el.querySelector('.staff-row-msg'); s2.textContent = txt; s2.className = 'staff-row-msg ' + (ok ? 'ok' : 'err'); };
      el.querySelector('.cpa-suggest').addEventListener('click', async () => {
        try {
          const out = await api(`/api/admin/companion/messages/${m.id}/suggest`, { method: 'POST' });
          el.querySelector('.cpa-reply').value = out.reply || '';
        } catch (err) { say(false, err.message || t('errorGeneric')); }
      });
      el.querySelector('.cpa-send').addEventListener('click', async () => {
        const reply = el.querySelector('.cpa-reply').value.trim();
        if (!reply) { say(false, t('errorGeneric')); return; }
        try {
          const out = await api(`/api/admin/companion/messages/${m.id}/reply`, { method: 'POST', body: JSON.stringify({ reply }) });
          say(true, t(out.emailed ? 'adminCompanionReplySent' : 'adminCompanionReplySaved'));
          el.classList.add('answered');
        } catch (err) { say(false, err.message || t('errorGeneric')); }
      });
      mbox.appendChild(el);
    });

    // Practices, one per chapter (collapsed; open to edit).
    const pbox = document.getElementById('cpa-practices');
    pbox.innerHTML = '';
    d.practices.forEach(p => {
      const el = document.createElement('details');
      el.className = 'cpa-practice';
      el.innerHTML = `<summary><strong>${escapeHtml(t('companionChapterN', { n: p.chapter_no }))}</strong> · ${escapeHtml(p.chapter_title_en)} — ${escapeHtml(p.title_en)}</summary>
        <div class="admin-form-row">
          <div class="field"><label>${escapeHtml(t('adminCompanionChapterTitle'))} (EN)</label><input type="text" class="cpa-ct-en" value="${escapeHtml(p.chapter_title_en)}"></div>
          <div class="field"><label>${escapeHtml(t('adminCompanionChapterTitle'))} (NL)</label><input type="text" class="cpa-ct-nl" value="${escapeHtml(p.chapter_title_nl)}"></div>
        </div>
        <div class="admin-form-row">
          <div class="field"><label>${escapeHtml(t('adminCompanionPracticeTitle'))} (EN)</label><input type="text" class="cpa-t-en" value="${escapeHtml(p.title_en)}"></div>
          <div class="field"><label>${escapeHtml(t('adminCompanionPracticeTitle'))} (NL)</label><input type="text" class="cpa-t-nl" value="${escapeHtml(p.title_nl)}"></div>
        </div>
        <div class="admin-form-row">
          <div class="field"><label>${escapeHtml(t('adminCompanionPracticeBody'))} (EN)</label><textarea data-editor="plain" class="cpa-b-en" rows="9">${escapeHtml(p.body_en)}</textarea></div>
          <div class="field"><label>${escapeHtml(t('adminCompanionPracticeBody'))} (NL)</label><textarea data-editor="plain" class="cpa-b-nl" rows="9">${escapeHtml(p.body_nl)}</textarea></div>
        </div>
        <div class="field"><label>${escapeHtml(t('adminCompanionSummary'))}</label><textarea data-editor="plain" class="cpa-summary" rows="4">${escapeHtml(p.summary || '')}</textarea>
          <p class="admin-empty-note">${escapeHtml(t('adminCompanionSummaryHint'))}</p></div>
        <button type="button" class="btn-primary btn-small cpa-save">${escapeHtml(t('adminSaveItem'))}</button> <span class="staff-row-msg" role="status"></span>`;
      el.querySelector('.cpa-save').addEventListener('click', async () => {
        const q = (c) => el.querySelector(c).value;
        const msg = el.querySelector('.staff-row-msg');
        try {
          await api(`/api/admin/companion/practices/${p.chapter_no}`, { method: 'PUT', body: JSON.stringify({
            chapterTitleEn: q('.cpa-ct-en'), chapterTitleNl: q('.cpa-ct-nl'), titleEn: q('.cpa-t-en'), titleNl: q('.cpa-t-nl'), bodyEn: q('.cpa-b-en'), bodyNl: q('.cpa-b-nl'), summary: q('.cpa-summary'),
          }) });
          msg.textContent = t('adminSaved'); msg.className = 'staff-row-msg ok';
        } catch (err) { msg.textContent = err.message || t('errorGeneric'); msg.className = 'staff-row-msg err'; }
      });
      pbox.appendChild(el);
    });

    // Ratings.
    const sum = d.ratingSummary || { count: 0 };
    document.getElementById('cpa-rating-summary').textContent = sum.count ? t('adminCompanionRatingsSummary', { count: sum.count, average: sum.average }) : t('adminCompanionNoRatings');
    document.getElementById('cpa-percent').value = d.ratingPercent;
    const rbox = document.getElementById('cpa-ratings');
    rbox.innerHTML = d.ratings && d.ratings.length ? `<div class="stat-detail-scroll"><table class="admin-table"><thead><tr>
        <th>★</th><th>${escapeHtml(t('adminFieldName'))}</th><th>${escapeHtml(t('adminFieldEmail'))}</th><th></th><th>Code</th><th>${escapeHtml(t('adminStatColDate'))}</th></tr></thead><tbody>
        ${d.ratings.map(r => `<tr><td>${'★'.repeat(r.stars)}</td><td>${escapeHtml(r.name || '')}</td><td>${escapeHtml(r.email || '')}</td><td>${escapeHtml(r.comment || '')}</td><td>${escapeHtml(r.discount_code || '')}</td><td>${escapeHtml(r.updated_at)}</td></tr>`).join('')}
      </tbody></table></div>` : '';
  }
  {
    const b = document.getElementById('cpa-percent-save');
    if (b) b.addEventListener('click', async () => {
      try {
        await api('/api/admin/companion/rating-percent', { method: 'PUT', body: JSON.stringify({ percent: Number(document.getElementById('cpa-percent').value) }) });
      } catch (err) { alert(err.message || t('errorGeneric')); }
    });
  }

  // ── Teacher resources ──
  function setupResourceForm() {
    const categorySelect = document.getElementById('r-category');
    // Show the file picker for Document, the URL box for Tool/Link.
    // Run once at setup too: the form opens on Document, and the HTML's
    // starting state (URL shown, file hidden) used to stay wrong until
    // the type was changed and changed back.
    function syncResourceFields() {
      const isDoc = categorySelect.value === 'document';
      document.getElementById('r-file-field').hidden = !isDoc;
      document.getElementById('r-url-field').hidden = isDoc;
    }
    categorySelect.addEventListener('change', syncResourceFields);
    syncResourceFields();

    // Language: default to the language admin is being used in, and
    // take a hint from the filename when a document is chosen
    // (…_NL_…, Dutch, Leerkracht… -> Nederlands; …_ENG_…, English -> English).
    const languageSelect = document.getElementById('r-language');
    const defaultLanguage = () => { languageSelect.value = window.MareI18n.locale === 'nl' ? 'nl' : 'en'; };
    defaultLanguage();
    document.getElementById('r-file').addEventListener('change', (e) => {
      const name = (e.target.files[0] && e.target.files[0].name) || '';
      if (/(^|[^a-z])(nl|dutch|nederlands)([^a-z]|$)|leerkracht|gids/i.test(name)) languageSelect.value = 'nl';
      else if (/(^|[^a-z])(en|eng|english)([^a-z]|$)|teacher|guide/i.test(name)) languageSelect.value = 'en';
    });

    document.getElementById('resource-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('resource-error');
      const submitBtn = document.getElementById('resource-submit-btn');
      submitBtn.disabled = true;
      try {
        const title = document.getElementById('r-title').value.trim();
        const description = document.getElementById('r-description').value.trim();
        const category = categorySelect.value;
        const language = languageSelect.value === 'nl' ? 'nl' : 'en';
        if (!title) throw new Error(t('adminErrorTitleRequired'));

        let fileKey = null, externalUrl = null;
        if (category === 'document') {
          const fileInput = document.getElementById('r-file');
          if (!fileInput.files[0]) throw new Error(t('adminErrorChooseFile'));
          fileKey = await uploadResourceFile(fileInput.files[0]);
        } else {
          externalUrl = document.getElementById('r-url').value.trim();
          if (!externalUrl) throw new Error(t('adminErrorAddUrl'));
        }

        await api('/api/admin/teacher-resources', {
          method: 'POST',
          body: JSON.stringify({ title, description, category, fileKey, externalUrl, language }),
        });

        document.getElementById('resource-form').reset();
        document.getElementById('r-upload-status').textContent = '';
        syncResourceFields(); // reset() puts Type back to Document
        defaultLanguage();
        await loadResources();
      } catch (err) {
        showError('resource-error', err.message || t('adminErrorSaveResource'));
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  async function uploadResourceFile(file) {
    const status = document.getElementById('r-upload-status');
    status.textContent = t('adminUploading');
    const key = `teacher-resources/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { url } = await api('/api/admin/upload-url', {
      method: 'POST',
      body: JSON.stringify({ key, contentType: file.type || 'application/octet-stream' }),
    });
    const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    if (!putRes.ok) throw new Error(t('adminErrorUploadFailed'));
    status.textContent = t('adminUploaded');
    return key;
  }

  async function loadResources() {
    const container = document.getElementById('resource-list');
    try {
      const data = await api('/api/admin/teacher-resources');
      const resources = data.resources || [];
      if (!resources.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoResourcesYet'))}</p>`;
        return;
      }
      container.innerHTML = '';
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `<thead><tr><th>${t('adminFieldTitle')}</th><th>${t('adminFieldType')}</th><th>${t('adminFieldLanguage')}</th><th>${t('adminActive')}</th><th></th></tr></thead>`;
      const tbody = document.createElement('tbody');
      resources.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(r.title)}</td>
          <td>${escapeHtml(t(({ document: 'resourceCategoryDocument', tool: 'resourceCategoryTool', link: 'resourceCategoryLink' })[r.category] || 'resourceCategoryDocument'))}</td>
          <td class="r-lang-cell"></td>
          <td>${r.active ? escapeHtml(t('adminYes')) : escapeHtml(t('adminNo'))}</td>
        `;
        // Language can be changed in place (e.g. to label files that
        // were uploaded before languages existed).
        const langSelect = document.createElement('select');
        langSelect.innerHTML = `<option value="en">EN</option><option value="nl">NL</option>`;
        langSelect.value = r.language === 'nl' ? 'nl' : 'en';
        langSelect.addEventListener('change', async () => {
          await api(`/api/admin/teacher-resources/${r.id}`, { method: 'PATCH', body: JSON.stringify({ language: langSelect.value }) });
          loadResources();
        });
        tr.querySelector('.r-lang-cell').appendChild(langSelect);
        const actionsTd = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'admin-resource-actions';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = r.active ? t('adminHide') : t('adminShow');
        toggleBtn.addEventListener('click', async () => {
          await api(`/api/admin/teacher-resources/${r.id}`, { method: 'PATCH', body: JSON.stringify({ active: r.active ? 0 : 1 }) });
          loadResources();
        });
        actions.appendChild(toggleBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'danger';
        deleteBtn.textContent = t('adminDelete');
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(t('adminConfirmDelete', { name: r.title }))) return;
          await api(`/api/admin/teacher-resources/${r.id}`, { method: 'DELETE' });
          loadResources();
        });
        actions.appendChild(deleteBtn);

        actionsTd.appendChild(actions);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadResources'))}</p>`;
    }
  }

  // ── Pages directory ──
  function setupPageForm() {
    document.getElementById('page-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('page-error');
      const submitBtn = document.getElementById('page-submit-btn');
      submitBtn.disabled = true;
      try {
        const label = document.getElementById('p-label').value.trim();
        const url = document.getElementById('p-url').value.trim();
        const kind = document.getElementById('p-kind').value;
        const status = document.getElementById('p-status').value;
        const description = document.getElementById('p-description').value.trim();
        if (!label || !url) throw new Error(t('adminErrorLabelUrlRequired'));

        await api('/api/admin/pages', {
          method: 'POST',
          body: JSON.stringify({ label, url, kind, status, description }),
        });

        document.getElementById('page-form').reset();
        await loadPages();
      } catch (err) {
        showError('page-error', err.message || t('adminErrorSavePage'));
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  const PAGE_STATUS_KEY = { live: 'pageStatusLive', planned: 'pageStatusPlanned', stub: 'pageStatusStub' };
  const PAGE_KIND_KEY = { internal: 'pageKindInternal', external: 'pageKindExternal' };

  async function loadPages() {
    const container = document.getElementById('pages-list');
    try {
      const data = await api('/api/admin/pages');
      const pages = data.pages || [];
      if (!pages.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoPagesYet'))}</p>`;
        return;
      }
      container.innerHTML = '';
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `<thead><tr><th>${t('adminFieldLabel')}</th><th>${t('adminFieldUrl')}</th><th>${t('adminFieldKind')}</th><th>${t('adminFieldStatus')}</th><th></th></tr></thead>`;
      const tbody = document.createElement('tbody');
      pages.forEach(p => {
        const tr = document.createElement('tr');
        const isExternal = p.kind === 'external';
        const linkHtml = isExternal
          ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.url)}</a>`
          : `<a href="${escapeHtml(p.url)}">${escapeHtml(p.url)}</a>`;
        tr.innerHTML = `
          <td>${escapeHtml(p.label)}${p.description ? `<br><span class="admin-empty-note">${escapeHtml(p.description)}</span>` : ''}</td>
          <td>${linkHtml}</td>
          <td>${escapeHtml(t(PAGE_KIND_KEY[p.kind] || 'pageKindInternal'))}</td>
          <td>${escapeHtml(t(PAGE_STATUS_KEY[p.status] || 'pageStatusLive'))}</td>
        `;
        const actionsTd = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'admin-resource-actions';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = p.active ? t('adminHide') : t('adminShow');
        toggleBtn.addEventListener('click', async () => {
          await api(`/api/admin/pages/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: p.active ? 0 : 1 }) });
          loadPages();
        });
        actions.appendChild(toggleBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'danger';
        deleteBtn.textContent = t('adminDelete');
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(t('adminConfirmDelete', { name: p.label }))) return;
          await api(`/api/admin/pages/${p.id}`, { method: 'DELETE' });
          loadPages();
        });
        actions.appendChild(deleteBtn);

        actionsTd.appendChild(actions);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadPages'))}</p>`;
    }
  }

  // ── Marketing: social links ──
  const PLATFORM_LABEL = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', threads: 'Threads', x: 'X', other: 'Other' };

  function setupSocialLinkForm() {
    document.getElementById('social-link-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('social-link-error');
      const submitBtn = document.getElementById('social-link-submit-btn');
      submitBtn.disabled = true;
      try {
        const platform = document.getElementById('sl-platform').value;
        const label = document.getElementById('sl-label').value.trim();
        const url = document.getElementById('sl-url').value.trim();
        if (!url) throw new Error(t('adminErrorAddUrl'));
        await api('/api/admin/social-links', { method: 'POST', body: JSON.stringify({ platform, label, url }) });
        document.getElementById('social-link-form').reset();
        await loadSocialLinks();
      } catch (err) {
        showError('social-link-error', err.message || t('adminErrorSavePage'));
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  async function loadSocialLinks() {
    const container = document.getElementById('social-links-list');
    try {
      const data = await api('/api/admin/social-links');
      const links = data.links || [];
      if (!links.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoSocialLinksYet'))}</p>`;
        return;
      }
      container.innerHTML = '';
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `<thead><tr><th>${t('adminFieldPlatform')}</th><th>${t('adminFieldUrl')}</th><th></th></tr></thead>`;
      const tbody = document.createElement('tbody');
      links.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(PLATFORM_LABEL[l.platform] || l.platform)}${l.label ? `<br><span class="admin-empty-note">${escapeHtml(l.label)}</span>` : ''}</td>
          <td><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.url)}</a></td>
        `;
        const actionsTd = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'admin-resource-actions';
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = l.active ? t('adminHide') : t('adminShow');
        toggleBtn.addEventListener('click', async () => {
          await api(`/api/admin/social-links/${l.id}`, { method: 'PATCH', body: JSON.stringify({ active: l.active ? 0 : 1 }) });
          loadSocialLinks();
        });
        actions.appendChild(toggleBtn);
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'danger';
        deleteBtn.textContent = t('adminDelete');
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(t('adminConfirmDelete', { name: PLATFORM_LABEL[l.platform] || l.platform }))) return;
          await api(`/api/admin/social-links/${l.id}`, { method: 'DELETE' });
          loadSocialLinks();
        });
        actions.appendChild(deleteBtn);
        actionsTd.appendChild(actions);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadSocialLinks'))}</p>`;
    }
  }

  // ── Marketing: generate social posts ──
  function setupMarketingGenerator() {
    document.getElementById('marketing-generate-btn').addEventListener('click', async () => {
      clearError('marketing-error');
      const source = document.getElementById('mkt-source').value.trim();
      const platforms = Array.from(document.querySelectorAll('.mkt-platform:checked')).map(el => el.value);
      const includeCta = document.getElementById('mkt-include-cta').checked;
      const resultsEl = document.getElementById('marketing-results');
      const btn = document.getElementById('marketing-generate-btn');
      if (!source) return showError('marketing-error', t('adminErrorSourceRequired'));
      if (!platforms.length) return showError('marketing-error', t('adminErrorPlatformRequired'));
      btn.disabled = true;
      resultsEl.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminGenerating'))}</p>`;
      try {
        const data = await api('/api/admin/marketing/generate', { method: 'POST', body: JSON.stringify({ sourceText: source, platforms, includeCta }) });
        renderMarketingResults(resultsEl, data.results);
        loadMarketingHistory();
      } catch (err) {
        resultsEl.innerHTML = '';
        showError('marketing-error', err.message || t('adminErrorGenerateFailed'));
      } finally {
        btn.disabled = false;
      }
    });
  }

  function renderMarketingResults(container, results) {
    container.innerHTML = '';
    Object.keys(results).forEach(platform => {
      const card = document.createElement('div');
      card.className = 'mkt-result-card';
      const header = document.createElement('div');
      header.className = 'mkt-result-platform';
      const label = document.createElement('span');
      label.textContent = PLATFORM_LABEL[platform] || platform;
      header.appendChild(label);
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn-ghost btn-sm';
      copyBtn.textContent = t('adminCopy');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(results[platform]);
          copyBtn.textContent = t('adminCopied');
          setTimeout(() => { copyBtn.textContent = t('adminCopy'); }, 1800);
        } catch { /* clipboard permission denied — text is still visible to select manually */ }
      });
      header.appendChild(copyBtn);
      card.appendChild(header);
      const text = document.createElement('div');
      text.className = 'mkt-result-text';
      text.textContent = results[platform];
      card.appendChild(text);
      container.appendChild(card);
    });
  }

  async function loadMarketingHistory() {
    const container = document.getElementById('marketing-history-list');
    try {
      const data = await api('/api/admin/marketing/history');
      const history = data.history || [];
      if (!history.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoMarketingHistoryYet'))}</p>`;
        return;
      }
      container.innerHTML = '';
      history.forEach(item => {
        const row = document.createElement('div');
        row.className = 'mkt-history-item';
        const source = document.createElement('div');
        source.className = 'mkt-history-source';
        source.textContent = item.source_text.length > 140 ? item.source_text.slice(0, 140) + '…' : item.source_text;
        row.appendChild(source);
        const resultsWrap = document.createElement('div');
        renderMarketingResults(resultsWrap, item.results);
        row.appendChild(resultsWrap);
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn-ghost btn-sm';
        deleteBtn.style.marginTop = '8px';
        deleteBtn.textContent = t('adminDelete');
        deleteBtn.addEventListener('click', async () => {
          await api(`/api/admin/marketing/history/${item.id}`, { method: 'DELETE' });
          loadMarketingHistory();
        });
        row.appendChild(deleteBtn);
        container.appendChild(row);
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadHistory'))}</p>`;
    }
  }

  // ── Notify email — where teacher signup requests and in-app
  // questions get sent (app_config.contact_email, see server.js). ──
  async function loadAdminSettings() {
    try {
      const data = await api('/api/admin/settings');
      document.getElementById('notify-email').value = data.notifyEmail || '';
      document.getElementById('preview-scene-limit').value = data.previewSceneLimit ?? '';
      document.getElementById('club-mare-preview-limit').value = data.clubMarePreviewLimit ?? '';
      document.getElementById('talk-preview-message-limit').value = data.talkPreviewMessageLimit ?? '';
      document.getElementById('teacher-doc-preview-pages').value = data.teacherDocPreviewPages ?? '';
    } catch {
      // Non-critical — the fields just stay blank if this fails, no
      // need for a dedicated error state on a couple of inputs.
    }
  }
  function setupAdminSettings() {
    document.getElementById('notify-email-save-btn').addEventListener('click', async () => {
      const errorEl = document.getElementById('notify-email-error');
      const successEl = document.getElementById('notify-email-success');
      errorEl.hidden = true;
      successEl.hidden = true;
      const notifyEmail = document.getElementById('notify-email').value.trim();
      const numOrUndefined = (id) => {
        const v = document.getElementById(id).value;
        return v === '' ? undefined : Number(v);
      };
      try {
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            notifyEmail,
            previewSceneLimit: numOrUndefined('preview-scene-limit'),
            clubMarePreviewLimit: numOrUndefined('club-mare-preview-limit'),
            talkPreviewMessageLimit: numOrUndefined('talk-preview-message-limit'),
            teacherDocPreviewPages: numOrUndefined('teacher-doc-preview-pages'),
          }),
        });
        successEl.textContent = t('adminSaved');
        successEl.hidden = false;
        setTimeout(() => { successEl.hidden = true; }, 3000);
      } catch (err) {
        errorEl.textContent = err.message || t('errorGeneric');
        errorEl.hidden = false;
      }
    });
  }

  // ── Directory ──
  async function loadDirectory() {
    try {
      const data = await api('/api/admin/parents');
      renderAccountsTable('parents-table', data.parents || [], ['name', 'email', 'preferred_locale', 'created_at'], 'parents');
    } catch {
      document.getElementById('parents-table').innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadParents'))}</p>`;
    }
    try {
      const data = await api('/api/admin/teachers');
      renderAccountsTable('teachers-table', data.teachers || [], ['name', 'email', 'school', 'preferred_locale', 'created_at'], 'teachers');
    } catch {
      document.getElementById('teachers-table').innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadTeachers'))}</p>`;
    }
  }

  // kind: 'parents' | 'teachers' — used to build the /api/admin/{kind}/:id/status URL.
  function renderAccountsTable(containerId, rows, columns, kind) {
    const container = document.getElementById(containerId);
    if (!rows.length) {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
      return;
    }
    const table = document.createElement('table');
    table.className = 'admin-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>${columns.map(c => `<th>${labelFor(c)}</th>`).join('')}<th>${escapeHtml(t('adminFieldStatus'))}</th><th></th></tr>`;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      const suspended = row.status === 'suspended';
      tr.innerHTML = columns.map(c => `<td>${escapeHtml(row[c] ?? '—')}</td>`).join('') +
        `<td><span class="status-badge ${suspended ? 'suspended' : 'active'}">${escapeHtml(t(suspended ? 'adminStatusSuspended' : 'adminStatusActive'))}</span></td>`;
      const actionTd = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-ghost btn-small';
      btn.textContent = t(suspended ? 'adminReactivate' : 'adminSuspend');
      btn.addEventListener('click', async () => {
        const nextStatus = suspended ? 'active' : 'suspended';
        if (!suspended && !window.confirm(t('adminSuspendConfirm', { name: row.name }))) return;
        btn.disabled = true;
        try {
          await api(`/api/admin/${kind}/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
          loadDirectory();
        } catch {
          btn.disabled = false;
        }
      });
      actionTd.appendChild(btn);
      if (kind === 'teachers') {
        const resendBtn = document.createElement('button');
        resendBtn.type = 'button';
        resendBtn.className = 'btn-ghost btn-small';
        resendBtn.style.marginLeft = '6px';
        resendBtn.textContent = t('adminResendInvite');
        resendBtn.addEventListener('click', async () => {
          resendBtn.disabled = true;
          const original = resendBtn.textContent;
          try {
            await api(`/api/admin/teachers/${row.id}/resend-invite`, { method: 'POST' });
            resendBtn.textContent = t('adminResendInviteSent');
            if (currentUser && currentUser.role === 'admin') loadEmailLog();
            setTimeout(() => { resendBtn.textContent = original; resendBtn.disabled = false; }, 3000);
          } catch {
            resendBtn.textContent = original;
            resendBtn.disabled = false;
          }
        });
        actionTd.appendChild(resendBtn);
      }
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
  }

  // ── Backups (admin only) ──
  function formatBytes(n) {
    if (n == null) return '';
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
  function formatWhen(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(window.MareI18n.locale === 'nl' ? 'nl-NL' : 'en-GB',
        { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  async function loadBackups() {
    const container = document.getElementById('backup-daily-table');
    const lastRunEl = document.getElementById('backup-last-run');
    try {
      const data = await api('/api/admin/backup/daily');
      if (data.lastRun) {
        lastRunEl.textContent = data.lastRun.ok
          ? t('adminBackupLastRunOk', { when: formatWhen(data.lastRun.at) })
          : t('adminBackupLastRunFailed', { when: formatWhen(data.lastRun.at), error: data.lastRun.error || '' });
        lastRunEl.style.color = data.lastRun.ok ? '' : '#A33B3B';
        lastRunEl.hidden = false;
      } else {
        lastRunEl.hidden = true;
      }
      if (!data.configured) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminBackupNotConfigured'))}</p>`;
        return;
      }
      const rows = data.backups || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminBackupNoneYet'))}</p>`;
        return;
      }
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `<thead><tr>
        <th>${escapeHtml(t('adminBackupColFile'))}</th>
        <th>${escapeHtml(t('adminBackupColSaved'))}</th>
        <th>${escapeHtml(t('adminBackupColSize'))}</th>
        <th></th>
      </tr></thead>`;
      const tbody = document.createElement('tbody');
      rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(row.filename)}</td>
          <td>${escapeHtml(formatWhen(row.modifiedAt))}</td>
          <td>${escapeHtml(formatBytes(row.sizeBytes))}</td>
          <td><a class="btn-ghost btn-small" href="/api/admin/backup/daily/${encodeURIComponent(row.filename)}">${escapeHtml(t('adminBackupDownloadShort'))}</a></td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.innerHTML = '';
      container.appendChild(table);
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminBackupCouldNotLoad'))}</p>`;
    }
  }

  function setupBackups() {
    const runBtn = document.getElementById('backup-run-btn');
    runBtn.addEventListener('click', async () => {
      const label = runBtn.textContent;
      runBtn.disabled = true;
      runBtn.textContent = t('adminBackupRunning');
      try {
        await api('/api/admin/backup/run', { method: 'POST' });
      } catch (err) {
        alert(err.message || t('errorGeneric'));
      } finally {
        runBtn.disabled = false;
        runBtn.textContent = label;
        loadBackups();
      }
    });

    const fileInput = document.getElementById('backup-restore-file');
    const restoreBtn = document.getElementById('backup-restore-btn');
    const errorEl = document.getElementById('backup-restore-error');
    fileInput.addEventListener('change', () => {
      restoreBtn.disabled = !fileInput.files.length;
      errorEl.hidden = true;
    });
    restoreBtn.addEventListener('click', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      errorEl.hidden = true;
      if (!window.confirm(t('adminBackupRestoreConfirm', { file: file.name }))) return;
      const label = restoreBtn.textContent;
      restoreBtn.disabled = true;
      fileInput.disabled = true;
      restoreBtn.textContent = t('adminBackupRestoring');
      try {
        const res = await fetch('/api/admin/backup/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || t('errorGeneric'));
        alert(t('adminBackupRestoreDone'));
        window.location.reload();
      } catch (err) {
        errorEl.textContent = err.message || t('errorGeneric');
        errorEl.hidden = false;
        restoreBtn.disabled = false;
        fileInput.disabled = false;
        restoreBtn.textContent = label;
      }
    });
  }

  // ── Email log (admin only) ──
  async function loadEmailLog() {
    const container = document.getElementById('email-log-table');
    try {
      const data = await api('/api/admin/email-log');
      const rows = data.log || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      const KIND_LABEL_KEY = {
        welcome_parent: 'emailKindWelcomeParent',
        welcome_teacher: 'emailKindWelcomeTeacher',
        password_reset: 'emailKindPasswordReset',
        broadcast: 'emailKindBroadcast',
        other: 'emailKindOther',
      };
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `<thead><tr>
        <th>${escapeHtml(t('adminEmailLogTo'))}</th>
        <th>${escapeHtml(t('adminEmailLogSubject'))}</th>
        <th>${escapeHtml(t('adminEmailLogKind'))}</th>
        <th>${escapeHtml(t('adminFieldStatus'))}</th>
        <th>${escapeHtml(t('adminEmailLogError'))}</th>
        <th>${escapeHtml(t('adminJoined'))}</th>
      </tr></thead>`;
      const tbody = document.createElement('tbody');
      rows.forEach(row => {
        const tr = document.createElement('tr');
        const statusClass = row.status === 'sent' ? 'sent' : row.status === 'failed' ? 'failed' : 'sending';
        const statusLabel = t(row.status === 'sent' ? 'adminEmailStatusSent' : row.status === 'failed' ? 'adminEmailStatusFailed' : 'adminEmailStatusPending');
        tr.innerHTML = `
          <td>${escapeHtml(row.to_email)}</td>
          <td>${escapeHtml(row.subject)}</td>
          <td>${escapeHtml(t(KIND_LABEL_KEY[row.kind] || 'emailKindOther'))}</td>
          <td><span class="bc-status ${statusClass}">${escapeHtml(statusLabel)}</span></td>
          <td style="max-width:260px;font-size:0.82rem;color:#A33B3B;">${escapeHtml(row.error || '')}</td>
          <td>${escapeHtml(row.created_at)}</td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.innerHTML = '';
      container.appendChild(table);
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadEmailLog'))}</p>`;
    }
  }

  function setupClearEmailLog() {
    const btn = document.getElementById('clear-email-log-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!window.confirm(t('adminClearEmailLogConfirm'))) return;
      btn.disabled = true;
      try {
        await api('/api/admin/email-log', { method: 'DELETE' });
        loadEmailLog();
      } catch {
        alert(t('errorGeneric'));
      } finally {
        btn.disabled = false;
      }
    });
  }

  function labelFor(col) {
    const map = { name: 'fieldName', email: 'fieldEmail', school: 'fieldSchool', preferred_locale: 'adminLocale', created_at: 'adminJoined' };
    return escapeHtml(t(map[col] || col));
  }

  // ── Staff ──
  // Mare App 5 — staff are picked from existing parents/teachers. The
  // staff account is linked to that account: same email, same password,
  // and the person chooses the role in the sign-in popup.
  let staffPick = null; // { kind, id, name, email }
  function staffKindLabel(kind) { return t(kind === 'teacher' ? 'adminStaffKindTeacher' : 'adminStaffKindParent'); }
  function setupStaffForm() {
    const search = document.getElementById('s-search');
    const results = document.getElementById('s-results');
    const picked = document.getElementById('s-picked');
    search.placeholder = t('adminStaffFindPlaceholder');
    let timer = null, seq = 0;

    function showPicked() {
      search.hidden = !!staffPick;
      results.hidden = true;
      picked.hidden = !staffPick;
      if (staffPick) {
        document.getElementById('s-picked-text').textContent =
          `${staffPick.name} \u00b7 ${staffPick.email} \u00b7 ${staffKindLabel(staffPick.kind)}`;
      }
    }

    async function runSearch() {
      const q = search.value.trim();
      const mine = ++seq;
      if (q.length < 2) { results.hidden = true; results.innerHTML = ''; return; }
      try {
        const data = await api('/api/admin/staff/candidates?q=' + encodeURIComponent(q));
        if (mine !== seq) return; // a newer search has started
        const people = data.people || [];
        results.innerHTML = '';
        if (!people.length) {
          results.innerHTML = `<p class="staff-results-empty">${escapeHtml(t('adminStaffNoMatch'))}</p>`;
        }
        people.forEach(p => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'staff-result';
          b.disabled = !!p.isStaff;
          const note = p.isStaff ? t('adminStaffAlready') : (p.status === 'suspended' ? t('adminStaffSuspended') : '');
          b.innerHTML = `<strong>${escapeHtml(p.name)}</strong> <span>${escapeHtml(p.email)}</span>
            <em>${escapeHtml(staffKindLabel(p.kind))}${note ? ' \u00b7 ' + escapeHtml(note) : ''}</em>`;
          b.addEventListener('click', () => {
            staffPick = { kind: p.kind, id: p.id, name: p.name, email: p.email };
            clearError('staff-error');
            showPicked();
          });
          results.appendChild(b);
        });
        results.hidden = false;
      } catch {
        if (mine === seq) { results.innerHTML = `<p class="staff-results-empty">${escapeHtml(t('adminStaffSearchFailed'))}</p>`; results.hidden = false; }
      }
    }

    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(runSearch, 250); });
    // Enter in the search box searches; it never submits the form.
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); runSearch(); } });
    document.getElementById('s-change').addEventListener('click', () => {
      staffPick = null;
      showPicked();
      search.focus();
      if (search.value.trim().length >= 2) runSearch();
    });

    document.getElementById('staff-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('staff-error');
      document.getElementById('staff-done').hidden = true;
      if (!staffPick) { showError('staff-error', t('adminStaffPickFirst')); return; }
      try {
        const role = document.getElementById('s-role').value;
        const sendWelcome = document.getElementById('s-welcome').checked;
        const res = await api('/api/admin/staff', { method: 'POST', body: JSON.stringify({ linkedRole: staffPick.kind, linkedId: staffPick.id, role, sendWelcome }) });
        const done = document.getElementById('staff-done');
        done.textContent = t(res.emailed === true ? 'adminStaffDoneEmailed' : (res.emailed === false ? 'adminStaffDoneEmailFailed' : 'adminStaffDone'), { name: staffPick.name });
        done.classList.toggle('warn', res.emailed === false);
        done.hidden = false;
        staffPick = null;
        document.getElementById('staff-form').reset();
        results.innerHTML = '';
        showPicked();
        loadStaff();
      } catch (err) {
        const key = err.message === 'Already staff' ? 'adminStaffAlreadyError' : SERVER_ERROR_MAP[err.message];
        showError('staff-error', t(key || 'adminErrorCreateAccount'));
      }
    });
  }

  async function loadStaff() {
    const container = document.getElementById('staff-table');
    try {
      const data = await api('/api/admin/staff');
      const staff = data.staff || [];
      if (!staff.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `<thead><tr><th>${t('fieldName')}</th><th>${t('fieldEmail')}</th><th>${t('adminFieldRole')}</th><th>${t('adminStaffSignsIn')}</th><th>${t('adminSince')}</th><th></th></tr></thead>`;
      const tbody = document.createElement('tbody');
      staff.forEach(s => {
        const isMe = currentUser && s.id === currentUser.id;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.email)}</td>
          <td>${isMe
            ? `<span class="role-pill ${s.role === 'admin' ? 'admin' : ''}">${escapeHtml(t(s.role === 'admin' ? 'staffRoleAdmin' : (s.role === 'editor' ? 'staffRoleEditor' : 'staffRoleSupport')))}</span> <span class="admin-empty-note">${escapeHtml(t('adminStaffYou'))}</span>`
            : `<select class="staff-role-select" aria-label="${escapeHtml(t('adminFieldRole'))}">
                ${['support', 'editor', 'admin'].map(r => `<option value="${r}"${s.role === r ? ' selected' : ''}>${escapeHtml(t(r === 'admin' ? 'staffRoleAdmin' : (r === 'editor' ? 'staffRoleEditor' : 'staffRoleSupport')))}</option>`).join('')}
              </select>`}</td>
          <td>${escapeHtml(t(s.linked_role === 'teacher' ? 'adminStaffLoginTeacher' : (s.linked_role === 'parent' ? 'adminStaffLoginParent' : 'adminStaffLoginOwn')))}</td>
          <td>${escapeHtml(s.created_at)}</td>
          <td class="staff-actions">${isMe ? '' : `
            <button type="button" class="btn-ghost btn-small staff-welcome-btn">${escapeHtml(t('adminStaffResendWelcome'))}</button>
            <button type="button" class="btn-ghost btn-small btn-danger staff-remove-btn">${escapeHtml(t('adminStaffRemove'))}</button>`}
            <span class="staff-row-msg" role="status"></span></td>
        `;
        if (!isMe) {
          const msg = tr.querySelector('.staff-row-msg');
          const say = (ok, text) => { msg.textContent = text; msg.className = 'staff-row-msg ' + (ok ? 'ok' : 'err'); };
          const sel = tr.querySelector('.staff-role-select');
          sel.addEventListener('change', async () => {
            const prev = s.role;
            try {
              await api(`/api/admin/staff/${s.id}`, { method: 'PATCH', body: JSON.stringify({ role: sel.value }) });
              s.role = sel.value;
              say(true, t('adminStaffRoleChanged'));
            } catch (err) { sel.value = prev; say(false, err.message || t('errorGeneric')); }
          });
          tr.querySelector('.staff-welcome-btn').addEventListener('click', async () => {
            try {
              await api(`/api/admin/staff/${s.id}/welcome`, { method: 'POST' });
              say(true, t('adminStaffWelcomeSent'));
            } catch (err) { say(false, err.message || t('errorGeneric')); }
          });
          tr.querySelector('.staff-remove-btn').addEventListener('click', async () => {
            if (!confirm(t('adminStaffRemoveConfirm', { name: s.name }))) return;
            try {
              await api(`/api/admin/staff/${s.id}`, { method: 'DELETE' });
              loadStaff();
            } catch (err) { say(false, err.message || t('errorGeneric')); }
          });
        }
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.innerHTML = '';
      container.appendChild(table);
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadStaff'))}</p>`;
    }
  }

  // ── Messaging: broadcasts ──
  let bcEditor = null; // the shared editor (post-editor.js, email mode), mounted per compose-modal open
  let bcEditingId = null; // id of the broadcast being edited, or null for a fresh compose

  function fmtDate(str) {
    if (!str) return '—';
    return str.replace('T', ' ').slice(0, 16);
  }

  async function loadBroadcasts() {
    const container = document.getElementById('broadcasts-list');
    try {
      const data = await api('/api/admin/broadcasts');
      const rows = data.broadcasts || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(b => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(b.subject)}</div>
            <div class="admin-list-item-sub">
              <span class="bc-status ${b.status}">${escapeHtml(t('bcStatus_' + b.status))}</span>
              &nbsp;·&nbsp; ${escapeHtml(t('audience' + capitalize(b.audience)))}
              ${b.status === 'scheduled' ? ` · ${escapeHtml(t('adminScheduledFor', { time: fmtDate(b.scheduled_for) }))}` : ''}
              ${b.status === 'sent' ? ` · ${escapeHtml(t('adminSentCount', { sent: b.sent_count, total: b.recipient_count }))}` : ''}
            </div>
          </div>
          <div class="admin-list-item-actions">
            ${b.status === 'draft' || b.status === 'scheduled' ? `<button type="button" class="btn-ghost btn-small" data-edit="${b.id}">${escapeHtml(t('adminEdit'))}</button>` : ''}
            ${b.status === 'draft' || b.status === 'scheduled' ? `<button type="button" class="btn-ghost btn-small" data-delete="${b.id}">${escapeHtml(t('adminDelete'))}</button>` : ''}
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => openBroadcastModal(btn.getAttribute('data-edit')));
      });
      container.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/broadcasts/${btn.getAttribute('data-delete')}`, { method: 'DELETE' });
          loadBroadcasts();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadMessages'))}</p>`;
    }
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  async function openBroadcastModal(id) {
    bcEditingId = id || null;
    document.getElementById('broadcast-error').hidden = true;
    document.getElementById('broadcast-success').hidden = true;
    document.getElementById('bc-schedule-field').hidden = true;
    document.getElementById('broadcast-modal-title').textContent = t(id ? 'adminEditMessage' : 'adminComposeMessage');

    let subject = '', audience = 'parents', bodyHtml = '';
    if (id) {
      try {
        const data = await api(`/api/admin/broadcasts/${id}`);
        subject = data.broadcast.subject;
        audience = data.broadcast.audience;
        bodyHtml = data.broadcast.body_html;
      } catch {
        showModalError('broadcast-error', t('errorGeneric'));
        return;
      }
    }
    document.getElementById('bc-subject').value = subject;
    document.getElementById('bc-audience').value = audience;

    if (bcEditor) bcEditor.destroy();
    // Mare App 5 — the one shared editor, in email mode (no video/sound).
    bcEditor = window.MarePostEditor.mount('bc-editor-mount', { mode: 'email', placeholder: t('adminMessagePlaceholder') });
    if (bcEditor) bcEditor.setHtml(bodyHtml || '');

    document.getElementById('broadcast-modal').hidden = false;
  }

  function showModalError(id, message) {
    const el = document.getElementById(id);
    el.textContent = message;
    el.hidden = false;
  }

  async function saveBroadcast(sendAfter) {
    const subject = document.getElementById('bc-subject').value.trim();
    const audience = document.getElementById('bc-audience').value;
    const bodyHtml = bcEditor ? bcEditor.getHtml() : '';
    const bodyText = bcEditor ? bcEditor.getText() : '';
    if (!subject || !bodyText.trim()) {
      showModalError('broadcast-error', t('errorMissingFields'));
      return null;
    }
    document.getElementById('broadcast-error').hidden = true;
    try {
      if (bcEditingId) {
        await api(`/api/admin/broadcasts/${bcEditingId}`, { method: 'PATCH', body: JSON.stringify({ subject, bodyHtml, bodyText, audience }) });
        return bcEditingId;
      }
      const res = await api('/api/admin/broadcasts', { method: 'POST', body: JSON.stringify({ subject, bodyHtml, bodyText, audience }) });
      bcEditingId = res.id;
      return res.id;
    } catch {
      showModalError('broadcast-error', t('errorGeneric'));
      return null;
    }
  }

  function setupBroadcastModal() {
    document.getElementById('new-broadcast-btn').addEventListener('click', () => openBroadcastModal(null));
    document.getElementById('bc-close-btn').addEventListener('click', () => {
      document.getElementById('broadcast-modal').hidden = true;
      if (bcEditor) { bcEditor.destroy(); bcEditor = null; }
      loadBroadcasts();
    });
    document.getElementById('bc-save-btn').addEventListener('click', async () => {
      const id = await saveBroadcast();
      if (id) {
        document.getElementById('broadcast-success').textContent = t('adminDraftSaved');
        document.getElementById('broadcast-success').hidden = false;
        loadBroadcasts();
      }
    });
    document.getElementById('bc-test-btn').addEventListener('click', async () => {
      const id = await saveBroadcast();
      if (!id) return;
      const btn = document.getElementById('bc-test-btn');
      btn.disabled = true;
      try {
        await api(`/api/admin/broadcasts/${id}/send-test`, { method: 'POST' });
        document.getElementById('broadcast-success').textContent = t('adminTestSent');
        document.getElementById('broadcast-success').hidden = false;
      } catch {
        showModalError('broadcast-error', t('adminTestSendFailed'));
      } finally {
        btn.disabled = false;
      }
    });
    document.getElementById('bc-schedule-btn').addEventListener('click', () => {
      document.getElementById('bc-schedule-field').hidden = false;
    });
    document.getElementById('bc-schedule-confirm-btn').addEventListener('click', async () => {
      const id = await saveBroadcast();
      if (!id) return;
      const scheduledFor = document.getElementById('bc-schedule-time').value;
      if (!scheduledFor) return;
      try {
        await api(`/api/admin/broadcasts/${id}/schedule`, { method: 'POST', body: JSON.stringify({ scheduledFor }) });
        document.getElementById('broadcast-modal').hidden = true;
        if (bcEditor) { bcEditor.destroy(); bcEditor = null; }
        loadBroadcasts();
      } catch {
        showModalError('broadcast-error', t('errorGeneric'));
      }
    });
    document.getElementById('bc-send-btn').addEventListener('click', async () => {
      if (!window.confirm(t('adminSendNowConfirm'))) return;
      const id = await saveBroadcast();
      if (!id) return;
      try {
        await api(`/api/admin/broadcasts/${id}/send`, { method: 'POST' });
        document.getElementById('broadcast-modal').hidden = true;
        if (bcEditor) { bcEditor.destroy(); bcEditor = null; }
        loadBroadcasts();
      } catch {
        showModalError('broadcast-error', t('errorGeneric'));
      }
    });
  }

  // ── Messaging: What's New ──
  let wnEditingId = null;

  async function loadWhatsNew() {
    const container = document.getElementById('whats-new-list');
    try {
      const data = await api('/api/admin/whats-new-items');
      const rows = data.items || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(item => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(item.title)}</div>
            <div class="admin-list-item-sub">
              <span class="status-badge ${item.active ? 'active' : 'suspended'}">${escapeHtml(t(item.active ? 'adminActive' : 'adminInactive'))}</span>
              &nbsp;·&nbsp; ${escapeHtml(t('audience' + capitalize(item.audience)))}
            </div>
          </div>
          <div class="admin-list-item-actions">
            <button type="button" class="btn-ghost btn-small" data-edit-wn="${item.id}">${escapeHtml(t('adminEdit'))}</button>
            <button type="button" class="btn-ghost btn-small" data-delete-wn="${item.id}">${escapeHtml(t('adminDelete'))}</button>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit-wn]').forEach(btn => {
        btn.addEventListener('click', () => openWhatsNewModal(btn.getAttribute('data-edit-wn'), rows.find(r => r.id === btn.getAttribute('data-edit-wn'))));
      });
      container.querySelectorAll('[data-delete-wn]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/whats-new-items/${btn.getAttribute('data-delete-wn')}`, { method: 'DELETE' });
          loadWhatsNew();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadWhatsNew'))}</p>`;
    }
  }

  function openWhatsNewModal(id, item) {
    wnEditingId = id || null;
    document.getElementById('whats-new-error').hidden = true;
    document.getElementById('whats-new-modal-title').textContent = t(id ? 'adminEditWhatsNew' : 'adminNewWhatsNew');
    document.getElementById('wn-title').value = item ? item.title : '';
    document.getElementById('wn-audience').value = item ? item.audience : 'both';
    document.getElementById('wn-body').value = item ? (item.body || '') : '';
    document.getElementById('wn-active').checked = item ? !!item.active : true;
    document.getElementById('whats-new-modal').hidden = false;
  }

  function setupWhatsNewModal() {
    document.getElementById('new-whats-new-btn').addEventListener('click', () => openWhatsNewModal(null, null));
    document.getElementById('wn-close-btn').addEventListener('click', () => { document.getElementById('whats-new-modal').hidden = true; });
    document.getElementById('wn-save-btn').addEventListener('click', async () => {
      const title = document.getElementById('wn-title').value.trim();
      const audience = document.getElementById('wn-audience').value;
      const body = document.getElementById('wn-body').value.trim();
      const active = document.getElementById('wn-active').checked;
      if (!title) { showModalError('whats-new-error', t('errorMissingFields')); return; }
      try {
        if (wnEditingId) {
          await api(`/api/admin/whats-new-items/${wnEditingId}`, { method: 'PATCH', body: JSON.stringify({ audience, title, body, active }) });
        } else {
          await api('/api/admin/whats-new', { method: 'POST', body: JSON.stringify({ audience, title, body }) });
        }
        document.getElementById('whats-new-modal').hidden = true;
        loadWhatsNew();
      } catch {
        showModalError('whats-new-error', t('errorGeneric'));
      }
    });
  }

  // ── Sales & Marketing: offers ──
  let ofEditingId = null;

  // Mare App 6 (v72) — the book's Amazon pages (admin only; shown first in the shop).
  async function loadBookAmazon() {
    if (!document.getElementById('ba-uk')) return;
    try {
      const d = await (await fetch('/api/shop/book', { cache: 'no-store' })).json();
      document.getElementById('ba-uk').value = d.uk || '';
      document.getElementById('ba-nl').value = d.nl || '';
    } catch { /* leave empty */ }
  }
  document.getElementById('ba-save-btn') && document.getElementById('ba-save-btn').addEventListener('click', async () => {
    const err = document.getElementById('ba-error');
    err.hidden = true;
    try {
      const out = await api('/api/admin/shop/book', { method: 'PUT', body: JSON.stringify({
        uk: document.getElementById('ba-uk').value, nl: document.getElementById('ba-nl').value }) });
      document.getElementById('ba-uk').value = out.uk || '';
      document.getElementById('ba-nl').value = out.nl || '';
    } catch (e) {
      err.textContent = e.message; err.hidden = false; // the button itself shows ✕
    }
  });

  async function loadOffers() {
    const container = document.getElementById('offers-list');
    try {
      const data = await api('/api/admin/offers-catalog');
      const rows = data.offers || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(o => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(o.code)}</div>
            <div class="admin-list-item-sub">
              <span class="status-badge ${o.active ? 'active' : 'suspended'}">${escapeHtml(t(o.active ? 'adminActive' : 'adminInactive'))}</span>
              &nbsp;·&nbsp; ${o.discount_type === 'percent' ? `${o.discount_value}%` : `${(o.discount_value / 100).toFixed(2)}`} ${escapeHtml(t('adminOfferOff'))}
              ${o.expires_at ? ` · ${escapeHtml(t('adminExpires', { date: o.expires_at }))}` : ''}
            </div>
          </div>
          <div class="admin-list-item-actions">
            <button type="button" class="btn-ghost btn-small" data-edit-of="${o.id}">${escapeHtml(t('adminEdit'))}</button>
            <button type="button" class="btn-ghost btn-small" data-delete-of="${o.id}">${escapeHtml(t('adminDelete'))}</button>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit-of]').forEach(btn => {
        btn.addEventListener('click', () => openOfferModal(btn.getAttribute('data-edit-of'), rows.find(r => r.id === btn.getAttribute('data-edit-of'))));
      });
      container.querySelectorAll('[data-delete-of]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/offers-catalog/${btn.getAttribute('data-delete-of')}`, { method: 'DELETE' });
          loadOffers();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadOffers'))}</p>`;
    }
  }

  function openOfferModal(id, offer) {
    ofEditingId = id || null;
    document.getElementById('offer-error').hidden = true;
    document.getElementById('offer-modal-title').textContent = t(id ? 'adminEditOffer' : 'adminNewOffer');
    document.getElementById('of-code').value = offer ? offer.code : '';
    document.getElementById('of-code').disabled = !!id; // code is immutable once created — it's the lookup key
    document.getElementById('of-description').value = offer ? (offer.description || '') : '';
    document.getElementById('of-type').value = offer ? offer.discount_type : 'percent';
    document.getElementById('of-value').value = offer ? offer.discount_value : '';
    document.getElementById('of-expires').value = offer && offer.expires_at ? offer.expires_at.slice(0, 10) : '';
    document.getElementById('of-active').checked = offer ? !!offer.active : true;
    document.getElementById('offer-modal').hidden = false;
  }

  function setupOfferModal() {
    document.getElementById('new-offer-btn').addEventListener('click', () => openOfferModal(null, null));
    document.getElementById('of-close-btn').addEventListener('click', () => { document.getElementById('offer-modal').hidden = true; });
    document.getElementById('of-save-btn').addEventListener('click', async () => {
      const code = document.getElementById('of-code').value.trim();
      const description = document.getElementById('of-description').value.trim();
      const discountType = document.getElementById('of-type').value;
      const discountValue = parseInt(document.getElementById('of-value').value, 10) || 0;
      const expiresAt = document.getElementById('of-expires').value || null;
      const active = document.getElementById('of-active').checked;
      if (!code || !discountValue) { showModalError('offer-error', t('errorMissingFields')); return; }
      try {
        if (ofEditingId) {
          await api(`/api/admin/offers-catalog/${ofEditingId}`, { method: 'PATCH', body: JSON.stringify({ description, discountType, discountValue, active, expiresAt }) });
        } else {
          await api('/api/admin/offers-catalog', { method: 'POST', body: JSON.stringify({ code, description, discountType, discountValue, expiresAt }) });
        }
        document.getElementById('offer-modal').hidden = true;
        loadOffers();
      } catch (err) {
        showModalError('offer-error', err.message === 'Code already exists' ? t('adminOfferCodeTaken') : t('errorGeneric'));
      }
    });
  }

  // ── Sales & Marketing: stats ──
  async function loadMarketingStats() {
    const grid = document.getElementById('marketing-stat-grid');
    try {
      const stats = await api('/api/admin/report/overview');
      const items = [
        { label: t('adminStatParents'), value: stats.parents },
        { label: t('adminStatClubMembers'), value: stats.clubMembers, sub: t('adminStatOfParents', { count: stats.parents }) },
        { label: t('adminStatOrders'), value: stats.ordersPaid, sub: t('adminStatOrdersTotal', { count: stats.ordersTotal }) },
      ];
      grid.innerHTML = items.map(item => `
        <div class="stat-item">
          <div class="stat-value">${escapeHtml(String(item.value))}</div>
          <div class="stat-label">${escapeHtml(item.label)}</div>
          ${item.sub ? `<div class="stat-sub">${escapeHtml(item.sub)}</div>` : ''}
        </div>
      `).join('');
    } catch {
      grid.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadStats'))}</p>`;
    }
  }

  // ── Showcase: welcome message ──
  async function loadShowcaseContent() {
    try {
      const data = await api('/api/showcase');
      document.getElementById('sc-welcome-en').value = data.welcomeMessageEn || '';
      document.getElementById('sc-welcome-nl').value = data.welcomeMessageNl || '';
      renderVideoStatus(data.videoStatus);
    } catch { /* leave fields blank — the save button still works from empty */ }
  }

  function renderVideoStatus(status) {
    const el = document.getElementById('showcase-video-status');
    const clearBtn = document.getElementById('sc-video-clear-btn');
    if (status === 'ready') {
      el.textContent = t('adminShowcaseVideoReady');
      clearBtn.hidden = false;
    } else {
      el.textContent = t('adminShowcaseVideoPlaceholder');
      clearBtn.hidden = true;
    }
  }

  function setupShowcaseWelcome() {
    document.getElementById('showcase-welcome-save-btn').addEventListener('click', async () => {
      document.getElementById('showcase-welcome-error').hidden = true;
      document.getElementById('showcase-welcome-success').hidden = true;
      const welcomeMessageEn = document.getElementById('sc-welcome-en').value.trim();
      const welcomeMessageNl = document.getElementById('sc-welcome-nl').value.trim();
      try {
        await api('/api/admin/showcase', { method: 'PATCH', body: JSON.stringify({ welcomeMessageEn, welcomeMessageNl }) });
        document.getElementById('showcase-welcome-success').textContent = t('adminSaved');
        document.getElementById('showcase-welcome-success').hidden = false;
      } catch {
        document.getElementById('showcase-welcome-error').textContent = t('errorGeneric');
        document.getElementById('showcase-welcome-error').hidden = false;
      }
    });
  }

  // ── Showcase: video ──
  function setupShowcaseVideo() {
    document.getElementById('sc-video-upload-btn').addEventListener('click', () => {
      document.getElementById('sc-video-file').click();
    });
    document.getElementById('sc-video-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      document.getElementById('showcase-video-error').hidden = true;
      document.getElementById('showcase-video-status').textContent = t('adminUploading');
      try {
        const key = `showcase/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { url } = await api('/api/admin/upload-url', { method: 'POST', body: JSON.stringify({ key, contentType: file.type || 'video/mp4' }) });
        const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'video/mp4' }, body: file });
        if (!putRes.ok) throw new Error(t('adminErrorUploadFailed'));
        await api('/api/admin/showcase/video', { method: 'POST', body: JSON.stringify({ key }) });
        renderVideoStatus('ready');
      } catch (err) {
        document.getElementById('showcase-video-error').textContent = err.message || t('errorGeneric');
        document.getElementById('showcase-video-error').hidden = false;
        renderVideoStatus('placeholder');
      }
    });
    document.getElementById('sc-video-clear-btn').addEventListener('click', async () => {
      if (!window.confirm(t('adminDeleteConfirm'))) return;
      await api('/api/admin/showcase/video', { method: 'DELETE' });
      renderVideoStatus('placeholder');
    });
  }

  // ── Showcase: tiles ──
  let tiEditingId = null;

  async function loadShowcaseTiles() {
    const container = document.getElementById('showcase-tiles-list');
    try {
      const data = await api('/api/admin/showcase/tiles');
      const rows = data.tiles || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(tile => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(tile.icon || '')} ${escapeHtml(tile.label_en)}</div>
            <div class="admin-list-item-sub">
              <span class="status-badge ${tile.active ? 'active' : 'suspended'}">${escapeHtml(t(tile.active ? 'adminActive' : 'adminInactive'))}</span>
              &nbsp;·&nbsp; ${escapeHtml(t('tileType' + capitalize(tile.tile_type)))} &nbsp;·&nbsp; ${escapeHtml(t('linkType' + capitalize(tile.link_type === 'talk_demo' ? 'TalkDemo' : tile.link_type)))}
            </div>
          </div>
          <div class="admin-list-item-actions">
            <button type="button" class="btn-ghost btn-small" data-edit-ti="${tile.id}">${escapeHtml(t('adminEdit'))}</button>
            <button type="button" class="btn-ghost btn-small" data-delete-ti="${tile.id}">${escapeHtml(t('adminDelete'))}</button>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit-ti]').forEach(btn => {
        btn.addEventListener('click', () => openTileModal(btn.getAttribute('data-edit-ti'), rows.find(r => r.id === btn.getAttribute('data-edit-ti'))));
      });
      container.querySelectorAll('[data-delete-ti]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/showcase/tiles/${btn.getAttribute('data-delete-ti')}`, { method: 'DELETE' });
          loadShowcaseTiles();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadTiles'))}</p>`;
    }
  }

  function openTileModal(id, tile) {
    tiEditingId = id || null;
    document.getElementById('tile-error').hidden = true;
    document.getElementById('tile-modal-title').textContent = t(id ? 'adminEditTile' : 'adminNewTile');
    document.getElementById('ti-label-en').value = tile ? tile.label_en : '';
    document.getElementById('ti-label-nl').value = tile ? (tile.label_nl || '') : '';
    document.getElementById('ti-type').value = tile ? tile.tile_type : 'read';
    document.getElementById('ti-icon').value = tile ? (tile.icon || '') : '';
    document.getElementById('ti-link-type').value = tile ? tile.link_type : 'book';
    document.getElementById('ti-link-value').value = tile ? (tile.link_value || '') : '';
    document.getElementById('ti-active').checked = tile ? !!tile.active : true;
    document.getElementById('tile-modal').hidden = false;
  }

  function setupTileModal() {
    document.getElementById('new-tile-btn').addEventListener('click', () => openTileModal(null, null));
    document.getElementById('ti-close-btn').addEventListener('click', () => { document.getElementById('tile-modal').hidden = true; });
    document.getElementById('ti-save-btn').addEventListener('click', async () => {
      const labelEn = document.getElementById('ti-label-en').value.trim();
      const labelNl = document.getElementById('ti-label-nl').value.trim();
      const tileType = document.getElementById('ti-type').value;
      const icon = document.getElementById('ti-icon').value.trim();
      const linkType = document.getElementById('ti-link-type').value;
      const linkValue = document.getElementById('ti-link-value').value.trim();
      const active = document.getElementById('ti-active').checked;
      if (!labelEn) { showModalError('tile-error', t('errorMissingFields')); return; }
      try {
        const body = JSON.stringify({ tileType, labelEn, labelNl, icon, linkType, linkValue, active });
        if (tiEditingId) {
          await api(`/api/admin/showcase/tiles/${tiEditingId}`, { method: 'PATCH', body });
        } else {
          await api('/api/admin/showcase/tiles', { method: 'POST', body });
        }
        document.getElementById('tile-modal').hidden = true;
        loadShowcaseTiles();
      } catch {
        showModalError('tile-error', t('errorGeneric'));
      }
    });
  }

  // ── Showcase: Talk to Mare phrases ──
  let phEditingId = null;

  async function loadShowcasePhrases() {
    const container = document.getElementById('showcase-phrases-list');
    try {
      const data = await api('/api/admin/showcase/phrases');
      const rows = data.phrases || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(p => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(p.phrase_en)}</div>
            <div class="admin-list-item-sub">
              <span class="status-badge ${p.active ? 'active' : 'suspended'}">${escapeHtml(t(p.active ? 'adminActive' : 'adminInactive'))}</span>
            </div>
          </div>
          <div class="admin-list-item-actions">
            <button type="button" class="btn-ghost btn-small" data-edit-ph="${p.id}">${escapeHtml(t('adminEdit'))}</button>
            <button type="button" class="btn-ghost btn-small" data-delete-ph="${p.id}">${escapeHtml(t('adminDelete'))}</button>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit-ph]').forEach(btn => {
        btn.addEventListener('click', () => openPhraseModal(btn.getAttribute('data-edit-ph'), rows.find(r => r.id === btn.getAttribute('data-edit-ph'))));
      });
      container.querySelectorAll('[data-delete-ph]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/showcase/phrases/${btn.getAttribute('data-delete-ph')}`, { method: 'DELETE' });
          loadShowcasePhrases();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadPhrases'))}</p>`;
    }
  }

  function openPhraseModal(id, phrase) {
    phEditingId = id || null;
    document.getElementById('phrase-error').hidden = true;
    document.getElementById('phrase-modal-title').textContent = t(id ? 'adminEditPhrase' : 'adminNewPhrase');
    document.getElementById('ph-en').value = phrase ? phrase.phrase_en : '';
    document.getElementById('ph-nl').value = phrase ? (phrase.phrase_nl || '') : '';
    document.getElementById('ph-active').checked = phrase ? !!phrase.active : true;
    document.getElementById('phrase-modal').hidden = false;
  }

  function setupPhraseModal() {
    document.getElementById('new-phrase-btn').addEventListener('click', () => openPhraseModal(null, null));
    document.getElementById('ph-close-btn').addEventListener('click', () => { document.getElementById('phrase-modal').hidden = true; });
    document.getElementById('ph-save-btn').addEventListener('click', async () => {
      const phraseEn = document.getElementById('ph-en').value.trim();
      const phraseNl = document.getElementById('ph-nl').value.trim();
      const active = document.getElementById('ph-active').checked;
      if (!phraseEn) { showModalError('phrase-error', t('errorMissingFields')); return; }
      try {
        const body = JSON.stringify({ phraseEn, phraseNl, active });
        if (phEditingId) {
          await api(`/api/admin/showcase/phrases/${phEditingId}`, { method: 'PATCH', body });
        } else {
          await api('/api/admin/showcase/phrases', { method: 'POST', body });
        }
        document.getElementById('phrase-modal').hidden = true;
        loadShowcasePhrases();
      } catch {
        showModalError('phrase-error', t('errorGeneric'));
      }
    });
  }

  // ── Add single teacher (admin-side account creation) ──
  function setupAddTeacherForm() {
    document.getElementById('add-teacher-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      document.getElementById('add-teacher-error').hidden = true;
      document.getElementById('add-teacher-success').hidden = true;
      const name = document.getElementById('at-name').value.trim();
      const email = document.getElementById('at-email').value.trim();
      const school = document.getElementById('at-school').value.trim();
      if (!name || !email) {
        document.getElementById('add-teacher-error').textContent = t('errorMissingFields');
        document.getElementById('add-teacher-error').hidden = false;
        return;
      }
      const btn = document.getElementById('add-teacher-btn');
      btn.disabled = true;
      try {
        await api('/api/admin/teachers', { method: 'POST', body: JSON.stringify({ name, email, school }) });
        document.getElementById('add-teacher-success').textContent = t('adminTeacherAdded', { name });
        document.getElementById('add-teacher-success').hidden = false;
        document.getElementById('add-teacher-form').reset();
        loadDirectory();
        if (currentUser && currentUser.role === 'admin') loadEmailLog();
      } catch (err) {
        document.getElementById('add-teacher-error').textContent = err.message === 'Email already registered' ? t('errorEmailTaken') : t('errorGeneric');
        document.getElementById('add-teacher-error').hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ── Bulk school onboarding ──
  function setupBulkImport() {
    document.getElementById('bulk-import-btn').addEventListener('click', async () => {
      document.getElementById('bulk-import-error').hidden = true;
      document.getElementById('bulk-import-result').innerHTML = '';
      const schoolName = document.getElementById('bi-school-name').value.trim();
      const text = document.getElementById('bi-text').value;
      if (!text.trim()) {
        document.getElementById('bulk-import-error').textContent = t('errorMissingFields');
        document.getElementById('bulk-import-error').hidden = false;
        return;
      }
      const btn = document.getElementById('bulk-import-btn');
      btn.disabled = true;
      try {
        const result = await api('/api/admin/bulk-import', { method: 'POST', body: JSON.stringify({ schoolName, text }) });
        const detail = await api(`/api/admin/bulk-imports/${result.importId}`);
        const failedRows = detail.rows.filter(r => r.status === 'failed');
        document.getElementById('bulk-import-result').innerHTML = `
          <p class="form-success">${escapeHtml(t('adminBulkImportSummary', { created: result.createdCount, total: result.rowCount }))}</p>
          ${failedRows.length ? `<div class="admin-list-item-sub" style="margin-bottom:12px;">${
            failedRows.map(r => `${escapeHtml(t('adminBulkImportRowFailed', { row: r.row_number, name: r.name || '—', error: r.error }))}`).join('<br>')
          }</div>` : ''}
        `;
        if (result.createdCount > 0) {
          document.getElementById('bi-text').value = '';
          loadDirectory();
        }
      } catch {
        document.getElementById('bulk-import-error').textContent = t('errorGeneric');
        document.getElementById('bulk-import-error').hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ── Club Mare: stats ──
  async function loadClubMareStats() {
    const grid = document.getElementById('clubmare-stat-grid');
    try {
      const stats = await api('/api/admin/report/overview');
      const items = [
        { label: t('adminStatClubMembers'), value: stats.clubMembers, sub: t('adminStatOfParents', { count: stats.parents }) },
      ];
      grid.innerHTML = items.map(item => `
        <div class="stat-item">
          <div class="stat-value">${escapeHtml(String(item.value))}</div>
          <div class="stat-label">${escapeHtml(item.label)}</div>
          ${item.sub ? `<div class="stat-sub">${escapeHtml(item.sub)}</div>` : ''}
        </div>
      `).join('');
    } catch {
      grid.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadStats'))}</p>`;
    }
  }

  // ── Club Mare: members ──
  async function loadClubMareMembers() {
    const container = document.getElementById('clubmare-members-table');
    try {
      const data = await api('/api/admin/club-mare/members');
      const rows = data.members || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `<thead><tr>
        <th>${escapeHtml(t('fieldName'))}</th><th>${escapeHtml(t('fieldEmail'))}</th>
        <th>${escapeHtml(t('adminClubMareTier'))}</th><th>${escapeHtml(t('adminClubMareJoined'))}</th><th></th>
      </tr></thead>`;
      const tbody = document.createElement('tbody');
      rows.forEach(m => {
        const tr = document.createElement('tr');
        const isPaid = m.tier === 2;
        tr.innerHTML = `
          <td>${escapeHtml(m.parent_name || '—')}</td>
          <td>${escapeHtml(m.parent_email || '—')}</td>
          <td><span class="status-badge ${isPaid ? 'active' : 'suspended'}">${escapeHtml(t(isPaid ? 'adminClubMarePaid' : 'adminClubMareFree'))}</span></td>
          <td>${escapeHtml((m.joined_at || '').slice(0, 10))}</td>
        `;
        const actionTd = document.createElement('td');
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn-ghost btn-small';
        toggleBtn.textContent = t(isPaid ? 'adminClubMareDowngrade' : 'adminClubMareUpgrade');
        toggleBtn.addEventListener('click', async () => {
          toggleBtn.disabled = true;
          try {
            await api(`/api/admin/club-mare/members/${m.parent_id}/tier`, { method: 'PATCH', body: JSON.stringify({ tier: isPaid ? 1 : 2 }) });
            loadClubMareMembers();
          } catch { toggleBtn.disabled = false; }
        });
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-ghost btn-small';
        removeBtn.textContent = t('adminDelete');
        removeBtn.style.marginLeft = '6px';
        removeBtn.addEventListener('click', async () => {
          if (!window.confirm(t('adminClubMareRemoveConfirm', { name: m.parent_name }))) return;
          await api(`/api/admin/club-mare/members/${m.parent_id}`, { method: 'DELETE' });
          loadClubMareMembers();
        });
        actionTd.appendChild(toggleBtn);
        actionTd.appendChild(removeBtn);
        tr.appendChild(actionTd);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.innerHTML = '';
      container.appendChild(table);
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadMembers'))}</p>`;
    }
  }

  // ── Club Mare: exclusive posts ──
  let cmpEditingId = null;
  let cmpUploadedImageKey = null;

  async function loadClubMarePosts() {
    const container = document.getElementById('clubmare-posts-list');
    try {
      const data = await api('/api/admin/club-mare/posts');
      const rows = data.posts || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(post => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(post.title)}${post.title_nl && post.title_nl !== post.title ? ` <span class="admin-empty-note">· ${escapeHtml(post.title_nl)}</span>` : ''}</div>
            <div class="admin-list-item-sub">
              <span class="status-badge ${post.active ? 'active' : 'suspended'}">${escapeHtml(t(post.active ? 'adminActive' : 'adminInactive'))}</span>
              &nbsp;·&nbsp; ${escapeHtml(t(post.min_tier === 2 ? 'clubMareTierPaidOnly' : 'clubMareTierFreeAndPaid'))}
            </div>
          </div>
          <div class="admin-list-item-actions">
            <button type="button" class="btn-ghost btn-small" data-edit-cmp="${post.id}">${escapeHtml(t('adminEdit'))}</button>
            <button type="button" class="btn-ghost btn-small" data-delete-cmp="${post.id}">${escapeHtml(t('adminDelete'))}</button>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit-cmp]').forEach(btn => {
        btn.addEventListener('click', () => openClubMarePostModal(btn.getAttribute('data-edit-cmp'), rows.find(r => r.id === btn.getAttribute('data-edit-cmp'))));
      });
      container.querySelectorAll('[data-delete-cmp]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/club-mare/posts/${btn.getAttribute('data-delete-cmp')}`, { method: 'DELETE' });
          loadClubMarePosts();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadPosts'))}</p>`;
    }
  }

  // Mare App 5 — the full post editor (post-editor.js): English + Dutch,
  // rich text with pictures, video, audio, app links and a Mare button;
  // "Suggest text" writes a first version from a seed word.
  let cmpEditors = null;
  let cmpSuggestedButton = null;
  function cmpShowLang(lang) {
    document.querySelectorAll('#clubmare-post-modal .cmp-lang').forEach(b => b.classList.toggle('active', b.getAttribute('data-lang') === lang));
    document.querySelectorAll('#clubmare-post-modal .cmp-lang-pane').forEach(p => { p.hidden = p.getAttribute('data-pane') !== lang; });
  }
  function cmpEnsureEditors() {
    if (cmpEditors) return cmpEditors;
    const suggested = (lang) => () => (cmpSuggestedButton ? (lang === 'nl' ? cmpSuggestedButton.textNl : cmpSuggestedButton.textEn) : '');
    cmpEditors = {
      en: window.MarePostEditor.mount('cmp-editor-en', { placeholder: t('cmpBodyPh'), suggestedButtonText: suggested('en') }),
      nl: window.MarePostEditor.mount('cmp-editor-nl', { placeholder: t('cmpBodyPhNl'), suggestedButtonText: suggested('nl') }),
    };
    return cmpEditors;
  }

  function openClubMarePostModal(id, post) {
    cmpEditingId = id || null;
    cmpUploadedImageKey = post ? (post.image_key || null) : null;
    cmpSuggestedButton = null;
    document.getElementById('clubmare-post-error').hidden = true;
    document.getElementById('clubmare-post-modal-title').textContent = t(id ? 'adminEditPost' : 'adminNewPost');
    document.getElementById('cmp-seed').value = '';
    document.getElementById('cmp-seed').placeholder = t('cmpSeedPh');
    document.getElementById('cmp-seed-note').textContent = t('cmpSeedHint');
    document.getElementById('cmp-seed-note').className = 'admin-empty-note';
    document.getElementById('cmp-title').value = post ? (post.title || '') : '';
    document.getElementById('cmp-title-nl').value = post ? (post.title_nl || '') : '';
    document.getElementById('cmp-min-tier').value = post ? String(post.min_tier) : '1';
    document.getElementById('cmp-active').checked = post ? !!post.active : true;
    document.getElementById('cmp-image-status').textContent = cmpUploadedImageKey ? t('adminImageAttached') : '';
    document.getElementById('cmp-image-file').value = '';
    document.getElementById('clubmare-post-modal').hidden = false;
    const ed = cmpEnsureEditors();
    const asHtml = (v) => (!v ? '' : (/<\/?[a-z][^>]*>/i.test(v) ? v : v.split(/\n{2,}/).map(p => `<p>${escapeHtml(p)}</p>`).join('')));
    if (ed.en) ed.en.setHtml(asHtml(post && post.body));
    if (ed.nl) ed.nl.setHtml(asHtml(post && post.body_nl));
    cmpShowLang(window.MareI18n.locale === 'nl' ? 'nl' : 'en');
  }

  function setupClubMarePostModal() {
    document.getElementById('new-clubmare-post-btn').addEventListener('click', () => openClubMarePostModal(null, null));
    document.getElementById('cmp-close-btn').addEventListener('click', () => { document.getElementById('clubmare-post-modal').hidden = true; });
    document.querySelectorAll('#clubmare-post-modal .cmp-lang').forEach(b => b.addEventListener('click', () => cmpShowLang(b.getAttribute('data-lang'))));
    document.getElementById('cmp-image-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const status = document.getElementById('cmp-image-status');
      status.textContent = t('adminUploading');
      try {
        const key = `club-mare/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { url } = await api('/api/admin/upload-url', { method: 'POST', body: JSON.stringify({ key, contentType: file.type || 'application/octet-stream' }) });
        const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        if (!putRes.ok) throw new Error(t('adminErrorUploadFailed'));
        cmpUploadedImageKey = key;
        status.textContent = t('adminUploaded');
      } catch (err) {
        status.textContent = err.message || t('errorGeneric');
      }
    });

    document.getElementById('cmp-suggest-btn').addEventListener('click', async () => {
      const seed = document.getElementById('cmp-seed').value.trim();
      const note = document.getElementById('cmp-seed-note');
      if (!seed) { note.textContent = t('cmpSeedFirst'); note.className = 'form-error'; document.getElementById('cmp-seed').focus(); return; }
      const ed = cmpEnsureEditors();
      const hasText = (ed.en && ed.en.getHtml()) || (ed.nl && ed.nl.getHtml());
      if (hasText && !confirm(t('cmpReplaceConfirm'))) return;
      note.textContent = t('cmpSuggesting'); note.className = 'admin-empty-note';
      try {
        const s = await api('/api/admin/club-mare/posts/suggest', { method: 'POST', body: JSON.stringify({ seed }) });
        cmpSuggestedButton = s.button || null;
        document.getElementById('cmp-title').value = s.titleEn || '';
        document.getElementById('cmp-title-nl').value = s.titleNl || '';
        if (ed.en) { ed.en.setHtml(s.bodyEn || ''); if (s.button && s.button.textEn) ed.en.appendButton(s.button.textEn, s.button.href); }
        if (ed.nl) { ed.nl.setHtml(s.bodyNl || ''); if (s.button && s.button.textNl) ed.nl.appendButton(s.button.textNl, s.button.href); }
        note.textContent = t('cmpSuggested'); note.className = 'admin-empty-note ok';
      } catch (err) {
        note.textContent = err.message || t('errorGeneric'); note.className = 'form-error';
      }
    });

    document.getElementById('cmp-save-btn').addEventListener('click', async () => {
      const ed = cmpEnsureEditors();
      const title = document.getElementById('cmp-title').value.trim();
      const titleNl = document.getElementById('cmp-title-nl').value.trim();
      const body = ed.en ? ed.en.getHtml() : '';
      const bodyNl = ed.nl ? ed.nl.getHtml() : '';
      const minTier = document.getElementById('cmp-min-tier').value;
      const active = document.getElementById('cmp-active').checked;
      if (!title && !titleNl) { showModalError('clubmare-post-error', t('cmpNeedTitle')); return; }
      try {
        const payload = JSON.stringify({ title, titleNl, body, bodyNl, minTier, active, imageKey: cmpUploadedImageKey });
        if (cmpEditingId) {
          await api(`/api/admin/club-mare/posts/${cmpEditingId}`, { method: 'PATCH', body: payload });
        } else {
          await api('/api/admin/club-mare/posts', { method: 'POST', body: payload });
        }
        document.getElementById('clubmare-post-modal').hidden = true;
        loadClubMarePosts();
      } catch (err) {
        showModalError('clubmare-post-error', err.message || t('errorGeneric'));
      }
    });
  }

  // ── Merchandise: products ──
  let prEditingId = null;
  let prUploadedImageKeys = [];
  let prUploadedVideoKey = null;

  function fmtPrice(cents, currency) {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency || 'gbp').toUpperCase() }).format((cents || 0) / 100);
    } catch { return `${(cents || 0) / 100}`; }
  }

  async function loadProducts() {
    const container = document.getElementById('products-list');
    try {
      const data = await api('/api/admin/products');
      const rows = data.products || [];
      if (!rows.length) {
        container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminNoneYet'))}</p>`;
        return;
      }
      container.innerHTML = rows.map(p => `
        <div class="admin-list-item">
          <div class="admin-list-item-main">
            <div class="admin-list-item-title">${escapeHtml(p.name)} — ${escapeHtml(fmtPrice(p.price_cents, p.currency))}</div>
            <div class="admin-list-item-sub">
              <span class="status-badge ${p.active ? 'active' : 'suspended'}">${escapeHtml(t(p.active ? 'adminActive' : 'adminInactive'))}</span>
              &nbsp;·&nbsp; ${escapeHtml(t('adminProductPhotoCount', { count: (p.image_keys || []).length }))}
              ${p.video_key ? ` · ${escapeHtml(t('adminProductHasVideo'))}` : ''}
              ${p.stock != null ? ` · ${escapeHtml(t('adminProductStock', { count: p.stock }))}` : ''}
            </div>
          </div>
          <div class="admin-list-item-actions">
            <button type="button" class="btn-ghost btn-small" data-edit-pr="${p.id}">${escapeHtml(t('adminEdit'))}</button>
            <button type="button" class="btn-ghost btn-small" data-delete-pr="${p.id}">${escapeHtml(t('adminDelete'))}</button>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-edit-pr]').forEach(btn => {
        btn.addEventListener('click', () => openProductModal(btn.getAttribute('data-edit-pr'), rows.find(r => r.id === btn.getAttribute('data-edit-pr'))));
      });
      container.querySelectorAll('[data-delete-pr]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.confirm(t('adminDeleteConfirm'))) return;
          await api(`/api/admin/products/${btn.getAttribute('data-delete-pr')}`, { method: 'DELETE' });
          loadProducts();
        });
      });
    } catch {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminCouldNotLoadProducts'))}</p>`;
    }
  }

  function renderImageChips() {
    const wrap = document.getElementById('pr-image-list');
    wrap.innerHTML = prUploadedImageKeys.map((key, i) => `
      <span class="admin-image-chip">${escapeHtml(t('adminPhotoLabel', { n: i + 1 }))} <button type="button" data-remove-img="${i}" aria-label="Remove">✕</button></span>
    `).join('');
    wrap.querySelectorAll('[data-remove-img]').forEach(btn => {
      btn.addEventListener('click', () => {
        prUploadedImageKeys.splice(Number(btn.getAttribute('data-remove-img')), 1);
        renderImageChips();
      });
    });
  }

  function openProductModal(id, product) {
    prEditingId = id || null;
    prUploadedImageKeys = product ? [...(product.image_keys || [])] : [];
    prUploadedVideoKey = product ? (product.video_key || null) : null;
    document.getElementById('product-error').hidden = true;
    document.getElementById('product-modal-title').textContent = t(id ? 'adminEditProduct' : 'adminNewProduct');
    document.getElementById('pr-name').value = product ? product.name : '';
    document.getElementById('pr-description').value = product ? (product.description || '') : '';
    document.getElementById('pr-name-nl').value = product ? (product.name_nl || '') : '';
    document.getElementById('pr-description-nl').value = product ? (product.description_nl || '') : '';
    document.getElementById('pr-price').value = product ? (product.price_cents / 100).toFixed(2) : '';
    document.getElementById('pr-currency').value = product ? product.currency : 'gbp';
    document.getElementById('pr-stock').value = product && product.stock != null ? product.stock : '';
    document.getElementById('pr-active').checked = product ? !!product.active : true;
    document.getElementById('pr-featured').checked = product ? !!product.featured : false;
    document.getElementById('pr-image-file').value = '';
    document.getElementById('pr-video-file').value = '';
    document.getElementById('pr-video-status').textContent = prUploadedVideoKey ? t('adminVideoAttached') : '';
    renderImageChips();
    document.getElementById('product-modal').hidden = false;
  }

  // ── Whisper Forest (Mare App 4) — approval queue, monthly Whisper
  // Words, forest picture. Server: whisper.js. ──
  function whisperMonthLabel(m) {
    if (!m) return '';
    try {
      const [y, mo] = m.split('-').map(Number);
      return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(window.MareI18n.locale === 'nl' ? 'nl-NL' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    } catch { return m; }
  }
  async function loadWhisper() {
    let data;
    try { data = await api('/api/admin/whisper'); } catch { return; }
    renderWhisperQueue(data.pending || []);
    renderWhisperPrompts(data.prompts || []);
    loadWhisperApproved();
    const img = document.getElementById('whisper-image-preview');
    img.src = data.forestImageUrl || '';
    document.getElementById('whisper-image-reset').hidden = !data.forestImageKey;
  }
  function renderWhisperQueue(pending) {
    const box = document.getElementById('whisper-queue');
    if (!pending.length) {
      box.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminWhisperQueueEmpty'))}</p>`;
      return;
    }
    box.innerHTML = '';
    pending.forEach(s => {
      const row = document.createElement('div');
      row.className = 'whisper-q-row';
      const flag = s.ai_flag === 'ok' ? 'ok' : 'check';
      row.innerHTML = `
        <div class="whisper-q-meta">
          <span class="whisper-q-flag whisper-q-flag-${flag}">${escapeHtml(flag === 'ok' ? t('adminWhisperFlagOk') : t('adminWhisperFlagCheck'))}</span>
          <span>${escapeHtml(s.child_name)}${s.age_band ? ', ' + escapeHtml(s.age_band) : ''} · ${escapeHtml(whisperMonthLabel(s.prompt_month) || s.prompt_title || '')}</span>
        </div>
        ${s.ai_note ? `<p class="whisper-q-note">${escapeHtml(s.ai_note)}</p>` : ''}
        ${s.prompt_kind === 'question' ? `<p class="admin-empty-note">${escapeHtml(t('adminWhisperAnswerTo'))} ${escapeHtml(s.prompt_title || '')}</p>` : ''}
        ${s.image_key ? `<a href="${escapeHtml(s.image_url || '#')}" target="_blank" rel="noopener"><img class="whisper-q-img" src="${escapeHtml(s.image_url || '')}" alt=""></a><p class="admin-empty-note">${escapeHtml(t('adminMakersQueueHint'))}</p>` : ''}
        <div class="admin-form-row" style="margin-bottom:8px;">
          ${s.prompt_kind === 'question' ? '' : `<div class="field" style="max-width:260px;"><input type="text" class="wq-word" maxlength="${s.image_key ? 60 : 30}" value="${escapeHtml(s.word)}" placeholder="${s.image_key ? escapeHtml(t('mkUntitled')) : ''}"></div>`}
          <div class="field"><textarea class="wq-reason" rows="2" maxlength="280">${escapeHtml(s.reason || '')}</textarea></div>
        </div>
        <div class="whisper-q-btns">
          <button type="button" class="btn-primary btn-small wq-approve">${escapeHtml(t('adminWhisperApprove'))}</button>
          <button type="button" class="btn-ghost btn-small wq-reject">${escapeHtml(t('adminWhisperReject'))}</button>
        </div>`;
      const act = async (decision) => {
        row.querySelectorAll('button').forEach(b => { b.disabled = true; });
        try {
          await api(`/api/admin/whisper/submissions/${s.id}/review`, { method: 'POST', body: JSON.stringify({
            decision,
            ...(row.querySelector('.wq-word') ? { word: row.querySelector('.wq-word').value } : {}),
            reason: row.querySelector('.wq-reason').value,
          }) });
          loadWhisper();
        } catch (err) {
          alert(err.message || t('errorGeneric'));
          row.querySelectorAll('button').forEach(b => { b.disabled = false; });
        }
      };
      row.querySelector('.wq-approve').addEventListener('click', () => act('approve'));
      row.querySelector('.wq-reject').addEventListener('click', () => act('reject'));
      box.appendChild(row);
    });
  }
  async function loadWhisperApproved() {
    const box = document.getElementById('whisper-approved');
    let items = [];
    try { items = (await api('/api/admin/whisper/approved-recent')).items || []; } catch { box.innerHTML = ''; return; }
    if (!items.length) { box.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminApprovedNone'))}</p>`; return; }
    box.innerHTML = '';
    items.forEach(s => {
      const row = document.createElement('div');
      row.className = 'whisper-pick';
      const what = s.image_key
        ? `<img class="whisper-q-thumb" src="${escapeHtml(s.image_url || '')}" alt=""> ${escapeHtml(s.word || t('mkUntitled'))}`
        : s.prompt_kind === 'question' ? `“${escapeHtml((s.reason || '').slice(0, 80))}”` : `<strong>${escapeHtml(s.word)}</strong>`;
      row.innerHTML = `<div>${what} <span class="admin-empty-note">— ${escapeHtml(s.child_name)}${s.age_band ? ', ' + escapeHtml(s.age_band) : ''}${s.is_winner ? ' · ★' : ''}</span></div>
        <button type="button" class="btn-ghost btn-small">${escapeHtml(t('adminApprovedRemove'))}</button>`;
      row.querySelector('button').addEventListener('click', async () => {
        if (!window.confirm(t('adminApprovedRemoveConfirm'))) return;
        await api(`/api/admin/whisper/submissions/${s.id}/review`, { method: 'POST', body: JSON.stringify({ decision: 'reject' }) });
        loadWhisper();
      });
      box.appendChild(row);
    });
  }

  function renderWhisperPrompts(prompts) {
    const box = document.getElementById('whisper-prompts');
    box.innerHTML = '';
    if (!prompts.length) {
      box.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminWhisperNoPrompts'))}</p>`;
      return;
    }
    prompts.forEach(p => {
      const card = document.createElement('div');
      card.className = 'whisper-p-row';
      card.innerHTML = `
        <div class="whisper-p-head">
          <span class="whisper-p-kind">${escapeHtml(p.kind === 'question' ? t('adminWhisperKindQuestionShort') : p.kind === 'makers' ? t('adminWhisperKindMakersShort') : p.kind === 'mission' ? t('adminWhisperKindMissionShort') : t('adminWhisperKindWordShort'))}</span>
          <strong>${escapeHtml(whisperMonthLabel(p.month) || '—')}</strong>
          <span class="whisper-p-status whisper-p-status-${p.status}">${escapeHtml(p.status === 'open' ? t('adminWhisperOpen') : t('adminWhisperClosed'))}</span>
        </div>
        <p class="whisper-p-q">${escapeHtml(p.title_en)}${p.title_nl ? ` <span class="admin-empty-note">/ ${escapeHtml(p.title_nl)}</span>` : ''}</p>
        <p class="admin-empty-note">${escapeHtml(t(p.kind === 'question' ? 'adminWhisperAnswersCount' : p.kind === 'makers' ? 'adminMakersCount' : 'adminWhisperApprovedCount', { n: p.approvedCount }))}${p.winner ? ` · ${escapeHtml(t('adminWhisperWinnerIs'))} <strong>${escapeHtml(p.winner.word)}</strong> (${escapeHtml(p.winner.child_name)})` : ''}</p>
        <div class="whisper-q-btns">
          <button type="button" class="btn-ghost btn-small wp-shortlist">${escapeHtml(t('adminWhisperShortlist'))}</button>
          <button type="button" class="btn-ghost btn-small wp-choose">${escapeHtml(t('adminWhisperChoose'))}</button>
          <button type="button" class="btn-ghost btn-small wp-toggle">${escapeHtml(p.status === 'open' ? t('adminWhisperClose') : t('adminWhisperReopen'))}</button>
        </div>
        <div class="wp-extra"></div>`;
      const extra = card.querySelector('.wp-extra');
      if (p.kind === 'question' || p.kind === 'makers' || p.kind === 'mission') {
        // Answers and pictures have no winner or shortlist.
        card.querySelector('.wp-shortlist').hidden = true;
        card.querySelector('.wp-choose').hidden = true;
      }
      const choose = async (submissionId) => {
        await api(`/api/admin/whisper/prompts/${p.id}/winner`, { method: 'POST', body: JSON.stringify({ submissionId }) });
        loadWhisper();
      };
      const listWithChoose = (items, withWhy) => {
        extra.innerHTML = '';
        if (!items.length) { extra.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminWhisperNoApproved'))}</p>`; return; }
        items.forEach(it => {
          const r = document.createElement('div');
          r.className = 'whisper-pick';
          r.innerHTML = `<div><strong>${escapeHtml(it.word)}</strong> — ${escapeHtml(it.name || it.child_name || '')}
            ${it.reason ? `<br><span class="admin-empty-note">${escapeHtml(it.reason)}</span>` : ''}
            ${withWhy && it.why ? `<br><em class="whisper-why">${escapeHtml(it.why)}</em>` : ''}</div>
            <button type="button" class="btn-primary btn-small">${escapeHtml(t('adminWhisperMakeWinner'))}</button>`;
          r.querySelector('button').addEventListener('click', () => choose(it.id));
          extra.appendChild(r);
        });
      };
      card.querySelector('.wp-shortlist').addEventListener('click', async (e) => {
        e.target.disabled = true;
        extra.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminWhisperThinking'))}</p>`;
        try { listWithChoose((await api(`/api/admin/whisper/prompts/${p.id}/shortlist`, { method: 'POST' })).suggestions || [], true); }
        catch (err) { extra.innerHTML = `<p class="form-error">${escapeHtml(err.message || t('errorGeneric'))}</p>`; }
        e.target.disabled = false;
      });
      card.querySelector('.wp-choose').addEventListener('click', async () => {
        try { listWithChoose((await api(`/api/admin/whisper/prompts/${p.id}/approved`)).submissions || [], false); }
        catch (err) { extra.innerHTML = `<p class="form-error">${escapeHtml(err.message || t('errorGeneric'))}</p>`; }
      });
      card.querySelector('.wp-toggle').addEventListener('click', async () => {
        await api(`/api/admin/whisper/prompts/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status: p.status === 'open' ? 'closed' : 'open' }) });
        loadWhisper();
      });
      box.appendChild(card);
    });
  }
  function setupWhisper() {
    document.getElementById('wp-add-btn').addEventListener('click', async () => {
      const err = document.getElementById('wp-error');
      err.hidden = true;
      const val = id => document.getElementById(id).value.trim();
      try {
        await api('/api/admin/whisper/prompts', { method: 'POST', body: JSON.stringify({
          kind: document.getElementById('wp-kind').value,
          month: val('wp-month'), titleEn: val('wp-title-en'), titleNl: val('wp-title-nl'), bodyEn: val('wp-body-en'), bodyNl: val('wp-body-nl'),
        }) });
        ['wp-month', 'wp-title-en', 'wp-title-nl', 'wp-body-en', 'wp-body-nl'].forEach(id => { document.getElementById(id).value = ''; });
        loadWhisper();
      } catch (e) { err.textContent = e.message || t('errorGeneric'); err.hidden = false; }
    });
    document.getElementById('whisper-image-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const status = document.getElementById('whisper-image-status');
      status.textContent = t('adminUploading');
      try {
        const key = `whisper/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { url } = await api('/api/admin/upload-url', { method: 'POST', body: JSON.stringify({ key, contentType: file.type || 'image/jpeg' }) });
        const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'image/jpeg' }, body: file });
        if (!putRes.ok) throw new Error(t('adminErrorUploadFailed'));
        await api('/api/admin/whisper/forest-image', { method: 'PUT', body: JSON.stringify({ key }) });
        status.textContent = t('adminUploaded');
        loadWhisper();
      } catch (err) { status.textContent = err.message || t('errorGeneric'); }
    });
    document.getElementById('whisper-image-reset').addEventListener('click', async () => {
      await api('/api/admin/whisper/forest-image', { method: 'PUT', body: JSON.stringify({ key: null }) });
      loadWhisper();
    });
  }

  // ── Riddles (Mare App 4) ──
  const RD_STEP_KEYS = [['headingEn', 'adminRdHeadingEn', 1], ['headingNl', 'adminRdHeadingNl', 1], ['textEn', 'adminRdTextEn', 3], ['textNl', 'adminRdTextNl', 3],
    ['questionEn', 'adminRdQuestionEn', 1], ['questionNl', 'adminRdQuestionNl', 1], ['answers', 'adminRdAnswers', 1], ['afterEn', 'adminRdAfterEn', 2], ['afterNl', 'adminRdAfterNl', 2]];
  async function loadRiddles() {
    const box = document.getElementById('rd-list');
    let riddles = [];
    try { riddles = (await api('/api/admin/riddles')).riddles || []; } catch { box.innerHTML = ''; return; }
    box.innerHTML = '';
    riddles.forEach(r => box.appendChild(riddleCard(r)));
  }
  function fieldHtml(label, cls, value, rows) {
    return rows > 1
      ? `<div class="field"><label>${escapeHtml(label)}</label><textarea data-editor="plain" class="${cls}" rows="${rows}">${escapeHtml(value || '')}</textarea></div>`
      : `<div class="field"><label>${escapeHtml(label)}</label><input type="text" class="${cls}" value="${escapeHtml(value || '')}"></div>`;
  }
  function riddleStepHtml(s, i) {
    const pairs = [];
    for (let k = 0; k < RD_STEP_KEYS.length; k++) {
      const [key, label, rows] = RD_STEP_KEYS[k];
      if (key === 'answers') { pairs.push(`<div class="admin-form-row">${fieldHtml(t(label), 'rd-s-' + key, s[key], 1)}</div>`); continue; }
      if (key.endsWith('En')) {
        const nlKey = key.replace(/En$/, 'Nl');
        const nlLabel = RD_STEP_KEYS.find(x => x[0] === nlKey)[1];
        pairs.push(`<div class="admin-form-row">${fieldHtml(t(label), 'rd-s-' + key, s[key], rows)}${fieldHtml(t(nlLabel), 'rd-s-' + nlKey, s[nlKey], rows)}</div>`);
      }
    }
    return `<div class="rd-step" data-i="${i}"><div class="whisper-p-head"><strong>${escapeHtml(t('adminRdStep', { n: i + 1 }))}</strong>
      <button type="button" class="btn-ghost btn-small rd-step-remove">${escapeHtml(t('adminRdRemoveStep'))}</button></div>${pairs.join('')}</div>`;
  }
  function riddleCard(r) {
    const card = document.createElement('div');
    card.className = 'whisper-p-row';
    card.innerHTML = `
      <div class="whisper-p-head">
        <span class="whisper-p-status ${r.status === 'open' ? 'whisper-p-status-open' : ''}">${escapeHtml(t('adminRdStatus_' + r.status))}</span>
        <strong>${escapeHtml(r.title_en)}</strong>
        <span class="admin-empty-note">${escapeHtml(t('adminRdSolved', { n: r.solvedCount }))}</span>
      </div>
      ${r.promoStatus && r.promoStatus !== 'ok' ? `<p class="rd-promo-warn">${escapeHtml(t('adminRdPromo_' + r.promoStatus, { code: r.promo_code }))}</p>` : ''}
      ${r.promoStatus === 'ok' ? `<p class="admin-empty-note">${escapeHtml(t('adminRdPromo_ok', { code: r.promo_code }))}</p>` : ''}
      <div class="whisper-q-btns"><button type="button" class="btn-ghost btn-small rd-edit">${escapeHtml(t('adminRdEdit'))}</button>
        <a class="btn-ghost btn-small" href="/riddle.html" target="_blank" rel="noopener">${escapeHtml(t('adminRdViewPage'))}</a></div>
      <div class="rd-form" hidden>
        <div class="admin-form-row">
          <div class="field" style="max-width:180px;"><label>${escapeHtml(t('adminWhisperMonth'))}</label><input type="month" class="rd-month" value="${escapeHtml(r.month || '')}"></div>
          <div class="field" style="max-width:220px;"><label>${escapeHtml(t('adminRdStatusLabel'))}</label><select class="rd-status">
            ${['draft', 'open', 'closed'].map(st => `<option value="${st}" ${r.status === st ? 'selected' : ''}>${escapeHtml(t('adminRdStatus_' + st))}</option>`).join('')}</select></div>
          <div class="field" style="max-width:220px;"><label>${escapeHtml(t('adminRdPromo'))}</label><input type="text" class="rd-promo" value="${escapeHtml(r.promo_code || '')}" placeholder="RIDDLE10"></div>
        </div>
        <div class="admin-form-row">${fieldHtml(t('adminRdTitleEn'), 'rd-title-en', r.title_en, 1)}${fieldHtml(t('adminRdTitleNl'), 'rd-title-nl', r.title_nl, 1)}</div>
        <div class="admin-form-row">${fieldHtml(t('adminRdIntroEn'), 'rd-intro-en', r.intro_en, 6)}${fieldHtml(t('adminRdIntroNl'), 'rd-intro-nl', r.intro_nl, 6)}</div>
        <div class="rd-steps">${r.steps.map(riddleStepHtml).join('')}</div>
        <button type="button" class="btn-ghost btn-small rd-add-step">${escapeHtml(t('adminRdAddStep'))}</button>
        <div class="admin-form-row" style="margin-top:14px;">${fieldHtml(t('adminRdCodeLabelEn'), 'rd-code-label-en', r.code_label_en, 2)}${fieldHtml(t('adminRdCodeLabelNl'), 'rd-code-label-nl', r.code_label_nl, 2)}</div>
        <div class="admin-form-row">${fieldHtml(t('adminRdCodes'), 'rd-codes', r.code_answers, 1)}</div>
        <div class="admin-form-row">${fieldHtml(t('adminRdRewardEn'), 'rd-reward-en', r.reward_en, 8)}${fieldHtml(t('adminRdRewardNl'), 'rd-reward-nl', r.reward_nl, 8)}</div>
        <p class="form-success rd-ok" hidden></p><p class="form-error rd-err" hidden></p>
        <div class="whisper-q-btns">
          <button type="button" class="btn-primary btn-small rd-save">${escapeHtml(t('adminSaveChanges'))}</button>
          ${r.status === 'draft' ? `<button type="button" class="btn-ghost btn-small rd-delete">${escapeHtml(t('adminPostDelete'))}</button>` : ''}
        </div>
      </div>`;
    const q = s => card.querySelector(s);
    q('.rd-edit').addEventListener('click', () => { q('.rd-form').hidden = !q('.rd-form').hidden; });
    const wireStep = (el) => el.querySelector('.rd-step-remove').addEventListener('click', () => el.remove());
    card.querySelectorAll('.rd-step').forEach(wireStep);
    q('.rd-add-step').addEventListener('click', () => {
      const wrap = document.createElement('div');
      wrap.innerHTML = riddleStepHtml({}, card.querySelectorAll('.rd-step').length);
      const el = wrap.firstElementChild;
      q('.rd-steps').appendChild(el);
      wireStep(el);
    });
    q('.rd-save').addEventListener('click', async () => {
      const steps = [...card.querySelectorAll('.rd-step')].map(el => Object.fromEntries(RD_STEP_KEYS.map(([k]) => [k, el.querySelector('.rd-s-' + k).value])));
      const body = {
        month: q('.rd-month').value, status: q('.rd-status').value, promo_code: q('.rd-promo').value,
        title_en: q('.rd-title-en').value, title_nl: q('.rd-title-nl').value, intro_en: q('.rd-intro-en').value, intro_nl: q('.rd-intro-nl').value,
        steps, code_label_en: q('.rd-code-label-en').value, code_label_nl: q('.rd-code-label-nl').value, code_answers: q('.rd-codes').value,
        reward_en: q('.rd-reward-en').value, reward_nl: q('.rd-reward-nl').value,
      };
      try {
        await api(`/api/admin/riddles/${r.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        q('.rd-err').hidden = true; q('.rd-ok').textContent = t('adminSaved'); q('.rd-ok').hidden = false;
        setTimeout(loadRiddles, 900);
      } catch (e) { q('.rd-ok').hidden = true; q('.rd-err').textContent = e.message || t('errorGeneric'); q('.rd-err').hidden = false; }
    });
    const del = q('.rd-delete');
    if (del) del.addEventListener('click', async () => {
      if (!window.confirm(t('adminRdDeleteConfirm'))) return;
      await api(`/api/admin/riddles/${r.id}`, { method: 'DELETE' });
      loadRiddles();
    });
    return card;
  }
  function setupRiddles() {
    document.getElementById('rd-new-btn').addEventListener('click', async () => {
      await api('/api/admin/riddles', { method: 'POST' });
      loadRiddles();
    });
  }

  // ── Mare's monthly post (Mare App 4) ──
  let mpRecipients = 0;
  async function loadMarePosts() {
    let data;
    try { data = await api('/api/admin/mare-posts'); } catch { return; }
    mpRecipients = data.recipients || 0;
    document.getElementById('mp-desc').textContent = t('adminPostDesc', { n: mpRecipients });
    const list = document.getElementById('mp-list');
    list.innerHTML = '';
    (data.posts || []).forEach(p => list.appendChild(marePostCard(p)));
  }
  function marePostCard(p) {
    const card = document.createElement('div');
    card.className = 'whisper-p-row';
    const head = `<div class="whisper-p-head"><strong>${escapeHtml(whisperMonthLabel(p.month) || '—')}</strong>
      <span class="whisper-p-status ${p.status === 'draft' ? '' : 'whisper-p-status-open'}">${escapeHtml(t(p.status === 'draft' ? 'adminPostStatusDraft' : 'adminPostStatusSent'))}</span></div>`;
    if (p.status !== 'draft') {
      card.innerHTML = `${head}<p class="admin-empty-note">${escapeHtml(t('adminPostSentLine', { n: p.sent_count ?? 0, total: p.recipient_count ?? 0, failed: p.failed_count ?? 0 }))}</p>
        <details><summary>${escapeHtml(p.subject_en)}</summary><p style="white-space:pre-line;">${escapeHtml(p.body_en)}</p></details>`;
      return card;
    }
    card.innerHTML = `${head}
      <div class="admin-form-row">
        <div class="field"><label>${escapeHtml(t('adminPostSubjectEn'))}</label><input type="text" class="mp-subject-en" maxlength="200"></div>
        <div class="field"><label>${escapeHtml(t('adminPostSubjectNl'))}</label><input type="text" class="mp-subject-nl" maxlength="200"></div>
      </div>
      <div class="admin-form-row">
        <div class="field"><label>${escapeHtml(t('adminPostBodyEn'))}</label><textarea data-editor="plain" class="mp-body-en" rows="12" maxlength="4000"></textarea></div>
        <div class="field"><label>${escapeHtml(t('adminPostBodyNl'))}</label><textarea data-editor="plain" class="mp-body-nl" rows="12" maxlength="4000"></textarea></div>
      </div>
      <p class="admin-empty-note">${escapeHtml(t('adminPostNamesHint'))}</p>
      <p class="form-success mp-ok" hidden></p><p class="form-error mp-err" hidden></p>
      <div class="whisper-q-btns">
        <button type="button" class="btn-ghost btn-small mp-save">${escapeHtml(t('adminSaveChanges'))}</button>
        <button type="button" class="btn-ghost btn-small mp-test-en">${escapeHtml(t('adminPostTestEn'))}</button>
        <button type="button" class="btn-ghost btn-small mp-test-nl">${escapeHtml(t('adminPostTestNl'))}</button>
        <button type="button" class="btn-ghost btn-small mp-test-team">${escapeHtml(t('adminPostTestTeam'))}</button>
        <button type="button" class="btn-primary btn-small mp-send">${escapeHtml(t('adminPostSend', { n: mpRecipients }))}</button>
        <button type="button" class="btn-ghost btn-small mp-delete">${escapeHtml(t('adminPostDelete'))}</button>
      </div>`;
    const q = sel => card.querySelector(sel);
    q('.mp-subject-en').value = p.subject_en; q('.mp-subject-nl').value = p.subject_nl;
    q('.mp-body-en').value = p.body_en; q('.mp-body-nl').value = p.body_nl;
    const say = (ok, msg) => {
      q('.mp-ok').hidden = !ok; q('.mp-err').hidden = ok;
      (ok ? q('.mp-ok') : q('.mp-err')).textContent = msg;
    };
    const save = () => api(`/api/admin/mare-posts/${p.id}`, { method: 'PATCH', body: JSON.stringify({
      subjectEn: q('.mp-subject-en').value, subjectNl: q('.mp-subject-nl').value,
      bodyEn: q('.mp-body-en').value, bodyNl: q('.mp-body-nl').value,
    }) });
    q('.mp-save').addEventListener('click', async () => {
      try { await save(); say(true, t('adminSaved')); } catch (e) { say(false, e.message || t('errorGeneric')); }
    });
    for (const locale of ['en', 'nl']) {
      q(`.mp-test-${locale}`).addEventListener('click', async (e) => {
        e.target.disabled = true;
        try {
          await save();
          await api(`/api/admin/mare-posts/${p.id}/test`, { method: 'POST', body: JSON.stringify({ locale }) });
          say(true, t('adminPostTestSent'));
        } catch (err) { say(false, err.message || t('errorGeneric')); }
        e.target.disabled = false;
      });
    }
    q('.mp-test-team').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        await save();
        const out = await api(`/api/admin/mare-posts/${p.id}/test-team`, { method: 'POST' });
        say(true, t('adminPostTestTeamSent', { names: (out.sentTo || []).join(', ') }) + (out.failed && out.failed.length ? ' ' + t('adminPostTestTeamFailed', { names: out.failed.join(', ') }) : ''));
      } catch (err) { say(false, err.message || t('errorGeneric')); }
      e.target.disabled = false;
    });
    q('.mp-send').addEventListener('click', async (e) => {
      if (!window.confirm(t('adminPostSendConfirm', { n: mpRecipients }))) return;
      e.target.disabled = true;
      e.target.textContent = t('adminPostSending');
      try {
        await save();
        const out = await api(`/api/admin/mare-posts/${p.id}/send`, { method: 'POST' });
        alert(t('adminPostSentLine', { n: out.sent, total: out.recipients, failed: out.failed }));
        loadMarePosts();
      } catch (err) {
        say(false, err.message || t('errorGeneric'));
        e.target.disabled = false;
        e.target.textContent = t('adminPostSend', { n: mpRecipients });
      }
    });
    q('.mp-delete').addEventListener('click', async () => {
      if (!window.confirm(t('adminPostDeleteConfirm'))) return;
      await api(`/api/admin/mare-posts/${p.id}`, { method: 'DELETE' });
      loadMarePosts();
    });
    return card;
  }
  function setupMarePosts() {
    document.getElementById('mp-month').value = new Date().toISOString().slice(0, 7);
    document.getElementById('mp-draft-btn').addEventListener('click', async (e) => {
      const err = document.getElementById('mp-error');
      err.hidden = true;
      e.target.disabled = true;
      const label = e.target.textContent;
      e.target.textContent = t('adminPostWriting');
      try {
        const out = await api('/api/admin/mare-posts/draft', { method: 'POST', body: JSON.stringify({
          month: document.getElementById('mp-month').value, notes: document.getElementById('mp-notes').value,
        }) });
        if (out.note) { err.textContent = out.note; err.hidden = false; }
        document.getElementById('mp-notes').value = '';
        loadMarePosts();
      } catch (ex) { err.textContent = ex.message || t('errorGeneric'); err.hidden = false; }
      e.target.disabled = false;
      e.target.textContent = label;
    });
  }

  // ── Site text changes (Mare App 4) — log, undo, undo today ──
  async function loadTextChanges() {
    const box = document.getElementById('text-changes');
    let changes = [];
    try { changes = (await api('/api/admin/text-changes')).changes || []; }
    catch { box.innerHTML = ''; document.getElementById('text-undo-today').hidden = true; return; }
    const visible = changes.filter(c => !String(c.changed_by || '').endsWith('(undo)'));
    if (!visible.length) {
      box.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminTextsNone'))}</p>`;
      return;
    }
    box.innerHTML = '';
    visible.slice(0, 50).forEach(c => {
      const row = document.createElement('div');
      row.className = 'text-change-row' + (c.undone ? ' text-change-undone' : '');
      const when = new Date(c.changed_at.replace(' ', 'T') + 'Z').toLocaleString(window.MareI18n.locale === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      row.innerHTML = `
        <div class="text-change-meta">${escapeHtml(when)} · ${escapeHtml(c.locale.toUpperCase())} · ${escapeHtml(c.changed_by || '')}${c.undone ? ` · <em>${escapeHtml(t('adminTextsUndone'))}</em>` : ''}</div>
        <div class="text-change-old">${escapeHtml(c.old_text ?? c.originalText)}</div>
        <div class="text-change-new">${escapeHtml(c.new_text ?? c.originalText)}</div>
        ${c.undone ? '' : `<button type="button" class="btn-ghost btn-small">${escapeHtml(t('adminTextsUndo'))}</button>`}`;
      const btn = row.querySelector('button');
      if (btn) btn.addEventListener('click', async () => {
        try { await api(`/api/admin/text-changes/${c.id}/undo`, { method: 'POST' }); loadTextChanges(); }
        catch (err) { alert(err.message || t('errorGeneric')); }
      });
      box.appendChild(row);
    });
  }
  function setupTextChanges() {
    document.getElementById('text-undo-today').addEventListener('click', async () => {
      if (!window.confirm(t('adminTextsUndoTodayConfirm'))) return;
      try {
        const out = await api('/api/admin/text-changes/undo-today', { method: 'POST' });
        alert(t('adminTextsUndoTodayDone', { n: out.undone }));
        loadTextChanges();
      } catch (err) { alert(err.message || t('errorGeneric')); }
    });
  }

  // ── Home page notice (Mare App 4) ──
  const HN = { active: 'hn-active', titleEn: 'hn-title-en', titleNl: 'hn-title-nl', bodyEn: 'hn-body-en', bodyNl: 'hn-body-nl', code: 'hn-code', url: 'hn-url', buttonEn: 'hn-button-en', buttonNl: 'hn-button-nl' };
  async function loadHomeNotice() {
    try {
      const n = (await api('/api/admin/home-notice')).notice || {};
      for (const [k, id] of Object.entries(HN)) {
        const el = document.getElementById(id);
        if (k === 'active') el.checked = !!n.active; else el.value = n[k] || '';
      }
    } catch { /* leave the form empty */ }
  }
  function setupHomeNotice() {
    document.getElementById('hn-save-btn').addEventListener('click', async () => {
      const errorEl = document.getElementById('hn-error');
      const okEl = document.getElementById('hn-success');
      errorEl.hidden = true; okEl.hidden = true;
      const body = {};
      for (const [k, id] of Object.entries(HN)) {
        const el = document.getElementById(id);
        body[k] = k === 'active' ? el.checked : el.value;
      }
      try {
        await api('/api/admin/home-notice', { method: 'PUT', body: JSON.stringify(body) });
        okEl.textContent = t('adminSaved');
        okEl.hidden = false;
        setTimeout(() => { okEl.hidden = true; }, 3000);
      } catch (err) {
        errorEl.textContent = err.message || t('errorGeneric');
        errorEl.hidden = false;
      }
    });
  }

  // ── Delivery & postage (Mare App 4) ──
  const SHIPPING_COUNTRIES = ['GB', 'NL', 'BE', 'IE', 'DE', 'FR'];
  async function loadShipping() {
    const box = document.getElementById('shipping-list');
    let options = [];
    try { options = (await api('/api/admin/shipping')).options || []; } catch { /* show empty rows */ }
    const lang = window.MareI18n.locale === 'nl' ? 'nl' : 'en';
    const nameOf = (c) => { try { return new Intl.DisplayNames([lang], { type: 'region' }).of(c); } catch { return c; } };
    box.innerHTML = SHIPPING_COUNTRIES.map(c => {
      const o = options.find(x => x.country === c);
      return `<div class="admin-form-row shipping-row" data-country="${c}" style="align-items:center;">
        <label class="mkt-platform-check" style="min-width:200px;"><input type="checkbox" class="ship-on" ${o ? 'checked' : ''}> <span>${escapeHtml(nameOf(c))}</span></label>
        <div class="field" style="max-width:160px;margin-bottom:0;"><input type="number" class="ship-postage" min="0" step="0.01" placeholder="3.95" value="${o ? (o.postageCents / 100).toFixed(2) : ''}"></div>
      </div>`;
    }).join('');
  }
  function setupShipping() {
    document.getElementById('shipping-save-btn').addEventListener('click', async () => {
      const errorEl = document.getElementById('shipping-error');
      const okEl = document.getElementById('shipping-success');
      errorEl.hidden = true; okEl.hidden = true;
      const options = [];
      for (const row of document.querySelectorAll('.shipping-row')) {
        if (!row.querySelector('.ship-on').checked) continue;
        const v = row.querySelector('.ship-postage').value;
        if (v === '' || Number(v) < 0) {
          errorEl.textContent = t('adminShippingNeedsPostage');
          errorEl.hidden = false;
          return;
        }
        options.push({ country: row.getAttribute('data-country'), postageCents: Math.round(Number(v) * 100) });
      }
      try {
        await api('/api/admin/shipping', { method: 'PUT', body: JSON.stringify({ options }) });
        okEl.textContent = t('adminSaved');
        okEl.hidden = false;
        setTimeout(() => { okEl.hidden = true; }, 3000);
      } catch (err) {
        errorEl.textContent = err.message || t('errorGeneric');
        errorEl.hidden = false;
      }
    });
  }

  function setupProductModal() {
    document.getElementById('new-product-btn').addEventListener('click', () => openProductModal(null, null));
    document.getElementById('pr-close-btn').addEventListener('click', () => { document.getElementById('product-modal').hidden = true; });

    document.getElementById('pr-image-file').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        try {
          const key = `products/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const { url } = await api('/api/admin/upload-url', { method: 'POST', body: JSON.stringify({ key, contentType: file.type || 'application/octet-stream' }) });
          const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
          if (!putRes.ok) throw new Error();
          prUploadedImageKeys.push(key);
        } catch {
          showModalError('product-error', t('adminErrorUploadFailed'));
        }
      }
      renderImageChips();
      e.target.value = '';
    });

    document.getElementById('pr-video-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const status = document.getElementById('pr-video-status');
      status.textContent = t('adminUploading');
      try {
        const key = `products/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { url } = await api('/api/admin/upload-url', { method: 'POST', body: JSON.stringify({ key, contentType: file.type || 'video/mp4' }) });
        const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'video/mp4' }, body: file });
        if (!putRes.ok) throw new Error(t('adminErrorUploadFailed'));
        prUploadedVideoKey = key;
        status.textContent = t('adminUploaded');
      } catch (err) {
        status.textContent = err.message || t('errorGeneric');
      }
    });

    document.getElementById('pr-save-btn').addEventListener('click', async () => {
      const name = document.getElementById('pr-name').value.trim();
      const description = document.getElementById('pr-description').value.trim();
      const nameNl = document.getElementById('pr-name-nl').value.trim();
      const descriptionNl = document.getElementById('pr-description-nl').value.trim();
      const priceVal = parseFloat(document.getElementById('pr-price').value);
      const currency = document.getElementById('pr-currency').value;
      const stockVal = document.getElementById('pr-stock').value;
      const active = document.getElementById('pr-active').checked;
      const featured = document.getElementById('pr-featured').checked;
      if (!name || !priceVal || priceVal <= 0) { showModalError('product-error', t('errorMissingFields')); return; }
      try {
        const payload = JSON.stringify({
          name, description, priceCents: Math.round(priceVal * 100), currency,
          imageKeys: prUploadedImageKeys, videoKey: prUploadedVideoKey,
          stock: stockVal === '' ? null : Number(stockVal), active, featured, nameNl, descriptionNl,
        });
        if (prEditingId) {
          await api(`/api/admin/products/${prEditingId}`, { method: 'PATCH', body: payload });
        } else {
          await api('/api/admin/products', { method: 'POST', body: payload });
        }
        document.getElementById('product-modal').hidden = true;
        loadProducts();
      } catch {
        showModalError('product-error', t('errorGeneric'));
      }
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Boot ──
  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();
    setupLoginForm();
    setupForgotPassword();
    setupResourceForm();
    setupPageForm();
    setupSocialLinkForm();
    setupMarketingGenerator();
    setupStaffForm();

    const user = await checkSession();
    if (user && user.role === 'editor') { window.location.href = '/editor.html'; return; }
    if (user && (user.role === 'admin' || user.role === 'support')) {
      currentUser = user;
      enterDashboard(user);
    }
  }
  init();
})();
