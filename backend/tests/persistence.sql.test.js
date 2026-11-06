const { test } = require('node:test');
const assert = require('node:assert/strict');
const { database, rows, repository } = require('./sql-helpers');

const instant = new Date('2026-01-01T12:00:00Z');
const serviceRow = { id: 'S-01', name: 'Support', description: 'Help', expected_duration: 8, priority_level: 'low', created_at: instant, updated_at: instant };
const queueRow = { id: 'queue-1', service_id: 'S-01', status: 'open', created_at: instant };
const ticketRow = { id: 'ticket-1', number: 'Q001', customer_name: 'Alex', user_id: 'user-1', service_id: 'S-01', service_name: 'Support', status: 'waiting', joined_at: instant, created_at: instant, updated_at: instant };
const noticeRow = { id: 'notice-1', ticket_id: 'ticket-1', ticket_number: 'Q001', service_name: 'Support', type: 'joined', title: 'Joined', message: 'In queue', created_at: instant };

test('SQL service initialization replaces demo cache and maps database columns', async (t) => {
  const db = database(t, [[/FROM "Service" ORDER BY/, rows(serviceRow)]]);
  const repo = repository('services/services.repository.js', db.pool);
  await repo.initialize();
  assert.equal(repo.list().length, 1);
  assert.deepEqual(repo.findById('S-01'), { id: 'S-01', name: 'Support', description: 'Help', expectedDuration: 8, priorityLevel: 'low', createdAt: instant.toISOString(), updatedAt: instant.toISOString() });
});

test('SQL service creation uses bound values and caches the returned record', async (t) => {
  const name = "O'Brien'); DROP TABLE Service; --";
  const db = database(t, [[/INSERT INTO "Service"/, rows({ ...serviceRow, name })]]);
  const repo = repository('services/services.repository.js', db.pool);
  const created = await repo.create({ name, description: 'Help', expectedDuration: 8, priorityLevel: 'low' });
  assert.equal(db.calls[0].sql.includes(name), false);
  assert.deepEqual(db.calls[0].values.slice(1), [name, 'Help', 8, 'low']);
  assert.deepEqual(repo.findById(created.id), created);
});

test('SQL partial service updates whitelist identifiers and bind user values', async (t) => {
  const db = database(t, [[/UPDATE "Service" SET name = \$1, expected_duration = \$2/, rows(serviceRow)]]);
  const repo = repository('services/services.repository.js', db.pool);
  await repo.update('S-01', { name: "'quoted'", expectedDuration: 8, id: 'overwrite', 'name = NULL;--': true, createdAt: 'forged' });
  assert.deepEqual(db.calls[0].values, ["'quoted'", 8, 'S-01']);
  assert.match(db.calls[0].sql, /WHERE id = \$3/);
  assert.equal(db.calls[0].sql.includes('forged'), false);
  assert.equal(repo.findById('S-01').id, 'S-01');
});

test('SQL unsupported-only service updates do not issue a write', async (t) => {
  const db = database(t, []), repo = repository('services/services.repository.js', db.pool);
  assert.equal((await repo.update('S-01', { id: 'forged' })).id, 'S-01');
  assert.equal(await repo.update('missing', {}), null);
});

test('SQL missing service update returns null', async (t) => {
  const db = database(t, [[/UPDATE "Service"/, rows()]]);
  assert.equal(await repository('services/services.repository.js', db.pool).update('missing', { name: 'Help' }), null);
});

for (const found of [true, false]) {
  test(`SQL service delete ${found ? 'removes cached record' : 'reports a missing row'}`, async (t) => {
    const db = database(t, [[/DELETE FROM "Service" WHERE id = \$1/, found ? rows({ id: 'S-01' }) : rows()]]);
    const repo = repository('services/services.repository.js', db.pool);
    assert.equal(await repo.remove('S-01'), found);
    assert.equal(repo.findById('S-01') === null, found);
    assert.deepEqual(db.calls[0].values, ['S-01']);
  });
}

for (const operation of ['initialize', 'create', 'update', 'remove']) {
  test(`SQL service ${operation} rejects database failure without changing cached services`, async (t) => {
    const error = new Error('connection lost');
    const db = database(t, [[/.*/, error]]), repo = repository('services/services.repository.js', db.pool);
    const before = repo.list();
    const action = { initialize: () => repo.initialize(), create: () => repo.create({}), update: () => repo.update('S-01', { name: 'New' }), remove: () => repo.remove('S-01') };
    await assert.rejects(action[operation](), (e) => e === error);
    assert.deepEqual(repo.list(), before);
  });
}

