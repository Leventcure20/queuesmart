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
  const { token } = await session();
  const health = await request('GET', '/api/health', { token, headers: { Origin: 'http://localhost:8000' } });
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { status: 'ok' });
  assert.equal(health.headers.get('access-control-allow-origin'), 'http://localhost:8000');
  assert.equal(health.headers.get('vary'), 'Origin');

  const alternate = await request('GET', '/api/health', { token, headers: { Origin: 'http://127.0.0.1:8000' } });
  assert.equal(alternate.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8000');
  const unrelated = await request('GET', '/api/health', { token, headers: { Origin: 'https://unrelated.example' } });
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
    ['GET', '/api/services'], ['GET', '/api/health'],
    ['POST', '/api/services'], ['PUT', '/api/services/S-01'], ['DELETE', '/api/services/S-01'],
    ['GET', '/api/queue/tickets'], ['GET', '/api/queue/my-tickets'], ['GET', '/api/queue/notifications'],
    ['POST', '/api/queue/tickets'], ['POST', '/api/queue/serve-next'],
    ['GET', '/api/queue/tickets/missing'], ['DELETE', '/api/queue/tickets/missing'],
  ]) {
    assert.equal((await request(method, route)).status, 401, `${method} ${route}`);
  }
});

test('service listing requires login and customers cannot use administrator routes', async () => {
  assert.equal((await request('GET', '/api/services')).status, 401);
  const { token } = await session();
  const list = await request('GET', '/api/services', { token });
  assert.equal(list.status, 200);
  assert.equal(list.body.services.length, 3);
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
  const before = (await request('GET', '/api/services', { token })).body.services.find((s) => s.id === 'S-01');
  for (const body of [
    { unexpected: true },
    { name: 'Tampered', id: 'replacement', createdAt: '2000-01-01T00:00:00.000Z' },
  ]) assert.equal((await request('PUT', '/api/services/S-01', { token, body })).status, 400);
  const after = (await request('GET', '/api/services', { token })).body.services.find((s) => s.id === 'S-01');
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

test('Google sign-in rejects a missing credential and reports missing configuration', async () => {
  const result = await request('POST', '/api/auth/google', { body: {} });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /credential is required/);
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  try {
    const unconfigured = await request('POST', '/api/auth/google', { body: { credential: 'token' } });
    assert.equal(unconfigured.status, 503);
  } finally {
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
  }
});

test('Google sign-in verifies the ID token and creates a normal QueueSmart session', async (t) => {
  const { OAuth2Client } = require('google-auth-library');
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async ({ idToken, audience }) => {
    assert.equal(idToken, 'valid-google-id-token');
    assert.equal(audience, 'test-google-client-id');
    return { getPayload: () => ({ email: 'GOOGLE@example.com', email_verified: true, name: 'Google User' }) };
  });
  try {
    const result = await request('POST', '/api/auth/google', { body: { credential: 'valid-google-id-token' } });
    assert.equal(result.status, 200);
    assert.equal(result.body.user.email, 'google@example.com');
    assert.equal(result.body.user.role, 'user');
    assert.equal(result.body.tokenType, 'Bearer');
    assert.ok(result.body.token);
    const current = await request('GET', '/api/auth/me', { token: result.body.token });
    assert.equal(current.body.user.id, result.body.user.id);
  } finally {
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
  }
});

test('queue admin routes require authentication and enforce roles and validation', async () => {
  const owner = await session();
  const admin = await session('admin');
  const queue = require('../src/modules/queue/queue.repository').ensureQueueForService({ id: 'S-01' });
  const route = `/api/queue/queues/${queue.id}`;
  assert.equal((await request('GET', '/api/queue/queues')).status, 401);
  assert.equal((await request('PATCH', route, { body: { status: 'closed' } })).status, 401);
  assert.equal((await request('POST', '/api/queue/serve-next', { body: { serviceId: 'S-01' } })).status, 401);
  assert.equal((await request('GET', '/api/queue/queues', { token: owner.token })).status, 200);
  assert.equal((await request('PATCH', route, { token: owner.token, body: { status: 'closed' } })).status, 403);
  assert.equal((await request('POST', '/api/queue/serve-next', { token: owner.token, body: { serviceId: 'S-01' } })).status, 403);
  assert.equal((await request('PATCH', '/api/queue/queues/invalid', { token: admin.token, body: { status: 'closed' } })).status, 400);
  assert.equal((await request('PATCH', route, { token: admin.token, body: { status: 'invalid' } })).status, 400);
  assert.equal((await request('PATCH', route, { token: admin.token, body: { status: 'closed' } })).status, 200);
  assert.equal((await request('POST', '/api/queue/tickets', { token: owner.token, body: { serviceId: 'S-01' } })).status, 409);
  assert.equal((await request('PATCH', route, { token: admin.token, body: { status: 'open' } })).status, 200);
  assert.equal((await request('POST', '/api/queue/tickets', { token: owner.token, body: { serviceId: 'S-01' } })).status, 201);
  const served = await request('POST', '/api/queue/serve-next', { token: admin.token, body: { serviceId: 'S-01' } });
  assert.equal(served.status, 200);
  assert.equal(served.body.completed.status, 'served');
  assert.equal(served.body.next, null);
});

