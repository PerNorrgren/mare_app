// ─────────────────────────────────────────────────────────────────────
// WHISPER FOREST (Mare App 4) — Club Mare's participation engine.
//
// One loop powers every Club Mare activity: Mare asks something (a
// "prompt" — the Whisper Word of the Month first; questions, missions
// and riddles reuse it later) -> a child answers through their
// parent's account -> an adult approves -> the answer grows in the
// Forest of Words.
//
// Safeguards, by design:
//   - children never get their own login or email; submissions are
//     made from the parent's account, choosing one of their child
//     profiles, and carry only the child's first name and age band;
//   - nothing a child writes is shown to anyone else until a person
//     approves it (the app pre-screens each entry, but only to sort the
//     queue — it never approves anything itself);
//   - the Whisper Word of the Month winner is chosen by a person; the
//     app only suggests a shortlist.
// ─────────────────────────────────────────────────────────────────────

const WORD_MAX = 30;
const REASON_MAX = 280;
const ANSWER_MAX = 280;
const KINDS = ['word_month', 'question', 'makers'];
const MAKERS_MAX_BYTES = 8 * 1024 * 1024;
const MAKERS_PER_CHILD_PER_MONTH = 3;
const TITLE_MAX = 60;
const { cleanImage } = require('./image-clean');
const PER_CHILD_PER_PROMPT = 3;
const FOREST_MEMBER_LIMIT = 40;
const FOREST_PREVIEW_LIMIT = 8;
const DEFAULT_FOREST_IMAGE = '/images/mare-front-cover.jpg';

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0].slice(0, 30) || '?';
}

function pickLocale(req) {
  return (req.query.lang || (req.body && req.body.locale)) === 'nl' ? 'nl' : 'en';
}

function promptForLocale(p, locale) {
  if (!p) return null;
  const nl = locale === 'nl';
  return {
    id: p.id,
    month: p.month,
    title: (nl && p.title_nl) ? p.title_nl : p.title_en,
    body: (nl && p.body_nl) ? p.body_nl : (p.body_en || ''),
  };
}

function publicAnswer(s) {
  return { id: s.id, answer: s.reason || '', name: s.child_name, ageBand: s.age_band || null };
}

function publicWord(s, mineIds) {
  return {
    id: s.id,
    word: s.word,
    reason: s.reason || '',
    name: s.child_name,
    ageBand: s.age_band || null,
    isWinner: !!s.is_winner,
    month: s.prompt_month || null,
    mine: mineIds ? mineIds.has(s.id) : false,
  };
}

// Pull the first {...} or [...] out of a model reply and parse it.
function parseJsonReply(text, open, close) {
  const i = text.indexOf(open);
  const j = text.lastIndexOf(close);
  if (i < 0 || j <= i) throw new Error('no JSON in reply');
  return JSON.parse(text.slice(i, j + 1));
}

