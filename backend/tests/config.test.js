const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule } = require('./helpers');
const { environment } = require('./sql-helpers');

test('database connection fails clearly without a URL and never constructs a pool', async (t) => {
  environment(t, { DATABASE_URL: undefined });
  const Pool = t.mock.fn();
  const config = freshModule('src/config/database.js', { pg: { Pool } });
  assert.equal(config.pool, null);
  await assert.rejects(config.connect(), /DATABASE_URL must be configured/);
  assert.equal(Pool.mock.callCount(), 0);
});

for (const failure of [false, true]) {
  test(`database health check ${failure ? 'propagates connection errors' : 'uses SELECT 1'}`, async (t) => {
    environment(t, { DATABASE_URL: 'postgresql://unit-test.invalid/test' });
    const error = new Error('unavailable');
    const query = t.mock.fn(async () => { if (failure) throw error; return { rows: [] }; });
    let options;
    const config = freshModule('src/config/database.js', { pg: { Pool: class { constructor(config) { options = config; this.query = query; } } } });
    if (failure) await assert.rejects(config.connect(), (e) => e === error);
    else await config.connect();
    assert.deepEqual(options, { connectionString: 'postgresql://unit-test.invalid/test' });
    assert.deepEqual(query.mock.calls[0].arguments, ['SELECT 1']);
  });
}

test('environment configuration uses defaults and explicitly supplied settings', (t) => {
  environment(t, { PORT: undefined, NODE_ENV: undefined, ADMIN_NAME: undefined, ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined, DATABASE_URL: undefined });
  const dotenv = { config: t.mock.fn() };
  let config = freshModule('src/config/env.js', { dotenv });
  assert.equal(config.port, 3000);
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.databaseUrl, undefined);
  environment(t, { PORT: '4100', NODE_ENV: 'test', DATABASE_URL: 'test-url', ADMIN_NAME: 'Admin', ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'test-password' });
  config = freshModule('src/config/env.js', { dotenv });
  assert.deepEqual(config, { port: 4100, nodeEnv: 'test', databaseUrl: 'test-url', adminName: 'Admin', adminEmail: 'admin@example.com', adminPassword: 'test-password' });
  assert.equal(dotenv.config.mock.callCount(), 2);
});

for (const failedStep of [null, 'connect', 'admin', 'services', 'queues']) {
  test(`server startup ${failedStep ? `stops after ${failedStep} failure` : 'initializes persistence before listening'}`, async (t) => {
    const calls = [], error = new Error('startup failed');
    const priorExit = process.exitCode;
    t.after(() => { process.exitCode = priorExit; });
    const step = (name) => async () => { calls.push(name); if (name === failedStep) throw error; };
    const log = t.mock.method(console, 'error', () => {});
    freshModule('src/server.js', {
      'src/config/env.js': { port: 4100, adminName: 'Admin', adminEmail: 'admin@example.com', adminPassword: 'test-password' },
      'src/config/database.js': { connect: step('connect') },
      'src/modules/auth/auth.repository.js': { initializeAdmin: step('admin') },
      'src/modules/services/services.repository.js': { initialize: step('services') },
      'src/modules/queue/queue.repository.js': { initialize: step('queues') },
      'src/app.js': { listen: (port) => { assert.equal(port, 4100); calls.push('listen'); } },
    });
    await new Promise(setImmediate);
    const order = ['connect', 'admin', 'services', 'queues', 'listen'];
    assert.deepEqual(calls, failedStep ? order.slice(0, order.indexOf(failedStep) + 1) : order);
    if (failedStep) {
      assert.equal(process.exitCode, 1);
      assert.equal(log.mock.calls[0].arguments[1], error);
    } else assert.equal(log.mock.callCount(), 0);
  });
}
