const { body, param } = require('express-validator');

const priorityLevels = ['low', 'medium', 'high'];

const createServiceRules = [
  body('name').trim().notEmpty().withMessage('Service name is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('expectedDuration').isInt({ min: 1 }).withMessage('Expected duration must be a positive number of minutes').toInt(),
  body('priorityLevel').isIn(priorityLevels).withMessage(`Priority level must be one of: ${priorityLevels.join(', ')}`),
];

const updateServiceRules = [
  param('id').trim().notEmpty().withMessage('Service ID is required'),
  body('name').optional().trim().notEmpty().withMessage('Service name cannot be empty'),
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
  body('expectedDuration').optional().isInt({ min: 1 }).withMessage('Expected duration must be a positive number of minutes').toInt(),
  body('priorityLevel').optional().isIn(priorityLevels).withMessage(`Priority level must be one of: ${priorityLevels.join(', ')}`),
  body().custom((_value, { req }) => Object.keys(req.body).length > 0).withMessage('At least one service field must be provided'),
];

module.exports = { createServiceRules, updateServiceRules };
