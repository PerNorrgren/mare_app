// ── auth.js — Mare companion app ──
// Same JWT-in-httpOnly-cookie pattern as per_bot, but fully separate:
// own secret, own cookie name, own user tables (parents/teachers/admins).
// No shared login with per_bot — confirmed with Per as fully separate accounts.

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const COOKIE_NAME = 'mare_session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — a parent/teacher shouldn't need to re-login constantly on a shared family device
};

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}
function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// ── Login: role is known up front from which form was submitted (parent
// signup/login, teacher login, admin login) — unlike per_bot, there's no
// single email that could belong to more than one role, so no need to
// probe every table in turn. ──
async function loginParent(email, password) {
  const parent = db.getParentByEmail(email);
  if (!parent) return null;
  const valid = await verifyPassword(password, parent.password_hash);
  if (!valid) return null;
  if (parent.status === 'suspended') return 'suspended';
  return { role: 'parent', id: parent.id, name: parent.name, email: parent.email };
}

async function loginTeacher(email, password) {
  const teacher = db.getTeacherByEmail(email);
  if (!teacher) return null;
  const valid = await verifyPassword(password, teacher.password_hash);
  if (!valid) return null;
  if (teacher.status === 'suspended') return 'suspended';
  return { role: 'teacher', id: teacher.id, name: teacher.name, email: teacher.email };
}

// Returns role as the real staff role ('admin' or 'support') straight from
// the DB row — these are two distinct top-level auth roles, not a nested
// permission flag, so requireAuth(['admin']) vs requireAuth(['admin','support'])
// on each route is what actually enforces support's reduced access.
async function loginAdmin(email, password) {
  const admin = db.getAdminByEmail(email);
  if (!admin) return null;
  const valid = await verifyPassword(password, admin.password_hash);
  if (!valid) return null;
  return { role: admin.role === 'support' ? 'support' : 'admin', id: admin.id, name: admin.name, email: admin.email };
}

// ── Middleware: require auth (redirect, for page routes) ──
function requireAuth(roles = []) {
  return (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.redirect('/login');
    const payload = verifyToken(token);
    if (!payload) return res.redirect('/login');
    if (roles.length && !roles.includes(payload.role)) return res.status(403).send('Access denied');
    req.user = payload;
    next();
  };
}

// ── Middleware: require auth (JSON error, for API routes) ──
function requireAuthApi(roles = []) {
  return (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Invalid session' });
    if (roles.length && !roles.includes(payload.role)) return res.status(403).json({ error: 'Access denied' });
    req.user = payload;
    next();
  };
}

module.exports = {
  hashPassword, verifyPassword, createToken, verifyToken,
  loginParent, loginTeacher, loginAdmin,
  requireAuth, requireAuthApi,
  COOKIE_NAME, COOKIE_OPTIONS,
};
