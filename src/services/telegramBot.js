  // TEMP: Test series delivery with simulateSuccessfulPayment

const TelegramBot = require('node-telegram-bot-api');
const { query } = require('../config/database');
const pdfGenerator = require('../utils/pdfGenerator');
const mpesaService = require('./mpesaService');
let bot;
let botReadyPromise;

const initTelegramBot = async () => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  const baseUrl = process.env.BASE_URL || '';
  const welcomeMessage = process.env.WELCOME_MESSAGE || `Welcome!`;
  console.log('[TelegramBot] Initializing Telegram bot...');
  if (!botToken) {
    console.error('[TelegramBot] Bot token not configured in .env!');
    return;
  } else {
    console.log('[TelegramBot] Bot token found:', botToken.slice(0, 8) + '...');
  }
  // Strictly use webhook in production, polling in development
  const isProduction = process.env.NODE_ENV === 'production';
  try {
    if (isProduction) {
      const webhookUrl = `${baseUrl}/bot${botToken}`;
      bot = new TelegramBot(botToken, { webHook: true });
      botReadyPromise = bot.setWebHook(webhookUrl).then(() => {
        console.log('[TelegramBot] Telegram bot started in webhook mode:', webhookUrl);
      });
    } else {
      bot = new TelegramBot(botToken, { polling: true });
      botReadyPromise = Promise.resolve(console.log('[TelegramBot] Telegram bot started in polling mode'));
    }
    if (bot) {
      console.log('[TelegramBot] Bot instance created successfully.');
    } else {
      console.error('[TelegramBot] Bot instance is undefined after creation!');
    }
  } catch (err) {
    console.error('[TelegramBot] Error during bot initialization:', err);
  }

  // Save incoming media messages to telegram_files table
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    let file_id = null;
    let caption = msg.caption || '';
    let media_type = null;

    if (msg.photo) {
      // Get largest photo
      const photo = msg.photo[msg.photo.length - 1];
      file_id = photo.file_id;
      media_type = 'photo';
    } else if (msg.video) {
      file_id = msg.video.file_id;
      media_type = 'video';
    } else if (msg.document) {
      file_id = msg.document.file_id;
      media_type = 'document';
    }

    if (file_id) {
      // Check if already saved
      const exists = await query('SELECT id FROM telegram_files WHERE file_id = ?', [file_id]);
      if (!exists.length) {
        await query('INSERT INTO telegram_files (file_id, caption, chat_id, message_id, media_type) VALUES (?, ?, ?, ?, ?)', [file_id, caption, chatId, messageId, media_type]);
      }
    }
  });
  // // /start command: register user and send welcome message
  // bot.onText(/\/start/, async (msg) => {
  //   const chatId = msg.chat.id;
  //   const firstName = msg.from.first_name || '';
  //   const lastName = msg.from.last_name || '';
  //   const username = msg.from.username || '';
  //   // Register user if not exists
  //   const users = await query('SELECT * FROM users WHERE telegram_id = ?', [chatId]);
  //   if (!users.length) {
  //     await query('INSERT INTO users (telegram_id, username, first_name, last_name, is_active) VALUES (?, ?, ?, ?, ?)', [chatId, username, firstName, lastName, true]);
  //   }
  //   // Send welcome message
  //   const welcome = welcomeMessage || `Welcome, ${firstName}!`;
  //   bot.sendMessage(chatId, welcome, {
  //     reply_markup: {
  //       keyboard: [['Movies', 'Series'], ['My Transactions', 'Help']],
  //       resize_keyboard: true
  //     }
  //   });
  // });

