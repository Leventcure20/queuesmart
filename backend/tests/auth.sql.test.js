const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { environment, database, rows, repository } = require('./sql-helpers');

const input = { name: 'Alex', email: ' ALEX@example.com ', password: 'password123' };
const account = { id: 'user-1', name: 'Alex', email: 'alex@example.com', role: 'user', password_hash: 'hash:password123' };
const hash = (value) => createHash('sha256').update(value).digest('hex');

test('SQL registration commits credentials and profile together using normalized parameters', async (t) => {
  const db = database(t, [[/^BEGIN$/], [/INSERT INTO "UserCredentials"/, rows(account)], [/INSERT INTO "UserProfile"/], [/^COMMIT$/]]);
  const repo = repository('auth/auth.repository.js', db.pool);
  const user = await repo.createUser(input);
  assert.deepEqual(user, { id: user.id, name: 'Alex', email: 'alex@example.com', role: 'user' });
  assert.deepEqual(db.calls[1].values, [user.id, 'alex@example.com', 'hash:password123', 'user']);
  assert.deepEqual(db.calls[2].values, [user.id, 'Alex']);
  assert.match(db.calls[1].sql, /ON CONFLICT \(email\) DO NOTHING/);
  assert.equal(db.release.mock.callCount(), 1);
});

test('SQL duplicate registration rolls back without creating a profile', async (t) => {
  const db = database(t, [[/^BEGIN$/], [/INSERT INTO "UserCredentials"/, rows()], [/^ROLLBACK$/]]);
  assert.equal(await repository('auth/auth.repository.js', db.pool).createUser(input), null);
  assert.equal(db.release.mock.callCount(), 1);
});

for (const failure of ['credentials', 'profile', 'commit']) {
  test(`SQL registration rolls back and releases its client on ${failure} failure`, async (t) => {
    const error = new Error('database unavailable');
    const steps = [[/^BEGIN$/], [/INSERT INTO "UserCredentials"/, failure === 'credentials' ? error : rows(account)]];
    if (failure !== 'credentials') steps.push([/INSERT INTO "UserProfile"/, failure === 'profile' ? error : rows()]);
    if (failure === 'commit') steps.push([/^COMMIT$/, error]);
    steps.push([/^ROLLBACK$/]);
    const db = database(t, steps);
    await assert.rejects(repository('auth/auth.repository.js', db.pool).createUser(input), (e) => e === error);
    assert.equal(db.release.mock.callCount(), 1);
  });
}

for (const [label, found, password, expected] of [
  ['correct password', account, 'password123', true], ['wrong password', account, 'wrong', false], ['unknown email', null, 'password123', false],
]) {
  test(`SQL authentication handles ${label} without exposing password hashes`, async (t) => {
    const db = database(t, [[/WHERE credentials.email = \$1/, found ? rows(found) : rows()]]);
    const result = await repository('auth/auth.repository.js', db.pool).authenticate(input.email, password);
    assert.deepEqual(db.calls[0].values, ['alex@example.com']);
    assert.deepEqual(result, expected ? { id: account.id, name: account.name, email: account.email, role: account.role } : null);
  });
}

test('SQL sessions return copies and expire at exactly 24 hours', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const repo = repository('auth/auth.repository.js', {});
  const session = repo.createSession(account);
  repo.findUserByToken(session.token).role = 'admin';
  assert.equal(repo.findUserByToken(session.token).role, 'user');
  t.mock.timers.tick(86_400_000);
  assert.equal(repo.findUserByToken(session.token), null);
});

test('SQL admin bootstrap inserts the admin role and skips incomplete configuration', async (t) => {
  t.mock.method(console, 'info', () => {});
  const db = database(t, [[/^BEGIN$/], [/INSERT INTO "UserCredentials"/, rows(account)], [/INSERT INTO "UserProfile"/], [/^COMMIT$/]]);
  const repo = repository('auth/auth.repository.js', db.pool);
  await repo.initializeAdmin({ ...input, name: '' });
  await repo.initializeAdmin(input);
  assert.equal(db.calls[1].values[3], 'admin');
});

for (const smtp of [false, true]) {
  test(`password reset stores a hash and selects the ${smtp ? 'SMTP' : 'demo'} expiry policy`, async (t) => {
    environment(t, { SMTP_HOST: smtp ? 'smtp.example.com' : undefined, SMTP_FROM: smtp ? 'support@example.com' : undefined });
    const db = database(t, [[/SELECT id FROM "UserCredentials"/, rows({ id: 'user-1' })], [/INSERT INTO "PasswordResetTokens"/, rows({ expires_at: 'expiry' })]]);
    const result = await repository('auth/auth.repository.js', db.pool).createPasswordResetToken(input.email);
    assert.match(result.token, /^[a-f0-9]{64}$/);
    assert.deepEqual(db.calls[0].values, ['alex@example.com']);
    assert.deepEqual(db.calls[1].values, ['user-1', hash(result.token), smtp]);
    assert.match(db.calls[1].sql, /ON CONFLICT \(user_id\) DO UPDATE/);
    assert.match(db.calls[1].sql, /INTERVAL '15 minutes'.*INTERVAL '30 seconds'/s);
    assert.equal(result.expiresAt, 'expiry');
  });
}

test('unknown email cannot create a password reset token', async (t) => {
  const db = database(t, [[/SELECT id/, rows()]]);
  assert.equal(await repository('auth/auth.repository.js', db.pool).createPasswordResetToken(input.email), null);
});

