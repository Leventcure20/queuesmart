const express = require('express');
const servicesController = require('./services.controller');
const validateRequest = require('../../middleware/validate-request');
const { createServiceRules, updateServiceRules } = require('./services.validation');
const authenticate = require('../auth/auth.middleware');
const requireRole = require('../auth/require-role');
const { ROLES } = require('../auth/roles');

const router = express.Router();

router.get('/', servicesController.list);
router.post('/', authenticate, requireRole(ROLES.ADMIN), createServiceRules, validateRequest, servicesController.create);
router.put('/:id', authenticate, requireRole(ROLES.ADMIN), updateServiceRules, validateRequest, servicesController.update);

module.exports = router;
