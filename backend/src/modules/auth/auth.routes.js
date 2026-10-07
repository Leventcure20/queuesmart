const express = require('express');
const authController = require('./auth.controller');
const googleAuthController = require('./google-auth.controller');
const validateRequest = require('../../middleware/validate-request');
const { registerRules, loginRules } = require('./auth.validation');

const router = express.Router();

router.post('/register', registerRules, validateRequest, authController.register);
router.post('/login', loginRules, validateRequest, authController.login);
router.post('/google', googleAuthController.login);

module.exports = router;
