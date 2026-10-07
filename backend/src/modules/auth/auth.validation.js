const { body } = require('express-validator');

const registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('password').custom((value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72).withMessage('Password must be no more than 72 bytes'),
];

const loginRules = [
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isString().notEmpty().withMessage('Password is required'),
  body('password').custom((value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72).withMessage('Password must be no more than 72 bytes'),
];

module.exports = { registerRules, loginRules };
