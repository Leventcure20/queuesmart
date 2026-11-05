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
    const token = await authRepository.createPasswordResetToken(req.body.email);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:8000').replace(/\/$/, '');
    if (token) {
      const link = `${frontendUrl}/reset-password.html#token=${token}`;
      if (emailService.isConfigured()) {
        try {
          await emailService.sendPasswordResetEmail(req.body.email, link);
        } catch (error) {
          console.error('Could not send password reset email:', error.message);
        }
      } else if ((process.env.NODE_ENV || 'development') === 'development') {
        console.info(`Password reset link: ${link}`);
      }
    }
    const deliveryMessage = emailService.isConfigured()
      ? 'If an account exists for that email, check its inbox for reset instructions.'
      : (process.env.NODE_ENV || 'development') === 'development'
        ? 'If an account exists for that email, a reset link is available in the backend terminal for local development.'
        : 'If an account exists for that email, reset instructions will be made available.';
    return res.json({ message: deliveryMessage });
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
