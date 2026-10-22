const test = require('node:test');
const assert = require('node:assert/strict');
const { freshModule } = require('./helpers');

function repository() {
  return freshModule('src/modules/services/services.repository.js');
}

const serviceInput = {
  name: 'Document Collection',
  description: 'Collect prepared documents',
  expectedDuration: 5,
  priorityLevel: 'low',
};

test('services repository starts with the three demo services and valid timestamps', () => {
  const repo = repository();
  const services = repo.list();

  assert.deepEqual(services.map(({ id, name, expectedDuration, priorityLevel }) => (
    { id, name, expectedDuration, priorityLevel }
  )), [
    { id: 'S-01', name: 'General Inquiry', expectedDuration: 8, priorityLevel: 'medium' },
    { id: 'S-02', name: 'Billing & Payments', expectedDuration: 12, priorityLevel: 'medium' },
    { id: 'S-03', name: 'Technical Support', expectedDuration: 20, priorityLevel: 'high' },
  ]);
  for (const service of services) {
    assert.ok(service.description.length > 0);
    assert.equal(new Date(service.createdAt).toISOString(), service.createdAt);
    assert.equal(service.updatedAt, service.createdAt);
    assert.deepEqual(repo.findById(service.id), service);
  }
  assert.equal(repo.findById('missing-service'), null);
});

test('services repository creates independently identified services with creation timestamps', (t) => {
  const now = Date.parse('2026-01-10T10:00:00.000Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  const repo = repository();

  const first = repo.create(serviceInput);
  const second = repo.create(serviceInput);

  assert.match(first.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(first.id, second.id);
  assert.deepEqual(first, {
    id: first.id,
    ...serviceInput,
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-10T10:00:00.000Z',
  });
  assert.deepEqual(repo.findById(first.id), first);
  assert.equal(repo.list().length, 5);
  assert.deepEqual(serviceInput, {
    name: 'Document Collection',
    description: 'Collect prepared documents',
    expectedDuration: 5,
    priorityLevel: 'low',
  });
});

test('services repository updates supplied service fields and advances updatedAt', (t) => {
  const createdAt = Date.parse('2026-01-10T10:00:00.000Z');
  t.mock.timers.enable({ apis: ['Date'], now: createdAt });
  const repo = repository();
  const created = repo.create(serviceInput);
  t.mock.timers.setTime(createdAt + 60_000);

  const updated = repo.update(created.id, { name: 'Priority Documents', expectedDuration: 3 });

  assert.deepEqual(updated, {
    ...created,
    name: 'Priority Documents',
    expectedDuration: 3,
    updatedAt: '2026-01-10T10:01:00.000Z',
  });
  assert.deepEqual(repo.findById(created.id), updated);
  assert.equal(created.name, serviceInput.name);
});

test('services repository returns null for unknown updates without adding a record', () => {
  const repo = repository();
  const before = repo.list();

  assert.equal(repo.update('missing-service', { name: 'Missing' }), null);
  assert.deepEqual(repo.list(), before);
});

test('services repository ignores immutable and unknown update fields while applying supported changes', (t) => {
  const createdAt = Date.parse('2026-01-10T10:00:00.000Z');
  t.mock.timers.enable({ apis: ['Date'], now: createdAt });
  const repo = repository();
  const original = repo.create(serviceInput);
  t.mock.timers.setTime(createdAt + 60_000);

  const updated = repo.update(original.id, {
    name: 'Updated Support',
    id: 'client-controlled-id',
    createdAt: 'client-controlled-creation-time',
    updatedAt: 'client-controlled-update-time',
    unexpected: 'client-controlled-field',
  });

  assert.deepEqual(updated, {
    ...original,
    name: 'Updated Support',
    updatedAt: '2026-01-10T10:01:00.000Z',
  });
  assert.deepEqual(repo.findById(original.id), updated);
  assert.equal(repo.findById('client-controlled-id'), null);
  assert.equal(Object.hasOwn(updated, 'unexpected'), false);
  assert.equal(repo.list().length, 4);
});

test('services repository removes only the selected service and reports missing removals', () => {
  const repo = repository();
  const retained = repo.findById('S-02');

  assert.equal(repo.remove('S-01'), true);
  assert.equal(repo.findById('S-01'), null);
  assert.equal(repo.list().length, 2);
  assert.deepEqual(repo.findById('S-02'), retained);
  assert.equal(repo.remove('S-01'), false);
  assert.equal(repo.remove('missing-service'), false);
});

test('fresh services repository instances do not retain changes from previous instances', () => {
  repository().remove('S-01');

  assert.equal(repository().list().length, 3);
  assert.ok(repository().findById('S-01'));
});
