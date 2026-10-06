// ── comms.js (Mare App 8, v87) — Comms: opt-in email for parents and teachers ──
//
// Two lists, PARENTS and TEACHERS. Nobody is on a list unless they ticked
// a box that says so (the exact words they saw are kept with the row).
//
//   How people join
//     - Creating a parent account: an unticked box, plus "as a parent /
//       teacher / both". Joins at once (they are signed in).
//     - Requesting teacher access: an unticked box. Waits for the email
//       to be confirmed (no account yet, so the address isn't proven).
//     - The newsletter form on the home page and the teachers' page:
//       waits for confirmation by email (double opt-in).
//     - Existing parents and teachers are asked once, the next time they
//       open the app. "No thanks" is remembered.
//     - Their account page (parents) or the teachers' page: on or off.
//     - Staff can add someone who asked to be added (noted as such).
//
//   What they get
//     - NEWSLETTERS: written by staff (or drafted by the app from the
//       Facts about Mare card), always approved by a person, sent at the
//       list's time (Dutch time): parents Thursday 20:30, teachers Tuesday
//       15:45, or a chosen time. Each person gets their own language.
//     - WELCOME SERIES: two short emails, 2 and 5 days after joining, at
//       the list's time of day. Off until switched on in admin.
//
//   Stopping
//     - Every email has a stop link: one press on the page it opens
//       (a page, not the link itself, so mail scanners that open links
//       can't stop someone by accident). Also the account page.
//     - A stop keeps the row as "stopped" with the date, so it is clear
//       the person left; staff can remove a row completely if asked to.
//
// Tables: comms_subscribers, comms_newsletters, comms_sent (one row per
// email sent, so a send that is interrupted resumes without doubles),
// comms_welcome. app_config.comms_options_json: { times }.

const crypto = require('crypto');
const cron = require('node-cron');

