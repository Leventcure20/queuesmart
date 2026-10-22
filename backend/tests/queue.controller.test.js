const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule, createResponse } = require('./helpers');

const START = Date.parse('2026-01-01T12:00:00.000Z');
const MINUTE = 60_000;
const alice = { id: 'alice', name: 'Alice', role: 'user' };
const bob = { id: 'bob', name: 'Bob', role: 'user' };
const carol = { id: 'carol', name: 'Carol', role: 'user' };
const admin = { id: 'admin', name: 'Administrator', role: 'admin' };

function setup(t) {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const controller = freshModule('src/modules/queue/queue.controller.js');
  return {
    controller,
    queue: require('../src/modules/queue/queue.repository'),
    notifications: require('../src/modules/queue/notifications.repository'),
    services: require('../src/modules/services/services.repository'),
  };
}

function invoke(controller, method, request = {}) {
  const response = createResponse();
  controller[method]({ user: alice, params: {}, body: {}, ...request }, response);
  return response;
}

function join(controller, user = alice, serviceId = 'S-01') {
  const response = invoke(controller, 'join', { user, body: { serviceId } });
  assert.equal(response.statusCode, 201);
  return response.body.ticket;
}

function get(controller, ticket, user = alice) {
  return invoke(controller, 'get', { user, params: { ticketId: ticket.id } });
}

function leave(controller, ticket, user = alice) {
  return invoke(controller, 'leave', { user, params: { ticketId: ticket.id } });
}

test('joining a missing service returns 404 without tickets or notifications', (t) => {
  const { controller, queue, notifications } = setup(t);
  const response = invoke(controller, 'join', { body: { serviceId: 'missing' } });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: 'Service not found' });
  assert.deepEqual(queue.list(), []);
  assert.deepEqual(notifications.listForUser(alice.id), []);
});

test('joining uses authenticated identity, immediately starts the first ticket, and notifies its owner', (t) => {
  const { controller, notifications } = setup(t);
  const response = invoke(controller, 'join', {
    body: { serviceId: 'S-01', userId: bob.id, customerName: 'Forged name' },
  });
  assert.equal(response.statusCode, 201);
  const ticket = response.body.ticket;
  assert.equal(ticket.userId, alice.id);
  assert.equal(ticket.customerName, alice.name);
  assert.equal(ticket.serviceName, 'General Inquiry');
  assert.equal(ticket.status, 'serving');
  assert.equal(ticket.position, 1);
  assert.equal(ticket.estimatedWaitSeconds, 0);
  assert.equal(ticket.estimatedWaitMinutes, 0);
  assert.equal(ticket.serviceStartedAt, '2026-01-01T12:00:00.000Z');
  assert.deepEqual(notifications.listForUser(alice.id).map((item) => item.type), ['your_turn', 'joined']);
  assert.deepEqual(notifications.listForUser(bob.id), []);
  const independent = join(controller, bob, 'S-02');
  assert.equal(independent.status, 'serving');
  assert.equal(independent.position, 1);
  assert.equal(independent.estimatedWaitSeconds, 0);
});

test('wait estimates round up partial seconds and almost-ready notifications start exactly at five minutes', (t) => {
  const { controller, notifications } = setup(t);
  join(controller);
  const waiting = join(controller, bob);
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.position, 2);
  assert.equal(waiting.estimatedWaitSeconds, 480);
  assert.equal(waiting.estimatedWaitMinutes, 8);
  assert.deepEqual(notifications.listForUser(bob.id).map((item) => item.type), ['joined']);

  t.mock.timers.setTime(START + 1001);
  const fractional = get(controller, waiting, bob).body.ticket;
  assert.equal(fractional.estimatedWaitSeconds, 479);
  assert.equal(fractional.estimatedWaitMinutes, 479 / 60);
  t.mock.timers.setTime(START + 3 * MINUTE - 1);
  assert.equal(get(controller, waiting, bob).body.ticket.estimatedWaitSeconds, 301);
  assert.equal(notifications.listForUser(bob.id).length, 1);

  t.mock.timers.setTime(START + 3 * MINUTE);
  assert.equal(get(controller, waiting, bob).body.ticket.estimatedWaitSeconds, 300);
  const close = notifications.listForUser(bob.id)[0];
  assert.equal(close.type, 'almost_ready');
  assert.equal(close.message, `Ticket ${waiting.number} is about 5 minutes 0 seconds from being served.`);
  get(controller, waiting, bob);
  invoke(controller, 'listNotifications', { user: bob });
  assert.equal(notifications.listForUser(bob.id).filter((item) => item.type === 'almost_ready').length, 1);
});

