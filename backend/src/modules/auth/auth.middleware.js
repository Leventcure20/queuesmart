const authRepository = require('./auth.repository');

function authenticate(req, res, next) {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = authRepository.findUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = user;
  req.authToken = token;
  return next();
}

module.exports = authenticate;