test('SQL queue restart restores ticket history, dates, positions, and closed status', async (t) => {
  const db = database(t, [[/FROM "QueueTickets" ORDER BY/, rows(ticketRow, { ...ticketRow, id: 'old', number: 'Q000', status: 'served', served_at: instant })], [/FROM "Queue" ORDER BY/, rows({ ...queueRow, status: 'closed' })]]);
  const repo = repository('queue/queue.repository.js', db.pool);
  await repo.initialize();
  assert.equal(repo.list().length, 2);
  assert.equal(repo.findById('ticket-1').joinedAt, instant.toISOString());
  assert.equal(repo.findById('ticket-1').serviceStartedAt, null);
  assert.equal(repo.getPosition('ticket-1'), 1);
  assert.equal(repo.getPosition('old'), null);
  assert.equal(repo.queueStatusForService('S-01'), 'closed');
  assert.equal(repo.queueStatusForService('missing'), null);
  assert.equal(repo.findQueueById('queue-1').createdAt, instant.toISOString());
});

test('SQL queue startup propagates a failed read', async (t) => {
  const error = new Error('read failed');
  const db = database(t, [[/FROM "QueueTickets"/, error], [/FROM "Queue"/, rows()]]);
  await assert.rejects(repository('queue/queue.repository.js', db.pool).initialize(), (e) => e === error);
});

test('SQL queue upsert preserves persisted closed status and reuses cached queue', async (t) => {
  const db = database(t, [[/ON CONFLICT \(service_id\)/, rows({ ...queueRow, status: 'closed' })]]);
  const repo = repository('queue/queue.repository.js', db.pool);
  const queue = await repo.ensureQueueForService({ id: 'S-01' });
  assert.equal(queue.status, 'closed');
  assert.equal(await repo.ensureQueueForService({ id: 'S-01' }), queue);
  assert.equal(repo.listQueues().length, 1);
  repo.removeQueueForService('S-01');
  assert.equal(repo.findQueueById(queue.id), null);
});

for (const found of [true, false]) {
  test(`SQL queue status update handles ${found ? 'an existing' : 'a missing'} queue`, async (t) => {
    const db = database(t, [[/UPDATE "Queue" SET status = \$2/, found ? rows({ ...queueRow, status: 'closed' }) : rows()]]);
    const repo = repository('queue/queue.repository.js', db.pool);
    const result = await repo.updateQueueStatus('queue-1', 'closed');
    assert.deepEqual(db.calls[0].values, ['queue-1', 'closed']);
    assert.equal(result?.status || null, found ? 'closed' : null);
  });
}

test('SQL ticket join binds authenticated identity and uses database ticket sequence', async (t) => {
  const db = database(t, [[/INSERT INTO "QueueTickets"/, rows(ticketRow)]]);
  const repo = repository('queue/queue.repository.js', db.pool);
  const ticket = await repo.join({ userId: 'user-1', customerName: 'Alex', service: { id: 'S-01', name: 'Support' } });
  assert.match(db.calls[0].sql, /nextval\('queue_ticket_number_seq'\)/);
  assert.deepEqual(db.calls[0].values.slice(1), ['Alex', 'user-1', 'S-01', 'Support']);
  assert.equal(repo.findById(ticket.id).number, 'Q001');
});

test('SQL ticket progression persists scheduled starts and completions across elapsed time', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: instant.valueOf() });
  const db = database(t, [[/FROM "QueueTickets"/, rows(ticketRow)], [/FROM "Queue"/, rows(queueRow)], [/UPDATE "QueueTickets"/], [/UPDATE "QueueTickets"/]]);
  const repo = repository('queue/queue.repository.js', db.pool);
  await repo.initialize();
  assert.equal((await repo.advanceService('S-01', 8)).started.length, 1);
  assert.equal(db.calls[2].values[6], 'serving');
  assert.equal(db.calls[2].values[9], instant.toISOString());
  t.mock.timers.tick(8 * 60_000);
  assert.equal((await repo.advanceService('S-01', 8)).served.length, 1);
  assert.equal(db.calls[3].values[6], 'served');
  assert.equal(db.calls[3].values[10], new Date(instant.valueOf() + 8 * 60_000).toISOString());
  assert.deepEqual(await repo.advanceService('missing', 8), { started: [], served: [] });
});

