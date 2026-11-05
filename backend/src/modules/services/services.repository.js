const { randomUUID } = require('crypto');
const { pool } = require('../../config/database');

// Services are cached for synchronous queue calculations and written through to PostgreSQL.
const services = new Map();

const demoServices = [
  {
    id: 'S-01',
    name: 'General Inquiry',
    description: 'Questions and account support',
    expectedDuration: 8,
    priorityLevel: 'medium',
  },
  {
    id: 'S-02',
    name: 'Billing & Payments',
    description: 'Payments, invoices, and refunds',
    expectedDuration: 12,
    priorityLevel: 'medium',
  },
  {
    id: 'S-03',
    name: 'Technical Support',
    description: 'Product and technical help',
    expectedDuration: 20,
    priorityLevel: 'high',
  },
];

for (const service of demoServices) {
  const now = new Date().toISOString();
  services.set(service.id, { ...service, createdAt: now, updatedAt: now });
}

function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    expectedDuration: row.expected_duration,
    priorityLevel: row.priority_level,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function initialize() {
  if (!pool) return;
  const result = await pool.query(
    `SELECT id, name, description, expected_duration, priority_level, created_at, updated_at
     FROM "Service" ORDER BY created_at, id`
  );
  services.clear();
  for (const row of result.rows) {
    const service = fromRow(row);
    services.set(service.id, service);
  }
}

function list() {
  return Array.from(services.values());
}

function findById(id) {
  return services.get(id) || null;
}

function create(data) {
  if (pool) {
    const id = randomUUID();
    return pool.query(
      `INSERT INTO "Service" (id, name, description, expected_duration, priority_level)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, expected_duration, priority_level, created_at, updated_at`,
      [id, data.name, data.description, data.expectedDuration, data.priorityLevel]
    ).then((result) => {
      const service = fromRow(result.rows[0]);
      services.set(service.id, service);
      return service;
    });
  }
  const now = new Date().toISOString();
  const service = { id: randomUUID(), ...data, createdAt: now, updatedAt: now };
  services.set(service.id, service);
  return service;
}

function update(id, changes) {
  if (pool) {
    const columns = {
      name: 'name',
      description: 'description',
      expectedDuration: 'expected_duration',
      priorityLevel: 'priority_level',
    };
    const editableChanges = Object.entries(changes)
      .filter(([field]) => Object.hasOwn(columns, field));
    if (!editableChanges.length) return Promise.resolve(findById(id));
    const values = editableChanges.map(([, value]) => value);
    const assignments = editableChanges.map(([field], index) => `${columns[field]} = $${index + 1}`);
    values.push(id);
    return pool.query(
      `UPDATE "Service" SET ${assignments.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, name, description, expected_duration, priority_level, created_at, updated_at`,
      values
    ).then((result) => {
      if (!result.rows[0]) return null;
      const service = fromRow(result.rows[0]);
      services.set(service.id, service);
      return service;
    });
  }
  const current = services.get(id);
  if (!current) return null;

  const editableChanges = Object.fromEntries(
    ['name', 'description', 'expectedDuration', 'priorityLevel']
      .filter((field) => Object.hasOwn(changes, field))
      .map((field) => [field, changes[field]])
  );
  const service = { ...current, ...editableChanges, updatedAt: new Date().toISOString() };
  services.set(id, service);
  return service;
}

function remove(id) {
  if (pool) {
    return pool.query('DELETE FROM "Service" WHERE id = $1 RETURNING id', [id])
      .then((result) => {
        if (!result.rowCount) return false;
        services.delete(id);
        return true;
      });
  }
  return services.delete(id);
}

module.exports = { initialize, list, findById, create, update, remove };
