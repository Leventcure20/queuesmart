const { body } = require('express-validator');

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;

function emailRule() {
  return body('email')
    .isString().withMessage('Email must be a string').bail()
    .trim()
    .notEmpty().withMessage('Email is required').bail()
    .isLength({ max: MAX_EMAIL_LENGTH }).withMessage(`Email must be no more than ${MAX_EMAIL_LENGTH} characters`).bail()
    .isEmail().withMessage('A valid email is required').bail()
    .normalizeEmail();
}

function passwordByteLimitRule() {
  return body('password')
    .custom((value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('Password must be no more than 72 bytes');
}

const registerRules = [
  body('name')
    .isString().withMessage('Name must be a string').bail()
    .trim()
    .notEmpty().withMessage('Name is required').bail()
    .isLength({ max: MAX_NAME_LENGTH }).withMessage(`Name must be no more than ${MAX_NAME_LENGTH} characters`),
  emailRule(),
  body('password')
    .isString().withMessage('Password must be a string').bail()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  passwordByteLimitRule(),
];

const loginRules = [
  emailRule(),
  body('password')
    .isString().withMessage('Password must be a string').bail()
    .notEmpty().withMessage('Password is required'),
  passwordByteLimitRule(),
];

module.exports = { registerRules, loginRules };
