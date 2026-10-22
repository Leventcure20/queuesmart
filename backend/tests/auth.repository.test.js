const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule } = require('./helpers');

const PASSWORD = 'Correct horse battery staple!';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-01-15T10:30:00.000Z');

describe('auth repository', () => {
  let repository;

  beforeEach(() => {
    repository = freshModule('src/modules/auth/auth.repository.js');
  });

  it('normalizes email addresses and only exposes public account fields', async () => {
    const user = await repository.createUser({
      name: 'Alex', email: '  Alex@Example.COM  ', password: PASSWORD,
    });

    assert.match(user.id, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'name', 'role']);
    assert.equal(user.name, 'Alex');
    assert.equal(user.email, 'alex@example.com');
    assert.equal(user.role, 'user');
    assert.equal(JSON.stringify(user).includes(PASSWORD), false);
    assert.deepEqual(await repository.authenticate(' ALEX@example.com ', PASSWORD), user);
  });

  it('rejects wrong passwords and unknown accounts', async () => {
    await repository.createUser({ name: 'Alex', email: 'alex@example.com', password: PASSWORD });

    assert.equal(await repository.authenticate('alex@example.com', 'wrong-password'), null);
    assert.equal(await repository.authenticate('unknown@example.com', PASSWORD), null);
  });

  it('rejects a duplicate normalized email without replacing the original account', async () => {
    const original = await repository.createUser({
      name: 'Original', email: 'alex@example.com', password: PASSWORD,
    });

    assert.equal(await repository.createUser({
      name: 'Replacement', email: ' ALEX@EXAMPLE.COM ', password: 'different-password',
    }), null);
    assert.deepEqual(await repository.authenticate(original.email, PASSWORD), original);
    assert.equal(await repository.authenticate(original.email, 'different-password'), null);
  });

  it('allows only one account when registrations for the same email overlap', async () => {
    const results = await Promise.all([
      repository.createUser({ name: 'First', email: 'alex@example.com', password: PASSWORD }),
      repository.createUser({ name: 'Second', email: ' ALEX@EXAMPLE.COM ', password: PASSWORD }),
    ]);
    const created = results.filter(Boolean);

    assert.equal(created.length, 1);
    assert.equal(results.filter((result) => result === null).length, 1);
    assert.deepEqual(await repository.authenticate('alex@example.com', PASSWORD), created[0]);
  });

  it('returns account copies so callers cannot change stored identity or permissions', async () => {
    const user = await repository.createUser({
      name: 'Alex', email: 'alex@example.com', password: PASSWORD,
    });
    const expected = { ...user };
    user.name = 'Changed';
    user.email = 'changed@example.com';
    user.role = 'admin';

    const authenticated = await repository.authenticate(expected.email, PASSWORD);
    assert.deepEqual(authenticated, expected);
    authenticated.role = 'admin';
    assert.deepEqual(await repository.authenticate(expected.email, PASSWORD), expected);
  });

  describe('sessions', () => {
    let user;

    beforeEach(async () => {
      user = await repository.createUser({
        name: 'Alex', email: 'alex@example.com', password: PASSWORD,
      });
    });

    it('issues distinct tokens with a 24-hour expiry and resolves their public account', (t) => {
      t.mock.timers.enable({ apis: ['Date'], now: NOW });
      const first = repository.createSession(user);
      const second = repository.createSession(user);

      assert.match(first.token, /^[a-f0-9]{64}$/);
      assert.match(second.token, /^[a-f0-9]{64}$/);
      assert.notEqual(first.token, second.token);
      assert.equal(first.expiresAt, new Date(NOW + SESSION_TTL_MS).toISOString());
      assert.deepEqual(repository.findUserByToken(first.token), user);
      assert.deepEqual(repository.findUserByToken(second.token), user);
      assert.deepEqual(Object.keys(repository.findUserByToken(first.token)).sort(),
        ['email', 'id', 'name', 'role']);
    });

    it('accepts a session just before expiry and removes it at the exact expiry time', (t) => {
      t.mock.timers.enable({ apis: ['Date'], now: NOW });
      const { token } = repository.createSession(user);

      t.mock.timers.tick(SESSION_TTL_MS - 1);
      assert.deepEqual(repository.findUserByToken(token), user);
      t.mock.timers.tick(1);
      assert.equal(repository.findUserByToken(token), null);
      assert.equal(repository.revokeSession(token), false);
    });

    it('revokes only the requested session and reports repeated revocations', () => {
      const first = repository.createSession(user);
      const second = repository.createSession(user);

      assert.equal(repository.revokeSession(first.token), true);
      assert.equal(repository.findUserByToken(first.token), null);
      assert.equal(repository.revokeSession(first.token), false);
      assert.deepEqual(repository.findUserByToken(second.token), user);
      assert.equal(repository.findUserByToken('unknown-token'), null);
    });

    it('does not allow a resolved session account to mutate the stored role', () => {
      const { token } = repository.createSession(user);
      repository.findUserByToken(token).role = 'admin';

      assert.equal(repository.findUserByToken(token).role, 'user');
    });

    it('does not authenticate a session for an account absent from storage', () => {
      const { token } = repository.createSession({ id: 'missing-account' });
      assert.equal(repository.findUserByToken(token), null);
    });
  });

  describe('administrator bootstrap', () => {
    it('creates an administrator with normalized email and working credentials', async (t) => {
      t.mock.method(console, 'info', () => {});
      await repository.initializeAdmin({
        name: 'Administrator', email: ' ADMIN@EXAMPLE.COM ', password: PASSWORD,
      });

      const admin = await repository.authenticate('admin@example.com', PASSWORD);
      assert.equal(admin.role, 'admin');
      assert.equal(admin.name, 'Administrator');
      assert.equal(admin.email, 'admin@example.com');
      assert.deepEqual(Object.keys(admin).sort(), ['email', 'id', 'name', 'role']);
      const { token } = repository.createSession(admin);
      assert.deepEqual(repository.findUserByToken(token), admin);
    });

    it('does not replace or elevate an account that already uses the bootstrap email', async (t) => {
      t.mock.method(console, 'info', () => {});
      const existing = await repository.createUser({
        name: 'Existing user', email: 'admin@example.com', password: PASSWORD,
      });
      await repository.initializeAdmin({
        name: 'Administrator', email: ' ADMIN@EXAMPLE.COM ', password: 'admin-password',
      });

      assert.deepEqual(await repository.authenticate('admin@example.com', PASSWORD), existing);
      assert.equal(await repository.authenticate('admin@example.com', 'admin-password'), null);
    });

    it('is idempotent when bootstrap runs again for an existing administrator', async (t) => {
      t.mock.method(console, 'info', () => {});
      const account = { name: 'Administrator', email: 'admin@example.com', password: PASSWORD };
      await repository.initializeAdmin(account);
      const original = await repository.authenticate(account.email, PASSWORD);
      await repository.initializeAdmin({ ...account, password: 'replacement-password' });

      assert.deepEqual(await repository.authenticate(account.email, PASSWORD), original);
      assert.equal(await repository.authenticate(account.email, 'replacement-password'), null);
    });

    it('skips incomplete administrator configuration', async (t) => {
      t.mock.method(console, 'info', () => {});
      const account = { name: 'Administrator', email: 'admin@example.com', password: PASSWORD };
      for (const incomplete of [
        { ...account, name: '' },
        { ...account, email: '   ' },
        { ...account, email: undefined },
        { ...account, password: '' },
      ]) {
        assert.equal(await repository.initializeAdmin(incomplete), undefined);
      }

      assert.equal(await repository.authenticate(account.email, PASSWORD), null);
      assert.equal(await repository.authenticate('', PASSWORD), null);
    });
  });
});