test('SQL cancellation persists reason and timestamps and rejects inactive history', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: instant.valueOf() });
  const db = database(t, [[/FROM "QueueTickets"/, rows(ticketRow)], [/FROM "Queue"/, rows(queueRow)], [/UPDATE "QueueTickets"/]]);
  const repo = repository('queue/queue.repository.js', db.pool);
  await repo.initialize();
  const ticket = await repo.leave('ticket-1', 'removed');
  assert.equal(ticket.status, 'cancelled');
  assert.equal(db.calls[2].values[11], 'removed');
  assert.equal(db.calls[2].values[12], instant.toISOString());
  assert.equal(repo.leave('ticket-1').cannotLeave, true);
  assert.equal(repo.leave('missing'), null);
});

test('SQL serve-next persists completion and starts the waiting successor at the current time', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: instant.valueOf() + 2 * 60_000 });
  const db = database(t, [
    [/FROM "QueueTickets"/, rows(ticketRow, { ...ticketRow, id: 'next', number: 'Q002' })], [/FROM "Queue"/, rows(queueRow)],
    [/UPDATE "QueueTickets"/], [/UPDATE "QueueTickets"/], [/UPDATE "QueueTickets"/], [/UPDATE "QueueTickets"/],
  ]);
  const repo = repository('queue/queue.repository.js', db.pool);
  await repo.initialize();
  const result = await repo.serveNext('S-01', 8);
  assert.equal(result.completed.id, 'ticket-1');
  assert.equal(result.completed.status, 'served');
  assert.equal(result.next.id, 'next');
  assert.equal(result.next.serviceStartedAt, new Date().toISOString());
  assert.equal(result.started[0].id, 'next');
});

for (const operation of ['join', 'advance', 'leave', 'status', 'ensure']) {
  test(`SQL queue ${operation} failures reject instead of returning success`, async (t) => {
    const error = new Error('write failed');
    const needsTicket = ['advance', 'leave'].includes(operation);
    const steps = needsTicket ? [[/FROM "QueueTickets"/, rows(ticketRow)], [/FROM "Queue"/, rows(queueRow)]] : [];
    steps.push([/INSERT|UPDATE/, error]);
    const db = database(t, steps), repo = repository('queue/queue.repository.js', db.pool);
    if (needsTicket) await repo.initialize();
    const action = { join: () => repo.join({ service: { id: 'S-01' } }), advance: () => repo.advanceService('S-01', 8, instant.valueOf()), leave: () => repo.leave('ticket-1'), status: () => repo.updateQueueStatus('queue-1', 'closed'), ensure: () => repo.ensureQueueForService({ id: 'S-01' }) };
    await assert.rejects(action[operation](), (e) => e === error);
  });
}

for (const duplicate of [false, true]) {
  test(`SQL notification creation ${duplicate ? 'deduplicates ticket events' : 'maps returned notification'}`, async (t) => {
    const db = database(t, [[/ON CONFLICT \(ticket_id, type\) DO NOTHING/, duplicate ? rows() : rows(noticeRow)]]);
    const repo = repository('queue/notifications.repository.js', db.pool);
    const result = await repo.create({ userId: 'user-1', ticket: { id: 'ticket-1', number: 'Q001', serviceName: 'Support' }, type: 'joined', title: 'Joined', message: 'In queue' });
    assert.deepEqual(db.calls[0].values.slice(1), ['ticket-1', 'user-1', 'Q001', 'Support', 'joined', 'Joined', 'In queue']);
    assert.equal(result?.createdAt || null, duplicate ? null : instant.toISOString());
  });
}

test('SQL notification lists filter by authenticated user and order newest first', async (t) => {
  const db = database(t, [[/WHERE user_id = \$1\s+ORDER BY created_at DESC, id DESC/, rows(noticeRow)]]);
  const list = await repository('queue/notifications.repository.js', db.pool).listForUser('user-1');
  assert.deepEqual(db.calls[0].values, ['user-1']);
  assert.equal(list[0].ticketId, 'ticket-1');
  assert.equal(list[0].createdAt, instant.toISOString());
});

test('SQL notification database failures propagate', async (t) => {
  const error = new Error('read failed'), db = database(t, [[/SELECT/, error]]);
  await assert.rejects(repository('queue/notifications.repository.js', db.pool).listForUser('user-1'), (e) => e === error);
});
