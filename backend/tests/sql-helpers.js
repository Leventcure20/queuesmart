const assert = require('node:assert/strict');
const { freshModule } = require('./helpers');

function environment(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}

// Script the database boundary, not a second implementation of PostgreSQL.
// Unexpected SQL, transaction ordering, or extra/missing calls fail the test.
function database(t, steps) {
  const pending = [...steps];
  const calls = [];
  const query = t.mock.fn(async (sql, values) => {
    calls.push({ sql, values });
    assert.ok(pending.length, `Unexpected query: ${sql}`);
    const [pattern, result = { rows: [], rowCount: 0 }] = pending.shift();
    assert.match(sql, pattern);
    if (result instanceof Error) throw result;
    return result;
  });
  const release = t.mock.fn();
  const client = { query, release };
  const pool = { query, connect: t.mock.fn(async () => client) };
  t.after(() => assert.equal(pending.length, 0, 'Expected SQL was not executed'));
  return { pool, client, calls, release };
}

const rows = (...items) => ({ rows: items, rowCount: items.length });
const password = { hashPassword: async (value) => `hash:${value}`, verifyPassword: async (value, hash) => hash === `hash:${value}` };

function repository(name, pool) {
  return freshModule(`src/modules/${name}`, {
    'src/config/database.js': { pool },
    'src/modules/auth/password.js': password,
  });
}

module.exports = { environment, database, rows, repository, password };
