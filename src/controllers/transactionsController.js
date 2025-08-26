/**
 * Transactions management controller
 */
const { query } = require('../config/database');

// List all transactions
const listTransactions = async (req, res) => {
  try {
    const transactions = await query(`SELECT t.*, u.username, u.telegram_id FROM transactions t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT 100`);
    res.render('admin/transactions', { transactions });
  } catch (error) {
    console.error('List transactions error:', error);
    res.status(500).render('error', { message: 'Failed to load transactions', error });
  }
};

// Search transactions by code
const searchTransactions = async (req, res) => {
  try {
    const { code } = req.query;
    const transactions = await query(`SELECT t.*, u.username, u.telegram_id FROM transactions t LEFT JOIN users u ON t.user_id = u.id WHERE t.code LIKE ? ORDER BY t.created_at DESC`, [`%${code}%`]);
    res.render('admin/transactions', { transactions });
  } catch (error) {
    console.error('Search transactions error:', error);
    res.status(500).render('error', { message: 'Failed to search transactions', error });
  }
};

module.exports = {
  listTransactions,
  searchTransactions
};
