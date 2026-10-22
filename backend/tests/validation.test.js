const test = require('node:test');
const assert = require('node:assert/strict');
const { freshModule, createResponse } = require('./helpers');

function authRules() {
  return freshModule('src/modules/auth/auth.validation.js');
}

function serviceRules() {
  return freshModule('src/modules/services/services.validation.js');
}

async function validate(rules, body = {}, params = {}) {
  const req = { body, params, query: {} };
  for (const rule of rules) await rule.run(req);
  const validateRequest = require('../src/middleware/validate-request');
  const res = createResponse();
  let nextCalls = 0;
  validateRequest(req, res, () => { nextCalls += 1; });
  return { req, res, nextCalls };
}

function assertAccepted(result) {
  assert.equal(result.nextCalls, 1);
  assert.equal(result.res.body, undefined);
}

function assertRejected(result, field) {
  assert.equal(result.nextCalls, 0);
  assert.equal(result.res.statusCode, 400);
  assert.equal(result.res.body.error, 'Validation failed');
  assert.ok(result.res.body.details.some((detail) => detail.field === field),
    `Expected a validation error for ${JSON.stringify(field)}`);
}

const registration = () => ({ name: 'Jane Doe', email: 'jane@example.com', password: 'password1' });
const serviceInput = () => ({
  name: 'General Inquiry',
  description: 'Account support',
  expectedDuration: 8,
  priorityLevel: 'medium',
});

test('registration validation trims names and normalizes email without changing passwords', async () => {
  const password = '  valid password  ';
  const result = await validate(authRules().registerRules, {
    name: '  Jane Doe  ', email: '  Jane@Example.COM  ', password,
  });

  assertAccepted(result);
  assert.equal(result.req.body.name, 'Jane Doe');
  assert.equal(result.req.body.email, 'jane@example.com');
  assert.equal(result.req.body.password, password);
});

for (const [label, name] of [['missing', undefined], ['empty', ''], ['whitespace-only', '   ']]) {
  test(`registration validation rejects a ${label} name`, async () => {
    assertRejected(await validate(authRules().registerRules, { ...registration(), name }), 'name');
  });
}

for (const [label, email] of [['missing', undefined], ['malformed', 'not-an-email'], ['incomplete', 'jane@']]) {
  test(`registration validation rejects a ${label} email`, async () => {
    assertRejected(await validate(authRules().registerRules, { ...registration(), email }), 'email');
  });
}

for (const [label, password] of [
  ['missing', undefined], ['null', null], ['numeric', 12345678], ['short', '1234567'],
]) {
  test(`registration validation rejects a ${label} password`, async () => {
    assertRejected(await validate(authRules().registerRules, { ...registration(), password }), 'password');
  });
}

test('registration validation accepts a password at the eight-character minimum', async () => {
  assertAccepted(await validate(authRules().registerRules, { ...registration(), password: '12345678' }));
});

for (const ruleName of ['registerRules', 'loginRules']) {
  for (const [label, password] of [
    ['72 ASCII bytes', 'a'.repeat(72)],
    ['72 UTF-8 bytes', '😀'.repeat(18)],
  ]) {
    test(`${ruleName} accepts a password with ${label}`, async () => {
      assert.equal(Buffer.byteLength(password, 'utf8'), 72);
      assertAccepted(await validate(authRules()[ruleName], { ...registration(), password }));
    });
  }

  for (const [label, password] of [
    ['73 ASCII bytes', 'a'.repeat(73)],
    ['76 UTF-8 bytes', '😀'.repeat(19)],
  ]) {
    test(`${ruleName} rejects a password with ${label}`, async () => {
      const result = await validate(authRules()[ruleName], { ...registration(), password });
      assertRejected(result, 'password');
      assert.ok(result.res.body.details.some(({ message }) => message === 'Password must be no more than 72 bytes'));
    });
  }
}

test('login validation normalizes the email and accepts a nonempty legacy short password', async () => {
  const result = await validate(authRules().loginRules, { email: '  Jane@Example.COM  ', password: 'x' });

  assertAccepted(result);
  assert.equal(result.req.body.email, 'jane@example.com');
  assert.equal(result.req.body.password, 'x');
});

for (const [label, password] of [['missing', undefined], ['empty', ''], ['numeric', 12345678]]) {
  test(`login validation rejects a ${label} password`, async () => {
    assertRejected(await validate(authRules().loginRules, { email: 'jane@example.com', password }), 'password');
  });
}

test('login validation rejects malformed email addresses', async () => {
  assertRejected(await validate(authRules().loginRules, { email: 'invalid', password: 'password1' }), 'email');
});

test('service creation validation trims text and converts integer durations', async () => {
  const result = await validate(serviceRules().createServiceRules, {
    name: '  Support  ', description: '  Account support  ', expectedDuration: '15', priorityLevel: 'high',
  });

  assertAccepted(result);
  assert.deepEqual(result.req.body, {
    name: 'Support', description: 'Account support', expectedDuration: 15, priorityLevel: 'high',
  });
});

