const express = require('express');
const queueController = require('./queue.controller');
const validateRequest = require('../../middleware/validate-request');
const { joinQueueRules, leaveQueueRules } = require('./queue.validation');
const authenticate = require('../auth/auth.middleware');
const requireRole = require('../auth/require-role');
const { ROLES } = require('../auth/roles');

const router = express.Router();

router.get('/my-tickets', authenticate, queueController.listMine);
router.get('/notifications', authenticate, queueController.listNotifications);
router.get('/tickets', authenticate, requireRole(ROLES.ADMIN), queueController.list);
router.post('/tickets', authenticate, joinQueueRules, validateRequest, queueController.join);
router.get('/tickets/:ticketId', authenticate, leaveQueueRules, validateRequest, queueController.get);
router.delete('/tickets/:ticketId', authenticate, leaveQueueRules, validateRequest, queueController.leave);

module.exports = router;
