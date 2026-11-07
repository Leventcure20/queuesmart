const { body, param } = require('express-validator');

const MAX_SERVICE_ID_LENGTH = 64;

const joinQueueRules = [
  body('serviceId').isString().withMessage('Service ID must be a string').bail()
    .trim().notEmpty().withMessage('Service ID is required').bail()
    .isLength({ max: MAX_SERVICE_ID_LENGTH }).withMessage('Service ID is too long'),
];

const leaveQueueRules = [
  param('ticketId').trim().isUUID().withMessage('Ticket ID must be a UUID'),
];

const updateQueueStatusRules = [
  param('queueId').isUUID().withMessage('Queue ID must be a UUID'),
  body('status').isString().withMessage('Status must be a string').bail()
    .isIn(['open', 'closed']).withMessage('Status must be open or closed'),
];

const serveNextRules = [...joinQueueRules];

module.exports = { joinQueueRules, leaveQueueRules, updateQueueStatusRules, serveNextRules };
