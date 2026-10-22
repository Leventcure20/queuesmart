const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule, createResponse } = require('./helpers');

describe('auth controller', () => {
  let controller;
  let repository;
  const user = { id: 'user-1', name: 'Alex', email: 'alex@example.com', role: 'user' };
  const session = { token: 'session-token', expiresAt: '2026-01-16T10:30:00.000Z' };
  const credentials = { name: 'Alex', email: 'alex@example.com', password: 'secure-password' };

  beforeEach(() => {
    controller = freshModule('src/modules/auth/auth.controller.js');
    repository = require('../src/modules/auth/auth.repository');
  });

  it('registers an account and returns a 201 response with its bearer session', async (t) => {
    const createUser = t.mock.method(repository, 'createUser', async () => user);
    const createSession = t.mock.method(repository, 'createSession', () => session);
    const res = createResponse();
    const next = t.mock.fn();

    await controller.register({ body: { ...credentials, role: 'admin' } }, res, next);

    assert.deepEqual(createUser.mock.calls[0].arguments, [credentials]);
    assert.deepEqual(createSession.mock.calls[0].arguments, [user]);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { user, ...session, tokenType: 'Bearer' });
    assert.equal(next.mock.callCount(), 0);
  });

  it('returns a conflict without issuing a session for a duplicate registration', async (t) => {
    t.mock.method(repository, 'createUser', async () => null);
    const createSession = t.mock.method(repository, 'createSession');
    const res = createResponse();
    const next = t.mock.fn();

    await controller.register({ body: credentials }, res, next);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { error: 'An account with this email already exists' });
    assert.equal(createSession.mock.callCount(), 0);
    assert.equal(next.mock.callCount(), 0);
  });

  it('passes account creation failures to the error handler', async (t) => {
    const error = new Error('Account storage unavailable');
    t.mock.method(repository, 'createUser', async () => { throw error; });
    const createSession = t.mock.method(repository, 'createSession');
    const res = createResponse();
    const next = t.mock.fn();

    await controller.register({ body: credentials }, res, next);

    assert.deepEqual(next.mock.calls.map((call) => call.arguments), [[error]]);
    assert.equal(createSession.mock.callCount(), 0);
    assert.equal(res.body, undefined);
  });

  it('passes session creation failures during registration to the error handler', async (t) => {
    const error = new Error('Session creation failed');
    t.mock.method(repository, 'createUser', async () => user);
    t.mock.method(repository, 'createSession', () => { throw error; });
    const next = t.mock.fn();
    const res = createResponse();

    await controller.register({ body: credentials }, res, next);

    assert.deepEqual(next.mock.calls.map((call) => call.arguments), [[error]]);
    assert.equal(res.body, undefined);
  });

  it('authenticates credentials and returns a bearer session', async (t) => {
    const authenticate = t.mock.method(repository, 'authenticate', async () => user);
    const createSession = t.mock.method(repository, 'createSession', () => session);
    const res = createResponse();
    const next = t.mock.fn();

    await controller.login({ body: credentials }, res, next);

    assert.deepEqual(authenticate.mock.calls[0].arguments, [credentials.email, credentials.password]);
    assert.deepEqual(createSession.mock.calls[0].arguments, [user]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { user, ...session, tokenType: 'Bearer' });
    assert.equal(next.mock.callCount(), 0);
  });

  it('returns the invalid-credentials response without issuing a session', async (t) => {
    t.mock.method(repository, 'authenticate', async () => null);
    const createSession = t.mock.method(repository, 'createSession');
    const res = createResponse();
    const next = t.mock.fn();

    await controller.login({ body: credentials }, res, next);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Invalid email or password' });
    assert.equal(createSession.mock.callCount(), 0);
    assert.equal(next.mock.callCount(), 0);
  });

  it('passes authentication failures to the error handler', async (t) => {
    const error = new Error('Account lookup failed');
    t.mock.method(repository, 'authenticate', async () => { throw error; });
    const createSession = t.mock.method(repository, 'createSession');
    const next = t.mock.fn();
    const res = createResponse();

    await controller.login({ body: credentials }, res, next);

    assert.deepEqual(next.mock.calls.map((call) => call.arguments), [[error]]);
    assert.equal(createSession.mock.callCount(), 0);
    assert.equal(res.body, undefined);
  });

  it('passes session creation failures during login to the error handler', async (t) => {
    const error = new Error('Session creation failed');
    t.mock.method(repository, 'authenticate', async () => user);
    t.mock.method(repository, 'createSession', () => { throw error; });
    const next = t.mock.fn();
    const res = createResponse();

    await controller.login({ body: credentials }, res, next);

    assert.deepEqual(next.mock.calls.map((call) => call.arguments), [[error]]);
    assert.equal(res.body, undefined);
  });

  it('returns the account attached by authentication middleware', () => {
    const res = createResponse();
    controller.me({ user }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { user });
  });

  it('revokes the current session and ends logout with no response body', (t) => {
    const revokeSession = t.mock.method(repository, 'revokeSession', () => true);
    const res = createResponse();

    controller.logout({ authToken: session.token }, res);

    assert.deepEqual(revokeSession.mock.calls[0].arguments, [session.token]);
    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
    assert.equal(res.body, undefined);
  });
});
