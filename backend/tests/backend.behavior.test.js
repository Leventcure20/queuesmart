const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule, createResponse } = require('./helpers');

function queueSetup(t) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 1) });
  const controller = freshModule('src/modules/queue/queue.controller.js');
  return { controller, queue: require('../src/modules/queue/queue.repository'), services: require('../src/modules/services/services.repository'), notifications: require('../src/modules/queue/notifications.repository') };
}
const user = { id: 'user-1', name: 'Alex', role: 'user' };
function request(body = {}, params = {}) { return { body, params, user }; }

test('queue open/close controls preserve existing tickets but reject new joins until reopened', async (t) => {
  const { controller, queue } = queueSetup(t);
  const created = createResponse();
  await controller.join(request({ serviceId: 'S-01' }), created, assert.ifError);
  const record = queue.ensureQueueForService({ id: 'S-01' });
  const closed = createResponse();
  await controller.updateQueueStatus(request({ status: 'closed' }, { queueId: record.id }), closed, assert.ifError);
  assert.equal(closed.body.queue.status, 'closed');
  const rejected = createResponse();
  await controller.join(request({ serviceId: 'S-01' }), rejected, assert.ifError);
  assert.equal(rejected.statusCode, 409);
  assert.equal(queue.list().length, 1);
  assert.equal(queue.findById(created.body.ticket.id).status, 'serving');
  const listing = createResponse();
  controller.listQueues({}, listing);
  assert.equal(listing.body.queues[0].id, record.id);
  queue.updateQueueStatus(record.id, 'open');
  const accepted = createResponse();
  await controller.join(request({ serviceId: 'S-01' }), accepted, assert.ifError);
  assert.equal(accepted.statusCode, 201);
});

test('updating a missing queue returns 404', async (t) => {
  const { controller, queue } = queueSetup(t);
  const res = createResponse();
  await controller.updateQueueStatus(request({ status: 'open' }, { queueId: 'missing' }), res, assert.ifError);
  assert.equal(res.statusCode, 404);
  assert.equal(queue.updateQueueStatus('missing', 'closed'), null);
});

test('serve-next completes current ticket early, advances successor, and handles empty or missing services', async (t) => {
  const { controller, queue, notifications } = queueSetup(t);
  const first = createResponse(), second = createResponse();
  controller.join(request({ serviceId: 'S-01' }), first, assert.ifError);
  controller.join(request({ serviceId: 'S-01' }), second, assert.ifError);
  t.mock.timers.tick(2 * 60_000);
  const res = createResponse();
  await controller.serveNext(request({ serviceId: 'S-01' }), res, assert.ifError);
  assert.equal(res.body.completed.id, first.body.ticket.id);
  assert.equal(res.body.completed.status, 'served');
  assert.equal(res.body.next.id, second.body.ticket.id);
  assert.equal(res.body.next.serviceStartedAt, new Date().toISOString());
  assert.ok(notifications.listForUser(user.id).some((n) => n.ticketId === second.body.ticket.id && n.type === 'your_turn'));
  const last = createResponse();
  await controller.serveNext(request({ serviceId: 'S-01' }), last, assert.ifError);
  assert.equal(last.body.next, null);
  assert.equal(queue.getPosition(first.body.ticket.id), null);
  for (const serviceId of ['S-01', 'missing']) {
    const empty = createResponse();
    await controller.serveNext(request({ serviceId }), empty, assert.ifError);
    assert.equal(empty.statusCode, 404);
  }
});

for (const method of ['list', 'listMine', 'get', 'listNotifications', 'leave', 'serveNext']) {
  test(`queue ${method} forwards an asynchronous progress-persistence failure`, async (t) => {
    const { controller, queue } = queueSetup(t);
    const error = new Error('database down');
    t.mock.method(queue, 'advanceService', async () => { throw error; });
    const next = t.mock.fn(), res = createResponse();
    await controller[method](request({ serviceId: 'S-01' }, { ticketId: 'ticket' }), res, next);
    assert.equal(next.mock.callCount(), 1);
    assert.equal(next.mock.calls[0].arguments[0], error);
    assert.equal(res.body, undefined);
  });
}

