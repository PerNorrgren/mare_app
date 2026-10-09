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

    addCloseButtons(); // v81
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
    setupComms(); // v87
    setupTreasure(); // v89
    setupRiddles();
    setupAdminSettings();
    loadOverview();
    loadResources();
    loadPages();
    loadDirectory();
    loadAdminSettings();
    loadMarketingHistory();
    loadSocial(); // v82
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
    loadComms(); // v87
    loadTreasure(); // v89
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

  let lastTab = 'overview';
  // ── Mare App 6 (v81) — a Close at the top and the bottom of every pop-out:
  // the windows that open over the page, the Overview lists, the Email log,
  // the Reports lists and 'Try it here' in the picture builder.
  function addCloseButtons() {
    const mk = (cls, text, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; b.setAttribute('data-no-busy', ''); b.addEventListener('click', fn); return b; };
    // windows over the page: a ✕ at the top that does what their own Close does
    document.querySelectorAll('.admin-modal-backdrop').forEach(bd => {
      const card = bd.querySelector('.admin-modal-card'); if (!card) return;
      const own = bd.querySelector('[id$="-close-btn"]');
      const close = () => { if (own) own.click(); else if (bd.id === 'flow-modal') flowClose(); else bd.hidden = true; };
      if (!card.querySelector('.flow-modal-close, .pop-x')) { card.style.position = card.style.position || 'relative'; card.prepend(mk('pop-x', '✕', close)); card.querySelector('.pop-x').setAttribute('aria-label', t('adminClose')); }
      if (!own) card.appendChild(Object.assign(document.createElement('div'), { className: 'pop-bottom' })).appendChild(mk('btn-ghost btn-small', t('adminClose'), close));
    });
    // Overview "At a glance" list: Close at the bottom too
    const sd = document.getElementById('stat-detail');
    if (sd && !sd.querySelector('.pop-bottom')) sd.appendChild(Object.assign(document.createElement('div'), { className: 'pop-bottom' })).appendChild(mk('btn-ghost btn-small', t('adminClose'), () => closeStatDetail()));
    // Email log: Close at the top and the bottom, back to where you came from
    const el = document.querySelector('#panel-emaillog .admin-card');
    if (el && !el.querySelector('.pop-top')) {
      const back = () => goToTab(lastTab && lastTab !== 'emaillog' ? lastTab : 'overview');
      el.prepend(Object.assign(document.createElement('div'), { className: 'pop-top' })); el.querySelector('.pop-top').appendChild(mk('btn-ghost btn-small', `✕ ${t('adminClose')}`, back));
      el.appendChild(Object.assign(document.createElement('div'), { className: 'pop-bottom' })).appendChild(mk('btn-ghost btn-small', `✕ ${t('adminClose')}`, back));
    }
    // Reports lists: Back at the bottom too
    const pl = document.querySelector('#an-people .admin-card');
    if (pl && !pl.querySelector('.pop-bottom')) pl.appendChild(Object.assign(document.createElement('div'), { className: 'pop-bottom' })).appendChild(mk('btn-ghost btn-small', `← ${t('anBackToReports')}`, () => closePeople()));
  }

  function setupTabs() {
    document.querySelectorAll('#admin-tabs .admin-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.hidden) return;
        const was = document.querySelector('#admin-tabs .admin-tab.active');
        if (was && was !== btn) lastTab = was.getAttribute('data-tab'); // v81: Close goes back here
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
        if (target === 'companion') { loadCompanionAdmin(); loadPictures(); loadTreasure(); }
        if (target === 'analytics') loadAnalytics();
        if (target === 'comms') loadComms(); // v87
        if (target === 'marketing') loadSocialQueue(); // v92: always the latest posts
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
    return { colour: o.colour || '', mode: o.mode === 'colour' ? 'colour' : 'blur', shape: o.shape === 'circle' ? 'circle' : 'rect', h: o.h == null ? null : Number(o.h), reveal: !!o.reveal,
      icon: o.icon || null, opacity: o.opacity == null ? 1 : Number(o.opacity), glow: o.glow !== false }; // v88: a picture as the spot
  }
  // v88 — playback addresses of spot pictures (asked once each)
  const spotIconUrls = new Map();
  function spotIconUrl(key) {
    if (/^\/images\//.test(key || '')) return Promise.resolve(key); // shipped with the app
    if (!spotIconUrls.has(key)) spotIconUrls.set(key, api('/api/playback-url?key=' + encodeURIComponent(key)).then(r => r.url).catch(() => ''));
    return spotIconUrls.get(key);
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
      ov.innerHTML = `<div class="pic-try-card"><button type="button" class="flow-modal-close" data-no-busy aria-label="Close">✕</button><div class="pic-try-body">${html}</div>
        <div class="pop-bottom"><button type="button" class="btn-ghost btn-small flow-modal-close-b" data-no-busy>${escapeHtml(t('adminClose'))}</button></div></div>`;
      ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('.flow-modal-close, .flow-modal-close-b')) flowClose(); });
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
        } else if (lk.icon) { // v88: the spot's own picture, as see-through as chosen
          d.classList.add('pic-iconspot');
          if (!lk.glow) d.classList.add('pic-noglow');
          const im = document.createElement('img'); im.alt = ''; im.draggable = false; im.style.opacity = lk.opacity;
          spotIconUrl(lk.icon).then(u => { if (u) im.src = u; });
          d.appendChild(im);
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
    function fileNameOf(key) { return String(key || '').split('/').pop().replace(/^\d{10,}-/, '').replace(/^mare-spot-/, ''); }
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
        ${type === 'mask' ? `<label class="vid-pause"><input type="checkbox" class="sp-mask-reveal"${lk.reveal ? ' checked' : ''}> ${escapeHtml(t('adminMaskReveal'))}</label>` : `<div class="field look-pic" data-icon="${escapeHtml(lk.icon || '')}">
          <label>${escapeHtml(t('adminSpotPic'))}</label>
          <div class="look-pic-row">
            ${lk.icon ? `<img class="look-pic-thumb" alt=""><a href="#" class="look-pic-rm">${escapeHtml(t('adminSpotRemove'))}</a>` : ''}
            <label class="btn-ghost btn-small">${escapeHtml(t(lk.icon ? 'adminSpotPicChange' : 'adminSpotPicUpload'))}<input type="file" class="look-pic-file" accept="image/*" hidden></label>
            <button type="button" class="btn-ghost btn-small look-pic-choose" data-no-busy>${escapeHtml(t('adminSpotPicChoose'))}</button>
          </div>
          <div class="look-pic-lib" hidden></div>
          ${lk.icon ? `<div class="look-pic-opts">
            <label class="look-opacity">${escapeHtml(t('adminSpotOpacity'))} <input type="range" class="sp-opacity" min="0" max="0.9" step="0.05" value="${(1 - lk.opacity).toFixed(2)}"> <span class="sp-opacity-val">${Math.round((1 - lk.opacity) * 100)}%</span></label>
            <label class="vid-pause"><input type="checkbox" class="sp-glow"${lk.glow ? ' checked' : ''}> ${escapeHtml(t('adminSpotGlow'))}</label>
          </div>` : `<p class="admin-empty-note">${escapeHtml(t('adminSpotPicHint'))}</p>`}
        </div>`}`; })()}
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
          const look = { colour: q('.sp-colour').dataset.cleared ? null : q('.sp-colour').value, mode: lk.mode, shape: lk.shape, h: lk.h, reveal: lk.reveal,
            icon: q('.look-pic') ? (q('.look-pic').dataset.icon || null) : lk.icon,
            opacity: q('.sp-opacity') ? 1 - Number(q('.sp-opacity').value) : lk.opacity, glow: q('.sp-glow') ? q('.sp-glow').checked : lk.glow };
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
      // v88 — the spot's picture: upload, choose one used before, remove (each saved at once); transparency and glow show live
      if (q('.look-pic')) {
        const pic = q('.look-pic');
        const setIcon = async (key) => {
          pic.dataset.icon = key || '';
          const body = typed();
          await working(form, () => api(`/api/admin/picture-spots/${sp.id}`, { method: 'PATCH', body: JSON.stringify(body) }));
          applyLocal(body); drawSpots(); drawForm(sp);
        };
        if (q('.look-pic-thumb')) spotIconUrl(pic.dataset.icon).then(u => { if (u && q('.look-pic-thumb')) q('.look-pic-thumb').src = u; });
        q('.look-pic-file').addEventListener('change', async (e) => {
          const file = e.target.files[0]; if (!file) return;
          try { await setIcon(await working(form, () => picUpload(file, 'spot-icons'))); } catch (err) { say(false, err.message || t('errorGeneric')); }
        });
        if (q('.look-pic-rm')) q('.look-pic-rm').addEventListener('click', async (e) => { e.preventDefault(); await setIcon(null); });
        q('.look-pic-choose').addEventListener('click', async () => {
          const lib = q('.look-pic-lib');
          if (!lib.hidden) { lib.hidden = true; return; }
          lib.hidden = false; lib.textContent = t('adminLoading');
          let icons = [];
          try { icons = (await api('/api/admin/picture-spot-icons')).icons || []; } catch { /* empty */ }
          lib.innerHTML = icons.length ? icons.map(i => `<button type="button" class="look-pic-pick" data-key="${escapeHtml(i.key)}" title="${escapeHtml(fileNameOf(i.key))}"><img src="${escapeHtml(i.url || '')}" alt=""></button>`).join('')
            : `<p class="admin-empty-note">${escapeHtml(t('adminSpotPicNone'))}</p>`;
          lib.querySelectorAll('.look-pic-pick').forEach(b => b.addEventListener('click', () => setIcon(b.dataset.key)));
        });
        if (q('.sp-opacity')) q('.sp-opacity').addEventListener('input', () => { q('.sp-opacity-val').textContent = Math.round(Number(q('.sp-opacity').value) * 100) + '%'; liveLook(); });
        if (q('.sp-glow')) q('.sp-glow').addEventListener('change', liveLook);
      }
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


  // ── Mare App 6 (v78) — Reports (usage analytics) ──────────────────────
  const anDay = (d) => d.toISOString().slice(0, 10);
  const anRange = { from: '', to: '' };
  const anInRange = (iso) => { const d = String(iso || '').replace(' ', 'T').slice(0, 10); return d >= anRange.from && d <= anRange.to; };
  let anDays = 30, anData = null;
  function anSetPeriod(days) {
    anDays = days;
    document.querySelectorAll('.an-period').forEach(b => b.classList.toggle('on', Number(b.dataset.days) === days));
    const to = new Date(), from = new Date(Date.now() - (days - 1) * 864e5);
    document.getElementById('an-from').value = anDay(from);
    document.getElementById('an-to').value = anDay(to);
  }
  if (document.getElementById('an-load')) {
    anSetPeriod(30);
    document.querySelectorAll('.an-period').forEach(b => b.addEventListener('click', () => { anSetPeriod(Number(b.dataset.days)); loadAnalytics(); }));
    document.getElementById('an-load').addEventListener('click', () => { document.querySelectorAll('.an-period').forEach(b => b.classList.remove('on')); loadAnalytics(); });
    document.getElementById('an-staff').addEventListener('change', loadAnalytics);
  }
  const anNum = (n) => (n == null ? '0' : Number(n).toLocaleString(window.MareI18n.locale === 'nl' ? 'nl-NL' : 'en-GB'));
  const anMin = (m) => { m = Number(m) || 0; if (m < 60) return `${anNum(Math.round(m))} min`; const h = Math.floor(m / 60); return `${anNum(h)} h ${Math.round(m - h * 60)} min`; };
  const PAGE_NAME = { '/': 'anPageHome', '/companion.html': 'anPageCompanion', '/pictures.html': 'anPagePictures', '/talk.html': 'anPageTalk', '/club-mare.html': 'anPageClub', '/forest.html': 'anPageForest',
    '/riddle.html': 'anPageRiddle', '/merchandise.html': 'anPageShop', '/account.html': 'anPageAccount', '/login.html': 'anPageLogin', '/teacher.html': 'anPageTeacher', '/teacher-login.html': 'anPageTeacherLogin',
    '/press.html': 'anPagePress', '/reader.html': 'anPageReader', '/reset-password.html': 'anPageReset', '/admin.html': 'anPageAdmin', '/editor.html': 'anPageEditor', '/admin-content.html': 'anPageBookContent' };
  const pageName = (p) => (PAGE_NAME[p] ? t(PAGE_NAME[p]) : p);
  // A table with a CSV download. cols: [[labelKey, field, format?]]
  function anTable(id, titleKey, cols, rows, noteKey) {
    const head = cols.map(c => `<th>${escapeHtml(t(c[0]))}</th>`).join('');
    const body = rows.length ? rows.map(r => `<tr>${cols.map(c => `<td>${escapeHtml(c[2] ? c[2](r[c[1]], r) : (r[c[1]] == null ? '' : String(r[c[1]])))}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="admin-empty-note">${escapeHtml(t('anNone'))}</td></tr>`;
    return `<div class="an-block${cols.length > 5 ? ' an-wide' : ''}"><div class="an-block-head"><h3>${escapeHtml(t(titleKey))}</h3>${rows.length ? `<button type="button" class="btn-ghost btn-small an-csv" data-id="${id}" data-no-busy>⬇ CSV</button>` : ''}</div>
      ${noteKey ? `<p class="admin-empty-note">${escapeHtml(t(noteKey))}</p>` : ''}
      <div class="stat-detail-scroll"><table class="admin-table" data-csv="${id}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`;
  }
  // v80 — a box with an action is a button: it opens the people (or
  // accounts / orders) behind that number. Actions are kept by index.
  const anActions = [];
  function anCards(items) {
    return `<div class="an-cards">${items.map(([k, v, sub, act]) => {
      const inner = `<div class="an-val">${escapeHtml(String(v))}</div><div class="an-lab">${escapeHtml(t(k))}</div>${sub ? `<div class="an-sub">${escapeHtml(sub)}</div>` : ''}`;
      if (!act) return `<div class="an-card">${inner}</div>`;
      anActions.push({ ...act, label: t(k) });
      return `<button type="button" class="an-card an-click" data-act="${anActions.length - 1}" data-no-busy>${inner}<div class="an-go">${escapeHtml(t('anClickToView'))} ›</div></button>`;
    }).join('')}</div>`;
  }
  function anRunAction(a) {
    if (a.scroll) { const el = document.querySelector(`table[data-csv="${a.scroll}"]`); if (el) el.closest('.an-block').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (a.detail) { openDetail(a.detail, a.label, a.fn); return; }
    openPeople({ label: a.label, fn: a.fn, sort: a.sort });
  }
  // Daily visits (bars) and minutes (line), plain SVG
  function anChart(daily, from, to) {
    const days = []; for (let d = new Date(from + 'T00:00:00Z'); anDay(d) <= to; d = new Date(d.getTime() + 864e5)) days.push(anDay(d));
    if (days.length < 2) return '';
    const by = Object.fromEntries(daily.map(r => [r.day, r]));
    const vis = days.map(d => (by[d] ? by[d].visits : 0)), mins = days.map(d => (by[d] ? by[d].minutes : 0));
    const W = 900, H = 220, L = 40, R = 40, T = 14, B = 26, iw = W - L - R, ih = H - T - B;
    const mv = Math.max(1, ...vis), mm = Math.max(1, ...mins), bw = iw / days.length;
    const bars = vis.map((v, i) => `<rect x="${(L + i * bw + bw * 0.15).toFixed(1)}" y="${(T + ih - (v / mv) * ih).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${((v / mv) * ih).toFixed(1)}" rx="2" class="an-bar-v"><title>${days[i]}: ${v} ${t('anVisits')}, ${mins[i]} min</title></rect>`).join('');
    const line = mins.map((m, i) => `${(L + i * bw + bw / 2).toFixed(1)},${(T + ih - (m / mm) * ih).toFixed(1)}`).join(' ');
    const step = Math.ceil(days.length / 8);
    const labels = days.map((d, i) => (i % step === 0 ? `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="an-axis">${d.slice(5)}</text>` : '')).join('');
    return `<div class="an-block"><div class="an-block-head"><h3>${escapeHtml(t('anDaily'))}</h3>
      <span class="an-legend"><i class="an-key-v"></i>${escapeHtml(t('anVisits'))} <i class="an-key-m"></i>${escapeHtml(t('anMinutes'))}</span></div>
      <svg viewBox="0 0 ${W} ${H}" class="an-chart" role="img" aria-label="${escapeHtml(t('anDaily'))}">
        <text x="${L - 6}" y="${T + 8}" text-anchor="end" class="an-axis">${mv}</text><text x="${W - R + 6}" y="${T + 8}" class="an-axis an-axis-m">${mm}</text>
        <line x1="${L}" y1="${T + ih}" x2="${W - R}" y2="${T + ih}" class="an-base"/>${bars}
        <polyline points="${line}" class="an-line"/>${labels}</svg></div>`;
  }
  async function loadAnalytics() {
    const out = document.getElementById('an-out');
    if (!out) return;
    if (!document.getElementById('an-people').hidden) { // period changed while looking at a list
      if (anPeople.mode === 'detail') { closePeople(); } else { openPeople({}); return; }
    }
    const from = document.getElementById('an-from').value, to = document.getElementById('an-to').value;
    const staff = document.getElementById('an-staff').checked ? '1' : '0';
    out.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminLoading'))}</p>`;
    anActions.length = 0;
    let d;
    try { d = await api(`/api/admin/analytics?from=${from}&to=${to}&staff=${staff}`); }
    catch (e) { out.innerHTML = `<p class="form-error">${escapeHtml(e.message || t('errorGeneric'))}</p>`; return; }
    anData = d; anRange.from = d.from; anRange.to = d.to;
    document.getElementById('an-note').textContent = d.totals.trackingSince ? t('anTrackingSince', { day: d.totals.trackingSince }) : t('anTrackingNew');
    const o = d.overview, c = d.companion, money = (cents) => `€${(Number(cents || 0) / 100).toFixed(2)}`;
    const role = (r) => t('anRole_' + r);
    let html = '';
    const vv = d.visitors || { unique: 0, returning: 0, new: 0, comeBack: [] };
    html += `<div class="admin-card"><h2>${escapeHtml(t('anOverview'))}</h2>${anCards([
      ['anUnique', anNum(vv.unique), '', { sort: 'days' }], ['anReturning', anNum(vv.returning), vv.unique ? `${Math.round(vv.returning / vv.unique * 100)}%` : '', { fn: (r) => r.days >= 2, sort: 'days' }], ['anNewVisitors', anNum(vv.new), '', { fn: (r) => r.isNew }],
      ['anVisits', anNum(o.visits), '', { fn: (r) => r.visits > 0, sort: 'visits' }], ['anTimeOnline', anMin(o.minutes), '', { fn: (r) => r.visits > 0, sort: 'minutes' }], ['anAvgVisit', `${o.avgMinutesPerVisit} min`, '', { fn: (r) => r.visits > 0, sort: 'minutes' }], ['anPageViews', anNum(o.pageViews), '', { fn: (r) => r.pages > 0, sort: 'pages' }],
      ['anActiveAccounts', anNum(o.activeAccounts), '', { fn: (r) => r.role !== 'visitor' && r.visits > 0 }], ['anNewParents', anNum(o.newParents), '', { fn: (r) => r.role === 'parent' && r.signedUpAt }], ['anNewTeachers', anNum(o.newTeachers), '', { fn: (r) => r.role === 'teacher' && r.signedUpAt }], ['anPaidOrders', anNum(o.paidOrders), '', { detail: 'orders', fn: (r) => r.status === 'paid' && anInRange(r.created_at) }],
      ['anBots', anNum(d.bots ? d.bots.total : 0), '', { scroll: 'bots' }],
    ])}${vv.since ? `<p class="admin-empty-note">${escapeHtml(t('anVisitorsSince', { day: vv.since }))}</p>` : ''}${anChart(d.daily, d.from, d.to)}
    <div class="an-grid">
      ${anTable('comeback', 'anComeBack', [['anColDaysVisited', 'days'], ['anColVisitors', 'visitors', anNum]], vv.comeBack.filter(r => r.visitors), 'anComeBackNote')}
      ${anTable('bots', 'anBotsTable', [['anColReason', 'reason', (v) => t('anBot_' + v)], ['anColCount', 'n', anNum]], d.bots ? d.bots.byReason : [], 'anBotsNote')}
    </div>
    ${d.signups ? `<div class="an-block"><h3>${escapeHtml(t('anSignupTitle'))}</h3>${anCards([
      ['anSignupParents', anNum(d.signups.parents), '', { fn: (r) => r.role === 'parent' && r.signedUpAt }], ['anSignupKnown', anNum(d.signups.knownBefore), '', { fn: (r) => r.role === 'parent' && r.signedUpAt && r.visitsBeforeSignIn > 0 }],
      ['anSignupVisits', String(d.signups.avgVisitsBefore)], ['anSignupDays', String(d.signups.avgDaysBefore)],
    ])}<p class="admin-empty-note">${escapeHtml(t('anSignupNote'))}</p></div>` : ''}</div>`;
    html += `<div class="admin-card"><h2>${escapeHtml(t('anWho'))}</h2>${anCards([
      ['anTotParents', anNum(d.totals.parents), '', { detail: 'parents' }], ['anTotChildren', anNum(d.totals.children), '', { detail: 'children' }], ['anTotTeachers', anNum(d.totals.teachers), '', { detail: 'teachers' }], ['anTotClub', anNum(d.totals.clubMembers), '', { detail: 'club' }],
    ])}<div class="an-grid">
      ${anTable('role', 'anByRole', [['anColWho', 'role', role], ['anVisits', 'visits', anNum], ['anMinutes', 'minutes', anNum], ['anColAccounts', 'accounts', anNum]], d.byRole)}
      ${anTable('device', 'anByDevice', [['anColDevice', 'device', (v) => t('anDev_' + v)], ['anVisits', 'visits', anNum], ['anMinutes', 'minutes', anNum]], d.byDevice)}
      ${anTable('lang', 'anByLang', [['anColLang', 'lang', (v) => (v === 'nl' ? 'Nederlands' : 'English')], ['anVisits', 'visits', anNum], ['anMinutes', 'minutes', anNum]], d.byLang)}
      ${anTable('ref', 'anReferrers', [['anColSite', 'ref'], ['anVisits', 'visits', anNum]], d.referrers)}
    </div></div>`;
    html += `<div class="admin-card"><h2>${escapeHtml(t('anPages'))}</h2>${anTable('pages', 'anPagesTable', [['anColPage', 'page', pageName], ['anPageViews', 'views', anNum], ['anVisits', 'visits', anNum], ['anMinutes', 'minutes', anNum], ['anColAvg', 'avgMinutes', (v) => `${v} min`]], d.pages)}</div>`;
    html += `<div class="admin-card"><h2>${escapeHtml(t('anCompanion'))}</h2>${anCards([
      ['anCompVisits', anNum(c.companion.visits), t('anFamilies', { n: c.companion.accounts || 0 }), { fn: (r) => r.pagesSeen.includes('/companion.html'), sort: 'companionMinutes' }], ['anCompTime', anMin(c.companion.minutes), '', { fn: (r) => r.pagesSeen.includes('/companion.html'), sort: 'companionMinutes' }],
      ['anPicVisits', anNum(c.pictures.visits), '', { fn: (r) => r.pagesSeen.includes('/pictures.html'), sort: 'companionMinutes' }], ['anPicTime', anMin(c.pictures.minutes), '', { fn: (r) => r.pagesSeen.includes('/pictures.html'), sort: 'companionMinutes' }],
      ['anRatings', anNum(c.ratings && c.ratings.n), c.ratings && c.ratings.n ? t('anAvgStars', { n: c.ratings.avg }) : '', { fn: (r) => r.events.rate_book }], ['anMessages', anNum(c.messages), '', { fn: (r) => r.events.mare_message || r.events.write_sent }],
    ])}<div class="an-grid">
      ${anTable('chapters', 'anPerChapter', [['anColChapter', 'chapter'], ['anColSteps', 'stepViews', anNum], ['anColSpots', 'spotsOpened', anNum], ['anColQuizRight', 'quizRight', anNum], ['anColQuizWrong', 'quizWrong', anNum], ['anColVidStart', 'videosStarted', anNum], ['anColVidEnd', 'videosFinished', anNum], ['anColWrites', 'writes', anNum]], c.perChapter)}
      ${anTable('kinds', 'anSpotKinds', [['anColKind', 'kind', (v) => t('adminSpotType_' + v)], ['anColOpened', 'opened', anNum]], c.spotKinds)}
      ${anTable('reading', 'anReadingNow', [['anColChapter', 'chapter', (v) => (Number(v) ? String(v) : t('anNotStarted'))], ['anColParents', 'parents', anNum]], c.readingNow, 'anReadingNowNote')}
    </div></div>`;
    html += `<div class="admin-card"><h2>${escapeHtml(t('anTalk'))}</h2>${anCards([
      ['anTalkSessions', anNum(d.talk.sessions), '', { detail: 'talk', fn: (r) => anInRange(r.started_at) }], ['anTalkFamilies', anNum(d.talk.families), '', { fn: (r) => r.talk > 0 }], ['anTalkMinutes', anMin(d.talk.minutes), '', { detail: 'talk', fn: (r) => anInRange(r.started_at) }], ['anTalkTurns', String(d.talk.avgTurns || 0), '', { detail: 'talk', fn: (r) => anInRange(r.started_at) }], ['anTalkPictures', anNum(d.talk.inPictures), '', { fn: (r) => r.events.picture_talk }],
    ])}${anTable('talkage', 'anTalkAge', [['anColAge', 'ageBand'], ['anTalkSessions', 'sessions', anNum]], d.talk.byAge)}</div>`;
    html += `<div class="admin-card"><h2>${escapeHtml(t('anClub'))}</h2>${anCards([
      ['anClubMembers', anNum(d.club.membersTotal), t('anNewN', { n: d.club.newMembers }), { detail: 'club' }], ['anClubVisits', anNum(d.club.clubVisits.visits), anMin(d.club.clubVisits.minutes), { fn: (r) => r.pagesSeen.includes('/club-mare.html') }],
      ['anForestVisits', anNum(d.club.forestVisits.visits), '', { fn: (r) => r.pagesSeen.includes('/forest.html') }], ['anRiddleVisits', anNum(d.club.riddleVisits.visits), '', { fn: (r) => r.pagesSeen.includes('/riddle.html') }],
    ])}${anTable('subs', 'anSubmissions', [['anColKind', 'kind', (v) => t('anKind_' + (v || 'other'))], ['anColCount', 'n', anNum]], d.club.submissions)}</div>`;
    const s = d.shop;
    html += `<div class="admin-card"><h2>${escapeHtml(t('anShop'))}</h2>${anCards([
      ['anShopVisits', anNum(s.visits), '', { fn: (r) => r.pagesSeen.includes('/merchandise.html') }], ['anAddToCart', anNum(s.addToCart), '', { fn: (r) => r.events.add_to_cart }], ['anCheckouts', anNum(s.checkoutsStarted), '', { detail: 'orders', fn: (r) => anInRange(r.created_at) }], ['anPaid', anNum(s.paid), '', { detail: 'orders', fn: (r) => r.status === 'paid' && anInRange(r.created_at) }],
      ...(s.revenueCents != null ? [['anRevenue', money(s.revenueCents), '', { detail: 'orders', fn: (r) => r.status === 'paid' && anInRange(r.created_at) }]] : []),
    ])}${s.topProducts ? anTable('products', 'anTopProducts', [['anColProduct', 'product'], ['anColQty', 'qty', anNum], ['anColSales', 'cents', money]], s.topProducts) : ''}</div>`;
    html += `<div class="admin-card"><h2>${escapeHtml(t('anTeachers'))}</h2>${anCards([['anTotTeachers', anNum(d.teachers.total), '', { detail: 'teachers' }], ['anActiveTeachers', anNum(d.teachers.active), '', { fn: (r) => r.role === 'teacher' && r.visits > 0 }]])}
      ${anTable('resources', 'anResourceOpens', [['anColResource', 'resource'], ['anColOpens', 'opens', anNum]], d.teachers.resourceOpens)}</div>`;
    html += `<p class="admin-empty-note an-privacy">${escapeHtml(t('anPrivacy'))}</p>`;
    out.innerHTML = html;
    out.querySelectorAll('.an-card[data-act]').forEach(b => b.addEventListener('click', () => anRunAction(anActions[Number(b.dataset.act)])));
    out.querySelectorAll('.an-csv').forEach(b => b.addEventListener('click', () => {
      const table = out.querySelector(`table[data-csv="${b.dataset.id}"]`);
      const csv = [...table.rows].map(r => [...r.cells].map(c => `"${c.textContent.replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
      a.download = `mare-${b.dataset.id}-${d.from}-${d.to}.csv`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }));
  }


  // ── Mare App 6 (v79) — People: one row per signed-in person ──
  const anPeople = { rows: [], q: '', role: '', size: 20, page: 1, sort: 'minutes', dir: -1, names: false };
  // v80 — by visitor ID; name, email and children/school only with "Show names"
  const PEOPLE_NAME_COLS = [['anColName', 'name'], ['anColEmail', 'email'], ['anColDetail', 'detail']];
  const PEOPLE_BASE_COLS = [
    ['anColVisitorId', 'visitorId', (v, r) => (v ? v + (r.otherIds ? ` ${t('anOtherIds', { n: r.otherIds })}` : '') : '–')], ['anColWho', 'role', (v) => t('anRole_' + v)],
    ['anColDays', 'days', (v) => anNum(v)], ['anVisits', 'visits', (v) => anNum(v)], ['anColBeforeSignIn', 'visitsBeforeSignIn', (v, r) => (r.role === 'visitor' ? '' : anNum(v))],
    ['anPageViews', 'pages', (v) => anNum(v)], ['anTimeOnline', 'minutes', (v) => anMin(v)],
    ['anColCompanionTime', 'companionMinutes', (v) => anMin(v)], ['anColTopPage', 'topPage', (v) => (v ? pageName(v) : '')],
    ['anColFirst', 'firstSeen', (v) => anWhen(v)], ['anColLast', 'lastSeen', (v) => anWhen(v)],
  ];
  let PEOPLE_COLS = PEOPLE_BASE_COLS;
  const anWhen = (iso) => { if (!iso) return ''; const d = new Date(iso); return d.toLocaleString(window.MareI18n.locale === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  function anPeopleFiltered() {
    const q = anPeople.q.toLowerCase();
    // without a box's filter: people who visited (others show only under their own box)
    const f = anPeople.filter ? anPeople.filter.fn : (anPeople.mode === 'detail' ? null : (r) => r.visits > 0);
    const text = (r) => (anPeople.mode === 'detail' ? PEOPLE_COLS.map(c => c[2] ? c[2](r[c[1]], r) : r[c[1]]) : [r.visitorId, r.name, r.email, r.detail]);
    let rows = anPeople.rows.filter(r => (anPeople.mode === 'detail' || !anPeople.role || r.role === anPeople.role)
      && (!f || f(r))
      && (!q || text(r).some(x => String(x || '').toLowerCase().includes(q))));
    const k = anPeople.sort, dir = anPeople.dir;
    if (!k) return rows;
    const col = k.startsWith('_') ? PEOPLE_COLS.find(c => c[1] === k) : null;
    const val = (r) => (col ? col[2](null, r) : r[k]);
    rows = rows.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      if (typeof x === 'number' || typeof y === 'number') return ((Number(x) || 0) - (Number(y) || 0)) * dir;
      return String(x || '').localeCompare(String(y || '')) * dir;
    });
    return rows;
  }
  function anPeopleRender() {
    const rows = anPeopleFiltered();
    const size = anPeople.size || rows.length || 1;
    const pages = Math.max(1, Math.ceil(rows.length / size));
    anPeople.page = Math.min(Math.max(1, anPeople.page), pages);
    const shown = anPeople.size ? rows.slice((anPeople.page - 1) * size, anPeople.page * size) : rows;
    const head = PEOPLE_COLS.map(c => `<th><button type="button" class="an-sort${anPeople.sort === c[1] ? ' on' : ''}" data-k="${c[1]}" data-no-busy>${escapeHtml(t(c[0]))}${anPeople.sort === c[1] ? (anPeople.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`).join('');
    const body = shown.length ? shown.map(r => `<tr>${PEOPLE_COLS.map(c => `<td${c[1] === 'visitorId' ? ' class="an-vid"' : ''}>${escapeHtml(c[2] ? c[2](r[c[1]], r) : String(r[c[1]] == null ? '' : r[c[1]]))}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${PEOPLE_COLS.length}" class="admin-empty-note">${escapeHtml(t('anNone'))}</td></tr>`;
    document.getElementById('an-people-table').innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
    const from = rows.length ? (anPeople.size ? (anPeople.page - 1) * size + 1 : 1) : 0;
    const to = anPeople.size ? Math.min(anPeople.page * size, rows.length) : rows.length;
    document.getElementById('an-people-pager').innerHTML = `<span>${escapeHtml(t('anShowing', { from, to, total: rows.length }))}</span>
      ${pages > 1 ? `<button type="button" class="btn-ghost btn-small" data-go="${anPeople.page - 1}" data-no-busy ${anPeople.page === 1 ? 'disabled' : ''}>‹ ${escapeHtml(t('anPrev'))}</button>
      <span>${escapeHtml(t('anPageOf', { n: anPeople.page, total: pages }))}</span>
      <button type="button" class="btn-ghost btn-small" data-go="${anPeople.page + 1}" data-no-busy ${anPeople.page === pages ? 'disabled' : ''}>${escapeHtml(t('anNext'))} ›</button>` : ''}`;
    document.querySelectorAll('#an-people-pager [data-go]').forEach(b => b.addEventListener('click', () => { anPeople.page = Number(b.dataset.go); anPeopleRender(); }));
    document.querySelectorAll('#an-people-table .an-sort').forEach(b => b.addEventListener('click', () => {
      if (anPeople.sort === b.dataset.k) anPeople.dir = -anPeople.dir; else { anPeople.sort = b.dataset.k; anPeople.dir = ['name', 'email', 'role', 'detail', 'topPage', 'visitorId'].includes(b.dataset.k) ? 1 : -1; }
      anPeopleRender();
    }));
  }
  // the "Showing: …" line with a way back to everyone
  function anFilterLine() {
    const el = document.getElementById('an-people-filter');
    const f = anPeople.filter;
    el.hidden = !f || anPeople.mode === 'detail';
    if (el.hidden) return;
    el.innerHTML = `${escapeHtml(t('anShowingOnly'))} <b>${escapeHtml(f.label)}</b> <button type="button" class="btn-ghost btn-small" data-no-busy>✕ ${escapeHtml(t('anShowEveryone'))}</button>`;
    el.querySelector('button').addEventListener('click', () => { anPeople.filter = null; anPeople.page = 1; document.getElementById('an-people-title').textContent = t('anPeopleTitle'); anFilterLine(); anPeopleRender(); });
  }
  function anPeopleMode(detail) {
    anPeople.mode = detail ? 'detail' : 'people';
    ['an-people-role', 'an-people-names-wrap', 'an-people-anon'].forEach(id => { document.getElementById(id).hidden = detail; });
  }
  // v80 — accounts, children, Club members, Talk to Mare or orders behind a box
  async function openDetail(kind, label, fn) {
    document.getElementById('an-out').hidden = true;
    document.getElementById('an-people').hidden = false;
    anPeopleMode(true);
    const def = STAT_COLUMNS[kind];
    PEOPLE_COLS = def.cols.map((c, i) => [c[0], '_' + i, (v, r) => c[1](r)]);
    anPeople.filter = fn ? { label, fn } : null; anPeople.sort = ''; anPeople.q = ''; anPeople.page = 1;
    document.getElementById('an-people-q').value = '';
    document.getElementById('an-people-title').textContent = label;
    document.getElementById('an-people-sub').textContent = fn ? t('anPeopleSubDetail', { from: anRange.from, to: anRange.to }) : t('anAllTime');
    document.getElementById('an-people-table').innerHTML = `<tbody><tr><td class="admin-empty-note">${escapeHtml(t('adminLoading'))}</td></tr></tbody>`;
    try { anPeople.rows = (await api(`/api/admin/report/detail/${kind}`)).rows || []; }
    catch (e) { document.getElementById('an-people-table').innerHTML = `<tbody><tr><td class="form-error">${escapeHtml(e.message || t('errorGeneric'))}</td></tr></tbody>`; return; }
    anPeople.data = { from: anRange.from, to: anRange.to, kind };
    anFilterLine(); anPeopleRender();
    document.getElementById('an-people').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function openPeople(opts) {
    if (!opts || opts instanceof Event) opts = {};
    document.getElementById('an-out').hidden = true;
    document.getElementById('an-people').hidden = false;
    anPeopleMode(false);
    if (opts.fn !== undefined || opts.label) { anPeople.filter = opts.fn ? { label: opts.label, fn: opts.fn } : null; anPeople.role = ''; anPeople.q = ''; document.getElementById('an-people-q').value = ''; }
    if (opts.sort) { anPeople.sort = opts.sort; anPeople.dir = -1; } else if (!anPeople.sort || anPeople.sort.startsWith('_')) { anPeople.sort = 'minutes'; anPeople.dir = -1; }
    document.getElementById('an-people-title').textContent = anPeople.filter ? anPeople.filter.label : t('anPeopleTitle');
    document.getElementById('an-people-table').innerHTML = `<tbody><tr><td class="admin-empty-note">${escapeHtml(t('adminLoading'))}</td></tr></tbody>`;
    const from = document.getElementById('an-from').value, to = document.getElementById('an-to').value;
    const staff = document.getElementById('an-staff').checked ? '1' : '0';
    if (staff !== '1' && anPeople.role === 'staff') anPeople.role = '';
    document.getElementById('an-people-q').placeholder = t('anPeopleSearch');
    let d;
    anPeople.names = document.getElementById('an-people-names').checked;
    PEOPLE_COLS = anPeople.names ? [PEOPLE_BASE_COLS[0], ...PEOPLE_NAME_COLS, ...PEOPLE_BASE_COLS.slice(1)] : PEOPLE_BASE_COLS;
    try { d = await api(`/api/admin/analytics/people?from=${from}&to=${to}&staff=${staff}&names=${anPeople.names ? 1 : 0}`); }
    catch (e) { document.getElementById('an-people-table').innerHTML = `<tbody><tr><td class="form-error">${escapeHtml(e.message || t('errorGeneric'))}</td></tr></tbody>`; return; }
    anPeople.rows = d.people;
    anPeople.page = 1;
    anPeople.data = d;
    document.getElementById('an-people-sub').textContent = t('anPeopleSub', { from: d.from, to: d.to });
    anFilterLine();
    document.getElementById('an-people-anon').textContent = d.olderVisits ? t('anOlderVisits', { n: anNum(d.olderVisits) }) : '';
    document.getElementById('an-people-role').value = anPeople.role;
    document.querySelector('#an-people-role option[value="staff"]').hidden = staff !== '1';
    anPeopleRender();
    document.getElementById('an-people').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closePeople() {
    document.getElementById('an-people').hidden = true;
    document.getElementById('an-out').hidden = false;
  }
  if (document.getElementById('an-people-btn')) {
    document.getElementById('an-people-btn').addEventListener('click', () => openPeople({ fn: null, label: '' }));
    document.getElementById('an-people-back').addEventListener('click', closePeople);
    document.getElementById('an-people-q').addEventListener('input', (e) => { anPeople.q = e.target.value.trim(); anPeople.page = 1; anPeopleRender(); });
    document.getElementById('an-people-role').addEventListener('change', (e) => { anPeople.role = e.target.value; anPeople.page = 1; anPeopleRender(); });
    document.getElementById('an-people-size').addEventListener('change', (e) => { anPeople.size = Number(e.target.value); anPeople.page = 1; anPeopleRender(); });
    document.getElementById('an-people-names').addEventListener('change', () => openPeople({})); // v80: names fetched only when asked
    // CSV: every row that matches the search and filter, not just this page; plain numbers
    document.getElementById('an-people-csv').addEventListener('click', () => {
      const rows = anPeopleFiltered();
      const cols = anPeople.mode === 'detail' ? PEOPLE_COLS : [['anColVisitorId', 'visitorId'], ['anCsvOtherIds', 'otherIds'], ...(anPeople.names ? PEOPLE_NAME_COLS : []), ['anColWho', 'role', (v) => t('anRole_' + v)],
        ['anColDays', 'days'], ['anVisits', 'visits'], ['anColBeforeSignIn', 'visitsBeforeSignIn'], ['anPageViews', 'pages'], ['anCsvMinutes', 'minutes'], ['anCsvCompanionMinutes', 'companionMinutes'],
        ['anColTopPage', 'topPage', (v) => (v ? pageName(v) : '')], ['anColFirst', 'firstSeen'], ['anColLast', 'lastSeen']];
      const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const csv = [cols.map(c => cell(t(c[0]))).join(','), ...rows.map(r => cols.map(c => cell(c[2] ? c[2](r[c[1]], r) : r[c[1]])).join(','))].join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
      a.download = `mare-${anPeople.mode === 'detail' ? anPeople.data.kind : 'people'}-${anPeople.data ? anPeople.data.from : ''}-${anPeople.data ? anPeople.data.to : ''}.csv`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }

  // ── Teacher resources ──
  // Kinds that are an uploaded file (the rest — tool, link — are a URL).
  const RESOURCE_FILE_TYPES = {
    document: { label: 'adminFieldDocumentFile', accept: '' },
    video: { label: 'adminFieldVideoFile', accept: 'video/mp4,.mp4' },
    audio: { label: 'adminFieldAudioFile', accept: 'audio/*,.mp3,.m4a,.wav' },
    ebook: { label: 'adminFieldEbookFile', accept: '.epub,.pdf,.mobi,.azw3,application/epub+zip,application/pdf' },
  };
  const RESOURCE_LABEL = { document: 'resourceCategoryDocument', tool: 'resourceCategoryTool', link: 'resourceCategoryLink', video: 'resourceCategoryVideo', audio: 'resourceCategoryAudio', ebook: 'resourceCategoryEbook' };
  function setupResourceForm() {
    const categorySelect = document.getElementById('r-category');
    // Show the file picker for Document, the URL box for Tool/Link.
    // Run once at setup too: the form opens on Document, and the HTML's
    // starting state (URL shown, file hidden) used to stay wrong until
    // the type was changed and changed back.
    // Mare App 6 (v77) — video, audio and ebook are uploaded files too.
    function syncResourceFields() {
      const f = RESOURCE_FILE_TYPES[categorySelect.value];
      document.getElementById('r-file-field').hidden = !f;
      document.getElementById('r-url-field').hidden = !!f;
      if (f) {
        document.getElementById('r-file-label').textContent = t(f.label);
        document.getElementById('r-file').accept = f.accept;
      }
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
        if (RESOURCE_FILE_TYPES[category]) {
          const fileInput = document.getElementById('r-file');
          if (!fileInput.files[0]) throw new Error(t('adminErrorChooseFile'));
          if (category === 'video' && !/\.mp4$/i.test(fileInput.files[0].name)) throw new Error(t('adminVidMp4Only'));
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
          <td>${escapeHtml(t(RESOURCE_LABEL[r.category] || 'resourceCategoryDocument'))}</td>
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

  const PAGE_STATUS_KEY = { live: 'pageStatusLive', planned: 'pageStatusPlanned', stub: 'pageStatusStub', removed: 'pageStatusRemoved' };
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

  // ── Marketing: generate social posts (v83: Dutch rules, audience, theme) ──
  function setupMarketingGenerator() {
    document.getElementById('marketing-generate-btn').addEventListener('click', async () => {
      clearError('marketing-error');
      const source = document.getElementById('mkt-source').value.trim();
      const theme = document.getElementById('mkt-theme').value.trim();
      const platforms = Array.from(document.querySelectorAll('.mkt-platform:checked')).map(el => el.value);
      const resultsEl = document.getElementById('marketing-results');
      if (!source && !theme) { showError('marketing-error', t('socGenNeedSource')); throw new Error('source'); }
      if (!platforms.length) { showError('marketing-error', t('adminErrorPlatformRequired')); throw new Error('platform'); }
      resultsEl.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminGenerating'))}</p>`;
      try {
        const data = await api('/api/admin/social/generate', { method: 'POST', body: JSON.stringify({ sourceText: source, theme, platforms, audience: document.getElementById('mkt-audience').value, lang: document.getElementById('mkt-lang').value }) });
        renderMarketingResults(resultsEl, data.results);
        loadMarketingHistory();
      } catch (err) {
        resultsEl.innerHTML = '';
        showError('marketing-error', err.message || t('adminErrorGenerateFailed'));
        throw err;
      }
    });
  }
  function renderGenPlatforms() {
    if (!document.querySelector('#mkt-media .mkt-slot *')) mktSlots(); // v88
    const box = document.getElementById('mkt-platforms'); if (!box || !socState) return;
    const was = new Set(Array.from(box.querySelectorAll('.mkt-platform:checked')).map(i => i.value));
    const first = !box.children.length;
    box.innerHTML = socState.platforms.map(p => `<label class="mkt-platform-check"><input type="checkbox" class="mkt-platform" value="${escapeHtml(p)}" ${(first ? ['instagram', 'facebook'].includes(p) : was.has(p)) ? 'checked' : ''}> ${escapeHtml(socLabel(p))}</label>`).join('');
  }

  // v84: posts carry {{LINK}}; show it as the page it will become
  function withLink(text, audience) {
    const html = escapeHtml(text || '');
    const full = socState && socState.postLinksFull && (socState.postLinksFull[audience] || socState.postLinksFull.any);
    return full ? html.split('{{LINK}}').join(`<span class="soc-link" title="${escapeHtml(t('socLinkTokenTip'))}">${escapeHtml(full)}</span>`) : html;
  }
  // v93 — the hashtag sets, one per audience
  function renderHashtags() {
    const box = document.getElementById('soc-hashtags'); if (!box || !socState) return;
    const hs = socState.hashtags || {}, dis = socIsAdmin() ? '' : 'disabled';
    box.innerHTML = SOC_AUD.map(a => `<div class="soc-row"><span class="soc-p">${escapeHtml(audLabel(a))}</span><input type="text" data-aud="${a}" value="${escapeHtml(hs[a] || '')}" ${dis}></div>`).join('');
  }
  // v93 — Instagram, Pinterest and TikTok can't post text alone: say so, and offer to add a picture or video
  function socMediaPopup(platform, { onAdd, onDraft } = {}) {
    const old = document.getElementById('soc-media-pop'); if (old) old.remove();
    const bd = document.createElement('div');
    bd.className = 'admin-modal-backdrop'; bd.id = 'soc-media-pop';
    bd.innerHTML = `<div class="admin-modal-card soc-media-pop" role="dialog" aria-modal="true">
      <h3>📷 ${escapeHtml(t('socMediaPopTitle', { p: socLabel(platform) }))}</h3>
      <p>${escapeHtml(t('socMediaPopBody', { p: socLabel(platform) }))}</p>
      <div class="admin-modal-btns">
        ${onDraft ? `<button type="button" class="btn-ghost" data-a="draft" data-no-busy>${escapeHtml(t('socMediaPopDraft'))}</button>` : ''}
        <button type="button" class="btn-primary" data-a="add" data-no-busy>${escapeHtml(t('socMediaPopAdd'))}</button>
      </div></div>`;
    document.body.appendChild(bd);
    bd.querySelector('[data-a="add"]').addEventListener('click', () => { bd.remove(); if (onAdd) onAdd(); });
    const dr = bd.querySelector('[data-a="draft"]');
    if (dr) dr.addEventListener('click', () => { bd.remove(); onDraft(); });
    bd.addEventListener('click', (e) => { if (e.target === bd) bd.remove(); });
  }
  const socNeedsMedia = (p) => ((socState && socState.needsMedia) || []).includes(p);
  function renderPostLinks() {
    const box = document.getElementById('soc-post-links'); if (!box || !socState) return;
    const pl = socState.postLinks || {}, dis = socIsAdmin() ? '' : 'disabled';
    box.innerHTML = SOC_AUD.map(a => `<div class="soc-row"><span class="soc-p">${escapeHtml(audLabel(a))}</span><input type="text" data-aud="${a}" value="${escapeHtml(pl[a] || '')}" ${dis}>
      <a href="${escapeHtml(socState.postLinksFull[a] || '#')}" target="_blank" rel="noopener" class="soc-open">${escapeHtml(t('socOpenPage'))}</a></div>`).join('');
  }

  // notes on a post: picture to attach, carousel slides, anything to check
  function socNotesHtml(n) {
    if (!n || typeof n !== 'object') return '';
    const parts = [];
    if (n.warnings && n.warnings.length) parts.push(`<div class="soc-note-warn">⚠ ${n.warnings.map(escapeHtml).join('<br>⚠ ')}</div>`);
    if (n.picture) parts.push(`<div><b>${escapeHtml(t('socNotePicture'))}</b> ${escapeHtml(n.picture)}</div>`);
    if (n.slides && n.slides.length) parts.push(`<div><b>${escapeHtml(t('socNoteSlides'))}</b><ol>${n.slides.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ol></div>`);
    return parts.join('');
  }
  // results: { platform: string (old history) | { content, firstComment, title, notes, audience } | { error } }

  // ── v88: upload a picture or video for social posts (shared by the post
  // window and the Generate card). Pictures are saved as JPG (TikTok takes
  // no PNG), so one picture works everywhere. Returns { key, type, url }.
  async function socUploadFile(file) {
    const isVid = (file.type || '').startsWith('video/') || /\.mp4$/i.test(file.name);
    if (isVid && !/\.mp4$/i.test(file.name)) throw new Error(t('adminVidMp4Only'));
    if (!isVid && !/^image\/(jpeg|webp)$/.test(file.type || '')) {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error(t('socPictureUnreadable'))); i.src = url; });
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
        const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.92));
        file = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
      } finally { URL.revokeObjectURL(url); }
    }
    const type = isVid ? 'video/mp4' : (file.type || 'image/jpeg');
    const key = `social/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)}`;
    const { url } = await api('/api/admin/upload-url', { method: 'POST', body: JSON.stringify({ key, contentType: type }) });
    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': type }, body: file });
    if (!put.ok) throw new Error(t('adminErrorUploadFailed'));
    return { key, type: isVid ? 'video' : 'image', url: URL.createObjectURL(file) };
  }

  // the batch's picture and video, and which one each generated post uses
  const mktMedia = { image: null, video: null };
  const MKT_VIDEO_FIRST = new Set(['tiktok', 'instagram']);
  function mktDefault(platform) {
    const order = MKT_VIDEO_FIRST.has(platform) ? ['video', 'image'] : ['image', 'video'];
    return order.find(k => mktMedia[k]) || 'none';
  }
  function mktSlots() {
    document.querySelectorAll('#mkt-media .mkt-slot').forEach(slot => {
      const kind = slot.dataset.kind, m = mktMedia[kind];
      slot.innerHTML = m
        ? `${kind === 'video' ? `<video src="${escapeHtml(m.url)}" muted controls preload="metadata"></video>` : `<img src="${escapeHtml(m.url)}" alt="">`}
           <button type="button" class="btn-ghost btn-small" data-rm data-no-busy>${escapeHtml(t('socRemoveMedia'))}</button>`
        : `<label class="btn-ghost btn-small soc-upload"><span>${escapeHtml(t(kind === 'video' ? 'mktAddVideo' : 'mktAddPicture'))}</span>
           <input type="file" accept="${kind === 'video' ? 'video/mp4,.mp4' : 'image/*'}" hidden></label>`;
      const rm = slot.querySelector('[data-rm]');
      if (rm) rm.addEventListener('click', () => { mktMedia[kind] = null; mktSlots(); mktRefreshCards(); });
      const inp = slot.querySelector('input[type=file]');
      if (inp) inp.addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        slot.innerHTML = `<span class="soc-spin"></span> ${escapeHtml(t('adminUploading'))}`;
        try {
          const m2 = await socUploadFile(file);
          if (m2.type !== kind) throw new Error(t(kind === 'video' ? 'mktNotVideo' : 'mktNotPicture'));
          mktMedia[kind] = m2;
        } catch (err) { alert(err.message || t('errorGeneric')); }
        mktSlots(); mktRefreshCards();
      });
    });
  }
  // after the picture/video changes: every post's choice (kept where it still exists)
  function mktRefreshCards() {
    document.querySelectorAll('.mkt-result-card[data-platform]').forEach(card => {
      const sel = card.querySelector('.mkt-media-pick'); if (!sel) return;
      let v = card.dataset.picked === '1' ? sel.value : mktDefault(card.dataset.platform);
      if (v !== 'none' && !mktMedia[v]) v = mktDefault(card.dataset.platform);
      sel.innerHTML = ['image', 'video', 'none'].filter(k => k === 'none' || mktMedia[k])
        .map(k => `<option value="${k}">${escapeHtml(t(k === 'image' ? 'mktMediaPicture' : k === 'video' ? 'mktMediaVideo' : 'mktMediaNone'))}</option>`).join('');
      sel.value = v;
      mktCardState(card);
    });
  }
  function mktCardState(card) {
    const p = card.dataset.platform, v = card.querySelector('.mkt-media-pick').value;
    const needs = ((socState && socState.needsMedia) || []).includes(p);
    const warn = card.querySelector('.mkt-media-warn');
    warn.textContent = needs && v === 'none' ? t('mktNeedsMedia', { p: socLabel(p) }) : '';
    warn.hidden = !warn.textContent;
    const pub = card.querySelector('[data-publish]');
    if (pub) pub.hidden = needs && v === 'none';
  }
  // what a generated post sends, with the chosen picture/video
  function mktMediaFor(card) {
    const sel = card && card.querySelector('.mkt-media-pick');
    const m = sel && sel.value !== 'none' ? mktMedia[sel.value] : null;
    return m ? { mediaKey: m.key, mediaType: m.type, aiMedia: document.getElementById('mkt-ai').checked } : { mediaKey: null, mediaType: null, aiMedia: false };
  }

  function renderMarketingResults(container, results, opts) {
    container.innerHTML = '';
    Object.keys(results || {}).forEach(platform => {
      const raw = results[platform];
      const r = typeof raw === 'string' ? { content: raw } : (raw || {});
      const card = document.createElement('div');
      card.className = 'mkt-result-card';
      card.dataset.platform = platform;
      const header = document.createElement('div');
      header.className = 'mkt-result-platform';
      const lab = document.createElement('span');
      lab.textContent = socLabel(platform) + (r.audience && r.audience !== 'any' ? ` · ${t('socAud' + r.audience[0].toUpperCase() + r.audience.slice(1))}` : '');
      header.appendChild(lab);
      card.appendChild(header);
      if (r.error) { const e = document.createElement('p'); e.className = 'form-error'; e.textContent = r.error; card.appendChild(e); container.appendChild(card); return; }
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn-ghost btn-sm';
      copyBtn.setAttribute('data-no-busy', '');
      copyBtn.textContent = t('adminCopy');
      copyBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(r.content); copyBtn.textContent = t('adminCopied'); setTimeout(() => { copyBtn.textContent = t('adminCopy'); }, 1800); } catch { /* text is still visible */ }
      });
      header.appendChild(copyBtn);
      const post = { platform, content: r.content, first_comment: r.firstComment || '', title: r.title || '', audience: r.audience || 'any', notes: r.notes || null };
      const body = { platform, content: r.content, firstComment: r.firstComment || '', title: r.title || '', audience: r.audience || 'any', notes: r.notes || null };
      card._body = body;
      const mk = (key, cls, fn, noBusy) => { const b = document.createElement('button'); b.type = 'button'; b.className = `${cls} btn-sm`; b.textContent = t(key); if (noBusy) b.setAttribute('data-no-busy', ''); b.addEventListener('click', fn); header.appendChild(b); return b; };
      // v88: Picture / Video / None for this post, from the batch's uploads
      const pick = document.createElement('select');
      pick.className = 'mkt-media-pick';
      pick.setAttribute('aria-label', t('mktMediaFor', { p: socLabel(platform) }));
      pick.addEventListener('change', () => { card.dataset.picked = '1'; mktCardState(card); });
      header.appendChild(pick);
      mk('socEditFirst', 'btn-ghost', () => {
        const m = mktMediaFor(card), u = m.mediaKey ? mktMedia[m.mediaType] : null;
        openSocialPost({ ...post, media_key: m.mediaKey, media_type: m.mediaType, ai_media: m.aiMedia ? 1 : 0, mediaUrl: u && u.url });
      }, true);
      mk('socAddToQueue', 'btn-ghost', async () => {
        if (socNeedsMedia(platform) && card.querySelector('.mkt-media-pick').value === 'none') { // v93
          return socMediaPopup(platform, { onAdd: () => { const inp = document.querySelector('#mkt-media .mkt-slot[data-kind=image] input'); document.getElementById('mkt-media').scrollIntoView({ behavior: 'smooth', block: 'center' }); if (inp) inp.click(); } });
        }
        try { const d = await api('/api/admin/social/queue', { method: 'POST', body: JSON.stringify({ ...body, ...mktMediaFor(card), scheduledFor: 'next' }) }); socNote(t('socQueuedFor', { when: socWhen(d.scheduledFor) })); card.classList.add('mkt-done'); }
        catch (e) { alert(e.message); throw e; } finally { loadSocialQueue(); }
      });
      mk('socPublishNow', 'btn-primary', async () => {
        if (!confirm(t('socPublishConfirm', { p: socLabel(platform) }))) return;
        try { await api('/api/admin/social/publish', { method: 'POST', body: JSON.stringify({ ...body, ...mktMediaFor(card) }) }); card.classList.add('mkt-done'); } catch (e) { alert(e.message); throw e; } finally { loadSocialQueue(); }
      }).setAttribute('data-publish', '');
      // v86: throw a generated post away (Past posts keeps the batch until deleted there)
      if (!(opts && opts.history)) mk('socDiscard', 'btn-ghost', () => { card.remove(); if (!container.querySelector('.mkt-result-card')) container.innerHTML = ''; }, true);
      if (r.title) { const ti = document.createElement('div'); ti.className = 'mkt-result-title'; ti.textContent = r.title; card.appendChild(ti); }
      const text = document.createElement('div');
      text.className = 'mkt-result-text';
      text.innerHTML = withLink(r.content, r.audience || 'any');
      card.appendChild(text);
      if (r.firstComment) { const fc = document.createElement('div'); fc.className = 'soc-fc'; fc.innerHTML = `<b>${escapeHtml(t('socFirstCommentShort'))}</b> ${withLink(r.firstComment, r.audience || 'any')}`; card.appendChild(fc); }
      const notes = socNotesHtml(r.notes);
      if (notes) { const n = document.createElement('div'); n.className = 'soc-notes'; n.innerHTML = notes; card.appendChild(n); }
      const warn = document.createElement('p'); warn.className = 'form-error mkt-media-warn'; warn.hidden = true; card.appendChild(warn);
      container.appendChild(card);
    });
    mktRefreshCards();
    // v88: add every post in this batch to the queue in one go, each with its own picture/video choice
    if (!(opts && opts.history) && container.querySelector('.mkt-result-card[data-platform]')) {
      const row = document.createElement('div');
      row.className = 'mkt-all-row';
      row.innerHTML = `<button type="button" class="btn-primary">${escapeHtml(t('mktAddAll'))}</button><span class="admin-empty-note"></span>`;
      container.prepend(row);
      row.querySelector('button').addEventListener('click', async () => {
        const cards = [...container.querySelectorAll('.mkt-result-card[data-platform]:not(.mkt-done)')];
        const done = [], failed = [];
        for (const card of cards) {
          const b = card._body; if (!b) continue;
          try { await api('/api/admin/social/queue', { method: 'POST', body: JSON.stringify({ ...b, ...mktMediaFor(card), scheduledFor: 'next' }) }); done.push(socLabel(b.platform)); card.classList.add('mkt-done'); }
          catch (e) { failed.push(`${socLabel(b.platform)}: ${e.message}`); }
        }
        loadSocialQueue();
        row.querySelector('span').textContent = (done.length ? t('mktAddAllDone', { n: done.length, list: done.join(', ') }) : '') + (failed.length ? ' ' + t('mktAddAllFailed', { list: failed.join(' · ') }) : '');
        if (failed.length && !done.length) throw new Error('none');
      });
    }
  }

  // ── Mare App 6 (v82) / Mare App 7 (v83) — social media publishing ──────
  const SOC_DAYS = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
  const SOC_AUD = ['any', 'teachers', 'parents', 'sales'];
  let socState = null, socFilter = 'queued', socEditing = null, socMedia = null, socEditRow = null, socSlots = [], socPoll = null;
  const socLabel = (p) => (socState && socState.labels && socState.labels[p]) || (p ? p[0].toUpperCase() + p.slice(1) : '');
  const audLabel = (a) => t('socAud' + (a || 'any')[0].toUpperCase() + (a || 'any').slice(1));
  const socWhen = (iso) => (iso ? new Date(iso).toLocaleString(window.MareI18n.locale === 'nl' ? 'nl-NL' : 'en-GB', { timeZone: 'Europe/Amsterdam', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const dayName = (d) => new Date(Date.UTC(2024, 0, 7 + d)).toLocaleDateString(window.MareI18n.locale === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'short', timeZone: 'UTC' });
  const socIsAdmin = () => !document.getElementById('soc-save-channels').hidden;
  function socNote(msg) { // a short "done" line that stays a few seconds
    let el = document.getElementById('soc-note');
    if (!el) { el = document.createElement('div'); el.id = 'soc-note'; el.className = 'soc-note-toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 4000);
  }
  async function loadSocial(fresh) {
    const box = document.getElementById('soc-channels'); if (!box) return;
    const st = document.getElementById('soc-status');
    try { socState = await api('/api/admin/social/status' + (fresh ? '?fresh=1' : '')); } catch (e) { st.textContent = e.message; st.hidden = false; return; }
    st.hidden = !(!socState.configured || socState.error);
    st.textContent = !socState.configured ? t('socNotConfigured') : (socState.error || '');
    const isAdmin = socIsAdmin();
    box.innerHTML = socState.platforms.map(p => {
      const opts = socState.channels.filter(c => c.platform === p);
      const cur = socState.chosen[p] || '';
      const h = socState.health.find(x => x.platform === p) || {};
      const state = !cur ? `<span class="soc-off">${escapeHtml(t('socNotPosting'))}</span>`
        : h.ok ? `<span class="soc-ok">✓ ${escapeHtml(t(h.expiring ? 'socExpiring' : 'socPostingHere'))}</span>`
        : `<span class="soc-bad">✕ ${escapeHtml(t({ reconnect: 'socNeedsReconnect', paused: 'socPaused', inactive: 'socInactive' }[h.problem] || 'socChannelGone'))}</span>`;
      return `<div class="soc-row"><span class="soc-p">${escapeHtml(socLabel(p))}</span>
        <select data-p="${escapeHtml(p)}" ${isAdmin ? '' : 'disabled'}><option value="">${escapeHtml(t('socNoChannel'))}</option>${opts.map(c => `<option value="${escapeHtml(c.id)}"${c.id === String(cur) ? ' selected' : ''}>${escapeHtml(c.name)} (id ${escapeHtml(c.id)})</option>`).join('')}</select>
        ${state}</div>`;
    }).join('');
    // v86: a changed channel that isn't saved yet says so, and Save lights up
    box.querySelectorAll('select[data-p]').forEach(sel => sel.addEventListener('change', () => {
      const saved = String(socState.chosen[sel.dataset.p] || '');
      const st = sel.parentElement.querySelector('.soc-ok, .soc-bad, .soc-off, .soc-unsaved-note');
      if (sel.value !== saved) { if (st) { st.className = 'soc-unsaved-note'; st.textContent = t('socNotSavedYet'); } }
      else loadSocial();
      const any = [...box.querySelectorAll('select[data-p]')].some(x => x.value !== String(socState.chosen[x.dataset.p] || ''));
      document.getElementById('soc-save-channels').classList.toggle('soc-unsaved', any);
    }));
    document.getElementById('soc-save-channels').classList.remove('soc-unsaved');
    const warn = document.getElementById('soc-warn');
    warn.hidden = !socState.notChosen.length;
    warn.textContent = socState.notChosen.length ? t('socOtherChannels', { list: socState.notChosen.map(c => `${socLabel(c.platform)}: ${c.name} (id ${c.id})`).join(', ') }) : '';
    loadPinBoards();
    renderPostLinks();
    renderHashtags(); // v93
    renderHealth(socState.lastHealth);
    document.getElementById('soc-alert-emails').textContent = socState.alertEmails || '—'; // v90: the notification group
    const facts = document.getElementById('soc-facts');
    if (!facts.dataset.touched) facts.value = socState.facts || '';
    facts.disabled = !isAdmin;
    socSlots = (socState.slots || []).map(s => ({ ...s }));
    renderSlots();
    renderGenPlatforms();
    showJob(socState.job);
    loadSocialQueue();
  }
  async function loadPinBoards() {
    const row = document.getElementById('soc-pin-row'), sel = document.getElementById('soc-pin-board');
    row.hidden = !socState.chosen.pinterest;
    if (row.hidden) return;
    const cur = (socState.options && socState.options.pinterestBoard) || '';
    let boards = [];
    try { boards = (await api('/api/admin/social/pinterest-boards')).boards; } catch { /* keep what's saved */ }
    if (cur && !boards.some(b => b.id === cur)) boards.unshift({ id: cur, name: `id ${cur}` });
    sel.innerHTML = `<option value="">${escapeHtml(t('socPinDefault'))}</option>` + boards.map(b => `<option value="${escapeHtml(b.id)}"${b.id === cur ? ' selected' : ''}>${escapeHtml(b.name)}</option>`).join('');
    sel.disabled = !socIsAdmin();
  }
  function renderHealth(h) {
    const el = document.getElementById('soc-health');
    if (!h || !h.items) { el.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('socHealthNever'))}</p>`; return; }
    const icon = { ok: '✓', down: '✕', warn: '⚠', none: '–' };
    const cls = { ok: 'soc-ok', down: 'soc-bad', warn: 'soc-warn-text', none: 'soc-off' };
    el.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('socHealthAt', { when: socWhen(h.at) }))}</p>` +
      (h.items.length ? h.items.map(i => `<div class="${cls[i.state] || ''}">${icon[i.state] || ''} ${escapeHtml(i.text)}</div>`).join('') : `<p class="admin-empty-note">${escapeHtml(t('socHealthNothing'))}</p>`);
  }

  // posting times (slots): one row each — platform, day, time, for, theme, on/off
  function renderSlots() {
    const box = document.getElementById('soc-slots');
    const isAdmin = socIsAdmin(), dis = isAdmin ? '' : 'disabled';
    const live = new Set(Object.entries(socState.chosen || {}).filter(([, id]) => id).map(([p]) => p));
    const plats = socState.platforms;
    const order = (s) => `${plats.indexOf(s.platform) < 0 ? 99 : String(plats.indexOf(s.platform)).padStart(2, '0')}|${SOC_DAYS.indexOf(Number(s.day))}|${s.time}`;
    const rows = socSlots.map((s, i) => ({ s, i })).sort((a, b) => (a.s._new ? 1 : 0) - (b.s._new ? 1 : 0) || order(a.s).localeCompare(order(b.s)));
    if (!rows.length) { box.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('socNoSlots'))}</p>`; return; }
    box.innerHTML = `<div class="soc-slot-table"><div class="soc-slot soc-slot-head"><span>${escapeHtml(t('socPlatform'))}</span><span>${escapeHtml(t('socDay'))}</span><span>${escapeHtml(t('socTime'))}</span><span>${escapeHtml(t('socFor'))}</span><span>${escapeHtml(t('socTheme'))}</span><span>${escapeHtml(t('socOn'))}</span><span></span></div>` +
      rows.map(({ s, i }) => `<div class="soc-slot${s.active ? '' : ' off'}" data-i="${i}">
        <span><select data-k="platform" ${dis}>${plats.map(p => `<option value="${escapeHtml(p)}"${p === s.platform ? ' selected' : ''}>${escapeHtml(socLabel(p))}</option>`).join('')}</select>${live.has(s.platform) ? '' : `<em class="soc-wait">${escapeHtml(t('socWaitingChannel'))}</em>`}</span>
        <span><select data-k="day" ${dis}>${SOC_DAYS.map(d => `<option value="${d}"${d === Number(s.day) ? ' selected' : ''}>${escapeHtml(dayName(d))}</option>`).join('')}</select></span>
        <span><input type="text" data-k="time" value="${escapeHtml(s.time)}" placeholder="20:30" ${dis}></span>
        <span><select data-k="audience" class="soc-aud-${escapeHtml(s.audience)}" ${dis}>${SOC_AUD.map(a => `<option value="${a}"${a === s.audience ? ' selected' : ''}>${escapeHtml(audLabel(a))}</option>`).join('')}</select></span>
        <span><input type="text" data-k="theme" value="${escapeHtml(s.theme || '')}" ${dis}></span>
        <span><input type="checkbox" data-k="active" ${s.active ? 'checked' : ''} ${dis}></span>
        <span>${isAdmin ? `<button type="button" class="btn-ghost btn-small" data-rm data-no-busy aria-label="${escapeHtml(t('socDelete'))}">✕</button>` : ''}</span></div>`).join('') + `</div>`;
    box.querySelectorAll('.soc-slot[data-i]').forEach(el => {
      const s = socSlots[Number(el.dataset.i)];
      el.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('change', () => {
        const k = inp.dataset.k;
        s[k] = k === 'active' ? (inp.checked ? 1 : 0) : k === 'day' ? Number(inp.value) : inp.value;
        if (k === 'audience') inp.className = 'soc-aud-' + inp.value;
        if (k === 'active') el.classList.toggle('off', !inp.checked);
        document.getElementById('soc-save-slots').classList.add('soc-unsaved');
      }));
      const rm = el.querySelector('[data-rm]');
      if (rm) rm.addEventListener('click', () => { socSlots.splice(Number(el.dataset.i), 1); renderSlots(); document.getElementById('soc-save-slots').classList.add('soc-unsaved'); });
    });
  }
  function showJob(j) {
    const el = document.getElementById('soc-ahead-status'), btn = document.getElementById('soc-ahead-btn');
    if (!el) return;
    clearTimeout(socPoll);
    if (!j) { el.textContent = ''; btn.disabled = false; return; }
    if (!j.finished) {
      btn.disabled = true;
      el.innerHTML = `<span class="soc-spin"></span> ${escapeHtml(t('socAheadWorking', { done: j.done, total: j.total }))}`;
      socPoll = setTimeout(async () => { try { const d = await api('/api/admin/social/write-ahead'); showJob(d.job); if (d.job && d.job.created !== j.created) loadSocialQueue(); } catch { showJob(j); } }, 3000);
      return;
    }
    btn.disabled = false;
    el.textContent = j.total === 0 ? t('socAheadNone') : t('socAheadDone', { n: j.created }) + (j.errors && j.errors.length ? ' ' + t('socAheadErrors', { list: j.errors.join(' · ') }) : '');
    if (j.created) { loadSocialQueue(); }
  }

  // ── v92 — social posts: one box per chosen platform, one line per post.
  // Tick which boxes to show (remembered on this computer). Click a line to
  // open the post and act on it; double-click a box heading (or ⤢) for the
  // platform's whole history on a full page.
  const SOC_ORDER = ['instagram', 'facebook', 'linkedin', 'pinterest', 'threads', 'tiktok', 'bluesky', 'x'];
  let socPosts = [], socChosen = [];
  const socHidden = () => { try { return new Set(JSON.parse(localStorage.getItem('soc-hidden') || '[]')); } catch { return new Set(); } };
  const socSetHidden = (set) => { try { localStorage.setItem('soc-hidden', JSON.stringify([...set])); } catch { /* private mode */ } };
  const socWaiting = (r) => ['draft', 'queued', 'sending'].includes(r.status);
  function socStatus(r) {
    if (r.status === 'draft') return ['draft', t('socStDraft')];
    if (r.status === 'queued') return ['queued', t('socStApproved')];
    if (r.status === 'sending') return ['sending', t('socStSending')];
    if (r.status === 'failed') return ['failed', t('socStFailed')];
    if (r.confirm_state === 'live') return ['live', t('socStLive')];
    if (r.confirm_state === 'unconfirmed' || r.confirm_state === 'slow') return ['check', t('socStCheck')];
    return ['sent', t('socStSent')];
  }
  const socTimeOf = (r) => (r.status === 'published' ? r.published_at : r.scheduled_for);
  function socSorted(list) {
    return list.slice().sort((a, b) => {
      const wa = socWaiting(a), wb = socWaiting(b);
      if (wa !== wb) return wa ? -1 : 1;
      const ta = Date.parse(socTimeOf(a) || a.created_at || 0), tb = Date.parse(socTimeOf(b) || b.created_at || 0);
      return wa ? ta - tb : tb - ta;
    });
  }
  function socLineHtml(r) {
    const [cls, text] = socStatus(r);
    const snip = String(r.content || '').replace(/\{\{LINK\}\}/g, '').replace(/\s+/g, ' ').trim();
    return `<button type="button" class="soc-line" data-id="${escapeHtml(r.id)}" data-no-busy>
      <span class="soc-st soc-st-${cls}">${escapeHtml(text)}</span>
      <span class="soc-when">${escapeHtml(socWhen(socTimeOf(r)))}</span>
      <span class="soc-snip">${escapeHtml(snip.slice(0, 90))}</span>
      <span class="soc-ico">${r.media_key ? (r.media_type === 'video' ? '🎬' : '📷') : ''}</span></button>`;
  }
  function socBindLines(root, list) {
    root.querySelectorAll('.soc-line').forEach(b => b.addEventListener('click', () => {
      const r = list.find(x => x.id === b.dataset.id) || socPosts.find(x => x.id === b.dataset.id);
      if (r) openSocDetail(r);
    }));
  }
  let socWatch = null;
  async function loadSocialQueue(opts) {
    const box = document.getElementById('soc-queue'); if (!box) return;
    let d; try { d = await api('/api/admin/social/queue'); } catch (e) { box.innerHTML = `<p class="form-error">${escapeHtml(e.message)}</p>`; return; }
    socPosts = d.posts;
    if (socState) socState.posts = d.posts;
    socChosen = (d.chosen || []).slice().sort((a, b) => (SOC_ORDER.indexOf(a) + 1 || 99) - (SOC_ORDER.indexOf(b) + 1 || 99));
    document.getElementById('soc-approve-all-wrap').hidden = !d.posts.some(r => r.status === 'draft');
    const hidden = socHidden();
    // the tick row: All, then one per chosen platform
    const show = document.getElementById('soc-show');
    show.innerHTML = socChosen.length ? `<span class="soc-show-label">${escapeHtml(t('socShow'))}</span>
      <label><input type="checkbox" data-p="*"${socChosen.every(p => !hidden.has(p)) ? ' checked' : ''}> ${escapeHtml(t('socShowAll'))}</label>
      ${socChosen.map(p => `<label><input type="checkbox" data-p="${escapeHtml(p)}"${hidden.has(p) ? '' : ' checked'}> ${escapeHtml(socLabel(p))}</label>`).join('')}` : '';
    show.querySelectorAll('input').forEach(c => c.addEventListener('change', () => {
      const h = socHidden();
      if (c.dataset.p === '*') socChosen.forEach(p => (c.checked ? h.delete(p) : h.add(p)));
      else if (c.checked) h.delete(c.dataset.p); else h.add(c.dataset.p);
      socSetHidden(h); loadSocialQueue();
    }));
    if (!socChosen.length) { box.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('socNoChannelsYet'))}</p>`; return; }
    const visible = socChosen.filter(p => !hidden.has(p));
    if (!visible.length) { box.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('socAllHidden'))}</p>`; return; }
    box.innerHTML = visible.map(p => {
      const mine = socSorted(d.posts.filter(r => r.platform === p));
      const waiting = mine.filter(r => r.status === 'queued' || r.status === 'sending').length, drafts = mine.filter(r => r.status === 'draft').length, failed = mine.filter(r => r.status === 'failed').length;
      const sum = [waiting ? t('socSumWaiting', { n: waiting }) : '', drafts ? t('socSumDrafts', { n: drafts }) : '', failed ? t('socSumFailed', { n: failed }) : ''].filter(Boolean).join(' · ');
      return `<section class="soc-box" data-p="${escapeHtml(p)}">
        <header class="soc-box-head" title="${escapeHtml(t('socBoxOpenHint'))}"><strong>${escapeHtml(socLabel(p))}</strong><span class="soc-box-sum${failed ? ' bad' : ''}">${escapeHtml(sum)}</span>
          <button type="button" class="soc-box-open" data-no-busy aria-label="${escapeHtml(t('socBoxOpen', { p: socLabel(p) }))}">⤢</button></header>
        <div class="soc-box-list">${mine.length ? mine.map(socLineHtml).join('') : `<p class="admin-empty-note">${escapeHtml(t('socBoxEmpty'))}</p>`}</div></section>`;
    }).join('');
    box.querySelectorAll('.soc-box').forEach(el => {
      const p = el.dataset.p;
      el.querySelector('.soc-box-head').addEventListener('dblclick', () => openSocFull(p));
      el.querySelector('.soc-box-open').addEventListener('click', () => openSocFull(p));
      socBindLines(el, d.posts);
    });
    // a post open in the window gets the newest version (not on the quiet refresh, so typing isn't lost)
    const open = document.getElementById('soc-detail');
    if (!(opts && opts.quiet) && !open.hidden && open.dataset.id) { const r = d.posts.find(x => x.id === open.dataset.id); if (r) openSocDetail(r); }
    // while a post is going out or waiting for its confirmation, refresh every 20 seconds
    clearTimeout(socWatch);
    if (d.posts.some(r => r.status === 'sending' || (r.status === 'published' && r.confirm_state === 'pending'))) {
      socWatch = setTimeout(() => { const panel = document.getElementById('panel-marketing'); if (panel && panel.classList.contains('active')) loadSocialQueue({ quiet: true }); else socWatch = null; }, 20000);
    }
  }
  async function openSocFull(p) {
    const el = document.getElementById('soc-full');
    document.getElementById('soc-full-title').textContent = socLabel(p);
    const list = document.getElementById('soc-full-list');
    list.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('adminLoading'))}</p>`;
    el.hidden = false; el.dataset.p = p;
    document.body.classList.add('soc-full-open');
    let rows = [];
    try { rows = socSorted((await api(`/api/admin/social/queue?platform=${encodeURIComponent(p)}&all=1`)).posts || []); } catch (e) { list.innerHTML = `<p class="form-error">${escapeHtml(e.message)}</p>`; return; }
    list.innerHTML = rows.length ? rows.map(socLineHtml).join('') : `<p class="admin-empty-note">${escapeHtml(t('socBoxEmpty'))}</p>`;
    socBindLines(list, rows);
  }
  // Dutch time for the date-time box, a day ahead at 20:30
  function socDefaultAt() {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date(Date.now() + 864e5));
    return `${d}T20:30`;
  }
  function openSocDetail(r) {
    const modal = document.getElementById('soc-detail'), body = document.getElementById('soc-detail-body');
    modal.dataset.id = r.id;
    const [cls, stText] = socStatus(r);
    const needsMedia = new Set((socState && socState.needsMedia) || []);
    const missingMedia = needsMedia.has(r.platform) && !r.media_key && ['draft', 'queued', 'failed'].includes(r.status);
    const whenLine = r.status === 'published' ? t('socWentOut', { when: socWhen(r.published_at) }) : r.status === 'failed' ? t('socFailedAt', { when: socWhen(r.scheduled_for) }) : t('socPlannedFor', { when: socWhen(r.scheduled_for) });
    const b = (a, label, kind, extra) => `<button type="button" class="btn-${kind || 'ghost'} btn-small" data-a="${a}"${extra || ''}>${escapeHtml(t(label))}</button>`;
    let actions = '';
    if (r.status === 'draft') actions = b('approve', 'socApprove', 'primary') + b('edit', 'socEdit', 'ghost', ' data-no-busy') + b('now', 'socPublishNow') + b('del', 'socDelete');
    else if (r.status === 'queued') actions = b('edit', 'socEditTime', 'primary', ' data-no-busy') + b('now', 'socPublishNow') + b('del', 'socDelete');
    else if (r.status === 'failed') actions = b('now', 'socTryAgain', 'primary') + b('edit', 'socEdit', 'ghost', ' data-no-busy') + b('del', 'socDelete');
    else if (r.status === 'published') actions = (r.platform_url ? `<a class="btn-primary btn-small" href="${escapeHtml(r.platform_url)}" target="_blank" rel="noopener">${escapeHtml(t('socViewOn', { p: socLabel(r.platform) }))}</a>` : '')
      + b('again-now', 'socPostAgainNow') + b('again-plan', 'socPlanAgain', 'ghost', ' data-no-busy') + b('del', 'socRemoveFromList');
    body.innerHTML = `<div class="soc-detail-head"><strong>${escapeHtml(socLabel(r.platform))}</strong> <span class="soc-st soc-st-${cls}">${escapeHtml(stText)}</span>
        <span class="soc-detail-when">${escapeHtml(whenLine)}</span></div>
      <p class="soc-detail-meta"><span class="soc-aud soc-aud-${escapeHtml(r.audience || 'any')}">${escapeHtml(audLabel(r.audience || 'any'))}</span>${r.theme ? ` · <i>${escapeHtml(r.theme)}</i>` : ''}${r.ai_media ? ' · AI' : ''}</p>
      ${r.mediaUrl ? `<div class="soc-detail-media">${r.media_type === 'video' ? `<video src="${escapeHtml(r.mediaUrl)}" controls muted preload="metadata"></video>` : `<img src="${escapeHtml(r.mediaUrl)}" alt="">`}</div>` : ''}
      ${r.error ? `<div class="soc-fix"><strong>${escapeHtml(t('socWhatToDo'))}</strong> ${escapeHtml(r.error)}</div>` : ''}
      ${missingMedia ? `<div class="soc-fix"><strong>${escapeHtml(t('socWhatToDo'))}</strong> ${escapeHtml(t('socNeedsPictureFix', { p: socLabel(r.platform) }))}</div>` : ''}
      ${(r.status === 'published' && r.confirm_state === 'unconfirmed') ? `<div class="soc-fix"><strong>${escapeHtml(t('socWhatToDo'))}</strong> ${escapeHtml(t('socUnconfirmedFix', { p: socLabel(r.platform) }))}</div>` : ''}
      ${r.title ? `<div class="mkt-result-title">${escapeHtml(r.title)}</div>` : ''}
      <div class="soc-post-text">${withLink(r.content, r.audience || 'any')}</div>
      ${r.first_comment ? `<div class="soc-fc"><b>${escapeHtml(t('socFirstCommentShort'))}</b> ${withLink(r.first_comment, r.audience || 'any')}</div>` : ''}
      ${r.notes && ['draft', 'queued', 'failed'].includes(r.status) ? `<div class="soc-notes">${socNotesHtml(r.notes)}</div>` : ''}
      <div class="soc-post-btns">${actions}</div>
      <div class="soc-plan" hidden>
        <label>${escapeHtml(t('socPlanWhen'))} <input type="datetime-local" class="soc-plan-at" value="${socDefaultAt()}"></label>
        ${b('plan-at', 'socPlan', 'primary')} ${b('plan-next', 'socPlanNext')}
      </div>
      <div class="soc-mail">
        <label>${escapeHtml(t('socEmailCopy'))} <input type="text" class="soc-mail-to" placeholder="naam@voorbeeld.nl, …"></label>
        ${b('mail', 'socSend')}
      </div>
      <p class="form-success soc-detail-ok" hidden></p><p class="form-error soc-detail-err" hidden></p>`;
    modal.hidden = false;
    const q = (sel) => body.querySelector(sel);
    const say = (ok, msg) => { q('.soc-detail-ok').hidden = !ok; q('.soc-detail-err').hidden = ok; (ok ? q('.soc-detail-ok') : q('.soc-detail-err')).textContent = msg; };
    const done = async (msg) => { socNote(msg); await loadSocialQueue(); const full = document.getElementById('soc-full'); if (!full.hidden) openSocFull(full.dataset.p); };
    body.querySelectorAll('[data-a]').forEach(btn => btn.addEventListener('click', async () => {
      const a = btn.dataset.a;
      try {
        if (a === 'edit') { modal.hidden = true; document.getElementById('soc-full').hidden = true; document.body.classList.remove('soc-full-open'); return openSocialPost(r); }
        if (a === 'again-plan') { q('.soc-plan').hidden = !q('.soc-plan').hidden; return; }
        if ((a === 'approve' || a === 'now' || a === 'again-now' || a === 'plan-at' || a === 'plan-next') && socNeedsMedia(r.platform) && !r.media_key) { // v93
          return socMediaPopup(r.platform, { onAdd: () => { modal.hidden = true; openSocialPost(r); setTimeout(() => document.getElementById('sp-file').click(), 150); } });
        }
        if (a === 'approve') { await api(`/api/admin/social/queue/${r.id}/approve`, { method: 'POST' }); modal.hidden = true; return done(t('socApproved')); }
        if (a === 'now') {
          if (!confirm(t('socPublishConfirm', { p: socLabel(r.platform) }))) return;
          await api(`/api/admin/social/queue/${r.id}/publish-now`, { method: 'POST' }); modal.hidden = true; return done(t('socSentNow', { p: socLabel(r.platform) }));
        }
        if (a === 'del') {
          if (!confirm(t(r.status === 'published' ? 'socRemoveConfirm' : 'socDeleteConfirm'))) return;
          await api(`/api/admin/social/queue/${r.id}`, { method: 'DELETE' }); modal.hidden = true; return done(t('adminSaved'));
        }
        if (a === 'again-now') {
          if (!confirm(t('socPublishConfirm', { p: socLabel(r.platform) }))) return;
          await api(`/api/admin/social/queue/${r.id}/repost`, { method: 'POST', body: JSON.stringify({ when: 'now' }) }); modal.hidden = true; return done(t('socSentNow', { p: socLabel(r.platform) }));
        }
        if (a === 'plan-at' || a === 'plan-next') {
          const out = await api(`/api/admin/social/queue/${r.id}/repost`, { method: 'POST', body: JSON.stringify({ when: a === 'plan-next' ? 'next' : q('.soc-plan-at').value }) });
          modal.hidden = true; return done(t('socQueuedFor', { when: socWhen(out.scheduledFor) }));
        }
        if (a === 'mail') {
          const out = await api(`/api/admin/social/queue/${r.id}/email`, { method: 'POST', body: JSON.stringify({ to: q('.soc-mail-to').value }) });
          q('.soc-mail-to').value = ''; say(true, t('socEmailed', { to: out.to.join(', ') }));
        }
      } catch (e) { say(false, e.message || t('errorGeneric')); throw e; }
    }));
  }
  function socMediaShow() {
    const el = document.getElementById('sp-media');
    el.innerHTML = socMedia ? `${socMedia.type === 'video' ? `<video src="${escapeHtml(socMedia.url || '')}" muted controls preload="metadata"></video>` : `<img src="${escapeHtml(socMedia.url || '')}" alt="">`}
      <button type="button" class="btn-ghost btn-small" id="sp-media-rm" data-no-busy>${escapeHtml(t('socRemoveMedia'))}</button>` : '';
    if (socMedia) document.getElementById('sp-media-rm').addEventListener('click', () => { socMedia = null; socMediaShow(); });
  }
  function socCount() {
    const n = document.getElementById('sp-text').value.length, p = document.getElementById('sp-platform').value;
    const max = ((socState && socState.maxLen) || {})[p] || 5000;
    const c = document.getElementById('sp-count'); c.textContent = `${n} / ${max}`; c.classList.toggle('over', n > max);
    const fcOk = !socState || (socState.firstCommentPlatforms || []).includes(p);
    document.getElementById('sp-fc-wrap').hidden = !fcOk;
    document.getElementById('sp-title-wrap').hidden = p !== 'pinterest';
    { // v93: say hashtags come by themselves
      const tn = document.getElementById('sp-tags-note');
      const on = socState && (socState.hashtagPlatforms || []).includes(p);
      tn.hidden = !on;
      if (on) tn.textContent = t('socTagsAuto', { p: socLabel(p) });
    }
    const noLink = socState && (socState.noLinkPlatforms || []).includes(p);
    const aud = document.getElementById('sp-audience').value;
    const goes = socState && socState.postLinksFull ? ' ' + t('socLinkGoesTo', { url: socState.postLinksFull[aud] || socState.postLinksFull.any }) : '';
    document.getElementById('sp-link-note').textContent = (noLink ? t('socLinkMoves', { p: socLabel(p) }) : ['instagram', 'tiktok'].includes(p) ? t('socLinkBio', { p: socLabel(p) }) : '') + goes;
  }
  // open the post window: r = existing post (edit), a copy (id null), or a generated post
  function openSocialPost(r) {
    r = r || {};
    socEditing = r.id || null;
    socEditRow = r;
    socMedia = r.media_key ? { key: r.media_key, type: r.media_type, url: r.mediaUrl } : null;
    document.getElementById('sp-title').textContent = t(socEditing ? (r.status === 'draft' ? 'socEditDraftTitle' : 'socEditTitle') : 'socNewTitle');
    const plats = (socState && socState.platforms) || ['facebook', 'instagram', 'linkedin', 'threads'];
    document.getElementById('sp-platform').innerHTML = plats.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(socLabel(p))}</option>`).join('');
    document.getElementById('sp-platform').value = r.platform || 'facebook';
    document.getElementById('sp-audience').value = r.audience || 'any';
    document.getElementById('sp-text').value = r.content || '';
    document.getElementById('sp-fc').value = r.first_comment || '';
    document.getElementById('sp-pin-title').value = r.title || '';
    document.getElementById('sp-ai').checked = !!r.ai_media;
    const notes = socNotesHtml(r.notes);
    document.getElementById('sp-notes').innerHTML = notes;
    document.getElementById('sp-notes').hidden = !notes;
    const when = document.getElementById('sp-when');
    when.querySelector('option[value="now"]').hidden = !!socEditing;
    when.value = socEditing && r.scheduled_for ? 'at' : 'next';
    const at = socEditing && r.scheduled_for ? new Date(r.scheduled_for) : new Date(Date.now() + 3600e3);
    document.getElementById('sp-at').value = new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('sp-at-wrap').hidden = when.value !== 'at';
    document.getElementById('sp-save').textContent = t(r.status === 'draft' ? 'socSaveApprove' : 'socSave');
    document.getElementById('sp-error').hidden = true;
    socMediaShow(); socCount();
    document.getElementById('social-modal').hidden = false;
  }
  if (document.getElementById('social-modal')) {
    document.getElementById('sp-close-btn').addEventListener('click', () => { document.getElementById('social-modal').hidden = true; });
    document.getElementById('sp-when').addEventListener('change', (e) => { document.getElementById('sp-at-wrap').hidden = e.target.value !== 'at'; });
    document.getElementById('sp-text').addEventListener('input', socCount);
    document.getElementById('sp-platform').addEventListener('change', socCount);
    document.getElementById('sp-audience').addEventListener('change', socCount);
    document.getElementById('sp-file').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const el = document.getElementById('sp-media'); el.innerHTML = `<span class="soc-spin"></span> ${escapeHtml(t('adminUploading'))}`;
      try { socMedia = await socUploadFile(file); } catch (err) { alert(err.message || t('errorGeneric')); }
      e.target.value = ''; socMediaShow();
    });
    // v93: keep it as a draft until a picture or video is added
    async function saveAsDraft() {
      const err = document.getElementById('sp-error'); err.hidden = true;
      const platform = document.getElementById('sp-platform').value;
      const body = { platform, content: document.getElementById('sp-text').value, audience: document.getElementById('sp-audience').value,
        firstComment: document.getElementById('sp-fc-wrap').hidden ? '' : document.getElementById('sp-fc').value,
        title: platform === 'pinterest' ? document.getElementById('sp-pin-title').value : '' };
      const w = document.getElementById('sp-when').value;
      if (w === 'at' && document.getElementById('sp-at').value) body.scheduledFor = new Date(document.getElementById('sp-at').value).toISOString();
      else body.scheduledFor = 'next';
      try {
        if (socEditing) await api(`/api/admin/social/queue/${socEditing}`, { method: 'PATCH', body: JSON.stringify(body) });
        else await api('/api/admin/social/queue', { method: 'POST', body: JSON.stringify({ ...body, draft: true }) });
        document.getElementById('social-modal').hidden = true;
        socNote(t('socKeptDraft'));
        loadSocialQueue();
      } catch (e) { err.textContent = e.message; err.hidden = false; }
    }
    document.getElementById('sp-save').addEventListener('click', async (ev) => {
      const err = document.getElementById('sp-error'); err.hidden = true;
      const when = document.getElementById('sp-when').value;
      const platform = document.getElementById('sp-platform').value;
      // v93: no picture or video for a platform that needs one → ask for it first
      if (socNeedsMedia(platform) && !socMedia && !ev.socAsDraft) {
        const canDraft = !socEditing || (socEditRow && socEditRow.status === 'draft');
        socMediaPopup(platform, {
          onAdd: () => document.getElementById('sp-file').click(),
          onDraft: canDraft ? () => saveAsDraft() : null,
        });
        return;
      }
      const body = { platform, content: document.getElementById('sp-text').value, audience: document.getElementById('sp-audience').value,
        firstComment: document.getElementById('sp-fc-wrap').hidden ? '' : document.getElementById('sp-fc').value,
        title: platform === 'pinterest' ? document.getElementById('sp-pin-title').value : '',
        mediaKey: socMedia ? socMedia.key : null, mediaType: socMedia ? socMedia.type : null, aiMedia: document.getElementById('sp-ai').checked };
      if (socEditRow && socEditRow.notes && !socEditing) body.notes = socEditRow.notes;
      if (when === 'next') body.scheduledFor = 'next';
      if (when === 'at') { const v = document.getElementById('sp-at').value; if (!v) { err.textContent = t('socChooseTime'); err.hidden = false; throw new Error('time'); } body.scheduledFor = new Date(v).toISOString(); }
      const wasDraft = socEditing && socEditRow && socEditRow.status === 'draft';
      if (wasDraft) body.approve = true;
      try {
        if (when === 'now') await api('/api/admin/social/publish', { method: 'POST', body: JSON.stringify(body) });
        else if (socEditing) await api(`/api/admin/social/queue/${socEditing}`, { method: 'PATCH', body: JSON.stringify(body) });
        else await api('/api/admin/social/queue', { method: 'POST', body: JSON.stringify(body) });
        if (when === 'now' && wasDraft) await api(`/api/admin/social/queue/${socEditing}`, { method: 'DELETE' });
        document.getElementById('social-modal').hidden = true;
        loadSocialQueue();
      } catch (e) { err.textContent = e.message; err.hidden = false; loadSocialQueue(); throw e; }
    });
    document.getElementById('soc-new').addEventListener('click', () => openSocialPost({}));
    // v92: the post window and the full page
    document.getElementById('soc-detail').addEventListener('click', (e) => { if (e.target.id === 'soc-detail') e.target.hidden = true; });
    document.getElementById('soc-full-close').addEventListener('click', () => { document.getElementById('soc-full').hidden = true; document.body.classList.remove('soc-full-open'); });
    document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; const d = document.getElementById('soc-detail'), f = document.getElementById('soc-full'); if (!d.hidden) d.hidden = true; else if (!f.hidden) { f.hidden = true; document.body.classList.remove('soc-full-open'); } });
    document.getElementById('soc-refresh').addEventListener('click', () => loadSocial(true));
    document.getElementById('soc-save-channels').addEventListener('click', async () => {
      const body = {}; document.querySelectorAll('#soc-channels select').forEach(s => { body[s.dataset.p] = s.value || null; });
      try {
        await api('/api/admin/social/channels', { method: 'PUT', body: JSON.stringify(body) });
        if (!document.getElementById('soc-pin-row').hidden) await api('/api/admin/social/settings', { method: 'PUT', body: JSON.stringify({ pinterestBoard: document.getElementById('soc-pin-board').value }) });
      } catch (e) { const st = document.getElementById('soc-status'); st.textContent = e.message; st.hidden = false; throw e; }
      await loadSocial(true);
    });
    document.getElementById('soc-save-tags').addEventListener('click', async () => { // v93
      const hashtags = {}; document.querySelectorAll('#soc-hashtags input[data-aud]').forEach(i => { hashtags[i.dataset.aud] = i.value; });
      try { await api('/api/admin/social/settings', { method: 'PUT', body: JSON.stringify({ hashtags }) }); socNote(t('adminSaved')); }
      catch (e) { alert(e.message); throw e; }
      await loadSocial();
    });
    document.getElementById('soc-save-links').addEventListener('click', async () => {
      const postLinks = {}; document.querySelectorAll('#soc-post-links input[data-aud]').forEach(i => { postLinks[i.dataset.aud] = i.value; });
      try { await api('/api/admin/social/settings', { method: 'PUT', body: JSON.stringify({ postLinks }) }); }
      catch (e) { alert(e.message); throw e; }
      await loadSocial();
    });
    document.getElementById('soc-check-health').addEventListener('click', async () => {
      const d = await api('/api/admin/social/health-check', { method: 'POST' });
      renderHealth(d);
      socNote(d.news ? t('socHealthEmailed', { n: d.emailed }) : t('socHealthNoNews'));
    });
    document.getElementById('soc-facts').addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
    document.getElementById('soc-save-facts').addEventListener('click', async () => {
      const f = document.getElementById('soc-facts');
      try { await api('/api/admin/social/facts', { method: 'PUT', body: JSON.stringify({ facts: f.value }) }); delete f.dataset.touched; }
      catch (e) { alert(e.message); throw e; }
    });
    document.getElementById('soc-add-slot').addEventListener('click', () => {
      socSlots.push({ platform: 'instagram', day: 1, time: '20:30', audience: 'any', theme: '', active: 1, _new: true });
      renderSlots();
      document.getElementById('soc-save-slots').classList.add('soc-unsaved');
      const rows = document.querySelectorAll('#soc-slots .soc-slot[data-i]'); const last = rows[rows.length - 1];
      if (last) { last.scrollIntoView({ block: 'center' }); const th = last.querySelector('[data-k="theme"]'); if (th) th.focus(); }
    });
    document.getElementById('soc-save-slots').addEventListener('click', async () => {
      try {
        const d = await api('/api/admin/social/slots', { method: 'PUT', body: JSON.stringify({ slots: socSlots.map(s => ({ id: s.id, platform: s.platform, day: s.day, time: s.time, audience: s.audience, theme: s.theme, active: !!s.active })) }) });
        socSlots = d.slots.map(s => ({ ...s })); socState.slots = d.slots;
        document.getElementById('soc-save-slots').classList.remove('soc-unsaved');
        renderSlots();
      } catch (e) { alert(e.message); throw e; }
    });
    document.getElementById('soc-ahead-btn').addEventListener('click', async () => {
      try {
        const d = await api('/api/admin/social/write-ahead', { method: 'POST', body: JSON.stringify({ days: Number(document.getElementById('soc-ahead-days').value) }) });
        showJob(d.job);
      } catch (e) { alert(e.message); throw e; }
    });
    document.getElementById('soc-approve-all').addEventListener('click', async () => {
      if (!confirm(t('socApproveAllConfirm'))) return;
      try {
        const d = await api('/api/admin/social/approve-all', { method: 'POST' });
        socNote(t('socApprovedN', { n: d.approved }) + (d.skipped.length ? ' ' + t('socApproveSkipped', { list: d.skipped.join(' · ') }) : ''));
        if (d.skipped.length) alert(t('socApproveSkipped', { list: d.skipped.join('\n') }));
      } finally { loadSocialQueue(); }
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
        renderMarketingResults(resultsWrap, item.results, { history: true });
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
      notifyList = (data.notifyEmails || []).slice(); renderNotifyGroup(); // v90
      document.getElementById('preview-scene-limit').value = data.previewSceneLimit ?? '';
      document.getElementById('club-mare-preview-limit').value = data.clubMarePreviewLimit ?? '';
      document.getElementById('talk-preview-message-limit').value = data.talkPreviewMessageLimit ?? '';
      document.getElementById('teacher-doc-preview-pages').value = data.teacherDocPreviewPages ?? '';
    } catch {
      // Non-critical — the fields just stay blank if this fails, no
      // need for a dedicated error state on a couple of inputs.
    }
  }
  // v90 — the notification group: chips with ✕, an Add box, a test to everyone
  let notifyList = [];
  function renderNotifyGroup() {
    const box = document.getElementById('notify-group');
    box.innerHTML = notifyList.length
      ? notifyList.map((e, i) => `<span class="notify-chip">${escapeHtml(e)} <button type="button" data-i="${i}" data-no-busy aria-label="${escapeHtml(t('adminSpotRemove'))} ${escapeHtml(e)}">✕</button></span>`).join('')
      : `<span class="admin-empty-note">${escapeHtml(t('adminNotifyEmpty'))}</span>`;
    box.querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => { notifyList.splice(Number(b.dataset.i), 1); renderNotifyGroup(); }));
  }
  function addNotify(raw) {
    const parts = String(raw || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
    if (!parts.length || parts.some(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) return false;
    for (const x of parts) if (!notifyList.some(y => y.toLowerCase() === x.toLowerCase())) notifyList.push(x);
    document.getElementById('notify-add-input').value = '';
    renderNotifyGroup();
    return true;
  }
  function setupAdminSettings() {
    const addBtn = document.getElementById('notify-add-btn');
    const addInput = document.getElementById('notify-add-input');
    const addErr = () => { const el = document.getElementById('notify-email-error'); el.textContent = t('adminNotifyBad', { email: addInput.value.trim() }); el.hidden = false; };
    addBtn.addEventListener('click', () => { document.getElementById('notify-email-error').hidden = true; if (!addNotify(addInput.value)) addErr(); });
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); } });
    document.getElementById('notify-test-btn').addEventListener('click', async () => {
      const errorEl = document.getElementById('notify-email-error'), successEl = document.getElementById('notify-email-success');
      errorEl.hidden = successEl.hidden = true;
      try {
        const out = await api('/api/admin/settings/test-notify', { method: 'POST' });
        successEl.textContent = out.failed && out.failed.length ? t('adminNotifyTestPartly', { failed: out.failed.join(', ') }) : t('adminNotifyTestSent', { to: out.to.join(', ') });
        successEl.hidden = false;
      } catch (err) { errorEl.textContent = err.message; errorEl.hidden = false; throw err; }
    });
    document.getElementById('notify-email-save-btn').addEventListener('click', async () => {
      const errorEl = document.getElementById('notify-email-error');
      const successEl = document.getElementById('notify-email-success');
      errorEl.hidden = true;
      successEl.hidden = true;
      // v90: an address still typed in the box counts too
      const typed = document.getElementById('notify-add-input').value.trim();
      if (typed) { if (!addNotify(typed)) { errorEl.textContent = t('adminNotifyBad', { email: typed }); errorEl.hidden = false; return; } }
      const numOrUndefined = (id) => {
        const v = document.getElementById(id).value;
        return v === '' ? undefined : Number(v);
      };
      try {
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            notifyEmails: notifyList,
            previewSceneLimit: numOrUndefined('preview-scene-limit'),
            clubMarePreviewLimit: numOrUndefined('club-mare-preview-limit'),
            talkPreviewMessageLimit: numOrUndefined('talk-preview-message-limit'),
            teacherDocPreviewPages: numOrUndefined('teacher-doc-preview-pages'),
          }),
        });
        const sa = document.getElementById('soc-alert-emails'); if (sa) sa.textContent = notifyList.join(', ') || '—'; // v90: social section shows the group
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



  // ── Mare App 8 (v89) — treasure chest settings ──
  let trData = null;
  async function loadTreasure() {
    try { trData = await api('/api/admin/treasure'); } catch { return; }
    const on = new Set(trData.chapters);
    document.getElementById('tr-chapters').innerHTML = trData.titles.map(c => {
      const n = trData.quizzes[c.no] || 0;
      return `<label class="${n ? '' : 'noquiz'}" title="${escapeHtml(c.title || '')}"><input type="checkbox" value="${c.no}"${on.has(c.no) ? ' checked' : ''}> ${c.no} <small>(${escapeHtml(t('adminTrQuizCount', { n }))})</small></label>`;
    }).join('');
    document.getElementById('tr-percent').value = trData.percent;
    document.getElementById('tr-days').value = trData.days;
    document.getElementById('tr-given').textContent = t('adminTrGiven', { n: trData.codesGiven });
    // v95: preview with as many diamonds as the first ticked chapter has quizzes (or 4)
    const first = trData.chapters.find(c => trData.quizzes[c]);
    const want = (first && trData.quizzes[first]) || 4;
    document.getElementById('tr-prev-n').innerHTML = Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}"${i + 1 === want ? ' selected' : ''}>${i + 1}</option>`).join('');
    trPics();
  }
  function trPics() {
    const box = document.getElementById('tr-pics');
    const slot = (which) => {
      const key = trData[which + 'Key'], src = trData[which + 'Url'];
      const showDim = which === 'closed' && !key;
      return `<div class="tr-pic" data-which="${which}"><strong>${escapeHtml(t(which === 'closed' ? 'adminTrClosed' : 'adminTrOpen'))}</strong>
        <img src="${escapeHtml(showDim ? trData.openUrl : src || '')}" alt=""${showDim ? ' class="dim"' : ''}>
        <small class="admin-empty-note">${escapeHtml(t(which === 'closed' ? (key ? 'adminTrOwn' : 'adminTrClosedNone') : (key ? 'adminTrOwn' : 'adminTrOpenDefault')))}</small>
        <span><label class="btn-ghost btn-small">${escapeHtml(t('adminSpotPicUpload'))}<input type="file" accept="image/*" hidden></label>
        ${key ? ` <a href="#" class="tr-rm">${escapeHtml(t('adminSpotRemove'))}</a>` : ''}</span></div>`;
    };
    box.innerHTML = slot('closed') + slot('open');
    box.querySelectorAll('.tr-pic').forEach(el => {
      const which = el.dataset.which;
      el.querySelector('input[type=file]').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
          const key = await picUpload(file, 'spot-icons');
          await api('/api/admin/treasure', { method: 'PUT', body: JSON.stringify({ [which + 'Key']: key }) });
          await loadTreasure();
        } catch (err) { alert(err.message || t('errorGeneric')); }
      });
      const rm = el.querySelector('.tr-rm');
      if (rm) rm.addEventListener('click', async (e) => { e.preventDefault(); await api('/api/admin/treasure', { method: 'PUT', body: JSON.stringify({ [which + 'Key']: null }) }); await loadTreasure(); });
    });
  }
  function setupTreasure() {
    const modal = document.getElementById('tr-prev-modal'), frame = document.getElementById('tr-prev-frame');
    document.getElementById('tr-preview').addEventListener('click', () => {
      frame.src = `/pictures.html?chestdemo=${document.getElementById('tr-prev-n').value}&t=${Date.now()}`;
      modal.hidden = false;
    });
    const close = () => { modal.hidden = true; frame.src = 'about:blank'; };
    // the window's own ✕ and Close (added to every admin window) hide it: empty the frame then too
    new MutationObserver(() => { if (modal.hidden) frame.src = 'about:blank'; }).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.getElementById('tr-save').addEventListener('click', async () => {
      const chapters = [...document.querySelectorAll('#tr-chapters input:checked')].map(i => Number(i.value));
      await api('/api/admin/treasure', { method: 'PUT', body: JSON.stringify({ chapters, percent: Number(document.getElementById('tr-percent').value), days: Number(document.getElementById('tr-days').value) }) });
      await loadTreasure();
    });
  }

  // ── Mare App 8 (v87) — Comms: email lists, newsletters, welcome series ──
  let cmData = null;
  const cmWhen = (iso) => (iso ? new Date(iso).toLocaleString(window.MareI18n.locale === 'nl' ? 'nl-NL' : 'en-GB', { timeZone: 'Europe/Amsterdam', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');
  const cmDay = (d) => new Date(Date.UTC(2024, 0, 7 + d)).toLocaleDateString(window.MareI18n.locale === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'long', timeZone: 'UTC' });
  const cmListName = (l) => t(l === 'teachers' ? 'cmListTeachers' : 'cmListParents');
  // a Dutch-time "YYYY-MM-DDTHH:MM" for the date-time box, a day ahead at the list's time
  function cmDefaultAt(list) {
    const tm = (cmData && cmData.times[list] && cmData.times[list].time) || '20:30';
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date(Date.now() + 864e5));
    return `${d}T${tm}`;
  }
  function cmWarn(list) {
    return (list || []).length ? `<ul class="cm-warn">${list.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : '';
  }

  async function loadComms() {
    try { cmData = await api('/api/admin/comms'); } catch { return; }
    const c = cmData.counts;
    document.getElementById('cm-counts').innerHTML = ['parents', 'teachers'].map(l => `
      <div class="stat-item"><div class="stat-value">${c[l].active}</div><div class="stat-label">${escapeHtml(cmListName(l))}</div>
      <div class="stat-sub">${escapeHtml(t('cmCountsSub', { pending: c[l].pending, stopped: c[l].stopped }))}</div></div>`).join('');
    const tm = cmData.times;
    document.getElementById('cm-nl-desc').textContent = t('cmNewslettersDesc', {
      parents: `${cmDay(tm.parents.day)} ${tm.parents.time}`, teachers: `${cmDay(tm.teachers.day)} ${tm.teachers.time}` });
    document.getElementById('cm-welcome-desc').textContent = t('cmWelcomeDesc', { a: cmData.welcomeDays[0], b: cmData.welcomeDays[1] });
    document.getElementById('cm-write-btn').hidden = !cmData.canWrite;
    renderCmNewsletters();
    renderCmWelcome();
    renderCmTimes();
    loadCmSubs();
  }

  async function loadCmSubs() {
    const q = new URLSearchParams({ list: document.getElementById('cm-f-list').value, status: document.getElementById('cm-f-status').value, q: document.getElementById('cm-f-q').value.trim() });
    let rows = [];
    try { rows = (await api(`/api/admin/comms/subscribers?${q}`)).subscribers || []; } catch { return; }
    const table = document.getElementById('cm-subs');
    if (!rows.length) { table.innerHTML = `<tr><td class="admin-empty-note">${escapeHtml(t('cmNobody'))}</td></tr>`; return; }
    const isAdmin = cmData && cmData.isAdmin;
    const st = (s) => t(s === 'active' ? 'cmStatusActive' : s === 'pending' ? 'cmStatusPending' : 'cmStatusStopped');
    table.innerHTML = `<thead><tr><th>${escapeHtml(t('cmColName'))}</th><th>${escapeHtml(t('fieldEmail'))}</th><th>${escapeHtml(t('cmForList'))}</th><th>${escapeHtml(t('cmColStatus'))}</th><th>${escapeHtml(t('cmColJoined'))}</th><th></th></tr></thead><tbody>` +
      rows.map(r => `<tr data-id="${escapeHtml(r.id)}">
        <td>${escapeHtml(r.name || '—')}</td><td>${escapeHtml(r.email)}</td>
        <td>${escapeHtml(cmListName(r.list))} · ${escapeHtml(r.locale.toUpperCase())}</td>
        <td><span class="cm-st cm-st-${escapeHtml(r.status)}">${escapeHtml(st(r.status))}</span>${r.stopped_at ? `<br><small>${escapeHtml(fmtDate(r.stopped_at))}</small>` : ''}</td>
        <td title="${escapeHtml(r.consent_text)}">${escapeHtml(fmtDate(r.consented_at || r.created_at))}<br><small>${escapeHtml(t('cmSrc_' + r.source) !== 'cmSrc_' + r.source ? t('cmSrc_' + r.source) : r.source_text)}</small></td>
        <td class="cm-row-btns">${r.status !== 'stopped' ? `<button type="button" class="btn-ghost btn-small" data-a="stop">${escapeHtml(t('cmStop'))}</button>` : ''}
          ${isAdmin ? `<button type="button" class="btn-ghost btn-small" data-a="del">${escapeHtml(t('cmRemove'))}</button>` : ''}</td></tr>`).join('') + '</tbody>';
    table.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', async () => {
      const id = b.closest('tr').dataset.id;
      if (b.dataset.a === 'stop') {
        if (!confirm(t('cmStopConfirm'))) return;
        await api(`/api/admin/comms/subscribers/${id}/stop`, { method: 'POST' });
      } else {
        if (!confirm(t('cmRemoveConfirm'))) return;
        await api(`/api/admin/comms/subscribers/${id}`, { method: 'DELETE' });
      }
      loadComms();
    }));
  }

  function renderCmNewsletters() {
    const box = document.getElementById('cm-newsletters');
    const list = cmData.newsletters || [];
    if (!list.length) { box.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('cmNoNewsletters'))}</p>`; return; }
    box.innerHTML = '';
    list.forEach(n => box.appendChild(cmNewsletterCard(n)));
  }
  function cmEditor(item) {
    return `<div class="admin-form-row">
        <div class="field"><label>${escapeHtml(t('cmSubjectNl'))}</label><input type="text" class="cm-s-nl" maxlength="200"></div>
        <div class="field"><label>${escapeHtml(t('cmSubjectEn'))}</label><input type="text" class="cm-s-en" maxlength="200"></div>
      </div>
      <div class="admin-form-row">
        <div class="field"><label>${escapeHtml(t('cmBodyNl'))}</label><textarea data-editor="plain" class="cm-b-nl" rows="14" maxlength="8000"></textarea></div>
        <div class="field"><label>${escapeHtml(t('cmBodyEn'))}</label><textarea data-editor="plain" class="cm-b-en" rows="14" maxlength="8000"></textarea></div>
      </div>
      <p class="admin-empty-note">${escapeHtml(t('cmTokensHint'))}</p>
      <div class="cm-warn-box">${cmWarn(item.warnings)}</div>`;
  }
  function cmFill(card, item) {
    const q = (s) => card.querySelector(s);
    q('.cm-s-nl').value = item.subject_nl || ''; q('.cm-s-en').value = item.subject_en || '';
    q('.cm-b-nl').value = item.body_nl || ''; q('.cm-b-en').value = item.body_en || '';
  }
  const cmFields = (card) => ({
    subject_nl: card.querySelector('.cm-s-nl').value, subject_en: card.querySelector('.cm-s-en').value,
    body_nl: card.querySelector('.cm-b-nl').value, body_en: card.querySelector('.cm-b-en').value,
  });

  function cmNewsletterCard(n) {
    const card = document.createElement('div');
    card.className = 'whisper-p-row cm-nl';
    const people = cmData.counts[n.list].active;
    const statusKey = { draft: 'cmStDraft', scheduled: 'cmStScheduled', sending: 'cmStSending', sent: 'cmStSent' }[n.status] || 'cmStDraft';
    const head = `<div class="whisper-p-head"><strong>${escapeHtml(cmListName(n.list))}</strong>
      <span class="whisper-p-status ${n.status === 'draft' ? '' : 'whisper-p-status-open'}">${escapeHtml(t(statusKey))}</span>
      <span class="cm-nl-by">${escapeHtml(/ \[app\]$/.test(n.created_by || '') ? t('cmByApp', { name: n.created_by.replace(/ \[app\]$/, '') }) : (n.created_by || ''))}</span></div>`;
    if (n.status === 'sent' || n.status === 'sending') {
      card.innerHTML = `${head}<p class="admin-empty-note">${escapeHtml(n.status === 'sent'
        ? t('cmSentLine', { when: cmWhen(n.sent_at), n: n.sent_count ?? 0, failed: n.failed_count ?? 0 })
        : t('cmSendingLine'))}</p>
        <details><summary>${escapeHtml(n.subject_nl || n.subject_en)}</summary><p style="white-space:pre-line;">${escapeHtml(n.body_nl || n.body_en)}</p>
        ${n.subject_en && n.subject_nl ? `<hr><p><strong>${escapeHtml(n.subject_en)}</strong></p><p style="white-space:pre-line;">${escapeHtml(n.body_en)}</p>` : ''}</details>`;
      return card;
    }
    const nextAt = cmData.next[n.list];
    card.innerHTML = `${head}
      ${n.status === 'scheduled' ? `<p class="cm-sched">${escapeHtml(t('cmScheduledLine', { when: cmWhen(n.scheduled_for), n: people }))}</p>` : ''}
      <div class="field cm-list-pick" ${n.status === 'draft' ? '' : 'hidden'}><label>${escapeHtml(t('cmForList'))}</label>
        <select class="cm-list"><option value="parents">${escapeHtml(t('cmListParents'))}</option><option value="teachers">${escapeHtml(t('cmListTeachers'))}</option></select></div>
      ${cmEditor(n)}
      <p class="form-success cm-ok" hidden></p><p class="form-error cm-err" hidden></p>
      <div class="whisper-q-btns">
        <button type="button" class="btn-ghost btn-small" data-a="save">${escapeHtml(t('adminSaveChanges'))}</button>
        <button type="button" class="btn-ghost btn-small" data-a="test">${escapeHtml(t('cmTestMe'))}</button>
        ${n.status === 'draft'
          ? `<button type="button" class="btn-primary btn-small" data-a="approve">${escapeHtml(nextAt ? t('cmApproveFor', { when: cmWhen(nextAt) }) : t('cmApprove'))}</button>
             <button type="button" class="btn-ghost btn-small" data-a="pick" data-no-busy>${escapeHtml(t('cmPickTime'))}</button>`
          : `<button type="button" class="btn-ghost btn-small" data-a="unschedule">${escapeHtml(t('cmUnschedule'))}</button>`}
        <button type="button" class="btn-ghost btn-small" data-a="now">${escapeHtml(t('cmSendNow', { n: people }))}</button>
        <button type="button" class="btn-ghost btn-small" data-a="del">${escapeHtml(t('cmDelete'))}</button>
      </div>
      <div class="cm-pick" hidden>
        <label>${escapeHtml(t('cmPickLabel'))} <input type="datetime-local" class="cm-at"></label>
        <button type="button" class="btn-primary btn-small" data-a="approve-at">${escapeHtml(t('cmApproveAt'))}</button>
      </div>`;
    cmFill(card, n);
    card.querySelector('.cm-list').value = n.list;
    card.querySelector('.cm-at').value = cmDefaultAt(n.list);
    const q = (s) => card.querySelector(s);
    const say = (ok, msg) => { q('.cm-ok').hidden = !ok; q('.cm-err').hidden = ok; (ok ? q('.cm-ok') : q('.cm-err')).textContent = msg; };
    const save = async () => {
      const body = cmFields(card);
      if (n.status === 'draft') body.list = q('.cm-list').value;
      const out = await api(`/api/admin/comms/newsletters/${n.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      q('.cm-warn-box').innerHTML = cmWarn(out.newsletter && out.newsletter.warnings);
      return out;
    };
    const act = async (fn) => { try { await fn(); } catch (e) { say(false, e.message || t('errorGeneric')); throw e; } };
    card.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => act(async () => {
      const a = b.dataset.a;
      if (a === 'save') { await save(); say(true, t('adminSaved')); }
      if (a === 'test') { await save(); const out = await api(`/api/admin/comms/newsletters/${n.id}/test`, { method: 'POST' }); say(true, t('cmTestSent', { to: out.to, langs: out.languages.join(' + ') })); }
      if (a === 'pick') { q('.cm-pick').hidden = !q('.cm-pick').hidden; }
      if (a === 'approve' || a === 'approve-at') {
        await save();
        const body = a === 'approve-at' ? { at: q('.cm-at').value } : {};
        const out = await api(`/api/admin/comms/newsletters/${n.id}/approve`, { method: 'POST', body: JSON.stringify(body) });
        alert(t('cmApprovedAlert', { when: cmWhen(out.scheduledFor) }));
        await loadComms();
      }
      if (a === 'unschedule') { await api(`/api/admin/comms/newsletters/${n.id}/unschedule`, { method: 'POST' }); await loadComms(); }
      if (a === 'now') {
        if (!confirm(t('cmSendNowConfirm', { n: people, list: cmListName(n.list) }))) return;
        await save();
        await api(`/api/admin/comms/newsletters/${n.id}/send-now`, { method: 'POST' });
        await loadComms();
        setTimeout(loadComms, 8000);
      }
      if (a === 'del') {
        if (!confirm(t('cmDeleteConfirm'))) return;
        await api(`/api/admin/comms/newsletters/${n.id}`, { method: 'DELETE' });
        await loadComms();
      }
    })));
    return card;
  }

  function renderCmWelcome() {
    const box = document.getElementById('cm-welcome');
    box.innerHTML = '';
    (cmData.welcome || []).forEach(w => {
      const card = document.createElement('div');
      card.className = 'whisper-p-row cm-welcome';
      card.innerHTML = `<div class="whisper-p-head"><strong>${escapeHtml(t('cmWelcomeName', { list: cmListName(w.list), day: cmData.welcomeDays[w.step] }))}</strong>
          <label class="acc-checkbox-row cm-on"><input type="checkbox" class="cm-active"${w.active ? ' checked' : ''}> <span>${escapeHtml(t('cmWelcomeOn'))}</span></label></div>
        ${cmEditor(w)}
        <p class="form-success cm-ok" hidden></p><p class="form-error cm-err" hidden></p>
        <div class="whisper-q-btns">
          <button type="button" class="btn-ghost btn-small" data-a="save">${escapeHtml(t('adminSaveChanges'))}</button>
          <button type="button" class="btn-ghost btn-small" data-a="test">${escapeHtml(t('cmTestMe'))}</button>
        </div>`;
      cmFill(card, w);
      const q = (s) => card.querySelector(s);
      const say = (ok, msg) => { q('.cm-ok').hidden = !ok; q('.cm-err').hidden = ok; (ok ? q('.cm-ok') : q('.cm-err')).textContent = msg; };
      const save = async (extra) => {
        const out = await api(`/api/admin/comms/welcome/${w.id}`, { method: 'PUT', body: JSON.stringify({ ...cmFields(card), ...(extra || {}) }) });
        q('.cm-warn-box').innerHTML = cmWarn(out.welcome && out.welcome.warnings);
        return out;
      };
      q('[data-a="save"]').addEventListener('click', async () => { try { await save(); say(true, t('adminSaved')); } catch (e) { say(false, e.message); throw e; } });
      q('[data-a="test"]').addEventListener('click', async () => {
        try { await save(); const out = await api(`/api/admin/comms/welcome/${w.id}/test`, { method: 'POST' }); say(true, t('cmTestSent', { to: out.to, langs: out.languages.join(' + ') })); }
        catch (e) { say(false, e.message); throw e; }
      });
      q('.cm-active').addEventListener('change', async (e) => {
        const on = e.target.checked;
        e.target.disabled = true;
        try { await save({ active: on }); say(true, t(on ? 'cmWelcomeNowOn' : 'cmWelcomeNowOff')); }
        catch (err) { e.target.checked = !on; say(false, err.message); }
        e.target.disabled = false;
      });
      box.appendChild(card);
    });
  }

  function renderCmTimes() {
    const box = document.getElementById('cm-times');
    box.innerHTML = ['parents', 'teachers'].map(l => `<div class="cm-time-row" data-list="${l}">
      <strong>${escapeHtml(cmListName(l))}</strong>
      <select class="cm-t-day">${[1, 2, 3, 4, 5, 6, 0].map(d => `<option value="${d}"${d === cmData.times[l].day ? ' selected' : ''}>${escapeHtml(cmDay(d))}</option>`).join('')}</select>
      <input type="time" class="cm-t-time" value="${escapeHtml(cmData.times[l].time)}" step="300">
      <span class="admin-empty-note">${escapeHtml(cmData.next[l] ? t('cmNextLine', { when: cmWhen(cmData.next[l]) }) : '')}</span></div>`).join('');
  }

  function setupComms() {
    document.querySelectorAll('#panel-comms [data-i18n-placeholder], #cm-add-modal [data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-placeholder')); });
    let qt = null;
    document.getElementById('cm-f-list').addEventListener('change', loadCmSubs);
    document.getElementById('cm-f-status').addEventListener('change', loadCmSubs);
    document.getElementById('cm-f-q').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(loadCmSubs, 300); });
    const err = document.getElementById('cm-nl-error');
    document.getElementById('cm-blank-btn').addEventListener('click', async () => {
      err.hidden = true;
      try { await api('/api/admin/comms/newsletters', { method: 'POST', body: JSON.stringify({ list: document.getElementById('cm-new-list').value }) }); await loadComms(); }
      catch (e) { err.textContent = e.message; err.hidden = false; throw e; }
    });
    document.getElementById('cm-write-btn').addEventListener('click', async (e) => {
      err.hidden = true;
      const btn = e.currentTarget, label = btn.textContent;
      btn.textContent = t('cmWriting');
      try {
        await api('/api/admin/comms/newsletters/write', { method: 'POST', body: JSON.stringify({ list: document.getElementById('cm-new-list').value, notes: document.getElementById('cm-notes').value }) });
        document.getElementById('cm-notes').value = '';
        await loadComms();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; throw ex; }
      finally { btn.textContent = label; }
    });
    document.getElementById('cm-times-save').addEventListener('click', async () => {
      const body = {};
      document.querySelectorAll('#cm-times .cm-time-row').forEach(r => { body[r.dataset.list] = { day: Number(r.querySelector('.cm-t-day').value), time: r.querySelector('.cm-t-time').value }; });
      await api('/api/admin/comms/times', { method: 'PUT', body: JSON.stringify(body) });
      await loadComms();
    });
    // add someone
    const modal = document.getElementById('cm-add-modal');
    document.getElementById('cm-add-btn').addEventListener('click', () => {
      ['cm-add-email', 'cm-add-name', 'cm-add-note'].forEach(id => { document.getElementById(id).value = ''; });
      document.getElementById('cm-add-asked').checked = false;
      document.getElementById('cm-add-error').hidden = true;
      modal.hidden = false;
    });
    document.getElementById('cm-add-close-btn').addEventListener('click', () => { modal.hidden = true; });
    document.getElementById('cm-add-save').addEventListener('click', async () => {
      const er = document.getElementById('cm-add-error'); er.hidden = true;
      try {
        await api('/api/admin/comms/subscribers', { method: 'POST', body: JSON.stringify({
          email: document.getElementById('cm-add-email').value, name: document.getElementById('cm-add-name').value,
          list: document.getElementById('cm-add-list').value, locale: document.getElementById('cm-add-locale').value,
          note: document.getElementById('cm-add-note').value, asked: document.getElementById('cm-add-asked').checked }) });
        modal.hidden = true;
        await loadComms();
      } catch (e) { er.textContent = e.message; er.hidden = false; throw e; }
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
