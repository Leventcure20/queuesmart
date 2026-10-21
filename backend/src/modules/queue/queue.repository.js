const { randomUUID } = require('crypto');

// Temporary in-memory queue tickets. Replace with database storage later.
const tickets = new Map();
let nextTicketNumber = 1;

function list() {
  return Array.from(tickets.values());
}

function findById(id) {
  return tickets.get(id) || null;
}

function getPosition(id) {
  const ticket = tickets.get(id);
  if (!ticket || ticket.status !== 'waiting') return null;

  const waitingForService = Array.from(tickets.values()).filter((candidate) =>
    candidate.serviceId === ticket.serviceId && candidate.status === 'waiting'
  );
  return waitingForService.findIndex((candidate) => candidate.id === id) + 1;
}

function join({ userId, customerName, service }) {
  const now = new Date().toISOString();
  const ticket = {
    id: randomUUID(),
    number: `Q${String(nextTicketNumber++).padStart(3, '0')}`,
    customerName,
    userId,
    serviceId: service.id,
    serviceName: service.name,
    status: 'waiting',
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  tickets.set(ticket.id, ticket);
  return ticket;
}

function leave(id) {
  const ticket = tickets.get(id);
  if (!ticket) return null;
  if (ticket.status !== 'waiting') return { ...ticket, cannotLeave: true };

  const updated = {
    ...ticket,
    status: 'cancelled',
    leftAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  tickets.set(id, updated);
  return updated;
}

module.exports = { list, findById, getPosition, join, leave };