test('tickets without a scheduled start time omit wait estimates and almost-ready reminders', (t) => {
  const { controller, queue, notifications } = setup(t);
  queue.advanceService = () => ({ started: [], served: [] });

  const ticket = join(controller);
  assert.equal(ticket.status, 'waiting');
  assert.equal(ticket.position, 1);
  assert.equal(ticket.estimatedWaitSeconds, null);
  assert.equal(ticket.estimatedWaitMinutes, null);
  assert.deepEqual(notifications.listForUser(alice.id).map((item) => item.type), ['joined']);
});

test('polling at completion advances position and emits each turn notification once', (t) => {
  const { controller, notifications } = setup(t);
  const first = join(controller);
  const second = join(controller, bob);
  t.mock.timers.setTime(START + 8 * MINUTE);
  const response = get(controller, second, bob);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ticket.status, 'serving');
  assert.equal(response.body.ticket.position, 1);
  assert.equal(response.body.ticket.estimatedWaitSeconds, 0);
  const completed = get(controller, first).body.ticket;
  assert.equal(completed.status, 'served');
  assert.equal(completed.position, null);
  assert.equal(completed.estimatedWaitSeconds, null);
  assert.equal(completed.estimatedWaitMinutes, null);
  assert.equal(completed.servedAt, '2026-01-01T12:08:00.000Z');
  invoke(controller, 'list');
  invoke(controller, 'listMine', { user: bob });
  assert.equal(notifications.listForUser(bob.id).filter((item) => item.type === 'your_turn').length, 1);
  assert.equal(notifications.listForUser(alice.id).filter((item) => item.type === 'your_turn').length, 1);
});

test('a long polling gap completes the queue without duplicate transition notifications', (t) => {
  const { controller, notifications } = setup(t);
  const first = join(controller);
  const second = join(controller, bob);
  const third = join(controller, carol);
  t.mock.timers.setTime(START + 30 * MINUTE);
  const response = invoke(controller, 'list');
  assert.deepEqual(response.body.tickets.map((ticket) => ticket.status), ['served', 'served', 'served']);
  assert.deepEqual(response.body.tickets.map((ticket) => ticket.id), [first.id, second.id, third.id]);
  for (const user of [alice, bob, carol]) {
    const items = invoke(controller, 'listNotifications', { user }).body.notifications;
    assert.equal(items.filter((item) => item.type === 'your_turn').length, 1);
    assert.equal(items.filter((item) => item.type === 'joined').length, 1);
  }
});

test('listMine returns only the signed-in user including cancelled history, while list returns all tickets', (t) => {
  const { controller } = setup(t);
  const first = join(controller);
  const otherUser = join(controller, bob);
  const cancelled = join(controller);
  leave(controller, cancelled);
  const mine = invoke(controller, 'listMine').body.tickets;
  assert.deepEqual(mine.map((ticket) => ticket.id), [first.id, cancelled.id]);
  assert.equal(mine[1].status, 'cancelled');
  assert.equal(mine[1].position, null);
  assert.equal(mine[1].estimatedWaitSeconds, null);
  assert.equal(mine[1].estimatedWaitMinutes, null);
  assert.deepEqual(invoke(controller, 'listMine', { user: carol }).body, { tickets: [] });
  assert.deepEqual(invoke(controller, 'list', { user: admin }).body.tickets.map((ticket) => ticket.id),
    [first.id, otherUser.id, cancelled.id]);
});

