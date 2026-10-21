const { randomUUID, randomBytes } = require('crypto');
const { hashPassword, verifyPassword } = require('./password');
const { ROLES } = require('./roles');

// Temporary account and session storage. Both reset when the server restarts.
const users = new Map();
const usersByEmail = new Map();
const sessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

async function createUser({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (usersByEmail.has(normalizedEmail)) return null;
  const passwordHash = await hashPassword(password);
  // Recheck after hashing so concurrent registrations cannot create duplicates.
  if (usersByEmail.has(normalizedEmail)) return null;
  const user = {
    id: randomUUID(), name, email: normalizedEmail,
    passwordHash, role: ROLES.USER,
  };
  users.set(user.id, user);
  usersByEmail.set(normalizedEmail, user.id);
  return publicUser(user);
}

async function authenticate(email, password) {
  const userId = usersByEmail.get(normalizeEmail(email));
  const user = userId && users.get(userId);
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
  return publicUser(user);
}

function createSession(user) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { userId: user.id, expiresAt });
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

function revokeSession(token) {
  return sessions.delete(token);
}

function findUserByToken(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = users.get(session.userId);
  return user ? publicUser(user) : null;
}

async function initializeAdmin({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (!name || !normalizedEmail || !password || usersByEmail.has(normalizedEmail)) return;
  const user = {
    id: randomUUID(), name, email: normalizedEmail,
    passwordHash: await hashPassword(password), role: ROLES.ADMIN,
  };
  users.set(user.id, user);
  usersByEmail.set(user.email, user.id);
  console.info(`Administrator account configured for ${normalizedEmail}`);
}

module.exports = { createUser, authenticate, createSession, revokeSession, findUserByToken, initializeAdmin };
