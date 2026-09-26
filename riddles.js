// ─────────────────────────────────────────────────────────────────────
// RIDDLES FROM THE WHISPERING FOREST (Mare App 4) — Club Mare step 6.
//
// A monthly book treasure hunt. The riddle and its clues are public,
// but every answer is checked on the server: the page never contains
// the answers, the secret code or the promo code, so they can't be
// found by looking at the page's source. Checking needs a free Club
// Mare membership (the child plays through their parent's account).
// A correct code shows Mare's reward text with the promo code and adds
// a Sparkle to the family's collection.
// ─────────────────────────────────────────────────────────────────────

const ATTEMPTS_PER_10_MIN = 30;
const attempts = new Map(); // parentId -> [timestamps]

// '10 – 3', '10-3', ' TEN three ' all compare equal.
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-–—_.,:;/'"!?]+/g, '');
}
function matches(value, accepted) {
  const v = norm(value);
  return !!v && String(accepted || '').split(',').map(norm).filter(Boolean).includes(v);
}
function parseSteps(json) {
  try { const s = JSON.parse(json || '[]'); return Array.isArray(s) ? s : []; } catch { return []; }
}
function tooMany(parentId) {
  const now = Date.now();
  const list = (attempts.get(parentId) || []).filter(t => now - t < 10 * 60 * 1000);
  list.push(now);
  attempts.set(parentId, list);
  return list.length > ATTEMPTS_PER_10_MIN;
}