test('ticket retrieval permits its owner and an administrator, rejects others, and handles missing IDs', (t) => {
  const { controller } = setup(t);
  const ticket = join(controller);
  assert.equal(get(controller, ticket).statusCode, 200);
  const forbidden = get(controller, ticket, bob);
  assert.equal(forbidden.statusCode, 403);
  assert.deepEqual(forbidden.body, { error: 'You can only view your own ticket' });
  const administrator = get(controller, ticket, admin);
  assert.equal(administrator.statusCode, 200);
  assert.equal(administrator.body.ticket.id, ticket.id);
  const missing = get(controller, { id: 'missing' });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.body, { error: 'Ticket not found' });
});

test('leaving a waiting ticket returns cancelled history, notifies the owner, and reduces later waits', (t) => {
  const { controller, notifications } = setup(t);
  join(controller);
  const waiting = join(controller, bob);
  const next = join(controller, carol);
  assert.equal(next.estimatedWaitSeconds, 960);
  t.mock.timers.setTime(START + MINUTE);
  const response = leave(controller, waiting, bob);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ticket.status, 'cancelled');
  assert.equal(response.body.ticket.cancellationReason, 'left');
  assert.equal(response.body.ticket.leftAt, '2026-01-01T12:01:00.000Z');
  assert.equal(response.body.ticket.position, null);
  assert.equal(response.body.ticket.estimatedWaitSeconds, null);
  const moved = get(controller, next, carol).body.ticket;
  assert.equal(moved.position, 2);
  assert.equal(moved.estimatedWaitSeconds, 420);
  const removed = notifications.listForUser(bob.id).filter((item) => item.type === 'removed');
  assert.equal(removed.length, 1);
  assert.equal(removed[0].title, 'You left the queue');
  assert.equal(removed[0].ticketId, waiting.id);
  assert.equal(notifications.listForUser(carol.id).some((item) => item.type === 'removed'), false);
});

test('an owner can leave a serving ticket and the successor starts at departure time', (t) => {
  const { controller, notifications } = setup(t);
  const first = join(controller);
  const second = join(controller, bob);
  assert.equal(first.status, 'serving');
  t.mock.timers.setTime(START + 3 * MINUTE);
  const response = leave(controller, first);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ticket.status, 'cancelled');
  assert.equal(response.body.ticket.cancellationReason, 'left');
  assert.equal(response.body.ticket.leftAt, '2026-01-01T12:03:00.000Z');
  assert.equal(response.body.ticket.position, null);
  assert.equal(response.body.ticket.estimatedWaitSeconds, null);
  const notification = notifications.listForUser(alice.id)[0];
  assert.equal(notification.type, 'removed');
  assert.equal(notification.title, 'You left the queue');
  assert.equal(notification.ticketId, first.id);
  const successor = get(controller, second, bob).body.ticket;
  assert.equal(successor.status, 'serving');
  assert.equal(successor.position, 1);
  assert.equal(successor.serviceStartedAt, '2026-01-01T12:03:00.000Z');
  assert.equal(successor.estimatedWaitSeconds, 0);
  assert.equal(notifications.listForUser(bob.id)[0].type, 'your_turn');
});

test('leaving rejects missing tickets and other users without changing ownership or status', (t) => {
  const { controller, queue, notifications } = setup(t);
  join(controller);
  const ticket = join(controller, bob);
  const original = queue.findById(ticket.id);
  const before = notifications.listForUser(bob.id);
  const forbidden = leave(controller, ticket, alice);
  assert.equal(forbidden.statusCode, 403);
  assert.deepEqual(forbidden.body, { error: 'You can only leave your own ticket' });
  assert.deepEqual(queue.findById(ticket.id), original);
  assert.deepEqual(notifications.listForUser(bob.id), before);
  const missing = leave(controller, { id: 'missing' });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.body, { error: 'Ticket not found' });
});

