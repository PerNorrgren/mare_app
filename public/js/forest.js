// ── forest.js — the Forest of Words (Mare App 4). Approved words sit at
// fixed spots across the forest picture, so the forest fills up in a
// natural-looking way instead of a list. Whisper Words of the Month
// glow gold; a signed-in family's own words are outlined; words their
// children planted that aren't approved yet are listed below as "still
// growing" (never on the picture). Non-members see a small taste. ──
(function () {
  const t = (key, vars) => window.MareI18n.t(key, vars);

  // Spots as % of the picture (x, y). Spread round the edges and upper
  // half so the words frame the scene rather than cover its middle.
  const SLOTS = [
    [12, 12], [30, 7], [50, 5], [70, 7], [88, 12],
    [8, 24], [24, 20], [76, 20], [92, 24],
    [14, 34], [86, 34], [34, 17], [66, 17],
    [6, 44], [22, 42], [78, 42], [94, 44],
    [12, 53], [88, 53], [28, 30], [72, 30],
    [7, 62], [21, 60], [79, 60], [93, 62],
    [14, 70], [86, 70], [5, 78], [24, 78], [76, 78], [95, 78],
    [12, 86], [30, 88], [70, 88], [88, 86],
    [45, 94], [55, 94], [20, 95], [80, 95], [50, 12],
  ];

  function ageText(band) { return band ? String(band).replace('-', '–') : ''; }

  function openCard(w) {
    document.getElementById('forest-card-word').textContent = w.word;
    document.getElementById('forest-card-reason').textContent = w.reason || '';
    document.getElementById('forest-card-reason').hidden = !w.reason;
    document.getElementById('forest-card-by').textContent =
      `— ${w.name}${w.ageBand ? `, ${ageText(w.ageBand)}` : ''}`;
    document.getElementById('forest-card-badge').hidden = !w.isWinner;
    document.getElementById('forest-card').hidden = false;
  }

  function setupLangSwitch() {
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });
  }

  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();
    document.getElementById('forest-card-close').addEventListener('click', () => {
      document.getElementById('forest-card').hidden = true;
    });

    let data;
    try {
      const res = await fetch(`/api/club/whisper?lang=${window.MareI18n.locale === 'nl' ? 'nl' : 'en'}`);
      data = await res.json();
    } catch { return; }
    const me = data.me || {};

    if (me.signedIn) {
      document.getElementById('login-link').hidden = true;
      document.getElementById('register-link').hidden = true;
      const out = document.getElementById('topbar-signout-btn');
      out.hidden = false;
      out.addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/'; });
    }

    document.getElementById('forest-bg').src = data.forestImageUrl || '/images/mare-front-cover.jpg';

    const layer = document.getElementById('forest-words');
    const words = data.forest || [];
    if (!words.length) document.getElementById('forest-empty').hidden = false;
    words.slice(0, SLOTS.length).forEach((w, i) => {
      const [x, y] = SLOTS[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'forest-word' + (w.isWinner ? ' forest-word-winner' : '') + (w.mine ? ' forest-word-mine' : '');
      b.style.left = `${x}%`;
      b.style.top = `${y}%`;
      b.style.animationDelay = `${(i % 7) * 0.35}s`;
      b.textContent = w.word;
      b.addEventListener('click', () => openCard(w));
      layer.appendChild(b);
    });
    if (words.some(w => w.mine)) document.getElementById('forest-legend-mine').hidden = false;

    // Signed out, or a parent who hasn't joined: a taste + the next step.
    if (!me.member) {
      const join = document.getElementById('forest-join');
      const text = document.getElementById('forest-join-text');
      const btn = document.getElementById('forest-join-btn');
      if (me.isParent) {
        text.textContent = t('forestJoinMember');
        btn.href = '/club-mare.html';
        btn.textContent = t('clubMareJoinButton');
      } else {
        text.textContent = data.previewLimited ? t('forestJoinPreview', { n: data.forestTotal }) : t('forestJoinPlant');
      }
      join.hidden = false;
    }

    const growing = (me.mine || []).filter(m => m.status === 'pending');
    if (growing.length) {
      const list = document.getElementById('forest-growing-list');
      growing.forEach(m => {
        const li = document.createElement('li');
        li.textContent = `${m.word} — ${m.name}`;
        list.appendChild(li);
      });
      document.getElementById('forest-growing').hidden = false;
    }
  }

  init();
})();
