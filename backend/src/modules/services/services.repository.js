const { randomUUID } = require('crypto');

// Temporary in-memory storage. Replace with a database-backed repository later.
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

function list() {
  return Array.from(services.values());
}

function findById(id) {
  return services.get(id) || null;
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

function remove(id) {
  return services.delete(id);
}

module.exports = { list, findById, create, update, remove };