test('an administrator can remove another user and notification belongs to the ticket owner', (t) => {
  const { controller, notifications } = setup(t);
  join(controller);
  const ticket = join(controller, bob);
  const response = leave(controller, ticket, admin);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ticket.cancellationReason, 'removed');
  const notification = notifications.listForUser(bob.id)[0];
  assert.equal(notification.type, 'removed');
  assert.equal(notification.title, 'You were removed from the queue');
  assert.equal(notification.message,
    `An administrator removed ticket ${ticket.number} for General Inquiry from the queue.`);
  assert.deepEqual(notifications.listForUser(admin.id), []);
});

test('an administrator leaving their own waiting ticket uses the ordinary cancellation reason', (t) => {
  const { controller, notifications } = setup(t);
  join(controller);
  const ticket = join(controller, admin);
  const response = leave(controller, ticket, admin);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ticket.cancellationReason, 'left');
  assert.equal(notifications.listForUser(admin.id)[0].title, 'You left the queue');
});

test('already cancelled or completed tickets return 409 without extra removal notifications', (t) => {
  const { controller, queue, notifications } = setup(t);
  const first = join(controller);
  const waiting = join(controller, bob);
  leave(controller, waiting, bob);
  const cancelled = queue.findById(waiting.id);
  const repeated = leave(controller, waiting, bob);
  assert.equal(repeated.statusCode, 409);
  assert.deepEqual(repeated.body, { error: 'Only active tickets can leave the queue' });
  assert.deepEqual(queue.findById(waiting.id), cancelled);
  assert.equal(notifications.listForUser(bob.id).filter((item) => item.type === 'removed').length, 1);

  t.mock.timers.setTime(START + 8 * MINUTE);
  get(controller, first);
  const completed = queue.findById(first.id);
  const response = leave(controller, first);
  assert.equal(response.statusCode, 409);
  assert.deepEqual(queue.findById(first.id), completed);
  assert.equal(notifications.listForUser(alice.id).some((item) => item.type === 'removed'), false);
});

test('notification endpoint returns only the current user in newest-first order', (t) => {
  const { controller } = setup(t);
  const first = join(controller);
  const second = join(controller, bob);
  t.mock.timers.setTime(START + 3 * MINUTE);
  const response = invoke(controller, 'listNotifications', { user: bob });
  assert.deepEqual(response.body.notifications.map((item) => item.type), ['almost_ready', 'joined']);
  assert.equal(response.body.notifications.every((item) => item.ticketId === second.id), true);
  const aliceNotifications = invoke(controller, 'listNotifications').body.notifications;
  assert.equal(aliceNotifications.every((item) => item.ticketId === first.id), true);
  assert.deepEqual(invoke(controller, 'listNotifications', { user: carol }).body, { notifications: [] });
});

test('wait estimates are unavailable after a service is removed', (t) => {
  const { controller, services } = setup(t);
  join(controller);
  const waiting = join(controller, bob);
  services.remove('S-01');
  const ticket = get(controller, waiting, bob).body.ticket;
  assert.equal(ticket.estimatedWaitSeconds, null);
  assert.equal(ticket.estimatedWaitMinutes, null);
});

for (const [elapsedSeconds, expected] of [
  [59, '1 minute 1 second'],
  [119, '1 second'],
]) {
  test(`almost-ready notification formats a wait of ${expected}`, (t) => {
    const { controller, services } = setup(t);
    const service = services.create({ name: 'Quick service', expectedDuration: 2 });
    join(controller, alice, service.id);
    t.mock.timers.setTime(START + elapsedSeconds * 1000);
    const ticket = join(controller, bob, service.id);
    const items = invoke(controller, 'listNotifications', { user: bob }).body.notifications;
    const notification = items.find((item) => item.type === 'almost_ready');
    assert.equal(notification.message, `Ticket ${ticket.number} is about ${expected} from being served.`);
  });
}
