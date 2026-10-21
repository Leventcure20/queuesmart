const authRepository = require('./auth.repository');

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const user = await authRepository.createUser({ name, email, password });
    if (!user) return res.status(409).json({ error: 'An account with this email already exists' });
    const session = authRepository.createSession(user);
    return res.status(201).json({ user, ...session, tokenType: 'Bearer' });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const user = await authRepository.authenticate(req.body.email, req.body.password);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const session = authRepository.createSession(user);
    return res.json({ user, ...session, tokenType: 'Bearer' });
  } catch (error) {
    return next(error);
  }
}

function me(req, res) {
  return res.json({ user: req.user });
}

function logout(req, res) {
  authRepository.revokeSession(req.authToken);
  return res.status(204).end();
}

module.exports = { register, login, me, logout };
