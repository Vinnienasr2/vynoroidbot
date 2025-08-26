/**
 * Authentication routes
 */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isNotAuthenticated } = require('../middlewares/authMiddleware');

// Login page
router.get('/login', isNotAuthenticated, authController.showLoginPage);

// Register page
router.get('/register', isNotAuthenticated, authController.showRegisterPage);

// Login handler
router.post('/login', authController.login);

// Register handler
router.post('/register', authController.register);

// Logout handler
router.get('/logout', authController.logout);

module.exports = router;