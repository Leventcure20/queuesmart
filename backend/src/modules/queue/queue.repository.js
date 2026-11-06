const { randomUUID } = require("crypto");
const { pool } = require("../../config/database");

const tickets = new Map();
let nextTicketNumber = 1;

function iso(value) {
  return value == null ? null : new Date(value).toISOString();
}

function fromRow(row) {
  return {
    id: row.id,
    number: row.number,
    customerName: row.customer_name,
    userId: row.user_id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    status: row.status,
    joinedAt: iso(row.joined_at),
    scheduledStartAt: iso(row.scheduled_start_at),
    serviceStartedAt: iso(row.service_started_at),
    servedAt: iso(row.served_at),
    cancellationReason: row.cancellation_reason,
    leftAt: iso(row.left_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function initialize() {
  if (!pool) return;
  const result = await pool.query(
    `SELECT id, number, customer_name, user_id, service_id, service_name,
            status, joined_at, scheduled_start_at, service_started_at,
            served_at, cancellation_reason, left_at, created_at, updated_at
     FROM "QueueTickets" ORDER BY joined_at, id`
  );
  tickets.clear();
  for (const row of result.rows) tickets.set(row.id, fromRow(row));
}

function list() {
  return Array.from(tickets.values());
}

function findById(id) {
  return tickets.get(id) || null;
}

function getPosition(id) {
  const ticket = tickets.get(id);
  if (!ticket || !["waiting", "serving"].includes(ticket.status)) return null;

  const activeForService = Array.from(tickets.values()).filter(
    (candidate) =>
      candidate.serviceId === ticket.serviceId &&
      ["waiting", "serving"].includes(candidate.status),
  );
  return activeForService.findIndex((candidate) => candidate.id === id) + 1;
}

function persistTicket(ticket) {
  return pool.query(
    `UPDATE "QueueTickets" SET
       number = $2, customer_name = $3, user_id = $4, service_id = $5,
       service_name = $6, status = $7, joined_at = $8, scheduled_start_at = $9,
       service_started_at = $10, served_at = $11, cancellation_reason = $12,
       left_at = $13, created_at = $14, updated_at = $15
     WHERE id = $1`,
    [
      ticket.id, ticket.number, ticket.customerName, ticket.userId,
      ticket.serviceId, ticket.serviceName, ticket.status, ticket.joinedAt,
      ticket.scheduledStartAt || null, ticket.serviceStartedAt || null,
      ticket.servedAt || null, ticket.cancellationReason || null,
      ticket.leftAt || null, ticket.createdAt, ticket.updatedAt,
    ]
  );
}

function persistChanged(changed, result) {
  if (!pool || !changed.length) return result;
  return Promise.all(changed.map(persistTicket)).then(() => result);
}

function advanceService(serviceId, expectedDurationMinutes, now = Date.now()) {
  const durationMs = expectedDurationMinutes * 60_000;
  const serviceTickets = Array.from(tickets.values())
    .filter((ticket) => ticket.serviceId === serviceId)
    .sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt));
  const started = [];
  const served = [];
  const changed = [];
  let previousEndAt = null;

  for (const ticket of serviceTickets) {
    if (ticket.status === "cancelled") {
      const startedAt = Date.parse(ticket.serviceStartedAt);
      const leftAt = Date.parse(ticket.leftAt);
      if (Number.isFinite(startedAt) && Number.isFinite(leftAt)) {
        previousEndAt = Math.max(previousEndAt ?? leftAt, leftAt);
      }
      continue;
    }
    if (ticket.status === "served") {
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
      updates.status = "served";
      updates.serviceStartedAt = new Date(scheduledStartAt).toISOString();
      updates.servedAt = new Date(scheduledEndAt).toISOString();
      updates.updatedAt = new Date(now).toISOString();
      if (previousStatus !== "served") {
        served.push(updates);
        if (previousStatus === "waiting") started.push(updates);
      }
    } else if (now >= scheduledStartAt) {
      updates.status = "serving";
      updates.serviceStartedAt = new Date(scheduledStartAt).toISOString();
      updates.servedAt = null;
      if (previousStatus !== "serving") {
        updates.updatedAt = new Date(now).toISOString();
        if (previousStatus === "waiting") started.push(updates);
      }
    } else {
      updates.status = "waiting";
      updates.serviceStartedAt = null;
      updates.servedAt = null;
      if (
        previousStatus !== "waiting" ||
        ticket.scheduledStartAt !== updates.scheduledStartAt
      ) {
        updates.updatedAt = new Date(now).toISOString();
      }
    }

    tickets.set(ticket.id, updates);
    changed.push(updates);
    previousEndAt = scheduledEndAt;
  }

  return persistChanged(changed, { started, served });
}

function join({ userId, customerName, service }) {
  if (pool) {
    const id = randomUUID();
    return pool.query(
      `WITH next_number AS (
         SELECT 'Q' || LPAD(nextval('queue_ticket_number_seq')::text, 3, '0') AS number
       )
       INSERT INTO "QueueTickets"
         (id, number, customer_name, user_id, service_id, service_name, status)
       SELECT $1, next_number.number, $2, $3, $4, $5, 'waiting'
       FROM next_number
       RETURNING id, number, customer_name, user_id, service_id, service_name,
                 status, joined_at, scheduled_start_at, service_started_at,
                 served_at, cancellation_reason, left_at, created_at, updated_at`,
      [id, customerName, userId, service.id, service.name]
    ).then((result) => {
      const ticket = fromRow(result.rows[0]);
      tickets.set(ticket.id, ticket);
      return ticket;
    });
  }

  const now = new Date().toISOString();
  const ticket = {
    id: randomUUID(),
    number: `Q${String(nextTicketNumber++).padStart(3, "0")}`,
    customerName,
    userId,
    serviceId: service.id,
    serviceName: service.name,
    status: "waiting",
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  tickets.set(ticket.id, ticket);
  return ticket;
}

function leave(id, reason = "left") {
  const ticket = tickets.get(id);
  if (!ticket) return null;
  if (!["waiting", "serving"].includes(ticket.status))
    return { ...ticket, cannotLeave: true };

  const now = new Date().toISOString();
  const updated = {
    ...ticket,
    status: "cancelled",
    cancellationReason: reason,
    leftAt: now,
    updatedAt: now,
  };
  tickets.set(id, updated);
  return pool ? persistTicket(updated).then(() => updated) : updated;
}

function afterMaybe(value, callback) {
  return value && typeof value.then === "function" ? value.then(callback) : callback(value);
}

function serveNext(serviceID, expectedDurationMinutes, now = Date.now()) {
  const finish = () => {
    const active = list().filter(
      (ticket) => ticket.serviceId === serviceID && ["waiting", "serving"].includes(ticket.status),
    );
    const current = active.find((ticket) => ticket.status === "serving");
    if (!current) return null;

    const timestamp = new Date().toISOString();
    const completed = { ...current, status: "served", servedAt: timestamp, updatedAt: timestamp };
    tickets.set(current.id, completed);

    const finishSuccessor = () => afterMaybe(
      advanceService(serviceID, expectedDurationMinutes, now),
      (transition) => {
        const next = list().find(
          (ticket) => ticket.serviceId === serviceID && ticket.status === "serving",
        ) || null;
        return { completed, next, started: transition.started };
      }
    );
    return pool ? persistTicket(completed).then(finishSuccessor) : finishSuccessor();
  };

  return afterMaybe(advanceService(serviceID, expectedDurationMinutes, now), finish);
}

module.exports = {
  initialize,
  list,
  findById,
  getPosition,
  advanceService,
  join,
  leave,
  serveNext,
};
