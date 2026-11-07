const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule, createResponse } = require('./helpers');
const { environment } = require('./sql-helpers');

function setup(t, payload = { email: 'alex@example.com', email_verified: true, name: 'Alex' }) {
  environment(t, { GOOGLE_CLIENT_ID: 'test-client' });
  const controller = freshModule('src/modules/auth/google-auth.controller.js');
  const verify = t.mock.method(require('google-auth-library').OAuth2Client.prototype, 'verifyIdToken', async () => ({ getPayload: () => payload }));
  const repo = require('../src/modules/auth/auth.repository');
  const find = t.mock.method(repo, 'findOrCreateGoogleUser', async () => ({ id: 'user-1', role: 'user' }));
  t.mock.method(repo, 'createSession', () => ({ token: 'session', expiresAt: 'expiry' }));
  return { controller, verify, find };
}

for (const [label, credential] of [
  ['blank', '   '], ['oversized', 'x'.repeat(8193)], ['numeric', 123],
  ['array', ['token']], ['object', {}], ['null', null], ['missing', undefined],
]) {
  test(`Google rejects ${label} credentials before calling verification or storage`, async (t) => {
    const { controller, verify, find } = setup(t), res = createResponse();
    await controller.login({ body: { credential } }, res, assert.ifError);
    assert.equal(res.statusCode, 400);
    assert.equal(verify.mock.callCount(), 0);
    assert.equal(find.mock.callCount(), 0);
  });
}

test('Google accepts the 8192-character boundary and verifies against the configured audience', async (t) => {
  const { controller, verify } = setup(t), credential = 'x'.repeat(8192), res = createResponse();
  await controller.login({ body: { credential } }, res, assert.ifError);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(verify.mock.calls[0].arguments[0], { idToken: credential, audience: 'test-client' });
  assert.equal(res.body.token, 'session');
});

for (const [label, email] of [
  ['blank', '  '], ['oversized', 'a'.repeat(243) + '@example.com'],
  ['numeric', 123], ['array', ['alex@example.com']], ['object', {}], ['null', null],
]) {
  test(`Google rejects a ${label} verified-email claim before accessing accounts`, async (t) => {
    const { controller, find } = setup(t, { email, email_verified: true }), res = createResponse();
    await controller.login({ body: { credential: 'token' } }, res, assert.ifError);
    assert.equal(res.statusCode, 401);
    assert.equal(find.mock.callCount(), 0);
  });
}

test('Google accepts an email at the 254-character limit', async (t) => {
  const email = 'a'.repeat(242) + '@example.com';
  assert.equal(email.length, 254);
  const { controller, find } = setup(t, { email, name: 'Alex', email_verified: true }), res = createResponse();
  await controller.login({ body: { credential: 'token' } }, res, assert.ifError);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(find.mock.calls[0].arguments[0], { name: 'Alex', email });
});
