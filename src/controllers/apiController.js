/**
 * API controller
 */
const { query } = require('../config/database');
const { processMpesaCallback } = require('../services/mpesaService');
const { bot } = require('../services/telegramBot');
const fs = require('fs');
const path = require('path');

/**
 * Handle M-Pesa callback
 */
const mpesaCallback = async (req, res) => {
  try {
    const callbackData = req.body;
    console.log('M-Pesa callback received:', JSON.stringify(callbackData));

    // Process callback
    const success = await processMpesaCallback(callbackData);

    if (success) {
      // Optionally, send content to user if transaction is completed
      const transactionCode = callbackData.Body?.stkCallback?.AccountReference;
      if (transactionCode) {
        const txRows = await query('SELECT * FROM transactions WHERE transaction_code = ?', [transactionCode]);
        if (txRows.length && txRows[0].status === 'completed') {
          const tx = txRows[0];
          const chatId = tx.user_id;
          if (tx.type === 'movie') {
            const movies = await query('SELECT * FROM movies WHERE id = ?', [tx.content_id]);
            if (movies.length) {
              await bot.sendVideo(chatId, movies[0].file_id, {
                caption: `🎬 *${movies[0].title}*\n\nEnjoy your movie!`,
                parse_mode: 'Markdown'
              });
            }
          } else if (tx.type === 'series') {
            // Get episode range from transaction (if stored)
            // For this, you need to store startEp and endEp in the transaction when purchasing
            // Example assumes columns start_ep and end_ep exist in transactions
            const startEp = tx.start_ep;
            const endEp = tx.end_ep;
            if (startEp && endEp) {
              const episodes = await query('SELECT * FROM episodes WHERE series_id = ? AND episode_number BETWEEN ? AND ?', [tx.content_id, startEp, endEp]);
              console.log(`[TEMP LOG] Sending episodes for transaction ${transactionCode}:`, episodes.map(e => e.episode_number));
              for (const ep of episodes) {
                await bot.sendMessage(chatId, `[TEMP] Sending episode ${ep.episode_number}: file_id=${ep.file_id}`);
                await bot.sendDocument(chatId, ep.file_id);
              }
            } else {
              // Fallback: send all episodes in the series
              const episodes = await query('SELECT * FROM episodes WHERE series_id = ?', [tx.content_id]);
              console.log(`[TEMP LOG] Sending ALL episodes for transaction ${transactionCode}:`, episodes.map(e => e.episode_number));
              for (const ep of episodes) {
                await bot.sendMessage(chatId, `[TEMP] Sending episode ${ep.episode_number}: file_id=${ep.file_id}`);
                await bot.sendDocument(chatId, ep.file_id);
              }
            }
          }
        }
      }
      res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
    } else {
      res.status(400).json({ ResultCode: 1, ResultDesc: 'Failed' });
    }
  } catch (error) {
    console.error('M-Pesa callback error:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Server error' });
  }
};

/**
 * Get all movies
 */
