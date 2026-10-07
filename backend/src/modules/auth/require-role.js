function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // Authentication middleware should attach req.user before this middleware runs.
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
}

module.exports = requireRole;
