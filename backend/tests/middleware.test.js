const test = require('node:test');
const assert = require('node:assert/strict');
const { freshModule, createResponse } = require('./helpers');

test('validation middleware calls next exactly once for requests without validation errors', () => {
  const validateRequest = freshModule('src/middleware/validate-request.js');
  const res = createResponse();
  let nextCalls = 0;

  validateRequest({ body: {}, params: {}, query: {} }, res, () => { nextCalls += 1; });

  assert.equal(nextCalls, 1);
  assert.equal(res.body, undefined);
});

test('validation middleware returns only safe field names and messages for invalid input', async () => {
  const { registerRules } = freshModule('src/modules/auth/auth.validation.js');
  const validateRequest = require('../src/middleware/validate-request');
  const password = 'private';
  const req = { body: { name: '', email: 'invalid', password }, params: {}, query: {} };
  for (const rule of registerRules) await rule.run(req);
  const res = createResponse();
  let nextCalls = 0;

  validateRequest(req, res, () => { nextCalls += 1; });

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Validation failed');
  assert.deepEqual(new Set(res.body.details.map(({ field }) => field)), new Set(['name', 'email', 'password']));
  for (const detail of res.body.details) {
    assert.deepEqual(Object.keys(detail).sort(), ['field', 'message']);
    assert.equal(typeof detail.field, 'string');
    assert.equal(typeof detail.message, 'string');
  }
  assert.equal(JSON.stringify(res.body).includes(password), false);
});

test('error middleware logs the original error and returns a generic 500 response', (t) => {
  const errorHandler = freshModule('src/middleware/error-handler.js');
  const log = t.mock.method(console, 'error', () => {});
  const error = new Error('secret database connection details');
  error.stack = 'private stack trace';
  const res = createResponse();
  let nextCalls = 0;

  errorHandler(error, {}, res, () => { nextCalls += 1; });

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(nextCalls, 0);
  assert.equal(log.mock.callCount(), 1);
  assert.equal(log.mock.calls[0].arguments[0], error);
});

test('error middleware preserves an explicit error status while hiding internal details', (t) => {
  const errorHandler = freshModule('src/middleware/error-handler.js');
  t.mock.method(console, 'error', () => {});
  const error = Object.assign(new Error('private upstream credentials'), { status: 503 });
  const res = createResponse();

  errorHandler(error, {}, res, () => assert.fail('Error handler should not call next'));

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: 'Internal server error' });
});
