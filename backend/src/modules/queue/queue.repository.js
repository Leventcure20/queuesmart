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
  if (!ticket || !['waiting', 'serving'].includes(ticket.status)) return null;

  const activeForService = Array.from(tickets.values()).filter((candidate) =>
    candidate.serviceId === ticket.serviceId && ['waiting', 'serving'].includes(candidate.status)
  );
  return activeForService.findIndex((candidate) => candidate.id === id) + 1;
}

function advanceService(serviceId, expectedDurationMinutes, now = Date.now()) {
  const durationMs = expectedDurationMinutes * 60_000;
  const serviceTickets = Array.from(tickets.values())
    .filter((ticket) => ticket.serviceId === serviceId)
    .sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt));
  const started = [];
  const served = [];
  let previousEndAt = null;

  for (const ticket of serviceTickets) {
    if (ticket.status === 'cancelled') continue;
    if (ticket.status === 'served') {
      const servedAt = Date.parse(ticket.servedAt);
      if (Number.isFinite(servedAt)) previousEndAt = servedAt;
      continue;
    }

    const joinedAt = Date.parse(ticket.joinedAt);
    const scheduledStartAt = Math.max(joinedAt, previousEndAt ?? joinedAt);
    const scheduledEndAt = scheduledStartAt + durationMs;
    const previousStatus = ticket.status;
    const updates = {
      ...ticket,
      scheduledStartAt: new Date(scheduledStartAt).toISOString(),
      updatedAt: ticket.updatedAt,
    };

    if (now >= scheduledEndAt) {
      updates.status = 'served';
      updates.serviceStartedAt = new Date(scheduledStartAt).toISOString();
      updates.servedAt = new Date(scheduledEndAt).toISOString();
      updates.updatedAt = new Date(now).toISOString();
      if (previousStatus !== 'served') {
        served.push(updates);
        if (previousStatus === 'waiting') started.push(updates);
      }
      tickets.set(ticket.id, updates);
    } else if (now >= scheduledStartAt) {
      updates.status = 'serving';
      updates.serviceStartedAt = new Date(scheduledStartAt).toISOString();
      updates.servedAt = null;
      if (previousStatus !== 'serving') {
        updates.updatedAt = new Date(now).toISOString();
        if (previousStatus === 'waiting') started.push(updates);
      }
      tickets.set(ticket.id, updates);
    } else {
      updates.status = 'waiting';
      updates.serviceStartedAt = null;
      updates.servedAt = null;
      if (previousStatus !== 'waiting' || ticket.scheduledStartAt !== updates.scheduledStartAt) {
        updates.updatedAt = new Date(now).toISOString();
      }
      tickets.set(ticket.id, updates);
    }

    previousEndAt = scheduledEndAt;
  }

  return { started, served };
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

module.exports = { list, findById, getPosition, advanceService, join, leave };