test('password reset locks an unexpired token, commits, and revokes only that user sessions', async (t) => {
  const db = database(t, [[/^BEGIN$/], [/expires_at > clock_timestamp\(\).*FOR UPDATE/s, rows({ user_id: account.id })], [/UPDATE "UserCredentials"/], [/DELETE FROM "PasswordResetTokens"/], [/^COMMIT$/]]);
  const repo = repository('auth/auth.repository.js', db.pool);
  const first = repo.createSession(account), second = repo.createSession(account), other = repo.createSession({ ...account, id: 'other' });
  assert.equal(await repo.resetPassword('secret', 'new-password'), true);
  assert.deepEqual(db.calls[1].values, [hash('secret')]);
  assert.deepEqual(db.calls[2].values, ['hash:new-password', account.id]);
  assert.deepEqual(db.calls[3].values, [account.id]);
  assert.equal(repo.findUserByToken(first.token), null);
  assert.equal(repo.findUserByToken(second.token), null);
  assert.equal(repo.findUserByToken(other.token).id, 'other');
  assert.equal(db.release.mock.callCount(), 1);
});

test('invalid, consumed, or expired reset token rolls back without changing password', async (t) => {
  const db = database(t, [[/^BEGIN$/], [/FOR UPDATE/, rows()], [/^ROLLBACK$/]]);
  assert.equal(await repository('auth/auth.repository.js', db.pool).resetPassword('expired', 'password'), false);
  assert.equal(db.release.mock.callCount(), 1);
});

for (const stage of ['update', 'delete']) {
  test(`password reset ${stage} failure rolls back and preserves existing sessions`, async (t) => {
    const error = new Error('write failed');
    const steps = [[/^BEGIN$/], [/FOR UPDATE/, rows({ user_id: account.id })], [/UPDATE "UserCredentials"/, stage === 'update' ? error : rows()]];
    if (stage === 'delete') steps.push([/DELETE FROM "PasswordResetTokens"/, error]);
    steps.push([/^ROLLBACK$/]);
    const db = database(t, steps), repo = repository('auth/auth.repository.js', db.pool);
    const session = repo.createSession(account);
    await assert.rejects(repo.resetPassword('token', 'password'), (e) => e === error);
    assert.equal(repo.findUserByToken(session.token).id, account.id);
    assert.equal(db.release.mock.callCount(), 1);
  });
}

test('Google sign-in reuses existing SQL account and preserves its role', async (t) => {
  const db = database(t, [[/WHERE credentials.email = \$1/, rows({ ...account, role: 'admin' })]]);
  const user = await repository('auth/auth.repository.js', db.pool).findOrCreateGoogleUser(input);
  assert.equal(user.role, 'admin');
  assert.equal('password_hash' in user, false);
});

test('new Google SQL user gets a random local password and ordinary user role', async (t) => {
  const db = database(t, [[/WHERE credentials.email/, rows()], [/^BEGIN$/], [/INSERT INTO "UserCredentials"/, rows(account)], [/INSERT INTO "UserProfile"/], [/^COMMIT$/]]);
  const user = await repository('auth/auth.repository.js', db.pool).findOrCreateGoogleUser({ email: input.email });
  assert.equal(user.name, 'alex');
  assert.equal(user.role, 'user');
  assert.match(db.calls[2].values[2], /^hash:[A-Za-z0-9_-]{64}$/);
});

for (const found of [true, false]) {
  test(`Google concurrent registration ${found ? 'reuses the winner' : 'reports a missing account'}`, async (t) => {
    const db = database(t, [[/WHERE credentials.email/, rows()], [/^BEGIN$/], [/INSERT INTO "UserCredentials"/, rows()], [/^ROLLBACK$/], [/WHERE credentials.email/, found ? rows(account) : rows()]]);
    const result = repository('auth/auth.repository.js', db.pool).findOrCreateGoogleUser(input);
    if (found) assert.equal((await result).id, account.id);
    else await assert.rejects(result, /Could not create or find/);
  });
}

test('password recovery without SQL storage is explicitly unavailable', async () => {
  const repo = repository('auth/auth.repository.js', null);
  assert.equal(await repo.createPasswordResetToken(input.email), null);
  assert.equal(await repo.resetPassword('token', 'password'), false);
});

test('concurrent in-memory Google logins converge on one account', async () => {
  const repo = repository('auth/auth.repository.js', null);
  const users = await Promise.all([
    repo.findOrCreateGoogleUser(input),
    repo.findOrCreateGoogleUser({ ...input, name: 'Second sign-in' }),
  ]);
  assert.equal(users[0].id, users[1].id);
  assert.equal(users[0].role, 'user');
  const existing = await repo.findOrCreateGoogleUser(input);
  assert.equal(existing.id, users[0].id);
});

for (const operation of ['createUser', 'resetPassword']) {
  test(`${operation} propagates a connection acquisition failure without using a client`, async (t) => {
    const db = database(t, []), error = new Error('pool exhausted');
    t.mock.method(db.pool, 'connect', async () => { throw error; });
    const repo = repository('auth/auth.repository.js', db.pool);
    const pending = operation === 'createUser' ? repo.createUser(input) : repo.resetPassword('token', 'password');
    await assert.rejects(pending, (e) => e === error);
    assert.equal(db.release.mock.callCount(), 0);
  });
}
