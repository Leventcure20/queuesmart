const express = require('express');
const authController = require('./auth.controller');
const googleAuthController = require('./google-auth.controller');
const validateRequest = require('../../middleware/validate-request');
const { registerRules, loginRules, forgotPasswordRules, resetPasswordRules } = require('./auth.validation');
const authenticate = require('./auth.middleware');

const router = express.Router();

router.post('/register', registerRules, validateRequest, authController.register);
router.post('/login', loginRules, validateRequest, authController.login);
router.post('/forgot-password', forgotPasswordRules, validateRequest, authController.forgotPassword);
router.post('/reset-password', resetPasswordRules, validateRequest, authController.resetPassword);
router.post('/google', googleAuthController.login);
router.get('/me', authenticate, authController.me);
router.post('/logout', authenticate, authController.logout);

module.exports = router;
