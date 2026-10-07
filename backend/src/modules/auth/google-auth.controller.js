// Google sign-in will be implemented here in a later step.

function login(_req, res) {
  return res.status(501).json({ error: 'Google sign-in is not implemented yet' });
}

module.exports = { login };
