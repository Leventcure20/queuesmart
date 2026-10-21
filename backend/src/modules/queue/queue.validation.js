const { body, param } = require('express-validator');

const joinQueueRules = [
  body('serviceId').trim().notEmpty().withMessage('Service ID is required'),
];

const leaveQueueRules = [
  param('ticketId').trim().notEmpty().withMessage('Ticket ID is required'),
];

module.exports = { joinQueueRules, leaveQueueRules };
