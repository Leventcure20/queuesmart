const { body, param } = require('express-validator');

const priorityLevels = ['low', 'medium', 'high'];
const serviceFields = ['name', 'description', 'expectedDuration', 'priorityLevel'];
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_DURATION_MINUTES = 1440;

function textRule(field, label, maxLength, optional = false) {
  const rule = body(field);
  if (optional) rule.optional();
  return rule
    .isString().withMessage(`${label} must be a string`).bail()
    .trim()
    .notEmpty().withMessage(optional ? `${label} cannot be empty` : `${label} is required`).bail()
    .isLength({ max: maxLength }).withMessage(`${label} must be no more than ${maxLength} characters`);
}

function durationRule(optional = false) {
  const rule = body('expectedDuration');
  if (optional) rule.optional();
  return rule
    // Numeric strings remain accepted for compatibility with existing API tests.
    .custom((value) => {
      const validType = (typeof value === 'number' && Number.isSafeInteger(value)) ||
        (typeof value === 'string' && /^\d+$/.test(value));
      return validType && Number(value) >= 1 && Number(value) <= MAX_DURATION_MINUTES;
    })
    .withMessage(`Expected duration must be a whole number of minutes between 1 and ${MAX_DURATION_MINUTES}`)
    .bail()
    .toInt();
}

function priorityRule(optional = false) {
  const rule = body('priorityLevel');
  if (optional) rule.optional();
  return rule
    .isString().withMessage('Priority level must be a string').bail()
    .isIn(priorityLevels).withMessage(`Priority level must be one of: ${priorityLevels.join(', ')}`);
}

const createServiceRules = [
  textRule('name', 'Service name', MAX_NAME_LENGTH),
  textRule('description', 'Description', MAX_DESCRIPTION_LENGTH),
  durationRule(),
  priorityRule(),
];

const updateServiceRules = [
  param('id').trim().notEmpty().withMessage('Service ID is required'),
  textRule('name', 'Service name', MAX_NAME_LENGTH, true),
  textRule('description', 'Description', MAX_DESCRIPTION_LENGTH, true),
  durationRule(true),
  priorityRule(true),
  body().custom((_value, { req }) => Object.keys(req.body).length > 0)
    .withMessage('At least one service field must be provided'),
  body().custom((_value, { req }) => Object.keys(req.body).every((field) => serviceFields.includes(field)))
    .withMessage('Only name, description, expectedDuration, and priorityLevel can be updated'),
];

module.exports = { createServiceRules, updateServiceRules };
