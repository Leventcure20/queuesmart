const queueRepository = require('./queue.repository');
const servicesRepository = require('../services/services.repository');
const { ROLES } = require('../auth/roles');

function list(_req, res) {
  return res.json({ tickets: queueRepository.list() });
}

function join(req, res) {
  const service = servicesRepository.findById(req.body.serviceId);
  if (!service) return res.status(404).json({ error: 'Service not found' });

  const ticket = queueRepository.join({
    userId: req.user.id,
    customerName: req.user.name,
    service,
  });
  return res.status(201).json({ ticket });
}

function leave(req, res) {
  const existing = queueRepository.findById(req.params.ticketId);
  if (!existing) return res.status(404).json({ error: 'Ticket not found' });
  if (existing.userId !== req.user.id && req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ error: 'You can only leave your own ticket' });
  }
  const ticket = queueRepository.leave(req.params.ticketId);
  if (ticket.cannotLeave) {
    return res.status(409).json({ error: 'Only waiting tickets can leave the queue' });
  }
  return res.json({ ticket });
}

module.exports = { list, join, leave };
