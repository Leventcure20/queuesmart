const servicesRepository = require('./services.repository');

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

module.exports = { list, create, update };
