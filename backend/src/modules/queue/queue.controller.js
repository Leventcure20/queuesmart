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
  const remainingMs =
    !service || position === null || !Number.isFinite(scheduledStartAt)
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

function isPromise(value) {
  return value && typeof value.then === 'function';
}

function thenMaybe(value, callback) {
  return isPromise(value) ? value.then(callback) : callback(value);
}

function eachMaybe(values, callback) {
  let chain;
  for (const value of values) {
    if (chain) {
      chain = chain.then(() => callback(value));
    } else {
      const result = callback(value);
      if (isPromise(result)) chain = result;
    }
  }
  return chain;
}

function safely(next, callback) {
  try {
    const result = callback();
    return isPromise(result) ? result.catch(next) : result;
  } catch (error) {
    return next(error);
  }
}

function syncQueueProgress() {
  let chain;
  for (const service of servicesRepository.list()) {
    const advance = () => thenMaybe(
      queueRepository.advanceService(service.id, service.expectedDuration),
      (transitions) => eachMaybe(transitions.started, (ticket) =>
        notificationsRepository.create({
          userId: ticket.userId,
          ticket,
          type: 'your_turn',
          title: 'It’s your turn',
          message: `Ticket ${ticket.number} for ${ticket.serviceName} is now being served.`,
        })
      )
    );
    if (chain) chain = chain.then(advance);
    else {
      const result = advance();
      if (isPromise(result)) chain = result;
    }
  }
  return chain;
}

function syncCloseNotifications() {
  return eachMaybe(queueRepository.list(), (ticket) => {
    if (ticket.status !== 'waiting') return null;
    const enriched = withWaitEstimate(ticket);
    if (
      enriched.estimatedWaitMinutes === null ||
      enriched.estimatedWaitMinutes > CLOSE_NOTIFICATION_MINUTES
    ) return null;
    return notificationsRepository.create({
      userId: ticket.userId,
      ticket,
      type: 'almost_ready',
      title: 'You’re almost up',
      message: `Ticket ${ticket.number} is about ${formatWait(enriched.estimatedWaitSeconds)} from being served.`,
    });
  });
}

function afterQueueSync(next, callback) {
  return safely(next, () => thenMaybe(syncQueueProgress(), () =>
    thenMaybe(syncCloseNotifications(), callback)
  ));
}

function list(_req, res, next) {
  return afterQueueSync(next, () =>
    res.json({ tickets: queueRepository.list().map(withWaitEstimate) })
  );
}

function listQueues(_req, res) {
  return res.json({ queues: queueRepository.listQueues() });
}

function updateQueueStatus(req, res, next) {
  return safely(next, () => thenMaybe(
    queueRepository.updateQueueStatus(req.params.queueId, req.body.status),
    (queue) => queue
      ? res.json({ queue })
      : res.status(404).json({ error: 'Queue not found' })
  ));
}

function listMine(req, res, next) {
  return afterQueueSync(next, () => {
    const tickets = queueRepository
      .list()
      .filter((ticket) => ticket.userId === req.user.id)
      .map(withWaitEstimate);
    return res.json({ tickets });
  });
}

function get(req, res, next) {
  return afterQueueSync(next, () => {
    const ticket = queueRepository.findById(req.params.ticketId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.userId !== req.user.id && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({ error: 'You can only view your own ticket' });
    }
    return res.json({ ticket: withWaitEstimate(ticket) });
  });
}

function join(req, res, next) {
  const service = servicesRepository.findById(req.body.serviceId);
  if (!service) return res.status(404).json({ error: 'Service not found' });
  if (queueRepository.queueStatusForService(service.id) !== 'open') {
    return res.status(409).json({ error: 'This queue is closed and is not accepting new tickets' });
  }

  return safely(next, () => thenMaybe(
    queueRepository.join({ userId: req.user.id, customerName: req.user.name, service }),
    (ticket) => thenMaybe(
      notificationsRepository.create({
        userId: req.user.id,
        ticket,
        type: 'joined',
        title: 'You joined the queue',
        message: `Ticket ${ticket.number} for ${ticket.serviceName} is in the queue.`,
      }),
      () => thenMaybe(syncQueueProgress(), () => thenMaybe(syncCloseNotifications(), () =>
        res.status(201).json({ ticket: withWaitEstimate(queueRepository.findById(ticket.id)) })
      ))
    )
  ));
}

function listNotifications(req, res, next) {
  return afterQueueSync(next, () => thenMaybe(
    notificationsRepository.listForUser(req.user.id),
    (notifications) => res.json({ notifications })
  ));
}

function markNotificationsViewed(req, res, next) {
  return safely(next, () => thenMaybe(
    notificationsRepository.markAllViewed(req.user.id),
    (notifications) => res.json({ notifications })
  ));
}

function leave(req, res, next) {
  return safely(next, () => thenMaybe(syncQueueProgress(), () => {
    const existing = queueRepository.findById(req.params.ticketId);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });
    if (existing.userId !== req.user.id && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({ error: 'You can only leave your own ticket' });
    }
    const removedByAdmin = req.user.role === ROLES.ADMIN && existing.userId !== req.user.id;
    return thenMaybe(queueRepository.leave(req.params.ticketId, removedByAdmin ? 'removed' : 'left'), (ticket) => {
      if (ticket.cannotLeave) {
        return res.status(409).json({ error: 'Only active tickets can leave the queue' });
      }
      return thenMaybe(notificationsRepository.create({
        userId: existing.userId,
        ticket,
        type: 'removed',
        title: removedByAdmin ? 'You were removed from the queue' : 'You left the queue',
        message: removedByAdmin
          ? `An administrator removed ticket ${ticket.number} for ${ticket.serviceName} from the queue.`
          : `Ticket ${ticket.number} for ${ticket.serviceName} has left the queue.`,
      }), () => thenMaybe(syncQueueProgress(), () => thenMaybe(syncCloseNotifications(), () =>
        res.json({ ticket: withWaitEstimate(ticket) })
      )));
    });
  }));
}

function serveNext(req, res, next) {
  const service = servicesRepository.findById(req.body.serviceId);
  if (!service) return res.status(404).json({ error: 'Service not found' });

  return safely(next, () => thenMaybe(syncQueueProgress(), () => thenMaybe(
    queueRepository.serveNext(service.id, service.expectedDuration),
    (result) => {
      if (!result) return res.status(404).json({ error: 'No active ticket to serve next' });
      return thenMaybe(eachMaybe(result.started, (ticket) => notificationsRepository.create({
        userId: ticket.userId,
        ticket,
        type: 'your_turn',
        title: 'It’s your turn',
        message: `Ticket ${ticket.number} for ${ticket.serviceName} is now being served.`,
      })), () => thenMaybe(syncCloseNotifications(), () => res.json({
        completed: withWaitEstimate(result.completed),
        next: result.next ? withWaitEstimate(result.next) : null,
      })));
    }
  )));
}

module.exports = {
  list,
  listQueues,
  updateQueueStatus,
  listMine,
  listNotifications,
  markNotificationsViewed,
  get,
  join,
  leave,
  serveNext,
};
