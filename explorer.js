// ── explorer.js (Mare App 5) — the Picture explorer (server side).
//
// The book is sold on Amazon and never shown in the app. While a grown-up
// reads it aloud (paper or phone), the child explores the pictures for
// that chapter, e.g. on an iPad in Child mode (/pictures.html): tappable
// spots with a sound, Mare speaking, a short text with a picture, or a
// video. The chapter follows the family's Book Companion, so choosing
// "chapter 5" on the phone moves the iPad along too.
// Staff (Admin/Support) add pictures and spots in Admin → Book Companion.
// ──────────────────────────────────────────────────────────────────────
const TYPES = ['sound', 'voice', 'popup', 'video', 'quiz', 'write', 'mask']; // v74: + quiz, write to Mare; v76: + mask
const KEY_OK = /^pictures\/[A-Za-z0-9._\/-]+$/;
// v88 — spot pictures that ship with the app (public/images/mare-spot-*.png), always in the library
const BUILTIN_ICON = /^\/images\/mare-spot-[a-z0-9-]+\.(png|webp|jpg)$/;
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

function register(app, { db, auth, media, email, publicUrl }) {
  const family = auth.requireAuthApi(['parent', 'teacher', 'admin', 'support', 'editor']); // v71: teachers preview too
  const staff = auth.requireAuthApi(['admin', 'support']);

  async function url(key) {
    if (!key) return null;
    if (BUILTIN_ICON.test(key)) return key; // shipped with the app
    try { return await media.getPlaybackUrl(key); } catch { return null; }
  }
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
  const youtube = (u) => {
    const s = String(u || '').trim();
    let m = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&modestbranding=1&playsinline=1`;
    m = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
    return null;
  };

  // Quiz: { answers: [{ en, nl }], correct: 0, right_en, right_nl, wrong_en, wrong_nl }
  function parseQuiz(j) {
    try { const q = JSON.parse(j || '{}'); return { answers: Array.isArray(q.answers) ? q.answers : [], correct: Number(q.correct) || 0, right_en: q.right_en || '', right_nl: q.right_nl || '', wrong_en: q.wrong_en || '', wrong_nl: q.wrong_nl || '' }; }
    catch { return { answers: [], correct: 0, right_en: '', right_nl: '', wrong_en: '', wrong_nl: '' }; }
  }
  // v74 — an answer can be words, a small picture, or both (pick the dog, the cat…)
  async function publicQuiz(j, nl) {
    const q = parseQuiz(j);
    const pick = (en, nlv) => (nl && nlv) || en || nlv || '';
    const answers = [];
    for (const a of q.answers) {
      const text = pick(a.en, a.nl);
      const image = a.image_key ? await url(a.image_key) : null;
      if (text || image) answers.push({ text, image });
    }
    return { answers, correct: Math.min(q.correct, Math.max(0, answers.length - 1)), right: pick(q.right_en, q.right_nl), wrong: pick(q.wrong_en, q.wrong_nl) };
  }

  // v76 — { colour, mode: 'blur'|'colour', shape: 'circle'|'rect', h, reveal }
  function parseLook(j) {
    let o = {}; try { o = JSON.parse(j || '{}') || {}; } catch { o = {}; }
    return {
      colour: /^#[0-9a-f]{6}$/i.test(o.colour || '') ? o.colour : null,
      mode: o.mode === 'colour' ? 'colour' : 'blur',
      shape: o.shape === 'circle' ? 'circle' : 'rect',
      h: o.h == null ? null : clamp(o.h, 0.02, 1),
      reveal: !!o.reveal,
      // v88 — a picture as the spot (staff-uploaded only), how see-through it is, and whether it glows
      icon: typeof o.icon === 'string' && (KEY_OK.test(o.icon) || BUILTIN_ICON.test(o.icon)) ? o.icon : null,
      opacity: o.opacity == null ? 1 : clamp(o.opacity, 0.1, 1),
      glow: o.glow !== false,
      // v97 — invisible: nothing shows, but tapping the place still works (the instruction points to it)
      hidden: !!o.hidden,
    };
  }

  async function publicScenes(chapterNo, nl) {
    const scenes = db.pictureScenes(chapterNo, true);
    const out = [];
    for (const s of scenes) {
      const spots = [];
      for (const p of db.pictureSpots(s.id)) {
        spots.push({
          id: p.id, x: p.x, y: p.y, r: p.r, type: p.type,
          title: (nl && p.title_nl) || p.title_en || p.title_nl || '',
          text: (nl && p.text_nl) || p.text_en || p.text_nl || '',
          image: await url(p.image_key),
          audio: await url((nl && p.audio_key_nl) || p.audio_key_en || p.audio_key_nl),
          video: p.video_key ? await url(p.video_key) : null,
          embed: p.video_url ? youtube(p.video_url) : null,
          // v74 — on a video: when the spot shows, and whether it stops the video
          tStart: p.t_start == null ? null : p.t_start,
          tEnd: p.t_end == null ? null : p.t_end,
          pause: !!p.pause_on_show,
          // v96 — the instruction shown while the video waits for this spot
          hint: p.pause_on_show ? ((nl && p.hint_nl) || p.hint_en || p.hint_nl || '') : '',
          quiz: p.type === 'quiz' ? await publicQuiz(p.quiz_json, nl) : null,
          look: await (async () => { const l = parseLook(p.look_json); return { ...l, icon: undefined, iconUrl: l.icon ? await url(l.icon) : null }; })(),
        });
      }
      out.push({ id: s.id, title: (nl && s.title_nl) || s.title_en || '', image: await url(s.image_key), video: s.video_key ? await url(s.video_key) : null, spots });
    }
    return out;
  }

  // ── v89 — treasure chest: each correct quiz answer in the chapter adds a
  // diamond; when every quiz is answered right the chest opens and shows a
  // personal shop code (one per family per chapter, kept). Staff and
  // teachers previewing get an example code; nothing is created for them.
  const CHEST_OPEN = '/images/mare-spot-treasure-chest.png';
  // v108 — several chests, each collecting diamonds over one or more
  // chapters, each with its own code (a personal code per family, or one
  // code chosen from Offers) and its own pictures. A chapter is in at most
  // one chest. The old single setting (one chest per ticked chapter) is
  // read as one chest per chapter.
  const okKey = (k) => typeof k === 'string' && (KEY_OK.test(k) || BUILTIN_ICON.test(k)) ? k : null;
  function cleanChest(c, i) {
    return {
      id: /^[a-z0-9-]{1,40}$/i.test(String(c.id || '')) ? String(c.id) : 'c' + crypto.randomBytes(4).toString('hex'),
      name: String(c.name || '').trim().slice(0, 80) || `Kist ${i + 1}`,
      chapters: [...new Set((Array.isArray(c.chapters) ? c.chapters : []).map(Number).filter(n => Number.isInteger(n) && n > 0))].sort((x, y) => x - y),
      mode: c.mode === 'offer' ? 'offer' : 'personal',
      offerCode: c.mode === 'offer' ? String(c.offerCode || '').toUpperCase().trim().slice(0, 40) : '',
      percent: Math.round(clamp(c.percent == null ? 10 : c.percent, 1, 90)),
      days: Math.round(clamp(c.days == null ? 90 : c.days, 7, 730)),
      closedKey: okKey(c.closedKey), openKey: okKey(c.openKey),
    };
  }
  function treasureCfg() {
    let o = {}; try { o = JSON.parse((db.getAppConfig() || {}).treasure_json || '{}') || {}; } catch { o = {}; }
    let chests;
    if (Array.isArray(o.chests)) chests = o.chests.map(cleanChest);
    else chests = (Array.isArray(o.chapters) ? o.chapters : []).map(Number).filter(n => Number.isInteger(n) && n > 0)
      .map((n, i) => cleanChest({ id: 'ch' + n, name: `Hoofdstuk ${n}`, chapters: [n], mode: 'personal', percent: o.percent, days: o.days, closedKey: o.closedKey, openKey: o.openKey }, i));
    const seen = new Set(); // a chapter belongs to the first chest that has it
    for (const c of chests) c.chapters = c.chapters.filter(n => (seen.has(n) ? false : (seen.add(n), true)));
    return { chests };
  }
  // v113: every chapter with a quiz question gets its own chest straight away
  // (same code settings as the first chest), so its diamonds always count
  function ensureChests() {
    const { chests } = treasureCfg();
    const taken = new Set(chests.flatMap(c => c.chapters));
    const base = chests[0] || {};
    let added = 0;
    for (const p of db.companionPractices()) {
      if (taken.has(p.chapter_no) || !chapterQuizIds(p.chapter_no).length) continue;
      chests.push(cleanChest({ name: `Hoofdstuk ${p.chapter_no}`, chapters: [p.chapter_no], mode: base.mode, offerCode: base.offerCode, percent: base.percent, days: base.days, closedKey: base.closedKey, openKey: base.openKey }, chests.length));
      added++;
    }
    if (added) db.run(`UPDATE app_config SET treasure_json = ? WHERE id = 'default'`, [JSON.stringify({ chests })]);
    return added;
  }
  const chestOf = (chapterNo) => treasureCfg().chests.find(c => c.chapters.includes(chapterNo)) || null;
  // the quiz spots of a chapter that count (active steps, with answers)
  function chapterQuizIds(chapterNo) {
    const ids = [];
    for (const s of db.pictureScenes(chapterNo, true)) {
      for (const p of db.pictureSpots(s.id)) if (p.type === 'quiz' && parseQuiz(p.quiz_json).answers.length) ids.push(p.id);
    }
    return ids;
  }
  const chestQuizIds = (chest) => chest.chapters.flatMap(n => chapterQuizIds(n));
  // the chest's code: the chosen Offers code while it is active, else a personal code
  function chestOffer(chest) {
    if (chest.mode !== 'offer' || !chest.offerCode) return null;
    const o = db.getOfferByCode(chest.offerCode);
    return o && o.active && (!o.expires_at || o.expires_at >= new Date().toISOString().slice(0, 10)) ? o : null;
  }
  const chestPercent = (chest) => { const o = chestOffer(chest); return o ? (o.discount_type === 'percent' ? o.discount_value : null) : chest.percent; };
  // v106: the "view as child / parent" preview family is a preview too: empty chest each time, example code only
  const isPreviewUser = (u) => !u || u.role !== 'parent' || /@preview\.mare\.invalid$/i.test(String(u.email || ''));
  function treasureCodeFor(parentId, chest) {
    if (!chest.chapters.length) return null;
    const row = db.get(`SELECT t.code, o.expires_at FROM treasure_codes t LEFT JOIN offers o ON o.code = t.code WHERE t.parent_id = ? AND t.chapter_no IN (${chest.chapters.map(() => '?').join(',')}) ORDER BY t.created_at DESC LIMIT 1`, [parentId, ...chest.chapters]);
    return row ? { code: row.code, expires: row.expires_at || null } : null;
  }
  async function treasureFor(chapterNo, user) {
    const chest = chestOf(chapterNo);
    if (!chest) return null;
    const ids = chestQuizIds(chest);
    if (!ids.length) return null;
    const done = isPreviewUser(user) ? null : treasureCodeFor(user.id, chest);
    return { id: chest.id, name: chest.name, chapters: chest.chapters, ids, total: ids.length, preview: isPreviewUser(user), percent: chestPercent(chest),
      closed: chest.closedKey ? await url(chest.closedKey) : null, open: (chest.openKey ? await url(chest.openKey) : null) || CHEST_OPEN, done };
  }
  app.post('/api/pictures/treasure', family, (req, res) => {
    const chapterNo = Math.round(Number(req.body && req.body.chapter));
    const chest = chestOf(chapterNo);
    if (!chest) return res.status(400).json({ error: 'No treasure chest in this chapter.' });
    const need = chestQuizIds(chest);
    const have = new Set(Array.isArray(req.body.spots) ? req.body.spots.map(String) : []);
    if (!need.length || need.some(id => !have.has(id))) return res.status(400).json({ error: 'Not every question has been answered yet.' });
    const offer = chestOffer(chest);
    if (isPreviewUser(req.user)) return res.json({ ok: true, preview: true, code: offer ? offer.code : 'VOORBEELD', percent: chestPercent(chest) });
    let got = treasureCodeFor(req.user.id, chest);
    if (!got) {
      let code = offer ? offer.code : null;
      if (!code) {
        for (let i = 0; i < 6 && !code; i++) { const c = 'SCHAT' + crypto.randomBytes(3).toString('hex').toUpperCase(); if (!db.getOfferByCode(c)) code = c; }
        const expires = new Date(Date.now() + chest.days * 864e5).toISOString().slice(0, 10);
        db.createOffer({ code, description: `Treasure chest "${chest.name}" (${chest.percent}%, one family)`, discountType: 'percent', discountValue: chest.percent, expiresAt: expires });
      }
      db.run(`INSERT OR IGNORE INTO treasure_codes (parent_id, chapter_no, code) VALUES (?,?,?)`, [req.user.id, Math.min(...chest.chapters), code]);
      got = treasureCodeFor(req.user.id, chest);
    }
    res.json({ ok: true, code: got.code, expires: got.expires, percent: chestPercent(chest) });
  });
  // v97 — the family's treasure chest codes that can still be used, so the
  // shop puts one in the basket by itself (best discount first). Signed-out
  // visitors and staff simply get an empty list.
  app.get('/api/shop/treasure-codes', (req, res) => {
    const payload = auth.verifyToken(req.cookies && req.cookies[auth.COOKIE_NAME]);
    if (!payload || payload.role !== 'parent') return res.json({ codes: [] });
    const rows = db.all(`SELECT t.code, t.chapter_no, o.discount_value, o.expires_at FROM treasure_codes t JOIN offers o ON o.code = t.code
      WHERE t.parent_id = ? AND o.active = 1 AND (o.expires_at IS NULL OR o.expires_at >= date('now'))
      ORDER BY o.discount_value DESC, o.expires_at ASC`, [payload.id]);
    res.json({ codes: rows.map(r => ({ code: r.code, chapter: r.chapter_no, percent: r.discount_value, expires: r.expires_at || null })) });
  });
  // staff: the chests, every chapter's steps and questions, and the Offers codes to choose from
  app.get('/api/admin/treasure', staff, async (req, res) => {
    const { chests } = treasureCfg();
    const chapters = [];
    for (const p of db.companionPractices()) {
      const scenes = db.pictureScenes(p.chapter_no);
      let quizzesAll = 0;
      for (const s of scenes) for (const sp of db.pictureSpots(s.id)) if (sp.type === 'quiz') quizzesAll++;
      const c = chests.find(x => x.chapters.includes(p.chapter_no));
      chapters.push({ no: p.chapter_no, title: p.chapter_title_en, titleNl: p.chapter_title_nl || '', steps: scenes.length,
        pictures: scenes.filter(s => s.image_key && !s.video_key).length, videos: scenes.filter(s => s.video_key).length,
        quizzes: chapterQuizIds(p.chapter_no).length, quizzesUnfinished: Math.max(0, quizzesAll - chapterQuizIds(p.chapter_no).length), chest: c ? c.id : null });
    }
    const out = [];
    for (const c of chests) {
      const given = c.chapters.length ? (db.get(`SELECT COUNT(*) AS n FROM treasure_codes WHERE chapter_no IN (${c.chapters.map(() => '?').join(',')})`, c.chapters) || { n: 0 }).n : 0;
      out.push({ ...c, quizzes: chestQuizIds(c).length, given, offerOk: c.mode !== 'offer' || !!chestOffer(c), percentNow: chestPercent(c),
        closedUrl: c.closedKey ? await url(c.closedKey) : null, openUrl: (c.openKey ? await url(c.openKey) : null) || CHEST_OPEN });
    }
    const today = new Date().toISOString().slice(0, 10);
    const offers = db.getAllOffers().filter(o => o.active && !/^SCHAT/.test(o.code) && (!o.expires_at || o.expires_at >= today))
      .map(o => ({ code: o.code, type: o.discount_type, value: o.discount_value, expires: o.expires_at || null, description: o.description || '' }));
    const codes = db.get(`SELECT COUNT(*) AS n FROM treasure_codes`) || { n: 0 };
    res.json({ chests: out, chapters, offers, codesGiven: codes.n || 0, defaultOpenUrl: CHEST_OPEN });
  });
  app.put('/api/admin/treasure', staff, (req, res) => {
    const b = req.body || {};
    if (!Array.isArray(b.chests)) return res.status(400).json({ error: 'Nothing to save.' });
    const chests = b.chests.slice(0, 30).map(cleanChest);
    const seen = new Set();
    for (const c of chests) {
      c.chapters = c.chapters.filter(n => db.companionPractice(n) && !seen.has(n));
      c.chapters.forEach(n => seen.add(n));
      if (c.mode === 'offer' && !db.getOfferByCode(c.offerCode || '')) return res.status(400).json({ error: `The code "${c.offerCode}" for "${c.name}" isn't in Offers. Choose a code from the list, or choose a personal code per family, then press Save again.` });
    }
    db.run(`UPDATE app_config SET treasure_json = ? WHERE id = 'default'`, [JSON.stringify({ chests })]);
    res.json({ ok: true });
  });

  // ── v110 — the book flow: cover → contents → chapter page with its
  // videos/pictures (when to watch each), its diamonds and its code. All
  // pictures and words of the flow are set in admin (Book Companion → Flow).
  const BOOK_IMG = { cover: '/images/mare-front-cover.jpg', contents: '/images/mare-forest-no-words.jpg', chapterBg: '/images/mare-forest-no-words.jpg', companion1: '/images/mare-front-cover.jpg', companion2: '' };
  const BOOK_TEXTS = {
    coverTitle: { nl: 'Mare en het fluisterbos van woorden', en: 'Mare and the Whispering Woods of Words' },
    coverTap: { nl: 'Tik op het boek om te beginnen', en: 'Tap the book to begin' },
    contentsTitle: { nl: 'Inhoud', en: 'Contents' },
    contentsIntro: { nl: 'Kies het hoofdstuk dat jullie gaan lezen. Je kunt altijd naar een ander hoofdstuk springen.', en: 'Choose the chapter you are going to read. You can jump to another chapter at any time.' },
    chapterIntro: { nl: 'Lees het hoofdstuk samen. Bij elke video staat wanneer je hem bekijkt. Tik op de lichtjes en beantwoord de vragen: elk goed antwoord is een diamant voor de schatkist.', en: 'Read the chapter together. Each video says when to watch it. Tap the glowing spots and answer the questions: every right answer is a diamond for the treasure chest.' },
    chestLine: { nl: 'De schatkist is open: bekijk jullie code', en: 'The treasure chest is open: see your code' },
    diamonds: { nl: 'Diamanten', en: 'Diamonds' },
  };
  const BOOK_IMG_OK = (k) => typeof k === 'string' && (KEY_OK.test(k) || /^\/images\/[a-z0-9-]+\.(png|jpe?g|webp)$/.test(k)) ? k : null;
  async function bookUrl(key) { if (!key) return null; if (key.startsWith('/images/')) return key; try { return await media.getPlaybackUrl(key); } catch { return null; } }
  function bookCfg() {
    let o = {}; try { o = JSON.parse((db.getAppConfig() || {}).book_json || '{}') || {}; } catch { o = {}; }
    const images = {}; for (const k of Object.keys(BOOK_IMG)) images[k] = BOOK_IMG_OK((o.images || {})[k]) || null;
    const texts = {};
    for (const k of Object.keys(BOOK_TEXTS)) { const t = (o.texts || {})[k] || {}; texts[k] = { nl: String(t.nl || '').slice(0, 600), en: String(t.en || '').slice(0, 600) }; }
    const chapters = {};
    for (const [n, c] of Object.entries(o.chapters || {})) if (/^\d+$/.test(n) && c) chapters[n] = { imageKey: BOOK_IMG_OK(c.imageKey), intro_nl: String(c.intro_nl || '').slice(0, 1500), intro_en: String(c.intro_en || '').slice(0, 1500) };
    return { images, texts, chapters };
  }
  const bookText = (cfg, k, nl) => (nl ? (cfg.texts[k].nl || cfg.texts[k].en) : (cfg.texts[k].en || cfg.texts[k].nl)) || BOOK_TEXTS[k][nl ? 'nl' : 'en'];
  const bookImg = (cfg, k) => bookUrl(cfg.images[k] || BOOK_IMG[k]);
  // the family's book: every chapter, open, with its steps and its chest
  app.get('/api/book', family, async (req, res) => {
    const cfg = bookCfg();
    let nl = req.query.lang === 'nl', talk = false;
    if (req.user.role === 'parent') {
      const parent = db.getParentById(req.user.id);
      talk = !!(parent && parent.picture_talk !== 0 && db.getChildrenByParent(parent.id).length);
      if (!req.query.lang && parent) nl = parent.preferred_locale === 'nl';
    } else talk = true; // previews show it
    const chapters = [];
    for (const p of db.companionPractices()) {
      const n = p.chapter_no, cc = cfg.chapters[n] || {};
      const steps = [];
      let i = 0;
      for (const s of db.pictureScenes(n, true)) {
        i++;
        const spots = db.pictureSpots(s.id);
        const poster = s.poster_key ? await url(s.poster_key) : null; // v112: its own picture, else the picture itself / the video's first frame
        steps.push({ n: i, id: s.id, video: !!s.video_key, thumb: poster || (s.video_key ? null : await url(s.image_key)), videoUrl: s.video_key ? await url(s.video_key) : null,
          title: (nl && s.title_nl) || s.title_en || s.title_nl || '', when: (nl && s.when_nl) || s.when_en || s.when_nl || '',
          quizzes: spots.filter(sp => sp.type === 'quiz' && parseQuiz(sp.quiz_json).answers.length).length });
      }
      const firstPic = steps.find(x => x.thumb), firstVid = steps.find(x => x.video);
      // v111: the chapter's practice from the Book Companion (Book content) shows on the chapter page too
      const pTitle = (nl && p.title_nl) || p.title_en || '', pBody = (nl && p.body_nl) || p.body_en || '';
      chapters.push({ no: n, title: (nl && p.chapter_title_nl) || p.chapter_title_en || '', image: cc.imageKey ? await bookUrl(cc.imageKey) : (firstPic ? firstPic.thumb : null),
        imageVideo: !cc.imageKey && !firstPic && firstVid ? firstVid.videoUrl : null, // no picture: the first video's opening frame
        intro: (nl ? (cc.intro_nl || cc.intro_en) : (cc.intro_en || cc.intro_nl)) || '', steps, treasure: await treasureFor(n, req.user),
        practice: pBody.trim() ? { title: pTitle, body: pBody } : null });
    }
    res.set('Cache-Control', 'no-store');
    res.json({ nl, talk, preview: isPreviewUser(req.user),
      images: { cover: await bookImg(cfg, 'cover'), contents: await bookImg(cfg, 'contents'), chapterBg: await bookImg(cfg, 'chapterBg') },
      texts: Object.fromEntries(Object.keys(BOOK_TEXTS).map(k => [k, bookText(cfg, k, nl)])), chapters });
  });
  // the Book Companion page's background pictures
  app.get('/api/book/look', async (req, res) => {
    const cfg = bookCfg();
    res.json({ companion: [await bookImg(cfg, 'companion1'), await bookImg(cfg, 'companion2')].filter(Boolean), cover: await bookImg(cfg, 'cover') });
  });
  // staff: everything that can be changed in the flow
  app.get('/api/admin/book', staff, async (req, res) => {
    ensureChests(); // v113: chapters that already have questions get their chest
    const cfg = bookCfg();
    const images = {};
    for (const k of Object.keys(BOOK_IMG)) images[k] = { key: cfg.images[k], url: await bookImg(cfg, k), isDefault: !cfg.images[k] };
    const chapters = {};
    for (const [n, c] of Object.entries(cfg.chapters)) chapters[n] = { ...c, imageUrl: c.imageKey ? await bookUrl(c.imageKey) : null };
    const scenes = {}; // v112: each step's own picture
    for (const sc of db.pictureScenes(null)) if (sc.poster_key) scenes[sc.id] = await url(sc.poster_key);
    res.json({ images, texts: cfg.texts, defaults: BOOK_TEXTS, chapters, posters: scenes, chestChapters: treasureCfg().chests.flatMap(c => c.chapters),
      quizChapters: db.companionPractices().filter(p => chapterQuizIds(p.chapter_no).length).map(p => p.chapter_no) });
  });
  app.put('/api/admin/book', staff, (req, res) => {
    const b = req.body || {}, cur = bookCfg();
    if (b.images) for (const k of Object.keys(BOOK_IMG)) if (b.images[k] !== undefined) {
      if (b.images[k] && !BOOK_IMG_OK(b.images[k])) return res.status(400).json({ error: 'That picture could not be used. Upload it again, then press Save.' });
      cur.images[k] = b.images[k] || null;
    }
    if (b.texts) for (const k of Object.keys(BOOK_TEXTS)) if (b.texts[k]) for (const l of ['nl', 'en']) if (b.texts[k][l] !== undefined) cur.texts[k][l] = String(b.texts[k][l] || '').trim().slice(0, 600);
    if (b.chapter && db.companionPractice(Number(b.chapter.no))) {
      const n = String(Number(b.chapter.no)), c = cur.chapters[n] || { imageKey: null, intro_nl: '', intro_en: '' };
      if (b.chapter.imageKey !== undefined) { if (b.chapter.imageKey && !BOOK_IMG_OK(b.chapter.imageKey)) return res.status(400).json({ error: 'That picture could not be used. Upload it again.' }); c.imageKey = b.chapter.imageKey || null; }
      if (b.chapter.intro_nl !== undefined) c.intro_nl = String(b.chapter.intro_nl || '').trim().slice(0, 1500);
      if (b.chapter.intro_en !== undefined) c.intro_en = String(b.chapter.intro_en || '').trim().slice(0, 1500);
      cur.chapters[n] = c;
    }
    db.run(`UPDATE app_config SET book_json = ? WHERE id = 'default'`, [JSON.stringify(cur)]);
    res.json({ ok: true });
  });
  // v110: one chest for every chapter that has questions and no chest yet
  app.post('/api/admin/treasure/per-chapter', staff, (req, res) => {
    const { chests } = treasureCfg();
    const taken = new Set(chests.flatMap(c => c.chapters));
    const base = chests[0] || {};
    let added = 0;
    for (const p of db.companionPractices()) {
      if (taken.has(p.chapter_no)) continue;
      chests.push(cleanChest({ name: `Hoofdstuk ${p.chapter_no}`, chapters: [p.chapter_no], mode: base.mode, offerCode: base.offerCode, percent: base.percent, days: base.days, closedKey: base.closedKey, openKey: base.openKey }, chests.length));
      added++;
    }
    db.run(`UPDATE app_config SET treasure_json = ? WHERE id = 'default'`, [JSON.stringify({ chests })]);
    res.json({ ok: true, added });
  });

  // The child's view: the family's current chapter (or ?chapter=).
  app.get('/api/pictures', family, async (req, res) => {
    let chapterNo = Number(req.query.chapter) || 0;
    let nl = req.query.lang === 'nl';
    let talk = false;
    if (req.user.role === 'parent') {
      const parent = db.getParentById(req.user.id);
      talk = !!(parent && parent.picture_talk !== 0 && db.getChildrenByParent(parent.id).length);
      if (!chapterNo) chapterNo = (parent && parent.companion_chapter) || 1;
      if (!req.query.lang && parent) nl = parent.preferred_locale === 'nl';
    }
    chapterNo = chapterNo || 1;
    const p = db.companionPractice(chapterNo);
    res.set('Cache-Control', 'no-store');
    res.json({
      chapter: chapterNo,
      chapterTitle: p ? ((nl && p.chapter_title_nl) || p.chapter_title_en) : '',
      talk, // Mare App 5 — show the "Talk to Mare" bubble (family switch on, has a child)
      scenes: await publicScenes(chapterNo, nl),
      treasure: await treasureFor(chapterNo, req.user), // v89
    });
  });
  // Cheap check the iPad polls: which chapter is the family on now?
  app.get('/api/pictures/chapter', family, (req, res) => {
    const parent = req.user.role === 'parent' ? db.getParentById(req.user.id) : null;
    res.set('Cache-Control', 'no-store');
    res.json({ chapter: (parent && parent.companion_chapter) || 1 });
  });

  // v74 — 'Write to Mare' while testing (staff or teacher preview): there is
  // no family to file it under, so it goes to the Mare team's email,
  // clearly marked as a test. Families' messages use /api/companion/message.
  const tester = auth.requireAuthApi(['teacher', 'admin', 'support', 'editor']);
  app.post('/api/pictures/test-message', tester, async (req, res) => {
    const message = String((req.body && req.body.message) || '').trim().slice(0, 1500);
    if (!message) return res.status(400).json({ error: 'Write a message first' });
    const config = db.getAppConfig() || {};
    if (!config.contact_email || !email) return res.status(503).json({ error: 'No Mare team email is set up.' });
    const who = req.user.role === 'teacher' ? db.getTeacherById(req.user.id) : db.getAdminById(req.user.id);
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    try {
      const sent = await email.sendEmail(config.contact_email, `TEST: message to Mare from the pictures`,
        `<p><strong>Test</strong> from the picture explorer, sent while previewing by ${esc(who ? who.name || '' : '')} (${esc(who ? who.email || '' : '')}, ${esc(req.user.role)}). No family will see this.</p><blockquote>${esc(message).replace(/\n/g, '<br>')}</blockquote><p><a href="${publicUrl}/admin.html">${publicUrl}/admin.html</a></p>`,
        { kind: 'mare_message_test' });
      if (sent && sent.ok === false) return res.status(502).json({ error: 'The email could not be sent.' });
      res.json({ ok: true, to: config.contact_email });
    } catch (e) { res.status(502).json({ error: 'The email could not be sent.' }); }
  });

  // ── Staff ──
  app.get('/api/admin/pictures', staff, async (req, res) => {
    const scenes = db.pictureScenes(null);
    const out = [];
    for (const s of scenes) out.push({ ...s, imageUrl: await url(s.image_key), videoUrl: s.video_key ? await url(s.video_key) : null, spots: db.pictureSpots(s.id) });
    res.json({ scenes: out, chapters: db.companionPractices().map(p => ({ no: p.chapter_no, title: p.chapter_title_en, practice: (p.body_nl || p.body_en) ? (p.title_nl || p.title_en || '') : '' })) });
  });
  app.post('/api/admin/pictures', staff, (req, res) => {
    const n = Math.round(Number(req.body && req.body.chapter));
    if (!db.companionPractice(n)) return res.status(400).json({ error: 'Unknown chapter' });
    res.json({ ok: true, id: db.createPictureScene(n) });
  });
  app.patch('/api/admin/pictures/:id', staff, (req, res) => {
    if (!db.pictureScene(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const f = {};
    if (b.imageKey !== undefined) { if (b.imageKey && !KEY_OK.test(b.imageKey)) return res.status(400).json({ error: 'Bad key' }); f.imageKey = b.imageKey || null; }
    if (b.videoKey !== undefined) {
      if (b.videoKey && (!KEY_OK.test(b.videoKey) || !/\.mp4$/i.test(b.videoKey))) return res.status(400).json({ error: 'Please upload the video as an mp4.' });
      f.videoKey = b.videoKey || null;
    }
    if (b.titleEn !== undefined) f.titleEn = String(b.titleEn).slice(0, 120);
    if (b.titleNl !== undefined) f.titleNl = String(b.titleNl).slice(0, 120);
    if (b.contextEn !== undefined) f.contextEn = String(b.contextEn).slice(0, 1500);
    if (b.contextNl !== undefined) f.contextNl = String(b.contextNl).slice(0, 1500);
    if (b.whenEn !== undefined) f.whenEn = String(b.whenEn).slice(0, 300); // v110: when to watch it (book flow)
    if (b.whenNl !== undefined) f.whenNl = String(b.whenNl).slice(0, 300);
    if (b.posterKey !== undefined) { if (b.posterKey && !KEY_OK.test(b.posterKey)) return res.status(400).json({ error: 'Bad key' }); f.posterKey = b.posterKey || null; } // v112
    if (b.sortOrder !== undefined) f.sortOrder = Math.round(Number(b.sortOrder)) || 0;
    if (b.active !== undefined) f.active = !!b.active;
    db.updatePictureScene(req.params.id, f);
    res.json({ ok: true });
  });
  // v105 — every picture and video ever uploaded for a step (they are never
  // deleted), newest first, so one replaced by mistake can be put back
  app.get('/api/admin/pictures/earlier-media', staff, async (req, res) => {
    try {
      const files = [...await media.listObjects('pictures/scenes/'), ...await media.listObjects('pictures/scene-videos/')]
        .filter(f => KEY_OK.test(f.key) && f.sizeBytes > 0)
        .sort((a, b) => String(b.modifiedAt || '').localeCompare(String(a.modifiedAt || ''))).slice(0, 80);
      const scenes = db.pictureScenes(null);
      const usedBy = new Map();
      for (const s of scenes) for (const k of [s.image_key, s.video_key]) if (k) usedBy.set(k, s);
      const stepNo = (s) => scenes.filter(x => x.chapter_no === s.chapter_no).findIndex(x => x.id === s.id) + 1;
      const out = [];
      for (const f of files) {
        const u = usedBy.get(f.key);
        out.push({ key: f.key, video: f.key.startsWith('pictures/scene-videos/'), name: f.key.split('/').pop().replace(/^\d{10,}-/, ''), at: f.modifiedAt, url: await url(f.key), usedBy: u ? { chapter: u.chapter_no, step: stepNo(u) } : null });
      }
      res.json({ files: out });
    } catch (e) { res.status(422).json({ error: 'The list of earlier files could not be read. Wait a minute, then press the button again.' }); }
  });
  app.delete('/api/admin/pictures/:id', staff, (req, res) => { db.deletePictureScene(req.params.id); res.json({ ok: true }); });

  function spotFields(b) {
    const f = {};
    if (b.x !== undefined) f.x = clamp(b.x, 0, 1);
    if (b.y !== undefined) f.y = clamp(b.y, 0, 1);
    if (b.r !== undefined) f.r = clamp(b.r, 0.02, 0.5); // v76: masks can be wide
    if (b.look !== undefined) { const l = parseLook(JSON.stringify(b.look || {})); f.look_json = JSON.stringify(l); }
    if (b.type !== undefined) f.type = TYPES.includes(b.type) ? b.type : 'popup';
    for (const [k, max] of [['title_en', 120], ['title_nl', 120], ['text_en', 1500], ['text_nl', 1500], ['video_url', 300], ['hint_en', 200], ['hint_nl', 200]]) {
      if (b[k] !== undefined) f[k] = String(b[k] || '').slice(0, max);
    }
    // v74 — timing on a video (seconds; empty = from the start / to the end)
    for (const k of ['t_start', 't_end']) {
      if (b[k] !== undefined) f[k] = (b[k] === null || b[k] === '') ? null : clamp(b[k], 0, 6 * 3600);
    }
    if (b.pause_on_show !== undefined) f.pause_on_show = b.pause_on_show ? 1 : 0;
    if (b.quiz !== undefined) {
      const q = b.quiz || {};
      const s = (v, n) => String(v || '').slice(0, n);
      const answers = (Array.isArray(q.answers) ? q.answers : []).slice(0, 4).map(a => {
        const k = a && a.image_key && KEY_OK.test(a.image_key) ? a.image_key : null;
        return { en: s(a && a.en, 160), nl: s(a && a.nl, 160), image_key: k };
      });
      f.quiz_json = JSON.stringify({ answers, correct: Math.max(0, Math.min(answers.length - 1, Math.round(Number(q.correct) || 0))),
        right_en: s(q.right_en, 300), right_nl: s(q.right_nl, 300), wrong_en: s(q.wrong_en, 300), wrong_nl: s(q.wrong_nl, 300) });
    }
    for (const k of ['image_key', 'audio_key_en', 'audio_key_nl', 'video_key']) {
      if (b[k] !== undefined) {
        if (b[k] && !KEY_OK.test(b[k])) throw new Error('Bad key');
        f[k] = b[k] || null;
      }
    }
    return f;
  }
  app.post('/api/admin/pictures/:id/spots', staff, (req, res) => {
    if (!db.pictureScene(req.params.id)) return res.status(404).json({ error: 'Not found' });
    try { const id = db.savePictureSpot(null, req.params.id, spotFields(req.body || {})); ensureChests(); res.json({ ok: true, id }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.patch('/api/admin/picture-spots/:id', staff, (req, res) => {
    if (!db.pictureSpot(req.params.id)) return res.status(404).json({ error: 'Not found' });
    try { db.savePictureSpot(req.params.id, null, spotFields(req.body || {})); ensureChests(); res.json({ ok: true }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.delete('/api/admin/picture-spots/:id', staff, (req, res) => { db.deletePictureSpot(req.params.id); res.json({ ok: true }); });
  // v88 — every picture already used as a spot, to choose again
  app.get('/api/admin/picture-spot-icons', staff, async (req, res) => {
    const keys = new Set();
    try { fs.readdirSync(path.join(__dirname, 'public', 'images')).filter(f => BUILTIN_ICON.test('/images/' + f)).sort().forEach(f => keys.add('/images/' + f)); } catch { /* none */ }
    for (const r of db.all(`SELECT look_json FROM picture_spots WHERE look_json LIKE '%"icon"%'`)) { const l = parseLook(r.look_json); if (l.icon) keys.add(l.icon); }
    const icons = [];
    for (const key of keys) icons.push({ key, url: await url(key) });
    res.json({ icons });
  });
}

module.exports = { register };
