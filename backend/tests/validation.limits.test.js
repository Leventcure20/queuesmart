const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule, createResponse } = require('./helpers');

async function validate(module, name, body = {}, params = {}) {
  const rules = freshModule(`src/modules/${module}`)[name];
  const req = { body, params, query: {} }, res = createResponse();
  for (const rule of rules) await rule.run(req);
  let accepted = false;
  require('../src/middleware/validate-request')(req, res, () => { accepted = true; });
  return { accepted, req, res };
}

for (const rule of ['joinQueueRules', 'serveNextRules']) {
  for (const [label, value, expected] of [
    ['64-character boundary', 's'.repeat(64), true], ['65 characters', 's'.repeat(65), false],
    ['trimmed boundary', '  ' + 's'.repeat(64) + '  ', true], ['numeric ID', 123, false],
    ['array ID', ['S-01'], false], ['object ID', {}, false], ['null ID', null, false],
    ['missing ID', undefined, false], ['blank ID', '   ', false],
  ]) {
    test(`${rule} handles ${label}`, async () => {
      const result = await validate('queue/queue.validation.js', rule, { serviceId: value });
      assert.equal(result.accepted, expected);
      if (expected) assert.equal(result.req.body.serviceId, value.trim());
      else assert.equal(result.res.statusCode, 400);
    });
  }
}

for (const rule of ['serviceIdRules', 'updateServiceRules']) {
  for (const [label, id, expected] of [
    ['64-character boundary', 's'.repeat(64), true], ['65 characters', 's'.repeat(65), false],
    ['trimmed ID', ' S-01 ', true], ['missing ID', undefined, false], ['numeric ID', 12, false],
    ['array ID', ['S-01'], false], ['object ID', {}, false], ['blank ID', ' ', false],
  ]) {
    test(`${rule} handles ${label}`, async () => {
      const result = await validate('services/services.validation.js', rule, { name: 'Support' }, { id });
      assert.equal(result.accepted, expected);
      if (expected) assert.equal(result.req.params.id, id.trim());
      else assert.equal(result.res.statusCode, 400);
    });
  }
}

for (const rule of ['createServiceRules', 'updateServiceRules']) {
  for (const [label, change, expected] of [
    ['100-character name', { name: 'n'.repeat(100) }, true], ['101-character name', { name: 'n'.repeat(101) }, false],
    ['500-character description', { description: 'd'.repeat(500) }, true], ['501-character description', { description: 'd'.repeat(501) }, false],
    ['array name', { name: ['Support'] }, false], ['object description', { description: {} }, false],
    ['minimum duration', { expectedDuration: 1 }, true], ['maximum duration', { expectedDuration: 1440 }, true],
    ['overlong duration', { expectedDuration: 1441 }, false], ['boolean duration', { expectedDuration: true }, false],
    ['array duration', { expectedDuration: [8] }, false], ['unsafe integer', { expectedDuration: Number.MAX_SAFE_INTEGER + 1 }, false],
    ['scientific notation text', { expectedDuration: '1e2' }, false], ['decimal text', { expectedDuration: '8.0' }, false],
    ['maximum numeric text', { expectedDuration: '1440' }, true], ['array priority', { priorityLevel: ['low'] }, false],
  ]) {
    test(`${rule} enforces ${label}`, async () => {
      const body = rule === 'createServiceRules'
        ? { name: 'Support', description: 'Help', expectedDuration: 8, priorityLevel: 'low', ...change }
        : change;
      const result = await validate('services/services.validation.js', rule, body, { id: 'S-01' });
      assert.equal(result.accepted, expected);
      if (expected && Object.hasOwn(change, 'expectedDuration')) assert.equal(result.req.body.expectedDuration, Number(change.expectedDuration));
    });
  }
}

for (const value of [[], ['open'], {}, true, 1, null]) {
  test(`queue status rejects non-string ${JSON.stringify(value)}`, async () => {
    const result = await validate('queue/queue.validation.js', 'updateQueueStatusRules', { status: value }, { queueId: '11111111-1111-4111-8111-111111111111' });
    assert.equal(result.accepted, false);
  });
}