function register(app, { db, auth, media, anthropic, model, getOptionalUser }) {

  // Sorts the approval queue only. Anything it can't judge, or any
  // failure, comes back as 'check' so a person looks closely.
  async function screenSubmission(sub) {
    if (!anthropic) return db.whisperSetScreening(sub.id, 'check', 'Not screened (AI unavailable).');
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 200,
        system: `You pre-screen words that children aged about 8-12 submit to a children's book website, before a human moderator reviews them. The child submits one word and optionally a short reason. Reply with JSON only: {"flag":"ok"|"check","note":"..."}.
Use "check" if ANY of these apply: personal information (a surname, full name, school name, address, phone, email, username, anything identifying a real person or place near them); rude, unkind, sexual, violent or hateful content, including disguised or misspelled; anything suggesting the child may be unsafe, hurt, frightened or in distress; spam or nonsense that isn't playful. Otherwise "ok". Invented words, silly words and words in any language are fine.
The note is one short sentence for the moderator, in English. If distress is possible, say so plainly so the adult can follow up with the parent.`,
        messages: [{ role: 'user', content: sub.word
          ? `Word: ${sub.word}\nReason: ${sub.reason || '(none)'}`
          : `Answer to a question from the book's character: ${sub.reason || '(empty)'}` }],
      });
      const text = (response.content || []).map(c => c.text || '').join('');
      const out = parseJsonReply(text, '{', '}');
      db.whisperSetScreening(sub.id, out.flag === 'ok' ? 'ok' : 'check', String(out.note || '').slice(0, 300));
    } catch (e) {
      console.error('[whisper] screening failed:', e.message);
      db.whisperSetScreening(sub.id, 'check', 'Not screened (AI error) — please check.');
    }
  }

  // Pictures: the app looks at the image itself, only to sort the queue.
  async function screenImage(sub, buffer, type) {
    if (!anthropic) return db.whisperSetScreening(sub.id, 'check', 'Not screened (AI unavailable).');
    if (buffer.length > 3.5 * 1024 * 1024) return db.whisperSetScreening(sub.id, 'check', 'Large picture — not pre-screened, please look closely.');
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 200,
        system: `You pre-screen pictures that children aged about 8-12 upload to a children's book website ("Makers' Corner" - drawings and crafts), before a human moderator reviews them. Reply with JSON only: {"flag":"ok"|"check","note":"..."}.
Use "check" if ANY of these apply: a real person's face or body (a photo of a child or adult, not a drawing); readable personal details (a surname or full name, school name or logo, address, phone, email, username); a school uniform or anything identifying a place; anything rude, sexual, violent, hateful or frightening; anything suggesting the child may be unsafe, hurt or in distress; not something a child made (a screenshot, a copied logo or character, an advert). A first name signed on a drawing is fine. Otherwise "ok". The note is one short sentence in English for the moderator.`,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: type, data: buffer.toString('base64') } },
          { type: 'text', text: `Title: ${sub.word || '(none)'}\nAbout it: ${sub.reason || '(none)'}` },
        ] }],
      });
      const text = (response.content || []).map(c => c.text || '').join('');
      const out = parseJsonReply(text, '{', '}');
      db.whisperSetScreening(sub.id, out.flag === 'ok' ? 'ok' : 'check', String(out.note || '').slice(0, 300));
    } catch (e) {
      console.error('[makers] screening failed:', e.message);
      db.whisperSetScreening(sub.id, 'check', 'Not screened (AI error) — please check.');
    }
  }

  async function signedImage(key) {
    if (!key) return null;
    try { return await media.getPlaybackUrl(key); } catch { return null; }
  }

  async function forestImageUrl() {
    const config = db.getAppConfig();
    const key = config && config.forest_image_key;
    if (!key) return DEFAULT_FOREST_IMAGE;
    try { return await media.getPlaybackUrl(key); } catch { return DEFAULT_FOREST_IMAGE; }
  }

  // ── Public: the current prompt, the forest, and (for a signed-in
  // parent) their children and their children's words ──
  app.get('/api/club/whisper', async (req, res) => {
    const locale = pickLocale(req);
    const user = getOptionalUser(req);
    const isParent = !!(user && user.role === 'parent');
    const membership = isParent ? db.getClubMareMembership(user.id) : null;
    const member = !!(membership && membership.tier > 0);
    const limit = member ? FOREST_MEMBER_LIMIT : FOREST_PREVIEW_LIMIT;

    const mine = isParent ? db.whisperGetForParent(user.id) : [];
    const mineIds = new Set(mine.map(m => m.id));
    const forest = db.whisperGetForest(limit).map(s => publicWord(s, mineIds));
    const total = db.whisperCountApproved();

    const prompt = db.whisperGetOpenPrompt('word_month');
    // Whisper Question: this month's question, what children answered,
    // and the last few closed questions with some of their answers.
    const question = db.whisperGetOpenPrompt('question');
    const answers = question ? db.whisperGetAnswers(question.id, member ? 12 : 4).map(publicAnswer) : [];
    const pastQuestions = db.whisperGetClosedPrompts('question', 3).map(q => ({
      ...promptForLocale(q, locale),
      answers: db.whisperGetAnswers(q.id, 3).map(publicAnswer),
    })).filter(q => q.answers.length);
    // Makers' Corner: the current theme (if any) and approved pictures.
    const makersTheme = db.whisperGetOpenPrompt('makers');
    const gallery = await Promise.all(db.makersGetGallery(member ? 24 : 6).map(async s => ({
      id: s.id, title: s.word || '', about: s.reason || '', name: s.child_name, ageBand: s.age_band || null,
      imageUrl: await signedImage(s.image_key),
    })));
    // The most recent Whisper Word chosen, for the Club home.
    const lastWinner = forest.find(w => w.isWinner) || null;

    res.json({
      prompt: promptForLocale(prompt, locale),
      question: promptForLocale(question, locale),
      makers: { theme: promptForLocale(makersTheme, locale), gallery: gallery.filter(g => g.imageUrl) },
      answers,
      pastQuestions,
      lastWinner,
      forest,
      forestTotal: total,
      previewLimited: !member && total > forest.length,
      forestImageUrl: await forestImageUrl(),
      me: {
        signedIn: !!user,
        isParent,
        member,
        children: isParent ? db.getChildrenByParent(user.id).map(c => ({ id: c.id, name: firstName(c.name) })) : [],
        mine: mine.map(m => ({ kind: (m.image_key || m.kind === 'makers' || m.kind === 'makers_general') ? 'makers' : m.kind, word: m.word, answer: m.kind === 'question' ? (m.reason || '') : '', status: m.status, isWinner: !!m.is_winner, name: m.child_name })),
      },
    });
  });

  app.post('/api/club/whisper/submit', auth.requireAuthApi(['parent']), async (req, res) => {
    const nl = pickLocale(req) === 'nl';
    const { promptId, childId } = req.body || {};
    const word = String((req.body && req.body.word) || '').trim();
    const reason = String((req.body && req.body.reason) || '').trim();

    const membership = db.getClubMareMembership(req.user.id);
    if (!membership || membership.tier < 1) return res.status(403).json({ error: nl ? 'Word eerst lid van Club Mare (gratis).' : 'Join Club Mare first (it’s free).' });
    const prompt = db.whisperGetPrompt(promptId);
    if (!prompt || prompt.status !== 'open') return res.status(400).json({ error: nl ? 'Deze vraag is gesloten.' : 'This one has closed.' });
    const child = db.getChildrenByParent(req.user.id).find(c => c.id === childId);
    if (!child) return res.status(400).json({ error: nl ? 'Kies wie dit woord plant.' : 'Choose who is planting this word.' });

    // Whisper Question: a short answer instead of a single word.
    if (prompt.kind === 'question') {
      const answer = String((req.body && req.body.answer) || '').trim();
      if (!answer || answer.length > ANSWER_MAX) {
        return res.status(400).json({ error: nl ? `Schrijf een antwoord van hoogstens ${ANSWER_MAX} tekens.` : `Write an answer of up to ${ANSWER_MAX} characters.` });
      }
      if (db.whisperCountForChild(prompt.id, child.id) >= 1) {
        return res.status(429).json({ error: nl ? `${firstName(child.name)} heeft deze vraag al beantwoord.` : `${firstName(child.name)} has already answered this question.` });
      }
      const qid = db.whisperCreateSubmission({
        promptId: prompt.id, parentId: req.user.id, childId: child.id,
        childName: firstName(child.name), ageBand: child.age_band,
        word: '', reason: answer, locale: nl ? 'nl' : 'en',
      });
      screenSubmission(db.whisperGetSubmission(qid));
      return res.json({ ok: true });
    }

    if (!word || word.length > WORD_MAX || /\s{2,}/.test(word) || word.split(/\s+/).length > 3) {
      return res.status(400).json({ error: nl ? `Eén woord, hoogstens ${WORD_MAX} tekens.` : `One word, up to ${WORD_MAX} letters.` });
    }
    if (reason.length > REASON_MAX) return res.status(400).json({ error: nl ? `De uitleg mag hoogstens ${REASON_MAX} tekens zijn.` : `The reason can be up to ${REASON_MAX} characters.` });
    if (db.whisperCountForChild(prompt.id, child.id) >= PER_CHILD_PER_PROMPT) {
      return res.status(429).json({ error: nl ? `${firstName(child.name)} heeft deze maand al ${PER_CHILD_PER_PROMPT} woorden geplant.` : `${firstName(child.name)} has already planted ${PER_CHILD_PER_PROMPT} words this month.` });
    }
    const id = db.whisperCreateSubmission({
      promptId: prompt.id, parentId: req.user.id, childId: child.id,
      childName: firstName(child.name), ageBand: child.age_band,
      word, reason, locale: nl ? 'nl' : 'en',
    });
    screenSubmission(db.whisperGetSubmission(id)); // in the background
    res.json({ ok: true });
  });

  // Makers' Corner upload: the picture is the raw request body; the
  // other fields travel in the query string. Hidden data is stripped
  // before anything is stored, and nothing shows until approved.
  const express = require('express');
  app.post('/api/club/makers/upload', auth.requireAuthApi(['parent']),
    express.raw({ type: ['image/jpeg', 'image/png', 'image/jpg', 'application/octet-stream'], limit: MAKERS_MAX_BYTES }),
    async (req, res) => {
      const nl = req.query.locale === 'nl';
      const membership = db.getClubMareMembership(req.user.id);
      if (!membership || membership.tier < 1) return res.status(403).json({ error: nl ? 'Word eerst lid van Club Mare (gratis).' : 'Join Club Mare first (it’s free).' });
      if (req.query.consent !== '1') return res.status(400).json({ error: nl ? 'Vink eerst het toestemmingsvakje aan.' : 'Please tick the permission box first.' });
      const child = db.getChildrenByParent(req.user.id).find(c => c.id === req.query.childId);
      if (!child) return res.status(400).json({ error: nl ? 'Kies wie dit gemaakt heeft.' : 'Choose who made this.' });
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: nl ? 'Kies eerst een afbeelding.' : 'Choose a picture first.' });
      if (db.makersCountForChildThisMonth(child.id) >= MAKERS_PER_CHILD_PER_MONTH) {
        return res.status(429).json({ error: nl ? `${firstName(child.name)} heeft deze maand al ${MAKERS_PER_CHILD_PER_MONTH} afbeeldingen gedeeld.` : `${firstName(child.name)} has already shared ${MAKERS_PER_CHILD_PER_MONTH} pictures this month.` });
      }
      let cleaned;
      try { cleaned = cleanImage(req.body); }
      catch { return res.status(400).json({ error: nl ? 'Alleen JPEG- of PNG-afbeeldingen (foto’s) kunnen worden geüpload.' : 'Only JPEG or PNG pictures (photos) can be uploaded.' }); }
      const title = String(req.query.title || '').trim().slice(0, TITLE_MAX);
      const about = String(req.query.about || '').trim().slice(0, REASON_MAX);
      const theme = db.whisperGetOpenPrompt('makers');
      const key = `makers/${require('crypto').randomUUID()}.${cleaned.ext}`;
      try {
        await media.putObject(key, cleaned.buffer, cleaned.type);
      } catch (e) {
        console.error('[makers] upload failed:', e.message);
        return res.status(500).json({ error: nl ? 'Uploaden lukte niet, probeer het later nog eens.' : 'The upload didn’t work — please try again later.' });
      }
      const id = db.whisperCreateSubmission({
        promptId: theme ? theme.id : 'makers-general', parentId: req.user.id, childId: child.id,
        childName: firstName(child.name), ageBand: child.age_band,
        word: title, reason: about, locale: nl ? 'nl' : 'en', imageKey: key,
      });
      screenImage(db.whisperGetSubmission(id), cleaned.buffer, cleaned.type); // background
      res.json({ ok: true });
    });

  // ── Admin ──
  const staff = auth.requireAuthApi(['admin', 'support']);

  app.get('/api/admin/whisper', staff, async (req, res) => {
    const config = db.getAppConfig();
    res.json({
      prompts: db.whisperGetPrompts().map(p => ({
        ...p,
        approvedCount: db.whisperGetApprovedForPrompt(p.id).length,
        winner: p.winner_submission_id ? db.whisperGetSubmission(p.winner_submission_id) : null,
      })),
      pending: await Promise.all(db.whisperGetByStatus('pending').map(async s => ({ ...s, image_url: await signedImage(s.image_key) }))),
      forestImageKey: (config && config.forest_image_key) || null,
      forestImageUrl: await forestImageUrl(),
    });
  });

  app.post('/api/admin/whisper/prompts', staff, (req, res) => {
    const { month, titleEn, titleNl, bodyEn, bodyNl } = req.body || {};
    const kind = KINDS.includes(req.body && req.body.kind) ? req.body.kind : 'word_month';
    if (!titleEn || !String(titleEn).trim()) return res.status(400).json({ error: 'An English title is required.' });
    if (month && !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Month must look like 2026-10.' });
    const id = db.whisperCreatePrompt({ kind, month, titleEn: String(titleEn).trim(), titleNl, bodyEn, bodyNl });
    res.json({ ok: true, id });
  });

  app.patch('/api/admin/whisper/prompts/:id', staff, (req, res) => {
    const ok = db.whisperUpdatePrompt(req.params.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  });

  app.post('/api/admin/whisper/submissions/:id/review', staff, async (req, res) => {
    const { decision } = req.body || {};
    if (decision !== 'approve' && decision !== 'reject') return res.status(400).json({ error: 'decision must be approve or reject' });
    const fields = { status: decision === 'approve' ? 'approved' : 'rejected' };
    // Staff may tidy a typo while approving.
    const existing = db.whisperGetSubmission(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const isPicture = !!existing.image_key;
    const isAnswer = !existing.word && !isPicture;
    if (req.body.word !== undefined && isPicture) {
      fields.word = String(req.body.word).trim().slice(0, TITLE_MAX); // a picture's title may be empty
    } else if (req.body.word !== undefined && !isAnswer) {
      const w = String(req.body.word).trim();
      if (!w || w.length > WORD_MAX) return res.status(400).json({ error: `Word must be 1-${WORD_MAX} characters.` });
      fields.word = w;
    }
    if (req.body.reason !== undefined) {
      fields.reason = String(req.body.reason).trim().slice(0, isAnswer ? ANSWER_MAX : REASON_MAX);
      if (isAnswer && !fields.reason) return res.status(400).json({ error: 'The answer cannot be empty.' });
    }
    if (!db.whisperReview(req.params.id, fields)) return res.status(404).json({ error: 'Not found' });
    // A picture that isn't shown is deleted from storage, not just hidden.
    if (decision === 'reject' && isPicture) {
      try { await media.deleteObject(existing.image_key); } catch (e) { console.error('[makers] delete failed:', e.message); }
      db.whisperClearImage(existing.id);
    }
    res.json({ ok: true });
  });

  // Everything approved lately, of every kind, so anything can be taken
  // down again ('Remove' = reject; pictures are deleted from storage).
  app.get('/api/admin/whisper/approved-recent', staff, async (req, res) => {
    const rows = await Promise.all(db.whisperGetRecentApproved(40).map(async s => ({ ...s, image_url: await signedImage(s.image_key) })));
    res.json({ items: rows });
  });

  app.get('/api/admin/whisper/prompts/:id/approved', staff, (req, res) => {
    res.json({ submissions: db.whisperGetApprovedForPrompt(req.params.id) });
  });

  // The app suggests; a person chooses.
  app.post('/api/admin/whisper/prompts/:id/shortlist', staff, async (req, res) => {
    const subs = db.whisperGetApprovedForPrompt(req.params.id);
    if (!subs.length) return res.json({ suggestions: [] });
    if (!anthropic) return res.status(503).json({ error: 'AI not configured' });
    try {
      const list = subs.map((s, i) => `${i + 1}. "${s.word}" (${s.child_name}, ${s.age_band || 'age not set'}, ${s.locale || 'en'}) — ${s.reason || 'no reason given'}`).join('\n');
      const response = await anthropic.messages.create({
        model,
        max_tokens: 700,
        system: `You help the authors of the children's book "Mare and the Whispering Woods of Words" choose the Whisper Word of the Month from words children (8-12) have planted. Favour words with real delight in language — beautiful, strange, forgotten, playful or invented words — and reasons that show the child's own feeling or story. Mixed languages are welcome. Suggest the best 3 to 5. Reply with JSON only: [{"n":<number from the list>,"why":"one short sentence"}].`,
        messages: [{ role: 'user', content: list }],
      });
      const text = (response.content || []).map(c => c.text || '').join('');
      const picks = parseJsonReply(text, '[', ']');
      const suggestions = picks
        .map(p => ({ sub: subs[Number(p.n) - 1], why: String(p.why || '') }))
        .filter(p => p.sub)
        .slice(0, 5)
        .map(p => ({ id: p.sub.id, word: p.sub.word, reason: p.sub.reason, name: p.sub.child_name, why: p.why }));
      res.json({ suggestions });
    } catch (e) {
      console.error('[whisper] shortlist failed:', e.message);
      res.status(500).json({ error: 'Could not make a shortlist right now.' });
    }
  });

  app.post('/api/admin/whisper/prompts/:id/winner', staff, (req, res) => {
    const prompt = db.whisperGetPrompt(req.params.id);
    if (!prompt) return res.status(404).json({ error: 'Not found' });
    if (prompt.kind !== 'word_month') return res.status(400).json({ error: 'Only a Whisper Word month has a winner.' });
    const { submissionId } = req.body || {};
    if (submissionId) {
      const s = db.whisperGetSubmission(submissionId);
      if (!s || s.prompt_id !== prompt.id || s.status !== 'approved') return res.status(400).json({ error: 'Choose an approved word from this month.' });
    }
    db.whisperSetWinner(prompt.id, submissionId || null);
    res.json({ ok: true });
  });

  app.put('/api/admin/whisper/forest-image', staff, (req, res) => {
    const key = req.body && req.body.key;
    if (key && !/^whisper\/[\w.\-]+$/.test(key)) return res.status(400).json({ error: 'Invalid image key' });
    db.setForestImageKey(key || null);
    res.json({ ok: true });
  });
}

module.exports = { register };
