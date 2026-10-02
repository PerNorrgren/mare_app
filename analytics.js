// ── analytics.js (Mare App 6, v78) ─────────────────────────────────────
// First-party usage analytics: who visits which page, for how long, and
// what they do in the Book Companion, pictures, Club Mare and the shop.
//
// Privacy by design:
//   - no cookies of its own: a visit id lives in the tab's sessionStorage
//     and ends when the tab closes, so there's no tracking across days;
//   - no IP addresses, no fingerprinting, no third parties;
//   - a signed-in visit is tied to the account (so "active parents" can be
//     counted), staff and the preview family are marked and left out of
//     the reports by default.
//
// Writes are buffered: db.js writes the whole database file on every
// write, so pings and events are collected in memory and written in one
// batch every 30 seconds.
//
// Tables: a_visits  — one row per page opened (seconds grow with pings)
//         a_events  — things done (step viewed, spot opened, quiz answer…)
// Raw rows older than 400 days are removed each night.

const crypto = require('crypto');

const PAGES = new Set(['/', '/index.html', '/companion.html', '/pictures.html', '/talk.html', '/club-mare.html', '/forest.html',
  '/riddle.html', '/merchandise.html', '/account.html', '/login.html', '/teacher.html', '/teacher-login.html', '/press.html',
  '/reader.html', '/reset-password.html', '/admin.html', '/editor.html', '/admin-content.html']);
const EVENTS = new Set([
  'step_view', 'spot_open', 'quiz_answer', 'video_start', 'video_end', 'write_sent', 'picture_talk',   // pictures
  'chapter_set', 'practice_open', 'rate_book', 'mare_message',                                        // companion
  'add_to_cart', 'checkout_start',                                                                    // shop
  'whisper_open', 'riddle_try', 'resource_open', 'sample_open',                                       // club, teachers, home
]);
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const today = () => new Date().toISOString().slice(0, 10);

