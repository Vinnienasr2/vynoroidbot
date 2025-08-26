const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');

// Show settings page
router.get('/', settingsController.showSettings);
// Save settings
router.post('/', settingsController.saveSettings);

module.exports = router;