/**
 * Telegram bot service
 */

    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const firstName = msg.from.first_name || '';
      bot.sendMessage(chatId, `${welcomeMessage}\n\nHi ${firstName}! What would you like to do? Use the buttons below to access contents, click ❓ Help to know how to use it... `, {
        reply_markup: {
          keyboard: [
            [{ text: '🎬 Movies' }, { text: '📺 Series' }],
            [{ text: '💳 My Transactions' }, { text: '❓ Help' }]
          ],
          resize_keyboard: true
        }
      });
    });



  // Unified handlers for keyboard buttons
  bot.onText(/^🎬 Movies$/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Please enter the movie title (whole word):');
    bot.once('message', async (response) => {
      const title = response.text.trim();
      const movies = await query('SELECT * FROM movies WHERE title REGEXP ?', [`[[:<:]]${title}[[:>:]]`]);
      if (!movies.length) {
        await bot.sendMessage(chatId, 'Sorry, no movies found with that title. Please try again with a different title.');
        return;
      }
      for (const movie of movies) {
        await bot.sendPhoto(chatId, movie.thumbnail, {
          caption: `🎬 *${movie.title}*\n\n💰 Price: KES ${Number(movie.cost).toFixed(2)}`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💳 Purchase', callback_data: `purchase_movie_${movie.id}` }]
            ]
          }
        });
      }
    });
  });

  bot.onText(/^📺 Series$/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Please enter the series title:');
    bot.once('message', async (response) => {
      const title = response.text;
      const series = await query('SELECT * FROM series WHERE title REGEXP ?', [`\\b${title}\\b`]);
      if (!series.length) {
        return bot.sendMessage(chatId, 'Series not found.');
      }
      const s = series[0];
      bot.sendPhoto(chatId, s.thumbnail, { caption: `${s.title}` });
      bot.sendMessage(chatId, 'Enter episode range (e.g., 1-10):');
      bot.once('message', async (epRes) => {
        const episodeRange = epRes.text.trim();
        let startEp, endEp;
        if (episodeRange.includes('-')) {
          const parts = episodeRange.split('-').map(Number);
          startEp = parts[0];
          endEp = parts[1];
        } else {
          startEp = endEp = Number(episodeRange);
        }
        if (isNaN(startEp) || isNaN(endEp)) {
          return bot.sendMessage(chatId, 'Invalid episode range. Please enter a number or a range like 1-10');
        }
        const episodes = await query('SELECT * FROM episodes WHERE series_id = ? AND episode_number BETWEEN ? AND ?', [s.id, startEp, endEp]);
        if (!episodes.length) {
          return bot.sendMessage(chatId, 'No episodes found in this range.');
        }
        const movies = await query('SELECT * FROM movies');
        const moviesCost = movies.reduce((sum, m) => sum + (Number(m.cost) || 0), 0);
        const totalCost = episodes.reduce((sum, ep) => sum + (Number(ep.cost) || 0), 0) + moviesCost;
        bot.sendMessage(chatId, `Total cost: KES ${totalCost.toFixed(2)}`);
        const userRows = await query('SELECT id FROM users WHERE telegram_id = ?', [chatId]);
        if (!userRows.length) {
          return bot.sendMessage(chatId, 'You are not registered. Please use /start to register.');
        }
        const userId = userRows[0].id;
        // Store transaction with episode_range, start_ep, end_ep
        await query(
          'INSERT INTO transactions (user_id, transaction_code, amount, type, content_id, episode_range, start_ep, end_ep, payment_method, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            userId,
            `SER${Date.now()}`,
            totalCost,
            'series',
            s.id,
            episodeRange,
            startEp,
            endEp,
            'M-Pesa',
            'pending'
          ]
        );
        bot.sendMessage(chatId, 'Click to purchase:', {
          reply_markup: {
            inline_keyboard: [[{ text: 'Purchase', callback_data: `purchase_series_${s.id}_${startEp}-${endEp}` }]]
          }
        });
      });
    });
  });

  bot.onText(/^💳 My Transactions$/, async (msg) => {
  const chatId = msg.chat.id;
  const transactions = await query('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC', [chatId]);
  const user = (await query('SELECT * FROM users WHERE telegram_id = ?', [chatId]))[0];
  const pdfBuffer = await pdfGenerator.generatePDF(transactions, user);
  bot.sendDocument(chatId, pdfBuffer, {}, { filename: 'transactions.pdf' });
  bot.sendMessage(chatId, 'Your PDF is password protected. Password has been sent to you.');
  bot.sendMessage(chatId, `PDF password: ${user.telegram_id.toString().slice(-6)}`);
  });

  bot.onText(/^❓ Help$/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `${handleHelpCommand}`);
  });

    
    // Register user on first message
    bot.on('message', async (msg) => {
      if (msg.from) {
        const { id, username, first_name, last_name } = msg.from;
        // Check if user exists
        const existingUser = await query('SELECT * FROM users WHERE telegram_id = ?', [id]);
        if (!existingUser.length) {
          // Register new user
          await query(
            'INSERT INTO users (telegram_id, username, first_name, last_name) VALUES (?, ?, ?, ?)',
            [id, username || null, first_name || null, last_name || null]
          );
          console.log(`New user registered: ${id} - ${first_name} ${last_name || ''}`);
        }
      }
    });
    
    // Start command


    // Movies command
    bot.onText(/\/movies/, async (msg) => {
      await handleMoviesCommand(msg);
    });

    // Series command
    bot.onText(/\/series/, async (msg) => {
      await handleSeriesCommand(msg);
    });

    // Transactions command
    bot.onText(/\/transactions/, async (msg) => {
      await handleTransactionsCommand(msg);
    });

    // Help command
    bot.onText(/\/help/, async (msg) => {
      await handleHelpCommand(msg);
    });
    
    // Handle button clicks using message text
    bot.on('message', async (msg) => {
      if (!msg.text || !msg.from) return;
      const message = msg.text;
      const userId = msg.from.id;
      console.log('TelegramBot message received:', { userId, message });

      // Button text handling
      if (message === 'Movies') {
        console.log('Setting session state to WAITING_FOR_MOVIE_TITLE for user', userId);
        await handleMoviesCommand(msg);
        return;
      } else if (message === 'Series') {
        await handleSeriesCommand(msg);
        return;
      } else if (message === 'My Transactions') {
        await handleTransactionsCommand(msg);
        return;
      } else if (message === 'Help') {
        await handleHelpCommand(msg);
        return;
      }

      // Session-based flows
      const userSession = getUserSession(userId);
      console.log('User session state:', userSession.state);
      if (userSession.state === 'WAITING_FOR_MOVIE_TITLE') {
        console.log('Calling handleMovieSearch for user', userId, 'with message:', message);
        await handleMovieSearch(msg, message);
      } else if (userSession.state === 'WAITING_FOR_SERIES_TITLE') {
        await handleSeriesSearch(msg, message);
      } else if (userSession.state === 'WAITING_FOR_EPISODE_RANGE' && userSession.seriesId) {
        await handleEpisodeRangeSelection(msg, message, userSession.seriesId);
      } else if (userSession.state === 'WAITING_FOR_PHONE') {
        await handlePhoneNumberInput(msg, message, userSession);
      }
    });
    
    // Handle callback queries
    bot.on('callback_query', async (ctx) => {
      const callbackData = ctx.data;
      const chatId = ctx.message?.chat?.id;

      if (!callbackData) return;

      if (callbackData.startsWith('purchase_movie_')) {
        const movieId = callbackData.replace('purchase_movie_', '');
        await handleMoviePurchase(ctx, parseInt(movieId));
      } else if (callbackData.startsWith('purchase_series_')) {
        const data = callbackData.replace('purchase_series_', '').split('_');
        const seriesId = parseInt(data[0]);
        const episodeRange = data[1];
        await handleSeriesPurchase(ctx, seriesId, episodeRange);
      }

      // Answer callback query
      if (typeof ctx.answerCallbackQuery === 'function') {
        await ctx.answerCallbackQuery();
      }
    });
  // End callback_query handler
  // Start bot with polling
  bot.launch && bot.launch();
  console.log('Telegram bot started with long polling');
  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
};

