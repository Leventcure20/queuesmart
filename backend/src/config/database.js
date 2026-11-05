const { Pool } = require('pg');

// Do not load .env here: unit tests intentionally use isolated in-memory auth
// storage. The server loads dotenv before it imports this module.
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

async function connect() {
  if (!pool) throw new Error('DATABASE_URL must be configured to start QueueSmart');
  await pool.query('SELECT 1');
}

module.exports = { pool, connect };
