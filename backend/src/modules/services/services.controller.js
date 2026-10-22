const servicesRepository = require('./services.repository');
const queueRepository = require('../queue/queue.repository');

function list(_req, res) {
  return res.json({ services: servicesRepository.list() });
}

function create(req, res) {
  const { name, description, expectedDuration, priorityLevel } = req.body;
  const service = servicesRepository.create({ name, description, expectedDuration, priorityLevel });
  return res.status(201).json({ service });
}

function update(req, res) {
  const service = servicesRepository.update(req.params.id, req.body);
  if (!service) return res.status(404).json({ error: 'Service not found' });
  return res.json({ service });
}

function remove(req, res) {
  const service = servicesRepository.findById(req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found' });

  const hasActiveTickets = queueRepository.list().some((ticket) =>
    ticket.serviceId === service.id && ['waiting', 'serving'].includes(ticket.status)
  );
  if (hasActiveTickets) {
    return res.status(409).json({ error: 'This service has active queue tickets. Clear the queue before deleting it.' });
  }

  servicesRepository.remove(req.params.id);
  return res.json({ service });
}

module.exports = { list, create, update, remove };