const TZ = 'Europe/Amsterdam';
const LISTS = ['parents', 'teachers'];
const WELCOME_DAYS = [2, 5];
const DEFAULT_TIMES = { parents: { day: 4, time: '20:30' }, teachers: { day: 2, time: '15:45' } };
const LIST_PAGE = { parents: '/', teachers: '/teacher.html' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

// The words beside the tick, exactly as shown (also in en.json / nl.json
// as newsConsentParents / newsConsentTeachers). Stored with each row.
const CONSENT = {
  parents: {
    nl: 'Ja, stuur me de Mare-nieuwsbrief voor ouders (hoogstens één keer per week, altijd af te melden).',
    en: "Yes, send me Mare's newsletter for parents (at most once a week, stop any time).",
  },
  teachers: {
    nl: 'Ja, stuur me de Mare-nieuwsbrief voor leerkrachten (hoogstens één keer per week, altijd af te melden).',
    en: "Yes, send me Mare's newsletter for teachers (at most once a week, stop any time).",
  },
  both: {
    nl: 'Ja, stuur me de Mare-nieuwsbrief voor ouders en die voor leerkrachten (elk hoogstens één keer per week, altijd af te melden).',
    en: "Yes, send me Mare's newsletters for parents and for teachers (each at most once a week, stop any time).",
  },
};
// The one-time question in the app (en/nl.json newsOfferBody*, newsOfferYes)
const OFFER = {
  parents: {
    nl: 'Wil je de Mare-nieuwsbrief voor ouders? Af en toe iets kleins om thuis te doen, en nieuws over Mare. Hoogstens één keer per week, altijd af te melden.',
    en: "Would you like Mare's newsletter for parents? Now and then something small to try at home, and news about Mare. At most once a week, stop any time.",
  },
  teachers: {
    nl: 'Wil je de Mare-nieuwsbrief voor leerkrachten? Af en toe iets voor in de klas, en nieuws over Mare. Hoogstens één keer per week, altijd af te melden.',
    en: "Would you like Mare's newsletter for teachers? Now and then something for the classroom, and news about Mare. At most once a week, stop any time.",
  },
  yes: { nl: 'Ja, graag', en: 'Yes please' },
};
const consentFor = (lists, locale) => (lists.length > 1 ? CONSENT.both[asLocale(locale)] : undefined);
const LIST_NAME = {
  parents: { nl: 'de Mare-nieuwsbrief voor ouders', en: "Mare's newsletter for parents" },
  teachers: { nl: 'de Mare-nieuwsbrief voor leerkrachten', en: "Mare's newsletter for teachers" },
};
const SOURCE_TEXT = {
  signup: 'Parent account sign-up', 'teacher-request': 'Teacher access request', form: 'Newsletter form',
  offer: 'Asked in the app', account: 'Own account settings', admin: 'Added by staff',
};

// The welcome series, seeded once (switched off until someone has read it).
const WELCOME_SEED = [
  ['parents', 0,
    'Een klein rustmoment voor vanavond',
    `Hoi {name},

Fijn dat je je hebt aangemeld. Je krijgt af en toe een korte mail van ons: iets kleins om thuis te doen, en nieuws over Mare.

Vast iets voor vanavond, vlak voor het slapengaan. Ga samen even zitten. Adem allebei rustig in, en nog langzamer uit. Doe dat drie keer. Vraag dan: "Wat voel je nu in je handen?" Er is geen goed of fout antwoord.

In het boek "Mare en het fluisterbos van woorden" hoort bij elk hoofdstuk zo'n kort oefeningetje. Op de site kun je gratis een stukje uit het boek lezen.

{{LINK}}

Groet,
Het Mare-team`,
    'A small calm moment for tonight',
    `Hi {name},

Thank you for signing up. Now and then you'll get a short email from us: something small to try at home, and news about Mare.

Here is something for tonight, just before bed. Sit down together for a moment. Both breathe in gently, and breathe out even more slowly. Do it three times. Then ask: "What can you feel in your hands now?" There is no right or wrong answer.

In the book "Mare and the Whispering Woods of Words", each chapter has a short practice like this. You can read a free sample of the book on the site.

{{LINK}}

Best wishes,
The Mare team`],
  ['parents', 1,
    'Samen lezen, en dan even kijken',
    `Hoi {name},

Zo werkt Mare het fijnst: je leest samen een hoofdstuk uit het boek. Het boek is het hart van het verhaal, en dat lees je gewoon samen, van papier.

Daarna kan je kind op de tablet de plaat bij dat hoofdstuk bekijken, met jou ernaast. Tikken, luisteren, kijken. Het heeft een begin en een eind, er is geen eindeloze feed. En dan gaat het scherm weer uit.

Zo blijft het samen, en kort.

{{LINK}}

Groet,
Het Mare-team`,
    'Read together, then take a look',
    `Hi {name},

This is how Mare works best: you read a chapter of the book together. The book is the heart of the story, and you simply read it together, on paper.

Afterwards your child can look at the picture for that chapter on the tablet, with you beside them. Tap, listen, look. It has a beginning and an end, with no endless feed. Then the screen goes off again.

That way it stays shared, and short.

{{LINK}}

Best wishes,
The Mare team`],
  ['teachers', 0,
    'Een rustmoment voor de groep, klaar voor morgen',
    `Hoi {name},

Fijn dat je je hebt aangemeld. Je krijgt af en toe een korte mail van ons: iets wat je de volgende dag in de klas kunt gebruiken, en nieuws over Mare.

Vast iets voor morgen, na de pauze. Laat de groep even stil zitten, voeten plat op de vloer. Adem samen rustig in, en nog langzamer uit. Drie keer. Vraag dan: "Wat merk je nu?" Er is geen goed of fout antwoord. Het duurt nog geen minuut.

In de lerarenhandleiding bij "Mare en het fluisterbos van woorden" staat bij elk hoofdstuk zo'n kort oefeningetje voor de groep.

{{LINK}}

Groet,
Het Mare-team`,
    'A calm moment for the class, ready for tomorrow',
    `Hi {name},

Thank you for signing up. Now and then you'll get a short email from us: something to use in class the next day, and news about Mare.

Here is something for tomorrow, after break. Let the class sit still for a moment, feet flat on the floor. Breathe in gently together, and breathe out even more slowly. Three times. Then ask: "What do you notice now?" There is no right or wrong answer. It takes less than a minute.

The Teacher's Guide to "Mare and the Whispering Woods of Words" has a short practice like this for each chapter, to use with the class.

{{LINK}}

Best wishes,
The Mare team`],
  ['teachers', 1,
    'Voorlezen, met een rustmoment per hoofdstuk',
    `Hoi {name},

"Mare en het fluisterbos van woorden" is een verhaal om voor te lezen in groep 5 tot en met 8. Mare vindt een pad naar een bos waar de bomen elk woord onthouden dat ooit is gezegd.

Bij elk hoofdstuk hoort een kort oefeningetje voor de groep. Je vindt ze in de lerarenhandleiding, klaar om te gebruiken.

Wil je weten wat er achter die oefeningen zit? Dat staat in gewone woorden in "Het alarm dat maar niet wil stoppen", om zelf te lezen.

{{LINK}}

Groet,
Het Mare-team`,
    'Reading aloud, with a calm moment for each chapter',
    `Hi {name},

"Mare and the Whispering Woods of Words" is a story to read aloud to children of about 8 to 12. Mare finds a path into a wood where the trees remember every word ever spoken.

Each chapter comes with a short practice for the class. You'll find them in the Teacher's Guide, ready to use.

Want to know what lies behind the practices? "The Alarm That Would Not Stop" explains it in plain words, for you to read.

{{LINK}}

Best wishes,
The Mare team`],
];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const nowIso = () => new Date().toISOString();
const normEmail = (e) => String(e || '').trim().toLowerCase();
const asList = (l) => (LISTS.includes(l) ? l : null);
const asLocale = (l) => (l === 'en' ? 'en' : 'nl');

function register(app, { db, auth, email, anthropic, model, publicUrl }) {
  const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
  const token = (what, id) => crypto.createHmac('sha256', SECRET).update(`comms:${what}:${id}`).digest('hex').slice(0, 32);
  const base = () => String(publicUrl || 'https://mare.deepermindfulness.org').replace(/\/+$/, '');
  const pageUrl = (list) => base() + (LIST_PAGE[list] || '/');
  const staff = auth.requireAuthApi(['admin', 'support']);
  const adminOnly = auth.requireAuthApi(['admin']);
  const cfg = () => db.getRow(`SELECT * FROM app_config WHERE id = 'default'`) || {};
  const json = (v, d) => { try { const x = JSON.parse(v || ''); return x == null ? d : x; } catch { return d; } };
  const options = () => json(cfg().comms_options_json, {}) || {};
  const times = () => {
    const t = options().times || {};
    const out = {};
    for (const l of LISTS) {
      const v = t[l] || {};
      out[l] = {
        day: Number.isInteger(v.day) && v.day >= 0 && v.day <= 6 ? v.day : DEFAULT_TIMES[l].day,
        time: /^\d{2}:\d{2}$/.test(v.time || '') ? v.time : DEFAULT_TIMES[l].time,
      };
    }
    return out;
  };

  // ── time helpers (Dutch time), as in social.js ──
  function zoned(ymd, hm) {
    const [y, m, d] = ymd.split('-').map(Number), [H, M] = hm.split(':').map(Number);
    let ts = Date.UTC(y, m - 1, d, H, M);
    for (let i = 0; i < 2; i++) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ts)).map(p => [p.type, p.value]));
      ts += Date.UTC(y, m - 1, d, H, M) - Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    }
    return new Date(ts);
  }
  const localYmd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  // the next free regular time for a list (never one already taken by another newsletter)
  function nextTime(list, exceptId) {
    const { day, time } = times()[list];
    const taken = new Set(db.allRows(`SELECT scheduled_for FROM comms_newsletters WHERE list = ? AND status IN ('scheduled','sending') AND id != ?`, [list, exceptId || '']).map(r => r.scheduled_for));
    for (let k = 0; k < 400; k++) {
      const ymd = addDays(localYmd(new Date()), k);
      if (new Date(ymd + 'T12:00:00Z').getUTCDay() !== day) continue;
      const at = zoned(ymd, time);
      if (at.getTime() < Date.now() + 10 * 60000) continue;
      if (!taken.has(at.toISOString())) return at.toISOString();
    }
    return null;
  }

  // ── seeding (once) ──
  db.getDb().then(() => {
    try {
      const list = [];
      for (const [l, step, snl, bnl, sen, ben] of WELCOME_SEED) {
        list.push([`INSERT OR IGNORE INTO comms_welcome (id, list, step, active, subject_nl, body_nl, subject_en, body_en) VALUES (?,?,?,0,?,?,?,?)`, [`${l}-${step}`, l, step, snl, bnl, sen, ben]]);
      }
      db.runBatch(list);
    } catch (e) { console.error('comms seed failed:', e.message); }
  });

  // ── rendering ──
  function firstName(name, locale) {
    const f = String(name || '').trim().split(/\s+/)[0];
    return f || (locale === 'en' ? 'there' : 'daar');
  }
  function bodyHtml(text, { name, list, locale }) {
    const filled = String(text || '').replace(/\{name\}/g, firstName(name, locale)).split('{{LINK}}').join(pageUrl(list));
    return filled.trim().split(/\n{2,}/).map(p => {
      const html = escapeHtml(p).replace(/\n/g, '<br>')
        .replace(/https?:\/\/[^\s<>"']+/g, u => {
          const clean = u.replace(/[.,;:!?)]+$/, ''), tail = u.slice(clean.length);
          return `<a href="${clean}" style="color:#16305C;font-weight:bold;">${clean.replace(/^https?:\/\//, '')}</a>${tail}`;
        });
      return `<p style="margin:0 0 14px;line-height:1.65;">${html}</p>`;
    }).join('');
  }
  // stop: a link for real subscribers, '#' in tests
  function emailHtml({ body, list, locale, name, stopUrl, kind }) {
    const nl = locale !== 'en';
    const why = kind === 'confirm'
      ? (nl ? 'Je krijgt deze e-mail omdat dit adres is ingevuld bij Mare. Heb je dat niet zelf gedaan? Dan hoef je niets te doen.' : 'You are getting this email because this address was entered on the Mare site. If that wasn’t you, you don’t need to do anything.')
      : (nl ? `Je krijgt deze e-mail omdat je je hebt aangemeld voor ${LIST_NAME[list].nl}.` : `You're getting this email because you signed up for ${LIST_NAME[list].en}.`);
    const stop = kind === 'confirm' ? '' : `<br><a href="${stopUrl || '#'}" style="color:#6b7a99;">${nl ? 'Afmelden' : 'Unsubscribe'}</a>`;
    const button = kind === 'confirm' ? '' : `<p style="margin:22px 0 0;"><a href="${pageUrl(list)}" style="display:inline-block;background:#EAC066;color:#16305C;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;padding:10px 18px;border-radius:999px;">${nl ? 'Naar Mare' : 'Visit Mare'}</a></p>`;
    return `<div style="background:#F4F1E8;padding:24px 12px;">
      <div style="font-family:Georgia,serif;max-width:540px;margin:0 auto;background:#FFFDF6;border:1px solid #EAC066;border-radius:18px;padding:28px 26px;color:#16305C;">
        <p style="font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;color:#9A7A2E;margin:0 0 14px;">Mare</p>
        <div style="font-size:1.02rem;">${body}</div>${button}
      </div>
      <p style="font-family:Arial,sans-serif;font-size:0.75rem;color:#6b7a99;max-width:540px;margin:14px auto 0;text-align:center;line-height:1.5;">${why}${stop}</p></div>`;
  }
  // which language a person gets: their own if that version is written, else the other
  function pick(item, locale) {
    const has = (l) => String(item[`subject_${l}`] || '').trim() && String(item[`body_${l}`] || '').trim();
    const l = has(asLocale(locale)) ? asLocale(locale) : (has('nl') ? 'nl' : (has('en') ? 'en' : null));
    return l ? { locale: l, subject: item[`subject_${l}`].trim(), body: item[`body_${l}`] } : null;
  }
  const stopUrl = (s) => `${base()}/comms/stop?s=${encodeURIComponent(s.id)}&t=${token('stop', s.id)}`;
  async function sendItem(item, s, kind, itemKey) {
    const p = pick(item, s.locale);
    if (!p) return { ok: false, error: 'Nothing written yet' };
    const html = emailHtml({ body: bodyHtml(p.body, { name: s.name, list: s.list, locale: p.locale }), list: s.list, locale: p.locale, stopUrl: stopUrl(s), kind });
    const subject = p.subject.replace(/\{name\}/g, firstName(s.name, p.locale));
    let r;
    try { r = await email.sendEmail(s.email, subject, html, { kind, userId: s.parent_id || s.teacher_id || null }); }
    catch (e) { r = { ok: false, error: e.message }; }
    if (itemKey) db.run(`INSERT OR IGNORE INTO comms_sent (item, subscriber_id, ok) VALUES (?,?,?)`, [itemKey, s.id, r && r.ok === false ? 0 : 1]);
    return r || { ok: true };
  }

  // ── warnings shown on a newsletter or welcome email (never blocking) ──
  function warnings(item) {
    const out = [];
    let flags = [];
    try { flags = require('./social').RED_FLAGS || []; } catch { /* none */ }
    for (const l of ['nl', 'en']) {
      const s = String(item[`subject_${l}`] || ''), b = String(item[`body_${l}`] || '');
      if (!s.trim() && !b.trim()) { out.push(l === 'nl' ? 'No Dutch version yet: Dutch readers get the English.' : 'No English version yet: English readers get the Dutch.'); continue; }
      if (!s.trim() || !b.trim()) out.push(`The ${l === 'nl' ? 'Dutch' : 'English'} version needs both a subject and a text.`);
      const low = ` ${(s + ' ' + b).toLowerCase()} `;
      const hits = flags.filter(f => low.includes(f));
      if (hits.length) out.push(`${l === 'nl' ? 'Dutch' : 'English'}: check the words ${hits.map(h => `"${h.trim()}"`).join(', ')} (on the list the writer must avoid).`);
      const facts = String(cfg().social_facts || '');
      const odd = ((s + ' ' + b).match(URL_RE) || []).map(u => u.replace(/[.,;:!?)]+$/, '')).filter(u => !u.startsWith(base()) && !facts.includes(u));
      if (odd.length) out.push(`${l === 'nl' ? 'Dutch' : 'English'}: a web address that isn't Mare's or in the Facts card: ${odd.join(', ')}.`);
    }
    return out;
  }

  // ── joining and leaving ──
  // Returns the row. status 'active' (joined) or 'pending' (waiting for the
  // email to be confirmed). A person who already finished the welcome
  // series never gets it twice.
  function subscribe({ email: rawEmail, name, list, locale, source, confirmed, parentId, teacherId, consentText }) {
    const em = normEmail(rawEmail);
    list = asList(list);
    if (!list || !EMAIL_RE.test(em) || /\.invalid$/.test(em)) return null;
    locale = asLocale(locale);
    const text = consentText
      || (source === 'offer' ? `Asked in the app: "${OFFER[list][locale]}" Answered: "${OFFER.yes[locale]}"`
        : source === 'account' ? `Switched on in their own Mare account: "${LIST_NAME[list][locale]}"`
          : CONSENT[list][locale]);
    const now = nowIso();
    const row = db.getRow(`SELECT * FROM comms_subscribers WHERE email = ? AND list = ?`, [em, list]);
    if (row) {
      if (row.status === 'active') {
        db.run(`UPDATE comms_subscribers SET name = CASE WHEN ? != '' THEN ? ELSE name END, parent_id = COALESCE(?, parent_id), teacher_id = COALESCE(?, teacher_id) WHERE id = ?`,
          [name || '', name || '', parentId || null, teacherId || null, row.id]);
        return db.getRow(`SELECT * FROM comms_subscribers WHERE id = ?`, [row.id]);
      }
      db.run(`UPDATE comms_subscribers SET status = ?, name = CASE WHEN ? != '' THEN ? ELSE name END, locale = ?, source = ?, consent_text = ?, consented_at = ?,
          confirmed_at = ?, stopped_at = NULL, parent_id = COALESCE(?, parent_id), teacher_id = COALESCE(?, teacher_id) WHERE id = ?`,
        [confirmed ? 'active' : 'pending', name || '', name || '', locale, source, text, now, confirmed ? now : null, parentId || null, teacherId || null, row.id]);
      return db.getRow(`SELECT * FROM comms_subscribers WHERE id = ?`, [row.id]);
    }
    const id = crypto.randomUUID();
    db.run(`INSERT INTO comms_subscribers (id, email, name, list, locale, status, source, consent_text, consented_at, confirmed_at, parent_id, teacher_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, em, String(name || '').slice(0, 120), list, locale, confirmed ? 'active' : 'pending', source, text, now, confirmed ? now : null, parentId || null, teacherId || null]);
    return db.getRow(`SELECT * FROM comms_subscribers WHERE id = ?`, [id]);
  }
  function stop(id) {
    db.run(`UPDATE comms_subscribers SET status = 'stopped', stopped_at = ? WHERE id = ? AND status != 'stopped'`, [nowIso(), id]);
  }
  // one confirmation email per address for all the lists it is waiting on
  async function sendConfirm(rows) {
    rows = rows.filter(r => r && r.status === 'pending' && (!r.confirm_sent_at || Date.now() - Date.parse(r.confirm_sent_at) > 10 * 60000));
    if (!rows.length) return;
    const r0 = rows[0], nl = r0.locale !== 'en';
    const ids = rows.map(r => r.id).join('.');
    const link = `${base()}/comms/confirm?s=${encodeURIComponent(ids)}&t=${token('confirm', ids)}`;
    const names = rows.map(r => LIST_NAME[r.list][nl ? 'nl' : 'en']).join(nl ? ' en ' : ' and ');
    const body = `<p style="margin:0 0 14px;line-height:1.65;">${nl ? `Hoi ${escapeHtml(firstName(r0.name, 'nl'))},` : `Hi ${escapeHtml(firstName(r0.name, 'en'))},`}</p>
      <p style="margin:0 0 14px;line-height:1.65;">${nl ? `Wil je ${escapeHtml(names)} ontvangen? Druk dan op de knop.` : `Would you like to get ${escapeHtml(names)}? Then press the button.`}</p>
      <p style="margin:22px 0 0;"><a href="${link}" style="display:inline-block;background:#EAC066;color:#16305C;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;padding:10px 18px;border-radius:999px;">${nl ? 'Ja, aanmelden' : 'Yes, sign me up'}</a></p>`;
    db.runBatch(rows.map(r => [`UPDATE comms_subscribers SET confirm_sent_at = ? WHERE id = ?`, [nowIso(), r.id]]));
    await email.sendEmail(r0.email, nl ? 'Bevestig je aanmelding bij Mare' : 'Please confirm your Mare sign-up', emailHtml({ body, list: r0.list, locale: nl ? 'nl' : 'en', kind: 'confirm' }), { kind: 'comms_confirm' })
      .catch(e => console.error('[comms] confirm email failed:', e.message));
  }

  // ── public: the newsletter form ──
  const hits = new Map(); // ip -> [times]
  app.post('/api/comms/signup', async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true }); // a form-filling robot
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    const recent = (hits.get(ip) || []).filter(t => Date.now() - t < 3600e3);
    if (recent.length >= 8) return res.status(429).json({ error: 'Too many tries. Please try again later.' });
    hits.set(ip, [...recent, Date.now()]);
    const em = normEmail(b.email);
    if (!EMAIL_RE.test(em)) return res.status(400).json({ error: "That doesn't look like a valid email address" });
    const lists = (Array.isArray(b.lists) ? b.lists : []).map(asList).filter(Boolean);
    if (!lists.length) return res.status(400).json({ error: 'Choose parents, teachers or both.' });
    if (!b.consent) return res.status(400).json({ error: 'Please tick the box to sign up.' });
    const locale = asLocale(b.locale);
    const uniq = [...new Set(lists)];
    const rows = uniq.map(list => subscribe({ email: em, name: String(b.name || '').trim(), list, locale, source: 'form', confirmed: false, consentText: consentFor(uniq, locale) }));
    await sendConfirm(rows);
    // same answer whether or not the address was already on a list
    res.json({ ok: true });
  });

  function page(res, locale, title, html, extra) {
    const nl = locale !== 'en';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html lang="${nl ? 'nl' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Mare</title></head>
      <body style="font-family:Arial,sans-serif;background:#F4F1E8;color:#16305C;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0;padding:12px;">
      <div style="max-width:440px;background:#fff;border-radius:16px;padding:28px;text-align:center;">
      <h1 style="font-family:Georgia,serif;font-size:1.4rem;">${escapeHtml(title)}</h1>${html}${extra || ''}
      <p style="margin-top:20px;"><a href="/" style="color:#16305C;">mare.deepermindfulness.org</a></p></div></body></html>`);
  }

  app.get('/comms/confirm', (req, res) => {
    const ids = String(req.query.s || '');
    const rows = ids && req.query.t === token('confirm', ids) ? ids.split('.').map(id => db.getRow(`SELECT * FROM comms_subscribers WHERE id = ?`, [id])).filter(Boolean) : [];
    const locale = rows[0] ? rows[0].locale : 'nl', nl = locale !== 'en';
    if (!rows.length) return page(res, locale, nl ? 'Deze link werkt niet' : 'That link didn’t work', `<p>${nl ? 'Meld je opnieuw aan op de site.' : 'Please sign up again on the site.'}</p>`);
    const now = nowIso();
    // only a row still waiting is turned on: a stop made after this email stays a stop
    db.runBatch(rows.filter(r => r.status === 'pending').map(r => [`UPDATE comms_subscribers SET status = 'active', confirmed_at = ? WHERE id = ?`, [now, r.id]]));
    const names = rows.map(r => LIST_NAME[r.list][nl ? 'nl' : 'en']).join(nl ? ' en ' : ' and ');
    page(res, locale, nl ? 'Gelukt, je bent aangemeld' : 'Done, you’re signed up', `<p>${nl ? `Je krijgt vanaf nu ${escapeHtml(names)}.` : `From now on you’ll get ${escapeHtml(names)}.`}</p>`);
  });

  // stop: the link opens a page with one button (scanners open links; they don't press buttons)
  function stopRow(req) {
    const id = String(req.query.s || '');
    return id && req.query.t === token('stop', id) ? db.getRow(`SELECT * FROM comms_subscribers WHERE id = ?`, [id]) : null;
  }
  app.get('/comms/stop', (req, res) => {
    const row = stopRow(req);
    if (!row) return page(res, 'nl', 'Deze link werkt niet', '<p>Meld je af via je account, of beantwoord de e-mail.<br><span style="color:#6b7a99;">That link didn’t work — unsubscribe in your account, or reply to the email.</span></p>');
    const nl = row.locale !== 'en';
    if (row.status === 'stopped') return page(res, row.locale, nl ? 'Je bent al afgemeld' : 'You’re already unsubscribed', `<p>${nl ? `Je krijgt ${escapeHtml(LIST_NAME[row.list].nl)} niet meer.` : `You no longer get ${escapeHtml(LIST_NAME[row.list].en)}.`}</p>`);
    page(res, row.locale, nl ? 'Afmelden' : 'Unsubscribe', `<p>${nl ? `Wil je ${escapeHtml(LIST_NAME[row.list].nl)} niet meer ontvangen?` : `Stop getting ${escapeHtml(LIST_NAME[row.list].en)}?`}<br><span style="color:#6b7a99;">${escapeHtml(row.email)}</span></p>
      <form method="post"><button type="submit" style="background:#EAC066;color:#16305C;border:none;font-weight:bold;font-size:1rem;padding:12px 22px;border-radius:999px;cursor:pointer;">${nl ? 'Ja, afmelden' : 'Yes, unsubscribe'}</button></form>`);
  });
  app.post('/comms/stop', (req, res) => {
    const row = stopRow(req);
    if (!row) return page(res, 'nl', 'Deze link werkt niet', '<p>That link didn’t work.</p>');
    stop(row.id);
    const nl = row.locale !== 'en';
    page(res, row.locale, nl ? 'Klaar, je bent afgemeld' : 'Done, you’re unsubscribed', `<p>${nl ? `Je krijgt ${escapeHtml(LIST_NAME[row.list].nl)} niet meer. Bedankt dat je meelas.` : `You won’t get ${escapeHtml(LIST_NAME[row.list].en)} any more. Thank you for reading.`}</p>`);
  });

  // ── signed-in parents and teachers: their own lists ──
  const member = auth.requireAuthApi(['parent', 'teacher']);
  function account(user) {
    const table = user.role === 'teacher' ? 'teachers' : 'parents';
    return { table, row: db.getRow(`SELECT id, email, name, preferred_locale, news_asked_at FROM ${table} WHERE id = ?`, [user.id]) };
  }
  function mine(user, acc) {
    const col = user.role === 'teacher' ? 'teacher_id' : 'parent_id';
    const rows = db.allRows(`SELECT list, status FROM comms_subscribers WHERE (${col} = ? OR email = ?)`, [user.id, normEmail(acc.email)]);
    const lists = {}, waiting = {};
    for (const l of LISTS) { lists[l] = rows.some(r => r.list === l && r.status === 'active'); waiting[l] = rows.some(r => r.list === l && r.status === 'pending'); }
    return { lists, waiting };
  }
  app.get('/api/comms/mine', member, (req, res) => {
    const { row } = account(req.user);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const m = mine(req.user, row);
    const own = req.user.role === 'teacher' ? 'teachers' : 'parents';
    const asked = !!row.news_asked_at || /\.invalid$/i.test(row.email) || m.lists[own] || !!req.user.viewAs;
    res.json({ role: req.user.role, ...m, asked });
  });
  // lists: { parents: true/false, teachers: true/false } (only the ones given change)
  app.post('/api/comms/mine', member, (req, res) => {
    const { table, row } = account(req.user);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const source = b.source === 'offer' ? 'offer' : 'account';
    const locale = asLocale(b.locale || row.preferred_locale);
    for (const l of LISTS) {
      if (!b.lists || typeof b.lists[l] !== 'boolean') continue;
      if (b.lists[l]) {
        subscribe({ email: row.email, name: row.name, list: l, locale, source, confirmed: true,
          parentId: req.user.role === 'parent' ? row.id : null, teacherId: req.user.role === 'teacher' ? row.id : null });
      } else {
        const col = req.user.role === 'teacher' ? 'teacher_id' : 'parent_id';
        db.allRows(`SELECT id FROM comms_subscribers WHERE list = ? AND (${col} = ? OR email = ?) AND status != 'stopped'`, [l, row.id, normEmail(row.email)]).forEach(r => stop(r.id));
      }
    }
    db.run(`UPDATE ${table} SET news_asked_at = COALESCE(news_asked_at, ?) WHERE id = ?`, [nowIso(), row.id]);
    res.json({ ok: true, ...mine(req.user, row) });
  });
  app.post('/api/comms/asked', member, (req, res) => {
    const { table, row } = account(req.user);
    if (row) db.run(`UPDATE ${table} SET news_asked_at = COALESCE(news_asked_at, ?) WHERE id = ?`, [nowIso(), row.id]);
    res.json({ ok: true });
  });

  // ── staff: Comms tab ──
  function counts() {
    const out = {};
    for (const l of LISTS) {
      const r = db.getRow(`SELECT SUM(status='active') AS active, SUM(status='pending') AS pending, SUM(status='stopped') AS stopped FROM comms_subscribers WHERE list = ?`, [l]) || {};
      out[l] = { active: r.active || 0, pending: r.pending || 0, stopped: r.stopped || 0 };
    }
    return out;
  }
  const withWarnings = (x) => ({ ...x, warnings: warnings(x) });
  app.get('/api/admin/comms', staff, (req, res) => {
    const nls = db.allRows(`SELECT * FROM comms_newsletters ORDER BY CASE status WHEN 'sending' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, COALESCE(scheduled_for, sent_at, created_at) DESC LIMIT 60`);
    res.json({
      counts: counts(), times: times(), welcomeDays: WELCOME_DAYS,
      next: Object.fromEntries(LISTS.map(l => [l, nextTime(l)])),
      newsletters: nls.map(n => n.status === 'sent' ? n : withWarnings(n)),
      welcome: db.allRows(`SELECT * FROM comms_welcome ORDER BY list, step`).map(withWarnings),
      canWrite: !!anthropic, isAdmin: req.user.role === 'admin',
    });
  });

  app.get('/api/admin/comms/subscribers', staff, (req, res) => {
    const where = [], args = [];
    if (asList(req.query.list)) { where.push('list = ?'); args.push(req.query.list); }
    if (['active', 'pending', 'stopped'].includes(req.query.status)) { where.push('status = ?'); args.push(req.query.status); }
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q) { where.push('(lower(email) LIKE ? OR lower(name) LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
    const rows = db.allRows(`SELECT * FROM comms_subscribers ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 1000`, args);
    res.json({ subscribers: rows.map(r => ({ ...r, source_text: SOURCE_TEXT[r.source] || r.source })) });
  });
  app.get('/api/admin/comms/subscribers.csv', staff, (req, res) => {
    const rows = db.allRows(`SELECT * FROM comms_subscribers ORDER BY list, created_at`);
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['email', 'name', 'list', 'language', 'status', 'how they joined', 'agreed to', 'agreed at', 'confirmed at', 'stopped at'];
    const csv = [head.map(cell).join(','), ...rows.map(r => [r.email, r.name, r.list, r.locale, r.status, SOURCE_TEXT[r.source] || r.source, r.consent_text, r.consented_at, r.confirmed_at, r.stopped_at].map(cell).join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mare-email-lists-${localYmd(new Date())}.csv"`);
    res.send('\uFEFF' + csv);
  });
  app.post('/api/admin/comms/subscribers', staff, (req, res) => {
    const b = req.body || {};
    if (!b.asked) return res.status(400).json({ error: 'Only add someone who asked to be added: tick the box to say they did.' });
    const em = normEmail(b.email);
    if (!EMAIL_RE.test(em)) return res.status(400).json({ error: "That doesn't look like a valid email address" });
    const list = asList(b.list);
    if (!list) return res.status(400).json({ error: 'Choose a list.' });
    const row = subscribe({ email: em, name: String(b.name || '').trim(), list, locale: b.locale, source: 'admin', confirmed: true,
      consentText: `Added by ${req.user.name || 'staff'}, who confirmed the person asked to be added.${b.note ? ' Note: ' + String(b.note).slice(0, 200) : ''}` });
    if (!row) return res.status(400).json({ error: 'Could not add that address.' });
    res.json({ ok: true, subscriber: row });
  });
  app.post('/api/admin/comms/subscribers/:id/stop', staff, (req, res) => { stop(req.params.id); res.json({ ok: true }); });
  // remove completely (someone asked for their details to be deleted)
  app.delete('/api/admin/comms/subscribers/:id', adminOnly, (req, res) => {
    db.runBatch([[`DELETE FROM comms_sent WHERE subscriber_id = ?`, [req.params.id]], [`DELETE FROM comms_subscribers WHERE id = ?`, [req.params.id]]]);
    res.json({ ok: true });
  });

  // newsletters
  const getNl = (id) => db.getRow(`SELECT * FROM comms_newsletters WHERE id = ?`, [id]);
  const ready = (n) => !!(pick(n, 'nl') || pick(n, 'en'));
  app.post('/api/admin/comms/newsletters', staff, (req, res) => {
    const list = asList((req.body || {}).list);
    if (!list) return res.status(400).json({ error: 'Choose a list.' });
    const id = crypto.randomUUID();
    db.run(`INSERT INTO comms_newsletters (id, list, subject_nl, body_nl, subject_en, body_en, created_by) VALUES (?,?,?,?,?,?,?)`,
      [id, list, '', 'Hoi {name},\n\n\n\n{{LINK}}\n\nGroet,\nHet Mare-team', '', 'Hi {name},\n\n\n\n{{LINK}}\n\nBest wishes,\nThe Mare team', req.user.name || '']);
    res.json({ ok: true, id });
  });
  app.post('/api/admin/comms/newsletters/write', staff, async (req, res) => {
    const list = asList((req.body || {}).list);
    if (!list) return res.status(400).json({ error: 'Choose a list.' });
    if (!anthropic) return res.status(400).json({ error: 'Drafting by the app isn’t available here. Use “New newsletter” and write it yourself.' });
    const notes = String((req.body || {}).notes || '').slice(0, 1200);
    let social = {};
    try { social = require('./social'); } catch { /* none */ }
    const facts = String(cfg().social_facts || social.DEFAULT_FACTS || '');
    const recent = db.allRows(`SELECT subject_nl FROM comms_newsletters WHERE list = ? AND subject_nl != '' ORDER BY created_at DESC LIMIT 6`, [list]).map(r => `- ${r.subject_nl}`).join('\n');
    try {
      const r = await anthropic.messages.create({
        model, max_tokens: 2500,
        system: require('./prompts').buildNewsletterPrompt({ facts, list, linkUrl: pageUrl(list) }),
        messages: [{ role: 'user', content: [notes ? `Notes from the team for this letter: ${notes}` : 'No notes this time: choose a useful, simple theme.', recent ? `Recent subjects (don't repeat them):\n${recent}` : ''].filter(Boolean).join('\n\n') }],
      });
      const text = (r.content || []).map(c => c.text || '').join('');
      const out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      // made-up web addresses out (only Mare's own and the facts' may stay)
      const clean = (s) => String(s || '').replace(URL_RE, u => (u.startsWith(base()) || facts.includes(u.replace(/[.,;:!?)]+$/, ''))) ? u : '{{LINK}}');
      const id = crypto.randomUUID();
      db.run(`INSERT INTO comms_newsletters (id, list, subject_nl, body_nl, subject_en, body_en, created_by) VALUES (?,?,?,?,?,?,?)`,
        [id, list, clean(out.subject_nl).slice(0, 200), clean(out.body_nl).slice(0, 8000), clean(out.subject_en).slice(0, 200), clean(out.body_en).slice(0, 8000), `${req.user.name || ''} [app]`]);
      res.json({ ok: true, id });
    } catch (e) {
      console.error('[comms] write failed:', e.message);
      res.status(502).json({ error: 'The app could not write a draft just now. Try again, or use “New newsletter”.' });
    }
  });
  app.patch('/api/admin/comms/newsletters/:id', staff, (req, res) => {
    const n = getNl(req.params.id);
    if (!n) return res.status(404).json({ error: 'Not found' });
    if (!['draft', 'scheduled'].includes(n.status)) return res.status(400).json({ error: 'This newsletter has already gone out.' });
    const b = req.body || {}, f = {};
    for (const [k, max] of [['subject_nl', 200], ['body_nl', 8000], ['subject_en', 200], ['body_en', 8000]]) if (typeof b[k] === 'string') f[k] = b[k].slice(0, max);
    const list = asList(b.list);
    if (list && n.status === 'draft') f.list = list;
    const keys = Object.keys(f);
    if (keys.length) db.run(`UPDATE comms_newsletters SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`, [...keys.map(k => f[k]), n.id]);
    res.json({ ok: true, newsletter: withWarnings(getNl(n.id)) });
  });
  app.delete('/api/admin/comms/newsletters/:id', staff, (req, res) => {
    db.run(`DELETE FROM comms_newsletters WHERE id = ? AND status IN ('draft','scheduled')`, [req.params.id]);
    res.json({ ok: true });
  });
  async function testTo(req, res, item, list, kind) {
    if (!req.user.email) return res.status(400).json({ error: 'Your staff account has no email address.' });
    const sentIn = [];
    for (const l of ['nl', 'en']) {
      const p = pick(item, l);
      if (!p || p.locale !== l) continue;
      const html = emailHtml({ body: bodyHtml(p.body, { name: req.user.name, list, locale: l }), list, locale: l, stopUrl: '#', kind });
      const r = await email.sendEmail(req.user.email, `[TEST] ${p.subject.replace(/\{name\}/g, firstName(req.user.name, l))}`, html, { kind: 'comms_test' }).catch(e => ({ ok: false, error: e.message }));
      if (r && r.ok === false) return res.status(502).json({ error: r.error || 'Test send failed — see the Email Log.' });
      sentIn.push(l.toUpperCase());
    }
    if (!sentIn.length) return res.status(400).json({ error: 'Write a subject and a text first.' });
    res.json({ ok: true, to: req.user.email, languages: sentIn });
  }
  app.post('/api/admin/comms/newsletters/:id/test', staff, async (req, res) => {
    const n = getNl(req.params.id);
    if (!n) return res.status(404).json({ error: 'Not found' });
    return testTo(req, res, n, n.list, 'comms_newsletter');
  });
  // approve = schedule: the next regular time, or a chosen Dutch time ("YYYY-MM-DDTHH:MM")
  app.post('/api/admin/comms/newsletters/:id/approve', staff, (req, res) => {
    const n = getNl(req.params.id);
    if (!n) return res.status(404).json({ error: 'Not found' });
    if (!['draft', 'scheduled'].includes(n.status)) return res.status(400).json({ error: 'This newsletter has already gone out.' });
    if (!ready(n)) return res.status(400).json({ error: 'Write a subject and a text first (Dutch, English or both).' });
    let at;
    const want = String((req.body || {}).at || '');
    if (want) {
      const m = want.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
      if (!m) return res.status(400).json({ error: 'Choose a date and time.' });
      at = zoned(m[1], m[2]).toISOString();
      if (Date.parse(at) < Date.now() + 2 * 60000) return res.status(400).json({ error: 'That time has already passed.' });
    } else {
      at = nextTime(n.list, n.id);
      if (!at) return res.status(400).json({ error: 'No free regular time was found. Choose a time instead.' });
    }
    db.run(`UPDATE comms_newsletters SET status = 'scheduled', scheduled_for = ?, updated_at = datetime('now') WHERE id = ?`, [at, n.id]);
    res.json({ ok: true, scheduledFor: at });
  });
  app.post('/api/admin/comms/newsletters/:id/unschedule', staff, (req, res) => {
    db.run(`UPDATE comms_newsletters SET status = 'draft', scheduled_for = NULL, updated_at = datetime('now') WHERE id = ? AND status = 'scheduled'`, [req.params.id]);
    res.json({ ok: true });
  });
  app.post('/api/admin/comms/newsletters/:id/send-now', staff, (req, res) => {
    const n = getNl(req.params.id);
    if (!n) return res.status(404).json({ error: 'Not found' });
    if (!['draft', 'scheduled'].includes(n.status)) return res.status(400).json({ error: 'This newsletter has already gone out.' });
    if (!ready(n)) return res.status(400).json({ error: 'Write a subject and a text first (Dutch, English or both).' });
    const recipients = counts()[n.list].active;
    if (!recipients) return res.status(400).json({ error: 'Nobody is on this list yet.' });
    db.run(`UPDATE comms_newsletters SET status = 'scheduled', scheduled_for = ?, updated_at = datetime('now') WHERE id = ?`, [nowIso(), n.id]);
    sendNewsletter(n.id).catch(e => console.error('[comms] send failed:', e.message));
    res.json({ ok: true, recipients });
  });

  // welcome series
  app.put('/api/admin/comms/welcome/:id', staff, (req, res) => {
    const w = db.getRow(`SELECT * FROM comms_welcome WHERE id = ?`, [req.params.id]);
    if (!w) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {}, f = {};
    for (const [k, max] of [['subject_nl', 200], ['body_nl', 8000], ['subject_en', 200], ['body_en', 8000]]) if (typeof b[k] === 'string') f[k] = b[k].slice(0, max);
    if (typeof b.active === 'boolean') {
      if (b.active && !ready({ ...w, ...f })) return res.status(400).json({ error: 'Write a subject and a text first.' });
      f.active = b.active ? 1 : 0;
    }
    const keys = Object.keys(f);
    if (keys.length) db.run(`UPDATE comms_welcome SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...keys.map(k => f[k]), nowIso(), w.id]);
    res.json({ ok: true, welcome: withWarnings(db.getRow(`SELECT * FROM comms_welcome WHERE id = ?`, [w.id])) });
  });
  app.post('/api/admin/comms/welcome/:id/test', staff, async (req, res) => {
    const w = db.getRow(`SELECT * FROM comms_welcome WHERE id = ?`, [req.params.id]);
    if (!w) return res.status(404).json({ error: 'Not found' });
    return testTo(req, res, w, w.list, 'comms_welcome');
  });

  // send times
  app.put('/api/admin/comms/times', staff, (req, res) => {
    const b = req.body || {}, cur = times();
    for (const l of LISTS) {
      const v = b[l] || {};
      const day = Number(v.day);
      if (Number.isInteger(day) && day >= 0 && day <= 6) cur[l].day = day;
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time || '')) cur[l].time = v.time;
    }
    db.run(`UPDATE app_config SET comms_options_json = ? WHERE id = 'default'`, [JSON.stringify({ ...options(), times: cur })]);
    res.json({ ok: true, times: cur, next: Object.fromEntries(LISTS.map(l => [l, nextTime(l)])) });
  });

  // ── sending ──
  const busy = new Set();
  async function sendNewsletter(id) {
    if (busy.has(id)) return;
    busy.add(id);
    try {
      const n = getNl(id);
      if (!n || !['scheduled', 'sending'].includes(n.status)) return;
      db.run(`UPDATE comms_newsletters SET status = 'sending', updated_at = datetime('now') WHERE id = ?`, [id]);
      const people = db.allRows(`SELECT * FROM comms_subscribers WHERE list = ? AND status = 'active'`, [n.list]);
      const done = new Set(db.allRows(`SELECT subscriber_id FROM comms_sent WHERE item = ?`, [`nl:${id}`]).map(r => r.subscriber_id));
      for (const s of people) {
        if (done.has(s.id)) continue;
        // someone who stopped while this was going out is skipped
        const still = db.getRow(`SELECT status FROM comms_subscribers WHERE id = ?`, [s.id]);
        if (!still || still.status !== 'active') continue;
        await sendItem(n, s, 'comms_newsletter', `nl:${id}`);
        db.run(`UPDATE comms_newsletters SET updated_at = datetime('now') WHERE id = ?`, [id]);
      }
      const c = db.getRow(`SELECT COUNT(*) AS total, SUM(ok) AS ok FROM comms_sent WHERE item = ?`, [`nl:${id}`]) || {};
      db.run(`UPDATE comms_newsletters SET status = 'sent', sent_at = ?, recipient_count = ?, sent_count = ?, failed_count = ?, updated_at = datetime('now') WHERE id = ?`,
        [nowIso(), c.total || 0, c.ok || 0, (c.total || 0) - (c.ok || 0), id]);
    } finally { busy.delete(id); }
  }
  async function welcomeTick() {
    const items = Object.fromEntries(db.allRows(`SELECT * FROM comms_welcome`).map(w => [w.id, w]));
    const t = times();
    const people = db.allRows(`SELECT * FROM comms_subscribers WHERE status = 'active' AND welcome_step < ? AND confirmed_at IS NOT NULL`, [WELCOME_DAYS.length]);
    for (const s of people) {
      let step = s.welcome_step;
      while (step < WELCOME_DAYS.length) {
        const due = zoned(addDays(localYmd(new Date(s.confirmed_at)), WELCOME_DAYS[step]), t[s.list].time).getTime();
        if (Date.now() < due) break;
        const w = items[`${s.list}-${step}`];
        // only on time (a day late at most): switching it on later never sends old ones
        if (w && w.active && Date.now() - due < 24 * 3600e3) await sendItem(w, s, 'comms_welcome', `w:${w.id}`);
        step++;
        db.run(`UPDATE comms_subscribers SET welcome_step = ? WHERE id = ?`, [step, s.id]);
      }
    }
  }
  let ticking = false;
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const due = db.allRows(`SELECT id FROM comms_newsletters WHERE (status = 'scheduled' AND scheduled_for <= ?) OR (status = 'sending' AND updated_at < datetime('now', '-15 minutes'))`, [nowIso()]);
      for (const n of due) await sendNewsletter(n.id);
      await welcomeTick();
    } catch (e) { console.error('[comms] tick failed:', e.message); }
    finally { ticking = false; }
  }
  cron.schedule('*/5 * * * *', () => { tick(); });

  return { subscribe, sendConfirm, consentFor, CONSENT, tick };
}

module.exports = { register, CONSENT, OFFER, LISTS };
