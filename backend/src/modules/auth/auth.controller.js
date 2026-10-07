function notImplemented(_req, res) {
  return res.status(501).json({ error: 'Authentication is not implemented yet' });
}

module.exports = {
  register: notImplemented,
  login: notImplemented,
};
