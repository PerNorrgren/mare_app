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
const TYPES = ['sound', 'voice', 'popup', 'video'];
const KEY_OK = /^pictures\/[A-Za-z0-9._\/-]+$/;

function register(app, { db, auth, media }) {
  const family = auth.requireAuthApi(['parent', 'admin', 'support', 'editor']);
  const staff = auth.requireAuthApi(['admin', 'support']);

  async function url(key) {
    if (!key) return null;
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
        });
      }
      out.push({ id: s.id, title: (nl && s.title_nl) || s.title_en || '', image: await url(s.image_key), spots });
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

  // ── Staff ──
  app.get('/api/admin/pictures', staff, async (req, res) => {
    const scenes = db.pictureScenes(null);
    const out = [];
    for (const s of scenes) out.push({ ...s, imageUrl: await url(s.image_key), spots: db.pictureSpots(s.id) });
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
    if (b.r !== undefined) f.r = clamp(b.r, 0.02, 0.3);
    if (b.type !== undefined) f.type = TYPES.includes(b.type) ? b.type : 'popup';
    for (const [k, max] of [['title_en', 120], ['title_nl', 120], ['text_en', 1500], ['text_nl', 1500], ['video_url', 300]]) {
      if (b[k] !== undefined) f[k] = String(b[k] || '').slice(0, max);
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
}

module.exports = { register };
