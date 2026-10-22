const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshModule } = require('./helpers');

describe('password hashing', () => {
  let password;

  beforeEach(() => {
    password = freshModule('src/modules/auth/password.js');
  });

  it('stores a bcrypt hash that verifies the correct password and rejects an incorrect one', async () => {
    const plaintext = 'Correct horse battery staple!';
    const hash = await password.hashPassword(plaintext);

    assert.match(hash, /^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/);
    assert.notEqual(hash, plaintext);
    assert.equal(await password.verifyPassword(plaintext, hash), true);
    assert.equal(await password.verifyPassword('incorrect-password', hash), false);
    assert.equal(await password.verifyPassword(plaintext.toUpperCase(), hash), false);
  });

  it('generates a new salt when the same password is hashed again', async () => {
    const plaintext = 'same-password';
    const [first, second] = await Promise.all([
      password.hashPassword(plaintext),
      password.hashPassword(plaintext),
    ]);

    assert.notEqual(first, second);
    assert.equal(await password.verifyPassword(plaintext, first), true);
    assert.equal(await password.verifyPassword(plaintext, second), true);
  });

  it('round-trips Unicode passwords without changing their characters', async () => {
    const plaintext = 'S\u00e9same-\u5bc6\u7801-\ud83d\udd10';
    const hash = await password.hashPassword(plaintext);

    assert.equal(await password.verifyPassword(plaintext, hash), true);
    assert.equal(await password.verifyPassword('Sesame-\u5bc6\u7801-\ud83d\udd10', hash), false);
  });
});