for (const priorityLevel of ['low', 'medium', 'high']) {
  test(`service creation validation accepts ${priorityLevel} priority`, async () => {
    assertAccepted(await validate(serviceRules().createServiceRules, { ...serviceInput(), priorityLevel }));
  });
}

for (const field of ['name', 'description', 'expectedDuration', 'priorityLevel']) {
  test(`service creation validation requires ${field}`, async () => {
    const body = serviceInput();
    delete body[field];
    assertRejected(await validate(serviceRules().createServiceRules, body), field);
  });
}

for (const field of ['name', 'description']) {
  test(`service creation validation rejects whitespace-only ${field}`, async () => {
    assertRejected(await validate(serviceRules().createServiceRules, { ...serviceInput(), [field]: '  ' }), field);
  });
}

for (const [label, expectedDuration] of [
  ['zero', 0], ['negative', -1], ['fractional', 1.5], ['fractional text', '1.5'], ['nonnumeric', 'soon'], ['null', null],
]) {
  test(`service creation validation rejects a ${label} duration`, async () => {
    assertRejected(await validate(serviceRules().createServiceRules, { ...serviceInput(), expectedDuration }), 'expectedDuration');
  });
}

test('service creation validation rejects unsupported priority values', async () => {
  assertRejected(await validate(serviceRules().createServiceRules, { ...serviceInput(), priorityLevel: 'urgent' }), 'priorityLevel');
});

for (const [field, value] of Object.entries(serviceInput())) {
  test(`service update validation accepts ${field} as the only changed field`, async () => {
    const result = await validate(serviceRules().updateServiceRules, { [field]: value }, { id: '  S-01  ' });

    assertAccepted(result);
    assert.equal(result.req.params.id, 'S-01');
    assert.deepEqual(result.req.body, { [field]: value });
  });
}

test('service update validation rejects an empty update', async () => {
  const result = await validate(serviceRules().updateServiceRules, {}, { id: 'S-01' });

  assert.equal(result.res.statusCode, 400);
  assert.equal(result.nextCalls, 0);
  assert.ok(result.res.body.details.some(({ message }) => message === 'At least one service field must be provided'));
});

for (const field of ['id', 'createdAt', 'updatedAt', 'unexpected']) {
  for (const includeEditableField of [false, true]) {
    test(`service update validation rejects ${field} ${includeEditableField ? 'alongside a supported change' : 'as the only change'}`, async () => {
      const body = {
        ...(includeEditableField ? { name: 'Updated Support' } : {}),
        [field]: 'client-controlled-value',
      };
      const result = await validate(serviceRules().updateServiceRules, body, { id: 'S-01' });

      assert.equal(result.res.statusCode, 400);
      assert.equal(result.nextCalls, 0);
      assert.ok(result.res.body.details.some(({ message }) =>
        message === 'Only name, description, expectedDuration, and priorityLevel can be updated'));
    });
  }
}

for (const [label, id] of [['missing', undefined], ['empty', ''], ['whitespace-only', '  ']]) {
  test(`service update validation rejects a ${label} service ID`, async () => {
    assertRejected(await validate(serviceRules().updateServiceRules, { name: 'Support' }, { id }), 'id');
  });
}

for (const [field, value] of [
  ['name', '  '], ['description', '  '], ['expectedDuration', 0], ['expectedDuration', 1.5], ['priorityLevel', 'urgent'],
]) {
  test(`service update validation rejects invalid ${field} ${JSON.stringify(value)}`, async () => {
    assertRejected(await validate(serviceRules().updateServiceRules, { [field]: value }, { id: 'S-01' }), field);
  });
}

for (const [rulesName, field, location] of [
  ['joinQueueRules', 'serviceId', 'body'],
  ['leaveQueueRules', 'ticketId', 'params'],
]) {
  test(`${rulesName} trims the ${field}`, async () => {
    const rules = freshModule('src/modules/queue/queue.validation.js')[rulesName];
    const body = location === 'body' ? { [field]: '  identifier  ' } : {};
    const params = location === 'params' ? { [field]: '  identifier  ' } : {};
    const result = await validate(rules, body, params);

    assertAccepted(result);
    assert.equal(result.req[location][field], 'identifier');
  });

  for (const [label, value] of [['missing', undefined], ['empty', ''], ['whitespace-only', '  ']]) {
    test(`${rulesName} rejects a ${label} ${field}`, async () => {
      const rules = freshModule('src/modules/queue/queue.validation.js')[rulesName];
      const body = location === 'body' ? { [field]: value } : {};
      const params = location === 'params' ? { [field]: value } : {};
      assertRejected(await validate(rules, body, params), field);
    });
  }
}
