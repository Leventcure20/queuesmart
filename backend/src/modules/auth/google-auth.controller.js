const { OAuth2Client } = require('google-auth-library');
const authRepository = require('./auth.repository');

const googleClient = new OAuth2Client();

async function login(req, res, next) {
  const credential = req.body?.credential;
  if (typeof credential !== 'string' || !credential) {
    return res.status(400).json({ error: 'A Google credential is required' });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'Google sign-in is not configured' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Google credential is invalid or expired' });
  }
  if (!payload || payload.email_verified !== true || !payload.email) {
    return res.status(401).json({ error: 'Google account could not be verified' });
  }

  try {
    const user = await authRepository.findOrCreateGoogleUser({
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
    });
    const session = authRepository.createSession(user);
    return res.json({ user, ...session, tokenType: 'Bearer' });
  } catch (error) {
    return next(error);
  }
}

module.exports = { login };