const getMovies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    
    let queryParams = [limit, offset];
    let searchCondition = '';
    
    // Add search condition if provided
    if (search) {
      searchCondition = 'WHERE title LIKE ?';
      queryParams.unshift(`%${search}%`);
    }
    
    // Get movies with pagination
    const movies = await query(
      `SELECT * FROM movies ${searchCondition} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      queryParams
    );
    
    // Get total count
    let countParams = [];
    if (search) {
      countParams.push(`%${search}%`);
    }
    
    const countResult = await query(
      `SELECT COUNT(*) as count FROM movies ${searchCondition}`,
      countParams
    );
    
    const totalMovies = countResult[0].count;
    const totalPages = Math.ceil(totalMovies / limit);
    
    res.status(200).json({
      status: 'success',
      data: {
        movies,
        pagination: {
          current: page,
          total_pages: totalPages,
          total_items: totalMovies,
          limit
        }
      }
    });
    
  } catch (error) {
    console.error('Get movies error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve movies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get a single movie
 */
const getMovie = async (req, res) => {
  try {
    const movieId = req.params.id;
    
    // Get movie
    const movies = await query('SELECT * FROM movies WHERE id = ?', [movieId]);
    
    if (!movies.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Movie not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        movie: movies[0]
      }
    });
    
  } catch (error) {
    console.error('Get movie error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve movie',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create a new movie
 */
const createMovie = async (req, res) => {
  try {
    const { title, thumbnail, file_id, cost } = req.body;
    
    // Validate required fields
    if (!title || !file_id || !cost) {
      return res.status(400).json({
        status: 'error',
        message: 'Title, file_id, and cost are required'
      });
    }
    
    // Insert movie
    const result = await query(
      'INSERT INTO movies (title, thumbnail, file_id, cost) VALUES (?, ?, ?, ?)',
      [title, thumbnail || '', file_id, parseFloat(cost)]
    );
    
    // Get the created movie
    const movies = await query('SELECT * FROM movies WHERE id = ?', [result.insertId]);
    
    res.status(201).json({
      status: 'success',
      data: {
        movie: movies[0]
      }
    });
    
  } catch (error) {
    console.error('Create movie error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create movie',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update a movie
 */
const updateMovie = async (req, res) => {
  try {
    const movieId = req.params.id;
    const { title, thumbnail, file_id, cost } = req.body;
    
    // Check if movie exists
    const existingMovie = await query('SELECT * FROM movies WHERE id = ?', [movieId]);
    
    if (!existingMovie.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Movie not found'
      });
    }
    
    // Update movie
    await query(
      'UPDATE movies SET title = ?, thumbnail = ?, file_id = ?, cost = ? WHERE id = ?',
      [
        title || existingMovie[0].title,
        thumbnail !== undefined ? thumbnail : existingMovie[0].thumbnail,
        file_id || existingMovie[0].file_id,
        cost !== undefined ? parseFloat(cost) : existingMovie[0].cost,
        movieId
      ]
    );
    
    // Get updated movie
    const updatedMovie = await query('SELECT * FROM movies WHERE id = ?', [movieId]);
    
    res.status(200).json({
      status: 'success',
      data: {
        movie: updatedMovie[0]
      }
    });
    
  } catch (error) {
    console.error('Update movie error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update movie',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete a movie
 */
const deleteMovie = async (req, res) => {
  try {
    const movieId = req.params.id;
    
    // Check if movie exists
    const existingMovie = await query('SELECT * FROM movies WHERE id = ?', [movieId]);
    
    if (!existingMovie.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Movie not found'
      });
    }
    
    // Delete movie
    await query('DELETE FROM movies WHERE id = ?', [movieId]);
    
    res.status(200).json({
      status: 'success',
      message: 'Movie deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete movie error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete movie',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all series or a single series
 */
const getSeries = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const seriesId = req.params.id;
    
    // If series ID is provided, get a single series
    if (seriesId) {
      const seriesList = await query('SELECT * FROM series WHERE id = ?', [seriesId]);
      
      if (!seriesList.length) {
        return res.status(404).json({
          status: 'error',
          message: 'Series not found'
        });
      }
      
      return res.status(200).json({
        status: 'success',
        data: {
          series: seriesList[0]
        }
      });
    }
    
    // Otherwise, get all series with pagination
    let queryParams = [limit, offset];
    let searchCondition = '';
    
    // Add search condition if provided
    if (search) {
      searchCondition = 'WHERE title LIKE ?';
      queryParams.unshift(`%${search}%`);
    }
    
    // Get series with pagination
    const seriesList = await query(
      `SELECT s.*, COUNT(e.id) as episode_count 
      FROM series s 
      LEFT JOIN episodes e ON s.id = e.series_id 
      ${searchCondition ? searchCondition : ''}
      GROUP BY s.id 
      ORDER BY s.created_at DESC 
      LIMIT ? OFFSET ?`,
      queryParams
    );
    
    // Get total count
    let countParams = [];
    if (search) {
      countParams.push(`%${search}%`);
    }
    
    const countResult = await query(
      `SELECT COUNT(*) as count FROM series ${searchCondition}`,
      countParams
    );
    
    const totalSeries = countResult[0].count;
    const totalPages = Math.ceil(totalSeries / limit);
    
    res.status(200).json({
      status: 'success',
      data: {
        series: seriesList,
        pagination: {
          current: page,
          total_pages: totalPages,
          total_items: totalSeries,
          limit
        }
      }
    });
    
  } catch (error) {
    console.error('Get series error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve series',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

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
 * Create a new series
 */
const createSeries = async (req, res) => {
  try {
    const { title, thumbnail } = req.body;
    
    // Validate required fields
    if (!title) {
      return res.status(400).json({
        status: 'error',
        message: 'Title is required'
      });
    }
    
    // Insert series
    const result = await query(
      'INSERT INTO series (title, thumbnail) VALUES (?, ?)',
      [title, thumbnail || '']
    );
    
    // Get the created series
    const seriesList = await query('SELECT * FROM series WHERE id = ?', [result.insertId]);
    
    res.status(201).json({
      status: 'success',
      data: {
        series: seriesList[0]
      }
    });
    
  } catch (error) {
    console.error('Create series error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create series',
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
 * Update a series
 */
const updateSeries = async (req, res) => {
  try {
    const seriesId = req.params.id;
    const { title, thumbnail } = req.body;
    
    // Check if series exists
    const existingSeries = await query('SELECT * FROM series WHERE id = ?', [seriesId]);
    
    if (!existingSeries.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Series not found'
      });
    }
    
    // Update series
    await query(
      'UPDATE series SET title = ?, thumbnail = ? WHERE id = ?',
      [
        title || existingSeries[0].title,
        thumbnail !== undefined ? thumbnail : existingSeries[0].thumbnail,
        seriesId
      ]
    );
    
    // Get updated series
    const updatedSeries = await query('SELECT * FROM series WHERE id = ?', [seriesId]);
    
    res.status(200).json({
      status: 'success',
      data: {
        series: updatedSeries[0]
      }
    });
    
  } catch (error) {
    console.error('Update series error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update series',
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
 * Delete a series
 */
const deleteSeries = async (req, res) => {
  try {
    const seriesId = req.params.id;
    
    // Check if series exists
    const existingSeries = await query('SELECT * FROM series WHERE id = ?', [seriesId]);
    
    if (!existingSeries.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Series not found'
      });
    }
    
    // Delete series (episodes will be deleted by foreign key constraint)
    await query('DELETE FROM series WHERE id = ?', [seriesId]);
    
    res.status(200).json({
      status: 'success',
      message: 'Series deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete series error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete series',
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
  mpesaCallback,
  getMovies,
  getMovie,
  createMovie,
  updateMovie,
  deleteMovie,
  getSeries,
  getEpisodes,
  createSeries,
  createEpisode,
  updateSeries,
  updateEpisode,
  deleteSeries,
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