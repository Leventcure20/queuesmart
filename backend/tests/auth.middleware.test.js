const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule, createResponse } = require('./helpers');

describe('authentication middleware', () => {
  let authenticate;
  let repository;

  beforeEach(() => {
    authenticate = freshModule('src/modules/auth/auth.middleware.js');
    repository = require('../src/modules/auth/auth.repository');
  });

  for (const [label, authorization] of [
    ['missing header', undefined],
    ['empty header', ''],
    ['wrong scheme', 'Basic abc123'],
    ['missing bearer token', 'Bearer'],
    ['empty bearer token', 'Bearer '],
  ]) {
    it(`rejects a ${label} before looking up a session`, (t) => {
      const findUserByToken = t.mock.method(repository, 'findUserByToken');
      const req = { get: (name) => name === 'authorization' ? authorization : undefined };
      const res = createResponse();
      const next = t.mock.fn();

      authenticate(req, res, next);

      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { error: 'Authentication required' });
      assert.equal(findUserByToken.mock.callCount(), 0);
      assert.equal(next.mock.callCount(), 0);
      assert.equal(req.user, undefined);
      assert.equal(req.authToken, undefined);
    });
  }

  it('rejects an invalid or expired token without attaching an account', (t) => {
    const findUserByToken = t.mock.method(repository, 'findUserByToken', () => null);
    const req = { get: () => 'Bearer invalid-token' };
    const res = createResponse();
    const next = t.mock.fn();

    authenticate(req, res, next);

    assert.deepEqual(findUserByToken.mock.calls[0].arguments, ['invalid-token']);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Invalid or expired token' });
    assert.equal(next.mock.callCount(), 0);
    assert.equal(req.user, undefined);
    assert.equal(req.authToken, undefined);
  });

  it('attaches the account and token before continuing an authenticated request', (t) => {
    const user = { id: 'user-1', name: 'Alex', email: 'alex@example.com', role: 'user' };
    const findUserByToken = t.mock.method(repository, 'findUserByToken', () => user);
    const get = t.mock.fn(() => 'Bearer valid-token');
    const req = { get };
    const res = createResponse();
    const next = t.mock.fn(() => {
      assert.equal(req.user, user);
      assert.equal(req.authToken, 'valid-token');
    });

    authenticate(req, res, next);

    assert.deepEqual(get.mock.calls[0].arguments, ['authorization']);
    assert.deepEqual(findUserByToken.mock.calls[0].arguments, ['valid-token']);
    assert.equal(next.mock.callCount(), 1);
    assert.deepEqual(next.mock.calls[0].arguments, []);
    assert.equal(res.body, undefined);
  });
});

describe('role authorization middleware', () => {
  let requireRole;

  beforeEach(() => {
    requireRole = freshModule('src/modules/auth/require-role.js');
  });

  it('requires an authenticated account before checking roles', (t) => {
    const res = createResponse();
    const next = t.mock.fn();

    requireRole('admin')({}, res, next);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Authentication required' });
    assert.equal(next.mock.callCount(), 0);
  });

  it('denies an authenticated account with insufficient permissions', (t) => {
    const res = createResponse();
    const next = t.mock.fn();

    requireRole('admin')({ user: { role: 'user' } }, res, next);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Insufficient permissions' });
    assert.equal(next.mock.callCount(), 0);
  });

  it('allows an administrator to continue to administrator routes', (t) => {
    const res = createResponse();
    const next = t.mock.fn();

    requireRole('admin')({ user: { role: 'admin' } }, res, next);

    assert.equal(next.mock.callCount(), 1);
    assert.deepEqual(next.mock.calls[0].arguments, []);
    assert.equal(res.body, undefined);
  });

  it('allows any explicitly permitted role', (t) => {
    const middleware = requireRole('user', 'admin');
    for (const role of ['user', 'admin']) {
      const res = createResponse();
      const next = t.mock.fn();
      middleware({ user: { role } }, res, next);

      assert.equal(next.mock.callCount(), 1, role);
      assert.equal(res.body, undefined, role);
    }
  });

  it('denies unknown or missing roles even if an account is attached', (t) => {
    for (const role of [undefined, 'superadmin', 'ADMIN']) {
      const res = createResponse();
      const next = t.mock.fn();
      requireRole('admin')({ user: { role } }, res, next);

      assert.equal(res.statusCode, 403);
      assert.equal(next.mock.callCount(), 0);
    }
  });
});
