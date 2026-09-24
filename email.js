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
const EMAIL_FROM = process.env.EMAIL_FROM || 'per@deepermindfulness.org';
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

// ── Broadcasts (admin-composed messages) ──
// bodyHtml is the admin's own rich-editor output, used as-is (not run
// through wrapHtml's own template) since the composer already produces
// a complete, styled message — wrapping it again would double the
// brand header. userId here is the recipient (parent/teacher id), for
// correlating email_log rows back to a person if needed later.
function sendBroadcastEmail(to, subject, bodyHtml, userId) {
  return sendEmail(to, subject, bodyHtml, { kind: 'broadcast', userId });
}

// Only used for the two admin-notification templates below — the
// existing welcome/reset templates interpolate a signed-up user's own
// name, already known and stored; these two carry free-typed input
// from a not-yet-verified requester (signup form) or a free-text
// question box, so it gets escaped before landing in an HTML email.
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Admin notifications — teacher signup requests and in-app questions,
// both sent to app_config.contact_email (the admin-configured "Notify"
// address, see db.getAppConfig/setNotifyEmail). No wrapHtml() template
// here — these are internal notices to the admin, not a message to the
// teacher, so the brand header/signature would be out of place. ──
function sendTeacherSignupRequestNotification(to, { firstName, lastName, email, school }) {
  const fn = escapeHtml(firstName), ln = escapeHtml(lastName), em = escapeHtml(email), sc = escapeHtml(school);
  const html = `<div style="font-family:'Quicksand',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#16305C;">
    <h2 style="font-family:Georgia,serif;font-size:1.2rem;margin:0 0 16px;">New teacher signup request</h2>
    <p><strong>Name:</strong> ${fn} ${ln}<br>
       <strong>Email:</strong> ${em}<br>
       <strong>School:</strong> ${sc || '(not given)'}</p>
    <p style="font-size:0.85rem;color:#4A5C82;">Create their account from Admin → Parents & Teachers if approved.</p>
  </div>`;
  return sendEmail(to, `Teacher signup request — ${firstName} ${lastName}`, html, { kind: 'teacher_signup_request' });
}

function sendTeacherQuestionNotification(to, { name, email, school, message }) {
  const nm = escapeHtml(name), em = escapeHtml(email), sc = escapeHtml(school), msg = escapeHtml(message);
  const html = `<div style="font-family:'Quicksand',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#16305C;">
    <h2 style="font-family:Georgia,serif;font-size:1.2rem;margin:0 0 16px;">Question from a teacher</h2>
    <p><strong>Name:</strong> ${nm}<br>
       <strong>Email:</strong> ${em}<br>
       <strong>School:</strong> ${sc || '(not given)'}</p>
    <p style="white-space:pre-wrap;border-left:3px solid #EAC066;padding-left:12px;">${msg}</p>
  </div>`;
  return sendEmail(to, `Question from ${name}`, html, { kind: 'teacher_question' });
}

// Mare App 4 — new paid order, to the notify address (the Mare email),
// with everything needed to post the parcel.
function sendOrderNotification(to, { order, items, currency }) {
  const money = (cents) => {
    try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency || 'gbp').toUpperCase() }).format(cents / 100); }
    catch { return (cents / 100).toFixed(2); }
  };
  const rows = items.map(it => {
    let variant = '';
    try { const v = JSON.parse(it.variant_json || '{}'); variant = typeof v === 'string' ? v : Object.values(v || {}).join(', '); } catch {}
    return `<tr><td style="padding:4px 12px 4px 0;">${it.qty} &times; ${escapeHtml(it.product_name || '(deleted product)')}${variant ? ` <span style="color:#6b7a99;">(${escapeHtml(variant)})</span>` : ''}</td><td style="padding:4px 0;text-align:right;">${money(it.price_cents * it.qty)}</td></tr>`;
  }).join('');
  const html = `<div style="font-family:'Quicksand',Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#16305C;">
    <h2 style="font-family:Georgia,serif;font-size:1.25rem;margin:0 0 16px;">New order — ready to post</h2>
    <p style="margin:0 0 4px;"><strong>${escapeHtml(order.customer_name || '(no name)')}</strong></p>
    <p style="margin:0 0 16px;"><a href="mailto:${escapeHtml(order.customer_email || '')}">${escapeHtml(order.customer_email || '(no email)')}</a></p>
    <p style="margin:0 0 4px;"><strong>Send to:</strong></p>
    <p style="white-space:pre-line;border-left:3px solid #EAC066;padding-left:12px;margin:0 0 16px;">${escapeHtml(order.shipping_address || '(no address)')}</p>
    <table style="width:100%;border-collapse:collapse;font-size:0.95rem;">${rows}
      <tr><td style="padding:4px 12px 4px 0;">Postage</td><td style="padding:4px 0;text-align:right;">${money(order.shipping_cents || 0)}</td></tr>
      <tr><td style="padding:8px 12px 4px 0;border-top:1px solid #d9dfeb;"><strong>Total paid</strong></td><td style="padding:8px 0 4px;border-top:1px solid #d9dfeb;text-align:right;"><strong>${money(order.total_cents)}</strong></td></tr>
    </table>
    <p style="color:#6b7a99;font-size:0.82rem;margin-top:18px;">Order ${escapeHtml(order.id)} · ${order.parent_id === 'guest' ? 'guest checkout' : 'signed-in parent'} · paid via Stripe</p>
  </div>`;
  const count = items.reduce((n, it) => n + it.qty, 0);
  return sendEmail(to, `New order: ${count} item${count === 1 ? '' : 's'} for ${order.customer_name || 'a customer'}`, html, { kind: 'order_notification' });
}

module.exports = {
  sendOrderNotification,
  sendEmail,
  sendWelcomeParentEmail,
  sendWelcomeTeacherEmail,
  sendPasswordResetEmail,
  sendBroadcastEmail,
  sendTeacherSignupRequestNotification,
  sendTeacherQuestionNotification,
};
