const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule } = require('./helpers');

const START = Date.parse('2026-01-01T12:00:00.000Z');
const MINUTE = 60_000;
const service = { id: 'service-a', name: 'General Inquiry' };

function setup(t) {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  return freshModule('src/modules/queue/queue.repository.js');
}

function join(repository, userId = 'user-a', selectedService = service) {
  return repository.join({ userId, customerName: `Customer ${userId}`, service: selectedService });
}

test('new tickets have unique IDs, sequential numbers, ownership, and creation timestamps', (t) => {
  const repository = setup(t);
  assert.deepEqual(repository.list(), []);
  assert.equal(repository.findById('missing'), null);
  assert.equal(repository.getPosition('missing'), null);
  const first = join(repository);
  t.mock.timers.setTime(START + 1234);
  const second = join(repository, 'user-b', { id: 'service-b', name: 'Billing' });
  assert.notEqual(first.id, second.id);
  assert.match(first.id, /^[0-9a-f-]{36}$/i);
  assert.equal(first.number, 'Q001');
  assert.equal(second.number, 'Q002');
  assert.deepEqual(first, {
    id: first.id, number: 'Q001', customerName: 'Customer user-a', userId: 'user-a',
    serviceId: 'service-a', serviceName: 'General Inquiry', status: 'waiting',
    joinedAt: '2026-01-01T12:00:00.000Z', createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
  });
  assert.equal(second.joinedAt, '2026-01-01T12:00:01.234Z');
  assert.deepEqual(repository.list(), [first, second]);
  assert.deepEqual(repository.findById(first.id), first);
  assert.equal(repository.getPosition(first.id), 1);
  assert.equal(repository.getPosition(second.id), 1);
});

test('FIFO order is stable for simultaneous joins and positions are independent per service', (t) => {
  const repository = setup(t);
  const first = join(repository, 'user-a');
  const otherService = join(repository, 'user-b', { id: 'service-b', name: 'Billing' });
  const second = join(repository, 'user-c');
  const third = join(repository, 'user-d');
  const transitions = repository.advanceService(service.id, 2);
  assert.deepEqual(transitions.started.map((ticket) => ticket.id), [first.id]);
  assert.deepEqual(transitions.served, []);
  assert.equal(repository.findById(otherService.id).status, 'waiting');
  assert.equal(repository.findById(first.id).status, 'serving');
  assert.equal(repository.findById(second.id).scheduledStartAt, '2026-01-01T12:02:00.000Z');
  assert.equal(repository.findById(third.id).scheduledStartAt, '2026-01-01T12:04:00.000Z');
  assert.equal(repository.getPosition(first.id), 1);
  assert.equal(repository.getPosition(second.id), 2);
  assert.equal(repository.getPosition(third.id), 3);
  assert.equal(repository.getPosition(otherService.id), 1);
  repository.advanceService('service-b', 5);
  assert.equal(repository.findById(otherService.id).status, 'serving');
  assert.equal(repository.findById(second.id).status, 'waiting');
  assert.deepEqual(repository.advanceService('missing-service', 2), { started: [], served: [] });
});

test('service transitions occur at the exact start and completion boundaries', (t) => {
  const repository = setup(t);
  const first = join(repository);
  const second = join(repository, 'user-b');
  assert.deepEqual(repository.advanceService(service.id, 2, START - 1), { started: [], served: [] });
  assert.equal(repository.findById(first.id).status, 'waiting');
  repository.advanceService(service.id, 2, START);
  assert.equal(repository.findById(first.id).status, 'serving');
  assert.equal(repository.findById(first.id).serviceStartedAt, '2026-01-01T12:00:00.000Z');
  assert.deepEqual(repository.advanceService(service.id, 2, START + 2 * MINUTE - 1), {
    started: [], served: [],
  });
  assert.equal(repository.findById(second.id).status, 'waiting');
  const transitions = repository.advanceService(service.id, 2, START + 2 * MINUTE);
  assert.deepEqual(transitions.served.map((ticket) => ticket.id), [first.id]);
  assert.deepEqual(transitions.started.map((ticket) => ticket.id), [second.id]);
  assert.equal(repository.findById(first.id).servedAt, '2026-01-01T12:02:00.000Z');
  assert.equal(repository.findById(second.id).status, 'serving');
  assert.equal(repository.findById(second.id).serviceStartedAt, '2026-01-01T12:02:00.000Z');
  assert.equal(repository.findById(second.id).servedAt, null);
  assert.equal(repository.getPosition(first.id), null);
  assert.equal(repository.getPosition(second.id), 1);
  assert.deepEqual(repository.advanceService(service.id, 2, START + 2 * MINUTE), {
    started: [], served: [],
  });
});

test('a long time jump completes multiple tickets once using scheduled rather than polling times', (t) => {
  const repository = setup(t);
  const tickets = [join(repository), join(repository, 'user-b'), join(repository, 'user-c')];
  const now = START + 10 * MINUTE;
  const transitions = repository.advanceService(service.id, 2, now);
  assert.deepEqual(transitions.started.map((ticket) => ticket.id), tickets.map((ticket) => ticket.id));
  assert.deepEqual(transitions.served.map((ticket) => ticket.id), tickets.map((ticket) => ticket.id));
  for (const [index, ticket] of tickets.entries()) {
    const stored = repository.findById(ticket.id);
    assert.equal(stored.status, 'served');
    assert.equal(Date.parse(stored.serviceStartedAt), START + index * 2 * MINUTE);
    assert.equal(Date.parse(stored.servedAt), START + (index + 1) * 2 * MINUTE);
    assert.equal(Date.parse(stored.updatedAt), now);
    assert.equal(repository.getPosition(ticket.id), null);
  }
  assert.deepEqual(repository.advanceService(service.id, 2, now + MINUTE), { started: [], served: [] });
});

