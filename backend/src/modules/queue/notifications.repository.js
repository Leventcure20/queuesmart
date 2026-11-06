const { randomUUID } = require('crypto');
const { pool } = require('../../config/database');

const notificationsByUser = new Map();
const notificationKeys = new Set();

function fromRow(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    ticketNumber: row.ticket_number,
    serviceName: row.service_name,
    type: row.type,
    title: row.title,
    message: row.message,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function create({ userId, ticket, type, title, message }) {
  const key = `${ticket.id}:${type}`;
  if (!pool) {
    if (notificationKeys.has(key)) return null;

    const notification = {
      id: randomUUID(),
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      serviceName: ticket.serviceName,
      type,
      title,
      message,
      createdAt: new Date().toISOString(),
    };
    const userNotifications = notificationsByUser.get(userId) || [];
    userNotifications.unshift(notification);
    notificationsByUser.set(userId, userNotifications);
    notificationKeys.add(key);
    return notification;
  }

  return pool.query(
    `INSERT INTO "QueueNotifications"
       (id, ticket_id, user_id, ticket_number, service_name, type, title, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (ticket_id, type) DO NOTHING
     RETURNING id, ticket_id, ticket_number, service_name, type, title, message, created_at`,
    [randomUUID(), ticket.id, userId, ticket.number, ticket.serviceName, type, title, message]
  ).then((result) => result.rows[0] ? fromRow(result.rows[0]) : null);
}

function listForUser(userId) {
  if (pool) {
    return pool.query(
      `SELECT id, ticket_id, ticket_number, service_name, type, title, message, created_at
       FROM "QueueNotifications" WHERE user_id = $1
       ORDER BY created_at DESC, id DESC`,
      [userId]
    ).then((result) => result.rows.map(fromRow));
  }
  return [...(notificationsByUser.get(userId) || [])];
}

module.exports = { create, listForUser };
