const { body, param } = require('express-validator');

const joinQueueRules = [
  body('serviceId').trim().notEmpty().withMessage('Service ID is required'),
];

const leaveQueueRules = [
  param('ticketId').trim().notEmpty().withMessage('Ticket ID is required'),
];

const updateQueueStatusRules = [
  param('queueId').isUUID().withMessage('Queue ID must be a UUID'),
  body('status').isIn(['open', 'closed']).withMessage('Status must be open or closed'),
];

module.exports = { joinQueueRules, leaveQueueRules, updateQueueStatusRules };
