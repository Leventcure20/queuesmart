const { randomUUID } = require('crypto');

// Temporary in-memory storage. Replace with a database-backed repository later.
const services = new Map();

function list() {
  return Array.from(services.values());
}

function create(data) {
  const now = new Date().toISOString();
  const service = { id: randomUUID(), ...data, createdAt: now, updatedAt: now };
  services.set(service.id, service);
  return service;
}

function update(id, changes) {
  const current = services.get(id);
  if (!current) return null;

  const service = { ...current, ...changes, updatedAt: new Date().toISOString() };
  services.set(id, service);
  return service;
}

module.exports = { list, create, update };
