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
          quiz: p.type === 'quiz' ? await publicQuiz(p.quiz_json, nl) : null,
          look: await (async () => { const l = parseLook(p.look_json); return { ...l, icon: undefined, iconUrl: l.icon ? await url(l.icon) : null }; })(),
        });
      }
      out.push({ id: s.id, title: (nl && s.title_nl) || s.title_en || '', image: await url(s.image_key), video: s.video_key ? await url(s.video_key) : null, spots });
    }
    return out;
  }

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
    res.json({ scenes: out, chapters: db.companionPractices().map(p => ({ no: p.chapter_no, title: p.chapter_title_en })) });
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
    if (b.sortOrder !== undefined) f.sortOrder = Math.round(Number(b.sortOrder)) || 0;
    if (b.active !== undefined) f.active = !!b.active;
    db.updatePictureScene(req.params.id, f);
    res.json({ ok: true });
  });
  app.delete('/api/admin/pictures/:id', staff, (req, res) => { db.deletePictureScene(req.params.id); res.json({ ok: true }); });

  function spotFields(b) {
    const f = {};
    if (b.x !== undefined) f.x = clamp(b.x, 0, 1);
    if (b.y !== undefined) f.y = clamp(b.y, 0, 1);
    if (b.r !== undefined) f.r = clamp(b.r, 0.02, 0.5); // v76: masks can be wide
    if (b.look !== undefined) { const l = parseLook(JSON.stringify(b.look || {})); f.look_json = JSON.stringify(l); }
    if (b.type !== undefined) f.type = TYPES.includes(b.type) ? b.type : 'popup';
    for (const [k, max] of [['title_en', 120], ['title_nl', 120], ['text_en', 1500], ['text_nl', 1500], ['video_url', 300]]) {
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
    try { res.json({ ok: true, id: db.savePictureSpot(null, req.params.id, spotFields(req.body || {})) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.patch('/api/admin/picture-spots/:id', staff, (req, res) => {
    if (!db.pictureSpot(req.params.id)) return res.status(404).json({ error: 'Not found' });
    try { db.savePictureSpot(req.params.id, null, spotFields(req.body || {})); res.json({ ok: true }); }
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
