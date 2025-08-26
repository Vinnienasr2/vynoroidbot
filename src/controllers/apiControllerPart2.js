/**
 * API controller part 2
 */
const { query } = require('../config/database');

/**
 * Get episodes for a series
 */
const getEpisodes = async (req, res) => {
  try {
    const seriesId = req.params.id;
    
    // Check if series exists
    const seriesList = await query('SELECT * FROM series WHERE id = ?', [seriesId]);
    
    if (!seriesList.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Series not found'
      });
    }
    
    // Get episodes
    const episodes = await query(
      'SELECT * FROM episodes WHERE series_id = ? ORDER BY episode_number',
      [seriesId]
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        series: seriesList[0],
        episodes
      }
    });
    
  } catch (error) {
    console.error('Get episodes error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve episodes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create a new episode
 */
const createEpisode = async (req, res) => {
  try {
    const seriesId = req.params.id;
    const { file_id, poster, cost } = req.body;
    
    // Validate required fields
    if (!file_id || !cost) {
      return res.status(400).json({
        status: 'error',
        message: 'file_id and cost are required'
      });
    }
    
    // Check if series exists
    const seriesList = await query('SELECT * FROM series WHERE id = ?', [seriesId]);
    
    if (!seriesList.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Series not found'
      });
    }
    
    // Get next episode number
    const episodeCount = await query(
      'SELECT COUNT(*) as count FROM episodes WHERE series_id = ?',
      [seriesId]
    );
    
    const episodeNumber = episodeCount[0].count + 1;
    
    // Insert episode
    const result = await query(
      'INSERT INTO episodes (series_id, episode_number, file_id, poster, cost) VALUES (?, ?, ?, ?, ?)',
      [seriesId, episodeNumber, file_id, poster || '', parseFloat(cost)]
    );
    
    // Get the created episode
    const episodes = await query('SELECT * FROM episodes WHERE id = ?', [result.insertId]);
    
    res.status(201).json({
      status: 'success',
      data: {
        episode: episodes[0]
      }
    });
    
  } catch (error) {
    console.error('Create episode error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create episode',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update an episode
 */
const updateEpisode = async (req, res) => {
  try {
    const seriesId = req.params.id;
    const episodeId = req.params.episodeId;
    const { file_id, poster, cost } = req.body;
    
    // Check if episode exists
    const existingEpisode = await query(
      'SELECT * FROM episodes WHERE id = ? AND series_id = ?',
      [episodeId, seriesId]
    );
    
    if (!existingEpisode.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Episode not found'
      });
    }
    
    // Update episode
    await query(
      'UPDATE episodes SET file_id = ?, poster = ?, cost = ? WHERE id = ?',
      [
        file_id || existingEpisode[0].file_id,
        poster !== undefined ? poster : existingEpisode[0].poster,
        cost !== undefined ? parseFloat(cost) : existingEpisode[0].cost,
        episodeId
      ]
    );
    
    // Get updated episode
    const updatedEpisode = await query('SELECT * FROM episodes WHERE id = ?', [episodeId]);
    
    res.status(200).json({
      status: 'success',
      data: {
        episode: updatedEpisode[0]
      }
    });
    
  } catch (error) {
    console.error('Update episode error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update episode',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete an episode
 */
const deleteEpisode = async (req, res) => {
  try {
    const seriesId = req.params.id;
    const episodeId = req.params.episodeId;
    
    // Check if episode exists
    const existingEpisode = await query(
      'SELECT * FROM episodes WHERE id = ? AND series_id = ?',
      [episodeId, seriesId]
    );
    
    if (!existingEpisode.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Episode not found'
      });
    }
    
    // Delete episode
    await query('DELETE FROM episodes WHERE id = ?', [episodeId]);
    
    // Reorder episode numbers
    const remainingEpisodes = await query(
      'SELECT id FROM episodes WHERE series_id = ? ORDER BY episode_number',
      [seriesId]
    );
    
    // Update episode numbers
    for (let i = 0; i < remainingEpisodes.length; i++) {
      await query(
        'UPDATE episodes SET episode_number = ? WHERE id = ?',
        [i + 1, remainingEpisodes[i].id]
      );
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Episode deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete episode error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete episode',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all users
 */
const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Get users with pagination
    const users = await query(
      'SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    
    // Get total count
    const countResult = await query('SELECT COUNT(*) as count FROM users');
    const totalUsers = countResult[0].count;
    const totalPages = Math.ceil(totalUsers / limit);
    
    res.status(200).json({
      status: 'success',
      data: {
        users,
        pagination: {
          current: page,
          total_pages: totalPages,
          total_items: totalUsers,
          limit
        }
      }
    });
    
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get a single user
 */
const getUser = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Get user
    const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (!users.length) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Get user transactions
    const transactions = await query(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        user: users[0],
        transactions
      }
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update a user
 */
const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { is_active } = req.body;
    
    // Check if user exists
    const existingUser = await query('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (!existingUser.length) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Update user
    await query(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [is_active !== undefined ? is_active : existingUser[0].is_active, userId]
    );
    
    // Get updated user
    const updatedUser = await query('SELECT * FROM users WHERE id = ?', [userId]);
    
    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser[0]
      }
    });
    
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete a user
 */
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Check if user exists
    const existingUser = await query('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (!existingUser.length) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Delete user (transactions will be deleted by foreign key constraint)
    await query('DELETE FROM users WHERE id = ?', [userId]);
    
    res.status(200).json({
      status: 'success',
      message: 'User deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all transactions
 */
const getTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    
    let queryParams = [limit, offset];
    let searchCondition = '';
    
    // Add search condition if provided
    if (search) {
      searchCondition = 'WHERE transaction_code LIKE ?';
      queryParams.unshift(`%${search}%`);
    }
    
    // Get transactions with pagination
    const transactions = await query(
      `SELECT * FROM transactions ${searchCondition} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      queryParams
    );
    
    // Get total count
    let countParams = [];
    if (search) {
      countParams.push(`%${search}%`);
    }
    
    const countResult = await query(
      `SELECT COUNT(*) as count FROM transactions ${searchCondition}`,
      countParams
    );
    
    const totalTransactions = countResult[0].count;
    const totalPages = Math.ceil(totalTransactions / limit);
    
    res.status(200).json({
      status: 'success',
      data: {
        transactions,
        pagination: {
          current: page,
          total_pages: totalPages,
          total_items: totalTransactions,
          limit
        }
      }
    });
    
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get a single transaction
 */
const getTransaction = async (req, res) => {
  try {
    const transactionId = req.params.id;
    
    // Get transaction
    const transactions = await query('SELECT * FROM transactions WHERE id = ?', [transactionId]);
    
    if (!transactions.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Transaction not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        transaction: transactions[0]
      }
    });
    
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update a transaction
 */
const updateTransaction = async (req, res) => {
  try {
    const transactionId = req.params.id;
    const { status } = req.body;
    
    // Check if transaction exists
    const existingTransaction = await query('SELECT * FROM transactions WHERE id = ?', [transactionId]);
    
    if (!existingTransaction.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Transaction not found'
      });
    }
    
    // Validate status
    const validStatuses = ['pending', 'completed', 'failed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid status. Must be one of: pending, completed, failed'
      });
    }
    
    // Update transaction
    await query(
      'UPDATE transactions SET status = ? WHERE id = ?',
      [status || existingTransaction[0].status, transactionId]
    );
    
    // Get updated transaction
    const updatedTransaction = await query('SELECT * FROM transactions WHERE id = ?', [transactionId]);
    
    res.status(200).json({
      status: 'success',
      data: {
        transaction: updatedTransaction[0]
      }
    });
    
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get settings
 */
const getSettings = async (req, res) => {
  try {
    // Get settings
    const settings = await query('SELECT * FROM settings LIMIT 1');
    
    res.status(200).json({
      status: 'success',
      data: {
        settings: settings.length ? settings[0] : {}
      }
    });
    
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update settings
 */
const updateSettings = async (req, res) => {
  try {
    const {
      bot_token,
      channel_id,
      base_url,
      welcome_message,
      webhook_enabled,
      webhook_url,
      mpesa_consumer_key,
      mpesa_consumer_secret,
      mpesa_passkey,
      mpesa_shortcode,
      mpesa_callback_url
    } = req.body;
    
    // Update settings
    await query(
      `UPDATE settings SET 
        bot_token = COALESCE(?, bot_token), 
        channel_id = COALESCE(?, channel_id), 
        base_url = COALESCE(?, base_url), 
        welcome_message = COALESCE(?, welcome_message), 
        webhook_enabled = COALESCE(?, webhook_enabled), 
        webhook_url = COALESCE(?, webhook_url), 
        mpesa_consumer_key = COALESCE(?, mpesa_consumer_key), 
        mpesa_consumer_secret = COALESCE(?, mpesa_consumer_secret), 
        mpesa_passkey = COALESCE(?, mpesa_passkey), 
        mpesa_shortcode = COALESCE(?, mpesa_shortcode), 
        mpesa_callback_url = COALESCE(?, mpesa_callback_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1`,
      [
        bot_token,
        channel_id,
        base_url,
        welcome_message,
        webhook_enabled ? 1 : 0,
        webhook_url,
        mpesa_consumer_key,
        mpesa_consumer_secret,
        mpesa_passkey,
        mpesa_shortcode,
        mpesa_callback_url
      ]
    );
    
    // Get updated settings
    const settings = await query('SELECT * FROM settings LIMIT 1');
    
    res.status(200).json({
      status: 'success',
      data: {
        settings: settings[0]
      }
    });
    
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Export all controller methods
module.exports = {
  getEpisodes,
  createEpisode,
  updateEpisode,
  deleteEpisode,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  getTransactions,
  getTransaction,
  updateTransaction,
  getSettings,
  updateSettings
};