// User sessions storage
const userSessions = {};

// Get user session
const getUserSession = (userId) => {
  if (!userSessions[userId]) {
    userSessions[userId] = { state: 'IDLE' };
  }
  return userSessions[userId];
};

// Set user session
const setUserSession = (userId, sessionData) => {
  userSessions[userId] = { ...getUserSession(userId), ...sessionData };
};

// Handle movies command
const handleMoviesCommand = async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat?.id || ctx.message?.chat?.id || ctx.from.id;
  // Update user session
  setUserSession(userId, { state: 'WAITING_FOR_MOVIE_TITLE' });
  await bot.sendMessage(chatId, 'Please enter the title of the movie you are looking for:');
};

// Handle movie search
const handleMovieSearch = async (ctx, movieTitle) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat?.id || ctx.message?.chat?.id || ctx.from.id;
  try {
    console.log('handleMovieSearch called for user', userId, 'with title:', movieTitle);
    // Reset user session
    setUserSession(userId, { state: 'IDLE' });
    // Search for movie in database
    const movies = await query(
      'SELECT * FROM movies WHERE title LIKE ? LIMIT 5',
      [`%${movieTitle}%`]
    );
    console.log('Movies found:', movies);
    if (!movies.length) {
      await bot.sendMessage(chatId, 'Sorry, no movies found with that title. Please try again with a different title.');
      return;
    }
    // Display movies
    for (const movie of movies) {
      await bot.sendPhoto(
        chatId,
        movie.thumbnail,
        {
          caption: `🎬 *${movie.title}*\n\n💰 Price: KES ${movie.cost.toFixed(2)}`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💳 Purchase', callback_data: `purchase_movie_${movie.id}` }]
            ]
          }
        }
      );
    }
  } catch (error) {
    console.error('Error handling movie search:', error);
    await bot.sendMessage(chatId, 'Sorry, an error occurred while searching for movies. Please try again later.');
  }
};