function register(app, { db, auth, getOptionalUser }) {

  function publicRiddle(r, nl) {
    const L = (en, nlv) => (nl && nlv ? nlv : en) || '';
    return {
      id: r.id,
      month: r.month,
      title: L(r.title_en, r.title_nl),
      intro: L(r.intro_en, r.intro_nl),
      codeLabel: L(r.code_label_en, r.code_label_nl),
      // Clue texts and questions only - never the answers.
      steps: parseSteps(r.steps_json).map(s => ({
        heading: L(s.headingEn, s.headingNl),
        text: L(s.textEn, s.textNl),
        question: L(s.questionEn, s.questionNl),
      })),
    };
  }

  function rewardFor(r, nl) {
    const text = (nl && r.reward_nl ? r.reward_nl : r.reward_en) || '';
    return text.replace(/\[PROMOCODE\]/g, r.promo_code || '');
  }

  function member(user) {
    if (!user || user.role !== 'parent') return false;
    const m = db.getClubMareMembership(user.id);
    return !!(m && m.tier > 0);
  }

  app.get('/api/club/riddle', (req, res) => {
    const nl = req.query.lang === 'nl';
    const user = getOptionalUser(req);
    const r = db.riddleGetOpen();
    const isMember = member(user);
    const solved = !!(r && isMember && db.riddleSolvedBy(r.id, user.id));
    res.json({
      riddle: r ? publicRiddle(r, nl) : null,
      me: { signedIn: !!user, isParent: !!(user && user.role === 'parent'), member: isMember },
      solved,
      // Already solved: the reward stays available to them.
      reward: solved ? rewardFor(r, nl) : null,
      promoCode: solved ? (r.promo_code || '') : null,
      sparkles: isMember ? db.riddleSparkles(user.id) : 0,
    });
  });

  const members = (req, res, next) => {
    if (!member(req.user)) return res.status(403).json({ error: req.body && req.body.locale === 'nl' ? 'Word eerst lid van Club Mare (gratis).' : 'Join Club Mare first (it’s free).' });
    next();
  };

  // One clue at a time: right or not, plus the clue's 'after' text.
  app.post('/api/club/riddle/:id/check', auth.requireAuthApi(['parent']), members, (req, res) => {
    const r = db.riddleGet(req.params.id);
    if (!r || r.status !== 'open') return res.status(404).json({ error: 'Not found' });
    if (tooMany(req.user.id)) return res.status(429).json({ error: req.body.locale === 'nl' ? 'Neem even pauze en probeer het over een paar minuten opnieuw.' : 'Take a little break and try again in a few minutes.' });
    const nl = req.body.locale === 'nl';
    const step = parseSteps(r.steps_json)[Number(req.body.step)];
    if (!step) return res.status(400).json({ error: 'No such clue' });
    const correct = matches(req.body.value, step.answers);
    res.json({ correct, after: correct ? ((nl && step.afterNl ? step.afterNl : step.afterEn) || '') : '' });
  });

  // The secret code: the reward and promo code only come back when right.
  app.post('/api/club/riddle/:id/solve', auth.requireAuthApi(['parent']), members, (req, res) => {
    const r = db.riddleGet(req.params.id);
    if (!r || r.status !== 'open') return res.status(404).json({ error: 'Not found' });
    if (tooMany(req.user.id)) return res.status(429).json({ error: req.body.locale === 'nl' ? 'Neem even pauze en probeer het over een paar minuten opnieuw.' : 'Take a little break and try again in a few minutes.' });
    const nl = req.body.locale === 'nl';
    if (!matches(req.body.code, r.code_answers)) return res.json({ correct: false });
    db.riddleMarkSolved(r.id, req.user.id);
    res.json({ correct: true, reward: rewardFor(r, nl), promoCode: r.promo_code || '', sparkles: db.riddleSparkles(req.user.id) });
  });

  // ── Admin ──
  const staff = auth.requireAuthApi(['admin', 'support']);
  app.get('/api/admin/riddles', staff, (req, res) => {
    res.json({ riddles: db.riddleList().map(r => ({ ...r, steps: parseSteps(r.steps_json), solvedCount: db.riddleSolveCount(r.id) })) });
  });
  app.post('/api/admin/riddles', staff, (req, res) => res.json({ ok: true, id: db.riddleCreate() }));
  app.patch('/api/admin/riddles/:id', staff, (req, res) => {
    const b = req.body || {};
    const f = {};
    const text = (k, max) => { if (b[k] !== undefined) f[k] = String(b[k]).slice(0, max); };
    ['title_en', 'title_nl'].forEach(k => text(k, 200));
    ['intro_en', 'intro_nl', 'code_label_en', 'code_label_nl', 'reward_en', 'reward_nl'].forEach(k => text(k, 3000));
    text('code_answers', 500);
    if (b.promo_code !== undefined) f.promo_code = String(b.promo_code).trim().toUpperCase().slice(0, 40) || null;
    if (b.month !== undefined) f.month = /^\d{4}-\d{2}$/.test(b.month) ? b.month : null;
    if (b.status !== undefined) {
      if (!['draft', 'open', 'closed'].includes(b.status)) return res.status(400).json({ error: 'Bad status' });
      f.status = b.status;
    }
    if (b.steps !== undefined) {
      if (!Array.isArray(b.steps)) return res.status(400).json({ error: 'steps must be a list' });
      const keys = ['headingEn', 'headingNl', 'textEn', 'textNl', 'questionEn', 'questionNl', 'answers', 'afterEn', 'afterNl'];
      f.steps_json = JSON.stringify(b.steps.slice(0, 12).map(s => Object.fromEntries(keys.map(k => [k, String((s && s[k]) || '').slice(0, 2000)]))));
    }
    const current = db.riddleGet(req.params.id);
    if (!current) return res.status(404).json({ error: 'Not found' });
    const next = { ...current, ...f };
    if (next.status === 'open') {
      if (!String(next.code_answers || '').trim()) return res.status(400).json({ error: 'Set the accepted secret code before opening the riddle.' });
      if (/\[PROMOCODE\]/.test(next.reward_en + next.reward_nl) && !next.promo_code) {
        return res.status(400).json({ error: 'The reward mentions [PROMOCODE] — fill in the promo code before opening the riddle.' });
      }
    }
    db.riddleUpdate(req.params.id, f);
    res.json({ ok: true });
  });
  app.delete('/api/admin/riddles/:id', staff, (req, res) => { db.riddleDelete(req.params.id); res.json({ ok: true }); });
}

module.exports = { register, norm, matches };
