// ── bookcompanion.js (Mare App 5) — The Book Companion (server side).
//
// The parent's home after signing in (/companion.html): continue the
// picture book, a small body practice for the chapter they're reading,
// links to everything else, rate the book (any rating earns a personal
// shop discount code), and send a message to Mare. Staff (Support and
// Admin) edit the practices and answer Mare's messages as Mare; the
// discount size and the ratings list are admin-only.
// ──────────────────────────────────────────────────────────────────────
const crypto = require('crypto');

function register(app, { db, auth, email, anthropic, model, publicUrl }) {
  const parentOnly = auth.requireAuthApi(['parent']);
  // Staff may open the page too ("View the page" in Admin): they see a
  // preview with the real practices; sending and rating stay off.
  const parentOrStaff = auth.requireAuthApi(['parent', 'admin', 'support', 'editor']);
  const isStaff = (req) => req.user.role !== 'parent';
  const staff = auth.requireAuthApi(['admin', 'support']);
  const adminOnly = auth.requireAuthApi(['admin']);
  const nlOf = (req, parent) => ((req.query.lang || (req.body && req.body.lang)) === 'nl' || (!req.query.lang && parent && parent.preferred_locale === 'nl'));

  function practiceFor(n, nl) {
    const p = db.companionPractice(n);
    if (!p) return null;
    return {
      chapter: p.chapter_no,
      chapterTitle: (nl && p.chapter_title_nl) || p.chapter_title_en,
      title: (nl && p.title_nl) || p.title_en,
      body: (nl && p.body_nl) || p.body_en,
    };
  }

  // Which chapter is the family on? Their own choice wins; otherwise
  // where the picture book was last left; otherwise chapter 1.
  function currentChapter(parent, book) {
    if (parent.companion_chapter) return parent.companion_chapter;
    if (book) {
      const prog = db.getReadingProgress(parent.id, book.id);
      if (prog) {
        const chapters = db.getChaptersByBook(book.id);
        const i = chapters.findIndex(c => c.id === prog.chapter_id);
        if (i >= 0) return i + 1;
      }
    }
    return 1;
  }

  app.get('/api/companion', parentOrStaff, (req, res) => {
    if (isStaff(req)) {
      const nl = req.query.lang === 'nl';
      const books = db.getAllBooks ? db.getAllBooks() : [];
      const book = books.find(b => b.active !== 0 && b.locale === (nl ? 'nl' : 'en')) || books.find(b => b.active !== 0) || null;
      const chapterNo = Number(req.query.chapter) || 1;
      return res.json({
        preview: true,
        name: String(req.user.name || '').split(/\s+/)[0],
        book: book ? { slug: book.slug, title: book.title } : null,
        hasProgress: false,
        chapter: chapterNo,
        chapters: db.companionPractices().map(p => ({ no: p.chapter_no, title: (nl && p.chapter_title_nl) || p.chapter_title_en })),
        practice: practiceFor(chapterNo, nl),
        children: [],
        clubMember: true,
        rating: null,
        ratingPercent: (db.getAppConfig() || {}).rating_discount_percent || 10,
        messages: [],
      });
    }
    const parent = db.getParentById(req.user.id);
    if (!parent) return res.status(404).json({ error: 'Not found' });
    const nl = nlOf(req, parent);
    const books = db.getAllBooks ? db.getAllBooks() : [];
    const book = books.find(b => b.active !== 0 && b.locale === (nl ? 'nl' : 'en')) || books.find(b => b.active !== 0) || null;
    const chapterNo = currentChapter(parent, book);
    const practices = db.companionPractices();
    const rating = db.getBookRating(parent.id);
    const membership = db.getClubMareMembership(parent.id);
    res.json({
      name: String(parent.name || '').split(/\s+/)[0],
      book: book ? { slug: book.slug, title: book.title } : null,
      hasProgress: !!(book && db.getReadingProgress(parent.id, book.id)),
      chapter: chapterNo,
      chapters: practices.map(p => ({ no: p.chapter_no, title: (nl && p.chapter_title_nl) || p.chapter_title_en })),
      practice: practiceFor(chapterNo, nl),
      children: db.getChildrenByParent(parent.id).map(c => String(c.name || '').split(/\s+/)[0]),
      clubMember: !!(membership && membership.tier >= 1),
      rating: rating ? { stars: rating.stars, comment: rating.comment || '', code: rating.discount_code } : null,
      ratingPercent: (db.getAppConfig() || {}).rating_discount_percent || 10,
      messages: db.mareMessagesForParent(parent.id),
      pictureTalk: parent.picture_talk !== 0,
    });
  });
  // Mare App 5 — the family's switch for "Talk to Mare" in the pictures.
  app.post('/api/companion/picture-talk', parentOnly, (req, res) => {
    const on = !!(req.body && req.body.on);
    db.setPictureTalk(req.user.id, on);
    res.json({ ok: true, on });
  });

  app.post('/api/companion/chapter', parentOrStaff, (req, res) => {
    const n = Math.round(Number(req.body && req.body.chapter));
    if (!db.companionPractice(n)) return res.status(400).json({ error: 'Unknown chapter' });
    if (isStaff(req)) return res.json({ ok: true, chapter: n, practice: practiceFor(n, req.query.lang === 'nl') });
    db.setCompanionChapter(req.user.id, n);
    const parent = db.getParentById(req.user.id);
    res.json({ ok: true, chapter: n, practice: practiceFor(n, nlOf(req, parent)) });
  });

  // Rate the book. Any score earns the same personal code (the discount
  // is for rating, never for a good rating). One code per family, kept.
  app.post('/api/companion/rating', parentOnly, (req, res) => {
    const stars = Math.round(Number(req.body && req.body.stars));
    if (!(stars >= 1 && stars <= 5)) return res.status(400).json({ error: 'Choose 1 to 5 stars' });
    const comment = String((req.body && req.body.comment) || '').trim().slice(0, 1000);
    const existing = db.getBookRating(req.user.id);
    let code = existing && existing.discount_code;
    if (!code) {
      const percent = Math.max(1, Math.min(90, (db.getAppConfig() || {}).rating_discount_percent || 10));
      for (let i = 0; i < 5 && !code; i++) {
        const c = 'MARE' + crypto.randomBytes(3).toString('hex').toUpperCase();
        if (!db.getOfferByCode(c)) code = c;
      }
      const expires = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      db.createOffer({ code, description: `Thank you for rating the book (${percent}%, one family)`, discountType: 'percent', discountValue: percent, expiresAt: expires });
    }
    const r = db.saveBookRating(req.user.id, stars, comment, code);
    res.json({ ok: true, rating: { stars: r.stars, comment: r.comment || '', code: r.discount_code } });
  });

  // A message to Mare. Staff are told by email; the reply shows here.
  app.post('/api/companion/message', parentOnly, (req, res) => {
    const message = String((req.body && req.body.message) || '').trim().slice(0, 1500);
    if (!message) return res.status(400).json({ error: 'Write a message first' });
    const childName = String((req.body && req.body.childName) || '').trim().slice(0, 40);
    const recent = db.mareMessagesForParent(req.user.id).filter(m => Date.now() - new Date(m.created_at.replace(' ', 'T') + 'Z').getTime() < 24 * 3600 * 1000);
    if (recent.length >= 5) return res.status(429).json({ error: 'Mare has lots of letters today. Please write again tomorrow.' });
    db.createMareMessage(req.user.id, childName, message);
    const config = db.getAppConfig();
    const parent = db.getParentById(req.user.id);
    if (config && config.contact_email) {
      const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      email.sendEmail(config.contact_email, `New message to Mare${childName ? ` from ${childName}` : ''}`,
        `<p><strong>${esc(parent ? parent.name : '')}</strong> (${esc(parent ? parent.email : '')})${childName ? `, for ${esc(childName)}` : ''} wrote to Mare:</p><blockquote>${esc(message).replace(/\n/g, '<br>')}</blockquote><p>Answer as Mare in Admin → Book Companion: <a href="${publicUrl}/admin.html">${publicUrl}/admin.html</a></p>`,
        { kind: 'mare_message_notice' }).catch(() => {});
    }
    res.json({ ok: true, messages: db.mareMessagesForParent(req.user.id) });
  });

  // ── Staff ──
  app.get('/api/admin/companion', staff, (req, res) => {
    const isAdmin = req.user.role === 'admin';
    res.json({
      practices: db.companionPractices(),
      messages: db.mareMessagesAll(),
      ratingPercent: (db.getAppConfig() || {}).rating_discount_percent || 10,
      ratingSummary: db.bookRatingsSummary(),
      ratings: isAdmin ? db.bookRatingsList() : null,
    });
  });
  app.put('/api/admin/companion/practices/:n', staff, (req, res) => {
    const n = Number(req.params.n);
    if (!db.companionPractice(n)) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const clip = (v, max) => String(v || '').slice(0, max);
    db.updateCompanionPractice(n, {
      chapterTitleEn: clip(b.chapterTitleEn, 120), chapterTitleNl: clip(b.chapterTitleNl, 120),
      titleEn: clip(b.titleEn, 120), titleNl: clip(b.titleNl, 120),
      bodyEn: clip(b.bodyEn, 3000), bodyNl: clip(b.bodyNl, 3000),
      summary: b.summary !== undefined ? clip(b.summary, 2000) : undefined,
    });
    res.json({ ok: true });
  });
  app.put('/api/admin/companion/rating-percent', adminOnly, (req, res) => {
    const p = Math.round(Number(req.body && req.body.percent));
    if (!(p >= 1 && p <= 90)) return res.status(400).json({ error: 'Choose 1 to 90 %' });
    db.setRatingDiscountPercent(p);
    res.json({ ok: true, percent: p });
  });

  // Suggest Mare's reply (staff always read and change it before sending).
  app.post('/api/admin/companion/messages/:id/suggest', staff, async (req, res) => {
    const m = db.getMareMessage(req.params.id);
    if (!m) return res.status(404).json({ error: 'Not found' });
    if (!anthropic) return res.status(503).json({ error: 'Suggestions are not available right now.' });
    const nl = m.preferred_locale === 'nl';
    try {
      const response = await anthropic.messages.create({
        model, max_tokens: 500,
        system: `You are Mare, the ten-year-old girl from the children's book "Mare and the Whispering Woods of Words". A child (or their parent) wrote to you. Write a short, warm reply in ${nl ? 'Dutch (the woods are "het Fluisterbos")' : 'English'}, 40-90 words, as Mare: curious, kind, noticing small things and how they feel in the body. Answer what they wrote. You may suggest one tiny thing to notice or try. Never ask for personal details (address, school, photos), never promise to meet, never give medical or therapy advice; if the message mentions being hurt, unsafe or very sad, reply kindly and encourage them to talk to a grown-up they trust right away. Sign off as Mare. Plain text only.`,
        messages: [{ role: 'user', content: `${m.child_name ? `From ${m.child_name}: ` : ''}${m.message}` }],
      });
      res.json({ reply: (response.content || []).map(c => c.text || '').join('').trim() });
    } catch (e) {
      res.status(502).json({ error: 'Mare could not write a suggestion just now. Please try again.' });
    }
  });

  app.post('/api/admin/companion/messages/:id/reply', staff, async (req, res) => {
    const m = db.getMareMessage(req.params.id);
    if (!m) return res.status(404).json({ error: 'Not found' });
    const reply = String((req.body && req.body.reply) || '').trim().slice(0, 2000);
    if (!reply) return res.status(400).json({ error: 'Write the reply first' });
    db.replyMareMessage(m.id, reply, req.user.name);
    let emailed = false;
    if (m.parent_email) {
      const nl = m.preferred_locale === 'nl';
      const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const html = email.wrapHtml(`
        <p style="font-size:0.8rem;letter-spacing:0.08em;text-transform:uppercase;color:#9A7A2E;">${nl ? 'Mare schreef terug' : 'Mare wrote back'}</p>
        <p style="color:#4A5C82;font-size:0.9rem;">${nl ? 'Jouw bericht' : 'Your message'}: <em>${esc(m.message).replace(/\n/g, '<br>')}</em></p>
        <p>${esc(reply).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>
        <p><a href="${publicUrl}/companion.html" style="display:inline-block;background:#E2BE6E;color:#16305C;font-weight:700;text-decoration:none;padding:10px 20px;border-radius:999px;">${nl ? 'Naar de Boekgids' : 'Open the Book Companion'}</a></p>`);
      const r = await email.sendEmail(m.parent_email, nl ? 'Mare schreef je terug' : 'Mare wrote back to you', html, { kind: 'mare_message_reply' }).catch(() => null);
      emailed = !!(r && r.ok);
    }
    res.json({ ok: true, emailed });
  });
}

module.exports = { register };