function register(app, { db, auth }) {
  // ── who is this (role from the sign-in cookie; staff and preview marked) ──
  function who(req) {
    const p = auth.verifyToken(req.cookies && req.cookies[auth.COOKIE_NAME]);
    if (!p) return { role: 'visitor', userId: null };
    if (/@preview\.mare\.invalid$/i.test(p.email || '')) return { role: 'preview', userId: p.id };
    if (['admin', 'support', 'editor'].includes(p.role)) return { role: 'staff', userId: p.id };
    return { role: p.role === 'teacher' ? 'teacher' : 'parent', userId: p.id };
  }

  // ── buffer ──
  let newVisits = [], newEvents = [];
  const addSeconds = new Map(); // visit id -> seconds to add
  function flush() {
    if (!newVisits.length && !newEvents.length && !addSeconds.size) return;
    const list = [];
    for (const v of newVisits) list.push([`INSERT OR IGNORE INTO a_visits (id, sid, day, started_at, page, role, user_id, lang, device, ref, seconds) VALUES (?,?,?,?,?,?,?,?,?,?,0)`,
      [v.id, v.sid, v.day, v.at, v.page, v.role, v.userId, v.lang, v.device, v.ref]]);
    for (const [id, s] of addSeconds) list.push([`UPDATE a_visits SET seconds = MIN(seconds + ?, 14400) WHERE id = ?`, [s, id]]);
    for (const e of newEvents) list.push([`INSERT INTO a_events (ts, day, sid, role, user_id, page, name, detail, value) VALUES (?,?,?,?,?,?,?,?,?)`,
      [e.at, e.day, e.sid, e.role, e.userId, e.page, e.name, e.detail, e.value]]);
    newVisits = []; newEvents = []; addSeconds.clear();
    try { db.runBatch(list); } catch (e) { console.error('analytics flush failed:', e.message); }
  }
  setInterval(flush, 30 * 1000).unref();
  process.on('SIGTERM', flush);

  // nightly tidy: raw rows older than 400 days
  setInterval(() => {
    try { flush(); db.runBatch([[`DELETE FROM a_visits WHERE day < date('now','-400 days')`, []], [`DELETE FROM a_events WHERE day < date('now','-400 days')`, []]]); }
    catch (e) { console.error('analytics tidy failed:', e.message); }
  }, 24 * 3600 * 1000).unref();

  // Reports always see everything, including what is still in the buffer.
  function fresh() { flush(); }

  // tiny per-session guard against floods
  const recent = new Map();
  function tooMany(sid) {
    const now = Date.now(), r = recent.get(sid) || { t: now, n: 0 };
    if (now - r.t > 60000) { r.t = now; r.n = 0; }
    r.n++; recent.set(sid, r);
    if (recent.size > 5000) recent.clear();
    return r.n > 120;
  }
  const body = (req) => {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    try { return JSON.parse(String(req.body || '{}')); } catch { return {}; }
  };
  const textParser = require('express').text({ type: '*/*', limit: '4kb' });

  // A page opened. -> { vid }
  app.post('/api/a/v', textParser, (req, res) => {
    const b = body(req);
    const sid = clip(b.sid, 40), page = clip(b.page, 60);
    if (!/^[a-z0-9]{8,40}$/i.test(sid) || !PAGES.has(page) || tooMany(sid)) return res.status(204).end();
    const w = who(req);
    const vid = crypto.randomUUID();
    newVisits.push({ id: vid, sid, day: today(), at: new Date().toISOString(), page: page === '/index.html' ? '/' : page, role: w.role, userId: w.userId,
      lang: b.lang === 'nl' ? 'nl' : 'en', device: ['phone', 'tablet', 'desktop'].includes(b.device) ? b.device : 'desktop',
      ref: clip((String(b.ref || '').match(/^https?:\/\/([^/]+)/) || [])[1] || '', 80) });
    res.json({ vid });
  });

  // Time on the page (sent every 30 s while the page is in view, and on leaving).
  app.post('/api/a/p', textParser, (req, res) => {
    const b = body(req);
    const vid = clip(b.vid, 40), s = Math.round(Number(b.s) || 0);
    if (/^[0-9a-f-]{36}$/.test(vid) && s > 0 && s <= 90) addSeconds.set(vid, (addSeconds.get(vid) || 0) + s);
    res.status(204).end();
  });

  // Something done on a page.
  app.post('/api/a/e', textParser, (req, res) => {
    const b = body(req);
    const sid = clip(b.sid, 40), name = clip(b.name, 30), page = clip(b.page, 60);
    if (!/^[a-z0-9]{8,40}$/i.test(sid) || !EVENTS.has(name) || tooMany(sid)) return res.status(204).end();
    const w = who(req);
    newEvents.push({ at: new Date().toISOString(), day: today(), sid, role: w.role, userId: w.userId, page: PAGES.has(page) ? page : '', name,
      detail: clip(b.detail, 80), value: b.value == null || b.value === '' ? null : Number(b.value) || 0 });
    res.status(204).end();
  });

  // For server-side events (e.g. a teacher opening a resource).
  function serverEvent(req, name, detail, page) {
    if (!EVENTS.has(name)) return;
    const w = who(req);
    newEvents.push({ at: new Date().toISOString(), day: today(), sid: 'server', role: w.role, userId: w.userId, page: page || '', name, detail: clip(detail, 80), value: null });
  }

  // ── Reports ──────────────────────────────────────────────────────────
  // GET /api/admin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&staff=1
  app.get('/api/admin/analytics', auth.requireAuthApi(['admin', 'support']), (req, res) => {
    fresh();
    const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
    const to = isDay(req.query.to) ? req.query.to : today();
    const from = isDay(req.query.from) ? req.query.from : new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
    const roles = req.query.staff === '1' ? ['visitor', 'parent', 'teacher', 'staff'] : ['visitor', 'parent', 'teacher'];
    const inRoles = `role IN (${roles.map(() => '?').join(',')})`;
    const V = `FROM a_visits WHERE day BETWEEN ? AND ? AND ${inRoles}`;
    const E = `FROM a_events WHERE day BETWEEN ? AND ? AND ${inRoles}`;
    const P = [from, to, ...roles];
    const all = (sql, p = P) => db.allRows(sql, p);
    const one = (sql, p = P) => db.getRow(sql, p) || {};
    const at = (col) => `substr(${col},1,10) BETWEEN ? AND ?`; // dates in other tables
    const isAdmin = req.user.role === 'admin';
    const notPreview = `email NOT LIKE '%@preview.mare.invalid'`;

    const out = { from, to, includesStaff: roles.includes('staff') };

    // Overview
    const ov = one(`SELECT COUNT(DISTINCT sid) AS visits, COUNT(*) AS views, COALESCE(SUM(seconds),0) AS seconds,
      COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id END) AS signedIn ${V}`);
    out.overview = {
      visits: ov.visits || 0, pageViews: ov.views || 0, minutes: Math.round((ov.seconds || 0) / 60),
      avgMinutesPerVisit: ov.visits ? Math.round((ov.seconds / 60 / ov.visits) * 10) / 10 : 0,
      activeAccounts: ov.signedIn || 0,
      newParents: db.getRow(`SELECT COUNT(*) AS n FROM parents WHERE ${at('created_at')} AND ${notPreview}`, [from, to]).n,
      newTeachers: db.getRow(`SELECT COUNT(*) AS n FROM teachers WHERE ${at('created_at')} AND ${notPreview}`, [from, to]).n,
      paidOrders: db.getRow(`SELECT COUNT(*) AS n FROM orders WHERE status = 'paid' AND ${at('created_at')}`, [from, to]).n,
    };
    out.daily = all(`SELECT day, COUNT(DISTINCT sid) AS visits, ROUND(SUM(seconds)/60.0) AS minutes, COUNT(*) AS views ${V} GROUP BY day ORDER BY day`);

    // Who
    out.byRole = all(`SELECT role, COUNT(DISTINCT sid) AS visits, ROUND(SUM(seconds)/60.0) AS minutes, COUNT(DISTINCT user_id) AS accounts ${V} GROUP BY role ORDER BY visits DESC`);
    out.byDevice = all(`SELECT device, COUNT(DISTINCT sid) AS visits, ROUND(SUM(seconds)/60.0) AS minutes ${V} GROUP BY device ORDER BY visits DESC`);
    out.byLang = all(`SELECT lang, COUNT(DISTINCT sid) AS visits, ROUND(SUM(seconds)/60.0) AS minutes ${V} GROUP BY lang ORDER BY visits DESC`);
    out.referrers = all(`SELECT ref, COUNT(DISTINCT sid) AS visits ${V} AND ref <> '' AND ref NOT LIKE '%deepermindfulness.org' GROUP BY ref ORDER BY visits DESC LIMIT 15`);

    // Pages
    out.pages = all(`SELECT page, COUNT(*) AS views, COUNT(DISTINCT sid) AS visits, ROUND(SUM(seconds)/60.0) AS minutes,
      ROUND(AVG(seconds)/60.0, 1) AS avgMinutes ${V} GROUP BY page ORDER BY minutes DESC, views DESC`);

    // Book Companion and pictures
    const pg = (p) => one(`SELECT COUNT(DISTINCT sid) AS visits, COUNT(DISTINCT user_id) AS accounts, ROUND(COALESCE(SUM(seconds),0)/60.0) AS minutes ${V} AND page = ?`, [...P, p]);
    out.companion = {
      companion: pg('/companion.html'),
      pictures: pg('/pictures.html'),
      perChapter: all(`SELECT CAST(substr(detail, 1, instr(detail || ':', ':') - 1) AS INTEGER) AS chapter,
          SUM(name = 'step_view') AS stepViews, SUM(name = 'spot_open') AS spotsOpened,
          SUM(name = 'quiz_answer' AND value = 1) AS quizRight, SUM(name = 'quiz_answer' AND value = 0) AS quizWrong,
          SUM(name = 'video_start') AS videosStarted, SUM(name = 'video_end') AS videosFinished, SUM(name = 'write_sent') AS writes
        ${E} AND name IN ('step_view','spot_open','quiz_answer','video_start','video_end','write_sent') GROUP BY chapter ORDER BY chapter`),
      spotKinds: all(`SELECT substr(detail, instr(detail, ':') + 1) AS kind, COUNT(*) AS opened ${E} AND name = 'spot_open' GROUP BY kind ORDER BY opened DESC`),
      readingNow: db.allRows(`SELECT COALESCE(companion_chapter, 0) AS chapter, COUNT(*) AS parents FROM parents WHERE ${notPreview} GROUP BY chapter ORDER BY chapter`),
      ratings: db.getRow(`SELECT COUNT(*) AS n, ROUND(AVG(stars), 1) AS avg FROM book_ratings WHERE ${at('created_at')}`, [from, to]),
      messages: db.getRow(`SELECT COUNT(*) AS n FROM mare_messages WHERE ${at('created_at')}`, [from, to]).n,
    };

    // Talk to Mare (whole conversations, from its own table)
    const talk = db.getRow(`SELECT COUNT(*) AS sessions, COUNT(DISTINCT parent_id) AS families,
        ROUND(SUM((julianday(COALESCE(ended_at, last_activity_at)) - julianday(started_at)) * 1440)) AS minutes,
        ROUND(AVG(COALESCE(turn_count, 0)), 1) AS avgTurns
      FROM talk_sessions WHERE ${at('started_at')} AND parent_id NOT IN (SELECT id FROM parents WHERE email LIKE '%@preview.mare.invalid')`, [from, to]) || {};
    out.talk = { ...talk, byAge: db.allRows(`SELECT COALESCE(age_band, '?') AS ageBand, COUNT(*) AS sessions FROM talk_sessions WHERE ${at('started_at')} GROUP BY ageBand ORDER BY sessions DESC`, [from, to]),
      inPictures: one(`SELECT COUNT(*) AS n ${E} AND name = 'picture_talk'`).n || 0 };

    // Club Mare
    out.club = {
      membersTotal: db.getRow(`SELECT COUNT(*) AS n FROM club_mare_members`).n,
      newMembers: db.getRow(`SELECT COUNT(*) AS n FROM club_mare_members WHERE ${at('joined_at')}`, [from, to]).n,
      submissions: db.allRows(`SELECT p.kind, COUNT(*) AS n FROM whisper_submissions s LEFT JOIN whisper_prompts p ON p.id = s.prompt_id WHERE ${at('s.created_at')} GROUP BY p.kind ORDER BY n DESC`, [from, to]),
      clubVisits: pg('/club-mare.html'), forestVisits: pg('/forest.html'), riddleVisits: pg('/riddle.html'),
    };

    // Shop (money for admins only)
    const shopV = pg('/merchandise.html');
    const ev = (n) => one(`SELECT COUNT(*) AS n ${E} AND name = ?`, [...P, n]).n || 0;
    const ord = db.getRow(`SELECT COUNT(*) AS started, SUM(status = 'paid') AS paid, COALESCE(SUM(CASE WHEN status = 'paid' THEN total_cents END), 0) AS revenue FROM orders WHERE ${at('created_at')}`, [from, to]) || {};
    out.shop = { visits: shopV.visits || 0, addToCart: ev('add_to_cart'), checkoutsStarted: ord.started || 0, paid: ord.paid || 0 };
    if (isAdmin) {
      out.shop.revenueCents = ord.revenue || 0;
      out.shop.topProducts = db.allRows(`SELECT COALESCE(pr.name, i.product_id) AS product, SUM(i.qty) AS qty, SUM(i.qty * i.price_cents) AS cents
        FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products pr ON pr.id = i.product_id
        WHERE o.status = 'paid' AND ${at('o.created_at')} GROUP BY product ORDER BY qty DESC LIMIT 10`, [from, to]);
    }

    // Teachers
    out.teachers = {
      total: db.getRow(`SELECT COUNT(*) AS n FROM teachers WHERE ${notPreview}`).n,
      active: one(`SELECT COUNT(DISTINCT user_id) AS n ${V} AND role = 'teacher'`).n || 0,
      resourceOpens: all(`SELECT COALESCE(r.title, e.detail) AS resource, COUNT(*) AS opens FROM a_events e LEFT JOIN teacher_resources r ON r.id = e.detail
        WHERE e.day BETWEEN ? AND ? AND e.${inRoles} AND e.name = 'resource_open' GROUP BY resource ORDER BY opens DESC`),
    };

    // Totals (all time)
    out.totals = {
      parents: db.getRow(`SELECT COUNT(*) AS n FROM parents WHERE ${notPreview}`).n,
      children: db.getRow(`SELECT COUNT(*) AS n FROM children WHERE parent_id NOT IN (SELECT id FROM parents WHERE email LIKE '%@preview.mare.invalid')`).n,
      teachers: out.teachers.total,
      clubMembers: out.club.membersTotal,
      trackingSince: (db.getRow(`SELECT MIN(day) AS d FROM a_visits`) || {}).d || null,
    };
    res.json(out);
  });

  // ── People (v79): one row per signed-in person in the period, with name
  // and email from their account. Not-signed-in visits can't be named;
  // they come back as a count.
  // GET /api/admin/analytics/people?from&to&staff=1
  app.get('/api/admin/analytics/people', auth.requireAuthApi(['admin', 'support']), (req, res) => {
    fresh();
    const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
    const to = isDay(req.query.to) ? req.query.to : today();
    const from = isDay(req.query.from) ? req.query.from : new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
    const roles = req.query.staff === '1' ? ['parent', 'teacher', 'staff'] : ['parent', 'teacher'];
    const inRoles = `v.role IN (${roles.map(() => '?').join(',')})`;
    const P = [from, to, ...roles];
    const rows = db.allRows(`SELECT v.role, v.user_id,
        COALESCE(p.name, t.name, a.name, '') AS name, COALESCE(p.email, t.email, a.email, '') AS email,
        COALESCE(t.school, '') AS school,
        COUNT(DISTINCT v.sid) AS visits, COUNT(*) AS pages, ROUND(SUM(v.seconds) / 60.0, 1) AS minutes,
        ROUND(SUM(CASE WHEN v.page IN ('/companion.html', '/pictures.html') THEN v.seconds ELSE 0 END) / 60.0, 1) AS companionMinutes,
        MIN(v.started_at) AS firstSeen, MAX(v.started_at) AS lastSeen
      FROM a_visits v
      LEFT JOIN parents p ON v.role = 'parent' AND p.id = v.user_id
      LEFT JOIN teachers t ON v.role = 'teacher' AND t.id = v.user_id
      LEFT JOIN admins a ON v.role = 'staff' AND a.id = v.user_id
      WHERE v.day BETWEEN ? AND ? AND ${inRoles} AND v.user_id IS NOT NULL
      GROUP BY v.role, v.user_id ORDER BY minutes DESC, visits DESC`, P);
    // the page each person spent most time on
    const top = db.allRows(`SELECT v.user_id, v.page, SUM(v.seconds) AS s, COUNT(*) AS n FROM a_visits v
      WHERE v.day BETWEEN ? AND ? AND ${inRoles} AND v.user_id IS NOT NULL GROUP BY v.user_id, v.page`, P);
    const best = {};
    for (const r of top) { const b = best[r.user_id]; if (!b || r.s > b.s || (r.s === b.s && r.n > b.n)) best[r.user_id] = r; }
    // children's names for parents (helps recognise a family)
    const kids = {};
    for (const c of db.allRows(`SELECT parent_id, name FROM children ORDER BY sort_order, created_at`)) (kids[c.parent_id] = kids[c.parent_id] || []).push(c.name);
    const anon = db.getRow(`SELECT COUNT(DISTINCT sid) AS visits, ROUND(COALESCE(SUM(seconds), 0) / 60.0) AS minutes FROM a_visits WHERE day BETWEEN ? AND ? AND role = 'visitor'`, [from, to]) || {};
    res.json({
      from, to,
      people: rows.map(r => ({ ...r, topPage: best[r.user_id] ? best[r.user_id].page : '', children: r.role === 'parent' ? (kids[r.user_id] || []).join(', ') : '' })),
      notSignedIn: { visits: anon.visits || 0, minutes: anon.minutes || 0 },
    });
  });

  return { serverEvent, flush };
}

module.exports = { register };
