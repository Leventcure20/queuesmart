const assert = require('node:assert/strict');
const { once } = require('node:events');
const { beforeEach, afterEach, test } = require('node:test');
const { freshModule } = require('./helpers');

let server;
let baseUrl;
let auth;

beforeEach(async (t) => {
  const app = freshModule('src/app.js');
  auth = require('../src/modules/auth/auth.repository');
  t.mock.method(console, 'info', () => {});
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
});

async function request(method, route, { body, token, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
}

async function session(kind = 'user') {
  const data = { name: kind, email: `${kind}@example.com`, password: 'Test-password-123' };
  let user;
  if (kind === 'admin') {
    await auth.initializeAdmin(data);
    user = await auth.authenticate(data.email, data.password);
  } else {
    user = await auth.createUser(data);
  }
  return { user, token: auth.createSession(user).token };
}

test('health and CORS support the local frontend and authorized preflight methods', async () => {
  const health = await request('GET', '/api/health', { headers: { Origin: 'http://localhost:8000' } });
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { status: 'ok' });
  assert.equal(health.headers.get('access-control-allow-origin'), 'http://localhost:8000');
  assert.equal(health.headers.get('vary'), 'Origin');

  const alternate = await request('GET', '/api/health', { headers: { Origin: 'http://127.0.0.1:8000' } });
  assert.equal(alternate.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8000');
  const unrelated = await request('GET', '/api/health', { headers: { Origin: 'https://unrelated.example' } });
  assert.equal(unrelated.headers.get('access-control-allow-origin'), null);

  const preflight = await request('OPTIONS', '/api/services', { headers: { Origin: 'http://localhost:8000' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.body, null);
  assert.match(preflight.headers.get('access-control-allow-methods'), /DELETE/);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
});

test('registration, login, current-user lookup, and logout work through the real routes', async () => {
  const credentials = { name: '  Alex  ', email: 'ALEX@example.com', password: 'Test-password-123', role: 'admin' };
  const registration = await request('POST', '/api/auth/register', { body: credentials });
  assert.equal(registration.status, 201);
  assert.equal(registration.body.user.name, 'Alex');
  assert.equal(registration.body.user.email, 'alex@example.com');
  assert.equal(registration.body.user.role, 'user');
  assert.equal('password' in registration.body.user, false);
  assert.equal('passwordHash' in registration.body.user, false);
  assert.equal(registration.body.tokenType, 'Bearer');

  const current = await request('GET', '/api/auth/me', { token: registration.body.token });
  assert.deepEqual(current.body.user, registration.body.user);
  const duplicate = await request('POST', '/api/auth/register', { body: credentials });
  assert.equal(duplicate.status, 409);
  assert.equal((await request('POST', '/api/auth/login', { body: { email: credentials.email, password: 'wrong' } })).status, 401);

  const login = await request('POST', '/api/auth/login', { body: { email: credentials.email, password: credentials.password } });
  assert.equal(login.status, 200);
  assert.notEqual(login.body.token, registration.body.token);
  const logout = await request('POST', '/api/auth/logout', { token: login.body.token });
  assert.equal(logout.status, 204);
  assert.equal(logout.body, null);
  assert.equal((await request('GET', '/api/auth/me', { token: login.body.token })).status, 401);
  assert.equal((await request('GET', '/api/auth/me', { token: registration.body.token })).status, 200);
});

test('registration rejects invalid requests with safe validation details', async () => {
  const result = await request('POST', '/api/auth/register', { body: { email: 'bad', password: 'short' } });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Validation failed');
  assert.ok(result.body.details.some((detail) => detail.field === 'name'));
  for (const detail of result.body.details) assert.deepEqual(Object.keys(detail).sort(), ['field', 'message']);
  assert.equal('token' in result.body, false);
});

test('all protected routes reject missing authentication', async () => {
  for (const [method, route] of [
    ['GET', '/api/auth/me'], ['POST', '/api/auth/logout'],
    ['POST', '/api/services'], ['PUT', '/api/services/S-01'], ['DELETE', '/api/services/S-01'],
    ['GET', '/api/queue/tickets'], ['GET', '/api/queue/my-tickets'], ['GET', '/api/queue/notifications'],
    ['POST', '/api/queue/tickets'], ['GET', '/api/queue/tickets/missing'], ['DELETE', '/api/queue/tickets/missing'],
  ]) {
    assert.equal((await request(method, route)).status, 401, `${method} ${route}`);
  }
});

test('public service listing works and customers cannot use administrator routes', async () => {
  const list = await request('GET', '/api/services');
  assert.equal(list.status, 200);
  assert.equal(list.body.services.length, 3);
  const { token } = await session();
  for (const [method, route] of [
    ['POST', '/api/services'], ['PUT', '/api/services/S-01'],
    ['DELETE', '/api/services/S-01'], ['GET', '/api/queue/tickets'],
  ]) assert.equal((await request(method, route, { token })).status, 403, `${method} ${route}`);
});

test('administrators can create, validate, partially update, and delete services', async () => {
  const { token } = await session('admin');
  const invalid = await request('POST', '/api/services', { token, body: { name: 'Invalid' } });
  assert.equal(invalid.status, 400);
  const created = await request('POST', '/api/services', {
    token, body: { name: ' New service ', description: ' Help ', expectedDuration: '5', priorityLevel: 'low' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.service.name, 'New service');
  assert.equal(created.body.service.expectedDuration, 5);
  const route = `/api/services/${created.body.service.id}`;
  const updated = await request('PUT', route, { token, body: { expectedDuration: '7' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.service.expectedDuration, 7);
  assert.equal(updated.body.service.name, 'New service');
  assert.equal((await request('DELETE', route, { token })).status, 200);
  assert.equal((await request('DELETE', route, { token })).status, 404);
});

test('service updates reject unsupported fields and preserve the record identity', async () => {
  const { token } = await session('admin');
  const before = (await request('GET', '/api/services')).body.services.find((s) => s.id === 'S-01');
  for (const body of [
    { unexpected: true },
    { name: 'Tampered', id: 'replacement', createdAt: '2000-01-01T00:00:00.000Z' },
  ]) assert.equal((await request('PUT', '/api/services/S-01', { token, body })).status, 400);
  const after = (await request('GET', '/api/services')).body.services.find((s) => s.id === 'S-01');
  assert.deepEqual(after, before);
});

test('queue routes enforce ticket ownership and allow administrator removal', async () => {
  const owner = await session();
  const other = await session('other');
  const admin = await session('admin');
  assert.equal((await request('POST', '/api/queue/tickets', { token: owner.token, body: {} })).status, 400);
  assert.equal((await request('POST', '/api/queue/tickets', { token: owner.token, body: { serviceId: 'missing' } })).status, 404);
  await request('POST', '/api/queue/tickets', { token: other.token, body: { serviceId: 'S-01' } });
  const joined = await request('POST', '/api/queue/tickets', {
    token: owner.token, body: { serviceId: 'S-01', userId: other.user.id, customerName: 'Forged' },
  });
  assert.equal(joined.status, 201);
  assert.equal(joined.body.ticket.userId, owner.user.id);
  assert.equal(joined.body.ticket.customerName, owner.user.name);
  assert.equal(joined.body.ticket.status, 'waiting');
  const route = `/api/queue/tickets/${joined.body.ticket.id}`;
  assert.equal((await request('GET', route, { token: other.token })).status, 403);
  assert.equal((await request('DELETE', route, { token: other.token })).status, 403);
  assert.equal((await request('GET', route, { token: admin.token })).status, 200);
  const mine = await request('GET', '/api/queue/my-tickets', { token: owner.token });
  assert.equal(mine.body.tickets.length, 1);
  const removed = await request('DELETE', route, { token: admin.token });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.ticket.cancellationReason, 'removed');
  const notices = await request('GET', '/api/queue/notifications', { token: owner.token });
  assert.ok(notices.body.notifications.some((n) => n.type === 'removed'));
  assert.equal((await request('DELETE', route, { token: owner.token })).status, 409);
});

test('users can leave a serving ticket and the next ticket starts at departure time', async (t) => {
  const now = Date.UTC(2026, 0, 1);
  t.mock.timers.enable({ apis: ['Date'], now });
  const { token } = await session();
  const joined = await request('POST', '/api/queue/tickets', { token, body: { serviceId: 'S-01' } });
  const next = await request('POST', '/api/queue/tickets', { token, body: { serviceId: 'S-01' } });
  assert.equal(joined.body.ticket.status, 'serving');
  const route = `/api/queue/tickets/${joined.body.ticket.id}`;
  t.mock.timers.tick(3 * 60_000);
  const departed = await request('DELETE', route, { token });
  assert.equal(departed.status, 200);
  assert.equal(departed.body.ticket.status, 'cancelled');
  assert.equal(departed.body.ticket.cancellationReason, 'left');
  const successor = await request('GET', `/api/queue/tickets/${next.body.ticket.id}`, { token });
  assert.equal(successor.body.ticket.status, 'serving');
  assert.equal(successor.body.ticket.serviceStartedAt, new Date(now + 3 * 60_000).toISOString());
});

test('leaving after an unpolled completion preserves served history', async (t) => {
  const now = Date.UTC(2026, 0, 1);
  t.mock.timers.enable({ apis: ['Date'], now });
  const { token } = await session();
  const joined = await request('POST', '/api/queue/tickets', { token, body: { serviceId: 'S-01' } });
  t.mock.timers.tick(9 * 60_000);
  const route = `/api/queue/tickets/${joined.body.ticket.id}`;
  assert.equal((await request('DELETE', route, { token })).status, 409);
  assert.equal((await request('GET', route, { token })).body.ticket.status, 'served');
  const notices = await request('GET', '/api/queue/notifications', { token });
  assert.equal(notices.body.notifications.some((n) => n.type === 'removed'), false);
});

test('administrator removal starts the next ticket at removal time and blocks service deletion', async (t) => {
  const now = Date.UTC(2026, 0, 1);
  t.mock.timers.enable({ apis: ['Date'], now });
  const owner = await session();
  const admin = await session('admin');
  const first = await request('POST', '/api/queue/tickets', { token: owner.token, body: { serviceId: 'S-01' } });
  const second = await request('POST', '/api/queue/tickets', { token: owner.token, body: { serviceId: 'S-01' } });
  assert.equal((await request('DELETE', '/api/services/S-01', { token: admin.token })).status, 409);
  t.mock.timers.tick(3 * 60_000);
  assert.equal((await request('DELETE', `/api/queue/tickets/${first.body.ticket.id}`, { token: admin.token })).status, 200);
  const next = await request('GET', `/api/queue/tickets/${second.body.ticket.id}`, { token: owner.token });
  assert.equal(next.body.ticket.status, 'serving');
  assert.equal(next.body.ticket.serviceStartedAt, new Date(now + 3 * 60_000).toISOString());
});

test('Google sign-in reports its current unimplemented status', async () => {
  const result = await request('POST', '/api/auth/google', { body: {} });
  assert.equal(result.status, 501);
  assert.match(result.body.error, /not implemented/);
});


test('Serve Next REST API requires an administrator and starts the next ticket early', async (t) => {
  const now = Date.UTC(2026, 0, 1);
  t.mock.timers.enable({ apis: ['Date'], now });
  const owner = await session();
  const nextUser = await session('next-user');
  const admin = await session('admin');
  const route = '/api/queue/services/S-01/serve-next';
  const first = await request('POST', '/api/queue/tickets', {
    token: owner.token, body: { serviceId: 'S-01' },
  });
  const second = await request('POST', '/api/queue/tickets', {
    token: nextUser.token, body: { serviceId: 'S-01' },
  });
  assert.equal((await request('POST', route)).status, 401);
  assert.equal((await request('POST', route, { token: owner.token })).status, 403);
  assert.equal((await request('POST', '/api/queue/services/missing/serve-next', { token: admin.token })).status, 404);

  t.mock.timers.tick(3 * 60_000);
  const completed = await request('POST', route, { token: admin.token });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.ticket.id, first.body.ticket.id);
  assert.equal(completed.body.ticket.status, 'served');
  assert.equal(completed.body.ticket.servedAt, new Date(now + 3 * 60_000).toISOString());
  assert.equal(completed.body.nextTicket.id, second.body.ticket.id);
  assert.equal(completed.body.nextTicket.status, 'serving');
  assert.equal(completed.body.nextTicket.serviceStartedAt, new Date(now + 3 * 60_000).toISOString());
  const notifications = await request('GET', '/api/queue/notifications', { token: nextUser.token });
  assert.equal(notifications.body.notifications.filter((n) => n.type === 'your_turn').length, 1);
  assert.equal((await request('POST', '/api/queue/services/S-02/serve-next', { token: admin.token })).status, 409);
});

test('Serve Next at automatic completion does not skip a newly started ticket', async (t) => {
  const now = Date.UTC(2026, 0, 1);
  t.mock.timers.enable({ apis: ['Date'], now });
  const owner = await session();
  const admin = await session('admin');
  await request('POST', '/api/queue/tickets', { token: owner.token, body: { serviceId: 'S-01' } });
  const second = await request('POST', '/api/queue/tickets', {
    token: owner.token, body: { serviceId: 'S-01' },
  });
  t.mock.timers.tick(8 * 60_000);
  const result = await request('POST', '/api/queue/services/S-01/serve-next', { token: admin.token });
  assert.equal(result.status, 409);
  const ticket = await request('GET', `/api/queue/tickets/${second.body.ticket.id}`, { token: owner.token });
  assert.equal(ticket.body.ticket.status, 'serving');
  assert.equal(ticket.body.ticket.servedAt, null);
});
