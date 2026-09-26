// ── club-whisper.js — the Whisper Word of the Month box on the Club
// Mare page (Mare App 4). Everyone sees this month's question, last
// month's Whisper Word and the link to the Forest of Words. A signed-in
// parent who is a Club Mare member plants a word for one of their
// children; anyone else gets the right next step (register, join, add
// a child). Server rules live in whisper.js. ──
(function () {
  const t = (key, vars) => window.MareI18n.t(key, vars);
  const nl = () => window.MareI18n.locale === 'nl';

  function ageText(band) {
    return band ? String(band).replace('-', '–') : '';
  }

  function statusText(m) {
    if (m.isWinner) return t('whisperStatusWinner');
    if (m.status === 'approved' && m.kind === 'question') return t('wqStatusShown');
    if (m.status === 'approved' && m.kind === 'makers') return t('mkStatusShown');
    if (m.status === 'approved') return t('whisperStatusApproved');
    if (m.status === 'rejected') return t('whisperStatusRejected');
    return t('whisperStatusPending');
  }

  function renderMine(mine) {
    const box = document.getElementById('whisper-mine');
    const list = document.getElementById('whisper-mine-list');
    list.innerHTML = '';
    if (!mine.length) { box.hidden = true; return; }
    mine.forEach(m => {
      const li = document.createElement('li');
      const w = document.createElement('strong');
      // Whisper Question answers show a snippet of the answer instead of a word.
      w.textContent = m.kind === 'question'
        ? `“${m.answer.length > 40 ? m.answer.slice(0, 40) + '…' : m.answer}”`
        : m.kind === 'makers' ? `🖼 ${m.word || t('mkUntitled')}` : m.word;
      const who = document.createElement('span');
      who.className = 'whisper-mine-who';
      who.textContent = ` — ${m.name}`;
      const st = document.createElement('span');
      st.className = `whisper-status whisper-status-${m.isWinner ? 'winner' : m.status}`;
      st.textContent = statusText(m);
      li.append(w, who, st);
      list.appendChild(li);
    });
    box.hidden = false;
  }

  function answerCard(a) {
    const div = document.createElement('div');
    div.className = 'wq-answer';
    const p = document.createElement('p');
    p.textContent = `“${a.answer}”`;
    const by = document.createElement('span');
    by.className = 'wq-answer-by';
    by.textContent = `— ${a.name}${a.ageBand ? `, ${ageText(a.ageBand)}` : ''}`;
    div.append(p, by);
    return div;
  }

  // Mare's Whisper Question: the question, approved answers, the form
  // for members, and a fold-out of earlier questions.
  function renderQuestion(data, me) {
    const q = data.question;
    const past = data.pastQuestions || [];
    const section = document.getElementById('wq');
    if (!q && !past.length) { section.hidden = true; return; }
    document.getElementById('wq-title').textContent = q ? q.title : t('wqNoQuestion');
    document.getElementById('wq-body').textContent = q ? q.body : '';

    const list = document.getElementById('wq-answers-list');
    list.innerHTML = '';
    (data.answers || []).forEach(a => list.appendChild(answerCard(a)));
    document.getElementById('wq-answers').hidden = !(data.answers || []).length;

    const pastList = document.getElementById('wq-past-list');
    pastList.innerHTML = '';
    past.forEach(pq => {
      const h = document.createElement('h4');
      h.textContent = pq.title;
      pastList.appendChild(h);
      pq.answers.forEach(a => pastList.appendChild(answerCard(a)));
    });
    document.getElementById('wq-past').hidden = !past.length;

    const form = document.getElementById('wq-form');
    if (q && me.isParent && me.member && me.children.length) {
      const sel = document.getElementById('wq-child');
      sel.innerHTML = '';
      me.children.forEach(c => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.name;
        sel.appendChild(o);
      });
      form.hidden = false;
      form.onsubmit = async (e) => {
        e.preventDefault();
        const err = document.getElementById('wq-error');
        err.hidden = true;
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
          const res = await fetch('/api/club/whisper/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ promptId: q.id, childId: sel.value, answer: document.getElementById('wq-answer').value, locale: nl() ? 'nl' : 'en' }),
          });
          const out = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(out.error || t('errorGeneric'));
          document.getElementById('wq-answer').value = '';
          document.getElementById('wq-thanks').hidden = false;
          setTimeout(() => { document.getElementById('wq-thanks').hidden = true; }, 8000);
          load();
        } catch (ex) {
          err.textContent = ex.message;
          err.hidden = false;
        } finally {
          btn.disabled = false;
        }
      };
    } else {
      form.hidden = true;
    }
    section.hidden = false;
  }

  // ── Makers' Corner ──
  let mkTimer = null;
  function openLightbox(g) {
    document.getElementById('mk-lightbox-img').src = g.imageUrl;
    document.getElementById('mk-lightbox-title').textContent = g.title || '';
    document.getElementById('mk-lightbox-about').textContent = g.about || '';
    document.getElementById('mk-lightbox-by').textContent = `— ${g.name}${g.ageBand ? `, ${ageText(g.ageBand)}` : ''}`;
    document.getElementById('mk-lightbox').hidden = false;
  }
  function renderMakers(data, me) {
    const mk = data.makers || { gallery: [] };
    const section = document.getElementById('mk');
    const theme = mk.theme;
    document.getElementById('mk-title').textContent = theme ? theme.title : t('mkDefaultTitle');
    document.getElementById('mk-body').textContent = theme ? theme.body : t('mkDefaultBody');

    const track = document.getElementById('mk-track');
    track.innerHTML = '';
    mk.gallery.forEach(g => {
      const fig = document.createElement('button');
      fig.type = 'button';
      fig.className = 'mk-item';
      const img = document.createElement('img');
      img.src = g.imageUrl;
      img.alt = g.title || '';
      img.loading = 'lazy';
      const cap = document.createElement('span');
      cap.className = 'mk-cap';
      cap.textContent = `${g.title ? g.title + ' — ' : ''}${g.name}${g.ageBand ? `, ${ageText(g.ageBand)}` : ''}`;
      fig.append(img, cap);
      fig.addEventListener('click', () => openLightbox(g));
      track.appendChild(fig);
    });
    document.getElementById('mk-gallery').hidden = !mk.gallery.length;
    document.getElementById('mk-empty').hidden = !!mk.gallery.length;
    // Gently moves along every 5 seconds; stops while someone is looking.
    clearInterval(mkTimer);
    const step = (dir) => {
      const w = track.clientWidth * 0.8;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      track.scrollTo({ left: dir > 0 && atEnd ? 0 : track.scrollLeft + dir * w, behavior: 'smooth' });
    };
    document.getElementById('mk-prev').onclick = () => step(-1);
    document.getElementById('mk-next').onclick = () => step(1);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (mk.gallery.length > 2 && !reduce) {
      mkTimer = setInterval(() => { if (!track.matches(':hover')) step(1); }, 5000);
    }

    const form = document.getElementById('mk-form');
    if (me.isParent && me.member && me.children.length) {
      const sel = document.getElementById('mk-child');
      sel.innerHTML = '';
      me.children.forEach(c => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.name;
        sel.appendChild(o);
      });
      const file = document.getElementById('mk-file');
      file.onchange = () => {
        const f = file.files[0];
        const pv = document.getElementById('mk-preview');
        if (f) { pv.src = URL.createObjectURL(f); pv.hidden = false; } else { pv.hidden = true; }
      };
      form.hidden = false;
      form.onsubmit = async (e) => {
        e.preventDefault();
        const err = document.getElementById('mk-error');
        err.hidden = true;
        const f = file.files[0];
        if (!f) { err.textContent = t('mkNeedFile'); err.hidden = false; return; }
        if (!/^image\/(jpeg|png)$/.test(f.type)) { err.textContent = t('mkWrongType'); err.hidden = false; return; }
        if (f.size > 8 * 1024 * 1024) { err.textContent = t('mkTooBig'); err.hidden = false; return; }
        if (!document.getElementById('mk-consent').checked) { err.textContent = t('mkNeedConsent'); err.hidden = false; return; }
        const btn = document.getElementById('mk-submit');
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = t('mkUploading');
        try {
          const q = new URLSearchParams({
            childId: sel.value, title: document.getElementById('mk-name').value,
            about: document.getElementById('mk-about').value, consent: '1', locale: nl() ? 'nl' : 'en',
          });
          const res = await fetch(`/api/club/makers/upload?${q}`, { method: 'POST', headers: { 'Content-Type': f.type }, body: f });
          const out = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(out.error || t('errorGeneric'));
          form.reset();
          document.getElementById('mk-preview').hidden = true;
          document.getElementById('mk-thanks').hidden = false;
          setTimeout(() => { document.getElementById('mk-thanks').hidden = true; }, 8000);
          load();
        } catch (ex) {
          err.textContent = ex.message;
          err.hidden = false;
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      };
    } else {
      form.hidden = true;
    }
    section.hidden = false;
  }

  async function load() {
    let data;
    try {
      const res = await fetch(`/api/club/whisper?lang=${nl() ? 'nl' : 'en'}`);
      data = await res.json();
    } catch { return; }

    const section = document.getElementById('whisper');
    const prompt = data.prompt;
    document.getElementById('whisper-title').textContent = prompt ? prompt.title : t('whisperNoPromptTitle');
    document.getElementById('whisper-body').textContent = prompt ? prompt.body : t('whisperNoPromptBody');

    if (data.lastWinner) {
      document.getElementById('whisper-last-word').textContent = data.lastWinner.word;
      document.getElementById('whisper-last-by').textContent =
        `— ${data.lastWinner.name}${data.lastWinner.ageBand ? `, ${ageText(data.lastWinner.ageBand)}` : ''}`;
      document.getElementById('whisper-last').hidden = false;
    }

    const me = data.me || {};
    const form = document.getElementById('whisper-form');
    if (!me.isParent) {
      document.getElementById('whisper-signin').hidden = false;
    } else if (!me.member) {
      // The page's own "Join Club Mare" box (club-mare.js) handles joining;
      // point to it rather than duplicating it.
      document.getElementById('whisper-signin').hidden = true;
    } else if (!me.children.length) {
      document.getElementById('whisper-need-child').hidden = false;
    } else if (prompt) {
      const sel = document.getElementById('whisper-child');
      sel.innerHTML = '';
      me.children.forEach(c => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.name;
        sel.appendChild(o);
      });
      form.hidden = false;
      form.onsubmit = async (e) => {
        e.preventDefault();
        const err = document.getElementById('whisper-error');
        err.hidden = true;
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
          const res = await fetch('/api/club/whisper/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              promptId: prompt.id,
              childId: sel.value,
              word: document.getElementById('whisper-word').value,
              reason: document.getElementById('whisper-reason').value,
              locale: nl() ? 'nl' : 'en',
            }),
          });
          const out = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(out.error || t('errorGeneric'));
          document.getElementById('whisper-word').value = '';
          document.getElementById('whisper-reason').value = '';
          document.getElementById('whisper-thanks').hidden = false;
          setTimeout(() => { document.getElementById('whisper-thanks').hidden = true; }, 8000);
          load(); // refresh "Your words"
        } catch (ex) {
          err.textContent = ex.message;
          err.hidden = false;
        } finally {
          btn.disabled = false;
        }
      };
    }
    renderMine(me.mine || []);
    section.hidden = false;
    renderQuestion(data, me);
    renderMakers(data, me);
  }

  async function loadRiddleTeaser() {
    try {
      const data = await (await fetch(`/api/club/riddle?lang=${nl() ? 'nl' : 'en'}`)).json();
      if (!data.riddle) return;
      document.getElementById('rd-teaser-title').textContent = data.riddle.title;
      document.getElementById('rd-teaser').hidden = false;
    } catch { /* no teaser */ }
  }

  async function init() {
    await window.MareI18n.ready;
    load();
    loadRiddleTeaser();
    // After "Join Club Mare" on this page, reload the box so the form appears.
    document.getElementById('mk-lightbox-close').addEventListener('click', () => { document.getElementById('mk-lightbox').hidden = true; });
    const joinBtn = document.getElementById('cm-join-btn');
    if (joinBtn) joinBtn.addEventListener('click', () => setTimeout(load, 800));
  }
  init();
})();
