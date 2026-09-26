// ── riddle.js — Riddles from the Whispering Forest (Mare App 4).
// Shows this month's riddle; each clue has its own Check button, the
// secret code unlocks Mare's reward. Every check goes to the server
// (riddles.js) — the answers are never in this page. ──
(function () {
  const t = (key, vars) => window.MareI18n.t(key, vars);
  const nl = () => window.MareI18n.locale === 'nl';

  function para(text, cls) {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    p.textContent = text;
    return p;
  }

  function showReward(reward, promo) {
    document.getElementById('riddle-reward-text').textContent = reward || '';
    if (promo) {
      document.getElementById('riddle-promo').textContent = promo;
      document.getElementById('riddle-promo-row').hidden = false;
      const copy = document.getElementById('riddle-promo-copy');
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(promo);
          copy.textContent = t('homeNoticeCopied');
          setTimeout(() => { copy.textContent = t('homeNoticeCopy'); }, 2000);
        } catch { /* the code is on screen */ }
      };
    }
    document.getElementById('riddle-reward').hidden = false;
  }

  function setSparkles(n) {
    const el = document.getElementById('riddle-sparkles');
    if (!n) { el.hidden = true; return; }
    el.textContent = `${t('riddleSparkles', { n })} ${'✨'.repeat(Math.min(n, 12))}`;
    el.hidden = false;
  }

  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, locale: nl() ? 'nl' : 'en' }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || t('errorGeneric'));
    return out;
  }

  async function init() {
    await window.MareI18n.ready;
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });

    let data;
    try { data = await (await fetch(`/api/club/riddle?lang=${nl() ? 'nl' : 'en'}`)).json(); } catch { return; }
    const me = data.me || {};
    if (me.signedIn) {
      document.getElementById('login-link').hidden = true;
      document.getElementById('register-link').hidden = true;
      const out = document.getElementById('topbar-signout-btn');
      out.hidden = false;
      out.addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/'; });
    }
    const r = data.riddle;
    if (!r) { document.getElementById('riddle-none').hidden = false; return; }
    setSparkles(data.sparkles);

    document.getElementById('riddle-title').textContent = r.title;
    document.getElementById('riddle-intro').textContent = r.intro;
    document.getElementById('riddle-code-label').textContent = r.codeLabel;

    const canPlay = !!me.member;
    const steps = document.getElementById('riddle-steps');
    r.steps.forEach((s, i) => {
      const box = document.createElement('div');
      box.className = 'riddle-step';
      if (s.heading) box.appendChild(para(s.heading, 'riddle-step-heading'));
      if (s.text) box.appendChild(para(s.text, 'riddle-step-text'));
      if (s.question) box.appendChild(para(s.question, 'riddle-step-question'));
      const row = document.createElement('div');
      row.className = 'riddle-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 40;
      input.autocomplete = 'off';
      input.setAttribute('aria-label', s.question || s.heading || `Clue ${i + 1}`);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-ghost';
      btn.textContent = t('riddleCheck');
      row.append(input, btn);
      box.appendChild(row);
      const fb = para('', 'riddle-feedback');
      fb.hidden = true;
      box.appendChild(fb);
      const after = para('', 'riddle-after');
      after.hidden = true;
      box.appendChild(after);
      const check = async () => {
        if (!canPlay) { document.getElementById('riddle-join').scrollIntoView({ behavior: 'smooth' }); return; }
        if (!input.value.trim()) return;
        btn.disabled = true;
        try {
          const out = await post(`/api/club/riddle/${r.id}/check`, { step: i, value: input.value });
          fb.textContent = out.correct ? t('riddleRight') : t('riddleNotQuite');
          fb.className = `riddle-feedback ${out.correct ? 'riddle-ok' : 'riddle-no'}`;
          fb.hidden = false;
          box.classList.toggle('riddle-step-done', !!out.correct);
          if (out.after) { after.textContent = out.after; after.hidden = false; }
        } catch (e) {
          fb.textContent = e.message;
          fb.className = 'riddle-feedback riddle-no';
          fb.hidden = false;
        }
        btn.disabled = false;
      };
      btn.addEventListener('click', check);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
      steps.appendChild(box);
    });

    const codeBtn = document.getElementById('riddle-code-btn');
    const codeInput = document.getElementById('riddle-code');
    const codeFb = document.getElementById('riddle-code-feedback');
    const solve = async () => {
      if (!canPlay) { document.getElementById('riddle-join').scrollIntoView({ behavior: 'smooth' }); return; }
      if (!codeInput.value.trim()) return;
      codeBtn.disabled = true;
      try {
        const out = await post(`/api/club/riddle/${r.id}/solve`, { code: codeInput.value });
        if (out.correct) {
          codeFb.hidden = true;
          showReward(out.reward, out.promoCode);
          setSparkles(out.sparkles);
        } else {
          codeFb.textContent = t('riddleCodeWrong');
          codeFb.className = 'riddle-feedback riddle-no';
          codeFb.hidden = false;
        }
      } catch (e) {
        codeFb.textContent = e.message;
        codeFb.className = 'riddle-feedback riddle-no';
        codeFb.hidden = false;
      }
      codeBtn.disabled = false;
    };
    codeBtn.addEventListener('click', solve);
    codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') solve(); });

    if (data.solved) showReward(data.reward, data.promoCode);

    if (!canPlay) {
      const join = document.getElementById('riddle-join');
      document.getElementById('riddle-join-text').textContent = me.isParent ? t('riddleJoinMember') : t('riddleJoinRegister');
      if (me.isParent) {
        const b = document.getElementById('riddle-join-btn');
        b.href = '/club-mare.html';
        b.textContent = t('clubMareJoinButton');
      }
      join.hidden = false;
    }
    document.getElementById('riddle-card').hidden = false;
  }
  init();
})();
