const { randomUUID } = require('crypto');

// Temporary in-memory notifications. They reset when the server restarts.
const notificationsByUser = new Map();
const notificationKeys = new Set();

function create({ userId, ticket, type, title, message }) {
  const key = `${ticket.id}:${type}`;
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

function listForUser(userId) {
  return [...(notificationsByUser.get(userId) || [])];
}

module.exports = { create, listForUser };
