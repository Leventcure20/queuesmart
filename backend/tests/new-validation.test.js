const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule, createResponse } = require('./helpers');

async function valid(module, ruleName, body, params = {}) {
  const rules = freshModule(`src/modules/${module}`)[ruleName];
  const req = { body, params, query: {} };
  for (const rule of rules) await rule.run(req);
  const next = [], res = createResponse();
  require('../src/middleware/validate-request')(req, res, () => next.push(true));
  return next.length === 1;
}

for (const [label, value, expected] of [['valid', 'alex@example.com', true], ['normalized', ' ALEX@example.com ', true], ['missing', undefined, false], ['array', ['a@example.com'], false], ['object', {}, false], ['invalid', 'not-email', false], ['too long', 'a'.repeat(245) + '@example.com', false]]) {
  test(`forgot-password validation handles ${label} email`, async () => {
    assert.equal(await valid('auth/auth.validation.js', 'forgotPasswordRules', { email: value }), expected);
  });
}

for (const [label, token, password, expected] of [
  ['valid', 'a'.repeat(64), 'password123', true], ['uppercase token', 'A'.repeat(64), 'password123', true],
  ['missing token', undefined, 'password123', false], ['short token', 'a'.repeat(63), 'password123', false],
  ['invalid token', 'g'.repeat(64), 'password123', false], ['short password', 'a'.repeat(64), 'short', false],
  ['72-byte password', 'a'.repeat(64), 'a'.repeat(72), true], ['73-byte password', 'a'.repeat(64), 'a'.repeat(73), false],
  ['multibyte limit', 'a'.repeat(64), '😀'.repeat(19), false], ['numeric password', 'a'.repeat(64), 12345678, false],
]) {
  test(`reset-password validation handles ${label}`, async () => {
    assert.equal(await valid('auth/auth.validation.js', 'resetPasswordRules', { token, password }), expected);
  });
}

for (const [name, expected] of [['a'.repeat(100), true], ['a'.repeat(101), false], [123, false], [['Alex'], false]]) {
  test(`registration enforces name type and length for ${JSON.stringify(name)}`, async () => {
    assert.equal(await valid('auth/auth.validation.js', 'registerRules', { name, email: 'alex@example.com', password: 'password123' }), expected);
  });
}

for (const [id, status, expected] of [
  ['11111111-1111-4111-8111-111111111111', 'open', true], ['11111111-1111-4111-8111-111111111111', 'closed', true],
  ['invalid', 'closed', false], ['', 'open', false], ['11111111-1111-4111-8111-111111111111', 'paused', false],
  ['11111111-1111-4111-8111-111111111111', undefined, false],
]) {
  test(`queue status validation checks ${id} and ${status}`, async () => {
    assert.equal(await valid('queue/queue.validation.js', 'updateQueueStatusRules', { status }, { queueId: id }), expected);
  });
}
