const queueRepository = require('./queue.repository');
const notificationsRepository = require('./notifications.repository');
const servicesRepository = require('../services/services.repository');
const { ROLES } = require('../auth/roles');

const CLOSE_NOTIFICATION_MINUTES = 5;

function formatWait(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes
    ? `${minutes} minute${minutes === 1 ? '' : 's'} ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'}`
    : `${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'}`;
}

function withWaitEstimate(ticket) {
  const position = queueRepository.getPosition(ticket.id);
  const service = servicesRepository.findById(ticket.serviceId);
  const scheduledStartAt = ticket.scheduledStartAt && Date.parse(ticket.scheduledStartAt);
  const remainingMs = !service || position === null || !Number.isFinite(scheduledStartAt)
    ? null
    : ticket.status === 'serving'
      ? 0
      : Math.max(0, scheduledStartAt - Date.now());
  return {
    ...ticket,
    position,
    estimatedWaitSeconds: remainingMs === null ? null : Math.ceil(remainingMs / 1000),
    estimatedWaitMinutes: remainingMs === null ? null : Math.ceil(remainingMs / 1000) / 60,
  };
}

function notifyStarted(tickets) {
  for (const ticket of tickets) {
    notificationsRepository.create({
      userId: ticket.userId,
      ticket,
      type: 'your_turn',
      title: 'It’s your turn',
      message: `Ticket ${ticket.number} for ${ticket.serviceName} is now being served.`,
    });
  }
}

function syncQueueProgress() {
  for (const service of servicesRepository.list()) {
    const transitions = queueRepository.advanceService(service.id, service.expectedDuration);
    notifyStarted(transitions.started);
  }
}

function syncCloseNotifications() {
  for (const ticket of queueRepository.list()) {
    if (ticket.status !== 'waiting') continue;
    const enriched = withWaitEstimate(ticket);
    if (enriched.estimatedWaitMinutes !== null && enriched.estimatedWaitMinutes <= CLOSE_NOTIFICATION_MINUTES) {
      notificationsRepository.create({
        userId: ticket.userId,
        ticket,
        type: 'almost_ready',
        title: 'You’re almost up',
        message: `Ticket ${ticket.number} is about ${formatWait(enriched.estimatedWaitSeconds)} from being served.`,
      });
    }
  }
}

function list(_req, res) {
  syncQueueProgress();
  syncCloseNotifications();
  return res.json({ tickets: queueRepository.list().map(withWaitEstimate) });
}

function listMine(req, res) {
  syncQueueProgress();
  syncCloseNotifications();
  const tickets = queueRepository.list()
    .filter((ticket) => ticket.userId === req.user.id)
    .map(withWaitEstimate);
  return res.json({ tickets });
}

function get(req, res) {
  syncQueueProgress();
  syncCloseNotifications();
  const ticket = queueRepository.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  if (ticket.userId !== req.user.id && req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ error: 'You can only view your own ticket' });
  }
  return res.json({ ticket: withWaitEstimate(ticket) });
}

function join(req, res) {
  const service = servicesRepository.findById(req.body.serviceId);
  if (!service) return res.status(404).json({ error: 'Service not found' });

  const ticket = queueRepository.join({
    userId: req.user.id,
    customerName: req.user.name,
    service,
  });
  notificationsRepository.create({
    userId: req.user.id,
    ticket,
    type: 'joined',
    title: 'You joined the queue',
    message: `Ticket ${ticket.number} for ${ticket.serviceName} is in the queue.`,
  });
  syncQueueProgress();
  syncCloseNotifications();
  return res.status(201).json({ ticket: withWaitEstimate(queueRepository.findById(ticket.id)) });
}

function listNotifications(req, res) {
  syncQueueProgress();
  syncCloseNotifications();
  return res.json({ notifications: notificationsRepository.listForUser(req.user.id) });
}

function leave(req, res) {
  syncQueueProgress();
  const existing = queueRepository.findById(req.params.ticketId);
  if (!existing) return res.status(404).json({ error: 'Ticket not found' });
  if (existing.userId !== req.user.id && req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ error: 'You can only leave your own ticket' });
  }
  const removedByAdmin = req.user.role === ROLES.ADMIN && existing.userId !== req.user.id;
  const ticket = queueRepository.leave(req.params.ticketId, removedByAdmin ? 'removed' : 'left');
  if (ticket.cannotLeave) {
    return res.status(409).json({ error: 'Only active tickets can leave the queue' });
  }
  notificationsRepository.create({
    userId: existing.userId,
    ticket,
    type: 'removed',
    title: removedByAdmin ? 'You were removed from the queue' : 'You left the queue',
    message: removedByAdmin
      ? `An administrator removed ticket ${ticket.number} for ${ticket.serviceName} from the queue.`
      : `Ticket ${ticket.number} for ${ticket.serviceName} has left the queue.`,
  });
  syncQueueProgress();
  syncCloseNotifications();
  return res.json({ ticket: withWaitEstimate(ticket) });
}

// Administrators can finish the current ticket early without disabling the
// existing time-based scheduler. The repository synchronizes both transitions.
function serveNext(req, res) {
  const service = servicesRepository.findById(req.params.serviceId);
  if (!service) return res.status(404).json({ error: 'Service not found' });

  // Do not call syncQueueProgress() first: the repository must distinguish a
  // still-serving ticket from one whose expected time has already elapsed.
  const result = queueRepository.serveNext(service.id, service.expectedDuration);
  notifyStarted(result.started);
  syncCloseNotifications();

  if (!result.ticket) {
    return res.status(409).json({ error: 'No currently serving ticket to complete' });
  }

  const next = queueRepository.list().find((ticket) =>
    ticket.serviceId === service.id && ticket.status === 'serving'
  );
  return res.json({
    ticket: withWaitEstimate(result.ticket),
    nextTicket: next ? withWaitEstimate(next) : null,
  });
}

module.exports = { list, listMine, listNotifications, get, join, leave, serveNext };
