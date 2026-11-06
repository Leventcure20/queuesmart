const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule, createResponse } = require('./helpers');
const { environment } = require('./sql-helpers');

function authController() {
  const controller = freshModule('src/modules/auth/auth.controller.js');
  return { controller, repo: require('../src/modules/auth/auth.repository'), email: require('../src/modules/auth/email.service') };
}

for (const mode of ['development', 'production']) {
  for (const configured of [true, false]) {
    test(`forgot-password handles ${mode} with SMTP ${configured ? 'configured' : 'unavailable'}`, async (t) => {
      environment(t, { NODE_ENV: mode, FRONTEND_URL: 'https://frontend.example/', SMTP_HOST: undefined, SMTP_FROM: undefined });
      const { controller, repo, email } = authController();
      t.mock.method(repo, 'createPasswordResetToken', async () => ({ token: 'abc', expiresAt: '2026-01-01T00:30:00+00:00' }));
      t.mock.method(email, 'isConfigured', () => configured);
      const send = t.mock.method(email, 'sendPasswordResetEmail', async () => true);
      const res = createResponse();
      await controller.forgotPassword({ body: { email: 'alex@example.com' } }, res, assert.ifError);
      if (mode === 'development') {
        assert.equal(res.body.resetLink, 'https://frontend.example/reset-password.html#token=abc&expiresAt=2026-01-01T00%3A30%3A00%2B00%3A00');
        assert.equal(send.mock.callCount(), 0);
      } else {
        assert.equal('resetLink' in res.body, false);
        assert.equal(send.mock.callCount(), configured ? 1 : 0);
        assert.match(res.body.message, configured ? /request received/ : /unavailable/);
      }
    });
  }
}

test('forgot-password for an unknown account does not send mail or expose a reset link', async (t) => {
  const { controller, repo, email } = authController();
  t.mock.method(repo, 'createPasswordResetToken', async () => null);
  const send = t.mock.method(email, 'sendPasswordResetEmail');
  const res = createResponse();
  await controller.forgotPassword({ body: { email: 'missing@example.com' } }, res, assert.ifError);
  assert.equal('resetLink' in res.body, false);
  assert.equal(send.mock.callCount(), 0);
});

test('SMTP failure does not leak reset links or internal errors to production clients', async (t) => {
  environment(t, { NODE_ENV: 'production' });
  const { controller, repo, email } = authController();
  t.mock.method(repo, 'createPasswordResetToken', async () => ({ token: 'secret', expiresAt: 'expiry' }));
  t.mock.method(email, 'isConfigured', () => true);
  t.mock.method(email, 'sendPasswordResetEmail', async () => { throw new Error('smtp credential details'); });
  t.mock.method(console, 'error', () => {});
  const res = createResponse();
  await controller.forgotPassword({ body: { email: 'alex@example.com' } }, res, assert.ifError);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: 'Password reset request received.' });
});

for (const success of [true, false]) {
  test(`reset-password controller returns ${success ? 'success' : '400 for an invalid token'}`, async (t) => {
    const { controller, repo } = authController();
    const reset = t.mock.method(repo, 'resetPassword', async () => success);
    const res = createResponse();
    await controller.resetPassword({ body: { token: 'token', password: 'new-password' } }, res, assert.ifError);
    assert.deepEqual(reset.mock.calls[0].arguments, ['token', 'new-password']);
    assert.equal(res.statusCode, success ? 200 : 400);
    assert.equal('token' in res.body, false);
  });
}

for (const method of ['forgotPassword', 'resetPassword']) {
  test(`${method} database failures reach Express error handling`, async (t) => {
    const { controller, repo } = authController();
    const error = new Error('database failed');
    t.mock.method(repo, method === 'forgotPassword' ? 'createPasswordResetToken' : 'resetPassword', async () => { throw error; });
    const next = t.mock.fn(), res = createResponse();
    await controller[method]({ body: {} }, res, next);
    assert.equal(next.mock.calls[0].arguments[0], error);
    assert.equal(res.body, undefined);
  });
}

function google(t) {
  environment(t, { GOOGLE_CLIENT_ID: 'test-client' });
  const controller = freshModule('src/modules/auth/google-auth.controller.js');
  return { controller, repo: require('../src/modules/auth/auth.repository'), OAuth2Client: require('google-auth-library').OAuth2Client };
}

