/**
 * Admin panel controller
 */
const moment = require('moment');
const { query } = require('../config/database');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { bot } = require('../services/telegramBot');

/**
 * Dashboard page
 */
const dashboard = async (req, res) => {
  try {
    // Get current date
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth, 0);
    
    // Format dates for MySQL queries
    const startDate = firstDayOfMonth.toISOString().split('T')[0];
    const endDate = lastDayOfMonth.toISOString().split('T')[0];
    
    // Get monthly stats
    const monthlyEarnings = await query(
      `SELECT SUM(amount) as total FROM transactions 
      WHERE status = 'completed' 
      AND created_at BETWEEN ? AND ?`,
      [startDate, endDate]
    );
    
    const totalMovies = await query('SELECT COUNT(*) as count FROM movies');
    const totalSeries = await query('SELECT COUNT(*) as count FROM series');
    
    const activeUsers = await query(
      `SELECT COUNT(DISTINCT user_id) as count FROM transactions 
      WHERE created_at BETWEEN ? AND ?`,
      [startDate, endDate]
    );
    
    // Get monthly data for chart
    const daysInMonth = lastDayOfMonth.getDate();
    const dailyStats = [];
    
    // Generate labels for chart (days of month)
    const labels = [];
    for (let i = 1; i <= daysInMonth; i++) {
      labels.push(i.toString());
    }
    
    // Get daily transactions
    const dailyTransactions = await query(
      `SELECT 
        DAY(created_at) as day,
        COUNT(DISTINCT user_id) as users,
        SUM(CASE WHEN type = 'movie' THEN 1 ELSE 0 END) as movies,
        SUM(CASE WHEN type = 'series' THEN 1 ELSE 0 END) as series,
        SUM(amount) as earnings
      FROM transactions
      WHERE created_at BETWEEN ? AND ?
      GROUP BY DAY(created_at)
      ORDER BY day`,
      [startDate, endDate]
    );
    
    // Initialize data arrays for chart
    const usersData = Array(daysInMonth).fill(0);
    const moviesData = Array(daysInMonth).fill(0);
    const seriesData = Array(daysInMonth).fill(0);
    const earningsData = Array(daysInMonth).fill(0);
    
    // Fill data arrays
    dailyTransactions.forEach(day => {
      const dayIndex = day.day - 1;
      usersData[dayIndex] = day.users;
      moviesData[dayIndex] = day.movies;
      seriesData[dayIndex] = day.series;
      earningsData[dayIndex] = parseFloat(day.earnings || 0);
    });
    
    // Prepare chart data
    const chartData = {
      labels: labels,
      datasets: [
        {
          label: 'Active Users',
          data: usersData,
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          tension: 0.4
        },
        {
          label: 'Movies Sold',
          data: moviesData,
          borderColor: 'rgba(255, 99, 132, 1)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          tension: 0.4
        },
        {
          label: 'Series Sold',
          data: seriesData,
          borderColor: 'rgba(255, 206, 86, 1)',
          backgroundColor: 'rgba(255, 206, 86, 0.2)',
          tension: 0.4
        },
        {
          label: 'Earnings (KES)',
          data: earningsData,
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.4,
          yAxisID: 'y1'
        }
      ]
    };
    
    // Get recent transactions
    const recentTransactions = await query(
      `SELECT t.*, 
        u.telegram_id, u.username as user_username, u.first_name, u.last_name,
        CASE 
          WHEN t.type = 'movie' THEN m.title 
          WHEN t.type = 'series' THEN s.title 
          ELSE NULL 
        END AS content_title 
      FROM transactions t 
      LEFT JOIN users u ON t.user_id = u.id 
      LEFT JOIN movies m ON t.type = 'movie' AND t.content_id = m.id 
      LEFT JOIN series s ON t.type = 'series' AND t.content_id = s.id 
      ORDER BY t.created_at DESC 
      LIMIT 10`
    );
    
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      admin: req.admin,
      stats: {
        earnings: monthlyEarnings[0].total || 0,
        movies: totalMovies[0].count,
        series: totalSeries[0].count,
        activeUsers: activeUsers[0].count
      },
      chartData: JSON.stringify(chartData),
      recentTransactions: recentTransactions,
      formatDate: (date) => moment(date).format('YYYY-MM-DD HH:mm'),
      formatAmount: (amount) => parseFloat(amount).toFixed(2)
    });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('error', {
      message: 'Failed to load dashboard',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

/**
 * List users
 */
const listUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    
    // Get users with pagination
    const users = await query(
      `SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    
    // Get total count for pagination
    const countResult = await query('SELECT COUNT(*) as count FROM users');
    const totalUsers = countResult[0].count;
    const totalPages = Math.ceil(totalUsers / limit);
    
    res.render('admin/users/list', {
      title: 'Users Management',
      admin: req.admin,
      users: users,
      pagination: {
        current: page,
        total: totalPages,
        limit: limit
      },
      search: req.query.search || '',
      formatDate: (date) => moment(date).format('YYYY-MM-DD')
    });
    
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).render('error', {
      message: 'Failed to load users',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

/**
 * View user details
 */
const viewUser = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Get user details
    const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (!users.length) {
      return res.status(404).render('error', {
        message: 'User not found',
        error: {}
      });
    }
    
    const user = users[0];
    
    // Get user transactions
    const transactions = await query(
      `SELECT t.*, 
        CASE 
          WHEN t.type = 'movie' THEN m.title 
          WHEN t.type = 'series' THEN s.title 
          ELSE NULL 
        END AS content_title 
      FROM transactions t 
      LEFT JOIN movies m ON t.type = 'movie' AND t.content_id = m.id 
      LEFT JOIN series s ON t.type = 'series' AND t.content_id = s.id 
      WHERE t.user_id = ? 
      ORDER BY t.created_at DESC 
      LIMIT 50`,
      [userId]
    );
    
    res.render('admin/users/view', {
      title: 'User Details',
      admin: req.admin,
      user: user,
      transactions: transactions,
      formatDate: (date) => moment(date).format('YYYY-MM-DD HH:mm'),
      formatAmount: (amount) => parseFloat(amount).toFixed(2)
    });
    
  } catch (error) {
    console.error('View user error:', error);
    res.status(500).render('error', {
      message: 'Failed to load user details',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

/**
 * Update user
 */
const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { is_active } = req.body;
    
    // Update user
    await query(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [is_active === 'on' ? 1 : 0, userId]
    );
    
    res.redirect(`/admin/users/${userId}?message=User updated successfully`);
    
  } catch (error) {
    console.error('Update user error:', error);
    res.redirect(`/admin/users/${req.params.id}?error=Failed to update user`);
  }
};

/**
 * Delete user
 */
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Delete user
    await query('DELETE FROM users WHERE id = ?', [userId]);
    
    res.redirect('/admin/users?message=User deleted successfully');
    
  } catch (error) {
    console.error('Delete user error:', error);
    res.redirect(`/admin/users?error=Failed to delete user`);
  }
};

/**
 * List movies
 */
const listMovies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    
    // Get movies with pagination
    const movies = await query(
      `SELECT * FROM movies ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    
    // Get total count for pagination
    const countResult = await query('SELECT COUNT(*) as count FROM movies');
    const totalMovies = countResult[0].count;
    const totalPages = Math.ceil(totalMovies / limit);
    
    res.render('admin/movies/list', {
      title: 'Movies Management',
      admin: req.admin,
      movies: movies,
      pagination: {
        current: page,
        total: totalPages,
        limit: limit
      },
      formatDate: (date) => moment(date).format('YYYY-MM-DD'),
      formatAmount: (amount) => parseFloat(amount).toFixed(2)
    });
    
  } catch (error) {
    console.error('List movies error:', error);
    res.status(500).render('error', {
      message: 'Failed to load movies',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

/**
 * Show add movie form
 */
const showAddMovie = (req, res) => {
  res.render('admin/movies/add', {
    title: 'Add New Movie',
    admin: req.admin
  });
};

/**
 * Add new movie
 */
const addMovie = async (req, res) => {
  try {
    const { title, file_id, cost } = req.body;
    let thumbnail = '';
    
    // Check if file was uploaded
    if (req.file) {
      thumbnail = `/uploads/movies/${req.file.filename}`;
    }
    
    // Insert movie
    await query(
      'INSERT INTO movies (title, thumbnail, file_id, cost) VALUES (?, ?, ?, ?)',
      [title, thumbnail, file_id, parseFloat(cost)]
    );
    
    res.redirect('/admin/movies?message=Movie added successfully');
    
  } catch (error) {
    console.error('Add movie error:', error);
    res.redirect('/admin/movies/add?error=Failed to add movie');
  }
};

/**
 * Show edit movie form
 */
const editMovie = async (req, res) => {
  try {
    const movieId = req.params.id;
    
    // Get movie details
    const movies = await query('SELECT * FROM movies WHERE id = ?', [movieId]);
    
    if (!movies.length) {
      return res.status(404).render('error', {
        message: 'Movie not found',
        error: {}
      });
    }
    
    res.render('admin/movies/edit', {
      title: 'Edit Movie',
      admin: req.admin,
      movie: movies[0]
    });
    
  } catch (error) {
    console.error('Edit movie error:', error);
    res.status(500).render('error', {
      message: 'Failed to load movie details',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

/**
 * Update movie
 */
const updateMovie = async (req, res) => {
  try {
    const movieId = req.params.id;
    const { title, file_id, cost } = req.body;
    
    // Check if thumbnail was uploaded
    if (req.file) {
      // Get current thumbnail path
      const movies = await query('SELECT thumbnail FROM movies WHERE id = ?', [movieId]);
      
      if (movies.length && movies[0].thumbnail) {
        // Delete old thumbnail file
        const oldThumbnailPath = path.join(__dirname, '../../public', movies[0].thumbnail);
        if (fs.existsSync(oldThumbnailPath)) {
          fs.unlinkSync(oldThumbnailPath);
        }
      }
      
      // Update movie with new thumbnail
      await query(
        'UPDATE movies SET title = ?, thumbnail = ?, file_id = ?, cost = ? WHERE id = ?',
        [title, `/uploads/movies/${req.file.filename}`, file_id, parseFloat(cost), movieId]
      );
    } else {
      // Update movie without changing thumbnail
      await query(
        'UPDATE movies SET title = ?, file_id = ?, cost = ? WHERE id = ?',
        [title, file_id, parseFloat(cost), movieId]
      );
    }
    
    res.redirect(`/admin/movies?message=Movie updated successfully`);
    
  } catch (error) {
    console.error('Update movie error:', error);
    res.redirect(`/admin/movies/${req.params.id}?error=Failed to update movie`);
  }
};

/**
 * Delete movie
 */
const deleteMovie = async (req, res) => {
  try {
    const movieId = req.params.id;
    
    // Get movie details
    const movies = await query('SELECT * FROM movies WHERE id = ?', [movieId]);
    
    if (movies.length && movies[0].thumbnail) {
      // Delete thumbnail file
      const thumbnailPath = path.join(__dirname, '../../public', movies[0].thumbnail);
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }
    }
    
    // Delete movie
    await query('DELETE FROM movies WHERE id = ?', [movieId]);
    
    res.redirect('/admin/movies?message=Movie deleted successfully');
    
  } catch (error) {
    console.error('Delete movie error:', error);
    res.redirect('/admin/movies?error=Failed to delete movie');
  }
};

/**
 * List transactions
 */
const listTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    
    let queryParams = [limit, offset];
    let searchCondition = '';
    
    // Add search condition if provided
    if (search) {
      searchCondition = 'WHERE t.transaction_code LIKE ?';
      queryParams.unshift(`%${search}%`);
    }
    
    // Get transactions with pagination
    const transactions = await query(
      `SELECT t.*, 
        u.telegram_id, u.username as user_username, u.first_name, u.last_name,
        CASE 
          WHEN t.type = 'movie' THEN m.title 
          WHEN t.type = 'series' THEN s.title 
          ELSE NULL 
        END AS content_title 
      FROM transactions t 
      LEFT JOIN users u ON t.user_id = u.id 
      LEFT JOIN movies m ON t.type = 'movie' AND t.content_id = m.id 
      LEFT JOIN series s ON t.type = 'series' AND t.content_id = s.id 
      ${searchCondition}
      ORDER BY t.created_at DESC 
      LIMIT ? OFFSET ?`,
      queryParams
    );
    
    // Get total count for pagination
    let countParams = [];
    if (search) {
      countParams.push(`%${search}%`);
    }
    
    const countResult = await query(
      `SELECT COUNT(*) as count FROM transactions t ${searchCondition}`,
      countParams
    );
    
    const totalTransactions = countResult[0].count;
    const totalPages = Math.ceil(totalTransactions / limit);
    
    res.render('admin/transactions/list', {
      title: 'Transactions Management',
      admin: req.admin,
      transactions: transactions,
      search: search,
      pagination: {
        current: page,
        total: totalPages,
        limit: limit
      },
      formatDate: (date) => moment(date).format('YYYY-MM-DD HH:mm'),
      formatAmount: (amount) => parseFloat(amount).toFixed(2)
    });
    
  } catch (error) {
    console.error('List transactions error:', error);
    res.status(500).render('error', {
      message: 'Failed to load transactions',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

/**
 * View transaction details
 */
const viewTransaction = async (req, res) => {
  try {
    const transactionId = req.params.id;
    
    // Get transaction details
    const transactions = await query(
      `SELECT t.*, 
        u.telegram_id, u.username as user_username, u.first_name, u.last_name,
        CASE 
          WHEN t.type = 'movie' THEN m.title 
          WHEN t.type = 'series' THEN s.title 
          ELSE NULL 
        END AS content_title,
        CASE 
          WHEN t.type = 'movie' THEN m.file_id 
          ELSE NULL 
        END AS movie_file_id
      FROM transactions t 
      LEFT JOIN users u ON t.user_id = u.id 
      LEFT JOIN movies m ON t.type = 'movie' AND t.content_id = m.id 
      LEFT JOIN series s ON t.type = 'series' AND t.content_id = s.id 
      WHERE t.id = ?`,
      [transactionId]
    );
    
    if (!transactions.length) {
      return res.status(404).render('error', {
        message: 'Transaction not found',
        error: {}
      });
    }
    
    const transaction = transactions[0];
    
    // If it's a series transaction, get episodes
    let episodes = [];
    if (transaction.type === 'series' && transaction.episode_range) {
      const rangeMatch = transaction.episode_range.match(/^(\d+)-(\d+)$/);
      
      if (rangeMatch) {
        const startEpisode = parseInt(rangeMatch[1]);
        const endEpisode = parseInt(rangeMatch[2]);
        
        episodes = await query(
          'SELECT * FROM episodes WHERE series_id = ? AND episode_number BETWEEN ? AND ? ORDER BY episode_number',
          [transaction.content_id, startEpisode, endEpisode]
        );
      }
    }
    
    res.render('admin/transactions/view', {
      title: 'Transaction Details',
      admin: req.admin,
      transaction: transaction,
      episodes: episodes,
      formatDate: (date) => moment(date).format('YYYY-MM-DD HH:mm'),
      formatAmount: (amount) => parseFloat(amount).toFixed(2)
    });
    
  } catch (error) {
    console.error('View transaction error:', error);
    res.status(500).render('error', {
      message: 'Failed to load transaction details',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

/**
 * Show settings page
 */
const showSettings = async (req, res) => {
  try {
    // Get current settings
    const settings = await query('SELECT * FROM settings LIMIT 1');
    
    res.render('admin/settings', {
      title: 'Bot Settings',
      admin: req.admin,
      settings: settings.length ? settings[0] : {},
      message: req.query.message || null,
      error: req.query.error || null
    });
    
  } catch (error) {
    console.error('Show settings error:', error);
    res.status(500).render('error', {
      message: 'Failed to load settings',
      error: process.env.NODE_ENV === 'development' ? error : {}
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
        bot_token = ?, 
        channel_id = ?, 
        base_url = ?, 
        welcome_message = ?, 
        webhook_enabled = ?, 
        webhook_url = ?, 
        mpesa_consumer_key = ?, 
        mpesa_consumer_secret = ?, 
        mpesa_passkey = ?, 
        mpesa_shortcode = ?, 
        mpesa_callback_url = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1`,
      [
        bot_token,
        channel_id,
        base_url,
        welcome_message,
        webhook_enabled === 'on' ? 1 : 0,
        webhook_url,
        mpesa_consumer_key,
        mpesa_consumer_secret,
        mpesa_passkey,
        mpesa_shortcode,
        mpesa_callback_url
      ]
    );
    
    // Restart the bot to apply new settings
    // In a real-world scenario, this would involve restarting the bot with new settings
    
    res.redirect('/admin/settings?message=Settings updated successfully');
    
  } catch (error) {
    console.error('Update settings error:', error);
    res.redirect('/admin/settings?error=Failed to update settings');
  }
};

/**
 * List series
 */
const listSeries = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    
    // Get series with pagination
    const seriesList = await query(
      `SELECT * FROM series ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    
    // Get total count for pagination
    const countResult = await query('SELECT COUNT(*) as count FROM series');
    const totalSeries = countResult[0].count;
    const totalPages = Math.ceil(totalSeries / limit);
    
    res.render('admin/series/list', {
      title: 'Series Management',
      admin: req.admin,
      seriesList: seriesList,
      pagination: {
        current: page,
        total: totalPages,
        limit: limit
      },
      formatDate: (date) => moment(date).format('YYYY-MM-DD')
    });
    
  } catch (error) {
    console.error('List series error:', error);
    res.status(500).render('error', {
      message: 'Failed to load series',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

/**
 * Show add series form
 */
const showAddSeries = (req, res) => {
  res.render('admin/series/add', {
    title: 'Add New Series',
    admin: req.admin
  });
};

/**
 * Add new series
 */
const addSeries = async (req, res) => {
  try {
    const { title } = req.body;
    let thumbnail = '';
    
    // Check if file was uploaded
    if (req.file) {
      thumbnail = `/uploads/series/${req.file.filename}`;
    }
    
    // Insert series
    await query(
      'INSERT INTO series (title, thumbnail) VALUES (?, ?)',
      [title, thumbnail]
    );
    
    res.redirect('/admin/series?message=Series added successfully');
    
  } catch (error) {
    console.error('Add series error:', error);
    res.redirect('/admin/series/add?error=Failed to add series');
  }
};

/**
 * Show edit series form
 */
const editSeries = async (req, res) => {
  try {
    const seriesId = req.params.id;
    
    // Get series details
    const seriesList = await query('SELECT * FROM series WHERE id = ?', [seriesId]);
    
    if (!seriesList.length) {
      return res.status(404).render('error', {
        message: 'Series not found',
        error: {}
      });
    }
    
    res.render('admin/series/edit', {
      title: 'Edit Series',
      admin: req.admin,
      series: seriesList[0]
    });
    
  } catch (error) {
    console.error('Edit series error:', error);
    res.status(500).render('error', {
      message: 'Failed to load series details',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

/**
 * Update series
 */
const updateSeries = async (req, res) => {
  try {
    const seriesId = req.params.id;
    const { title } = req.body;
    
    // Check if thumbnail was uploaded
    if (req.file) {
      // Get current thumbnail path
      const seriesList = await query('SELECT thumbnail FROM series WHERE id = ?', [seriesId]);
      
      if (seriesList.length && seriesList[0].thumbnail) {
        // Delete old thumbnail file
        const oldThumbnailPath = path.join(__dirname, '../../public', seriesList[0].thumbnail);
        if (fs.existsSync(oldThumbnailPath)) {
          fs.unlinkSync(oldThumbnailPath);
        }
      }
      
      // Update series with new thumbnail
      await query(
        'UPDATE series SET title = ?, thumbnail = ? WHERE id = ?',
        [title, `/uploads/series/${req.file.filename}`, seriesId]
      );
    } else {
      // Update series without changing thumbnail
      await query(
        'UPDATE series SET title = ? WHERE id = ?',
        [title, seriesId]
      );
    }
    
    res.redirect(`/admin/series?message=Series updated successfully`);
    
  } catch (error) {
    console.error('Update series error:', error);
    res.redirect(`/admin/series/${req.params.id}?error=Failed to update series`);
  }
};

/**
 * Delete series
 */
const deleteSeries = async (req, res) => {
  try {
    const seriesId = req.params.id;
    
    // Get series details
    const seriesList = await query('SELECT * FROM series WHERE id = ?', [seriesId]);
    
    if (seriesList.length && seriesList[0].thumbnail) {
      // Delete thumbnail file
      const thumbnailPath = path.join(__dirname, '../../public', seriesList[0].thumbnail);
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }
    }
    
    // Delete episodes
    await query('DELETE FROM episodes WHERE series_id = ?', [seriesId]);
    
    // Delete series
    await query('DELETE FROM series WHERE id = ?', [seriesId]);
    
    res.redirect('/admin/series?message=Series deleted successfully');
    
  } catch (error) {
    console.error('Delete series error:', error);
    res.redirect('/admin/series?error=Failed to delete series');
  }
};

/**
 * List episodes
 */
const listEpisodes = async (req, res) => {
  try {
    const seriesId = req.params.id;
    
    // Get series details
    const seriesList = await query('SELECT * FROM series WHERE id = ?', [seriesId]);
    
    if (!seriesList.length) {
      return res.status(404).render('error', {
        message: 'Series not found',
        error: {}
      });
    }
    
    const series = seriesList[0];
    
    // Get episodes
    const episodes = await query(
      'SELECT * FROM episodes WHERE series_id = ? ORDER BY episode_number',
      [seriesId]
    );
    
    res.render('admin/episodes/list', {
      title: `Episodes - ${series.title}`,
      admin: req.admin,
      series: series,
      episodes: episodes,
      formatDate: (date) => moment(date).format('YYYY-MM-DD'),
      formatAmount: (amount) => parseFloat(amount).toFixed(2)
    });
    
  } catch (error) {
    console.error('List episodes error:', error);
    res.status(500).render('error', {
      message: 'Failed to load episodes',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

/**
 * Show add episode form
 */
const showAddEpisode = async (req, res) => {
  try {
    const seriesId = req.params.id;
    
    // Get series details
    const seriesList = await query('SELECT * FROM series WHERE id = ?', [seriesId]);
    
    if (!seriesList.length) {
      return res.status(404).render('error', {
        message: 'Series not found',
        error: {}
      });
    }
    
    const series = seriesList[0];
    
    res.render('admin/episodes/add', {
      title: `Add Episode - ${series.title}`,
      admin: req.admin,
      series: series
    });
    
  } catch (error) {
    console.error('Show add episode error:', error);
    res.status(500).render('error', {
      message: 'Failed to load add episode form',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

/**
 * Add new episode
 */
const addEpisode = async (req, res) => {
  try {
    const seriesId = req.params.id;
    const { file_id, cost } = req.body;
    let poster = '';
    
    // Check if file was uploaded
    if (req.file) {
      poster = `/uploads/episodes/${req.file.filename}`;
    }
    
    // Get next episode number
    const episodeCount = await query(
      'SELECT COUNT(*) as count FROM episodes WHERE series_id = ?',
      [seriesId]
    );
    
    const episodeNumber = episodeCount[0].count + 1;
    
    // Insert episode
    await query(
      'INSERT INTO episodes (series_id, episode_number, file_id, poster, cost) VALUES (?, ?, ?, ?, ?)',
      [seriesId, episodeNumber, file_id, poster, parseFloat(cost)]
    );
    
    res.redirect(`/admin/series/${seriesId}/episodes?message=Episode added successfully`);
    
  } catch (error) {
    console.error('Add episode error:', error);
    res.redirect(`/admin/series/${req.params.id}/episodes/add?error=Failed to add episode`);
  }
};

/**
 * Show edit episode form
 */
const editEpisode = async (req, res) => {
  try {
    const seriesId = req.params.id;
    const episodeId = req.params.episodeId;
    
    // Get series details
    const seriesList = await query('SELECT * FROM series WHERE id = ?', [seriesId]);
    
    if (!seriesList.length) {
      return res.status(404).render('error', {
        message: 'Series not found',
        error: {}
      });
    }
    
    const series = seriesList[0];
    
    // Get episode details
    const episodes = await query(
      'SELECT * FROM episodes WHERE id = ? AND series_id = ?',
      [episodeId, seriesId]
    );
    
    if (!episodes.length) {
      return res.status(404).render('error', {
        message: 'Episode not found',
        error: {}
      });
    }
    
    res.render('admin/episodes/edit', {
      title: `Edit Episode - ${series.title}`,
      admin: req.admin,
      series: series,
      episode: episodes[0]
    });
    
  } catch (error) {
    console.error('Edit episode error:', error);
    res.status(500).render('error', {
      message: 'Failed to load episode details',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

/**
 * Update episode
 */
const updateEpisode = async (req, res) => {
  try {
    const seriesId = req.params.id;
    const episodeId = req.params.episodeId;
    const { file_id, cost } = req.body;
    
    // Check if poster was uploaded
    if (req.file) {
      // Get current poster path
      const episodes = await query('SELECT poster FROM episodes WHERE id = ?', [episodeId]);
      
      if (episodes.length && episodes[0].poster) {
        // Delete old poster file
        const oldPosterPath = path.join(__dirname, '../../public', episodes[0].poster);
        if (fs.existsSync(oldPosterPath)) {
          fs.unlinkSync(oldPosterPath);
        }
      }
      
      // Update episode with new poster
      await query(
        'UPDATE episodes SET file_id = ?, poster = ?, cost = ? WHERE id = ?',
        [file_id, `/uploads/episodes/${req.file.filename}`, parseFloat(cost), episodeId]
      );
    } else {
      // Update episode without changing poster
      await query(
        'UPDATE episodes SET file_id = ?, cost = ? WHERE id = ?',
        [file_id, parseFloat(cost), episodeId]
      );
    }
    
    res.redirect(`/admin/series/${seriesId}/episodes?message=Episode updated successfully`);
    
  } catch (error) {
    console.error('Update episode error:', error);
    res.redirect(`/admin/series/${req.params.id}/episodes/${req.params.episodeId}/edit?error=Failed to update episode`);
  }
};

/**
 * Delete episode
 */
const deleteEpisode = async (req, res) => {
  try {
    const seriesId = req.params.id;
    const episodeId = req.params.episodeId;
    
    // Get episode details
    const episodes = await query('SELECT * FROM episodes WHERE id = ?', [episodeId]);
    
    if (episodes.length && episodes[0].poster) {
      // Delete poster file
      const posterPath = path.join(__dirname, '../../public', episodes[0].poster);
      if (fs.existsSync(posterPath)) {
        fs.unlinkSync(posterPath);
      }
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
    
    res.redirect(`/admin/series/${seriesId}/episodes?message=Episode deleted successfully`);
    
  } catch (error) {
    console.error('Delete episode error:', error);
    res.redirect(`/admin/series/${req.params.id}/episodes?error=Failed to delete episode`);
  }
};

// Export all controller methods
module.exports = {
  dashboard,
  listUsers,
  viewUser,
  updateUser,
  deleteUser,
  listMovies,
  showAddMovie,
  addMovie,
  editMovie,
  updateMovie,
  deleteMovie,
  listSeries,
  showAddSeries,
  addSeries,
  editSeries,
  updateSeries,
  deleteSeries,
  listEpisodes,
  showAddEpisode,
  addEpisode,
  editEpisode,
  updateEpisode,
  deleteEpisode,
  listTransactions,
  viewTransaction,
  showSettings,
  updateSettings
};