// ── server.js — Mare companion app ──
// Separate Railway service from per_bot, same project. Own repo, own
// deploy.sh, own admin, own accounts. Ported from per_bot: auth pattern,
// R2 media plumbing, ElevenLabs TTS, Deepgram word-timestamp STT. Not
// ported: courses, comms, Tomte-as-open-chat, Stripe subscription tiers
// (merchandise here uses one-off Stripe Checkout instead).

const express = require('express');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const fetch = require('node-fetch');
const Stripe = require('stripe');

const db = require('./db');
const auth = require('./auth');
const media = require('./media');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const MARE_VOICE_ID = process.env.MARE_VOICE_ID; // same ElevenLabs voice already used for Mare inside per_bot's Tomte flow
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// ─────────────────────────────────────────────────────────────────────
// LOCALE — English and Dutch to start (the book's two published
// editions). Adding a language later means adding it here, adding a
// public/i18n/<locale>.json file, and adding the book rows for it —
// nothing else in this list needs to change.
// ─────────────────────────────────────────────────────────────────────
const SUPPORTED_LOCALES = ['en', 'nl'];
const DEFAULT_LOCALE = 'en';

// Resolution order: explicit ?lang= query param (wins, since a person
// actively choosing a language should never be second-guessed) → saved
// mare_locale cookie → browser Accept-Language → default.
function resolveLocale(req) {
  const fromQuery = req.query?.lang;
  if (fromQuery && SUPPORTED_LOCALES.includes(fromQuery)) return fromQuery;
  const fromCookie = req.cookies?.mare_locale;
  if (fromCookie && SUPPORTED_LOCALES.includes(fromCookie)) return fromCookie;
  const acceptLang = (req.headers['accept-language'] || '').toLowerCase();
  for (const loc of SUPPORTED_LOCALES) {
    if (acceptLang.includes(loc)) return loc;
  }
  return DEFAULT_LOCALE;
}

// ─────────────────────────────────────────────────────────────────────
// AUTH — Parent / Teacher / Admin, fully separate accounts from per_bot
// ─────────────────────────────────────────────────────────────────────

app.post('/api/parent/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (db.getParentByEmail(email)) return res.status(409).json({ error: 'Email already registered' });
    const hash = await auth.hashPassword(password);
    const id = db.createParent({ email, passwordHash: hash, name });
    const token = auth.createToken({ role: 'parent', id, name, email });
    res.cookie(auth.COOKIE_NAME, token, auth.COOKIE_OPTIONS);
    res.json({ ok: true, id });
  } catch (e) {
    console.error('parent signup failed', e);
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/api/parent/login', async (req, res) => {
  const { email, password } = req.body || {};
  const result = await auth.loginParent(email || '', password || '');
  if (!result) return res.status(401).json({ error: 'Invalid email or password' });
  const token = auth.createToken(result);
  res.cookie(auth.COOKIE_NAME, token, auth.COOKIE_OPTIONS);
  res.json({ ok: true });
});

