const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule } = require('./helpers');

const START = Date.parse('2026-01-01T12:00:00.000Z');
const ticket = { id: 'ticket-a', number: 'Q001', serviceName: 'General Inquiry' };

function setup(t) {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  return freshModule('src/modules/queue/notifications.repository.js');
}

function create(repository, overrides = {}) {
  return repository.create({
    userId: 'user-a', ticket, type: 'joined', title: 'Joined', message: 'You joined the queue.',
    ...overrides,
  });
}

test('notifications retain ticket context, content, and creation time', (t) => {
  const repository = setup(t);
  assert.deepEqual(repository.listForUser('missing-user'), []);
  const notification = create(repository);
  assert.match(notification.id, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(notification, {
    id: notification.id, ticketId: 'ticket-a', ticketNumber: 'Q001',
    serviceName: 'General Inquiry', type: 'joined', title: 'Joined',
    message: 'You joined the queue.', createdAt: '2026-01-01T12:00:00.000Z',
  });
  assert.deepEqual(repository.listForUser('user-a'), [notification]);
});

test('each ticket and event type generates at most one notification', (t) => {
  const repository = setup(t);
  const joined = create(repository);
  t.mock.timers.setTime(START + 1000);
  assert.equal(create(repository, { title: 'Duplicate', message: 'Repeated polling' }), null);
  const turn = create(repository, { type: 'your_turn' });
  const secondTicket = create(repository, { ticket: { ...ticket, id: 'ticket-b', number: 'Q002' } });
  assert.notEqual(joined.id, turn.id);
  assert.notEqual(joined.id, secondTicket.id);
  assert.deepEqual(repository.listForUser('user-a'), [secondTicket, turn, joined]);
});

test('notification lists are isolated per user, newest first, and return separate arrays', (t) => {
  const repository = setup(t);
  const first = create(repository);
  t.mock.timers.setTime(START + 1000);
  const otherUser = create(repository, {
    userId: 'user-b', ticket: { ...ticket, id: 'ticket-b', number: 'Q002' },
  });
  t.mock.timers.setTime(START + 2000);
  const newest = create(repository, { type: 'almost_ready' });
  assert.deepEqual(repository.listForUser('user-a'), [newest, first]);
  assert.deepEqual(repository.listForUser('user-b'), [otherUser]);
  const copy = repository.listForUser('user-a');
  copy.pop();
  copy.unshift({ id: 'unrelated' });
  assert.deepEqual(repository.listForUser('user-a'), [newest, first]);
});
