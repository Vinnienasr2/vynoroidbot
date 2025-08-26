const express = require('express');
const router = express.Router();
const transactionsController = require('../controllers/transactionsController');

// List transactions
router.get('/', transactionsController.listTransactions);
// Search transactions by code
router.get('/search', transactionsController.searchTransactions);

module.exports = router;
