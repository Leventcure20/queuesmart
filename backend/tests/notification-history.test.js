const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule, createResponse } = require('./helpers');
const { database, rows, repository } = require('./sql-helpers');

const at = new Date('2026-01-01T12:00:00Z');
const record = { id: 'notice-1', ticket_id: 'ticket-1', ticket_number: 'Q001', service_name: 'Support', type: 'joined', title: 'Joined', message: 'In queue', created_at: at, status: 'viewed', viewed_at: new Date(at.valueOf() + 1000) };

test('SQL notification lists map persisted viewed status and timestamps', async (t) => {
  const db = database(t, [[/WHERE user_id = \$1/, rows(record, { ...record, id: 'notice-2', status: 'sent', viewed_at: null })]]);
  const list = await repository('queue/notifications.repository.js', db.pool).listForUser('user-1');
  assert.deepEqual(db.calls[0].values, ['user-1']);
  assert.match(db.calls[0].sql, /status, viewed_at/);
  assert.equal(list[0].status, 'viewed');
  assert.equal(list[0].viewedAt, record.viewed_at.toISOString());
  assert.equal(list[1].status, 'sent');
  assert.equal(list[1].viewedAt, null);
});

test('SQL notification creation returns the persisted initial history status', async (t) => {
  const db = database(t, [[/INSERT INTO "QueueNotifications"/, rows({ ...record, status: 'sent', viewed_at: null })]]);
  const result = await repository('queue/notifications.repository.js', db.pool).create({ userId: 'user-1', ticket: { id: 'ticket-1', number: 'Q001', serviceName: 'Support' }, type: 'joined', title: 'Joined', message: 'In queue' });
  assert.match(db.calls[0].sql, /RETURNING[\s\S]*status, viewed_at/);
  assert.equal(result.status, 'sent');
  assert.equal(result.viewedAt, null);
});

test('SQL mark-viewed scopes the write and subsequent read to the same user', async (t) => {
  const userId = "user'); DELETE FROM x; --";
  const db = database(t, [[/UPDATE "QueueNotifications"/, rows()], [/WHERE user_id = \$1/, rows(record)]]);
  const result = await repository('queue/notifications.repository.js', db.pool).markAllViewed(userId);
  assert.deepEqual(db.calls.map((call) => call.values), [[userId], [userId]]);
  assert.match(db.calls[0].sql, /WHERE user_id = \$1 AND status = 'sent'/);
  assert.match(db.calls[0].sql, /viewed_at = COALESCE\(viewed_at, NOW\(\)\)/);
  assert.equal(db.calls[0].sql.includes(userId), false);
  assert.equal(result[0].viewedAt, record.viewed_at.toISOString());
});

test('SQL mark-viewed returns an empty history for a user with no notifications', async (t) => {
  const db = database(t, [[/UPDATE/, rows()], [/SELECT/, rows()]]);
  assert.deepEqual(await repository('queue/notifications.repository.js', db.pool).markAllViewed('empty'), []);
});

for (const stage of ['update', 'read']) {
  test(`SQL mark-viewed propagates ${stage} failure without returning success`, async (t) => {
    const error = new Error('database failed');
    const steps = [[/UPDATE/, stage === 'update' ? error : rows()]];
    if (stage === 'read') steps.push([/SELECT/, error]);
    const db = database(t, steps);
    await assert.rejects(repository('queue/notifications.repository.js', db.pool).markAllViewed('user-1'), (e) => e === error);
  });
}

test('viewing history preserves prior timestamps and only marks newly sent notifications', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: at.valueOf() });
  const repo = freshModule('src/modules/queue/notifications.repository.js');
  const make = (id) => repo.create({ userId: 'user-1', ticket: { id, number: 'Q001', serviceName: 'Support' }, type: 'joined', title: 'Joined', message: 'Queued' });
  make('first');
  assert.equal(repo.markAllViewed('user-1')[0].viewedAt, at.toISOString());
  t.mock.timers.tick(1000);
  make('second');
  const result = repo.markAllViewed('user-1');
  assert.deepEqual(result.map((n) => [n.ticketId, n.status, n.viewedAt]), [
    ['second', 'viewed', new Date(at.valueOf() + 1000).toISOString()], ['first', 'viewed', at.toISOString()],
  ]);
  result.pop();
  assert.equal(repo.listForUser('user-1').length, 2);
  assert.deepEqual(repo.markAllViewed('missing'), []);
});

for (const asynchronous of [false, true]) {
  test(`mark-viewed controller returns ${asynchronous ? 'asynchronous' : 'synchronous'} history for the authenticated identity`, async (t) => {
    const controller = freshModule('src/modules/queue/queue.controller.js');
    const repo = require('../src/modules/queue/notifications.repository');
    const notifications = [{ id: 'notice-1', status: 'viewed' }];
    const mark = t.mock.method(repo, 'markAllViewed', (id) => {
      assert.equal(id, 'authenticated-user');
      return asynchronous ? Promise.resolve(notifications) : notifications;
    });
    const res = createResponse();
    await controller.markNotificationsViewed({ user: { id: 'authenticated-user' }, body: { userId: 'someone-else' } }, res, assert.ifError);
    assert.equal(mark.mock.callCount(), 1);
    assert.deepEqual(res.body, { notifications });
  });
}

for (const asynchronous of [false, true]) {
  test(`mark-viewed controller forwards a ${asynchronous ? 'rejected promise' : 'synchronous error'}`, async (t) => {
    const controller = freshModule('src/modules/queue/queue.controller.js');
    const error = new Error('failed to save history');
    t.mock.method(require('../src/modules/queue/notifications.repository'), 'markAllViewed', () => {
      if (asynchronous) return Promise.reject(error);
      throw error;
    });
    const next = t.mock.fn(), res = createResponse();
    await controller.markNotificationsViewed({ user: { id: 'user-1' } }, res, next);
    assert.equal(next.mock.callCount(), 1);
    assert.equal(next.mock.calls[0].arguments[0], error);
    assert.equal(res.body, undefined);
  });
}
