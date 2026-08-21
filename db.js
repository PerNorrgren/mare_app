// ── db.js — Mare companion app ──
// sql.js (in-process SQLite), same pattern as per_bot: load the file into
// memory on boot, run everything against the in-memory db, export+write
// the whole file back to disk after every write. Fully separate database
// from per_bot — no shared users, no shared tables. Deployed as its own
// Railway service, its own Dockerfile, its own deploy.sh.

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'db', 'mare.db');
let db = null;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  // ── App configuration — single row, brand identity for this app ──
  db.run(`CREATE TABLE IF NOT EXISTS app_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    brand_name TEXT NOT NULL DEFAULT 'Mare',
    tagline TEXT,
    primary_color TEXT,
    logo_url TEXT,
    contact_email TEXT,
    currency TEXT NOT NULL DEFAULT 'gbp',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`INSERT OR IGNORE INTO app_config (id) VALUES ('default')`);

  // ── Parents — the real accounts. Children are profiles underneath, not
  // separate logins (no password for a child to forget). ──
  db.run(`CREATE TABLE IF NOT EXISTS parents (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    email_opt_in INTEGER NOT NULL DEFAULT 0,
    email_frequency TEXT DEFAULT 'weekly', -- 'daily' | 'weekly'
    preferred_locale TEXT NOT NULL DEFAULT 'en', -- for future locale-aware emails/UI persistence
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS children (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar_key TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── Teachers — separate top-level account type, own login. Not tied to
  // a parent record. school/class fields are optional now, ready for
  // school-scoping later (the Patricia/RAAK network makes this plausible). ──
  db.run(`CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    school TEXT,
    preferred_locale TEXT NOT NULL DEFAULT 'en',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── Admin — Per's own login, plus 'support' as a second staff role on
  // the same table (same login flow, same accounts list) rather than a
  // separate table — support is admin-lite (content + helping parents/
  // teachers), not a different kind of account. role column distinguishes
  // 'admin' (full, including products/payments) from 'support' (everything
  // except products/payments — enforced route-by-route in server.js). ──
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin', -- 'admin' | 'support'
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  try { db.run(`ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'`); } catch {}

  // ── Teacher resources — documents/tools/links shown in the teacher hub
  // (public/teacher.html once logged in). Admin and support can both
  // manage this (it's content, not payments). ──
  db.run(`CREATE TABLE IF NOT EXISTS teacher_resources (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'document', -- 'document' | 'tool' | 'link'
    file_key TEXT, -- R2 key, for category='document'
    external_url TEXT, -- for category='tool' | 'link'
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── App pages directory — admin's "Pages" tab. This app has no
  // page-routing framework to introspect (every page is a static file
  // served by express.static — there's no router to walk), so rather
  // than a fragile auto-crawl this is a maintained directory: seeded
  // with the pages known at build time, kept current by whoever's
  // managing content (admin or support). Covers both internal app pages
  // (url is a path like '/teacher.html') and external references (url is
  // a full https:// link — Railway dashboard, GitHub repo, the live
  // per_bot site, etc.) in one list rather than two separate tables,
  // since from the admin's point of view they're both just "places this
  // project lives". ──
  db.run(`CREATE TABLE IF NOT EXISTS app_pages (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'internal', -- 'internal' | 'external'
    status TEXT NOT NULL DEFAULT 'live', -- 'live' | 'planned' | 'stub'
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  // Seed once, keyed by url so re-running never duplicates rows and
  // never overwrites anything an admin has since edited or deleted.
  const PAGE_SEED = [
    { label: 'Story Corner (splash)', url: '/', kind: 'internal', status: 'live', description: "The public landing page — book shelf, Club Mare and Shop tiles.", sortOrder: 0 },
    { label: 'Sign in / create account', url: '/login.html', kind: 'internal', status: 'live', description: 'Parent and teacher login + signup, role and mode selectable.', sortOrder: 10 },
    { label: 'For Teachers', url: '/teacher.html', kind: 'internal', status: 'live', description: 'Public teacher splash when signed out; resources + What\u2019s New hub when signed in as a teacher.', sortOrder: 20 },
    { label: 'Admin', url: '/admin.html', kind: 'internal', status: 'live', description: 'Staff login and dashboard (this page).', sortOrder: 30 },
    { label: 'Reader', url: '/reader.html', kind: 'internal', status: 'planned', description: 'The audio-follows-text reading experience — not built yet, the core still-open piece.', sortOrder: 40 },
    { label: 'Club Mare', url: '/club-mare.html', kind: 'internal', status: 'planned', description: 'Member posts, gated by tier.', sortOrder: 50 },
    { label: 'Merchandise', url: '/merchandise.html', kind: 'internal', status: 'planned', description: 'Shop browsing + Stripe checkout.', sortOrder: 60 },
    { label: 'Account', url: '/account.html', kind: 'internal', status: 'planned', description: 'Parent account settings, children, email preferences.', sortOrder: 70 },
    { label: 'GitHub repo', url: 'https://github.com/PerNorrgren/mare_app', kind: 'external', status: 'live', description: 'Source code.', sortOrder: 100 },
    { label: 'Railway (production)', url: 'https://mareapp-production.up.railway.app', kind: 'external', status: 'live', description: 'Live deployment.', sortOrder: 110 },
  ];
  for (const p of PAGE_SEED) {
    if (!get(`SELECT id FROM app_pages WHERE url = ?`, [p.url])) {
      run(`INSERT INTO app_pages (id, label, url, kind, status, description, sort_order) VALUES (?,?,?,?,?,?,?)`,
        [uuid(), p.label, p.url, p.kind, p.status, p.description, p.sortOrder]);
    }
  }

  // ── Books, chapters, scenes ──
  // A "scene" is one image (chapter opening or chapter ending) plus its
  // own narration audio, its own sentence timings, its own hotspots, and
  // its own audio cues (music bed / SFX). This is the atomic unit the
  // reader steps through.
  db.run(`CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    group_slug TEXT NOT NULL DEFAULT '', -- links locale variants of the same book together (e.g. 'mare' for both mare/mare-nl)
    locale TEXT NOT NULL DEFAULT 'en', -- 'en' | 'nl' — each locale is its own full book row: chapters/scenes/art genuinely differ per language, not just swapped text (Dutch images have Dutch in-image text)
    description TEXT,
    splash_icon_key TEXT, -- R2 key, large splash-page icon
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'opening', -- 'opening' | 'ending' — more kinds later if needed
    image_key TEXT, -- R2 key
    narration_audio_key TEXT, -- R2 key, the raw uploaded narration for this scene
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Sentence-level sync data, produced from Deepgram word timestamps and
  // reviewable/nudgeable in admin before publishing.
  db.run(`CREATE TABLE IF NOT EXISTS narration_sentences (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL,
    text TEXT NOT NULL,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`);

  // Hotspots — normalized 0-1 coordinates (not pixels) so placement holds
  // up across screen sizes. type/payload_json kept generic on purpose:
  // more hotspot behaviours are coming (animation, sound-effect, popup),
  // and a generic payload avoids adding a new column/table per new type.
  db.run(`CREATE TABLE IF NOT EXISTS hotspots (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL,
    x REAL NOT NULL, -- 0.0-1.0, normalized to image width
    y REAL NOT NULL, -- 0.0-1.0, normalized to image height
    w REAL NOT NULL DEFAULT 0.08,
    h REAL NOT NULL DEFAULT 0.08,
    type TEXT NOT NULL, -- 'popup' | 'animation' | 'sound' | more later
    payload_json TEXT NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  )`);

  // Music beds and point-in-time sound effects, layered under narration.
  // kind='music' loops as a bed (volume typically ducked under narration
  // client-side); kind='sfx' fires once at start_ms (dog bark, car,
  // classroom murmur, etc.).
  db.run(`CREATE TABLE IF NOT EXISTS audio_cues (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL,
    kind TEXT NOT NULL, -- 'music' | 'sfx'
    audio_key TEXT NOT NULL, -- R2 key
    start_ms INTEGER NOT NULL DEFAULT 0,
    volume REAL NOT NULL DEFAULT 1.0,
    loop_audio INTEGER NOT NULL DEFAULT 0,
    label TEXT
  )`);

  // ── Activities — quizzes, puzzles, number games, mind games. type +
  // payload_json kept generic for the same reason as hotspots: more
  // activity types are coming and shouldn't need new tables each time.
  // chapter_id nullable — an activity can live loose in the Mare hub
  // rather than being tied to a specific chapter. ──
  db.run(`CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    book_id TEXT,
    chapter_id TEXT,
    type TEXT NOT NULL, -- 'quiz' | 'puzzle' | 'number_game' | more later
    title TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── Club Mare — membership tiers. Per's convention: never start
  // numbering at 0. tier 1 = free member, tier 2 = paid member. A parent
  // with no row here at all is simply not a member. ──
  db.run(`CREATE TABLE IF NOT EXISTS club_mare_members (
    id TEXT PRIMARY KEY,
    parent_id TEXT UNIQUE NOT NULL,
    tier INTEGER NOT NULL DEFAULT 1, -- 1 = free, 2 = paid
    stripe_subscription_id TEXT,
    joined_at TEXT DEFAULT (datetime('now'))
  )`);

  // Club Mare exclusive content — separate from books/activities so it
  // can be gated purely on club_mare_members without touching the main
  // reading content's visibility rules at all.
  db.run(`CREATE TABLE IF NOT EXISTS club_mare_posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT,
    image_key TEXT,
    min_tier INTEGER NOT NULL DEFAULT 1,
    published_at TEXT DEFAULT (datetime('now')),
    active INTEGER NOT NULL DEFAULT 1
  )`);

  // ── Merchandise — real in-app Stripe checkout, not a link-out. ──
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'gbp',
    image_key TEXT,
    variant_options_json TEXT, -- e.g. sizes: {"size": ["S","M","L"]}
    stock INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    stripe_checkout_session_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'failed'
    total_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'gbp',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    variant_json TEXT,
    qty INTEGER NOT NULL DEFAULT 1,
    price_cents INTEGER NOT NULL
  )`);

  // ── What's New — Parent/Teacher facing only. Same shape as per_bot's
  // What's New: can link to an external URL or an in-app action/page. ──
  db.run(`CREATE TABLE IF NOT EXISTS whats_new (
    id TEXT PRIMARY KEY,
    audience TEXT NOT NULL DEFAULT 'both', -- 'parent' | 'teacher' | 'both'
    title TEXT NOT NULL,
    body TEXT,
    link_type TEXT, -- 'url' | 'action' | NULL
    link_value TEXT,
    published_at TEXT DEFAULT (datetime('now')),
    active INTEGER NOT NULL DEFAULT 1
  )`);

  // ── "Messages from Mare" — email opt-in cron, same shape as per_bot's
  // custom_reminders (hourly cron tick, per-frequency, dedup via
  // last_sent_date_str). frequency lives on parents.email_frequency;
  // this table is deliberately NOT duplicating that — parents row is
  // already the one place it's set (Signup/Account settings), avoiding
  // the exact kind of two-places-to-update drift per_bot has hit before. ──
  db.run(`CREATE TABLE IF NOT EXISTS mare_message_log (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    sent_at TEXT DEFAULT (datetime('now')),
    sent_date_str TEXT NOT NULL -- dedup key, e.g. '2026-08-20'
  )`);

  // ── Migration: the 'locale'/'group_slug' columns on books didn't exist
  // in the first two deployed versions of this app — CREATE TABLE IF NOT
  // EXISTS above only applies to a brand-new database, so a live Railway
  // deploy that already booted once needs these added explicitly. Wrapped
  // in try/catch because a fresh database (where the CREATE TABLE above
  // already included these columns) will correctly fail here with
  // "duplicate column" — that failure is expected and safe to ignore.
  try { db.run(`ALTER TABLE books ADD COLUMN locale TEXT NOT NULL DEFAULT 'en'`); } catch {}
  try { db.run(`ALTER TABLE books ADD COLUMN group_slug TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.run(`ALTER TABLE parents ADD COLUMN preferred_locale TEXT NOT NULL DEFAULT 'en'`); } catch {}
  try { db.run(`ALTER TABLE teachers ADD COLUMN preferred_locale TEXT NOT NULL DEFAULT 'en'`); } catch {}
  // Backfill: any book row from before group_slug existed (or with the
  // column's own default '') gets its own slug as its group — correct
  // for the original single-locale 'mare' row, and harmless for anything
  // already set correctly.
  run(`UPDATE books SET group_slug = slug WHERE group_slug IS NULL OR group_slug = ''`);

  // ── Seed content — keyed by slug (idempotent) rather than a row-count
  // check, so re-running this after adding a new locale or a new book
  // later doesn't require touching this function's logic each time. ──
  if (!get(`SELECT id FROM books WHERE slug = 'mare'`)) {
    run(`INSERT INTO books (id, title, slug, group_slug, locale, description, sort_order) VALUES (?,?,?,?,?,?,0)`,
      [uuid(), 'Mare and the Whispering Woods of Words', 'mare', 'mare', 'en',
       'Mare finds a path into a wood where the trees remember every word ever spoken.']);
  }
  if (!get(`SELECT id FROM books WHERE slug = 'mare-nl'`)) {
    run(`INSERT INTO books (id, title, slug, group_slug, locale, description, sort_order) VALUES (?,?,?,?,?,?,0)`,
      [uuid(), 'Mare en het fluisterbos van woorden', 'mare-nl', 'mare', 'nl',
       'Mare vindt een pad naar een bos waar de bomen elk woord onthouden dat ooit is gezegd.']);
  }

  save();
  return db;
}

function save() {
  if (!db) return;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function uuid() { return crypto.randomUUID(); }

function run(sql, params = []) {
  db.run(sql, params);
  save();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ── Parents ──
function getParentByEmail(email) {
  return get(`SELECT * FROM parents WHERE email = ?`, [email.toLowerCase().trim()]);
}
function createParent({ email, passwordHash, name }) {
  const id = uuid();
  run(`INSERT INTO parents (id, email, password_hash, name) VALUES (?,?,?,?)`,
    [id, email.toLowerCase().trim(), passwordHash, name]);
  return id;
}
function setParentEmailPrefs(parentId, optIn, frequency) {
  run(`UPDATE parents SET email_opt_in = ?, email_frequency = ? WHERE id = ?`,
    [optIn ? 1 : 0, frequency, parentId]);
}

// ── Children (profiles under a parent) ──
function getChildrenByParent(parentId) {
  return all(`SELECT * FROM children WHERE parent_id = ? ORDER BY sort_order, created_at`, [parentId]);
}
function createChild(parentId, name, avatarKey) {
  const id = uuid();
  run(`INSERT INTO children (id, parent_id, name, avatar_key) VALUES (?,?,?,?)`,
    [id, parentId, name, avatarKey || null]);
  return id;
}

// ── Teachers ──
function getTeacherByEmail(email) {
  return get(`SELECT * FROM teachers WHERE email = ?`, [email.toLowerCase().trim()]);
}
function createTeacher({ email, passwordHash, name, school }) {
  const id = uuid();
  run(`INSERT INTO teachers (id, email, password_hash, name, school) VALUES (?,?,?,?,?)`,
    [id, email.toLowerCase().trim(), passwordHash, name, school || null]);
  return id;
}

// ── Admins / Support (same table, role column distinguishes them) ──
function getAdminByEmail(email) {
  return get(`SELECT * FROM admins WHERE email = ?`, [email.toLowerCase().trim()]);
}
function createAdmin({ email, passwordHash, name, role }) {
  const id = uuid();
  run(`INSERT INTO admins (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`,
    [id, email.toLowerCase().trim(), passwordHash, name, role === 'support' ? 'support' : 'admin']);
  return id;
}
function getAllStaff() {
  return all(`SELECT id, email, name, role, created_at FROM admins ORDER BY role, created_at`);
}

// ── Directory lookups for support/admin to help troubleshoot parent and
// teacher accounts. password_hash deliberately excluded from these. ──
function getAllParentsDirectory() {
  return all(`SELECT id, email, name, email_opt_in, email_frequency, preferred_locale, created_at FROM parents ORDER BY created_at DESC`);
}
function getAllTeachersDirectory() {
  return all(`SELECT id, email, name, school, preferred_locale, created_at FROM teachers ORDER BY created_at DESC`);
}

// ── Books / chapters / scenes ──
function getActiveBooks() {
  return all(`SELECT * FROM books WHERE active = 1 ORDER BY sort_order, created_at`);
}

// Returns one book per group_slug, in the requested locale where that
// translation exists, otherwise falling back to 'en', otherwise
// whatever locale is available — so a book never vanishes from the
// splash page just because its Dutch (or next language's) content
// hasn't been written yet.
function getActiveBooksForLocale(locale) {
  const rows = all(`SELECT * FROM books WHERE active = 1 ORDER BY sort_order, created_at`);
  const byGroup = new Map();
  for (const row of rows) {
    const key = row.group_slug || row.slug;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(row);
  }
  const result = [];
  for (const variants of byGroup.values()) {
    const match = variants.find(b => b.locale === locale)
      || variants.find(b => b.locale === 'en')
      || variants[0];
    result.push(match);
  }
  result.sort((a, b) => a.sort_order - b.sort_order);
  return result;
}
function getAllBooks() {
  return all(`SELECT * FROM books ORDER BY sort_order, created_at`);
}
function getBookBySlug(slug) {
  return get(`SELECT * FROM books WHERE slug = ?`, [slug]);
}
function createBook({ title, slug, description, splashIconKey, locale, groupSlug }) {
  const id = uuid();
  run(`INSERT INTO books (id, title, slug, group_slug, locale, description, splash_icon_key) VALUES (?,?,?,?,?,?,?)`,
    [id, title, slug, groupSlug || slug, locale || 'en', description || null, splashIconKey || null]);
  return id;
}
function getChaptersByBook(bookId) {
  return all(`SELECT * FROM chapters WHERE book_id = ? ORDER BY sort_order`, [bookId]);
}
function createChapter(bookId, title, sortOrder) {
  const id = uuid();
  run(`INSERT INTO chapters (id, book_id, title, sort_order) VALUES (?,?,?,?)`,
    [id, bookId, title, sortOrder || 0]);
  return id;
}
function getScenesByChapter(chapterId) {
  return all(`SELECT * FROM scenes WHERE chapter_id = ? ORDER BY sort_order`, [chapterId]);
}
function createScene(chapterId, kind, sortOrder) {
  const id = uuid();
  run(`INSERT INTO scenes (id, chapter_id, kind, sort_order) VALUES (?,?,?,?)`,
    [id, chapterId, kind, sortOrder || 0]);
  return id;
}
function setSceneImage(sceneId, imageKey) {
  run(`UPDATE scenes SET image_key = ? WHERE id = ?`, [imageKey, sceneId]);
}
function setSceneNarrationAudio(sceneId, audioKey) {
  run(`UPDATE scenes SET narration_audio_key = ? WHERE id = ?`, [audioKey, sceneId]);
}

// ── Narration sentences ──
function replaceNarrationSentences(sceneId, sentences) {
  // sentences: [{ text, startMs, endMs }], already in order
  run(`DELETE FROM narration_sentences WHERE scene_id = ?`, [sceneId]);
  sentences.forEach((s, i) => {
    run(`INSERT INTO narration_sentences (id, scene_id, text, start_ms, end_ms, sort_order) VALUES (?,?,?,?,?,?)`,
      [uuid(), sceneId, s.text, s.startMs, s.endMs, i]);
  });
}
function getNarrationSentences(sceneId) {
  return all(`SELECT * FROM narration_sentences WHERE scene_id = ? ORDER BY sort_order`, [sceneId]);
}
function updateNarrationSentenceTiming(id, startMs, endMs) {
  run(`UPDATE narration_sentences SET start_ms = ?, end_ms = ? WHERE id = ?`, [startMs, endMs, id]);
}

// ── Hotspots ──
function getHotspotsByScene(sceneId) {
  return all(`SELECT * FROM hotspots WHERE scene_id = ? AND active = 1 ORDER BY sort_order`, [sceneId]);
}
function createHotspot(sceneId, { x, y, w, h, type, payload }) {
  const id = uuid();
  run(`INSERT INTO hotspots (id, scene_id, x, y, w, h, type, payload_json) VALUES (?,?,?,?,?,?,?,?)`,
    [id, sceneId, x, y, w || 0.08, h || 0.08, type, JSON.stringify(payload || {})]);
  return id;
}

// ── Audio cues ──
function getAudioCuesByScene(sceneId) {
  return all(`SELECT * FROM audio_cues WHERE scene_id = ? ORDER BY start_ms`, [sceneId]);
}
function createAudioCue(sceneId, { kind, audioKey, startMs, volume, loop }) {
  const id = uuid();
  run(`INSERT INTO audio_cues (id, scene_id, kind, audio_key, start_ms, volume, loop_audio) VALUES (?,?,?,?,?,?,?)`,
    [id, sceneId, kind, audioKey, startMs || 0, volume ?? 1.0, loop ? 1 : 0]);
  return id;
}

// ── Activities ──
function getActivitiesForBook(bookId) {
  return all(`SELECT * FROM activities WHERE book_id = ? AND active = 1 ORDER BY sort_order`, [bookId]);
}
function getActivitiesForChapter(chapterId) {
  return all(`SELECT * FROM activities WHERE chapter_id = ? AND active = 1 ORDER BY sort_order`, [chapterId]);
}
function createActivity({ bookId, chapterId, type, title, payload }) {
  const id = uuid();
  run(`INSERT INTO activities (id, book_id, chapter_id, type, title, payload_json) VALUES (?,?,?,?,?,?)`,
    [id, bookId || null, chapterId || null, type, title, JSON.stringify(payload || {})]);
  return id;
}

// ── Club Mare ── tier 1 = free, tier 2 = paid. Never 0.
function getClubMareMembership(parentId) {
  return get(`SELECT * FROM club_mare_members WHERE parent_id = ?`, [parentId]);
}
function joinClubMareFree(parentId) {
  const existing = getClubMareMembership(parentId);
  if (existing) return existing.id;
  const id = uuid();
  run(`INSERT INTO club_mare_members (id, parent_id, tier) VALUES (?,?,1)`, [id, parentId]);
  return id;
}
function upgradeClubMareToPaid(parentId, stripeSubscriptionId) {
  run(`UPDATE club_mare_members SET tier = 2, stripe_subscription_id = ? WHERE parent_id = ?`,
    [stripeSubscriptionId, parentId]);
}
function getClubMarePosts(maxTierVisible) {
  return all(`SELECT * FROM club_mare_posts WHERE active = 1 AND min_tier <= ? ORDER BY published_at DESC`,
    [maxTierVisible]);
}

// ── Merchandise ──
function getActiveProducts() {
  return all(`SELECT * FROM products WHERE active = 1 ORDER BY sort_order`);
}
function getProduct(id) {
  return get(`SELECT * FROM products WHERE id = ?`, [id]);
}
function createOrder(parentId, totalCents, currency) {
  const id = uuid();
  run(`INSERT INTO orders (id, parent_id, total_cents, currency) VALUES (?,?,?,?)`,
    [id, parentId, totalCents, currency || 'gbp']);
  return id;
}
function setOrderStripeSession(orderId, sessionId) {
  run(`UPDATE orders SET stripe_checkout_session_id = ? WHERE id = ?`, [sessionId, orderId]);
}
function markOrderPaid(stripeSessionId) {
  run(`UPDATE orders SET status = 'paid' WHERE stripe_checkout_session_id = ?`, [stripeSessionId]);
}
function addOrderItem(orderId, productId, variant, qty, priceCents) {
  run(`INSERT INTO order_items (id, order_id, product_id, variant_json, qty, price_cents) VALUES (?,?,?,?,?,?)`,
    [uuid(), orderId, productId, JSON.stringify(variant || {}), qty, priceCents]);
}

// ── Teacher resources ──
function getActiveTeacherResources() {
  return all(`SELECT * FROM teacher_resources WHERE active = 1 ORDER BY sort_order, created_at`);
}
function getAllTeacherResources() {
  return all(`SELECT * FROM teacher_resources ORDER BY sort_order, created_at`);
}
function createTeacherResource({ title, description, category, fileKey, externalUrl, sortOrder }) {
  const id = uuid();
  run(`INSERT INTO teacher_resources (id, title, description, category, file_key, external_url, sort_order) VALUES (?,?,?,?,?,?,?)`,
    [id, title, description || null, category || 'document', fileKey || null, externalUrl || null, sortOrder || 0]);
  return id;
}
function updateTeacherResource(id, { title, description, category, fileKey, externalUrl, sortOrder, active }) {
  const existing = get(`SELECT * FROM teacher_resources WHERE id = ?`, [id]);
  if (!existing) return false;
  run(`UPDATE teacher_resources SET title=?, description=?, category=?, file_key=?, external_url=?, sort_order=?, active=? WHERE id=?`,
    [
      title ?? existing.title,
      description ?? existing.description,
      category ?? existing.category,
      fileKey ?? existing.file_key,
      externalUrl ?? existing.external_url,
      sortOrder ?? existing.sort_order,
      active === undefined ? existing.active : (active ? 1 : 0),
      id,
    ]);
  return true;
}
function deleteTeacherResource(id) {
  run(`DELETE FROM teacher_resources WHERE id = ?`, [id]);
}

// ── App pages directory ──
function getActiveAppPages() {
  return all(`SELECT * FROM app_pages WHERE active = 1 ORDER BY sort_order, created_at`);
}
function getAllAppPages() {
  return all(`SELECT * FROM app_pages ORDER BY sort_order, created_at`);
}
function createAppPage({ label, url, kind, status, description, sortOrder }) {
  const id = uuid();
  run(`INSERT INTO app_pages (id, label, url, kind, status, description, sort_order) VALUES (?,?,?,?,?,?,?)`,
    [id, label, url, kind === 'external' ? 'external' : 'internal', status || 'live', description || null, sortOrder || 0]);
  return id;
}
function updateAppPage(id, { label, url, kind, status, description, sortOrder, active }) {
  const existing = get(`SELECT * FROM app_pages WHERE id = ?`, [id]);
  if (!existing) return false;
  run(`UPDATE app_pages SET label=?, url=?, kind=?, status=?, description=?, sort_order=?, active=? WHERE id=?`,
    [
      label ?? existing.label,
      url ?? existing.url,
      kind ?? existing.kind,
      status ?? existing.status,
      description ?? existing.description,
      sortOrder ?? existing.sort_order,
      active === undefined ? existing.active : (active ? 1 : 0),
      id,
    ]);
  return true;
}
function deleteAppPage(id) {
  run(`DELETE FROM app_pages WHERE id = ?`, [id]);
}

// ── What's New ──
function getWhatsNew(audience) {
  return all(`SELECT * FROM whats_new WHERE active = 1 AND (audience = ? OR audience = 'both') ORDER BY published_at DESC`,
    [audience]);
}
function createWhatsNew({ audience, title, body, linkType, linkValue }) {
  const id = uuid();
  run(`INSERT INTO whats_new (id, audience, title, body, link_type, link_value) VALUES (?,?,?,?,?,?)`,
    [id, audience || 'both', title, body || null, linkType || null, linkValue || null]);
  return id;
}

// ── Mare email messages (dedup log for the cron) ──
function hasSentMareMessageToday(parentId, dateStr) {
  return !!get(`SELECT id FROM mare_message_log WHERE parent_id = ? AND sent_date_str = ?`, [parentId, dateStr]);
}
function logMareMessageSent(parentId, dateStr) {
  run(`INSERT INTO mare_message_log (id, parent_id, sent_date_str) VALUES (?,?,?)`, [uuid(), parentId, dateStr]);
}
function getEmailOptInParents(frequency) {
  return all(`SELECT * FROM parents WHERE email_opt_in = 1 AND email_frequency = ?`, [frequency]);
}

module.exports = {
  getDb, save, uuid, run, get, all,
  getParentByEmail, createParent, setParentEmailPrefs,
  getChildrenByParent, createChild,
  getTeacherByEmail, createTeacher,
  getAdminByEmail, createAdmin, getAllStaff,
  getAllParentsDirectory, getAllTeachersDirectory,
  getActiveTeacherResources, getAllTeacherResources,
  createTeacherResource, updateTeacherResource, deleteTeacherResource,
  getActiveAppPages, getAllAppPages, createAppPage, updateAppPage, deleteAppPage,
  getActiveBooks, getActiveBooksForLocale, getAllBooks, getBookBySlug, createBook,
  getChaptersByBook, createChapter,
  getScenesByChapter, createScene, setSceneImage, setSceneNarrationAudio,
  replaceNarrationSentences, getNarrationSentences, updateNarrationSentenceTiming,
  getHotspotsByScene, createHotspot,
  getAudioCuesByScene, createAudioCue,
  getActivitiesForBook, getActivitiesForChapter, createActivity,
  getClubMareMembership, joinClubMareFree, upgradeClubMareToPaid, getClubMarePosts,
  getActiveProducts, getProduct, createOrder, setOrderStripeSession, markOrderPaid, addOrderItem,
  getWhatsNew, createWhatsNew,
  hasSentMareMessageToday, logMareMessageSent, getEmailOptInParents,
};