// Handle movie purchase
const handleMoviePurchase = async (ctx, movieId) => {
  const userId = ctx.from.id;

  try {
    // Get movie details
    const movies = await query('SELECT * FROM movies WHERE id = ?', [movieId]);

    if (!movies.length) {
      // Use bot.sendMessage for callback_query context
      await bot.sendMessage(ctx.message.chat.id, 'Sorry, this movie is no longer available.');
      return;
    }

    const movie = movies[0];

    // Get user from database
    const users = await query('SELECT * FROM users WHERE telegram_id = ?', [ctx.from.id]);

    if (!users.length) {
      await bot.sendMessage(ctx.message.chat.id, 'Sorry, there was an error with your account. Please restart the bot with /start');
      return;
    }

    const user = users[0];

    // Generate transaction code
    const transactionCode = `MOV${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1000)}`;

    // Create pending transaction
    await query(
      `INSERT INTO transactions 
        (user_id, transaction_code, amount, type, content_id, payment_method, status) 
      VALUES 
        (?, ?, ?, ?, ?, ?, ?)`,
      [user.id, transactionCode, movie.cost, 'movie', movie.id, 'M-Pesa', 'pending']
    );

    // Send payment message
    await bot.sendMessage(ctx.message.chat.id,
      `Please confirm your purchase:\n\n` +
      `🎬 Movie: ${movie.title}\n` +
      `💰 Price: KES ${Number(movie.cost).toFixed(2)}\n\n` +
      `Transaction code: ${transactionCode}\n\n` +
      `Please send your M-Pesa phone number (format: 254XXXXXXXXX) to complete the transaction.`
    );

    // Update session to wait for phone number
    setUserSession(userId, { 
      state: 'WAITING_FOR_PHONE', 
      transactionType: 'movie',
      transactionCode: transactionCode,
      contentId: movie.id 
    });

  } catch (error) {
    console.error('Error handling movie purchase:', error);
    if (ctx.message && ctx.message.chat && ctx.message.chat.id) {
      await bot.sendMessage(ctx.message.chat.id, 'Sorry, an error occurred during the purchase process. Please try again later.');
    }
  }
};

