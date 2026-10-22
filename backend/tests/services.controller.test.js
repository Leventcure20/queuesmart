const test = require('node:test');
const assert = require('node:assert/strict');
const { freshModule, createResponse } = require('./helpers');

function setup() {
  const controller = freshModule('src/modules/services/services.controller.js');
  return {
    controller,
    services: require('../src/modules/services/services.repository'),
    queue: require('../src/modules/queue/queue.repository'),
  };
}

test('services controller lists the available services', (t) => {
  const { controller, services } = setup();
  const records = [{ id: 'service-1', name: 'Support' }];
  const list = t.mock.method(services, 'list', () => records);
  const res = createResponse();

  controller.list({}, res);

  assert.equal(list.mock.callCount(), 1);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { services: records });
});

test('services controller creates a service with only the four supported input fields', (t) => {
  const { controller, services } = setup();
  const supported = {
    name: 'Support',
    description: 'Account support',
    expectedDuration: 10,
    priorityLevel: 'high',
  };
  const created = { id: 'generated-id', ...supported };
  const create = t.mock.method(services, 'create', () => created);
  const res = createResponse();

  controller.create({ body: {
    ...supported,
    id: 'client-id',
    createdAt: 'client-timestamp',
    updatedAt: 'client-timestamp',
    unexpected: 'untrusted',
  } }, res);

  assert.equal(create.mock.callCount(), 1);
  assert.deepEqual(create.mock.calls[0].arguments, [supported]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { service: created });
});

test('services controller updates an existing service and returns the stored result', (t) => {
  const { controller, services } = setup();
  const changes = { expectedDuration: 7, priorityLevel: 'low' };
  const updated = { id: 'S-01', name: 'General Inquiry', ...changes };
  const update = t.mock.method(services, 'update', () => updated);
  const res = createResponse();

  controller.update({ params: { id: 'S-01' }, body: changes }, res);

  assert.deepEqual(update.mock.calls[0].arguments, ['S-01', changes]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { service: updated });
});

test('services controller returns 404 when updating an unknown service', () => {
  const { controller, services } = setup();
  const before = services.list();
  const res = createResponse();

  controller.update({ params: { id: 'missing-service' }, body: { name: 'Missing' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Service not found' });
  assert.deepEqual(services.list(), before);
});

test('services controller returns 404 before checking the queue for an unknown deletion', (t) => {
  const { controller, services, queue } = setup();
  const list = t.mock.method(queue, 'list', () => []);
  const remove = t.mock.method(services, 'remove');
  const res = createResponse();

  controller.remove({ params: { id: 'missing-service' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Service not found' });
  assert.equal(list.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
});

for (const status of ['waiting', 'serving']) {
  test(`services controller prevents deleting a service with a ${status} ticket`, (t) => {
    const { controller, services, queue } = setup();
    const original = services.findById('S-01');
    t.mock.method(queue, 'list', () => [{ serviceId: 'S-01', status }]);
    const remove = t.mock.method(services, 'remove');
    const res = createResponse();

    controller.remove({ params: { id: 'S-01' } }, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error: 'This service has active queue tickets. Clear the queue before deleting it.',
    });
    assert.equal(remove.mock.callCount(), 0);
    assert.deepEqual(services.findById('S-01'), original);
  });
}

test('services controller deletes a service whose tickets are all inactive', (t) => {
  const { controller, services, queue } = setup();
  const original = services.findById('S-01');
  t.mock.method(queue, 'list', () => [
    { serviceId: 'S-01', status: 'served' },
    { serviceId: 'S-01', status: 'cancelled' },
    { serviceId: 'S-02', status: 'waiting' },
    { serviceId: 'S-03', status: 'serving' },
  ]);
  const res = createResponse();

  controller.remove({ params: { id: 'S-01' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { service: original });
  assert.equal(services.findById('S-01'), null);
  assert.ok(services.findById('S-02'));
});

test('services controller deletes a service with no tickets', () => {
  const { controller, services } = setup();
  const original = services.findById('S-03');
  const res = createResponse();

  controller.remove({ params: { id: 'S-03' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { service: original });
  assert.equal(services.findById('S-03'), null);
});
