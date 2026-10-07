const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

async function hashPassword(password) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  console.info('Password hash generated with bcrypt.');
  return passwordHash;
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

module.exports = { hashPassword, verifyPassword };
