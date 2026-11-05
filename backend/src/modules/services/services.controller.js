const servicesRepository = require('./services.repository');
const queueRepository = require('../queue/queue.repository');

function respond(result, next, onSuccess) {
  if (result && typeof result.then === 'function') return result.then(onSuccess).catch(next);
  try {
    return onSuccess(result);
  } catch (error) {
    return next(error);
  }
}

function list(_req, res, next) {
  return respond(servicesRepository.list(), next, (services) => res.json({ services }));
}

function create(req, res, next) {
  const { name, description, expectedDuration, priorityLevel } = req.body;
  return respond(
    servicesRepository.create({ name, description, expectedDuration, priorityLevel }),
    next,
    (service) => res.status(201).json({ service })
  );
}

function update(req, res, next) {
  return respond(servicesRepository.update(req.params.id, req.body), next, (service) => {
    if (!service) return res.status(404).json({ error: 'Service not found' });
    return res.json({ service });
  });
}

function remove(req, res, next) {
  const service = servicesRepository.findById(req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found' });

  const hasActiveTickets = queueRepository.list().some((ticket) =>
    ticket.serviceId === service.id && ['waiting', 'serving'].includes(ticket.status)
  );
  if (hasActiveTickets) {
    return res.status(409).json({ error: 'This service has active queue tickets. Clear the queue before deleting it.' });
  }

  return respond(servicesRepository.remove(req.params.id), next, () => res.json({ service }));
}

module.exports = { list, create, update, remove };
