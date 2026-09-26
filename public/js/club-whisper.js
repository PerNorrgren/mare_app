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
      w.textContent = m.word;
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
  }

  async function init() {
    await window.MareI18n.ready;
    load();
    // After "Join Club Mare" on this page, reload the box so the form appears.
    const joinBtn = document.getElementById('cm-join-btn');
    if (joinBtn) joinBtn.addEventListener('click', () => setTimeout(load, 800));
  }
  init();
})();