// Handle phone number input
const handlePhoneNumberInput = async (ctx, phoneNumber, session) => {
  const userId = ctx.from.id;

  try {
    // Validate phone number (simple check)
    const phoneRegex = /^254\d{9}$/;

    if (!phoneRegex.test(phoneNumber)) {
      await bot.sendMessage(ctx.chat?.id || ctx.message?.chat?.id, 'Invalid phone number format. Please use the format: 254XXXXXXXXX');
      return;
    }

    await bot.sendMessage(ctx.chat?.id || ctx.message?.chat?.id, `Processing payment for transaction ${session.transactionCode} with phone number ${phoneNumber}...`);

    // Initiate M-Pesa payment (sandbox or production)
    console.log('Calling initiateMpesaPayment with:', phoneNumber, session.transactionType, session.transactionCode);
    let paymentResult;
    if (session.transactionType === 'movie') {
      // Get movie cost
      const movie = (await query('SELECT * FROM movies WHERE id = ?', [session.contentId]))[0];
      paymentResult = await mpesaService.initiateMpesaPayment(phoneNumber, movie.cost, session.transactionCode);
    } else if (session.transactionType === 'series') {
      // Get correct total cost from transaction
      const transactionRows = await query('SELECT amount FROM transactions WHERE transaction_code = ?', [session.transactionCode]);
      const amount = transactionRows.length ? Number(transactionRows[0].amount) : 1;
      paymentResult = await mpesaService.initiateMpesaPayment(phoneNumber, amount, session.transactionCode);
    }
    console.log('Mpesa payment result:', paymentResult);

    if (paymentResult.success) {
      // STK push sent, wait for callback to confirm payment
      await bot.sendMessage(ctx.chat?.id || ctx.message?.chat?.id, 'Payment request sent. Please complete the payment on your phone. You will receive your content after payment confirmation.');
    } else {
      // STK push failed, return payment failed message
      await bot.sendMessage(ctx.chat?.id || ctx.message?.chat?.id, `Payment failed: ${paymentResult.error || 'Unable to initiate STK push.'}`);
    }

    // Reset user session
    setUserSession(userId, { state: 'IDLE' });

  } catch (error) {
    console.error('Error handling phone input:', error);
    if (ctx.chat?.id || ctx.message?.chat?.id) {
      await bot.sendMessage(ctx.chat?.id || ctx.message?.chat?.id, 'Sorry, an error occurred during the payment process. Please try again later.');
    }

    // Reset user session
    setUserSession(userId, { state: 'IDLE' });
  }
};


// Handle series command
const handleSeriesCommand = async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat?.id || ctx.message?.chat?.id || ctx.from.id;
  // Update user session
  setUserSession(userId, { state: 'WAITING_FOR_SERIES_TITLE' });
  await bot.sendMessage(chatId, 'Please enter the title of the series you are looking for:');
};

// Handle series search
const handleSeriesSearch = async (ctx, seriesTitle) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat?.id || ctx.message?.chat?.id || ctx.from.id;
  try {
    // Search for series in database
    const seriesList = await query(
      'SELECT * FROM series WHERE title LIKE ? LIMIT 5',
      [`%${seriesTitle}%`]
    );
    if (!seriesList.length) {
      await bot.sendMessage(chatId, 'Sorry, no series found with that title. Please try again with a different title.');
      // Reset user session
      setUserSession(userId, { state: 'IDLE' });
      return;
    }
    // Display series
    for (const series of seriesList) {
      await bot.sendPhoto(
        chatId,
        series.thumbnail,
        {
          caption: `📺 *${series.title}*\n\nPlease send the episode range you want to purchase (e.g. 1-3):`,
          parse_mode: 'Markdown'
        }
      );
      // Update user session to wait for episode range
      setUserSession(userId, { 
        state: 'WAITING_FOR_EPISODE_RANGE',
        seriesId: series.id 
      });
    }
  } catch (error) {
    console.error('Error handling series search:', error);
    await bot.sendMessage(chatId, 'Sorry, an error occurred while searching for series. Please try again later.');
    // Reset user session
    setUserSession(userId, { state: 'IDLE' });
  }
};

