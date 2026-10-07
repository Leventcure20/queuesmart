const express = require('express');
const servicesController = require('./services.controller');
const validateRequest = require('../../middleware/validate-request');
const { createServiceRules, updateServiceRules } = require('./services.validation');

const router = express.Router();

router.get('/', servicesController.list);
router.post('/', createServiceRules, validateRequest, servicesController.create);
router.put('/:id', updateServiceRules, validateRequest, servicesController.update);

module.exports = router;
