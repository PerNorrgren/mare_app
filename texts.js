// ─────────────────────────────────────────────────────────────────────
// SITE TEXT EDITING (Mare App 4) — the 'editor' role.
//
// Every visible text on the site is a named line in public/i18n/en.json
// and nl.json. Editors change those lines through /editor.html; their
// changes are stored as overrides in the database and merged in when a
// page asks for its texts (GET /i18n/<locale>.json below). The JSON
// files themselves are never changed, so every text can always go back
// to its original, and a deploy never wipes an edit.
//
// Kept deliberately safe and simple:
//   - admin screens' own texts (admin*, staff*, editor*) aren't editable;
//   - no HTML: text containing < or > is refused;
//   - placeholders such as {n} or {name} must stay exactly as they are,
//     or the sentence would break where the app fills them in;
//   - an empty text means "back to the original";
//   - every change is logged; admins can undo any change, or undo
//     everything changed today, and get a daily summary email.
// ─────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const LOCALES = ['en', 'nl'];
const MAX_LEN = 2000;
const HIDDEN_PREFIXES = ['admin', 'staff', 'editor'];

// Which page a text belongs to, from its key - for grouping on the
// editor page. First match wins.
const GROUPS = [
  ['home', /^(showcase|home|hero|press|brand|nav|talkToMare|clubMare$|clubMareSub$|maresShop|teachersTile)/],
  ['teacher', /^teacher/],
  ['club', /^(clubMare|whisper|wq|forest)/],
  ['shop', /^shop/],
  ['reader', /^(reader|chapter|scene|book|preview)/],
  ['talk', /^(talk|voice|mic)/],
  ['account', /^(login|signup|account|parent|child|password|reset|forgot|auth|email|register)/],
];

function loadBase() {
  const base = {};
  for (const l of LOCALES) {
    base[l] = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'i18n', `${l}.json`), 'utf8'));
  }
  return base;
}

function placeholders(s) {
  return (String(s || '').match(/\{\w+\}/g) || []).sort().join(',');
}

function groupOf(key) {
  for (const [g, re] of GROUPS) if (re.test(key)) return g;
  return 'other';
}

function isEditable(key, base) {
  return key in base.en && !HIDDEN_PREFIXES.some(p => key.startsWith(p));
}

