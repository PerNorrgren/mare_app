// ─────────────────────────────────────────────────────────────────────
// MARE'S MONTHLY POST (Mare App 4) — Club Mare step 4.
//
// A short letter from Mare, once a month, to Club Mare families who
// ticked "Send me messages from Mare by email". The app can write a
// first draft in Mare's voice (English + Dutch); a person always edits
// and approves it, sends themselves a test, then sends it once.
// Each family gets it in their own language, greeting their own
// children by first name ("Dear Noor and Sam" / "Lieve Noor en Sam"),
// with a one-click link to stop these letters.
// ─────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

function unsubToken(parentId) {
  return crypto.createHmac('sha256', SECRET).update(`unsub:${parentId}`).digest('hex').slice(0, 32);
}

function newsToken(kind, id) {
  return crypto.createHmac('sha256', SECRET).update(`news:${kind}:${id}`).digest('hex').slice(0, 32);
}

// Footer added to every broadcast email (Mare App 4): why they're
// getting it, and a one-click stop link for that person.
function newsFooter(kind, id, locale, base) {
  const nl = locale === 'nl';
  const link = id ? `${base}/unsubscribe?k=news&r=${kind === 'teacher' ? 'teacher' : 'parent'}&p=${encodeURIComponent(id)}&t=${newsToken(kind, id)}` : '#';
  return `<p style="font-family:Arial,sans-serif;font-size:0.75rem;color:#6b7a99;margin-top:28px;border-top:1px solid #e5e2d8;padding-top:12px;line-height:1.5;">
    ${nl ? 'Je krijgt deze e-mail omdat je een Mare-account hebt.' : "You're getting this email because you have a Mare account."}
    <a href="${link}" style="color:#6b7a99;">${nl ? 'Geen nieuws meer ontvangen' : 'Stop these emails'}</a></p>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function joinNames(names, nl) {
  const and = nl ? 'en' : 'and';
  if (!names.length) return nl ? 'lieve lezer' : 'dear reader';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}

function register(app, { db, auth, email, anthropic, model, appUrl }) {

  function letterHtml(body, locale, parentId, base) {
    const nl = locale === 'nl';
    const paras = String(body || '').trim().split(/\n{2,}/)
      .map(p => `<p style="margin:0 0 14px;line-height:1.65;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
    const stop = parentId ? `${base}/unsubscribe?p=${encodeURIComponent(parentId)}&t=${unsubToken(parentId)}` : '#';
    return `<div style="background:#F4F1E8;padding:24px 12px;">
      <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;background:#FFFDF6;border:1px solid #EAC066;border-radius:18px;padding:28px 26px;color:#16305C;">
        <p style="font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;color:#9A7A2E;margin:0 0 14px;">${nl ? 'Post van Mare' : 'Post from Mare'}</p>
        <div style="font-size:1.02rem;">${paras}</div>
        <p style="margin:22px 0 0;"><a href="${base}/club-mare.html" style="display:inline-block;background:#EAC066;color:#16305C;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;padding:10px 18px;border-radius:999px;">${nl ? 'Naar Club Mare' : 'Visit Club Mare'}</a></p>
      </div>
      <p style="font-family:Arial,sans-serif;font-size:0.75rem;color:#6b7a99;max-width:520px;margin:14px auto 0;text-align:center;line-height:1.5;">
        ${nl ? 'Je krijgt deze brief omdat je in je Mare-account hebt aangegeven berichten van Mare te willen ontvangen.' : "You're getting this letter because you asked for messages from Mare in your Mare account."}
        <br><a href="${stop}" style="color:#6b7a99;">${nl ? 'Geen brieven meer ontvangen' : 'Stop these letters'}</a>
      </p></div>`;
  }

  function personalise(post, recipient) {
    const nl = recipient.preferred_locale === 'nl' && post.body_nl.trim() && post.subject_nl.trim();
    const locale = nl ? 'nl' : 'en';
    const names = joinNames(recipient.childNames || [], nl);
    const subject = (nl ? post.subject_nl : post.subject_en).replace(/\{names\}/g, names);
    const body = (nl ? post.body_nl : post.body_en).replace(/\{names\}/g, names);
    return { locale, subject, body };
  }

  const staff = auth.requireAuthApi(['admin', 'support']);
  const base = () => (appUrl || '').replace(/\/$/, '');

  app.get('/api/admin/mare-posts', staff, (req, res) => {
    res.json({ posts: db.marePostList(), recipients: db.marePostRecipients().length });
  });

  // New draft - written by the app when it can, otherwise blank.
  app.post('/api/admin/mare-posts/draft', staff, async (req, res) => {
    const month = /^\d{4}-\d{2}$/.test((req.body && req.body.month) || '') ? req.body.month : new Date().toISOString().slice(0, 7);
    const notes = String((req.body && req.body.notes) || '').slice(0, 600);
    let draft = { subject_en: '', body_en: 'Dear {names},\n\n', subject_nl: '', body_nl: 'Lieve {names},\n\n' };
    let aiNote = null;
    if (anthropic) {
      try {
        const word = db.whisperGetOpenPrompt('word_month');
        const question = db.whisperGetOpenPrompt('question');
        const context = [
          word ? `This month's Whisper Word question: "${word.title_en}" (Dutch: "${word.title_nl || ''}")` : 'No Whisper Word question open this month.',
          question ? `This month's Whisper Question: "${question.title_en}" (Dutch: "${question.title_nl || ''}")` : 'No Whisper Question open this month.',
          notes ? `Notes from the authors: ${notes}` : '',
        ].filter(Boolean).join('\n');
        const response = await anthropic.messages.create({
          model,
          max_tokens: 1400,
          system: `You write the monthly letter from Mare, the ten-year-old girl in the children's book "Mare and the Whispering Woods of Words", to Club Mare children aged 8-12, read with their parents. Mare notices small things, feels things in her body (a flutter, warm hands, feet pressed into the floor), loves words and the Whispering Woods, and is warm, curious and a little playful. Write 120-180 words. Include one small thing she noticed in the woods this month, one tiny riddle or word game, and a gentle invitation to take part in Club Mare (the Whisper Word and/or Whisper Question given, if any). No selling, no products, no questions asking for personal details, no promises, at most one emoji. Start the English letter exactly with "Dear {names}," and the Dutch with "Lieve {names}," - {names} is replaced with the children's first names. End with "— Mare". The Dutch is a natural Dutch letter by Mare, not a word-for-word translation. Subjects: short and inviting, no emoji. Reply with JSON only: {"subject_en":"...","body_en":"...","subject_nl":"...","body_nl":"..."}. Use \\n\\n between paragraphs.`,
          messages: [{ role: 'user', content: context }],
        });
        const text = (response.content || []).map(c => c.text || '').join('');
        const out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
        if (out.body_en && out.body_nl) draft = out;
      } catch (e) {
        console.error('[mare-post] draft failed:', e.message);
        aiNote = 'The app could not write a draft just now — here is a blank letter to fill in.';
      }
    } else {
      aiNote = 'Drafting by the app isn’t available — here is a blank letter to fill in.';
    }
    const id = db.marePostCreate({ month, subjectEn: draft.subject_en, subjectNl: draft.subject_nl, bodyEn: draft.body_en, bodyNl: draft.body_nl });
    res.json({ ok: true, id, note: aiNote });
  });

  app.patch('/api/admin/mare-posts/:id', staff, (req, res) => {
    const b = req.body || {};
    const f = {};
    for (const [k, max] of [['subjectEn', 200], ['subjectNl', 200], ['bodyEn', 4000], ['bodyNl', 4000], ['month', 7]]) {
      if (b[k] !== undefined) f[k] = String(b[k]).slice(0, max);
    }
    if (!db.marePostUpdate(req.params.id, f)) return res.status(400).json({ error: 'Only a draft can be edited.' });
    res.json({ ok: true });
  });

  app.delete('/api/admin/mare-posts/:id', staff, (req, res) => {
    db.marePostDelete(req.params.id);
    res.json({ ok: true });
  });

  // Test: to the signed-in staff member, in the language asked for,
  // with example names so the greeting can be checked.
  app.post('/api/admin/mare-posts/:id/test', staff, async (req, res) => {
    const post = db.marePostGet(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    if (!req.user.email) return res.status(400).json({ error: 'Your staff account has no email address.' });
    const locale = (req.body && req.body.locale) === 'nl' ? 'nl' : 'en';
    const p = personalise(post, { preferred_locale: locale, childNames: ['Noor', 'Sam'] });
    const result = await email.sendEmail(req.user.email, `[TEST] ${p.subject}`, letterHtml(p.body, p.locale, null, base()), { kind: 'mare_post_test' });
    if (result && result.ok === false) return res.status(502).json({ error: result.error || 'Test send failed' });
    res.json({ ok: true });
  });

  app.post('/api/admin/mare-posts/:id/send', staff, async (req, res) => {
    const post = db.marePostGet(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    if (!post.subject_en.trim() || !post.body_en.trim()) return res.status(400).json({ error: 'The English subject and letter are needed before sending.' });
    if (post.body_en.includes('{names}') === false) return res.status(400).json({ error: 'The English letter should start with "Dear {names}," so each family is greeted by name.' });
    if (!db.marePostClaim(post.id)) return res.status(409).json({ error: 'This letter has already been sent.' });
    const recipients = db.marePostRecipients();
    let sent = 0, failed = 0;
    for (const r of recipients) {
      const p = personalise(post, r);
      try {
        const result = await email.sendEmail(r.email, p.subject, letterHtml(p.body, p.locale, r.id, base()), { kind: 'mare_post', userId: r.id });
        if (result && result.ok === false) failed++; else sent++;
      } catch { failed++; }
    }
    db.marePostMarkSent(post.id, { recipientCount: recipients.length, sentCount: sent, failedCount: failed });
    res.json({ ok: true, recipients: recipients.length, sent, failed });
  });

  // One-click stop, from the link in every letter.
  app.get('/unsubscribe', (req, res) => {
    const pid = String(req.query.p || '');
    const news = req.query.k === 'news';
    const kind = req.query.r === 'teacher' ? 'teacher' : 'parent';
    // Two kinds of stop link: Mare's monthly letter, or news broadcasts.
    const ok = pid && req.query.t === (news ? newsToken(kind, pid) : unsubToken(pid));
    if (ok) { if (news) db.setBroadcastOptOut(kind, pid, true); else db.setParentEmailOptOut(pid); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mare</title></head>
      <body style="font-family:Arial,sans-serif;background:#F4F1E8;color:#16305C;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0;">
      <div style="max-width:420px;background:#fff;border-radius:16px;padding:28px;text-align:center;">
      ${ok
        ? (news
          ? '<h1 style="font-family:Georgia,serif;font-size:1.4rem;">Done — no more news emails</h1><p>You won’t get news and updates from Mare any more.</p><hr style="border:none;border-top:1px solid #eee;margin:18px 0;"><p><strong>Klaar — geen nieuws meer.</strong> Je krijgt geen nieuws en updates van Mare meer.</p>'
          : '<h1 style="font-family:Georgia,serif;font-size:1.4rem;">Done — no more letters</h1><p>You won’t get letters from Mare any more. You can turn them back on in your account at any time.</p><hr style="border:none;border-top:1px solid #eee;margin:18px 0;"><p><strong>Klaar — geen brieven meer.</strong> Je krijgt geen brieven van Mare meer. Je kunt ze altijd weer aanzetten in je account.</p>')
        : '<h1 style="font-family:Georgia,serif;font-size:1.4rem;">That link didn’t work</h1><p>You can switch letters off in your Mare account instead.<br>Deze link werkt niet — je kunt brieven uitzetten in je Mare-account.</p>'}
      <p style="margin-top:20px;"><a href="/" style="color:#16305C;">mare.deepermindfulness.org</a></p></div></body></html>`);
  });
}

module.exports = { register, unsubToken, joinNames, newsFooter };