app.post('/api/teacher/signup', async (req, res) => {
  try {
    const { email, password, name, school } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (db.getTeacherByEmail(email)) return res.status(409).json({ error: 'Email already registered' });
    const hash = await auth.hashPassword(password);
    const id = db.createTeacher({ email, passwordHash: hash, name, school });
    const token = auth.createToken({ role: 'teacher', id, name, email });
    res.cookie(auth.COOKIE_NAME, token, auth.COOKIE_OPTIONS);
    res.json({ ok: true, id });
  } catch (e) {
    console.error('teacher signup failed', e);
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/api/teacher/login', async (req, res) => {
  const { email, password } = req.body || {};
  const result = await auth.loginTeacher(email || '', password || '');
  if (!result) return res.status(401).json({ error: 'Invalid email or password' });
  const token = auth.createToken(result);
  res.cookie(auth.COOKIE_NAME, token, auth.COOKIE_OPTIONS);
  res.json({ ok: true });
});

app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body || {};
  const result = await auth.loginAdmin(email || '', password || '');
  if (!result) return res.status(401).json({ error: 'Invalid email or password' });
  const token = auth.createToken(result);
  res.cookie(auth.COOKIE_NAME, token, auth.COOKIE_OPTIONS);
  res.json({ ok: true, role: result.role });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(auth.COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/me', auth.requireAuthApi(), (req, res) => res.json({ user: req.user }));

// ─────────────────────────────────────────────────────────────────────
// CHILDREN — profiles under a parent, no separate password
// ─────────────────────────────────────────────────────────────────────

app.get('/api/children', auth.requireAuthApi(['parent']), (req, res) => {
  res.json({ children: db.getChildrenByParent(req.user.id) });
});
app.post('/api/children', auth.requireAuthApi(['parent']), (req, res) => {
  const { name, avatarKey } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = db.createChild(req.user.id, name, avatarKey);
  res.json({ ok: true, id });
});

// ─────────────────────────────────────────────────────────────────────
// SPLASH — books + Club Mare + Merchandise icons in one call
// ─────────────────────────────────────────────────────────────────────

app.get('/api/splash', (req, res) => {
  const locale = resolveLocale(req);
  res.cookie('mare_locale', locale, { maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.json({
    locale,
    books: db.getActiveBooksForLocale(locale),
    hasClubMare: true,
    hasMerchandise: true,
  });
});

app.get('/api/books/:slug', (req, res) => {
  const book = db.getBookBySlug(req.params.slug);
  if (!book) return res.status(404).json({ error: 'Not found' });
  const chapters = db.getChaptersByBook(book.id).map(ch => ({
    ...ch,
    scenes: db.getScenesByChapter(ch.id),
  }));
  res.json({ book, chapters });
});

app.get('/api/scenes/:id', (req, res) => {
  const sceneId = req.params.id;
  res.json({
    sentences: db.getNarrationSentences(sceneId),
    hotspots: db.getHotspotsByScene(sceneId),
    audioCues: db.getAudioCuesByScene(sceneId),
  });
});

app.get('/api/activities/book/:bookId', (req, res) => {
  res.json({ activities: db.getActivitiesForBook(req.params.bookId) });
});

// ─────────────────────────────────────────────────────────────────────
// MEDIA UPLOAD — presigned R2, browser uploads directly (same pattern
// as per_bot). Admin-only.
// ─────────────────────────────────────────────────────────────────────

app.post('/api/admin/upload-url', auth.requireAuthApi(['admin', 'support']), async (req, res) => {
  try {
    const { key, contentType } = req.body || {};
    if (!key || !contentType) return res.status(400).json({ error: 'key and contentType required' });
    const url = await media.getUploadUrl(key, contentType);
    res.json({ url, key });
  } catch (e) {
    console.error('upload-url failed', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/playback-url', async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'key required' });
    const url = await media.getPlaybackUrl(key);
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// MARE VOICE — speak any text via ElevenLabs, same voice already used
// for Mare inside per_bot's Tomte flow (MARE_VOICE_ID). Generalises the
// per_bot /api/speak pattern so any text field (quiz instructions,
// hotspot popups, What's New items) can be read aloud.
// ─────────────────────────────────────────────────────────────────────

app.post('/api/speak', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text required' });
    if (!ELEVENLABS_API_KEY || !MARE_VOICE_ID) return res.status(503).json({ error: 'Voice not configured' });

    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${MARE_VOICE_ID}?output_format=mp3_44100_192`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY, 'Connection': 'close' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
    });
    if (!ttsRes.ok) throw new Error(`ElevenLabs TTS failed: ${ttsRes.status}`);
    res.set('Content-Type', 'audio/mpeg');
    ttsRes.body.pipe(res);
  } catch (e) {
    console.error('speak failed', e);
    res.status(500).json({ error: e.message });
  }
});

// Curated Mare "menu" — hello / joke etc. Deliberately not open free-chat
// (audience is a child) — a fixed set of short, pre-written responses,
// spoken via the same /api/speak pipeline. Content itself lives in admin
// later; this is the endpoint shape.
app.get('/api/mare/menu', (req, res) => {
  res.json({
    items: [
      { id: 'hello', label: 'Say hello' },
      { id: 'joke', label: 'Tell a joke' },
    ],
  });
});

// ─────────────────────────────────────────────────────────────────────
// NARRATION SYNC — upload narration audio for a scene, run it through
// Deepgram for word-level timestamps, collapse into sentences, store.
// Admin reviews/nudges the result before it's published (review UI is a
// separate front-end piece — this is the processing endpoint).
// ─────────────────────────────────────────────────────────────────────

app.post('/api/admin/scenes/:id/sync-narration', auth.requireAuthApi(['admin', 'support']), async (req, res) => {
  try {
    const sceneId = req.params.id;
    const { audioKey } = req.body || {};
    if (!audioKey) return res.status(400).json({ error: 'audioKey required' });
    if (!DEEPGRAM_API_KEY) return res.status(503).json({ error: 'Deepgram not configured' });

    db.setSceneNarrationAudio(sceneId, audioKey);
    const audioUrl = await media.getPlaybackUrl(audioKey);

    const dgRes = await fetch(
      `https://api.deepgram.com/v1/listen?model=nova-2&language=multi&smart_format=true&punctuate=true&utterances=true`,
      {
        method: 'POST',
        headers: { Authorization: `Token ${DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: audioUrl }),
      }
    );
    if (!dgRes.ok) throw new Error(`Deepgram failed: ${dgRes.status}`);
    const dgJson = await dgRes.json();

    // Deepgram's own "utterances" (when requested) are the natural
    // sentence-ish boundary — prefer those directly; fall back to a
    // manual collapse of the word array on punctuation if utterances
    // aren't present for some reason.
    const utterances = dgJson.results?.utterances;
    let sentences;
    if (utterances && utterances.length) {
      sentences = utterances.map(u => ({
        text: u.transcript,
        startMs: Math.round(u.start * 1000),
        endMs: Math.round(u.end * 1000),
      }));
    } else {
      const words = dgJson.results?.channels?.[0]?.alternatives?.[0]?.words || [];
      sentences = [];
      let cur = [];
      words.forEach(w => {
        cur.push(w);
        if (/[.!?]$/.test(w.punctuated_word || w.word)) {
          sentences.push({
            text: cur.map(x => x.punctuated_word || x.word).join(' '),
            startMs: Math.round(cur[0].start * 1000),
            endMs: Math.round(cur[cur.length - 1].end * 1000),
          });
          cur = [];
        }
      });
      if (cur.length) {
        sentences.push({
          text: cur.map(x => x.punctuated_word || x.word).join(' '),
          startMs: Math.round(cur[0].start * 1000),
          endMs: Math.round(cur[cur.length - 1].end * 1000),
        });
      }
    }

    db.replaceNarrationSentences(sceneId, sentences);
    res.json({ ok: true, sentences: db.getNarrationSentences(sceneId) });
  } catch (e) {
    console.error('sync-narration failed', e);
    res.status(500).json({ error: e.message });
  }
});

// Manual nudge after review, before publish.
app.patch('/api/admin/sentences/:id', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  const { startMs, endMs } = req.body || {};
  db.updateNarrationSentenceTiming(req.params.id, startMs, endMs);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────
// CLUB MARE — free now (tier 1), paid later (tier 2). Never tier 0.
// ─────────────────────────────────────────────────────────────────────

app.post('/api/club-mare/join', auth.requireAuthApi(['parent']), (req, res) => {
  db.joinClubMareFree(req.user.id);
  res.json({ ok: true });
});

app.get('/api/club-mare/posts', auth.requireAuthApi(['parent']), (req, res) => {
  const membership = db.getClubMareMembership(req.user.id);
  const tier = membership ? membership.tier : 0;
  res.json({ posts: tier > 0 ? db.getClubMarePosts(tier) : [] });
});

// ─────────────────────────────────────────────────────────────────────
// MERCHANDISE — in-app Stripe Checkout
// ─────────────────────────────────────────────────────────────────────

app.get('/api/products', (req, res) => res.json({ products: db.getActiveProducts() }));

app.post('/api/checkout', auth.requireAuthApi(['parent']), async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Payments not configured' });
    const { items } = req.body || {}; // [{ productId, qty, variant }]
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No items' });

    let totalCents = 0;
    const lineItems = [];
    for (const item of items) {
      const product = db.getProduct(item.productId);
      if (!product) return res.status(400).json({ error: `Unknown product ${item.productId}` });
      const qty = item.qty || 1;
      totalCents += product.price_cents * qty;
      lineItems.push({
        price_data: {
          currency: product.currency,
          product_data: { name: product.name },
          unit_amount: product.price_cents,
        },
        quantity: qty,
      });
    }

    const orderId = db.createOrder(req.user.id, totalCents, 'gbp');
    items.forEach(item => {
      const product = db.getProduct(item.productId);
      db.addOrderItem(orderId, item.productId, item.variant, item.qty || 1, product.price_cents);
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: `${process.env.APP_URL || ''}/merchandise?success=1`,
      cancel_url: `${process.env.APP_URL || ''}/merchandise?cancelled=1`,
      metadata: { orderId },
    });
    db.setOrderStripeSession(orderId, session.id);
    res.json({ url: session.url });
  } catch (e) {
    console.error('checkout failed', e);
    res.status(500).json({ error: e.message });
  }
});

// Stripe webhook — marks the order paid. Needs raw body, mounted before
// the express.json() middleware would normally consume it, so it's
// registered with its own express.raw() here.
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).end();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook signature verification failed: ${e.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    db.markOrderPaid(event.data.object.id);
  }
  res.json({ received: true });
});

// ─────────────────────────────────────────────────────────────────────
// WHAT'S NEW — Parent/Teacher only
// ─────────────────────────────────────────────────────────────────────

app.get('/api/whats-new', auth.requireAuthApi(['parent', 'teacher']), (req, res) => {
  res.json({ items: db.getWhatsNew(req.user.role) });
});

// ─────────────────────────────────────────────────────────────────────
// ADMIN — content CRUD (books/chapters/scenes/hotspots/activities/
// products/whats-new). Kept intentionally minimal here — no
// course/comms/facilitator admin exists in this app at all.
// ─────────────────────────────────────────────────────────────────────

app.get('/api/admin/books', auth.requireAuthApi(['admin', 'support']), (req, res) => res.json({ books: db.getAllBooks() }));
app.post('/api/admin/books', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  const { title, slug, description, splashIconKey } = req.body || {};
  if (!title || !slug) return res.status(400).json({ error: 'title and slug required' });
  const id = db.createBook({ title, slug, description, splashIconKey });
  res.json({ ok: true, id });
});

app.post('/api/admin/chapters', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  const { bookId, title, sortOrder } = req.body || {};
  const id = db.createChapter(bookId, title, sortOrder);
  res.json({ ok: true, id });
});

app.post('/api/admin/scenes', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  const { chapterId, kind, sortOrder } = req.body || {};
  const id = db.createScene(chapterId, kind, sortOrder);
  res.json({ ok: true, id });
});
app.patch('/api/admin/scenes/:id/image', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  db.setSceneImage(req.params.id, req.body.imageKey);
  res.json({ ok: true });
});

app.post('/api/admin/hotspots', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  const { sceneId, x, y, w, h, type, payload } = req.body || {};
  const id = db.createHotspot(sceneId, { x, y, w, h, type, payload });
  res.json({ ok: true, id });
});

app.post('/api/admin/audio-cues', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  const { sceneId, kind, audioKey, startMs, volume, loop } = req.body || {};
  const id = db.createAudioCue(sceneId, { kind, audioKey, startMs, volume, loop });
  res.json({ ok: true, id });
});

app.post('/api/admin/activities', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  const { bookId, chapterId, type, title, payload } = req.body || {};
  const id = db.createActivity({ bookId, chapterId, type, title, payload });
  res.json({ ok: true, id });
});

// Products/payments — admin only, never support, per Per's scoping of the
// support role (content + helping parents/teachers, no payment settings).
app.post('/api/admin/products', auth.requireAuthApi(['admin']), (req, res) => {
  const { name, description, priceCents, currency, imageKey, variantOptions, stock } = req.body || {};
  const id = db.uuid();
  db.run(
    `INSERT INTO products (id, name, description, price_cents, currency, image_key, variant_options_json, stock) VALUES (?,?,?,?,?,?,?,?)`,
    [id, name, description || null, priceCents, currency || 'gbp', imageKey || null, JSON.stringify(variantOptions || {}), stock ?? null]
  );
  res.json({ ok: true, id });
});

app.post('/api/admin/whats-new', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  const { audience, title, body, linkType, linkValue } = req.body || {};
  const id = db.createWhatsNew({ audience, title, body, linkType, linkValue });
  res.json({ ok: true, id });
});

// ─────────────────────────────────────────────────────────────────────
// STAFF ACCOUNTS — admin only. Creating an admin/support account is
// deliberately not self-service (no public signup for these roles) —
// only an existing admin can create another one from inside the dashboard.
// ─────────────────────────────────────────────────────────────────────

app.get('/api/admin/staff', auth.requireAuthApi(['admin']), (req, res) => {
  res.json({ staff: db.getAllStaff() });
});
app.post('/api/admin/staff', auth.requireAuthApi(['admin']), async (req, res) => {
  try {
    const { email, password, name, role } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (db.getAdminByEmail(email)) return res.status(409).json({ error: 'Email already registered' });
    const hash = await auth.hashPassword(password);
    const id = db.createAdmin({ email, passwordHash: hash, name, role: role === 'support' ? 'support' : 'admin' });
    res.json({ ok: true, id });
  } catch (e) {
    console.error('staff create failed', e);
    res.status(500).json({ error: 'Could not create account' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// PARENT / TEACHER DIRECTORY — read-only lookup so support and admin can
// help someone troubleshoot ("what email did you sign up with", "is your
// account actually there"). No editing here on purpose — that's a
// separate, more deliberate decision for later, not bundled into this pass.
// ─────────────────────────────────────────────────────────────────────

app.get('/api/admin/parents', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  res.json({ parents: db.getAllParentsDirectory() });
});
app.get('/api/admin/teachers', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  res.json({ teachers: db.getAllTeachersDirectory() });
});

// ─────────────────────────────────────────────────────────────────────
// TEACHER RESOURCES — documents/tools/links shown in the teacher hub.
// Admin/support manage them here; teachers read them via the public
// endpoint below.
// ─────────────────────────────────────────────────────────────────────

app.get('/api/admin/teacher-resources', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  res.json({ resources: db.getAllTeacherResources() });
});
app.post('/api/admin/teacher-resources', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  const { title, description, category, fileKey, externalUrl, sortOrder } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const id = db.createTeacherResource({ title, description, category, fileKey, externalUrl, sortOrder });
  res.json({ ok: true, id });
});
app.patch('/api/admin/teacher-resources/:id', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  const ok = db.updateTeacherResource(req.params.id, req.body || {});
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
app.delete('/api/admin/teacher-resources/:id', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  db.deleteTeacherResource(req.params.id);
  res.json({ ok: true });
});

app.get('/api/teacher/resources', auth.requireAuthApi(['teacher']), (req, res) => {
  res.json({ resources: db.getActiveTeacherResources() });
});

// ─────────────────────────────────────────────────────────────────────
// APP PAGES DIRECTORY — admin's "Pages" tab. Maintained list, not an
// auto-crawl (see the comment on the app_pages table in db.js for why).
// Content, not payments, so admin+support both manage it.
// ─────────────────────────────────────────────────────────────────────

app.get('/api/admin/pages', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  res.json({ pages: db.getAllAppPages() });
});
app.post('/api/admin/pages', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  const { label, url, kind, status, description, sortOrder } = req.body || {};
  if (!label || !url) return res.status(400).json({ error: 'label and url required' });
  const id = db.createAppPage({ label, url, kind, status, description, sortOrder });
  res.json({ ok: true, id });
});
app.patch('/api/admin/pages/:id', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  const ok = db.updateAppPage(req.params.id, req.body || {});
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
app.delete('/api/admin/pages/:id', auth.requireAuthApi(['admin', 'support']), (req, res) => {
  db.deleteAppPage(req.params.id);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────
// "Messages from Mare" — daily/weekly opt-in email, same cron shape as
// per_bot's custom_reminders (hourly tick, dedup via a sent-today log).
// Actual email send + Mare-voiced content generation is left as a stub
// here — wire in Scaleway send + prompts.js-style content once the
// content/voice pipeline for these messages is decided.
// ─────────────────────────────────────────────────────────────────────

function startCron() {
  cron.schedule('0 * * * *', () => {
    const now = new Date();
    const hour = now.getUTCHours();
    const dateStr = now.toISOString().slice(0, 10);
    const isMonday = now.getUTCDay() === 1;

    const daily = hour === 8 ? db.getEmailOptInParents('daily') : [];
    const weekly = (hour === 8 && isMonday) ? db.getEmailOptInParents('weekly') : [];

    [...daily, ...weekly].forEach(parent => {
      if (db.hasSentMareMessageToday(parent.id, dateStr)) return;
      // TODO: actually send via Scaleway once "message from Mare" content is written
      console.log(`[mare-message] would send to ${parent.email}`);
      db.logMareMessageSent(parent.id, dateStr);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ ok: true }));

db.getDb().then(() => {
  startCron();
  app.listen(PORT, () => console.log(`Mare app listening on :${PORT}`));
}).catch(e => {
  console.error('Failed to initialise database', e);
  process.exit(1);
});