// Handle episode range selection
const handleEpisodeRangeSelection = async (ctx, episodeRange, seriesId) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat?.id || ctx.message?.chat?.id || ctx.from.id;
  try {
    // Reset user session
    setUserSession(userId, { state: 'IDLE' });
    // Validate episode range format (e.g., "1-5")
    const rangeRegex = /^(\d+)(?:-(\d+))?$/;
    const match = episodeRange.match(rangeRegex);
    if (!match) {
      await bot.sendMessage(chatId, 'Invalid episode range format. Please use format like "1-5" or just "1"');
      return;
    }
    const startEpisode = parseInt(match[1]);
    const endEpisode = match[2] ? parseInt(match[2]) : startEpisode;
    if (startEpisode > endEpisode) {
      await bot.sendMessage(chatId, 'Invalid range. Start episode cannot be greater than end episode.');
      return;
    }
    // Get series info
    const seriesResult = await query('SELECT * FROM series WHERE id = ?', [seriesId]);
    if (!seriesResult.length) {
      await bot.sendMessage(chatId, 'Series not found. Please try again.');
      return;
    }
    const series = seriesResult[0];
    // Get episodes in the specified range
    let episodes;
    try {
      episodes = await query(
        'SELECT * FROM episodes WHERE series_id = ? AND episode_number BETWEEN ? AND ? ORDER BY episode_number',
        [seriesId, startEpisode, endEpisode]
      );
      console.log('[DEBUG] Queried episodes:', episodes);
    } catch (err) {
      console.error('[ERROR] Episode query failed:', err);
      await bot.sendMessage(chatId, 'Internal error fetching episodes.');
      return;
    }
    // TEMP: Send all requested episodes immediately for testing
    for (const ep of episodes) {
      try {
        await bot.sendMessage(chatId, `[TEMP] Sending episode ${ep.episode_number}: file_id=${ep.file_id}`);
        await bot.sendDocument(chatId, ep.file_id);
      } catch (err) {
        console.error(`[ERROR] Failed to send episode ${ep.episode_number}:`, err);
        await bot.sendMessage(chatId, `[ERROR] Could not send episode ${ep.episode_number}`);
      }
    }
    if (!episodes.length) {
      await bot.sendMessage(chatId, 'No episodes found in the specified range. Please try a different range.');
      return;
    }
    // Calculate total cost
    const totalCost = episodes.reduce((sum, episode) => sum + parseFloat(episode.cost), 0);
    // Check if all requested episodes are available
    const availableEpisodes = episodes.map(ep => ep.episode_number);
    const missingEpisodes = [];
    for (let i = startEpisode; i <= endEpisode; i++) {
      if (!availableEpisodes.includes(i)) {
        missingEpisodes.push(i);
      }
    }
    let message = `📺 *${series.title}*\n\n`;
    if (missingEpisodes.length > 0) {
      message += `⚠️ Episodes not available: ${missingEpisodes.join(', ')}\n\n`;
    }
    message += `🔢 Episodes: ${startEpisode}-${endEpisode} (${episodes.length} available)\n` +
               `💰 Total Price: KES ${totalCost.toFixed(2)}`;
    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ 
            text: '💳 Purchase Available Episodes', 
            callback_data: `purchase_series_${seriesId}_${startEpisode}-${endEpisode}` 
          }]
        ]
      }
    });
  } catch (error) {
    console.error('Error handling episode range selection:', error);
    await bot.sendMessage(chatId, 'Sorry, an error occurred. Please try again later.');
  }
};

