// ── email.js — Mare companion app ──
// Transactional email via Scaleway TEM, same provider and same pending/
// sent/failed logging pattern as per_bot's own sendEmail() in server.js
// — ported directly rather than reinvented, since per_bot already has
// real production experience with this exact API. Fully separate
// credentials from per_bot (own SCW_* env vars on this Railway service),
// own email_log table, own brand name in the "from" field.
//
// If SCW_SECRET_KEY/SCW_PROJECT_ID aren't set, every send is logged as
// 'failed' with a clear reason and the app keeps working otherwise —
// same graceful-degradation choice per_bot makes, so a missing env var
// on a fresh deploy never crashes a signup or a password reset request.

const db = require('./db');

const SCW_SECRET_KEY = process.env.SCW_SECRET_KEY;
const SCW_PROJECT_ID = process.env.SCW_PROJECT_ID;
const SCW_TEM_REGION = process.env.SCW_TEM_REGION || 'fr-par';
const EMAIL_FROM = process.env.EMAIL_FROM || 'mare@deepermindfulness.org';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Mare';
const APP_URL = process.env.APP_URL || 'https://mareapp-production.up.railway.app';

// Rough plain-text fallback derived from the HTML body — same approach
// as per_bot's htmlToText(), kept simple rather than pulled in as a
// shared dependency across two separate Railway services/repos.
function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

// meta: { kind, userId } — both optional. Returns {ok, id, error}.
async function sendEmail(to, subject, html, meta = {}) {
  const kind = meta.kind || 'other';
  const id = db.uuid();
  db.run(
    `INSERT INTO email_log (id, kind, to_email, subject, status, user_id) VALUES (?,?,?,?,'pending',?)`,
    [id, kind, to, subject, meta.userId || null]
  );
  db.save();

  if (!SCW_SECRET_KEY || !SCW_PROJECT_ID) {
    console.log('SCW_SECRET_KEY/SCW_PROJECT_ID not set — skipping email to', to);
    db.run(`UPDATE email_log SET status='failed', error=?, updated_at=datetime('now') WHERE id=?`,
      ['Email not configured (missing Scaleway credentials).', id]);
    db.save();
    return { ok: false, error: 'Email not configured.' };
  }

  try {
    const res = await fetch(`https://api.scaleway.com/transactional-email/v1alpha1/regions/${SCW_TEM_REGION}/emails`, {
      method: 'POST',
      headers: { 'X-Auth-Token': SCW_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: { name: EMAIL_FROM_NAME, email: EMAIL_FROM },
        to: [{ email: to }],
        subject,
        text: htmlToText(html),
        html,
        project_id: SCW_PROJECT_ID,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = (data && (data.message || JSON.stringify(data))) || `HTTP ${res.status}`;
      console.error('Scaleway TEM error:', res.status, errMsg);
      db.run(`UPDATE email_log SET status='failed', error=?, updated_at=datetime('now') WHERE id=?`, [errMsg, id]);
      db.save();
      return { ok: false, error: errMsg };
    }
    const scalewayId = (data && data.emails && data.emails[0] && data.emails[0].id) || (data && data.id) || null;
    db.run(`UPDATE email_log SET status='sent', provider_id=?, updated_at=datetime('now') WHERE id=?`, [scalewayId, id]);
    db.save();
    return { ok: true, id: scalewayId };
  } catch (e) {
    console.error('Email error:', e.message);
    db.run(`UPDATE email_log SET status='failed', error=?, updated_at=datetime('now') WHERE id=?`, [e.message, id]);
    db.save();
    return { ok: false, error: e.message };
  }
}

// ── Templates — plain, on-brand, minimal. Deliberately not fancy HTML
// layouts yet; the goal right now is a working, logged send path, not a
// polished design pass. ──

function wrapHtml(bodyHtml) {
  return `<div style="font-family:'Quicksand',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#16305C;">
    <h1 style="font-family:Georgia,serif;font-size:1.4rem;color:#16305C;margin:0 0 16px;">Mare</h1>
    ${bodyHtml}
    <p style="margin-top:32px;font-size:0.85rem;color:#4A5C82;">— The Mare team</p>
  </div>`;
}

function sendWelcomeParentEmail(to, name) {
  const html = wrapHtml(`
    <p>Hi ${name},</p>
    <p>Your family account is ready. You can sign in any time at <a href="${APP_URL}/login.html">${APP_URL.replace(/^https?:\/\//, '')}</a> to add a child profile and see what Mare's been up to.</p>
  `);
  return sendEmail(to, 'Welcome to Mare', html, { kind: 'welcome_parent' });
}

function sendWelcomeTeacherEmail(to, name) {
  const html = wrapHtml(`
    <p>Hi ${name},</p>
    <p>Your teacher account is ready. Sign in any time at <a href="${APP_URL}/teacher-login.html">${APP_URL.replace(/^https?:\/\//, '')}</a> for classroom resources and the teacher hub.</p>
  `);
  return sendEmail(to, 'Welcome to Mare — teacher account', html, { kind: 'welcome_teacher' });
}

function sendPasswordResetEmail(to, name, resetUrl) {
  const html = wrapHtml(`
    <p>Hi ${name},</p>
    <p>Someone requested a password reset for this account. If that was you, choose a new password here:</p>
    <p><a href="${resetUrl}" style="display:inline-block;background:#EAC066;color:#16305C;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600;">Reset your password</a></p>
    <p style="font-size:0.85rem;color:#4A5C82;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.</p>
  `);
  return sendEmail(to, 'Reset your Mare password', html, { kind: 'password_reset' });
}

module.exports = {
  sendEmail,
  sendWelcomeParentEmail,
  sendWelcomeTeacherEmail,
  sendPasswordResetEmail,
};