for (const payload of [undefined, {}, { email: 'alex@example.com', email_verified: false }, { email_verified: true }]) {
  test(`Google rejects an unverified or incomplete identity: ${JSON.stringify(payload)}`, async (t) => {
    const { controller, repo, OAuth2Client } = google(t);
    t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({ getPayload: () => payload }));
    const create = t.mock.method(repo, 'findOrCreateGoogleUser');
    const res = createResponse();
    await controller.login({ body: { credential: 'token' } }, res, assert.ifError);
    assert.equal(res.statusCode, 401);
    assert.equal(create.mock.callCount(), 0);
  });
}

test('Google verification rejection returns 401 without calling the account repository', async (t) => {
  const { controller, repo, OAuth2Client } = google(t);
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => { throw new Error('expired'); });
  const create = t.mock.method(repo, 'findOrCreateGoogleUser');
  const res = createResponse();
  await controller.login({ body: { credential: 'token' } }, res, assert.ifError);
  assert.equal(res.statusCode, 401);
  assert.equal(create.mock.callCount(), 0);
});

test('Google login falls back to email name and forwards database errors', async (t) => {
  const { controller, repo, OAuth2Client } = google(t);
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({ getPayload: () => ({ email: 'alex@example.com', email_verified: true }) }));
  const error = new Error('DB failed');
  const create = t.mock.method(repo, 'findOrCreateGoogleUser', async () => { throw error; });
  const next = t.mock.fn();
  await controller.login({ body: { credential: 'token' } }, createResponse(), next);
  assert.deepEqual(create.mock.calls[0].arguments[0], { email: 'alex@example.com', name: 'alex' });
  assert.equal(next.mock.calls[0].arguments[0], error);
});

function email(t, values = {}) {
  environment(t, { SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'support@example.com', SMTP_PORT: undefined, SMTP_SECURE: undefined, SMTP_USER: undefined, SMTP_PASSWORD: undefined, ...values });
  const service = freshModule('src/modules/auth/email.service.js');
  const sendMail = t.mock.fn(async () => ({}));
  const create = t.mock.method(require('nodemailer'), 'createTransport', () => ({ sendMail }));
  return { service, create, sendMail };
}

test('unconfigured email delivery returns false without opening a transport', async (t) => {
  const { service, create } = email(t, { SMTP_HOST: undefined });
  assert.equal(service.isConfigured(), false);
  assert.equal(await service.sendPasswordResetEmail('a@example.com', 'https://example.com'), false);
  assert.equal(create.mock.callCount(), 0);
});

for (const [port, secure, expected] of [[undefined, undefined, false], ['465', undefined, true], ['587', 'TRUE', true], ['465', 'false', false]]) {
  test(`SMTP TLS policy for port ${port} and secure override ${secure}`, async (t) => {
    const { service, create, sendMail } = email(t, { SMTP_PORT: port, SMTP_SECURE: secure, SMTP_USER: 'sender', SMTP_PASSWORD: 'password' });
    assert.equal(await service.sendPasswordResetEmail('alex@example.com', 'https://frontend.example/reset#token=abc'), true);
    const options = create.mock.calls[0].arguments[0];
    assert.equal(options.secure, expected);
    assert.equal(options.requireTLS, !expected);
    assert.equal(options.port, port ? Number(port) : 587);
    assert.deepEqual(options.auth, { user: 'sender', pass: 'password' });
    assert.equal(options.connectionTimeout, 10000);
    const mail = sendMail.mock.calls[0].arguments[0];
    assert.equal(mail.to, 'alex@example.com');
    assert.equal(mail.from, 'support@example.com');
    assert.match(mail.text, /https:\/\/frontend.example\/reset#token=abc/);
    assert.match(mail.html, /href="https:\/\/frontend.example\/reset#token=abc"/);
  });
}

for (const values of [{ SMTP_USER: 'sender' }, { SMTP_PASSWORD: 'password' }]) {
  test(`incomplete SMTP authentication rejects before sending: ${Object.keys(values)[0]}`, async (t) => {
    const { service, create } = email(t, values);
    await assert.rejects(service.sendPasswordResetEmail('a@example.com', 'link'), /must both be configured/);
    assert.equal(create.mock.callCount(), 0);
  });
}

test('SMTP without credentials omits auth and delivery errors propagate', async (t) => {
  const { service, create, sendMail } = email(t);
  const error = new Error('connection refused');
  sendMail.mock.mockImplementation(async () => { throw error; });
  await assert.rejects(service.sendPasswordResetEmail('a@example.com', 'link'), (e) => e === error);
  assert.equal('auth' in create.mock.calls[0].arguments[0], false);
});
