const authRepository = require('./auth.repository');
const emailService = require('./email.service');

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

async function forgotPassword(req, res, next) {
  try {
    const reset = await authRepository.createPasswordResetToken(req.body.email);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:8000').replace(/\/$/, '');
    const isDevelopment = (process.env.NODE_ENV || 'development') === 'development';
    let resetLink;
    if (reset) {
      const link = `${frontendUrl}/reset-password.html#token=${reset.token}&expiresAt=${encodeURIComponent(reset.expiresAt)}`;
      if (isDevelopment) {
        resetLink = link;
      } else if (emailService.isConfigured()) {
        try {
          await emailService.sendPasswordResetEmail(req.body.email, link);
        } catch (error) {
          console.error('Could not send password reset email:', error.message);
        }
      }
    }
    const demoLinkAvailable = Boolean(resetLink);
    const message = !reset
      ? 'No user exists with that email.'
      : demoLinkAvailable
        ? 'Reset link expires after 30 seconds.'
        : emailService.isConfigured()
          ? 'Password reset request received.'
          : 'Password reset is unavailable in this environment.';
    return res.json({ message, ...(resetLink ? { resetLink } : {}) });
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const changed = await authRepository.resetPassword(req.body.token, req.body.password);
    if (!changed) return res.status(400).json({ error: 'The reset link is invalid or has expired.' });
    return res.json({ message: 'Password updated. Please sign in with your new password.' });
  } catch (error) {
    return next(error);
  }
}

module.exports = { register, login, me, logout, forgotPassword, resetPassword };
