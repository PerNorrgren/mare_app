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
//         a_devices — v80: one row per visitor ID (a random code kept in
//                     that browser), linked to the account once it signs in
//         a_bots    — v80: visits refused as bots, counted per day and reason
// v80 — no tracking at all when the visitor switched it off, or the
// browser sends 'do not track' / Global Privacy Control; a visit only
// counts once a person is clearly there (5 s in view, or a tap/scroll/key).
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
  let newVisits = [], newEvents = [], deviceSeen = new Map(), bots = new Map();
  const addSeconds = new Map(); // visit id -> seconds to add
  function flush() {
    if (!newVisits.length && !newEvents.length && !addSeconds.size && !deviceSeen.size && !bots.size) return;
    const list = [];
    for (const v of newVisits) list.push([`INSERT OR IGNORE INTO a_visits (id, sid, day, started_at, page, role, user_id, lang, device, ref, seconds, did) VALUES (?,?,?,?,?,?,?,?,?,?,0,?)`,
      [v.id, v.sid, v.day, v.at, v.page, v.role, v.userId, v.lang, v.device, v.ref, v.did]]);
    for (const [did, d] of deviceSeen) {
      list.push([`INSERT INTO a_devices (did, first_seen, last_seen) VALUES (?,?,?) ON CONFLICT(did) DO UPDATE SET last_seen = excluded.last_seen`, [did, d.first || d.at, d.at]]);
      if (d.userId && d.role !== 'preview') list.push([`UPDATE a_devices SET role = ?, user_id = ?, linked_at = COALESCE(linked_at, ?) WHERE did = ?`, [d.role, d.userId, d.at, did]]);
    }
    for (const [k, n] of bots) { const [day, reason] = k.split('|'); list.push([`INSERT INTO a_bots (day, reason, n) VALUES (?,?,?) ON CONFLICT(day, reason) DO UPDATE SET n = n + excluded.n`, [day, reason, n]]); }
    deviceSeen = new Map(); bots = new Map();
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

  // v80 — bots: names crawlers, preview fetchers and test tools give themselves
  const BOT_UA = /bot|crawl|spider|slurp|preview|fetch|scrape|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python-requests|axios|go-http|java\/|phantom|selenium|puppeteer|playwright|facebookexternalhit|whatsapp|telegram|discord|slack|embedly|bingpreview/i;
  function countBot(reason) { const k = `${today()}|${reason}`; bots.set(k, (bots.get(k) || 0) + 1); }

  // A page opened (sent once a person is clearly there). -> { vid }
  app.post('/api/a/v', textParser, (req, res) => {
    const b = body(req);
    const sid = clip(b.sid, 40), page = clip(b.page, 60);
    if (!/^[a-z0-9]{8,40}$/i.test(sid) || !PAGES.has(page) || tooMany(sid)) return res.status(204).end();
    const ua = String(req.headers['user-agent'] || '');
    if (!ua || BOT_UA.test(ua)) { countBot('name'); return res.status(204).end(); }
    if (b.bot) { countBot('automated'); return res.status(204).end(); }
    const did = /^[0-9A-Z]{8}$/.test(String(b.did || '')) ? String(b.did) : null;
    const w = who(req);
    const vid = crypto.randomUUID();
    const at = new Date().toISOString();
    if (did) {
      const prev = deviceSeen.get(did) || {};
      deviceSeen.set(did, { first: prev.first || at, at, userId: w.userId || prev.userId || null, role: w.userId ? w.role : prev.role });
    }
    newVisits.push({ id: vid, did, sid, day: today(), at, page: page === '/index.html' ? '/' : page, role: w.role, userId: w.userId,
      lang: b.lang === 'nl' ? 'nl' : 'en', device: ['phone', 'tablet', 'desktop'].includes(b.device) ? b.device : 'desktop', // device type
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
    const ua = String(req.headers['user-agent'] || '');
    if (!ua || BOT_UA.test(ua) || b.bot) return res.status(204).end();
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
    out.daily = all(`SELECT day, COUNT(DISTINCT sid) AS visits, ROUND(SUM(seconds)/60.0) AS minutes, COUNT(*) AS views, COUNT(DISTINCT did) AS visitors ${V} GROUP BY day ORDER BY day`);

    // v80 — unique and returning visitors (by visitor ID), new ones, bots
    const perVisitor = all(`SELECT did, COUNT(DISTINCT day) AS days FROM a_visits WHERE day BETWEEN ? AND ? AND ${inRoles} AND did IS NOT NULL GROUP BY did`);
    const days = perVisitor.map(r => r.days);
    out.visitors = {
      unique: days.length,
      returning: days.filter(n => n >= 2).length,
      new: db.getRow(`SELECT COUNT(*) AS n FROM a_devices WHERE substr(first_seen,1,10) BETWEEN ? AND ? AND did IN (SELECT DISTINCT did FROM a_visits WHERE day BETWEEN ? AND ? AND ${inRoles})`, [from, to, ...P]).n,
      comeBack: [['1', 1, 1], ['2-3', 2, 3], ['4-7', 4, 7], ['8+', 8, 1e9]].map(([label, lo, hi]) => ({ days: label, visitors: days.filter(n => n >= lo && n <= hi).length })),
      since: (db.getRow(`SELECT MIN(day) AS d FROM a_visits WHERE did IS NOT NULL`) || {}).d || null,
    };
    out.bots = { total: (db.getRow(`SELECT COALESCE(SUM(n),0) AS n FROM a_bots WHERE day BETWEEN ? AND ?`, [from, to]) || {}).n || 0,
      byReason: db.allRows(`SELECT reason, SUM(n) AS n FROM a_bots WHERE day BETWEEN ? AND ? GROUP BY reason ORDER BY n DESC`, [from, to]) };
    // v80 — from first visit to signing up: parents who joined in the period on a browser we already knew
    const joined = db.allRows(`SELECT p.id, p.created_at,
        (SELECT COUNT(DISTINCT v.sid) FROM a_visits v JOIN a_devices d ON d.did = v.did WHERE d.user_id = p.id AND substr(replace(v.started_at, 'T', ' '), 1, 19) < substr(replace(p.created_at, 'T', ' '), 1, 19)) AS visitsBefore,
        (SELECT MIN(d.first_seen) FROM a_devices d WHERE d.user_id = p.id) AS firstSeen
      FROM parents p WHERE ${at('p.created_at')} AND p.email NOT LIKE '%@preview.mare.invalid'`, [from, to]);
    const ms = (s) => Date.parse(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
    const known = joined.filter(j => j.firstSeen && ms(j.firstSeen) < ms(j.created_at));
    out.signups = { parents: joined.length, knownBefore: known.length,
      avgVisitsBefore: known.length ? Math.round(known.reduce((s, j) => s + j.visitsBefore, 0) / known.length * 10) / 10 : 0,
      avgDaysBefore: known.length ? Math.round(known.reduce((s, j) => s + (ms(j.created_at) - ms(j.firstSeen)) / 864e5, 0) / known.length * 10) / 10 : 0 };

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

  // ── People (v79, v80) — one row per person: a signed-in account (all its
  // browsers together, including visits from before it signed in) or an
  // anonymous visitor ID. Names and emails are only sent when asked for
  // (names=1); otherwise the list is by visitor ID.
  // GET /api/admin/analytics/people?from&to&staff=1&names=1
  app.get('/api/admin/analytics/people', auth.requireAuthApi(['admin', 'support']), (req, res) => {
    fresh();
    const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
    const to = isDay(req.query.to) ? req.query.to : today();
    const from = isDay(req.query.from) ? req.query.from : new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
    const roles = req.query.staff === '1' ? ['visitor', 'parent', 'teacher', 'staff'] : ['visitor', 'parent', 'teacher'];
    const names = req.query.names === '1';
    const visits = db.allRows(`SELECT v.sid, v.did, v.role, v.user_id, v.day, v.page, v.seconds, v.started_at, d.user_id AS dUser, d.role AS dRole
      FROM a_visits v LEFT JOIN a_devices d ON d.did = v.did
      WHERE v.day BETWEEN ? AND ? AND v.role IN (${roles.map(() => '?').join(',')})`, [from, to, ...roles]);
    const people = new Map(); let unknown = 0;
    const blank = (key, role, uid, at) => ({ key, role, userId: uid || null, dids: new Set(), sids: new Set(), sidsAnon: new Set(), days: new Set(), pages: 0, seconds: 0, compSeconds: 0,
      byPage: {}, pagesSeen: new Set(), events: {}, talk: 0, firstSeen: at || null, lastSeen: at || null, signedUpAt: null });
    const getP = (key, role, uid, at) => { let p = people.get(key); if (!p) { p = blank(key, role, uid, at); people.set(key, p); } return p; };
    const sidKey = new Map();
    for (const v of visits) {
      let role, uid;
      if (v.user_id) { role = v.role; uid = v.user_id; }
      else if (v.dUser && v.dRole && roles.includes(v.dRole)) { role = v.dRole; uid = v.dUser; }
      const key = uid ? `${role}:${uid}` : (v.did ? `D:${v.did}` : null);
      if (!key) { unknown++; continue; } // from before visitor IDs existed
      const p = getP(key, uid ? role : 'visitor', uid, v.started_at);
      sidKey.set(v.sid, key);
      if (v.did) p.dids.add(v.did);
      p.sids.add(v.sid); if (uid && !v.user_id) p.sidsAnon.add(v.sid);
      p.days.add(v.day); p.pages++; p.seconds += v.seconds || 0; p.pagesSeen.add(v.page);
      if (v.page === '/companion.html' || v.page === '/pictures.html') p.compSeconds += v.seconds || 0;
      p.byPage[v.page] = (p.byPage[v.page] || 0) + (v.seconds || 0) + 0.001;
      if (!p.firstSeen || v.started_at < p.firstSeen) p.firstSeen = v.started_at;
      if (!p.lastSeen || v.started_at > p.lastSeen) p.lastSeen = v.started_at;
    }
    // v80 — what each person did (events), talks with Mare, and accounts made in the period
    for (const e of db.allRows(`SELECT sid, user_id, role, name FROM a_events WHERE day BETWEEN ? AND ? AND role IN (${roles.map(() => '?').join(',')})`, [from, to, ...roles])) {
      const key = e.user_id ? `${e.role}:${e.user_id}` : sidKey.get(e.sid);
      const p = key && people.get(key); if (!p) continue;
      p.events[e.name] = (p.events[e.name] || 0) + 1;
    }
    for (const r of db.allRows(`SELECT parent_id, COUNT(*) AS n FROM talk_sessions WHERE substr(started_at,1,10) BETWEEN ? AND ? AND parent_id IN (SELECT id FROM parents WHERE email NOT LIKE '%@preview.mare.invalid') GROUP BY parent_id`, [from, to])) {
      getP(`parent:${r.parent_id}`, 'parent', r.parent_id).talk = r.n;
    }
    for (const [role, table] of [['parent', 'parents'], ['teacher', 'teachers']]) {
      for (const r of db.allRows(`SELECT id, created_at FROM ${table} WHERE substr(created_at,1,10) BETWEEN ? AND ? AND email NOT LIKE '%@preview.mare.invalid'`, [from, to])) {
        getP(`${role}:${r.id}`, role, r.id).signedUpAt = r.created_at;
      }
    }
    const firstSeenOf = {};
    for (const r of db.allRows(`SELECT did, first_seen FROM a_devices`)) firstSeenOf[r.did] = r.first_seen;
    const kids = {};
    if (names) for (const c of db.allRows(`SELECT parent_id, name FROM children ORDER BY sort_order, created_at`)) (kids[c.parent_id] = kids[c.parent_id] || []).push(c.name);
    const account = (role, id) => {
      if (role === 'parent') return db.getRow(`SELECT name, email, created_at FROM parents WHERE id = ?`, [id]);
      if (role === 'teacher') return db.getRow(`SELECT name, email, school, created_at FROM teachers WHERE id = ?`, [id]);
      if (role === 'staff') return db.getRow(`SELECT name, email, created_at FROM admins WHERE id = ?`, [id]);
      return null;
    };
    const rows = [...people.values()].map(p => {
      const ids = [...p.dids].sort();
      const top = Object.entries(p.byPage).sort((a, b) => b[1] - a[1])[0];
      const r = {
        visitorId: ids.length ? `V-${ids[0]}` : '', otherIds: Math.max(0, ids.length - 1), role: p.role,
        days: p.days.size, visits: p.sids.size, visitsBeforeSignIn: p.sidsAnon.size, pages: p.pages,
        minutes: Math.round(p.seconds / 6) / 10, companionMinutes: Math.round(p.compSeconds / 6) / 10,
        topPage: top ? top[0] : '', firstSeen: p.firstSeen, lastSeen: p.lastSeen,
        pagesSeen: [...p.pagesSeen], events: p.events, talk: p.talk, signedUpAt: p.signedUpAt,
        isNew: ids.some(d => firstSeenOf[d] && firstSeenOf[d].slice(0, 10) >= from && firstSeenOf[d].slice(0, 10) <= to),
      };
      if (names && p.userId) {
        const a = account(p.role, p.userId) || {};
        r.name = a.name || ''; r.email = a.email || '';
        r.detail = p.role === 'parent' ? (kids[p.userId] || []).join(', ') : (a.school || '');
      }
      return r;
    }).sort((a, b) => b.minutes - a.minutes || b.visits - a.visits);
    res.json({ from, to, names, people: rows, olderVisits: unknown });
  });

  return { serverEvent, flush };
}

module.exports = { register };