// Handle series purchase
const handleSeriesPurchase = async (ctx, seriesId, episodeRange) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat?.id || ctx.message?.chat?.id || ctx.from.id;
  try {
    // Parse episode range
    const rangeRegex = /^(\d+)-(\d+)$/;
    const match = episodeRange.match(rangeRegex);
    if (!match) {
      await bot.sendMessage(chatId, 'Invalid episode range. Please try again.');
      return;
    }
    const startEpisode = parseInt(match[1]);
    const endEpisode = parseInt(match[2]);
    // Get series info
    const seriesResult = await query('SELECT * FROM series WHERE id = ?', [seriesId]);
    if (!seriesResult.length) {
      await bot.sendMessage(chatId, 'Series not found. Please try again.');
      return;
    }
    const series = seriesResult[0];
    // Get episodes in the specified range
    const episodes = await query(
      'SELECT * FROM episodes WHERE series_id = ? AND episode_number BETWEEN ? AND ? ORDER BY episode_number',
      [seriesId, startEpisode, endEpisode]
    );
    if (!episodes.length) {
      await bot.sendMessage(chatId, 'No episodes found in the specified range. Please try a different range.');
      return;
    }
    // Calculate total cost
    const totalCost = episodes.reduce((sum, episode) => sum + parseFloat(episode.cost), 0);
    // Get user from database
    const users = await query('SELECT * FROM users WHERE telegram_id = ?', [ctx.from.id]);
    if (!users.length) {
      await bot.sendMessage(chatId, 'Sorry, there was an error with your account. Please restart the bot with /start');
      return;
    }
    const user = users[0];
    // Generate transaction code
    const transactionCode = `SER${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1000)}`;
    // Create pending transaction
    await query(
      `INSERT INTO transactions 
        (user_id, transaction_code, amount, type, content_id, episode_range, payment_method, status) 
      VALUES 
        (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, transactionCode, totalCost, 'series', seriesId, episodeRange, 'M-Pesa', 'pending']
    );
    // Send payment message
    await bot.sendMessage(
      chatId,
      `Please confirm your purchase:\n\n` +
      `📺 Series: ${series.title}\n` +
      `🔢 Episodes: ${episodeRange} (${episodes.length} episodes)\n` +
      `💰 Total Price: KES ${totalCost.toFixed(2)}\n\n` +
      `Transaction code: ${transactionCode}\n\n` +
      `Please send your M-Pesa phone number (format: 254XXXXXXXXX) to complete the transaction.`
    );
    // Update session to wait for phone number
    setUserSession(userId, { 
      state: 'WAITING_FOR_PHONE', 
      transactionType: 'series',
      transactionCode: transactionCode,
      contentId: seriesId,
      episodeRange: episodeRange
    });
  } catch (error) {
    console.error('Error handling series purchase:', error);
    await bot.sendMessage(chatId, 'Sorry, an error occurred during the purchase process. Please try again later.');
  }
};

// Handle transactions command
const handleTransactionsCommand = async (ctx) => {
  const chatId = ctx.chat?.id || ctx.message?.chat?.id || ctx.from.id;
  try {
    const telegramId = ctx.from.id;
    // Get user from database
    const users = await query('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
    if (!users.length) {
      await bot.sendMessage(chatId, 'Sorry, there was an error with your account. Please restart the bot with /start');
      return;
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
      LIMIT 10`,
      [user.id]
    );
    if (!transactions.length) {
      await bot.sendMessage(chatId, 'You have no transactions yet. Use /movies or /series to browse content.');
      return;
    }
    // Generate PDF with transactions
    const pdfBuffer = await generatePDF(transactions, user);
    // Create a temporary file path
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const filePath = path.join(tempDir, `transactions_${user.id}.pdf`);
    // Save PDF to file
    fs.writeFileSync(filePath, pdfBuffer);
    // Send PDF document
    await bot.sendDocument(chatId, filePath, {
      caption: 'Here is your transaction history. The PDF is password protected.'
    });
    // Send password (in real scenario, this should be sent separately)
    const password = telegramId.toString().slice(-6);
    await bot.sendMessage(chatId, `Use this password to open the PDF: ${password}`);
    // Delete the temporary file
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('Error handling transactions command:', error);
    await bot.sendMessage(chatId, 'Sorry, an error occurred while generating your transaction history. Please try again later.');
  }
};

// Handle help command
const handleHelpCommand = `
*Movie and Series Bot Help*

This bot allows you to browse and purchase movies and series. Here's how to use it:

*Available Commands:*
/start - Start the bot and show main menu
/movies - Browse available movies
/series - Browse available series
/transactions - View your transaction history
/help - Show this help message

*How to Purchase Movies:*
1. Use /movies command
2. Enter the movie title
3. Select a movie from the search results
4. Click the Purchase button
5. Enter your M-Pesa phone number
6. Complete the payment
7. Receive your movie

*How to Purchase Series:*
1. Use /series command
2. Enter the series title
3. Select a series from the search results
4. Enter episode range (e.g. 1-5)
5. Click the Purchase button
6. Enter your M-Pesa phone number
7. Complete the payment
8. Receive your episodes

*Having Issues?*
Contact our support at support@example.com
`;

module.exports = {
  initTelegramBot,
  getBot: () => bot,
  botReadyPromise: () => botReadyPromise
};