for (const method of ['join', 'updateQueueStatus']) {
  test(`queue ${method} forwards asynchronous database write errors`, async (t) => {
    const { controller, queue } = queueSetup(t);
    const error = new Error('write failed');
    t.mock.method(queue, method, async () => { throw error; });
    const next = t.mock.fn(), res = createResponse();
    await controller[method](request({ serviceId: 'S-01', status: 'closed' }, { queueId: 'queue' }), res, next);
    assert.equal(next.mock.calls[0].arguments[0], error);
    assert.equal(res.body, undefined);
  });
}

test('queue controllers await asynchronous repositories and notifications throughout a complete flow', async (t) => {
  const { controller, queue, services, notifications } = queueSetup(t);
  services.update('S-01', { expectedDuration: 1 });
  for (const [target, methods] of [[queue, ['advanceService', 'join', 'leave', 'serveNext']], [notifications, ['create', 'listForUser']]]) {
    for (const method of methods) {
      const original = target[method];
      t.mock.method(target, method, async (...args) => original(...args));
    }
  }
  const joined = [];
  for (let i = 0; i < 3; i++) {
    const res = createResponse();
    await controller.join(request({ serviceId: 'S-01' }), res, assert.ifError);
    assert.equal(res.statusCode, 201);
    joined.push(res.body.ticket);
  }
  const notices = createResponse();
  await controller.listNotifications(request(), notices, assert.ifError);
  assert.ok(notices.body.notifications.some((n) => n.type === 'almost_ready'));
  const departed = createResponse();
  await controller.leave(request({}, { ticketId: joined[2].id }), departed, assert.ifError);
  assert.equal(departed.body.ticket.status, 'cancelled');
  const served = createResponse();
  await controller.serveNext(request({ serviceId: 'S-01' }), served, assert.ifError);
  assert.equal(served.body.next.id, joined[1].id);
});

test('queue controllers catch synchronous repository failures', async (t) => {
  const { controller, queue } = queueSetup(t);
  const error = new Error('invalid cached record');
  t.mock.method(queue, 'advanceService', () => { throw error; });
  const next = t.mock.fn();
  await controller.list({}, createResponse(), next);
  assert.equal(next.mock.calls[0].arguments[0], error);
});

for (const method of ['list', 'create', 'update', 'remove']) {
  test(`service ${method} forwards asynchronous database errors`, async (t) => {
    const controller = freshModule('src/modules/services/services.controller.js');
    const repo = require('../src/modules/services/services.repository');
    const error = new Error('service SQL failed');
    t.mock.method(repo, method, async () => { throw error; });
    const res = createResponse(), next = t.mock.fn();
    await controller[method](request({}, { id: 'S-01' }), res, next);
    assert.equal(next.mock.calls[0].arguments[0], error);
    assert.equal(res.body, undefined);
  });
}

test('service creation waits for the persisted queue and forwards queue creation failure', async (t) => {
  const controller = freshModule('src/modules/services/services.controller.js');
  const services = require('../src/modules/services/services.repository');
  const queue = require('../src/modules/queue/queue.repository');
  t.mock.method(services, 'create', async () => ({ id: 'new-service', name: 'Help' }));
  t.mock.method(queue, 'ensureQueueForService', async () => ({ id: 'new-queue', status: 'open' }));
  const res = createResponse();
  await controller.create(request({ name: 'Help' }), res, assert.ifError);
  assert.deepEqual(res.body.service, { id: 'new-service', name: 'Help', queueId: 'new-queue', status: 'open' });
  const error = new Error('queue failed');
  queue.ensureQueueForService.mock.mockImplementation(async () => { throw error; });
  const next = t.mock.fn();
  await controller.create(request({ name: 'Help' }), createResponse(), next);
  assert.equal(next.mock.calls[0].arguments[0], error);
});