test('a ticket joined after an idle period starts when it joins', (t) => {
  const repository = setup(t);
  const first = join(repository);
  repository.advanceService(service.id, 2, START + 2 * MINUTE);
  t.mock.timers.setTime(START + 10 * MINUTE);
  const second = join(repository, 'user-b');
  repository.advanceService(service.id, 2);
  assert.equal(repository.findById(first.id).status, 'served');
  assert.equal(repository.findById(second.id).status, 'serving');
  assert.equal(repository.findById(second.id).serviceStartedAt, '2026-01-01T12:10:00.000Z');
  assert.equal(repository.getPosition(second.id), 1);
});

test('cancelling a waiting ticket preserves history and moves later tickets forward', (t) => {
  const repository = setup(t);
  const first = join(repository);
  const cancelled = join(repository, 'user-b');
  const third = join(repository, 'user-c');
  repository.advanceService(service.id, 2);
  t.mock.timers.setTime(START + 30_000);
  const result = repository.leave(cancelled.id);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.cancellationReason, 'left');
  assert.equal(result.leftAt, '2026-01-01T12:00:30.000Z');
  assert.equal(result.updatedAt, result.leftAt);
  assert.equal(repository.getPosition(cancelled.id), null);
  assert.equal(repository.getPosition(third.id), 2);
  repository.advanceService(service.id, 2);
  assert.equal(repository.findById(third.id).scheduledStartAt, '2026-01-01T12:02:00.000Z');
  const transitions = repository.advanceService(service.id, 2, START + 2 * MINUTE);
  assert.deepEqual(transitions.served.map((ticket) => ticket.id), [first.id]);
  assert.deepEqual(transitions.started.map((ticket) => ticket.id), [third.id]);
  assert.deepEqual(repository.findById(cancelled.id), result);
  assert.equal(repository.list().length, 3);
});

test('leaving unknown or inactive tickets does not change stored history', (t) => {
  const repository = setup(t);
  assert.equal(repository.leave('missing'), null);
  const cancelled = join(repository);
  const served = join(repository, 'user-b');
  const cancellation = repository.leave(cancelled.id, 'removed');
  repository.advanceService(service.id, 2, START + 2 * MINUTE);
  const completion = repository.findById(served.id);
  assert.equal(cancellation.cancellationReason, 'removed');
  assert.deepEqual(repository.leave(cancelled.id), { ...cancellation, cannotLeave: true });
  assert.deepEqual(repository.leave(served.id), { ...completion, cannotLeave: true });
  assert.deepEqual(repository.findById(cancelled.id), cancellation);
  assert.deepEqual(repository.findById(served.id), completion);
  assert.equal(repository.findById(served.id).cannotLeave, undefined);
});

test('removing a serving ticket starts its successor at removal time and preserves that start on later polls', (t) => {
  const repository = setup(t);
  const first = join(repository);
  const second = join(repository, 'user-b');
  const third = join(repository, 'user-c');
  repository.advanceService(service.id, 8);
  t.mock.timers.setTime(START + 3 * MINUTE);
  repository.leave(first.id, 'removed');
  const transitions = repository.advanceService(service.id, 8);

  assert.deepEqual(transitions.started.map((ticket) => ticket.id), [second.id]);
  assert.deepEqual(transitions.served, []);
  assert.equal(repository.findById(second.id).status, 'serving');
  assert.equal(repository.findById(second.id).serviceStartedAt, '2026-01-01T12:03:00.000Z');
  assert.equal(repository.findById(third.id).scheduledStartAt, '2026-01-01T12:11:00.000Z');
  t.mock.timers.setTime(START + 4 * MINUTE);
  assert.deepEqual(repository.advanceService(service.id, 8), { started: [], served: [] });
  assert.equal(repository.findById(second.id).serviceStartedAt, '2026-01-01T12:03:00.000Z');
  assert.equal(repository.findById(third.id).scheduledStartAt, '2026-01-01T12:11:00.000Z');
  assert.equal(repository.getPosition(second.id), 1);
  assert.equal(repository.getPosition(third.id), 2);
});

test('removing a middle serving ticket preserves work completed before its removal', (t) => {
  const repository = setup(t);
  const first = join(repository);
  const second = join(repository, 'user-b');
  const third = join(repository, 'user-c');
  repository.advanceService(service.id, 8);
  t.mock.timers.setTime(START + 10 * MINUTE);
  repository.advanceService(service.id, 8);
  assert.equal(repository.findById(first.id).servedAt, '2026-01-01T12:08:00.000Z');
  assert.equal(repository.findById(second.id).serviceStartedAt, '2026-01-01T12:08:00.000Z');
  repository.leave(second.id, 'removed');
  const transitions = repository.advanceService(service.id, 8);

  assert.deepEqual(transitions.started.map((ticket) => ticket.id), [third.id]);
  assert.deepEqual(transitions.served, []);
  assert.equal(repository.findById(third.id).serviceStartedAt, '2026-01-01T12:10:00.000Z');
  assert.equal(repository.findById(first.id).servedAt, '2026-01-01T12:08:00.000Z');
  assert.equal(repository.findById(second.id).status, 'cancelled');
  assert.equal(repository.findById(second.id).leftAt, '2026-01-01T12:10:00.000Z');
});