function register(app, { db, auth, email }) {
  const base = loadBase(); // read once per deploy; the files never change at runtime

  // Pages load their texts from here (before express.static would serve
  // the plain file): the built-in texts with any edits merged in.
  app.get('/i18n/:file', (req, res, next) => {
    const m = /^(en|nl)\.json$/.exec(req.params.file);
    if (!m) return next();
    const locale = m[1];
    const dict = { ...base[locale] };
    for (const o of db.textGetOverrides(locale)) {
      if (o.key in dict) dict[o.key] = o.text;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.json(dict);
  });

  const editors = auth.requireAuthApi(['editor', 'admin']);

  app.get('/api/editor/texts', editors, (req, res) => {
    const overrides = {};
    for (const o of db.textGetAllOverrides()) overrides[`${o.locale}|${o.key}`] = o.text;
    const texts = Object.keys(base.en)
      .filter(k => isEditable(k, base))
      .map(k => ({
        key: k,
        group: groupOf(k),
        enOriginal: base.en[k],
        nlOriginal: base.nl[k] ?? '',
        en: overrides[`en|${k}`] ?? null,   // null = unchanged
        nl: overrides[`nl|${k}`] ?? null,
      }));
    res.json({ texts, role: req.user.role });
  });

  app.put('/api/editor/texts', editors, (req, res) => {
    const { key, locale } = req.body || {};
    if (!LOCALES.includes(locale) || !isEditable(key, base)) return res.status(400).json({ error: 'This text cannot be edited.' });
    const nl = locale === 'nl';
    let text = String((req.body && req.body.text) ?? '').replace(/\r\n/g, '\n').trim();
    const original = base[locale][key] ?? '';
    if (text === '' || text === original) {
      db.textSet(key, locale, null, req.user.email || req.user.name);
      return res.json({ ok: true, reset: true });
    }
    if (text.length > MAX_LEN) return res.status(400).json({ error: nl ? `Hoogstens ${MAX_LEN} tekens.` : `Up to ${MAX_LEN} characters.` });
    if (/[<>]/.test(text)) return res.status(400).json({ error: nl ? 'De tekens < en > kunnen niet gebruikt worden.' : 'The characters < and > can’t be used.' });
    if (placeholders(text) !== placeholders(original)) {
      const need = placeholders(original).split(',').filter(Boolean).join(' ');
      return res.status(400).json({ error: nl
        ? `Deze tekst moet ${need || 'geen'} ${need ? 'precies zo bevatten' : 'woorden tussen { } bevatten'} — de app vult daar iets in.`
        : `This text must contain ${need || 'no'} ${need ? 'exactly as written' : 'words in { }'} — the app fills something in there.` });
    }
    db.textSet(key, locale, text, req.user.email || req.user.name);
    res.json({ ok: true });
  });

  // ── Admin: change log, undo, undo today ──
  const admins = auth.requireAuthApi(['admin']);

  app.get('/api/admin/text-changes', admins, (req, res) => {
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    res.json({ changes: db.textGetChanges(since).map(c => ({ ...c, originalText: (base[c.locale] || {})[c.key] ?? '' })) });
  });

  function undoOne(change, by) {
    if (!change || change.undone) return false;
    // Only undo if the text is still what this change made it -
    // otherwise a later edit would be silently thrown away.
    const current = db.textGetOverride(change.key, change.locale);
    if ((current || null) !== (change.new_text || null)) return false;
    db.textSet(change.key, change.locale, change.old_text || null, `${by} (undo)`);
    db.textMarkUndone(change.id);
    return true;
  }

  app.post('/api/admin/text-changes/:id/undo', admins, (req, res) => {
    const ok = undoOne(db.textGetChange(req.params.id), req.user.email || req.user.name);
    if (!ok) return res.status(409).json({ error: 'This text has been changed again since — undo the later change first.' });
    res.json({ ok: true });
  });

  app.post('/api/admin/text-changes/undo-today', admins, (req, res) => {
    const today = new Date().toISOString().slice(0, 10) + ' 00:00:00';
    // Newest first, so each undo restores the state before the next one.
    const changes = db.textGetChanges(today).filter(c => !c.undone && !String(c.changed_by || '').endsWith('(undo)'));
    let n = 0;
    for (const c of changes) if (undoOne(c, req.user.email || req.user.name)) n++;
    res.json({ ok: true, undone: n });
  });

  // ── Daily summary to the notify address, 18:00 UK time ──
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  async function sendDailySummary() {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const changes = db.textGetChanges(since);
    if (!changes.length) return { sent: false };
    const config = db.getAppConfig();
    const to = config && config.contact_email;
    if (!to) return { sent: false };
    const rows = changes.slice().reverse().map(c => {
      const orig = (base[c.locale] || {})[c.key] ?? '';
      return `<tr><td style="padding:8px 10px 8px 0;vertical-align:top;color:#6b7a99;font-size:0.85rem;">${escapeHtml(groupOf(c.key))} · ${c.locale.toUpperCase()}<br>${escapeHtml(c.changed_by || '')}${c.undone ? '<br><em>undone</em>' : ''}</td>
        <td style="padding:8px 0;vertical-align:top;"><div style="color:#8a5412;text-decoration:line-through;">${escapeHtml(c.old_text ?? orig)}</div><div style="color:#16305C;">${escapeHtml(c.new_text ?? orig)}</div></td></tr>`;
    }).join('');
    const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:20px;color:#16305C;">
      <h2 style="font-family:Georgia,serif;">Text changes on the Mare site — last 24 hours</h2>
      <p>${changes.length} change${changes.length === 1 ? '' : 's'}. Anything can be undone in Admin &gt; Showcase Page &gt; Text changes.</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table></div>`;
    await email.sendEmail(to, `Mare site: ${changes.length} text change${changes.length === 1 ? '' : 's'} today`, html, { kind: 'text_changes_summary' });
    return { sent: true, count: changes.length };
  }
  try {
    const cron = require('node-cron');
    cron.schedule('0 18 * * *', () => {
      sendDailySummary().catch(e => console.error('[texts] daily summary failed:', e.message));
    }, { timezone: 'Europe/London' });
  } catch (e) {
    console.error('[texts] could not schedule the daily summary:', e.message);
  }

  return { sendDailySummary };
}

module.exports = { register, groupOf };
