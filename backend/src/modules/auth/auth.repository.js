const { randomUUID, randomBytes } = require('crypto');
const { hashPassword, verifyPassword } = require('./password');
const { ROLES } = require('./roles');
const { pool } = require('../../config/database');

// In-memory account storage is used only when tests run without DATABASE_URL.
// Production accounts live in PostgreSQL; bearer sessions remain in memory.
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

async function createDatabaseUser({ name, email, password, role }) {
  const id = randomUUID();
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO "UserCredentials" (id, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, role`,
      [id, normalizedEmail, passwordHash, role]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      'INSERT INTO "UserProfile" (user_id, full_name) VALUES ($1, $2)',
      [id, name]
    );
    await client.query('COMMIT');
    return { id, name, email: normalizedEmail, role };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createUser({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (pool) return createDatabaseUser({ name, email: normalizedEmail, password, role: ROLES.USER });
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
  if (pool) {
    const result = await pool.query(
      `SELECT credentials.id, profile.full_name AS name, credentials.email,
              credentials.password_hash, credentials.role
       FROM "UserCredentials" AS credentials
       JOIN "UserProfile" AS profile ON profile.user_id = credentials.id
       WHERE credentials.email = $1`,
      [normalizeEmail(email)]
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) return null;
    return publicUser(user);
  }
  const userId = usersByEmail.get(normalizeEmail(email));
  const user = userId && users.get(userId);
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
  return publicUser(user);
}

function createSession(user) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { user: publicUser(user), expiresAt });
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
  if (pool) return { ...session.user };
  const user = users.get(session.user.id);
  return user ? publicUser(user) : null;
}

async function initializeAdmin({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (pool) {
    if (!name || !normalizedEmail || !password) return;
    const admin = await createDatabaseUser({ name, email: normalizedEmail, password, role: ROLES.ADMIN });
    if (admin) console.info(`Administrator account configured for ${normalizedEmail}`);
    return;
  }
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