test('password recovery routes apply validation before invoking storage', async () => {
  assert.equal((await request('POST', '/api/auth/forgot-password', { body: { email: 'invalid' } })).status, 400);
  assert.equal((await request('POST', '/api/auth/reset-password', { body: { token: 'invalid', password: 'password123' } })).status, 400);
  const valid = await request('POST', '/api/auth/reset-password', { body: { token: 'a'.repeat(64), password: 'password123' } });
  assert.equal(valid.status, 400);
  assert.match(valid.body.error, /invalid or has expired/);
});

test('notification viewed route authenticates users and cannot mark another account history', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 1) });
  const owner = await session();
  const other = await session('other');
  for (const token of [owner.token, other.token]) {
    assert.equal((await request('POST', '/api/queue/tickets', { token, body: { serviceId: 'S-01' } })).status, 201);
  }
  assert.equal((await request('PATCH', '/api/queue/notifications/viewed')).status, 401);
  const route = '/api/queue/notifications/viewed';
  const viewed = await request('PATCH', route, { token: owner.token, body: { userId: other.user.id } });
  assert.equal(viewed.status, 200);
  assert.ok(viewed.body.notifications.length > 0);
  assert.ok(viewed.body.notifications.every((n) => n.status === 'viewed' && n.viewedAt === new Date().toISOString()));
  const otherNotices = await request('GET', '/api/queue/notifications', { token: other.token });
  assert.ok(otherNotices.body.notifications.length > 0);
  assert.ok(otherNotices.body.notifications.every((n) => n.status === 'sent' && n.viewedAt === null));
  t.mock.timers.tick(1000);
  const repeated = await request('PATCH', route, { token: owner.token });
  assert.deepEqual(repeated.body.notifications, viewed.body.notifications);
  const repository = require('../src/modules/queue/notifications.repository');
  const failure = new Error('history database unavailable');
  t.mock.method(repository, 'markAllViewed', async () => { throw failure; });
  t.mock.method(console, 'error', () => {});
  const failed = await request('PATCH', route, { token: owner.token });
  assert.equal(failed.status, 500);
  assert.deepEqual(failed.body, { error: 'Internal server error' });
});

test('API rejects malformed identifiers and serve-next payloads before controller work', async (t) => {
  const owner = await session();
  const admin = await session('admin');
  const queue = require('../src/modules/queue/queue.repository');
  const services = require('../src/modules/services/services.repository');
  const serve = t.mock.method(queue, 'serveNext');
  const remove = t.mock.method(services, 'remove');
  for (const body of [{}, { serviceId: null }, { serviceId: ['S-01'] }, { serviceId: 's'.repeat(65) }]) {
    assert.equal((await request('POST', '/api/queue/serve-next', { token: admin.token, body })).status, 400);
  }
  for (const method of ['GET', 'DELETE']) {
    assert.equal((await request(method, '/api/queue/tickets/invalid-id', { token: owner.token })).status, 400);
  }
  assert.equal((await request('DELETE', '/api/services/' + 's'.repeat(65), { token: admin.token })).status, 400);
  assert.equal((await request('PUT', '/api/services/' + 's'.repeat(65), { token: admin.token, body: { name: 'Help' } })).status, 400);
  assert.equal((await request('PATCH', '/api/queue/queues/11111111-1111-4111-8111-111111111111', { token: admin.token, body: { status: ['open'] } })).status, 400);
  assert.equal(serve.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
});
