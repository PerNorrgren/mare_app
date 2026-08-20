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
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── Admin — Per's own login, separate role, same table shape as
  // per_bot's facilitator/admin pattern kept minimal since this app has
  // no facilitator concept at all. ──
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── Books, chapters, scenes ──
  // A "scene" is one image (chapter opening or chapter ending) plus its
  // own narration audio, its own sentence timings, its own hotspots, and
  // its own audio cues (music bed / SFX). This is the atomic unit the
  // reader steps through.
  db.run(`CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
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

// ── Admins ──
function getAdminByEmail(email) {
  return get(`SELECT * FROM admins WHERE email = ?`, [email.toLowerCase().trim()]);
}
function createAdmin({ email, passwordHash, name }) {
  const id = uuid();
  run(`INSERT INTO admins (id, email, password_hash, name) VALUES (?,?,?,?)`,
    [id, email.toLowerCase().trim(), passwordHash, name]);
  return id;
}

// ── Books / chapters / scenes ──
function getActiveBooks() {
  return all(`SELECT * FROM books WHERE active = 1 ORDER BY sort_order, created_at`);
}
function getAllBooks() {
  return all(`SELECT * FROM books ORDER BY sort_order, created_at`);
}
function getBookBySlug(slug) {
  return get(`SELECT * FROM books WHERE slug = ?`, [slug]);
}
function createBook({ title, slug, description, splashIconKey }) {
  const id = uuid();
  run(`INSERT INTO books (id, title, slug, description, splash_icon_key) VALUES (?,?,?,?,?)`,
    [id, title, slug, description || null, splashIconKey || null]);
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
  getAdminByEmail, createAdmin,
  getActiveBooks, getAllBooks, getBookBySlug, createBook,
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
