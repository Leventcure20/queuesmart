const { validationResult } = require('express-validator');

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  return res.status(400).json({
    error: 'Validation failed',
    details: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
  });
}

module.exports = validateRequest;
